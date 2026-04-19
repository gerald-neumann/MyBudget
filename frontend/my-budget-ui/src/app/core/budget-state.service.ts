import { Injectable, computed, signal } from '@angular/core';
import { BudgetBaseline } from './budget.models';

@Injectable({ providedIn: 'root' })
export class BudgetStateService {
  readonly baselines = signal<BudgetBaseline[]>([]);
  readonly selectedBaselineId = signal<string | null>(null);
  readonly selectedYear = signal(new Date().getFullYear());

  readonly selectedBaseline = computed(() =>
    this.baselines().find((baseline) => baseline.id === this.selectedBaselineId()) ?? null
  );

  setBaselines(items: BudgetBaseline[]): void {
    this.baselines.set(items);
    const currentId = this.selectedBaselineId();
    const stillValid = !!currentId && items.some((b) => b.id === currentId);
    if (items.length === 0) {
      this.selectedBaselineId.set(null);
      return;
    }
    if (!stillValid) {
      this.selectedBaselineId.set(items[0].id);
    }
  }
}
