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
    decimal DefaultAmount)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
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
                    return parsed;
                }
            }
            catch (JsonException)
            {
                // Fall back to column values.
            }
        }

        return new BudgetRecurrenceRule(cadence, startDate, endDate, defaultAmount);
    }

    public static string ToJson(BudgetCadence cadence, DateOnly startDate, DateOnly? endDate, decimal defaultAmount)
    {
        var rule = new BudgetRecurrenceRule(cadence, startDate, endDate, defaultAmount);
        return JsonSerializer.Serialize(rule, JsonOptions);
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
            _ => rule.StartDate.Year == year ? new[] { rule.StartDate.Month } : Enumerable.Empty<int>()
        };
    }
}
