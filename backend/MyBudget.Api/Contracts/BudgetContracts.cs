using MyBudget.Api.Domain.Enums;

namespace MyBudget.Api.Contracts;

public record CategoryDto(Guid Id, string Name, int SortOrder, string? Color, bool IsSystem, bool IsIncome);
public record CreateCategoryRequest(string Name, int SortOrder, string? Color, bool IsIncome = false);
public record UpdateCategoryRequest(string Name, int SortOrder, string? Color, bool? IsIncome);

public record BudgetBaselineDto(
    Guid Id,
    string Name,
    string Status,
    DateTimeOffset CreatedAt,
    Guid? ForkedFromBaselineId,
    Guid OwnerUserId,
    BaselineAccessKind MyAccess);
public record CreateBaselineRequest(string Name, string? Status);
public record UpdateBaselineRequest(string Name, string Status);
public record ForkBaselineRequest(string Name);

public record BudgetRecurrenceRuleDto(BudgetCadence Cadence, DateOnly StartDate, DateOnly? EndDate, decimal DefaultAmount);

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

public record CreatePositionRequest(
    Guid CategoryId,
    string Name,
    BudgetCadence Cadence,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal DefaultAmount,
    int SortOrder);

public record UpdatePositionRequest(
    Guid CategoryId,
    string Name,
    BudgetCadence Cadence,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal DefaultAmount,
    int SortOrder,
    BudgetPositionPlannedApplyScope? PlannedAmountsScope = null,
    DateOnly? PlannedAmountsApplyFrom = null,
    DateOnly? PlannedAmountsApplyTo = null);

public record PlannedAmountDto(Guid Id, Guid BudgetPositionId, int Year, int Month, decimal Amount, bool IsOverride);
public record PlannedAmountUpsertRequest(Guid BudgetPositionId, int Year, int Month, decimal Amount);
public record BatchUpsertPlannedAmountsRequest(IReadOnlyCollection<PlannedAmountUpsertRequest> Items);

public record ActualEntryDto(Guid Id, Guid BudgetPositionId, DateOnly BookedOn, decimal Amount, string? Note, string? ExternalRef);
public record CreateActualEntryRequest(Guid BudgetPositionId, DateOnly BookedOn, decimal Amount, string? Note, string? ExternalRef);
public record UpdateActualEntryRequest(DateOnly BookedOn, decimal Amount, string? Note, string? ExternalRef);

public record MonthlySummaryPoint(int Year, int Month, decimal Planned, decimal Actual);
public record YearlySummaryPoint(int Year, decimal Planned, decimal Actual);
public record CategorySummaryPoint(Guid CategoryId, string Category, decimal Planned, decimal Actual);
public record BaselineComparisonPoint(int Year, int Month, decimal BasePlanned, decimal ComparePlanned, decimal Delta);

public record MonthlyCashflowPointDto(int Month, decimal IncomePlanned, decimal IncomeActual, decimal ExpensePlanned, decimal ExpenseActual);
/// <param name="CategoryId">Null when this series is the aggregated "other" bucket.</param>
public record CategoryMonthlySpendDto(Guid? CategoryId, string Category, IReadOnlyList<decimal> MonthlyActuals);
public record MonthlyCashflowReportDto(IReadOnlyList<MonthlyCashflowPointDto> Months, IReadOnlyList<CategoryMonthlySpendDto> ExpenseSeries);

public record BaselineMemberDto(Guid UserId, BaselineAccessRole Role, DateTimeOffset CreatedAt);
public record BaselineInvitationDto(
    Guid Id,
    BaselineAccessRole Role,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? RevokedAt,
    DateTimeOffset? ConsumedAt,
    Guid? AcceptedByUserId);
public record CreateBaselineInvitationRequest(BaselineAccessRole Role, int? ExpiresInDays);
public record CreateBaselineInvitationResponse(Guid InvitationId, string Token, DateTimeOffset ExpiresAt);
public record UpdateBaselineMemberRequest(BaselineAccessRole Role);
public record AcceptInvitationRequest(string Token);
public record AcceptInvitationResponse(Guid BaselineId, BaselineAccessKind MyAccess);
