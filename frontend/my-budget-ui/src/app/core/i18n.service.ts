import { Injectable, signal } from '@angular/core';

type LanguageCode = 'de' | 'en';

/** Canonical persisted names (see backend UserWorkspaceBootstrapper) and report aggregates → i18n key. */
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
  Pets: 'category.pets',
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
    'app.accounts': 'Konten',
    'app.dashboard': 'Dashboard',
    'app.language': 'Sprache',
    'app.lang.de': 'Deutsch',
    'app.lang.en': 'Englisch',
    'app.userMenuAria': 'Konto und Einstellungen',
    'app.yearLabel': 'Jahr',
    'app.sectionBaseline': 'Budget-Arbeitsbereich',
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
    'app.sharingInvitations': 'Einladungen (dieses Budget)',
    'app.sharingRevoke': 'Zurückziehen',
    'app.sharingRemove': 'Entfernen',
    'app.sharingLoadFailed': 'Freigaben konnten nicht geladen werden.',
    'app.sharingUntil': 'bis',
    'app.sharingCopyFailed': 'Token konnte nicht kopiert werden.',
    'app.buildVersionAria': 'Anwendungsversion und Build-Zeitpunkte',
    'app.footerUiBuild': 'UI-Build',
    'app.footerApiBuild': 'API',
    'app.baselinePrimaryShort': 'Standard',
    'app.openSentInvitations': 'Gesendete Einladungen',
    'app.sentInvitationsModalTitle': 'Einladungen, die ich gesendet habe',
    'app.sentInvitationsEmpty': 'Noch keine Einladungen erstellt.',
    'app.sentInvitationsRole': 'Rolle',
    'app.sentInvitationsStatus': 'Status',
    'app.inviteStatusPending': 'Ausstehend (Link)',
    'app.inviteStatusAccepted': 'Angenommen',
    'app.inviteStatusRevoked': 'Zurückgezogen',
    'app.inviteStatusExpired': 'Abgelaufen',
    'app.renameBaseline': 'Budget umbenennen',
    'app.renameBaselineModalTitle': 'Budget umbenennen',
    'app.renameBaselineFailed': 'Speichern fehlgeschlagen.',
    'app.save': 'Speichern',
    'app.setAsDefaultBaseline': 'Als Standard-Budget',
    'app.nav.budgets': 'Budgets',
    'app.nav.actuals': 'Einnahmen & Ausgaben',
    'app.nav.income': 'Einnahmen',
    'app.nav.expenses': 'Ausgaben',
    'app.sectionHelp': 'Hilfe',
    'app.openHelp': 'Anleitung & Ablauf',
    'app.sectionAccount': 'Konto',
    'app.logout': 'Abmelden und neu anmelden',

    'help.title': 'Hilfe: Bereiche und typischer Ablauf',
    'help.intro':
      'Kurzüberblick über die Hauptseiten von MyBudget und wie du sie in der Praxis nutzt. Details zu Istbuchungen (Filtern, Bearbeiten, Konten) findest du im Abschnitt zu Einnahmen und Ausgaben.',
    'help.toolbarTitle': 'Kopfzeile: Budget und Jahr',
    'help.toolbarBody':
      'Wähle die Baseline (euer Budget-Arbeitsbereich) und das Kalenderjahr. Über das Benutzer-Menü (Symbol rechts oben) erreichst du Sprache, neue Baselines, Ableiten und Umbenennen, Standard-Budget, Einladungen annehmen oder senden sowie diese Hilfeseite.',
    'help.dashboardTitle': 'Dashboard',
    'help.dashboardBody':
      'Diagramme zu Ist-Einnahmen, Ist-Ausgaben und Ausgaben nach Kategorie für das gewählte Jahr. Optional vergleichst du zwei Baselines.',
    'help.budgetTitle': 'Budget-Seite (Navigation „Budgets")',
    'help.budgetBody':
      'Hier pflegst du Positionen und die geplanten Monatsbeträge für das gewählte Jahr. Zeilen sind nach Kategorie gruppiert. Über „Bearbeiten" oder einen Zeilenklick öffnest du Rhythmus, Zeitraum, Vorlagebetrag und Kategorie; wiederkehrende Monate kannst du auf die Vorlage zurücksetzen. Monatszellen bearbeitest du direkt in der Tabelle (Einnahmen positiv, Ausgaben negativ); Änderungen speichern sich automatisch.',
    'help.actualsTitle': 'Einnahmen und Ausgaben (Ist)',
    'help.actualsBody':
      'Hier siehst und pflegst du Ist-Buchungen. Die Liste ist nach Buchungsdatum absteigend (neueste Einträge oben). Oben wählst du den Zeitraum; im Feld „Suche“ filterst du nach Position, Kategorie, Konto und Notiz — Betragsbedingungen wie „> 100“ sind ebenfalls möglich. Die Trefferanzahl steht unter der Tabelle.\n\nNeue Buchung: Mit „Position hinzufügen“ erscheint eine neue Zeile ganz oben in der Tabelle.\n\nBearbeiten: Mit Rolle Editor oder Owner klickst du eine Zeile. Es ist nur eine Zeile im Bearbeitungsmodus; beim Verlassen eines Feldes wird gespeichert, wenn sich etwas geändert hat.\n\nKonten und Saldo: Buche Einnahmen auf das Konto, auf dem das Geld ankommt. Ausgaben auf das Konto, von dem bezahlt wurde — so bleiben Kontostände nachvollziehbar.',
    'help.accountsTitle': 'Konten',
    'help.accountsBody':
      'Bank- und Bargeldkonten mit Anfangssaldo. Istbuchungen unter „Einnahmen & Ausgaben“ aktualisieren den angezeigten aktuellen Saldo.',
    'help.sharingTitle': 'Teilen und Rollen',
    'help.sharingBody':
      'Nur der Owner kann andere einladen. Editor dürfen Budget und Istbuchungen ändern; Viewer lesen mit. Einladungen erzeugst und verwaltest du im Benutzer-Menü (Freigaben, gesendete Einladungen).',
    'help.workflowTitle': 'Typischer Ablauf',
    'help.workflowBody':
      '1) Baseline und Jahr wählen.\n2) Unter „Budgets" Kategorien und Positionen anlegen und den Monatsplan pflegen.\n3) Konten unter „Konten" prüfen oder anlegen.\n4) Ist-Zahlungen unter „Einnahmen & Ausgaben" erfassen und bei Bedarf in der Liste anpassen.\n5) Auswertung im „Dashboard" vergleichen.',

    'help.buildTitle': 'Versionen und Build-Zeitpunkte',
    'help.buildIntro':
      'Die Zeitpunkte beziehen sich auf den jeweiligen Build (Kompilierung bzw. Web-Build), nicht auf den Start des Servers oder Containers.',
    'help.uiVersionLabel': 'Web-Oberfläche (Version)',
    'help.uiBuildLabel': 'Web-Oberfläche (Build)',
    'help.apiVersionLabel': 'API (Version)',
    'help.apiBuildLabel': 'API (Build)',
    'help.apiBuildUnknown': 'Kein Zeitstempel in der Assembly hinterlegt.',
    'help.apiBuildUnavailable': 'API-Build-Informationen konnten nicht geladen werden (Netzwerk oder Konfiguration).',

    'sample.baseline.exampleHousehold': 'Beispielhaushalt',
    'sample.positions.netSalary': 'Nettogehalt',
    'sample.positions.summerBonus': 'Urlaubsgeld',
    'sample.positions.winterBonus': 'Weihnachtsgeld',
    'sample.positions.otherIncome': 'Sonstige Einnahmen',
    'sample.positions.rent': 'Miete',
    'sample.positions.utilities': 'Strom, Gas, Wasser',
    'sample.positions.mobilePlan': 'Handy & Mobilfunk',
    'sample.positions.groceries': 'Lebensmitteleinkauf',
    'sample.positions.carInsurance': 'Kfz-Versicherung',
    'sample.positions.fuel': 'Tanken / Laden',
    'sample.positions.streaming': 'Streaming & Apps',
    'sample.positions.newspaper': 'Zeitung',
    'sample.positions.gym': 'Fitnessstudio',
    'sample.positions.diningOut': 'Auswärts essen',
    'sample.positions.pets': 'Haustiere',
    'sample.positions.parking': 'Parken',
    'sample.positions.emergencyFund': 'Notgroschen / Sparrate',
    'sample.positions.vacation': 'Urlaub & Reisen',
    'sample.positions.christmasGifts': 'Weihnachten & Geschenke',
    'sample.positions.birthdayGifts': 'Geburtstage & Geschenke',
    'sample.positions.clothes': 'Kleidung & Schuhe',
    'sample.notes.salary': 'Gehaltszahlung',
    'sample.notes.rent': 'Mietzahlung',
    'sample.notes.utilities': 'Abschlag Nebenkosten',
    'sample.notes.mobilePlan': 'Mobilfunk-Rechnung',
    'sample.notes.groceries': 'Supermarkt',
    'sample.notes.fuel': 'Tankstelle',
    'sample.notes.streaming': 'Abo-Abbuchung',
    'sample.notes.newspaper': 'Zeitungsabo',
    'sample.notes.gym': 'Mitgliedsbeitrag',
    'sample.notes.diningOut': 'Restaurant',
    'sample.notes.pets': 'Futter, Tierarzt',
    'sample.notes.parking': 'Parkgebühr',
    'sample.notes.savingsTransfer': 'Überweisung Sparvertrag',
    'sample.notes.insuranceQuarter': 'Versicherung (Quartal)',
    'sample.notes.summerBonus': 'Urlaubsgeld',
    'sample.notes.winterBonus': 'Weihnachtsgeld',
    'sample.notes.otherIncome': 'Kleine Zusatzeinnahme',
    'sample.notes.taxRefund': 'Steuererstattung',
    'sample.notes.vacation': 'Urlaub / Reise',
    'sample.notes.vacationSnacks': 'Urlaub vor Ort',
    'sample.notes.christmasGifts': 'Weihnachtsgeschenke',
    'sample.notes.christmasMarket': 'Weihnachtsmarkt',
    'sample.notes.birthdayGifts': 'Geburtstagsgeschenke',
    'sample.notes.clothes': 'Bekleidung',
    'sample.notes.clothesSeason': 'Saison / Schulanfang',

    'spendings.pageTitle.income': 'Einnahmen (Ist)',
    'spendings.pageTitle.expense': 'Ausgaben (Ist)',
    'spendings.pageTitle.all': 'Einnahmen & Ausgaben (Ist)',

    'budget.title': 'Budget-Positionen',
    'budget.tab.positions': 'Positionen',
    'budget.tab.actuals': 'Einnahmen/Ausgaben',
    'budget.subtitle':
      'Zeilen sind Positionen (in der Tabelle nur der Name), nach Kategorie als Abschnitte gruppiert. Monatsspalten sind das konkrete Jahr. Einmalige Positionen (ohne Rhythmus): „Bearbeiten“ oder Zeilenklick öffnet eine kompakte Bearbeitungszeile (Kategorie, Standardbetrag, Zeitraum); „Erweitert“ öffnet den vollen Dialog inkl. Rhythmus und Raster-Übernahme. Wiederkehrende Positionen: „Bearbeiten“ öffnet diesen Dialog direkt. Monatsbeträge änderst du direkt in der Tabelle. Einnahmen (+), Ausgaben (−). Änderungen werden gespeichert.',
    'budget.helpAria': 'Hilfe zur Budget-Tabelle',
    'budget.openNewPositionSheet': 'Position anlegen',
    'budget.newPositionSheetTitle': 'Neue Budget-Position',
    'budget.editPositionSheetTitle': 'Position bearbeiten',
    'budget.saveChanges': 'Speichern',
    'budget.barEdit': 'Bearbeiten',
    'budget.editRowHint': 'Rhythmus, Zeitraum, Vorlagebetrag, Kategorie und Raster-Optionen (Dialog)',
    'budget.editRowHintSimple': 'Kategorie, Standardbetrag und Zeitraum (kompakt unter der Zeile)',
    'budget.advancedEdit': 'Erweitert',
    'budget.advancedEditHint': 'Vollständiger Dialog: Rhythmus, geplante Monate anpassen, Vorlage auf Jahr anwenden',
    'budget.inlineEditTitle': 'Kurz bearbeiten',
    'budget.inlineEditHint': 'Für Rhythmus oder Vorlage aufs Jahr anwenden: Schließen und „Erweitert“ wählen.',
    'budget.ruleBasedRowHint': 'Vorlagezeile (Rhythmus) — Zeilenklick öffnet den Dialog',
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
    'budget.actualTitle': 'Einnahmen & Ausgaben (Ist)',
    'budget.actualSubtitle':
      'Geplante Beträge pflegst du unter „Budgets"; Ist-Einnahmen und Ist-Ausgaben erfasst du unter „Einnahmen & Ausgaben".',
    'budget.pickPositionForEntry': 'Budget-Position für diese Buchung',
    'budget.selectAccount': 'Konto auswählen',
    'budget.accountColumn': 'Konto',
    'budget.actualsNoPositions':
      'Noch keine Budget-Positionen. Lege zuerst Zeilen unter „Budget“ im Register „Positionen“ an — sie erscheinen hier gruppiert nach Kategorie.',
    'budget.actualsNoAccounts':
      'Noch kein Buchungskonto. Beim nächsten Laden legt der Server bei Bedarf Standardkonten an (z. B. Girokonto, Bausparer, Bargeld, Sparschwein) — bitte Seite neu laden.',
    'budget.amountPlaceholder': 'Betrag',
    'budget.notePlaceholder': 'Notiz',
    'budget.addActual': 'Position hinzufügen',
    'budget.date': 'Datum',
    'budget.note': 'Notiz',
    'budget.spendingsFilterPeriod': 'Zeitraum',
    'budget.spendingsPresetCurrentMonth': 'Aktueller Monat',
    'budget.spendingsPresetPrevMonth': 'Vormonat',
    'budget.spendingsPresetCurrentYear': 'Laufendes Jahr',
    'budget.spendingsPresetLastYear': 'Letztes Jahr',
    'budget.spendingsPresetAll': 'Gesamter Zeitraum',
    'budget.spendingsSearchLabel': 'Suche',
    'budget.spendingsSearchPlaceholder': 'Position, Konto, Notiz … (Betrag z. B. > 100)',
    'budget.spendingsAmountFilterPlaceholder': 'Betrag, z. B. > 1000 < 2000',
    'budget.spendingsAmountFilterHint': 'Operatoren: >, >=, <, <= — mehrere kombinierbar (z. B. > 100 < 500).',
    'budget.ledgerSearchChipRemoveAria': 'Filter entfernen',
    'budget.spendingsLoadingEntries': 'Buchungen werden geladen …',
    'budget.spendingsLoadMore': 'Weitere laden …',
    'budget.spendingsEndOfList': 'Alle Treffer geladen.',
    'budget.spendingsEmpty': 'Keine Buchungen für die aktuellen Filter.',
    'budget.spendingsTotalCount': '{count} Buchungen',
    'budget.spendingsSumLabel': 'Summe',
    'budget.spendingsSumPartialHint':
      'Nur bereits geladene Buchungen. „Weitere laden“ bis zum Listenende, um die vollständige Summe zu sehen.',
    'budget.addEntrySheetClose': 'Schließen',
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
    'category.pets': 'Haustiere',
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
    'dashboard.comparisonTotal': 'Summe (Jahr)',
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
    'msg.addActualSuccess': 'Eintrag wurde hinzugefügt.',
    'msg.addActualFailed': 'Eintrag konnte nicht hinzugefügt werden.',
    'msg.addActualNeedPosition': 'Bitte eine Budget-Position auswählen.',
    'msg.addActualNeedAmount': 'Bitte einen von null verschiedenen Betrag eingeben.',
    'msg.actualIncomeMustBePositive': 'Einnahmen müssen einen positiven Betrag haben.',
    'msg.actualExpenseMustBeNegative': 'Ausgaben müssen einen negativen Betrag haben (mit Minus).',
    'msg.addActualNeedAccount': 'Bitte ein Konto auswählen.',
    'msg.addActualNeedDate': 'Bitte ein Buchungsdatum angeben.',
    'msg.updateActualSuccess': 'Änderungen wurden gespeichert.',
    'msg.updateActualFailed': 'Änderungen konnten nicht gespeichert werden.',
    'msg.loadBudgetFailed': 'Budgetdaten konnten nicht geladen werden.',
    'msg.createCategoryFailed': 'Kategorie konnte nicht erstellt werden.',
    'msg.selectBaselineFirst': 'Bitte zuerst eine Baseline auswählen oder anlegen.',
    'msg.enterPositionAndCategory': 'Bitte Positionsname und Kategorie ausfüllen.',
    'msg.confirmCreateCategory':
      'Neue Kategorie "{name}" wirklich anlegen? Es könnte auch ein Tippfehler bei einem bestehenden Namen sein.',

    'accounts.title': 'Konten',
    'accounts.subtitle':
      'Bankkonten, Bargeld usw. mit Anfangssaldo. Buchungen unter „Einnahmen & Ausgaben“ aktualisieren den jeweiligen Kontostand.',
    'accounts.namePlaceholder': 'Name (z. B. Girokonto)',
    'accounts.typePlaceholder': 'Art (optional, z. B. Bank, Bargeld)',
    'accounts.initialBalance': 'Anfangssaldo',
    'accounts.currentBalance': 'Aktueller Saldo',
    'accounts.name': 'Name',
    'accounts.type': 'Art',
    'accounts.actions': 'Aktionen',
    'accounts.add': 'Konto anlegen',
    'accounts.empty': 'Noch keine Konten. Mit „Konto anlegen“ eine neue Zeile öffnen.',
    'accounts.nameRequired': 'Bitte einen Kontonamen eingeben.',
    'accounts.loadFailed': 'Konten konnten nicht geladen werden.',
    'accounts.createSuccess': 'Konto wurde angelegt.',
    'accounts.createFailed': 'Konto konnte nicht angelegt werden.',
    'accounts.createConflict': 'Ein Konto mit diesem Namen existiert bereits.',
    'accounts.updateSuccess': 'Konto wurde gespeichert.',
    'accounts.updateFailed': 'Konto konnte nicht gespeichert werden.',
    'accounts.updateConflict': 'Ein anderes Konto hat bereits diesen Namen.',
    'accounts.deleteSuccess': 'Konto wurde gelöscht.',
    'accounts.deleteFailed': 'Konto konnte nicht gelöscht werden.',
    'accounts.deleteConflict': 'Konto hat noch Buchungen und kann nicht gelöscht werden.',
    'accounts.confirmDelete': 'Dieses Konto wirklich löschen?',

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
    'app.spendings': 'Expenses',
    'app.accounts': 'Accounts',
    'app.dashboard': 'Dashboard',
    'app.language': 'Language',
    'app.lang.de': 'German',
    'app.lang.en': 'English',
    'app.userMenuAria': 'Account and settings',
    'app.yearLabel': 'Year',
    'app.sectionBaseline': 'Budget workspace',
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
    'app.sharingInvitations': 'Invitations (this budget)',
    'app.sharingRevoke': 'Revoke',
    'app.sharingRemove': 'Remove',
    'app.sharingLoadFailed': 'Could not load sharing details.',
    'app.sharingUntil': 'until',
    'app.sharingCopyFailed': 'Could not copy token.',
    'app.buildVersionAria': 'Application version and build timestamps',
    'app.footerUiBuild': 'UI build',
    'app.footerApiBuild': 'API',
    'app.baselinePrimaryShort': 'default',
    'app.openSentInvitations': 'Invitations I sent',
    'app.sentInvitationsModalTitle': 'Invitations you sent',
    'app.sentInvitationsEmpty': 'You have not created any invitations yet.',
    'app.sentInvitationsRole': 'Role',
    'app.sentInvitationsStatus': 'Status',
    'app.inviteStatusPending': 'Pending (link)',
    'app.inviteStatusAccepted': 'Accepted',
    'app.inviteStatusRevoked': 'Revoked',
    'app.inviteStatusExpired': 'Expired',
    'app.renameBaseline': 'Rename budget',
    'app.renameBaselineModalTitle': 'Rename budget',
    'app.renameBaselineFailed': 'Could not save the new name.',
    'app.save': 'Save',
    'app.setAsDefaultBaseline': 'Set as default workspace',
    'app.nav.budgets': 'Budgets',
    'app.nav.actuals': 'Income & spending',
    'app.nav.income': 'Income',
    'app.nav.expenses': 'Expenses',
    'app.sectionHelp': 'Help',
    'app.openHelp': 'Guide & workflow',
    'app.sectionAccount': 'Account',
    'app.logout': 'Log out and sign in again',

    'help.title': 'Help: areas and a typical workflow',
    'help.intro':
      'Overview of the main pages in MyBudget and how they fit together. For actual entries (filters, editing, accounts), see the Income & spending section below.',
    'help.toolbarTitle': 'Header: workspace and year',
    'help.toolbarBody':
      'Pick the baseline (your budget workspace) and the calendar year. The user menu (icon top right) opens language, creating and forking baselines, rename and default workspace, accepting or sending invitations, and this help page.',
    'help.dashboardTitle': 'Dashboard',
    'help.dashboardBody':
      'Charts for actual income, actual spending, and spending by category for the selected year. You can compare two baselines.',
    'help.budgetTitle': 'Budget page (Budgets in the nav)',
    'help.budgetBody':
      'Maintain positions and planned month amounts for the selected year. Rows are grouped by category. Use Edit or row click to change cadence, date range, template amount, and category; recurring months can be reset to the template. Edit month cells directly in the grid (income positive, spending negative); changes autosave.',
    'help.actualsTitle': 'Income and expenses (actual)',
    'help.actualsBody':
      'View and maintain actual bookings. The list is sorted by booking date with the newest rows at the top. Pick a period above; use Search to match position, category, account, and note — amount predicates like > 100 work too. The hit count appears below the table.\n\nNew entry: Add entry opens a new row at the top of the table.\n\nEditing: with Editor or Owner, click a row. Only one row is editable at a time; leaving a field saves when something changed.\n\nAccounts: book income to the account that receives the money; book spending to the account you pay from so balances stay meaningful.',
    'help.accountsTitle': 'Accounts',
    'help.accountsBody':
      'Bank and cash accounts with an opening balance. Actual entries under Income & spending update the displayed current balance.',
    'help.sharingTitle': 'Sharing and roles',
    'help.sharingBody':
      'Only the owner can invite others. Editors may change the budget and actual entries; viewers are read-only. Create and manage invitations from the user menu (sharing, invitations you sent).',
    'help.workflowTitle': 'Typical workflow',
    'help.workflowBody':
      '1) Choose baseline and year.\n2) Under Budgets, set up categories and positions and fill the monthly plan.\n3) Under Accounts, review or create accounts.\n4) Under Income & spending, capture actual payments and adjust them in the list if needed.\n5) Compare results on the Dashboard.',

    'help.buildTitle': 'Versions and build timestamps',
    'help.buildIntro':
      'Timestamps refer to each component’s build (compile or web bundle), not to when the server or container last started.',
    'help.uiVersionLabel': 'Web UI (version)',
    'help.uiBuildLabel': 'Web UI (build)',
    'help.apiVersionLabel': 'API (version)',
    'help.apiBuildLabel': 'API (build)',
    'help.apiBuildUnknown': 'No timestamp was embedded in the API assembly.',
    'help.apiBuildUnavailable': 'Could not load API build information (network or configuration).',

    'sample.baseline.exampleHousehold': 'Example household',
    'sample.positions.netSalary': 'Net salary',
    'sample.positions.summerBonus': 'Holiday pay',
    'sample.positions.winterBonus': 'Christmas bonus',
    'sample.positions.otherIncome': 'Other income',
    'sample.positions.rent': 'Rent',
    'sample.positions.utilities': 'Electric, gas & water',
    'sample.positions.mobilePlan': 'Mobile phone plan',
    'sample.positions.groceries': 'Groceries',
    'sample.positions.carInsurance': 'Car insurance',
    'sample.positions.fuel': 'Fuel / charging',
    'sample.positions.streaming': 'Streaming & apps',
    'sample.positions.newspaper': 'Newspaper',
    'sample.positions.gym': 'Gym',
    'sample.positions.diningOut': 'Dining out',
    'sample.positions.pets': 'Pets',
    'sample.positions.parking': 'Parking',
    'sample.positions.emergencyFund': 'Emergency fund',
    'sample.positions.vacation': 'Vacation & travel',
    'sample.positions.christmasGifts': 'Christmas & gifts',
    'sample.positions.birthdayGifts': 'Birthdays & gifts',
    'sample.positions.clothes': 'Clothes & shoes',
    'sample.notes.salary': 'Salary payment',
    'sample.notes.rent': 'Rent payment',
    'sample.notes.utilities': 'Utility bill',
    'sample.notes.mobilePlan': 'Mobile bill',
    'sample.notes.groceries': 'Supermarket',
    'sample.notes.fuel': 'Fuel purchase',
    'sample.notes.streaming': 'Subscription charge',
    'sample.notes.newspaper': 'Newspaper subscription',
    'sample.notes.gym': 'Membership fee',
    'sample.notes.diningOut': 'Restaurant',
    'sample.notes.pets': 'Pet food / vet',
    'sample.notes.parking': 'Parking fee',
    'sample.notes.savingsTransfer': 'Transfer to savings',
    'sample.notes.insuranceQuarter': 'Insurance (quarterly)',
    'sample.notes.summerBonus': 'Holiday pay',
    'sample.notes.winterBonus': 'Christmas bonus',
    'sample.notes.otherIncome': 'Small extra income',
    'sample.notes.taxRefund': 'Tax refund',
    'sample.notes.vacation': 'Holiday / travel',
    'sample.notes.vacationSnacks': 'Holiday spending',
    'sample.notes.christmasGifts': 'Christmas gifts',
    'sample.notes.christmasMarket': 'Christmas market',
    'sample.notes.birthdayGifts': 'Birthday gifts',
    'sample.notes.clothes': 'Clothing',
    'sample.notes.clothesSeason': 'Season / back-to-school',

    'spendings.pageTitle.income': 'Income (actual)',
    'spendings.pageTitle.expense': 'Expenses (actual)',
    'spendings.pageTitle.all': 'Income & spending (actual)',

    'budget.title': 'Budget positions',
    'budget.tab.positions': 'Positions',
    'budget.tab.actuals': 'Spendings',
    'budget.subtitle':
      'Each row is a position (only the name appears in the grid), grouped under category section headers. Month columns are the selected year. One-off lines (no cadence): “Edit” or row click opens a compact row under the line (category, default amount, date range); “Advanced” opens the full dialog including cadence and planned-cell options. Recurring lines: “Edit” opens that dialog directly. Edit month amounts in the grid. Income (+), spending (−). Edits autosave.',
    'budget.helpAria': 'Help for the budget sheet',
    'budget.openNewPositionSheet': 'Add position',
    'budget.newPositionSheetTitle': 'New budget position',
    'budget.editPositionSheetTitle': 'Edit budget line',
    'budget.saveChanges': 'Save',
    'budget.barEdit': 'Edit',
    'budget.editRowHint': 'Cadence, date range, template amount, category, and planned-cell options (dialog)',
    'budget.editRowHintSimple': 'Category, default amount, and date range (compact row under the line)',
    'budget.advancedEdit': 'Advanced',
    'budget.advancedEditHint': 'Full dialog: cadence, how planned months follow changes, apply template to year',
    'budget.inlineEditTitle': 'Quick edit',
    'budget.inlineEditHint': 'For cadence or “apply template to year”, cancel and use “Advanced”.',
    'budget.ruleBasedRowHint': 'Template line (cadence) — row click opens the dialog',
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
    'budget.actualTitle': 'Income & spending (actual)',
    'budget.actualSubtitle':
      'Planned amounts live under Budgets; capture actual income and spending under Income & spending.',
    'budget.pickPositionForEntry': 'Budget line for this entry',
    'budget.selectAccount': 'Choose account',
    'budget.accountColumn': 'Account',
    'budget.actualsNoPositions':
      'No budget lines yet. Add rows under Budget → the Positions tab first — they will show up here grouped by category.',
    'budget.actualsNoAccounts':
      'No booking account yet. The server seeds default accounts when needed (e.g. Girokonto, Bausparer, Bargeld, Sparschwein) — try reloading the page.',
    'budget.amountPlaceholder': 'Amount',
    'budget.notePlaceholder': 'Note',
    'budget.addActual': 'Add entry',
    'budget.date': 'Date',
    'budget.note': 'Note',
    'budget.spendingsFilterPeriod': 'Period',
    'budget.spendingsPresetCurrentMonth': 'Current month',
    'budget.spendingsPresetPrevMonth': 'Previous month',
    'budget.spendingsPresetCurrentYear': 'Current year',
    'budget.spendingsPresetLastYear': 'Last year',
    'budget.spendingsPresetAll': 'All time',
    'budget.spendingsSearchLabel': 'Search',
    'budget.spendingsSearchPlaceholder': 'Position, account, note… (amount e.g. > 100)',
    'budget.spendingsAmountFilterPlaceholder': 'Amount, e.g. > 1000 < 2000',
    'budget.spendingsAmountFilterHint': 'Operators: >, >=, <, <= — combine several (e.g. > 100 < 500).',
    'budget.ledgerSearchChipRemoveAria': 'Remove filter',
    'budget.spendingsLoadingEntries': 'Loading entries…',
    'budget.spendingsLoadMore': 'Loading more…',
    'budget.spendingsEndOfList': 'All matching entries loaded.',
    'budget.spendingsEmpty': 'No entries match the current filters.',
    'budget.spendingsTotalCount': '{count} entries',
    'budget.spendingsSumLabel': 'Total',
    'budget.spendingsSumPartialHint':
      'Sum of loaded entries only. Use “Load more” until the end of the list for the full total.',
    'budget.addEntrySheetClose': 'Close',
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
    'category.pets': 'Pets',
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
    'dashboard.comparisonTotal': 'Year total',
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
    'msg.addActualSuccess': 'Entry added.',
    'msg.addActualFailed': 'Could not add entry.',
    'msg.addActualNeedPosition': 'Please choose a budget line.',
    'msg.addActualNeedAmount': 'Please enter a non-zero amount.',
    'msg.actualIncomeMustBePositive': 'Income bookings must use a positive amount.',
    'msg.actualExpenseMustBeNegative': 'Expense bookings must use a negative amount.',
    'msg.addActualNeedAccount': 'Please choose an account.',
    'msg.addActualNeedDate': 'Please set a booking date.',
    'msg.updateActualSuccess': 'Changes saved.',
    'msg.updateActualFailed': 'Could not save changes.',
    'msg.loadBudgetFailed': 'Could not load budget data.',
    'msg.createCategoryFailed': 'Could not create category.',
    'msg.selectBaselineFirst': 'Select or create a baseline first.',
    'msg.enterPositionAndCategory': 'Enter a position name and category.',
    'msg.confirmCreateCategory':
      'Create new category "{name}"? It might be a typo for an existing category name.',

    'accounts.title': 'Accounts',
    'accounts.subtitle':
      'Checking, cash, and similar accounts with an opening balance. Entries under Income & spending update each account balance.',
    'accounts.namePlaceholder': 'Name (e.g. checking)',
    'accounts.typePlaceholder': 'Type (optional, e.g. bank, cash)',
    'accounts.initialBalance': 'Opening balance',
    'accounts.currentBalance': 'Current balance',
    'accounts.name': 'Name',
    'accounts.type': 'Type',
    'accounts.actions': 'Actions',
    'accounts.add': 'Add account',
    'accounts.empty': 'No accounts yet. Use “Add account” to open a new row.',
    'accounts.nameRequired': 'Please enter an account name.',
    'accounts.loadFailed': 'Could not load accounts.',
    'accounts.createSuccess': 'Account created.',
    'accounts.createFailed': 'Could not create account.',
    'accounts.createConflict': 'An account with this name already exists.',
    'accounts.updateSuccess': 'Account saved.',
    'accounts.updateFailed': 'Could not save account.',
    'accounts.updateConflict': 'Another account already uses this name.',
    'accounts.deleteSuccess': 'Account deleted.',
    'accounts.deleteFailed': 'Could not delete account.',
    'accounts.deleteConflict': 'This account still has bookings and cannot be deleted.',
    'accounts.confirmDelete': 'Delete this account?',

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
   * Same as {@link formatAmount} but with an explicit sign: `+` for positive values,
   * `-` for negative; zero has no sign (locale rules).
   */
  formatSignedAmount(value: number): string {
    return new Intl.NumberFormat(this.numberLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero'
    }).format(value);
  }

  /** Compact axis/tooltip style label with explicit `+` / `-` for non-zero values. */
  compactSignedAmountLabel(value: number): string {
    if (value === 0 || !Number.isFinite(value)) {
      return this.formatSignedAmount(0);
    }
    const abs = Math.abs(value);
    const sign = value > 0 ? '+' : '-';
    if (abs >= 1_000_000) {
      return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1000) {
      return `${sign}${(abs / 1000).toFixed(2)}k`;
    }
    return this.formatSignedAmount(value);
  }

  /** Text color from signed amount (read-only cells, totals, chips). */
  signedAmountTextClass(amount: number): string {
    if (amount > 0) {
      return 'text-emerald-600';
    }
    if (amount < 0) {
      return 'text-rose-600';
    }
    return 'text-violet-900';
  }

  /** Background + text for budget grid amount cells. */
  signedAmountCellClass(amount: number): string {
    if (amount > 0) {
      return 'bg-emerald-50/80 text-emerald-800';
    }
    if (amount < 0) {
      return 'bg-rose-50/80 text-rose-800';
    }
    return 'bg-white text-violet-900';
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

  /** Resolves `sample.*` keys stored in the API (baseline name, position name, booking note). */
  translateSampleToken(token: string | null | undefined): string {
    if (!token) {
      return '';
    }
    void this.language();
    if (token.startsWith('sample.')) {
      return this.t(token);
    }
    return token;
  }

  /** Workspace name shown in the shell; supports legacy English demo title. */
  translateBaselineDisplayName(storedName: string): string {
    void this.language();
    if (storedName === 'Example household') {
      return this.t('sample.baseline.exampleHousehold');
    }
    return this.translateSampleToken(storedName);
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
