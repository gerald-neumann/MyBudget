# MyBudget

This project contains:

- `backend/MyBudget.Api`: ASP.NET Core 8 Web API + EF Core on PostgreSQL (snake_case identifiers)
- `frontend/my-budget-ui`: MyBudget Angular UI (Tailwind + Chart.js, spreadsheet-like monthly planning)

## Local development

### Quick start scripts (PowerShell)

From project root:

- `.\db-start.ps1` starts local PostgreSQL via Docker
- `.\backend-start.ps1` starts the API (expects PostgreSQL per `ConnectionStrings:Database`)
- `.\backend-start.ps1 -EnsureDockerDb` starts Docker PostgreSQL first, then starts the API
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

### Deploying on Synology (Container Manager)

- **Keycloak only (Portainer API or compose):** `deploy/SYNOLOGY-KEYCLOAK.md` and `Deploy-MyBudgetKeycloak.ps1` / `Sync-KeycloakToSynology.ps1`.
- **API + UI + Keycloak over SSH compose:** `deploy/synology/docker-compose.yml` and `Deploy-SynologyStack.ps1` (see the same doc, section “Option D”).
- **Build API/UI on your PC, only images + compose on the NAS:** `docker-compose.images.yml`, `Deploy-SynologyPrebuiltFromLocal.ps1` (see `deploy/SYNOLOGY-KEYCLOAK.md`, section “Option E”).

## Database

- Provider: **PostgreSQL only** (Npgsql).
- Naming: **snake_case** table and column names via `EFCore.NamingConventions`.
- Configure the connection string as **`ConnectionStrings:Database`** (see `appsettings*.json`). Override in production with `ConnectionStrings__Database`.
- On startup the API runs **`Database.Migrate()`** against that database.

## Docker DB

- Compose file: `docker-compose.yml`
- Service: `postgres` on `localhost:5432`
- Database: `my_budget_dev`
- User/Password: `postgres` / `postgres`
