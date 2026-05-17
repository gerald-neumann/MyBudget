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
    'app.title': 'My Budget',
    'app.newBaselinePlaceholder': 'Name für neuen Haushalt',
    'app.newBaselineModalTitle': 'Neuer Haushalt',
    'app.newBaselineCreate': 'Anlegen',
    'app.cancel': 'Abbrechen',
    'app.addBaseline': 'Haushalt hinzufügen',
    'app.forkSelected': 'Ausgewählten Haushalt kopieren',
    'app.budgetSheet': 'Budget-Tabelle',
    'app.budget': 'Budget',
    'app.spendings': 'Ausgaben',
    'app.accounts': 'Konten',
    'app.dashboard': 'Dashboard',
    'app.shellLoading': 'Haushalt wird geladen …',
    'app.language': 'Sprache',
    'app.lang.de': 'Deutsch',
    'app.lang.en': 'Englisch',
    'app.theme': 'Farbschema',
    'app.theme.default': 'Standard (Violett)',
    'app.theme.linen': 'Warmes Creme',
    'app.theme.denim': 'Denim-Blau',
    'app.theme.rose': 'Rosig',
    'app.theme.evergreen': 'Evergreen (Creme + Grün)',
    'app.userMenuAria': 'Konto und Einstellungen',
    'app.workspaceMenuAria': 'Haushalte anlegen und verwalten',
    'app.accessMenuAria': 'Teilen, Einladungen, Beitritt',
    'app.loginTokenValidity': 'Anmeldung (Token)',
    'app.yearLabel': 'Jahr',
    'app.sectionBaseline': 'Haushalt',
    'app.sectionJoinInvite': 'Einladung annehmen',
    'app.invitationTokenPlaceholder': 'Einladungs-Token',
    'app.joinBaseline': 'Haushalt beitreten',
    'app.openSharing': 'Freigaben & Mitarbeit',
    'app.sharingModalTitle': 'Haushalt teilen',
    'app.sharingNotOwner': 'Nur der Besitzer des ausgewählten Haushalts kann Freigaben verwalten.',
    'app.sharingNoBaseline': 'Bitte zuerst einen Haushalt auswählen.',
    'app.sharingShareAs': 'Teilen als',
    'app.sharingRoleViewer': 'Betrachter (lesen)',
    'app.sharingRoleEditor': 'Bearbeiter (schreiben)',
    'app.sharingCreateInvite': 'Einladungs-Token erstellen',
    'app.sharingCopyToken': 'Token kopieren',
    'app.sharingMembers': 'Mitglieder',
    'app.sharingPendingInvites': 'Ausstehende Einladungen',
    'app.sharingInvitations': 'Einladungen (dieser Haushalt)',
    'app.sharingRevoke': 'Zurückziehen',
    'app.sharingRemove': 'Entfernen',
    'app.sharingLoadFailed': 'Freigaben konnten nicht geladen werden.',
    'app.sharingUntil': 'bis',
    'app.sharingCopyFailed': 'Token konnte nicht kopiert werden.',
    'app.buildVersionAria': 'Anwendungsversion und Build-Zeitpunkte',
    'app.openAppInfo': 'Info',
    'app.appInfoModalTitle': 'Version und Build',
    'app.copyVersionDetails': 'Details kopieren',
    'app.close': 'Schließen',
    'app.versionInfoCopyFailed': 'In die Zwischenablage kopieren ist fehlgeschlagen.',
    'app.footerUiBuild': 'UI-Build',
    'app.footerApiBuild': 'API',
    'app.baselinePrimaryShort': 'Standard',
    'app.baselineAccessOwner': 'Besitzer',
    'app.baselineAccessViewer': 'Betrachter',
    'app.baselineAccessEditor': 'Bearbeiter',
    'app.openSentInvitations': 'Gesendete Einladungen',
    'app.sentInvitationsModalTitle': 'Einladungen, die ich gesendet habe',
    'app.sentInvitationsEmpty': 'Noch keine Einladungen erstellt.',
    'app.sentInvitationsRole': 'Rolle',
    'app.sentInvitationsStatus': 'Status',
    'app.inviteStatusPending': 'Ausstehend (Link)',
    'app.inviteStatusAccepted': 'Angenommen',
    'app.inviteStatusRevoked': 'Zurückgezogen',
    'app.inviteStatusExpired': 'Abgelaufen',
    'app.renameBaseline': 'Haushalt umbenennen',
    'app.readOnlyBadge': 'Nur lesen',
    'app.sampleWatermark': 'Beispiel',
    'app.renameBaselineModalTitle': 'Haushalt umbenennen',
    'app.renameBaselineFailed': 'Speichern fehlgeschlagen.',
    'app.deleteBaseline': 'Haushalt löschen',
    'app.confirmDeleteBaseline': 'Haushalt "{name}" wirklich löschen?',
    'app.deleteBaselineFailed': 'Haushalt konnte nicht gelöscht werden.',
    'app.save': 'Speichern',
    'app.setAsDefaultBaseline': 'Als Standard-Haushalt',
    'app.nav.budgets': 'Budgets',
    'app.nav.actuals': 'Einnahmen & Ausgaben',
    'app.nav.income': 'Einnahmen',
    'app.nav.expenses': 'Ausgaben',
    'app.sectionHelp': 'Hilfe',
    'app.openHelp': 'Anleitung & Ablauf',
    'app.sectionAccount': 'Konto',
    'app.logout': 'Abmelden und neu anmelden',
    'app.sessionExpiredTitle': 'Sitzung abgelaufen',
    'app.sessionExpiredBody':
      'Deine Anmeldung ist nicht mehr gültig oder wurde beendet. Bitte melde dich erneut an.',
    'app.sessionExpiredSignIn': 'Erneut anmelden',
    'app.mobileShellOpenMenuAria': 'Menü öffnen: Navigation, Arbeitsbereich und Einstellungen',
    'app.mobileShellPanelAria': 'Menü',
    'app.pageTools': 'Filter & Aktionen',

    'help.title': 'Hilfe: Bereiche und empfohlene Reihenfolge',
    'help.toolbarTitle': 'Kopfzeile: Haushalt',
    'help.toolbarBody':
      'Oben wählst du den Haushalt — darin liegen zusammen: Konten, Budgetplan und Istbuchungen. Drei Symbole rechts: Budgets (Haushalt anlegen, aus einem bestehenden für eine Variante kopieren, umbenennen, Standard), Zugriff (beitreten, teilen, gesendete Einladungen) und Konto (Sprache, Hilfe, Info zu Version und Build, Abmelden; mit Keycloak läuft dort ein Countdown zur Token-Gültigkeit). Das Kalenderjahr stellst du auf Dashboard, Budget- und Ist-Seite ein.',
    'help.shortcutsTitle': 'Tastenkürzel',
    'help.shortcutsAppendixTitle': 'Anhang',
    'help.shortcutsBody':
      'Plus (+), NumPad-Plus und Einfg (Insert)\nGleiche Aktion wie der violette Hinzufügen-Button auf Budget-, Konten- und Einnahmen-&-Ausgaben-Seite, sofern der Fokus nicht in einem Eingabefeld, einer Textarea oder einem Dialog liegt und keine Strg-, ⌘- oder Alt-Taste gedrückt ist.\n\nEnter\nBestätigt wie das grüne Häkchen: Zeilen auf Konten und Einnahmen & Ausgaben, Budget-Tabellenzellen und -dialoge, Hauptaktion in App-Dialogen. In einer Textarea kein Kurzbefehl; auf einem normalen Button löst Enter die Button-Aktion aus.\n\nEscape\nBricht ab oder schließt Zeilenbearbeitung, Budget-Blätter und Modale; wirkt auch, wenn ein Button fokussiert ist.',
    'help.dashboardTitle': 'Dashboard',
    'help.dashboardBody':
      'Wenn du Istbuchungen erfasst hast, zeigt das Dashboard die Auswertung: Diagramme zu Ist-Einnahmen, Ist-Ausgaben und Ausgaben nach Kategorie für das gewählte Jahr. Optional vergleichst du zwei Haushalte (z. B. Hauptplan und eine Variante).',
    'help.budgetTitle': 'Budget-Seite (Navigation „Budgets")',
    'help.budgetBody':
      'Hier definierst du Budget-Positionen und Regeln (Rhythmus, Zeitraum, Vorlagebetrag, Kategorie) sowie die geplanten Monatsbeträge für das gewählte Jahr. Jede Zeile ist eine Position (in der Tabelle siehst du nur den Namen), nach Kategorie gruppiert. Die Monatsspalten gelten für das gewählte Kalenderjahr. Über „Bearbeiten“ oder einen Zeilenklick öffnest du den Dialog für Rhythmus, Zeitraum, Vorlagebetrag, Kategorie und Optionen für geplante Zellen (Raster); wiederkehrende Monate kannst du auf die Vorlage zurücksetzen. Monatsbeträge und Positionsnamen einmaliger Zeilen bearbeitest du direkt in der Tabelle (Einnahmen positiv, Ausgaben negativ); Zelländerungen speichern sich automatisch.',
    'help.actualsTitle': 'Einnahmen und Ausgaben (Ist)',
    'help.actualsBody':
      'Hier siehst und pflegst du Ist-Buchungen. Die Liste ist nach Buchungsdatum absteigend (neueste Einträge oben). Oben wählst du den Zeitraum; im Feld „Suche“ filterst du nach Position, Kategorie, Konto und Notiz — Betragsbedingungen wie „> 100“ sind ebenfalls möglich. Die Trefferanzahl steht unter der Tabelle.\n\nNeue Buchung: Mit „Buchung hinzufügen“ erscheint eine neue Zeile ganz oben in der Tabelle. Betrag als positive Zahl eingeben; Einnahme oder Ausgabe ergibt sich aus der gewählten Position. Mit dem grünen Häkchen übernimmst du die Buchung.\n\nBearbeiten: Mit Rolle Bearbeiter oder Besitzer klickst du eine Zeile. Es ist nur eine Zeile im Bearbeitungsmodus; mit dem grünen Häkchen oder beim Verlassen eines Feldes wird gespeichert, wenn sich etwas geändert hat.\n\nKonten und Saldo: Buche Einnahmen auf das Konto, auf dem das Geld ankommt. Ausgaben auf das Konto, von dem bezahlt wurde — so bleiben Kontostände nachvollziehbar.',
    'help.accountsTitle': 'Konten',
    'help.accountsBody':
      'Lege zuerst Konten für jedes verwaltete „Topf“ an — typisch z. B. Girokonto, Bargeld oder Wallet, Sparkonto, Depot oder Fonds — jeweils mit Anfangssaldo. Istbuchungen unter „Einnahmen & Ausgaben“ aktualisieren den angezeigten aktuellen Saldo.',
    'help.sharingTitle': 'Teilen und Rollen',
    'help.sharingBody':
      'Nur der Besitzer kann andere einladen. Bearbeiter dürfen Budget und Istbuchungen ändern; Betrachter lesen mit. Einladungen erzeugst und verwaltest du über das Zugriff-Symbol (Freigaben, gesendete Einladungen).',
    'help.workflowTitle': 'Empfohlene Reihenfolge',
    'help.workflowBody':
      '1) Oben den Haushalt wählen; das Kalenderjahr auf Dashboard, Budget- und Ist-Seite passend einstellen.\n2) Unter „Konten" zuerst Konten anlegen — z. B. Bank, Bargeld/Wallet, Fonds/Depot — mit Anfangssaldo, damit Istbuchungen sinnvolle Zielkonten haben.\n3) Unter „Budgets" Kategorien und Positionen anlegen: Rhythmus und Zeitraum (Regeln) sowie den Monatsplan pflegen.\n4) Unter „Einnahmen & Ausgaben" Einnahmen und Ausgaben buchen und bei Bedarf in der Liste bearbeiten.\n5) Im „Dashboard" siehst du die Auswertung zu Ist und optional den Vergleich mit einem zweiten Haushalt.',

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
    'budget.openNewPositionSheet': 'Position anlegen',
    'budget.newPositionSheetTitle': 'Neue Budget-Position',
    'budget.editPositionSheetTitle': 'Position bearbeiten',
    'budget.saveChanges': 'Speichern',
    'budget.barEdit': 'Bearbeiten',
    'budget.editRowHint': 'Rhythmus, Zeitraum, Vorlagebetrag, Kategorie und Raster-Optionen (Dialog)',
    'budget.editBudgetRuleSheetTitle': 'Budget bearbeiten',
    'budget.editRule': 'Budgetregel bearbeiten',
    'budget.ruleBasedRowHint': 'Budgetregel bearbeiten',
    'budget.applyTemplateToYear': 'Vorlage auf Jahr anwenden',
    'budget.deselectRow': 'Auswahl aufheben',
    'budget.monthlySum': 'Monatssumme',
    'budget.runningCashflow': 'Kumuliert',
    'budget.liquidityTitle': 'Cashflow',
    'budget.liquidityHint': 'Täglicher Verlauf aus geplanten Budgetbeträgen über das gesamte Jahr.',
    'budget.liquidityExpand': 'Anzeigen',
    'budget.liquidityCollapse': 'Einklappen',
    'budget.liquidityZoomLabel': 'Ansicht',
    'budget.liquidityZoomCurrentMonth': 'Aktueller Monat',
    'budget.liquidityZoomYear': 'Ganzes Jahr',
    'budget.liquidityOpeningBalance': 'Jahresstart (Budget-Basis)',
    'budget.liquidityEndingBalance': 'Endsaldo',
    'budget.liquidityRunningBalance': 'Kontostand',
    'budget.liquidityDailyNet': 'Tagesfluss',
    'budget.liquidityLoading': 'Liquiditätsdaten werden geladen...',
    'budget.liquidityLoadFailed': 'Liquiditätsdaten konnten nicht geladen werden.',
    'budget.liquidityNoData': 'Keine Tagesdaten verfügbar.',
    'budget.liquidityNoDataHint': 'Trage geplante Beträge in der Tabelle oben ein — die Kurve aktualisiert sich beim Tippen.',
    'budget.liquidityTodayLabel': 'Heute',
    'budget.cashflowPrevMonth': 'Vorheriger Monat',
    'budget.cashflowNextMonth': 'Nächster Monat',
    'budget.cashflowZoomAria': 'Zoom',
    'budget.cashflowZoomIn': 'Vergrößern',
    'budget.cashflowZoomOut': 'Verkleinern',
    'budget.cashflowFocusMonth': 'Cashflow: {month}',
    'budget.defaultAmountLabel': 'Betrag',
    'budget.newPositionPlaceholder': 'Neuer Positionsname',
    'budget.categoryPlaceholder': 'Kategorie (bestehend oder neu)',
    'budget.add': 'Hinzufügen',
    'budget.validation.required': 'Pflichtfeld.',
    'budget.validation.invalidAmount': 'Bitte einen gültigen Betrag eingeben.',
    'budget.validation.endBeforeStart': 'Ende darf nicht vor Beginn liegen.',
    'budget.validation.plannedRange': 'Bitte gültigen Zeitraum wählen (Von und Bis, Von nicht nach Bis).',
    'budget.discardUnsavedEditConfirm': 'Ungespeicherte Änderungen verwerfen?',
    'budget.loading': 'Daten werden geladen...',
    'budget.position': 'Position',
    'budget.category': 'Kategorie',
    'budget.clearCategory': 'Kategorie leeren und alle Vorschläge anzeigen',
    'budget.total': 'Gesamt',
    'budget.action': 'Aktion',
    'budget.delete': 'Löschen',
    'budget.recurrence': 'Budgetregel',
    'budget.distributionMode': 'Verteilung',
    'budget.distributionModeExactDay': 'Am festen Tag',
    'budget.distributionModeEven': 'Über Monat verteilen',
    'budget.dayOfMonth': 'Tag im Monat',
    'budget.validFrom': 'Von',
    'budget.validTo': 'Bis',
    'budget.validOn': 'Am',
    'budget.plannedApplyLegend': 'Geplante Monate anpassen',
    'budget.plannedApplyAll': 'Alle betroffenen Monate (alle Jahre)',
    'budget.plannedApplyRange': 'Nur im Zeitraum',
    'budget.plannedApplyFrom': 'Von (Datum)',
    'budget.plannedApplyTo': 'Bis (Datum)',
    'budget.template': 'Vorlage',
    'budget.reapplyTemplate': 'Vorlage',
    'budget.savingCells': 'Zelländerungen werden gespeichert...',
    'budget.actualTitle': 'Einnahmen & Ausgaben (Ist)',
    'budget.pickPositionForEntry': 'Budget-Position für diese Buchung',
    'budget.selectAccount': 'Konto auswählen',
    'budget.accountColumn': 'Konto',
    'budget.actualsNoPositions':
      'Noch keine Budget-Positionen. Lege zuerst Zeilen unter „Budget“ im Register „Positionen“ an — sie erscheinen hier gruppiert nach Kategorie.',
    'budget.actualsNoAccounts':
      'Noch kein Buchungskonto. Beim nächsten Laden legt der Server bei Bedarf Standardkonten an (z. B. Girokonto, Bausparer, Bargeld, Sparschwein) — bitte Seite neu laden.',
    'budget.amountPlaceholder': 'Betrag',
    'budget.notePlaceholder': 'Notiz',
    'budget.addActual': 'Buchung hinzufügen',
    'budget.addActualIncome': 'Einnahme hinzufügen',
    'budget.addActualExpense': 'Ausgabe hinzufügen',
    'budget.confirmEntry': 'Übernehmen',
    'budget.date': 'Datum',
    'budget.note': 'Notiz',
    'budget.remainingThisMonth': 'Abweichung zu Budget',
    'budget.remainingThisMonthHint':
      'Momentane Abweichung im aktuellen Monat für diese Budget-Position (Momentaufnahme)',
    'budget.attachment': 'Beleg',
    'budget.attachmentOptional': 'Beleg (optional)',
    'budget.attachmentUpload': 'Beleg hochladen',
    'budget.attachmentReplace': 'Beleg ersetzen',
    'budget.attachmentDownload': 'Beleg herunterladen',
    'budget.attachmentRemove': 'Beleg entfernen',
    'budget.attachmentNone': 'Kein Beleg',
    'budget.attachmentHasFile': 'Beleg vorhanden',
    'budget.spendingsFilterPeriod': 'Zeitraum',
    'budget.spendingsFilterFlow': 'Art',
    'budget.spendingsFilterFlowAll': 'Einnahmen & Ausgaben',
    'budget.spendingsFilterFlowIncome': 'Einnahmen',
    'budget.spendingsFilterFlowExpense': 'Ausgaben',
    'budget.spendingsFilterCategory': 'Kategorie',
    'budget.spendingsFilterCategoryAll': 'Alle Kategorien',
    'budget.spendingsClearFilters': 'Filter zurücksetzen',
    'budget.spendingsFiltersShow': 'Filter anzeigen',
    'budget.spendingsFiltersHide': 'Filter ausblenden',
    'budget.spendingsYearAll': 'Alle Jahre',
    'budget.spendingsPresetCurrentMonth': 'Aktueller Monat',
    'budget.spendingsPresetPrevMonth': 'Vormonat',
    'budget.spendingsPresetMonth': 'Monat',
    'budget.spendingsFilterMonth': 'Monat',
    'budget.spendingsPresetCurrentYear': 'Laufendes Jahr',
    'budget.spendingsPresetLastYear': 'Letztes Jahr',
    'budget.spendingsPresetAll': 'Gesamter Zeitraum',
    'budget.spendingsSearchLabel': 'Suche',
    'budget.spendingsSearchPlaceholder': 'Position, Konto, Notiz … (Betrag z. B. > 100)',
    'budget.spendingsAmountFilterPlaceholder': 'Betrag, z. B. > 1000 < 2000',
    'budget.ledgerSearchChipRemoveAria': 'Filter entfernen',
    'budget.spendingsLoadingEntries': 'Buchungen werden geladen …',
    'budget.spendingsLoadMore': 'Weitere laden …',
    'budget.spendingsEndOfList': 'Alle Treffer geladen.',
    'budget.spendingsEmpty': 'Keine Buchungen für die aktuellen Filter.',
    'budget.spendingsTotalCount': '{count} Buchungen',
    'budget.spendingsSumLabel': 'Summe',
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
    'budget.none': 'Keine Budgetregel',
    'budget.monthly': 'Monatlich',
    'budget.yearly': 'Jährlich',
    'budget.everyNMonths': 'Alle n Monate',
    'budget.recurrenceIntervalMonths': 'Intervall (Monate)',
    'budget.validation.recurrenceInterval': 'Ganze Zahl zwischen 2 und 24.',
    'budget.validation.dayOfMonth': 'Ganze Zahl zwischen 1 und 31.',

    'dashboard.cashflowTitle': 'Einnahmen vs. Ausgaben (Ist)',
    'dashboard.cashflowIncome': 'Einnahmen (Ist)',
    'dashboard.cashflowSpending': 'Ausgaben (Ist)',
    'dashboard.cashflowNet': 'Saldo (Einnahmen − Ausgaben)',
    'dashboard.cashflowStackTitle': 'Ausgaben nach Kategorie (Ist)',
    'dashboard.cashflowOther': 'Sonstige',
    'dashboard.cashflowNoSpendData': 'Noch keine Ausgaben-Istbuchungen in diesem Jahr.',
    'dashboard.planActualTitle': 'Soll-Ist-Vergleich',
    'dashboard.planActualHint':
      'Ausgaben gesamt und je Budgetposition: geplanter Soll-Betrag gegen gebuchtes Ist pro Monat.',
    'dashboard.planActualTotals': 'Ausgaben gesamt',
    'dashboard.planActualByPosition': 'Nach Budgetposition',
    'dashboard.planActualNoPositions': 'Keine Positionen mit Soll- oder Ist-Beträgen in diesem Jahr.',
    'dashboard.planActualExpand': 'Monate einblenden',
    'dashboard.planActualCollapse': 'Monate ausblenden',
    'dashboard.position': 'Position',
    'dashboard.yearlyTitle': 'Jahressummen',
    'dashboard.categoryTitle': 'Verteilung nach Kategorien',
    'dashboard.comparisonTitle': 'Haushaltsvergleich',
    'dashboard.selectBaseline': 'Haushalt zum Vergleichen auswählen',
    'dashboard.compare': 'Vergleichen',
    'dashboard.month': 'Monat',
    'dashboard.selectedBaseline': 'Ausgewählter Haushalt',
    'dashboard.comparedBaseline': 'Verglichener Haushalt',
    'dashboard.delta': 'Differenz',
    'dashboard.comparisonTotal': 'Summe (Jahr)',
    'dashboard.loading': 'Diagrammdaten werden geladen...',
    'dashboard.chartsLoadError': 'Die Diagramme konnten nicht geladen werden. Bitte prüfe die API-Verbindung (localhost:5256) und lade die Seite neu.',
    'dashboard.planned': 'Geplant',
    'dashboard.actual': 'Ist',

    'msg.savePlannedFailed': 'Geplante Beträge konnten nicht gespeichert werden.',
    'msg.savePlannedSuccess': 'Geplante Beträge wurden gespeichert.',
    'msg.createPositionSuccess': 'Budget-Position wurde erstellt.',
    'msg.createPositionFailed': 'Budget-Position konnte nicht erstellt werden.',
    'msg.updateCategoryFailed': 'Kategorie konnte nicht aktualisiert werden.',
    'msg.deletePositionSuccess': 'Position wurde gelöscht.',
    'msg.deletePositionFailed': 'Position konnte nicht gelöscht werden.',
    'msg.updatePositionSuccess': 'Position wurde gespeichert.',
    'msg.updatePositionFailed': 'Position konnte nicht aktualisiert werden.',
    'msg.editPositionApplyRangeInvalid': 'Bitte gültigen Zeitraum wählen (Von und Bis, Von nicht nach Bis).',
    'msg.confirmReapplyRecurrence':
      'Monate laut Rhythmus auf den Vorlagebetrag setzen und manuelle Zellanpassungen für dieses Jahr entfernen?',
    'msg.reapplyRecurrenceFailed': 'Vorlage konnte nicht neu angewendet werden.',
    'msg.reapplyRecurrenceSuccess': 'Vorlage wurde angewendet.',
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
    'msg.deleteActualSuccess': 'Eintrag wurde gelöscht.',
    'msg.deleteActualFailed': 'Eintrag konnte nicht gelöscht werden.',
    'msg.attachmentUploadSuccess': 'Beleg wurde gespeichert.',
    'msg.attachmentUploadFailed': 'Beleg konnte nicht hochgeladen werden.',
    'msg.attachmentRemoveSuccess': 'Beleg wurde entfernt.',
    'msg.attachmentRemoveFailed': 'Beleg konnte nicht entfernt werden.',
    'msg.attachmentDownloadFailed': 'Beleg konnte nicht heruntergeladen werden.',
    'msg.loadBudgetFailed': 'Budgetdaten konnten nicht geladen werden.',
    'msg.createCategoryFailed': 'Kategorie konnte nicht erstellt werden.',
    'msg.selectBaselineFirst': 'Bitte zuerst einen Haushalt auswählen oder anlegen.',
    'msg.enterPositionAndCategory': 'Bitte Positionsname und Kategorie ausfüllen.',
    'msg.confirmCreateCategory':
      'Neue Kategorie "{name}" wirklich anlegen? Es könnte auch ein Tippfehler bei einem bestehenden Namen sein.',

    'accounts.title': 'Konten',
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
    'spendings.confirmDeleteEntry': 'Diesen Eintrag wirklich löschen?',

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
    'app.title': 'My Budget',
    'app.newBaselinePlaceholder': 'New household name',
    'app.newBaselineModalTitle': 'New household',
    'app.newBaselineCreate': 'Create',
    'app.cancel': 'Cancel',
    'app.addBaseline': 'Add household',
    'app.forkSelected': 'Copy selected household',
    'app.budgetSheet': 'Budget sheet',
    'app.budget': 'Budget',
    'app.spendings': 'Expenses',
    'app.accounts': 'Accounts',
    'app.dashboard': 'Dashboard',
    'app.shellLoading': 'Loading your household…',
    'app.language': 'Language',
    'app.lang.de': 'German',
    'app.lang.en': 'English',
    'app.theme': 'Color scheme',
    'app.theme.default': 'Default (violet)',
    'app.theme.linen': 'Warm linen',
    'app.theme.denim': 'Denim blue',
    'app.theme.rose': 'Rosy pink',
    'app.theme.evergreen': 'Evergreen (cream + green)',
    'app.userMenuAria': 'Account and settings',
    'app.workspaceMenuAria': 'Create and manage households',
    'app.accessMenuAria': 'Sharing, invites, and join',
    'app.loginTokenValidity': 'Sign-in (token)',
    'app.yearLabel': 'Year',
    'app.sectionBaseline': 'Household',
    'app.sectionJoinInvite': 'Accept invitation',
    'app.invitationTokenPlaceholder': 'Invitation token',
    'app.joinBaseline': 'Join household',
    'app.openSharing': 'Sharing & access',
    'app.sharingModalTitle': 'Share household',
    'app.sharingNotOwner': 'Only the owner of the selected household can manage sharing.',
    'app.sharingNoBaseline': 'Select a household first.',
    'app.sharingShareAs': 'Share as',
    'app.sharingRoleViewer': 'Viewer (read)',
    'app.sharingRoleEditor': 'Editor (write)',
    'app.sharingCreateInvite': 'Create invitation token',
    'app.sharingCopyToken': 'Copy token',
    'app.sharingMembers': 'Members',
    'app.sharingPendingInvites': 'Pending invitations',
    'app.sharingInvitations': 'Invitations (this household)',
    'app.sharingRevoke': 'Revoke',
    'app.sharingRemove': 'Remove',
    'app.sharingLoadFailed': 'Could not load sharing details.',
    'app.sharingUntil': 'until',
    'app.sharingCopyFailed': 'Could not copy token.',
    'app.buildVersionAria': 'Application version and build timestamps',
    'app.openAppInfo': 'Info',
    'app.appInfoModalTitle': 'Version & build',
    'app.copyVersionDetails': 'Copy details',
    'app.close': 'Close',
    'app.versionInfoCopyFailed': 'Could not copy to the clipboard.',
    'app.footerUiBuild': 'UI build',
    'app.footerApiBuild': 'API',
    'app.baselinePrimaryShort': 'default',
    'app.baselineAccessOwner': 'Owner',
    'app.baselineAccessViewer': 'Viewer',
    'app.baselineAccessEditor': 'Editor',
    'app.openSentInvitations': 'Invitations I sent',
    'app.sentInvitationsModalTitle': 'Invitations you sent',
    'app.sentInvitationsEmpty': 'You have not created any invitations yet.',
    'app.sentInvitationsRole': 'Role',
    'app.sentInvitationsStatus': 'Status',
    'app.inviteStatusPending': 'Pending (link)',
    'app.inviteStatusAccepted': 'Accepted',
    'app.inviteStatusRevoked': 'Revoked',
    'app.inviteStatusExpired': 'Expired',
    'app.renameBaseline': 'Rename household',
    'app.readOnlyBadge': 'Read only',
    'app.sampleWatermark': 'Sample',
    'app.renameBaselineModalTitle': 'Rename household',
    'app.renameBaselineFailed': 'Could not save the new name.',
    'app.deleteBaseline': 'Delete household',
    'app.confirmDeleteBaseline': 'Delete household "{name}"?',
    'app.deleteBaselineFailed': 'Could not delete household.',
    'app.save': 'Save',
    'app.setAsDefaultBaseline': 'Set as default household',
    'app.nav.budgets': 'Budgets',
    'app.nav.actuals': 'Income & spending',
    'app.nav.income': 'Income',
    'app.nav.expenses': 'Expenses',
    'app.sectionHelp': 'Help',
    'app.openHelp': 'Guide & workflow',
    'app.sectionAccount': 'Account',
    'app.logout': 'Log out and sign in again',
    'app.sessionExpiredTitle': 'Session expired',
    'app.sessionExpiredBody':
      'Your sign-in is no longer valid or has ended. Please sign in again.',
    'app.sessionExpiredSignIn': 'Sign in again',
    'app.mobileShellOpenMenuAria': 'Open menu: navigation, workspace, and settings',
    'app.mobileShellPanelAria': 'Menu',
    'app.pageTools': 'Filters & actions',

    'help.title': 'Help: areas and recommended order',
    'help.toolbarTitle': 'Header: household',
    'help.toolbarBody':
      'Pick your household at the top — each household groups accounts, the budget plan, and actual entries together. Three icons on the right: budgets (create a household, copy from an existing one to try a variant, rename, default), access (join with a token, sharing, invitations you sent), and account (language, help, version and build info, sign out; with Keycloak a live countdown shows access-token validity). Set the calendar year on Dashboard, Budget, or Income & spending.',
    'help.shortcutsTitle': 'Keyboard shortcuts',
    'help.shortcutsAppendixTitle': 'Appendix',
    'help.shortcutsBody':
      '+, numpad +, and Insert\nSame as the violet add control on Budget, Accounts, and Income & spending when focus is not in an input, textarea, or dialog, and Ctrl/Cmd/Alt are not held.\n\nEnter\nConfirms like the green check: table rows on Accounts and Income & spending, budget grid cells and dialogs, primary action in app modals. Not used as that row shortcut inside textareas; on a plain button, Enter activates that button.\n\nEscape\nCancels or closes row editing, budget sheets, and modals; works even when a button is focused.',
    'help.dashboardTitle': 'Dashboard',
    'help.dashboardBody':
      'After you record actual entries, the dashboard shows the picture: charts for actual income, actual spending, and spending by category for the selected year. You can compare two households (e.g. your main plan vs a trial budget).',
    'help.budgetTitle': 'Budget page (Budgets in the nav)',
    'help.budgetBody':
      'Define budget positions and rules (cadence, date range, template amount, category) plus planned month amounts for the selected year. Each row is a position (the grid shows only the name), grouped by category. Month columns are for the selected calendar year. Use Edit or row click to open the dialog for cadence, date range, template amount, category, and options for planned cells (grid); recurring months can be reset to the template. Edit month amounts and one-off position names directly in the grid (income positive, spending negative); cell changes autosave.',
    'help.actualsTitle': 'Income and expenses (actual)',
    'help.actualsBody':
      'View and maintain actual bookings. The list is sorted by booking date with the newest rows at the top. Pick a period above; use Search to match position, category, account, and note — amount predicates like > 100 work too. The hit count appears below the table.\n\nNew entry: Add entry opens a new row at the top. Enter a positive amount; income vs expense follows from the selected position. Confirm with the green check.\n\nEditing: with Editor or Owner, click a row. Only one row is editable at a time; use the green check or leave a field to save when something changed.\n\nAccounts: book income to the account that receives the money; book spending to the account you pay from so balances stay meaningful.',
    'help.accountsTitle': 'Accounts',
    'help.accountsBody':
      'Start by creating accounts for each pot you track — e.g. bank checking, cash or wallet, savings, brokerage or fund — each with an opening balance. Actual entries under Income & spending update the displayed current balance.',
    'help.sharingTitle': 'Sharing and roles',
    'help.sharingBody':
      'Only the owner can invite others. Editors may change the budget and actual entries; viewers are read-only. Create and manage invitations from the access menu (sharing, invitations you sent).',
    'help.workflowTitle': 'Recommended order',
    'help.workflowBody':
      '1) Pick your household at the top; set the calendar year on Dashboard, Budget, and Income & spending.\n2) Under Accounts, create accounts first — e.g. bank, wallet, fund — with opening balances so actual entries have meaningful target accounts.\n3) Under Budgets, add categories and positions: set cadence and date range (rules) and fill the monthly plan.\n4) Under Income & spending, record income and expenses and edit rows in the list when needed.\n5) On the Dashboard, see charts for actuals and optionally compare with a second household.',

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
    'budget.openNewPositionSheet': 'Add position',
    'budget.newPositionSheetTitle': 'New budget position',
    'budget.editPositionSheetTitle': 'Edit budget line',
    'budget.saveChanges': 'Save',
    'budget.barEdit': 'Edit',
    'budget.editRowHint': 'Cadence, date range, template amount, category, and planned-cell options (dialog)',
    'budget.editBudgetRuleSheetTitle': 'Edit budget rule',
    'budget.editRule': 'Edit budget rule',
    'budget.ruleBasedRowHint': 'Edit budget rule',
    'budget.applyTemplateToYear': 'Apply template to year',
    'budget.deselectRow': 'Deselect row',
    'budget.monthlySum': 'Monthly sum',
    'budget.runningCashflow': 'Running cashflow',
    'budget.liquidityTitle': 'Cashflow',
    'budget.liquidityHint': 'Daily curve from planned budget amounts across the whole year.',
    'budget.liquidityExpand': 'Show',
    'budget.liquidityCollapse': 'Collapse',
    'budget.liquidityZoomLabel': 'View',
    'budget.liquidityZoomCurrentMonth': 'Current month',
    'budget.liquidityZoomYear': 'Whole year',
    'budget.liquidityOpeningBalance': 'Year start (budget base)',
    'budget.liquidityEndingBalance': 'Ending balance',
    'budget.liquidityRunningBalance': 'Balance',
    'budget.liquidityDailyNet': 'Daily flow',
    'budget.liquidityLoading': 'Loading liquidity data...',
    'budget.liquidityLoadFailed': 'Could not load liquidity data.',
    'budget.liquidityNoData': 'No daily data available.',
    'budget.liquidityNoDataHint': 'Enter planned amounts in the table above — the curve updates as you type.',
    'budget.liquidityTodayLabel': 'Today',
    'budget.cashflowPrevMonth': 'Previous month',
    'budget.cashflowNextMonth': 'Next month',
    'budget.cashflowZoomAria': 'Zoom',
    'budget.cashflowZoomIn': 'Zoom in',
    'budget.cashflowZoomOut': 'Zoom out',
    'budget.cashflowFocusMonth': 'Cashflow: {month}',
    'budget.defaultAmountLabel': 'Amount',
    'budget.newPositionPlaceholder': 'New position name',
    'budget.categoryPlaceholder': 'Category (existing or new)',
    'budget.add': 'Add',
    'budget.validation.required': 'Required.',
    'budget.validation.invalidAmount': 'Enter a valid amount.',
    'budget.validation.endBeforeStart': 'End date cannot be before the start date.',
    'budget.validation.plannedRange': 'Enter a valid range (from and to; from must not be after to).',
    'budget.discardUnsavedEditConfirm': 'Discard unsaved changes?',
    'budget.loading': 'Loading data...',
    'budget.position': 'Position',
    'budget.category': 'Category',
    'budget.clearCategory': 'Clear category and show all suggestions',
    'budget.total': 'Total',
    'budget.action': 'Action',
    'budget.delete': 'Delete',
    'budget.recurrence': 'Budget rule',
    'budget.distributionMode': 'Distribution',
    'budget.distributionModeExactDay': 'Exact day of month',
    'budget.distributionModeEven': 'Evenly across month',
    'budget.dayOfMonth': 'Day of month',
    'budget.validFrom': 'From',
    'budget.validTo': 'To',
    'budget.validOn': 'On',
    'budget.plannedApplyLegend': 'Apply to planned months',
    'budget.plannedApplyAll': 'All matching months (all years)',
    'budget.plannedApplyRange': 'Only within a date range',
    'budget.plannedApplyFrom': 'From (date)',
    'budget.plannedApplyTo': 'To (date)',
    'budget.template': 'Template',
    'budget.reapplyTemplate': 'Template',
    'budget.savingCells': 'Saving cell updates...',
    'budget.actualTitle': 'Income & spending (actual)',
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
    'budget.addActualIncome': 'Add income',
    'budget.addActualExpense': 'Add expense',
    'budget.confirmEntry': 'Confirm',
    'budget.date': 'Date',
    'budget.note': 'Note',
    'budget.remainingThisMonth': 'Budget variance',
    'budget.remainingThisMonthHint': 'Current month budget delta for this position (point-in-time snapshot)',
    'budget.attachment': 'Receipt',
    'budget.attachmentOptional': 'Receipt (optional)',
    'budget.attachmentUpload': 'Upload receipt',
    'budget.attachmentReplace': 'Replace receipt',
    'budget.attachmentDownload': 'Download receipt',
    'budget.attachmentRemove': 'Remove receipt',
    'budget.attachmentNone': 'No receipt',
    'budget.attachmentHasFile': 'Receipt attached',
    'budget.spendingsFilterPeriod': 'Period',
    'budget.spendingsFilterFlow': 'Type',
    'budget.spendingsFilterFlowAll': 'Income & expenses',
    'budget.spendingsFilterFlowIncome': 'Income',
    'budget.spendingsFilterFlowExpense': 'Expenses',
    'budget.spendingsFilterCategory': 'Category',
    'budget.spendingsFilterCategoryAll': 'All categories',
    'budget.spendingsClearFilters': 'Clear filters',
    'budget.spendingsFiltersShow': 'Show filters',
    'budget.spendingsFiltersHide': 'Hide filters',
    'budget.spendingsYearAll': 'All years',
    'budget.spendingsPresetCurrentMonth': 'Current month',
    'budget.spendingsPresetPrevMonth': 'Previous month',
    'budget.spendingsPresetMonth': 'Month',
    'budget.spendingsFilterMonth': 'Month',
    'budget.spendingsPresetCurrentYear': 'Current year',
    'budget.spendingsPresetLastYear': 'Last year',
    'budget.spendingsPresetAll': 'All time',
    'budget.spendingsSearchLabel': 'Search',
    'budget.spendingsSearchPlaceholder': 'Position, account, note… (amount e.g. > 100)',
    'budget.spendingsAmountFilterPlaceholder': 'Amount, e.g. > 1000 < 2000',
    'budget.ledgerSearchChipRemoveAria': 'Remove filter',
    'budget.spendingsLoadingEntries': 'Loading entries…',
    'budget.spendingsLoadMore': 'Loading more…',
    'budget.spendingsEndOfList': 'All matching entries loaded.',
    'budget.spendingsEmpty': 'No entries match the current filters.',
    'budget.spendingsTotalCount': '{count} entries',
    'budget.spendingsSumLabel': 'Total',
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
    'budget.none': 'No budget rule',
    'budget.monthly': 'Monthly',
    'budget.yearly': 'Yearly',
    'budget.everyNMonths': 'Every n months',
    'budget.recurrenceIntervalMonths': 'Interval (months)',
    'budget.validation.recurrenceInterval': 'Use a whole number between 2 and 24.',
    'budget.validation.dayOfMonth': 'Use a whole number between 1 and 31.',

    'dashboard.cashflowTitle': 'Income vs spending (actual)',
    'dashboard.cashflowIncome': 'Income (actual)',
    'dashboard.cashflowSpending': 'Spending (actual)',
    'dashboard.cashflowNet': 'Balance (income − spending)',
    'dashboard.cashflowStackTitle': 'Spending by category (actual)',
    'dashboard.cashflowOther': 'Other',
    'dashboard.cashflowNoSpendData': 'No actual spending entries yet for this year.',
    'dashboard.planActualTitle': 'Plan vs actual',
    'dashboard.planActualHint':
      'Spending totals and per budget position: planned amount vs booked actuals for each month.',
    'dashboard.planActualTotals': 'Spending total',
    'dashboard.planActualByPosition': 'By budget position',
    'dashboard.planActualNoPositions': 'No positions with planned or actual amounts this year.',
    'dashboard.planActualExpand': 'Show months',
    'dashboard.planActualCollapse': 'Hide months',
    'dashboard.position': 'Position',
    'dashboard.yearlyTitle': 'Yearly totals',
    'dashboard.categoryTitle': 'Category distribution',
    'dashboard.comparisonTitle': 'Household comparison',
    'dashboard.selectBaseline': 'Select household to compare',
    'dashboard.compare': 'Compare',
    'dashboard.month': 'Month',
    'dashboard.selectedBaseline': 'Selected household',
    'dashboard.comparedBaseline': 'Compared household',
    'dashboard.delta': 'Delta',
    'dashboard.comparisonTotal': 'Year total',
    'dashboard.loading': 'Loading chart data...',
    'dashboard.chartsLoadError': 'The charts could not be loaded. Check the API (localhost:5256) and refresh the page.',
    'dashboard.planned': 'Planned',
    'dashboard.actual': 'Actual',

    'msg.savePlannedFailed': 'Could not save planned amount changes.',
    'msg.savePlannedSuccess': 'Planned amount changes saved.',
    'msg.createPositionSuccess': 'Budget position created.',
    'msg.createPositionFailed': 'Could not create budget position.',
    'msg.updateCategoryFailed': 'Could not update category.',
    'msg.deletePositionSuccess': 'Position deleted.',
    'msg.deletePositionFailed': 'Could not delete position.',
    'msg.updatePositionSuccess': 'Budget position saved.',
    'msg.updatePositionFailed': 'Could not update budget position.',
    'msg.editPositionApplyRangeInvalid': 'Please enter a valid range (from and to; from must not be after to).',
    'msg.confirmReapplyRecurrence':
      'Reset months covered by the cadence to the template amount and remove manual cell overrides for this year?',
    'msg.reapplyRecurrenceFailed': 'Could not reapply the recurrence template.',
    'msg.reapplyRecurrenceSuccess': 'Recurrence template applied.',
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
    'msg.deleteActualSuccess': 'Entry deleted.',
    'msg.deleteActualFailed': 'Could not delete entry.',
    'msg.attachmentUploadSuccess': 'Receipt saved.',
    'msg.attachmentUploadFailed': 'Could not upload receipt.',
    'msg.attachmentRemoveSuccess': 'Receipt removed.',
    'msg.attachmentRemoveFailed': 'Could not remove receipt.',
    'msg.attachmentDownloadFailed': 'Could not download receipt.',
    'msg.loadBudgetFailed': 'Could not load budget data.',
    'msg.createCategoryFailed': 'Could not create category.',
    'msg.selectBaselineFirst': 'Select or create a household first.',
    'msg.enterPositionAndCategory': 'Enter a position name and category.',
    'msg.confirmCreateCategory':
      'Create new category "{name}"? It might be a typo for an existing category name.',

    'accounts.title': 'Accounts',
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
    'spendings.confirmDeleteEntry': 'Delete this entry?',

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
      return `${sign}${this.formatCompactMagnitude(abs / 1_000_000)}M`;
    }
    if (abs >= 1000) {
      return `${sign}${this.formatCompactMagnitude(abs / 1000)}k`;
    }
    return this.formatSignedAmount(value);
  }

  /** Scaled value for compact chart axis labels (`1,50k`), locale-aware decimal separator. */
  private formatCompactMagnitude(value: number): string {
    return new Intl.NumberFormat(this.numberLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false
    }).format(value);
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

  /** Short UI label for baseline access (Owner / Viewer / Editor). */
  translateBaselineAccessKind(access: string | null | undefined): string {
    void this.language();
    switch (access) {
      case 'Owner':
        return this.t('app.baselineAccessOwner');
      case 'Viewer':
        return this.t('app.baselineAccessViewer');
      case 'Editor':
        return this.t('app.baselineAccessEditor');
      default:
        return access ?? '';
    }
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
