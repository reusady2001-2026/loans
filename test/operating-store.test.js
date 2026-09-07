/* Tests for operating-store.js (contract §2). Plain node, no framework:
   prints "  ok   …" / "  FAIL …", exits 1 on any failure. Deterministic —
   storage is a Map-backed fake and the clock is injected (tick i → T(i)).
   Run:  node test/operating-store.test.js                                   */
"use strict";
var S = require("../operating-store.js");
var LOANS_KEY = "ldsHub.loans.v7";

/* ---- harness ------------------------------------------------------------ */
var passes = 0, fails = 0;
function ok(cond, msg, detail){
  if (cond) { passes++; console.log("  ok   " + msg); }
  else { fails++; console.log("  FAIL " + msg + (detail ? "\n         " + detail : "")); }
}
function deq(a, b){
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i++) if (!Object.prototype.hasOwnProperty.call(b, ka[i]) || !deq(a[ka[i]], b[ka[i]])) return false;
  return true;
}
function eq(actual, expected, msg){
  var same = deq(actual, expected);
  ok(same, msg, same ? "" : "expected " + JSON.stringify(expected) + "\n         actual   " + JSON.stringify(actual));
}
function throwsType(fn, msg){
  try { fn(); ok(false, msg, "did not throw"); }
  catch (e) { ok(e instanceof TypeError, msg, e instanceof TypeError ? "" : "threw " + String(e)); }
}
function group(name, fn){
  console.log("\n" + name);
  try { fn(); } catch (e) { ok(false, name + " — unexpected exception", (e && e.stack) || String(e)); }
}
// Map-backed storage fake per contract §2; records every key written so a test
// can prove the store touched nothing but its own key.
function fakeStorage(seed){
  var m = new Map(); Object.keys(seed || {}).forEach(function (k){ m.set(k, seed[k]); });
  var s = { writes: [],
    getItem: function (k){ return m.has(k) ? m.get(k) : null; },
    setItem: function (k, v){ s.writes.push(k); m.set(k, String(v)); },
    keys: function (){ return Array.from(m.keys()); } };
  return s;
}
function T(i){ return new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(); }   // T(0) = "2026-01-01T00:00:00.000Z"
function clock(){ var i = 0; return function (){ return T(i++); }; }
function fresh(seed){ var st = fakeStorage(seed); S.init({ storage: st, now: clock() }); return st; }
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/* ---- 1. surface --------------------------------------------------------- */
group("surface", function (){
  eq(S.KEY, "ldsHub.operating.v1", "KEY is exactly \"ldsHub.operating.v1\"");
  ["init","load","all","get","ensure","setLine","setLines","removeLine","setControllable","setAssumptions","setUnits","setPeriod","remove","save"]
    .forEach(function (m){ ok(typeof S[m] === "function", "exports " + m + "()"); });
  eq(Object.keys(S).length, 15, "no extra surface beyond KEY + the 14 contract methods");
  ok(globalThis.OperatingStore === S, "UMD also publishes globalThis.OperatingStore (same object)");
  // Browser global: load a second, throwaway instance with a fake window present.
  var path = require.resolve("../operating-store.js"), saved = require.cache[path];
  globalThis.window = {};
  try { delete require.cache[path]; var inst = require(path); ok(globalThis.window.OperatingStore === inst && inst !== S, "UMD sets window.OperatingStore when a window exists at load time"); }
  finally { delete globalThis.window; require.cache[path] = saved; globalThis.OperatingStore = S; }
  ok(S.init({ storage: fakeStorage(), now: clock() }) === S, "init() returns the api (chainable)");
  throwsType(function (){ S.init({ storage: {} }); }, "init rejects a storage without getItem/setItem");
  throwsType(function (){ S.init({ storage: fakeStorage(), now: "nope" }); }, "init rejects a non-function clock");
});

/* ---- 2. fresh state ----------------------------------------------------- */
group("fresh state", function (){
  var st = fresh();
  eq(S.load(), { version: 1, records: {} }, "load() on empty storage → { version:1, records:{} }");
  eq(st.writes.length, 0, "load() never writes (a read is a read)");
  eq(st.getItem(S.KEY), null, "storage still has nothing under the key after load()");
  eq(S.all(), {}, "all() → {} on a fresh store");
  eq(S.get("addr:nowhere"), null, "get() of an unknown key → null");
  eq(S.get(undefined), null, "get(undefined) → null, no throw");
  eq(S.remove("addr:nowhere"), false, "remove() of an unknown key → false");
  eq(st.writes.length, 0, "…and did not save");
  eq(S.removeLine("addr:nowhere", "RET"), null, "removeLine() on an unknown record → null, no save");
  eq(S.setControllable("addr:nowhere", "RET", true), null, "setControllable() on an unknown record → null, no save");
  eq(st.writes.length, 0, "no-ops did not write");
  ok(S.save() === true && st.getItem(S.KEY) === '{"version":1,"records":{}}', "explicit save() on an empty store writes the exact v1 envelope");
});

