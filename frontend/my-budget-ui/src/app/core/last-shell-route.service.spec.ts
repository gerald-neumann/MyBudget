import { TestBed } from '@angular/core/testing';

import { LastShellRouteService } from './last-shell-route.service';

describe('LastShellRouteService', () => {
  const storageKey = 'mybudget.v1.lastShellRoute';

  beforeEach(() => {
    localStorage.removeItem(storageKey);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
  });

  it('defaults to dashboard when nothing is stored', () => {
    const service = TestBed.inject(LastShellRouteService);
    expect(service.getRestoreSegment()).toBe('dashboard');
  });

  it('restores a stored shell segment', () => {
    localStorage.setItem(storageKey, 'actuals');
    const service = TestBed.inject(LastShellRouteService);
    expect(service.getRestoreSegment()).toBe('actuals');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem(storageKey, 'sign-in-failed');
    const service = TestBed.inject(LastShellRouteService);
    expect(service.getRestoreSegment()).toBe('dashboard');
  });

  it('persists the first path segment from a URL', () => {
    const service = TestBed.inject(LastShellRouteService);
    service.persistFromUrl('/budget?year=2025');
    expect(localStorage.getItem(storageKey)).toBe('budget');
    expect(service.getRestoreSegment()).toBe('budget');
  });

  it('does not overwrite a stored segment for the app root path', () => {
    localStorage.setItem(storageKey, 'actuals');
    const service = TestBed.inject(LastShellRouteService);
    service.persistFromUrl('/');
    expect(localStorage.getItem(storageKey)).toBe('actuals');
    service.persistFromUrl('');
    expect(localStorage.getItem(storageKey)).toBe('actuals');
  });
});
