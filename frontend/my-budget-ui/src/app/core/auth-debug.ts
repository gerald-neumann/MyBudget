/** Verbose auth / Keycloak logging: set `keycloak.debug: true` in config.json. */

let keycloakDebugFromConfig = false;

export function setKeycloakDebugFromConfig(enabled: boolean): void {
  keycloakDebugFromConfig = enabled;
}

export function isKeycloakAuthDebug(): boolean {
  return keycloakDebugFromConfig;
}

export function authDebugLog(...args: unknown[]): void {
  if (isKeycloakAuthDebug()) {
    // eslint-disable-next-line no-console
    console.info('[MyBudget:Auth]', ...args);
  }
}
