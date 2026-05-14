using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Enums;
using Xunit;

namespace MyBudget.Api.Tests;

[Collection("MyBudget API E2E")]
public sealed class ApiEndpointsE2ETests(E2EHostFixture host)
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private HttpClient Http => host.Client;

    private sealed class BaselineRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = "";
        public bool IsSampleDemo { get; set; }
        public bool IsPrimaryBudget { get; set; }
    }

    private sealed class BuildInfoRow
    {
        public string Version { get; set; } = "";
        public string? BuildTimestampUtc { get; set; }
    }

    private sealed class PositionRow
    {
        public Guid Id { get; set; }
        public Guid BaselineId { get; set; }
        public Guid CategoryId { get; set; }
    }

    [Fact]
    public async Task Concurrent_reads_of_sample_baseline_positions_do_not_hit_planned_amount_unique_violation()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var sampleId = baselines.Single(b => b.IsSampleDemo).Id;
        var year = DateTime.UtcNow.Year;
        const int parallel = 30;
        var tasks = Enumerable
            .Range(0, parallel)
            .Select(_ => Http.GetAsync(new Uri($"/baselines/{sampleId}/positions?year={year}", UriKind.Relative)));
        var responses = await Task.WhenAll(tasks);
        foreach (var r in responses)
        {
            r.EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task All_http_endpoints_smoke_test_against_seeded_beispielhaushalt()
    {
        using var health = await Http.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);

        var buildInfo = await Http.GetFromJsonAsync<BuildInfoRow>("/build-info", JsonOpts);
        Assert.NotNull(buildInfo);
        Assert.False(string.IsNullOrWhiteSpace(buildInfo.Version));

        using var me = await Http.GetAsync("/me");
        me.EnsureSuccessStatusCode();

        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        Assert.Contains(baselines, b => b.IsSampleDemo);
        Assert.Contains(baselines, b => b.IsPrimaryBudget && !b.IsSampleDemo);
        var sample = baselines.Single(b => b.IsSampleDemo);
        var primary = baselines.Single(b => b.IsPrimaryBudget && !b.IsSampleDemo);
        Assert.Equal("sample.baseline.exampleHousehold", sample.Name);

        using var sentInv = await Http.GetAsync("/baselines/invitations/sent");
        sentInv.EnsureSuccessStatusCode();

        var year = DateTime.UtcNow.Year;
        using var positions = await Http.GetAsync($"/baselines/{sample.Id}/positions?year={year}");
        positions.EnsureSuccessStatusCode();
        var positionList = await positions.Content.ReadFromJsonAsync<List<PositionRow>>(JsonOpts);
        Assert.NotNull(positionList);
        Assert.NotEmpty(positionList);
        var anyPosition = positionList[0];

        using var categories = await Http.GetAsync("/categories");
        categories.EnsureSuccessStatusCode();

        using var accounts = await Http.GetAsync($"/accounts?baselineId={sample.Id}");
        accounts.EnsureSuccessStatusCode();
        var accountList = await accounts.Content.ReadFromJsonAsync<List<AccountJson>>(JsonOpts);
        Assert.NotNull(accountList);
        Assert.NotEmpty(accountList);

        using var actuals = await Http.GetAsync($"/actuals?baselineId={sample.Id}");
        actuals.EnsureSuccessStatusCode();

        var from = new DateOnly(year, 1, 1);
        var to = new DateOnly(year, 12, 31);
        AssertOk(await Http.GetAsync(
            $"/reports/monthly-summary?baselineId={sample.Id}&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}"));
        AssertOk(await Http.GetAsync(
            $"/reports/yearly-summary?baselineId={sample.Id}&fromYear={year - 1}&toYear={year}"));
        AssertOk(await Http.GetAsync($"/reports/by-category?baselineId={sample.Id}&year={year}"));
        AssertOk(await Http.GetAsync($"/reports/monthly-cashflow?baselineId={sample.Id}&year={year}"));

        AssertOk(await Http.GetAsync($"/baselines/{sample.Id}/compare?otherId={primary.Id}&year={year}"));
        AssertOk(await Http.GetAsync($"/baselines/{sample.Id}/categories"));

        using var members = await Http.GetAsync($"/baselines/{sample.Id}/members");
        members.EnsureSuccessStatusCode();

        var randomMember = Guid.NewGuid();
        using var patchMember = await Http.PatchAsJsonAsync(
            $"/baselines/{sample.Id}/members/{randomMember}",
            new UpdateBaselineMemberRequest(BaselineAccessRole.Editor));
        Assert.Equal(HttpStatusCode.NotFound, patchMember.StatusCode);
        using var delMember = await Http.DeleteAsync($"/baselines/{sample.Id}/members/{randomMember}");
        Assert.Equal(HttpStatusCode.NotFound, delMember.StatusCode);

        using var invitations = await Http.GetAsync($"/baselines/{sample.Id}/invitations");
        invitations.EnsureSuccessStatusCode();

        using var badAccept = await Http.PostAsJsonAsync(
            "/invitations/accept",
            new AcceptInvitationRequest("definitely-not-a-valid-invite-token"));
        Assert.Equal(HttpStatusCode.NotFound, badAccept.StatusCode);

        using var createInv = await Http.PostAsJsonAsync(
            $"/baselines/{sample.Id}/invitations",
            new CreateBaselineInvitationRequest(BaselineAccessRole.Viewer, 1));
        createInv.EnsureSuccessStatusCode();
        var invPayload = await createInv.Content.ReadFromJsonAsync<CreateBaselineInvitationResponse>(JsonOpts);
        Assert.NotNull(invPayload);
        using var delInv = await Http.DeleteAsync($"/baselines/{sample.Id}/invitations/{invPayload.InvitationId}");
        delInv.EnsureSuccessStatusCode();

        using var patchBaseline = await Http.PatchAsJsonAsync(
            $"/baselines/{primary.Id}",
            new UpdateBaselineRequest(Status: "Active"));
        patchBaseline.EnsureSuccessStatusCode();

        using var createBaseline = await Http.PostAsJsonAsync(
            "/baselines",
            new CreateBaselineRequest("E2E disposable baseline", "Draft"));
        createBaseline.EnsureSuccessStatusCode();
        var createdBaseline = await createBaseline.Content.ReadFromJsonAsync<BaselineRow>(JsonOpts);
        Assert.NotNull(createdBaseline);
        using var delBaseline = await Http.DeleteAsync($"/baselines/{createdBaseline.Id}");
        delBaseline.EnsureSuccessStatusCode();

        using var fork = await Http.PostAsJsonAsync(
            $"/baselines/{sample.Id}/fork",
            new ForkBaselineRequest("E2E fork of sample"));
        fork.EnsureSuccessStatusCode();
        var forked = await fork.Content.ReadFromJsonAsync<BaselineRow>(JsonOpts);
        Assert.NotNull(forked);
        using var delFork = await Http.DeleteAsync($"/baselines/{forked.Id}");
        delFork.EnsureSuccessStatusCode();

        var categoryList = await Http.GetFromJsonAsync<List<CategoryJson>>("/categories", JsonOpts);
        Assert.NotNull(categoryList);
        var expenseCategoryId = categoryList.First(c => !c.IsIncome).Id;

        using var createCat = await Http.PostAsJsonAsync(
            "/categories",
            new CreateCategoryRequest("E2E category", 999, null, false));
        createCat.EnsureSuccessStatusCode();
        var newCat = await createCat.Content.ReadFromJsonAsync<CategoryJson>(JsonOpts);
        Assert.NotNull(newCat);
        using var patchCat = await Http.PatchAsJsonAsync(
            $"/categories/{newCat.Id}",
            new UpdateCategoryRequest("E2E category renamed", 998, null, false));
        patchCat.EnsureSuccessStatusCode();
        using var delCat = await Http.DeleteAsync($"/categories/{newCat.Id}");
        delCat.EnsureSuccessStatusCode();

        using var createAcct = await Http.PostAsJsonAsync(
            "/accounts",
            new CreateAccountRequest(primary.Id, "E2E account", null, 0m, 999));
        createAcct.EnsureSuccessStatusCode();
        var newAcct = await createAcct.Content.ReadFromJsonAsync<AccountJson>(JsonOpts);
        Assert.NotNull(newAcct);
        using var patchAcct = await Http.PatchAsJsonAsync(
            $"/accounts/{newAcct.Id}",
            new UpdateAccountRequest("E2E account renamed", null, 0m, 998));
        patchAcct.EnsureSuccessStatusCode();
        using var delAcct = await Http.DeleteAsync($"/accounts/{newAcct.Id}");
        delAcct.EnsureSuccessStatusCode();

        var createPos = new CreatePositionRequest(
            expenseCategoryId,
            "E2E line",
            BudgetCadence.Monthly,
            new DateOnly(year, 1, 1),
            null,
            10m,
            9999);
        using var createPosition = await Http.PostAsJsonAsync($"/baselines/{primary.Id}/positions", createPos);
        createPosition.EnsureSuccessStatusCode();
        var newPos = await createPosition.Content.ReadFromJsonAsync<PositionRow>(JsonOpts);
        Assert.NotNull(newPos);
        using var patchPos = await Http.PatchAsJsonAsync(
            $"/baselines/{primary.Id}/positions/{newPos.Id}",
            new UpdatePositionRequest(
                expenseCategoryId,
                "E2E line patched",
                BudgetCadence.Monthly,
                new DateOnly(year, 1, 1),
                null,
                12m,
                9998));
        patchPos.EnsureSuccessStatusCode();
        using var reapply = await Http.PostAsync(
            $"/baselines/{primary.Id}/positions/{newPos.Id}/reapply-recurrence-template?year={year}",
            null);
        reapply.EnsureSuccessStatusCode();
        using var delPos = await Http.DeleteAsync($"/baselines/{primary.Id}/positions/{newPos.Id}");
        delPos.EnsureSuccessStatusCode();

        using var patchPlanned = await Http.PatchAsJsonAsync(
            "/planned-amounts",
            new BatchUpsertPlannedAmountsRequest(
                new[] { new PlannedAmountUpsertRequest(anyPosition.Id, year, 3, 42.5m) }));
        patchPlanned.EnsureSuccessStatusCode();

        var booked = new DateOnly(year, 6, 15);
        using var createActual = await Http.PostAsJsonAsync(
            "/actuals",
            new CreateActualEntryRequest(anyPosition.Id, accountList[0].Id, booked, 7.5m, "e2e", null));
        createActual.EnsureSuccessStatusCode();
        var newActual = await createActual.Content.ReadFromJsonAsync<ActualJson>(JsonOpts);
        Assert.NotNull(newActual);
        using var patchActual = await Http.PatchAsJsonAsync(
            $"/actuals/{newActual.Id}",
            new UpdateActualEntryRequest(anyPosition.Id, accountList[0].Id, booked, 8m, "e2e2", null));
        patchActual.EnsureSuccessStatusCode();
        using var delActual = await Http.DeleteAsync($"/actuals/{newActual.Id}");
        delActual.EnsureSuccessStatusCode();
    }

    private static void AssertOk(HttpResponseMessage r) => r.EnsureSuccessStatusCode();

    private sealed class AccountJson
    {
        public Guid Id { get; set; }
    }

    private sealed class CategoryJson
    {
        public Guid Id { get; set; }
        public bool IsIncome { get; set; }
    }

    private sealed class ActualJson
    {
        public Guid Id { get; set; }
    }
}
