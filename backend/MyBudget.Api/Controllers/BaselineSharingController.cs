using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Domain.Enums;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("")]
public class BaselineSharingController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IBaselineAccessService baselineAccessService,
    IInvitationTokenCodec invitationTokenCodec) : ControllerBase
{
    [HttpPost("baselines/{baselineId:guid}/invitations")]
    public async Task<ActionResult<CreateBaselineInvitationResponse>> CreateInvitation(
        Guid baselineId,
        CreateBaselineInvitationRequest request,
        CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var expiresInDays = request.ExpiresInDays.GetValueOrDefault(14);
        expiresInDays = Math.Clamp(expiresInDays, 1, 365);

        var token = invitationTokenCodec.GenerateToken();
        var invitation = new BaselineInvitation
        {
            Id = Guid.NewGuid(),
            BaselineId = baselineId,
            Role = request.Role,
            TokenHash = invitationTokenCodec.ComputeHash(token),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(expiresInDays),
            CreatedAt = DateTimeOffset.UtcNow,
            CreatedByUserId = userContext.UserId
        };

        dbContext.BaselineInvitations.Add(invitation);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new CreateBaselineInvitationResponse(invitation.Id, token, invitation.ExpiresAt));
    }

    [HttpGet("baselines/{baselineId:guid}/invitations")]
    public async Task<ActionResult<IReadOnlyCollection<BaselineInvitationDto>>> GetInvitations(Guid baselineId, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var invitations = await dbContext.BaselineInvitations
            .Where(x => x.BaselineId == baselineId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new BaselineInvitationDto(
                x.Id,
                x.Role,
                x.ExpiresAt,
                x.CreatedAt,
                x.RevokedAt,
                x.ConsumedAt,
                x.AcceptedByUserId))
            .ToListAsync(cancellationToken);

        return Ok(invitations);
    }

    [HttpDelete("baselines/{baselineId:guid}/invitations/{invitationId:guid}")]
    public async Task<IActionResult> RevokeInvitation(Guid baselineId, Guid invitationId, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var invitation = await dbContext.BaselineInvitations
            .FirstOrDefaultAsync(x => x.Id == invitationId && x.BaselineId == baselineId, cancellationToken);
        if (invitation is null)
        {
            return NotFound();
        }

        invitation.RevokedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("baselines/{baselineId:guid}/members")]
    public async Task<ActionResult<IReadOnlyCollection<BaselineMemberDto>>> GetMembers(Guid baselineId, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var members = await dbContext.BaselineMembers
            .Where(x => x.BaselineId == baselineId)
            .OrderBy(x => x.CreatedAt)
            .Select(x => new BaselineMemberDto(x.UserId, x.Role, x.CreatedAt))
            .ToListAsync(cancellationToken);

        return Ok(members);
    }

    [HttpPatch("baselines/{baselineId:guid}/members/{memberUserId:guid}")]
    public async Task<ActionResult<BaselineMemberDto>> UpdateMemberRole(
        Guid baselineId,
        Guid memberUserId,
        UpdateBaselineMemberRequest request,
        CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var member = await dbContext.BaselineMembers
            .FirstOrDefaultAsync(x => x.BaselineId == baselineId && x.UserId == memberUserId, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        member.Role = request.Role;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new BaselineMemberDto(member.UserId, member.Role, member.CreatedAt));
    }

    [HttpDelete("baselines/{baselineId:guid}/members/{memberUserId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid baselineId, Guid memberUserId, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var member = await dbContext.BaselineMembers
            .FirstOrDefaultAsync(x => x.BaselineId == baselineId && x.UserId == memberUserId, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        dbContext.BaselineMembers.Remove(member);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("invitations/accept")]
    public async Task<ActionResult<AcceptInvitationResponse>> AcceptInvitation(AcceptInvitationRequest request, CancellationToken cancellationToken)
    {
        var token = request.Token.Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            return BadRequest("Token is required.");
        }

        var tokenHash = invitationTokenCodec.ComputeHash(token);
        var invitation = await dbContext.BaselineInvitations
            .Include(x => x.Baseline)
            .FirstOrDefaultAsync(x => x.TokenHash == tokenHash, cancellationToken);
        if (invitation is null)
        {
            return NotFound();
        }

        if (invitation.RevokedAt.HasValue)
        {
            return BadRequest("Invitation has been revoked.");
        }
        if (invitation.ExpiresAt < DateTimeOffset.UtcNow)
        {
            return BadRequest("Invitation has expired.");
        }
        if (invitation.ConsumedAt.HasValue)
        {
            if (invitation.AcceptedByUserId == userContext.UserId)
            {
                var existingAccess = invitation.Role == BaselineAccessRole.Editor ? BaselineAccessKind.Editor : BaselineAccessKind.Viewer;
                return Ok(new AcceptInvitationResponse(invitation.BaselineId, existingAccess));
            }

            return BadRequest("Invitation was already consumed.");
        }
        if (invitation.Baseline.UserId == userContext.UserId)
        {
            return BadRequest("Owner cannot accept own invitation.");
        }

        await EnsureUserExistsAsync(userContext.UserId, cancellationToken);

        var existingMember = await dbContext.BaselineMembers
            .FirstOrDefaultAsync(x => x.BaselineId == invitation.BaselineId && x.UserId == userContext.UserId, cancellationToken);
        if (existingMember is null)
        {
            existingMember = new BaselineMember
            {
                Id = Guid.NewGuid(),
                BaselineId = invitation.BaselineId,
                UserId = userContext.UserId,
                Role = invitation.Role,
                CreatedAt = DateTimeOffset.UtcNow
            };
            dbContext.BaselineMembers.Add(existingMember);
        }
        else if (invitation.Role == BaselineAccessRole.Editor && existingMember.Role == BaselineAccessRole.Viewer)
        {
            existingMember.Role = BaselineAccessRole.Editor;
        }

        invitation.ConsumedAt = DateTimeOffset.UtcNow;
        invitation.AcceptedByUserId = userContext.UserId;

        await dbContext.SaveChangesAsync(cancellationToken);

        var acceptedAccess = existingMember.Role == BaselineAccessRole.Editor ? BaselineAccessKind.Editor : BaselineAccessKind.Viewer;
        return Ok(new AcceptInvitationResponse(invitation.BaselineId, acceptedAccess));
    }

    private async Task EnsureUserExistsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var exists = await dbContext.Users.AnyAsync(x => x.Id == userId, cancellationToken);
        if (exists)
        {
            return;
        }

        dbContext.Users.Add(new AppUser
        {
            Id = userId,
            DisplayName = "Budget User",
            CreatedAt = DateTimeOffset.UtcNow
        });
    }
}
