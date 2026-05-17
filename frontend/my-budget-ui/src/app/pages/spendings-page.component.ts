import { CommonModule, DatePipe, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, Subject, Subscription } from 'rxjs';
import { debounceTime, finalize } from 'rxjs/operators';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import { ViewportService } from '../core/viewport.service';
import { SwipeDeleteRowDirective } from '../core/swipe-delete-row.directive';
import { Account, ActualEntry, BudgetPosition, Category } from '../core/budget.models';
import {
  KeyboardAddShortcutService,
  registerPageKeyboardAddShortcut
} from '../core/keyboard-add-shortcut.service';
import {
  confirmDiscardUnsavedChanges,
  shouldKeyboardCancelFromTarget,
  shouldKeyboardConfirmFromTarget
} from '../core/keyboard-confirm-cancel';
import {
  hasSpendingsDrillDownParams,
  monthBookedRange,
  parseSpendingsDrillDownParams,
  SpendingsDrillDownParams
} from '../core/spendings-drill-down';
import { selectAllOnFocusedNumericInput } from '../core/numeric-input-focus';

export type SpendingsDatePreset = 'currentMonth' | 'prevMonth' | 'month' | 'currentYear' | 'lastYear' | 'all';
export type LedgerFlowFilter = 'all' | 'income' | 'expense';

/** One committed text or amount token in the ledger search field (matches API fragments). */
type LedgerSearchChip = {
  id: string;
  kind: 'text' | 'amount';
  label: string;
};

type ActualEditDraft = {
  budgetPositionId: string;
  accountId: string;
  bookedOn: string;
  amount: number;
  note: string;
  /** Stored ledger value when `note` is shown translated (`sample.*` keys). */
  noteSourceSampleKey: string | null;
  externalRef: string | null;
};

