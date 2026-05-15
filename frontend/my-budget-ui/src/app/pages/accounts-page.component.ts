import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import { ViewportService } from '../core/viewport.service';
import { SwipeDeleteRowDirective } from '../core/swipe-delete-row.directive';
import { Account } from '../core/budget.models';
import {
  KeyboardAddShortcutService,
  registerPageKeyboardAddShortcut
} from '../core/keyboard-add-shortcut.service';
import {
  confirmDiscardUnsavedChanges,
  shouldKeyboardCancelFromTarget,
  shouldKeyboardConfirmFromTarget
} from '../core/keyboard-confirm-cancel';

@Component({
  selector: 'app-accounts-page',
  imports: [CommonModule, FormsModule, SwipeDeleteRowDirective],
  templateUrl: './accounts-page.component.html',
  styleUrl: './accounts-page.component.css'
})
export class AccountsPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  readonly viewport = inject(ViewportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly keyboardAdd = inject(KeyboardAddShortcutService);
  private readonly accountsScroll = viewChild<ElementRef<HTMLElement>>('accountsScroll');

  accounts: Account[] = [];
  readonly loading = signal(false);
  /** Add-account strip behind a toggle on compact viewports. */
  readonly accountsHeaderToolsOpen = signal(false);
  /** Inline create row at the top of the table (same idea as Income & spending). */
  readonly newAccountRowActive = signal(false);
  readonly savingNewAccount = signal(false);
  message = '';
  messageType: 'success' | 'error' = 'success';

  newAccount = {
    name: '',
    typeLabel: '',
    initialBalance: 0
  };
  private newInitialEdit: string | null = null;

  editingId: string | null = null;
  editName = '';
  editTypeLabel = '';
  editInitialBalance = 0;
  editSortOrder = 0;
  private editInitialDraft: string | null = null;

  /** Serialized account row at edit start (dirty check before cancel). */
  private editAccountBaseline = '';

  /** Serialized new-account row at open (dirty check before cancel). */
  private newAccountBaseline = '';

  private loadRequestId = 0;

  constructor() {
    registerPageKeyboardAddShortcut(
      this.destroyRef,
      this.keyboardAdd,
      () => this.openNewAccountRow(),
      () => this.canKeyboardAddAccount()
    );

    effect((onCleanup) => {
      const baselineId = this.state.selectedBaselineId();
      if (!baselineId) {
        this.accounts = [];
        this.loading.set(false);
        this.forceCancelEdit();
        this.forceCancelNewAccountRow();
        return;
      }

      this.forceCancelEdit();
      this.forceCancelNewAccountRow();

      const id = ++this.loadRequestId;
      this.loading.set(true);
      const sub = this.api
        .getAccounts(baselineId)
        .pipe(take(1))
        .subscribe({
          next: (rows) => {
            if (id !== this.loadRequestId) {
              return;
            }
            this.accounts = rows;
            this.loading.set(false);
          },
          error: () => {
            if (id !== this.loadRequestId) {
              return;
            }
            this.loading.set(false);
            this.setMessage('accounts.loadFailed', 'error');
          }
        });

      onCleanup(() => sub.unsubscribe());
    });

    const onAccountsPointerDownCapture = (ev: Event) => this.onDocumentPointerDownAccountsCancel(ev);
    this.documentRef.addEventListener('pointerdown', onAccountsPointerDownCapture, true);
    this.destroyRef.onDestroy(() => this.documentRef.removeEventListener('pointerdown', onAccountsPointerDownCapture, true));
  }

  canManageAccounts(): boolean {
    return this.state.canManageSelectedBaseline();
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  newInitialInputValue(): string {
    if (this.newInitialEdit !== null) {
      return this.newInitialEdit;
    }
    return this.i18n.formatAmount(this.newAccount.initialBalance);
  }

  onNewInitialFocus(): void {
    this.newInitialEdit = this.i18n.formatAmount(this.newAccount.initialBalance);
  }

  onNewInitialInput(raw: string): void {
    if (this.newInitialEdit !== null) {
      this.newInitialEdit = raw;
    }
  }

  private flushNewInitialDraft(): void {
    if (this.newInitialEdit === null) {
      return;
    }
    const parsed = this.i18n.parseAmount(this.newInitialEdit);
    this.newInitialEdit = null;
    if (parsed !== null) {
      this.newAccount.initialBalance = parsed;
    }
  }

  onNewInitialBlur(): void {
    this.flushNewInitialDraft();
  }

  editInitialInputValue(): string {
    if (this.editInitialDraft !== null) {
      return this.editInitialDraft;
    }
    return this.i18n.formatAmount(this.editInitialBalance);
  }

  onEditInitialFocus(): void {
    this.editInitialDraft = this.i18n.formatAmount(this.editInitialBalance);
  }

  onEditInitialInput(raw: string): void {
    if (this.editInitialDraft !== null) {
      this.editInitialDraft = raw;
    }
  }

  onEditInitialBlur(): void {
    if (this.editInitialDraft === null) {
      return;
    }
    const parsed = this.i18n.parseAmount(this.editInitialDraft);
    this.editInitialDraft = null;
    if (parsed !== null) {
      this.editInitialBalance = parsed;
    }
  }

  private effectiveNewInitial(): number {
    if (this.newInitialEdit !== null) {
      return this.i18n.parseAmount(this.newInitialEdit) ?? this.newAccount.initialBalance;
    }
    return this.newAccount.initialBalance;
  }

  /** Same guards as the accounts “add” toolbar button (for the `+` shortcut). */
  canKeyboardAddAccount(): boolean {
    return (
      !!this.state.selectedBaselineId() &&
      this.canManageAccounts() &&
      !this.newAccountRowActive() &&
      !this.savingNewAccount()
    );
  }

  openNewAccountRow(): void {
    if (!this.canKeyboardAddAccount()) {
      return;
    }
    this.tryCancelEdit();
    this.newAccount = { name: '', typeLabel: '', initialBalance: 0 };
    this.newInitialEdit = null;
    this.captureNewAccountBaseline();
    this.newAccountRowActive.set(true);
    queueMicrotask(() => {
      const el = this.accountsScroll()?.nativeElement;
      if (el) {
        el.scrollTop = 0;
      }
    });
  }

  cancelNewAccountRow(ev?: Event): void {
    ev?.stopPropagation();
    if (this.savingNewAccount()) {
      return;
    }
    this.tryCancelNewAccountRow();
  }

  tryCancelNewAccountRow(): boolean {
    if (!this.newAccountRowActive()) {
      return true;
    }
    this.flushNewInitialDraft();
    if (!this.isNewAccountDirty()) {
      this.forceCancelNewAccountRow();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.t('budget.discardUnsavedEditConfirm'))) {
      this.forceCancelNewAccountRow();
      return true;
    }
    return false;
  }

  private forceCancelNewAccountRow(): void {
    this.newAccountRowActive.set(false);
    this.newAccount = { name: '', typeLabel: '', initialBalance: 0 };
    this.newInitialEdit = null;
    this.newAccountBaseline = '';
  }

  confirmNewAccountRow(ev?: Event): void {
    ev?.stopPropagation();
    if (!this.newAccountRowActive() || this.savingNewAccount()) {
      return;
    }
    this.flushNewInitialDraft();
    const name = this.newAccount.name.trim();
    if (!name) {
      this.setMessage('accounts.nameRequired', 'error');
      return;
    }
    this.submitNewAccount();
  }

  private submitNewAccount(): void {
    this.flushNewInitialDraft();
    const name = this.newAccount.name.trim();
    const baselineId = this.state.selectedBaselineId();
    if (!name || this.savingNewAccount() || !baselineId) {
      return;
    }
    const initial = this.effectiveNewInitial();
    this.savingNewAccount.set(true);
    this.api
      .createAccount({
        baselineId,
        name,
        typeLabel: this.newAccount.typeLabel.trim() || null,
        initialBalance: initial,
        sortOrder: 0
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingNewAccount.set(false))
      )
      .subscribe({
        next: () => {
          this.setMessage('accounts.createSuccess', 'success');
          this.forceCancelNewAccountRow();
          this.loadAccounts();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 409) {
            this.setMessage('accounts.createConflict', 'error');
          } else {
            this.setMessage('accounts.createFailed', 'error');
          }
        }
      });
  }

  private effectiveEditInitial(): number {
    if (this.editInitialDraft !== null) {
      return this.i18n.parseAmount(this.editInitialDraft) ?? this.editInitialBalance;
    }
    return this.editInitialBalance;
  }

  loadAccounts(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId) {
      this.accounts = [];
      return;
    }
    const id = ++this.loadRequestId;
    this.loading.set(true);
    this.api
      .getAccounts(baselineId)
      .pipe(take(1))
      .subscribe({
        next: (rows) => {
          if (id !== this.loadRequestId) {
            return;
          }
          this.accounts = rows;
          this.loading.set(false);
        },
        error: () => {
          if (id !== this.loadRequestId) {
            return;
          }
          this.loading.set(false);
          this.setMessage('accounts.loadFailed', 'error');
        }
      });
  }

  startEdit(row: Account): void {
    if (!this.canManageAccounts()) {
      return;
    }
    if (this.savingNewAccount()) {
      return;
    }
    if (this.newAccountRowActive()) {
      this.tryCancelNewAccountRow();
    }
    this.editingId = row.id;
    this.editName = row.name;
    this.editTypeLabel = row.typeLabel?.trim() ?? '';
    this.editInitialBalance = row.initialBalance;
    this.editSortOrder = row.sortOrder;
    this.editInitialDraft = null;
    this.captureEditAccountBaseline();
  }

  cancelEdit(): void {
    this.tryCancelEdit();
  }

  tryCancelEdit(): boolean {
    if (!this.editingId) {
      return true;
    }
    if (this.editInitialDraft !== null) {
      const parsed = this.i18n.parseAmount(this.editInitialDraft);
      if (parsed !== null) {
        this.editInitialBalance = parsed;
      }
      this.editInitialDraft = null;
    }
    if (!this.isAccountEditDirty()) {
      this.forceCancelEdit();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.t('budget.discardUnsavedEditConfirm'))) {
      this.forceCancelEdit();
      return true;
    }
    return false;
  }

  private forceCancelEdit(): void {
    this.editingId = null;
    this.editInitialDraft = null;
    this.editAccountBaseline = '';
  }

  private captureEditAccountBaseline(): void {
    this.editAccountBaseline = this.serializeAccountEditState();
  }

  private captureNewAccountBaseline(): void {
    this.newAccountBaseline = this.serializeNewAccountState();
  }

  private isAccountEditDirty(): boolean {
    if (!this.editingId || !this.editAccountBaseline) {
      return false;
    }
    return this.serializeAccountEditState() !== this.editAccountBaseline;
  }

  private isNewAccountDirty(): boolean {
    if (!this.newAccountBaseline) {
      return false;
    }
    return this.serializeNewAccountState() !== this.newAccountBaseline;
  }

  private serializeAccountEditState(): string {
    return JSON.stringify({
      name: this.editName.trim(),
      typeLabel: this.editTypeLabel.trim(),
      initialBalance: this.editInitialBalance
    });
  }

  private serializeNewAccountState(): string {
    return JSON.stringify({
      name: this.newAccount.name.trim(),
      typeLabel: this.newAccount.typeLabel.trim(),
      initialBalance: this.effectiveNewInitial()
    });
  }

  accountsActionsColumnExpanded(): boolean {
    return this.newAccountRowActive() || this.editingId !== null;
  }

  swipeDeleteAccountRowEnabled(row: Account): boolean {
    return (
      this.viewport.maxSm() &&
      this.canManageAccounts() &&
      this.editingId !== row.id &&
      !this.savingNewAccount()
    );
  }

  /** Click outside the active new/edit row: same outcome as Escape on that row. Primary button only. */
  onDocumentPointerDownAccountsCancel(ev: Event): void {
    if (!(ev instanceof PointerEvent) || ev.button !== 0) {
      return;
    }
    const target = ev.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('.accounts-row-editing')) {
      return;
    }
    if (!this.editingId && !this.newAccountRowActive()) {
      return;
    }

    if (this.editingId) {
      if (this.editInitialDraft !== null) {
        const parsed = this.i18n.parseAmount(this.editInitialDraft);
        if (parsed !== null) {
          this.editInitialBalance = parsed;
        }
        this.editInitialDraft = null;
      }
      if (this.isAccountEditDirty()) {
        ev.preventDefault();
      }
      const row = this.accounts.find((a) => a.id === this.editingId);
      if (!row || !this.dismissAccountsRowInlineLikeEscape(row)) {
        return;
      }
    }
    if (this.newAccountRowActive()) {
      this.flushNewInitialDraft();
      if (this.isNewAccountDirty()) {
        ev.preventDefault();
      }
      if (!this.dismissAccountsRowInlineLikeEscape()) {
        return;
      }
    }
  }

  onAccountDisplayRowClick(event: Event, row: Account): void {
    const t = event.target;
    if (!(t instanceof HTMLElement) || t.closest('button, a, input, select, textarea, label')) {
      return;
    }
    if (this.editingId === row.id) {
      return;
    }
    this.startEdit(row);
  }

  /** Enter on new/edit row confirms via the same action buttons. */
  onAccountsTableRowEnterConfirm(event: Event, row?: Account): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmFromTarget(event)) {
      return;
    }
    if (row) {
      if (this.editingId !== row.id) {
        return;
      }
    } else if (!this.newAccountRowActive()) {
      return;
    }
    event.preventDefault();
    if (row) {
      this.onEditInitialBlur();
      this.saveEdit();
    } else {
      this.confirmNewAccountRow();
    }
  }

  /** Escape on new/edit row cancels via the same action buttons. */
  /** Escape on new/edit row cancels (same logic as {@link dismissAccountsRowInlineLikeEscape}). */
  onAccountsTableRowEscapeCancel(event: Event, row?: Account): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event)) {
      return;
    }
    if (row) {
      if (this.editingId !== row.id) {
        return;
      }
    } else if (!this.newAccountRowActive()) {
      return;
    }
    event.preventDefault();
    void this.dismissAccountsRowInlineLikeEscape(row);
  }

  /** Same outcome as Escape on the new/edit account row (shared with pointer-outside). */
  private dismissAccountsRowInlineLikeEscape(row?: Account): boolean {
    if (row) {
      if (this.editingId !== row.id) {
        return true;
      }
      return this.tryCancelEdit();
    }
    if (!this.newAccountRowActive()) {
      return true;
    }
    return this.tryCancelNewAccountRow();
  }

  saveEdit(): void {
    if (!this.editingId) {
      return;
    }
    const name = this.editName.trim();
    if (!name) {
      return;
    }
    const initial = this.effectiveEditInitial();

    this.api
      .updateAccount(this.editingId, {
        name,
        typeLabel: this.editTypeLabel.trim() || null,
        initialBalance: initial,
        sortOrder: this.editSortOrder
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.forceCancelEdit();
          this.setMessage('accounts.updateSuccess', 'success');
          this.loadAccounts();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 409) {
            this.setMessage('accounts.updateConflict', 'error');
          } else {
            this.setMessage('accounts.updateFailed', 'error');
          }
        }
      });
  }

  deleteAccount(row: Account): void {
    if (!this.canManageAccounts()) {
      return;
    }
    if (!confirm(this.t('accounts.confirmDelete'))) {
      return;
    }
    this.api
      .deleteAccount(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setMessage('accounts.deleteSuccess', 'success');
          this.loadAccounts();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 409) {
            this.setMessage('accounts.deleteConflict', 'error');
          } else {
            this.setMessage('accounts.deleteFailed', 'error');
          }
        }
      });
  }

  private setMessage(message: string, type: 'success' | 'error'): void {
    this.message = message;
    this.messageType = type;
  }
}