/* ---- 3. ensure + record schema ----------------------------------------- */
group("ensure / record schema", function (){
  var st = fresh(), K = "addr:10400 edgewood rd, harrison, oh 45030";
  var r = S.ensure(K, { propertyName: "Villages of Whitewater", units: 232 });
  eq(Object.keys(r), ["propKey","propertyName","units","period","lines","assumptions","meta"], "record keys exactly §2, in order");
  eq(Object.keys(r.meta), ["createdAt","lastUpdated","sourceFile"], "meta keys exactly §2, in order");
  eq(r.propKey, K, "propKey = the key given (never transformed)");
  eq(r.propertyName, "Villages of Whitewater", "propertyName stored");
  eq(r.units, 232, "units stored");
  eq(r.period, null, "period null on create");
  eq(r.lines, {}, "lines {} on create");
  eq(r.assumptions, null, "assumptions null on create (= inherit)");
  eq(r.meta, { createdAt: T(0), lastUpdated: T(0), sourceFile: null }, "meta: createdAt = lastUpdated = first tick, sourceFile null");
  eq(st.writes, [S.KEY], "create persisted with exactly one write, to KEY only");
  eq(JSON.parse(st.getItem(S.KEY)), { version: 1, records: { "addr:10400 edgewood rd, harrison, oh 45030": r } }, "persisted envelope = { version:1, records:{ [key]: record } }");
  var again = S.ensure(K, { propertyName: "Renamed", units: 999 });
  eq(again, r, "ensure() on an existing record returns it unchanged (name/units not overwritten)");
  eq(st.writes.length, 1, "…and does not save");
  eq(S.ensure("name:bare"), { propKey: "name:bare", propertyName: "", units: null, period: null, lines: {}, assumptions: null, meta: { createdAt: T(1), lastUpdated: T(1), sourceFile: null } }, "ensure(key) without opts → empty name, null units");
  var s2 = S.ensure("name:bare", { propertyName: "Now Named", units: 40 });
  eq([s2.propertyName, s2.units], ["Now Named", 40], "ensure() fills a BLANK name / null units on an existing record");
  eq(s2.meta.lastUpdated, T(1), "…without stamping lastUpdated (identity, not operating data)");
  eq(st.writes.length, 3, "…but persists the fill (one write)");
  eq(S.ensure("name:bare", { propertyName: "Other", units: 1 }), s2, "…and never overwrites a filled name/units");
  throwsType(function (){ S.ensure("", { propertyName: "x" }); }, "ensure rejects an empty propKey");
  throwsType(function (){ S.ensure(42, { propertyName: "x" }); }, "ensure rejects a non-string propKey");
  throwsType(function (){ S.ensure("name:x", { propertyName: 7 }); }, "ensure rejects a non-string propertyName");
  throwsType(function (){ S.ensure("name:x", { propertyName: "x", units: "120" }); }, "ensure rejects string units");
  throwsType(function (){ S.ensure("name:x", { propertyName: "x", units: -1 }); }, "ensure rejects negative units");
  eq(S.get("name:x"), null, "a rejected ensure() created nothing");
  // keys that collide with the envelope's own field names are still plain records
  S.ensure("records", { propertyName: "R" }); S.ensure("version", { propertyName: "V" });
  S.init({ storage: st, now: clock() });
  eq(Object.keys(S.all()).sort(), [K, "name:bare", "records", "version"].sort(), "propKeys named \"records\"/\"version\" round-trip (envelope detection is structural)");
});

