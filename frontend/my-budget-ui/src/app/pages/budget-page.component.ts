import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { bufferTime, catchError, defer, EMPTY, filter, finalize, forkJoin, map, of, Subject, switchMap, tap } from 'rxjs';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
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

  /** Edit cadence, dates, template, and category away from the grid row. */
  editPositionSheetOpen = false;
  editPositionDraft: {
    id: string;
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
              this.closeEditPositionSheet();
            } else if (editingId) {
              const sel = this.positions.find((p) => p.id === editingId);
              if (sel) {
                this.syncEditDraftFromPosition(sel);
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
    const access = this.selectedBaselineAccess();
    return access === 'Owner' || access === 'Editor';
  }

  isOwnerOfSelectedBaseline(): boolean {
    return this.selectedBaselineAccess() === 'Owner';
  }

  onCellEdited(position: BudgetPosition, month: number, amount: number): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    if (!Number.isFinite(amount)) {
      return;
    }

    const planned = position.plannedAmounts.find((item) => item.month === month && item.year === this.state.selectedYear());
    if (planned) {
      planned.amount = amount;
      planned.isOverride = true;
    } else {
      position.plannedAmounts.push({
        id: '',
        budgetPositionId: position.id,
        year: this.state.selectedYear(),
        month,
        amount,
        isOverride: true
      });
    }

    this.cellEdits$.next({ budgetPositionId: position.id, month, amount });
  }

  cellAmountInputValue(position: BudgetPosition, month: number): string {
    const e = this.amountEdit;
    if (e?.kind === 'cell' && e.positionId === position.id && e.month === month) {
      return e.draft;
    }
    return this.i18n.formatAmount(this.getCellAmount(position, month));
  }

  newPositionDefaultInputValue(): string {
    const e = this.amountEdit;
    if (e?.kind === 'newDefault') {
      return e.draft;
    }
    return this.i18n.formatAmount(this.newPosition.defaultAmount);
  }

  onCellAmountFocus(position: BudgetPosition, month: number): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    this.amountEdit = {
      kind: 'cell',
      positionId: position.id,
      month,
      draft: this.i18n.formatAmount(this.getCellAmount(position, month))
    };
  }

  onNewPositionDefaultFocus(): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    this.amountEdit = {
      kind: 'newDefault',
      draft: this.i18n.formatAmount(this.newPosition.defaultAmount)
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
      this.newPosition.defaultAmount = parsed;
    } else if (ctx.kind === 'editDefault' && parsed !== null && this.editPositionDraft?.id === ctx.positionId) {
      this.editPositionDraft = { ...this.editPositionDraft, defaultAmount: parsed };
    }
    this.amountEdit = null;
  }

  getCellAmount(position: BudgetPosition, month: number): number {
    return position.plannedAmounts.find((item) => item.month === month && item.year === this.state.selectedYear())?.amount ?? 0;
  }

  getRowTotal(position: BudgetPosition): number {
    return this.months.reduce((sum, month) => sum + this.getCellAmount(position, month), 0);
  }

  getColumnTotal(month: number): number {
    return this.positions.reduce((sum, position) => sum + this.getCellAmount(position, month), 0);
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

  signedAmountCellClass(amount: number): string {
    if (amount > 0) {
      return 'bg-emerald-50/80 text-emerald-800';
    }
    if (amount < 0) {
      return 'bg-rose-50/80 text-rose-800';
    }
    return 'bg-white text-violet-900';
  }

  signedAmountTextClass(amount: number): string {
    if (amount > 0) {
      return 'text-emerald-700';
    }
    if (amount < 0) {
      return 'text-rose-700';
    }
    return 'text-violet-900';
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

  @HostListener('document:keydown.escape')
  onEscapeCloseCategorySuggest(): void {
    if (this.categorySuggestOpen) {
      this.clearCategorySuggestCloseTimer();
      this.categorySuggestOpen = null;
      this.categorySuggestRect = null;
      return;
    }
    if (this.newPositionSheetOpen) {
      this.closeNewPositionSheet();
      return;
    }
    if (this.editPositionSheetOpen) {
      this.closeEditPositionSheet();
      return;
    }
    if (this.budgetHelpTouchOpen()) {
      this.budgetHelpTouchOpen.set(false);
      return;
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
    this.closeEditPositionSheet();
    this.newPositionSheetOpen = true;
  }

  closeNewPositionSheet(): void {
    this.newPositionSheetOpen = false;
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
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
    this.openEditPositionSheet(position);
  }

  openEditPositionSheet(position: BudgetPosition): void {
    if (!this.canManageSelectedBaseline()) {
      return;
    }
    this.closeNewPositionSheet();
    this.editPositionDraft = {
      id: position.id,
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
    this.editPositionSheetOpen = true;
  }

  closeEditPositionSheet(): void {
    this.editPositionSheetOpen = false;
    this.editPositionDraft = null;
    this.editPositionPlannedApplyScope = 'all';
    this.editPositionPlannedApplyFrom = '';
    this.editPositionPlannedApplyTo = '';
    this.clearCategorySuggestCloseTimer();
    this.categorySuggestOpen = null;
    this.categorySuggestRect = null;
    if (this.amountEdit?.kind === 'editDefault') {
      this.amountEdit = null;
    }
  }

  private syncEditDraftFromPosition(pos: BudgetPosition): void {
    const d = this.editPositionDraft;
    if (!d || d.id !== pos.id) {
      return;
    }
    this.editPositionDraft = {
      id: pos.id,
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
    return draft ? this.i18n.formatAmount(draft.defaultAmount) : '';
  }

  onEditPositionDefaultFocus(): void {
    const draft = this.editPositionDraft;
    if (!draft) {
      return;
    }
    this.amountEdit = {
      kind: 'editDefault',
      positionId: draft.id,
      draft: this.i18n.formatAmount(draft.defaultAmount)
    };
  }

  onEditPositionCadenceChange(cadence: BudgetCadence): void {
    if (cadence === 'None') {
      this.editPositionPlannedApplyScope = 'all';
    }
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
    const categoryName = draft.categoryName.trim();
    if (!categoryName) {
      this.setMessage('msg.enterPositionAndCategory', 'error');
      return;
    }

    const position = this.positions.find((p) => p.id === draft.id);
    if (!position) {
      return;
    }

    const defaultAmount =
      this.amountEdit?.kind === 'editDefault' && this.amountEdit.positionId === draft.id
        ? (this.i18n.parseAmount(this.amountEdit.draft) ?? draft.defaultAmount)
        : draft.defaultAmount;
    const endDate: string | null = draft.endDate.trim() === '' ? null : draft.endDate;

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
        return;
      }
    }

    this.resolveCategoryId$(categoryName)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((categoryId) =>
          this.api.updatePosition(baselineId, position.id, this.buildEditPositionUpdatePayload(position, draft, categoryId, defaultAmount, endDate))
        )
      )
      .subscribe({
        next: () => {
          this.amountEdit = null;
          this.closeEditPositionSheet();
          this.budgetDataReload.update((n) => n + 1);
        },
        error: () => this.setMessage('msg.updatePositionFailed', 'error')
      });
  }

  private buildEditPositionUpdatePayload(
    position: BudgetPosition,
    draft: {
      id: string;
      categoryName: string;
      cadence: BudgetCadence;
      startDate: string;
      endDate: string;
      defaultAmount: number;
    },
    categoryId: string,
    defaultAmount: number,
    endDate: string | null
  ) {
    const base = this.patchPayload(position, {
      categoryId,
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
    const categoryName = this.newPosition.categoryName.trim();
    if (!baselineId) {
      this.setMessage('msg.selectBaselineFirst', 'error');
      return;
    }
    if (!this.newPosition.name.trim() || !categoryName) {
      this.setMessage('msg.enterPositionAndCategory', 'error');
      return;
    }

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
            defaultAmount: this.effectiveNewPositionDefaultAmount(),
            sortOrder: this.positions.length + 1
          })
        )
      )
      .subscribe({
        next: () => {
          this.newPosition.name = '';
          this.newPosition.defaultAmount = 0;
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

  /** Template reset applies to persisted cadence; hide when the saved line is one-time. */
  editSheetShowsTemplateReapply(): boolean {
    const id = this.editPositionDraft?.id;
    if (!id) {
      return false;
    }
    const position = this.positions.find((p) => p.id === id);
    return !!position && position.cadence !== 'None';
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
      this.closeEditPositionSheet();
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

  private setMessage(message: string, type: 'success' | 'error'): void {
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
    }
  }

  editPositionTitleName(): string {
    const id = this.editPositionDraft?.id;
    if (!id) {
      return '';
    }
    return this.positions.find((p) => p.id === id)?.name ?? '';
  }
}
