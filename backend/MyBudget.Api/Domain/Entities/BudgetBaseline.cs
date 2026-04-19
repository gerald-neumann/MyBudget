namespace MyBudget.Api.Domain.Entities;

public class BudgetBaseline
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "Draft";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ForkedFromBaselineId { get; set; }

    public AppUser User { get; set; } = default!;
    public BudgetBaseline? ForkedFromBaseline { get; set; }
    public ICollection<BudgetBaseline> Forks { get; set; } = new List<BudgetBaseline>();
    public ICollection<BudgetPosition> Positions { get; set; } = new List<BudgetPosition>();
    public ICollection<BaselineMember> Members { get; set; } = new List<BaselineMember>();
    public ICollection<BaselineInvitation> Invitations { get; set; } = new List<BaselineInvitation>();
}
