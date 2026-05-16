using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("reports")]
public class ReportsController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    private const int MaxMonthlySummaryMonths = 120;
    private const int MaxYearlySummaryYears = 25;

    [HttpGet("monthly-summary")]
    public async Task<ActionResult<IReadOnlyCollection<MonthlySummaryPoint>>> MonthlySummary(
        [FromQuery] Guid baselineId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken)
    {
        if (from > to)
        {
            return BadRequest("'from' must be on or before 'to'.");
        }

        var monthSpan = ((to.Year - from.Year) * 12) + (to.Month - from.Month) + 1;
        if (monthSpan > MaxMonthlySummaryMonths)
        {
            return BadRequest($"Requested monthly range exceeds the maximum of {MaxMonthlySummaryMonths} months.");
        }

        var accessFailure = await EnsureReadableBaselineAsync(baselineId, cancellationToken);
        if (accessFailure is not null)
        {
            return accessFailure;
        }

        var start = new DateTime(from.Year, from.Month, 1);
        var end = new DateTime(to.Year, to.Month, 1);
        var months = new List<(int year, int month)>();
        for (var pointer = start; pointer <= end; pointer = pointer.AddMonths(1))
        {
            months.Add((pointer.Year, pointer.Month));
        }

        var planned = await dbContext.PlannedAmounts
            .Where(x => x.BudgetPosition.BaselineId == baselineId &&
                        (x.Year > from.Year || (x.Year == from.Year && x.Month >= from.Month)) &&
                        (x.Year < to.Year || (x.Year == to.Year && x.Month <= to.Month)))
            .GroupBy(x => new { x.Year, x.Month })
            .Select(group => new { group.Key.Year, group.Key.Month, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var actuals = await dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId &&
                        x.BookedOn >= from &&
                        x.BookedOn <= to)
            .GroupBy(x => new { x.BookedOn.Year, x.BookedOn.Month })
            .Select(group => new { Year = group.Key.Year, Month = group.Key.Month, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var plannedMap = planned.ToDictionary(x => (x.Year, x.Month), x => x.Total);
        var actualMap = actuals.ToDictionary(x => (x.Year, x.Month), x => x.Total);

        var response = months.Select(x => new MonthlySummaryPoint(
            x.year,
            x.month,
            plannedMap.GetValueOrDefault((x.year, x.month), 0m),
            actualMap.GetValueOrDefault((x.year, x.month), 0m))).ToList();

        return Ok(response);
    }

    [HttpGet("yearly-summary")]
    public async Task<ActionResult<IReadOnlyCollection<YearlySummaryPoint>>> YearlySummary(
        [FromQuery] Guid baselineId,
        [FromQuery] int fromYear,
        [FromQuery] int toYear,
        CancellationToken cancellationToken)
    {
        if (fromYear > toYear)
        {
            return BadRequest("'fromYear' must be less than or equal to 'toYear'.");
        }

        var yearSpan = toYear - fromYear + 1;
        if (yearSpan > MaxYearlySummaryYears)
        {
            return BadRequest($"Requested yearly range exceeds the maximum of {MaxYearlySummaryYears} years.");
        }

        var accessFailure = await EnsureReadableBaselineAsync(baselineId, cancellationToken);
        if (accessFailure is not null)
        {
            return accessFailure;
        }

        var planned = await dbContext.PlannedAmounts
            .Where(x => x.BudgetPosition.BaselineId == baselineId &&
                        x.Year >= fromYear &&
                        x.Year <= toYear)
            .GroupBy(x => x.Year)
            .Select(group => new { Year = group.Key, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var actuals = await dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId &&
                        x.BookedOn.Year >= fromYear &&
                        x.BookedOn.Year <= toYear)
            .GroupBy(x => x.BookedOn.Year)
            .Select(group => new { Year = group.Key, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var plannedMap = planned.ToDictionary(x => x.Year, x => x.Total);
        var actualMap = actuals.ToDictionary(x => x.Year, x => x.Total);
        var response = Enumerable.Range(fromYear, toYear - fromYear + 1)
            .Select(year => new YearlySummaryPoint(year, plannedMap.GetValueOrDefault(year, 0m), actualMap.GetValueOrDefault(year, 0m)))
            .ToList();

        return Ok(response);
    }

    [HttpGet("by-category")]
    public async Task<ActionResult<IReadOnlyCollection<CategorySummaryPoint>>> ByCategory(
        [FromQuery] Guid baselineId,
        [FromQuery] int year,
        CancellationToken cancellationToken)
    {
        var accessFailure = await EnsureReadableBaselineAsync(baselineId, cancellationToken);
        if (accessFailure is not null)
        {
            return accessFailure;
        }

        var planned = await dbContext.PlannedAmounts
            .Where(x => x.BudgetPosition.BaselineId == baselineId &&
                        x.Year == year &&
                        !x.BudgetPosition.Category.IsIncome)
            .GroupBy(x => new { x.BudgetPosition.CategoryId, x.BudgetPosition.Category.Name })
            .Select(group => new { group.Key.CategoryId, Category = group.Key.Name, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var actuals = await dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId &&
                        x.BookedOn.Year == year &&
                        !x.BudgetPosition.Category.IsIncome)
            .GroupBy(x => new { x.BudgetPosition.CategoryId, x.BudgetPosition.Category.Name })
            .Select(group => new { group.Key.CategoryId, Category = group.Key.Name, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var plannedMap = planned.ToDictionary(x => x.CategoryId, x => (x.Category, x.Total));
        var actualMap = actuals.ToDictionary(x => x.CategoryId, x => (x.Category, x.Total));
        var categoryIds = plannedMap.Keys.Union(actualMap.Keys).ToList();

        var result = categoryIds
            .Select(id =>
            {
                plannedMap.TryGetValue(id, out var plannedRow);
                actualMap.TryGetValue(id, out var actualRow);
                var name = plannedRow.Category ?? actualRow.Category ?? string.Empty;
                var plannedTotal = plannedRow.Total;
                var actualTotal = actualRow.Total;
                return new CategorySummaryPoint(id, name, plannedTotal, actualTotal);
            })
            .OrderByDescending(x => x.Planned)
            .ThenByDescending(x => x.Actual)
            .ToList();

        return Ok(result);
    }

    [HttpGet("monthly-cashflow")]
    public async Task<ActionResult<MonthlyCashflowReportDto>> MonthlyCashflow(
        [FromQuery] Guid baselineId,
        [FromQuery] int year,
        CancellationToken cancellationToken)
    {
        var accessFailure = await EnsureReadableBaselineAsync(baselineId, cancellationToken);
        if (accessFailure is not null)
        {
            return accessFailure;
        }

        var incomePlannedRows = await dbContext.PlannedAmounts
            .Where(pa => pa.BudgetPosition.BaselineId == baselineId &&
                         pa.Year == year &&
                         pa.BudgetPosition.Category.IsIncome)
            .GroupBy(pa => pa.Month)
            .Select(group => new { Month = group.Key, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var expensePlannedRows = await dbContext.PlannedAmounts
            .Where(pa => pa.BudgetPosition.BaselineId == baselineId &&
                         pa.Year == year &&
                         !pa.BudgetPosition.Category.IsIncome)
            .GroupBy(pa => pa.Month)
            .Select(group => new { Month = group.Key, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var incomeActualRows = await dbContext.ActualEntries
            .Where(a => a.BudgetPosition.BaselineId == baselineId &&
                        a.BookedOn.Year == year &&
                        a.BudgetPosition.Category.IsIncome)
            .GroupBy(a => a.BookedOn.Month)
            .Select(group => new { Month = group.Key, Total = group.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var expenseCellRows = await dbContext.ActualEntries
            .Where(a => a.BudgetPosition.BaselineId == baselineId &&
                        a.BookedOn.Year == year &&
                        !a.BudgetPosition.Category.IsIncome)
            .GroupBy(a => new { a.BudgetPosition.CategoryId, Category = a.BudgetPosition.Category.Name, Month = a.BookedOn.Month })
            .Select(group => new
            {
                group.Key.CategoryId,
                group.Key.Category,
                group.Key.Month,
                Total = group.Sum(x => x.Amount)
            })
            .ToListAsync(cancellationToken);

        var incomePlannedMap = incomePlannedRows.ToDictionary(x => x.Month, x => x.Total);
        var expensePlannedMap = expensePlannedRows.ToDictionary(x => x.Month, x => x.Total);
        var incomeActualMap = incomeActualRows.ToDictionary(x => x.Month, x => x.Total);
        var expenseActualMap = expenseCellRows
            .GroupBy(x => x.Month)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Total));

        var months = Enumerable.Range(1, 12)
            .Select(month => new MonthlyCashflowPointDto(
                month,
                incomePlannedMap.GetValueOrDefault(month, 0m),
                incomeActualMap.GetValueOrDefault(month, 0m),
                expensePlannedMap.GetValueOrDefault(month, 0m),
                expenseActualMap.GetValueOrDefault(month, 0m)))
            .ToList();

        const int maxCategories = 8;
        var byCategory = expenseCellRows
            .GroupBy(x => (x.CategoryId, x.Category))
            .Select(g =>
            {
                var monthly = new decimal[12];
                foreach (var row in g)
                {
                    monthly[row.Month - 1] += row.Total;
                }

                return new CategoryMonthlySpendDto(g.Key.CategoryId, g.Key.Category, monthly);
            })
            .OrderByDescending(x => x.MonthlyActuals.Sum())
            .ToList();

        IReadOnlyList<CategoryMonthlySpendDto> expenseSeries;
        if (byCategory.Count <= maxCategories)
        {
            expenseSeries = byCategory;
        }
        else
        {
            var top = byCategory.Take(maxCategories).ToList();
            var other = new decimal[12];
            foreach (var rest in byCategory.Skip(maxCategories))
            {
                for (var i = 0; i < 12; i++)
                {
                    other[i] += rest.MonthlyActuals[i];
                }
            }

            top.Add(new CategoryMonthlySpendDto(null, "Other", other));
            expenseSeries = top;
        }

        return Ok(new MonthlyCashflowReportDto(months, expenseSeries));
    }

    [HttpGet("plan-actual-by-position")]
    public async Task<ActionResult<PlanActualByPositionReportDto>> PlanActualByPosition(
        [FromQuery] Guid baselineId,
        [FromQuery] int year,
        CancellationToken cancellationToken)
    {
        var accessFailure = await EnsureReadableBaselineAsync(baselineId, cancellationToken);
        if (accessFailure is not null)
        {
            return accessFailure;
        }

        var positions = await dbContext.Positions
            .Where(p => p.BaselineId == baselineId)
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.Name)
            .Select(p => new
            {
                p.Id,
                p.Name,
                p.SortOrder,
                p.CategoryId,
                CategoryName = p.Category.Name,
                p.Category.IsIncome
            })
            .ToListAsync(cancellationToken);

        var plannedRows = await dbContext.PlannedAmounts
            .Where(pa => pa.BudgetPosition.BaselineId == baselineId && pa.Year == year)
            .GroupBy(pa => new { pa.BudgetPositionId, pa.Month })
            .Select(group => new
            {
                group.Key.BudgetPositionId,
                group.Key.Month,
                Total = group.Sum(x => x.Amount)
            })
            .ToListAsync(cancellationToken);

        var actualRows = await dbContext.ActualEntries
            .Where(a => a.BudgetPosition.BaselineId == baselineId && a.BookedOn.Year == year)
            .GroupBy(a => new { a.BudgetPositionId, Month = a.BookedOn.Month })
            .Select(group => new
            {
                group.Key.BudgetPositionId,
                group.Key.Month,
                Total = group.Sum(x => x.Amount)
            })
            .ToListAsync(cancellationToken);

        var plannedMap = plannedRows.ToDictionary(x => (x.BudgetPositionId, x.Month), x => x.Total);
        var actualMap = actualRows.ToDictionary(x => (x.BudgetPositionId, x.Month), x => x.Total);

        var result = new List<PositionPlanActualRowDto>();
        foreach (var position in positions)
        {
            var months = new List<PositionPlanActualMonthDto>();
            decimal yearPlanned = 0m;
            decimal yearActual = 0m;
            for (var month = 1; month <= 12; month++)
            {
                var planned = plannedMap.GetValueOrDefault((position.Id, month), 0m);
                var actual = actualMap.GetValueOrDefault((position.Id, month), 0m);
                yearPlanned += planned;
                yearActual += actual;
                months.Add(new PositionPlanActualMonthDto(month, planned, actual));
            }

            if (yearPlanned == 0m && yearActual == 0m)
            {
                continue;
            }

            result.Add(new PositionPlanActualRowDto(
                position.Id,
                position.Name,
                position.CategoryId,
                position.CategoryName,
                position.IsIncome,
                position.SortOrder,
                months,
                yearPlanned,
                yearActual));
        }

        return Ok(new PlanActualByPositionReportDto(result));
    }

    private async Task<ActionResult?> EnsureReadableBaselineAsync(Guid baselineId, CancellationToken cancellationToken)
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

        return null;
    }
}
