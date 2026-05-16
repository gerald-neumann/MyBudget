import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, throwError } from 'rxjs';

import { authDebugLog } from './auth-debug';
import { getResolvedApiBaseUrl, isAnonymousApiRequestUrl } from './api-base-url';
import { KeycloakAuthService } from './keycloak-auth.service';

let missingBearerLogRemaining = 12;

/** Attaches Bearer token after `getTokenForRequest()` refreshes it when needed (idle / near expiry). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakAuth = inject(KeycloakAuthService);
  return from(keycloakAuth.getTokenForRequest()).pipe(
    switchMap((token) => {
      if (!token) {
        const api = getResolvedApiBaseUrl();
        const protectedApiCall =
          keycloakAuth.usesKeycloakAuth()
          && req.url.startsWith(api)
          && !isAnonymousApiRequestUrl(req.url);

        if (protectedApiCall) {
          authDebugLog('interceptor: blocked API request without Bearer token', req.method, req.url);
          queueMicrotask(() => void keycloakAuth.login());
          return throwError(() => new Error('Missing Bearer token for protected API request.'));
        }

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
