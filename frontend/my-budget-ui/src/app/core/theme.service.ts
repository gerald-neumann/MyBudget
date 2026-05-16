import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

import { BudgetApiService } from './budget-api.service';

export type AppThemeId = 'default' | 'linen' | 'denim' | 'rose' | 'evergreen';

const THEME_STORAGE_KEY = 'mybudget.theme';
const SUPPORTED_THEMES: ReadonlySet<string> = new Set<AppThemeId>(['default', 'linen', 'denim', 'rose', 'evergreen']);

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(BudgetApiService);

  readonly theme = signal<AppThemeId>('default');

  readonly options: ReadonlyArray<{ id: AppThemeId; labelKey: string }> = [
    { id: 'default', labelKey: 'app.theme.default' },
    { id: 'linen', labelKey: 'app.theme.linen' },
    { id: 'denim', labelKey: 'app.theme.denim' },
    { id: 'rose', labelKey: 'app.theme.rose' },
    { id: 'evergreen', labelKey: 'app.theme.evergreen' }
  ];

  constructor() {
    this.applyTheme(this.readStoredTheme(), { persistLocal: false });
    this.document.documentElement.setAttribute('data-app-density', 'condensed');
  }

  applyFromServer(raw: string | null): void {
    const parsed = this.parseTheme(raw);
    if (!parsed) {
      return;
    }

    this.applyTheme(parsed);
  }

  setTheme(theme: AppThemeId): void {
    if (theme === this.theme()) {
      return;
    }

    const previous = this.theme();
    this.applyTheme(theme);
    this.api.updatePreferences(this.buildPreferencesPayload()).subscribe({
      next: (me) => this.applyFromServer(me.colorScheme),
      error: () => {
        this.applyTheme(previous);
      }
    });
  }

  private buildPreferencesPayload() {
    const theme = this.theme();
    return {
      colorScheme: theme === 'default' ? null : theme,
      uiDensity: 'condensed' as const
    };
  }

  private readStoredTheme(): AppThemeId {
    if (typeof localStorage === 'undefined') {
      return 'default';
    }

    return this.parseTheme(localStorage.getItem(THEME_STORAGE_KEY)) ?? 'default';
  }

  private parseTheme(raw: string | null | undefined): AppThemeId | null {
    if (!raw) {
      return 'default';
    }

    const normalized = raw.trim().toLowerCase();
    if (!SUPPORTED_THEMES.has(normalized)) {
      return null;
    }

    return normalized as AppThemeId;
  }

  private applyTheme(theme: AppThemeId, options?: { persistLocal?: boolean }): void {
    this.theme.set(theme);
    this.document.documentElement.setAttribute('data-app-theme', theme);
    if (options?.persistLocal === false || typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}