/* ---- 4. setLine + prevAnnual semantics --------------------------------- */
group("setLine / prevAnnual", function (){
  var st = fresh(), K = "addr:1 main st";
  S.ensure(K, { propertyName: "Main", units: 10 });                       // T0
  var r = S.setLine(K, "RET", { annual: 100000, source: "t12" });        // T1
  eq(Object.keys(r.lines.RET), ["annual","prevAnnual","controllable","source","updatedAt","note"], "line keys exactly §2, in order");
  eq(r.lines.RET, { annual: 100000, prevAnnual: null, controllable: false, source: "t12", updatedAt: T(1), note: null }, "new line: prevAnnual null, RET default non-controllable, stamped");
  eq(r.meta.lastUpdated, T(1), "meta.lastUpdated stamped with the same tick as the line");
  eq(r.meta.createdAt, T(0), "createdAt untouched");
  eq(st.writes.length, 2, "one save per setLine");
  r = S.setLine(K, "RET", { annual: 115000, source: "manual" });         // T2
  eq(r.lines.RET, { annual: 115000, prevAnnual: 100000, controllable: false, source: "manual", updatedAt: T(2), note: null }, "changed amount → prevAnnual = old annual, source replaced, re-stamped");
  r = S.setLine(K, "RET", { annual: 115000, source: "t12", note: "re-upload, same figure" });   // T3
  eq(r.lines.RET, { annual: 115000, prevAnnual: 100000, controllable: false, source: "t12", updatedAt: T(3), note: "re-upload, same figure" }, "same amount → prevAnnual NOT overwritten (still 100000); updatedAt/source/note still update");
  r = S.setLine(K, "RET", { annual: 120000, source: "manual" });         // T4
  eq([r.lines.RET.annual, r.lines.RET.prevAnnual, r.lines.RET.note], [120000, 115000, "re-upload, same figure"], "next change chains prevAnnual (115000); note kept when omitted");
  r = S.setLine(K, "RET", { annual: 120000, source: "manual", note: null });   // T5
  eq(r.lines.RET.note, null, "note:null clears the note");
  r = S.setLine(K, "RET", { annual: 120000, source: "manual", note: "" });
  eq(r.lines.RET.note, null, "note:\"\" is stored as null (canonical)");
  r = S.setLine(K, "RET", { annual: 120000, source: "manual", controllable: true });
  eq(r.lines.RET.controllable, true, "controllable in the patch overrides the default");
  r = S.setLine(K, "RET", { annual: 121000, source: "manual" });
  eq(r.lines.RET.controllable, true, "…and a later patch without controllable keeps the user's flag");
  r = S.setLine(K, "VAC", { annual: -42000.5, source: "t12" });
  eq(r.lines.VAC.annual, -42000.5, "negative amounts (rental deductions) stored as given, to the cent");
  r = S.setLine(K, "OTH", { annual: 0, source: "budget" });
  eq(r.lines.OTH, { annual: 0, prevAnnual: null, controllable: true, source: "budget", updatedAt: T(10), note: null }, "annual 0 is a valid line; source budget accepted");
  // implicit create: a setter on an unknown key creates the record with ONE tick
  r = S.setLine("name:implicit", "GPR", { annual: 500000, source: "manual" });   // T11
  eq(r, { propKey: "name:implicit", propertyName: "", units: null, period: null,
          lines: { GPR: { annual: 500000, prevAnnual: null, controllable: true, source: "manual", updatedAt: T(11), note: null } },
          assumptions: null, meta: { createdAt: T(11), lastUpdated: T(11), sourceFile: null } }, "setLine on an unknown key creates the record: createdAt = lastUpdated = updatedAt");
  // strictness — and nothing changes on a rejected call
  var before = S.get(K), writes = st.writes.length;
  throwsType(function (){ S.setLine(K, "RET", { annual: NaN, source: "manual" }); }, "rejects annual NaN");
  throwsType(function (){ S.setLine(K, "RET", { annual: Infinity, source: "manual" }); }, "rejects annual Infinity");
  throwsType(function (){ S.setLine(K, "RET", { annual: "100", source: "manual" }); }, "rejects a string annual");
  throwsType(function (){ S.setLine(K, "RET", { source: "manual" }); }, "rejects a missing annual");
  throwsType(function (){ S.setLine(K, "RET", { annual: 1 }); }, "rejects a missing source");
  throwsType(function (){ S.setLine(K, "RET", { annual: 1, source: "excel" }); }, "rejects an unknown source");
  throwsType(function (){ S.setLine(K, "RET", { annual: 1, source: "manual", controllable: "yes" }); }, "rejects a non-boolean controllable");
  throwsType(function (){ S.setLine(K, "RET", { annual: 1, source: "manual", note: 5 }); }, "rejects a non-string note");
  throwsType(function (){ S.setLine(K, "", { annual: 1, source: "manual" }); }, "rejects an empty code");
  throwsType(function (){ S.setLine(K, "RET", null); }, "rejects a null patch");
  throwsType(function (){ S.setLine(null, "RET", { annual: 1, source: "manual" }); }, "rejects a null propKey");
  eq(S.get(K), before, "record unchanged after rejected writes");
  eq(st.writes.length, writes, "no save on a rejected write");
});

/* ---- 5. controllable defaults + setControllable ------------------------ */
group("controllable defaults (contract §3) / setControllable", function (){
  var st = fresh(), K = "addr:2 oak st";
  var income = ["GPR","EMPL","MOD","VAC","CONC","BD","RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH"];
  var expense = ["RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL"];
  var lines = {}; income.concat(expense).forEach(function (c){ lines[c] = { annual: 1, source: "manual" }; });
  var r = S.setLines(K, lines);
  var got = {}; Object.keys(r.lines).forEach(function (c){ got[c] = r.lines[c].controllable; });
  var want = {}; income.forEach(function (c){ want[c] = true; }); expense.forEach(function (c){ want[c] = (c !== "RET" && c !== "INS"); });
  eq(got, want, "defaults: RET/INS false, every other expense true, every income code true (all 32 codes)");
  eq(S.setLine(K, "ZZZ", { annual: 1, source: "manual" }).lines.ZZZ.controllable, true, "unknown code defaults to controllable");
  var writes = st.writes.length;
  r = S.setControllable(K, "RET", true);                                    // T2
  eq([r.lines.RET.controllable, r.meta.lastUpdated, r.lines.RET.updatedAt], [true, T(2), T(0)], "flip persists, stamps meta.lastUpdated, leaves the line's amount date alone");
  eq(st.writes.length, writes + 1, "one save");
  S.init({ storage: st, now: clock() });
  eq(S.get(K).lines.RET.controllable, true, "the flip survives a reload");
  eq(S.setControllable(K, "NOPE", false), null, "unknown line → null");
  eq(st.writes.length, writes + 1, "…no save");
  throwsType(function (){ S.setControllable(K, "RET", "false"); }, "rejects a non-boolean flag");
});

