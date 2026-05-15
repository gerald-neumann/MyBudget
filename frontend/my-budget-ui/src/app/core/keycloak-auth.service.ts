import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import Keycloak, { KeycloakLoginOptions } from 'keycloak-js';

import { authDebugLog, isKeycloakAuthDebug } from './auth-debug';
import { getKeycloakUiConfig, storeHttpsRequiredFlash } from './api-base-url';

/** sessionStorage key: last OAuth error from Keycloak on `/sso` (read by sign-in-failed, then cleared). */
export const MYBUDGET_KEYCLOAK_OAUTH_FLASH_KEY = 'mybudget_keycloak_oauth_flash';

/** PKCE (S256) and keycloak-js need `SubtleCrypto`; browsers restrict it to secure contexts (HTTPS or loopback). */
export function isWebCryptoSubtleAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle;
}

function decodeOAuthErrorDescription(raw: string | null): string {
  if (!raw) {
    return '';
  }
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/**
 * Keycloak often sends users back to redirect_uri with ?error=…&error_description=… (e.g. session expired).
 * If keycloak-js `init()` processes that, it may call `kc.login()` again internally → URL flashes "expired" and loops.
 * Strip those params before init and show the message on /sign-in-failed instead.
 */
function stripKeycloakOAuthErrorFromUrlBeforeInit(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const u = new URL(window.location.href);
  if (!u.searchParams.has('error')) {
    return false;
  }

  const error = u.searchParams.get('error') ?? '';
  const errorDescription = decodeOAuthErrorDescription(u.searchParams.get('error_description'));

  authDebugLog('initialize: Keycloak returned OAuth error on redirect_uri (stripping before init)', {
    error,
    error_description: errorDescription,
    hint:
      error === 'temporarily_unavailable' && /authentication_expired/i.test(errorDescription)
        ? 'Often login-flow cookies (restart cookie), redirect/Web-origin mismatch, or proxy forwarded headers — not realm SSO idle. See /sign-in-failed help.'
        : undefined
  });

  try {
    sessionStorage.setItem(
      MYBUDGET_KEYCLOAK_OAUTH_FLASH_KEY,
      JSON.stringify({ error, error_description: errorDescription })
    );
  } catch {
    /* quota / private mode */
  }

  const drop = [
    'error',
    'error_description',
    'error_uri',
    'state',
    'session_state',
    'iss',
    'code',
    'kc_action_status',
    'kc_action'
  ];
  for (const k of drop) {
    u.searchParams.delete(k);
  }
  const q = u.searchParams.toString();
  const next = u.pathname + (q ? `?${q}` : '') + u.hash;
  window.history.replaceState(window.history.state, '', next);
  return true;
}

/** Log URL without leaking authorization `code`. */
function safeAuthHref(href: string): string {
  try {
    const u = new URL(href);
    for (const k of ['code', 'session_state']) {
      if (u.searchParams.has(k)) {
        u.searchParams.set(k, '…');
      }
    }
    return u.toString();
  } catch {
    return href.length > 120 ? `${href.slice(0, 120)}…` : href;
  }
}

/** When ng serve proxies HTTPS Keycloak under `/kc`, use same-origin URLs so POST /token is not cross-origin. */
function resolveKeycloakUrlForBrowser(configuredUrl: string): string {
  if (typeof window === 'undefined') {
    return configuredUrl;
  }
  const host = window.location.hostname;
  const loopback = host === 'localhost' || host === '127.0.0.1';
  if (!loopback || !/^https:\/\//i.test(configuredUrl)) {
    return configuredUrl;
  }
  return `${window.location.origin}/kc`;
}

/**
 * OIDC redirect_uri for this SPA.
 * - keycloak-js defaults to `location.href`; on `/kc/.../auth` that nests forever (broken URL).
 * - Using `/` breaks `''` → `dashboard` redirect: Angular can drop the OAuth hash before the adapter runs.
 * Always use `/sso` (dedicated route, no redirect) so `#state=…&code=…` survives until init finishes.
 */
function oidcAppRedirectUri(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:4200/sso';
  }
  return `${window.location.origin}/sso`;
}

/**
 * When config.json opts into Keycloak: init parses `/sso#…` callbacks only — no `login-required` here.
 * `login-required` calls internal `kc.login({})`; on the proxied `/kc/…/auth` page `redirect_uri` falls back to
 * `location.href` (that URL), so Keycloak keeps sending you back to `/kc/…/auth`. The route guard calls
 * `login()` with a fixed `/sso` redirect_uri instead (same idea as check-sso + guard in many apps).
 */
