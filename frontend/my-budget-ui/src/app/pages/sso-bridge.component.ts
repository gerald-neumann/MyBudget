import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { authDebugLog } from '../core/auth-debug';
import { KeycloakAuthService } from '../core/keycloak-auth.service';

/**
 * Keycloak redirect target only. Root `''` → `dashboard` redirect would strip OAuth params before the adapter
 * finishes; `/sso` has no competing redirect so `?code=…` / `#…` survives until APP_INITIALIZER completes.
 */
@Component({
  selector: 'app-sso-bridge',
  standalone: true,
  template: ''
})
export class SsoBridgeComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly keycloakAuth = inject(KeycloakAuthService);

  ngOnInit(): void {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(search);
    const hasCode = params.has('code');
    const hasErr = params.has('error');
    authDebugLog('sso-bridge', {
      authenticated: this.keycloakAuth.isAuthenticated(),
      hasCode,
      hasError: hasErr,
      error: hasErr ? params.get('error') : undefined
    });

    if (this.keycloakAuth.isAuthenticated()) {
      void this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      return;
    }
    // Callback params but no session → init already failed or state was invalid; do not hit `/` + guard (login loop).
    if (hasCode || hasErr) {
      authDebugLog('sso-bridge: OAuth params present but not authenticated → sign-in-failed');
      void this.router.navigateByUrl('/sign-in-failed', { replaceUrl: true });
      return;
    }
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
