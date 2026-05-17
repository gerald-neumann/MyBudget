using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Domain.Enums;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("baselines/{baselineId:guid}/positions")]
public class PositionsController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IPlanningMaterializationService planningMaterializationService,
    IBaselineAccessService baselineAccessService) : ControllerBase
{
    private static BudgetRecurrenceRuleDto ToRecurrenceRuleDto(BudgetRecurrenceRule rule) =>
        new(rule.Cadence, rule.StartDate, rule.EndDate, rule.DefaultAmount, rule.IntervalMonths);

    /// <summary>
    /// Matches <see cref="BudgetRecurrenceRule.GetExpectedMonths"/> materialization: clamp to 2–24, default when null.
    /// </summary>
    private static int? NormalizeIntervalMonths(BudgetCadence cadence, int? intervalMonths)
    {
        if (cadence != BudgetCadence.EveryNMonths)
        {
            return null;
        }

        var raw = intervalMonths ?? 3;
        return Math.Clamp(raw, 2, 24);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<BudgetPositionDto>>> GetByBaseline(
        Guid baselineId,
        [FromQuery] int year,
        CancellationToken cancellationToken)
    {
        if (year <= 0)
        {
            year = DateTime.UtcNow.Year;
        }

        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanRead)
        {
            return Forbid();
        }

        await planningMaterializationService.MaterializeYearAsync(baselineId, year, cancellationToken);

        var rows = await dbContext.Positions
            .Where(x => x.BaselineId == baselineId)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.BaselineId,
                x.CategoryId,
                x.ForkedFromPositionId,
                x.Name,
                x.Cadence,
                x.StartDate,
                x.EndDate,
                x.DefaultAmount,
                x.SortOrder,
                x.RecurrenceRuleJson,
                Planned = x.PlannedAmounts
                    .Where(pa => pa.Year == year)
                    .OrderBy(pa => pa.Month)
                    .Select(pa => new PlannedAmountDto(pa.Id, pa.BudgetPositionId, pa.Year, pa.Month, pa.Amount, pa.IsOverride))
                    .ToList()
            })
            .ToListAsync(cancellationToken);

        var positions = rows.Select(x =>
        {
            var rule = BudgetRecurrenceRule.Resolve(x.Cadence, x.StartDate, x.EndDate, x.DefaultAmount, x.RecurrenceRuleJson);
            return new BudgetPositionDto(
                x.Id,
                x.BaselineId,
                x.CategoryId,
                x.ForkedFromPositionId,
                x.Name,
                x.Cadence,
                x.StartDate,
                x.EndDate,
                x.DefaultAmount,
                x.SortOrder,
                x.Planned,
                ToRecurrenceRuleDto(rule));
        }).ToList();

        return Ok(positions);
    }

    [HttpPost]
    public async Task<ActionResult<BudgetPositionDto>> Create(Guid baselineId, CreatePositionRequest request, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }
        if (!await CategoryBelongsToBaselineOwnerAsync(request.CategoryId, access.OwnerUserId, cancellationToken))
        {
            return BadRequest("Category not found or does not belong to this baseline owner.");
        }
        var trimmedName = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return BadRequest("Name is required.");
        }

        var intervalMonths = NormalizeIntervalMonths(request.Cadence, request.IntervalMonths);

        var position = new BudgetPosition
        {
            Id = Guid.NewGuid(),
            BaselineId = baselineId,
            CategoryId = request.CategoryId,
            Name = trimmedName!,
            Cadence = request.Cadence,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            DefaultAmount = request.DefaultAmount,
            SortOrder = request.SortOrder,
            RecurrenceRuleJson = BudgetRecurrenceRule.ToJson(
                request.Cadence,
                request.StartDate,
                request.EndDate,
                request.DefaultAmount,
                intervalMonths)
        };

        dbContext.Positions.Add(position);
        await dbContext.SaveChangesAsync(cancellationToken);

        var createdRule = BudgetRecurrenceRule.Resolve(
            position.Cadence,
            position.StartDate,
            position.EndDate,
            position.DefaultAmount,
            position.RecurrenceRuleJson);

        return Ok(new BudgetPositionDto(
            position.Id,
            position.BaselineId,
            position.CategoryId,
            position.ForkedFromPositionId,
            position.Name,
            position.Cadence,
            position.StartDate,
            position.EndDate,
            position.DefaultAmount,
            position.SortOrder,
            [],
            ToRecurrenceRuleDto(createdRule)));
    }

    [HttpPatch("{positionId:guid}")]
    public async Task<ActionResult<BudgetPositionDto>> Update(Guid baselineId, Guid positionId, UpdatePositionRequest request, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }
        if (!await CategoryBelongsToBaselineOwnerAsync(request.CategoryId, access.OwnerUserId, cancellationToken))
        {
            return BadRequest("Category not found or does not belong to this baseline owner.");
        }
        var trimmedName = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return BadRequest("Name is required.");
        }

        var position = await dbContext.Positions
            .Include(x => x.PlannedAmounts)
            .FirstOrDefaultAsync(x => x.Id == positionId && x.BaselineId == baselineId, cancellationToken);
        if (position is null)
        {
            return NotFound();
        }

        var intervalMonths = NormalizeIntervalMonths(request.Cadence, request.IntervalMonths);

        position.CategoryId = request.CategoryId;
        position.Name = trimmedName!;
        position.Cadence = request.Cadence;
        position.StartDate = request.StartDate;
        position.EndDate = request.EndDate;
        position.DefaultAmount = request.DefaultAmount;
        position.SortOrder = request.SortOrder;
        position.RecurrenceRuleJson = BudgetRecurrenceRule.ToJson(
            request.Cadence,
            request.StartDate,
            request.EndDate,
            request.DefaultAmount,
            intervalMonths);

        var updatedRule = BudgetRecurrenceRule.Resolve(
            position.Cadence,
            position.StartDate,
            position.EndDate,
            position.DefaultAmount,
            position.RecurrenceRuleJson);

        if (request.PlannedAmountsScope is not null)
        {
            if (request.PlannedAmountsScope == BudgetPositionPlannedApplyScope.DateRange)
            {
                if (request.PlannedAmountsApplyFrom is null || request.PlannedAmountsApplyTo is null)
                {
                    return BadRequest("PlannedAmountsApplyFrom and PlannedAmountsApplyTo are required when PlannedAmountsScope is DateRange.");
                }

                if (request.PlannedAmountsApplyFrom > request.PlannedAmountsApplyTo)
                {
                    return BadRequest("PlannedAmountsApplyFrom must be on or before PlannedAmountsApplyTo.");
                }
            }

            foreach (var pa in position.PlannedAmounts)
            {
                if (!IsPlannedMonthInApplyScope(
                        pa.Year,
                        pa.Month,
                        request.PlannedAmountsScope.Value,
                        request.PlannedAmountsApplyFrom,
                        request.PlannedAmountsApplyTo))
                {
                    continue;
                }

                var expectedMonths = BudgetRecurrenceRule.GetExpectedMonths(updatedRule, pa.Year).ToHashSet();
                if (!expectedMonths.Contains(pa.Month))
                {
                    continue;
                }

                pa.Amount = updatedRule.DefaultAmount;
                pa.IsOverride = false;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new BudgetPositionDto(
            position.Id,
            position.BaselineId,
            position.CategoryId,
            position.ForkedFromPositionId,
            position.Name,
            position.Cadence,
            position.StartDate,
            position.EndDate,
            position.DefaultAmount,
            position.SortOrder,
            position.PlannedAmounts.Select(pa => new PlannedAmountDto(pa.Id, pa.BudgetPositionId, pa.Year, pa.Month, pa.Amount, pa.IsOverride)).ToList(),
            ToRecurrenceRuleDto(updatedRule)));
    }

    [HttpDelete("{positionId:guid}")]
    public async Task<IActionResult> Delete(Guid baselineId, Guid positionId, CancellationToken cancellationToken)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        var position = await dbContext.Positions.FirstOrDefaultAsync(x => x.Id == positionId && x.BaselineId == baselineId, cancellationToken);
        if (position is null)
        {
            return NotFound();
        }

        dbContext.Positions.Remove(position);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Sets planned amounts for every month covered by the position recurrence in <paramref name="year"/>
    /// to the template default and clears per-cell overrides. Does not remove planned rows for months outside the rule.
    /// </summary>
    [HttpPost("{positionId:guid}/reapply-recurrence-template")]
    public async Task<IActionResult> ReapplyRecurrenceTemplate(
        Guid baselineId,
        Guid positionId,
        [FromQuery] int year,
        CancellationToken cancellationToken)
    {
        if (year <= 0)
        {
            year = DateTime.UtcNow.Year;
        }

        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        await planningMaterializationService.MaterializeYearAsync(baselineId, year, cancellationToken);

        var position = await dbContext.Positions
            .Include(x => x.PlannedAmounts)
            .FirstOrDefaultAsync(x => x.Id == positionId && x.BaselineId == baselineId, cancellationToken);
        if (position is null)
        {
            return NotFound();
        }

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
            else
            {
                existing.Amount = rule.DefaultAmount;
                existing.IsOverride = false;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static bool IsPlannedMonthInApplyScope(
        int year,
        int month,
        BudgetPositionPlannedApplyScope scope,
        DateOnly? applyFrom,
        DateOnly? applyTo)
    {
        if (scope == BudgetPositionPlannedApplyScope.All)
        {
            return true;
        }

        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);
        return monthStart <= applyTo!.Value && monthEnd >= applyFrom!.Value;
    }

    private Task<bool> CategoryBelongsToBaselineOwnerAsync(Guid categoryId, Guid ownerUserId, CancellationToken cancellationToken)
        => dbContext.Categories.AnyAsync(c => c.Id == categoryId && c.UserId == ownerUserId, cancellationToken);
}
