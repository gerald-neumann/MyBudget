namespace MyBudget.Api.Domain.Entities;

public class AppUser
{
    public Guid Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Category> Categories { get; set; } = new List<Category>();
    public ICollection<BudgetBaseline> Baselines { get; set; } = new List<BudgetBaseline>();
    public ICollection<BaselineMember> BaselineMemberships { get; set; } = new List<BaselineMember>();
    public ICollection<BaselineInvitation> AcceptedInvitations { get; set; } = new List<BaselineInvitation>();
    public ICollection<BaselineInvitation> CreatedInvitations { get; set; } = new List<BaselineInvitation>();
}
