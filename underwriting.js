/* ============================================================================
   Underwriting & Debt-Sizing engine  —  pure, data-free, and testable.

   This is the "Excel model" as code: it takes a property's operating lines
   (in-place T12 actuals) plus a small set of underwriting benchmarks, and
   produces (a) an in-place NOI and an underwritten NOI side by side, and
   (b) the maximum supportable loan as the binding minimum of the LTV, DSCR
   and debt-yield tests. It contains NO property data — the app and the test
   supply the numbers.

   A worksheet is an ordered list of lines. Each line carries an in-place
   value (`t12`) and, for pass-through lines, an underwritten value (`uw`).
   Rule-based lines compute their underwritten value from a benchmark `param`:

     method 'value'   → uw = line.uw                      (pass-through / actual)
     method 'pctBase' → uw = -param × (running rental subtotal above the line)
                                                           (vacancy, concessions, bad debt)
     method 'pctEGI'  → uw =  param × EGI                  (management fee, PILOT tax)
     method 'perUnit' → uw =  param × units               (budget expenses, reserves)

   Sections: 'rental' → Effective Rental Income, 'other' → Other Income,
             'expense' → Operating Expenses, 'reserve' → Replacement Reserves.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Underwriting = api;
  if (typeof globalThis !== "undefined") globalThis.Underwriting = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Coerce to a finite number, tolerating numeric strings ("96", "1,200", "$3.5")
  // — form inputs and some spreadsheet cells arrive as text.
  var n = function (v) {
    if (typeof v === "string") v = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return typeof v === "number" && isFinite(v) ? v : 0;
  };

  // ---- NOI build-up: in-place (T12) and underwritten, side by side ---------
  function computeNOI(ws) {
    var units = n(ws.units), lines = ws.lines || [];
    var uw = {};                       // computed underwritten value per line key

    // Rental section — order matters: pctBase lines read the running subtotal.
    var eri = 0;
    lines.forEach(function (ln) {
      if (ln.section !== "rental") return;
      var v = (ln.method === "pctBase") ? -n(ln.param) * eri : n(ln.uw);
      uw[ln.key] = v; eri += v;
    });

    // Other income — pass-through.
    var otherInc = 0;
    lines.forEach(function (ln) {
      if (ln.section !== "other") return;
      var v = n(ln.uw); uw[ln.key] = v; otherInc += v;
    });

    var egi = eri + otherInc;

    // Expenses (mgmt fee & PILOT tax read EGI) and reserves.
    var opex = 0, reserves = 0;
    lines.forEach(function (ln) {
      if (ln.section === "expense") {
        var v = ln.method === "perUnit" ? n(ln.param) * units
              : ln.method === "pctEGI"  ? n(ln.param) * egi
              :                            n(ln.uw);
        uw[ln.key] = v; opex += v;
      } else if (ln.section === "reserve") {
        var r = ln.method === "perUnit" ? n(ln.param) * units : n(ln.uw);
        uw[ln.key] = r; reserves += r;
      }
    });

    var noi = egi - opex - reserves;

    // In-place (T12) column — every line at its actual value.
    var tE = 0, tO = 0, tX = 0, tR = 0;
    lines.forEach(function (ln) {
      var t = n(ln.t12);
      if (ln.section === "rental") tE += t;
      else if (ln.section === "other") tO += t;
      else if (ln.section === "expense") tX += t;
      else if (ln.section === "reserve") tR += t;
    });

    return {
      units: units,
      underwritten: { eri: eri, otherIncome: otherInc, egi: egi, opex: opex, reserves: reserves, noi: noi, lines: uw },
      inPlace:      { eri: tE,  otherIncome: tO,       egi: tE + tO, opex: tX, reserves: tR, noi: tE + tO - tX - tR }
    };
  }

  // ---- Debt sizing: max supportable loan = MIN(LTV, DSCR, Debt Yield) ------
  // Annual mortgage constant. With a very long amortization the constant
  // collapses to the interest rate (interest-only), which is how life-co /
  // CMBS loans in this model are sized.
  function mortgageConstant(rate, amortYears) {
    var r = n(rate) / 12, months = Math.round(n(amortYears) * 12);
    if (!months) return n(rate);
    if (r === 0) return 1 / n(amortYears);
    return (r / (1 - Math.pow(1 + r, -months))) * 12;
  }

  function sizeLoan(noi, p) {
    noi = n(noi);
    var value  = n(p.capRate) > 0 ? noi / n(p.capRate) : 0;
    var mc     = mortgageConstant(p.intRate, p.amortYears);
    var loanLTV  = value * n(p.ltvMax);
    var loanDSCR = (n(p.dscrMin) > 0 && mc > 0) ? noi / (n(p.dscrMin) * mc) : 0;
    var loanDY   = n(p.dyMin) > 0 ? noi / n(p.dyMin) : 0;
    var maxLoan  = Math.min(loanLTV, loanDSCR, loanDY);
    var binding  = maxLoan === loanDY ? "Debt Yield" : maxLoan === loanLTV ? "LTV" : "DSCR";
    return {
      value: value, mortgageConstant: mc,
      loanLTV: loanLTV, loanDSCR: loanDSCR, loanDY: loanDY, maxLoan: maxLoan, binding: binding,
      impliedLTV:       value > 0   ? maxLoan / value       : null,
      impliedDSCR:      maxLoan > 0 && mc > 0 ? noi / (maxLoan * mc) : null,
      impliedDebtYield: maxLoan > 0 ? noi / maxLoan         : null
    };
  }

  // Standard sizing assumptions and the standard underwriting benchmarks —
  // the defaults the model starts from; overridden per property.
  var DEFAULTS = {
    capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30,
    vacancyPct: 0.05, mgmtFeePct: 0.025, reservePerUnit: 200
  };

  // A blank standard worksheet (no values) — the empty machine the app renders.
  function blankWorksheet() {
    var L = function (key, label, section, method, param) {
      return { key: key, label: label, section: section, method: method || "value",
               param: (param == null ? null : param), t12: null, uw: null };
    };
    return {
      units: null,
      lines: [
        L("gpr",        "Gross Potential Rent",      "rental",  "value"),
        L("empDisc",    "Less: Employee Discounts",  "rental",  "value"),
        L("modelUnits", "Less: Model Units",         "rental",  "value"),
        L("vacancy",    "Less: Vacancy Loss",        "rental",  "pctBase", DEFAULTS.vacancyPct),
        L("concessions","Less: Concessions",         "rental",  "pctBase", 0),
        L("badDebt",    "Less: Bad Debt",            "rental",  "pctBase", 0),
        L("otherInc",   "Other Income",              "other",   "value"),
        L("taxes",      "Real Estate Taxes",         "expense", "value"),
        L("insurance",  "Insurance",                 "expense", "perUnit", null),
        L("utilities",  "Utilities",                 "expense", "value"),
        L("ga",         "General & Admin",           "expense", "perUnit", null),
        L("marketing",  "Marketing",                 "expense", "perUnit", null),
        L("payroll",    "Payroll",                   "expense", "perUnit", null),
        L("rm",         "Repairs & Maintenance",     "expense", "perUnit", null),
        L("contract",   "Contract Services",         "expense", "perUnit", null),
        L("mgmt",       "Management Fee",            "expense", "pctEGI",  DEFAULTS.mgmtFeePct),
        L("reserves",   "Replacement Reserves",      "reserve", "perUnit", DEFAULTS.reservePerUnit)
      ]
    };
  }

  return {
    computeNOI: computeNOI,
    sizeLoan: sizeLoan,
    mortgageConstant: mortgageConstant,
    blankWorksheet: blankWorksheet,
    DEFAULTS: DEFAULTS
  };
});
