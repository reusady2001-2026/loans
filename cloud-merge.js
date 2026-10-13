/* ============================================================================
   3.0.0 — comparing and folding together versions of a record.

   The same field paths as the server (supabase/setup.sql, app.leaves): keys
   joined by ".", the items of a list that all carry a distinct "id" (or "_id",
   as loans do) written as [id], any other list one value. So what the app shows
   as "changed" is exactly what the server records.

   merge3(base, mine, theirs): someone saved `theirs` after I started from
   `base`; my changes (base -> mine) are laid over theirs. Where we both changed
   the same field, mine wins — mine is the later save.

   Pure: no I/O. Unit-tested in test/cloud-merge.test.js.
   ========================================================================== */
"use strict";

// time stamps the app writes on every save; a difference in these alone is no change (same list as app.lock_free)
const STAMP = /(^|\.)(updatedAt|savedAt|changedAt|changedBy|modifiedAt|computedAt|lastSaved|ts)$/;

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keyPart = k => String(k).replace(/\\/g, "\\\\").replace(/\./g, "\\.").replace(/\[/g, "\\[");

// a stable text for a value (object keys sorted, as the database compares them)
function canon(v){
  if(Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if(isObj(v)) return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return v === undefined ? "null" : JSON.stringify(v);
}
const eq = (a, b) => canon(a) === canon(b);

function listKey(arr){
  if(!Array.isArray(arr) || !arr.length) return null;
  for(const k of ["id", "_id"]){
    if(arr.every(e => isObj(e) && (typeof e[k] === "string" || typeof e[k] === "number")) &&
       new Set(arr.map(e => JSON.stringify(e[k]))).size === arr.length) return k;
  }
  return null;
}

function leaves(j, prefix, out){
  out = out || new Map(); prefix = prefix || "";
  if(isObj(j) && Object.keys(j).length){
    for(const k of Object.keys(j)) leaves(j[k], prefix === "" ? keyPart(k) : prefix + "." + keyPart(k), out);
    return out;
  }
  if(Array.isArray(j)){
    const lk = listKey(j);
    if(lk){ for(const e of j) leaves(e, prefix + "[" + keyPart(String(e[lk])) + "]", out); return out; }
  }
  out.set(prefix, j === undefined ? null : j);
  return out;
}

// [{field, old, new}] — what changed from a to b (null / undefined = no record)
function diff(a, b){
  const x = (a === null || a === undefined) ? new Map() : leaves(a), y = (b === null || b === undefined) ? new Map() : leaves(b);
  const out = [];
  for(const [f, v] of x){ if(!y.has(f)) out.push({ field: f, old: v, new: null }); else if(!eq(v, y.get(f))) out.push({ field: f, old: v, new: y.get(f) }); }
  for(const [f, v] of y){ if(!x.has(f)) out.push({ field: f, old: null, new: v }); }
  return out;
}

// true when a and b differ in nothing but time stamps (or not at all)
function sameButStamps(a, b){
  if(a === null || a === undefined || b === null || b === undefined) return (a === null || a === undefined) === (b === null || b === undefined);
  return diff(a, b).every(d => STAMP.test(d.field));
}

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

function merge3(base, mine, theirs){
  if(eq(mine, base)) return clone(theirs);
  if(eq(theirs, base) || eq(mine, theirs)) return clone(mine);
  if(isObj(mine) && isObj(theirs) && (base === undefined || base === null || isObj(base))){
    const b = isObj(base) ? base : {}, out = {};
    const keys = Object.keys(theirs).concat(Object.keys(mine).filter(k => !(k in theirs)));
    for(const k of keys){
      const hb = k in b, hm = k in mine, ht = k in theirs;
      if(!hm && !ht) continue;
      if(!hm){ if(hb && eq(theirs[k], b[k])) continue; if(!hb) { out[k] = clone(theirs[k]); continue; } continue; }   // I removed it: it goes (mine wins), unless they added it
      if(!ht){ if(hb && eq(mine[k], b[k])) continue; out[k] = clone(mine[k]); continue; }                             // they removed it: it goes, unless I changed it
      out[k] = merge3(hb ? b[k] : undefined, mine[k], theirs[k]);
    }
    return out;
  }
  const km = listKey(mine), kt = listKey(theirs), kb = Array.isArray(base) && base.length ? listKey(base) : km;
  if(km && km === kt && (kb === km || !Array.isArray(base) || !base.length)){
    const k = km, id = e => JSON.stringify(e[k]);
    const bm = new Map((Array.isArray(base) ? base : []).filter(isObj).map(e => [id(e), e]));
    const mm = new Map(mine.map(e => [id(e), e])), tm = new Map(theirs.map(e => [id(e), e]));
    const out = [];
    for(const e of theirs){
      const i = id(e);
      if(mm.has(i)) out.push(merge3(bm.get(i), mm.get(i), e));
      else if(!bm.has(i)) out.push(clone(e));          // they added it
      // else: I removed it — it goes (mine wins)
    }
    // what I added (or kept while they removed it, if I changed it): placed after the item before it in my list
    mine.forEach((e, n) => {
      const i = id(e); if(tm.has(i)) return;
      if(bm.has(i) && eq(e, bm.get(i))) return;        // they removed it and I hadn't touched it
      let at = out.length;
      for(let p = n - 1; p >= 0; p--){ const q = out.findIndex(x => id(x) === id(mine[p])); if(q >= 0){ at = q + 1; break; } }
      if(n === 0) at = 0;
      out.splice(at, 0, clone(e));
    });
    return out;
  }
  return clone(mine);   // both changed the same value: the later save (mine) wins
}

module.exports = { STAMP, canon, eq, leaves, diff, sameButStamps, merge3, listKey, keyPart };
