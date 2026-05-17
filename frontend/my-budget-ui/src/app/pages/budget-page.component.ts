import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, Plugin } from 'chart.js';
import { bufferTime, catchError, defer, EMPTY, filter, finalize, forkJoin, map, of, Subject, switchMap, tap } from 'rxjs';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import { ViewportService } from '../core/viewport.service';
import {
  KeyboardAddShortcutService,
  registerPageKeyboardAddShortcut
} from '../core/keyboard-add-shortcut.service';
import {
  confirmDiscardUnsavedChanges,
  isKeyboardCancel,
  shouldKeyboardCancelFromTarget,
  shouldKeyboardConfirmForModal,
  shouldKeyboardConfirmFromTarget
} from '../core/keyboard-confirm-cancel';
import { selectAllOnFocusedNumericInput } from '../core/numeric-input-focus';
import { computeDailyLiquidity, dailyLiquidityHasActivity } from '../core/daily-liquidity';
import { BudgetCadence, BudgetDistributionMode, BudgetPosition, Category, DailyLiquidityPoint } from '../core/budget.models';

@Component({
  selector: 'app-budget-page',
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './budget-page.component.html',
  styleUrl: './budget-page.component.css',
  host: {
    '[class.budget-page--max-sm]': 'viewport.maxSm()'
  }
})
export class BudgetPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  readonly viewport = inject(ViewportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly keyboardAdd = inject(KeyboardAddShortcutService);
  private readonly liquidityFocusMonthStorageKey = 'mybudget.v1.budgetLiquidityFocusMonth';
  private readonly liquidityPreviewRevision = signal(0);
  /** Min height reserved for table + summary inside `.budget-page-body` before showing cashflow. */
  private static readonly cashflowMinTableAreaPx = 200;
  /** Matches `.budget-cashflow-chart` height in CSS (9.5rem @ 16px). */
  private static readonly cashflowChartHeightPx = 152;
  private static readonly cashflowMinBodyWidthPx = 280;
  private readonly budgetPageBody = viewChild<ElementRef<HTMLElement>>('budgetPageBody');
  /** False until the body is tall/wide enough to show the chart without clipping. */
  readonly showCashflowSection = signal(false);
  yearToolbarLabelClasses(): string {
    return 'select-none inline-flex items-center gap-1 text-xs font-semibold text-amber-900';
  }

  yearToolbarInputClasses(): string {
    const base =
      'min-h-10 w-full rounded border px-2 py-2 text-right text-sm tabular-nums transition-colors sm:min-h-0 sm:w-24 sm:py-1';
    if (this.state.isSelectedYearOffCalendar()) {
      return `${base} border-amber-400 bg-amber-50 font-semibold text-amber-950 shadow-sm ring-2 ring-amber-200`;
    }
    return `${base} border-violet-200 bg-violet-50 text-violet-900`;
  }

  /** Header actions (add position, year) behind a toggle on compact viewports. */
  readonly budgetPageToolsOpen = signal(false);

  /** Incremented to re-fetch categories/positions when baseline/year are unchanged (e.g. after server-side mutations). */
  private readonly budgetDataReload = signal(0);
  /** Incremented to re-fetch liquidity graph without reloading whole budget grid. */
  private readonly liquidityDataReload = signal(0);

  readonly months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  readonly cadences: BudgetCadence[] = ['None', 'Monthly', 'Yearly', 'EveryNMonths'];
  readonly distributionModes: BudgetDistributionMode[] = ['ExactDayOfMonth', 'EvenlyDistributed'];

  categories: Category[] = [];
  positions: BudgetPosition[] = [];
  /** Signal (not a plain field) so async load completion always schedules a view refresh. */
  readonly loading = signal(false);
  /** Defer `baseChart` until series exist (ng2-charts empty-first render bug). */
  readonly liquidityChartReady = signal(false);
  readonly liquidityFocusMonth = signal(this.readLiquidityFocusMonth());
  /** `year` = whole selected year; `month` = focused month at day resolution. */
  readonly liquidityChartZoom = signal<'year' | 'month'>('year');
  private liquidityAllDays: DailyLiquidityPoint[] = [];
  liquidityChartPlugins: Plugin<'line'>[] = [];
  liquidityChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  liquidityChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false
  };
  savingCells = false;
  message = '';
  messageType: 'success' | 'error' = 'success';
  private messageClearTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly messageAutoClearMs = 4500;

  /** Server / flow errors while the new-position sheet is open (shown inside the dialog, not behind it). */
  newPositionSheetBanner = '';
  newPositionSheetBannerType: 'success' | 'error' = 'error';

  /** Server / flow errors while the edit-position modal is open (shown inside the dialog, not behind it). */
  editPositionSheetBanner = '';
  editPositionSheetBannerType: 'success' | 'error' = 'error';

  newPosition = {
    name: '',
    categoryName: '',
    cadence: 'None' as BudgetCadence,
    distributionMode: 'ExactDayOfMonth' as BudgetDistributionMode,
    dayOfMonth: new Date().getDate() as number | null,
    startDate: this.toDateInput(new Date()),
    endDate: '' as string | null,
    defaultAmount: 0,
    recurrenceIntervalMonths: 3
  };

  /** Bottom sheet / compact dialog for creating a position (keeps the table uncluttered on small screens). */
  readonly newPositionSheetOpen = signal(false);

  /** When true, new-position sheet shows field-level errors after a failed submit attempt. */
  newPositionSheetValidationAttempted = false;

  /** When true, edit modal shows field-level errors after a failed save attempt. */
  editPositionValidationAttempted = false;

  /** Position meta (name, category, cadence, dates, planned scope) edits use a modal; month amounts stay as table cell inputs. */
  editPositionSurface: 'modal' | null = null;

  /** True when the edit modal was opened from the row calculator (budget-rule affordance). */
  private editPositionOpenedAsRule = false;

  editPositionDraft: {
    id: string;
    name: string;
    categoryName: string;
    cadence: BudgetCadence;
    distributionMode: BudgetDistributionMode;
    dayOfMonth: number | null;
    startDate: string;
    endDate: string;
    defaultAmount: number;
    recurrenceIntervalMonths: number;
  } | null = null;

  /** How planned grid cells are aligned to the template when cadence/amount/dates change (recurring lines). */
  editPositionPlannedApplyScope: 'all' | 'dateRange' = 'all';
  editPositionPlannedApplyFrom = '';
  editPositionPlannedApplyTo = '';

  /** Serialized edit form at open or after server sync (dirty check before cancel). */
  private editPositionFormBaseline = '';

  /** Serialized new-position form right after the sheet opens (dirty check before cancel). */
  private newPositionFormBaseline = '';

  /**
   * Signal-backed set so async delete completion reliably refreshes button state
   * in zoneless/signal-driven change detection.
   */
  private readonly deletingPositionIds = signal<ReadonlySet<string>>(new Set<string>());

  categorySuggestOpen: { kind: 'new'; input: HTMLInputElement } | { kind: 'edit'; input: HTMLInputElement } | null = null;
  categorySuggestRect: { top: number; left: number; width: number } | null = null;

  private categorySuggestCloseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Single focused amount field (month cell, new-row default, or edit-sheet default) with in-progress text. */
  private amountEdit:
    | { kind: 'cell'; positionId: string; month: number; draft: string }
    | { kind: 'newDefault'; draft: string }
    | { kind: 'editDefault'; positionId: string; draft: string }
    | null = null;

  private readonly cellEdits$ = new Subject<{ budgetPositionId: string; month: number; amount: number }>();

  constructor() {
    registerPageKeyboardAddShortcut(
      this.destroyRef,
      this.keyboardAdd,
      () => this.openNewPositionSheet(),
      () => this.canManageSelectedBaseline()
    );

    this.cellEdits$
      .pipe(
        bufferTime(500),
        filter((batch) => batch.length > 0),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((batch) => {
        const baselineId = this.state.selectedBaselineId();
        const year = this.state.selectedYear();
        if (!baselineId || !this.canManageSelectedBaseline()) {
          return;
        }

        const deduped = new Map<string, { budgetPositionId: string; year: number; month: number; amount: number }>();
        for (const item of batch) {
          deduped.set(`${item.budgetPositionId}-${item.month}`, {
            budgetPositionId: item.budgetPositionId,
            year,
            month: item.month,
            amount: item.amount
          });
        }

        this.savingCells = true;
        this.api
          .upsertPlannedAmounts([...deduped.values()])
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.savingCells = false;
              this.setMessage('msg.savePlannedSuccess', 'success');
              this.liquidityDataReload.update((n) => n + 1);
            },
            error: () => {
              this.savingCells = false;
              this.setMessage('msg.savePlannedFailed', 'error');
            }
          });
      });

    effect((onCleanup) => {
      const baselineId = this.state.selectedBaselineId();
      const year = this.state.selectedYear();
      this.budgetDataReload();
      this.liquidityDataReload();
      if (!baselineId) {
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      const sub = forkJoin({
        categories: this.api.getCategoriesForBaseline(baselineId),
        positions: this.api.getPositions(baselineId, year)
      })
        .pipe(
          catchError(() => {
            this.setMessage('msg.loadBudgetFailed', 'error');
            return of({ categories: [] as Category[], positions: [] as BudgetPosition[] });
          })
        )
        .subscribe({
          next: (response) => {
            this.loading.set(false);
            this.amountEdit = null;
            this.categories = response.categories;
            this.positions = response.positions;
            this.refreshLiquidityChartFromPositions();
            const idSet = new Set(this.positions.map((p) => p.id));
            const editingId = this.editPositionDraft?.id;
            if (editingId && !idSet.has(editingId)) {
              this.forceCloseEditPositionSheet();
            } else if (editingId) {
              const sel = this.positions.find((p) => p.id === editingId);
              if (sel && !this.isEditPositionFormDirty()) {
                this.syncEditDraftFromPosition(sel);
                this.captureEditPositionFormBaseline();
              }
            }
          }
        });

      onCleanup(() => {
        sub.unsubscribe();
        this.loading.set(false);
      });
    });

    effect(() => {
      this.state.selectedYear();
      this.liquidityFocusMonth.set(this.defaultLiquidityFocusMonth());
      this.liquidityChartZoom.set('year');
    });

    effect(() => {
      this.liquidityDataReload();
      this.liquidityPreviewRevision();
      const baselineId = this.state.selectedBaselineId();
      if (!baselineId) {
        this.clearLiquidityChart();
        return;
      }
      this.refreshLiquidityChartFromPositions();
    });

    effect(() => {
      this.liquidityFocusMonth();
      this.liquidityChartZoom();
      if (this.liquidityAllDays.length > 0) {
        this.rebuildLiquidityChart();
      }
    });

    effect(() => {
      this.i18n.language();
      this.amountEdit = null;
      if (this.liquidityAllDays.length > 0) {
        this.rebuildLiquidityChart();
      }
    });

    effect((onCleanup) => {
      if (this.loading()) {
        return;
      }
      const el = this.budgetPageBody()?.nativeElement;
      if (!el) {
        return;
      }
      const minHeight =
        BudgetPageComponent.cashflowChartHeightPx + BudgetPageComponent.cashflowMinTableAreaPx;
      const minWidth = BudgetPageComponent.cashflowMinBodyWidthPx;
      const update = () => {
        const rect = el.getBoundingClientRect();
        this.showCashflowSection.set(rect.height >= minHeight && rect.width >= minWidth);
      };
      const observer = new ResizeObserver(() => update());
      observer.observe(el);
      update();
      onCleanup(() => observer.disconnect());
    });

    const onBudgetPointerDownCapture = (ev: Event) => this.onDocumentPointerDownBudgetInlineCancel(ev);
    this.documentRef.addEventListener('pointerdown', onBudgetPointerDownCapture, true);
    this.destroyRef.onDestroy(() => this.documentRef.removeEventListener('pointerdown', onBudgetPointerDownCapture, true));
    this.destroyRef.onDestroy(() => {
      if (this.messageClearTimer) {
        clearTimeout(this.messageClearTimer);
      }
    });
  }

  selectedBaselineAccess(): 'None' | 'Viewer' | 'Editor' | 'Owner' {
    return this.state.selectedBaseline()?.myAccess ?? 'None';
  }

  canManageSelectedBaseline(): boolean {
    return this.state.canManageSelectedBaseline();
  }

  isOwnerOfSelectedBaseline(): boolean {
    return this.selectedBaselineAccess() === 'Owner';
  }

  isSampleBaseline(): boolean {
    return !!this.state.selectedBaseline()?.isSampleDemo;
  }

  positionDisplayLabel(position: BudgetPosition): string {
    return this.i18n.translateSampleToken(position.name);
  }

  onCellEdited(position: BudgetPosition, month: number, amount: number): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    if (!Number.isFinite(amount)) {
      return;
    }
    const stored = this.toStoredPlannedAmount(position.categoryId, amount);

    const planned = position.plannedAmounts.find((item) => item.month === month && item.year === this.state.selectedYear());
    if (planned) {
      planned.amount = stored;
      planned.isOverride = true;
    } else {
      position.plannedAmounts.push({
        id: '',
        budgetPositionId: position.id,
        year: this.state.selectedYear(),
        month,
        amount: stored,
        isOverride: true
      });
    }

    this.cellEdits$.next({ budgetPositionId: position.id, month, amount: stored });
  }

  cellAmountInputValue(position: BudgetPosition, month: number): string {
    const e = this.amountEdit;
    if (e?.kind === 'cell' && e.positionId === position.id && e.month === month) {
      return e.draft;
    }
    return this.i18n.formatAmount(this.getCellDisplayAmount(position, month));
  }

  newPositionDefaultInputValue(): string {
    const e = this.amountEdit;
    if (e?.kind === 'newDefault') {
      return e.draft;
    }
    return this.i18n.formatAmount(this.displayStoredDefaultForNewSheet(this.newPosition.defaultAmount));
  }

  /** Enter on an in-table text field confirms like leaving it (same blur/persist path as pointer). */
  onBudgetTableFieldEnterConfirm(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmFromTarget(event)) {
      return;
    }
    const t = event.target;
    if (!(t instanceof HTMLInputElement)) {
      return;
    }
    event.preventDefault();
    t.blur();
  }

  /** Escape on a one-off position name field reverts without saving. */
  onBudgetPositionNameEscapeCancel(event: Event, position: BudgetPosition): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event)) {
      return;
    }
    const t = event.target;
    if (!(t instanceof HTMLInputElement)) {
      return;
    }
    event.preventDefault();
    this.applyBudgetPositionNameEscapeDismissal(position, t);
  }

  /** Same outcome as Escape on the inline name field (shared with pointer-outside). */
  private applyBudgetPositionNameEscapeDismissal(position: BudgetPosition, input: HTMLInputElement): void {
    input.value = position.name;
    input.blur();
  }

  /** Escape on an in-table amount field discards the draft without persisting. */
  onBudgetCellAmountEscapeCancel(event: Event, position: BudgetPosition, month: number): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event)) {
      return;
    }
    const t = event.target;
    if (!(t instanceof HTMLInputElement)) {
      return;
    }
    event.preventDefault();
    this.applyBudgetCellAmountEscapeDismissal(position, month, t);
  }

  /** Same outcome as Escape on the planned-amount cell (shared with pointer-outside). */
  private applyBudgetCellAmountEscapeDismissal(position: BudgetPosition, month: number, input: HTMLInputElement): void {
    if (this.amountEdit?.kind === 'cell' && this.amountEdit.positionId === position.id && this.amountEdit.month === month) {
      this.amountEdit = null;
    }
    input.value = this.i18n.formatAmount(this.getCellDisplayAmount(position, month));
    input.blur();
  }

  /**
   * Backdrop click follows the same ordering as document Escape on the budget page:
   * dismiss category suggest first, then tryClose the sheet.
   */
  onBudgetSheetBackdropDismissLikeEscape(mode: 'new' | 'edit', event: Event): void {
    if (this.categorySuggestOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.clearCategorySuggestCloseTimer();
      this.categorySuggestOpen = null;
      this.categorySuggestRect = null;
      return;
    }
    if (mode === 'new') {
      void this.tryCloseBudgetSheetFromEscapeLikeInteraction('new');
    } else {
      void this.tryCloseBudgetSheetFromEscapeLikeInteraction('edit');
    }
  }

  /** Pointer outside an inline grid cell: same outcome as Escape on that field (primary button only). */
  onDocumentPointerDownBudgetInlineCancel(ev: Event): void {
    if (!(ev instanceof PointerEvent) || ev.button !== 0) {
      return;
    }
    const target = ev.target;
    if (!(target instanceof Node)) {
      return;
    }

    const suggestPanel = typeof document !== 'undefined' ? document.getElementById('budget-category-suggest') : null;
    if (suggestPanel?.contains(target)) {
      return;
    }
    const openSuggest = this.categorySuggestOpen;
    if (openSuggest && (openSuggest.input === target || openSuggest.input.contains(target))) {
      return;
    }

    const ctx = this.amountEdit;
    if (ctx?.kind === 'cell') {
      const cellInput =
        typeof document !== 'undefined'
          ? document.querySelector<HTMLInputElement>(
              `input[data-budget-planned-amount="${CSS.escape(ctx.positionId)}:${ctx.month}"]`
            )
          : null;
      if (!cellInput || document.activeElement !== cellInput) {
        return;
      }
      const cellTd = cellInput.closest('td');
      if (cellTd?.contains(target)) {
        return;
      }
      const position = this.positions.find((p) => p.id === ctx.positionId);
      if (!position) {
        return;
      }
      ev.preventDefault();
      this.applyBudgetCellAmountEscapeDismissal(position, ctx.month, cellInput);
      return;
    }

    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) {
      return;
    }
    const pid = active.dataset['budgetPositionName'];
    if (!pid) {
      return;
    }
    const position = this.positions.find((p) => p.id === pid);
    if (!position) {
      return;
    }
    const nameTd = active.closest('td');
    if (nameTd?.contains(target)) {
      return;
    }
    ev.preventDefault();
    this.applyBudgetPositionNameEscapeDismissal(position, active);
  }

  onCellAmountFocus(position: BudgetPosition, month: number): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    this.amountEdit = {
      kind: 'cell',
      positionId: position.id,
      month,
      draft: this.i18n.formatAmount(this.getCellDisplayAmount(position, month))
    };
    selectAllOnFocusedNumericInput();
  }

  onNewPositionDefaultFocus(): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    this.amountEdit = {
      kind: 'newDefault',
      draft: this.i18n.formatAmount(this.displayStoredDefaultForNewSheet(this.newPosition.defaultAmount))
    };
    selectAllOnFocusedNumericInput();
  }

  onAmountDraftInput(raw: string): void {
    const ctx = this.amountEdit;
    if (!ctx) {
      return;
    }
    this.amountEdit = { ...ctx, draft: raw };
    if (ctx.kind === 'cell') {
      this.liquidityPreviewRevision.update((n) => n + 1);
    }
  }

  onAmountFieldBlur(event?: FocusEvent): void {
    const ctx = this.amountEdit;
    if (!ctx) {
      return;
    }
    if (!this.canManageSelectedBaseline() && (ctx.kind === 'cell' || ctx.kind === 'newDefault' || ctx.kind === 'editDefault')) {
      this.amountEdit = null;
      return;
    }
    const draftText = event?.target instanceof HTMLInputElement ? event.target.value : ctx.draft;
    if (ctx.kind === 'cell') {
      const amount = this.parsePlannedAmountDraftForSave(draftText);
      if (amount !== null) {
        const pos = this.positions.find((p) => p.id === ctx.positionId);
        if (pos) {
          this.onCellEdited(pos, ctx.month, amount);
        }
      }
    }
    const parsed = this.i18n.parseAmount(draftText);
    if (ctx.kind === 'newDefault' && parsed !== null) {
      const cat = this.findCategoryByName(this.newPosition.categoryName);
      this.newPosition.defaultAmount = cat ? this.toStoredPlannedAmount(cat.id, parsed) : parsed;
    } else if (ctx.kind === 'editDefault' && parsed !== null && this.editPositionDraft?.id === ctx.positionId) {
      const pos = this.positions.find((p) => p.id === ctx.positionId);
      const cat = this.findCategoryByName(this.editPositionDraft.categoryName);
      const categoryId = cat?.id ?? pos?.categoryId;
      const stored = categoryId ? this.toStoredPlannedAmount(categoryId, parsed) : parsed;
      this.editPositionDraft = { ...this.editPositionDraft, defaultAmount: stored };
    }
    this.amountEdit = null;
  }

  getCellAmount(position: BudgetPosition, month: number): number {
    return position.plannedAmounts.find((item) => item.month === month && item.year === this.state.selectedYear())?.amount ?? 0;
  }

  /** API stores expense magnitudes as positive; UI shows them as negative outflows. */
  getCellDisplayAmount(position: BudgetPosition, month: number): number {
    const raw = this.getCellAmount(position, month);
    if (raw === 0) {
      return 0;
    }
    return this.isIncomeCategory(position.categoryId) ? raw : -raw;
  }

  getRowTotal(position: BudgetPosition): number {
    return this.months.reduce((sum, month) => sum + this.getCellDisplayAmount(position, month), 0);
  }

  getColumnTotal(month: number): number {
    return this.positions.reduce((sum, position) => sum + this.getCellDisplayAmount(position, month), 0);
  }

  /** Cumulative net planned cashflow from January through `month` (inclusive). */
  getRunningCashflowThrough(month: number): number {
    let sum = 0;
    for (let m = 1; m <= month; m++) {
      sum += this.getColumnTotal(m);
    }
    return sum;
  }

  getYearNetTotal(): number {
    return this.months.reduce((sum, month) => sum + this.getColumnTotal(month), 0);
  }

  focusCashflowMonth(month: number): void {
    this.setLiquidityFocusMonth(month, { zoomToMonth: true });
  }

  shiftCashflowMonth(delta: number): void {
    this.setLiquidityFocusMonth(this.wrapMonth(this.liquidityFocusMonth() + delta));
  }

  private setLiquidityFocusMonth(month: number, options?: { zoomToMonth?: boolean }): void {
    const normalized = Math.min(12, Math.max(1, Math.round(month)));
    this.liquidityFocusMonth.set(normalized);
    if (options?.zoomToMonth) {
      this.liquidityChartZoom.set('month');
    }
    this.persistLiquidityFocusMonth(normalized);
    this.rebuildLiquidityChart();
  }

  cashflowZoomIn(): void {
    if (this.liquidityChartZoom() === 'month') {
      return;
    }
    this.liquidityChartZoom.set('month');
    this.rebuildLiquidityChart();
  }

  cashflowZoomOut(): void {
    if (this.liquidityChartZoom() === 'year') {
      return;
    }
    this.liquidityChartZoom.set('year');
    this.rebuildLiquidityChart();
  }

  private refreshLiquidityChartFromPositions(): void {
    const year = this.state.selectedYear();
    const days = computeDailyLiquidity({
      year,
      positions: this.positions,
      isIncome: (categoryId) => this.isIncomeCategory(categoryId),
      resolveStoredAmount: (positionId, month) => this.resolveLiquidityStoredAmount(positionId, month)
    });
    this.applyLiquidityChart(0, days);
  }

  private resolveLiquidityStoredAmount(positionId: string, month: number): number {
    const position = this.positions.find((p) => p.id === positionId);
    if (!position) {
      return 0;
    }
    const edit = this.amountEdit;
    if (edit?.kind === 'cell' && edit.positionId === positionId && edit.month === month) {
      const parsed = this.i18n.parseAmount(edit.draft);
      if (parsed === null) {
        return this.getCellAmount(position, month);
      }
      return this.toStoredPlannedAmount(position.categoryId, parsed);
    }
    return this.getCellAmount(position, month);
  }

  private clearLiquidityChart(): void {
    this.liquidityAllDays = [];
    this.liquidityChartData = { labels: [], datasets: [] };
    this.liquidityChartPlugins = [];
    this.liquidityChartReady.set(false);
  }

  private applyLiquidityChart(_openingBalance: number, days: DailyLiquidityPoint[]): void {
    this.liquidityAllDays = days.map((d) => ({
      date: this.normalizeLiquidityDate(d.date),
      dailyNet: d.dailyNet,
      runningBalance: d.runningBalance
    }));
    this.rebuildLiquidityChart();
    this.liquidityChartReady.set(dailyLiquidityHasActivity(this.liquidityAllDays));
  }

  private normalizeLiquidityDate(raw: string): string {
    const value = String(raw ?? '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    return value;
  }

  private rebuildLiquidityChart(): void {
    const monthZoom = this.liquidityChartZoom() === 'month';
    const focusMonth = this.liquidityFocusMonth();
    const monthDays = this.liquidityAllDays.filter((d) => Number(d.date.slice(5, 7)) === focusMonth);
    const days = monthZoom ? monthDays : this.liquidityAllDays;
    const labels = days.map((day) => day.date);
    this.liquidityChartData = {
      labels,
      datasets: [
        {
          label: this.t('budget.liquidityRunningBalance'),
          data: days.map((d) => d.runningBalance),
          borderWidth: 2.5,
          tension: monthZoom ? 0.2 : 0.08,
          fill: {
            target: 'origin',
            above: 'rgba(22, 163, 74, 0.28)',
            below: 'rgba(220, 38, 38, 0.28)'
          },
          segment: {
            borderColor: (ctx) => {
              const y = ctx.p1.parsed.y;
              return typeof y === 'number' && y < 0 ? '#dc2626' : '#16a34a';
            }
          },
          pointRadius: monthZoom ? 2 : 0,
          pointHoverRadius: 4,
          pointBackgroundColor: (ctx) => {
            const y = ctx.parsed.y;
            return typeof y === 'number' && y < 0 ? '#dc2626' : '#16a34a';
          }
        }
      ]
    };
    this.liquidityChartPlugins = [
      this.buildLiquidityZeroLinePlugin(),
      this.buildLiquidityTodayMarkerPlugin(days)
    ];
    const visibleDays = days;
    this.liquidityChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 18,
          bottom: 0,
          left: 2,
          right: 2
        }
      },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              return this.formatLiquidityTooltipDate(visibleDays[index]?.date ?? '');
            },
            label: (ctx) => {
              const index = ctx.dataIndex ?? 0;
              const point = visibleDays[index];
              if (!point) {
                return '';
              }
              return [
                `${this.t('budget.liquidityRunningBalance')}: ${this.i18n.formatSignedAmount(point.runningBalance)}`,
                `${this.t('budget.liquidityDailyNet')}: ${this.i18n.formatSignedAmount(point.dailyNet)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          offset: false,
          ticks: {
            autoSkip: false,
            maxRotation: monthZoom ? 0 : 45,
            minRotation: 0,
            maxTicksLimit: monthZoom ? 16 : 14,
            padding: 0,
            color: '#5b21b6',
            font: { size: 10 },
            callback: (_value, index) => this.formatLiquidityXTick(days[index]?.date ?? '', monthZoom, index, days.length)
          },
          grid: { color: 'rgba(148, 163, 184, 0.15)', drawOnChartArea: false }
        },
        y: {
          grace: '8%',
          ticks: {
            padding: 2,
            color: '#5b21b6',
            font: { size: 10 },
            callback: (v) => this.i18n.compactSignedAmountLabel(Number(v))
          },
          grid: { color: 'rgba(148, 163, 184, 0.25)' }
        }
      }
    };
    this.liquidityChartReady.set(dailyLiquidityHasActivity(this.liquidityAllDays));
  }

  private wrapMonth(month: number): number {
    if (month < 1) {
      return 12;
    }
    if (month > 12) {
      return 1;
    }
    return month;
  }

  private formatLiquidityXTick(date: string, monthZoom: boolean, index: number, total: number): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) {
      return '';
    }
    const month = Number(m[2]);
    const dayOfMonth = Number(m[3]);
    if (dayOfMonth === 1) {
      return monthZoom ? `${String(dayOfMonth).padStart(2, '0')}.${String(month).padStart(2, '0')}` : this.monthLabel(month);
    }
    if (monthZoom) {
      if (total <= 10 || index % Math.max(1, Math.ceil(total / 8)) === 0) {
        return `${String(dayOfMonth).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
      }
      return '';
    }
    return '';
  }

  private formatLiquidityTooltipDate(date: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) {
      return date;
    }
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  private buildLiquidityZeroLinePlugin(): Plugin<'line'> {
    return {
      id: 'budget-liquidity-zero-line',
      afterDatasetsDraw: (chart) => {
        const yScale = chart.scales['y'];
        if (!yScale || !Number.isFinite(yScale.getPixelForValue(0))) {
          return;
        }
        const y = yScale.getPixelForValue(0);
        const { left, right } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.restore();
      }
    };
  }

  private buildLiquidityTodayMarkerPlugin(days: DailyLiquidityPoint[]): Plugin<'line'> {
    const today = this.localIsoDate(new Date());
    const todayIndex = days.findIndex((d) => d.date === today);
    if (todayIndex < 0) {
      return { id: 'budget-liquidity-today-marker-none' };
    }
    const todayLabel = this.t('budget.liquidityTodayLabel');
    return {
      id: 'budget-liquidity-today-marker',
      afterDatasetsDraw: (chart) => {
        const xScale = chart.scales['x'];
        if (!xScale) {
          return;
        }
        const x = xScale.getPixelForValue(todayIndex);
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(todayLabel, x, 4);
        ctx.restore();
      }
    };
  }

  private isIncomeCategory(categoryId: string): boolean {
    return this.categories.find((c) => c.id === categoryId)?.isIncome ?? true;
  }

  private findCategoryByName(name: string): Category | undefined {
    const t = name.trim().toLowerCase();
    if (!t) {
      return undefined;
    }
    return this.categories.find((c) => c.name.trim().toLowerCase() === t);
  }

  /** Persisted planned/default amount from a value the user entered in the grid or default-amount fields. */
  private toStoredPlannedAmount(categoryId: string, parsedFromUi: number): number {
    if (!Number.isFinite(parsedFromUi)) {
      return 0;
    }
    if (this.isIncomeCategory(categoryId)) {
      return parsedFromUi;
    }
    return Math.abs(parsedFromUi);
  }

  private displayStoredDefaultForNewSheet(stored: number): number {
    if (stored === 0) {
      return 0;
    }
    const cat = this.findCategoryByName(this.newPosition.categoryName);
    if (!cat) {
      return stored;
    }
    return cat.isIncome ? stored : -stored;
  }

  private displayStoredForEditSheet(categoryName: string, stored: number, fallbackCategoryId: string): number {
    if (stored === 0) {
      return 0;
    }
    const cat = this.findCategoryByName(categoryName);
    if (cat) {
      return cat.isIncome ? stored : -stored;
    }
    return this.isIncomeCategory(fallbackCategoryId) ? stored : -stored;
  }

  categoryName(categoryId: string): string {
    const raw = this.categories.find((item) => item.id === categoryId)?.name;
    if (!raw) {
      return this.t('budget.uncategorized');
    }
    return this.i18n.translateCategoryName(raw);
  }

  /** Category field value when editing; empty when the position has no resolved category. */
  private categoryDraftLabelForPosition(position: BudgetPosition): string {
    const raw = this.categories.find((item) => item.id === position.categoryId)?.name;
    if (!raw) {
      return '';
    }
    return this.i18n.translateCategoryName(raw);
  }

  private isUncategorizedPlaceholderLabel(label: string): boolean {
    const trimmed = label.trim();
    return trimmed === this.t('budget.uncategorized');
  }

  private hasValidCategoryDraft(categoryName: string): boolean {
    const trimmed = categoryName.trim();
    if (!trimmed || this.isUncategorizedPlaceholderLabel(trimmed)) {
      return false;
    }
    return true;
  }

  /** Position + months + total + optional action column (hidden on compact viewports). */
  tableDataColumnCount(): number {
    const actionCols = this.viewport.maxSm() ? 0 : 1;
    return 1 + this.months.length + 1 + actionCols;
  }

  /**
   * Table body grouped by category. Only categories with at least one position are listed,
   * ordered by category sort order then label.
   */
  positionsByCategory(): { categoryId: string; label: string; positions: BudgetPosition[] }[] {
    if (this.positions.length === 0) {
      return [];
    }
    const byCat = new Map<string, BudgetPosition[]>();
    for (const p of this.positions) {
      const list = byCat.get(p.categoryId);
      if (list) {
        list.push(p);
      } else {
        byCat.set(p.categoryId, [p]);
      }
    }
    const blocks = [...byCat.entries()].map(([categoryId, rows]) => ({
      categoryId,
      label: this.categoryName(categoryId),
      positions: [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
    }));
    blocks.sort((a, b) => {
      const ca = this.categories.find((c) => c.id === a.categoryId);
      const cb = this.categories.find((c) => c.id === b.categoryId);
      const order = (ca?.sortOrder ?? 0) - (cb?.sortOrder ?? 0);
      if (order !== 0) {
        return order;
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
    return blocks;
  }

  /** Case-insensitive substring match on translated and stored names; empty query lists all sorted by translated label. */
  filteredCategories(query: string): Category[] {
    const q = query.trim().toLowerCase();
    const sorted = [...this.categories].sort((a, b) =>
      this.i18n.translateCategoryName(a.name).localeCompare(this.i18n.translateCategoryName(b.name), undefined, { sensitivity: 'base' })
    );
    if (!q) {
      return sorted;
    }
    return sorted.filter((c) => {
      const display = this.i18n.translateCategoryName(c.name).toLowerCase();
      const stored = c.name.toLowerCase();
      return display.includes(q) || stored.includes(q);
    });
  }

  categorySuggestQuery(): string {
    const open = this.categorySuggestOpen;
    if (!open) {
      return '';
    }
    if (open.kind === 'new') {
      return this.newPosition.categoryName;
    }
    return this.editPositionDraft?.categoryName ?? '';
  }

  openCategorySuggest(input: HTMLInputElement, mode: 'new' | 'edit'): void {
    this.clearCategorySuggestCloseTimer();
    if (mode === 'new') {
      this.categorySuggestOpen = { kind: 'new', input };
    } else {
      this.categorySuggestOpen = { kind: 'edit', input };
    }
    this.updateSuggestRect(input);
  }

  /** Clears the category text and reopens the suggestion list with the full set (no filter). */
  clearCategoryField(mode: 'new' | 'edit', input: HTMLInputElement): void {
    this.clearCategorySuggestCloseTimer();
    if (mode === 'new') {
      this.newPosition.categoryName = '';
    } else if (this.editPositionDraft) {
      this.editPositionDraft = { ...this.editPositionDraft, categoryName: '' };
    }
    this.openCategorySuggest(input, mode);
  }

  refreshSuggestRect(input: HTMLInputElement): void {
    const open = this.categorySuggestOpen;
    if (open?.input === input) {
      this.updateSuggestRect(input);
    }
  }

  scheduleCloseCategorySuggest(): void {
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestCloseTimer = setTimeout(() => {
      this.categorySuggestCloseTimer = null;
      this.categorySuggestOpen = null;
      this.categorySuggestRect = null;
    }, 150);
  }

  pickCategory(storedName: string): void {
    this.clearCategorySuggestCloseTimer();
    const open = this.categorySuggestOpen;
    if (!open) {
      return;
    }
    const label = this.i18n.translateCategoryName(storedName);
    if (open.kind === 'new') {
      this.newPosition.categoryName = label;
    } else if (this.editPositionDraft) {
      this.editPositionDraft = { ...this.editPositionDraft, categoryName: label };
    }
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onWindowMoveOrResize(): void {
    const open = this.categorySuggestOpen;
    if (open?.input) {
      this.updateSuggestRect(open.input);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onDocumentEscapeBudgetUi(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !isKeyboardCancel(event)) {
      return;
    }
    if (this.categorySuggestOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.clearCategorySuggestCloseTimer();
      this.categorySuggestOpen = null;
      this.categorySuggestRect = null;
      return;
    }
    if (this.editPositionSurface === 'modal' && this.editPositionDraft) {
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseEditPositionSheet();
      return;
    }
    if (this.newPositionSheetOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseNewPositionSheet();
      return;
    }
  }

  openNewPositionSheet(): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    if (!this.tryCloseEditPositionSheet()) {
      return;
    }
    this.resetNewPositionForm();
    this.captureNewPositionFormBaseline();
    this.message = '';
    this.newPositionSheetValidationAttempted = false;
    this.newPositionSheetOpen.set(true);
  }

  closeNewPositionSheet(): void {
    this.newPositionSheetOpen.set(false);
    this.newPositionSheetValidationAttempted = false;
    this.newPositionSheetBanner = '';
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
    this.newPositionFormBaseline = '';
  }

  /** User cancel / leave: confirm when the new-position form was changed. */
  tryCloseNewPositionSheet(): boolean {
    if (!this.newPositionSheetOpen()) {
      return true;
    }
    if (!this.isNewPositionFormDirty()) {
      this.closeNewPositionSheet();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.t('budget.discardUnsavedEditConfirm'))) {
      this.closeNewPositionSheet();
      return true;
    }
    return false;
  }

  /** Clears the “new position” sheet model so each open starts empty (no leftover row). */
  private resetNewPositionForm(): void {
    this.newPosition.name = '';
    this.newPosition.categoryName = '';
    this.newPosition.cadence = 'None';
    this.newPosition.startDate = this.toDateInput(new Date());
    this.newPosition.distributionMode = 'ExactDayOfMonth';
    this.newPosition.dayOfMonth = this.dayOfMonthFromDate(this.newPosition.startDate);
    this.newPosition.endDate = '';
    this.newPositionSheetBanner = '';
    this.newPosition.defaultAmount = 0;
    this.newPosition.recurrenceIntervalMonths = 3;
    if (this.amountEdit?.kind === 'newDefault') {
      this.amountEdit = null;
    }
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
  }

  private captureNewPositionFormBaseline(): void {
    this.newPositionFormBaseline = this.serializeNewPositionFormState();
  }

  private isNewPositionFormDirty(): boolean {
    if (!this.newPositionFormBaseline) {
      return false;
    }
    return this.serializeNewPositionFormState() !== this.newPositionFormBaseline;
  }

  private serializeNewPositionFormState(): string {
    const trimmedCat = this.newPosition.categoryName.trim();
    const cat = this.findCategoryByStoredOrTranslatedLabel(trimmedCat);
    const categoryKey = cat?.id ?? `new:${trimmedCat.toLowerCase()}`;
    const endDate =
      this.newPosition.cadence === 'None'
        ? null
        : (this.newPosition.endDate ?? '').trim() === ''
          ? null
          : String(this.newPosition.endDate).trim();
    const amt = this.effectiveNewPositionDefaultAmount();
    const amtKey = Math.round(Number(amt) * 1e9) / 1e9;
    return JSON.stringify({
      name: this.newPosition.name.trim(),
      categoryKey,
      cadence: this.newPosition.cadence,
      distributionMode: this.newPosition.distributionMode,
      dayOfMonth:
        this.newPosition.distributionMode === 'EvenlyDistributed'
          ? null
          : this.normalizeDayOfMonth(this.newPosition.dayOfMonth),
      startDate: this.newPosition.startDate,
      endDate,
      defaultAmount: amtKey,
      recurrenceIntervalMonths:
        this.newPosition.cadence === 'EveryNMonths' ? this.newPosition.recurrenceIntervalMonths : null
    });
  }

  onScrollRefreshCategorySuggest(event: Event): void {
    const open = this.categorySuggestOpen;
    if (!open?.input) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.contains(open.input)) {
      this.updateSuggestRect(open.input);
    }
  }

  onBudgetRowClick(position: BudgetPosition, event: MouseEvent): void {
    if (!this.canManageSelectedBaseline() || this.isRuleBasedPosition(position)) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea')) {
      return;
    }
    this.openPrimaryEditForPosition(position);
  }

  hasBudgetRule(cadence: BudgetCadence): boolean {
    return cadence !== 'None';
  }

  isRuleBasedPosition(position: BudgetPosition): boolean {
    return this.hasBudgetRule(position.cadence);
  }

  /** Opens the budget-rule dialog (cadence, template amount, dates, planned-cell options). */
  openRuleEditForPosition(position: BudgetPosition): void {
    this.editPositionOpenedAsRule = true;
    this.openEditPositionModal(position);
  }

  /** Primary “Edit” / row click: modal with full position form (all cadences). */
  openPrimaryEditForPosition(position: BudgetPosition): void {
    this.editPositionOpenedAsRule = false;
    this.openEditPositionModal(position);
  }

  private initEditDraftFromPosition(position: BudgetPosition): void {
    const distributionMode = position.recurrenceRule?.distributionMode ?? 'ExactDayOfMonth';
    this.editPositionDraft = {
      id: position.id,
      name: position.name ?? '',
      categoryName: this.categoryDraftLabelForPosition(position),
      cadence: position.cadence,
      distributionMode,
      dayOfMonth:
        distributionMode === 'EvenlyDistributed'
          ? null
          : this.normalizeDayOfMonth(position.recurrenceRule?.dayOfMonth ?? this.dayOfMonthFromDate(position.startDate)),
      startDate: position.startDate,
      endDate: position.cadence === 'None' ? '' : (position.endDate ?? ''),
      defaultAmount: position.defaultAmount,
      recurrenceIntervalMonths: this.normalizeRecurrenceIntervalMonths(position.recurrenceRule?.intervalMonths ?? 3)
    };
    this.editPositionPlannedApplyScope = 'all';
    const y = this.state.selectedYear();
    this.editPositionPlannedApplyFrom = position.startDate;
    this.editPositionPlannedApplyTo = position.endDate ?? `${y}-12-31`;
    this.captureEditPositionFormBaseline();
  }

  openEditPositionModal(position: BudgetPosition): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    if (this.editPositionDraft?.id === position.id && this.editPositionSurface === 'modal') {
      return;
    }
    if (this.newPositionSheetOpen() && !this.tryCloseNewPositionSheet()) {
      return;
    }
    this.message = '';
    this.editPositionSheetBanner = '';
    this.editPositionValidationAttempted = false;
    this.initEditDraftFromPosition(position);
    this.editPositionSurface = 'modal';
  }

  /** User cancel / leave: confirm when the edit form was changed. Returns false if the user chose to keep editing. */
  tryCloseEditPositionSheet(): boolean {
    if (!this.editPositionDraft) {
      if (this.editPositionSurface !== null) {
        this.forceCloseEditPositionSheet();
      }
      return true;
    }
    if (!this.isEditPositionFormDirty()) {
      this.forceCloseEditPositionSheet();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.t('budget.discardUnsavedEditConfirm'))) {
      this.forceCloseEditPositionSheet();
      return true;
    }
    return false;
  }

  /** Close edit UI without confirm (save success, position removed, server sync orphan). */
  private forceCloseEditPositionSheet(): void {
    this.editPositionSurface = null;
    this.editPositionOpenedAsRule = false;
    this.editPositionDraft = null;
    this.editPositionValidationAttempted = false;
    this.editPositionPlannedApplyScope = 'all';
    this.editPositionPlannedApplyFrom = '';
    this.editPositionPlannedApplyTo = '';
    this.editPositionFormBaseline = '';
    this.editPositionSheetBanner = '';
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
    if (this.amountEdit?.kind === 'editDefault') {
      this.amountEdit = null;
    }
  }

  private isEditPositionFormDirty(): boolean {
    const d = this.editPositionDraft;
    if (!d) {
      return false;
    }
    if (!this.editPositionFormBaseline) {
      return true;
    }
    return this.serializeEditFormState() !== this.editPositionFormBaseline;
  }

  private captureEditPositionFormBaseline(): void {
    this.editPositionFormBaseline = this.serializeEditFormState();
  }

  private serializeEditFormState(): string {
    const d = this.editPositionDraft;
    if (!d) {
      return '';
    }
    const position = this.positions.find((p) => p.id === d.id);
    if (!position) {
      return `missing:${d.id}`;
    }
    const trimmedCat = d.categoryName.trim();
    const cat = this.findCategoryByStoredOrTranslatedLabel(trimmedCat);
    const categoryKey = cat?.id ?? `new:${trimmedCat.toLowerCase()}`;
    const endDate =
      d.cadence === 'None' ? null : d.endDate.trim() === '' ? null : d.endDate.trim();
    const amt = this.effectiveEditDefaultStoredAmount(d, position);
    const amtKey = Math.round(Number(amt) * 1e9) / 1e9;
    return JSON.stringify({
      name: d.name.trim(),
      categoryKey,
      cadence: d.cadence,
      distributionMode: d.distributionMode,
      dayOfMonth: d.distributionMode === 'EvenlyDistributed' ? null : this.normalizeDayOfMonth(d.dayOfMonth),
      startDate: d.startDate,
      endDate,
      defaultAmount: amtKey,
      recurrenceIntervalMonths: d.cadence === 'EveryNMonths' ? d.recurrenceIntervalMonths : null,
      plannedScope: this.editPositionPlannedApplyScope,
      plannedFrom: this.editPositionPlannedApplyFrom.trim(),
      plannedTo: this.editPositionPlannedApplyTo.trim()
    });
  }

  private effectiveEditDefaultStoredAmount(
    d: { id: string; categoryName: string; defaultAmount: number },
    position: BudgetPosition
  ): number {
    const e = this.amountEdit;
    if (e?.kind === 'editDefault' && e.positionId === d.id) {
      const parsed = this.i18n.parseAmount(e.draft);
      if (parsed !== null) {
        const cat = this.findCategoryByStoredOrTranslatedLabel(d.categoryName.trim());
        const categoryId = cat?.id ?? position.categoryId;
        return this.toStoredPlannedAmount(categoryId, parsed);
      }
    }
    return d.defaultAmount;
  }

  /**
   * Enter on new-position or edit-position sheets confirms like the spendings table (green-check path).
   * Blurs the focused field first so amount drafts flush into the model.
   */
  onBudgetSheetEnterConfirm(event: Event, mode: 'new' | 'edit'): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmForModal(event)) {
      return;
    }
    if (mode === 'new') {
      if (!this.newPositionSheetOpen()) {
        return;
      }
    } else if (this.editPositionSurface !== 'modal' || !this.editPositionDraft) {
      return;
    }
    const root = event.currentTarget;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) {
      active.blur();
    }
    queueMicrotask(() => {
      if (mode === 'new') {
        this.createPosition();
      } else {
        this.saveEditPosition();
      }
    });
  }

  /** Escape on new-position or edit-position sheets cancels (xmark path). */
  onBudgetSheetEscapeCancel(event: Event, mode: 'new' | 'edit'): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event)) {
      return;
    }
    if (this.categorySuggestOpen) {
      return;
    }
    if (mode === 'new') {
      if (!this.newPositionSheetOpen()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseBudgetSheetFromEscapeLikeInteraction('new');
      return;
    }
    if (this.editPositionSurface !== 'modal' || !this.editPositionDraft) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.tryCloseBudgetSheetFromEscapeLikeInteraction('edit');
  }

  private tryCloseBudgetSheetFromEscapeLikeInteraction(mode: 'new' | 'edit'): void {
    if (mode === 'new') {
      void this.tryCloseNewPositionSheet();
    } else {
      void this.tryCloseEditPositionSheet();
    }
  }

  private syncEditDraftFromPosition(pos: BudgetPosition): void {
    const d = this.editPositionDraft;
    if (!d || d.id !== pos.id) {
      return;
    }
    const distributionMode = pos.recurrenceRule?.distributionMode ?? 'ExactDayOfMonth';
    this.editPositionDraft = {
      id: pos.id,
      name: pos.name ?? '',
      categoryName: this.categoryDraftLabelForPosition(pos),
      cadence: pos.cadence,
      distributionMode,
      dayOfMonth:
        distributionMode === 'EvenlyDistributed'
          ? null
          : this.normalizeDayOfMonth(pos.recurrenceRule?.dayOfMonth ?? this.dayOfMonthFromDate(pos.startDate)),
      startDate: pos.startDate,
      endDate: pos.cadence === 'None' ? '' : (pos.endDate ?? ''),
      defaultAmount: pos.defaultAmount,
      recurrenceIntervalMonths: this.normalizeRecurrenceIntervalMonths(pos.recurrenceRule?.intervalMonths ?? 3)
    };
  }

  editPositionDefaultInputValue(): string {
    const e = this.amountEdit;
    const draft = this.editPositionDraft;
    if (e?.kind === 'editDefault' && draft && e.positionId === draft.id) {
      return e.draft;
    }
    if (!draft) {
      return '';
    }
    const pos = this.positions.find((p) => p.id === draft.id);
    const display = pos
      ? this.displayStoredForEditSheet(draft.categoryName, draft.defaultAmount, pos.categoryId)
      : draft.defaultAmount;
    return this.i18n.formatAmount(display);
  }

  onEditPositionDefaultFocus(): void {
    const draft = this.editPositionDraft;
    if (!draft) {
      return;
    }
    const pos = this.positions.find((p) => p.id === draft.id);
    const display = pos
      ? this.displayStoredForEditSheet(draft.categoryName, draft.defaultAmount, pos.categoryId)
      : draft.defaultAmount;
    this.amountEdit = {
      kind: 'editDefault',
      positionId: draft.id,
      draft: this.i18n.formatAmount(display)
    };
    selectAllOnFocusedNumericInput();
  }

  onEditPositionCadenceChange(cadence: BudgetCadence): void {
    if (cadence === 'None') {
      this.editPositionPlannedApplyScope = 'all';
      if (this.editPositionDraft) {
        this.editPositionDraft.endDate = '';
      }
    } else if (cadence === 'EveryNMonths' && this.editPositionDraft) {
      this.editPositionDraft.recurrenceIntervalMonths = this.normalizeRecurrenceIntervalMonths(
        this.editPositionDraft.recurrenceIntervalMonths
      );
    }
  }

  onEditPositionDistributionModeChange(mode: BudgetDistributionMode): void {
    const d = this.editPositionDraft;
    if (!d) {
      return;
    }
    d.distributionMode = mode;
    if (mode === 'EvenlyDistributed') {
      d.dayOfMonth = null;
      return;
    }
    d.dayOfMonth = this.normalizeDayOfMonth(d.dayOfMonth ?? this.dayOfMonthFromDate(d.startDate));
  }

  onNewPositionCadenceChange(cadence: BudgetCadence): void {
    if (cadence === 'None') {
      this.newPosition.endDate = '';
    } else if (cadence === 'EveryNMonths') {
      this.newPosition.recurrenceIntervalMonths = this.normalizeRecurrenceIntervalMonths(
        this.newPosition.recurrenceIntervalMonths
      );
    }
  }

  onNewPositionDistributionModeChange(mode: BudgetDistributionMode): void {
    this.newPosition.distributionMode = mode;
    if (mode === 'EvenlyDistributed') {
      this.newPosition.dayOfMonth = null;
      return;
    }
    this.newPosition.dayOfMonth = this.normalizeDayOfMonth(
      this.newPosition.dayOfMonth ?? this.dayOfMonthFromDate(this.newPosition.startDate)
    );
  }

  showNewPositionSheetValidation(): boolean {
    return this.newPositionSheetValidationAttempted;
  }

  showEditPositionValidation(): boolean {
    return this.editPositionValidationAttempted && this.editPositionDraft !== null;
  }

  newPositionNameInvalid(): boolean {
    return !this.newPosition.name.trim();
  }

  newPositionCategoryInvalid(): boolean {
    return !this.hasValidCategoryDraft(this.newPosition.categoryName);
  }

  newPositionStartInvalid(): boolean {
    if (!this.hasBudgetRule(this.newPosition.cadence)) {
      return false;
    }
    return !String(this.newPosition.startDate ?? '').trim();
  }

  newPositionEndBeforeStartInvalid(): boolean {
    if (!this.hasBudgetRule(this.newPosition.cadence)) {
      return false;
    }
    const start = String(this.newPosition.startDate ?? '').trim();
    const end = String(this.newPosition.endDate ?? '').trim();
    return Boolean(start && end && end < start);
  }

  newPositionDefaultAmountInvalid(): boolean {
    if (!this.hasBudgetRule(this.newPosition.cadence)) {
      return false;
    }
    const e = this.amountEdit;
    return e?.kind === 'newDefault' && this.isUnparseableAmountDraft(e.draft);
  }

  newPositionRecurrenceIntervalInvalid(): boolean {
    if (this.newPosition.cadence !== 'EveryNMonths') {
      return false;
    }
    return this.isRecurrenceIntervalMonthsInvalid(this.newPosition.recurrenceIntervalMonths);
  }

  newPositionDayOfMonthInvalid(): boolean {
    if (this.newPosition.distributionMode !== 'ExactDayOfMonth') {
      return false;
    }
    return this.isDayOfMonthInvalid(this.newPosition.dayOfMonth);
  }

  editPositionNameInvalid(): boolean {
    const d = this.editPositionDraft;
    return !d || !d.name.trim();
  }

  editPositionCategoryInvalid(): boolean {
    const d = this.editPositionDraft;
    return !d || !this.hasValidCategoryDraft(d.categoryName);
  }

  editPositionDayOfMonthInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d || d.distributionMode !== 'ExactDayOfMonth') {
      return false;
    }
    return this.isDayOfMonthInvalid(d.dayOfMonth);
  }

  editPositionStartInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d || !this.hasBudgetRule(d.cadence)) {
      return false;
    }
    return !String(d.startDate ?? '').trim();
  }

  editPositionEndBeforeStartInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d || !this.hasBudgetRule(d.cadence)) {
      return false;
    }
    const start = String(d.startDate ?? '').trim();
    const end = String(d.endDate ?? '').trim();
    return Boolean(start && end && end < start);
  }

  editPositionDefaultAmountInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d || !this.hasBudgetRule(d.cadence)) {
      return false;
    }
    const e = this.amountEdit;
    return Boolean(e?.kind === 'editDefault' && e.positionId === d.id && this.isUnparseableAmountDraft(e.draft));
  }

  editPositionPlannedApplyRangeInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d || d.cadence === 'None' || this.editPositionPlannedApplyScope !== 'dateRange') {
      return false;
    }
    const from = this.editPositionPlannedApplyFrom.trim();
    const to = this.editPositionPlannedApplyTo.trim();
    if (!from || !to) {
      return true;
    }
    return from > to;
  }

  private isUnparseableAmountDraft(raw: string | null | undefined): boolean {
    if (raw == null) {
      return false;
    }
    const text = raw.trim();
    if (text === '' || text === '-' || text === '+') {
      return false;
    }
    return this.i18n.parseAmount(raw) === null;
  }

  /** Cleared planned-amount cell (empty or lone sign) saves as zero; invalid text does not save. */
  private parsePlannedAmountDraftForSave(draft: string): number | null {
    const parsed = this.i18n.parseAmount(draft);
    if (parsed !== null) {
      return parsed;
    }
    let s = draft.trim().replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-');
    if (s === '' || s === '-' || s === '+') {
      return 0;
    }
    return null;
  }

  private newPositionHasBlockingFieldErrors(): boolean {
    return (
      this.newPositionNameInvalid() ||
      this.newPositionCategoryInvalid() ||
      this.newPositionStartInvalid() ||
      this.newPositionEndBeforeStartInvalid() ||
      this.newPositionDefaultAmountInvalid() ||
      this.newPositionRecurrenceIntervalInvalid() ||
      this.newPositionDayOfMonthInvalid()
    );
  }

  private editPositionHasBlockingFieldErrors(): boolean {
    const d = this.editPositionDraft;
    if (!d) {
      return false;
    }
    const needsRuleFields = this.hasBudgetRule(d.cadence);
    return (
      this.editPositionNameInvalid() ||
      this.editPositionCategoryInvalid() ||
      (needsRuleFields && !String(d.startDate ?? '').trim()) ||
      this.editPositionEndBeforeStartInvalid() ||
      this.editPositionDefaultAmountInvalid() ||
      this.editPositionPlannedApplyRangeInvalid() ||
      this.editPositionRecurrenceIntervalInvalid() ||
      this.editPositionDayOfMonthInvalid()
    );
  }

  editPositionRecurrenceIntervalInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d || d.cadence !== 'EveryNMonths') {
      return false;
    }
    return this.isRecurrenceIntervalMonthsInvalid(d.recurrenceIntervalMonths);
  }

  saveEditPosition(): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    const baselineId = this.state.selectedBaselineId();
    const draft = this.editPositionDraft;
    if (!baselineId || !draft) {
      this.setMessage('msg.selectBaselineFirst', 'error');
      return;
    }
    if (this.editPositionHasBlockingFieldErrors()) {
      this.editPositionValidationAttempted = true;
      return;
    }
    this.editPositionSheetBanner = '';

    const categoryName = draft.categoryName.trim();

    const position = this.positions.find((p) => p.id === draft.id);
    if (!position) {
      return;
    }

    const defaultAmountFromUi =
      this.amountEdit?.kind === 'editDefault' && this.amountEdit.positionId === draft.id
        ? this.i18n.parseAmount(this.amountEdit.draft)
        : null;
    const endDate: string | null = draft.cadence === 'None' ? null : draft.endDate.trim() === '' ? null : draft.endDate;

    this.resolveCategoryId$(categoryName)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((categoryId) => {
          const noRule = !this.hasBudgetRule(draft.cadence);
          const defaultAmount = noRule
            ? 0
            : defaultAmountFromUi !== null
              ? this.toStoredPlannedAmount(categoryId, defaultAmountFromUi)
              : draft.defaultAmount;
          const startDateForSave = noRule ? position.startDate : draft.startDate;
          const templateDriveChanged =
            draft.cadence !== position.cadence ||
            startDateForSave !== position.startDate ||
            endDate !== (position.endDate ?? null) ||
            Math.abs(Number(defaultAmount) - Number(position.defaultAmount)) > 1e-9 ||
            this.recurrenceIntervalTemplateChanged(draft, position);

          if (templateDriveChanged && draft.cadence !== 'None' && this.editPositionPlannedApplyScope === 'dateRange') {
            const from = this.editPositionPlannedApplyFrom.trim();
            const to = this.editPositionPlannedApplyTo.trim();
            if (!from || !to || from > to) {
              this.setMessage('msg.editPositionApplyRangeInvalid', 'error');
              return EMPTY;
            }
          }

          const nameForSave = draft.name.trim();
          return this.api.updatePosition(
            baselineId,
            position.id,
            this.buildEditPositionUpdatePayload(
              position,
              draft,
              categoryId,
              defaultAmount,
              endDate,
              nameForSave,
              startDateForSave
            )
          );
        })
      )
      .subscribe({
        next: () => {
          this.amountEdit = null;
          this.forceCloseEditPositionSheet();
          this.setMessage('msg.updatePositionSuccess', 'success');
          this.budgetDataReload.update((n) => n + 1);
        },
        error: () => this.setMessage('msg.updatePositionFailed', 'error')
      });
  }

  private buildEditPositionUpdatePayload(
    position: BudgetPosition,
    draft: {
      id: string;
      name: string;
      categoryName: string;
      cadence: BudgetCadence;
      distributionMode: BudgetDistributionMode;
      dayOfMonth: number | null;
      startDate: string;
      endDate: string;
      defaultAmount: number;
      recurrenceIntervalMonths: number;
    },
    categoryId: string,
    defaultAmount: number,
    endDate: string | null,
    name: string,
    startDate: string
  ) {
    const base = this.patchPayload(position, {
      categoryId,
      name,
      cadence: draft.cadence,
      startDate,
      endDate,
      defaultAmount,
      recurrenceIntervalMonths: draft.recurrenceIntervalMonths,
      distributionMode: draft.distributionMode,
      dayOfMonth: draft.distributionMode === 'EvenlyDistributed' ? null : draft.dayOfMonth
    });
    const templateDriveChanged =
      draft.cadence !== position.cadence ||
      startDate !== position.startDate ||
      endDate !== (position.endDate ?? null) ||
      Math.abs(Number(defaultAmount) - Number(position.defaultAmount)) > 1e-9 ||
      this.recurrenceIntervalTemplateChanged(draft, position);
    if (!templateDriveChanged) {
      return base;
    }
    if (!this.hasBudgetRule(draft.cadence)) {
      return { ...base, plannedAmountsScope: 'All' as const };
    }
    if (this.editPositionPlannedApplyScope === 'dateRange') {
      return {
        ...base,
        plannedAmountsScope: 'DateRange' as const,
        plannedAmountsApplyFrom: this.editPositionPlannedApplyFrom.trim(),
        plannedAmountsApplyTo: this.editPositionPlannedApplyTo.trim()
      };
    }
    return { ...base, plannedAmountsScope: 'All' as const };
  }

  createPosition(): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId) {
      this.setMessage('msg.selectBaselineFirst', 'error');
      return;
    }
    if (this.newPositionHasBlockingFieldErrors()) {
      this.newPositionSheetValidationAttempted = true;
      return;
    }
    this.newPositionSheetBanner = '';

    const categoryName = this.newPosition.categoryName.trim();
    const positionName = this.newPosition.name.trim();
    const year = this.state.selectedYear();
    const noRule = !this.hasBudgetRule(this.newPosition.cadence);

    this.resolveCategoryId$(categoryName)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((categoryId) =>
          this.api.createPosition(baselineId, {
            categoryId,
            name: positionName,
            cadence: this.newPosition.cadence,
            startDate: noRule ? `${year}-01-01` : this.newPosition.startDate,
            endDate: noRule ? null : this.newPosition.endDate || null,
            defaultAmount: noRule ? 0 : this.toStoredPlannedAmount(categoryId, this.effectiveNewPositionDefaultAmount()),
            sortOrder: this.positions.length + 1,
            distributionMode: this.newPosition.distributionMode,
            dayOfMonth:
              this.newPosition.distributionMode === 'EvenlyDistributed'
                ? null
                : this.normalizeDayOfMonth(this.newPosition.dayOfMonth ?? this.dayOfMonthFromDate(this.newPosition.startDate)),
            ...(this.newPosition.cadence === 'EveryNMonths'
              ? {
                  intervalMonths: this.normalizeRecurrenceIntervalMonths(this.newPosition.recurrenceIntervalMonths)
                }
              : {})
          })
        )
      )
      .subscribe({
        next: (created) => {
          this.resetNewPositionForm();
          this.closeNewPositionSheet();
          this.setMessage('msg.createPositionSuccess', 'success');
          this.budgetDataReload.update((n) => n + 1);
        },
        error: () => this.setMessage('msg.createPositionFailed', 'error')
      });
  }

  onPositionNameBlur(position: BudgetPosition, rawName: string): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId) {
      return;
    }
    const trimmed = rawName.trim();
    if (!trimmed || trimmed === position.name.trim()) {
      return;
    }

    this.api
      .updatePosition(baselineId, position.id, this.patchPayload(position, { name: trimmed }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.applyPositionUpdate(position, updated);
          this.setMessage('msg.updatePositionSuccess', 'success');
        },
        error: () => this.setMessage('msg.updatePositionFailed', 'error')
      });
  }

  private effectiveNewPositionDefaultAmount(): number {
    if (this.amountEdit?.kind === 'newDefault') {
      return this.i18n.parseAmount(this.amountEdit.draft) ?? this.newPosition.defaultAmount;
    }
    return this.newPosition.defaultAmount;
  }

  reapplyRecurrenceTemplate(position: BudgetPosition): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    const baselineId = this.state.selectedBaselineId();
    const year = this.state.selectedYear();
    if (!baselineId) {
      return;
    }
    if (!window.confirm(this.t('msg.confirmReapplyRecurrence'))) {
      return;
    }

    this.api
      .reapplyPositionRecurrenceTemplate(baselineId, position.id, year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setMessage('msg.reapplyRecurrenceSuccess', 'success');
          this.budgetDataReload.update((n) => n + 1);
        },
        error: () => this.setMessage('msg.reapplyRecurrenceFailed', 'error')
      });
  }

  /** Reapply template for the line currently open in the edit sheet (cadence lines only). */
  reapplyRecurrenceTemplateForEditingPosition(): void {
    const id = this.editPositionDraft?.id;
    if (!id) {
      return;
    }
    const position = this.positions.find((p) => p.id === id);
    if (!position) {
      return;
    }
    this.reapplyRecurrenceTemplate(position);
  }

  /** Shown when the draft line uses a recurring cadence. */
  editSheetShowsTemplateReapply(): boolean {
    return this.editPositionDraft !== null && this.editPositionDraft.cadence !== 'None';
  }

  isPositionDeleteInFlight(positionId: string): boolean {
    return this.deletingPositionIds().has(positionId);
  }

  deleteEditingPositionFromModal(): void {
    const draft = this.editPositionDraft;
    if (!draft || !this.canManageSelectedBaseline()) {
      return;
    }
    const position = this.positions.find((p) => p.id === draft.id);
    if (!position) {
      return;
    }
    this.deletePosition(position);
  }

  deletePosition(position: BudgetPosition): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    if (this.isPositionDeleteInFlight(position.id)) {
      return;
    }

    this.setPositionDeleteInFlight(position.id, true);

    this.api
      .deletePosition(position.baselineId, position.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.setPositionDeleteInFlight(position.id, false);
        })
      )
      .subscribe({
        next: () => {
          this.removePositionFromView(position.id);
          this.setMessage('msg.deletePositionSuccess', 'success');
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.removePositionFromView(position.id);
            return;
          }
          this.setMessage('msg.deletePositionFailed', 'error');
        }
      });
  }

  private removePositionFromView(positionId: string): void {
    this.positions = this.positions.filter((item) => item.id !== positionId);
    if (this.editPositionDraft?.id === positionId) {
      this.forceCloseEditPositionSheet();
    }
  }

  private setPositionDeleteInFlight(positionId: string, inFlight: boolean): void {
    this.deletingPositionIds.update((current) => {
      const next = new Set(current);
      if (inFlight) {
        next.add(positionId);
      } else {
        next.delete(positionId);
      }
      return next;
    });
  }

  monthLabel(month: number): string {
    return this.t(`monthShort.${month}`);
  }

  /** Cashflow month-zoom badge, e.g. "Jun 2026". */
  cashflowMonthBadgeLabel(): string {
    return `${this.monthLabel(this.liquidityFocusMonth())} ${this.state.selectedYear()}`;
  }

  /** Modal heading: budget-rule dialog vs full position edit. */
  editPositionSheetTitle(): string {
    const d = this.editPositionDraft;
    if (this.editPositionOpenedAsRule || (d && this.hasBudgetRule(d.cadence))) {
      return this.t('budget.editBudgetRuleSheetTitle');
    }
    return this.t('budget.editPositionSheetTitle');
  }

  cadenceLabel(cadence: BudgetCadence): string {
    if (cadence === 'None') {
      return this.t('budget.none');
    }
    if (cadence === 'Monthly') {
      return this.t('budget.monthly');
    }
    if (cadence === 'Yearly') {
      return this.t('budget.yearly');
    }
    return this.t('budget.everyNMonths');
  }

  distributionModeLabel(mode: BudgetDistributionMode): string {
    return mode === 'EvenlyDistributed' ? this.t('budget.distributionModeEven') : this.t('budget.distributionModeExactDay');
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private clearOverlayFeedbackMessages(): void {
    this.newPositionSheetBanner = '';
    this.editPositionSheetBanner = '';
  }

  private setMessage(message: string, type: 'success' | 'error'): void {
    if (this.messageClearTimer) {
      clearTimeout(this.messageClearTimer);
      this.messageClearTimer = null;
    }
    if (type === 'success') {
      this.clearOverlayFeedbackMessages();
      this.message = '';
      return;
    }
    if (this.newPositionSheetOpen()) {
      this.message = '';
      this.clearOverlayFeedbackMessages();
      this.newPositionSheetBanner = message;
      this.newPositionSheetBannerType = type;
      this.scheduleErrorMessageAutoClear();
      return;
    }
    if (this.editPositionDraft !== null) {
      this.message = '';
      this.newPositionSheetBanner = '';
      this.editPositionSheetBanner = message;
      this.editPositionSheetBannerType = type;
      this.scheduleErrorMessageAutoClear();
      return;
    }
    this.clearOverlayFeedbackMessages();
    this.message = message;
    this.messageType = type;
    this.scheduleErrorMessageAutoClear();
  }

  private scheduleErrorMessageAutoClear(): void {
    this.messageClearTimer = setTimeout(() => {
      this.message = '';
      this.clearOverlayFeedbackMessages();
      this.messageClearTimer = null;
    }, this.messageAutoClearMs);
  }

  /**
   * Resolves a category id, optionally creating the category after user confirmation.
   * Callers should chain with switchMap to run follow-up API calls immediately after the category exists.
   */
  private resolveCategoryId$(categoryName: string) {
    const trimmed = categoryName.trim();
    const existing = this.findCategoryByStoredOrTranslatedLabel(trimmed);
    if (existing) {
      return of(existing.id);
    }
    if (!this.isOwnerOfSelectedBaseline()) {
      this.setMessage('msg.createCategoryFailed', 'error');
      return EMPTY;
    }

    return defer(() => {
      if (!window.confirm(this.t('msg.confirmCreateCategory', { name: trimmed }))) {
        return EMPTY;
      }
      return this.api
        .createCategory({
          name: trimmed,
          sortOrder: this.categories.length + 1,
          color: null
        })
        .pipe(
          tap((created) => {
            this.categories = [...this.categories, created];
          }),
          map((created) => created.id),
          catchError(() => {
            this.setMessage('msg.createCategoryFailed', 'error');
            return EMPTY;
          })
        );
    });
  }

  private findCategoryByStoredOrTranslatedLabel(trimmed: string): Category | undefined {
    const normalized = trimmed.toLowerCase();
    return this.categories.find((category) => {
      if (category.name.trim().toLowerCase() === normalized) {
        return true;
      }
      return this.i18n.translateCategoryName(category.name).trim().toLowerCase() === normalized;
    });
  }

  private updateSuggestRect(input: HTMLInputElement): void {
    const r = input.getBoundingClientRect();
    this.categorySuggestRect = { top: r.bottom + 2, left: r.left, width: r.width };
  }

  private clearCategorySuggestCloseTimer(): void {
    if (this.categorySuggestCloseTimer) {
      clearTimeout(this.categorySuggestCloseTimer);
      this.categorySuggestCloseTimer = null;
    }
  }

  private toDateInput(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private isRecurrenceIntervalMonthsInvalid(n: number): boolean {
    const x = Number(n);
    if (!Number.isFinite(x)) {
      return true;
    }
    const rounded = Math.round(x);
    return rounded < 2 || rounded > 24;
  }

  private normalizeRecurrenceIntervalMonths(n: number): number {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) {
      return 3;
    }
    return Math.min(24, Math.max(2, x));
  }

  private isDayOfMonthInvalid(n: number | null): boolean {
    if (n == null) {
      return true;
    }
    const x = Number(n);
    if (!Number.isFinite(x)) {
      return true;
    }
    const rounded = Math.round(x);
    return rounded < 1 || rounded > 31;
  }

  private normalizeDayOfMonth(n: number | null | undefined): number {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) {
      return 1;
    }
    return Math.min(31, Math.max(1, x));
  }

  private dayOfMonthFromDate(raw: string): number {
    const date = String(raw ?? '').trim();
    const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!parsed) {
      return 1;
    }
    const day = Number(parsed[3]);
    return this.normalizeDayOfMonth(Number.isFinite(day) ? day : 1);
  }

  private readLiquidityFocusMonth(): number {
    try {
      const raw = localStorage.getItem(this.liquidityFocusMonthStorageKey);
      const month = Number(raw);
      if (Number.isFinite(month) && month >= 1 && month <= 12) {
        return month;
      }
    } catch {
      // Ignore storage failures.
    }
    return this.defaultLiquidityFocusMonth();
  }

  private persistLiquidityFocusMonth(month: number): void {
    try {
      localStorage.setItem(this.liquidityFocusMonthStorageKey, String(month));
    } catch {
      // Ignore storage failures.
    }
  }

  private defaultLiquidityFocusMonth(): number {
    const selectedYear = this.state.selectedYear();
    const calendarYear = new Date().getFullYear();
    if (selectedYear !== calendarYear) {
      return 1;
    }
    return new Date().getMonth() + 1;
  }

  private localIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private recurrenceIntervalTemplateChanged(
    draft: { cadence: BudgetCadence; recurrenceIntervalMonths: number },
    position: BudgetPosition
  ): boolean {
    const d =
      draft.cadence === 'EveryNMonths' ? this.normalizeRecurrenceIntervalMonths(draft.recurrenceIntervalMonths) : null;
    const p =
      position.cadence === 'EveryNMonths'
        ? this.normalizeRecurrenceIntervalMonths(position.recurrenceRule?.intervalMonths ?? 3)
        : null;
    return d !== p;
  }

  private patchPayload(
    position: BudgetPosition,
    overrides: Partial<Pick<BudgetPosition, 'categoryId' | 'name' | 'cadence' | 'startDate' | 'defaultAmount' | 'sortOrder'>> & {
      endDate?: string | null;
      recurrenceIntervalMonths?: number;
      distributionMode?: BudgetDistributionMode;
      dayOfMonth?: number | null;
    }
  ): {
    categoryId: string;
    name: string;
    cadence: BudgetCadence;
    startDate: string;
    endDate?: string | null;
    defaultAmount: number;
    sortOrder: number;
    intervalMonths?: number;
    distributionMode?: BudgetDistributionMode;
    dayOfMonth?: number | null;
  } {
    const merged = { ...position, ...overrides };
    const payload: {
      categoryId: string;
      name: string;
      cadence: BudgetCadence;
      startDate: string;
      endDate?: string | null;
      defaultAmount: number;
      sortOrder: number;
      intervalMonths?: number;
      distributionMode?: BudgetDistributionMode;
      dayOfMonth?: number | null;
    } = {
      categoryId: merged.categoryId,
      name: merged.name.trim(),
      cadence: merged.cadence,
      startDate: merged.startDate,
      endDate: merged.endDate ?? null,
      defaultAmount: Number(merged.defaultAmount) || 0,
      sortOrder: merged.sortOrder,
      distributionMode: overrides.distributionMode ?? position.recurrenceRule?.distributionMode ?? 'ExactDayOfMonth'
    };
    payload.dayOfMonth =
      payload.distributionMode === 'EvenlyDistributed'
        ? null
        : this.normalizeDayOfMonth(
            overrides.dayOfMonth ?? position.recurrenceRule?.dayOfMonth ?? this.dayOfMonthFromDate(position.startDate)
          );
    if (merged.cadence === 'EveryNMonths') {
      payload.intervalMonths = this.normalizeRecurrenceIntervalMonths(
        overrides.recurrenceIntervalMonths ?? position.recurrenceRule?.intervalMonths ?? 3
      );
    }
    return payload;
  }

  private applyPositionUpdate(position: BudgetPosition, updated: BudgetPosition): void {
    position.categoryId = updated.categoryId;
    position.name = updated.name;
    position.cadence = updated.cadence;
    position.startDate = updated.startDate;
    position.endDate = updated.endDate ?? undefined;
    position.defaultAmount = updated.defaultAmount;
    position.sortOrder = updated.sortOrder;
    position.recurrenceRule = updated.recurrenceRule;
    if (this.editPositionDraft?.id === position.id) {
      this.syncEditDraftFromPosition(position);
      this.captureEditPositionFormBaseline();
    }
  }

}
