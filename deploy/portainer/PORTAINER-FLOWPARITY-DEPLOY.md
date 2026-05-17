# Portainer: MyBudget at `mybudget.flowparity.com` + API at `/api`

Stack layout: **PostgreSQL**, **API** (ASP.NET), and **Angular UI** (`mybudget-ui`, nginx) as the **single HTTP entry**: the UI container serves the SPA and proxies `/api/...` to the API (same routing as before; see `frontend/my-budget-ui/nginx.conf`).

- `https://mybudget.flowparity.com/` → UI (static + SPA fallback)
- `https://mybudget.flowparity.com/api/...` → API (full `/api/...` path is forwarded to Kestrel; the API uses **`PublicPathBase=/api`**)

**Keycloak** is external, served on `auth.flowparity.com/keycloak` (shared IdP for multiple apps in this setup).

## Quick deployment flow (from your PC)

1. **`deploy-my-budget.ps1`** (repo root): by default runs the full pipeline — build, **`docker save`**, **scp**, remote **`docker load`**, then **`Deploy-PortainerMyBudgetStack.ps1`** (default endpoint **3**, **`-SkipCertificateCheck`**). Use **`-SkipRemoteDockerLoad`** / **`-SkipPortainerDeploy`** to trim steps; **`IdentityFile`** for SSH keys.
2. Optional **`-RemoveRemoteTarAfterLoad`** after remote load.
3. Portainer-only refresh: **`pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 -EndpointId N -SkipCertificateCheck`** (token in **`deploy/portainer/.env`** or **`-AccessTokenFile`**).

Further detail: **§4** (images and upload flags), **§7** (Portainer API), **§6** (Keycloak stack).

---

## 1. DNS

| Record | Points to |
|--------|-----------|
| `mybudget.flowparity.com` | Docker host (or the machine in front of it) |
| `auth.flowparity.com` | Optional Keycloak upstream host (not browser-facing when using `/auth` facade) |

You no longer need a separate `api.*` hostname for this layout.

---

## 2. Two nginx layers (host TLS + app container)

Typical production shape:

1. **Host nginx** (or Traefik / Caddy on the same machine): **TLS termination** for `mybudget.flowparity.com`, HTTP/2, certificates.
2. **`mybudget-ui`** (published port mapping from `MYBUDGET_EDGE_PUBLISH`): serves the SPA and proxies **`/api/`** to the API. Inside the container this is **HTTP only** on port 80.

### 2.1 Publish the UI only on loopback (recommended with host nginx)

Set in the stack environment:

```env
MYBUDGET_EDGE_PUBLISH=127.0.0.1:18080:80
```

Then only processes on the host can reach the app. Your **host nginx** proxies to `http://127.0.0.1:18080` (adjust the port if 18080 is taken).

### 2.2 Hetzner: Docker `edge` network + `mybudget` hostname (fixes 502)

If public **TLS nginx** is the **`stacks/nginx`** container from the **`hetzner`** repo, it proxies MyBudget with:

```nginx
set $mybudget_upstream http://mybudget:80;
```

The **`mybudget-ui`** container is on the **external** Docker network **`edge`** and is reachable as hostname **`mybudget`** (DNS alias). That wiring is in the base **`docker-compose.yml`**; without the **`edge`** network on the host, stack deploy fails until you create it.

1. On the server: **`docker network create edge`** (once), if it does not exist.
2. Set **`MYBUDGET_EDGE_PUBLISH=127.0.0.1:18080:80`** so the UI does not bind host **`:80`** (edge nginx already uses it).
3. Deploy / update the stack from **`docker-compose.yml`** only. **`docker-compose.hetzner-edge.yml`** is a legacy no-op kept for stacks that still reference it; you can drop that second file from Portainer.

Traffic from the internet still flows: **browser → edge nginx → Docker `mybudget:80`** (the UI container).

See **`hetzner/stacks/nginx/README.md`** (troubleshooting) for the same contract.

### 2.3 Example: host nginx → Portainer stack

```nginx
# /etc/nginx/sites-enabled/mybudget.flowparity.com.conf (paths/certs are examples)
# Also available as deploy/portainer/nginx/host-tls-to-stack.example.conf

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name mybudget.flowparity.com;

    ssl_certificate     /etc/letsencrypt/live/mybudget.flowparity.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mybudget.flowparity.com/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}

server {
    listen 80;
    server_name mybudget.flowparity.com;
    return 301 https://$host$request_uri;
}
```

