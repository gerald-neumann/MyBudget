namespace MyBudget.Api;

/// <summary>
/// Mirrors <c>frontend/my-budget-ui/src/app/core/i18n.service.ts</c> for <c>sample.*</c> tokens and
/// <c>CATEGORY_NAME_KEYS</c> so ledger search matches what the UI shows (substring on translated text),
/// not only the persisted key or English category name.
/// </summary>
internal static class LedgerSearchSampleLocalization
{
    /// <summary>Lowercased invariant display strings (DE, EN) per <c>sample.*</c> key.</summary>
    private static readonly Dictionary<string, string[]> SampleTokenDisplayTexts = new(StringComparer.Ordinal)
    {
        ["sample.positions.netSalary"] = T("nettogehalt", "net salary"),
        ["sample.positions.summerBonus"] = T("urlaubsgeld", "holiday pay"),
        ["sample.positions.winterBonus"] = T("weihnachtsgeld", "christmas bonus"),
        ["sample.positions.otherIncome"] = T("sonstige einnahmen", "other income"),
        ["sample.positions.rent"] = T("miete", "rent"),
        ["sample.positions.utilities"] = T("strom, gas, wasser", "electric, gas & water"),
        ["sample.positions.mobilePlan"] = T("handy & mobilfunk", "mobile phone plan"),
        ["sample.positions.groceries"] = T("lebensmitteleinkauf", "groceries"),
        ["sample.positions.carInsurance"] = T("kfz-versicherung", "car insurance"),
        ["sample.positions.fuel"] = T("tanken / laden", "fuel / charging"),
        ["sample.positions.streaming"] = T("streaming & apps", "streaming & apps"),
        ["sample.positions.newspaper"] = T("zeitung", "newspaper"),
        ["sample.positions.gym"] = T("fitnessstudio", "gym"),
        ["sample.positions.diningOut"] = T("auswärts essen", "dining out"),
        ["sample.positions.pets"] = T("haustiere", "pets"),
        ["sample.positions.parking"] = T("parken", "parking"),
        ["sample.positions.emergencyFund"] = T("notgroschen / sparrate", "emergency fund"),
        ["sample.positions.vacation"] = T("urlaub & reisen", "vacation & travel"),
        ["sample.positions.christmasGifts"] = T("weihnachten & geschenke", "christmas & gifts"),
        ["sample.positions.birthdayGifts"] = T("geburtstage & geschenke", "birthdays & gifts"),
        ["sample.positions.clothes"] = T("kleidung & schuhe", "clothes & shoes"),
        ["sample.notes.salary"] = T("gehaltszahlung", "salary payment"),
        ["sample.notes.rent"] = T("mietzahlung", "rent payment"),
        ["sample.notes.utilities"] = T("abschlag nebenkosten", "utility bill"),
        ["sample.notes.mobilePlan"] = T("mobilfunk-rechnung", "mobile bill"),
        ["sample.notes.groceries"] = T("supermarkt", "supermarket"),
        ["sample.notes.fuel"] = T("tankstelle", "fuel purchase"),
        ["sample.notes.streaming"] = T("abo-abbuchung", "subscription charge"),
        ["sample.notes.newspaper"] = T("zeitungsabo", "newspaper subscription"),
        ["sample.notes.gym"] = T("mitgliedsbeitrag", "membership fee"),
        ["sample.notes.diningOut"] = T("restaurant", "restaurant"),
        ["sample.notes.pets"] = T("futter, tierarzt", "pet food / vet"),
        ["sample.notes.parking"] = T("parkgebühr", "parking fee"),
        ["sample.notes.savingsTransfer"] = T("überweisung sparvertrag", "transfer to savings"),
        ["sample.notes.insuranceQuarter"] = T("versicherung (quartal)", "insurance (quarterly)"),
        ["sample.notes.summerBonus"] = T("urlaubsgeld", "holiday pay"),
        ["sample.notes.winterBonus"] = T("weihnachtsgeld", "christmas bonus"),
        ["sample.notes.otherIncome"] = T("kleine zusatzeinnahme", "small extra income"),
        ["sample.notes.taxRefund"] = T("steuererstattung", "tax refund"),
        ["sample.notes.vacation"] = T("urlaub / reise", "holiday / travel"),
        ["sample.notes.vacationSnacks"] = T("urlaub vor ort", "holiday spending"),
        ["sample.notes.christmasGifts"] = T("weihnachtsgeschenke", "christmas gifts"),
        ["sample.notes.christmasMarket"] = T("weihnachtsmarkt", "christmas market"),
        ["sample.notes.birthdayGifts"] = T("geburtstagsgeschenke", "birthday gifts"),
        ["sample.notes.clothes"] = T("bekleidung", "clothing"),
        ["sample.notes.clothesSeason"] = T("saison / schulanfang", "season / back-to-school")
    };

    /// <summary>Canonical category <see cref="Category.Name"/> as stored in the DB → lowercased DE, EN labels.</summary>
    private static readonly Dictionary<string, string[]> CategoryStoredNameTexts = new(StringComparer.Ordinal)
    {
        ["Income"] = T("einkommen", "income"),
        ["Income inflow"] = T("einkommen (zusatz)", "income inflow"),
        ["Housing"] = T("wohnen", "housing"),
        ["Utilities"] = T("nebenkosten & verträge", "utilities"),
        ["Food & groceries"] = T("lebensmittel", "food & groceries"),
        ["Transport"] = T("mobilität", "transport"),
        ["Insurance"] = T("versicherungen", "insurance"),
        ["Health"] = T("gesundheit", "health"),
        ["Subscriptions"] = T("abos", "subscriptions"),
        ["Pets"] = T("haustiere", "pets"),
        ["Savings & investments"] = T("sparen & anlegen", "savings & investments"),
        ["Discretionary / fun"] = T("freizeit", "discretionary / fun"),
        ["One-off / large purchases"] = T("sonderausgaben & anschaffungen", "one-off / large purchases")
    };

    private static string[] T(string deLower, string enLower) => [deLower, enLower];

    /// <summary>Returns <c>sample.*</c> keys whose localized labels contain <paramref name="term"/>.</summary>
    public static List<string> SampleKeysWithDisplayTextContaining(string term)
    {
        if (string.IsNullOrEmpty(term))
        {
            return [];
        }

        var hits = new List<string>();
        foreach (var (key, texts) in SampleTokenDisplayTexts)
        {
            if (texts.Any(t => t.Contains(term, StringComparison.Ordinal)))
            {
                hits.Add(key);
            }
        }

        return hits;
    }

    /// <summary>Returns persisted category names whose localized labels contain <paramref name="term"/>.</summary>
    public static List<string> CategoryStoredNamesWithDisplayTextContaining(string term)
    {
        if (string.IsNullOrEmpty(term))
        {
            return [];
        }

        var hits = new List<string>();
        foreach (var (storedName, texts) in CategoryStoredNameTexts)
        {
            if (texts.Any(t => t.Contains(term, StringComparison.Ordinal)))
            {
                hits.Add(storedName);
            }
        }

        return hits;
    }
}
