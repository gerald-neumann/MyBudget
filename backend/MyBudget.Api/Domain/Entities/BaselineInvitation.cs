using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Domain.Entities;

public class BaselineInvitation
{
    public Guid Id { get; set; }
    public Guid BaselineId { get; set; }
    public BaselineAccessRole Role { get; set; } = BaselineAccessRole.Viewer;
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public Guid? AcceptedByUserId { get; set; }
    public Guid CreatedByUserId { get; set; }

    public BudgetBaseline Baseline { get; set; } = default!;
    public AppUser? AcceptedByUser { get; set; }
    public AppUser CreatedByUser { get; set; } = default!;
}
