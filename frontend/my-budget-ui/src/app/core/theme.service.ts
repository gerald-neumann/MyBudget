import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

import { BudgetApiService } from './budget-api.service';

export type AppThemeId = 'default' | 'linen' | 'denim' | 'rose' | 'evergreen';
export type AppUiDensityId = 'comfortable' | 'condensed';

const THEME_STORAGE_KEY = 'mybudget.theme';
const UI_DENSITY_STORAGE_KEY = 'mybudget.uiDensity';
const SUPPORTED_THEMES: ReadonlySet<string> = new Set<AppThemeId>(['default', 'linen', 'denim', 'rose', 'evergreen']);

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(BudgetApiService);

  readonly theme = signal<AppThemeId>('default');
  readonly uiDensity = signal<AppUiDensityId>('condensed');

  readonly options: ReadonlyArray<{ id: AppThemeId; labelKey: string }> = [
    { id: 'default', labelKey: 'app.theme.default' },
    { id: 'linen', labelKey: 'app.theme.linen' },
    { id: 'denim', labelKey: 'app.theme.denim' },
    { id: 'rose', labelKey: 'app.theme.rose' },
    { id: 'evergreen', labelKey: 'app.theme.evergreen' }
  ];

  readonly uiDensityOptions: ReadonlyArray<{ id: AppUiDensityId; labelKey: string }> = [
    { id: 'comfortable', labelKey: 'app.tableDensity.comfortable' },
    { id: 'condensed', labelKey: 'app.tableDensity.condensed' }
  ];

  constructor() {
    this.applyTheme(this.readStoredTheme(), { persistLocal: false });
    this.applyUiDensity(this.readStoredUiDensity(), { persistLocal: false });
  }

  applyFromServer(raw: string | null): void {
    const parsed = this.parseTheme(raw);
    if (!parsed) {
      return;
    }

    this.applyTheme(parsed);
  }

  /** Applies table row density from `/me` (`null` = comfortable, stored legacy default). */
  applyUiDensityFromServer(raw: string | null): void {
    if (!raw?.trim()) {
      this.applyUiDensity('comfortable');
      return;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized !== 'condensed') {
      return;
    }

    this.applyUiDensity('condensed');
  }

  setTheme(theme: AppThemeId): void {
    if (theme === this.theme()) {
      return;
    }

    const previous = this.theme();
    this.applyTheme(theme);
    this.api.updatePreferences(this.buildPreferencesPayload()).subscribe({
      next: (me) => {
        this.applyFromServer(me.colorScheme);
        if (me.uiDensity !== undefined) {
          this.applyUiDensityFromServer(me.uiDensity);
        }
      },
      error: () => {
        this.applyTheme(previous);
      }
    });
  }

  setUiDensity(density: AppUiDensityId): void {
    if (density === this.uiDensity()) {
      return;
    }

    const previous = this.uiDensity();
    this.applyUiDensity(density);
    this.api.updatePreferences(this.buildPreferencesPayload()).subscribe({
      next: (me) => {
        this.applyFromServer(me.colorScheme);
        if (me.uiDensity !== undefined) {
          this.applyUiDensityFromServer(me.uiDensity);
        }
      },
      error: () => {
        this.applyUiDensity(previous);
      }
    });
  }

  private buildPreferencesPayload() {
    const theme = this.theme();
    const density = this.uiDensity();
    return {
      colorScheme: theme === 'default' ? null : theme,
      uiDensity: density === 'comfortable' ? null : 'condensed'
    };
  }

  private readStoredTheme(): AppThemeId {
    if (typeof localStorage === 'undefined') {
      return 'default';
    }

    return this.parseTheme(localStorage.getItem(THEME_STORAGE_KEY)) ?? 'default';
  }

  private readStoredUiDensity(): AppUiDensityId {
    if (typeof localStorage === 'undefined') {
      return 'condensed';
    }

    const raw = localStorage.getItem(UI_DENSITY_STORAGE_KEY);
    if (raw?.trim().toLowerCase() === 'comfortable') {
      return 'comfortable';
    }

    if (raw?.trim().toLowerCase() === 'condensed') {
      return 'condensed';
    }

    return 'condensed';
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

  private applyUiDensity(density: AppUiDensityId, options?: { persistLocal?: boolean }): void {
    this.uiDensity.set(density);
    this.document.documentElement.setAttribute('data-app-density', density);
    if (options?.persistLocal === false || typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
  }
}
