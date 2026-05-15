import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';
import { BUDGET_API_BASE_URL } from './core/api-base-url';

describe('App', () => {
  let httpMock: HttpTestingController;
  const apiBase = 'http://localhost:5256';

  beforeEach(async () => {
    localStorage.removeItem('mybudget.theme');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BUDGET_API_BASE_URL, useValue: apiBase },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Constructor loads anonymous build info, then baselines + /me when Keycloak is off. */
  function flushShellBootstrap(): void {
    httpMock.expectOne(`${apiBase}/build-info`).flush({ version: '1.0.0', buildTimestampUtc: '2020-01-01T00:00:00.000Z' });
    httpMock.expectOne(`${apiBase}/baselines`).flush([]);
    httpMock.expectOne(`${apiBase}/me`).flush({ userId: 't', displayName: 'Tester', colorScheme: 'denim' });
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    flushShellBootstrap();
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    expect(document.documentElement.getAttribute('data-app-theme')).toBe('denim');
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    flushShellBootstrap();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('My Budget');
  });
});
