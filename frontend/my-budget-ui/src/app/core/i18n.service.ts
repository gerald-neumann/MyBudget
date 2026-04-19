import { Injectable, signal } from '@angular/core';

type LanguageCode = 'de' | 'en';

/** Canonical persisted names (see backend DataSeeder) and report aggregates → i18n key. */
const CATEGORY_NAME_KEYS: Record<string, string> = {
  Income: 'category.income',
  'Income inflow': 'category.incomeInflow',
  Housing: 'category.housing',
  Utilities: 'category.utilities',
  'Food & groceries': 'category.foodGroceries',
  Transport: 'category.transport',
  Insurance: 'category.insurance',
  Health: 'category.health',
  Subscriptions: 'category.subscriptions',
  'Savings & investments': 'category.savingsInvestments',
  'Discretionary / fun': 'category.discretionaryFun',
  'One-off / large purchases': 'category.oneOffLargePurchases',
  Other: 'dashboard.cashflowOther'
};

const translations: Record<LanguageCode, Record<string, string>> = {
  de: {
    'app.title': 'MyBudget',
    'app.newBaselinePlaceholder': 'Neuer Baseline-Name',
    'app.newBaselineModalTitle': 'Neue Baseline',
    'app.newBaselineCreate': 'Anlegen',
    'app.cancel': 'Abbrechen',
    'app.addBaseline': 'Baseline hinzufügen',
    'app.forkSelected': 'Ausgewählte ableiten',
    'app.budgetSheet': 'Budget-Tabelle',
    'app.budget': 'Budget',
    'app.spendings': 'Ausgaben',
    'app.dashboard': 'Dashboard',
    'app.language': 'Sprache',
    'app.lang.de': 'Deutsch',
    'app.lang.en': 'Englisch',
    'app.userMenuAria': 'Konto und Einstellungen',
    'app.yearLabel': 'Jahr',
    'app.sectionBaseline': 'Baseline',
    'app.sectionJoinInvite': 'Einladung annehmen',
    'app.invitationTokenPlaceholder': 'Einladungs-Token',
    'app.joinBaseline': 'Beitreten',
    'app.openSharing': 'Freigaben & Mitarbeit',
    'app.sharingModalTitle': 'Baseline teilen',
    'app.sharingNotOwner': 'Nur der Besitzer der ausgewählten Baseline kann Freigaben verwalten.',
    'app.sharingNoBaseline': 'Bitte zuerst eine Baseline auswählen.',
    'app.sharingShareAs': 'Teilen als',
    'app.sharingRoleViewer': 'Betrachter (lesen)',
    'app.sharingRoleEditor': 'Bearbeiter (schreiben)',
    'app.sharingCreateInvite': 'Einladungs-Token erstellen',
    'app.sharingCopyToken': 'Token kopieren',
    'app.sharingMembers': 'Mitglieder',
    'app.sharingPendingInvites': 'Ausstehende Einladungen',
    'app.sharingRevoke': 'Zurückziehen',
    'app.sharingRemove': 'Entfernen',
    'app.sharingLoadFailed': 'Freigaben konnten nicht geladen werden.',
    'app.sharingUntil': 'bis',
    'app.sharingCopyFailed': 'Token konnte nicht kopiert werden.',

    'budget.title': 'Budget-Positionen',
    'budget.tab.positions': 'Positionen',
    'budget.tab.actuals': 'Ausgaben',
    'budget.subtitle':
      'Zeilen sind Positionen (in der Tabelle nur der Name), nach Kategorie als Abschnitte gruppiert. Monatsspalten sind das konkrete Jahr. Über „Bearbeiten“ in der Spalte „Aktion“ (oder per Zeilenklick) öffnest du den Dialog für Rhythmus, Zeitraum, Vorlagebetrag und Kategorie; dort kannst du wiederkehrende Monate auch auf die Vorlage zurücksetzen. Monatsbeträge änderst du direkt in der Tabelle. Einnahmen (+), Ausgaben (−). Änderungen werden gespeichert.',
    'budget.helpAria': 'Hilfe zur Budget-Tabelle',
    'budget.openNewPositionSheet': 'Position anlegen',
    'budget.newPositionSheetTitle': 'Neue Budget-Position',
    'budget.editPositionSheetTitle': 'Position bearbeiten',
    'budget.saveChanges': 'Speichern',
    'budget.barEdit': 'Bearbeiten',
    'budget.editRowHint': 'Rhythmus, Zeitraum, Vorlagebetrag und Kategorie bearbeiten',
    'budget.applyTemplateToYear': 'Vorlage auf Jahr anwenden',
    'budget.deselectRow': 'Auswahl aufheben',
    'budget.monthlySum': 'Monatssumme',
    'budget.runningCashflow': 'Kumuliert',
    'budget.defaultAmountLabel': 'Standardbetrag',
    'budget.newPositionPlaceholder': 'Neuer Positionsname',
    'budget.categoryPlaceholder': 'Kategorie (bestehend oder neu)',
    'budget.add': 'Hinzufügen',
    'budget.loading': 'Daten werden geladen...',
    'budget.position': 'Position',
    'budget.category': 'Kategorie',
    'budget.total': 'Gesamt',
    'budget.action': 'Aktion',
    'budget.delete': 'Löschen',
    'budget.recurrence': 'Rhythmus',
    'budget.validFrom': 'Von',
    'budget.validTo': 'Bis',
    'budget.plannedApplyLegend': 'Geplante Monate anpassen',
    'budget.plannedApplyHint':
      'Wenn du Rhythmus, Zeitraum oder Vorlagebetrag änderst: Sollen die Monatszellen im Raster mit der neuen Vorlage überschrieben werden (Overrides entfernen)?',
    'budget.plannedApplyAll': 'Alle betroffenen Monate (alle Jahre)',
    'budget.plannedApplyRange': 'Nur im Zeitraum',
    'budget.plannedApplyFrom': 'Von (Datum)',
    'budget.plannedApplyTo': 'Bis (Datum)',
    'budget.template': 'Vorlage',
    'budget.reapplyTemplate': 'Vorlage',
    'budget.reapplyTemplateHint':
      'Geplante Monatsbeträge (laut Rhythmus) im ausgewählten Jahr auf den Vorlagebetrag setzen und manuelle Zell-Overrides entfernen.',
    'budget.savingCells': 'Zelländerungen werden gespeichert...',
    'budget.actualTitle': 'Tatsächliche Ausgaben',
    'budget.actualSubtitle': 'Ordne Ausgaben einer geplanten Position zu.',
    'budget.selectPosition': 'Position auswählen',
    'budget.amountPlaceholder': 'Betrag',
    'budget.notePlaceholder': 'Notiz',
    'budget.addActual': 'Ausgabe hinzufügen',
    'budget.date': 'Datum',
    'budget.note': 'Notiz',
    'budget.uncategorized': 'Ohne Kategorie',
    'category.income': 'Einkommen',
    'category.incomeInflow': 'Einkommen (Zusatz)',
    'category.housing': 'Wohnen',
    'category.utilities': 'Nebenkosten & Verträge',
    'category.foodGroceries': 'Lebensmittel',
    'category.transport': 'Mobilität',
    'category.insurance': 'Versicherungen',
    'category.health': 'Gesundheit',
    'category.subscriptions': 'Abos',
    'category.savingsInvestments': 'Sparen & Anlegen',
    'category.discretionaryFun': 'Freizeit',
    'category.oneOffLargePurchases': 'Sonderausgaben & Anschaffungen',
    'budget.none': 'Einmalig',
    'budget.monthly': 'Monatlich',
    'budget.yearly': 'Jährlich',

    'dashboard.cashflowTitle': 'Einnahmen vs. Ausgaben (Ist)',
    'dashboard.cashflowSubtitle': 'Pro Monat: Ist-Einnahmen und Ist-Ausgaben; die Linie zeigt den Saldo (positiv = Plus, negativ = Minus).',
    'dashboard.cashflowIncome': 'Einnahmen (Ist)',
    'dashboard.cashflowSpending': 'Ausgaben (Ist)',
    'dashboard.cashflowNet': 'Saldo (Einnahmen − Ausgaben)',
    'dashboard.cashflowStackTitle': 'Ausgaben nach Kategorie (Ist)',
    'dashboard.cashflowStackSubtitle': 'Gestapelte monatliche Ist-Ausgaben je Kategorie (ohne Einnahmen-Kategorien).',
    'dashboard.cashflowOther': 'Sonstige',
    'dashboard.cashflowNoIncomeHint': 'Es sind noch keine Ist-Einnahmen erfasst. Lege Budget-Positionen in der Kategorie „Income“ an und buche dort deine Einnahmen, oder markiere eine Kategorie als Einnahme in den Stammdaten.',
    'dashboard.cashflowNoSpendData': 'Noch keine Ausgaben-Istbuchungen in diesem Jahr.',
    'dashboard.yearlyTitle': 'Jahressummen',
    'dashboard.yearlySubtitle': 'Dreijahresübersicht.',
    'dashboard.categoryTitle': 'Verteilung nach Kategorien',
    'dashboard.categorySubtitle':
      'Nur Ausgaben-Kategorien (ohne Einnahmen): geplante und Ist-Beträge für das ausgewählte Jahr.',
    'dashboard.comparisonTitle': 'Baseline-Vergleich',
    'dashboard.selectBaseline': 'Baseline zum Vergleichen auswählen',
    'dashboard.compare': 'Vergleichen',
    'dashboard.month': 'Monat',
    'dashboard.selectedBaseline': 'Ausgewählte Baseline',
    'dashboard.comparedBaseline': 'Verglichene Baseline',
    'dashboard.delta': 'Differenz',
    'dashboard.loading': 'Diagrammdaten werden geladen...',
    'dashboard.chartsLoadError': 'Die Diagramme konnten nicht geladen werden. Bitte prüfe die API-Verbindung (localhost:5256) und lade die Seite neu.',
    'dashboard.planned': 'Geplant',
    'dashboard.actual': 'Ist',

    'msg.savePlannedFailed': 'Geplante Beträge konnten nicht gespeichert werden.',
    'msg.createPositionFailed': 'Budget-Position konnte nicht erstellt werden.',
    'msg.updateCategoryFailed': 'Kategorie konnte nicht aktualisiert werden.',
    'msg.deletePositionFailed': 'Position konnte nicht gelöscht werden.',
    'msg.updatePositionFailed': 'Position konnte nicht aktualisiert werden.',
    'msg.editPositionApplyRangeInvalid': 'Bitte gültigen Zeitraum wählen (Von und Bis, Von nicht nach Bis).',
    'msg.confirmReapplyRecurrence':
      'Monate laut Rhythmus auf den Vorlagebetrag setzen und manuelle Zellanpassungen für dieses Jahr entfernen?',
    'msg.reapplyRecurrenceFailed': 'Vorlage konnte nicht neu angewendet werden.',
    'msg.addActualSuccess': 'Tatsächliche Ausgabe wurde hinzugefügt.',
    'msg.addActualFailed': 'Tatsächliche Ausgabe konnte nicht hinzugefügt werden.',
    'msg.loadBudgetFailed': 'Budgetdaten konnten nicht geladen werden.',
    'msg.createCategoryFailed': 'Kategorie konnte nicht erstellt werden.',
    'msg.selectBaselineFirst': 'Bitte zuerst eine Baseline auswählen oder anlegen.',
    'msg.enterPositionAndCategory': 'Bitte Positionsname und Kategorie ausfüllen.',
    'msg.confirmCreateCategory':
      'Neue Kategorie "{name}" wirklich anlegen? Es könnte auch ein Tippfehler bei einem bestehenden Namen sein.',

    'monthShort.1': 'Jan',
    'monthShort.2': 'Feb',
    'monthShort.3': 'Mär',
    'monthShort.4': 'Apr',
    'monthShort.5': 'Mai',
    'monthShort.6': 'Jun',
    'monthShort.7': 'Jul',
    'monthShort.8': 'Aug',
    'monthShort.9': 'Sep',
    'monthShort.10': 'Okt',
    'monthShort.11': 'Nov',
    'monthShort.12': 'Dez'
  },
  en: {
    'app.title': 'MyBudget',
    'app.newBaselinePlaceholder': 'New baseline name',
    'app.newBaselineModalTitle': 'New baseline',
    'app.newBaselineCreate': 'Create',
    'app.cancel': 'Cancel',
    'app.addBaseline': 'Add baseline',
    'app.forkSelected': 'Fork selected',
    'app.budgetSheet': 'Budget sheet',
    'app.budget': 'Budget',
    'app.spendings': 'Spendings',
    'app.dashboard': 'Dashboard',
    'app.language': 'Language',
    'app.lang.de': 'German',
    'app.lang.en': 'English',
    'app.userMenuAria': 'Account and settings',
    'app.yearLabel': 'Year',
    'app.sectionBaseline': 'Baseline',
    'app.sectionJoinInvite': 'Accept invitation',
    'app.invitationTokenPlaceholder': 'Invitation token',
    'app.joinBaseline': 'Join',
    'app.openSharing': 'Sharing & access',
    'app.sharingModalTitle': 'Share baseline',
    'app.sharingNotOwner': 'Only the owner of the selected baseline can manage sharing.',
    'app.sharingNoBaseline': 'Select a baseline first.',
    'app.sharingShareAs': 'Share as',
    'app.sharingRoleViewer': 'Viewer (read)',
    'app.sharingRoleEditor': 'Editor (write)',
    'app.sharingCreateInvite': 'Create invitation token',
    'app.sharingCopyToken': 'Copy token',
    'app.sharingMembers': 'Members',
    'app.sharingPendingInvites': 'Pending invitations',
    'app.sharingRevoke': 'Revoke',
    'app.sharingRemove': 'Remove',
    'app.sharingLoadFailed': 'Could not load sharing details.',
    'app.sharingUntil': 'until',
    'app.sharingCopyFailed': 'Could not copy token.',

    'budget.title': 'Budget positions',
    'budget.tab.positions': 'Positions',
    'budget.tab.actuals': 'Spendings',
    'budget.subtitle':
      'Each row is a position (only the name appears in the grid), grouped under category section headers. Month columns are the selected year. Use “Edit” in the “Action” column (or click the row) to change cadence, date range, template amount, and category; recurring lines can reset planned months to the template from that dialog. Edit month amounts in the grid. Income (+), spending (−). Edits autosave.',
    'budget.helpAria': 'Help for the budget sheet',
    'budget.openNewPositionSheet': 'Add position',
    'budget.newPositionSheetTitle': 'New budget position',
    'budget.editPositionSheetTitle': 'Edit budget line',
    'budget.saveChanges': 'Save',
    'budget.barEdit': 'Edit',
    'budget.editRowHint': 'Edit cadence, date range, template amount, and category',
    'budget.applyTemplateToYear': 'Apply template to year',
    'budget.deselectRow': 'Deselect row',
    'budget.monthlySum': 'Monthly sum',
    'budget.runningCashflow': 'Running cashflow',
    'budget.defaultAmountLabel': 'Default amount',
    'budget.newPositionPlaceholder': 'New position name',
    'budget.categoryPlaceholder': 'Category (existing or new)',
    'budget.add': 'Add',
    'budget.loading': 'Loading data...',
    'budget.position': 'Position',
    'budget.category': 'Category',
    'budget.total': 'Total',
    'budget.action': 'Action',
    'budget.delete': 'Delete',
    'budget.recurrence': 'Cadence',
    'budget.validFrom': 'From',
    'budget.validTo': 'To',
    'budget.plannedApplyLegend': 'Apply to planned months',
    'budget.plannedApplyHint':
      'When you change cadence, date range, or template amount: reset matching month cells to the new template and clear manual overrides.',
    'budget.plannedApplyAll': 'All matching months (all years)',
    'budget.plannedApplyRange': 'Only within a date range',
    'budget.plannedApplyFrom': 'From (date)',
    'budget.plannedApplyTo': 'To (date)',
    'budget.template': 'Template',
    'budget.reapplyTemplate': 'Template',
    'budget.reapplyTemplateHint':
      'Set planned months (per cadence) in the selected year to the template amount and clear manual cell overrides.',
    'budget.savingCells': 'Saving cell updates...',
    'budget.actualTitle': 'Actual spendings',
    'budget.actualSubtitle': 'Assign spendings to a planned position.',
    'budget.selectPosition': 'Select position',
    'budget.amountPlaceholder': 'Amount',
    'budget.notePlaceholder': 'Note',
    'budget.addActual': 'Add actual',
    'budget.date': 'Date',
    'budget.note': 'Note',
    'budget.uncategorized': 'Uncategorized',
    'category.income': 'Income',
    'category.incomeInflow': 'Income inflow',
    'category.housing': 'Housing',
    'category.utilities': 'Utilities',
    'category.foodGroceries': 'Food & groceries',
    'category.transport': 'Transport',
    'category.insurance': 'Insurance',
    'category.health': 'Health',
    'category.subscriptions': 'Subscriptions',
    'category.savingsInvestments': 'Savings & investments',
    'category.discretionaryFun': 'Discretionary / fun',
    'category.oneOffLargePurchases': 'One-off / large purchases',
    'budget.none': 'One-time',
    'budget.monthly': 'Monthly',
    'budget.yearly': 'Yearly',

    'dashboard.cashflowTitle': 'Income vs spending (actual)',
    'dashboard.cashflowSubtitle': 'Per month: actual income and actual spending; the line is the balance (positive = surplus, negative = shortfall).',
    'dashboard.cashflowIncome': 'Income (actual)',
    'dashboard.cashflowSpending': 'Spending (actual)',
    'dashboard.cashflowNet': 'Balance (income − spending)',
    'dashboard.cashflowStackTitle': 'Spending by category (actual)',
    'dashboard.cashflowStackSubtitle': 'Stacked monthly actual spending by category (excludes income categories).',
    'dashboard.cashflowOther': 'Other',
    'dashboard.cashflowNoIncomeHint': 'No actual income recorded yet. Add budget lines under the Income category and book there, or mark a category as income in your category list.',
    'dashboard.cashflowNoSpendData': 'No actual spending entries yet for this year.',
    'dashboard.yearlyTitle': 'Yearly totals',
    'dashboard.yearlySubtitle': 'Three-year rolling overview.',
    'dashboard.categoryTitle': 'Category distribution',
    'dashboard.categorySubtitle':
      'Expense categories only (no income): planned and actual amounts for the selected year.',
    'dashboard.comparisonTitle': 'Baseline comparison',
    'dashboard.selectBaseline': 'Select baseline to compare',
    'dashboard.compare': 'Compare',
    'dashboard.month': 'Month',
    'dashboard.selectedBaseline': 'Selected baseline',
    'dashboard.comparedBaseline': 'Compared baseline',
    'dashboard.delta': 'Delta',
    'dashboard.loading': 'Loading chart data...',
    'dashboard.chartsLoadError': 'The charts could not be loaded. Check the API (localhost:5256) and refresh the page.',
    'dashboard.planned': 'Planned',
    'dashboard.actual': 'Actual',

    'msg.savePlannedFailed': 'Could not save planned amount changes.',
    'msg.createPositionFailed': 'Could not create budget position.',
    'msg.updateCategoryFailed': 'Could not update category.',
    'msg.deletePositionFailed': 'Could not delete position.',
    'msg.updatePositionFailed': 'Could not update budget position.',
    'msg.editPositionApplyRangeInvalid': 'Please enter a valid range (from and to; from must not be after to).',
    'msg.confirmReapplyRecurrence':
      'Reset months covered by the cadence to the template amount and remove manual cell overrides for this year?',
    'msg.reapplyRecurrenceFailed': 'Could not reapply the recurrence template.',
    'msg.addActualSuccess': 'Actual spending added.',
    'msg.addActualFailed': 'Could not add actual spending.',
    'msg.loadBudgetFailed': 'Could not load budget data.',
    'msg.createCategoryFailed': 'Could not create category.',
    'msg.selectBaselineFirst': 'Select or create a baseline first.',
    'msg.enterPositionAndCategory': 'Enter a position name and category.',
    'msg.confirmCreateCategory':
      'Create new category "{name}"? It might be a typo for an existing category name.',

    'monthShort.1': 'Jan',
    'monthShort.2': 'Feb',
    'monthShort.3': 'Mar',
    'monthShort.4': 'Apr',
    'monthShort.5': 'May',
    'monthShort.6': 'Jun',
    'monthShort.7': 'Jul',
    'monthShort.8': 'Aug',
    'monthShort.9': 'Sep',
    'monthShort.10': 'Oct',
    'monthShort.11': 'Nov',
    'monthShort.12': 'Dec'
  }
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storageKey = 'MyBudgetLang';
  readonly language = signal<LanguageCode>(this.readLanguage());

  setLanguage(language: LanguageCode): void {
    this.language.set(language);
    localStorage.setItem(this.storageKey, language);
  }

  /** Locale id for `number` / `Intl` formatting (amounts are always EUR conceptually, shown without a symbol). */
  numberLocale(): string {
    return this.language() === 'de' ? 'de-DE' : 'en-EU';
  }

  /** Two-decimal amount for display (tables, inputs, chart tooltips). */
  formatAmount(value: number): string {
    return new Intl.NumberFormat(this.numberLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  /**
   * Parses a user-typed amount in the current UI language (`de` → comma decimal;
   * `en` → dot decimal, comma thousands).
   */
  parseAmount(text: string): number | null {
    let s = text.trim().replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-');
    if (s === '' || s === '-' || s === '+') {
      return null;
    }
    if (this.language() === 'de') {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** UI label for a category `name` as stored in the API; unknown names pass through. */
  translateCategoryName(storedName: string): string {
    void this.language();
    const key = CATEGORY_NAME_KEYS[storedName];
    if (!key) {
      return storedName;
    }
    return this.t(key);
  }

  t(key: string, params?: Record<string, string | number>): string {
    const current = this.language();
    let text = translations[current][key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replaceAll(`{${paramKey}}`, String(paramValue));
      }
    }
    return text;
  }

  private readLanguage(): LanguageCode {
    const stored = localStorage.getItem(this.storageKey);
    return stored === 'en' || stored === 'de' ? stored : 'de';
  }
}
