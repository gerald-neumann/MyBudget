using Azure.Storage.Blobs;
using Microsoft.Extensions.Options;

namespace MyBudget.Api.Infrastructure.ActualAttachments;

public sealed class AzureBlobActualAttachmentBlobStore(IOptions<ActualAttachmentOptions> options) : IActualAttachmentBlobStore
{
    private readonly BlobContainerClient _container = new BlobServiceClient(options.Value.AzureConnectionString)
        .GetBlobContainerClient(options.Value.AzureContainerName);

    public async Task UploadAsync(string blobKey, Stream content, string contentType, CancellationToken cancellationToken)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var blob = _container.GetBlobClient(blobKey);
        await blob.UploadAsync(content, new Azure.Storage.Blobs.Models.BlobHttpHeaders { ContentType = contentType }, cancellationToken: cancellationToken);
    }

    public async Task<Stream> OpenReadAsync(string blobKey, CancellationToken cancellationToken)
    {
        var blob = _container.GetBlobClient(blobKey);
        var ms = new MemoryStream();
        await blob.DownloadToAsync(ms, cancellationToken);
        ms.Position = 0;
        return ms;
    }

    public async Task DeleteAsync(string blobKey, CancellationToken cancellationToken)
    {
        var blob = _container.GetBlobClient(blobKey);
        await blob.DeleteIfExistsAsync(cancellationToken: cancellationToken);
    }
}
