/* ============================================================================
   Operating upload — the T12 → PROPERTY RECORD bridge (operating model, P3).
   The app already turns a statement into category sums that foot to the
   statement's own printed TOTAL INCOME / TOTAL EXPENSES / NET OPERATING INCOME
   (t12-parse → t12-classify → SetupBuilder.fromParse). This module reuses that
   pipeline unchanged and only redirects its OUTPUT: instead of the one global
   underwriting scratchpad, the sums land on the property's OperatingRecord
   (operating-store.js, OPERATING-CONTRACT.md §2) as source:"t12" lines.
     linesFromParsed(parsed)             → { lines:{code:annual}, printedNOI, builtNOI, ties }
     preview(store, propKey, parsed)     → [{ code, label, before, after, source_before }]
     apply(store, propKey, parsed, opts) → { record, written, overwroteManual, untouched,
                                             inPlaceNOI, builtNOI, printedNOI, ties }
   Rules: every code PRESENT in the parse is written (a manual line with that
   code is overwritten and reported in overwroteManual); codes ABSENT from the
   parse are left exactly as they were, so a hand-entered line the statement
   does not carry survives a re-upload. Lines, sourceFile and period travel in
   ONE bulk setLines call. The store is touched only through its §2 API
   (ensure / get / setLines / setUnits / setPeriod); the loans store is never
   read or written and the parsed object is never mutated.
   ========================================================================== */
