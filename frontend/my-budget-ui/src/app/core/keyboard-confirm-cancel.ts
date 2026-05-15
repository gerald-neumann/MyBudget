/** Enter / Return — same as primary confirm (OK, green check). */
export function isKeyboardConfirm(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && !event.repeat;
}

/** Escape — same as cancel / discard (xmark). */
export function isKeyboardCancel(event: KeyboardEvent): boolean {
  return event.key === 'Escape' && !event.repeat;
}

/** Plus / numpad plus — same as the page primary “add” action (violet + button). */
export function isKeyboardAdd(event: KeyboardEvent): boolean {
  return !event.repeat && (event.key === '+' || event.code === 'NumpadAdd');
}

function isTextEntryElement(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return type !== 'button' && type !== 'submit' && type !== 'reset' && type !== 'checkbox' && type !== 'radio';
  }
  return el.isContentEditable;
}

/**
 * Whether + should run the page add action.
 * Skips text fields, dialogs, and modified keys (Ctrl/Cmd/Alt); Shift is allowed (needed for + on many layouts).
 */
export function shouldKeyboardAddFromTarget(event: KeyboardEvent): boolean {
  if (!isKeyboardAdd(event)) {
    return false;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  const t = event.target;
  if (!(t instanceof HTMLElement)) {
    return false;
  }
  if (t.closest('[role="dialog"]')) {
    return false;
  }
  if (isTextEntryElement(t)) {
    return false;
  }
  return true;
}

/**
 * Whether Enter should run the row/sheet confirm action.
 * Skips when focus is on a button (native button activation still applies).
 */
export function shouldKeyboardConfirmFromTarget(event: KeyboardEvent): boolean {
  if (!isKeyboardConfirm(event)) {
    return false;
  }
  const t = event.target;
  if (!(t instanceof HTMLElement)) {
    return false;
  }
  if (t.closest('button')) {
    return false;
  }
  if (t instanceof HTMLTextAreaElement) {
    return false;
  }
  return true;
}

/**
 * Whether Escape should cancel (row, sheet, or modal).
 * Unlike Enter, Escape always dismisses — even when a button is focused.
 */
export function shouldKeyboardCancelFromTarget(event: KeyboardEvent): boolean {
  return isKeyboardCancel(event);
}

/** Alias for dialog/modal templates — same rules as {@link shouldKeyboardCancelFromTarget}. */
export function shouldKeyboardCancelForModal(event: KeyboardEvent): boolean {
  return shouldKeyboardCancelFromTarget(event);
}

/** Enter on a modal dialog (skips buttons and textareas). */
export function shouldKeyboardConfirmForModal(event: KeyboardEvent): boolean {
  return shouldKeyboardConfirmFromTarget(event);
}

/** Ask before discarding unsaved edits (Cancel / Escape). Returns true if the user chose to discard. */
export function confirmDiscardUnsavedChanges(message: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.confirm(message);
}
