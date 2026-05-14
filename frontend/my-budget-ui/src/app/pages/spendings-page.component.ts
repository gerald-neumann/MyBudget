import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, Subject, Subscription } from 'rxjs';
import { debounceTime, finalize, map } from 'rxjs/operators';
import { BudgetApiService } from '../core/budget-api.service';
import { BudgetStateService } from '../core/budget-state.service';
import { I18nService } from '../core/i18n.service';
import { Account, ActualEntry, BudgetPosition, Category } from '../core/budget.models';

export type SpendingsDatePreset = 'currentMonth' | 'prevMonth' | 'currentYear' | 'lastYear' | 'all';

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
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './spendings-page.component.html',
  styleUrl: './spendings-page.component.css'
})
export class SpendingsPageComponent {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly ledgerMode = toSignal(
    this.route.data.pipe(
      map((d) => (d['ledgerMode'] as 'income' | 'expense' | undefined) ?? 'all')
    ),
    { initialValue: (this.route.snapshot.data['ledgerMode'] as 'income' | 'expense' | undefined) ?? 'all' }
  );

  private readonly spendingsScroll = viewChild<ElementRef<HTMLElement>>('spendingsScroll');
  private readonly ledgerSearchDraftInput = viewChild<ElementRef<HTMLInputElement>>('ledgerSearchDraft');

  positions: BudgetPosition[] = [];
  categories: Category[] = [];
  accounts: Account[] = [];
  actualEntries: ActualEntry[] = [];
  actualsTotalCount = 0;
  private actualsSkip = 0;
  readonly pageSize = 50;

  readonly loading = signal(false);
  readonly loadingActuals = signal(false);
  readonly loadingMoreActuals = signal(false);

  readonly referenceDataReady = signal(false);
  /** Extra table row at the top for creating an entry (inline fields, save on blur when valid). */
  readonly newEntryRowActive = signal(false);
  readonly savingEdit = signal(false);
  readonly savingNewEntry = signal(false);

  private lastShellKey: string | null = null;
  private actualsRequestSeq = 0;
  private actualsPageSub: Subscription | null = null;

  private readonly filterDebounce$ = new Subject<void>();

  datePreset: SpendingsDatePreset = 'currentMonth';
  /** Committed search bubbles (text and amount predicates). */
  ledgerSearchChips: LedgerSearchChip[] = [];
  /** Inline text before it becomes a chip. */
  searchDraft = '';
  private ledgerSearchChipSeq = 0;

