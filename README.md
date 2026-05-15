# MyBudget

This project contains:

- `backend/MyBudget.Api`: ASP.NET Core 8 Web API + EF Core on PostgreSQL (snake_case identifiers)
- `frontend/my-budget-ui`: MyBudget Angular UI (Tailwind + Chart.js, spreadsheet-like monthly planning)

## Local development

### Quick start scripts (PowerShell)

From project root:

- `.\db-start.ps1` starts local PostgreSQL via Docker
- `.\db-start.ps1 -ResetDevDatabase` recreates the `my_budget_dev` database (use after replacing EF migrations so `Migrate()` does not hit existing tables)
- `.\backend-start.ps1` starts the API (expects PostgreSQL per `ConnectionStrings:Database`)
- `.\backend-start.ps1 -EnsureDockerDb` (or **`-UseDockerDb`**) starts Docker PostgreSQL first, then starts the API
- `.\frontent-start.ps1` starts Angular dev server (installs deps automatically if needed)
- `.\db-stop.ps1` stops local PostgreSQL container

### Backend

1. `dotnet restore backend/MyBudget.Api/MyBudget.Api.csproj`
2. `dotnet run --project backend/MyBudget.Api/MyBudget.Api.csproj`

The API starts on `http://localhost:5256` in development.  
On startup it applies migrations and auto-seeds default categories for the configured dev user.

### Frontend

1. `cd frontend/my-budget-ui`
2. `npm install`
3. `npm start`

The app runs on `http://localhost:4200`.

## Auth modes (dev now, Keycloak later)

The backend uses one user abstraction (`IUserContext`) in both modes:

- **Dev mode (default)**: `Auth:Enabled = false`  
  `DevUserMiddleware` injects a local user from `Dev:UserId` in `appsettings.Development.json`.
- **JWT mode (Keycloak later)**: `Auth:Enabled = true`  
  ASP.NET JWT bearer validation is enabled and `IUserContext` resolves `sub` / name identifier claims.

### Keycloak switch-over

In `backend/MyBudget.Api/appsettings.json` (or environment variables), set:

- `Auth:Enabled=true`
- `Auth:Authority=<keycloak realm issuer URL>`
- `Auth:Audience=<api client id>`
- `Auth:RequireHttpsMetadata=true` (recommended outside local dev)

No controller logic needs to change when switching from dev mode to Keycloak mode.

### Deploying with Portainer (production)

End-to-end flow, DNS, TLS, Keycloak, and Portainer API examples: **`deploy/portainer/PORTAINER-FLOWPARITY-DEPLOY.md`**.

Short path from a dev PC:

1. **`deploy-my-budget.ps1`** (repo root) — full host pipeline by default: build, save tar, **scp**, SSH **`docker load`**, then Portainer stack update (endpoint **3**, **`-SkipCertificateCheck`**). Trim with **`-SkipRemoteDockerLoad`** / **`-SkipPortainerDeploy`**. Step timing averages live in **`.local/deploy-pipeline-timing.json`** (gitignored) and drive a console progress bar.
2. **`deploy/portainer/Deploy-PortainerMyBudgetStack.ps1`** — create or update the app stack via the Portainer HTTP API (compose + `deploy/portainer/.env`).
3. Keycloak stack: **`deploy/keycloak/docker-compose.yml`** and **`deploy/portainer/Deploy-PortainerKeycloakStack.ps1`** when you want the same API-driven deploy.

## Database

- Provider: **PostgreSQL only** (Npgsql).
- Naming: **snake_case** table and column names via `EFCore.NamingConventions`.
- Configure the connection string as **`ConnectionStrings:Database`** (see `appsettings*.json`). Override in production with `ConnectionStrings__Database`.
- On startup the API applies **EF Core migrations only** (`Database.Migrate()` via `DatabaseStartup`), which creates or updates tables.
- After authentication, **`IUserWorkspaceBootstrapper`** runs (via a global MVC action filter, with a short per-user memory cache) to create the signed-in user row, default categories and accounts, and the primary plus sample baselines — this is separate from migrations and does not run at startup without a user context.

## Docker DB

- Compose file: `docker-compose.yml`
- Service: `postgres` on `localhost:5432`
- Database: `my_budget_dev`
- User/Password: `postgres` / `postgres`
