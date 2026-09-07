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
// A call that must SUCCEED: reports a throw as a FAIL (instead of aborting the group) and returns null so follow-up checks stay null-safe.
function attempt(fn, msg){ try { var v = fn(); ok(true, msg); return v; } catch (e) { ok(false, msg, "threw " + String(e)); return null; } }
function group(name, fn){
  console.log("\n" + name);
  try { fn(); } catch (e) { ok(false, name + " — unexpected exception", (e && e.stack) || String(e)); }
}
// Map-backed storage fake per contract §2; logs every key READ and WRITTEN so a
// test can prove the store touched nothing but its own key (§0: the loans store
// must never even be read). peek() reads and poke() alters the blob behind the
// store's back without logging — poke is how a test proves a reload really
// re-reads storage instead of serving stale memory.
function fakeStorage(seed){
  var m = new Map(); Object.keys(seed || {}).forEach(function (k){ m.set(k, seed[k]); });
  var s = { writes: [], reads: [],
    getItem: function (k){ s.reads.push(k); return m.has(k) ? m.get(k) : null; },
    setItem: function (k, v){ s.writes.push(k); m.set(k, String(v)); },
    peek: function (k){ return m.has(k) ? m.get(k) : null; },
    poke: function (k, fn){ var o = JSON.parse(m.get(k)); fn(o); m.set(k, JSON.stringify(o)); },
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
  ["init","load","all","get","ensure","setLine","setLines","removeLine","setControllable","setAssumptions","setUnits","setPeriod","remove","rename","save"]
    .forEach(function (m){ ok(typeof S[m] === "function", "exports " + m + "()"); });
  eq(Object.keys(S).length, 17, "no extra surface beyond KEY + CODES + the 14 contract methods + rename");
  ok(Array.isArray(S.CODES) && Object.isFrozen(S.CODES) && S.CODES.length === 33 && S.CODES.indexOf("TRSH RUB") >= 0 && S.CODES.indexOf("BDX") === S.CODES.indexOf("GA") + 1, "CODES: frozen list of the 33 taxonomy codes, BDX right after GA");
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
  eq(S.rename("addr:nowhere", "addr:elsewhere"), false, "rename() of an unknown key → false");
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
  eq(again, Object.assign({}, r, { propertyName: "Renamed" }), "ensure() on an existing record refreshes a changed name (identity comes from the loans) and leaves filled units alone");
  eq(st.writes.length, 2, "…persisting that with one save");
  eq(S.ensure(K, { propertyName: "Renamed", units: 999 }), again, "…and is a no-op when nothing differs");
  eq(st.writes.length, 2, "…with no save");
  eq(S.ensure("name:bare"), { propKey: "name:bare", propertyName: "", units: null, period: null, lines: {}, assumptions: null, meta: { createdAt: T(1), lastUpdated: T(1), sourceFile: null } }, "ensure(key) without opts → empty name, null units");
  var s2 = S.ensure("name:bare", { propertyName: "Now Named", units: 40 });
  eq([s2.propertyName, s2.units], ["Now Named", 40], "ensure() fills a BLANK name / null units on an existing record");
  eq(s2.meta.lastUpdated, T(1), "…without stamping lastUpdated (identity, not operating data)");
  eq(st.writes.length, 4, "…but persists the fill (one write)");
  eq(S.ensure("name:bare", { propertyName: "Other", units: 1 }), Object.assign({}, s2, { propertyName: "Other" }), "…a later different name is refreshed; filled units are never overwritten");
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

/* ---- 3b. ensure refreshes a changed name / rename ---------------------- */
group("ensure refreshes a changed name / rename", function (){
  var LB = '[{"_id":"L-9","propertyName":"Walnut Apartments","propertyAddress":"11 Walnut St"}]';
  var st = fresh({ "ldsHub.loans.v7": LB }), K = "addr:11 walnut st", K2 = "addr:11 walnut street";
  S.ensure(K, { propertyName: "Walnut Apts", units: 60 });               // T0
  S.setLine(K, "RET", { annual: 1000, source: "manual" });               // T1
  S.setAssumptions(K, { sizing: { capRate: 0.06 } });                    // T2
  S.setPeriod(K, "T12 2025");                                            // T3
  var w = st.writes.length;
  var r = S.ensure(K, { propertyName: "Walnut Apartments", units: 61 });
  eq([r.propertyName, r.units, r.meta.lastUpdated], ["Walnut Apartments", 60, T(3)], "a DIFFERENT non-blank name is refreshed from the loan; units already set are kept; lastUpdated NOT stamped");
  eq(st.writes.length, w + 1, "…persisted with one save");
  eq(S.ensure(K, { propertyName: "Walnut Apartments" }), r, "same name again → no change");
  eq(st.writes.length, w + 1, "…and no save");
  eq(S.ensure(K, { propertyName: "" }).propertyName, "Walnut Apartments", "a blank name never clobbers a real one");
  eq(S.ensure(K).propertyName, "Walnut Apartments", "no opts → name untouched");
  eq(S.ensure(K, { propertyName: "Walnut Apartments", units: null }).units, 60, "units are never overwritten with null");
  eq(S.ensure(K, { propertyName: "Walnut Apartments", units: undefined }).units, 60, "…or with undefined");
  eq(st.writes.length, w + 1, "…none of those saved");
  S.init({ storage: st, now: clock() });
  eq(S.get(K).propertyName, "Walnut Apartments", "the refreshed name survives a reload");
  // rename: the record follows a changed §1 key (an address edit)
  var snap = S.get(K); w = st.writes.length;
  eq(S.rename(K, K2), true, "rename(old, new) → true");
  eq(st.writes.length, w + 1, "…ONE save");
  eq(S.get(K), null, "old key gone");
  eq(S.get(K2), Object.assign({}, snap, { propKey: K2 }), "record moved intact — lines, assumptions, meta, units, period preserved; only propKey changed; lastUpdated not stamped");
  eq(Object.keys(S.get(K2)), Object.keys(snap), "field order unchanged");
  S.init({ storage: st, now: clock() });
  eq([S.get(K2) && S.get(K2).propKey, S.get(K)], [K2, null], "the move persisted");
  // refusals: false, nothing changed, nothing saved
  S.ensure("addr:taken", { propertyName: "Taken" });
  var before = S.all(); w = st.writes.length;
  eq(S.rename("addr:nope", "addr:free"), false, "unknown oldKey → false");
  eq(S.rename(K2, "addr:taken"), false, "newKey already has a record → false (never merges/destroys)");
  eq(S.rename(K2, K2), false, "equal keys → false");
  eq(S.rename(K2, ""), false, "empty newKey → false");
  eq(S.rename("", K2), false, "empty oldKey → false");
  eq(S.rename(K2, 42), false, "non-string newKey → false");
  eq(S.rename(null, K2), false, "null oldKey → false");
  eq(S.rename(K2, "__proto__"), false, "reserved newKey → false");
  eq(S.all(), before, "…nothing changed");
  eq(st.writes.length, w, "…nothing saved");
  eq(st.peek(LOANS_KEY), LB, "loans store byte-identical through the name refresh and the renames");
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
  r = S.setLine(K, "INS", { annual: 50000, source: "t12", controllable: true });
  eq(r.lines.INS.controllable, true, "controllable:true in the patch is applied when the line is CREATED (INS would default false)");
  r = S.setLine(K, "GPR", { annual: 1, source: "manual", controllable: false });
  eq(r.lines.GPR.controllable, false, "controllable:false applied on creation of an income line (default true)");
  r = S.setLine(K, "TRSH RUB", { annual: 12000, source: "t12" });
  eq(r.lines["TRSH RUB"].annual, 12000, "a code with a space (\"TRSH RUB\") is accepted verbatim");
  // strictness — and nothing changes on a rejected call
  var before = S.get(K), writes = st.writes.length;
  throwsType(function (){ S.setLine(K, "FOO", { annual: 1, source: "manual" }); }, "rejects an unknown code (FOO)");
  throwsType(function (){ S.setLine(K, "gpr", { annual: 1, source: "manual" }); }, "rejects a mis-cased code (gpr)");
  throwsType(function (){ S.setLine(K, "RET ", { annual: 1, source: "manual" }); }, "rejects a code with stray whitespace");
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
  var expense = ["RET","INS","UTIL","RM","CS","PAY","MGMT","GA","BDX","MKT","TRSH","CAB","PLL"];
  var lines = {}; income.concat(expense).forEach(function (c){ lines[c] = { annual: 1, source: "manual" }; });
  var r = S.setLines(K, lines);
  var got = {}; Object.keys(r.lines).forEach(function (c){ got[c] = r.lines[c].controllable; });
  var want = {}; income.forEach(function (c){ want[c] = true; }); expense.forEach(function (c){ want[c] = (c !== "RET" && c !== "INS"); });
  eq(got, want, "defaults: RET/INS false, every other expense true, every income code true (all 33 codes, incl. BDX)");
  throwsType(function (){ S.setLine(K, "ZZZ", { annual: 1, source: "manual" }); }, "an unknown code is rejected (TypeError) — no line, no default");
  var writes = st.writes.length;
  r = S.setControllable(K, "RET", true);                                    // T1 (the rejected ZZZ consumed no tick)
  eq([r.lines.RET.controllable, r.meta.lastUpdated, r.lines.RET.updatedAt], [true, T(1), T(0)], "flip persists, stamps meta.lastUpdated, leaves the line's amount date alone");
  eq(st.writes.length, writes + 1, "one save");
  st.poke(S.KEY, function (o){ o.records[K].lines.INS.controllable = true; });   // altered behind the store's back — in memory INS is still false
  S.init({ storage: st, now: clock() });
  eq(S.get(K).lines.RET.controllable, true, "the flip survives a reload");
  eq(S.get(K).lines.INS.controllable, true, "init() drops in-memory state: a blob altered before the reload is what get() returns");
  eq(S.setControllable(K, "NOPE", false), null, "unknown line → null");
  eq(st.writes.length, writes + 1, "…no save");
  throwsType(function (){ S.setControllable(K, "RET", "false"); }, "rejects a non-boolean flag");
});

/* ---- 5b. the local map must agree with OperatingTaxonomy when present --- */
group("controllable defaults agree with OperatingTaxonomy (when present)", function (){
  var TX = null;
  try { TX = require("../operating-taxonomy.js"); } catch (e) { TX = null; }
  if (!TX || !Array.isArray(TX.ORDER) || typeof TX.defaultControllable !== "function") { console.log("  skipped: ./operating-taxonomy.js not present"); return; }
  fresh(); var K = "addr:taxonomy";
  var lines = {}; TX.ORDER.forEach(function (c){ lines[c] = { annual: 1, source: "manual" }; });
  var r = S.setLines(K, lines), mine = {}, theirs = {};
  TX.ORDER.forEach(function (c){ mine[c] = r.lines[c].controllable; theirs[c] = TX.defaultControllable(c); });
  eq(mine, theirs, "store default == OperatingTaxonomy.defaultControllable(code) for every ORDER code (" + TX.ORDER.length + " codes)");
  eq(TX.ORDER.filter(function (c){ return !theirs[c]; }), ["RET", "INS"], "the taxonomy's non-controllable set is exactly RET, INS");
  eq(S.CODES.slice(), TX.ORDER.slice(), "store CODES (the fallback list) === OperatingTaxonomy.ORDER, same order");
  eq(Object.keys(r.lines), TX.ORDER.slice(), "every ORDER code is accepted by setLines (real taxonomy present)");
  throwsType(function (){ S.setLine(K, "ZZZ", { annual: 1, source: "manual" }); }, "a code outside ORDER is rejected (real taxonomy present)");
  var Module = require("module"), path = require.resolve("../operating-taxonomy.js"), saved = require.cache[path];
  function stubTaxonomy(exports){ var m = new Module(path, null); m.filename = path; m.loaded = true; m.exports = exports; require.cache[path] = m; }
  // The store must consult the LIVE taxonomy at call time, not its identical
  // local copy: install a fake whose ORDER differs from CODES and watch
  // acceptance follow it (node path: require), then restore and watch it switch
  // back — nothing may be cached at script load.
  var FAKE = { ORDER: ["GPR", "ZZZ"] };
  stubTaxonomy(FAKE);
  try {
    ok(require("../operating-taxonomy.js") === FAKE, "(taxonomy require now yields the fake { ORDER: [GPR, ZZZ] })");
    var st = fresh(), r3 = attempt(function (){ return S.setLine("addr:fake", "ZZZ", { annual: 1, source: "manual" }); }, "node path: ZZZ (in the fake ORDER, not in CODES) is accepted");
    eq(r3 && [r3.lines.ZZZ.annual, r3.lines.ZZZ.controllable], [1, true], "node path: ZZZ stored (annual 1, local default controllable = true)");
    throwsType(function (){ S.setLine("addr:fake", "RET", { annual: 1, source: "manual" }); }, "node path: RET (in CODES, not in the fake ORDER) is rejected");
    throwsType(function (){ S.setLines("addr:fake", { GPR: { annual: 1, source: "manual" }, RET: { annual: 1, source: "manual" } }); }, "node path: a bulk carrying RET is rejected");
    st.poke(S.KEY, function (o){ var rec = o.records["addr:fake"] = o.records["addr:fake"] || { lines: {} }; rec.lines.RET = { annual: 9, source: "manual" }; rec.lines.GPR = { annual: 8, source: "manual" }; });
    S.init({ storage: st, now: clock() });
    eq(Object.keys(S.get("addr:fake").lines).sort(), ["GPR", "ZZZ"], "node path: load() drops RET and keeps GPR / ZZZ under the fake ORDER");
  } finally { require.cache[path] = saved; }
  ok(require("../operating-taxonomy.js") === TX, "(taxonomy require restored)");
  eq(S.setLine("addr:after", "RET", { annual: 1, source: "manual" }).lines.RET.annual, 1, "after the restore RET is accepted again — resolved per call, not cached");
  throwsType(function (){ S.setLine("addr:after", "ZZZ", { annual: 1, source: "manual" }); }, "…and ZZZ is rejected again");
  // Fallback path: taxonomy unresolvable at call time (a stub without ORDER) →
  // the LOCAL list must behave identically to ORDER.
  stubTaxonomy({});
  try {
    fresh(); var r2 = S.setLines("addr:fallback", lines), mine2 = {};
    eq(Object.keys(r2.lines), TX.ORDER.slice(), "fallback list accepts every ORDER code");
    TX.ORDER.forEach(function (c){ mine2[c] = r2.lines[c].controllable; });
    eq(mine2, theirs, "fallback controllable defaults == taxonomy defaults");
    throwsType(function (){ S.setLine("addr:fallback", "ZZZ", { annual: 1, source: "manual" }); }, "fallback list rejects a code outside ORDER");
    throwsType(function (){ S.setLine("addr:fallback", "gpr", { annual: 1, source: "manual" }); }, "fallback list rejects a mis-cased code");
  } finally { require.cache[path] = saved; }
  // Browser path: the renderer has no require (contextIsolation), so the store
  // reads root.OperatingTaxonomy. Load a fresh instance whose UMD root is a
  // fake `self` carrying a taxonomy, with require stubbed to yield no ORDER.
  var storePath = require.resolve("../operating-store.js"), savedStore = require.cache[storePath];
  stubTaxonomy({});
  globalThis.self = { OperatingTaxonomy: { ORDER: ["GPR", "ZZZ"] } };
  try {
    delete require.cache[storePath];
    var inst = require(storePath);
    ok(inst !== S, "(a fresh instance loaded with root = the fake self)");
    inst.init({ storage: fakeStorage(), now: clock() });
    var rz = attempt(function (){ return inst.setLine("addr:root", "ZZZ", { annual: 2, source: "manual" }); }, "browser path: ZZZ accepted via root.OperatingTaxonomy.ORDER");
    eq(rz && rz.lines.ZZZ.annual, 2, "browser path: ZZZ stored with annual 2");
    throwsType(function (){ inst.setLine("addr:root", "RET", { annual: 1, source: "manual" }); }, "browser path: RET rejected (absent from root's ORDER)");
    globalThis.self.OperatingTaxonomy = null;                 // taxonomy script "not loaded" → the fallback list
    var rr = attempt(function (){ return inst.setLine("addr:root", "RET", { annual: 3, source: "manual" }); }, "browser path with no taxonomy loaded: falls back to CODES (RET accepted)");
    eq(rr && rr.lines.RET.annual, 3, "browser path: RET stored with annual 3");
    throwsType(function (){ inst.setLine("addr:root", "ZZZ", { annual: 1, source: "manual" }); }, "…and ZZZ rejected — the lookup happens per call, not at script load");
  } finally { delete globalThis.self; require.cache[storePath] = savedStore; require.cache[path] = saved; globalThis.OperatingStore = S; }
  ok(require(storePath) === S && require("../operating-taxonomy.js") === TX, "(store and taxonomy requires restored)");
});

/* ---- 6. setLines (bulk, one save) --------------------------------------- */
group("setLines", function (){
  var st = fresh(), K = "addr:3 elm st";
  S.ensure(K, { propertyName: "Elm", units: 50 });                        // T0
  S.setLine(K, "INS", { annual: 30000, source: "manual" });               // T1
  S.setLine(K, "UTIL", { annual: 80000, source: "manual", note: "keep me" });   // T2
  var writes = st.writes.length;
  var patch = { RET: { annual: 200000, source: "t12", controllable: true }, INS: { annual: 33000, source: "t12" }, GPR: { annual: 1500000, source: "t12", controllable: false } };
  var r = S.setLines(K, patch, { sourceFile: "crest-t12.xlsx", period: "T12 ending 2025-06-30" });   // T3
  eq(st.writes.length, writes + 1, "bulk write = exactly ONE save");
  eq(r.lines.RET, { annual: 200000, prevAnnual: null, controllable: true, source: "t12", updatedAt: T(3), note: null }, "new line written — the patch's controllable:true applied on creation (RET default false)");
  eq(r.lines.GPR.controllable, false, "…and controllable:false applied on creation of an income line (default true)");
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
  throwsType(function (){ S.setLines(K, { gpr: { annual: 1, source: "manual" } }); }, "a mis-cased code (gpr) rejects the bulk");
  throwsType(function (){ S.setLines(K, { GPR: { annual: 1, source: "manual" }, FOO: { annual: 1, source: "manual" } }); }, "an unknown code (FOO) rejects the whole bulk, valid entries included");
  eq(S.get(K), before, "…nothing written");
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
  r = S.setAssumptions(K, null);                                           // T10 (T0 create + nine patches above)
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
  st.poke(S.KEY, function (o){ o.records[K2].period = "Altered 2027"; });   // altered behind the store's back — memory still says "Budget 2026"
  S.init({ storage: st, now: clock() });
  eq(S.get(K2).period, "Altered 2027", "lazy load: get() before load() reads storage — the ALTERED blob, not stale memory");
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
    "addr:8 fir st": { propertyName: "Fir", units: "45", period: "P", lines: { INS: { annual: "12,345.67", source: "t12", updatedAt: "2025-05-05T00:00:00.000Z" }, GA: { annual: 999 }, MKT: { annual: "n/a" }, X: 7,
                       FOO: { annual: 5, source: "manual" }, gpr: { annual: 6, source: "manual" }, "TRSH RUB": { annual: 7, source: "manual" } },
                       meta: { lastUpdated: "2025-06-06T00:00:00.000Z", sourceFile: "" } } } }) });
  eq(S.load().records["addr:8 fir st"], { propKey: "addr:8 fir st", propertyName: "Fir", units: 45, period: "P",
      lines: { INS: { annual: 12345.67, prevAnnual: null, controllable: false, source: "t12", updatedAt: "2025-05-05T00:00:00.000Z", note: null },
               GA:  { annual: 999, prevAnnual: null, controllable: true, source: "manual", updatedAt: "2025-06-06T00:00:00.000Z", note: null },
               "TRSH RUB": { annual: 7, prevAnnual: null, controllable: true, source: "manual", updatedAt: "2025-06-06T00:00:00.000Z", note: null } },
      assumptions: null, meta: { createdAt: "2025-06-06T00:00:00.000Z", lastUpdated: "2025-06-06T00:00:00.000Z", sourceFile: null } },
    "version 0: prevAnnual/controllable/source/note/createdAt/assumptions defaulted, numeric strings coerced, unreadable (MKT) / unknown (FOO) / mis-cased (gpr) / non-object lines dropped, the rest kept incl. \"TRSH RUB\"");
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
  // (g) the map key is authoritative over a stored propKey that disagrees
  st = fresh({ "ldsHub.operating.v1": JSON.stringify({ version: 1, records: { "addr:real": Object.assign({}, v1rec, { propKey: "addr:stale" }) } }) });
  S.load();
  eq([S.get("addr:real").propKey, S.get("addr:stale")], ["addr:real", null], "map key wins over a stored propKey (record.propKey === its map key; nothing under the stale key)");
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

