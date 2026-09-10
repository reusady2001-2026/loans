/* ============================================================================
   Operating calc — the derived math for a property's operating record (P2 of
   OPERATING-CONTRACT.md §4). One record per PROPERTY, shared by every loan on
   it, so the senior and its mezz always read the SAME NOI.

   No new financial logic: the record's lines become `categorySums` and go
   through SetupBuilder.buildSetup → Underwriting.computeNOI / sizeLoan exactly
   as the one-off Setup tab does today. What this module adds is only:
     derive()       the in-place and underwritten NOI (+ EGI/opex/sizing) for a
                    record under its EFFECTIVE assumptions (global ⊕ overrides)
     effectiveNOI() the NOI the ratios run on — in-place, or null with no lines
     perLoan()      DSCR / debt yield / value / LTV per loan on the property
     stack()        the same ratios on the COMBINED position (senior + mezz)
   Ratios mirror the app's loanDSCR / loanDebtYield / loanLTV / combinedPosition
   (index.html) to the letter — null, never NaN or Infinity, whenever NOI is not
   positive or the denominator is not — so the operating model can never
   disagree with the loan view, and the UI's "—" rendering keeps working.
   Depends on setup-builder.js (+ underwriting.js). Never touches the loans
   store and never mutates a record or a loan.
   ========================================================================== */
