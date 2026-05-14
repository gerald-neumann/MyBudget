import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { authDebugLog } from './auth-debug';
import { KeycloakAuthService } from './keycloak-auth.service';

/**
 * When Keycloak is opted in via config.json, every matched route requires an authenticated session.
 * Without that (e.g. only apiBaseUrl on prod), all routes stay open.
 */
export const requireKeycloakAuthGuard: CanActivateFn = async () => {
  const auth = inject(KeycloakAuthService);
  if (!auth.usesKeycloakAuth()) {
    authDebugLog('guard: Keycloak not enabled in config → allow');
    return true;
  }
  if (auth.isAuthenticated()) {
    authDebugLog('guard: session OK → allow');
    return true;
  }
  authDebugLog('guard: no session → login()');
  await auth.login();
  return false;
};