The UI nginx forwards `X-Forwarded-*` to the API on `/api/` requests. Keeping **`Host: mybudget.flowparity.com`** end-to-end matters for Keycloak **redirect URIs** and **Web origins**.

### 2.4 TLS only on host

Leave the stack on HTTP (as shipped). Do not expose `MYBUDGET_EDGE_PUBLISH` as `0.0.0.0:80` on the public internet unless you intend to serve plain HTTP directly.

### 2.5 Portainer: `Bind for 127.0.0.1:18080 failed: port is already allocated`

Docker publishes **`mybudget-ui`** using **`MYBUDGET_EDGE_PUBLISH`** (often **`127.0.0.1:18080:80`**). That **host** port can only be used by **one** container.

1. **SSH to the Docker host** and list what holds the port, e.g. **`docker ps --format '{{.Names}}\t{{.Ports}}' | findstr 18080`** (Windows) or **`docker ps | grep 18080`** (Linux).
2. **Stop/remove** the old container (common: a previous **`mybudget-ui`** after a failed redeploy, or legacy **`mybudget-reverse-proxy`** still mapped to **`18080`**).
3. **Or** pick a free host port: set **`MYBUDGET_EDGE_PUBLISH=127.0.0.1:18081:80`** in the stack env, **redeploy**, then point **host nginx** **`proxy_pass`** (§2.3) at **`http://127.0.0.1:18081`** instead of **`18080`**.

---

## 3. API path base (`/api`)

The API reads **`PublicPathBase`** (compose: `PUBLIC_PATH_BASE=/api`). That must match the **`/api/`** path the UI nginx exposes. Health check URL from the browser: `https://mybudget.flowparity.com/api/health`.

If you ever run the API **without** a path prefix (local compose on port 5256), **omit** `PUBLIC_PATH_BASE` or set it empty.

### 3.1 Browser shows **502** on `/api/...` (empty baselines, `/me` fails)

The UI container’s nginx proxies `/api/` to the **`api`** service on port **8080** (`frontend/my-budget-ui/nginx.conf`). A **502** means nginx could not get a valid HTTP response from that upstream (not an ASP.NET 4xx/5xx from the app itself).

1. Open **`/api/health`** in the browser (same host). If it is also **502**, fix the stack before chasing Keycloak or `ui-config.json`.
2. On the Docker host: **`docker ps`** — confirm **`mybudget-api`** is **running**, not restarting, and shows **healthy** once the stack’s API healthcheck has passed. Inspect logs: **`docker logs mybudget-api`** (common: DB connection string wrong, Postgres not healthy, migration failure on startup — **`Database.Migrate failed`** then exit).
3. From the UI container, reach the API directly (rules out browser vs nginx): **`docker exec mybudget-ui wget -qO- http://api:8080/api/health`** (Alpine nginx image includes **`wget`**). Connection refused or timeout → API not listening or not on the same compose network.
4. Confirm **`mybudget-ui`** and **`mybudget-api`** are from the **same** Portainer stack so the UI resolves the hostname **`api`** on the default network.
5. If only **`/api/health`** works but other routes 502, compare **`PUBLIC_PATH_BASE`** with the path your browser uses (must match **`/api`** when routing through UI nginx).

---

## 4. Images and Font Awesome

Same as before: build or load **`MYBUDGET_API_IMAGE`** / **`MYBUDGET_UI_IMAGE`**. The UI image build requires **`FONTAWESOME_PRO_TOKEN`** (see `frontend/my-budget-ui/Dockerfile`).

From a dev PC, **`deploy-my-budget.ps1`** runs the full pipeline by default (**build**, **save**, **scp**, remote **`docker load`**, Portainer stack update). Use **`-IdentityFile`** for SSH keys, **`-SkipRemoteDockerLoad`** / **`-SkipPortainerDeploy`** to trim steps. Portainer-only: **`deploy/portainer/Deploy-PortainerMyBudgetStack.ps1`** (token in **`deploy/portainer/.env`**).

---

## 5. `ui-config.json`

Copy `ui-config.example.json` → **`ui-config.json`** and mount it via `MYBUDGET_UI_CONFIG_PATH`.