@Injectable({ providedIn: 'root' })
export class KeycloakAuthService {
  private keycloak?: Keycloak;

  /** One-time per browser session: full JWT is sensitive; only emitted when auth debug is on. */
  private accessTokenDebugLogged = false;

  constructor(private readonly router: Router) {}

  /** True when ui-config / config.json opts in with keycloak.enabled and full client settings. */
  usesKeycloakAuth(): boolean {
    return getKeycloakUiConfig() !== null;
  }

  /** False on plain `http://` hostnames (prod); PKCE cannot run without `crypto.subtle`. */
  isPkceBrowserSupported(): boolean {
    return isWebCryptoSubtleAvailable();
  }

  isAuthenticated(): boolean {
    return this.keycloak?.authenticated === true;
  }

  async initialize(): Promise<void> {
    const cfg = getKeycloakUiConfig();
    if (!cfg) {
      authDebugLog('initialize: Keycloak disabled or incomplete in config.json');
      return;
    }

    if (!isWebCryptoSubtleAvailable()) {
      authDebugLog(
        'initialize: Web Crypto / SubtleCrypto unavailable — use HTTPS for this host (or localhost). Keycloak PKCE cannot run.'
      );
      storeHttpsRequiredFlash();
      queueMicrotask(() => void this.router.navigateByUrl('/sign-in-failed', { replaceUrl: true }));
      return;
    }

    const hrefBeforeInit =
      typeof window !== 'undefined' ? window.location.href : '';
    const strippedKeycloakOAuthError = stripKeycloakOAuthErrorFromUrlBeforeInit();
    const hrefForInitLog =
      typeof window !== 'undefined' ? window.location.href : hrefBeforeInit;
    const hadOAuthCallback =
      /[?&]code=/.test(hrefBeforeInit) || /[?&]error=/.test(hrefBeforeInit);

    authDebugLog('initialize:start', {
      hadOAuthCallback,
      strippedKeycloakOAuthError,
      href: safeAuthHref(hrefForInitLog),
      keycloakUrl: resolveKeycloakUrlForBrowser(cfg.url.replace(/\/$/, '')),
      realm: cfg.realm,
      clientId: cfg.clientId,
      redirectUri: oidcAppRedirectUri()
    });

    const configuredUrl = cfg.url.replace(/\/$/, '');
    const url = resolveKeycloakUrlForBrowser(configuredUrl);
    const kc = new Keycloak({ url, realm: cfg.realm, clientId: cfg.clientId });

    const rawLogin = kc.login.bind(kc);
    kc.login = (opts?: KeycloakLoginOptions) =>
      rawLogin({ ...(opts ?? {}), redirectUri: oidcAppRedirectUri() });

    const debug = isKeycloakAuthDebug();
    if (debug) {
      kc.onAuthSuccess = () => {
        authDebugLog('[Keycloak] onAuthSuccess');
      };
      kc.onAuthError = (d) => {
        authDebugLog('[Keycloak] onAuthError', d);
      };
      kc.onAuthRefreshError = () => {
        authDebugLog('[Keycloak] onAuthRefreshError');
      };
    }

    let initAuthenticated = false;
    try {
      initAuthenticated = await kc.init({
        pkceMethod: 'S256',
        responseMode: 'query',
        redirectUri: oidcAppRedirectUri(),
        checkLoginIframe: false,
        enableLogging: debug
      });
    } catch (err) {
      authDebugLog('initialize: kc.init() rejected (often token POST failed)', err);
      this.keycloak = kc;
      queueMicrotask(() => void this.router.navigateByUrl('/sign-in-failed', { replaceUrl: true }));
      return;
    }

    this.keycloak = kc;

    authDebugLog('initialize: kc.init() settled', {
      initReturned: initAuthenticated,
      kcAuthenticated: kc.authenticated,
      hasToken: !!kc.token,
      tokenExp: kc.tokenParsed?.exp,
      iss: kc.tokenParsed?.iss
    });

    if (strippedKeycloakOAuthError && !kc.authenticated) {
      authDebugLog(
        'initialize: Keycloak OAuth error was removed from URL; user needs a fresh login (check realm SSO session / client timeouts in Keycloak admin)'
      );
      queueMicrotask(() => void this.router.navigateByUrl('/sign-in-failed', { replaceUrl: true }));
      return;
    }

    if (hadOAuthCallback && !kc.authenticated) {
      authDebugLog(
        'initialize: had OAuth callback params but no session — invalid state/PKCE storage, or keycloak-js stripped URL without exchanging code'
      );
      queueMicrotask(() => void this.router.navigateByUrl('/sign-in-failed', { replaceUrl: true }));
    }

    if (kc.authenticated) {
      this.tryLogAccessTokenOnce('after-kc-init');
    }
  }

