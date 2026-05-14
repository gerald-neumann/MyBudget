using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;
using MyBudget.Api;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("actuals")]
public class ActualsController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    /// <summary>Paged actual entries with optional date range, text search (position, category, account, note), and amount predicates (&gt;, &lt;, etc.).</summary>
    [HttpGet]
    public async Task<ActionResult<ActualEntriesPageDto>> GetByBaseline(
        [FromQuery] Guid baselineId,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50,
        [FromQuery] DateOnly? bookedFrom = null,
        [FromQuery] DateOnly? bookedTo = null,
        [FromQuery] string[]? search = null,
        [FromQuery] string? amountFilter = null,
        [FromQuery] string? flowKind = null,
        CancellationToken cancellationToken = default)
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

        if (skip < 0)
        {
            skip = 0;
        }

        if (take < 1)
        {
            take = 50;
        }

        if (take > 200)
        {
            take = 200;
        }

        IQueryable<ActualEntry> query = dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId);

        if (!string.IsNullOrWhiteSpace(flowKind))
        {
            if (string.Equals(flowKind, "income", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => x.BudgetPosition.Category.IsIncome);
            }
            else if (string.Equals(flowKind, "expense", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => !x.BudgetPosition.Category.IsIncome);
            }
        }

        if (bookedFrom is not null)
        {
            query = query.Where(x => x.BookedOn >= bookedFrom);
        }

        if (bookedTo is not null)
        {
            query = query.Where(x => x.BookedOn <= bookedTo);
        }

        if (search is { Length: > 0 })
        {
            foreach (var raw in search)
            {
                if (string.IsNullOrWhiteSpace(raw))
                {
                    continue;
                }

                var term = raw.Trim().ToLowerInvariant();
                var sampleKeysHit = LedgerSearchSampleLocalization.SampleKeysWithDisplayTextContaining(term);
                var categoryNamesHit = LedgerSearchSampleLocalization.CategoryStoredNamesWithDisplayTextContaining(term);
                query = query.Where(x =>
                    x.BudgetPosition.Name.ToLower().Contains(term)
                    || x.BudgetPosition.Category.Name.ToLower().Contains(term)
                    || (x.Account != null && x.Account.Name.ToLower().Contains(term))
                    || (x.Note != null && x.Note.ToLower().Contains(term))
                    || (sampleKeysHit.Count > 0 && sampleKeysHit.Contains(x.BudgetPosition.Name))
                    || (sampleKeysHit.Count > 0 && x.Note != null && sampleKeysHit.Contains(x.Note))
                    || (categoryNamesHit.Count > 0 && categoryNamesHit.Contains(x.BudgetPosition.Category.Name)));
            }
        }

        query = ActualAmountFilterParser.ApplyPredicates(query, amountFilter);

        var totalCount = await query.CountAsync(cancellationToken);

        var entries = await query
            .OrderByDescending(x => x.BookedOn)
            .ThenByDescending(x => x.Id)
            .Skip(skip)
            .Take(take)
            .Select(x => new ActualEntryDto(
                x.Id,
                x.BudgetPositionId,
                x.AccountId,
                x.Account != null ? x.Account.Name : null,
                x.BookedOn,
                x.Amount,
                x.Note,
                x.ExternalRef))
            .ToListAsync(cancellationToken);

        return Ok(new ActualEntriesPageDto(entries, totalCount));
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

        var accountOk = await dbContext.Accounts.AnyAsync(
            x => x.Id == request.AccountId && x.UserId == userContext.UserId,
            cancellationToken);
        if (!accountOk)
        {
            return BadRequest("Account not found or not owned by the current user.");
        }

        var entry = new ActualEntry
        {
            Id = Guid.NewGuid(),
            BudgetPositionId = request.BudgetPositionId,
            AccountId = request.AccountId,
            BookedOn = request.BookedOn,
            Amount = request.Amount,
            Note = request.Note,
            ExternalRef = request.ExternalRef
        };

        dbContext.ActualEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);

        var accountName = await dbContext.Accounts
            .Where(x => x.Id == entry.AccountId)
            .Select(x => x.Name)
            .FirstAsync(cancellationToken);

        return Ok(new ActualEntryDto(
            entry.Id,
            entry.BudgetPositionId,
            entry.AccountId,
            accountName,
            entry.BookedOn,
            entry.Amount,
            entry.Note,
            entry.ExternalRef));
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

        var accountOk = await dbContext.Accounts.AnyAsync(
            x => x.Id == request.AccountId && x.UserId == userContext.UserId,
            cancellationToken);
        if (!accountOk)
        {
            return BadRequest("Account not found or not owned by the current user.");
        }

        var positionOk = await dbContext.Positions.AnyAsync(
            x => x.Id == request.BudgetPositionId && x.BaselineId == entry.BaselineId,
            cancellationToken);
        if (!positionOk)
        {
            return BadRequest("Budget position not found in this baseline.");
        }

        entry.Entry.BudgetPositionId = request.BudgetPositionId;
        entry.Entry.AccountId = request.AccountId;
        entry.Entry.BookedOn = request.BookedOn;
        entry.Entry.Amount = request.Amount;
        entry.Entry.Note = request.Note;
        entry.Entry.ExternalRef = request.ExternalRef;
        await dbContext.SaveChangesAsync(cancellationToken);

        var accountName = await dbContext.Accounts
            .Where(x => x.Id == entry.Entry.AccountId)
            .Select(x => x.Name)
            .FirstAsync(cancellationToken);

        return Ok(new ActualEntryDto(
            entry.Entry.Id,
            entry.Entry.BudgetPositionId,
            entry.Entry.AccountId,
            accountName,
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