- **`apiBaseUrl`**: `https://mybudget.flowparity.com/api` (no trailing slash).
- **`keycloak.url`**: `https://auth.flowparity.com/keycloak` (no trailing slash).

---

## 6. External shared Keycloak (`auth.flowparity.com/keycloak`)

Use the dedicated runbook for exact external adaptations:
**`deploy/keycloak/OWN-DOMAIN-AUTH-RUNBOOK.md`**

### 6.0 Deploy the Keycloak stack (Portainer)

1. Copy **`deploy/keycloak/flowparity.env.example`** to **`deploy/keycloak/.env`** (gitignored). Set **`KEYCLOAK_ADMIN_PASSWORD`**, **`KEYCLOAK_DB_PASSWORD`**, and **`KEYCLOAK_PGDATA_HOST`** to an absolute path on the Portainer host (create an empty folder before the first start).
2. Deploy **`deploy/keycloak/docker-compose.yml`** as its own stack. Published port must match your edge proxy (default **`KEYCLOAK_HTTP_PORT=8081`** → map `https://auth.flowparity.com` to `http://127.0.0.1:8081` or your chosen port).
3. Optional — from repo root, same Portainer API pattern as the app stack:

   ```powershell
   pwsh ./deploy/portainer/Deploy-PortainerKeycloakStack.ps1 `
     -AccessTokenFile "$env:USERPROFILE\.secrets\portainer-flowparity.ptr" `
     -EndpointId 2 `
     -SkipCertificateCheck
   ```

   **`-PortainerBaseUrl`** defaults to **`https://portainer.flowparity.com`**. The script uploads compose + variables from **`deploy/keycloak/.env`**.

4. When Keycloak is healthy, finish **§6.2** once in the Admin UI (realm, clients, audience mapper, users).

### 6.1 Keycloak server / reverse proxy (summary)

Your Keycloak container remains external and shared. Browser login redirects to `auth.flowparity.com/keycloak/...`.

For issuer/token checks, use the issuer from metadata:

`https://auth.flowparity.com/keycloak/realms/my-budget`

Set the API accordingly:

| Variable | Value |
|----------|--------|
| `Auth__Authority` | `https://auth.flowparity.com/keycloak/realms/my-budget` |
| `Auth__RequireHttpsMetadata` | `true` |

Admin UI may still live on a separate ops URL; that does not need to be browser-facing for end users.

### 6.2 Realm and clients

Same client and realm setup as a typical Keycloak + SPA deployment, with these URL tweaks:

1. **Realm name**: `my-budget`.
2. **Client `my-budget-api`**: audience for JWT validation (`Auth__Audience=my-budget-api`).
3. **Public client `my-budget-ui`**: **Valid redirect URIs** include `https://mybudget.flowparity.com/*` (the SPA uses **`/sso`**). **Web origins**: `https://mybudget.flowparity.com`. **Valid post logout redirect URIs** (Keycloak 17+): same pattern, e.g. `https://mybudget.flowparity.com/*`, so the in-app **Log out** control can return to the app root and start a fresh login.
4. **Audience mapper** on `my-budget-ui`: include **`my-budget-api`** on the access token (required for the API).

### 6.3 Checklist

| Where | Value |
|-------|--------|
| API `Auth__Authority` | `https://auth.flowparity.com/keycloak/realms/my-budget` |
| API `Auth__Audience` | `my-budget-api` |
| API `FrontendOrigin` | `https://mybudget.flowparity.com` |
| API `PublicPathBase` | `/api` |
| `ui-config.json` `apiBaseUrl` | `https://mybudget.flowparity.com/api` |
| `ui-config.json` `keycloak.url` | `https://auth.flowparity.com/keycloak` |
| `ui-config.json` `keycloak.realm` | `my-budget` |
| Stack env `MYBUDGET_KEYCLOAK_UPSTREAM_ORIGIN` | `https://auth.flowparity.com` (example) |
| Stack env `MYBUDGET_KEYCLOAK_UPSTREAM_BASE_PATH` | `/keycloak` (example) |

### 6.4 Reverse proxy, cookies, and time

Use this when browser login fails quickly, cookies vanish, or Keycloak shows **“Restart login cookie not found”** / **`temporarily_unavailable`**.

