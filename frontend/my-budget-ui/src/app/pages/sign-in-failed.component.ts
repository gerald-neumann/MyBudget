import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { getKeycloakUiConfig } from '../core/api-base-url';
import { authDebugLog } from '../core/auth-debug';
import { KeycloakAuthService, MYBUDGET_KEYCLOAK_OAUTH_FLASH_KEY } from '../core/keycloak-auth.service';

interface OAuthFlash {
  error?: string;
  error_description?: string;
}

/**
 * Shown when `/sso` had an OAuth callback but Keycloak did not yield a session
 * (token POST failed, invalid state/PKCE storage, etc.). Avoids an infinite guard → login loop.
 */
@Component({
  selector: 'app-sign-in-failed',
  standalone: true,
  imports: [RouterLink],
  styles: [
    `
      :host {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overscroll-behavior-y: contain;
      }
    `
  ],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-4 p-8 font-sans text-slate-800">
      <h1 class="text-xl font-semibold">Sign-in did not complete</h1>
      @if (flash; as f) {
        <div
          class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <p class="font-medium">Keycloak said:</p>
          <p class="mt-1 font-mono text-xs">{{ f.error }}</p>
          @if (f.error_description) {
            <p class="mt-2 text-xs leading-relaxed">{{ f.error_description }}</p>
          }
          @if (isKeycloakAuthCookieFlowIssue(f)) {
            <div
              class="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950"
            >
              <p class="font-medium text-sky-950">Likely: login-flow cookies or proxy</p>
              <p class="mt-1">
                Realm <strong>SSO Session Idle</strong> is often <em>not</em> the cause. Keycloak 25+ can return this
                when the short-lived <strong>browser auth-session cookies</strong> (including the
                <strong>restart login</strong> cookie) never stick — same root cause as Keycloak’s
                <em>“Restart login cookie not found”</em> page.
              </p>
              <ul class="mt-2 list-disc space-y-1 pl-4">
                @if (showInsecureLocalhostHttp()) {
                  <li>
                    <strong>http://localhost</strong> + proxy to <strong>HTTPS</strong> Keycloak: Keycloak may emit
                    <code class="rounded bg-white/80 px-1">Secure</code> cookies; the browser will
                    <strong>drop</strong> them on plain HTTP. DevTools → Application → Cookies: after submitting the
                    password you should see cookies for this origin; if none appear, use HTTPS for the UI (next
                    bullet) or keep the dev-proxy cookie rewrite in <code class="rounded bg-white/80 px-1">proxy.conf.js</code>.
                  </li>
                  <li>
                    Run the UI on <strong>HTTPS</strong> (e.g.
                    <code class="rounded bg-white/80 px-1">ng serve -c development-https</code>) and add
                    <code class="rounded bg-white/80 px-1">https://localhost:4200/sso</code> (and matching Web
                    origins) for client <code class="rounded bg-white/80 px-1">{{ keycloakClientId }}</code> in
                    Keycloak.
                  </li>
                } @else {
                  <li>
                    You are on <code class="rounded bg-white/80 px-1">{{ appOrigin }}</code>. In Keycloak Admin →
                    Clients → <code class="rounded bg-white/80 px-1">{{ keycloakClientId }}</code>: set
                    <strong>Valid redirect URIs</strong> and <strong>Web origins</strong> to that exact origin
                    (including <code class="rounded bg-white/80 px-1">https://</code> and port). A mismatch here
                    breaks the flow even when cookies exist.
                  </li>
                  <li>
                    DevTools → Application → Cookies for
                    <code class="rounded bg-white/80 px-1">{{ appOrigin }}</code>: after the first Keycloak response
                    via <code class="rounded bg-white/80 px-1">/kc</code>, you should see Keycloak cookies; if the list
                    stays empty, check “block third-party cookies”, private mode, or corporate browser policy.
                  </li>
                  <li>
                    If the login UI still shows <code class="rounded bg-white/80 px-1">auth.ispark…</code> in the
                    address bar instead of <code class="rounded bg-white/80 px-1">localhost</code>, you left the
                    proxied app — cookies for <code class="rounded bg-white/80 px-1">localhost</code> will not apply.
                    Prefer opening Keycloak only under <code class="rounded bg-white/80 px-1">/kc/…</code> from this
                    app.
                  </li>
                }
                <li>
                  Behind a reverse proxy, Keycloak must see correct
                  <code class="rounded bg-white/80 px-1">X-Forwarded-Proto</code> /
                  <code class="rounded bg-white/80 px-1">Host</code> (see
                  <a
                    class="text-sky-900 underline"
                    href="https://www.keycloak.org/server/reverseproxy"
                    target="_blank"
                    rel="noopener"
                    >Keycloak reverse proxy</a
                  >). Wrong headers can break cookies and sessions even when SSO idle is long.
                </li>
              </ul>
            </div>
          } @else {
            <ul class="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-900">
              <li>Keycloak ended the <strong>login</strong> session before tokens were issued (idle tab, tight timeouts, or proxy/cluster issues).</li>
              <li>Admin: <strong>Realm settings → Sessions</strong> — SSO / client session idle and max.</li>
              <li>Sync <strong>NTP</strong> on the Keycloak host, reverse proxy, and this PC.</li>
              <li>Multiple Keycloak nodes: <strong>sticky sessions</strong> at the proxy.</li>
              <li>Then <strong>Try sign-in again</strong> and finish login without a long pause.</li>
            </ul>
          }
        </div>
      } @else {
        <p class="text-sm leading-relaxed text-slate-600">
          The browser returned from Keycloak without a usable session. Typical causes: token endpoint error
          (network/CORS/proxy), <code class="rounded bg-slate-100 px-1">redirect_uri</code> mismatch in the
          Keycloak client, or OAuth state lost (new tab, cleared storage, or back button). Check the browser
          console for <code class="rounded bg-slate-100 px-1">[MyBudget:Auth]</code> and Keycloak adapter lines.
        </p>
      }
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
          (click)="retry()"
        >
          Try sign-in again
        </button>
        <a routerLink="/" class="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >Home</a
        >
      </div>
    </div>
  `
})
export class SignInFailedComponent implements OnInit {
  private readonly keycloakAuth = inject(KeycloakAuthService);

  /** One-shot message from Keycloak OAuth error redirect (see keycloak-auth.service). */
  protected flash: OAuthFlash | null = null;

  /** Exposed as getters so strict template type-check always sees them on `SignInFailedComponent`. */
  get appOrigin(): string {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  get keycloakClientId(): string {
    return getKeycloakUiConfig()?.clientId ?? 'my-budget-ui';
  }

  ngOnInit(): void {
    try {
      const raw = sessionStorage.getItem(MYBUDGET_KEYCLOAK_OAUTH_FLASH_KEY);
      if (!raw) {
        return;
      }
      sessionStorage.removeItem(MYBUDGET_KEYCLOAK_OAUTH_FLASH_KEY);
      this.flash = JSON.parse(raw) as OAuthFlash;
    } catch {
      sessionStorage.removeItem(MYBUDGET_KEYCLOAK_OAUTH_FLASH_KEY);
    }
  }

  retry(): void {
    authDebugLog('sign-in-failed: user chose Try again → login()');
    void this.keycloakAuth.login();
  }

  /** Keycloak 25+ often maps “auth root session missing” to this pair — cookies/proxy/redirect mismatch, not SSO idle. */
  protected isKeycloakAuthCookieFlowIssue(f: OAuthFlash): boolean {
    if (f.error !== 'temporarily_unavailable') {
      return false;
    }
    const d = (f.error_description ?? '').toLowerCase();
    return d.includes('authentication_expired') || d.includes('authentication');
  }

  /** Plain HTTP on loopback — Secure cookies from Keycloak often fail unless proxied or HTTPS UI. */
  protected showInsecureLocalhostHttp(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const { protocol, hostname } = window.location;
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1';
    return protocol === 'http:' && loopback;
  }
}
