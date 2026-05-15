import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { bufferTime, catchError, defer, EMPTY, filter, finalize, forkJoin, map, of, Subject, switchMap, tap } from 'rxjs';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import {
  confirmDiscardUnsavedChanges,
  isKeyboardCancel,
  shouldKeyboardCancelFromTarget,
  shouldKeyboardConfirmForModal,
  shouldKeyboardConfirmFromTarget
} from '../core/keyboard-confirm-cancel';
import { BudgetCadence, BudgetPosition, Category } from '../core/budget.models';

@Component({
  selector: 'app-budget-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './budget-page.component.html',
  styleUrl: './budget-page.component.css'
})
export class BudgetPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  yearToolbarLabelClasses(): string {
    return this.state.isSelectedYearOffCalendar()
      ? 'select-none inline-flex items-center gap-1 text-xs font-semibold text-amber-900'
      : 'select-none text-xs font-medium text-violet-600';
  }

  yearToolbarInputClasses(): string {
    const base =
      'min-h-10 w-full rounded border px-2 py-2 text-right text-sm tabular-nums transition-colors sm:min-h-0 sm:w-24 sm:py-1';
    if (this.state.isSelectedYearOffCalendar()) {
      return `${base} border-amber-400 bg-amber-50 font-semibold text-amber-950 shadow-sm ring-2 ring-amber-200`;
    }
    return `${base} border-violet-200 bg-violet-50 text-violet-900`;
  }

  private readonly budgetHelpWrap = viewChild<ElementRef<HTMLElement>>('budgetHelpWrap');
  readonly budgetHelpTouchOpen = signal(false);

  /** Incremented to re-fetch categories/positions when baseline/year are unchanged (e.g. after server-side mutations). */
  private readonly budgetDataReload = signal(0);

  readonly months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  readonly cadences: BudgetCadence[] = ['None', 'Monthly', 'Yearly'];

  categories: Category[] = [];
  positions: BudgetPosition[] = [];
  /** Signal (not a plain field) so async load completion always schedules a view refresh. */
  readonly loading = signal(false);
  savingCells = false;
  message = '';
  messageType: 'success' | 'error' = 'success';

  /** Server / flow errors while the new-position sheet is open (shown inside the dialog, not behind it). */
  newPositionSheetBanner = '';
  newPositionSheetBannerType: 'success' | 'error' = 'error';

  /** Server / flow errors while the edit-position modal is open (shown inside the dialog, not behind it). */
  editPositionSheetBanner = '';
  editPositionSheetBannerType: 'success' | 'error' = 'error';

  newPosition = {
    name: '',
    categoryName: '',
    cadence: 'Monthly' as BudgetCadence,
    startDate: this.toDateInput(new Date()),
    endDate: '' as string | null,
    defaultAmount: 0
  };

  /** Bottom sheet / compact dialog for creating a position (keeps the table uncluttered on small screens). */
  newPositionSheetOpen = false;

  /** When true, new-position sheet shows field-level errors after a failed submit attempt. */
  newPositionSheetValidationAttempted = false;

  /** When true, edit modal shows field-level errors after a failed save attempt. */
  editPositionValidationAttempted = false;

  /** Position meta (name, category, cadence, dates, planned scope) edits use a modal; month amounts stay as table cell inputs. */
  editPositionSurface: 'modal' | null = null;

  editPositionDraft: {
    id: string;
    name: string;
    categoryName: string;
    cadence: BudgetCadence;
    startDate: string;
    endDate: string;
    defaultAmount: number;
  } | null = null;

  /** How planned grid cells are aligned to the template when cadence/amount/dates change (recurring lines). */
  editPositionPlannedApplyScope: 'all' | 'dateRange' = 'all';
  editPositionPlannedApplyFrom = '';
  editPositionPlannedApplyTo = '';

  /** Serialized edit form at open or after server sync (dirty check before cancel). */
  private editPositionFormBaseline = '';

  /** Serialized new-position form right after the sheet opens (dirty check before cancel). */
  private newPositionFormBaseline = '';

  private readonly deletingPositionIds = new Set<string>();

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
      this.i18n.language();
      this.amountEdit = null;
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
    t.value = position.name;
    t.blur();
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
    if (this.amountEdit?.kind === 'cell' && this.amountEdit.positionId === position.id && this.amountEdit.month === month) {
      this.amountEdit = null;
    }
    t.value = this.i18n.formatAmount(this.getCellDisplayAmount(position, month));
    t.blur();
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
  }

  onNewPositionDefaultFocus(): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    this.amountEdit = {
      kind: 'newDefault',
      draft: this.i18n.formatAmount(this.displayStoredDefaultForNewSheet(this.newPosition.defaultAmount))
    };
  }

  onAmountDraftInput(raw: string): void {
    const ctx = this.amountEdit;
    if (!ctx) {
      return;
    }
    this.amountEdit = { ...ctx, draft: raw };
  }

  onAmountFieldBlur(): void {
    const ctx = this.amountEdit;
    if (!ctx) {
      return;
    }
    if (!this.canManageSelectedBaseline() && (ctx.kind === 'cell' || ctx.kind === 'newDefault' || ctx.kind === 'editDefault')) {
      this.amountEdit = null;
      return;
    }
    const parsed = this.i18n.parseAmount(ctx.draft);
    if (ctx.kind === 'cell') {
      if (parsed !== null) {
        const pos = this.positions.find((p) => p.id === ctx.positionId);
        if (pos) {
          this.onCellEdited(pos, ctx.month, parsed);
        }
      }
    } else if (ctx.kind === 'newDefault' && parsed !== null) {
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

  /** Position + months + total + action. */
  tableDataColumnCount(): number {
    return 1 + this.months.length + 2;
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
    if (this.newPositionSheetOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseNewPositionSheet();
      return;
    }
    if (this.budgetHelpTouchOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.budgetHelpTouchOpen.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClickCloseBudgetHelp(ev: MouseEvent): void {
    if (!this.budgetHelpTouchOpen()) {
      return;
    }
    const wrap = this.budgetHelpWrap()?.nativeElement;
    if (!wrap) {
      return;
    }
    if (wrap.contains(ev.target as Node)) {
      return;
    }
    this.budgetHelpTouchOpen.set(false);
  }

  onBudgetHelpClick(ev: MouseEvent): void {
    if (this.budgetHelpUsesHoverTooltip()) {
      return;
    }
    ev.stopPropagation();
    this.budgetHelpTouchOpen.update((open) => !open);
  }

  budgetHelpAriaExpanded(): boolean | null {
    if (this.budgetHelpUsesHoverTooltip()) {
      return null;
    }
    return this.budgetHelpTouchOpen();
  }

  private budgetHelpUsesHoverTooltip(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
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
    this.newPositionSheetOpen = true;
  }

  closeNewPositionSheet(): void {
    this.newPositionSheetOpen = false;
    this.newPositionSheetValidationAttempted = false;
    this.newPositionSheetBanner = '';
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
    this.newPositionFormBaseline = '';
  }

  /** User cancel / leave: confirm when the new-position form was changed. */
  tryCloseNewPositionSheet(): boolean {
    if (!this.newPositionSheetOpen) {
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
    this.newPosition.cadence = 'Monthly';
    this.newPosition.startDate = this.toDateInput(new Date());
    this.newPosition.endDate = '';
    this.newPositionSheetBanner = '';
    this.newPosition.defaultAmount = 0;
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
    const endDate = (this.newPosition.endDate ?? '').trim() === '' ? null : String(this.newPosition.endDate).trim();
    const amt = this.effectiveNewPositionDefaultAmount();
    const amtKey = Math.round(Number(amt) * 1e9) / 1e9;
    return JSON.stringify({
      name: this.newPosition.name.trim(),
      categoryKey,
      cadence: this.newPosition.cadence,
      startDate: this.newPosition.startDate,
      endDate,
      defaultAmount: amtKey
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
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea')) {
      return;
    }
    this.openPrimaryEditForPosition(position);
  }

  /** Primary “Edit” / row click: modal with full position form (all cadences). */
  openPrimaryEditForPosition(position: BudgetPosition): void {
    this.openEditPositionModal(position);
  }

  private initEditDraftFromPosition(position: BudgetPosition): void {
    this.editPositionDraft = {
      id: position.id,
      name: position.name ?? '',
      categoryName: this.categoryName(position.categoryId),
      cadence: position.cadence,
      startDate: position.startDate,
      endDate: position.endDate ?? '',
      defaultAmount: position.defaultAmount
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
    if (this.newPositionSheetOpen && !this.tryCloseNewPositionSheet()) {
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
    const endDate = d.endDate.trim() === '' ? null : d.endDate.trim();
    const amt = this.effectiveEditDefaultStoredAmount(d, position);
    const amtKey = Math.round(Number(amt) * 1e9) / 1e9;
    return JSON.stringify({
      name: d.name.trim(),
      categoryKey,
      cadence: d.cadence,
      startDate: d.startDate,
      endDate,
      defaultAmount: amtKey,
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
      if (!this.newPositionSheetOpen) {
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
      if (!this.newPositionSheetOpen) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseNewPositionSheet();
      return;
    }
    if (this.editPositionSurface !== 'modal' || !this.editPositionDraft) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void this.tryCloseEditPositionSheet();
  }

  private syncEditDraftFromPosition(pos: BudgetPosition): void {
    const d = this.editPositionDraft;
    if (!d || d.id !== pos.id) {
      return;
    }
    this.editPositionDraft = {
      id: pos.id,
      name: pos.name ?? '',
      categoryName: this.categoryName(pos.categoryId),
      cadence: pos.cadence,
      startDate: pos.startDate,
      endDate: pos.endDate ?? '',
      defaultAmount: pos.defaultAmount
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
  }

  onEditPositionCadenceChange(cadence: BudgetCadence): void {
    if (cadence === 'None') {
      this.editPositionPlannedApplyScope = 'all';
    }
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
    return !this.newPosition.categoryName.trim();
  }

  newPositionStartInvalid(): boolean {
    return !String(this.newPosition.startDate ?? '').trim();
  }

  newPositionEndBeforeStartInvalid(): boolean {
    const start = String(this.newPosition.startDate ?? '').trim();
    const end = String(this.newPosition.endDate ?? '').trim();
    return Boolean(start && end && end < start);
  }

  newPositionDefaultAmountInvalid(): boolean {
    const e = this.amountEdit;
    return e?.kind === 'newDefault' && this.isUnparseableAmountDraft(e.draft);
  }

  editPositionNameInvalid(): boolean {
    const d = this.editPositionDraft;
    return !d || !d.name.trim();
  }

  editPositionCategoryInvalid(): boolean {
    const d = this.editPositionDraft;
    return !d || !d.categoryName.trim();
  }

  editPositionStartInvalid(): boolean {
    const d = this.editPositionDraft;
    return !d || !String(d.startDate ?? '').trim();
  }

  editPositionEndBeforeStartInvalid(): boolean {
    const d = this.editPositionDraft;
    if (!d) {
      return false;
    }
    const start = String(d.startDate ?? '').trim();
    const end = String(d.endDate ?? '').trim();
    return Boolean(start && end && end < start);
  }

  editPositionDefaultAmountInvalid(): boolean {
    const d = this.editPositionDraft;
    const e = this.amountEdit;
    return Boolean(d && e?.kind === 'editDefault' && e.positionId === d.id && this.isUnparseableAmountDraft(e.draft));
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

  private newPositionHasBlockingFieldErrors(): boolean {
    return (
      this.newPositionNameInvalid() ||
      this.newPositionCategoryInvalid() ||
      this.newPositionStartInvalid() ||
      this.newPositionEndBeforeStartInvalid() ||
      this.newPositionDefaultAmountInvalid()
    );
  }

  private editPositionHasBlockingFieldErrors(): boolean {
    const d = this.editPositionDraft;
    if (!d) {
      return false;
    }
    return (
      this.editPositionNameInvalid() ||
      this.editPositionCategoryInvalid() ||
      !String(d.startDate ?? '').trim() ||
      this.editPositionEndBeforeStartInvalid() ||
      this.editPositionDefaultAmountInvalid() ||
      this.editPositionPlannedApplyRangeInvalid()
    );
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
    const endDate: string | null = draft.endDate.trim() === '' ? null : draft.endDate;

    this.resolveCategoryId$(categoryName)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((categoryId) => {
          const defaultAmount =
            defaultAmountFromUi !== null
              ? this.toStoredPlannedAmount(categoryId, defaultAmountFromUi)
              : draft.defaultAmount;
          const templateDriveChanged =
            draft.cadence !== position.cadence ||
            draft.startDate !== position.startDate ||
            endDate !== (position.endDate ?? null) ||
            Math.abs(Number(defaultAmount) - Number(position.defaultAmount)) > 1e-9;

          if (templateDriveChanged && draft.cadence !== 'None' && this.editPositionPlannedApplyScope === 'dateRange') {
            const from = this.editPositionPlannedApplyFrom.trim();
            const to = this.editPositionPlannedApplyTo.trim();
            if (!from || !to || from > to) {
              this.setMessage('msg.editPositionApplyRangeInvalid', 'error');
              return EMPTY;
            }
          }

          return this.api.updatePosition(
            baselineId,
            position.id,
            this.buildEditPositionUpdatePayload(position, draft, categoryId, defaultAmount, endDate, draft.name.trim())
          );
        })
      )
      .subscribe({
        next: () => {
          this.amountEdit = null;
          this.forceCloseEditPositionSheet();
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
      startDate: string;
      endDate: string;
      defaultAmount: number;
    },
    categoryId: string,
    defaultAmount: number,
    endDate: string | null,
    name: string
  ) {
    const base = this.patchPayload(position, {
      categoryId,
      name,
      cadence: draft.cadence,
      startDate: draft.startDate,
      endDate,
      defaultAmount
    });
    const templateDriveChanged =
      draft.cadence !== position.cadence ||
      draft.startDate !== position.startDate ||
      endDate !== (position.endDate ?? null) ||
      Math.abs(Number(defaultAmount) - Number(position.defaultAmount)) > 1e-9;
    if (!templateDriveChanged) {
      return base;
    }
    if (draft.cadence === 'None') {
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

    this.resolveCategoryId$(categoryName)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((categoryId) =>
          this.api.createPosition(baselineId, {
            categoryId,
            name: positionName,
            cadence: this.newPosition.cadence,
            startDate: this.newPosition.startDate,
            endDate: this.newPosition.endDate || null,
            defaultAmount: this.toStoredPlannedAmount(categoryId, this.effectiveNewPositionDefaultAmount()),
            sortOrder: this.positions.length + 1
          })
        )
      )
      .subscribe({
        next: () => {
          this.resetNewPositionForm();
          this.closeNewPositionSheet();
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
        next: (updated) => this.applyPositionUpdate(position, updated),
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
        next: () => this.budgetDataReload.update((n) => n + 1),
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
    return this.deletingPositionIds.has(positionId);
  }

  deletePosition(position: BudgetPosition): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    if (this.deletingPositionIds.has(position.id)) {
      return;
    }

    this.deletingPositionIds.add(position.id);

    this.api
      .deletePosition(position.baselineId, position.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.deletingPositionIds.delete(position.id);
        })
      )
      .subscribe({
        next: () => this.removePositionFromView(position.id),
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

  monthLabel(month: number): string {
    return this.t(`monthShort.${month}`);
  }

  cadenceLabel(cadence: BudgetCadence): string {
    return cadence === 'None'
      ? this.t('budget.none')
      : cadence === 'Monthly'
        ? this.t('budget.monthly')
        : this.t('budget.yearly');
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private clearOverlayFeedbackMessages(): void {
    this.newPositionSheetBanner = '';
    this.editPositionSheetBanner = '';
  }

  private setMessage(message: string, type: 'success' | 'error'): void {
    if (type === 'success') {
      this.clearOverlayFeedbackMessages();
      this.message = message;
      this.messageType = type;
      return;
    }
    if (this.newPositionSheetOpen) {
      this.message = '';
      this.clearOverlayFeedbackMessages();
      this.newPositionSheetBanner = message;
      this.newPositionSheetBannerType = type;
      return;
    }
    if (this.editPositionDraft !== null) {
      this.message = '';
      this.newPositionSheetBanner = '';
      this.editPositionSheetBanner = message;
      this.editPositionSheetBannerType = type;
      return;
    }
    this.clearOverlayFeedbackMessages();
    this.message = message;
    this.messageType = type;
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

  private patchPayload(
    position: BudgetPosition,
    overrides: Partial<Pick<BudgetPosition, 'categoryId' | 'name' | 'cadence' | 'startDate' | 'defaultAmount' | 'sortOrder'>> & {
      endDate?: string | null;
    }
  ): {
    categoryId: string;
    name: string;
    cadence: BudgetCadence;
    startDate: string;
    endDate?: string | null;
    defaultAmount: number;
    sortOrder: number;
  } {
    const merged = { ...position, ...overrides };
    return {
      categoryId: merged.categoryId,
      name: merged.name.trim(),
      cadence: merged.cadence,
      startDate: merged.startDate,
      endDate: merged.endDate ?? null,
      defaultAmount: Number(merged.defaultAmount) || 0,
      sortOrder: merged.sortOrder
    };
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
