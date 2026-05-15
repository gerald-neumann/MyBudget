import { Injectable, signal } from '@angular/core';

/** Drives the global “session expired” modal after unrecoverable 401s (Keycloak). */
@Injectable({ providedIn: 'root' })
export class SessionExpiredUiService {
  readonly modalOpen = signal(false);

  open(): void {
    if (!this.modalOpen()) {
      this.modalOpen.set(true);
    }
  }

  close(): void {
    this.modalOpen.set(false);
  }
}
