namespace MyBudget.Api.Domain.Entities;

public class PlannedAmount
{
    public Guid Id { get; set; }
    public Guid BudgetPositionId { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    public decimal Amount { get; set; }
    public bool IsOverride { get; set; }

    public BudgetPosition BudgetPosition { get; set; } = default!;
}
