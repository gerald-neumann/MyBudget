import { InjectionToken } from '@angular/core';

export const BUDGET_API_BASE_URL = new InjectionToken<string>('BUDGET_API_BASE_URL');

let resolvedApiBaseUrl = 'http://localhost:5256';

export function bootstrapApiBaseUrl(): Promise<void> {
  return fetch('/config.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((c: { apiBaseUrl?: string }) => {
      if (c?.apiBaseUrl?.trim()) {
        resolvedApiBaseUrl = c.apiBaseUrl.trim().replace(/\/$/, '');
      }
    })
    .catch(() => void 0);
}

export function getResolvedApiBaseUrl(): string {
  return resolvedApiBaseUrl;
}
