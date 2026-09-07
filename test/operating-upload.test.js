/* node test/operating-upload.test.js — P3 (OperatingUpload) acceptance, plain node, no framework.
   Runs every assertion against an in-test fake store that implements exactly the §2 methods the
   module uses (ensure / get / setLines / setUnits / setPeriod) and, when operating-store.js is
   present, against the real store too. Synthetic grids carry hand-computed expectations (below);
   the Crest fixture block is skipped with a clear line when the git-ignored file is absent. */
"use strict";
var path = require("path"), fs = require("fs");
var ROOT = path.resolve(__dirname, "..");
var P   = require(path.join(ROOT, "t12-parse.js"));
var SB  = require(path.join(ROOT, "setup-builder.js"));
var T12 = require(path.join(ROOT, "t12-classify.js"));
var OU  = require(path.join(ROOT, "operating-upload.js"));

var passes = 0, fails = 0;
function ok(c, msg){ if (c) { passes++; console.log("  ok   " + msg); } else { fails++; console.log("  FAIL " + msg); } }
function eq(a, b, msg){ ok(a === b, msg + (a === b ? "" : "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")")); }
function cents(a, b, msg){ var c = typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005; ok(c, msg + (c ? "" : "  (got " + a + ", want " + b + ")")); }
function deq(a, b, msg){ var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + (A === B ? "" : "  (got " + A + ", want " + B + ")")); }
function deepFreeze(o){ if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k){ deepFreeze(o[k]); }); } return o; }
// Independent of the module: Σ income − Σ expense over a record's stored lines via T12Classify.roleOf.
function sumNOI(rec){ var n = 0; Object.keys(rec.lines).forEach(function (c){ var v = rec.lines[c].annual; n += (T12.roleOf(c) === "expense") ? -v : v; }); return n; }

// ---- storage + clock ---------------------------------------------------------------------
var LOANS_KEY = "ldsHub.loans.v7", OP_KEY = "ldsHub.operating.v1";
var LOANS_BLOB = JSON.stringify([{ _id: "L1", propertyName: "Synthetic Apartments", principal: 1000000, rate: 0.061 }]);
function fakeStorage(){
  var m = new Map(); m.set(LOANS_KEY, LOANS_BLOB);
  var s = { writes: 0, loanWrites: 0,
    getItem: function (k){ return m.has(k) ? m.get(k) : null; },
    setItem: function (k, v){ s.writes++; if (k === LOANS_KEY) s.loanWrites++; m.set(k, String(v)); },
    removeItem: function (k){ m.delete(k); }, clear: function (){ m.clear(); },
    key: function (i){ return Array.from(m.keys())[i] || null; }, raw: function (k){ return m.get(k); } };
  Object.defineProperty(s, "length", { get: function (){ return m.size; } });
  return s;
}
var clock = { t: "2026-09-07T10:00:00.000Z" }, now = function (){ return clock.t; };

// ---- the fake store: §2 semantics for exactly the methods the module uses -------------------
var NON_CTL = { RET: 1, INS: 1 };                                   // §3 defaults: RET/INS false, else true
function clone(o){ return o == null ? o : JSON.parse(JSON.stringify(o)); }
function FakeStore(storage, nowFn){ this.storage = storage; this.now = nowFn; this.state = { version: 1, records: {} }; }
FakeStore.prototype._save = function (){ this.storage.setItem(OP_KEY, JSON.stringify(this.state)); };
FakeStore.prototype._rec = function (pk){ var r = this.state.records[pk]; if (!r) throw new Error("fake store: no record " + pk); return r; };
FakeStore.prototype.ensure = function (pk, o){
  o = o || {}; var r = this.state.records[pk];
  if (!r) { var t = this.now(); r = this.state.records[pk] = { propKey: pk, propertyName: (o.propertyName != null ? o.propertyName : ""),
    units: (o.units != null ? o.units : null), period: null, lines: {}, assumptions: null, meta: { createdAt: t, lastUpdated: t, sourceFile: null } }; this._save(); }
  return clone(r);
};
FakeStore.prototype.get = function (pk){ return clone(this.state.records[pk] || null); };
FakeStore.prototype.setLines = function (pk, map, o){
  var r = this._rec(pk), t = this.now(); o = o || {};
  Object.keys(map || {}).forEach(function (c){
    var p = map[c], e = r.lines[c];
    r.lines[c] = { annual: p.annual,
      prevAnnual: e ? (e.annual !== p.annual ? e.annual : e.prevAnnual) : null,        // only when it changes
      controllable: (p.controllable != null) ? !!p.controllable : (e ? e.controllable : !NON_CTL[c]),   // omitted → keep / default
      source: p.source, updatedAt: t, note: (p.note !== undefined) ? p.note : (e ? e.note : null) };
  });
  if (o.sourceFile != null) r.meta.sourceFile = o.sourceFile;
  if (o.period != null) r.period = o.period;
  r.meta.lastUpdated = t; this._save();                                              // bulk: one save
};
FakeStore.prototype.setUnits  = function (pk, n){ var r = this._rec(pk); r.units = n; r.meta.lastUpdated = this.now(); this._save(); };
FakeStore.prototype.setPeriod = function (pk, s){ var r = this._rec(pk); r.period = s; r.meta.lastUpdated = this.now(); this._save(); };

