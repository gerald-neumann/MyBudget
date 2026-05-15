using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;
using MyBudget.Api.Infrastructure.ActualAttachments;
using MyBudget.Api;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("actuals")]
public class ActualsController(
    BudgetDbContext dbContext,
    IUserContext userContext,
    IBaselineAccessService baselineAccessService,
    IActualAttachmentBlobStore attachmentBlobStore,
    IOptions<ActualAttachmentOptions> attachmentOptions) : ControllerBase
{
    private readonly ActualAttachmentOptions _attachmentOpts = attachmentOptions.Value;

    /// <summary>Paged actual entries with optional date range, text search (position, category, account, note), and amount predicates (&gt;, &lt;, etc.).</summary>
    [HttpGet]
    public async Task<ActionResult<ActualEntriesPageDto>> GetByBaseline(
        [FromQuery] Guid baselineId,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50,
        [FromQuery] DateOnly? bookedFrom = null,
        [FromQuery] DateOnly? bookedTo = null,
        [FromQuery] string[]? search = null,
        [FromQuery] string? amountFilter = null,
        [FromQuery] string? flowKind = null,
        [FromQuery] Guid? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanRead)
        {
            return Forbid();
        }

        if (skip < 0)
        {
            skip = 0;
        }

        if (take < 1)
        {
            take = 50;
        }

        if (take > 200)
        {
            take = 200;
        }

        IQueryable<ActualEntry> query = dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId);

        if (!string.IsNullOrWhiteSpace(flowKind))
        {
            if (string.Equals(flowKind, "income", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => x.BudgetPosition.Category.IsIncome);
            }
            else if (string.Equals(flowKind, "expense", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => !x.BudgetPosition.Category.IsIncome);
            }
        }

        if (categoryId is not null)
        {
            query = query.Where(x => x.BudgetPosition.CategoryId == categoryId);
        }

        if (bookedFrom is not null)
        {
            query = query.Where(x => x.BookedOn >= bookedFrom);
        }

        if (bookedTo is not null)
        {
            query = query.Where(x => x.BookedOn <= bookedTo);
        }

        if (search is { Length: > 0 })
        {
            foreach (var raw in search)
            {
                if (string.IsNullOrWhiteSpace(raw))
                {
                    continue;
                }

                var term = raw.Trim().ToLowerInvariant();
                var sampleKeysHit = LedgerSearchSampleLocalization.SampleKeysWithDisplayTextContaining(term);
                var categoryNamesHit = LedgerSearchSampleLocalization.CategoryStoredNamesWithDisplayTextContaining(term);
                query = query.Where(x =>
                    x.BudgetPosition.Name.ToLower().Contains(term)
                    || x.BudgetPosition.Category.Name.ToLower().Contains(term)
                    || (x.Account != null && x.Account.Name.ToLower().Contains(term))
                    || (x.Note != null && x.Note.ToLower().Contains(term))
                    || (sampleKeysHit.Count > 0 && sampleKeysHit.Contains(x.BudgetPosition.Name))
                    || (sampleKeysHit.Count > 0 && x.Note != null && sampleKeysHit.Contains(x.Note))
                    || (categoryNamesHit.Count > 0 && categoryNamesHit.Contains(x.BudgetPosition.Category.Name)));
            }
        }

        query = ActualAmountFilterParser.ApplyPredicates(query, amountFilter);

        var totalCount = await query.CountAsync(cancellationToken);

        var entries = await query
            .OrderByDescending(x => x.BookedOn)
            .ThenByDescending(x => x.Id)
            .Skip(skip)
            .Take(take)
            .Select(x => new ActualEntryDto(
                x.Id,
                x.BudgetPositionId,
                x.AccountId,
                x.Account != null ? x.Account.Name : null,
                x.BookedOn,
                x.Amount,
                x.Note,
                x.ExternalRef,
                x.AttachmentBlobKey != null,
                x.AttachmentOriginalFileName))
            .ToListAsync(cancellationToken);

        return Ok(new ActualEntriesPageDto(entries, totalCount));
    }

    /// <summary>Calendar years that have at least one actual booking for this baseline (newest first).</summary>
    [HttpGet("booking-years")]
    public async Task<ActionResult<ActualBookingYearsDto>> GetBookingYears(
        [FromQuery] Guid baselineId,
        [FromQuery] string? flowKind = null,
        [FromQuery] Guid? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        var access = await baselineAccessService.GetAccessAsync(baselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanRead)
        {
            return Forbid();
        }

        IQueryable<ActualEntry> query = dbContext.ActualEntries
            .Where(x => x.BudgetPosition.BaselineId == baselineId);

        if (!string.IsNullOrWhiteSpace(flowKind))
        {
            if (string.Equals(flowKind, "income", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => x.BudgetPosition.Category.IsIncome);
            }
            else if (string.Equals(flowKind, "expense", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => !x.BudgetPosition.Category.IsIncome);
            }
        }

        if (categoryId is not null)
        {
            query = query.Where(x => x.BudgetPosition.CategoryId == categoryId);
        }

        var years = await query
            .Select(x => x.BookedOn.Year)
            .Distinct()
            .OrderByDescending(y => y)
            .ToListAsync(cancellationToken);

        return Ok(new ActualBookingYearsDto(years));
    }

    [HttpPost]
    public async Task<ActionResult<ActualEntryDto>> Create(CreateActualEntryRequest request, CancellationToken cancellationToken)
    {
        var position = await dbContext.Positions
            .Where(x => x.Id == request.BudgetPositionId)
            .Select(x => new { x.Id, x.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (position is null)
        {
            return NotFound("Budget position not found.");
        }

        var access = await baselineAccessService.GetAccessAsync(position.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound("Budget position not found.");
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        var accountOk = await dbContext.Accounts.AnyAsync(
            x => x.Id == request.AccountId && x.BaselineId == position.BaselineId,
            cancellationToken);
        if (!accountOk)
        {
            return BadRequest("Account not found or does not belong to this household.");
        }

        var entry = new ActualEntry
        {
            Id = Guid.NewGuid(),
            BudgetPositionId = request.BudgetPositionId,
            AccountId = request.AccountId,
            BookedOn = request.BookedOn,
            Amount = request.Amount,
            Note = request.Note,
            ExternalRef = request.ExternalRef
        };

        dbContext.ActualEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);

        var accountName = await dbContext.Accounts
            .Where(x => x.Id == entry.AccountId)
            .Select(x => x.Name)
            .FirstAsync(cancellationToken);

        return Ok(ToDto(entry, accountName));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<ActualEntryDto>> Update(Guid id, UpdateActualEntryRequest request, CancellationToken cancellationToken)
    {
        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { Entry = x, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        var accountOk = await dbContext.Accounts.AnyAsync(
            x => x.Id == request.AccountId && x.BaselineId == entry.BaselineId,
            cancellationToken);
        if (!accountOk)
        {
            return BadRequest("Account not found or does not belong to this household.");
        }

        var positionOk = await dbContext.Positions.AnyAsync(
            x => x.Id == request.BudgetPositionId && x.BaselineId == entry.BaselineId,
            cancellationToken);
        if (!positionOk)
        {
            return BadRequest("Budget position not found in this baseline.");
        }

        entry.Entry.BudgetPositionId = request.BudgetPositionId;
        entry.Entry.AccountId = request.AccountId;
        entry.Entry.BookedOn = request.BookedOn;
        entry.Entry.Amount = request.Amount;
        entry.Entry.Note = request.Note;
        entry.Entry.ExternalRef = request.ExternalRef;
        await dbContext.SaveChangesAsync(cancellationToken);

        var accountName = await dbContext.Accounts
            .Where(x => x.Id == entry.Entry.AccountId)
            .Select(x => x.Name)
            .FirstAsync(cancellationToken);

        return Ok(ToDto(entry.Entry, accountName));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { Entry = x, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        if (!string.IsNullOrEmpty(entry.Entry.AttachmentBlobKey))
        {
            try
            {
                await attachmentBlobStore.DeleteAsync(entry.Entry.AttachmentBlobKey, cancellationToken);
            }
            catch (Exception ex)
            {
                // Best-effort cleanup; row removal should not be blocked by orphaned blob failures.
                var logger = HttpContext.RequestServices.GetRequiredService<ILogger<ActualsController>>();
                logger.LogWarning(ex, "Failed to delete attachment blob for actual entry {EntryId}", id);
            }
        }

        dbContext.ActualEntries.Remove(entry.Entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    /// <summary>Upload or replace a single receipt/invoice PDF or image (stored outside the primary database).</summary>
    [HttpPost("{id:guid}/attachment")]
    [RequestSizeLimit(22 * 1024 * 1024)]
    public async Task<ActionResult<ActualEntryDto>> UploadAttachment(
        Guid id,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest("Choose a non-empty file.");
        }

        if (file.Length > _attachmentOpts.MaxBytes)
        {
            return BadRequest($"File exceeds maximum size of {_attachmentOpts.MaxBytes} bytes.");
        }

        var declaredType = file.ContentType?.Trim();
        if (!ActualAttachmentContentRules.IsAllowedContentType(declaredType))
        {
            return BadRequest("Unsupported file type. Use PDF or a common image format (JPEG, PNG, WebP, GIF).");
        }

        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { Entry = x, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        var safeName = ActualAttachmentContentRules.SanitizeFileName(file.FileName);
        var ext = ResolveStorageExtension(safeName, declaredType!);
        var newKey = $"{id:D}/{Guid.NewGuid():N}{ext}";

        if (!string.IsNullOrEmpty(entry.Entry.AttachmentBlobKey))
        {
            try
            {
                await attachmentBlobStore.DeleteAsync(entry.Entry.AttachmentBlobKey, cancellationToken);
            }
            catch (Exception ex)
            {
                var logger = HttpContext.RequestServices.GetRequiredService<ILogger<ActualsController>>();
                logger.LogWarning(ex, "Failed to delete previous attachment blob for actual entry {EntryId}", id);
            }
        }

        await using (var stream = file.OpenReadStream())
        {
            await attachmentBlobStore.UploadAsync(newKey, stream, declaredType!, cancellationToken);
        }

        entry.Entry.AttachmentBlobKey = newKey;
        entry.Entry.AttachmentOriginalFileName = safeName;
        entry.Entry.AttachmentContentType = declaredType;
        await dbContext.SaveChangesAsync(cancellationToken);

        var accountName = await dbContext.Accounts
            .Where(x => x.Id == entry.Entry.AccountId)
            .Select(x => x.Name)
            .FirstAsync(cancellationToken);

        return Ok(ToDto(entry.Entry, accountName));
    }

    [HttpGet("{id:guid}/attachment")]
    public async Task<IActionResult> DownloadAttachment(Guid id, CancellationToken cancellationToken)
    {
        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { x.AttachmentBlobKey, x.AttachmentOriginalFileName, x.AttachmentContentType, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanRead)
        {
            return Forbid();
        }

        if (string.IsNullOrEmpty(entry.AttachmentBlobKey))
        {
            return NotFound();
        }

        var stream = await attachmentBlobStore.OpenReadAsync(entry.AttachmentBlobKey, cancellationToken);
        var downloadName = ActualAttachmentContentRules.SanitizeFileName(entry.AttachmentOriginalFileName);
        var contentType = string.IsNullOrWhiteSpace(entry.AttachmentContentType)
            ? "application/octet-stream"
            : entry.AttachmentContentType!;
        return File(stream, contentType, downloadName);
    }

    [HttpDelete("{id:guid}/attachment")]
    public async Task<ActionResult<ActualEntryDto>> DeleteAttachment(Guid id, CancellationToken cancellationToken)
    {
        var entry = await dbContext.ActualEntries
            .Where(x => x.Id == id)
            .Select(x => new { Entry = x, x.BudgetPosition.BaselineId })
            .FirstOrDefaultAsync(cancellationToken);
        if (entry is null)
        {
            return NotFound();
        }

        var access = await baselineAccessService.GetAccessAsync(entry.BaselineId, userContext.UserId, cancellationToken);
        if (access is null)
        {
            return NotFound();
        }
        if (!access.CanManageBudget)
        {
            return Forbid();
        }

        if (!string.IsNullOrEmpty(entry.Entry.AttachmentBlobKey))
        {
            try
            {
                await attachmentBlobStore.DeleteAsync(entry.Entry.AttachmentBlobKey, cancellationToken);
            }
            catch (Exception ex)
            {
                var logger = HttpContext.RequestServices.GetRequiredService<ILogger<ActualsController>>();
                logger.LogWarning(ex, "Failed to delete attachment blob for actual entry {EntryId}", id);
            }
        }

        entry.Entry.AttachmentBlobKey = null;
        entry.Entry.AttachmentOriginalFileName = null;
        entry.Entry.AttachmentContentType = null;
        await dbContext.SaveChangesAsync(cancellationToken);

        var accountName = await dbContext.Accounts
            .Where(x => x.Id == entry.Entry.AccountId)
            .Select(x => x.Name)
            .FirstAsync(cancellationToken);

        return Ok(ToDto(entry.Entry, accountName));
    }

    private static ActualEntryDto ToDto(ActualEntry entry, string accountName) =>
        new(
            entry.Id,
            entry.BudgetPositionId,
            entry.AccountId,
            accountName,
            entry.BookedOn,
            entry.Amount,
            entry.Note,
            entry.ExternalRef,
            entry.AttachmentBlobKey is not null,
            entry.AttachmentOriginalFileName);

    private static string ResolveStorageExtension(string sanitizedFileName, string contentType)
    {
        var ext = Path.GetExtension(sanitizedFileName).ToLowerInvariant();
        if (ext is ".pdf" or ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif")
        {
            return ext == ".jpeg" ? ".jpg" : ext;
        }

        return contentType switch
        {
            "application/pdf" => ".pdf",
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            _ => ".bin"
        };
    }
}
