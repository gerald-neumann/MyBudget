using System.Globalization;
using System.Text.RegularExpressions;
using MyBudget.Api.Domain.Entities;

namespace MyBudget.Api;

/// <summary>Parses amount filter strings such as "&gt; 1000 &lt; 2000" into EF predicates.</summary>
internal static partial class ActualAmountFilterParser
{
    [GeneratedRegex(@"(>=|<=|>|<)\s*(-?[0-9]+(?:[.,][0-9]+)?)", RegexOptions.CultureInvariant)]
    private static partial Regex AmountTokenRegex();

    public static IQueryable<ActualEntry> ApplyPredicates(IQueryable<ActualEntry> query, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return query;
        }

        foreach (Match m in AmountTokenRegex().Matches(raw.Trim()))
        {
            var op = m.Groups[1].Value;
            var numStr = m.Groups[2].Value.Replace(',', '.');
            if (!decimal.TryParse(numStr, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
            {
                continue;
            }

            query = op switch
            {
                ">" => query.Where(x => x.Amount > value),
                ">=" => query.Where(x => x.Amount >= value),
                "<" => query.Where(x => x.Amount < value),
                "<=" => query.Where(x => x.Amount <= value),
                _ => query
            };
        }

        return query;
    }
}