// Counts the module's calls without touching the store object itself (works for the real singleton too).
function spy(store){
  var n = {}, w = { calls: n, reset: function (){ Object.keys(n).forEach(function (k){ n[k] = 0; }); } };
  ["ensure", "get", "setLines", "setUnits", "setPeriod"].forEach(function (m){ n[m] = 0; w[m] = function (){ n[m]++; return store[m].apply(store, arguments); }; });
  return w;
}
function loadRealStore(){
  var f = path.join(ROOT, "operating-store.js");
  if (!fs.existsSync(f)) return { skip: "operating-store.js not present" };
  try {
    var OS = require(f);
    ["init", "load", "ensure", "get", "setLines", "setUnits", "setPeriod"].forEach(function (m){ if (typeof OS[m] !== "function") throw new Error("missing " + m + "()"); });
    return { KEY: OS.KEY, make: function (storage, nowFn){ OS.init({ storage: storage, now: nowFn }); OS.load(); return OS; } };
  } catch (e) { return { skip: "operating-store.js failed to load: " + e.message }; }
}

// ---- synthetic statement -----------------------------------------------------------------
// Hand-computed footing (cents):
//   income   = 1,200,000 − 60,000 − 12,000 + 8,400.50 + 3,100.25                         = 1,139,500.75
//   expenses = 150,000 + 42,000.33 + 30,000 + 25,500.10 + 40,000 + 120,000 + 34,185.02 + 5,000 =   446,685.45
//   NOI      = 692,815.30            (GPR 1,250,000 variant: income 1,189,500.75, NOI 742,815.30)
//   incExtra/expExtra print totals ABOVE the detail sum (a residual for fromParse to reconcile into OTH / GA).
// Captioned "Market Rent" rather than "Gross Potential Rent": the committed parser (HEAD) drops a
// "GROSS …" caption as a subtotal row (fixed in the working tree); "Market Rent" parses to GPR on both.
var c2 = function (v){ return Math.round(v * 100) / 100; };
function grid(o){
  o = o || {}; var gpr = (o.GPR != null) ? o.GPR : 1200000;
  var incP = c2(gpr - 60000 - 12000 + 8400.5 + 3100.25 + (o.incExtra || 0));
  var expP = c2(150000 + 42000.33 + 30000 + 25500.10 + 40000 + 120000 + 34185.02 + 5000 + (o.expExtra || 0));
  var R = function (n, t){ return [n, null, null, null, t]; };
  var g = [["Synthetic Apartments"], ["Operating Statement"], ["Period = Jan 2025 - Dec 2025"],
    ["Account", "Jan 2025", "Feb 2025", "Mar 2025", "Total"],
    R("INCOME", null), R("RENTAL INCOME", null), R("Market Rent", gpr), R("Vacancy Loss", -60000), R("Concessions", -12000), R("TOTAL RENTAL INCOME", gpr - 72000),
    R("OTHER INCOME", null), R("Pet Fees", 8400.5), R("Late Fees", 3100.25), R("TOTAL OTHER INCOME", 11500.75), R("TOTAL INCOME", incP),
    R("EXPENSES", null), R("TAXES & INSURANCE", null), R("Real Estate Taxes", 150000), R("Property Insurance", 42000.33), R("TOTAL TAXES & INSURANCE", 192000.33),
    R("UTILITIES", null), R("Electric", 30000), R("Water/Sewer", 25500.10), R("TOTAL UTILITIES", 55500.10),
    R("REPAIRS & MAINTENANCE", null), R("Repairs", 40000), R("PAYROLL", null), R("Salaries", 120000),
    R("MANAGEMENT FEE", null), R("Management Fee", 34185.02), R("GENERAL & ADMINISTRATIVE", null), R("Office Supplies", 5000)];
  if (!o.noExpTotals) g.push(R("TOTAL EXPENSES", expP), R("NET OPERATING INCOME", c2(incP - expP)),
                             R("Mortgage Interest", 300000), R("NET INCOME", c2(incP - expP - 300000)));   // below the line: must be ignored
  return g;
}
var CODES_A = ["GPR", "VAC", "CONC", "PET", "LATE", "RET", "INS", "UTIL", "RM", "PAY", "MGMT", "GA"];
var VALUES_A = [1200000, -60000, -12000, 8400.5, 3100.25, 150000, 42000.33, 55500.1, 40000, 120000, 34185.02, 5000];

