import { Injectable, computed, signal } from '@angular/core';
import { BudgetBaseline } from './budget.models';

@Injectable({ providedIn: 'root' })
export class BudgetStateService {
  private readonly selectedBaselineStorageKey = 'mybudget.v1.selectedBaselineId';

  readonly baselines = signal<BudgetBaseline[]>([]);
  readonly selectedBaselineId = signal<string | null>(null);
  readonly selectedYear = signal(new Date().getFullYear());

  readonly selectedBaseline = computed(() =>
    this.baselines().find((baseline) => baseline.id === this.selectedBaselineId()) ?? null
  );

  /** Persists workspace choice for the next visit. */
  selectBaseline(id: string | null): void {
    this.selectedBaselineId.set(id);
    if (id) {
      localStorage.setItem(this.selectedBaselineStorageKey, id);
    } else {
      localStorage.removeItem(this.selectedBaselineStorageKey);
    }
  }

  setBaselines(items: BudgetBaseline[]): void {
    this.baselines.set(items);
    const currentId = this.selectedBaselineId();
    const stillValid = !!currentId && items.some((b) => b.id === currentId);
    if (items.length === 0) {
      this.selectedBaselineId.set(null);
      localStorage.removeItem(this.selectedBaselineStorageKey);
      return;
    }
    if (stillValid) {
      return;
    }

    const stored = localStorage.getItem(this.selectedBaselineStorageKey);
    if (stored && items.some((b) => b.id === stored)) {
      this.selectedBaselineId.set(stored);
      return;
    }

    const primaryOwned = items.find(
      (b) => b.myAccess === 'Owner' && b.isPrimaryBudget && !b.isSampleDemo
    );
    const firstOwnedPersonal = items.find((b) => b.myAccess === 'Owner' && !b.isSampleDemo);
    const sampleOwned = items.find((b) => b.myAccess === 'Owner' && b.isSampleDemo);
    const pick = primaryOwned?.id ?? firstOwnedPersonal?.id ?? sampleOwned?.id ?? items[0].id;
    this.selectedBaselineId.set(pick);
    localStorage.setItem(this.selectedBaselineStorageKey, pick);
  }
}
