import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import {
  getResolvedApiBaseUrl,
  isResolvedApiBaseRemoteHost,
  MYBUDGET_RUNTIME_CONFIG_FLASH_KEY,
  storeHttpsRequiredFlash
} from './api-base-url';
import { authDebugLog } from './auth-debug';
import { KeycloakAuthService } from './keycloak-auth.service';

/**
 * When Keycloak is opted in via config.json, every matched route requires an authenticated session.
 * Without that (e.g. only apiBaseUrl on prod), all routes stay open.
 */
export const requireKeycloakAuthGuard: CanActivateFn = async () => {
  const auth = inject(KeycloakAuthService);
  const router = inject(Router);

  if (isResolvedApiBaseRemoteHost() && !auth.usesKeycloakAuth()) {
    authDebugLog('guard: remote API base but Keycloak disabled in config → sign-in-failed', getResolvedApiBaseUrl());
    try {
      sessionStorage.setItem(
        MYBUDGET_RUNTIME_CONFIG_FLASH_KEY,
        JSON.stringify({ kind: 'keycloak_required', apiBaseUrl: getResolvedApiBaseUrl() })
      );
    } catch {
      /* quota / private mode */
    }
    return router.parseUrl('/sign-in-failed');
  }

  if (!auth.usesKeycloakAuth()) {
    authDebugLog('guard: Keycloak not enabled in config → allow');
    return true;
  }
  if (auth.isAuthenticated()) {
    authDebugLog('guard: session OK → allow');
    return true;
  }
  if (!auth.isPkceBrowserSupported()) {
    authDebugLog('guard: Keycloak enabled but SubtleCrypto missing (HTTP on non-loopback) → sign-in-failed');
    storeHttpsRequiredFlash();
    return router.parseUrl('/sign-in-failed');
  }
  authDebugLog('guard: no session → login()');
  await auth.login();
  return false;
};