/* ---- 6. setLines (bulk, one save) --------------------------------------- */
group("setLines", function (){
  var st = fresh(), K = "addr:3 elm st";
  S.ensure(K, { propertyName: "Elm", units: 50 });                        // T0
  S.setLine(K, "INS", { annual: 30000, source: "manual" });               // T1
  S.setLine(K, "UTIL", { annual: 80000, source: "manual", note: "keep me" });   // T2
  var writes = st.writes.length;
  var patch = { RET: { annual: 200000, source: "t12" }, INS: { annual: 33000, source: "t12" }, GPR: { annual: 1500000, source: "t12" } };
  var r = S.setLines(K, patch, { sourceFile: "crest-t12.xlsx", period: "T12 ending 2025-06-30" });   // T3
  eq(st.writes.length, writes + 1, "bulk write = exactly ONE save");
  eq(r.lines.RET, { annual: 200000, prevAnnual: null, controllable: false, source: "t12", updatedAt: T(3), note: null }, "new line written");
  eq(r.lines.INS, { annual: 33000, prevAnnual: 30000, controllable: false, source: "t12", updatedAt: T(3), note: null }, "existing line: prevAnnual = old annual, source → t12");
  eq(r.lines.GPR.updatedAt, T(3), "every bulk line shares the batch timestamp");
  eq(r.lines.UTIL, { annual: 80000, prevAnnual: null, controllable: true, source: "manual", updatedAt: T(2), note: "keep me" }, "a line absent from the bulk is untouched");
  eq([r.meta.sourceFile, r.period, r.meta.lastUpdated], ["crest-t12.xlsx", "T12 ending 2025-06-30", T(3)], "sourceFile + period set, lastUpdated = batch tick");
  patch.RET.annual = 1; patch.NEW = { annual: 1, source: "manual" };
  eq(S.get(K).lines.RET.annual, 200000, "the caller's patch object is not held by reference");
  r = S.setLines(K, { RET: { annual: 200000, source: "t12" } });          // T4, no opts
  eq([r.meta.sourceFile, r.period, r.lines.RET.prevAnnual], ["crest-t12.xlsx", "T12 ending 2025-06-30", null], "opts omitted → sourceFile/period untouched; same amount → prevAnnual stays null");
  r = S.setLines(K, {}, { sourceFile: null, period: "" });                // T5
  eq([r.meta.sourceFile, r.period, r.meta.lastUpdated], [null, null, T(5)], "null / \"\" clear sourceFile and period; empty bulk still stamps");
  var before = S.get(K), w2 = st.writes.length;
  throwsType(function (){ S.setLines(K, { GPR: { annual: 1600000, source: "t12" }, BAD: { annual: "x", source: "t12" } }); }, "one bad entry rejects the whole bulk");
  eq(S.get(K), before, "…and nothing was written (validate-all-first)");
  eq(st.writes.length, w2, "…no save");
  throwsType(function (){ S.setLines(K, [1, 2]); }, "rejects a non-object lines argument");
  throwsType(function (){ S.setLines(K, {}, { sourceFile: 5 }); }, "rejects a non-string sourceFile");
  throwsType(function (){ S.setLines(K, {}, { period: 5 }); }, "rejects a non-string period");
});

/* ---- 7. removeLine / setUnits / setPeriod / remove --------------------- */
group("removeLine / setUnits / setPeriod / remove", function (){
  var st = fresh(), K = "addr:4 pine st";
  S.setLines(K, { RET: { annual: 1, source: "manual" }, INS: { annual: 2, source: "manual" } });   // T0
  var writes = st.writes.length;
  var r = S.removeLine(K, "RET");                                          // T1
  eq(Object.keys(r.lines), ["INS"], "removeLine drops the line");
  eq(r.meta.lastUpdated, T(1), "…and stamps lastUpdated");
  eq(st.writes.length, writes + 1, "…one save");
  eq(S.removeLine(K, "RET"), r, "removing a missing line is a no-op returning the record");
  eq(st.writes.length, writes + 1, "…with no save");
  r = S.setUnits(K, 120);                                                  // T2
  eq([r.units, r.meta.lastUpdated], [120, T(2)], "setUnits sets + stamps");
  eq(S.setUnits(K, null).units, null, "setUnits(null) clears");
  throwsType(function (){ S.setUnits(K, "120"); }, "setUnits rejects a string");
  throwsType(function (){ S.setUnits(K, -5); }, "setUnits rejects a negative");
  throwsType(function (){ S.setUnits(K, undefined); }, "setUnits rejects undefined (null is the explicit clear)");
  r = S.setPeriod(K, "T12 ending 2025-12-31");                             // T4
  eq([r.period, r.meta.lastUpdated], ["T12 ending 2025-12-31", T(4)], "setPeriod sets + stamps");
  eq(S.setPeriod(K, "").period, null, "setPeriod(\"\") → null");
  eq(S.setPeriod(K, null).period, null, "setPeriod(null) → null");
  throwsType(function (){ S.setPeriod(K, 2025); }, "setPeriod rejects a number");
  eq(S.setUnits("name:new-by-units", 8).meta.createdAt, T(7), "setUnits on an unknown key creates the record");
  eq(S.setPeriod("name:new-by-period", "x").propKey, "name:new-by-period", "setPeriod on an unknown key creates the record");
  writes = st.writes.length;
  eq(S.remove(K), true, "remove() → true for an existing record");
  eq(S.get(K), null, "…record gone");
  ok(!JSON.parse(st.getItem(S.KEY)).records[K], "…and gone from storage");
  eq(st.writes.length, writes + 1, "…one save");
  eq(S.remove(K), false, "remove() again → false");
  eq(S.remove(42), false, "remove(non-string) → false, no throw");
  eq(st.writes.length, writes + 1, "…no save for the no-ops");
});

