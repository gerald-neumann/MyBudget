using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;

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
        var touchedItems = new List<PlannedAmount>();

        foreach (var item in request.Items.Where(x => allowedSet.Contains(x.BudgetPositionId)))
        {
            var existing = await dbContext.PlannedAmounts.FirstOrDefaultAsync(
                x => x.BudgetPositionId == item.BudgetPositionId && x.Year == item.Year && x.Month == item.Month,
                cancellationToken);

            if (existing is null)
            {
                existing = new PlannedAmount
                {
                    Id = Guid.NewGuid(),
                    BudgetPositionId = item.BudgetPositionId,
                    Year = item.Year,
                    Month = item.Month
                };
                dbContext.PlannedAmounts.Add(existing);
            }

            existing.Amount = item.Amount;
            existing.IsOverride = true;
            touchedItems.Add(existing);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(touchedItems.Select(x => new PlannedAmountDto(x.Id, x.BudgetPositionId, x.Year, x.Month, x.Amount, x.IsOverride)).ToList());
    }
}