- **NTP**: keep clock skew small on the Keycloak host, reverse proxy, and client machines.
- **DNS**: clients should resolve `auth.flowparity.com` consistently.
- **UI nginx → Keycloak upstream**: if you use the optional `/auth` facade, `MYBUDGET_KEYCLOAK_UPSTREAM_*` must match your Keycloak upstream.
- **Forwarded headers**: Keycloak must receive coherent forwarded headers for the public browser URL (see runbook).
- **Keycloak env**: keep `KC_PROXY_HEADERS: xforwarded`; set hostname/path strategy so issuer equals API `Auth__Authority`.

### 6.5 Validation (after rollout)

1. Metadata issuer check: `https://auth.flowparity.com/keycloak/realms/my-budget/.well-known/openid-configuration` returns issuer `https://auth.flowparity.com/keycloak/realms/my-budget`.
2. Browser auth path check: login redirects to `auth.flowparity.com` and returns via `/sso` to the app.
3. API auth check: authenticated API calls succeed with issuer/audience expected by API config.
4. Security preflight: run `deploy/portainer/Verify-MyBudgetSecurityPreflight.ps1`.

For the full step-by-step and troubleshooting list, use:
**`deploy/keycloak/OWN-DOMAIN-AUTH-RUNBOOK.md`**

---

## 7. Portainer deploy

### 7a. Portainer HTTP API (PowerShell)

Same pattern as Keycloak: **`deploy/portainer/Deploy-PortainerMyBudgetStack.ps1`** calls **`POST /api/stacks/create/standalone/string`** (create) or **`PUT /api/stacks/{id}`** (update). It reads **`docker-compose.yml`** + **`.env`** and uploads the compose as-is. **`-PortainerBaseUrl` defaults to `https://portainer.flowparity.com`** (override if your Portainer URL differs).

1. Copy **`env.example`** → **`deploy/portainer/.env`** and set secrets / image tags / `MYBUDGET_UI_CONFIG_PATH` (absolute path on the host, e.g. `/opt/stacks/mybudget/ui-config.json`).
2. Create a Portainer **access token** (or use username/password).
3. List Docker endpoints:

```powershell
cd d:\Projects\Privat\MyBudget
pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 `
  -AccessTokenFile "$env:USERPROFILE\.secrets\portainer-flowparity.ptr" `
  -SkipCertificateCheck `
  -ListEndpointsOnly
```

4. Create or update the stack (replace **`EndpointId`** with the id from step 3). **Do not pass the token on the command line** (PSReadLine history). Prefer **`-AccessTokenFile`** or **`$env:MYBUDGET_PORTAINER_ACCESS_TOKEN`** for the current shell only:

```powershell
pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 `
  -AccessTokenFile "$env:USERPROFILE\.secrets\portainer-flowparity.ptr" `
  -EndpointId 2 `
  -SkipCertificateCheck
```

The script **removes** `MYBUDGET_PORTAINER_ACCESS_TOKEN` / `PORTAINER_ACCESS_TOKEN` (and `*_OP_REF` variants) from the `.env` payload sent to Portainer so those keys are not stored as visible stack environment variables.

**1Password:** install the [1Password CLI](https://developer.1password.com/docs/cli/get-started/) (`op`), run **`op signin`**, then use **`-AccessTokenOpRef 'op://Vault/Item/credential'`** (field name depends on your item type — use **Copy Secret Reference** in the 1Password app). Same idea for password login with **`-PortainerPasswordOpRef`**.

Optional: **`-StackDir`**, **`-EnvFile`**, **`-StackName`**.

### 7b. Portainer UI

1. **Stacks → Add stack** → Git or upload `deploy/portainer/` (`docker-compose.yml` only; no extra nginx bind mount).
2. Set environment from **`env.example`** (adjust passwords, image tags, `MYBUDGET_EDGE_PUBLISH`).
3. Place **`ui-config.json`** on the host and set `MYBUDGET_UI_CONFIG_PATH`.
4. Deploy, then configure **host nginx** (§2) and **Keycloak** (§6).

**`deploy/portainer/nginx/flowparity.conf`** is kept as a **reference** for the old separate stack reverse-proxy layout; routing now lives in **`frontend/my-budget-ui/nginx.conf`** inside the UI image.
