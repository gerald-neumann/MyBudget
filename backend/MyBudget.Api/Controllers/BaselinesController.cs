using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Domain.Enums;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("baselines")]
public class BaselinesController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IUserWorkspaceBootstrapper workspaceBootstrapper,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<BudgetBaselineDto>>> GetAll(CancellationToken cancellationToken)
    {
        var userId = userContext.UserId;

        var baselines = await dbContext.Baselines
            .Where(x => x.UserId == userId || x.Members.Any(m => m.UserId == userId))
            .OrderByDescending(x => x.UserId == userId)
            .ThenByDescending(x => x.IsPrimaryBudget)
            .ThenBy(x => x.IsSampleDemo)
            .ThenByDescending(x => x.CreatedAt)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Status,
                x.CreatedAt,
                x.ForkedFromBaselineId,
                x.UserId,
                x.IsPrimaryBudget,
                x.IsSampleDemo,
                MemberRole = x.Members
                    .Where(m => m.UserId == userId)
                    .Select(m => (BaselineAccessRole?)m.Role)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        return Ok(baselines.Select(x => new BudgetBaselineDto(
            x.Id,
            x.Name,
            x.Status,
            x.CreatedAt,
            x.ForkedFromBaselineId,
            x.UserId,
            x.UserId == userId
                ? BaselineAccessKind.Owner
                : x.MemberRole == BaselineAccessRole.Editor
                    ? BaselineAccessKind.Editor
                    : BaselineAccessKind.Viewer,
            x.IsPrimaryBudget,
            x.IsSampleDemo)).ToList());
    }

    /// <summary>Invitations you created across all budgets you own (pending, accepted, or revoked).</summary>
    [HttpGet("invitations/sent")]
    public async Task<ActionResult<IReadOnlyCollection<BaselineInvitationDto>>> GetSentInvitations(CancellationToken cancellationToken)
    {
        var userId = userContext.UserId;

        var invitations = await dbContext.BaselineInvitations
            .Where(x => x.CreatedByUserId == userId && x.Baseline.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new BaselineInvitationDto(
                x.Id,
                x.BaselineId,
                x.Baseline.Name,
                x.Role,
                x.ExpiresAt,
                x.CreatedAt,
                x.RevokedAt,
                x.ConsumedAt,
                x.AcceptedByUserId,
                x.AcceptedByUser != null ? x.AcceptedByUser.DisplayName : null))
            .ToListAsync(cancellationToken);

        return Ok(invitations);
    }

    [HttpPost]
    public async Task<ActionResult<BudgetBaselineDto>> Create(CreateBaselineRequest request, CancellationToken cancellationToken)
    {
        var userId = userContext.UserId;
        var hasPrimaryBudget = await dbContext.Baselines.AnyAsync(
            x => x.UserId == userId && x.IsPrimaryBudget,
            cancellationToken);

        var name = request.Name.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return BadRequest("Name is required.");
        }

        var baseline = new BudgetBaseline
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = name,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Draft" : request.Status.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            IsPrimaryBudget = !hasPrimaryBudget,
            IsSampleDemo = false
        };

        dbContext.Baselines.Add(baseline);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetAll), new BudgetBaselineDto(
            baseline.Id,
            baseline.Name,
            baseline.Status,
            baseline.CreatedAt,
            baseline.ForkedFromBaselineId,
            baseline.UserId,
            BaselineAccessKind.Owner,
            baseline.IsPrimaryBudget,
            baseline.IsSampleDemo));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<BudgetBaselineDto>> Update(Guid id, UpdateBaselineRequest request, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(id, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var baseline = await dbContext.Baselines.FirstAsync(x => x.Id == id, cancellationToken);

        if (request.Name is null && request.Status is null && request.IsPrimaryBudget is null)
        {
            return BadRequest("At least one of name, status, or isPrimaryBudget is required.");
        }

        if (baseline.IsSampleDemo && (request.Name is not null || request.Status is not null))
        {
            return BadRequest("The sample workspace is read-only.");
        }

        if (request.Name is not null)
        {
            var name = request.Name.Trim();
            if (string.IsNullOrEmpty(name))
            {
                return BadRequest("Name cannot be empty.");
            }

            baseline.Name = name;
        }

        if (request.Status is not null)
        {
            var status = request.Status.Trim();
            if (string.IsNullOrEmpty(status))
            {
                return BadRequest("Status cannot be empty.");
            }

            baseline.Status = status;
        }

        if (request.IsPrimaryBudget.HasValue)
        {
            if (request.IsPrimaryBudget.Value && baseline.IsSampleDemo)
            {
                return BadRequest("The sample workspace cannot be set as your default.");
            }

            if (request.IsPrimaryBudget.Value)
            {
                var ownerId = baseline.UserId;
                var otherPrimaries = await dbContext.Baselines
                    .Where(x => x.UserId == ownerId && x.Id != id && x.IsPrimaryBudget)
                    .ToListAsync(cancellationToken);
                foreach (var other in otherPrimaries)
                {
                    other.IsPrimaryBudget = false;
                }

                baseline.IsPrimaryBudget = true;
            }
            else if (baseline.IsPrimaryBudget)
            {
                return BadRequest("Set another owned budget as primary instead of clearing this one.");
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new BudgetBaselineDto(
            baseline.Id,
            baseline.Name,
            baseline.Status,
            baseline.CreatedAt,
            baseline.ForkedFromBaselineId,
            baseline.UserId,
            BaselineAccessKind.Owner,
            baseline.IsPrimaryBudget,
            baseline.IsSampleDemo));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(id, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.IsOwner)
        {
            return Forbid();
        }

        var baseline = await dbContext.Baselines.FirstAsync(x => x.Id == id, cancellationToken);
        if (baseline.IsSampleDemo)
        {
            return BadRequest("The sample workspace cannot be deleted.");
        }

        var ownerId = baseline.UserId;
        var ownedCount = await dbContext.Baselines.CountAsync(x => x.UserId == ownerId, cancellationToken);

        if (baseline.IsPrimaryBudget && ownedCount > 1)
        {
            var successor = await dbContext.Baselines
                .Where(x => x.UserId == ownerId && x.Id != id)
                .OrderBy(x => x.IsSampleDemo ? 1 : 0)
                .ThenBy(x => x.CreatedAt)
                .FirstAsync(cancellationToken);
            successor.IsPrimaryBudget = true;
        }

        await dbContext.ActualEntries
            .Where(e => e.BudgetPosition.BaselineId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.AccountId, (Guid?)null), cancellationToken);
        await dbContext.Accounts.Where(a => a.BaselineId == id).ExecuteDeleteAsync(cancellationToken);

        dbContext.Baselines.Remove(baseline);
        await dbContext.SaveChangesAsync(cancellationToken);

        if (!await dbContext.Baselines.AnyAsync(x => x.UserId == ownerId, cancellationToken))
        {
            workspaceBootstrapper.InvalidateWorkspaceBootstrapCache();
            await workspaceBootstrapper.EnsureWorkspaceAsync(cancellationToken);
        }

        return NoContent();
    }

    [HttpPost("{id:guid}/fork")]
    public async Task<ActionResult<BudgetBaselineDto>> Fork(Guid id, ForkBaselineRequest request, CancellationToken cancellationToken)
    {
        var sourceAccess = await baselineAccessService.GetAccessAsync(id, userContext.UserId, cancellationToken);
        if (sourceAccess is null)
        {
            return NotFound();
        }
        if (!sourceAccess.IsOwner)
        {
            return Forbid();
        }

        var source = await dbContext.Baselines
            .Include(x => x.Positions)
            .ThenInclude(x => x.PlannedAmounts)
            .FirstAsync(x => x.Id == id, cancellationToken);

        var fork = new BudgetBaseline
        {
            Id = Guid.NewGuid(),
            UserId = userContext.UserId,
            Name = request.Name.Trim(),
            Status = "Draft",
            CreatedAt = DateTimeOffset.UtcNow,
            ForkedFromBaselineId = source.Id,
            IsPrimaryBudget = false,
            IsSampleDemo = false
        };

        dbContext.Baselines.Add(fork);
        var positionMap = new Dictionary<Guid, Guid>();
        foreach (var sourcePosition in source.Positions.OrderBy(x => x.SortOrder))
        {
            var targetPositionId = Guid.NewGuid();
            positionMap[sourcePosition.Id] = targetPositionId;

            dbContext.Positions.Add(new BudgetPosition
            {
                Id = targetPositionId,
                BaselineId = fork.Id,
                CategoryId = sourcePosition.CategoryId,
                ForkedFromPositionId = sourcePosition.Id,
                Name = sourcePosition.Name,
                Cadence = sourcePosition.Cadence,
                StartDate = sourcePosition.StartDate,
                EndDate = sourcePosition.EndDate,
                DefaultAmount = sourcePosition.DefaultAmount,
                SortOrder = sourcePosition.SortOrder,
                RecurrenceRuleJson = sourcePosition.RecurrenceRuleJson is null
                    ? BudgetRecurrenceRule.ToJson(
                        sourcePosition.Cadence,
                        sourcePosition.StartDate,
                        sourcePosition.EndDate,
                        sourcePosition.DefaultAmount)
                    : sourcePosition.RecurrenceRuleJson
            });

            foreach (var sourcePlanned in sourcePosition.PlannedAmounts)
            {
                dbContext.PlannedAmounts.Add(new PlannedAmount
                {
                    Id = Guid.NewGuid(),
                    BudgetPositionId = targetPositionId,
                    Year = sourcePlanned.Year,
                    Month = sourcePlanned.Month,
                    Amount = sourcePlanned.Amount,
                    IsOverride = sourcePlanned.IsOverride
                });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new BudgetBaselineDto(
            fork.Id,
            fork.Name,
            fork.Status,
            fork.CreatedAt,
            fork.ForkedFromBaselineId,
            fork.UserId,
            BaselineAccessKind.Owner,
            fork.IsPrimaryBudget,
            fork.IsSampleDemo));
    }

    [HttpGet("{id:guid}/compare")]
    public async Task<ActionResult<IReadOnlyCollection<BaselineComparisonPoint>>> Compare(
        Guid id,
        [FromQuery] Guid otherId,
        [FromQuery] int year,
        CancellationToken cancellationToken)
    {
        var currentUserId = userContext.UserId;
        var baseAccess = await baselineAccessService.GetAccessAsync(id, currentUserId, cancellationToken);
        if (baseAccess is null)
        {
            return NotFound();
        }
        if (!baseAccess.CanRead)
        {
            return Forbid();
        }

        var compareAccess = await baselineAccessService.GetAccessAsync(otherId, currentUserId, cancellationToken);
        if (compareAccess is null)
        {
            return NotFound();
        }
        if (!compareAccess.CanRead)
        {
            return Forbid();
        }

        var baseSeries = await MonthlyPlannedByBaseline(id, year, cancellationToken);
        var compareSeries = await MonthlyPlannedByBaseline(otherId, year, cancellationToken);

        var points = Enumerable.Range(1, 12)
            .Select(month =>
            {
                var baseValue = baseSeries.TryGetValue(month, out var bp) ? bp : 0m;
                var compareValue = compareSeries.TryGetValue(month, out var cp) ? cp : 0m;
                return new BaselineComparisonPoint(year, month, baseValue, compareValue, compareValue - baseValue);
            })
            .ToList();

        return Ok(points);
    }

    [HttpGet("{id:guid}/categories")]
    public async Task<ActionResult<IReadOnlyCollection<CategoryDto>>> GetBaselineCategories(Guid id, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(id, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanRead)
        {
            return Forbid();
        }

        var categories = await dbContext.Categories
            .Where(x => x.UserId == access.OwnerUserId)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new CategoryDto(x.Id, x.Name, x.SortOrder, x.Color, x.IsSystem, x.IsIncome))
            .ToListAsync(cancellationToken);

        return Ok(categories);
    }

    private async Task<Dictionary<int, decimal>> MonthlyPlannedByBaseline(Guid baselineId, int year, CancellationToken cancellationToken)
    {
        return await dbContext.PlannedAmounts
            .Where(x => x.BudgetPosition.BaselineId == baselineId && x.Year == year)
            .GroupBy(x => x.Month)
            .Select(group => new { group.Key, Total = group.Sum(x => x.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Total, cancellationToken);
    }
}
