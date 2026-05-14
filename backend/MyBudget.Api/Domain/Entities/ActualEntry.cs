namespace MyBudget.Api.Domain.Entities;

public class ActualEntry
{
    public Guid Id { get; set; }
    public Guid BudgetPositionId { get; set; }
    public Guid? AccountId { get; set; }
    public DateOnly BookedOn { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public string? ExternalRef { get; set; }

    public BudgetPosition BudgetPosition { get; set; } = default!;
    public Account? Account { get; set; }
}
