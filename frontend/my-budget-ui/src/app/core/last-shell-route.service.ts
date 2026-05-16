import { Injectable } from '@angular/core';

/** Primary shell areas shown in the top nav (first URL segment). */
export type ShellRouteSegment = 'dashboard' | 'budget' | 'actuals' | 'accounts' | 'help';

const STORAGE_KEY = 'mybudget.v1.lastShellRoute';

const SHELL_ROUTE_SEGMENTS = new Set<ShellRouteSegment>([
  'dashboard',
  'budget',
  'actuals',
  'accounts',
  'help'
]);

@Injectable({ providedIn: 'root' })
export class LastShellRouteService {
  /** Segment to open after sign-in or when visiting `/`. */
  getRestoreSegment(): ShellRouteSegment {
    return this.parseSegment(this.readStored()) ?? 'dashboard';
  }

  /** Remember the active shell area from a router URL (path only, no query/hash). */
  persistFromUrl(url: string): void {
    const raw = url.split('?')[0].split('#')[0];
    const parts = raw.replace(/^\/+/, '').split('/').filter(Boolean);
    const first = (parts[0] || '').toLowerCase();
    this.persistSegment(first);
  }

  persistSegment(segment: string): void {
    const parsed = this.parseSegment(segment);
    if (!parsed) {
      return;
    }
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, parsed);
  }

  private readStored(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY);
  }

  private parseSegment(raw: string | null | undefined): ShellRouteSegment | null {
    const segment = (raw ?? '').trim().toLowerCase();
    if (!segment || !SHELL_ROUTE_SEGMENTS.has(segment as ShellRouteSegment)) {
      return null;
    }
    return segment as ShellRouteSegment;
  }
}
