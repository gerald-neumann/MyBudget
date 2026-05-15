namespace MyBudget.Api.Domain.Entities;

public class ActualEntry
{
    public Guid Id { get; set; }
    public Guid BudgetPositionId { get; set; }
    public Guid? AccountId { get; set; }
    public DateOnly BookedOn { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public string? ExternalRef { get; set; }
    /// <summary>Storage key in the configured blob/file backend (not the primary database).</summary>
    public string? AttachmentBlobKey { get; set; }
    public string? AttachmentOriginalFileName { get; set; }
    public string? AttachmentContentType { get; set; }

    public BudgetPosition BudgetPosition { get; set; } = default!;
    public Account? Account { get; set; }
}
