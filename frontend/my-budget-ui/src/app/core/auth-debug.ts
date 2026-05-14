import { isDevMode } from '@angular/core';

/** Verbose auth / Keycloak logging: `ng serve` (isDevMode) or `keycloak.debug` in config.json. */

let keycloakDebugFromConfig = false;

export function setKeycloakDebugFromConfig(enabled: boolean): void {
  keycloakDebugFromConfig = enabled;
}

export function isKeycloakAuthDebug(): boolean {
  return keycloakDebugFromConfig || isDevMode();
}

export function authDebugLog(...args: unknown[]): void {
  if (isKeycloakAuthDebug()) {
    // eslint-disable-next-line no-console
    console.info('[MyBudget:Auth]', ...args);
  }
}
