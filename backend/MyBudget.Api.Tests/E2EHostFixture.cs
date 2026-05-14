using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace MyBudget.Api.Tests;

public sealed class E2EHostFixture : IAsyncLifetime
{
    private string? _connectionString;
    private ApiWebApplicationFactory? _factory;

    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        _connectionString = await PostgresEphemeralDatabase.CreateAsync();
        try
        {
            _factory = new ApiWebApplicationFactory(_connectionString);
            Client = _factory.CreateClient();
            using var warm = await Client.GetAsync("/me");
            warm.EnsureSuccessStatusCode();
        }
        catch
        {
            await TryDropDatabaseAsync();
            throw;
        }
    }

    public async Task DisposeAsync()
    {
        _factory?.Dispose();
        _factory = null;
        await TryDropDatabaseAsync();
    }

    private async Task TryDropDatabaseAsync()
    {
        if (_connectionString is null)
        {
            return;
        }

        var cs = _connectionString;
        _connectionString = null;
        try
        {
            await PostgresEphemeralDatabase.DropAsync(cs);
        }
        catch
        {
            // Best effort: DB may already be gone or server offline.
        }
    }
}
