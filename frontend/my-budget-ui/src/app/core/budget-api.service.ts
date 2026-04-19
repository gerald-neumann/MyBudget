import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { BUDGET_API_BASE_URL } from './api-base-url';
import { Observable } from 'rxjs';
import {
  ActualEntry,
  BaselineInvitation,
  BaselineComparisonPoint,
  BaselineMember,
  BudgetBaseline,
  BudgetPosition,
  Category,
  CategorySummaryPoint,
  MonthlyCashflowReport,
  MonthlySummaryPoint,
  YearlySummaryPoint
} from './budget.models';

export interface CurrentUserDto {
  userId: string;
  displayName: string;
}

@Injectable({ providedIn: 'root' })
export class BudgetApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(BUDGET_API_BASE_URL);

  getMe(): Observable<CurrentUserDto> {
    return this.http.get<CurrentUserDto>(`${this.baseUrl}/me`);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.baseUrl}/categories`);
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
      cadence: 'None' | 'Monthly' | 'Yearly';
      startDate: string;
      endDate?: string | null;
      defaultAmount: number;
      sortOrder: number;
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
      cadence: 'None' | 'Monthly' | 'Yearly';
      startDate: string;
      endDate?: string | null;
      defaultAmount: number;
      sortOrder: number;
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

  getActualEntries(baselineId: string): Observable<ActualEntry[]> {
    return this.http.get<ActualEntry[]>(`${this.baseUrl}/actuals`, {
      params: new HttpParams().set('baselineId', baselineId)
    });
  }

  createActualEntry(payload: {
    budgetPositionId: string;
    bookedOn: string;
    amount: number;
    note?: string | null;
    externalRef?: string | null;
  }): Observable<ActualEntry> {
    return this.http.post<ActualEntry>(`${this.baseUrl}/actuals`, payload);
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