(function (root, factory) {
  var api = factory(
    (typeof require === "function") ? require("./setup-builder.js") : (root.SetupBuilder),
    (typeof require === "function") ? require("./t12-classify.js") : (root.T12Classify)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OperatingUpload = api;
  if (typeof globalThis !== "undefined") globalThis.OperatingUpload = api;
})(typeof self !== "undefined" ? self : this, function (SB, T12) {
  "use strict";

  // The fixed §3 row order (mirrors OperatingTaxonomy.ORDER — copied rather than
  // required so this module stays dependency-light and deterministic in node).
  // Only used to order the preview / written lists; unknown codes sort last.
  var ORDER = ["GPR","EMPL","MOD","VAC","CONC","BD",
               "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH",
               "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL"];
  var RANK = {}; ORDER.forEach(function (c, i){ RANK[c] = i; });
  function sortCodes(codes){
    return codes.map(function (c, i){ return { c: c, r: (RANK[c] != null ? RANK[c] : ORDER.length + i) }; })
                .sort(function (a, b){ return a.r - b.r; }).map(function (x){ return x.c; });
  }
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  // Stored annuals are dollars-and-cents the user will read and edit. fromParse's
  // sums are float additions of cent amounts (876060.5700000002 on Crest); rounding
  // strips that noise and cannot move a cent-valued sum, so the printed-footing tie
  // is preserved to the cent.
  function cents(v){ return Math.round(v * 100) / 100; }
  function tie(a, b){ return a != null && b != null && Math.abs(a - b) < 0.005; }   // "to the cent"
  function label(code){ return (SB.LABEL && SB.LABEL[code]) || code; }
  // A unit count from a form arrives as "96" / "" / 0; only a positive count means anything.
  function toUnits(v){
    if (typeof v === "string") v = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return (isNum(v) && v > 0) ? v : null;
  }

  // parsed = T12Parse.parseGrid output (or the AI-read structure of the same shape).
  // Same reconcile-to-printed-totals as the Underwriting tab: fromParse folds any gap
  // between the classified detail lines and the printed section totals into OTH / GA,
  // so builtNOI (Σ income codes − Σ expense codes) ties to the printed NOI whenever the
  // statement prints one. printedNOI is null (and ties false) when it does not.
  function linesFromParsed(parsed){
    var fp = SB.fromParse(parsed || {}), sums = fp.sums || {};
    var lines = {}, inc = 0, exp = 0, any = false;
    sortCodes(Object.keys(sums)).forEach(function (c){
      if (!isNum(sums[c])) return;
      var v = cents(sums[c]); lines[c] = v; any = true;
      if (T12.roleOf(c) === "expense") exp += v; else inc += v;
    });
    var printed = isNum(fp.inPlaceNOI) ? fp.inPlaceNOI : null;
    var built = any ? inc - exp : null;                     // no lines → no NOI (not 0)
    return { lines: lines, printedNOI: printed, builtNOI: built, ties: tie(built, printed) };
  }

  // The record's in-place NOI, computed exactly the way OperatingCalc.derive does
  // (SetupBuilder.buildSetup on {code: annual}; in-place reserves are 0), so what
  // apply() reports is what the sheet and the roll-up will show.
  function recordNOI(rec){
    if (!rec || !rec.lines) return null;
    var sums = {}, any = false;
    Object.keys(rec.lines).forEach(function (c){
      var l = rec.lines[c];
      if (l && isNum(l.annual)) { sums[c] = l.annual; any = true; }
    });
    if (!any) return null;
    return SB.buildSetup({ categorySums: sums, units: rec.units, benchmarks: {} }).result.inPlace.noi;
  }

  // Read-only: what apply() would do, one row per code in the parse (codes the
  // record has but the parse lacks are untouched by apply, so they are not listed).
  function preview(store, propKey, parsed){
    var lf = linesFromParsed(parsed), rec = store.get(propKey), cur = (rec && rec.lines) || {};
    return Object.keys(lf.lines).map(function (c){
      var b = cur[c];
      return { code: c, label: label(c),
               before: (b && isNum(b.annual)) ? b.annual : null,
               after: lf.lines[c],
               source_before: b ? (b.source || null) : null };
    });
  }

  // opts = { fileName, period, propertyName, units? }
  function apply(store, propKey, parsed, opts){
    opts = opts || {};
    var lf = linesFromParsed(parsed), codes = Object.keys(lf.lines);
    var before = store.get(propKey), prior = (before && before.lines) || {};
    // Everything that informs the result is read BEFORE any write, so a store that
    // hands out live references cannot change the answer under us.
    var overwroteManual = codes.filter(function (c){ return !!prior[c] && prior[c].source === "manual"; });
    var untouched = sortCodes(Object.keys(prior).filter(function (c){ return !(c in lf.lines); }));
    if (!codes.length) {
      // An empty parse (no rows, no printed totals) has nothing to say about the
      // property: do not create a record or stamp a sourceFile from it.
      return { record: before, written: [], overwroteManual: [], untouched: untouched,
               inPlaceNOI: recordNOI(before), builtNOI: null, printedNOI: lf.printedNOI, ties: false };
    }
    var units = toUnits(opts.units), init = {};
    init.propertyName = (opts.propertyName != null) ? String(opts.propertyName) : (before ? before.propertyName : propKey);
    if (units != null) init.units = units;
    var rec = store.ensure(propKey, init);                    // create-if-missing; an existing record is returned as is
    if (units != null && rec.units !== units) store.setUnits(propKey, units);
    var write = {}, meta = {};
    codes.forEach(function (c){ write[c] = { annual: lf.lines[c], source: "t12" }; });   // no controllable/note: the store keeps a user's flip / note on an existing line and defaults a new one
    if (opts.fileName != null) meta.sourceFile = String(opts.fileName);
    if (opts.period != null) meta.period = String(opts.period);
    store.setLines(propKey, write, meta);                     // lines + sourceFile + period: one save
    var after = store.get(propKey);
    // §2 says setLines carries period; if a store ignores it, setPeriod is the documented path.
    if (meta.period != null && after && after.period !== meta.period) { store.setPeriod(propKey, meta.period); after = store.get(propKey); }
    var noi = recordNOI(after);
    return { record: after, written: codes, overwroteManual: overwroteManual, untouched: untouched,
             inPlaceNOI: noi, builtNOI: lf.builtNOI, printedNOI: lf.printedNOI, ties: tie(noi, lf.printedNOI) };
  }

  return { linesFromParsed: linesFromParsed, preview: preview, apply: apply, ORDER: ORDER, label: label };
});
