using Microsoft.Extensions.Options;

namespace MyBudget.Api.Infrastructure.ActualAttachments;

public sealed class LocalFileActualAttachmentBlobStore(
    IOptions<ActualAttachmentOptions> options,
    IWebHostEnvironment environment) : IActualAttachmentBlobStore
{
    private readonly ActualAttachmentOptions _options = options.Value;

    private string ResolveRoot()
    {
        var root = _options.LocalRoot.Trim();
        if (string.IsNullOrEmpty(root))
        {
            root = "Data/actual-entry-attachments";
        }

        return Path.IsPathRooted(root) ? root : Path.Combine(environment.ContentRootPath, root);
    }

    private string PhysicalPath(string blobKey)
    {
        var root = ResolveRoot();
        var rootFull = Path.GetFullPath(root);
        var combined = Path.GetFullPath(Path.Combine(rootFull, blobKey));
        var rel = Path.GetRelativePath(rootFull, combined);
        if (rel == ".." || rel.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Invalid blob key.");
        }

        return combined;
    }

    public async Task UploadAsync(string blobKey, Stream content, string contentType, CancellationToken cancellationToken)
    {
        var path = PhysicalPath(blobKey);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true);
        await content.CopyToAsync(fs, cancellationToken);
    }

    public Task<Stream> OpenReadAsync(string blobKey, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        var path = PhysicalPath(blobKey);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Attachment not found.", path);
        }

        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous);
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string blobKey, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        var path = PhysicalPath(blobKey);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }
}
