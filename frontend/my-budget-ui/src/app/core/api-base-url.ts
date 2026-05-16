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
const anonymousApiPaths = new Set(['/build-info', '/health']);

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
    /** Extra console logging for OIDC / token issues (`[MyBudget:Auth]`). */
    debug?: boolean;
  };
}

function applyAppConfigJson(c: AppConfigJson): void {
  if (c?.apiBaseUrl?.trim()) {
    resolvedApiBaseUrl = c.apiBaseUrl.trim().replace(/\/$/, '');
  }
  const k = c?.keycloak;
  const allowDebug = k?.debug === true && !isResolvedApiBaseRemoteHost();
  setKeycloakDebugFromConfig(allowDebug);
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

export function isAnonymousApiRequestUrl(requestUrl: string): boolean {
  const apiBase = getResolvedApiBaseUrl();
  if (!requestUrl.startsWith(apiBase)) {
    return false;
  }

  const relative = requestUrl.slice(apiBase.length);
  const pathWithoutQuery = relative.split('?', 2)[0];
  return anonymousApiPaths.has(pathWithoutQuery);
}

/** True when the configured API is not on loopback — deployed APIs require JWT; Keycloak must be enabled in config.json. */
export function isResolvedApiBaseRemoteHost(): boolean {
  try {
    const u = new URL(getResolvedApiBaseUrl());
    const h = u.hostname.toLowerCase();
    return h !== 'localhost' && h !== '127.0.0.1' && h !== '::1';
  } catch {
    return false;
  }
}

/** SessionStorage: set by the auth guard when the SPA points at a remote API but Keycloak is not enabled in config.json. */
export const MYBUDGET_RUNTIME_CONFIG_FLASH_KEY = 'mybudget_runtime_config_flash';

/** SessionStorage: Keycloak PKCE needs `crypto.subtle` — only available on HTTPS (non-loopback) or localhost. */
export const MYBUDGET_HTTPS_REQUIRED_FLASH_KEY = 'mybudget_https_required_flash';

export interface HttpsRequiredFlash {
  kind: 'https_required';
  /** `window.location.origin` when the flash was written (typically `http://…`). */
  pageOrigin: string;
}

/** Keycloak PKCE needs `crypto.subtle` (HTTPS or loopback). Call from guard / Keycloak init before `login()`. */
export function storeHttpsRequiredFlash(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const payload: HttpsRequiredFlash = {
    kind: 'https_required',
    pageOrigin: window.location.origin
  };
  try {
    sessionStorage.setItem(MYBUDGET_HTTPS_REQUIRED_FLASH_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
