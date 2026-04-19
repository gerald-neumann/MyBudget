using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Domain;
using MyBudget.Api.Domain.Entities;

namespace MyBudget.Api.Infrastructure;

public interface IPlanningMaterializationService
{
    Task MaterializeYearAsync(Guid baselineId, int year, CancellationToken cancellationToken = default);
}

public class PlanningMaterializationService(BudgetDbContext dbContext) : IPlanningMaterializationService
{
    public async Task MaterializeYearAsync(Guid baselineId, int year, CancellationToken cancellationToken = default)
    {
        var positions = await dbContext.Positions
            .Include(x => x.PlannedAmounts)
            .Where(x => x.BaselineId == baselineId)
            .ToListAsync(cancellationToken);

        foreach (var position in positions)
        {
            var rule = BudgetRecurrenceRule.Resolve(
                position.Cadence,
                position.StartDate,
                position.EndDate,
                position.DefaultAmount,
                position.RecurrenceRuleJson);

            foreach (var month in BudgetRecurrenceRule.GetExpectedMonths(rule, year))
            {
                var existing = position.PlannedAmounts.FirstOrDefault(x => x.Year == year && x.Month == month);
                if (existing is null)
                {
                    dbContext.PlannedAmounts.Add(new PlannedAmount
                    {
                        Id = Guid.NewGuid(),
                        BudgetPositionId = position.Id,
                        Year = year,
                        Month = month,
                        Amount = rule.DefaultAmount,
                        IsOverride = false
                    });
                }
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
