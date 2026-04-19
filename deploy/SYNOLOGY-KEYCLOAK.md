# Synology: Keycloak and MyBudget stack

This guide matches the MyBudget backend contract documented in the root `README.md`:

- Realm name: `**my-budget**`
- API JWT audience (`Auth:Audience`): `**my-budget-api**`
- Issuer (`Auth:Authority`): `**https://<your-keycloak-host>/realms/my-budget**`

The Angular app does not yet implement browser login against Keycloak. When you add OIDC to the UI, you will use the same issuer URL and a **public** client (for example `my-budget-ui`) with redirect URIs for your web origin.

---

## 1. Prerequisites on the DiskStation

1. **Container Manager** (Docker) enabled.
2. **Portainer** (optional). The PowerShell scripts support **Portainer’s HTTP API** for Keycloak-only stacks, or **plain `docker compose` over SSH**, which is what **Container Manager** uses under the hood.
3. A **DNS name** for Keycloak on your LAN or the public internet (example: `auth.mybudget.home` or `auth.mybudget.example.com`).
4. **TLS** in front of Keycloak. On Synology this is usually **Login Portal → Advanced → Reverse Proxy**:
  - Source: `https://auth.<your-domain>` (hostname + certificate).
  - Destination: `http://127.0.0.1:<KEYCLOAK_HTTP_PORT>` (the host port you publish from the stack, default `8080` unless you change it).
  - Enable **WebSocket** support if the Portainer or Keycloak UI ever needs it (Keycloak admin console is mostly HTTP; enabling it does not hurt).

Keep the **public URL** you use in the browser exactly aligned with `KEYCLOAK_HOSTNAME` in `deploy/keycloak/.env` (including `https://`).

---

## 2. One-time Portainer API access

1. In Portainer: **Account settings → Access tokens** (or **API keys**, depending on version).
2. Create a token and store it securely. The deployment script sends it as `Authorization: Bearer <token>`.

Find your **environment (endpoint) ID**:

- Portainer **Home → Environments** and open your local Docker environment; the ID often appears in the URL, or run:

```powershell
pwsh ./deploy/synology/Deploy-PortainerKeycloakStack.ps1 -PortainerBaseUrl "https://diskstation:9443" `
  -AccessToken "<token>" -SkipCertificateCheck -ListEndpointsOnly
```

---

## 3. Prepare secrets and hostname (Windows)

From the repository root:

```powershell
pwsh ./deploy/synology/New-KeycloakDeploymentPackage.ps1
```

This copies `deploy/keycloak/env.example` to `deploy/keycloak/.env` (if missing) and prompts for passwords and public hostname.

---

## 4. Deploy the stack

### Option A — Fully automated (Portainer API)

```powershell
pwsh ./deploy/synology/Deploy-MyBudgetKeycloak.ps1 -PortainerBaseUrl "https://diskstation:9443" `
  -AccessToken "<token>" -EndpointId 2 -SkipCertificateCheck
```

Creates the stack on first run; **updates** the same stack on later runs if the name already exists.

### Option B — Copy files to the NAS, then use Portainer UI

```powershell
pwsh ./deploy/synology/Sync-KeycloakToSynology.ps1 -SshUser "you" -SshHost "diskstation.local" `
  -RemoteDirectory "/volume1/docker/mybudget-keycloak"
```

On the NAS, in Portainer: **Stacks → Add stack → Web editor**, paste `docker-compose.yml`, add the environment variables from `.env`, then deploy.

### Option C — Docker Compose on the NAS over SSH

After sync, SSH in and run `docker compose up -d` in the remote directory (same as any Linux host). This is the path **Container Manager** follows when you use **Compose** from the UI or the same commands on the shell.

### Option D — Full stack (API + Angular UI + Keycloak) without Portainer

Use `deploy/synology/docker-compose.yml` with the helpers:

1. `pwsh ./deploy/synology/New-SynologyDeploymentPackage.ps1` — writes `deploy/synology/.env` and `ui-config.json`.
2. `pwsh ./deploy/synology/Deploy-SynologyStack.ps1 -SshUser ... -SshHost ... -RemoteDirectory ... -Build`

`-RemoteDirectory` must be the folder on the NAS that contains `docker-compose.yml` **and** be `deploy/synology` **inside a full clone of this repository**, because compose **build** uses `context: ../..` (repository root). Example:

`/volume1/repos/private-budget-planner/deploy/synology`

### Option E — Pre-built API/UI images from your PC (nothing from the repo on the NAS except compose + env)

1. On your PC: `pwsh ./deploy/synology/Build-MyBudgetDockerImages.ps1` then `Export-MyBudgetDockerImages.ps1` (or run `Deploy-SynologyPrebuiltFromLocal.ps1`, which also loads the tar on the NAS and deploys).
2. On the NAS you only need a folder with **`docker-compose.yml`** (from `docker-compose.images.yml`), **`.env`**, **`ui-config.json`**, and the **`MyBudget-app-images.tar`** until after `docker load`.
3. `.env` must include `MYBUDGET_API_IMAGE` and `MYBUDGET_UI_IMAGE` (defaults `mybudget-api:local` / `mybudget-ui:local` match the build scripts).

If you only copy the three files (`docker-compose.yml`, `.env`, `ui-config.json`) to an empty folder, **build will fail** unless you either:

- use **`docker-compose.bundled.yml`**: create a `bundle/` folder next to it with `bundle/backend/MyBudget.Api/` and `bundle/frontend/my-budget-ui/` (same layout as the repo root, without `.git` — File Station or a zip is fine), then run `docker compose -f docker-compose.bundled.yml up -d --build`, or copy that file as `docker-compose.yml` on the NAS; or  
- use a **git clone on the NAS** (or sync the whole repo) with the original `docker-compose.yml`; or  
- change the compose file to use pre-built `image:` tags from your registry and run `docker compose pull` instead of `--build`.

---

## 5. Keycloak realm and clients (admin console)

After the container is healthy:

1. Open `https://<your-keycloak-host>/` and sign in with the admin user from `.env`.
2. **Create realm** named `**my-budget`** (slug must match `Auth:Authority` path segment).

