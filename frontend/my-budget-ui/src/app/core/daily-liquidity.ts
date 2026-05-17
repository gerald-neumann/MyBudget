import {
  BudgetCadence,
  BudgetDistributionMode,
  BudgetRecurrenceRule,
  DailyLiquidityPoint
} from './budget.models';

export interface DailyLiquidityPlannedMonth {
  year: number;
  month: number;
  amount: number;
}

export interface DailyLiquidityPositionInput {
  id: string;
  categoryId: string;
  cadence: BudgetCadence;
  startDate: string;
  endDate?: string | null;
  plannedAmounts: DailyLiquidityPlannedMonth[];
  recurrenceRule?: BudgetRecurrenceRule | null;
}

export interface DailyLiquidityComputeInput {
  year: number;
  positions: DailyLiquidityPositionInput[];
  isIncome: (categoryId: string) => boolean;
  /** Stored magnitude (API shape) for each active month. */
  resolveStoredAmount?: (positionId: string, month: number) => number;
}

export function computeDailyLiquidity(input: DailyLiquidityComputeInput): DailyLiquidityPoint[] {
  const dailyNet = new Map<string, number>();

  for (const position of input.positions) {
    const isIncome = input.isIncome(position.categoryId);
    const rule = position.recurrenceRule;
    const distributionMode: BudgetDistributionMode = rule?.distributionMode ?? 'ExactDayOfMonth';
    const startDay = parseIsoDay(position.startDate);
    const configuredDay = rule?.dayOfMonth ?? startDay;

    for (const month of expectedMonthsForPosition(position, input.year)) {
      const stored = input.resolveStoredAmount
        ? input.resolveStoredAmount(position.id, month)
        : (position.plannedAmounts.find((p) => p.year === input.year && p.month === month)?.amount ?? 0);
      if (stored === 0) {
        continue;
      }
      const signedAmount = isIncome ? stored : -stored;
      if (distributionMode === 'EvenlyDistributed') {
        distributeEvenly(dailyNet, input.year, month, signedAmount);
        continue;
      }
      const day = scheduledDayOfMonth(input.year, month, configuredDay);
      const date = isoDate(input.year, month, day);
      dailyNet.set(date, (dailyNet.get(date) ?? 0) + signedAmount);
    }
  }

  const rows: DailyLiquidityPoint[] = [];
  let runningBalance = 0;
  const end = new Date(input.year, 11, 31);
  for (let cursor = new Date(input.year, 0, 1); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = localIsoDate(cursor);
    const delta = dailyNet.get(date) ?? 0;
    runningBalance += delta;
    rows.push({ date, dailyNet: delta, runningBalance });
  }
  return rows;
}

export function dailyLiquidityHasActivity(days: DailyLiquidityPoint[]): boolean {
  return days.some((d) => d.dailyNet !== 0);
}

export function expectedMonthsForPosition(position: DailyLiquidityPositionInput, year: number): number[] {
  const start = parseIsoParts(position.startDate);
  const end = position.endDate ? parseIsoParts(position.endDate) : null;
  if (!start || start.year > year) {
    return [];
  }
  if (end && end.year < year) {
    return [];
  }

  const firstMonth = start.year === year ? start.month : 1;
  const lastMonth = end && end.year === year ? end.month : 12;
  if (firstMonth > lastMonth) {
    return [];
  }

  const cadence = position.recurrenceRule?.cadence ?? position.cadence;
  const intervalMonths = position.recurrenceRule?.intervalMonths ?? 2;

  switch (cadence) {
    case 'Monthly':
      return range(firstMonth, lastMonth);
    case 'Yearly': {
      const anchorMonth = start.month;
      return anchorMonth >= firstMonth && anchorMonth <= lastMonth ? [anchorMonth] : [];
    }
    case 'EveryNMonths':
      return everyNMonthsInYear(start, firstMonth, lastMonth, year, intervalMonths);
    default:
      return start.year === year ? [start.month] : [];
  }
}

function everyNMonthsInYear(
  anchorStart: { year: number; month: number },
  firstMonth: number,
  lastMonth: number,
  year: number,
  intervalMonths: number
): number[] {
  const n = Math.min(24, Math.max(2, Math.round(intervalMonths)));
  const months: number[] = [];
  for (let month = firstMonth; month <= lastMonth; month++) {
    const offsetMonths = (year - anchorStart.year) * 12 + (month - anchorStart.month);
    if (offsetMonths >= 0 && offsetMonths % n === 0) {
      months.push(month);
    }
  }
  return months;
}

function range(from: number, to: number): number[] {
  const months: number[] = [];
  for (let m = from; m <= to; m++) {
    months.push(m);
  }
  return months;
}

function distributeEvenly(dailyNet: Map<string, number>, year: number, month: number, signedAmount: number): void {
  const daysInMonth = new Date(year, month, 0).getDate();
  const perDay = Math.round((signedAmount / daysInMonth) * 100) / 100;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = isoDate(year, month, day);
    const amount = day === daysInMonth ? signedAmount - perDay * (daysInMonth - 1) : perDay;
    dailyNet.set(date, (dailyNet.get(date) ?? 0) + amount);
  }
}

function scheduledDayOfMonth(year: number, month: number, configuredDay: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(Math.max(configuredDay, 1), lastDay);
}

function parseIsoDay(raw: string): number {
  const parts = parseIsoParts(raw);
  return parts?.day ?? 1;
}

function parseIsoParts(raw: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? '').trim());
  if (!m) {
    return null;
  }
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
