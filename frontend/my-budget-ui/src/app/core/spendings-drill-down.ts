import { ParamMap, Params } from '@angular/router';

export type SpendingsDrillDownFlow = 'income' | 'expense';

/** Query params used when navigating from dashboard charts to the ledger. */
export const SPENDINGS_DRILL_DOWN_QUERY = {
  flow: 'flow',
  year: 'year',
  month: 'month',
  categoryId: 'categoryId'
} as const;

export interface SpendingsDrillDownParams {
  flow?: SpendingsDrillDownFlow;
  year?: number;
  month?: number;
  categoryId?: string;
}

export function buildSpendingsDrillDownQuery(drill: SpendingsDrillDownParams): Params {
  const query: Params = {};
  if (drill.flow) {
    query[SPENDINGS_DRILL_DOWN_QUERY.flow] = drill.flow;
  }
  if (drill.year != null && Number.isFinite(drill.year)) {
    query[SPENDINGS_DRILL_DOWN_QUERY.year] = drill.year;
  }
  if (drill.month != null && drill.month >= 1 && drill.month <= 12) {
    query[SPENDINGS_DRILL_DOWN_QUERY.month] = drill.month;
  }
  if (drill.categoryId?.trim()) {
    query[SPENDINGS_DRILL_DOWN_QUERY.categoryId] = drill.categoryId.trim();
  }
  return query;
}

export function hasSpendingsDrillDownParams(params: ParamMap): boolean {
  return (
    params.has(SPENDINGS_DRILL_DOWN_QUERY.flow) ||
    params.has(SPENDINGS_DRILL_DOWN_QUERY.year) ||
    params.has(SPENDINGS_DRILL_DOWN_QUERY.month) ||
    params.has(SPENDINGS_DRILL_DOWN_QUERY.categoryId)
  );
}

export function parseSpendingsDrillDownParams(params: ParamMap): SpendingsDrillDownParams | null {
  if (!hasSpendingsDrillDownParams(params)) {
    return null;
  }

  const parsed: SpendingsDrillDownParams = {};

  const flow = params.get(SPENDINGS_DRILL_DOWN_QUERY.flow);
  if (flow === 'income' || flow === 'expense') {
    parsed.flow = flow;
  }

  const yearRaw = params.get(SPENDINGS_DRILL_DOWN_QUERY.year);
  if (yearRaw) {
    const year = Number(yearRaw);
    if (Number.isFinite(year)) {
      parsed.year = year;
    }
  }

  const monthRaw = params.get(SPENDINGS_DRILL_DOWN_QUERY.month);
  if (monthRaw) {
    const month = Number(monthRaw);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      parsed.month = month;
    }
  }

  const categoryId = params.get(SPENDINGS_DRILL_DOWN_QUERY.categoryId)?.trim();
  if (categoryId) {
    parsed.categoryId = categoryId;
  }

  return parsed;
}

export function monthBookedRange(year: number, month: number): { bookedFrom: string; bookedTo: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { bookedFrom: from, bookedTo: to };
}
