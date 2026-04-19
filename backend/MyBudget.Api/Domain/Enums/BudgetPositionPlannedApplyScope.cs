namespace MyBudget.Api.Domain.Enums;

/// <summary>
/// When updating a recurring line, controls which stored planned months are reset to the new template amount (overrides cleared).
/// </summary>
public enum BudgetPositionPlannedApplyScope
{
    All = 0,
    DateRange = 1
}
