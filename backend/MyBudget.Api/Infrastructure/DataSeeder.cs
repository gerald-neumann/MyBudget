using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Domain.Entities;

namespace MyBudget.Api.Infrastructure;

public interface IDataSeeder
{
    Task SeedAsync(CancellationToken cancellationToken = default);
}

public class DataSeeder(BudgetDbContext dbContext, IUserContext userContext) : IDataSeeder
{
    /// <summary>Default workspace baseline created on first provisioning for a user (no localization — UI may rename).</summary>
    private const string DefaultBaselineName = "My budget";

    private static readonly (string Name, bool IsIncome)[] SeedCategories =
    [
        ("Income", true),
        ("Housing", false),
        ("Utilities", false),
        ("Food & groceries", false),
        ("Transport", false),
        ("Insurance", false),
        ("Health", false),
        ("Subscriptions", false),
        ("Savings & investments", false),
        ("Discretionary / fun", false),
        ("One-off / large purchases", false)
    ];

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var userId = userContext.UserId;

        var user = await dbContext.Users.FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            dbContext.Users.Add(new AppUser
            {
                Id = userId,
                DisplayName = "Budget User",
                CreatedAt = DateTimeOffset.UtcNow
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        if (!await dbContext.Categories.AnyAsync(x => x.UserId == userId, cancellationToken))
        {
            var categories = SeedCategories.Select((item, index) => new Category
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = item.Name,
                SortOrder = index + 1,
                IsSystem = true,
                IsIncome = item.IsIncome
            });

            dbContext.Categories.AddRange(categories);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        await EnsureIncomeCategoryAsync(userId, cancellationToken);

        if (!await dbContext.Baselines.AnyAsync(x => x.UserId == userId, cancellationToken))
        {
            dbContext.Baselines.Add(new BudgetBaseline
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = DefaultBaselineName,
                Status = "Active",
                CreatedAt = DateTimeOffset.UtcNow
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task EnsureIncomeCategoryAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (await dbContext.Categories.AnyAsync(x => x.UserId == userId && x.IsIncome, cancellationToken))
        {
            return;
        }

        var nameTaken = await dbContext.Categories.AnyAsync(x => x.UserId == userId && x.Name == "Income", cancellationToken);
        var name = nameTaken ? "Income inflow" : "Income";
        var maxOrder = await dbContext.Categories
            .Where(x => x.UserId == userId)
            .Select(x => (int?)x.SortOrder)
            .MaxAsync(cancellationToken) ?? 0;

        dbContext.Categories.Add(new Category
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = name,
            SortOrder = maxOrder + 1,
            Color = null,
            IsSystem = true,
            IsIncome = true
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
