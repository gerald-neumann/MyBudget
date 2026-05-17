# Keycloak Audience + Issuer Alignment Runbook

This runbook is for a shared Keycloak host (`auth.flowparity.com`) serving multiple apps.

Your metadata already confirms issuer:

- `https://auth.flowparity.com/keycloak/realms/my-budget`

## 1) Keycloak server settings (shared host)

Keep Keycloak hostname on the shared auth domain. Do not switch to MyBudget domain if other apps depend on it.

Expected OIDC base:

- `https://auth.flowparity.com/keycloak`

## 2) Audience mapping (`aud`) in Keycloak

Goal: access token for UI client contains `my-budget-api` in `aud`.

In Keycloak Admin:

1. Realm: `my-budget`
2. Clients -> `my-budget-ui`
3. Open mapper configuration (directly on client or via dedicated client scope)
4. Add mapper:
   - Mapper Type: `Audience`
   - Included Client Audience: `my-budget-api`
   - Add to access token: `ON`
   - Add to ID token: optional

## 3) API issuer/audience alignment

In MyBudget API env (Portainer stack):

```env
AUTH_ENABLED=true
AUTH_AUTHORITY=https://auth.flowparity.com/keycloak/realms/my-budget
AUTH_AUDIENCE=my-budget-api
AUTH_REQUIRE_HTTPS_METADATA=true
FRONTEND_ORIGIN=https://mybudget.flowparity.com
```

Optional metadata override:

```env
AUTH_METADATA_ADDRESS=https://auth.flowparity.com/keycloak/realms/my-budget/.well-known/openid-configuration
```

## 4) UI auth config

In `ui-config.json`:

```json
{
  "apiBaseUrl": "https://mybudget.flowparity.com/api",
  "keycloak": {
    "enabled": true,
    "url": "https://auth.flowparity.com/keycloak",
    "realm": "my-budget",
    "clientId": "my-budget-ui",
    "debug": false
  }
}
```

## 5) Verify

1. Open metadata:
   - `https://auth.flowparity.com/keycloak/realms/my-budget/.well-known/openid-configuration`
2. Confirm JSON `issuer` equals:
   - `https://auth.flowparity.com/keycloak/realms/my-budget`
3. Login and decode access token:
   - `iss` must equal authority above
   - `aud` must include `my-budget-api`
4. Call authenticated API endpoint and confirm no 401 from issuer/audience mismatch.

## 6) Common failures

- API 401 with valid-looking token:
  - `iss` in token does not exactly match `AUTH_AUTHORITY`
  - `aud` missing `my-budget-api`
- Fast login failure / cookie issues:
  - Re-check reverse proxy forwarded headers (`X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For`)
