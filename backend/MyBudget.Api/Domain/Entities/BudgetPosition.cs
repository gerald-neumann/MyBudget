using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Domain.Entities;

public class BudgetPosition
{
    public Guid Id { get; set; }
    public Guid BaselineId { get; set; }
    public Guid CategoryId { get; set; }
    public Guid? ForkedFromPositionId { get; set; }
    public string Name { get; set; } = string.Empty;
    public BudgetCadence Cadence { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public decimal DefaultAmount { get; set; }
    public int SortOrder { get; set; }

    /// <summary>Serialized recurrence rule (jsonb). Used when materializing planned amounts for future years.</summary>
    public string? RecurrenceRuleJson { get; set; }

    public BudgetBaseline Baseline { get; set; } = default!;
    public Category Category { get; set; } = default!;
    public BudgetPosition? ForkedFromPosition { get; set; }
    public ICollection<BudgetPosition> Forks { get; set; } = new List<BudgetPosition>();
    public ICollection<PlannedAmount> PlannedAmounts { get; set; } = new List<PlannedAmount>();
    public ICollection<ActualEntry> ActualEntries { get; set; } = new List<ActualEntry>();
}
