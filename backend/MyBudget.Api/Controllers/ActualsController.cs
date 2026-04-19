using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("actuals")]
public class ActualsController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<ActualEntryDto>>> GetByBaseline([FromQuery] Guid baselineId, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanRead)
        {
            return Forbid();
        }

        var entries = await dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId)
            .OrderByDescending(x => x.BookedOn)
            .Select(x => new ActualEntryDto(x.Id, x.BudgetPositionId, x.BookedOn, x.Amount, x.Note, x.ExternalRef))
            .ToListAsync(cancellationToken);

        return Ok(entries);
    }

    [HttpPost]
    public async Task<ActionResult<ActualEntryDto>> Create(CreateActualEntryRequest request, CancellationToken cancellationToken)
    {
        var position = await dbContext.Positions
            .Where(x => x.Id == request.BudgetPositionId)
            .Select(x => new { x.Id, x.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (position is null)
        {
            return NotFound("Budget position not found.");
        }

        var access = await baselineAccessService.GetAccessAsync(position.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound("Budget position not found.");
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        var entry = new ActualEntry
        {
            Id = Guid.NewGuid(),
            BudgetPositionId = request.BudgetPositionId,
            BookedOn = request.BookedOn,
            Amount = request.Amount,
            Note = request.Note,
            ExternalRef = request.ExternalRef
        };

        dbContext.ActualEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new ActualEntryDto(entry.Id, entry.BudgetPositionId, entry.BookedOn, entry.Amount, entry.Note, entry.ExternalRef));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<ActualEntryDto>> Update(Guid id, UpdateActualEntryRequest request, CancellationToken cancellationToken)
    {
        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { Entry = x, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        entry.Entry.BookedOn = request.BookedOn;
        entry.Entry.Amount = request.Amount;
        entry.Entry.Note = request.Note;
        entry.Entry.ExternalRef = request.ExternalRef;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new ActualEntryDto(
            entry.Entry.Id,
            entry.Entry.BudgetPositionId,
            entry.Entry.BookedOn,
            entry.Entry.Amount,
            entry.Entry.Note,
            entry.Entry.ExternalRef));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { Entry = x, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        dbContext.ActualEntries.Remove(entry.Entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
