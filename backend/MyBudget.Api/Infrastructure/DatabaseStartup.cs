using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace MyBudget.Api.Infrastructure;

/// <summary>
/// Applies EF Core migrations once at process startup (DDL only — no user/workspace seeding).
/// </summary>
public static class DatabaseStartup
{
    public static void ApplyEfMigrations(WebApplication app)
    {
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Database.Migrate");
        using var scope = app.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetDbContext>();
        try
        {
            dbContext.Database.Migrate();
        }
        catch (DbException ex)
        {
            logger.LogError(
                ex,
                "Database.Migrate failed. See the exception for the real error (e.g. \"relation already exists\" vs a connection failure). "
                + "If you replaced migrations with a new initial migration, drop or recreate the database (or clear __EFMigrationsHistory and app tables) "
                + "so the new migration chain can apply cleanly. "
                + "Verify ConnectionStrings:Database when the error indicates host, authentication, or database name issues.");
            Environment.Exit(1);
        }
    }
}
