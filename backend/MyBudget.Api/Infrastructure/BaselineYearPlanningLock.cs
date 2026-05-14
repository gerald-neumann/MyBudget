using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace MyBudget.Api.Infrastructure;

/// <summary>
/// Serializes planning writes for a baseline calendar year so concurrent materialization / upserts
/// cannot insert duplicate (budget_position_id, year, month) rows.
/// </summary>
internal static class BaselineYearPlanningLock
{
    internal static async Task AcquireAsync(
        DatabaseFacade database,
        Guid baselineId,
        int year,
        CancellationToken cancellationToken = default)
    {
        var span = baselineId.ToByteArray();
        var k1 = BitConverter.ToInt32(span, 0) ^ BitConverter.ToInt32(span, 4);
        var k2 = BitConverter.ToInt32(span, 8) ^ BitConverter.ToInt32(span, 12) ^ year;
        await database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock({k1}, {k2})",
            cancellationToken);
    }
}
