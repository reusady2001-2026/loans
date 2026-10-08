/* ============================================================================
   Operating store - the per-PROPERTY operating model (income / expense lines
   that feed NOI -> DSCR / DY / LTV), persisted under ONE localStorage key,
   "ldsHub.operating.v1". It is a separate, isolated store: this module never
   reads or writes any other key (the loans live in "ldsHub.loans.v7") and never
   touches a loan object. One record per property key (OPERATING-CONTRACT.md section 1),
   shared by every loan on that property - senior and mezz read the same NOI.
   Dollars are stored ANNUAL; the UI converts for a monthly display.
   Every write persists immediately (exactly one save per call); reads hand out
   deep copies so nothing can mutate the store by reference. Node tests inject
   { storage, now } through init() so a run is fully deterministic.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OperatingStore = api;
  if (typeof globalThis !== "undefined") globalThis.OperatingStore = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var KEY = "ldsHub.operating.v1", VERSION = 1;
  var SOURCES = { t12: 1, manual: 1, budget: 1 };

  // Controllable defaults per contract section 3, kept LOCAL so this module stays
  // dependency-free (the taxonomy module is built concurrently): taxes and
  // insurance are the two lines an owner cannot push, every other expense -
  // and every income line - defaults to controllable. Unknown codes default
  // true for the same reason: RET / INS are the only exceptions.
  var CONTROLLABLE_DEFAULT = {
    GPR:true, EMPL:true, MOD:true, VAC:true, CONC:true, BD:true,
    RUBS:true, "TRSH RUB":true, "TRSH COL":true, PARK:true, PET:true, MTM:true, LATE:true,
    APP:true, ADM:true, AMEN:true, COM:true, CAM:true, ANT:true, OTH:true,
    RET:false, INS:false, UTIL:true, RM:true, CS:true, PAY:true, MGMT:true, GA:true, BDX:true, MKT:true,
    TRSH:true, CAB:true, PLL:true
  };
  function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
  // Keys that would reach Object.prototype when used as a map key or merge
  // target (JSON.parse('{"__proto__":...}') creates a real own property). They
  // are never valid propKeys, line codes or assumption fields: rejected on
  // write, dropped on load.
  function reserved(k){ return k === "__proto__" || k === "constructor" || k === "prototype"; }
  function defaultControllable(code){ return has(CONTROLLABLE_DEFAULT, code) ? CONTROLLABLE_DEFAULT[code] : true; }

  // The 33 taxonomy codes (contract section 3 + BDX, bad-debt expense, after GA). Lines are keyed by these and nothing
  // else: a stray or mis-cased code ("FOO", "gpr") would be silently excluded
  // from every total downstream, so setLine/setLines reject it and load() drops
  // it. The live taxonomy module is consulted AT CALL TIME when present (node:
  // require; browser: root.OperatingTaxonomy - script order is irrelevant);
  // this local list is the fallback and must stay in sync - the test binds the
  // two, so it is exported (frozen) for that comparison.
  var CODES = Object.freeze(["GPR","EMPL","MOD","VAC","CONC","BD",
    "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH",
    "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","BDX","MKT","TRSH","CAB","PLL"]);
  function taxonomy(){
    var t = null;
    if (typeof require === "function") { try { t = require("./operating-taxonomy.js"); } catch (e) { t = null; } }
    if (!(t && Array.isArray(t.ORDER)) && root) t = root.OperatingTaxonomy;
    return (t && Array.isArray(t.ORDER)) ? t : null;
  }
  function codeList(){ var t = taxonomy(); return t ? t.ORDER : CODES; }

  function isObj(v){ return v != null && typeof v === "object" && !Array.isArray(v); }
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function strOrNull(v){ return (typeof v === "string" && v !== "") ? v : null; }
  // Tolerant number read for MIGRATION only (a legacy line might hold "1,234.50");
  // live writes are strict (isNum) so the schema never carries a coerced value.
  function toNum(v){
    if (isNum(v)) return v;
    if (typeof v === "string" && /\d/.test(v)) { var n = parseFloat(v.replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : null; }
    return null;
  }
  function clone(v){
    if (Array.isArray(v)) return v.map(clone);
    if (v != null && typeof v === "object") { var o = {}; for (var k in v) if (has(v, k)) o[k] = clone(v[k]); return o; }
    return v;
  }

  /* ---- storage / clock ------------------------------------------------- */
  var _storage = null, _now = defaultNow, _state = null;
  function defaultNow(){ return new Date().toISOString(); }
  function memStorage(){ var m = {}; return { getItem: function (k){ return has(m, k) ? m[k] : null; }, setItem: function (k, v){ m[k] = String(v); } }; }
  function defaultStorage(){
    // window.localStorage when the page has one; a throwaway in-memory shim
    // otherwise (plain node without init) so the API still works, just
    // without persistence. Accessing localStorage can itself throw (sandboxed
    // frames), hence the try.
    try { if (typeof window !== "undefined" && window.localStorage) return window.localStorage; } catch (e) {}
    return memStorage();
  }
  function storage(){ if (!_storage) _storage = defaultStorage(); return _storage; }

  function init(opts){
    opts = opts || {};
    if (opts.storage != null){
      if (typeof opts.storage.getItem !== "function" || typeof opts.storage.setItem !== "function") throw new TypeError("OperatingStore.init: storage must expose getItem/setItem");
      _storage = opts.storage;
    } else _storage = null;                       // resolved lazily -> window.localStorage
    if (opts.now != null){
      if (typeof opts.now !== "function") throw new TypeError("OperatingStore.init: now must be a function returning an ISO string");
      _now = opts.now;
    } else _now = defaultNow;
    _state = null;                                // a fresh init re-reads its storage on the next call - that is how a reload is simulated
    return api;
  }

  /* ---- load / migrate -------------------------------------------------- */
  function load(){
    var raw = null, parsed = null;
    try { raw = storage().getItem(KEY); } catch (e) { raw = null; }
    // Corrupt JSON -> start empty, never throw. The bad blob is deliberately
    // left in place (load never writes) so nothing is destroyed until the
    // user's first real write replaces it.
    if (typeof raw === "string" && raw !== "") { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    _state = migrate(parsed);
    return clone(_state);
  }
  function st(){ if (!_state) load(); return _state; }

  // Bring whatever was stored up to the v1 shape without losing data:
  //  - the v1 wrapper { version, records } - version missing, older or newer;
  //  - the SPEC-draft flat map { key: record } that had no wrapper at all;
  //  - records / lines with fields missing (filled with the schema defaults).
  // Idempotent: re-normalizing a v1 state changes nothing. Garbage entries
  // (non-object records, lines without a readable amount or under an unknown
  // code, reserved keys) are dropped.
  function migrate(parsed){
    var recsIn = null;
    if (isObj(parsed)) recsIn = isObj(parsed.records) ? parsed.records : (has(parsed, "records") || has(parsed, "version")) ? null : parsed;
    var out = {}, fallback = null, list = codeList();
    var ts = function (){ return fallback || (fallback = _now()); };   // one timestamp for every date backfilled in this load, taken only if needed
    if (recsIn) for (var k in recsIn) if (has(recsIn, k) && !reserved(k) && isObj(recsIn[k])) out[k] = normRecord(k, recsIn[k], ts, list);
    return { version: VERSION, records: out };
  }
  function normRecord(key, r, ts, list){
    var meta = isObj(r.meta) ? r.meta : {};
    var lastUpdated = strOrNull(meta.lastUpdated) || strOrNull(meta.createdAt) || ts();
    var createdAt = strOrNull(meta.createdAt) || lastUpdated;
    var lines = {}, src = isObj(r.lines) ? r.lines : {};
    for (var c in src) if (has(src, c) && !reserved(c) && list.indexOf(c) >= 0 && isObj(src[c])) { var ln = normLine(c, src[c], lastUpdated); if (ln) lines[c] = ln; }
    return {                                      // field order = contract section 2 order, so the persisted JSON is canonical
      propKey: key,                               // the map key is authoritative over a stored propKey
      propertyName: typeof r.propertyName === "string" ? r.propertyName : (typeof r.name === "string" ? r.name : ""),
      units: unitsOrNull(toNum(r.units)),
      period: strOrNull(r.period),
      lines: lines,
      assumptions: normAssump(r.assumptions),
      meta: { createdAt: createdAt, lastUpdated: lastUpdated, sourceFile: strOrNull(meta.sourceFile) }
    };
  }
  function normLine(code, l, fallbackISO){
    var annual = toNum(l.annual);
    if (annual == null) return null;              // a line without a readable amount is not a line
    return { annual: annual, prevAnnual: toNum(l.prevAnnual),
             controllable: typeof l.controllable === "boolean" ? l.controllable : defaultControllable(code),
             source: has(SOURCES, l.source) ? l.source : "manual",   // own-key check: a stored "constructor" must not pass via the prototype
             updatedAt: strOrNull(l.updatedAt) || fallbackISO, note: strOrNull(l.note) };
  }
  function unitsOrNull(n){ return (n != null && n >= 0) ? n : null; }
  // Tolerant deep-clean for STORED assumptions: keep finite-number leaves and
  // non-empty sub-objects, drop the rest. Null when nothing remains (= inherit).
  function normAssump(a){
    if (!isObj(a)) return null;
    var out = {}, any = false;
    for (var k in a) if (has(a, k) && !reserved(k)) {
      var v = a[k];
      if (isNum(v)) { out[k] = v; any = true; }
      else if (isObj(v)) { var sub = normAssump(v); if (sub) { out[k] = sub; any = true; } }
    }
    return any ? out : null;
  }

  /* ---- reads ------------------------------------------------------------ */
  function all(){ return clone(st().records); }
  function get(k){ var recs = st().records; return (typeof k === "string" && has(recs, k)) ? clone(recs[k]) : null; }

  /* ---- writes ----------------------------------------------------------- */
  function validKey(k){ return typeof k === "string" && k !== "" && !reserved(k); }
  function key(k, fn){ if (!validKey(k)) throw new TypeError("OperatingStore." + fn + ": propKey must be a non-empty, non-reserved string"); return k; }
  function code(c, fn){ if (!validKey(c)) throw new TypeError("OperatingStore." + fn + ": code must be a non-empty, non-reserved string"); return c; }
  // A code the caller names must be a real taxonomy code - reject an unknown or
  // mis-cased one (same shape as checkLine) BEFORE touching the record, so
  // removeLine/setControllable are as strict as setLine (stricter, not softer).
  function unknownCodeErr(c, fn){ return new TypeError("OperatingStore." + fn + ": unknown line code " + JSON.stringify(c) + " - lines are keyed by taxonomy codes (GPR ... PLL, exact case)"); }
  function knownCode(c, fn){ code(c, fn); if (codeList().indexOf(c) < 0) throw unknownCodeErr(c, fn); return c; }
  function newRecord(k, name, units, ts){
    return { propKey: k, propertyName: name, units: units, period: null, lines: {}, assumptions: null,
             meta: { createdAt: ts, lastUpdated: ts, sourceFile: null } };
  }
  // Internal create-if-missing that shares the caller's timestamp, so one public
  // call consumes exactly one clock tick (createdAt === lastUpdated === updatedAt).
  function getOrCreate(k, ts){ var recs = st().records; return has(recs, k) ? recs[k] : (recs[k] = newRecord(k, "", null, ts)); }

  // Create-if-missing, and keep the record's IDENTITY current. The display
  // name comes from the loans (it is never typed on the record), so a non-blank
  // name that differs from the stored one is refreshed - an operator's
  // correction to a loan's name must reach the roll-up on the next pick; a
  // blank name never clobbers a real one. Units are filled only when the
  // record has none (they may have been set by hand) and never overwritten
  // with a caller's null/undefined. None of this is an operating-data update:
  // ensure runs on every property pick, and "last updated" must not degrade
  // into "last viewed".
  function ensure(k, opts){
    key(k, "ensure"); opts = opts || {};
    var name = opts.propertyName, units = opts.units;
    if (name == null) name = ""; else if (typeof name !== "string") throw new TypeError("OperatingStore.ensure: propertyName must be a string");
    if (units == null) units = null; else if (!(isNum(units) && units >= 0)) throw new TypeError("OperatingStore.ensure: units must be a non-negative number or null");
    var recs = st().records, r = has(recs, k) ? recs[k] : null, dirty = false;
    if (!r) { r = recs[k] = newRecord(k, name, units, _now()); dirty = true; }
    else {
      if (name && name !== r.propertyName) { r.propertyName = name; dirty = true; }
      if (r.units === null && units !== null) { r.units = units; dirty = true; }
    }
    if (dirty) save();
    return clone(r);
  }

  // Live writes are strict: a bad amount or source is a caller bug, and it is
  // rejected BEFORE anything changes so the persisted schema is always exact.
  function checkLine(c, p, fn, list){
    code(c, fn);
    if (list.indexOf(c) < 0) throw unknownCodeErr(c, fn);
    if (!isObj(p)) throw new TypeError("OperatingStore." + fn + ": " + c + " needs { annual, source }");
    if (!isNum(p.annual)) throw new TypeError("OperatingStore." + fn + ": " + c + ".annual must be a finite number (annual dollars)");
    if (!has(SOURCES, p.source)) throw new TypeError("OperatingStore." + fn + ": " + c + ".source must be \"t12\", \"manual\" or \"budget\"");
    if (p.controllable !== undefined && typeof p.controllable !== "boolean") throw new TypeError("OperatingStore." + fn + ": " + c + ".controllable must be a boolean");
    if (p.note !== undefined && p.note !== null && typeof p.note !== "string") throw new TypeError("OperatingStore." + fn + ": " + c + ".note must be a string or null");
  }
  // Apply one validated line patch. prevAnnual moves ONLY when the amount
  // actually changes - it feeds expense-shock detection, so re-setting the same
  // figure (a re-upload) must not erase the real previous value. updatedAt
  // always moves: a set is a set, even to the same number ("loaded from the
  // T12 today"). controllable / note are patch-optional: omitted = keep.
  function putLine(r, c, p, ts){
    var ln = has(r.lines, c) ? r.lines[c] : null;
    if (!ln) ln = r.lines[c] = { annual: p.annual, prevAnnual: null, controllable: defaultControllable(c), source: p.source, updatedAt: ts, note: null };
    else { if (p.annual !== ln.annual) { ln.prevAnnual = ln.annual; ln.annual = p.annual; } ln.source = p.source; ln.updatedAt = ts; }
    if (typeof p.controllable === "boolean") ln.controllable = p.controllable;
    if (p.note !== undefined) ln.note = strOrNull(p.note);
  }
  function setLine(k, c, p){
    key(k, "setLine"); checkLine(c, p, "setLine", codeList());
    var ts = _now(), r = getOrCreate(k, ts);
    putLine(r, c, p, ts); r.meta.lastUpdated = ts; save();
    return clone(r);
  }
  function setLines(k, lines, opts){
    key(k, "setLines"); opts = opts || {};
    if (!isObj(lines)) throw new TypeError("OperatingStore.setLines: lines must be an object of { code: { annual, source } }");
    var codes = Object.keys(lines), list = codeList();
    codes.forEach(function (c){ checkLine(c, lines[c], "setLines", list); });   // validate everything first - a bad entry must not leave a half-written record
    if (opts.sourceFile != null && typeof opts.sourceFile !== "string") throw new TypeError("OperatingStore.setLines: sourceFile must be a string or null");
    if (opts.period != null && typeof opts.period !== "string") throw new TypeError("OperatingStore.setLines: period must be a string or null");
    var ts = _now(), r = getOrCreate(k, ts);
    codes.forEach(function (c){ putLine(r, c, lines[c], ts); });
    if (opts.sourceFile !== undefined) r.meta.sourceFile = strOrNull(opts.sourceFile);   // undefined = leave alone; null/"" = clear
    if (opts.period !== undefined) r.period = strOrNull(opts.period);
    r.meta.lastUpdated = ts; save();
    return clone(r);
  }
  function removeLine(k, c){
    key(k, "removeLine"); knownCode(c, "removeLine");
    var recs = st().records; if (!has(recs, k)) return null;
    var r = recs[k];
    if (has(r.lines, c)) { delete r.lines[c]; r.meta.lastUpdated = _now(); save(); }
    return clone(r);
  }
  function setControllable(k, c, flag){
    key(k, "setControllable"); knownCode(c, "setControllable");
    if (typeof flag !== "boolean") throw new TypeError("OperatingStore.setControllable: flag must be a boolean");
    var recs = st().records; if (!has(recs, k) || !has(recs[k].lines, c)) return null;   // the flag lives on a line; nothing to flip without one
    var r = recs[k];
    // Only meta.lastUpdated moves: a line's own updatedAt is the AMOUNT's date,
    // and a flag flip must not make a six-month-old T12 figure look fresh.
    r.lines[c].controllable = flag; r.meta.lastUpdated = _now(); save();
    return clone(r);
  }

  // Assumptions: a patch carries finite numbers (set), nulls (clear that field
  // -> inherit the global default) or nested plain objects of the same. The
  // stored form is canonical - null when nothing is overridden, never an empty
  // sub-object - so "is anything overridden?" is a null check.
  function checkPatch(p, path){
    for (var k in p) if (has(p, k)) {
      var v = p[k], at = path ? path + "." + k : k;
      if (reserved(k)) throw new TypeError("OperatingStore.setAssumptions: " + at + " is not a valid assumption key");
      if (v === undefined || v === null || isNum(v)) continue;
      if (isObj(v)) { checkPatch(v, at); continue; }
      throw new TypeError("OperatingStore.setAssumptions: " + at + " must be a finite number, null or an object");
    }
  }
  function mergeAssump(base, p){
    for (var k in p) if (has(p, k)) {
      var v = p[k];
      if (v === undefined) continue;
      if (v === null) { delete base[k]; continue; }
      if (isObj(v)) { var sub = (has(base, k) && isObj(base[k])) ? base[k] : {}; mergeAssump(sub, v); if (Object.keys(sub).length) base[k] = sub; else delete base[k]; continue; }
      base[k] = v;
    }
    return base;
  }
  function setAssumptions(k, patch){
    key(k, "setAssumptions");
    if (patch !== null && !isObj(patch)) throw new TypeError("OperatingStore.setAssumptions: patch must be an object or null");
    if (patch) checkPatch(patch, "");
    var ts = _now(), r = getOrCreate(k, ts);
    if (patch === null) r.assumptions = null;
    else { var a = mergeAssump(r.assumptions || {}, patch); r.assumptions = Object.keys(a).length ? a : null; }
    r.meta.lastUpdated = ts; save();
    return clone(r);
  }
  function setUnits(k, n){
    key(k, "setUnits");
    if (n !== null && !(isNum(n) && n >= 0)) throw new TypeError("OperatingStore.setUnits: units must be a non-negative number or null");
    var ts = _now(), r = getOrCreate(k, ts);
    r.units = n; r.meta.lastUpdated = ts; save();
    return clone(r);
  }
  function setPeriod(k, s){
    key(k, "setPeriod");
    if (s !== null && typeof s !== "string") throw new TypeError("OperatingStore.setPeriod: period must be a string or null");
    var ts = _now(), r = getOrCreate(k, ts);
    r.period = strOrNull(s); r.meta.lastUpdated = ts; save();
    return clone(r);
  }
  function remove(k){
    var recs = st().records;
    if (typeof k !== "string" || !has(recs, k)) return false;
    delete recs[k]; save();
    return true;
  }
  // Move a record to a new section 1 key - an address edit changes the key, and the
  // operating data must follow it rather than be orphaned. The record object
  // moves as-is (lines, assumptions, meta, units, period all preserved); only
  // propKey changes, and being identity it does not stamp lastUpdated. Refuses
  // with false and NO save when there is nothing to move, when newKey is
  // already taken (never silently merge or destroy), or when the keys are
  // equal or invalid.
  function rename(oldKey, newKey){
    if (!validKey(oldKey) || !validKey(newKey) || oldKey === newKey) return false;
    var recs = st().records;
    if (!has(recs, oldKey) || has(recs, newKey)) return false;
    var r = recs[oldKey]; delete recs[oldKey];
    r.propKey = newKey; recs[newKey] = r; save();
    return true;
  }
  function save(){
    var s = st();
    // A full / unavailable storage must never break the app: the in-memory
    // state stays authoritative and the caller learns via the return value.
    try { storage().setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  var api = { KEY: KEY, CODES: CODES, init: init, load: load, all: all, get: get, ensure: ensure,
              setLine: setLine, setLines: setLines, removeLine: removeLine, setControllable: setControllable,
              setAssumptions: setAssumptions, setUnits: setUnits, setPeriod: setPeriod, remove: remove, rename: rename, save: save };
  return api;
});
