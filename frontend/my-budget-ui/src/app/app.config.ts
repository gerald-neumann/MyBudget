import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { BUDGET_API_BASE_URL, bootstrapApiBaseUrl, getResolvedApiBaseUrl } from './core/api-base-url';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => bootstrapApiBaseUrl
    },
    { provide: BUDGET_API_BASE_URL, useFactory: getResolvedApiBaseUrl },
    provideHttpClient(),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables())
  ]
};