/* ---- 8. assumptions ----------------------------------------------------- */
group("setAssumptions (deep merge / clear)", function (){
  var st = fresh(), K = "addr:5 birch st";
  S.ensure(K, { propertyName: "Birch" });                                  // T0
  var r = S.setAssumptions(K, { vacancyPct: 0.07, sizing: { capRate: 0.06 } });   // T1
  eq(r.assumptions, { vacancyPct: 0.07, sizing: { capRate: 0.06 } }, "first patch stored as given");
  eq(r.meta.lastUpdated, T(1), "stamps lastUpdated");
  r = S.setAssumptions(K, { sizing: { dscrMin: 1.25 }, mgmtPct: 0.03 });
  eq(r.assumptions, { vacancyPct: 0.07, sizing: { capRate: 0.06, dscrMin: 1.25 }, mgmtPct: 0.03 }, "deep merge keeps sibling fields at every level");
  r = S.setAssumptions(K, { sizing: { capRate: 0.065 } });
  eq(r.assumptions.sizing, { capRate: 0.065, dscrMin: 1.25 }, "nested override replaces just that leaf");
  r = S.setAssumptions(K, { sizing: { capRate: null } });
  eq(r.assumptions, { vacancyPct: 0.07, sizing: { dscrMin: 1.25 }, mgmtPct: 0.03 }, "null on a nested leaf clears that field → inherit");
  r = S.setAssumptions(K, { sizing: { dscrMin: null } });
  eq(r.assumptions, { vacancyPct: 0.07, mgmtPct: 0.03 }, "an emptied sub-object is pruned (never {} in storage)");
  r = S.setAssumptions(K, { mgmtPct: null, vacancyPct: null, ignored: undefined });
  eq(r.assumptions, null, "clearing every field yields null (fully inherit); undefined entries are skipped");
  r = S.setAssumptions(K, { sizing: { ltvMax: 0.7, amortYears: 30 }, reservePerUnit: 250 });
  eq(r.assumptions, { sizing: { ltvMax: 0.7, amortYears: 30 }, reservePerUnit: 250 }, "re-populate after a full clear");
  r = S.setAssumptions(K, { sizing: null });
  eq(r.assumptions, { reservePerUnit: 250 }, "null on a sub-object removes the whole subtree");
  var patch = { sizing: { capRate: 0.05 } };
  S.setAssumptions(K, patch); patch.sizing.capRate = 0.09;
  eq(S.get(K).assumptions.sizing.capRate, 0.05, "the patch object is not held by reference");
  var w = st.writes.length;
  r = S.setAssumptions(K, null);                                           // T9
  eq([r.assumptions, r.meta.lastUpdated, st.writes.length], [null, T(10), w + 1], "setAssumptions(null) clears to inherit, stamps, saves");
  eq(S.setAssumptions("name:new-by-assump", { vacancyPct: 0.1 }).assumptions, { vacancyPct: 0.1 }, "on an unknown key creates the record");
  var before = S.get(K); w = st.writes.length;
  throwsType(function (){ S.setAssumptions(K, 5); }, "rejects a non-object patch");
  throwsType(function (){ S.setAssumptions(K, { vacancyPct: "0.05" }); }, "rejects a string leaf");
  throwsType(function (){ S.setAssumptions(K, { vacancyPct: NaN }); }, "rejects NaN");
  throwsType(function (){ S.setAssumptions(K, { sizing: [0.05] }); }, "rejects an array");
  throwsType(function (){ S.setAssumptions(K, { sizing: { capRate: true } }); }, "rejects a nested boolean");
  throwsType(function (){ S.setAssumptions(K, { vacancyPct: 0.05, sizing: { capRate: "x" } }); }, "a bad nested leaf rejects the whole patch");
  eq(S.get(K), before, "…nothing applied (validate-first)");
  eq(st.writes.length, w, "…no save");
});