(function (root, factory) {
  var api = factory(
    (typeof require === "function") ? require("./setup-builder.js") : root.SetupBuilder,
    (typeof require === "function") ? require("./underwriting.js") : root.Underwriting,
    root
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OperatingCalc = api;
  if (typeof globalThis !== "undefined") globalThis.OperatingCalc = api;
})(typeof self !== "undefined" ? self : this, function (SB, UW, root) {
  "use strict";

  if (!UW || !UW.DEFAULTS || !UW.DEFAULTS.sizing) throw new Error("OperatingCalc: underwriting.js (with DEFAULTS.sizing) must be loaded first");
  // setup-builder is resolved at call time as well, so a script tag placed
  // ahead of setup-builder.js degrades to a clear error, not a silent undefined.
  function engine(){
    var s = SB || (root && root.SetupBuilder) || (typeof globalThis !== "undefined" ? globalThis.SetupBuilder : null);
    if (!s || typeof s.buildSetup !== "function") throw new Error("OperatingCalc: setup-builder.js must be loaded first");
    return s;
  }

  // Deliberately strict: hooks answer with numbers straight from compute(), so a
  // numeric STRING is a wiring bug — surfaced as "—" (null), never parsed.
  var fin = function (v){ return (typeof v === "number" && isFinite(v)) ? v : null; };
  var pos = function (v){ return typeof v === "number" && isFinite(v) && v > 0; };
  var isObj = function (v){ return v != null && typeof v === "object" && !Array.isArray(v); };
  function clone(v){
    if (Array.isArray(v)) return v.map(clone);
    if (!isObj(v)) return v;
    var o = {}; Object.keys(v).forEach(function (k){ o[k] = clone(v[k]); }); return o;
  }

  // The app's global bench (index.html uwDefaults().bench), read from the
  // engine's DEFAULTS — already in the contract's Assumptions shape — so there
  // is one source for the numbers.
  var D = UW.DEFAULTS;
  var DEFAULTS = { vacancyPct: D.vacancyPct, mgmtPct: D.mgmtPct, reservePerUnit: D.reservePerUnit, budget: {}, sizing: clone(D.sizing) };

  // Deep merge: `over` wins wherever it carries a non-null value; null/undefined
  // means "inherit" (the store's convention for a cleared per-property field),
  // and 0 is a real override (a 0% vacancy floor is a legitimate assumption).
  // Always returns a fresh object — neither input is touched.
  function merge(base, over){
    var out = clone(isObj(base) ? base : {});
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k){
      var v = over[k];
      if (v == null) return;
      out[k] = (isObj(v) && isObj(out[k])) ? merge(out[k], v) : clone(v);
    });
    return out;
  }
  // Effective assumptions = DEFAULTS ⊕ globalDefaults ⊕ record.assumptions.
  // DEFAULTS sit underneath so a partial or absent global bench (node tests,
  // a caller without the hooks) still sizes with the app's standard numbers
  // instead of a 0% cap rate; with the app's complete bench they are inert.
  function mergeAssumptions(globalDefaults, recordAssumptions){
    return merge(merge(DEFAULTS, globalDefaults), recordAssumptions);
  }

  // A line counts when it exists on the record — even at $0 (a zero is a
  // statement, an absent line is not). `lines` is the §2 map {code: Line}.
  function lineCodes(record){
    var ls = record && record.lines;
    if (!isObj(ls)) return [];
    return Object.keys(ls).filter(function (k){ return ls[k] != null; });
  }
  // categorySums = { code: line.annual } VERBATIM — no coercion here, so a
  // numeric string (or anything odd) meets the engine's own n() in computeNOI,
  // the one rule for money-as-text in this app. A present line with no value
  // is $0 (it must stay a worksheet line; null would drop it from the Setup).
  function categorySums(record){
    var ls = record && record.lines, sums = {};
    lineCodes(record).forEach(function (code){ var ln = ls[code], v = isObj(ln) ? ln.annual : ln; sums[code] = (v == null) ? 0 : v; });
    return sums;
  }

  // Field names read off buildSetup (setup-builder.js) / computeNOI (underwriting.js):
  //   b.result.inPlace.{egi, opex, noi}          in-place = the stored actuals (reserves 0)
  //   b.result.underwritten.{egi, opex, reserves, noi, lines}
  //   b.worksheet, b.sizing (= Underwriting.sizeLoan(underwritten.noi, assumptions.sizing))
  // opexUW excludes the reserves line, exactly like sizingSummary's `opex`; the
  // reserves are exposed separately so underwrittenNOI === egiUW − opexUW − reservesUW.
  function derive(record, globalDefaults){
    record = isObj(record) ? record : {};
    var assumptions = mergeAssumptions(globalDefaults, record.assumptions);
    var sums = categorySums(record);
    var b = engine().buildSetup({ categorySums: sums, units: record.units, benchmarks: assumptions });
    var ip = b.result.inPlace, uw = b.result.underwritten;
    // Codes the engine laid out as no worksheet line (unknown or mis-cased —
    // FOO, gpr): their dollars are in none of the figures below, so name them
    // for the sheet / roll-up to warn on instead of letting them vanish. The
    // synthetic `reserves` line is built with t12: 0 whatever sums.reserves says
    // (unlike GPR/VAC/MGMT, which read sums.X), so it never counts as "laid".
    var laid = {}; b.worksheet.lines.forEach(function (l){ if (l.key !== "reserves") laid[l.key] = 1; });
    var dropped = Object.keys(sums).filter(function (c){ return !laid[c]; });
    return {
      egi: ip.egi, opex: ip.opex, inPlaceNOI: ip.noi,
      egiUW: uw.egi, opexUW: uw.opex, reservesUW: uw.reserves, underwrittenNOI: uw.noi,
      worksheet: b.worksheet, result: b.result, sizing: b.sizing, assumptions: assumptions,
      categorySums: sums, dropped: dropped, units: b.result.units, hasLines: lineCodes(record).length > 0
    };
  }

  // The NOI every ratio runs on: the record's in-place NOI, or null when the
  // record carries no lines at all (an empty sheet is "no NOI", not "$0 NOI").
  // In-place NOI is independent of assumptions and units, so no bench is needed.
  function effectiveNOI(record){
    return lineCodes(record).length ? derive(record).inPlaceNOI : null;
  }

  // Hooks come from the orchestrator (LDS_OPERATING_HOOKS). A missing hook or
  // a non-numeric answer is "unknown" → null, so one bad wire blanks a cell,
  // not the whole roll-up.
  function hook(hooks, name, loan){
    var f = hooks && hooks[name];
    return (typeof f === "function") ? fin(f(loan)) : null;
  }
  // numerator / denominator, or null unless both are positive — the exact
  // guard loanDSCR / loanDebtYield / loanLTV apply.
  function ratio(numr, den){ return (pos(numr) && pos(den)) ? numr / den : null; }
  var idOf = function (l){ return (l && l._id != null) ? l._id : (l && l.id != null) ? l.id : null; };
  // Value = NOI ÷ the SENIOR's cap rate; loans arrive senior-first (§1), so the
  // first loan is the senior and the mezz never re-values the property.
  // Keyed by POSITION on purpose: modules get no isMezz, and §1 fixes the order.
  function propertyValue(noi, loans, hooks){
    return loans.length ? ratio(noi, hook(hooks, "capRate", loans[0])) : null;
  }

  function perLoan(record, loans, hooks){
    loans = Array.isArray(loans) ? loans : [];
    var noi = effectiveNOI(record), value = propertyValue(noi, loans, hooks);
    return loans.map(function (l){
      var ds = hook(hooks, "annualDebtService", l), bal = hook(hooks, "currentBalance", l);
      return { loanId: idOf(l), annualDS: ds, balance: bal, value: value,
               dscr: ratio(noi, ds), dy: ratio(noi, bal), ltv: ratio(bal, value) };
    });
  }

  // The combined position, as combinedPosition() reads it: debt service and
  // balance summed across the stack (unknowns count as 0, like its `|| 0`),
  // value off the senior's cap rate, ratios on the sums.
  function stack(record, loans, hooks){
    loans = Array.isArray(loans) ? loans : [];
    var noi = effectiveNOI(record), ds = 0, bal = 0;
    loans.forEach(function (l){ ds += hook(hooks, "annualDebtService", l) || 0; bal += hook(hooks, "currentBalance", l) || 0; });
    var value = propertyValue(noi, loans, hooks);
    return { count: loans.length, noi: noi, annualDS: ds, balance: bal, value: value,
             dscr: ratio(noi, ds), dy: ratio(noi, bal), ltv: ratio(bal, value) };
  }

  return { derive: derive, effectiveNOI: effectiveNOI, perLoan: perLoan, stack: stack,
           mergeAssumptions: mergeAssumptions, categorySums: categorySums, DEFAULTS: DEFAULTS };
});
