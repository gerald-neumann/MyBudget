import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import { ActualEntry, BudgetPosition } from '../core/budget.models';

@Component({
  selector: 'app-spendings-page',
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './spendings-page.component.html',
  styleUrl: './spendings-page.component.css'
})
export class SpendingsPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  positions: BudgetPosition[] = [];
  actualEntries: ActualEntry[] = [];
  /** Signal so forkJoin completion always triggers template updates (zone/CD edge cases). */
  readonly loading = signal(false);
  message = '';
  messageType: 'success' | 'error' = 'success';

  newActual = {
    budgetPositionId: '',
    bookedOn: this.toDateInput(new Date()),
    amount: 0,
    note: ''
  };

  /** In-progress text while the new-amount field is focused. */
  private newActualAmountEdit: string | null = null;

  constructor() {
    effect((onCleanup) => {
      const baselineId = this.state.selectedBaselineId();
      const year = this.state.selectedYear();
      if (!baselineId) {
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      const sub = forkJoin({
        positions: this.api.getPositions(baselineId, year),
        actuals: this.api.getActualEntries(baselineId)
        }).subscribe({
          next: (response) => {
            this.loading.set(false);
            this.positions = response.positions;
            this.actualEntries = response.actuals;
          },
          error: () => {
            this.loading.set(false);
            this.setMessage('msg.loadBudgetFailed', 'error');
          }
        });

      onCleanup(() => {
        sub.unsubscribe();
        this.loading.set(false);
      });
    });

    effect(() => {
      this.i18n.language();
      this.newActualAmountEdit = null;
    });
  }

  newActualAmountInputValue(): string {
    if (this.newActualAmountEdit !== null) {
      return this.newActualAmountEdit;
    }
    return this.i18n.formatAmount(this.newActual.amount);
  }

  onNewActualAmountFocus(): void {
    this.newActualAmountEdit = this.i18n.formatAmount(this.newActual.amount);
  }

  onNewActualAmountInput(raw: string): void {
    if (this.newActualAmountEdit !== null) {
      this.newActualAmountEdit = raw;
    }
  }

  onNewActualAmountBlur(): void {
    if (this.newActualAmountEdit === null) {
      return;
    }
    const parsed = this.i18n.parseAmount(this.newActualAmountEdit);
    this.newActualAmountEdit = null;
    if (parsed !== null) {
      this.newActual.amount = parsed;
    }
  }

  addActualEntry(): void {
    const amount = this.effectiveNewActualAmount();
    if (!this.newActual.budgetPositionId || amount <= 0) {
      return;
    }

    this.api
      .createActualEntry({
        budgetPositionId: this.newActual.budgetPositionId,
        bookedOn: this.newActual.bookedOn,
        amount,
        note: this.newActual.note || null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.actualEntries = [entry, ...this.actualEntries];
          this.newActual.amount = 0;
          this.newActualAmountEdit = null;
          this.newActual.note = '';
          this.setMessage('msg.addActualSuccess', 'success');
        },
        error: () => this.setMessage('msg.addActualFailed', 'error')
      });
  }

  private effectiveNewActualAmount(): number {
    if (this.newActualAmountEdit !== null) {
      return this.i18n.parseAmount(this.newActualAmountEdit) ?? this.newActual.amount;
    }
    return this.newActual.amount;
  }

  positionName(positionId: string): string {
    return this.positions.find((item) => item.id === positionId)?.name ?? '-';
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  private setMessage(message: string, type: 'success' | 'error'): void {
    this.message = message;
    this.messageType = type;
  }

  private toDateInput(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
