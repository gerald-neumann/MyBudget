import { describe, expect, it } from 'vitest';

import {
  computeDailyLiquidity,
  dailyLiquidityHasActivity,
  expectedMonthsForPosition
} from './daily-liquidity';

describe('computeDailyLiquidity', () => {
  const expenseCategory = 'expense-cat';

  it('accumulates exact-day expense on scheduled day', () => {
    const days = computeDailyLiquidity({
      year: 2026,
      isIncome: () => false,
      positions: [
        {
          id: 'p1',
          categoryId: expenseCategory,
          cadence: 'Monthly',
          startDate: '2026-01-15',
          plannedAmounts: [{ year: 2026, month: 1, amount: 310 }],
          recurrenceRule: {
            cadence: 'Monthly',
            startDate: '2026-01-15',
            defaultAmount: 310,
            distributionMode: 'ExactDayOfMonth',
            dayOfMonth: 15
          }
        }
      ]
    });

    const hit = days.find((d) => d.date === '2026-01-15');
    expect(hit?.dailyNet).toBe(-310);
    expect(hit?.runningBalance).toBe(-310);
    expect(dailyLiquidityHasActivity(days)).toBe(true);
  });

  it('spreads amount evenly across month days', () => {
    const days = computeDailyLiquidity({
      year: 2026,
      isIncome: () => false,
      positions: [
        {
          id: 'p1',
          categoryId: expenseCategory,
          cadence: 'Monthly',
          startDate: '2026-02-01',
          plannedAmounts: [{ year: 2026, month: 2, amount: 280 }],
          recurrenceRule: {
            cadence: 'Monthly',
            startDate: '2026-02-01',
            defaultAmount: 280,
            distributionMode: 'EvenlyDistributed'
          }
        }
      ]
    });

    const feb = days.filter((d) => d.date.startsWith('2026-02-'));
    const sum = feb.reduce((s, d) => s + d.dailyNet, 0);
    expect(sum).toBeCloseTo(-280, 2);
    expect(feb[0]?.dailyNet).toBeLessThan(0);
  });

  it('skips months outside position end date', () => {
    const months = expectedMonthsForPosition(
      {
        id: 'p1',
        categoryId: expenseCategory,
        cadence: 'Monthly',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        plannedAmounts: []
      },
      2026
    );
    expect(months).toEqual([1, 2, 3]);
  });

  it('uses resolveStoredAmount override for live preview', () => {
    const days = computeDailyLiquidity({
      year: 2026,
      isIncome: () => false,
      positions: [
        {
          id: 'p1',
          categoryId: expenseCategory,
          cadence: 'Monthly',
          startDate: '2026-01-01',
          plannedAmounts: [{ year: 2026, month: 1, amount: 100 }],
          recurrenceRule: {
            cadence: 'Monthly',
            startDate: '2026-01-01',
            defaultAmount: 100,
            distributionMode: 'ExactDayOfMonth',
            dayOfMonth: 1
          }
        }
      ],
      resolveStoredAmount: (id, month) => (id === 'p1' && month === 1 ? 500 : 100)
    });

    expect(days.find((d) => d.date === '2026-01-01')?.dailyNet).toBe(-500);
  });
});
