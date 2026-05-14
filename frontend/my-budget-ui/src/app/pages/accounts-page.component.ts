import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BudgetApiService } from '../core/budget-api.service';
import { I18nService } from '../core/i18n.service';
import { Account } from '../core/budget.models';

@Component({
  selector: 'app-accounts-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './accounts-page.component.html',
  styleUrl: './accounts-page.component.css'
})
export class AccountsPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountsScroll = viewChild<ElementRef<HTMLElement>>('accountsScroll');

  accounts: Account[] = [];
  readonly loading = signal(false);
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
  private newAccountSnapshot = '';

  editingId: string | null = null;
  editName = '';
  editTypeLabel = '';
  editInitialBalance = 0;
  editSortOrder = 0;
  private editInitialDraft: string | null = null;

  private loadRequestId = 0;

  constructor() {
    this.loadAccounts();
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
    if (this.newAccountRowActive()) {
      this.tryCommitNewAccountOnBlur();
    }
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

  openNewAccountRow(): void {
    this.cancelEdit();
    this.newAccount = { name: '', typeLabel: '', initialBalance: 0 };
    this.newInitialEdit = null;
    this.newAccountRowActive.set(true);
    this.captureNewAccountSnapshot();
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
    this.newAccountRowActive.set(false);
    this.newAccount = { name: '', typeLabel: '', initialBalance: 0 };
    this.newInitialEdit = null;
  }

  tryCommitNewAccountOnBlur(): void {
    if (!this.newAccountRowActive() || this.savingNewAccount()) {
      return;
    }
    this.flushNewInitialDraft();
    if (!this.isNewAccountDirty()) {
      return;
    }
    const name = this.newAccount.name.trim();
    if (!name) {
      this.setMessage('accounts.nameRequired', 'error');
      return;
    }
    this.submitNewAccount();
  }

  private captureNewAccountSnapshot(): void {
    this.flushNewInitialDraft();
    this.newAccountSnapshot = this.serializeNewAccountState();
  }

  private serializeNewAccountState(): string {
    return JSON.stringify({
      name: this.newAccount.name.trim(),
      typeLabel: this.newAccount.typeLabel.trim(),
      initialBalance: this.effectiveNewInitial()
    });
  }

  private isNewAccountDirty(): boolean {
    return this.serializeNewAccountState() !== this.newAccountSnapshot;
  }

  private submitNewAccount(): void {
    this.flushNewInitialDraft();
    const name = this.newAccount.name.trim();
    if (!name || this.savingNewAccount()) {
      return;
    }
    const initial = this.effectiveNewInitial();
    this.savingNewAccount.set(true);
    this.api
      .createAccount({
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
          this.newAccount = { name: '', typeLabel: '', initialBalance: 0 };
          this.newInitialEdit = null;
          this.newAccountRowActive.set(false);
          this.setMessage('accounts.createSuccess', 'success');
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
    const id = ++this.loadRequestId;
    this.loading.set(true);
    this.api
      .getAccounts()
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
    if (this.savingNewAccount()) {
      return;
    }
    if (this.newAccountRowActive()) {
      this.cancelNewAccountRow();
    }
    this.editingId = row.id;
    this.editName = row.name;
    this.editTypeLabel = row.typeLabel?.trim() ?? '';
    this.editInitialBalance = row.initialBalance;
    this.editSortOrder = row.sortOrder;
    this.editInitialDraft = null;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editInitialDraft = null;
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
          this.cancelEdit();
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
