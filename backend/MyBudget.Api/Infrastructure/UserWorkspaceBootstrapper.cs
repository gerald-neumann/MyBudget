using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MyBudget.Api.Domain;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Infrastructure;

/// <summary>
/// Creates the signed-in user's row, default categories/accounts, primary + sample baselines, and keeps demo content in sync.
/// </summary>
public interface IUserWorkspaceBootstrapper
{
    Task EnsureWorkspaceAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Clears the short-lived "already bootstrapped" cache so the next <see cref="EnsureWorkspaceAsync"/> runs the full pipeline again.
    /// Used when the user deletes their last baseline and the app must recreate default workspaces immediately.
    /// </summary>
    void InvalidateWorkspaceBootstrapCache();
}

public class UserWorkspaceBootstrapper(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IPlanningMaterializationService planningMaterializationService,
    IMemoryCache memoryCache) : IUserWorkspaceBootstrapper
{
    private const string WorkspaceBootstrapCacheKeyPrefix = "mybudget.workspace-bootstrap:";

    private static string WorkspaceBootstrapCacheKey(Guid userId) =>
        $"{WorkspaceBootstrapCacheKeyPrefix}{userId:N}";

    public void InvalidateWorkspaceBootstrapCache() =>
        memoryCache.Remove(WorkspaceBootstrapCacheKey(userContext.UserId));

    public async Task EnsureWorkspaceAsync(CancellationToken cancellationToken = default)
    {
        var userId = userContext.UserId;
        var cacheKey = WorkspaceBootstrapCacheKey(userId);
        if (memoryCache.TryGetValue(cacheKey, out _))
        {
            return;
        }

        await RunBootstrapPipelineAsync(cancellationToken);

        memoryCache.Set(
            cacheKey,
            byte.MinValue,
            new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5) });
    }

    /// <summary>Personal empty workspace; stays the default (primary) for returning users.</summary>
    private const string DefaultBaselineName = "My budget";

    /// <summary>i18n key stored as name — UI translates (DE/EN).</summary>
    private const string SampleBaselineNameKey = "sample.baseline.exampleHousehold";

    private sealed record SamplePositionSpec(
        int SortOrder,
        string NameKey,
        string CategoryName,
        decimal DefaultAmount,
        BudgetCadence Cadence = BudgetCadence.Monthly,
        int YearlyMonth = 1,
        int YearlyDay = 1);

    private static readonly SamplePositionSpec[] SamplePositionSpecs =
    [
        new(1, "sample.positions.netSalary", "Income", 2400),
        new(2, "sample.positions.summerBonus", "Income", 2250, BudgetCadence.Yearly, 6, 28),
        new(3, "sample.positions.winterBonus", "Income", 2380, BudgetCadence.Yearly, 11, 25),
        new(4, "sample.positions.otherIncome", "Income", 35),
        new(10, "sample.positions.rent", "Housing", 750),
        new(11, "sample.positions.utilities", "Utilities", 220),
        new(12, "sample.positions.mobilePlan", "Utilities", 38),
        new(20, "sample.positions.groceries", "Food & groceries", 520),
        new(30, "sample.positions.carInsurance", "Insurance", 65),
        new(40, "sample.positions.fuel", "Transport", 140),
        new(50, "sample.positions.streaming", "Subscriptions", 48),
        new(60, "sample.positions.newspaper", "Subscriptions", 32),
        new(70, "sample.positions.gym", "Health", 55),
        new(80, "sample.positions.diningOut", "Discretionary / fun", 200),
        new(90, "sample.positions.pets", "Pets", 75),
        new(100, "sample.positions.parking", "Transport", 50),
        new(110, "sample.positions.emergencyFund", "Savings & investments", 300),
        new(120, "sample.positions.vacation", "One-off / large purchases", 130),
        new(130, "sample.positions.christmasGifts", "One-off / large purchases", 50),
        new(140, "sample.positions.birthdayGifts", "One-off / large purchases", 35),
        new(150, "sample.positions.clothes", "Discretionary / fun", 90)
    ];

    private static DateOnly GetSampleSpecStartDate(SamplePositionSpec spec)
    {
        var anchorYear = DateTime.UtcNow.Year;
        return spec.Cadence == BudgetCadence.Monthly
            ? new DateOnly(anchorYear, 1, 1)
            : new DateOnly(anchorYear - 2, spec.YearlyMonth, spec.YearlyDay);
    }

    private static readonly string[] StandardDemoAccountNames =
    [
        "Girokonto",
        "Bausparer",
        "Bargeld",
        "Sparschwein",
        "Kreditkarte",
        "Tagesgeld"
    ];

    private sealed record SampleAccountIds(
        Guid Giro,
        Guid Bausparer,
        Guid Bargeld,
        Guid Sparschwein,
        Guid Kreditkarte,
        Guid Tagesgeld);

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
        ("Pets", false),
        ("Savings & investments", false),
        ("Discretionary / fun", false),
        ("One-off / large purchases", false)
    ];

    private async Task RunBootstrapPipelineAsync(CancellationToken cancellationToken)
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

        if (!await dbContext.Accounts.AnyAsync(x => x.UserId == userId, cancellationToken))
        {
            var now = DateTimeOffset.UtcNow;
            var sort = 1;
            foreach (var name in StandardDemoAccountNames)
            {
                dbContext.Accounts.Add(
                    new Account
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        Name = name,
                        TypeLabel = null,
                        InitialBalance = 0,
                        SortOrder = sort++,
                        CreatedAt = now
                    });
            }

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        await EnsureStandardAccountsAsync(userId, cancellationToken);

        if (!await dbContext.Baselines.AnyAsync(x => x.UserId == userId, cancellationToken))
        {
            var exampleId = Guid.NewGuid();
            var personalId = Guid.NewGuid();
            var now = DateTimeOffset.UtcNow;
            dbContext.Baselines.AddRange(
                new BudgetBaseline
                {
                    Id = exampleId,
                    UserId = userId,
                    Name = SampleBaselineNameKey,
                    Status = "Active",
                    CreatedAt = now,
                    IsPrimaryBudget = false,
                    IsSampleDemo = true
                },
                new BudgetBaseline
                {
                    Id = personalId,
                    UserId = userId,
                    Name = DefaultBaselineName,
                    Status = "Active",
                    CreatedAt = now.AddTicks(1),
                    IsPrimaryBudget = true,
                    IsSampleDemo = false
                });
            await dbContext.SaveChangesAsync(cancellationToken);
            await SeedSampleDemoPositionsAsync(exampleId, userId, cancellationToken);
            await FinalizeSampleBaselineContentAsync(exampleId, userId, cancellationToken);
        }

        await EnsureLegacyUserHasSampleWorkspaceAsync(userId, cancellationToken);
        await NormalizeLegacySampleBaselineNamesAsync(cancellationToken);
        await EnsurePetsCategoryAsync(userId, cancellationToken);
        await SyncSampleDemoBaselinesAsync(userId, cancellationToken);
    }

    /// <summary>Renames older demo rows that used English literals before i18n keys were stored.</summary>
    private async Task NormalizeLegacySampleBaselineNamesAsync(CancellationToken cancellationToken)
    {
        const string legacyBaselineTitle = "Example household";
        await dbContext.Baselines
            .Where(b => b.IsSampleDemo && b.Name == legacyBaselineTitle)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.Name, SampleBaselineNameKey), cancellationToken);

        var legacyPositionMap = new Dictionary<string, string>
        {
            ["Net salary"] = "sample.positions.netSalary",
            ["Rent"] = "sample.positions.rent",
            ["Utilities (electric, gas, water)"] = "sample.positions.utilities",
            ["Groceries"] = "sample.positions.groceries",
            ["Car insurance"] = "sample.positions.carInsurance",
            ["Fuel / charging"] = "sample.positions.fuel",
            ["Streaming & apps"] = "sample.positions.streaming",
            ["Gym"] = "sample.positions.gym",
            ["Dining out"] = "sample.positions.diningOut",
            ["Emergency fund"] = "sample.positions.emergencyFund",
            ["Newspaper"] = "sample.positions.newspaper",
            ["Pet supplies"] = "sample.positions.pets",
            ["Parking"] = "sample.positions.parking"
        };

        foreach (var (from, to) in legacyPositionMap)
        {
            await dbContext.Positions
                .Where(p => p.Baseline.IsSampleDemo && p.Name == from)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Name, to), cancellationToken);
        }
    }

    private async Task EnsureLegacyUserHasSampleWorkspaceAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (await dbContext.Baselines.AnyAsync(x => x.UserId == userId && x.IsSampleDemo, cancellationToken))
        {
            return;
        }

        if (!await dbContext.Baselines.AnyAsync(x => x.UserId == userId, cancellationToken))
        {
            return;
        }

        var demo = new BudgetBaseline
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = SampleBaselineNameKey,
            Status = "Active",
            CreatedAt = DateTimeOffset.UtcNow,
            IsPrimaryBudget = false,
            IsSampleDemo = true
        };
        dbContext.Baselines.Add(demo);
        await dbContext.SaveChangesAsync(cancellationToken);
        await SeedSampleDemoPositionsAsync(demo.Id, userId, cancellationToken);
        await FinalizeSampleBaselineContentAsync(demo.Id, userId, cancellationToken);
    }

    private async Task FinalizeSampleBaselineContentAsync(Guid sampleBaselineId, Guid userId, CancellationToken cancellationToken)
    {
        var y0 = DateTime.UtcNow.Year;
        for (var y = y0 - 2; y <= y0; y++)
        {
            await planningMaterializationService.MaterializeYearAsync(sampleBaselineId, y, cancellationToken);
        }

        await SeedSampleDemoActualsIfEmptyAsync(sampleBaselineId, userId, cancellationToken);
    }

    private async Task SeedSampleDemoActualsIfEmptyAsync(Guid baselineId, Guid userId, CancellationToken cancellationToken)
    {
        if (await dbContext.ActualEntries.AnyAsync(e => e.BudgetPosition.BaselineId == baselineId, cancellationToken))
        {
            return;
        }

        var accounts = await dbContext.Accounts
            .Where(a => a.UserId == userId)
            .OrderBy(a => a.SortOrder)
            .ToListAsync(cancellationToken);
        if (accounts.Count == 0)
        {
            return;
        }

        var acc = ResolveSampleAccountIds(accounts);

        var positions = await dbContext.Positions
            .Where(p => p.BaselineId == baselineId)
            .ToListAsync(cancellationToken);
        var positionIdsByKey = positions.ToDictionary(p => p.Name, p => p.Id);

        var occupiedKeys = new HashSet<(Guid PositionId, DateOnly BookedOn)>();

        var yEnd = DateTime.UtcNow.Year;
        for (var y = yEnd - 2; y <= yEnd; y++)
        {
            for (var m = 1; m <= 12; m++)
            {
                var jitter = (y * 13 + m * 7) % 45;
                AddSampleDemoMonthActuals(y, m, jitter, dbContext, positionIdsByKey, acc, occupiedKeys);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedSampleDemoPositionsAsync(Guid baselineId, Guid userId, CancellationToken cancellationToken)
    {
        var categories = await dbContext.Categories
            .Where(c => c.UserId == userId)
            .ToDictionaryAsync(c => c.Name, c => c.Id, cancellationToken);

        foreach (var spec in SamplePositionSpecs)
        {
            if (!categories.TryGetValue(spec.CategoryName, out var categoryId))
            {
                continue;
            }

            var startDate = GetSampleSpecStartDate(spec);
            dbContext.Positions.Add(
                new BudgetPosition
                {
                    Id = Guid.NewGuid(),
                    BaselineId = baselineId,
                    CategoryId = categoryId,
                    Name = spec.NameKey,
                    Cadence = spec.Cadence,
                    StartDate = startDate,
                    EndDate = null,
                    DefaultAmount = spec.DefaultAmount,
                    SortOrder = spec.SortOrder,
                    RecurrenceRuleJson = BudgetRecurrenceRule.ToJson(spec.Cadence, startDate, null, spec.DefaultAmount)
                });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
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

    private async Task EnsurePetsCategoryAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (await dbContext.Categories.AnyAsync(c => c.UserId == userId && c.Name == "Pets", cancellationToken))
        {
            return;
        }

        var maxOrder = await dbContext.Categories
            .Where(x => x.UserId == userId)
            .Select(x => (int?)x.SortOrder)
            .MaxAsync(cancellationToken) ?? 0;

        dbContext.Categories.Add(new Category
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = "Pets",
            SortOrder = maxOrder + 1,
            Color = null,
            IsSystem = true,
            IsIncome = false
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureStandardAccountsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var existingNames = await dbContext.Accounts
            .Where(a => a.UserId == userId)
            .Select(a => a.Name)
            .ToListAsync(cancellationToken);

        var have = new HashSet<string>(existingNames, StringComparer.Ordinal);
        var maxOrder = await dbContext.Accounts
            .Where(a => a.UserId == userId)
            .Select(a => (int?)a.SortOrder)
            .MaxAsync(cancellationToken) ?? 0;

        var now = DateTimeOffset.UtcNow;
        var added = false;
        foreach (var name in StandardDemoAccountNames)
        {
            if (have.Contains(name))
            {
                continue;
            }

            maxOrder++;
            dbContext.Accounts.Add(
                new Account
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Name = name,
                    TypeLabel = null,
                    InitialBalance = 0,
                    SortOrder = maxOrder,
                    CreatedAt = now
                });
            have.Add(name);
            added = true;
        }

        if (added)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static SampleAccountIds ResolveSampleAccountIds(IReadOnlyList<Account> accounts)
    {
        Guid Find(params string[] names)
        {
            foreach (var n in names)
            {
                for (var i = 0; i < accounts.Count; i++)
                {
                    if (string.Equals(accounts[i].Name, n, StringComparison.OrdinalIgnoreCase))
                    {
                        return accounts[i].Id;
                    }
                }
            }

            return accounts[0].Id;
        }

        return new SampleAccountIds(
            Find("Girokonto"),
            Find("Bausparer"),
            Find("Bargeld"),
            Find("Sparschwein"),
            Find("Kreditkarte"),
            Find("Tagesgeld"));
    }

    private static void AddSampleDemoEntry(
        BudgetDbContext dbContext,
        IReadOnlyDictionary<string, Guid> positionIdsByKey,
        HashSet<(Guid PositionId, DateOnly BookedOn)> occupiedKeys,
        string nameKey,
        DateOnly bookedOn,
        decimal amount,
        Guid accountId,
        string? noteKey)
    {
        if (!positionIdsByKey.TryGetValue(nameKey, out var pid))
        {
            return;
        }

        var key = (pid, bookedOn);
        if (occupiedKeys.Contains(key))
        {
            return;
        }

        occupiedKeys.Add(key);
        dbContext.ActualEntries.Add(
            new ActualEntry
            {
                Id = Guid.NewGuid(),
                BudgetPositionId = pid,
                AccountId = accountId,
                BookedOn = bookedOn,
                Amount = amount,
                Note = noteKey,
                ExternalRef = null
            });
    }

    private static void AddSampleDemoMonthActuals(
        int y,
        int m,
        int jitter,
        BudgetDbContext dbContext,
        IReadOnlyDictionary<string, Guid> positionIdsByKey,
        SampleAccountIds acc,
        HashSet<(Guid PositionId, DateOnly BookedOn)> occupiedKeys)
    {
        void Emit(string nameKey, int day, decimal amount, Guid accountId, string? noteKey)
        {
            var dom = Math.Clamp(day, 1, DateTime.DaysInMonth(y, m));
            AddSampleDemoEntry(dbContext, positionIdsByKey, occupiedKeys, nameKey, new DateOnly(y, m, dom), amount, accountId, noteKey);
        }

        Emit("sample.positions.netSalary", 25, 2400, acc.Giro, "sample.notes.salary");
        Emit("sample.positions.rent", 3, 750, acc.Giro, "sample.notes.rent");
        Emit("sample.positions.utilities", 12, 198 + (jitter % 28), acc.Giro, "sample.notes.utilities");
        Emit("sample.positions.mobilePlan", 7, 38, acc.Giro, "sample.notes.mobilePlan");
        Emit("sample.positions.groceries", 6, 118 + (jitter % 14), acc.Bargeld, "sample.notes.groceries");
        Emit("sample.positions.groceries", 20, 124 + (jitter % 18), acc.Bargeld, "sample.notes.groceries");
        if (m % 2 == 0)
        {
            Emit("sample.positions.groceries", 24, 96 + (jitter % 12), acc.Giro, "sample.notes.groceries");
        }

        Emit("sample.positions.fuel", 8, 64 + (jitter % 12), acc.Giro, "sample.notes.fuel");
        Emit("sample.positions.fuel", 22, 58 + (jitter % 10), acc.Bargeld, "sample.notes.fuel");
        Emit("sample.positions.streaming", 5, 48, acc.Giro, "sample.notes.streaming");
        Emit("sample.positions.newspaper", 9, 32, acc.Giro, "sample.notes.newspaper");
        Emit("sample.positions.gym", 2, 55, acc.Giro, "sample.notes.gym");
        Emit("sample.positions.diningOut", 14, 44 + (jitter % 22), acc.Bargeld, "sample.notes.diningOut");
        Emit("sample.positions.diningOut", 27, 48 + (jitter % 20), acc.Kreditkarte, "sample.notes.diningOut");
        Emit("sample.positions.pets", 16, 64 + (jitter % 16), acc.Giro, "sample.notes.pets");
        Emit("sample.positions.parking", 11, 42 + (jitter % 14), acc.Bargeld, "sample.notes.parking");
        Emit("sample.positions.emergencyFund", 28, 300, acc.Bausparer, "sample.notes.savingsTransfer");

        if (m % 3 == 1)
        {
            Emit("sample.positions.carInsurance", 10, 65 * 3, acc.Giro, "sample.notes.insuranceQuarter");
        }

        if (m == 6)
        {
            Emit("sample.positions.summerBonus", 28, 2180 + (y % 5) * 25, acc.Giro, "sample.notes.summerBonus");
        }

        if (m == 11)
        {
            Emit("sample.positions.winterBonus", 25, 2320 + (jitter % 40), acc.Giro, "sample.notes.winterBonus");
        }

        var otherNoise = (y + m) % 4 == 0 ? 55 + (jitter % 25) : (y + m) % 7 == 0 ? 22 + (jitter % 10) : 0;
        if (otherNoise > 0)
        {
            Emit("sample.positions.otherIncome", 18, otherNoise, acc.Tagesgeld, "sample.notes.otherIncome");
        }

        if (m is >= 6 and <= 8)
        {
            var vac = m switch
            {
                6 => 220 + (jitter % 35),
                7 => 520 + (jitter % 80),
                _ => 410 + (jitter % 60)
            };
            Emit("sample.positions.vacation", 15, vac, acc.Kreditkarte, "sample.notes.vacation");
            if (m == 7)
            {
                Emit("sample.positions.vacation", 28, 180 + (jitter % 40), acc.Bargeld, "sample.notes.vacationSnacks");
            }
        }

        if (m == 11)
        {
            Emit("sample.positions.christmasGifts", 12, 155 + (jitter % 25), acc.Kreditkarte, "sample.notes.christmasGifts");
            Emit("sample.positions.christmasGifts", 28, 198, acc.Bargeld, "sample.notes.christmasMarket");
        }

        if (m == 12)
        {
            Emit("sample.positions.christmasGifts", 5, 380 + (jitter % 50), acc.Kreditkarte, "sample.notes.christmasGifts");
            Emit("sample.positions.christmasGifts", 18, 245 + (jitter % 30), acc.Giro, "sample.notes.christmasGifts");
        }

        if (m == 3)
        {
            Emit("sample.positions.birthdayGifts", 12, 185 + (jitter % 20), acc.Bargeld, "sample.notes.birthdayGifts");
        }

        if (m == 7)
        {
            Emit("sample.positions.birthdayGifts", 8, 165 + (jitter % 30), acc.Kreditkarte, "sample.notes.birthdayGifts");
        }

        if (m == 9)
        {
            Emit("sample.positions.birthdayGifts", 21, 95 + (jitter % 15), acc.Bargeld, "sample.notes.birthdayGifts");
        }

        Emit("sample.positions.clothes", 19, 38 + (jitter % 18), acc.Bargeld, "sample.notes.clothes");
        if (m is 3 or 9)
        {
            Emit("sample.positions.clothes", 5, m == 9 ? 165 + (jitter % 35) : 110 + (jitter % 25), acc.Kreditkarte, "sample.notes.clothesSeason");
        }

        if (m == 4 && y % 2 == 0)
        {
            Emit("sample.positions.otherIncome", 22, 285, acc.Giro, "sample.notes.taxRefund");
        }
    }

    private async Task SyncSampleDemoBaselinesAsync(Guid userId, CancellationToken cancellationToken)
    {
        var sampleIds = await dbContext.Baselines
            .Where(b => b.UserId == userId && b.IsSampleDemo)
            .Select(b => b.Id)
            .ToListAsync(cancellationToken);

        foreach (var baselineId in sampleIds)
        {
            await SyncSampleBaselinePositionsAndPlansAsync(baselineId, userId, cancellationToken);
            await PatchSampleDemoSalaryAndRentActualsAsync(baselineId, cancellationToken);
            await BackfillExtendedSampleActualsAsync(baselineId, userId, cancellationToken);
        }
    }

    private async Task SyncSampleBaselinePositionsAndPlansAsync(Guid baselineId, Guid userId, CancellationToken cancellationToken)
    {
        var categories = await dbContext.Categories
            .Where(c => c.UserId == userId)
            .ToDictionaryAsync(c => c.Name, c => c.Id, cancellationToken);

        var positions = await dbContext.Positions
            .Include(p => p.PlannedAmounts)
            .Where(p => p.BaselineId == baselineId)
            .ToListAsync(cancellationToken);

        var byName = positions.ToDictionary(p => p.Name, p => p);
        var changed = false;

        foreach (var spec in SamplePositionSpecs)
        {
            if (!categories.TryGetValue(spec.CategoryName, out var categoryId))
            {
                continue;
            }

            var startDate = GetSampleSpecStartDate(spec);
            var ruleJson = BudgetRecurrenceRule.ToJson(spec.Cadence, startDate, null, spec.DefaultAmount);

            if (byName.TryGetValue(spec.NameKey, out var existing))
            {
                var metaChanged = existing.DefaultAmount != spec.DefaultAmount
                    || existing.SortOrder != spec.SortOrder
                    || existing.CategoryId != categoryId
                    || existing.Cadence != spec.Cadence
                    || existing.StartDate != startDate
                    || existing.RecurrenceRuleJson != ruleJson;

                if (metaChanged)
                {
                    existing.DefaultAmount = spec.DefaultAmount;
                    existing.SortOrder = spec.SortOrder;
                    existing.CategoryId = categoryId;
                    existing.Cadence = spec.Cadence;
                    existing.StartDate = startDate;
                    existing.EndDate = null;
                    existing.RecurrenceRuleJson = ruleJson;
                    changed = true;
                }

                if (spec.Cadence == BudgetCadence.Yearly)
                {
                    var rule = BudgetRecurrenceRule.Resolve(
                        existing.Cadence,
                        existing.StartDate,
                        existing.EndDate,
                        existing.DefaultAmount,
                        existing.RecurrenceRuleJson);
                    var nonOverride = existing.PlannedAmounts.Where(x => !x.IsOverride).ToList();
                    var yearEnd = DateTime.UtcNow.Year;
                    var expected = new HashSet<(int Year, int Month)>();
                    for (var yy = yearEnd - 2; yy <= yearEnd; yy++)
                    {
                        foreach (var mo in BudgetRecurrenceRule.GetExpectedMonths(rule, yy))
                        {
                            expected.Add((yy, mo));
                        }
                    }

                    var stray = nonOverride.Any(pa =>
                        !expected.Contains((pa.Year, pa.Month)) || pa.Amount != spec.DefaultAmount);

                    if (stray || metaChanged)
                    {
                        foreach (var pa in nonOverride)
                        {
                            dbContext.PlannedAmounts.Remove(pa);
                        }

                        changed = true;
                    }
                }
                else
                {
                    foreach (var pa in existing.PlannedAmounts.Where(x => !x.IsOverride))
                    {
                        if (pa.Amount != spec.DefaultAmount)
                        {
                            pa.Amount = spec.DefaultAmount;
                            changed = true;
                        }
                    }
                }
            }
            else
            {
                var created = new BudgetPosition
                {
                    Id = Guid.NewGuid(),
                    BaselineId = baselineId,
                    CategoryId = categoryId,
                    Name = spec.NameKey,
                    Cadence = spec.Cadence,
                    StartDate = startDate,
                    EndDate = null,
                    DefaultAmount = spec.DefaultAmount,
                    SortOrder = spec.SortOrder,
                    RecurrenceRuleJson = ruleJson
                };
                dbContext.Positions.Add(created);
                byName[spec.NameKey] = created;
                changed = true;
            }
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var y0 = DateTime.UtcNow.Year;
        for (var y = y0 - 2; y <= y0; y++)
        {
            await planningMaterializationService.MaterializeYearAsync(baselineId, y, cancellationToken);
        }
    }

    private async Task PatchSampleDemoSalaryAndRentActualsAsync(Guid baselineId, CancellationToken cancellationToken)
    {
        var salaryIds = await dbContext.Positions
            .Where(p => p.BaselineId == baselineId && p.Name == "sample.positions.netSalary")
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);
        if (salaryIds.Count > 0)
        {
            await dbContext.ActualEntries
                .Where(e => salaryIds.Contains(e.BudgetPositionId))
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.Amount, 2400m), cancellationToken);
        }

        var rentIds = await dbContext.Positions
            .Where(p => p.BaselineId == baselineId && p.Name == "sample.positions.rent")
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);
        if (rentIds.Count > 0)
        {
            await dbContext.ActualEntries
                .Where(e => rentIds.Contains(e.BudgetPositionId))
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.Amount, 750m), cancellationToken);
        }
    }

    private async Task BackfillExtendedSampleActualsAsync(Guid baselineId, Guid userId, CancellationToken cancellationToken)
    {
        if (!await dbContext.ActualEntries.AnyAsync(e => e.BudgetPosition.BaselineId == baselineId, cancellationToken))
        {
            return;
        }

        var accounts = await dbContext.Accounts
            .Where(a => a.UserId == userId)
            .OrderBy(a => a.SortOrder)
            .ToListAsync(cancellationToken);
        if (accounts.Count == 0)
        {
            return;
        }

        var acc = ResolveSampleAccountIds(accounts);

        var positions = await dbContext.Positions
            .Where(p => p.BaselineId == baselineId)
            .ToListAsync(cancellationToken);
        var positionIdsByKey = positions.ToDictionary(p => p.Name, p => p.Id);
        if (positionIdsByKey.Count == 0)
        {
            return;
        }

        var positionIds = positionIdsByKey.Values.ToList();
        var existingRows = await dbContext.ActualEntries
            .Where(e => positionIds.Contains(e.BudgetPositionId))
            .Select(e => new { e.BudgetPositionId, e.BookedOn })
            .ToListAsync(cancellationToken);
        var occupiedKeys = existingRows
            .Select(r => (r.BudgetPositionId, r.BookedOn))
            .ToHashSet();

        var yEnd = DateTime.UtcNow.Year;
        for (var y = yEnd - 2; y <= yEnd; y++)
        {
            for (var m = 1; m <= 12; m++)
            {
                var jitter = (y * 13 + m * 7) % 45;
                AddSampleDemoMonthActuals(y, m, jitter, dbContext, positionIdsByKey, acc, occupiedKeys);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