/* ---- 9. persistence across reload -------------------------------------- */
group("persistence", function (){
  var st = fresh(), K1 = "addr:6 cedar st", K2 = "name:mezz co (mezz)";
  S.ensure(K1, { propertyName: "Cedar", units: 88 });
  S.setLines(K1, { GPR: { annual: 2000000.25, source: "t12" }, VAC: { annual: -100000, source: "t12" }, RET: { annual: 250000, source: "t12" } }, { sourceFile: "cedar.xlsx", period: "T12 2025" });
  S.setLine(K1, "RET", { annual: 275000, source: "manual", note: "reassessed" });
  S.setControllable(K1, "GPR", false);
  S.setAssumptions(K1, { sizing: { capRate: 0.0575 } });
  S.ensure(K2, { propertyName: "Mezz Co" });
  S.setUnits(K2, 12); S.setPeriod(K2, "Budget 2026");
  var snapshot = S.all(), raw = st.getItem(S.KEY);
  ok(raw.indexOf('{"version":1,"records":{') === 0, "persisted string opens with the v1 envelope");
  S.init({ storage: st, now: clock() });
  var reloaded = S.load();
  eq(reloaded, { version: 1, records: snapshot }, "fresh init + load() → identical records (field-by-field)");
  eq(S.all(), snapshot, "all() after reload identical");
  eq(st.getItem(S.KEY), raw, "load() did not rewrite storage (byte-identical)");
  eq(S.get(K1).lines.RET, { annual: 275000, prevAnnual: 250000, controllable: false, source: "manual", updatedAt: T(2), note: "reassessed" }, "a line survives the round trip exactly");
  S.init({ storage: st, now: clock() });
  eq(S.get(K2).period, "Budget 2026", "lazy load: get() before load() reads storage");
});

/* ---- 10. migration ------------------------------------------------------ */
group("migration", function (){
  var v1rec = { propKey: "addr:7 ash st", propertyName: "Ash", units: 30, period: "T12 2024",
    lines: { RET: { annual: 50000, prevAnnual: 48000, controllable: false, source: "t12", updatedAt: "2025-01-02T03:04:05.000Z", note: "n" } },
    assumptions: { vacancyPct: 0.06, sizing: { capRate: 0.07 } },
    meta: { createdAt: "2024-12-31T00:00:00.000Z", lastUpdated: "2025-01-02T03:04:05.000Z", sourceFile: "ash.xlsx" } };
  // (a) wrapper without a version field
  var st = fresh({ "ldsHub.operating.v1": JSON.stringify({ records: { "addr:7 ash st": v1rec } }) });
  eq(S.load(), { version: 1, records: { "addr:7 ash st": v1rec } }, "missing version → upgraded, record byte-for-byte preserved");
  eq(st.writes.length, 0, "migration on load does not write");
  S.setPeriod("addr:7 ash st", "T12 2025");
  eq(JSON.parse(st.getItem(S.KEY)).version, 1, "first write persists version 1");
  // (b) version 0 with sparse records / lines → defaults filled, data kept
  st = fresh({ "ldsHub.operating.v1": JSON.stringify({ version: 0, records: {
    "addr:8 fir st": { propertyName: "Fir", units: "45", period: "P", lines: { INS: { annual: "12,345.67", source: "t12", updatedAt: "2025-05-05T00:00:00.000Z" }, GA: { annual: 999 }, BAD: { annual: "n/a" }, X: 7 },
                       meta: { lastUpdated: "2025-06-06T00:00:00.000Z", sourceFile: "" } } } }) });
  eq(S.load().records["addr:8 fir st"], { propKey: "addr:8 fir st", propertyName: "Fir", units: 45, period: "P",
      lines: { INS: { annual: 12345.67, prevAnnual: null, controllable: false, source: "t12", updatedAt: "2025-05-05T00:00:00.000Z", note: null },
               GA:  { annual: 999, prevAnnual: null, controllable: true, source: "manual", updatedAt: "2025-06-06T00:00:00.000Z", note: null } },
      assumptions: null, meta: { createdAt: "2025-06-06T00:00:00.000Z", lastUpdated: "2025-06-06T00:00:00.000Z", sourceFile: null } },
    "version 0: prevAnnual/controllable/source/note/createdAt/assumptions defaulted, numeric strings coerced, unreadable lines dropped, data kept");
  eq(st.writes.length, 0, "…no write, and no clock tick was needed");
  // (c) SPEC-draft flat map keyed by loanId (no wrapper)
  st = fresh({ "ldsHub.operating.v1": JSON.stringify({ L1: { loanId: "L1", units: 80, period: "T12 2025",
      lines: { RET: { annual: 5000, controllable: false, source: "t12", updatedAt: "2025-07-01T00:00:00.000Z" } },
      assumptions: { vacancyPct: 0.05, sizing: { capRate: 0.06 }, junk: "x", empty: {} },
      meta: { lastUpdated: "2025-07-01T00:00:00.000Z", sourceFile: "x.xlsx" } }, L2: "garbage" }) });
  eq(S.load().records, { L1: { propKey: "L1", propertyName: "", units: 80, period: "T12 2025",
      lines: { RET: { annual: 5000, prevAnnual: null, controllable: false, source: "t12", updatedAt: "2025-07-01T00:00:00.000Z", note: null } },
      assumptions: { vacancyPct: 0.05, sizing: { capRate: 0.06 } },
      meta: { createdAt: "2025-07-01T00:00:00.000Z", lastUpdated: "2025-07-01T00:00:00.000Z", sourceFile: "x.xlsx" } } },
    "legacy flat map → wrapped; loanId dropped (schema exact), createdAt from lastUpdated, junk assumption leaves pruned, non-object entries dropped");
  // (d) record with no dates at all → one injected clock tick for every backfilled date
  st = fresh({ "ldsHub.operating.v1": JSON.stringify({ records: { "name:nodates": { lines: { RET: { annual: 1 } } }, "name:nodates2": {} } }) });
  var recs = S.load().records;
  eq([recs["name:nodates"].meta, recs["name:nodates"].lines.RET.updatedAt, recs["name:nodates2"].meta.createdAt],
     [{ createdAt: T(0), lastUpdated: T(0), sourceFile: null }, T(0), T(0)], "missing dates backfilled from ONE now() call for the whole load");
  // (e) idempotent, and a newer version is read best-effort
  st = fresh({ "ldsHub.operating.v1": JSON.stringify({ version: 2, records: { "addr:7 ash st": v1rec } }) });
  var first = S.load(); var second = S.load();
  eq(first, second, "load() twice → identical (idempotent)");
  eq(first.records["addr:7 ash st"], v1rec, "a newer version's records are kept (best effort), never blanked");
  // (f) wrong shapes → empty, no throw
  [JSON.stringify({ version: 1, records: "nope" }), JSON.stringify({ version: 1 }), "[]", "42", "\"str\"", "null", "true"].forEach(function (blob){
    fresh({ "ldsHub.operating.v1": blob });
    eq(S.load(), { version: 1, records: {} }, "non-record shape " + blob + " → empty state");
  });
});

