using System.Security.Claims;

namespace MyBudget.Api.Infrastructure;

public interface IUserContext
{
    Guid UserId { get; }
}

public class HttpUserContext(IHttpContextAccessor httpContextAccessor) : IUserContext
{
    public Guid UserId
    {
        get
        {
            var principal = httpContextAccessor.HttpContext?.User;
            var claimValue = principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? principal?.FindFirstValue("sub")
                ?? principal?.FindFirstValue("user_id");

            return Guid.TryParse(claimValue, out var parsed)
                ? parsed
                : throw new InvalidOperationException("Could not resolve current user id.");
        }
    }
}
