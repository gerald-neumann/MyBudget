namespace MyBudget.Api.Infrastructure.ActualAttachments;

public interface IActualAttachmentBlobStore
{
    Task UploadAsync(string blobKey, Stream content, string contentType, CancellationToken cancellationToken);

    Task<Stream> OpenReadAsync(string blobKey, CancellationToken cancellationToken);

    Task DeleteAsync(string blobKey, CancellationToken cancellationToken);
}