@Component({
  selector: 'app-spendings-page',
  imports: [CommonModule, FormsModule, DatePipe, SwipeDeleteRowDirective],
  templateUrl: './spendings-page.component.html',
  styleUrl: './spendings-page.component.css'
})
export class SpendingsPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  readonly viewport = inject(ViewportService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly keyboardAdd = inject(KeyboardAddShortcutService);
  private readonly drillDownQuery = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap
  });

  private readonly spendingsScroll = viewChild<ElementRef<HTMLElement>>('spendingsScroll');
  private readonly ledgerSearchDraftInput = viewChild<ElementRef<HTMLInputElement>>('ledgerSearchDraft');

  positions: BudgetPosition[] = [];
  categories: Category[] = [];
  accounts: Account[] = [];
  actualEntries: ActualEntry[] = [];
  actualsTotalCount = 0;
  actualBookingYears: number[] = [];
  private actualsSkip = 0;
  readonly pageSize = 50;

  /** Full ledger filter panel; collapsed by default (all viewports). */
  readonly spendingsFiltersOpen = signal(false);

  readonly loading = signal(false);
  readonly loadingActuals = signal(false);
  readonly loadingMoreActuals = signal(false);

  readonly referenceDataReady = signal(false);
  /** Extra table row at the top for creating an entry (inline fields, save on blur when valid). */
  readonly newEntryRowActive = signal(false);
  readonly savingEdit = signal(false);
  readonly savingNewEntry = signal(false);
  readonly deletingEntryId = signal<string | null>(null);
  readonly uploadingAttachment = signal(false);

  private newAttachmentFile: File | null = null;

  private lastShellKey: string | null = null;
  private actualsRequestSeq = 0;
  private actualsPageSub: Subscription | null = null;
  private remainingHintsRequestSeq = 0;
  private plannedThisMonthByPosition = new Map<string, number>();
  private remainingThisMonthByPosition = new Map<string, number>();
  private remainingThisMonthSnapshotByEntryId = new Map<string, number>();

  private readonly filterDebounce$ = new Subject<void>();

  readonly ledgerMonthOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

  datePreset: SpendingsDatePreset = 'currentMonth';
  /** Set when drilling to a concrete calendar month (dashboard chart click). */
  ledgerMonthFilter: number | null = null;
  /** Income / expense slice for the ledger list (default: both). */
  ledgerFlowFilter: LedgerFlowFilter = 'all';
  /** null = all categories. */
  ledgerCategoryFilter: string | null = null;
  /** null = no calendar-year filter (Zeitraum still applies). */
  readonly actualsYearFilter = signal<number | null>(this.state.selectedYear());
  /** Committed search bubbles (text and amount predicates). */
  ledgerSearchChips: LedgerSearchChip[] = [];
  /** Inline text before it becomes a chip. */
  searchDraft = '';
  private ledgerSearchChipSeq = 0;
  private lastDrillDownKey = '';
  private suppressFilterSideEffects = 0;

  message = '';
  messageType: 'success' | 'error' = 'success';
  private messageClearTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly messageAutoClearMs = 4500;

  newActual = {
    budgetPositionId: '',
    accountId: '',
    bookedOn: this.toDateInput(new Date()),
    amount: 0,
    note: ''
  };

  private newActualAmountEdit: string | null = null;

  editingEntryId: string | null = null;
  editDraft: ActualEditDraft | null = null;
  private editAmountText: string | null = null;
  private editSnapshot = '';
  private newActualSnapshot = '';

  constructor() {
    registerPageKeyboardAddShortcut(
      this.destroyRef,
      this.keyboardAdd,
      () => this.openNewEntryRow(),
      () => this.canKeyboardAddEntry()
    );

    this.destroyRef.onDestroy(() => {
      this.actualsPageSub?.unsubscribe();
      if (this.messageClearTimer) {
        clearTimeout(this.messageClearTimer);
      }
    });

    this.filterDebounce$.pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.referenceDataReady()) {
        this.loadActualsFromStart();
      }
    });

    const onSpendingsPointerDownCapture = (ev: Event) => this.onDocumentPointerDownSpendingsCancel(ev);
    this.documentRef.addEventListener('pointerdown', onSpendingsPointerDownCapture, true);
    this.destroyRef.onDestroy(() => this.documentRef.removeEventListener('pointerdown', onSpendingsPointerDownCapture, true));

    effect((onCleanup) => {
      const baselineId = this.state.selectedBaselineId();
      if (!baselineId) {
        this.loading.set(false);
        this.referenceDataReady.set(false);
        this.positions = [];
        this.categories = [];
        this.accounts = [];
        this.actualEntries = [];
        this.actualsTotalCount = 0;
        this.actualBookingYears = [];
        this.actualsSkip = 0;
        this.plannedThisMonthByPosition = new Map<string, number>();
        this.remainingThisMonthByPosition = new Map<string, number>();
        this.remainingThisMonthSnapshotByEntryId = new Map<string, number>();
        this.clearRowEditState();
        this.newEntryRowActive.set(false);
        return;
      }

      this.loading.set(true);
      this.referenceDataReady.set(false);
      const sub = forkJoin({
        positions: this.api.getPositions(baselineId, new Date().getFullYear()),
        categories: this.api.getCategoriesForBaseline(baselineId),
        accounts: this.api.getAccounts(baselineId),
        bookingYears: this.api.getActualBookingYears(baselineId, this.actualsFilterApiOptions())
      }).subscribe({
        next: (response) => {
          this.loading.set(false);
          this.positions = response.positions;
          this.categories = response.categories;
          this.accounts = response.accounts;
          this.actualBookingYears = response.bookingYears;
          this.ensureActualsYearFilterValid();
          this.ensureDefaultAccountSelection();
          this.ensureSelectedPositionStillValid();

          const shellKey = baselineId;
          if (this.lastShellKey !== shellKey) {
            this.lastShellKey = shellKey;
            this.lastDrillDownKey = '';
            if (!hasSpendingsDrillDownParams(this.route.snapshot.queryParamMap)) {
              this.resetLedgerFilters();
            }
          }

          this.referenceDataReady.set(true);
          this.loadCurrentMonthRemainingHints();
          this.applyDrillDownFromRoute();
          this.loadActualsFromStart();
        },
        error: () => {
          this.loading.set(false);
          this.referenceDataReady.set(false);
          this.setMessage('msg.loadBudgetFailed', 'error');
        }
      });

      onCleanup(() => {
        sub.unsubscribe();
        this.loading.set(false);
      });
    });

    effect(() => {
      this.i18n.language();
      this.newActualAmountEdit = null;
    });

    effect(() => {
      this.drillDownQuery();
      if (!this.referenceDataReady()) {
        return;
      }
      if (this.applyDrillDownFromRoute()) {
        this.loadActualsFromStart();
      }
    });
  }

  canManageSpendings(): boolean {
    return this.state.canManageSelectedBaseline();
  }

  /** Same guards as the “Buchung hinzufügen” toolbar button (for the `+` shortcut). */
  canKeyboardAddEntry(): boolean {
    return (
      this.referenceDataReady() &&
      !!this.state.selectedBaselineId() &&
      this.positions.length > 0 &&
      this.accounts.length > 0 &&
      this.canManageSpendings() &&
      !this.newEntryRowActive() &&
      !this.savingNewEntry()
    );
  }

  openNewEntryRow(): void {
    this.clearRowEditState();
    this.newEntryRowActive.set(true);
    if (!this.newActual.budgetPositionId) {
      const id = this.firstSelectablePositionId();
      if (id) {
        this.newActual.budgetPositionId = id;
      }
    }
    this.ensureDefaultAccountSelection();
    this.captureNewActualSnapshot();
    queueMicrotask(() => {
      const el = this.spendingsScroll()?.nativeElement;
      if (el) {
        el.scrollTop = 0;
      }
    });
  }

  closeNewEntryRow(): void {
    this.newAttachmentFile = null;
    this.newEntryRowActive.set(false);
  }

  confirmNewEntryRow(ev?: Event): void {
    ev?.stopPropagation();
    if (!this.newEntryRowActive() || this.savingNewEntry()) {
      return;
    }
    this.commitPendingNewActualAmount();
    const amount = this.effectiveNewActualAmount();
    const err = this.validateNewActualForSubmit(amount);
    if (err) {
      this.setMessage(err, 'error');
      return;
    }
    this.submitNewActualEntry();
  }

  confirmEditRow(ev?: Event): void {
    ev?.stopPropagation();
    if (!this.editingEntryId || !this.editDraft || this.savingEdit()) {
      return;
    }
    this.commitEditAmountFromInput();
    if (!this.isEditingDraftDirty()) {
      this.clearRowEditState();
      return;
    }
    this.flushEditingSave();
  }

  addActualButtonLabel(): string {
    if (this.ledgerFlowFilter === 'income') {
      return this.t('budget.addActualIncome');
    }
    if (this.ledgerFlowFilter === 'expense') {
      return this.t('budget.addActualExpense');
    }
    return this.t('budget.addActual');
  }

  newActualAmountColorClass(): string {
    if (!this.newActual.budgetPositionId) {
      return 'text-violet-900';
    }
    const raw =
      this.newActualAmountEdit !== null
        ? (this.i18n.parseAmount(this.newActualAmountEdit) ?? this.newActual.amount)
        : this.newActual.amount;
    return this.i18n.signedAmountTextClass(this.normalizeAmountForPosition(this.newActual.budgetPositionId, raw));
  }

  onNewActualPositionChange(): void {
    this.commitPendingNewActualAmount();
    const amount = this.effectiveNewActualAmount();
    if (amount !== 0) {
      this.newActual.amount = this.normalizeAmountForPosition(this.newActual.budgetPositionId, amount);
    }
    this.newActualAmountEdit = null;
  }

  onEditPositionChange(): void {
    if (!this.editDraft) {
      return;
    }
    this.commitEditAmountFromInput();
    if (this.editDraft.amount !== 0) {
      this.editDraft.amount = this.normalizeAmountForPosition(this.editDraft.budgetPositionId, this.editDraft.amount);
    }
    this.editAmountText = null;
  }

  private firstSelectablePositionId(): string | null {
    const blocks = this.positionsByCategory();
    return blocks[0]?.positions[0]?.id ?? null;
  }

  onLedgerSearchDebounced(): void {
    this.filterDebounce$.next();
  }

  focusLedgerSearchDraft(ev: MouseEvent): void {
    const t = ev.target as HTMLElement;
    if (t.closest('button')) {
      return;
    }
    queueMicrotask(() => this.ledgerSearchDraftInput()?.nativeElement?.focus());
  }

  private ledgerSearchStateKey(): string {
    const parts = this.ledgerSearchChips.map((c) => `${c.kind}:${c.label}`);
    parts.push(`d:${this.searchDraft}`);
    return parts.join('\u001f');
  }

  private newLedgerSearchChipId(): string {
    this.ledgerSearchChipSeq += 1;
    return `ls-${this.ledgerSearchChipSeq}`;
  }

  /** Same shape as backend ActualAmountFilterParser (single token, trimmed). */
  private isLedgerAmountToken(value: string): boolean {
    return /^(>=|<=|>|<)\s*(-?[0-9]+(?:[.,][0-9]+)?)$/.test(value.trim());
  }

  private pushLedgerTextChip(raw: string): void {
    const label = raw.trim();
    if (!label) {
      return;
    }
    this.ledgerSearchChips = [...this.ledgerSearchChips, { id: this.newLedgerSearchChipId(), kind: 'text', label }];
  }

  private pushLedgerAmountChip(raw: string): void {
    const trimmed = raw.trim();
    if (!this.isLedgerAmountToken(trimmed)) {
      return;
    }
    const m = trimmed.match(/^(>=|<=|>|<)\s*(-?[0-9]+(?:[.,][0-9]+)?)\s*$/);
    const label = m ? `${m[1]} ${m[2]}` : trimmed;
    this.ledgerSearchChips = [...this.ledgerSearchChips, { id: this.newLedgerSearchChipId(), kind: 'amount', label }];
  }

  commitLedgerSearchDraft(): void {
    const t = this.searchDraft.trim();
    if (!t) {
      return;
    }
    if (this.isLedgerAmountToken(t)) {
      this.pushLedgerAmountChip(t);
    } else {
      this.pushLedgerTextChip(t);
    }
    this.searchDraft = '';
  }

  onLedgerSearchDraftKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const prev = this.ledgerSearchStateKey();
      this.commitLedgerSearchDraft();
      if (prev !== this.ledgerSearchStateKey()) {
        this.onLedgerSearchDebounced();
      }
      return;
    }
    if (ev.key === ' ') {
      const v = this.searchDraft.trim();
      if (v && this.isLedgerAmountToken(v)) {
        ev.preventDefault();
        const prev = this.ledgerSearchStateKey();
        this.pushLedgerAmountChip(v);
        this.searchDraft = '';
        if (prev !== this.ledgerSearchStateKey()) {
          this.onLedgerSearchDebounced();
        }
      }
      return;
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete') {
      if (this.searchDraft === '' && this.ledgerSearchChips.length > 0) {
        ev.preventDefault();
        this.ledgerSearchChips = this.ledgerSearchChips.slice(0, -1);
        this.onLedgerSearchDebounced();
      }
    }
  }

  onLedgerSearchDraftBlur(): void {
    const prev = this.ledgerSearchStateKey();
    this.commitLedgerSearchDraft();
    if (prev !== this.ledgerSearchStateKey()) {
      this.onLedgerSearchDebounced();
    }
  }

  removeLedgerSearchChip(id: string): void {
    this.ledgerSearchChips = this.ledgerSearchChips.filter((c) => c.id !== id);
    this.onLedgerSearchDebounced();
  }

  private ledgerSearchApiParams(): { searchTerms: string[] | null; amountFilter: string | null } {
    const textTerms = this.ledgerSearchChips.filter((c) => c.kind === 'text').map((c) => c.label.trim());
    const amountTerms = this.ledgerSearchChips.filter((c) => c.kind === 'amount').map((c) => c.label.trim());
    return {
      searchTerms: textTerms.length ? textTerms : null,
      amountFilter: amountTerms.length ? amountTerms.join(' ') : null
    };
  }

  onDatePresetChange(): void {
    if (this.suppressFilterSideEffects > 0) {
      return;
    }
    if (this.datePreset === 'month') {
      if (this.ledgerMonthFilter === null) {
        this.ledgerMonthFilter = this.defaultLedgerMonth();
      }
    } else {
      this.ledgerMonthFilter = null;
    }
    if (this.referenceDataReady()) {
      this.loadActualsFromStart();
    }
  }

  onLedgerMonthFilterChange(month: number | null): void {
    if (this.suppressFilterSideEffects > 0) {
      this.ledgerMonthFilter = month;
      return;
    }
    this.ledgerMonthFilter = month;
    if (this.referenceDataReady()) {
      this.loadActualsFromStart();
    }
  }

  onLedgerFlowFilterChange(): void {
    if (this.suppressFilterSideEffects > 0) {
      return;
    }
    this.ensureLedgerCategoryFilterValid();
    if (this.newActual.budgetPositionId) {
      const blocks = this.positionsByCategory();
      const stillVisible = blocks.some((g) => g.positions.some((p) => p.id === this.newActual.budgetPositionId));
      if (!stillVisible) {
        const id = this.firstSelectablePositionId();
        this.newActual.budgetPositionId = id ?? '';
      }
    }
    this.ensureSelectedPositionStillValid();
    this.refreshBookingYears();
    if (this.referenceDataReady()) {
      this.loadActualsFromStart();
    }
  }

  hasActiveSpendingsFilters(): boolean {
    return (
      this.isSpendingsDateClusterActive() ||
      this.isSpendingsFilterControlActive('flow') ||
      this.isSpendingsFilterControlActive('category') ||
      this.isSpendingsFilterControlActive('search')
    );
  }

  isSpendingsDateClusterActive(): boolean {
    return (
      this.isSpendingsFilterControlActive('period') ||
      this.isSpendingsFilterControlActive('year') ||
      this.isSpendingsFilterControlActive('month')
    );
  }

  isSpendingsFilterControlActive(kind: 'year' | 'month' | 'flow' | 'category' | 'period' | 'search'): boolean {
    switch (kind) {
      case 'year': {
        const y = this.actualsYearFilter();
        if (y === null) {
          return this.actualBookingYears.length > 0;
        }
        if (y !== this.state.selectedYear()) {
          return true;
        }
        if (this.state.isSelectedYearOffCalendar()) {
          return true;
        }
        if (this.datePreset === 'month') {
          return true;
        }
        return this.datePreset === 'currentYear' || this.datePreset === 'lastYear';
      }
      case 'month':
        return this.datePreset === 'month' && this.ledgerMonthFilter !== null;
      case 'flow':
        return this.ledgerFlowFilter !== 'all';
      case 'category':
        return this.ledgerCategoryFilter !== null;
      case 'period':
        return this.datePreset !== 'currentMonth' || this.ledgerMonthFilter !== null;
      case 'search':
        return this.ledgerSearchChips.length > 0;
    }
  }

  spendingsFilterLabelClasses(active: boolean): string {
    return active
      ? 'inline-flex items-center gap-1 text-xs font-semibold text-amber-900'
      : 'text-xs font-medium text-violet-800';
  }

  spendingsFilterControlClasses(active: boolean): string {
    const base = 'min-h-10 w-full rounded border px-2 py-2 text-sm transition-colors sm:min-h-0 sm:py-1';
    if (active) {
      return `${base} border-amber-400 bg-amber-50 font-semibold text-amber-950 shadow-sm ring-2 ring-amber-200`;
    }
    return `${base} border-violet-200 bg-violet-50 text-violet-900`;
  }

  spendingsFilterSearchClasses(active: boolean): string {
    const base =
      'ledger-search-combo flex min-h-10 w-full cursor-text items-center gap-2 rounded border px-2 py-1 text-sm transition-colors sm:min-h-9';
    if (active) {
      return `${base} border-amber-400 bg-amber-50 font-semibold text-amber-950 shadow-sm ring-2 ring-amber-200`;
    }
    return `${base} border-violet-200 bg-violet-50 text-violet-900`;
  }

  clearSpendingsFilters(): void {
    this.resetLedgerFilters();
    this.actualsYearFilter.set(this.state.selectedYear());
    this.lastDrillDownKey = '';
    this.refreshBookingYears();
    if (this.referenceDataReady()) {
      this.loadActualsFromStart();
    }
  }

  onLedgerCategoryFilterChange(): void {
    this.lastDrillDownKey = '';
    this.ensureLedgerCategoryFilterValid();
    if (this.newActual.budgetPositionId) {
      const blocks = this.positionsByCategory();
      const stillVisible = blocks.some((g) => g.positions.some((p) => p.id === this.newActual.budgetPositionId));
      if (!stillVisible) {
        const id = this.firstSelectablePositionId();
        this.newActual.budgetPositionId = id ?? '';
      }
    }
    this.ensureSelectedPositionStillValid();
    this.refreshBookingYears();
    if (this.referenceDataReady()) {
      this.loadActualsFromStart();
    }
  }

  filterableCategories(): Category[] {
    const mode = this.ledgerFlowFilter;
    return [...this.categories]
      .filter((c) => {
        if (mode === 'income' && !c.isIncome) {
          return false;
        }
        if (mode === 'expense' && c.isIncome) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const order = a.sortOrder - b.sortOrder;
        if (order !== 0) {
          return order;
        }
        return this.categoryName(a.id).localeCompare(this.categoryName(b.id), undefined, { sensitivity: 'base' });
      });
  }

  actualsYearOptions(): number[] {
    return this.actualBookingYears;
  }

  private ensureActualsYearFilterValid(): void {
    const current = this.actualsYearFilter();
    if (current === null || this.actualBookingYears.includes(current)) {
      return;
    }

    const drillYear = parseSpendingsDrillDownParams(this.drillDownQuery())?.year;
    if (drillYear === current) {
      this.ensureYearOptionPresent(current);
      return;
    }

    const fallback = this.actualBookingYears[0] ?? null;
    this.actualsYearFilter.set(fallback);
    if (fallback !== null) {
      this.state.selectedYear.set(fallback);
    }
  }

  private ensureYearOptionPresent(year: number): void {
    if (!this.actualBookingYears.includes(year)) {
      this.actualBookingYears = [...this.actualBookingYears, year].sort((a, b) => b - a);
    }
  }

  private refreshBookingYears(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId) {
      return;
    }
    this.api
      .getActualBookingYears(baselineId, this.actualsFilterApiOptions())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (years) => {
          this.actualBookingYears = years;
          this.ensureActualsYearFilterValid();
        }
      });
  }

  monthLabel(month: number): string {
    return this.t(`monthShort.${month}`);
  }

  onActualsYearFilterChange(value: number | null): void {
    if (this.suppressFilterSideEffects > 0) {
      this.actualsYearFilter.set(value);
      if (value !== null) {
        this.state.selectedYear.set(value);
      }
      return;
    }

    this.actualsYearFilter.set(value);
    if (value !== null) {
      this.state.selectedYear.set(value);
    }
    if (this.datePreset === 'month' && this.ledgerMonthFilter === null) {
      this.ledgerMonthFilter = this.defaultLedgerMonth();
    }
    if (this.referenceDataReady()) {
      this.loadActualsFromStart();
    }
  }

  onSpendingsScroll(ev: Event): void {
    const el = ev.target as HTMLElement;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 120) {
      return;
    }
    this.loadMoreActuals();
  }

  newActualAmountInputValue(): string {
    if (this.newActualAmountEdit !== null) {
      return this.newActualAmountEdit;
    }
    return this.i18n.formatAmount(this.displayAmountForDraft(this.newActual.budgetPositionId, this.newActual.amount));
  }

  onNewActualAmountFocus(): void {
    this.newActualAmountEdit = this.i18n.formatAmount(
      this.displayAmountForDraft(this.newActual.budgetPositionId, this.effectiveNewActualAmount())
    );
    selectAllOnFocusedNumericInput();
  }

  onNewActualAmountInput(raw: string): void {
    if (this.newActualAmountEdit !== null) {
      this.newActualAmountEdit = raw;
    }
  }

  onNewActualAmountBlur(): void {
    if (this.newActualAmountEdit !== null) {
      const parsed = this.i18n.parseAmount(this.newActualAmountEdit);
      this.newActualAmountEdit = null;
      if (parsed !== null) {
        this.newActual.amount = this.normalizeAmountForPosition(this.newActual.budgetPositionId, parsed);
      }
    }
  }

  private validateNewActualForSubmit(amount: number): string | null {
    if (!this.newActual.budgetPositionId) {
      return 'msg.addActualNeedPosition';
    }
    if (!this.newActual.accountId) {
      return 'msg.addActualNeedAccount';
    }
    if (!this.newActual.bookedOn?.trim()) {
      return 'msg.addActualNeedDate';
    }
    const normalized = this.normalizeAmountForPosition(this.newActual.budgetPositionId, amount);
    return this.validateAmountSignForPosition(this.newActual.budgetPositionId, normalized);
  }

  /** Non-zero amount; sign is normalized from the position's category (income positive, expense negative). */
  private validateAmountSignForPosition(budgetPositionId: string, amount: number): string | null {
    const normalized = this.normalizeAmountForPosition(budgetPositionId, amount);
    if (!Number.isFinite(normalized) || normalized === 0) {
      return 'msg.addActualNeedAmount';
    }
    return null;
  }

  /** Income positive, expense negative; user may enter a positive magnitude only. */
  private normalizeAmountForPosition(budgetPositionId: string, amount: number): number {
    if (!Number.isFinite(amount) || amount === 0) {
      return amount;
    }
    const magnitude = Math.abs(amount);
    return this.isIncomePositionId(budgetPositionId) ? magnitude : -magnitude;
  }

  /** Amount shown while editing: always a positive magnitude when a position is selected. */
  private displayAmountForDraft(budgetPositionId: string, amount: number): number {
    if (!budgetPositionId) {
      return amount;
    }
    return Math.abs(amount);
  }

  isIncomePositionId(budgetPositionId: string): boolean {
    const pos = this.positions.find((p) => p.id === budgetPositionId);
    if (!pos) {
      return false;
    }
    const cat = this.categories.find((c) => c.id === pos.categoryId);
    return !!cat?.isIncome;
  }

  isIncomeEntry(entry: ActualEntry): boolean {
    return this.isIncomePositionId(entry.budgetPositionId);
  }

  /** Display value: income positive, expenses always shown as negative (legacy positive outflows become negative). */
  displayAmountForEntry(entry: ActualEntry): number {
    const v = entry.amount;
    if (this.isIncomeEntry(entry)) {
      return v < 0 ? -v : v;
    }
    return v > 0 ? -v : v;
  }

  /** Sum of display amounts for currently loaded rows (may differ from full list total while pagination is in progress). */
  loadedActualsDisplaySum(): number {
    return this.actualEntries.reduce((sum, e) => sum + this.displayAmountForEntry(e), 0);
  }

  remainingThisMonthForPosition(budgetPositionId: string): number | null {
    if (!budgetPositionId) {
      return null;
    }
    return this.remainingThisMonthByPosition.get(budgetPositionId) ?? null;
  }

  remainingThisMonthForEntry(entry: ActualEntry): number | null {
    return this.remainingThisMonthSnapshotByEntryId.get(entry.id) ?? null;
  }

  varianceBadgeClass(value: number | null): string {
    if (value === null) {
      return 'spendings-variance-badge spendings-variance-badge--zero';
    }
    if (value > 0) {
      return 'spendings-variance-badge spendings-variance-badge--positive';
    }
    if (value < 0) {
      return 'spendings-variance-badge spendings-variance-badge--negative';
    }
    return 'spendings-variance-badge spendings-variance-badge--zero';
  }

  /** Display label for committed filter chips (amount tokens get locale + signed number). */
  ledgerSearchChipDisplayLabel(chip: LedgerSearchChip): string {
    if (chip.kind !== 'amount') {
      return chip.label;
    }
    const m = chip.label.trim().match(/^(>=|<=|>|<)\s*(.+)$/);
    if (!m) {
      return chip.label;
    }
    const n = this.i18n.parseAmount(m[2]);
    if (n === null) {
      return chip.label;
    }
    return `${m[1]} ${this.i18n.formatSignedAmount(n)}`;
  }

  /** Pill styles: text chips violet; amount chips green/red by threshold sign (zero neutral). */
  ledgerSearchChipClassList(chip: LedgerSearchChip): Record<string, boolean> {
    if (chip.kind === 'text') {
      return {
        'border-violet-300': true,
        'bg-violet-100': true,
        'text-violet-900': true
      };
    }
    const m = chip.label.trim().match(/^(>=|<=|>|<)\s*(.+)$/);
    const n = m ? this.i18n.parseAmount(m[2]) : null;
    if (n === null) {
      return {
        'border-violet-300': true,
        'bg-violet-100': true,
        'text-violet-900': true,
        'font-mono': true
      };
    }
    if (n > 0) {
      return {
        'border-emerald-300': true,
        'bg-emerald-50': true,
        'text-emerald-900': true,
        'font-mono': true
      };
    }
    if (n < 0) {
      return {
        'border-rose-300': true,
        'bg-rose-50': true,
        'text-rose-900': true,
        'font-mono': true
      };
    }
    return {
      'border-violet-300': true,
      'bg-violet-100': true,
      'text-violet-900': true,
      'font-mono': true
    };
  }

  cancelRowEditing(ev?: Event): void {
    ev?.stopPropagation();
    if (this.savingEdit()) {
      return;
    }
    this.tryCancelRowEditing();
  }

  cancelNewEntryRow(ev?: Event): void {
    ev?.stopPropagation();
    this.tryCloseNewEntryRow();
  }

  /** Cancel edit row; confirm when the draft differs from the snapshot. */
  tryCancelRowEditing(): boolean {
    if (!this.editingEntryId || !this.editDraft) {
      return true;
    }
    this.commitEditAmountFromInput();
    if (!this.isEditingDraftDirty()) {
      this.clearRowEditState();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.t('budget.discardUnsavedEditConfirm'))) {
      this.clearRowEditState();
      return true;
    }
    return false;
  }

  /** Close new-entry row; confirm when the draft or attachment changed. */
  tryCloseNewEntryRow(): boolean {
    if (!this.newEntryRowActive()) {
      return true;
    }
    this.commitPendingNewActualAmount();
    if (!this.isNewEntryDiscardDirty()) {
      this.closeNewEntryRow();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.t('budget.discardUnsavedEditConfirm'))) {
      this.closeNewEntryRow();
      return true;
    }
    return false;
  }

  private isNewEntryDiscardDirty(): boolean {
    return this.isNewActualDirty() || this.newAttachmentFile !== null;
  }

  private captureNewActualSnapshot(): void {
    this.commitPendingNewActualAmount();
    this.newActualSnapshot = this.serializeNewActualState();
  }

  private serializeNewActualState(): string {
    const amount = this.normalizeAmountForPosition(
      this.newActual.budgetPositionId,
      this.effectiveNewActualAmount()
    );
    return JSON.stringify({
      budgetPositionId: this.newActual.budgetPositionId,
      accountId: this.newActual.accountId,
      bookedOn: this.newActual.bookedOn,
      amount,
      note: this.newActual.note.trim()
    });
  }

  private isNewActualDirty(): boolean {
    return this.serializeNewActualState() !== this.newActualSnapshot;
  }

  private resetNewActualAfterSuccess(): void {
    this.newActual.amount = 0;
    this.newActualAmountEdit = null;
    this.newActual.note = '';
    this.newAttachmentFile = null;
  }

  /** Persists a new actual entry from the inline create row. */
  private submitNewActualEntry(): void {
    this.commitPendingNewActualAmount();
    const rawAmount = this.effectiveNewActualAmount();
    const amount = this.normalizeAmountForPosition(this.newActual.budgetPositionId, rawAmount);
    const err = this.validateNewActualForSubmit(rawAmount);
    if (err) {
      this.setMessage(err, 'error');
      return;
    }
    if (this.savingNewEntry()) {
      return;
    }

    this.savingNewEntry.set(true);
    this.api
      .createActualEntry({
        budgetPositionId: this.newActual.budgetPositionId,
        accountId: this.newActual.accountId,
        bookedOn: this.newActual.bookedOn,
        amount,
        note: this.newActual.note.trim() || null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          const pendingFile = this.newAttachmentFile;
          if (pendingFile) {
            this.uploadAttachmentForEntry(created.id, pendingFile, () => {
              this.savingNewEntry.set(false);
              this.resetNewActualAfterSuccess();
              this.closeNewEntryRow();
              this.setMessage('msg.addActualSuccess', 'success');
              this.refreshBookingYears();
              this.loadCurrentMonthRemainingHints();
              this.loadActualsFromStart();
            });
            return;
          }
          this.savingNewEntry.set(false);
          this.resetNewActualAfterSuccess();
          this.closeNewEntryRow();
          this.setMessage('msg.addActualSuccess', 'success');
          this.refreshBookingYears();
          this.loadCurrentMonthRemainingHints();
          this.loadActualsFromStart();
        },
        error: () => {
          this.savingNewEntry.set(false);
          this.setMessage('msg.addActualFailed', 'error');
        }
      });
  }

  spendingsActionsColumnExpanded(): boolean {
    return this.newEntryRowActive() || this.editingEntryId !== null;
  }

  swipeDeleteSpendingsRowEnabled(entry: ActualEntry): boolean {
    return (
      this.viewport.maxSm() &&
      this.canManageSpendings() &&
      this.editingEntryId !== entry.id &&
      !this.savingEdit() &&
      !this.savingNewEntry() &&
      this.deletingEntryId() !== entry.id
    );
  }

  hasMoreActuals(): boolean {
    return this.actualEntries.length < this.actualsTotalCount;
  }

  onEditEntryClick(entry: ActualEntry, event: Event): void {
    event.stopPropagation();
    this.onActualRowClick(entry);
  }

  onActualRowClick(entry: ActualEntry): void {
    if (!this.canManageSpendings() || this.savingEdit() || this.savingNewEntry()) {
      return;
    }

    if (this.newEntryRowActive()) {
      this.commitPendingNewActualAmount();
      if (this.isNewActualDirty()) {
        const amount = this.effectiveNewActualAmount();
        const err = this.validateNewActualForSubmit(amount);
        if (err) {
          this.setMessage(err, 'error');
          return;
        }
        this.submitNewActualEntry();
        return;
      }
      this.newEntryRowActive.set(false);
    }

    if (this.editingEntryId === entry.id) {
      return;
    }

    if (this.editingEntryId) {
      this.commitEditAmountFromInput();
      if (this.isEditingDraftDirty()) {
        this.flushEditingSave();
        return;
      }
      this.startEditing(entry);
      return;
    }

    this.startEditing(entry);
  }

  deleteActualEntry(entry: ActualEntry, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageSpendings() || this.savingEdit() || this.savingNewEntry()) {
      return;
    }
    if (this.deletingEntryId() === entry.id) {
      return;
    }
    if (!confirm(this.t('spendings.confirmDeleteEntry'))) {
      return;
    }

    this.deletingEntryId.set(entry.id);
    this.api
      .deleteActualEntry(entry.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingEntryId.set(null))
      )
      .subscribe({
        next: () => {
          if (this.editingEntryId === entry.id) {
            this.clearRowEditState();
          }
          this.setMessage('msg.deleteActualSuccess', 'success');
          this.refreshBookingYears();
          this.loadCurrentMonthRemainingHints();
          this.loadActualsFromStart();
        },
        error: () => {
          this.setMessage('msg.deleteActualFailed', 'error');
        }
      });
  }

  onEditCellBlur(): void {
    if (!this.editingEntryId || !this.editDraft || this.savingEdit()) {
      return;
    }
    this.commitEditAmountFromInput();
    if (!this.isEditingDraftDirty()) {
      return;
    }
    this.flushEditingSave();
  }

  /** Click outside the active new/edit row: same outcome as Escape on that row. Primary button only. */
  onDocumentPointerDownSpendingsCancel(ev: Event): void {
    if (!(ev instanceof PointerEvent) || ev.button !== 0) {
      return;
    }
    const target = ev.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('.spendings-row-editing')) {
      return;
    }
    if (!this.editingEntryId && !this.newEntryRowActive()) {
      return;
    }

    if (this.editingEntryId) {
      this.commitEditAmountFromInput();
      if (this.isEditingDraftDirty()) {
        ev.preventDefault();
      }
      const entry = this.actualEntries.find((e) => e.id === this.editingEntryId);
      if (!entry || !this.dismissSpendingsRowInlineLikeEscape(entry)) {
        return;
      }
    }
    if (this.newEntryRowActive()) {
      this.commitPendingNewActualAmount();
      if (this.isNewEntryDiscardDirty()) {
        ev.preventDefault();
      }
      if (!this.dismissSpendingsRowInlineLikeEscape()) {
        return;
      }
    }
  }

  editAmountDisplayValue(): string {
    if (!this.editDraft) {
      return '';
    }
    if (this.editAmountText !== null) {
      return this.editAmountText;
    }
    return this.i18n.formatAmount(
      this.displayAmountForDraft(this.editDraft.budgetPositionId, this.editDraft.amount)
    );
  }

  onEditAmountFocus(): void {
    if (!this.editDraft) {
      return;
    }
    this.editAmountText = this.i18n.formatAmount(
      this.displayAmountForDraft(this.editDraft.budgetPositionId, this.editDraft.amount)
    );
    selectAllOnFocusedNumericInput();
  }

  onEditAmountInput(raw: string): void {
    if (this.editAmountText !== null) {
      this.editAmountText = raw;
    }
  }

  onEditAmountBlur(): void {
    this.commitEditAmountFromInput();
    this.onEditCellBlur();
  }

  /**
   * Enter on the new-entry or edit rows confirms the row (green-check path).
   */
  onSpendingsTableRowEnterConfirm(event: Event, entry?: ActualEntry): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmFromTarget(event)) {
      return;
    }
    if (entry) {
      if (this.editingEntryId !== entry.id || !this.editDraft) {
        return;
      }
    } else if (!this.newEntryRowActive()) {
      return;
    }
    event.preventDefault();
    if (entry) {
      this.confirmEditRow();
    } else {
      this.confirmNewEntryRow();
    }
  }

  /** Escape on the new-entry or edit rows cancels (same logic as {@link dismissSpendingsRowInlineLikeEscape}). */
  onSpendingsTableRowEscapeCancel(event: Event, entry?: ActualEntry): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event)) {
      return;
    }
    if (entry) {
      if (this.editingEntryId !== entry.id || !this.editDraft) {
        return;
      }
    } else if (!this.newEntryRowActive()) {
      return;
    }
    event.preventDefault();
    void this.dismissSpendingsRowInlineLikeEscape(entry);
  }

  /** Same outcome as Escape on the new-entry or edit row (shared with pointer-outside). */
  private dismissSpendingsRowInlineLikeEscape(entry?: ActualEntry): boolean {
    if (entry) {
      if (this.editingEntryId !== entry.id || !this.editDraft) {
        return true;
      }
      return this.tryCancelRowEditing();
    }
    if (!this.newEntryRowActive()) {
      return true;
    }
    return this.tryCloseNewEntryRow();
  }

  private loadActualsFromStart(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.referenceDataReady()) {
      return;
    }

    const seq = ++this.actualsRequestSeq;
    this.loadingActuals.set(true);
    this.loadingMoreActuals.set(false);
    this.actualsSkip = 0;

    const { bookedFrom, bookedTo } = this.effectiveBookedBounds();

    this.actualsPageSub?.unsubscribe();
    this.actualsPageSub = this.api
      .getActualEntriesPage({
        baselineId,
        skip: 0,
        take: this.pageSize,
        bookedFrom,
        bookedTo,
        ...this.ledgerSearchApiParams(),
        ...this.actualsFilterApiOptions()
      })
      .pipe(
        finalize(() => {
          this.loadingActuals.set(false);
        })
      )
      .subscribe({
        next: (page) => {
          if (seq !== this.actualsRequestSeq) {
            return;
          }
          this.actualEntries = page.items;
          this.actualsTotalCount = page.totalCount;
          this.actualsSkip = page.items.length;
          this.recomputeLoadedEntryVarianceSnapshots();
          this.clearRowEditState();
          if (page.items.length === 0) {
            if (!this.newActual.budgetPositionId) {
              const id = this.firstSelectablePositionId();
              if (id) {
                this.newActual.budgetPositionId = id;
              }
            }
            this.ensureDefaultAccountSelection();
          }
          this.queueTryFillScrollGap();
        },
        error: () => {
          if (seq !== this.actualsRequestSeq) {
            return;
          }
          this.setMessage('msg.loadBudgetFailed', 'error');
        }
      });
  }

  private loadMoreActuals(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.referenceDataReady()) {
      return;
    }
    if (this.loadingActuals() || this.loadingMoreActuals()) {
      return;
    }
    if (this.actualEntries.length >= this.actualsTotalCount) {
      return;
    }

    const seq = ++this.actualsRequestSeq;
    this.loadingMoreActuals.set(true);

    const { bookedFrom, bookedTo } = this.effectiveBookedBounds();

    this.api
      .getActualEntriesPage({
        baselineId,
        skip: this.actualsSkip,
        take: this.pageSize,
        bookedFrom,
        bookedTo,
        ...this.ledgerSearchApiParams(),
        ...this.actualsFilterApiOptions()
      })
      .pipe(
        finalize(() => {
          this.loadingMoreActuals.set(false);
        })
      )
      .subscribe({
        next: (page) => {
          if (seq !== this.actualsRequestSeq) {
            return;
          }
          const existing = new Set(this.actualEntries.map((e) => e.id));
          for (const row of page.items) {
            if (!existing.has(row.id)) {
              existing.add(row.id);
              this.actualEntries.push(row);
            }
          }
          this.actualsTotalCount = page.totalCount;
          this.actualsSkip = this.actualEntries.length;
          this.recomputeLoadedEntryVarianceSnapshots();
          this.queueTryFillScrollGap();
        },
        error: () => {
          if (seq !== this.actualsRequestSeq) {
            return;
          }
          this.setMessage('msg.loadBudgetFailed', 'error');
        }
      });
  }

  private queueTryFillScrollGap(): void {
    queueMicrotask(() => this.tryFillScrollGap());
  }

  private tryFillScrollGap(): void {
    if (this.loadingActuals() || this.loadingMoreActuals()) {
      return;
    }
    if (this.actualEntries.length >= this.actualsTotalCount) {
      return;
    }
    const el = this.spendingsScroll()?.nativeElement;
    if (!el) {
      return;
    }
    if (el.scrollHeight <= el.clientHeight + 48) {
      this.loadMoreActuals();
    }
  }

  private periodBounds(): { bookedFrom: string | null; bookedTo: string | null } {
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();

    switch (this.datePreset) {
      case 'currentMonth': {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { bookedFrom: ymd(from), bookedTo: ymd(to) };
      }
      case 'prevMonth': {
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to = new Date(now.getFullYear(), now.getMonth(), 0);
        return { bookedFrom: ymd(from), bookedTo: ymd(to) };
      }
      case 'currentYear': {
        const from = new Date(now.getFullYear(), 0, 1);
        const to = new Date(now.getFullYear(), 11, 31);
        return { bookedFrom: ymd(from), bookedTo: ymd(to) };
      }
      case 'lastYear': {
        const y = now.getFullYear() - 1;
        return { bookedFrom: `${y}-01-01`, bookedTo: `${y}-12-31` };
      }
      case 'month': {
        const year = this.actualsYearFilter();
        const month = this.ledgerMonthFilter;
        if (year != null && month != null) {
          return monthBookedRange(year, month);
        }
        return { bookedFrom: null, bookedTo: null };
      }
      case 'all':
      default:
        return { bookedFrom: null, bookedTo: null };
    }
  }

  private resetLedgerFilters(): void {
    this.datePreset = 'currentMonth';
    this.ledgerFlowFilter = 'all';
    this.ledgerCategoryFilter = null;
    this.ledgerMonthFilter = null;
    this.ledgerSearchChips = [];
    this.searchDraft = '';
  }

  private defaultLedgerMonth(): number {
    const year = this.actualsYearFilter() ?? new Date().getFullYear();
    const now = new Date();
    if (year === now.getFullYear()) {
      return now.getMonth() + 1;
    }
    return 1;
  }

  private runWithoutFilterSideEffects(fn: () => void): void {
    this.suppressFilterSideEffects++;
    try {
      fn();
    } finally {
      queueMicrotask(() => {
        this.suppressFilterSideEffects = Math.max(0, this.suppressFilterSideEffects - 1);
      });
    }
  }

  /** @returns true when filters changed from the current URL query. */
  private applyDrillDownFromRoute(): boolean {
    const paramMap = this.drillDownQuery();
    const drill = parseSpendingsDrillDownParams(paramMap);
    if (!drill) {
      return false;
    }

    const key = paramMap.toString();
    if (key === this.lastDrillDownKey) {
      return false;
    }
    this.lastDrillDownKey = key;

    this.runWithoutFilterSideEffects(() => {
      this.resetLedgerFilters();

      if (drill.flow) {
        this.ledgerFlowFilter = drill.flow;
      }

      if (drill.year != null) {
        this.actualsYearFilter.set(drill.year);
        this.state.selectedYear.set(drill.year);
        this.ensureYearOptionPresent(drill.year);
      }

      this.applyDateFilterForDrill(drill);

      if (drill.categoryId) {
        this.ledgerCategoryFilter = drill.categoryId;
      }
    });

    this.ensureLedgerCategoryFilterValid();
    this.refreshBookingYears();
    return true;
  }

  private applyDateFilterForDrill(drill: SpendingsDrillDownParams): void {
    if (drill.month != null && drill.year != null) {
      this.ledgerMonthFilter = drill.month;
      this.datePreset = 'month';
      return;
    }

    this.ledgerMonthFilter = null;
    if (drill.year != null) {
      this.datePreset = 'all';
    }
  }

  private effectiveBookedBounds(): { bookedFrom: string | null; bookedTo: string | null } {
    const period = this.periodBounds();
    const year = this.actualsYearFilter();
    if (year === null) {
      return period;
    }

    const yearFrom = `${year}-01-01`;
    const yearTo = `${year}-12-31`;
    if (period.bookedFrom === null && period.bookedTo === null) {
      return { bookedFrom: yearFrom, bookedTo: yearTo };
    }

    let from = yearFrom;
    let to = yearTo;
    if (period.bookedFrom !== null && period.bookedFrom > from) {
      from = period.bookedFrom;
    }
    if (period.bookedTo !== null && period.bookedTo < to) {
      to = period.bookedTo;
    }
    return { bookedFrom: from, bookedTo: to };
  }

  private effectiveNewActualAmount(): number {
    if (this.newActualAmountEdit !== null) {
      return this.i18n.parseAmount(this.newActualAmountEdit) ?? this.newActual.amount;
    }
    return this.newActual.amount;
  }

  private commitPendingNewActualAmount(): void {
    if (this.newActualAmountEdit === null) {
      return;
    }
    const parsed = this.i18n.parseAmount(this.newActualAmountEdit);
    this.newActualAmountEdit = null;
    if (parsed !== null) {
      this.newActual.amount = this.normalizeAmountForPosition(this.newActual.budgetPositionId, parsed);
    }
  }

  private ensureDefaultAccountSelection(): void {
    if (this.accounts.length === 0) {
      this.newActual.accountId = '';
      return;
    }
    if (!this.accounts.some((a) => a.id === this.newActual.accountId)) {
      this.newActual.accountId = this.accounts[0].id;
    }
  }

  private ensureSelectedPositionStillValid(): void {
    if (!this.newActual.budgetPositionId) {
      return;
    }
    if (!this.positions.some((p) => p.id === this.newActual.budgetPositionId)) {
      this.newActual.budgetPositionId = '';
    }
  }

  positionsByCategory(): { categoryId: string; label: string; positions: BudgetPosition[] }[] {
    if (this.positions.length === 0) {
      return [];
    }
    const mode = this.ledgerFlowFilter;
    const categoryId = this.ledgerCategoryFilter;
    const byCat = new Map<string, BudgetPosition[]>();
    for (const p of this.positions) {
      const cat = this.categories.find((c) => c.id === p.categoryId);
      if (mode === 'income' && !cat?.isIncome) {
        continue;
      }
      if (mode === 'expense' && cat?.isIncome) {
        continue;
      }
      if (categoryId && p.categoryId !== categoryId) {
        continue;
      }
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
    return blocks.filter((b) => b.positions.length > 0);
  }

  categoryName(categoryId: string): string {
    const raw = this.categories.find((item) => item.id === categoryId)?.name;
    if (!raw) {
      return this.t('budget.uncategorized');
    }
    return this.i18n.translateCategoryName(raw);
  }

  entryPositionLabel(entry: ActualEntry): string {
    const position = this.positions.find((item) => item.id === entry.budgetPositionId);
    if (!position) {
      return '-';
    }
    return `${this.categoryName(position.categoryId)} — ${this.i18n.translateSampleToken(position.name)}`;
  }

  entryAccountLabel(entry: ActualEntry): string {
    return entry.accountName?.trim() || '—';
  }

  spendingsPageTitle(): string {
    if (this.ledgerFlowFilter === 'income') {
      return this.t('spendings.pageTitle.income');
    }
    if (this.ledgerFlowFilter === 'expense') {
      return this.t('spendings.pageTitle.expense');
    }
    return this.t('spendings.pageTitle.all');
  }

  private effectiveFlowKind(): 'income' | 'expense' | undefined {
    return this.ledgerFlowFilter === 'all' ? undefined : this.ledgerFlowFilter;
  }

  private actualsFilterApiOptions(): { flowKind?: 'income' | 'expense'; categoryId?: string } {
    const flowKind = this.effectiveFlowKind();
    const categoryId = this.ledgerCategoryFilter ?? undefined;
    return {
      ...(flowKind ? { flowKind } : {}),
      ...(categoryId ? { categoryId } : {})
    };
  }

  private ensureLedgerCategoryFilterValid(): void {
    if (!this.ledgerCategoryFilter) {
      return;
    }
    const stillVisible = this.filterableCategories().some((c) => c.id === this.ledgerCategoryFilter);
    if (!stillVisible) {
      this.ledgerCategoryFilter = null;
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private setMessage(message: string, type: 'success' | 'error'): void {
    if (this.messageClearTimer) {
      clearTimeout(this.messageClearTimer);
      this.messageClearTimer = null;
    }
    if (type === 'success') {
      this.message = '';
      return;
    }
    this.message = message;
    this.messageType = type;
    this.messageClearTimer = setTimeout(() => {
      if (this.message === message && this.messageType === type) {
        this.message = '';
      }
      this.messageClearTimer = null;
    }, this.messageAutoClearMs);
  }

  private toDateInput(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private clearRowEditState(): void {
    this.editingEntryId = null;
    this.editDraft = null;
    this.editAmountText = null;
    this.editSnapshot = '';
  }

  private startEditing(entry: ActualEntry): void {
    this.newEntryRowActive.set(false);
    this.editingEntryId = entry.id;
    this.editDraft = this.entryToDraft(entry);
    this.editAmountText = null;
    this.captureEditSnapshot();
  }

  private entryToDraft(entry: ActualEntry): ActualEditDraft {
    const booked =
      entry.bookedOn && entry.bookedOn.length >= 10 ? entry.bookedOn.slice(0, 10) : entry.bookedOn;
    let amount = entry.amount;
    const income = this.isIncomePositionId(entry.budgetPositionId);
    if (income && amount < 0) {
      amount = Math.abs(amount);
    }
    if (!income && amount > 0) {
      amount = -Math.abs(amount);
    }
    const rawNote = entry.note ?? '';
    const noteSourceSampleKey = rawNote.startsWith('sample.') ? rawNote : null;
    const note = noteSourceSampleKey ? this.i18n.translateSampleToken(rawNote) : rawNote;
    return {
      budgetPositionId: entry.budgetPositionId,
      accountId: entry.accountId ?? this.accounts[0]?.id ?? '',
      bookedOn: booked,
      amount,
      note,
      noteSourceSampleKey,
      externalRef: entry.externalRef ?? null
    };
  }

  private captureEditSnapshot(): void {
    if (!this.editDraft) {
      this.editSnapshot = '';
      return;
    }
    this.editSnapshot = this.serializeDraft(this.editDraftWithEffectiveAmount());
  }

  private editDraftWithEffectiveAmount(): ActualEditDraft {
    if (!this.editDraft) {
      throw new Error('editDraft');
    }
    const d = { ...this.editDraft };
    if (this.editAmountText !== null) {
      const parsed = this.i18n.parseAmount(this.editAmountText);
      if (parsed !== null) {
        d.amount = this.normalizeAmountForPosition(d.budgetPositionId, parsed);
      }
    }
    return d;
  }

  private serializeDraft(d: ActualEditDraft): string {
    return JSON.stringify({
      budgetPositionId: d.budgetPositionId,
      accountId: d.accountId,
      bookedOn: d.bookedOn,
      amount: d.amount,
      note: d.note.trim(),
      noteSourceSampleKey: d.noteSourceSampleKey,
      externalRef: d.externalRef
    });
  }

  private isEditingDraftDirty(): boolean {
    if (!this.editDraft || !this.editingEntryId) {
      return false;
    }
    return this.serializeDraft(this.editDraftWithEffectiveAmount()) !== this.editSnapshot;
  }

  private commitEditAmountFromInput(): void {
    if (this.editAmountText === null || !this.editDraft) {
      return;
    }
    const parsed = this.i18n.parseAmount(this.editAmountText);
    this.editAmountText = null;
    if (parsed !== null) {
      this.editDraft.amount = this.normalizeAmountForPosition(this.editDraft.budgetPositionId, parsed);
    }
  }

  private flushEditingSave(): void {
    if (!this.editingEntryId || !this.editDraft || this.savingEdit()) {
      return;
    }
    this.commitEditAmountFromInput();
    if (!this.isEditingDraftDirty()) {
      this.clearRowEditState();
      return;
    }

    const draft = this.editDraftWithEffectiveAmount();
    draft.amount = this.normalizeAmountForPosition(draft.budgetPositionId, draft.amount);
    const signErr = this.validateAmountSignForPosition(draft.budgetPositionId, draft.amount);
    if (signErr) {
      this.setMessage(signErr, 'error');
      return;
    }

    const payload = this.toUpdatePayload(draft);
    this.savingEdit.set(true);

    this.api
      .updateActualEntry(this.editingEntryId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.applyEntryUpdate(updated);
          this.loadCurrentMonthRemainingHints();
          this.savingEdit.set(false);
          this.clearRowEditState();
          this.setMessage('msg.updateActualSuccess', 'success');
        },
        error: () => {
          this.savingEdit.set(false);
          this.setMessage('msg.updateActualFailed', 'error');
        }
      });
  }

  private loadCurrentMonthRemainingHints(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId) {
      this.plannedThisMonthByPosition = new Map<string, number>();
      this.remainingThisMonthByPosition = new Map<string, number>();
      return;
    }
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const seq = ++this.remainingHintsRequestSeq;
    this.api
      .getPlanActualByPosition(baselineId, currentYear)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (seq !== this.remainingHintsRequestSeq) {
            return;
          }
          const byPosition = new Map<string, number>();
          const plannedByPosition = new Map<string, number>();
          for (const row of report.positions) {
            const month = row.months.find((item) => item.month === currentMonth);
            if (!month) {
              continue;
            }
            plannedByPosition.set(row.positionId, month.planned);
            byPosition.set(row.positionId, month.actual - month.planned);
          }
          this.plannedThisMonthByPosition = plannedByPosition;
          this.remainingThisMonthByPosition = byPosition;
          this.recomputeLoadedEntryVarianceSnapshots();
        },
        error: () => {
          if (seq !== this.remainingHintsRequestSeq) {
            return;
          }
          this.plannedThisMonthByPosition = new Map<string, number>();
          this.remainingThisMonthByPosition = new Map<string, number>();
          this.remainingThisMonthSnapshotByEntryId = new Map<string, number>();
        }
      });
  }

  private recomputeLoadedEntryVarianceSnapshots(): void {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const runningByPosition = new Map<string, number>();
    const snapshots = new Map<string, number>();

    for (let idx = this.actualEntries.length - 1; idx >= 0; idx--) {
      const entry = this.actualEntries[idx];
      const year = Number(entry.bookedOn.slice(0, 4));
      const month = Number(entry.bookedOn.slice(5, 7));
      if (year !== currentYear || month !== currentMonth) {
        continue;
      }
      const plannedForMonth = this.plannedThisMonthByPosition.get(entry.budgetPositionId);
      if (plannedForMonth === undefined) {
        continue;
      }
      const nextRunning = (runningByPosition.get(entry.budgetPositionId) ?? 0) + this.displayAmountForEntry(entry);
      runningByPosition.set(entry.budgetPositionId, nextRunning);
      snapshots.set(entry.id, nextRunning - plannedForMonth);
    }

    this.remainingThisMonthSnapshotByEntryId = snapshots;
  }

  private toUpdatePayload(d: ActualEditDraft) {
    const trimmedNote = d.note.trim();
    let note: string | null = trimmedNote || null;
    if (d.noteSourceSampleKey) {
      const localized = this.i18n.translateSampleToken(d.noteSourceSampleKey);
      if (trimmedNote === localized || trimmedNote === d.noteSourceSampleKey) {
        note = d.noteSourceSampleKey;
      }
    }

    return {
      budgetPositionId: d.budgetPositionId,
      accountId: d.accountId,
      bookedOn: d.bookedOn,
      amount: d.amount,
      note,
      externalRef: d.externalRef
    };
  }

  private applyEntryUpdate(updated: ActualEntry): void {
    const idx = this.actualEntries.findIndex((e) => e.id === updated.id);
    if (idx >= 0) {
      this.actualEntries[idx] = updated;
    }
  }

  onNewAttachmentSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.newAttachmentFile = file;
  }

  onEditAttachmentSelected(entry: ActualEntry, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || !this.editingEntryId || this.editingEntryId !== entry.id) {
      return;
    }
    this.uploadAttachmentForEntry(entry.id, file);
  }

  downloadAttachment(entry: ActualEntry, ev?: Event): void {
    ev?.stopPropagation();
    if (!entry.hasAttachment) {
      return;
    }
    this.api
      .downloadActualAttachment(entry.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = entry.attachmentFileName?.trim() || 'receipt';
          anchor.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.setMessage('msg.attachmentDownloadFailed', 'error')
      });
  }

  removeAttachment(entry: ActualEntry, ev?: Event): void {
    ev?.stopPropagation();
    if (!entry.hasAttachment || this.uploadingAttachment() || this.savingEdit()) {
      return;
    }
    this.uploadingAttachment.set(true);
    this.api
      .deleteActualAttachment(entry.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.uploadingAttachment.set(false);
          this.applyEntryUpdate(updated);
          if (this.editingEntryId === updated.id) {
            this.editDraft = this.entryToDraft(updated);
            this.captureEditSnapshot();
          }
          this.setMessage('msg.attachmentRemoveSuccess', 'success');
        },
        error: () => {
          this.uploadingAttachment.set(false);
          this.setMessage('msg.attachmentRemoveFailed', 'error');
        }
      });
  }

  newAttachmentLabel(): string {
    return this.newAttachmentFile?.name ?? this.t('budget.attachmentNone');
  }

  hasNewAttachmentFile(): boolean {
    return this.newAttachmentFile != null;
  }

  private uploadAttachmentForEntry(entryId: string, file: File, onSuccess?: () => void): void {
    this.uploadingAttachment.set(true);
    this.api
      .uploadActualAttachment(entryId, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.uploadingAttachment.set(false);
          this.applyEntryUpdate(updated);
          if (this.editingEntryId === updated.id) {
            this.editDraft = this.entryToDraft(updated);
            this.captureEditSnapshot();
          }
          this.setMessage('msg.attachmentUploadSuccess', 'success');
          onSuccess?.();
        },
        error: () => {
          this.uploadingAttachment.set(false);
          this.setMessage('msg.attachmentUploadFailed', 'error');
          if (this.savingNewEntry()) {
            this.savingNewEntry.set(false);
            this.resetNewActualAfterSuccess();
            this.loadCurrentMonthRemainingHints();
            this.loadActualsFromStart();
          }
        }
      });
  }

}
