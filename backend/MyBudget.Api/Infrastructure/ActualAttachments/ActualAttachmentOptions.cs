namespace MyBudget.Api.Infrastructure.ActualAttachments;

public sealed class ActualAttachmentOptions
{
    public const string SectionName = "ActualAttachments";

    /// <summary>When set, files are stored in this Azure Blob Storage container (separate from the app database).</summary>
    public string? AzureConnectionString { get; set; }

    public string AzureContainerName { get; set; } = "actual-entry-attachments";

    /// <summary>Used when <see cref="AzureConnectionString"/> is empty. Relative paths are under the content root.</summary>
    public string LocalRoot { get; set; } = "Data/actual-entry-attachments";

    public long MaxBytes { get; set; } = 15 * 1024 * 1024;
}
