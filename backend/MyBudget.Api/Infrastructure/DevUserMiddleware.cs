using System.Security.Claims;

namespace MyBudget.Api.Infrastructure;

public class DevUserMiddleware(RequestDelegate next, IConfiguration configuration)
{
    private readonly Guid _devUserId = configuration.GetValue<Guid?>("Dev:UserId") ?? Guid.Parse("8d7d0d59-8fb7-4721-80d8-5df99ba9a987");
    private readonly string _displayName = configuration.GetValue<string>("Dev:DisplayName") ?? "Local User";

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, _devUserId.ToString()),
                new(ClaimTypes.Name, _displayName),
                new("sub", _devUserId.ToString())
            };
            var identity = new ClaimsIdentity(claims, authenticationType: "DevMode");
            context.User = new ClaimsPrincipal(identity);
        }

        await next(context);
    }
}
