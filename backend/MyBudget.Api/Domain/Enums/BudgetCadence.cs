namespace MyBudget.Api.Domain.Enums;

public enum BudgetCadence
{
    None = 0,
    Monthly = 1,
    Yearly = 2,
    /// <summary>Repeats every <see cref="BudgetRecurrenceRule.IntervalMonths"/> months from <see cref="BudgetRecurrenceRule.StartDate"/>.</summary>
    EveryNMonths = 3
}
