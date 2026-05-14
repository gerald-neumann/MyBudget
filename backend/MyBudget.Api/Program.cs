using System.Reflection;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
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
string? jwtStartupAuthority = null;
string? jwtStartupMetadataAddress = null;
IReadOnlyList<string>? jwtStartupValidIssuers = null;
if (authEnabled)
{
    var authSection = builder.Configuration.GetSection("Auth");
    var rawAuthority = authSection["Authority"];
    var rawMetadata = authSection["MetadataAddress"];
    var configuredAuthority = string.IsNullOrWhiteSpace(rawAuthority) ? null : rawAuthority.TrimEnd('/');
    var configuredMetadata = string.IsNullOrWhiteSpace(rawMetadata) ? null : rawMetadata.Trim();

    if (configuredAuthority is null && configuredMetadata is null)
    {
        throw new InvalidOperationException(
            "When Auth:Enabled is true, set Auth:Authority and/or Auth:MetadataAddress.");
    }

    var authority = configuredAuthority
        ?? configuredMetadata!.Replace("/.well-known/openid-configuration", "", StringComparison.OrdinalIgnoreCase)
            .TrimEnd('/');

    var metadataAddress = configuredMetadata
        ?? $"{authority}/.well-known/openid-configuration";

    if (string.IsNullOrWhiteSpace(authority) || string.IsNullOrWhiteSpace(metadataAddress))
    {
        throw new InvalidOperationException(
            "Auth:Authority and Auth:MetadataAddress could not be resolved; check your configuration.");
    }

    var validIssuers = new List<string>();
    for (var i = 0; i < 10; i++)
    {
        var issuer = authSection[$"ValidIssuers:{i}"]?.Trim();
        if (!string.IsNullOrWhiteSpace(issuer))
            validIssuers.Add(issuer);
    }

    if (validIssuers.Count == 0)
        validIssuers.Add(authority);

    var audience = authSection["Audience"] ?? "my-budget-api";
    var validateAudience = authSection.GetValue("ValidateAudience", true);
    var requireHttpsMetadata = authSection.GetValue<bool?>("RequireHttpsMetadata") ?? false;
    var throwOnTokenValidationFailure =
        authSection.GetValue("ThrowOnTokenValidationFailure", false);

    jwtStartupAuthority = authority;
    jwtStartupMetadataAddress = metadataAddress;
    jwtStartupValidIssuers = validIssuers;

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
            options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                metadataAddress,
                new OpenIdConnectConfigurationRetriever(),
                new HttpDocumentRetriever { RequireHttps = requireHttpsMetadata })
            {
                RefreshInterval = options.RefreshInterval,
                AutomaticRefreshInterval = options.AutomaticRefreshInterval
            };
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = validIssuers.ToArray(),
                ValidateAudience = validateAudience,
                ValidAudiences = new[] { audience, "account" },
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.Zero
            };
            options.Events = new JwtBearerEvents
            {
                OnAuthenticationFailed = context =>
                {
                    var logger = context.HttpContext.RequestServices
                        .GetRequiredService<ILoggerFactory>()
                        .CreateLogger("MyBudget.Api.Auth.JwtBearer");
                    if (context.Exception is SecurityTokenSignatureKeyNotFoundException)
                    {
                        // Typical causes: Keycloak key rotation, wrong issuer path, or stale JWKS cache.
                        // Request a metadata refresh so the next request can validate against fresh signing keys.
                        context.Options.ConfigurationManager?.RequestRefresh();
                        var authz = context.Request.Headers.Authorization.ToString();
                        var bearer = authz.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                            ? authz[7..].Trim()
                            : string.Empty;
                        if (!string.IsNullOrWhiteSpace(bearer))
                        {
                            try
                            {
                                var jwt = new JwtSecurityTokenHandler().ReadJwtToken(bearer);
                                var kid = jwt.Header.Kid;
                                var iss = jwt.Issuer;
                                var aud = string.Join(", ", jwt.Audiences);
                                logger.LogWarning(
                                    "JWT signature key not found. Forced OIDC config refresh. TokenKid={TokenKid} TokenIss={TokenIss} TokenAud={TokenAud} MetadataAddress={MetadataAddress}",
                                    kid,
                                    iss,
                                    aud,
                                    metadataAddress);
                            }
                            catch (Exception parseEx)
                            {
                                logger.LogWarning(
                                    parseEx,
                                    "JWT signature key not found and token parsing for diagnostics failed. MetadataAddress={MetadataAddress}",
                                    metadataAddress);
                            }
                        }
                    }
                    logger.LogError(
                        context.Exception,
                        "JWT Bearer authentication failed. Path={Path} Method={Method} Authority={Authority} MetadataAddress={MetadataAddress} Audience={Audience}",
                        context.Request.Path,
                        context.Request.Method,
                        authority,
                        metadataAddress,
                        audience);
                    if (throwOnTokenValidationFailure)
                    {
                        throw new InvalidOperationException(
                            "JWT validation failed while Auth:ThrowOnTokenValidationFailure is true. "
                            + "Disable this flag after debugging. See inner exception and logs above.",
                            context.Exception);
                    }

                    return Task.CompletedTask;
                }
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

if (jwtStartupAuthority is not null && jwtStartupMetadataAddress is not null && jwtStartupValidIssuers is not null)
{
    app.Logger.LogInformation(
        "JWT Bearer: Authority={Authority}, MetadataAddress={MetadataAddress}, ValidIssuers={ValidIssuers}",
        jwtStartupAuthority,
        jwtStartupMetadataAddress,
        string.Join(", ", jwtStartupValidIssuers));
}
if (authEnabled)
{
    var startupLogger = app.Services
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("MyBudget.Api.Auth.Startup");
    var jwtOptions = app.Services
        .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
        .Get(JwtBearerDefaults.AuthenticationScheme);
    if (jwtOptions.ConfigurationManager is null)
    {
        startupLogger.LogError("JWT startup preflight: ConfigurationManager is null.");
    }
    else
    {
        try
        {
            var oidcConfig = await jwtOptions.ConfigurationManager.GetConfigurationAsync(default) as OpenIdConnectConfiguration;
            if (oidcConfig is null)
            {
                startupLogger.LogError(
                    "JWT startup preflight: configuration loaded but is not OpenIdConnectConfiguration. Type={Type}",
                    jwtOptions.ConfigurationManager.GetType().FullName);
            }
            else
            {
                startupLogger.LogInformation(
                    "JWT startup preflight: metadata loaded. Issuer={Issuer}, JwksUri={JwksUri}, SigningKeys={SigningKeys}",
                    oidcConfig.Issuer,
                    oidcConfig.JwksUri,
                    oidcConfig.SigningKeys.Count);
                if (oidcConfig.SigningKeys.Count == 0)
                {
                    startupLogger.LogError(
                        "JWT startup preflight: metadata loaded but no signing keys were discovered. MetadataAddress={MetadataAddress}",
                        jwtOptions.MetadataAddress);
                }
            }
        }
        catch (Exception ex)
        {
            startupLogger.LogError(
                ex,
                "JWT startup preflight failed to load OIDC metadata/JWKS. MetadataAddress={MetadataAddress}",
                jwtOptions.MetadataAddress);
        }
    }
}

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