### 5.1 API resource client (matches `Auth:Audience`)

1. **Clients → Create client**
  - **Client ID**: `my-budget-api`
  - **Client authentication**: On (confidential)
  - **Service accounts roles**: optional; not required for validating SPA-issued user tokens
  - **Standard flow**: can be off if only the SPA talks to users

This client id should appear as the `**aud`** claim in access tokens consumed by the API.

### 5.2 Browser (SPA) client (for when the Angular app uses OIDC)

1. **Clients → Create client**
  - **Client ID**: `my-budget-ui` (suggested)
  - **Client authentication**: Off (public)
  - **Standard flow** enabled; **Valid redirect URIs**: your real UI origins, for example `https://app.<your-domain>/*` and `http://localhost:4200/*` for development.
  - **Web origins**: same origins (or `+` for dev).

### 5.3 Audience mapper (required for `Auth:Audience = my-budget-api`)

If tokens are obtained through `my-budget-ui`, Keycloak’s default access token may **not** include `aud: my-budget-api`. Add a mapper so the API’s JWT bearer validation succeeds:

1. Open client `**my-budget-ui`** → **Client scopes** → dedicated scope (or **Mappers** on the client, depending on Keycloak version).
2. **Add mapper → By configuration → Audience**
  - **Included Client Audience**: `my-budget-api`
  - **Add to access token**: On

Save. Obtain a token from the SPA client and confirm the JWT contains `"aud": "my-budget-api"` (or an array that includes it).

### 5.4 Test user

**Realm `my-budget` → Users → Add user**, set password (or use **Credentials**), disable **Temporary** if prompted.

---

## 6. Point MyBudget API at Keycloak

Set environment variables (or appsettings) on the host that runs the API:


| Variable                     | Example                                       |
| ---------------------------- | --------------------------------------------- |
| `Auth__Enabled`              | `true`                                        |
| `Auth__Authority`            | `https://auth.<your-domain>/realms/my-budget` |
| `Auth__Audience`             | `my-budget-api`                               |
| `Auth__RequireHttpsMetadata` | `true`                                        |
| `FrontendOrigin`             | `https://app.<your-domain>`                   |


`ConnectionStrings__Database` must point at your production PostgreSQL (not necessarily the same container as Keycloak’s database).

---

## 7. Operations checklist

- **Backups**: include the `keycloak-db` volume (or regular `pg_dump` of the `keycloak` database).
- **Upgrades**: pin the Keycloak image tag in `docker-compose.yml`, test in a clone, then redeploy with `RepullImageAndRedeploy` (the Portainer deploy script sets this on updates).
- **Reverse proxy**: if you see redirect loops or wrong hostnames, verify `KEYCLOAK_HOSTNAME`, `KC_PROXY_HEADERS=xforwarded`, and DSM reverse proxy forwarded headers.

---

## 8. Files in this repo


| Path                                                | Purpose                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `deploy/keycloak/docker-compose.yml`                | Keycloak + PostgreSQL for Portainer / Compose                         |
| `deploy/keycloak/env.example`                       | Template for `.env` (copy or use `New-KeycloakDeploymentPackage.ps1`) |
| `deploy/synology/docker-compose.yml`                | **Postgres + Keycloak + API + UI** (build context = repo root)        |
| `deploy/synology/docker-compose.bundled.yml`        | Same stack; build context = `./bundle` (File Station / zip, no git)   |
| `deploy/synology/env.example` / `ui-config.json.example` | Templates for full-stack `.env` and Angular `config.json`        |
| `deploy/synology/New-SynologyDeploymentPackage.ps1` | Interactive `.env` + `ui-config.json` for the full stack              |
| `deploy/synology/Sync-SynologyStack.ps1`            | `scp` compose + secrets to the NAS                                    |
| `deploy/synology/Invoke-SynologyCompose.ps1`       | Runs `docker compose` on the NAS via SSH                              |
| `deploy/synology/Deploy-SynologyStack.ps1`         | Package (optional) + sync + compose (`-UsePrebuiltImagesCompose`)     |
| `deploy/synology/docker-compose.images.yml`       | Stack using **pulled/loaded** API+UI images (no build context on NAS)  |
| `deploy/synology/Build-MyBudgetDockerImages.ps1`  | Build API+UI images on the PC                                          |
| `deploy/synology/Export-MyBudgetDockerImages.ps1` | `docker save` to a `.tar` for the NAS                                   |
| `deploy/synology/Import-MyBudgetDockerImagesToSynology.ps1` | `scp` + `docker load` on the NAS                            |
| `deploy/synology/Deploy-SynologyPrebuiltFromLocal.ps1` | Build, export, load, sync images compose, `compose up`          |
| `deploy/synology/New-KeycloakDeploymentPackage.ps1` | Interactive `.env` for Keycloak-only folder                         |
| `deploy/synology/Sync-KeycloakToSynology.ps1`       | `scp` Keycloak-only bundle to the NAS                                 |
| `deploy/synology/Deploy-PortainerKeycloakStack.ps1` | Create/update stack via Portainer API                                 |
| `deploy/synology/Deploy-MyBudgetKeycloak.ps1`       | Keycloak-only: package + Portainer deploy (+ optional sync)           |


`deploy/keycloak/.env` is listed in `.gitignore` patterns under `deploy/keycloak/` — do not commit secrets.