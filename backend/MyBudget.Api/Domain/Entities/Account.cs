namespace MyBudget.Api.Domain.Entities;

public class Account
{
    public Guid Id { get; set; }
    /// <summary>Baseline owner; kept for user-level queries and bootstrap.</summary>
    public Guid UserId { get; set; }
    /// <summary>Household this Konto belongs to; saldos only include actuals on this baseline.</summary>
    public Guid BaselineId { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>Optional label such as Bank, wallet, cash.</summary>
    public string? TypeLabel { get; set; }
    public decimal InitialBalance { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public AppUser User { get; set; } = default!;
    public BudgetBaseline Baseline { get; set; } = default!;
    public ICollection<ActualEntry> ActualEntries { get; set; } = new List<ActualEntry>();
}
