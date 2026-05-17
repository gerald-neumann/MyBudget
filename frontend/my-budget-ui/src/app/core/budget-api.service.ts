import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { BUDGET_API_BASE_URL } from './api-base-url';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import {
  Account,
  ActualEntriesPage,
  ActualEntry,
  BaselineInvitation,
  BaselineComparisonPoint,
  BaselineMember,
  BudgetBaseline,
  BudgetPosition,
  Category,
  CategorySummaryPoint,
  DailyLiquidityReport,
  MonthlyCashflowReport,
  MonthlySummaryPoint,
  PlanActualByPositionReport,
  YearlySummaryPoint
} from './budget.models';

export interface CurrentUserDto {
  userId: string;
  displayName: string;
  colorScheme: string | null;
}

export interface UpdatePreferencesRequest {
  colorScheme: string | null;
  uiDensity: string | null;
}

export interface ApiBuildInfoDto {
  version: string;
  buildTimestampUtc: string | null;
}

@Injectable({ providedIn: 'root' })
export class BudgetApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(BUDGET_API_BASE_URL);
  private apiBuildInfo$?: Observable<ApiBuildInfoDto>;

  getMe(): Observable<CurrentUserDto> {
    return this.http.get<CurrentUserDto>(`${this.baseUrl}/me`);
  }

  updatePreferences(payload: UpdatePreferencesRequest): Observable<CurrentUserDto> {
    return this.http.patch<CurrentUserDto>(`${this.baseUrl}/me/preferences`, payload);
  }

  /** Anonymous; safe before auth. Cached per browser session. */
  getApiBuildInfo(): Observable<ApiBuildInfoDto> {
    this.apiBuildInfo$ ??= this.http.get<ApiBuildInfoDto>(`${this.baseUrl}/build-info`).pipe(
      catchError(() => of<ApiBuildInfoDto>({ version: '', buildTimestampUtc: null })),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.apiBuildInfo$;
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.baseUrl}/categories`);
  }

  getAccounts(baselineId: string): Observable<Account[]> {
    return this.http.get<Account[]>(`${this.baseUrl}/accounts`, {
      params: new HttpParams().set('baselineId', baselineId)
    });
  }

  createAccount(payload: {
    baselineId: string;
    name: string;
    typeLabel?: string | null;
    initialBalance: number;
    sortOrder: number;
  }): Observable<Account> {
    return this.http.post<Account>(`${this.baseUrl}/accounts`, payload);
  }

  updateAccount(
    id: string,
    payload: { name: string; typeLabel?: string | null; initialBalance: number; sortOrder: number }
  ): Observable<Account> {
    return this.http.patch<Account>(`${this.baseUrl}/accounts/${id}`, payload);
  }

  deleteAccount(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/accounts/${id}`);
  }

  getCategoriesForBaseline(baselineId: string): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.baseUrl}/baselines/${baselineId}/categories`);
  }

  createCategory(payload: { name: string; sortOrder: number; color?: string | null }): Observable<Category> {
    return this.http.post<Category>(`${this.baseUrl}/categories`, payload);
  }

  getBaselines(): Observable<BudgetBaseline[]> {
    return this.http.get<BudgetBaseline[]>(`${this.baseUrl}/baselines`);
  }

  createBaseline(payload: { name: string; status?: string }): Observable<BudgetBaseline> {
    return this.http.post<BudgetBaseline>(`${this.baseUrl}/baselines`, payload);
  }

  updateBaseline(
    id: string,
    payload: { name?: string; status?: string; isPrimaryBudget?: boolean }
  ): Observable<BudgetBaseline> {
    const body = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    ) as Record<string, string | boolean>;
    return this.http.patch<BudgetBaseline>(`${this.baseUrl}/baselines/${id}`, body);
  }

  deleteBaseline(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/baselines/${id}`);
  }

  forkBaseline(id: string, payload: { name: string }): Observable<BudgetBaseline> {
    return this.http.post<BudgetBaseline>(`${this.baseUrl}/baselines/${id}/fork`, payload);
  }

  getPositions(baselineId: string, year: number): Observable<BudgetPosition[]> {
    return this.http.get<BudgetPosition[]>(`${this.baseUrl}/baselines/${baselineId}/positions`, {
      params: new HttpParams().set('year', year)
    });
  }

  createPosition(
    baselineId: string,
    payload: {
      categoryId: string;
      name: string;
      cadence: 'None' | 'Monthly' | 'Yearly' | 'EveryNMonths';
      startDate: string;
      endDate?: string | null;
      defaultAmount: number;
      sortOrder: number;
      intervalMonths?: number;
      distributionMode?: 'ExactDayOfMonth' | 'EvenlyDistributed';
      dayOfMonth?: number | null;
    }
  ): Observable<BudgetPosition> {
    return this.http.post<BudgetPosition>(`${this.baseUrl}/baselines/${baselineId}/positions`, payload);
  }

  updatePosition(
    baselineId: string,
    positionId: string,
    payload: {
      categoryId: string;
      name: string;
      cadence: 'None' | 'Monthly' | 'Yearly' | 'EveryNMonths';
      startDate: string;
      endDate?: string | null;
      defaultAmount: number;
      sortOrder: number;
      intervalMonths?: number;
      distributionMode?: 'ExactDayOfMonth' | 'EvenlyDistributed';
      dayOfMonth?: number | null;
      /** When set, matching planned months are reset to the new template amount and overrides cleared. */
      plannedAmountsScope?: 'All' | 'DateRange';
      plannedAmountsApplyFrom?: string;
      plannedAmountsApplyTo?: string;
    }
  ): Observable<BudgetPosition> {
    return this.http.patch<BudgetPosition>(`${this.baseUrl}/baselines/${baselineId}/positions/${positionId}`, payload);
  }

  deletePosition(baselineId: string, positionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/baselines/${baselineId}/positions/${positionId}`);
  }

  reapplyPositionRecurrenceTemplate(baselineId: string, positionId: string, year: number): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/baselines/${baselineId}/positions/${positionId}/reapply-recurrence-template`,
      {},
      { params: new HttpParams().set('year', year) }
    );
  }

  upsertPlannedAmounts(items: Array<{ budgetPositionId: string; year: number; month: number; amount: number }>): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/planned-amounts`, { items });
  }

  getActualEntriesPage(params: {
    baselineId: string;
    skip?: number;
    take?: number;
    bookedFrom?: string | null;
    bookedTo?: string | null;
    /** Each term is AND-combined (position, category, account, note). */
    searchTerms?: string[] | null;
    amountFilter?: string | null;
    /** When set, only income or only expense lines (category-based). */
    flowKind?: 'income' | 'expense';
    /** When set, only entries whose budget position belongs to this category. */
    categoryId?: string;
  }): Observable<ActualEntriesPage> {
    let httpParams = new HttpParams()
      .set('baselineId', params.baselineId)
      .set('skip', String(params.skip ?? 0))
      .set('take', String(params.take ?? 50));
    if (params.bookedFrom) {
      httpParams = httpParams.set('bookedFrom', params.bookedFrom);
    }
    if (params.bookedTo) {
      httpParams = httpParams.set('bookedTo', params.bookedTo);
    }
    for (const term of params.searchTerms ?? []) {
      const t = term.trim();
      if (t) {
        httpParams = httpParams.append('search', t);
      }
    }
    const amountFilter = params.amountFilter?.trim();
    if (amountFilter) {
      httpParams = httpParams.set('amountFilter', amountFilter);
    }
    if (params.flowKind) {
      httpParams = httpParams.set('flowKind', params.flowKind);
    }
    if (params.categoryId) {
      httpParams = httpParams.set('categoryId', params.categoryId);
    }
    return this.http.get<ActualEntriesPage>(`${this.baseUrl}/actuals`, { params: httpParams });
  }

  getActualBookingYears(
    baselineId: string,
    options?: {
      flowKind?: 'income' | 'expense';
      categoryId?: string;
    }
  ): Observable<number[]> {
    let params = new HttpParams().set('baselineId', baselineId);
    if (options?.flowKind) {
      params = params.set('flowKind', options.flowKind);
    }
    if (options?.categoryId) {
      params = params.set('categoryId', options.categoryId);
    }
    return this.http
      .get<{ years: number[] }>(`${this.baseUrl}/actuals/booking-years`, { params })
      .pipe(map((r) => r.years ?? []));
  }

  createActualEntry(payload: {
    budgetPositionId: string;
    accountId: string;
    bookedOn: string;
    amount: number;
    note?: string | null;
    externalRef?: string | null;
  }): Observable<ActualEntry> {
    return this.http.post<ActualEntry>(`${this.baseUrl}/actuals`, payload);
  }

  updateActualEntry(
    id: string,
    payload: {
      budgetPositionId: string;
      accountId: string;
      bookedOn: string;
      amount: number;
      note?: string | null;
      externalRef?: string | null;
    }
  ): Observable<ActualEntry> {
    return this.http.patch<ActualEntry>(`${this.baseUrl}/actuals/${id}`, payload);
  }

  deleteActualEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/actuals/${id}`);
  }

  uploadActualAttachment(id: string, file: File): Observable<ActualEntry> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ActualEntry>(`${this.baseUrl}/actuals/${id}/attachment`, form);
  }

  downloadActualAttachment(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/actuals/${id}/attachment`, { responseType: 'blob' });
  }

  deleteActualAttachment(id: string): Observable<ActualEntry> {
    return this.http.delete<ActualEntry>(`${this.baseUrl}/actuals/${id}/attachment`);
  }

  getMonthlySummary(baselineId: string, from: string, to: string): Observable<MonthlySummaryPoint[]> {
    return this.http.get<MonthlySummaryPoint[]>(`${this.baseUrl}/reports/monthly-summary`, {
      params: new HttpParams().set('baselineId', baselineId).set('from', from).set('to', to)
    });
  }

  getMonthlyCashflow(baselineId: string, year: number): Observable<MonthlyCashflowReport> {
    return this.http.get<MonthlyCashflowReport>(`${this.baseUrl}/reports/monthly-cashflow`, {
      params: new HttpParams().set('baselineId', baselineId).set('year', year)
    });
  }

  getPlanActualByPosition(baselineId: string, year: number): Observable<PlanActualByPositionReport> {
    return this.http.get<PlanActualByPositionReport>(`${this.baseUrl}/reports/plan-actual-by-position`, {
      params: new HttpParams().set('baselineId', baselineId).set('year', year)
    });
  }

  getDailyLiquidity(baselineId: string, year: number): Observable<DailyLiquidityReport> {
    return this.http.get<DailyLiquidityReport>(`${this.baseUrl}/reports/daily-liquidity`, {
      params: new HttpParams().set('baselineId', baselineId).set('year', year)
    });
  }

  getYearlySummary(baselineId: string, fromYear: number, toYear: number): Observable<YearlySummaryPoint[]> {
    return this.http.get<YearlySummaryPoint[]>(`${this.baseUrl}/reports/yearly-summary`, {
      params: new HttpParams()
        .set('baselineId', baselineId)
        .set('fromYear', fromYear)
        .set('toYear', toYear)
    });
  }

  getCategorySummary(baselineId: string, year: number): Observable<CategorySummaryPoint[]> {
    return this.http.get<CategorySummaryPoint[]>(`${this.baseUrl}/reports/by-category`, {
      params: new HttpParams().set('baselineId', baselineId).set('year', year)
    });
  }

  compareBaselines(baseId: string, compareId: string, year: number): Observable<BaselineComparisonPoint[]> {
    return this.http.get<BaselineComparisonPoint[]>(`${this.baseUrl}/baselines/${baseId}/compare`, {
      params: new HttpParams().set('otherId', compareId).set('year', year)
    });
  }

  createBaselineInvitation(
    baselineId: string,
    payload: { role: 'Viewer' | 'Editor'; expiresInDays?: number }
  ): Observable<{ invitationId: string; token: string; expiresAt: string }> {
    return this.http.post<{ invitationId: string; token: string; expiresAt: string }>(
      `${this.baseUrl}/baselines/${baselineId}/invitations`,
      payload
    );
  }

  getBaselineInvitations(baselineId: string): Observable<BaselineInvitation[]> {
    return this.http.get<BaselineInvitation[]>(`${this.baseUrl}/baselines/${baselineId}/invitations`);
  }

  getSentBaselineInvitations(): Observable<BaselineInvitation[]> {
    return this.http.get<BaselineInvitation[]>(`${this.baseUrl}/baselines/invitations/sent`);
  }

  revokeBaselineInvitation(baselineId: string, invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/baselines/${baselineId}/invitations/${invitationId}`);
  }

  getBaselineMembers(baselineId: string): Observable<BaselineMember[]> {
    return this.http.get<BaselineMember[]>(`${this.baseUrl}/baselines/${baselineId}/members`);
  }

  updateBaselineMemberRole(baselineId: string, memberUserId: string, role: 'Viewer' | 'Editor'): Observable<BaselineMember> {
    return this.http.patch<BaselineMember>(`${this.baseUrl}/baselines/${baselineId}/members/${memberUserId}`, { role });
  }

  removeBaselineMember(baselineId: string, memberUserId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/baselines/${baselineId}/members/${memberUserId}`);
  }

  acceptInvitation(token: string): Observable<{ baselineId: string; myAccess: 'Viewer' | 'Editor' | 'Owner' }> {
    return this.http.post<{ baselineId: string; myAccess: 'Viewer' | 'Editor' | 'Owner' }>(`${this.baseUrl}/invitations/accept`, { token });
  }
}
