import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BUDGET_API_BASE_URL } from './api-base-url';
import { BudgetApiService } from './budget-api.service';

describe('BudgetApiService', () => {
  const apiBase = 'http://localhost:5256';
  let service: BudgetApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BudgetApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BUDGET_API_BASE_URL, useValue: apiBase }
      ]
    });
    service = TestBed.inject(BudgetApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends distribution fields when creating positions', () => {
    service
      .createPosition('baseline-1', {
        categoryId: 'cat-1',
        name: 'Rent',
        cadence: 'Monthly',
        startDate: '2026-01-01',
        endDate: null,
        defaultAmount: 900,
        sortOrder: 1,
        distributionMode: 'ExactDayOfMonth',
        dayOfMonth: 31
      })
      .subscribe();

    const req = httpMock.expectOne(`${apiBase}/baselines/baseline-1/positions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.distributionMode).toBe('ExactDayOfMonth');
    expect(req.request.body.dayOfMonth).toBe(31);
    req.flush({});
  });

  it('requests daily liquidity report endpoint', () => {
    service.getDailyLiquidity('baseline-2', 2026).subscribe();

    const req = httpMock.expectOne(`${apiBase}/reports/daily-liquidity?baselineId=baseline-2&year=2026`);
    expect(req.request.method).toBe('GET');
    req.flush({ openingBalance: 0, days: [] });
  });
});
