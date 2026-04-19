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
    IDataSeeder dataSeeder,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<BudgetBaselineDto>>> GetAll(CancellationToken cancellationToken)
    {
        await dataSeeder.SeedAsync(cancellationToken);
        var userId = userContext.UserId;

        var baselines = await dbContext.Baselines
            .Where(x => x.UserId == userId || x.Members.Any(m => m.UserId == userId))
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Status,
                x.CreatedAt,
                x.ForkedFromBaselineId,
                x.UserId,
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
                    : BaselineAccessKind.Viewer)).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<BudgetBaselineDto>> Create(CreateBaselineRequest request, CancellationToken cancellationToken)
    {
        var baseline = new BudgetBaseline
        {
            Id = Guid.NewGuid(),
            UserId = userContext.UserId,
            Name = request.Name.Trim(),
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Draft" : request.Status.Trim(),
            CreatedAt = DateTimeOffset.UtcNow
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
            BaselineAccessKind.Owner));
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

        baseline.Name = request.Name.Trim();
        baseline.Status = request.Status.Trim();
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new BudgetBaselineDto(
            baseline.Id,
            baseline.Name,
            baseline.Status,
            baseline.CreatedAt,
            baseline.ForkedFromBaselineId,
            baseline.UserId,
            BaselineAccessKind.Owner));
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

        dbContext.Baselines.Remove(baseline);
        await dbContext.SaveChangesAsync(cancellationToken);
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
            ForkedFromBaselineId = source.Id
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
            BaselineAccessKind.Owner));
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
