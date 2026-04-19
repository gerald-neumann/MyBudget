using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("me")]
public class MeController(IHttpContextAccessor httpContextAccessor, IUserContext userContext) : ControllerBase
{
    [HttpGet]
    public ActionResult<MeResponse> Get()
    {
        var principal = httpContextAccessor.HttpContext?.User;
        var displayName =
            principal?.FindFirst(ClaimTypes.Name)?.Value
            ?? principal?.FindFirst("name")?.Value
            ?? principal?.FindFirst("preferred_username")?.Value
            ?? principal?.FindFirst(ClaimTypes.Email)?.Value
            ?? userContext.UserId.ToString();

        return Ok(new MeResponse(userContext.UserId, displayName));
    }
}

public sealed record MeResponse(Guid UserId, string DisplayName);
