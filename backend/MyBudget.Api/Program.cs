using System.Net.Http;
using System.Reflection;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MyBudget.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMemoryCache();
builder.Services.AddScoped<EnsureUserWorkspaceActionFilter>();
builder.Services.AddControllers(options => { options.Filters.AddService<EnsureUserWorkspaceActionFilter>(); })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.OpenApiInfo { Title = "MyBudget API", Version = "v1" });
});
builder.Services.AddHttpContextAccessor();

var connectionString = builder.Configuration.GetConnectionString("Database");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Connection string 'Database' is missing. Set ConnectionStrings:Database in configuration or environment.");
}

builder.Services.AddDbContext<BudgetDbContext>(options =>
{
    options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention();
});

builder.Services.AddScoped<IUserContext, HttpUserContext>();
builder.Services.AddScoped<IPlanningMaterializationService, PlanningMaterializationService>();
builder.Services.AddScoped<IUserWorkspaceBootstrapper, UserWorkspaceBootstrapper>();
builder.Services.AddScoped<IBaselineAccessService, BaselineAccessService>();
builder.Services.AddSingleton<IInvitationTokenCodec, InvitationTokenCodec>();

var authEnabled = builder.Configuration.GetValue<bool>("Auth:Enabled");
if (!builder.Environment.IsDevelopment() && !authEnabled)
{
    throw new InvalidOperationException(
        "Auth:Enabled must be true when ASPNETCORE_ENVIRONMENT is not Development. "
        + "The API does not allow anonymous access in deployed environments.");
}

// Local-only: pretend a fixed user when Keycloak is off. Never use this outside Development.
var useDevUserFallback = builder.Environment.IsDevelopment() && !authEnabled;
if (authEnabled)
{
    var authority = builder.Configuration["Auth:Authority"]?.TrimEnd('/') ?? string.Empty;
    var audience = builder.Configuration["Auth:Audience"] ?? "my-budget-api";
    var metadataAddress = $"{authority}/.well-known/openid-configuration";
    var validateAudience = builder.Configuration.GetValue("Auth:ValidateAudience", true);
    var requireHttpsMetadata = builder.Configuration.GetValue<bool?>("Auth:RequireHttpsMetadata") ?? false;

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            // ReSpecT-style Keycloak OIDC: explicit metadata + validation parameters (avoid mixing options.Audience with ValidAudiences).
            options.Authority = authority;
            options.MetadataAddress = metadataAddress;
            options.RequireHttpsMetadata = requireHttpsMetadata;
            options.RefreshOnIssuerKeyNotFound = true;
            options.RefreshInterval = TimeSpan.FromMinutes(5);
            options.Backchannel = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = new[] { authority },
                ValidateAudience = validateAudience,
                ValidAudiences = new[] { audience, "account" },
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.Zero
            };
        });
}
else
{
    builder.Services.AddAuthentication();
}

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        // Support comma/semicolon-separated origins so dev can allow both http://localhost:4200 and https://localhost:4200.
        var configuredOrigins = builder.Configuration.GetValue<string>("FrontendOrigin");
        var origins = (configuredOrigins ?? "http://localhost:4200;https://localhost:4200")
            .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        policy.WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// When served under a path prefix (e.g. reverse proxy: https://host/api/... → this app), set PublicPathBase=/api
var publicPathBase = app.Configuration["PublicPathBase"]?.TrimEnd('/');
if (!string.IsNullOrWhiteSpace(publicPathBase))
{
    app.UsePathBase(publicPathBase);
}

// Swagger is on by default in Development; in deployed environments enable it explicitly via ENABLE_SWAGGER=true.
var enableSwagger = app.Environment.IsDevelopment()
    || app.Configuration.GetValue<bool>("EnableSwagger")
    || string.Equals(
        Environment.GetEnvironmentVariable("ENABLE_SWAGGER"),
        "true",
        StringComparison.OrdinalIgnoreCase);

if (enableSwagger)
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

DatabaseStartup.ApplyEfMigrations(app);

app.UseCors("frontend");
// HTTP-only local API (e.g. http://localhost:5256): HTTPS redirection has no port → warning 3 from HttpsRedirectionMiddleware.
var disableHttpsRedirect =
    string.Equals(Environment.GetEnvironmentVariable("DISABLE_HTTPS_REDIRECT"), "true", StringComparison.OrdinalIgnoreCase)
    || app.Environment.IsDevelopment();
if (!disableHttpsRedirect)
{
    app.UseHttpsRedirection();
}
app.UseAuthentication();
if (useDevUserFallback)
{
    app.UseMiddleware<DevUserMiddleware>();
}
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapGet(
        "/build-info",
        () =>
        {
            var asm = typeof(Program).Assembly;
            var version =
                asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                ?? asm.GetName().Version?.ToString()
                ?? "unknown";
            var buildTimestampUtc = asm
                .GetCustomAttributes<AssemblyMetadataAttribute>()
                .FirstOrDefault(a => string.Equals(a.Key, "BuildTimestampUtc", StringComparison.Ordinal))
                ?.Value;
            return Results.Json(new { version, buildTimestampUtc });
        })
    .AllowAnonymous();

app.Run();

public partial class Program;