  message = '';
  messageType: 'success' | 'error' = 'success';

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
  private pendingRowAfterSave: ActualEntry | null = null;
  /** After creating an entry and reloading the page, open edit mode for this existing row id. */
  private pendingStartEditEntryId: string | null = null;
  private newActualSnapshot = '';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.actualsPageSub?.unsubscribe();
    });

    this.filterDebounce$.pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.referenceDataReady()) {
        this.loadActualsFromStart();
      }
    });

    effect((onCleanup) => {
      const baselineId = this.state.selectedBaselineId();
      const year = this.state.selectedYear();
      const mode = this.ledgerMode();
      if (!baselineId) {
        this.loading.set(false);
        this.referenceDataReady.set(false);
        this.positions = [];
        this.categories = [];
        this.accounts = [];
        this.actualEntries = [];
        this.actualsTotalCount = 0;
        this.actualsSkip = 0;
        this.clearRowEditState();
        this.newEntryRowActive.set(false);
        return;
      }

      this.loading.set(true);
      this.referenceDataReady.set(false);
      const sub = forkJoin({
        positions: this.api.getPositions(baselineId, year),
        categories: this.api.getCategoriesForBaseline(baselineId),
        accounts: this.api.getAccounts()
      }).subscribe({
        next: (response) => {
          this.loading.set(false);
          this.positions = response.positions;
          this.categories = response.categories;
          this.accounts = response.accounts;
          this.ensureDefaultAccountSelection();
          this.ensureSelectedPositionStillValid();

          const shellKey = `${baselineId}|${mode}`;
          if (this.lastShellKey !== shellKey) {
            this.lastShellKey = shellKey;
            this.datePreset = 'currentMonth';
            this.ledgerSearchChips = [];
            this.searchDraft = '';
          }

          this.referenceDataReady.set(true);
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
  }

  canManageSpendings(): boolean {
    const access = this.state.selectedBaseline()?.myAccess;
    return access === 'Editor' || access === 'Owner';
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
    this.newEntryRowActive.set(false);
  }

  tryCommitNewEntryOnBlur(): void {
    if (!this.newEntryRowActive() || this.savingNewEntry()) {
      return;
    }
    this.commitPendingNewActualAmount();
    if (!this.isNewActualDirty()) {
      return;
    }
    const amount = this.effectiveNewActualAmount();
    const err = this.validateNewActualForSubmit(amount);
    if (err) {
      this.setMessage(err, 'error');
      return;
    }
    this.submitNewActualEntry(null);
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
    return this.i18n.formatAmount(this.newActual.amount);
  }

  onNewActualAmountFocus(): void {
    this.newActualAmountEdit = this.i18n.formatAmount(this.newActual.amount);
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
        this.newActual.amount = parsed;
      }
    }
    this.tryCommitNewEntryOnBlur();
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
    return this.validateAmountSignForPosition(this.newActual.budgetPositionId, amount);
  }

  /** Non-zero amount with correct sign for the position's category (income positive, expense negative). */
  private validateAmountSignForPosition(budgetPositionId: string, amount: number): string | null {
    if (!Number.isFinite(amount) || amount === 0) {
      return 'msg.addActualNeedAmount';
    }
    const income = this.isIncomePositionId(budgetPositionId);
    if (income && amount <= 0) {
      return 'msg.actualIncomeMustBePositive';
    }
    if (!income && amount >= 0) {
      return 'msg.actualExpenseMustBeNegative';
    }
    return null;
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

  /** Sum of display amounts for currently loaded rows (see `budget.spendingsSumPartialHint` when more pages exist). */
  loadedActualsDisplaySum(): number {
    return this.actualEntries.reduce((sum, e) => sum + this.displayAmountForEntry(e), 0);
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
    this.clearRowEditState();
  }

  cancelNewEntryRow(ev?: Event): void {
    ev?.stopPropagation();
    this.closeNewEntryRow();
  }

  private captureNewActualSnapshot(): void {
    this.commitPendingNewActualAmount();
    this.newActualSnapshot = this.serializeNewActualState();
  }

  private serializeNewActualState(): string {
    return JSON.stringify({
      budgetPositionId: this.newActual.budgetPositionId,
      accountId: this.newActual.accountId,
      bookedOn: this.newActual.bookedOn,
      amount: this.effectiveNewActualAmount(),
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
  }

  /** @param startEditingExistingId If set, after reload opens inline edit for that row (used when switching from a new row to an existing row). */
  private submitNewActualEntry(startEditingExistingId: string | null): void {
    this.commitPendingNewActualAmount();
    const amount = this.effectiveNewActualAmount();
    const err = this.validateNewActualForSubmit(amount);
    if (err) {
      this.setMessage(err, 'error');
      return;
    }
    if (this.savingNewEntry()) {
      return;
    }

    this.savingNewEntry.set(true);
    this.pendingStartEditEntryId = startEditingExistingId;
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
        next: () => {
          this.savingNewEntry.set(false);
          this.resetNewActualAfterSuccess();
          this.setMessage('msg.addActualSuccess', 'success');
          this.loadActualsFromStart();
        },
        error: () => {
          this.savingNewEntry.set(false);
          this.pendingStartEditEntryId = null;
          this.setMessage('msg.addActualFailed', 'error');
        }
      });
  }

  hasMoreActuals(): boolean {
    return this.actualEntries.length < this.actualsTotalCount;
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
        this.submitNewActualEntry(entry.id);
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
        this.pendingRowAfterSave = entry;
        this.flushEditingSave();
        return;
      }
      this.startEditing(entry);
      return;
    }

    this.startEditing(entry);
  }

  onEditCellBlur(): void {
    if (!this.editingEntryId || !this.editDraft || this.savingEdit()) {
      return;
    }
    this.commitEditAmountFromInput();
    if (!this.isEditingDraftDirty()) {
      return;
    }
    this.pendingRowAfterSave = null;
    this.flushEditingSave();
  }

  editAmountDisplayValue(): string {
    if (!this.editDraft) {
      return '';
    }
    if (this.editAmountText !== null) {
      return this.editAmountText;
    }
    return this.i18n.formatAmount(this.editDraft.amount);
  }

  onEditAmountFocus(): void {
    if (!this.editDraft) {
      return;
    }
    this.editAmountText = this.i18n.formatAmount(this.editDraft.amount);
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

  private loadActualsFromStart(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.referenceDataReady()) {
      return;
    }

    const seq = ++this.actualsRequestSeq;
    this.loadingActuals.set(true);
    this.loadingMoreActuals.set(false);
    this.actualsSkip = 0;

    const { bookedFrom, bookedTo } = this.periodBounds();
    const flow = this.ledgerMode();
    const flowKind: 'income' | 'expense' | undefined = flow === 'all' ? undefined : flow;

    this.actualsPageSub?.unsubscribe();
    this.actualsPageSub = this.api
      .getActualEntriesPage({
        baselineId,
        skip: 0,
        take: this.pageSize,
        bookedFrom,
        bookedTo,
        ...this.ledgerSearchApiParams(),
        flowKind
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
          const pend = this.pendingStartEditEntryId;
          this.pendingStartEditEntryId = null;
          if (pend) {
            const found = this.actualEntries.find((e) => e.id === pend);
            if (found) {
              this.startEditing(found);
            }
          } else if (this.newEntryRowActive()) {
            this.captureNewActualSnapshot();
          }
          this.queueTryFillScrollGap();
        },
        error: () => {
          if (seq !== this.actualsRequestSeq) {
            return;
          }
          this.pendingStartEditEntryId = null;
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

    const { bookedFrom, bookedTo } = this.periodBounds();
    const flow = this.ledgerMode();
    const flowKind: 'income' | 'expense' | undefined = flow === 'all' ? undefined : flow;

    this.api
      .getActualEntriesPage({
        baselineId,
        skip: this.actualsSkip,
        take: this.pageSize,
        bookedFrom,
        bookedTo,
        ...this.ledgerSearchApiParams(),
        flowKind
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
      case 'all':
      default:
        return { bookedFrom: null, bookedTo: null };
    }
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
      this.newActual.amount = parsed;
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
    const mode = this.ledgerMode();
    const byCat = new Map<string, BudgetPosition[]>();
    for (const p of this.positions) {
      const cat = this.categories.find((c) => c.id === p.categoryId);
      if (mode === 'income' && !cat?.isIncome) {
        continue;
      }
      if (mode === 'expense' && cat?.isIncome) {
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
    const mode = this.ledgerMode();
    if (mode === 'income') {
      return this.t('spendings.pageTitle.income');
    }
    if (mode === 'expense') {
      return this.t('spendings.pageTitle.expense');
    }
    return this.t('spendings.pageTitle.all');
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private setMessage(message: string, type: 'success' | 'error'): void {
    this.message = message;
    this.messageType = type;
  }

  private toDateInput(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private clearRowEditState(): void {
    this.editingEntryId = null;
    this.editDraft = null;
    this.editAmountText = null;
    this.editSnapshot = '';
    this.pendingRowAfterSave = null;
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
        d.amount = parsed;
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
      this.editDraft.amount = parsed;
    }
  }

  private flushEditingSave(): void {
    if (!this.editingEntryId || !this.editDraft || this.savingEdit()) {
      return;
    }
    this.commitEditAmountFromInput();
    if (!this.isEditingDraftDirty()) {
      this.applyPendingRowSwitchAfterCleanSave();
      return;
    }

    const draft = this.editDraftWithEffectiveAmount();
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
          this.savingEdit.set(false);
          const pending = this.pendingRowAfterSave;
          this.pendingRowAfterSave = null;
          if (pending && pending.id !== updated.id) {
            this.startEditing(pending);
          } else {
            this.editDraft = this.entryToDraft(updated);
            this.editAmountText = null;
            this.captureEditSnapshot();
          }
        },
        error: () => {
          this.savingEdit.set(false);
          this.pendingRowAfterSave = null;
          this.setMessage('msg.updateActualFailed', 'error');
        }
      });
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

  /** If the user queued another row while the draft was already clean, switch now. */
  private applyPendingRowSwitchAfterCleanSave(): void {
    const pending = this.pendingRowAfterSave;
    this.pendingRowAfterSave = null;
    if (pending && this.editingEntryId && pending.id !== this.editingEntryId) {
      this.startEditing(pending);
    }
  }
}
