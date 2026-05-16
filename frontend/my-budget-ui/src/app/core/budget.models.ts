export type BudgetCadence = 'None' | 'Monthly' | 'Yearly' | 'EveryNMonths';
export type BaselineAccessKind = 'None' | 'Viewer' | 'Editor' | 'Owner';
export type BaselineMemberRole = 'Viewer' | 'Editor';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  color?: string | null;
  isSystem: boolean;
  isIncome: boolean;
}

export interface BudgetBaseline {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  forkedFromBaselineId?: string | null;
  ownerUserId: string;
  myAccess: BaselineAccessKind;
  /** Owner's default workspace when you own the baseline; false for budgets shared with you. */
  isPrimaryBudget?: boolean;
  /** Seeded demo workspace; UI translates names/notes that use `sample.*` keys. */
  isSampleDemo?: boolean;
}

export interface PlannedAmount {
  id: string;
  budgetPositionId: string;
  year: number;
  month: number;
  amount: number;
  isOverride: boolean;
}

/** Canonical recurrence persisted for the line (re-applied when opening a new calendar year). */
export interface BudgetRecurrenceRule {
  cadence: BudgetCadence;
  startDate: string;
  endDate?: string | null;
  defaultAmount: number;
  /** Months between occurrences when `cadence` is `EveryNMonths` (server: 2–24). */
  intervalMonths?: number | null;
}

export interface Account {
  id: string;
  name: string;
  typeLabel?: string | null;
  initialBalance: number;
  currentBalance: number;
  sortOrder: number;
}

export interface BudgetPosition {
  id: string;
  baselineId: string;
  categoryId: string;
  forkedFromPositionId?: string | null;
  name: string;
  cadence: BudgetCadence;
  startDate: string;
  endDate?: string | null;
  defaultAmount: number;
  sortOrder: number;
  plannedAmounts: PlannedAmount[];
  recurrenceRule?: BudgetRecurrenceRule;
}

export interface ActualEntry {
  id: string;
  budgetPositionId: string;
  accountId?: string | null;
  accountName?: string | null;
  bookedOn: string;
  amount: number;
  note?: string | null;
  externalRef?: string | null;
  hasAttachment: boolean;
  attachmentFileName?: string | null;
}

export interface ActualEntriesPage {
  items: ActualEntry[];
  totalCount: number;
}

export interface MonthlySummaryPoint {
  year: number;
  month: number;
  planned: number;
  actual: number;
}

export interface YearlySummaryPoint {
  year: number;
  planned: number;
  actual: number;
}

export interface CategorySummaryPoint {
  categoryId: string;
  category: string;
  planned: number;
  actual: number;
}

export interface BaselineMember {
  userId: string;
  displayName?: string | null;
  role: BaselineMemberRole;
  createdAt: string;
}

export interface BaselineInvitation {
  id: string;
  baselineId: string;
  baselineName: string;
  role: BaselineMemberRole;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string | null;
  consumedAt?: string | null;
  acceptedByUserId?: string | null;
  acceptedByDisplayName?: string | null;
}

export interface BaselineComparisonPoint {
  year: number;
  month: number;
  basePlanned: number;
  comparePlanned: number;
  delta: number;
}

export interface MonthlyCashflowPoint {
  month: number;
  incomePlanned: number;
  incomeActual: number;
  expensePlanned: number;
  expenseActual: number;
}

export interface CategoryMonthlySpendSeries {
  categoryId: string | null;
  category: string;
  monthlyActuals: number[];
}

export interface MonthlyCashflowReport {
  months: MonthlyCashflowPoint[];
  expenseSeries: CategoryMonthlySpendSeries[];
}

export interface PositionPlanActualMonth {
  month: number;
  planned: number;
  actual: number;
}

export interface PositionPlanActualRow {
  positionId: string;
  positionName: string;
  categoryId: string;
  categoryName: string;
  isIncome: boolean;
  sortOrder: number;
  months: PositionPlanActualMonth[];
  yearPlanned: number;
  yearActual: number;
}

export interface PlanActualByPositionReport {
  positions: PositionPlanActualRow[];
}
