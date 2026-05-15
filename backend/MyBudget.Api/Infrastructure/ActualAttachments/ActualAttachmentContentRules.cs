namespace MyBudget.Api.Infrastructure.ActualAttachments;

public static class ActualAttachmentContentRules
{
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    };

    public static bool IsAllowedContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return false;
        }

        return AllowedContentTypes.Contains(contentType.Trim());
    }

    public static string SanitizeFileName(string? originalName)
    {
        if (string.IsNullOrWhiteSpace(originalName))
        {
            return "attachment";
        }

        var name = Path.GetFileName(originalName.Trim());
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(c, '_');
        }

        if (name.Length > 200)
        {
            name = name[..200];
        }

        return string.IsNullOrWhiteSpace(name) ? "attachment" : name;
    }
}
