import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BudgetPageComponent } from './budget-page.component';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import { ViewportService } from '../core/viewport.service';
import { KeyboardAddShortcutService } from '../core/keyboard-add-shortcut.service';

describe('BudgetPageComponent', () => {
  const apiMock = {
    getCategoriesForBaseline: () => of([]),
    getPositions: () => of([]),
    getDailyLiquidity: () => of({ openingBalance: 0, days: [] }),
    upsertPlannedAmounts: () => of([]),
    createPosition: () => of({}),
    updatePosition: () => of({}),
    deletePosition: () => of({}),
    reapplyPositionRecurrenceTemplate: () => of({}),
    createCategory: () => of({})
  };

  const stateMock = {
    selectedBaselineId: signal<string | null>(null),
    selectedYear: signal(2026),
    selectedBaseline: signal<any>(null),
    canManageSelectedBaseline: () => true,
    isSelectedYearOffCalendar: () => false
  };

  const i18nMock = {
    language: signal('en'),
    t: (key: string) => key,
    formatAmount: (value: number) => String(value),
    parseAmount: (raw: string) => {
      const x = Number(raw);
      return Number.isFinite(x) ? x : null;
    },
    formatSignedAmount: (value: number) => String(value),
    compactSignedAmountLabel: (value: number) => String(value),
    signedAmountCellClass: () => '',
    signedAmountTextClass: () => '',
    translateSampleToken: (value: string) => value,
    translateCategoryName: (value: string) => value
  };

  const viewportMock = {
    maxSm: signal(false)
  };

  beforeEach(() => {
    localStorage.removeItem('mybudget.v1.budgetLiquidityFocusMonth');
    TestBed.configureTestingModule({
      providers: [
        { provide: BudgetApiService, useValue: apiMock },
        { provide: BudgetStateService, useValue: stateMock },
        { provide: I18nService, useValue: i18nMock },
        { provide: ViewportService, useValue: viewportMock },
        { provide: KeyboardAddShortcutService, useValue: { register: () => {}, unregister: () => {} } },
        { provide: DOCUMENT, useValue: document }
      ]
    });
  });

  function createComponent(): BudgetPageComponent {
    return TestBed.runInInjectionContext(() => new BudgetPageComponent());
  }

  it('maps daily liquidity points to chart series', () => {
    const component = createComponent();
    const days = [
      { date: '2026-01-01', dailyNet: 10, runningBalance: 110 },
      { date: '2026-01-02', dailyNet: -5, runningBalance: 105 },
      { date: '2026-01-03', dailyNet: 2, runningBalance: 107 }
    ];

    (component as any).applyLiquidityChart(0, days);

    expect(component.liquidityChartReady()).toBe(true);
    expect(component.liquidityChartData.datasets[0].data).toHaveLength(3);
  });

  it('focuses cashflow chart on a month from the table header', () => {
    const component = createComponent();
    component.focusCashflowMonth(7);
    expect(component.liquidityFocusMonth()).toBe(7);
    expect(component.liquidityChartZoom()).toBe('month');
  });

  it('shifts focus month and wraps at year boundaries', () => {
    const component = createComponent();
    component.liquidityFocusMonth.set(12);

    component.shiftCashflowMonth(1);
    expect(component.liquidityFocusMonth()).toBe(1);

    component.shiftCashflowMonth(-1);
    expect(component.liquidityFocusMonth()).toBe(12);
  });

  it('zooms between whole year and a single month', () => {
    const component = createComponent();
    const days = [
      ...Array.from({ length: 31 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        dailyNet: i === 0 ? 100 : 0,
        runningBalance: 100
      })),
      ...Array.from({ length: 28 }, (_, i) => ({
        date: `2026-02-${String(i + 1).padStart(2, '0')}`,
        dailyNet: 0,
        runningBalance: 100
      }))
    ];

    (component as any).applyLiquidityChart(0, days);
    component.liquidityFocusMonth.set(1);
    component.liquidityChartZoom.set('year');
    (component as any).rebuildLiquidityChart();
    expect(component.liquidityChartData.datasets[0].data).toHaveLength(59);

    component.cashflowZoomIn();
    expect(component.liquidityChartZoom()).toBe('month');
    expect(component.liquidityChartData.datasets[0].data).toHaveLength(31);

    component.cashflowZoomOut();
    expect(component.liquidityChartZoom()).toBe('year');
    expect(component.liquidityChartData.datasets[0].data).toHaveLength(59);
  });

  it('persists focus month in local storage', () => {
    const component = createComponent();
    component.shiftCashflowMonth(1);

    expect(localStorage.getItem('mybudget.v1.budgetLiquidityFocusMonth')).toBe(
      String(component.liquidityFocusMonth())
    );
  });
});