/* ---- 11. corrupt storage ------------------------------------------------ */
group("corrupt / hostile storage", function (){
  var st = fresh({ "ldsHub.operating.v1": "{not json" });
  var state;
  try { state = S.load(); ok(true, "corrupt JSON: load() does not throw"); } catch (e) { ok(false, "corrupt JSON: load() threw", String(e)); }
  eq(state, { version: 1, records: {} }, "corrupt JSON → fresh empty state");
  eq(st.getItem(S.KEY), "{not json", "the corrupt blob is left untouched by load()");
  S.ensure("name:after", { propertyName: "After" });
  eq(JSON.parse(st.getItem(S.KEY)), { version: 1, records: { "name:after": S.get("name:after") } }, "the first real write replaces it with a valid envelope");
  fresh({ "ldsHub.operating.v1": "" });
  eq(S.load(), { version: 1, records: {} }, "empty string → empty state");
  S.init({ storage: { getItem: function (){ throw new Error("boom"); }, setItem: function (){ throw new Error("boom"); } }, now: clock() });
  try { state = S.load(); ok(true, "getItem that throws: load() does not throw"); } catch (e) { ok(false, "getItem that throws: load() threw", String(e)); }
  eq(state, { version: 1, records: {} }, "…and yields an empty state");
  var r = S.ensure("name:x", { propertyName: "X" });
  eq(S.save(), false, "setItem that throws: save() returns false, no throw");
  eq(S.get("name:x"), r, "…while the in-memory state keeps the write");
});

/* ---- 12. reads are copies ---------------------------------------------- */
group("reads are copies", function (){
  fresh(); var K = "addr:9 maple st";
  S.ensure(K, { propertyName: "Maple", units: 5 });
  S.setLine(K, "RET", { annual: 100, source: "manual" });
  S.setAssumptions(K, { sizing: { capRate: 0.06 } });
  var snap = S.get(K);
  var a = S.all(); a[K].lines.RET.annual = 999; delete a[K].lines.RET.note; a[K].lines.NEW = { annual: 1 }; a[K].assumptions.sizing.capRate = 1; a[K].meta.lastUpdated = "x"; a[K].units = 0; delete a["addr:9 maple st"];
  eq(S.get(K), snap, "mutating all()'s result (leaf, delete, add, nested, meta, top-level delete) leaves the store unchanged");
  var g = S.get(K); g.lines.RET.annual = 1; g.assumptions = null; g.propertyName = "hacked";
  eq(S.get(K), snap, "mutating get()'s result leaves the store unchanged");
  var l = S.load(); l.records[K].lines.RET.annual = 2; l.version = 9;
  eq(S.get(K), snap, "mutating load()'s result leaves the store unchanged");
  var e = S.ensure(K); e.lines.RET.annual = 3;
  eq(S.get(K), snap, "mutating ensure()'s result leaves the store unchanged");
  var w = S.setLine(K, "INS", { annual: 5, source: "manual" }); w.lines.INS.annual = 6; w.lines.RET.annual = 7;
  eq(S.get(K).lines.INS.annual, 5, "mutating a setter's returned record leaves the store unchanged");
  ok(S.get(K) !== S.get(K) && S.all()[K] !== S.all()[K], "every read is a distinct object");
});

