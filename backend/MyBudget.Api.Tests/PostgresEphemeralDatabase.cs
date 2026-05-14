using Npgsql;

namespace MyBudget.Api.Tests;

/// <summary>
/// Creates and drops a throwaway PostgreSQL database for integration tests (default: localhost postgres).
/// Set <c>MYBUDGET_E2E_PGADMIN</c> to a connection string pointing at the <c>postgres</c> maintenance DB.
/// </summary>
public static class PostgresEphemeralDatabase
{
    public static async Task<string> CreateAsync(CancellationToken cancellationToken = default)
    {
        var adminBuilder = new NpgsqlConnectionStringBuilder(
            Environment.GetEnvironmentVariable("MYBUDGET_E2E_PGADMIN")
            ?? "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres");

        var newDbName = "mybudget_e2e_" + Guid.NewGuid().ToString("n");
        adminBuilder.Database = "postgres";

        await using (var conn = new NpgsqlConnection(adminBuilder.ConnectionString))
        {
            await conn.OpenAsync(cancellationToken);
            await using var cmd = new NpgsqlCommand(
                $"CREATE DATABASE {QuoteIdentifier(newDbName)}",
                conn);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }

        adminBuilder.Database = newDbName;
        return adminBuilder.ConnectionString;
    }

    public static async Task DropAsync(string connectionString, CancellationToken cancellationToken = default)
    {
        var target = new NpgsqlConnectionStringBuilder(connectionString);
        var dbName = target.Database;
        if (string.IsNullOrEmpty(dbName) || !dbName.StartsWith("mybudget_e2e_", StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Refusing to drop database '{dbName}' (not an e2e test database).");
        }

        target.Database = "postgres";
        await using var conn = new NpgsqlConnection(target.ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using (var terminate = new NpgsqlCommand(
                         """
                         SELECT pg_terminate_backend(pid)
                         FROM pg_stat_activity
                         WHERE datname = @name
                           AND pid <> pg_backend_pid();
                         """,
                         conn))
        {
            terminate.Parameters.AddWithValue("name", dbName);
            await terminate.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var drop = new NpgsqlCommand(
            $"DROP DATABASE IF EXISTS {QuoteIdentifier(dbName)} WITH (FORCE)",
            conn);
        await drop.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string QuoteIdentifier(string name)
    {
        return "\"" + name.Replace("\"", "\"\"") + "\"";
    }
}
