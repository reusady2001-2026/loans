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

   'pctBase' is honoured in the rental section (it reads the running subtotal,
   so line ORDER is the formula), 'pctEGI' in expense/reserve (it reads the
   underwritten EGI), 'perUnit' anywhere; anything else is a pass-through.
   The in-place column always sums the `t12` actuals, whatever the method.

   Sections: 'rental' → Effective Rental Income, 'other' → Other Income,
             'expense' → Operating Expenses, 'reserve' → Replacement Reserves.
   Tests: node test/underwriting.test.js (hand-derived figures, to the cent).
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Underwriting = api;
  if (typeof globalThis !== "undefined") globalThis.Underwriting = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Coerce to a number, tolerating the ways money and rates arrive as text from
  // form inputs / spreadsheet cells: "96", "1,200", "$3.5", "1e5", an accounting
  // negative "(1,200)" or "1,200-" → -1200, and "5%" → 0.05. parse() yields NaN
  // for anything non-numeric so sizeLoan can tell "blank" from "zero"; n()
  // collapses that to 0 for arithmetic.
  var parse = function (v) {
    if (typeof v === "string") {
      var s = v.trim(), neg = /\(.*\)|-\s*$/.test(s), pct = s.indexOf("%") >= 0;
      // A plain decimal / scientific literal (once separators, $, % and the
      // accounting wrapper — parens / trailing minus, whose sign is re-applied
      // below — are dropped) goes through Number(), so "1e5", "(1e5)" and
      // "1e5-" read as ±100000 where the strip-to-digits fallback would give
      // 15. Gating on the literal shape, rather than on isFinite(Number(c)),
      // keeps "" (Number → 0, but blank must stay "missing") and "0x10" (→ 16)
      // out; the fallback still handles stray currency text exactly as before.
      var c = s.replace(/[,$\s%()]/g, "").replace(/-$/, ""), x;
      if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(c)) x = Number(c);
      else x = parseFloat(s.replace(/[^0-9.\-]/g, ""));
      if (neg) x = -Math.abs(x);
      if (pct) x = x / 100;
      return x;
    }
    return typeof v === "number" ? v : NaN;
  };
  var n = function (v) { var x = parse(v); return isFinite(x) ? x : 0; };

  // ---- NOI build-up: in-place (T12) and underwritten, side by side ---------
  function computeNOI(ws) {
    ws = ws || {};
    // units null / blank / negative → 0, so every $/unit line prices to 0 rather
    // than throwing or going negative; a worksheet with no lines is just zeros.
    var units = Math.max(0, n(ws.units));
    var lines = Array.isArray(ws.lines) ? ws.lines.filter(function (l) { return l && typeof l === "object"; }) : [];
    var uw = {};                       // computed underwritten value per line key
    var perUnit = function (ln) { return n(ln.param) * units; };

    // Rental section — ORDER MATTERS: a pctBase line prices off the running
    // subtotal of the lines ABOVE it (deductions carried negative, as on the
    // statement). SetupBuilder lays the block out GPR, EMPL, MOD, VAC(pctBase),
    // CONC, BD, so   vacancy = -vacancyPct × (GPR + EMPL + MOD)   and the
    // concessions / bad-debt actuals below it never shrink the vacancy base.
    var eri = 0;
    lines.forEach(function (ln) {
      if (ln.section !== "rental") return;
      var v = ln.method === "pctBase" ? -n(ln.param) * eri
            : ln.method === "perUnit" ? perUnit(ln)
            :                           n(ln.uw);
      uw[ln.key] = v; eri += v;
    });

    // Other income — pass-through (or $/unit).
    var otherInc = 0;
    lines.forEach(function (ln) {
      if (ln.section !== "other") return;
      var v = ln.method === "perUnit" ? perUnit(ln) : n(ln.uw);
      uw[ln.key] = v; otherInc += v;
    });

    var egi = eri + otherInc;

    // Expenses and reserves: $/unit, % of EGI (management fee, PILOT tax — read
    // the UNDERWRITTEN EGI just computed), or the pass-through actual.
    var opex = 0, reserves = 0;
    lines.forEach(function (ln) {
      if (ln.section !== "expense" && ln.section !== "reserve") return;
      var v = ln.method === "perUnit" ? perUnit(ln)
            : ln.method === "pctEGI"  ? n(ln.param) * egi
            :                           n(ln.uw);
      uw[ln.key] = v;
      if (ln.section === "expense") opex += v; else reserves += v;
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
  // Annual mortgage constant = 12 × the monthly payment per $1 of principal,
  //   r / (1 − (1 + r)^−N)   with r = rate/12 and N = amortization months.
  // A zero / blank / negative amortization means interest-only (constant =
  // the rate); a very long amortization collapses to the same thing, which is
  // how life-co / CMBS loans in this model are sized. A 0% note amortizes
  // straight-line (12/N). Never returns NaN or ±Infinity.
  function mortgageConstant(rate, amortYears) {
    rate = n(rate);
    var months = Math.round(n(amortYears) * 12), r = rate / 12;
    if (!(months > 0)) return rate;
    if (r === 0) return 12 / months;
    var f = r / (1 - Math.pow(1 + r, -months));
    return isFinite(f) ? f * 12 : rate;
  }

  // sizeLoan(noi, { capRate, ltvMax, dscrMin, dyMin, intRate, amortYears, interestOnly? })
  //   value    = NOI / capRate
  //   loanLTV  = value × ltvMax
  //   loanDSCR = NOI / (dscrMin × mortgageConstant)
  //   loanDY   = NOI / dyMin
  //   maxLoan  = the smallest applicable leg; binding = its name.
  // Contract: `maxLoan` is ALWAYS a finite number (0 when nothing can be sized);
  // anything that cannot be computed is null — never NaN / ±Infinity — so the
  // UI's `> 0` / `!= null` guards and SetupBuilder.sizingSummary's sums stay
  // honest (a negative NOI used to produce a NEGATIVE max loan that summed into
  // the portfolio total). A leg is inapplicable (null, left out of the MIN) when
  // NOI <= 0, or its divisor is not positive (cap rate / DSCR floor / DY floor
  // of 0, or a 0 debt constant = no debt service to cover). A missing, blank or
  // non-numeric parameter falls back to DEFAULTS (a blanked form field must not
  // silently zero the loan); an explicit 0 is honoured. amortYears 0 or
  // interestOnly:true sizes interest-only. A whole benchmarks object (with a
  // nested `sizing`) is accepted too.
  var SIZING_KEYS = ["capRate", "ltvMax", "dscrMin", "dyMin", "intRate", "amortYears"];
  function sizeLoan(noi, p) {
    p = (p && typeof p === "object") ? p : {};
    if (p.sizing && typeof p.sizing === "object" && !SIZING_KEYS.some(function (k) { return p[k] != null; })) p = p.sizing;
    var P = function (k) { var x = parse(p[k]); return isFinite(x) ? x : DEFAULTS[k]; };
    var fin = function (x) { return (typeof x === "number" && isFinite(x)) ? x : null; };
    var capRate = P("capRate"), ltvMax = P("ltvMax"), dscrMin = P("dscrMin"), dyMin = P("dyMin"), intRate = P("intRate");
    var amortYears = p.interestOnly === true ? 0 : P("amortYears");
    var mc = mortgageConstant(intRate, amortYears);
    noi = n(noi);
    var ok = noi > 0;
    // Deliberate change from the released engine: an explicit capRate 0 makes
    // value null and the LTV leg inapplicable (the old engine returned value 0
    // and hence max loan 0), consistent with dscrMin 0 / dyMin 0 disabling theirs.
    var value    = fin(ok && capRate > 0 ? noi / capRate : null);
    var loanLTV  = fin(value != null && ltvMax >= 0 ? value * ltvMax : null);
    var loanDSCR = fin(ok && dscrMin > 0 && mc > 0 ? noi / (dscrMin * mc) : null);
    var loanDY   = fin(ok && dyMin > 0 ? noi / dyMin : null);
    // Strict `<` keeps the first leg on an exact tie: Debt Yield, then LTV, then
    // DSCR — the same precedence the original MIN/=== chain had.
    var maxLoan = 0, binding = null;
    [["Debt Yield", loanDY], ["LTV", loanLTV], ["DSCR", loanDSCR]].forEach(function (leg) {
      if (leg[1] != null && (binding === null || leg[1] < maxLoan)) { maxLoan = leg[1]; binding = leg[0]; }
    });
    // fin() again: a positive but microscopic max loan (absurd ltvMax / rate)
    // would otherwise push a ratio to Infinity.
    var sized = maxLoan > 0;
    return {
      value: value, mortgageConstant: mc,
      loanLTV: loanLTV, loanDSCR: loanDSCR, loanDY: loanDY, maxLoan: maxLoan, binding: binding,
      impliedLTV:       fin(sized && value > 0 ? maxLoan / value : null),
      impliedDSCR:      fin(sized && mc > 0    ? noi / (maxLoan * mc) : null),
      impliedDebtYield: fin(sized              ? noi / maxLoan : null),
      // the parameters actually used, after defaults filled the blanks
      params: { capRate: capRate, ltvMax: ltvMax, dscrMin: dscrMin, dyMin: dyMin, intRate: intRate, amortYears: amortYears }
    };
  }

  // Standard sizing assumptions and the standard underwriting benchmarks —
  // the defaults the model starts from; overridden per property.
  var DEFAULTS = {
    capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30,
    vacancyPct: 0.05, mgmtFeePct: 0.025, reservePerUnit: 200
  };
  // The same numbers in the operating contract's Assumptions shape (§2: mgmtPct
  // + a nested sizing block) so DEFAULTS can be handed straight to
  // SetupBuilder.buildSetup as `benchmarks`; mgmtFeePct stays for existing callers.
  DEFAULTS.mgmtPct = DEFAULTS.mgmtFeePct;
  DEFAULTS.sizing = { capRate: DEFAULTS.capRate, ltvMax: DEFAULTS.ltvMax, dscrMin: DEFAULTS.dscrMin,
                      dyMin: DEFAULTS.dyMin, intRate: DEFAULTS.intRate, amortYears: DEFAULTS.amortYears };
  // Load-bearing (it is the blank-parameter fallback), so frozen: a stray
  // `Underwriting.DEFAULTS.ltvMax = 0.5` must not silently re-size every blank
  // box. Consumers only read it (operating-calc.js clones what it needs).
  Object.freeze(DEFAULTS.sizing); Object.freeze(DEFAULTS);

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
