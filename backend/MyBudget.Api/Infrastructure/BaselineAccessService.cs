using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Infrastructure;

public sealed record BaselineAccessResult(Guid BaselineId, Guid OwnerUserId, BaselineAccessKind AccessKind, bool IsSampleDemo)
{
    public bool CanRead => AccessKind is BaselineAccessKind.Owner or BaselineAccessKind.Editor or BaselineAccessKind.Viewer;
    /// <summary>Owners and editors may change budget data; sample demo baselines use the same rules so users can try the app.</summary>
    public bool CanManageBudget => AccessKind is BaselineAccessKind.Owner or BaselineAccessKind.Editor;
    public bool IsOwner => AccessKind == BaselineAccessKind.Owner;
}

public interface IBaselineAccessService
{
    Task<BaselineAccessResult?> GetAccessAsync(Guid baselineId, Guid userId, CancellationToken cancellationToken);
}

public class BaselineAccessService(BudgetDbContext dbContext) : IBaselineAccessService
{
    public async Task<BaselineAccessResult?> GetAccessAsync(Guid baselineId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await dbContext.Baselines
            .Where(x => x.Id == baselineId)
            .Select(x => new
            {
                x.Id,
                OwnerUserId = x.UserId,
                x.IsSampleDemo,
                MemberRole = x.Members
                    .Where(m => m.UserId == userId)
                    .Select(m => (BaselineAccessRole?)m.Role)
                    .FirstOrDefault()
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        if (row.OwnerUserId == userId)
        {
            return new BaselineAccessResult(row.Id, row.OwnerUserId, BaselineAccessKind.Owner, row.IsSampleDemo);
        }

        var accessKind = row.MemberRole switch
        {
            BaselineAccessRole.Editor => BaselineAccessKind.Editor,
            BaselineAccessRole.Viewer => BaselineAccessKind.Viewer,
            _ => BaselineAccessKind.None
        };

        return new BaselineAccessResult(row.Id, row.OwnerUserId, accessKind, row.IsSampleDemo);
    }
}
