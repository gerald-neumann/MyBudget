using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;
using Npgsql;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("planned-amounts")]
public class PlannedAmountsController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    [HttpPatch]
    public async Task<ActionResult<IReadOnlyCollection<PlannedAmountDto>>> BatchUpsert(BatchUpsertPlannedAmountsRequest request, CancellationToken cancellationToken)
    {
        var positionIds = request.Items.Select(x => x.BudgetPositionId).Distinct().ToList();
        var positionBaselines = await dbContext.Positions
            .Where(x => positionIds.Contains(x.Id))
            .Select(x => new { x.Id, x.BaselineId })
            .ToListAsync(cancellationToken);

        var allowedBaselineIds = new HashSet<Guid>();
        foreach (var baselineId in positionBaselines.Select(x => x.BaselineId).Distinct())
        {
            var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
            if (access?.CanManageBudget == true)
            {
                allowedBaselineIds.Add(baselineId);
            }
        }

        var allowedPositionIds = positionBaselines
            .Where(x => allowedBaselineIds.Contains(x.BaselineId))
            .Select(x => x.Id)
            .ToList();

        var allowedSet = allowedPositionIds.ToHashSet();
        var itemsToApply = request.Items.Where(x => allowedSet.Contains(x.BudgetPositionId)).ToList();
        if (itemsToApply.Count == 0)
        {
            return Ok(Array.Empty<PlannedAmountDto>());
        }

        var baselineByPositionId = positionBaselines.ToDictionary(x => x.Id, x => x.BaselineId);
        var lockPairs = itemsToApply
            .Select(i => (BaselineId: baselineByPositionId[i.BudgetPositionId], i.Year))
            .Distinct()
            .OrderBy(x => x.BaselineId)
            .ThenBy(x => x.Year)
            .ToList();

        // Workspace bootstrap (action filter) may load/delete planned rows on this DbContext; start upsert from a clean tracker.
        dbContext.ChangeTracker.Clear();

        await using var dbTransaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        foreach (var (baselineId, lockYear) in lockPairs)
        {
            await BaselineYearPlanningLock.AcquireAsync(dbContext.Database, baselineId, lockYear, cancellationToken);
        }

        var touchedItems = await ApplyPlannedUpsertsAsync(itemsToApply, cancellationToken);
        await SavePlannedUpsertsWithRetryAsync(itemsToApply, touchedItems, cancellationToken);
        await dbTransaction.CommitAsync(cancellationToken);

        return Ok(touchedItems.Select(x => new PlannedAmountDto(x.Id, x.BudgetPositionId, x.Year, x.Month, x.Amount, x.IsOverride)).ToList());
    }

    private async Task<List<PlannedAmount>> ApplyPlannedUpsertsAsync(
        IReadOnlyList<PlannedAmountUpsertRequest> itemsToApply,
        CancellationToken cancellationToken)
    {
        var touchedItems = new List<PlannedAmount>(itemsToApply.Count);
        foreach (var item in itemsToApply)
        {
            var existing = await GetOrCreatePlannedAmountAsync(item, cancellationToken);
            existing.Amount = item.Amount;
            existing.IsOverride = true;
            touchedItems.Add(existing);
        }

        return touchedItems;
    }

    private async Task SavePlannedUpsertsWithRetryAsync(
        IReadOnlyList<PlannedAmountUpsertRequest> itemsToApply,
        List<PlannedAmount> touchedItems,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateException ex) when (attempt == 0 && IsUniqueViolation(ex))
            {
                dbContext.ChangeTracker.Clear();
                touchedItems.Clear();
                touchedItems.AddRange(await ApplyPlannedUpsertsAsync(itemsToApply, cancellationToken));
            }
        }
    }

    private PlannedAmount? FindTrackedPlannedAmount(Guid budgetPositionId, int year, int month) =>
        dbContext.PlannedAmounts.Local.FirstOrDefault(x =>
            x.BudgetPositionId == budgetPositionId && x.Year == year && x.Month == month);

    private async Task<PlannedAmount> GetOrCreatePlannedAmountAsync(
        PlannedAmountUpsertRequest item,
        CancellationToken cancellationToken)
    {
        var existing = FindTrackedPlannedAmount(item.BudgetPositionId, item.Year, item.Month);
        if (existing is null)
        {
            existing = await dbContext.PlannedAmounts.FirstOrDefaultAsync(
                x => x.BudgetPositionId == item.BudgetPositionId && x.Year == item.Year && x.Month == item.Month,
                cancellationToken);
        }

        if (existing is not null)
        {
            return existing;
        }

        existing = new PlannedAmount
        {
            Id = Guid.NewGuid(),
            BudgetPositionId = item.BudgetPositionId,
            Year = item.Year,
            Month = item.Month
        };
        dbContext.PlannedAmounts.Add(existing);
        return existing;
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
