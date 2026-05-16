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
    private const string DefaultDownloadContentType = "application/octet-stream";

    public static bool IsAllowedContentType(string? contentType)
    {
        return TryNormalizeAllowedContentType(contentType, out _);
    }

    public static bool TryNormalizeAllowedContentType(string? contentType, out string normalizedContentType)
    {
        normalizedContentType = string.Empty;
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return false;
        }

        var candidate = contentType.Split(';', 2, StringSplitOptions.TrimEntries)[0].Trim();
        if (!AllowedContentTypes.Contains(candidate))
        {
            return false;
        }

        normalizedContentType = candidate.ToLowerInvariant();
        return true;
    }

    public static async Task<bool> HasValidFileSignatureAsync(
        Stream stream,
        string normalizedContentType,
        CancellationToken cancellationToken)
    {
        if (!stream.CanRead)
        {
            return false;
        }

        var buffer = new byte[16];
        long originalPosition = 0;
        if (stream.CanSeek)
        {
            originalPosition = stream.Position;
            stream.Seek(0, SeekOrigin.Begin);
        }

        try
        {
            var read = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
            return normalizedContentType switch
            {
                "application/pdf" => read >= 5
                                     && buffer[0] == 0x25
                                     && buffer[1] == 0x50
                                     && buffer[2] == 0x44
                                     && buffer[3] == 0x46
                                     && buffer[4] == 0x2D,
                "image/jpeg" => read >= 3
                                && buffer[0] == 0xFF
                                && buffer[1] == 0xD8
                                && buffer[2] == 0xFF,
                "image/png" => read >= 8
                               && buffer[0] == 0x89
                               && buffer[1] == 0x50
                               && buffer[2] == 0x4E
                               && buffer[3] == 0x47
                               && buffer[4] == 0x0D
                               && buffer[5] == 0x0A
                               && buffer[6] == 0x1A
                               && buffer[7] == 0x0A,
                "image/webp" => read >= 12
                                && buffer[0] == 0x52
                                && buffer[1] == 0x49
                                && buffer[2] == 0x46
                                && buffer[3] == 0x46
                                && buffer[8] == 0x57
                                && buffer[9] == 0x45
                                && buffer[10] == 0x42
                                && buffer[11] == 0x50,
                "image/gif" => read >= 6
                               && buffer[0] == 0x47
                               && buffer[1] == 0x49
                               && buffer[2] == 0x46
                               && buffer[3] == 0x38
                               && (buffer[4] == 0x37 || buffer[4] == 0x39)
                               && buffer[5] == 0x61,
                _ => false
            };
        }
        finally
        {
            if (stream.CanSeek)
            {
                stream.Seek(originalPosition, SeekOrigin.Begin);
            }
        }
    }

    public static string ResolveDownloadContentType(string? storedContentType, string? fileName)
    {
        if (TryNormalizeAllowedContentType(storedContentType, out var normalized))
        {
            return normalized;
        }

        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => "application/pdf",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => DefaultDownloadContentType
        };
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