// ---- the suite (identical for both stores) ---------------------------------------------------
function suite(label, make){
  console.log("\n== store: " + label + " ==");
  var PK = "addr:100 main st, springfield";
  var sto = fakeStorage(), store = make(sto, now), S = spy(store);

  // 1. linesFromParsed on the synthetic statement
  var pA = P.parseGrid(grid()), snapA = JSON.stringify(pA);
  var lf = OU.linesFromParsed(pA);
  deq(Object.keys(lf.lines), CODES_A, "linesFromParsed: exactly the parsed codes, in §3 order");
  CODES_A.forEach(function (c, i){ eq(lf.lines[c], VALUES_A[i], "linesFromParsed: " + c + " = " + VALUES_A[i]); });
  eq(lf.printedNOI, 692815.3, "linesFromParsed: printedNOI = printed NET OPERATING INCOME 692,815.30");
  cents(lf.builtNOI, 692815.30, "linesFromParsed: builtNOI = Σ income − Σ expense = 692,815.30");
  eq(lf.ties, true, "linesFromParsed: ties (|built − printed| < 0.005)");
  eq(JSON.stringify(pA), snapA, "linesFromParsed: parsed object not mutated");
  eq(OU.label("TRSH RUB"), "Trash Reimbursements", "label: from SetupBuilder.LABEL");
  eq(OU.label("XYZ"), "XYZ", "label: unknown code falls back to the code");

  // 2. preview on an empty store — read-only
  var pv = OU.preview(S, PK, pA);
  eq(pv.length, 12, "preview: one row per code in the parse");
  deq(pv.map(function (r){ return r.code; }), CODES_A, "preview: rows in §3 order");
  eq(pv[0].label, "Gross Potential Rent", "preview: label from SetupBuilder.LABEL");
  ok(pv.every(function (r){ return r.before === null && r.source_before === null; }), "preview: before / source_before null when no record exists");
  deq(pv.map(function (r){ return r.after; }), VALUES_A, "preview: after = parsed annuals, exact");
  eq(S.calls.ensure + S.calls.setLines + S.calls.setUnits + S.calls.setPeriod, 0, "preview: no store writes");
  eq(sto.writes, 0, "preview: no storage writes");
  eq(store.get(PK), null, "preview: no record created");

  // 3. apply on an empty store → record created, lines written, NOI ties
  clock.t = "2026-09-07T10:00:00.000Z"; S.reset();
  var res = OU.apply(S, PK, pA, { fileName: "synthetic-t12.xlsx", period: "T12 ending 2025-12-31", propertyName: "Synthetic Apartments", units: 96 });
  eq(JSON.stringify(pA), snapA, "apply: parsed object not mutated");
  var rec = store.get(PK);
  ok(!!rec, "apply: record created");
  eq(rec.propertyName, "Synthetic Apartments", "apply: propertyName set");
  eq(rec.units, 96, "apply: units set");
  eq(rec.period, "T12 ending 2025-12-31", "apply: period set");
  eq(rec.meta.sourceFile, "synthetic-t12.xlsx", "apply: meta.sourceFile = fileName");
  eq(rec.meta.lastUpdated, clock.t, "apply: meta.lastUpdated stamped");
  deq(res.written, CODES_A, "apply: written = every code in the parse, §3 order");
  deq(res.overwroteManual, [], "apply: nothing manual overwritten on a fresh record");
  deq(res.untouched, [], "apply: nothing untouched on a fresh record");
  deq(Object.keys(rec.lines).sort(), CODES_A.slice().sort(), "apply: record carries exactly the parsed codes");
  CODES_A.forEach(function (c, i){ eq(rec.lines[c].annual, VALUES_A[i], "apply: " + c + ".annual = " + VALUES_A[i]); });
  ok(CODES_A.every(function (c){ return rec.lines[c].source === "t12"; }), "apply: every written line has source = t12");
  ok(CODES_A.every(function (c){ return rec.lines[c].updatedAt === clock.t; }), "apply: every written line stamped updatedAt = injected clock");
  ok(CODES_A.every(function (c){ return rec.lines[c].prevAnnual === null; }), "apply: prevAnnual null on first write (store)");
  eq(rec.lines.RET.controllable, false, "apply: RET non-controllable by default (store default, module passes no flag)");
  eq(rec.lines.UTIL.controllable, true, "apply: UTIL controllable by default (store default)");
  cents(res.inPlaceNOI, 692815.30, "apply: record in-place NOI ties to printed 692,815.30");
  eq(res.printedNOI, 692815.3, "apply: printedNOI reported");
  cents(res.builtNOI, 692815.30, "apply: builtNOI reported");
  eq(res.ties, true, "apply: ties:true");
  eq(res.record.lines.GPR.annual, 1200000, "apply: returned record is the written record");
  cents(sumNOI(rec), 692815.30, "record: independent Σ income − Σ expense from stored lines = 692,815.30");
  eq(S.calls.ensure, 1, "apply: one ensure()");
  eq(S.calls.setLines, 1, "apply: ONE bulk setLines (no per-line writes)");
  eq(S.calls.setUnits, 0, "apply: new record — units go through ensure(), no setUnits()");
  eq(S.calls.setPeriod, 0, "apply: period carried by setLines, no separate setPeriod()");

  // 4. manual line whose code is NOT in the parse survives a re-upload; values + updatedAt refresh
  clock.t = "2026-09-08T09:00:00.000Z";
  store.setLines(PK, { CAB: { annual: 12000, source: "manual", note: "cable contract" } });
  eq(store.get(PK).lines.CAB.annual, 12000, "seed: manual CAB 12,000 (a code the statement does not carry)");
  var pA2 = P.parseGrid(grid({ GPR: 1250000 })), snapA2 = JSON.stringify(pA2);
  var pv2 = OU.preview(S, PK, pA2), rowG = pv2.filter(function (r){ return r.code === "GPR"; })[0];
  eq(rowG.before, 1200000, "preview (re-upload): GPR before = current 1,200,000");
  eq(rowG.after, 1250000, "preview (re-upload): GPR after = 1,250,000");
  eq(rowG.source_before, "t12", "preview (re-upload): GPR source_before = t12");
  ok(!pv2.some(function (r){ return r.code === "CAB"; }), "preview (re-upload): a code absent from the parse is not listed (apply leaves it alone)");
  ok(pv2.filter(function (r){ return r.code !== "GPR"; }).every(function (r){ return r.before === r.after; }), "preview (re-upload): unchanged lines show before === after");
  clock.t = "2026-09-09T12:00:00.000Z"; S.reset();
  var res2 = OU.apply(S, PK, pA2, { fileName: "synthetic-t12-v2.xlsx", period: "T12 ending 2026-01-31", propertyName: "Synthetic Apartments", units: 96 });
  var rec2 = store.get(PK);
  eq(rec2.lines.GPR.annual, 1250000, "re-upload: GPR refreshed to 1,250,000");
  eq(rec2.lines.GPR.prevAnnual, 1200000, "re-upload: GPR.prevAnnual = the value before (store)");
  eq(rec2.lines.GPR.updatedAt, "2026-09-09T12:00:00.000Z", "re-upload: GPR.updatedAt refreshed");
  eq(rec2.lines.VAC.annual, -60000, "re-upload: VAC value unchanged");
  eq(rec2.lines.VAC.updatedAt, "2026-09-09T12:00:00.000Z", "re-upload: VAC.updatedAt refreshed (re-uploaded even though unchanged)");
  eq(rec2.lines.VAC.prevAnnual, null, "re-upload: unchanged value → prevAnnual stays null (store)");
  eq(rec2.lines.CAB.annual, 12000, "re-upload: manual CAB survives untouched");
  eq(rec2.lines.CAB.source, "manual", "re-upload: CAB keeps source = manual");
  eq(rec2.lines.CAB.updatedAt, "2026-09-08T09:00:00.000Z", "re-upload: CAB keeps its own updatedAt");
  eq(rec2.lines.CAB.note, "cable contract", "re-upload: CAB keeps its note");
  eq(rec2.meta.sourceFile, "synthetic-t12-v2.xlsx", "re-upload: meta.sourceFile refreshed");
  eq(rec2.period, "T12 ending 2026-01-31", "re-upload: period refreshed");
  eq(rec2.meta.lastUpdated, "2026-09-09T12:00:00.000Z", "re-upload: meta.lastUpdated refreshed");
  deq(res2.untouched, ["CAB"], "re-upload: untouched = [CAB]");
  deq(res2.overwroteManual, [], "re-upload: no manual line overwritten (CAB not in the parse)");
  eq(res2.printedNOI, 742815.3, "re-upload: printedNOI 742,815.30");
  cents(res2.builtNOI, 742815.30, "re-upload: builtNOI 742,815.30 (parse ties internally)");
  cents(res2.inPlaceNOI, 730815.30, "re-upload: record NOI = printed 742,815.30 − manual CAB 12,000 = 730,815.30");
  eq(res2.ties, false, "re-upload: record no longer ties to the printed NOI (extra manual line) → ties:false");
  eq(S.calls.setLines, 1, "re-upload: ONE bulk setLines");
  eq(S.calls.setUnits, 0, "re-upload: same units → no setUnits()");
  eq(S.calls.setPeriod, 0, "re-upload: no separate setPeriod()");
  eq(JSON.stringify(pA2), snapA2, "re-upload: parsed object not mutated");

  // 5. manual line whose code IS in the parse → overwritten + reported; a budget line overwritten but not reported
  clock.t = "2026-09-10T08:00:00.000Z";
  store.setLines(PK, { RET: { annual: 999, source: "manual", controllable: true }, INS: { annual: 40000, source: "budget" } });
  var pv3 = OU.preview(S, PK, pA2);
  var rowR = pv3.filter(function (r){ return r.code === "RET"; })[0], rowI = pv3.filter(function (r){ return r.code === "INS"; })[0];
  eq(rowR.before, 999, "preview: manual RET before = 999");
  eq(rowR.source_before, "manual", "preview: RET source_before = manual");
  eq(rowR.after, 150000, "preview: RET after = 150,000");
  eq(rowI.before, 40000, "preview: budget INS before = 40,000");
  eq(rowI.source_before, "budget", "preview: INS source_before = budget");
  eq(rowI.after, 42000.33, "preview: INS after = 42,000.33");
  clock.t = "2026-09-11T08:00:00.000Z"; S.reset();
  var res3 = OU.apply(S, PK, pA2, { fileName: "synthetic-t12-v2.xlsx", period: "T12 ending 2026-01-31", propertyName: "Synthetic Apartments" });
  var rec3 = store.get(PK);
  deq(res3.overwroteManual, ["RET"], "apply: manual RET overwritten and reported in overwroteManual");
  eq(rec3.lines.RET.annual, 150000, "apply: RET now 150,000");
  eq(rec3.lines.RET.source, "t12", "apply: RET source now t12");
  eq(rec3.lines.RET.prevAnnual, 999, "apply: RET.prevAnnual = 999 (store)");
  eq(rec3.lines.RET.controllable, true, "apply: the user's controllable flip on RET survives the overwrite (module passes no flag; store keeps it)");
  eq(rec3.lines.INS.annual, 42000.33, "apply: budget INS overwritten to 42,000.33");
  eq(rec3.lines.INS.source, "t12", "apply: INS source now t12");
  eq(rec3.lines.INS.prevAnnual, 40000, "apply: INS.prevAnnual = 40,000 (store)");
  eq(rec3.units, 96, "apply without units: units untouched");
  deq(res3.untouched, ["CAB"], "apply: CAB still untouched");
  cents(res3.inPlaceNOI, 730815.30, "apply: record NOI back to 730,815.30");
  eq(S.calls.setUnits, 0, "apply without units: no setUnits()");

  // 6. reconcile residual: printed totals above the detail sum fold into OTH / GA (same as the Underwriting tab)
  var pB = P.parseGrid(grid({ incExtra: 100, expExtra: 15 })), lB = OU.linesFromParsed(pB);
  eq(lB.lines.OTH, 100, "reconcile: +100 income gap → OTH 100");
  eq(lB.lines.GA, 5015, "reconcile: +15 expense gap → GA 5,015");
  eq(lB.printedNOI, 692900.3, "reconcile: printedNOI 692,900.30");
  cents(lB.builtNOI, 692900.30, "reconcile: builtNOI ties to the printed footing");
  eq(lB.ties, true, "reconcile: ties:true");
  var PK2 = "name:elm court"; S.reset();
  var resB = OU.apply(S, PK2, pB, { fileName: "elm.xlsx", period: "T12 ending 2025-12-31", propertyName: "Elm Court", units: "48" });
  var recB = store.get(PK2);
  eq(recB.units, 48, "apply: numeric-string units coerced to 48");
  eq(recB.propertyName, "Elm Court", "apply: second property gets its own record");
  eq(recB.lines.OTH.annual, 100, "apply: OTH residual written");
  cents(resB.inPlaceNOI, 692900.30, "apply: Elm Court NOI 692,900.30");
  eq(resB.ties, true, "apply: Elm Court ties");
  eq(store.get(PK).lines.GPR.annual, 1250000, "apply: writing Elm Court leaves the first record untouched");
  S.reset();
  var resB2 = OU.apply(S, PK2, pB, { fileName: "elm.xlsx", period: "T12 ending 2025-12-31", propertyName: "Elm Court", units: 50 });
  eq(store.get(PK2).units, 50, "apply: changed units on an existing record → units updated");
  eq(S.calls.setUnits, 1, "apply: changed units → exactly one setUnits()");
  eq(resB2.written.length, 13, "apply: Elm Court re-upload wrote 13 codes (12 + OTH residual)");

  // 7. statement with no printed expense total / NOI: printedNOI null, ties false, lines still written
  var pC = P.parseGrid(grid({ noExpTotals: true })), lC = OU.linesFromParsed(pC);
  eq(lC.printedNOI, null, "no printed NOI: printedNOI null");
  cents(lC.builtNOI, 692815.30, "no printed NOI: builtNOI from the lines");
  eq(lC.ties, false, "no printed NOI: ties false (nothing to tie to)");
  var resC = OU.apply(S, "name:no noi", pC, { fileName: "c.xlsx", period: "T12", propertyName: "No NOI" });
  eq(resC.written.length, 12, "no printed NOI: lines still written");
  cents(resC.inPlaceNOI, 692815.30, "no printed NOI: record NOI from the lines");
  eq(resC.printedNOI, null, "no printed NOI: apply reports printedNOI null");
  eq(resC.ties, false, "no printed NOI: apply reports ties false");

  // 8. empty / malformed input never throws and never touches the store
  var pE = P.parseGrid([]), lE = OU.linesFromParsed(pE);
  deq(lE, { lines: {}, printedNOI: null, builtNOI: null, ties: false }, "empty grid: lines {}, NOIs null, ties false");
  deq(OU.linesFromParsed(null), { lines: {}, printedNOI: null, builtNOI: null, ties: false }, "null parsed: same");
  deq(OU.linesFromParsed({ rows: null, totals: null }), { lines: {}, printedNOI: null, builtNOI: null, ties: false }, "parsed with null rows/totals: same");
  deq(OU.preview(S, "name:empty", pE), [], "empty grid: preview []");
  S.reset(); var w0 = sto.writes;
  var resE = OU.apply(S, "name:empty", pE, { fileName: "junk.xlsx", period: "?", propertyName: "Empty" });
  eq(store.get("name:empty"), null, "empty grid: apply creates no record");
  eq(resE.record, null, "empty grid: apply returns record null");
  deq(resE.written, [], "empty grid: written []");
  eq(resE.inPlaceNOI, null, "empty grid: inPlaceNOI null");
  eq(resE.ties, false, "empty grid: ties false");
  eq(sto.writes, w0, "empty grid: no storage writes");
  eq(S.calls.ensure + S.calls.setLines + S.calls.setUnits + S.calls.setPeriod, 0, "empty grid: no store writes");
  var pG = P.parseGrid([["x"], [1, 2, 3], [null], ["Total", "Jan 2025"]]);
  ok(typeof OU.linesFromParsed(pG).ties === "boolean", "garbage grid: no throw");
  var lT = OU.linesFromParsed({ rows: [], totals: { income: 1000.5, expense: 400.25, noi: 600.25 } });
  deq(lT.lines, { OTH: 1000.5, GA: 400.25 }, "totals-only parse (AI path): income → OTH, expense → GA");
  eq(lT.ties, true, "totals-only parse: ties");

  // 9. a deep-frozen parsed object (any mutation would throw in strict mode)
  var frozen = deepFreeze(JSON.parse(snapA));
  var resF = OU.apply(S, "name:frozen", frozen, { fileName: "f.xlsx", period: "T12", propertyName: "Frozen" });
  eq(resF.written.length, 12, "frozen parsed: apply completes (no mutation attempted)");
  eq(OU.preview(S, "name:frozen", frozen).length, 12, "frozen parsed: preview completes");

  // 10. isolation + persistence
  eq(sto.raw(LOANS_KEY), LOANS_BLOB, "loans store byte-identical after every write");
  eq(sto.loanWrites, 0, "loans store never written");
  ok(sto.writes > 0, "operating store persisted (" + sto.writes + " storage writes)");
  var persisted = null; try { persisted = JSON.parse(sto.raw(OP_KEY)); } catch (e) {}
  ok(!!(persisted && persisted.records && persisted.records[PK]), "persisted under " + OP_KEY + " with the property record");
  eq(persisted && persisted.records[PK] && persisted.records[PK].lines.GPR.annual, 1250000, "persisted GPR = 1,250,000");

  // 11. Crest fixture (real statement; git-ignored)
  var CREST = path.join(ROOT, "test", "fixtures", "crest-t12.xlsx");
  if (!fs.existsSync(CREST)) { console.log("  skipped: fixture missing (" + CREST + ")"); return; }
  var XLSX = require(path.join(ROOT, "vendor", "xlsx.full.min.js"));
  var wb = XLSX.read(fs.readFileSync(CREST), { type: "buffer" });
  var g = XLSX.utils.sheet_to_json(wb.Sheets["Report1"], { header: 1, raw: true });
  var pX = P.parseGrid(g), snapX = JSON.stringify(pX);
  eq(pX.totals.income, 18323614.31, "Crest: printed TOTAL INCOME 18,323,614.31");
  eq(pX.totals.expense, 8840010.03, "Crest: printed TOTAL EXPENSES 8,840,010.03");
  eq(pX.totals.noi, 9483604.28, "Crest: printed NET OPERATING INCOME 9,483,604.28");
  var lX = OU.linesFromParsed(pX), incX = 0, expX = 0;
  Object.keys(lX.lines).forEach(function (c){ if (T12.roleOf(c) === "expense") expX += lX.lines[c]; else incX += lX.lines[c]; });
  eq(lX.printedNOI, 9483604.28, "Crest: printedNOI = 9,483,604.28");
  cents(incX, 18323614.31, "Crest: Σ income lines = printed TOTAL INCOME 18,323,614.31");
  cents(expX, 8840010.03, "Crest: Σ expense lines = printed TOTAL EXPENSES 8,840,010.03");
  cents(lX.builtNOI, 9483604.28, "Crest: builtNOI = 9,483,604.28");
  eq(lX.ties, true, "Crest: ties:true");
  ["GPR", "VAC", "CONC", "RET", "INS", "UTIL", "RM", "PAY", "MGMT", "GA"].forEach(function (c){ ok(c in lX.lines, "Crest: line " + c + " present"); });
  // cent-exact = the nearest double to a 2-decimal amount: re-rounding is a no-op and it prints as one
  // (v*100 itself is NOT integral in float for e.g. 1223379.37, so that naive test would be wrong).
  ok(Object.keys(lX.lines).every(function (c){ var v = lX.lines[c]; return v === Math.round(v * 100) / 100 && /^-?\d+(\.\d{1,2})?$/.test(String(v)); }),
     "Crest: every stored annual is cent-exact (no float noise such as 876060.5700000002)");
  var sto2 = fakeStorage(), st2 = make(sto2, now), S2 = spy(st2), PKX = "addr:crest";
  clock.t = "2026-09-12T08:00:00.000Z";
  var rX = OU.apply(S2, PKX, pX, { fileName: "crest-t12.xlsx", period: "T12 ending 2025-06-30", propertyName: "Crest", units: 412 });
  eq(JSON.stringify(pX), snapX, "Crest: parsed object not mutated");
  var recX = st2.get(PKX), nX = Object.keys(lX.lines).length;
  eq(Object.keys(recX.lines).length, nX, "Crest: every parsed code on the record (" + nX + " lines)");
  ok(Object.keys(recX.lines).every(function (c){ return recX.lines[c].source === "t12" && recX.lines[c].updatedAt === clock.t; }), "Crest: all lines t12 + stamped");
  cents(rX.inPlaceNOI, 9483604.28, "Crest: record in-place NOI ties to 9,483,604.28");
  eq(rX.printedNOI, 9483604.28, "Crest: apply reports printedNOI 9,483,604.28");
  eq(rX.ties, true, "Crest: apply reports ties:true");
  deq(rX.written, Object.keys(lX.lines), "Crest: written = parsed codes");
  eq(recX.meta.sourceFile, "crest-t12.xlsx", "Crest: meta.sourceFile");
  eq(recX.period, "T12 ending 2025-06-30", "Crest: period");
  eq(recX.units, 412, "Crest: units");
  cents(sumNOI(recX), 9483604.28, "Crest: independent Σ from stored lines = 9,483,604.28");
  var cs = {}; Object.keys(recX.lines).forEach(function (c){ cs[c] = recX.lines[c].annual; });
  var built = SB.buildSetup({ categorySums: cs, units: 412, benchmarks: {} }).result.inPlace;   // what OperatingCalc.derive runs
  cents(built.noi, 9483604.28, "Crest: SetupBuilder.buildSetup on the record → in-place NOI 9,483,604.28");
  cents(built.egi, 18323614.31, "Crest: … in-place EGI 18,323,614.31");
  cents(built.opex, 8840010.03, "Crest: … in-place opex 8,840,010.03");
  st2.setLines(PKX, { CAB: { annual: 24000, source: "manual" } });
  clock.t = "2026-09-13T08:00:00.000Z"; S2.reset();
  var rX2 = OU.apply(S2, PKX, pX, { fileName: "crest-t12-again.xlsx", period: "T12 ending 2025-06-30", propertyName: "Crest", units: 412 });
  var recX2 = st2.get(PKX);
  ok(Object.keys(lX.lines).every(function (c){ return recX2.lines[c].annual === recX.lines[c].annual; }), "Crest re-upload: every annual identical");
  ok(Object.keys(lX.lines).every(function (c){ return recX2.lines[c].updatedAt === clock.t; }), "Crest re-upload: every parsed line re-stamped");
  eq(recX2.lines.GPR.prevAnnual, null, "Crest re-upload: unchanged GPR → prevAnnual null (store)");
  eq(recX2.lines.CAB.annual, 24000, "Crest re-upload: manual CAB 24,000 survives");
  deq(rX2.untouched, ["CAB"], "Crest re-upload: untouched = [CAB]");
  cents(rX2.inPlaceNOI, 9459604.28, "Crest re-upload: record NOI = 9,483,604.28 − 24,000 = 9,459,604.28");
  eq(rX2.ties, false, "Crest re-upload: ties:false (record carries a line the statement does not)");
  eq(recX2.meta.sourceFile, "crest-t12-again.xlsx", "Crest re-upload: sourceFile refreshed");
  eq(S2.calls.setLines, 1, "Crest re-upload: ONE bulk setLines");
  eq(sto2.raw(LOANS_KEY), LOANS_BLOB, "Crest: loans store byte-identical");
}

