using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Domain.Entities;

public class BaselineMember
{
    public Guid Id { get; set; }
    public Guid BaselineId { get; set; }
    public Guid UserId { get; set; }
    public BaselineAccessRole Role { get; set; } = BaselineAccessRole.Viewer;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public BudgetBaseline Baseline { get; set; } = default!;
    public AppUser User { get; set; } = default!;
}
