using Xunit;

namespace MyBudget.Api.Tests;

/// <summary>One shared Postgres-backed host per test collection (sequential tests, single DB dropped after).</summary>
[CollectionDefinition("MyBudget API E2E")]
public sealed class MyBudgetApiE2ECollectionDefinition : ICollectionFixture<E2EHostFixture>;
