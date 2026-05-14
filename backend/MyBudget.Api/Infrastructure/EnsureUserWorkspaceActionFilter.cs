using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Filters;

namespace MyBudget.Api.Infrastructure;

/// <summary>
/// After authentication, ensures the current user has a persisted workspace (user row, defaults, demo baselines).
/// Runs before controller actions so handlers do not call seeding explicitly.
/// </summary>
public sealed class EnsureUserWorkspaceActionFilter(IUserWorkspaceBootstrapper workspaceBootstrapper) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (context.HttpContext.User?.Identity?.IsAuthenticated != true)
        {
            await next();
            return;
        }

        if (context.ActionDescriptor.EndpointMetadata.OfType<IAllowAnonymous>().Any())
        {
            await next();
            return;
        }

        await workspaceBootstrapper.EnsureWorkspaceAsync(context.HttpContext.RequestAborted);
        await next();
    }
}