/* ---- 13. isolation from the loans store -------------------------------- */
group("isolation: loans store + loan objects untouched", function (){
  var loans = [
    { _id: "L-1", propertyName: "Villages of Whitewater", propertyAddress: "10400 Edgewood Rd, Harrison, OH 45030", propertyType: "Multifamily",
      lenderName: "Bellwether Enterprise (Fannie)", originalAmount: 11392000, annualRate: 0.047, rateType: "Fixed", originationDate: "2017-07-31",
      maturityDate: "2032-08-01", amortizationMonths: 360, ioMonths: 0, noi: 1234567.89, replacementReserve: 1522, notes: { a: [1, 2, { b: 3 }] } },
    { _id: "L-2", propertyName: "Villages of Whitewater (Mezz)", propertyAddress: "10400 Edgewood Rd, Harrison, OH 45030", lienPosition: "Mezzanine",
      originalAmount: 2000000, annualRate: 0.11, maturityDate: "2032-08-01" }
  ];
  var loansRaw = JSON.stringify(loans);
  var st = fresh({ "ldsHub.loans.v7": loansRaw, "ldsHub.uw.v1": "{\"x\":1}" });
  var loan = loans[0], loanSnap = JSON.stringify(loan), loanCopy = JSON.parse(loanSnap);
  var K = "addr:" + loan.propertyAddress.trim().toLowerCase();
  // every read + write method, with loan-derived arguments — including the loan object itself as ensure()'s opts
  S.load(); S.all(); S.get(K);
  S.ensure(K, loan);
  S.setLine(K, "GPR", { annual: loan.originalAmount, source: "manual", note: loan.propertyName });
  S.setLines(K, { RET: { annual: 250000, source: "t12" }, INS: { annual: loan.noi, source: "t12", controllable: true } }, { sourceFile: loan.propertyName + ".xlsx", period: loan.maturityDate });
  S.setControllable(K, "RET", true);
  S.removeLine(K, "INS");
  S.setAssumptions(K, { sizing: { intRate: loan.annualRate, amortYears: loan.amortizationMonths / 12 } });
  S.setUnits(K, 232); S.setPeriod(K, "T12"); S.save();
  S.ensure("name:tmp", { propertyName: "tmp" }); S.remove("name:tmp");
  S.init({ storage: st, now: clock() }); S.load();
  eq(st.getItem(LOANS_KEY), loansRaw, "loans store string is byte-identical after every write method");
  eq(st.getItem("ldsHub.uw.v1"), "{\"x\":1}", "an unrelated key is byte-identical too");
  eq(JSON.stringify(loan), loanSnap, "the loan object passed to ensure() is byte-identical");
  eq(loan, loanCopy, "…and deep-equal to its snapshot");
  eq(JSON.stringify(loans), loansRaw, "the whole loans array is unchanged");
  ok(st.writes.length > 0 && st.writes.every(function (k){ return k === S.KEY; }), "every setItem call targeted KEY only (" + st.writes.length + " writes)");
  eq(st.keys().sort(), ["ldsHub.loans.v7", "ldsHub.operating.v1", "ldsHub.uw.v1"], "no other keys were created");
  var rec = S.get(K);
  eq(Object.keys(rec), ["propKey","propertyName","units","period","lines","assumptions","meta"], "ensure(key, loan) copied only the identity fields — no loan fields leaked into the record");
  eq([rec.propertyName, rec.units], ["Villages of Whitewater", 232], "…propertyName from the loan, units from setUnits");
});

/* ---- 14. defaults: storage + clock ------------------------------------- */
group("defaults (window.localStorage, ISO clock)", function (){
  var ls = fakeStorage();
  globalThis.window = { localStorage: ls };
  try {
    S.init();
    S.ensure("name:browser", { propertyName: "B" });
    ok(ls.writes.length === 1 && JSON.parse(ls.getItem(S.KEY)).records["name:browser"].propertyName === "B", "init() without storage writes to window.localStorage when present");
    var iso = S.get("name:browser").meta.createdAt;
    ok(ISO_RE.test(iso) && Math.abs(Date.parse(iso) - Date.now()) < 5000, "default clock stamps a current ISO-8601 UTC timestamp: " + iso);
  } finally { delete globalThis.window; }
  S.init();
  S.ensure("name:mem", { propertyName: "M" });
  eq(S.get("name:mem").propertyName, "M", "init() with no window falls back to an in-memory store (API keeps working)");
  eq(ls.writes.length, 1, "…and does not touch the earlier localStorage fake");
});

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
