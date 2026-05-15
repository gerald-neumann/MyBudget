import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { getResolvedApiBaseUrl } from './api-base-url';
import { KeycloakAuthService } from './keycloak-auth.service';
import { SessionExpiredUiService } from './session-expired-ui.service';

/** Set on the single retry after 401 so we never loop. */
export const budgetApi401Retried = new HttpContextToken<boolean>(() => false);

export const apiUnauthorizedRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakAuth = inject(KeycloakAuthService);
  const sessionExpired = inject(SessionExpiredUiService);
  const apiBase = getResolvedApiBaseUrl();

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }
      if (!keycloakAuth.usesKeycloakAuth()) {
        return throwError(() => err);
      }
      if (!req.url.startsWith(apiBase)) {
        return throwError(() => err);
      }
      if (req.context.get(budgetApi401Retried)) {
        sessionExpired.open();
        return throwError(() => err);
      }

      return from(keycloakAuth.refreshTokenAfterUnauthorized()).pipe(
        switchMap((ok) => {
          if (!ok) {
            sessionExpired.open();
            return throwError(() => err);
          }
          const retryReq = req.clone({
            context: req.context.set(budgetApi401Retried, true)
          });
          return next(retryReq).pipe(
            catchError((err2: unknown) => {
              if (err2 instanceof HttpErrorResponse && err2.status === 401) {
                sessionExpired.open();
              }
              return throwError(() => err2);
            })
          );
        })
      );
    })
  );
};
