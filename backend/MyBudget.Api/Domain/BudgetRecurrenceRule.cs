using System.Text.Json;
using System.Text.Json.Serialization;
using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Domain;

/// <summary>
/// Canonical scheduling rule for a budget line, persisted as JSON for cross-year materialization.
/// </summary>
public sealed record BudgetRecurrenceRule(
    BudgetCadence Cadence,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal DefaultAmount,
    int? IntervalMonths = null,
    BudgetDistributionMode DistributionMode = BudgetDistributionMode.ExactDayOfMonth,
    int? DayOfMonth = null)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    public static BudgetRecurrenceRule Resolve(
        BudgetCadence cadence,
        DateOnly startDate,
        DateOnly? endDate,
        decimal defaultAmount,
        string? recurrenceRuleJson)
    {
        if (!string.IsNullOrWhiteSpace(recurrenceRuleJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<BudgetRecurrenceRule>(recurrenceRuleJson, JsonOptions);
                if (parsed is not null)
                {
                    return Normalize(cadence, startDate, endDate, defaultAmount, parsed);
                }
            }
            catch (JsonException)
            {
                // Fall back to column values.
            }
        }

        var scheduleDay = NormalizeDayOfMonth(BudgetDistributionMode.ExactDayOfMonth, startDate.Day);
        return new BudgetRecurrenceRule(
            cadence,
            startDate,
            endDate,
            defaultAmount,
            null,
            BudgetDistributionMode.ExactDayOfMonth,
            scheduleDay);
    }

    /// <summary>Serializes a resolved rule (preferred when copying or persisting after <see cref="Resolve"/>).</summary>
    public static string ToJson(BudgetRecurrenceRule rule) => JsonSerializer.Serialize(rule, JsonOptions);

    public static string ToJson(
        BudgetCadence cadence,
        DateOnly startDate,
        DateOnly? endDate,
        decimal defaultAmount,
        int? intervalMonths = null,
        BudgetDistributionMode distributionMode = BudgetDistributionMode.ExactDayOfMonth,
        int? dayOfMonth = null)
    {
        var interval = cadence == BudgetCadence.EveryNMonths ? intervalMonths : null;
        var scheduleDay = NormalizeDayOfMonth(distributionMode, dayOfMonth ?? startDate.Day);
        return ToJson(new BudgetRecurrenceRule(cadence, startDate, endDate, defaultAmount, interval, distributionMode, scheduleDay));
    }

    public static IEnumerable<int> GetExpectedMonths(BudgetRecurrenceRule rule, int year)
    {
        if (rule.StartDate.Year > year)
        {
            return Enumerable.Empty<int>();
        }

        var endDate = rule.EndDate;
        if (endDate is not null && endDate.Value.Year < year)
        {
            return Enumerable.Empty<int>();
        }

        var firstMonth = rule.StartDate.Year == year ? rule.StartDate.Month : 1;
        var lastMonth = endDate is not null && endDate.Value.Year == year ? endDate.Value.Month : 12;

        return rule.Cadence switch
        {
            BudgetCadence.Monthly => Enumerable.Range(firstMonth, lastMonth - firstMonth + 1),
            BudgetCadence.Yearly => rule.StartDate.Month >= firstMonth && rule.StartDate.Month <= lastMonth
                ? new[] { rule.StartDate.Month }
                : Enumerable.Empty<int>(),
            BudgetCadence.EveryNMonths => GetEveryNMonthsInYear(rule.StartDate, firstMonth, lastMonth, year, rule.IntervalMonths ?? 2),
            _ => rule.StartDate.Year == year ? new[] { rule.StartDate.Month } : Enumerable.Empty<int>()
        };
    }

    private static BudgetRecurrenceRule Normalize(
        BudgetCadence columnCadence,
        DateOnly columnStart,
        DateOnly? columnEnd,
        decimal columnAmount,
        BudgetRecurrenceRule parsed)
    {
        // Prefer authoritative columns for identity fields; keep interval from JSON when cadence matches.
        var cadence = columnCadence;
        var interval = cadence == BudgetCadence.EveryNMonths ? parsed.IntervalMonths : null;
        var distributionMode = parsed.DistributionMode;
        var dayOfMonth = NormalizeDayOfMonth(distributionMode, parsed.DayOfMonth ?? columnStart.Day);
        return new BudgetRecurrenceRule(cadence, columnStart, columnEnd, columnAmount, interval, distributionMode, dayOfMonth);
    }

    public int ScheduledDayOfMonth(int year, int month)
    {
        var configured = NormalizeDayOfMonth(DistributionMode, DayOfMonth ?? StartDate.Day) ?? 1;
        var lastDay = DateTime.DaysInMonth(year, month);
        return Math.Clamp(configured, 1, lastDay);
    }

    private static int? NormalizeDayOfMonth(BudgetDistributionMode distributionMode, int? dayOfMonth)
    {
        if (distributionMode == BudgetDistributionMode.EvenlyDistributed)
        {
            return null;
        }

        var day = dayOfMonth ?? 1;
        return Math.Clamp(day, 1, 31);
    }

    private static IEnumerable<int> GetEveryNMonthsInYear(DateOnly anchorStart, int firstMonth, int lastMonth, int year, int intervalMonths)
    {
        var n = Math.Clamp(intervalMonths, 2, 24);
        for (var month = firstMonth; month <= lastMonth; month++)
        {
            var offsetMonths = (year - anchorStart.Year) * 12 + (month - anchorStart.Month);
            if (offsetMonths >= 0 && offsetMonths % n == 0)
            {
                yield return month;
            }
        }
    }
}
