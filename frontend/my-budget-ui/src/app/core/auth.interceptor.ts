import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { authDebugLog } from './auth-debug';
import { getResolvedApiBaseUrl } from './api-base-url';
import { KeycloakAuthService } from './keycloak-auth.service';

let missingBearerLogRemaining = 12;

/** Same idea as ReSpecT `AuthInterceptor.getTokenForRequest`: attach existing token; only call `updateToken(0)` when none yet. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakAuth = inject(KeycloakAuthService);
  return from(keycloakAuth.getTokenForRequest()).pipe(
    switchMap((token) => {
      if (!token) {
        const api = getResolvedApiBaseUrl();
        if (
          missingBearerLogRemaining > 0 &&
          keycloakAuth.usesKeycloakAuth() &&
          req.url.startsWith(api)
        ) {
          missingBearerLogRemaining--;
          authDebugLog('interceptor: no Bearer token for API request', req.method, req.url);
        }
        return next(req);
      }
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
    })
  );
};
