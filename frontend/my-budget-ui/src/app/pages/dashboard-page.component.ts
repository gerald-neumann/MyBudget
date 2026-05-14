import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { forkJoin, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { BaselineComparisonPoint, CategoryMonthlySpendSeries, MonthlyCashflowPoint } from '../core/budget.models';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css'
})
export class DashboardPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  /** Signal so chart forkJoin completion always updates the template. */
  readonly loading = signal(false);
  /** True only after a successful /reports load; defers `baseChart` mount so the first `render()` gets real data (avoids empty mixed bar+line then `Object.assign`+`update` bug in ng2-charts). */
  readonly chartDataReady = signal(false);
  readonly chartsLoadFailed = signal(false);
  compareBaselineId = '';
  comparisonRows: BaselineComparisonPoint[] = [];

  comparisonYearTotals(): { base: number; compare: number; delta: number } {
    let base = 0;
    let compare = 0;
    let delta = 0;
    for (const r of this.comparisonRows) {
      base += r.basePlanned;
      compare += r.comparePlanned;
      delta += r.delta;
    }
    return { base, compare, delta };
  }

  cashflowNoIncome = false;

  cashflowChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  cashflowChartOptions: ChartConfiguration['options'] = {};

  expenseStackChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  expenseStackChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false
  };

  yearlyChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  categoryChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };

  barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    layout: { padding: 6 },
    plugins: {
      legend: {
        labels: { boxWidth: 10, padding: 6, font: { size: 10 } }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = Number(ctx.raw);
            return `${ctx.dataset.label ?? ''}: ${this.formatEur(v)}`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          font: { size: 10 },
          callback: (tickValue) => this.compactEurLabel(Number(tickValue))
        },
        grid: { color: 'rgba(148, 163, 184, 0.25)' }
      },
      y: {
        ticks: { font: { size: 10 } }
      }
    }
  };

  constructor() {
    effect((onCleanup) => {
      this.i18n.language();
      const baselineId = this.state.selectedBaselineId();
      const year = this.state.selectedYear();
      if (!baselineId) {
        this.loading.set(false);
        this.chartDataReady.set(false);
        this.chartsLoadFailed.set(false);
        return;
      }

      this.comparisonRows = [];
      this.compareBaselineId = '';

      const sub = this.subscribeChartsLoad(baselineId, year);
      onCleanup(() => sub.unsubscribe());
    });
  }

  loadComparison(): void {
    const baseId = this.state.selectedBaselineId();
    const compareId = this.compareBaselineId;
    const year = this.state.selectedYear();
    if (!baseId || !compareId) {
      return;
    }

    this.api
      .compareBaselines(baseId, compareId, year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.comparisonRows = rows;
        },
        error: () => {
          this.comparisonRows = [];
        }
      });
  }

  seriesLabel(series: CategoryMonthlySpendSeries): string {
    return series.categoryId == null ? this.t('dashboard.cashflowOther') : this.i18n.translateCategoryName(series.category);
  }

  /** Returns a subscription owned by the caller (e.g. effect `onCleanup`) so in-flight loads cannot overwrite a newer baseline/year. */
  private subscribeChartsLoad(baselineId: string, year: number): Subscription {
    this.loading.set(true);
    this.chartsLoadFailed.set(false);
    this.chartDataReady.set(false);

    return forkJoin({
      cashflow: this.api.getMonthlyCashflow(baselineId, year),
      yearly: this.api.getYearlySummary(baselineId, year - 2, year),
      category: this.api.getCategorySummary(baselineId, year)
    }).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.chartsLoadFailed.set(false);

        const months = response.cashflow.months;
        this.cashflowNoIncome = months.every((m) => m.incomePlanned === 0 && m.incomeActual === 0);

        this.applyCashflowCharts(months);
        this.applyExpenseStackChart(response.cashflow.expenseSeries);

        this.yearlyChartData = {
          labels: response.yearly.map((item) => `${item.year}`),
          datasets: [
            { label: this.t('dashboard.planned'), data: response.yearly.map((item) => item.planned), backgroundColor: '#334155' },
            { label: this.t('dashboard.actual'), data: response.yearly.map((item) => item.actual), backgroundColor: '#06b6d4' }
          ]
        };

        this.categoryChartData = {
          labels: response.category.map((item) => this.i18n.translateCategoryName(item.category)),
          datasets: [
            { label: this.t('dashboard.planned'), data: response.category.map((item) => item.planned), backgroundColor: '#475569' },
            { label: this.t('dashboard.actual'), data: response.category.map((item) => item.actual), backgroundColor: '#0e7490' }
          ]
        };

        this.chartDataReady.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.chartDataReady.set(false);
        this.chartsLoadFailed.set(true);
      }
    });
  }

  private applyCashflowCharts(months: MonthlyCashflowPoint[]): void {
    const labels = months.map((m) => this.t(`monthShort.${m.month}`));
    const income = months.map((m) => m.incomeActual);
    const spending = months.map((m) => m.expenseActual);
    const net = months.map((m) => m.incomeActual - m.expenseActual);

    this.cashflowChartData = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: this.t('dashboard.cashflowIncome'),
          data: income,
          backgroundColor: 'rgba(5, 150, 105, 0.85)',
          borderColor: '#047857',
          borderWidth: 1,
          order: 2
        },
        {
          type: 'bar',
          label: this.t('dashboard.cashflowSpending'),
          data: spending,
          backgroundColor: 'rgba(225, 29, 72, 0.75)',
          borderColor: '#be123c',
          borderWidth: 1,
          order: 2
        },
        {
          type: 'line',
          label: this.t('dashboard.cashflowNet'),
          data: net,
          borderColor: '#6d28d9',
          backgroundColor: 'rgba(109, 40, 217, 0.12)',
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 4,
          order: 1,
          yAxisID: 'y'
        }
      ]
    };

    this.cashflowChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 6 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 10, padding: 6, font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw);
              return `${ctx.dataset.label ?? ''}: ${this.formatEur(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            callback: (v) => this.compactEurLabel(Number(v))
          },
          grid: { color: 'rgba(148, 163, 184, 0.25)' }
        }
      }
    };
  }

  private applyExpenseStackChart(series: CategoryMonthlySpendSeries[]): void {
    const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => this.t(`monthShort.${m}`));

    this.expenseStackChartData = {
      labels,
      datasets: series.map((cat, index) => ({
        label: this.seriesLabel(cat),
        data: cat.monthlyActuals,
        backgroundColor: this.categoryColor(index),
        borderWidth: 0,
        stack: 'spend'
      }))
    };

    this.expenseStackChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 6 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 8, padding: 4, font: { size: 9 } }
        },
        tooltip: {
          filter: (item) => Number(item.raw) !== 0,
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw);
              return `${ctx.dataset.label ?? ''}: ${this.formatEur(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            callback: (v) => this.compactEurLabel(Number(v))
          }
        }
      }
    };
  }

  private categoryColor(index: number): string {
    const hue = (index * 41 + 12) % 360;
    return `hsla(${hue}, 58%, 48%, 0.88)`;
  }

  private formatEur(value: number): string {
    return this.i18n.formatSignedAmount(value);
  }

  private compactEurLabel(value: number): string {
    return this.i18n.compactSignedAmountLabel(value);
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  monthLabel(month: number): string {
    return this.t(`monthShort.${month}`);
  }
}
