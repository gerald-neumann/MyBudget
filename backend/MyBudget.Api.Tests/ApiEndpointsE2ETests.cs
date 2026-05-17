using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
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
    public async Task Patch_planned_amount_zero_succeeds()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var primary = baselines.Single(b => b.IsPrimaryBudget && !b.IsSampleDemo);
        var year = DateTime.UtcNow.Year;

        var positions = await Http.GetFromJsonAsync<List<PositionRow>>(
            $"/baselines/{primary.Id}/positions?year={year}",
            JsonOpts);
        Assert.NotNull(positions);
        Assert.NotEmpty(positions);
        var positionId = positions[0].Id;

        using var patchPlanned = await Http.PatchAsJsonAsync(
            "/planned-amounts",
            new BatchUpsertPlannedAmountsRequest(
                new[] { new PlannedAmountUpsertRequest(positionId, year, 5, 0m) }));
        patchPlanned.EnsureSuccessStatusCode();

        var updated = await patchPlanned.Content.ReadFromJsonAsync<List<PlannedAmountJson>>(JsonOpts);
        Assert.NotNull(updated);
        var row = Assert.Single(updated);
        Assert.Equal(0m, row.Amount);
        Assert.True(row.IsOverride);
    }

    [Fact]
    public async Task Concurrent_planned_amount_patches_do_not_return_500()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var primary = baselines.Single(b => b.IsPrimaryBudget && !b.IsSampleDemo);
        var year = DateTime.UtcNow.Year;

        var positions = await Http.GetFromJsonAsync<List<PositionRow>>(
            $"/baselines/{primary.Id}/positions?year={year}",
            JsonOpts);
        Assert.NotNull(positions);
        Assert.NotEmpty(positions);
        var positionId = positions[0].Id;

        const int parallel = 25;
        var body = new BatchUpsertPlannedAmountsRequest(
            new[] { new PlannedAmountUpsertRequest(positionId, year, 5, 0m) });
        var tasks = Enumerable
            .Range(0, parallel)
            .Select(_ => Http.PatchAsJsonAsync("/planned-amounts", body));
        var responses = await Task.WhenAll(tasks);
        foreach (var response in responses)
        {
            response.EnsureSuccessStatusCode();
        }
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
    public async Task Position_endpoints_reject_category_ids_that_do_not_belong_to_baseline_owner()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var primary = baselines.Single(b => b.IsPrimaryBudget && !b.IsSampleDemo);

        var categories = await Http.GetFromJsonAsync<List<CategoryJson>>("/categories", JsonOpts);
        Assert.NotNull(categories);
        var validCategoryId = categories.First(c => !c.IsIncome).Id;
        var invalidCategoryId = Guid.NewGuid();

        var year = DateTime.UtcNow.Year;
        using var createPosition = await Http.PostAsJsonAsync(
            $"/baselines/{primary.Id}/positions",
            new CreatePositionRequest(
                validCategoryId,
                "E2E category validation",
                BudgetCadence.Monthly,
                new DateOnly(year, 1, 1),
                null,
                15m,
                9010));
        createPosition.EnsureSuccessStatusCode();
        var created = await createPosition.Content.ReadFromJsonAsync<PositionRow>(JsonOpts);
        Assert.NotNull(created);

        using var patchWithInvalidCategory = await Http.PatchAsJsonAsync(
            $"/baselines/{primary.Id}/positions/{created.Id}",
            new UpdatePositionRequest(
                invalidCategoryId,
                "E2E category validation patched",
                BudgetCadence.Monthly,
                new DateOnly(year, 1, 1),
                null,
                16m,
                9009));
        Assert.Equal(HttpStatusCode.BadRequest, patchWithInvalidCategory.StatusCode);

        using var createWithInvalidCategory = await Http.PostAsJsonAsync(
            $"/baselines/{primary.Id}/positions",
            new CreatePositionRequest(
                invalidCategoryId,
                "E2E invalid category create",
                BudgetCadence.Monthly,
                new DateOnly(year, 1, 1),
                null,
                9m,
                9011));
        Assert.Equal(HttpStatusCode.BadRequest, createWithInvalidCategory.StatusCode);

        using var cleanup = await Http.DeleteAsync($"/baselines/{primary.Id}/positions/{created.Id}");
        cleanup.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Reports_monthly_summary_rejects_excessive_date_ranges()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var sample = baselines.Single(b => b.IsSampleDemo);

        var from = new DateOnly(1900, 1, 1);
        var to = new DateOnly(2099, 12, 31);
        using var response = await Http.GetAsync(
            $"/reports/monthly-summary?baselineId={sample.Id}&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Reports_daily_liquidity_applies_opening_balance_exact_day_and_even_distribution()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var primary = baselines.Single(b => b.IsPrimaryBudget && !b.IsSampleDemo);
        var year = DateTime.UtcNow.Year;

        using var createBaseline = await Http.PostAsJsonAsync(
            "/baselines",
            new CreateBaselineRequest("E2E liquidity baseline", "Draft"));
        createBaseline.EnsureSuccessStatusCode();
        var baseline = await createBaseline.Content.ReadFromJsonAsync<BaselineRow>(JsonOpts);
        Assert.NotNull(baseline);

        var categories = await Http.GetFromJsonAsync<List<CategoryJson>>("/categories", JsonOpts);
        Assert.NotNull(categories);
        var expenseCategoryId = categories.First(c => !c.IsIncome).Id;

        using var createExact = await Http.PostAsJsonAsync(
            $"/baselines/{baseline.Id}/positions",
            new CreatePositionRequest(
                expenseCategoryId,
                "Liquidity exact day",
                BudgetCadence.Monthly,
                new DateOnly(year, 1, 1),
                null,
                0m,
                1)
            {
                DistributionMode = BudgetDistributionMode.ExactDayOfMonth,
                DayOfMonth = 31
            });
        createExact.EnsureSuccessStatusCode();
        var exact = await createExact.Content.ReadFromJsonAsync<PositionRow>(JsonOpts);
        Assert.NotNull(exact);

        using var createEven = await Http.PostAsJsonAsync(
            $"/baselines/{baseline.Id}/positions",
            new CreatePositionRequest(
                expenseCategoryId,
                "Liquidity even",
                BudgetCadence.Monthly,
                new DateOnly(year, 1, 1),
                null,
                0m,
                2)
            {
                DistributionMode = BudgetDistributionMode.EvenlyDistributed
            });
        createEven.EnsureSuccessStatusCode();
        var even = await createEven.Content.ReadFromJsonAsync<PositionRow>(JsonOpts);
        Assert.NotNull(even);

        using var patchPlanned = await Http.PatchAsJsonAsync(
            "/planned-amounts",
            new BatchUpsertPlannedAmountsRequest(
                new[]
                {
                    new PlannedAmountUpsertRequest(exact.Id, year, 2, 100m),
                    new PlannedAmountUpsertRequest(even.Id, year, 3, 100m)
                }));
        patchPlanned.EnsureSuccessStatusCode();

        var report = await Http.GetFromJsonAsync<DailyLiquidityJson>(
            $"/reports/daily-liquidity?baselineId={baseline.Id}&year={year}",
            JsonOpts);
        Assert.NotNull(report);
        Assert.Equal(0m, report.OpeningBalance);

        var febLastDay = DateTime.DaysInMonth(year, 2);
        var febPoint = report.Days.Single(d => d.Date == $"{year}-02-{febLastDay:00}");
        Assert.Equal(-100m, febPoint.DailyNet);

        var marchFirst = report.Days.Single(d => d.Date == $"{year}-03-01");
        var marchLast = report.Days.Single(d => d.Date == $"{year}-03-31");
        Assert.Equal(-3.23m, marchFirst.DailyNet);
        Assert.Equal(-3.10m, marchLast.DailyNet);

        var expectedDayCount = DateTime.IsLeapYear(year) ? 366 : 365;
        Assert.Equal(expectedDayCount, report.Days.Count);

        using var cleanupPositionEven = await Http.DeleteAsync($"/baselines/{baseline.Id}/positions/{even.Id}");
        cleanupPositionEven.EnsureSuccessStatusCode();
        using var cleanupPositionExact = await Http.DeleteAsync($"/baselines/{baseline.Id}/positions/{exact.Id}");
        cleanupPositionExact.EnsureSuccessStatusCode();
        using var cleanupBaseline = await Http.DeleteAsync($"/baselines/{baseline.Id}");
        cleanupBaseline.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Sample_demo_daily_liquidity_reflects_payment_schedule()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var sample = baselines.Single(b => b.IsSampleDemo);
        var year = DateTime.UtcNow.Year;

        var report = await Http.GetFromJsonAsync<DailyLiquidityJson>(
            $"/reports/daily-liquidity?baselineId={sample.Id}&year={year}",
            JsonOpts);
        Assert.NotNull(report);

        var salaryDay = report.Days.Single(d => d.Date == $"{year}-01-25");
        Assert.True(salaryDay.DailyNet > 2000m, "Net salary should land on the 25th.");

        var rentDay = report.Days.Single(d => d.Date == $"{year}-01-03");
        Assert.True(rentDay.DailyNet < -700m, "Rent should debit on the 3rd.");

        var january = report.Days.Where(d => d.Date.StartsWith($"{year}-01-", StringComparison.Ordinal)).ToList();
        var activeJanuaryDays = january.Count(d => d.DailyNet != 0);
        Assert.True(activeJanuaryDays >= 20, "Evenly distributed lines should keep most January days active.");

        var day1 = january.Single(d => d.Date.EndsWith("-01", StringComparison.Ordinal));
        Assert.True(day1.DailyNet < 500m, "Income should not all land on the 1st.");
    }

    [Fact]
    public async Task Upload_attachment_rejects_payload_with_mismatching_file_signature()
    {
        var baselines = await Http.GetFromJsonAsync<List<BaselineRow>>("/baselines", JsonOpts);
        Assert.NotNull(baselines);
        var sample = baselines.Single(b => b.IsSampleDemo);

        var year = DateTime.UtcNow.Year;
        var positions = await Http.GetFromJsonAsync<List<PositionRow>>(
            $"/baselines/{sample.Id}/positions?year={year}",
            JsonOpts);
        Assert.NotNull(positions);
        Assert.NotEmpty(positions);

        var accountList = await Http.GetFromJsonAsync<List<AccountJson>>(
            $"/accounts?baselineId={sample.Id}",
            JsonOpts);
        Assert.NotNull(accountList);
        Assert.NotEmpty(accountList);

        using var createActual = await Http.PostAsJsonAsync(
            "/actuals",
            new CreateActualEntryRequest(
                positions[0].Id,
                accountList[0].Id,
                new DateOnly(year, 6, 10),
                15m,
                "e2e upload",
                null));
        createActual.EnsureSuccessStatusCode();
        var actual = await createActual.Content.ReadFromJsonAsync<ActualJson>(JsonOpts);
        Assert.NotNull(actual);

        var payloadBytes = Encoding.UTF8.GetBytes("this is not a png signature");
        using var multipart = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(payloadBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        multipart.Add(fileContent, "file", "fake.png");

        using var upload = await Http.PostAsync($"/actuals/{actual.Id}/attachment", multipart);
        Assert.Equal(HttpStatusCode.BadRequest, upload.StatusCode);

        using var cleanup = await Http.DeleteAsync($"/actuals/{actual.Id}");
        cleanup.EnsureSuccessStatusCode();
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
        AssertOk(await Http.GetAsync($"/reports/plan-actual-by-position?baselineId={sample.Id}&year={year}"));
        AssertOk(await Http.GetAsync($"/reports/daily-liquidity?baselineId={sample.Id}&year={year}"));

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

    private sealed class PlannedAmountJson
    {
        public decimal Amount { get; set; }
        public bool IsOverride { get; set; }
    }

    private sealed class DailyLiquidityJson
    {
        public decimal OpeningBalance { get; set; }
        public List<DailyLiquidityDayJson> Days { get; set; } = [];
    }

    private sealed class DailyLiquidityDayJson
    {
        public string Date { get; set; } = "";
        public decimal DailyNet { get; set; }
        public decimal RunningBalance { get; set; }
    }
}