// ---- run ---------------------------------------------------------------------------------------
console.log("operating-upload.test.js — " + process.version);
var tax = path.join(ROOT, "operating-taxonomy.js");
if (fs.existsSync(tax)) {
  try { var OT = require(tax);
    deq(OU.ORDER, Array.prototype.slice.call(OT.ORDER), "ORDER mirrors OperatingTaxonomy.ORDER exactly");
    ok(OU.ORDER.every(function (c){ return OU.label(c) === OT.label(c); }), "label() agrees with OperatingTaxonomy.label for every code");
  } catch (e) { console.log("  skipped: operating-taxonomy.js failed to load (" + e.message + ")"); }
} else console.log("  skipped: operating-taxonomy.js not present (ORDER guard)");

// Load-time guard: in a browser-shaped context (window, no require) the module must throw a clear
// error when its deps are missing (wrong script order), and export window.OperatingUpload when they precede it.
var vm = require("vm"), SRC = fs.readFileSync(path.join(ROOT, "operating-upload.js"), "utf8");
function loadBare(withDeps){
  var ctx = { console: console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  if (withDeps) ["underwriting.js", "t12-classify.js", "setup-builder.js"].forEach(function (f){ vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }); });
  vm.runInContext(SRC, ctx, { filename: "operating-upload.js" }); return ctx;
}
var guardMsg = null; try { loadBare(false); } catch (e) { guardMsg = String(e && e.message); }
ok(guardMsg !== null && /load setup-builder\.js and t12-classify\.js first/.test(guardMsg), "load-time guard: deps missing → throws at load (" + guardMsg + ")");
var ctxOK = null; try { ctxOK = loadBare(true); } catch (e) {}
ok(!!(ctxOK && ctxOK.OperatingUpload && typeof ctxOK.OperatingUpload.apply === "function"), "browser-mode (window, no require): exports window.OperatingUpload when deps precede it");

function run(label, make){ try { suite(label, make); } catch (e) { fails++; console.log("  FAIL " + label + " threw: " + (e && e.stack || e)); } }
run("in-test fake store (§2 semantics)", function (storage, nowFn){ return new FakeStore(storage, nowFn); });
var real = loadRealStore();
if (real.skip) console.log("\n== store: real operating-store.js — NOT RUN (" + real.skip + ") ==");
else run("real operating-store.js (KEY = " + real.KEY + ")", real.make);

console.log("\n" + passes + " passed, " + fails + " failed — real store " + (real.skip ? "NOT exercised (" + real.skip + ")" : "exercised"));
process.exit(fails ? 1 : 0);
