/* ============================================================================
   General Data - the per-PROPERTY "General Data" record that lives beside the
   T12 in the property's folder (general-data.json). It holds the property's
   identity, its two NOIs (in-place T12 and the calculated underwritten NOI),
   and a ROLLING 24-MONTH history of every operating line, built up as T12s are
   uploaded over time. Each upload contributes its monthly columns; overlapping
   months take the newer statement's figure, and only the most recent 24 months
   are kept - so three months after a 12-month T12 you carry 15 months, and you
   can see how each line (taxes, insurance, ...) moved.

   Pure and dependency-free: the parsed T12 and a classify() callback come from
   the caller (t12-parse + t12-classify in the app; stubs in the node tests), so
   this module is deterministic and unit-testable on its own. No I/O, no clock
   except the ISO string the caller passes in as meta.now.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.GeneralData = api;
  if (typeof globalThis !== "undefined") globalThis.GeneralData = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA = "lds.general-data.v1", CAP = 24;

  function isObj(v){ return v != null && typeof v === "object" && !Array.isArray(v); }
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function r2(x){ return Math.round(x * 100) / 100; }
  function ymOk(s){ return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
  function clone(v){
    if (Array.isArray(v)) return v.map(clone);
    if (isObj(v)) { var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]); return o; }
    return v;
  }
  // shift a "YYYY-MM" by n months (n may be negative)
  function ymShift(ym, n){
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    var yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
    return yy + "-" + (mm < 10 ? "0" : "") + mm;
  }

  // parsed = t12-parse.parseGrid({ monthly:true }); classify(name,section,sub) ->
  // { code, role, label } | null. Sum each classified line's monthly values by
  // calendar month. Only period columns that resolved to a real YYYY-MM count -
  // an undated statement contributes nothing to the calendar history (the caller
  // still stores the current NOI). Returns { months, byCode:{ code:{role,label,monthly} } }.
  function monthlySeries(parsed, classify){
    if (typeof classify !== "function") throw new TypeError("GeneralData.monthlySeries: classify must be a function");
    var out = { months: [], byCode: {} }, seen = {};
    var rows = (parsed && Array.isArray(parsed.rows)) ? parsed.rows : [];
    rows.forEach(function (r){
      if (!r || !isObj(r.monthly)) return;
      var c = classify(r.name, r.section, r.sub);
      if (!c || !c.code) return;
      var e = out.byCode[c.code] || (out.byCode[c.code] = { code: c.code, role: c.role || null, label: c.label || c.code, monthly: {} });
      if (c.role != null) e.role = c.role;
      if (c.label) e.label = c.label;
      for (var ym in r.monthly){
        if (!Object.prototype.hasOwnProperty.call(r.monthly, ym) || !ymOk(ym)) continue;
        var v = r.monthly[ym]; if (!isNum(v)) continue;
        e.monthly[ym] = r2((e.monthly[ym] || 0) + v); seen[ym] = 1;
      }
    });
    // drop any line that ended up with no dated month
    for (var code in out.byCode) if (Object.prototype.hasOwnProperty.call(out.byCode, code) && !Object.keys(out.byCode[code].monthly).length) delete out.byCode[code];
    out.months = Object.keys(seen).sort();
    return out;
  }

  // the latest `cap` distinct months across every line, ascending
  function windowMonths(lines, cap){
    var seen = {};
    for (var c in lines) if (Object.prototype.hasOwnProperty.call(lines, c)) for (var ym in lines[c].monthly) if (Object.prototype.hasOwnProperty.call(lines[c].monthly, ym)) seen[ym] = 1;
    var all = Object.keys(seen).sort();
    return all.slice(Math.max(0, all.length - cap));
  }
  function sumOver(monthly, months){
    var s = 0, n = 0;
    months.forEach(function (ym){ if (isNum(monthly[ym])) { s += monthly[ym]; n++; } });
    return { sum: r2(s), n: n };
  }

  // Merge a freshly-parsed monthly series into the rolling record. New months win
  // on overlap (the latest statement is authoritative for a month it re-reports).
  // meta: { propKey, identity, noi, now, cap }. Returns a fresh record; `existing`
  // is not mutated.
  function merge(existing, series, meta){
    meta = meta || {};
    var cap = isNum(meta.cap) ? meta.cap : CAP;
    var gd = clone(isObj(existing) ? existing : {});
    var lines = isObj(gd.lines) ? gd.lines : {};
    var s = (series && isObj(series.byCode)) ? series.byCode : {};
    for (var c in s) if (Object.prototype.hasOwnProperty.call(s, c)){
      var incoming = s[c], ln = lines[c] || (lines[c] = { code: c, role: incoming.role, label: incoming.label, monthly: {} });
      if (incoming.role != null) ln.role = incoming.role;
      if (incoming.label) ln.label = incoming.label;
      for (var ym in incoming.monthly) if (Object.prototype.hasOwnProperty.call(incoming.monthly, ym)) ln.monthly[ym] = incoming.monthly[ym];   // newer wins
    }
    var months = windowMonths(lines, cap), keep = {};
    months.forEach(function (ym){ keep[ym] = 1; });
    var latest12 = months.slice(Math.max(0, months.length - 12));
    var prior12  = months.slice(Math.max(0, months.length - 24), Math.max(0, months.length - 12));
    for (var code in lines) if (Object.prototype.hasOwnProperty.call(lines, code)){
      var l = lines[code], m2 = {};
      for (var y in l.monthly) if (Object.prototype.hasOwnProperty.call(l.monthly, y) && keep[y]) m2[y] = l.monthly[y];
      if (!Object.keys(m2).length) { delete lines[code]; continue; }
      l.monthly = m2;
      var t = sumOver(m2, latest12), p = sumOver(m2, prior12);
      l.ttm = t.sum; l.ttmMonths = t.n; l.priorTtm = p.n ? p.sum : null; l.priorMonths = p.n;
    }
    return {
      schema: SCHEMA,
      propKey: meta.propKey != null ? meta.propKey : (gd.propKey != null ? gd.propKey : null),
      identity: isObj(meta.identity) ? meta.identity : (gd.identity || null),
      noi: isObj(meta.noi) ? assign({ computedAt: meta.now || null }, meta.noi) : (gd.noi || null),
      window: { months: months, cap: cap },
      lines: lines,
      updatedAt: meta.now || gd.updatedAt || null
    };
  }
  function assign(a, b){ for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  // Per-line trend for the UI. changePct compares the trailing 12 months to the 12
  // before them (only meaningful once priorMonths is a full 12). yoyMonthPct is the
  // single-month year-over-year for the latest month, available earlier (13+ months).
  function deltas(gd){
    var lines = (gd && isObj(gd.lines)) ? gd.lines : {};
    var res = [];
    for (var c in lines) if (Object.prototype.hasOwnProperty.call(lines, c)){
      var ln = lines[c], months = Object.keys(ln.monthly).sort();
      var latestMonth = months.length ? months[months.length - 1] : null;
      var latestVal = latestMonth != null ? ln.monthly[latestMonth] : null;
      var yearAgo = latestMonth != null ? ln.monthly[ymShift(latestMonth, -12)] : undefined;
      var yoy = (isNum(latestVal) && isNum(yearAgo) && yearAgo !== 0) ? (latestVal - yearAgo) / Math.abs(yearAgo) : null;
      var pct = (ln.priorTtm != null && ln.priorTtm !== 0 && ln.priorMonths === 12 && ln.ttmMonths === 12) ? (ln.ttm - ln.priorTtm) / Math.abs(ln.priorTtm) : null;
      res.push({ code: c, label: ln.label, role: ln.role, ttm: ln.ttm, ttmMonths: ln.ttmMonths,
                 priorTtm: ln.priorTtm, priorMonths: ln.priorMonths, changePct: pct,
                 latestMonth: latestMonth, latestVal: latestVal, yoyMonthPct: yoy });
    }
    return res;
  }

  // Monthly NOI for one calendar month: income-role lines add (including the negative
  // vacancy / concession lines), expense-role lines subtract. Raw classified figures —
  // an annualized run-rate estimate, not a printed statement footing.
  function monthNOI(byCode, ym){
    var noi = 0;
    for (var c in byCode) if (Object.prototype.hasOwnProperty.call(byCode, c)){
      var ln = byCode[c], v = ln.monthly[ym];
      if (!isNum(v)) continue;
      noi += (ln.role === "expense") ? -v : v;
    }
    return r2(noi);
  }
  // Lease-up / partial-year in-place NOI. A trailing statement understates the annual
  // run-rate in two cases: (1) LEASE-UP — the property was still leasing up at the start,
  // so gross rent doesn't begin in the first OR second month; (2) PARTIAL YEAR — the
  // statement covers fewer than a full 12 dated months (a property acquired or reporting
  // mid-year). In BOTH, the plain sum of the months present understates the year, so
  // annualize the last three months × 4 — for every line, not just NOI, so a caller can
  // rebuild the underwritten column on the same annualized run-rate (reserves, which are an
  // annual per-unit figure, must not be summed off a short statement). A full 12-month
  // statement with gross rent from the start is left alone (the 12-month sum stands, even if
  // a later month is zero). A gross-rent line is still required — without it we can't judge a
  // lease-up and never annualize on a false positive. series = monthlySeries() output.
  // Returns { applied, noi, monthsUsed, codeSums, basis, partial, leaseUpStart, reason }.
  function leaseUpNOI(series){
    var byCode = (series && series.byCode) || {};
    var months = (series && Array.isArray(series.months)) ? series.months.slice().sort() : [];
    if (months.length < 3) return { applied: false, noi: null, reason: "fewer than 3 months of data" };
    var gpr = byCode.GPR ? byCode.GPR.monthly : null;
    if (!gpr) return { applied: false, noi: null, reason: "no gross-rent line to judge the lease-up" };   // can't detect lease-up without gross rent — never a false positive
    var g1 = gpr[months[0]], g2 = gpr[months[1]];
    var leaseUpStart = !((isNum(g1) && g1 > 0) || (isNum(g2) && g2 > 0));   // no gross rent in either of the first two months
    var partial = months.length < 12;                                       // fewer than a full year of dated months
    if (!leaseUpStart && !partial) return { applied: false, noi: null, reason: "full 12-month statement, gross rent from the start" };
    var last3 = months.slice(months.length - 3), noi3 = 0, codeSums = {};
    last3.forEach(function (ym){ noi3 += monthNOI(byCode, ym); });
    for (var c in byCode) if (Object.prototype.hasOwnProperty.call(byCode, c)){
      var mo = byCode[c].monthly, s = 0;
      last3.forEach(function (ym){ if (isNum(mo[ym])) s += mo[ym]; });
      codeSums[c] = r2(s * 4);                                              // per-line last 3 months × 4 (annualized run-rate)
    }
    return { applied: true, noi: r2(noi3 * 4), monthsUsed: last3, codeSums: codeSums,
             basis: "last 3 months × 4", partial: partial, leaseUpStart: leaseUpStart };
  }

  return { SCHEMA: SCHEMA, CAP: CAP, monthlySeries: monthlySeries, merge: merge, deltas: deltas, windowMonths: windowMonths, ymShift: ymShift, monthNOI: monthNOI, leaseUpNOI: leaseUpNOI };
});
