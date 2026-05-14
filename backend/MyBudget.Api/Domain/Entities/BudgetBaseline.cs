namespace MyBudget.Api.Domain.Entities;

public class BudgetBaseline
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "Draft";
    /// <summary>Exactly one owned baseline per user should be primary — the default workspace when returning to the app. Additional budgets are non-primary.</summary>
    public bool IsPrimaryBudget { get; set; }

    /// <summary>Built-in tutorial/demo workspace (e.g. seeded "Example household"). Not eligible as primary default.</summary>
    public bool IsSampleDemo { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ForkedFromBaselineId { get; set; }

    public AppUser User { get; set; } = default!;
    public BudgetBaseline? ForkedFromBaseline { get; set; }
    public ICollection<BudgetBaseline> Forks { get; set; } = new List<BudgetBaseline>();
    public ICollection<BudgetPosition> Positions { get; set; } = new List<BudgetPosition>();
    public ICollection<BaselineMember> Members { get; set; } = new List<BaselineMember>();
    public ICollection<BaselineInvitation> Invitations { get; set; } = new List<BaselineInvitation>();
}
