import { DestroyRef, inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { shouldKeyboardAddFromTarget } from './keyboard-confirm-cancel';

export type KeyboardAddHandler = {
  action: () => void;
  canActivate: () => boolean;
};

/** Registers the active page’s primary add action for the global `+` / Insert shortcut. */
@Injectable({ providedIn: 'root' })
export class KeyboardAddShortcutService {
  private readonly document = inject(DOCUMENT);
  private handler: KeyboardAddHandler | null = null;
  private listening = false;

  register(action: () => void, canActivate: () => boolean): void {
    this.handler = { action, canActivate };
    this.ensureListening();
  }

  unregister(): void {
    this.handler = null;
  }

  private ensureListening(): void {
    if (this.listening || typeof this.document === 'undefined') {
      return;
    }
    this.document.addEventListener('keydown', this.onDocumentKeydown);
    this.listening = true;
  }

  private readonly onDocumentKeydown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardAddFromTarget(event)) {
      return;
    }
    const handler = this.handler;
    if (!handler?.canActivate()) {
      return;
    }
    event.preventDefault();
    handler.action();
  };
}

/** Wire `+` / Insert to a page add button for the component’s lifetime. */
export function registerPageKeyboardAddShortcut(
  destroyRef: DestroyRef,
  service: KeyboardAddShortcutService,
  action: () => void,
  canActivate: () => boolean
): void {
  service.register(action, canActivate);
  destroyRef.onDestroy(() => service.unregister());
}