  /** Sends the browser to the Keycloak login screen (no-op if Keycloak is not configured). */
  async login(): Promise<void> {
    if (getKeycloakUiConfig() && !isWebCryptoSubtleAvailable()) {
      authDebugLog('login: blocked (no SubtleCrypto — HTTPS required on this host)');
      storeHttpsRequiredFlash();
      queueMicrotask(() => void this.router.navigateByUrl('/sign-in-failed', { replaceUrl: true }));
      return;
    }
    if (!this.keycloak) {
      authDebugLog('login: skipped (Keycloak instance missing — init failed?)');
      return;
    }
    authDebugLog('login: redirecting to Keycloak authorize endpoint');
    await this.keycloak.login({ redirectUri: oidcAppRedirectUri() });
  }

  getToken(): string | undefined {
    return this.keycloak?.token;
  }

  /** Unix seconds when the in-memory access token expires (`exp` claim), if parsed. */
  getAccessTokenExpiryEpochSec(): number | undefined {
    const exp = this.keycloak?.tokenParsed?.exp;
    return typeof exp === 'number' ? exp : undefined;
  }

  /**
   * Ensures the access token is valid before attaching it to API calls.
   * `updateToken(minValidity)` is cheap when the token is still fresh (no network); when it is expired or
   * expires within the window, Keycloak refreshes it. Without this, an in-memory JWT past `exp` is still sent
   * and the API rejects it (`ValidateLifetime` + zero clock skew).
   */
  async getTokenForRequest(): Promise<string | undefined> {
    if (!this.usesKeycloakAuth()) {
      return undefined;
    }
    const kc = this.keycloak;
    if (!kc) {
      authDebugLog('getTokenForRequest: no Keycloak instance (init not finished or failed)');
      return undefined;
    }
    if (!kc.authenticated) {
      return undefined;
    }
    try {
      await kc.updateToken(70);
    } catch {
      authDebugLog('getTokenForRequest: updateToken failed (session expired or no refresh token?)');
      return undefined;
    }
    if (kc.token) {
      this.tryLogAccessTokenOnce('getTokenForRequest');
    }
    return kc.token;
  }

  /**
   * Used after an API 401: try to obtain a fresh access token even if Keycloak still thinks the current one
   * has plenty of lifetime left (clock skew, rotation, or stale in-memory JWT vs. validation on the server).
   */
  async refreshTokenAfterUnauthorized(): Promise<boolean> {
    const kc = this.keycloak;
    if (!kc?.authenticated) {
      return false;
    }
    try {
      await kc.updateToken(86_400);
    } catch {
      authDebugLog('refreshTokenAfterUnauthorized: updateToken failed');
      return false;
    }
    return !!kc.token;
  }

  /**
   * Ends the Keycloak SSO session and returns the browser to the app root; the auth guard then starts a fresh login.
   * Ensure the Keycloak client allows this URL under **Valid post logout redirect URIs** (e.g. `https://mybudget…/*`).
   */
  async logout(): Promise<void> {
    const kc = this.keycloak;
    if (!kc?.authenticated) {
      authDebugLog('logout: skipped (no Keycloak session)');
      return;
    }
    this.accessTokenDebugLogged = false;
    const redirectUri =
      typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:4200/';
    authDebugLog('logout: Keycloak end-session', { redirectUri: safeAuthHref(redirectUri) });
    await kc.logout({ redirectUri });
  }

  /**
   * When `keycloak.debug` in config.json: logs parsed claims once, then the raw access JWT
   * (paste at jwt.io — clear console afterward). Does nothing if debug is off.
   */
  private tryLogAccessTokenOnce(reason: string): void {
    if (!isKeycloakAuthDebug() || this.accessTokenDebugLogged) {
      return;
    }
    const kc = this.keycloak;
    if (!kc?.token || !kc.tokenParsed) {
      return;
    }
    this.accessTokenDebugLogged = true;
    const p = kc.tokenParsed;
    authDebugLog(`access token (${reason}) — parsed claims (validate vs API Auth:Authority / Auth:Audience)`, {
      iss: p.iss,
      sub: p.sub,
      aud: p.aud,
      azp: p.azp,
      typ: p['typ'],
      exp: p.exp,
      iat: p.iat,
      scope: typeof p['scope'] === 'string' ? p['scope'] : undefined
    });
    authDebugLog(
      'access token — FULL JWT (sensitive; copy for jwt.io then disable keycloak.debug / clear console)',
      kc.token
    );
  }
}
