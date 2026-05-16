/**
 * After focus, select the full value so typing replaces formatted amounts (e.g. 0,00 → 120).
 * Uses microtask + one-shot mouseup so a click does not leave the caret at the start.
 */
export function selectAllOnFocusedNumericInput(): void {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!(el instanceof HTMLInputElement)) {
    return;
  }
  const selectAll = (): void => {
    el.select();
  };
  el.addEventListener('mouseup', selectAll, { once: true });
  queueMicrotask(selectAll);
}
