using System.ComponentModel.DataAnnotations;
using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Contracts;

public record CategoryDto(Guid Id, string Name, int SortOrder, string? Color, bool IsSystem, bool IsIncome);
public record CreateCategoryRequest(
    [property: Required, StringLength(120, MinimumLength = 1)] string Name,
    [property: Range(-100_000, 100_000)] int SortOrder,
    [property: StringLength(32)] string? Color,
    bool IsIncome = false);
public record UpdateCategoryRequest(
    [property: Required, StringLength(120, MinimumLength = 1)] string Name,
    [property: Range(-100_000, 100_000)] int SortOrder,
    [property: StringLength(32)] string? Color,
    bool? IsIncome);

public record BudgetBaselineDto(
    Guid Id,
    string Name,
    string Status,
    DateTimeOffset CreatedAt,
    Guid? ForkedFromBaselineId,
    Guid OwnerUserId,
    BaselineAccessKind MyAccess,
    bool IsPrimaryBudget,
    bool IsSampleDemo);
public record CreateBaselineRequest(
    [property: Required, StringLength(120, MinimumLength = 1)] string Name,
    [property: StringLength(40)] string? Status);
public sealed record UpdateBaselineRequest
{
    [StringLength(120, MinimumLength = 1)]
    public string? Name { get; init; }

    [StringLength(40)]
    public string? Status { get; init; }

    public bool? IsPrimaryBudget { get; init; }
}
public record ForkBaselineRequest([property: Required, StringLength(120, MinimumLength = 1)] string Name);

public record BudgetRecurrenceRuleDto(
    BudgetCadence Cadence,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal DefaultAmount,
    int? IntervalMonths);

public record BudgetPositionDto(
    Guid Id,
    Guid BaselineId,
    Guid CategoryId,
    Guid? ForkedFromPositionId,
    string Name,
    BudgetCadence Cadence,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal DefaultAmount,
    int SortOrder,
    IReadOnlyCollection<PlannedAmountDto> PlannedAmounts,
    BudgetRecurrenceRuleDto RecurrenceRule);

public sealed record CreatePositionRequest
{
    public Guid CategoryId { get; init; }

    [Required, StringLength(160, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;

    public BudgetCadence Cadence { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public decimal DefaultAmount { get; init; }

    [Range(-100_000, 100_000)]
    public int SortOrder { get; init; }

    [Range(2, 24)]
    public int? IntervalMonths { get; init; }
}

public sealed record UpdatePositionRequest
{
    public Guid CategoryId { get; init; }

    [Required, StringLength(160, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;

    public BudgetCadence Cadence { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public decimal DefaultAmount { get; init; }

    [Range(-100_000, 100_000)]
    public int SortOrder { get; init; }

    [Range(2, 24)]
    public int? IntervalMonths { get; init; }

    public BudgetPositionPlannedApplyScope? PlannedAmountsScope { get; init; }
    public DateOnly? PlannedAmountsApplyFrom { get; init; }
    public DateOnly? PlannedAmountsApplyTo { get; init; }
}

public record PlannedAmountDto(Guid Id, Guid BudgetPositionId, int Year, int Month, decimal Amount, bool IsOverride);
public record PlannedAmountUpsertRequest(
    Guid BudgetPositionId,
    [Range(1900, 3000)] int Year,
    [Range(1, 12)] int Month,
    decimal Amount);
public record BatchUpsertPlannedAmountsRequest(
    [Required, MinLength(1)] IReadOnlyCollection<PlannedAmountUpsertRequest> Items);

public record ActualEntryDto(
    Guid Id,
    Guid BudgetPositionId,
    Guid? AccountId,
    string? AccountName,
    DateOnly BookedOn,
    decimal Amount,
    string? Note,
    string? ExternalRef,
    bool HasAttachment,
    string? AttachmentFileName);

public record ActualEntriesPageDto(IReadOnlyList<ActualEntryDto> Items, int TotalCount);

public record ActualBookingYearsDto(IReadOnlyList<int> Years);

public record CreateActualEntryRequest(
    Guid BudgetPositionId,
    Guid AccountId,
    DateOnly BookedOn,
    decimal Amount,
    [param: StringLength(500)] string? Note,
    [param: StringLength(200)] string? ExternalRef);

public record UpdateActualEntryRequest(
    Guid BudgetPositionId,
    Guid AccountId,
    DateOnly BookedOn,
    decimal Amount,
    [param: StringLength(500)] string? Note,
    [param: StringLength(200)] string? ExternalRef);

public record AccountDto(
    Guid Id,
    string Name,
    string? TypeLabel,
    decimal InitialBalance,
    decimal CurrentBalance,
    int SortOrder);

public record CreateAccountRequest(
    Guid BaselineId,
    [property: Required, StringLength(120, MinimumLength = 1)] string Name,
    [property: StringLength(80)] string? TypeLabel,
    decimal InitialBalance,
    [property: Range(-100_000, 100_000)] int SortOrder);
public record UpdateAccountRequest(
    [property: Required, StringLength(120, MinimumLength = 1)] string Name,
    [property: StringLength(80)] string? TypeLabel,
    decimal InitialBalance,
    [property: Range(-100_000, 100_000)] int SortOrder);

public record MonthlySummaryPoint(int Year, int Month, decimal Planned, decimal Actual);
public record YearlySummaryPoint(int Year, decimal Planned, decimal Actual);
public record CategorySummaryPoint(Guid CategoryId, string Category, decimal Planned, decimal Actual);
public record BaselineComparisonPoint(int Year, int Month, decimal BasePlanned, decimal ComparePlanned, decimal Delta);

public record MonthlyCashflowPointDto(int Month, decimal IncomePlanned, decimal IncomeActual, decimal ExpensePlanned, decimal ExpenseActual);
/// <param name="CategoryId">Null when this series is the aggregated "other" bucket.</param>
public record CategoryMonthlySpendDto(Guid? CategoryId, string Category, IReadOnlyList<decimal> MonthlyActuals);
public record MonthlyCashflowReportDto(IReadOnlyList<MonthlyCashflowPointDto> Months, IReadOnlyList<CategoryMonthlySpendDto> ExpenseSeries);

public record PositionPlanActualMonthDto(int Month, decimal Planned, decimal Actual);
public record PositionPlanActualRowDto(
    Guid PositionId,
    string PositionName,
    Guid CategoryId,
    string CategoryName,
    bool IsIncome,
    int SortOrder,
    IReadOnlyList<PositionPlanActualMonthDto> Months,
    decimal YearPlanned,
    decimal YearActual);
public record PlanActualByPositionReportDto(IReadOnlyList<PositionPlanActualRowDto> Positions);

public record BaselineMemberDto(Guid UserId, string? DisplayName, BaselineAccessRole Role, DateTimeOffset CreatedAt);
public record BaselineInvitationDto(
    Guid Id,
    Guid BaselineId,
    string BaselineName,
    BaselineAccessRole Role,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? RevokedAt,
    DateTimeOffset? ConsumedAt,
    Guid? AcceptedByUserId,
    string? AcceptedByDisplayName);
public record CreateBaselineInvitationRequest(
    BaselineAccessRole Role,
    [property: Range(1, 365)] int? ExpiresInDays);
public record CreateBaselineInvitationResponse(Guid InvitationId, string Token, DateTimeOffset ExpiresAt);
public record UpdateBaselineMemberRequest(BaselineAccessRole Role);
public record AcceptInvitationRequest(
    [property: Required, StringLength(2048, MinimumLength = 8)] string Token);
public record AcceptInvitationResponse(Guid BaselineId, BaselineAccessKind MyAccess);