/* ---- 11b. prototype safety --------------------------------------------- */
group("prototype safety", function (){
  var st = fresh(), K = "addr:12 spruce st";
  S.ensure(K, { propertyName: "Spruce" });
  var w = st.writes.length, before = S.get(K);
  throwsType(function (){ S.setAssumptions(K, JSON.parse('{"__proto__":{"polluted":1}}')); }, "setAssumptions rejects a __proto__ key");
  throwsType(function (){ S.setAssumptions(K, { sizing: JSON.parse('{"constructor":{"prototype":{"polluted":1}}}') }); }, "…and nested constructor / prototype keys");
  throwsType(function (){ S.setAssumptions(K, { prototype: 1 }); }, "…and a prototype leaf");
  eq(({}).polluted, undefined, "Object.prototype is clean after the probes");
  eq(S.get(K).assumptions, null, "nothing merged");
  throwsType(function (){ S.setLine("__proto__", "RET", { annual: 1, source: "manual" }); }, "propKey \"__proto__\" → TypeError");
  throwsType(function (){ S.ensure("constructor", { propertyName: "x" }); }, "propKey \"constructor\" → TypeError");
  throwsType(function (){ S.setUnits("prototype", 1); }, "propKey \"prototype\" → TypeError");
  throwsType(function (){ S.setLine(K, "__proto__", { annual: 1, source: "manual" }); }, "line code \"__proto__\" → TypeError");
  throwsType(function (){ S.setLines(K, { constructor: { annual: 1, source: "manual" } }); }, "line code \"constructor\" in a bulk → TypeError");
  throwsType(function (){ S.setControllable(K, "prototype", true); }, "line code \"prototype\" → TypeError");
  throwsType(function (){ S.removeLine(K, "__proto__"); }, "removeLine code \"__proto__\" → TypeError");
  eq(S.get(K), before, "record unchanged");
  eq(st.writes.length, w, "nothing saved");
  eq(Object.keys(S.all()), [K], "no record was created under a reserved key");
  // a hostile stored blob: reserved keys are dropped on load, never merged into a
  // prototype. All three names are seeded at every level — "__proto__" alone
  // cannot expose a missing guard (assigning it sets a prototype, not a key),
  // whereas "constructor" / "prototype" would land as real own keys.
  var hostile = JSON.parse('{"__proto__":{"lines":{}},"constructor":{"lines":{}},"prototype":{"lines":{}},' +
    '"addr:h":{"lines":{"__proto__":{"annual":1},"constructor":{"annual":3},"prototype":{"annual":4},"RET":{"annual":2,"source":"constructor"}},' +
    '"assumptions":{"__proto__":{"polluted":1},"constructor":{"x":1},"prototype":2,"vacancyPct":0.05}}}');
  st = fresh({ "ldsHub.operating.v1": JSON.stringify({ version: 1, records: hostile }) });
  ok(['"__proto__"', '"constructor"', '"prototype"'].every(function (k){ return st.peek(S.KEY).split(k).length >= 4; }), "(the seeded blob carries __proto__ / constructor / prototype at record, line and assumption level)");
  var recs = S.load().records;
  eq(Object.keys(recs), ["addr:h"], "records keyed __proto__ / constructor / prototype are all dropped on load");
  eq(Object.keys(recs["addr:h"].lines), ["RET"], "lines coded __proto__ / constructor / prototype are all dropped on load");
  eq(recs["addr:h"].lines.RET.source, "manual", "a stored source of \"constructor\" loads as \"manual\" (own-key check, not a prototype lookup)");
  eq(recs["addr:h"].assumptions, { vacancyPct: 0.05 }, "__proto__ / constructor / prototype assumption keys are all dropped on load");
  eq(({}).polluted, undefined, "Object.prototype still clean");
  ok(Object.getPrototypeOf(S.get("addr:h").lines) === Object.prototype && Object.getPrototypeOf(S.get("addr:h").assumptions) === Object.prototype, "loaded maps have the plain Object prototype");
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
  S.rename(K, "addr:moved"); S.rename("addr:moved", K);
  S.init({ storage: st, now: clock() }); S.load();
  eq(st.peek(LOANS_KEY), loansRaw, "loans store string is byte-identical after every write method");
  eq(st.peek("ldsHub.uw.v1"), "{\"x\":1}", "an unrelated key is byte-identical too");
  eq(JSON.stringify(loan), loanSnap, "the loan object passed to ensure() is byte-identical");
  eq(loan, loanCopy, "…and deep-equal to its snapshot");
  eq(JSON.stringify(loans), loansRaw, "the whole loans array is unchanged");
  ok(st.writes.length > 0 && st.writes.every(function (k){ return k === S.KEY; }), "every setItem call targeted KEY only (" + st.writes.length + " writes)");
  ok(st.reads.length > 0 && st.reads.every(function (k){ return k === S.KEY; }), "every getItem call targeted KEY only — the loans store was never even READ (" + st.reads.length + " reads)");
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
