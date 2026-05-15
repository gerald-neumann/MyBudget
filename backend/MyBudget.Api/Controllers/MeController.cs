using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("me")]
public class MeController(
    IHttpContextAccessor httpContextAccessor,
    IUserContext userContext,
    BudgetDbContext dbContext) : ControllerBase
{
    private static readonly HashSet<string> AllowedColorSchemes = ["default", "linen", "denim", "rose", "evergreen"];
    private static readonly HashSet<string> AllowedUiDensities = ["condensed"];

    [HttpGet]
    public async Task<ActionResult<MeResponse>> Get(CancellationToken cancellationToken)
    {
        var prefs = await dbContext.Users
            .Where(x => x.Id == userContext.UserId)
            .Select(x => new { x.ColorScheme, x.UiDensity })
            .FirstOrDefaultAsync(cancellationToken);

        return Ok(new MeResponse(userContext.UserId, ResolveDisplayName(), prefs?.ColorScheme, prefs?.UiDensity));
    }

    [HttpPatch("preferences")]
    public async Task<ActionResult<MeResponse>> UpdatePreferences(
        UpdateMePreferencesRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedColorScheme = NormalizeColorScheme(request.ColorScheme);
        if (normalizedColorScheme is not null && !AllowedColorSchemes.Contains(normalizedColorScheme))
        {
            ModelState.AddModelError(
                nameof(request.ColorScheme),
                $"Unsupported color scheme '{request.ColorScheme}'.");
            return ValidationProblem(ModelState);
        }

        var normalizedUiDensity = NormalizeUiDensity(request.UiDensity);
        if (normalizedUiDensity is not null && !AllowedUiDensities.Contains(normalizedUiDensity))
        {
            ModelState.AddModelError(
                nameof(request.UiDensity),
                $"Unsupported UI density '{request.UiDensity}'.");
            return ValidationProblem(ModelState);
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(x => x.Id == userContext.UserId, cancellationToken);
        if (user is null)
        {
            return NotFound();
        }

        user.ColorScheme = normalizedColorScheme;
        user.UiDensity = normalizedUiDensity;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new MeResponse(userContext.UserId, ResolveDisplayName(), user.ColorScheme, user.UiDensity));
    }

    private string ResolveDisplayName()
    {
        var principal = httpContextAccessor.HttpContext?.User;
        return principal?.FindFirst(ClaimTypes.Name)?.Value
            ?? principal?.FindFirst("name")?.Value
            ?? principal?.FindFirst("preferred_username")?.Value
            ?? principal?.FindFirst(ClaimTypes.Email)?.Value
            ?? userContext.UserId.ToString();
    }

    private static string? NormalizeColorScheme(string? colorScheme)
    {
        if (string.IsNullOrWhiteSpace(colorScheme))
        {
            return null;
        }

        return colorScheme.Trim().ToLowerInvariant();
    }

    private static string? NormalizeUiDensity(string? uiDensity)
    {
        if (string.IsNullOrWhiteSpace(uiDensity))
        {
            return null;
        }

        return uiDensity.Trim().ToLowerInvariant();
    }
}

public sealed record MeResponse(Guid UserId, string DisplayName, string? ColorScheme, string? UiDensity);

public sealed record UpdateMePreferencesRequest(string? ColorScheme, string? UiDensity);
