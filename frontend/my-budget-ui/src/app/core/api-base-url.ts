import { InjectionToken } from '@angular/core';

import { setKeycloakDebugFromConfig } from './auth-debug';

export const BUDGET_API_BASE_URL = new InjectionToken<string>('BUDGET_API_BASE_URL');

let resolvedApiBaseUrl = 'http://localhost:5256';

export interface KeycloakUiConfig {
  url: string;
  realm: string;
  clientId: string;
}

let keycloakUiConfig: KeycloakUiConfig | null = null;

export function getKeycloakUiConfig(): KeycloakUiConfig | null {
  return keycloakUiConfig;
}

interface AppConfigJson {
  apiBaseUrl?: string;
  /** Browser Keycloak login is opt-in: requires `enabled: true` plus url, realm, clientId. */
  keycloak?: {
    enabled?: boolean;
    url?: string;
    realm?: string;
    clientId?: string;
    /** Extra console logging for OIDC / token issues (also on when `ng serve` / isDevMode()). */
    debug?: boolean;
  };
}

function applyAppConfigJson(c: AppConfigJson): void {
  if (c?.apiBaseUrl?.trim()) {
    resolvedApiBaseUrl = c.apiBaseUrl.trim().replace(/\/$/, '');
  }
  const k = c?.keycloak;
  setKeycloakDebugFromConfig(k?.debug === true);
  if (
    k?.enabled === true &&
    k.url?.trim() &&
    k.realm?.trim() &&
    k.clientId?.trim()
  ) {
    keycloakUiConfig = {
      url: k.url.trim(),
      realm: k.realm.trim(),
      clientId: k.clientId.trim()
    };
  } else {
    keycloakUiConfig = null;
  }
}

/** Runtime UI config next to index.html (Docker: bind-mount ui-config.json as config.json). */
export function bootstrapApiBaseUrl(): Promise<void> {
  const url = new URL('config.json', document.baseURI).href;
  return fetch(url, { cache: 'no-store' })
    .then(async (r) => {
      if (!r.ok) {
        return;
      }
      const text = await r.text();
      const trimmed = text.trim();
      // Without a bind-mounted file, some hosts return index.html for /config.json (SPA fallback).
      if (!trimmed.startsWith('{')) {
        return;
      }
      let c: AppConfigJson;
      try {
        c = JSON.parse(text) as AppConfigJson;
      } catch {
        return;
      }
      applyAppConfigJson(c);
    })
    .catch(() => void 0);
}

export function getResolvedApiBaseUrl(): string {
  return resolvedApiBaseUrl;
}
