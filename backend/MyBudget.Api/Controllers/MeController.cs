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

    [HttpGet]
    public async Task<ActionResult<MeResponse>> Get(CancellationToken cancellationToken)
    {
        var colorScheme = await dbContext.Users
            .Where(x => x.Id == userContext.UserId)
            .Select(x => x.ColorScheme)
            .FirstOrDefaultAsync(cancellationToken);

        return Ok(new MeResponse(userContext.UserId, ResolveDisplayName(), colorScheme));
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

        var user = await dbContext.Users.FirstOrDefaultAsync(x => x.Id == userContext.UserId, cancellationToken);
        if (user is null)
        {
            return NotFound();
        }

        user.ColorScheme = normalizedColorScheme;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new MeResponse(userContext.UserId, ResolveDisplayName(), user.ColorScheme));
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
}

public sealed record MeResponse(Guid UserId, string DisplayName, string? ColorScheme);

public sealed record UpdateMePreferencesRequest(string? ColorScheme);
