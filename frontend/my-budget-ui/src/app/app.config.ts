import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { apiUnauthorizedRetryInterceptor } from './core/api-unauthorized-retry.interceptor';
import { authInterceptor } from './core/auth.interceptor';
import { BUDGET_API_BASE_URL, bootstrapApiBaseUrl, getResolvedApiBaseUrl } from './core/api-base-url';
import { KeycloakAuthService } from './core/keycloak-auth.service';
import { routes } from './app.routes';

/** Loads `config.json` first, then Keycloak (if enabled in that config). Order is guaranteed. */
function initRuntimeConfigThenKeycloak(keycloakAuth: KeycloakAuthService) {
  return () => bootstrapApiBaseUrl().then(() => keycloakAuth.initialize());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: initRuntimeConfigThenKeycloak,
      deps: [KeycloakAuthService]
    },
    { provide: BUDGET_API_BASE_URL, useFactory: getResolvedApiBaseUrl },
    provideHttpClient(withInterceptors([apiUnauthorizedRetryInterceptor, authInterceptor])),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables())
  ]
};
