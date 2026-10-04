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
      for (var ym in incoming.monthly) if (Object.prototype.hasOwnProperty.call(incoming.monthly, ym)){
        if (meta.keepExisting && isNum(ln.monthly[ym])) continue;   // 2.9.7 (#14) — an OLDER file only fills months not already on record
        ln.monthly[ym] = incoming.monthly[ym];                       // otherwise the newer statement wins
      }
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
  // In-place NOI rule (2.9.7 — the T12 rule, per Azriel; #11, #257). Only T12 files are uploaded (12
  // months or more). Applied to the file's DATED months:
  //   • a file with MORE than 12 months uses only its LAST 12 (the earlier months stay in the history);
  //   • NOI = the last 3 months × 4 when the file covers FEWER than 12 months (7, 8, 9, 10…), or when the
  //     first two of its (last-12) months both have NOI of $0 or less (lease-up);
  //   • otherwise NOI = the 12-month total.
  // Every line is summed (codeSums) over the months used, so a caller rebuilds the in-place AND the
  // underwritten column on the same months — reserves stay an annual per-unit figure. The lease-up test
  // still needs a gross-rent line, so a statement of pure expenses can't trigger it.
  // Returns { applied (annualized), trimmed (last 12 of a longer file), noi, monthsUsed, codeSums, basis,
  //           why: "short" | "leaseup" | "last12" | "total", monthsInFile, window, annualizedStart, reason }.
  function noiRule(series){
    var byCode = (series && series.byCode) || {};
    var months = (series && Array.isArray(series.months)) ? series.months.slice().sort() : [];
    var monthsInFile = months.length;
    if (!months.length) return { applied: false, trimmed: false, noi: null, why: "total", monthsInFile: 0, window: [], windowNOI: null, reason: "no dated months — the statement total stands" };
    var win = months.length > 12 ? months.slice(months.length - 12) : months;
    var trimmed = months.length > 12;
    var sumsOver = function (list, k){
      var cs = {};
      for (var c in byCode) if (Object.prototype.hasOwnProperty.call(byCode, c)){
        var mo = byCode[c].monthly, s = 0;
        list.forEach(function (ym){ if (isNum(mo[ym])) s += mo[ym]; });
        cs[c] = r2(s * (k || 1));
      }
      return cs;
    };
    var noiOver = function (list){ var n = 0; list.forEach(function (ym){ n += monthNOI(byCode, ym); }); return r2(n); };
    var hasIncome = false; for (var ci in byCode) if (Object.prototype.hasOwnProperty.call(byCode, ci) && byCode[ci].role !== "expense") hasIncome = true;
    var shortFile = win.length < 12 && hasIncome;
    var windowNOI = noiOver(win);   // the classified lines' NOI over the months judged (the last 12 of a longer file)   // a file with no income lines at all is not a statement to annualize
    var leaseUp = false;
    if (win.length >= 2 && byCode.GPR && byCode.GPR.monthly){
      var m1 = monthNOI(byCode, win[0]), m2 = monthNOI(byCode, win[1]);
      leaseUp = (m1 <= 0 && m2 <= 0);
    }
    if ((shortFile || leaseUp) && win.length >= 3){
      var last3 = win.slice(win.length - 3);
      return { applied: true, trimmed: trimmed, noi: r2(noiOver(last3) * 4), monthsUsed: last3, codeSums: sumsOver(last3, 4),
               basis: "last 3 months × 4", annualizedStart: true, why: shortFile ? "short" : "leaseup", monthsInFile: monthsInFile, window: win, windowNOI: windowNOI,
               reason: shortFile ? ("the statement covers " + win.length + " months — fewer than 12") : "the first two months have NOI of $0 or less (lease-up)" };
    }
    if (trimmed){
      return { applied: false, trimmed: true, noi: noiOver(win), monthsUsed: win, codeSums: sumsOver(win, 1), basis: "last 12 months",
               why: "last12", monthsInFile: monthsInFile, window: win, windowNOI: windowNOI, reason: "the file covers " + monthsInFile + " months; using the last 12" };
    }
    return { applied: false, trimmed: false, noi: null, why: "total", monthsInFile: monthsInFile, window: win, windowNOI: windowNOI, reason: "the 12-month total stands" };
  }
  // Kept for callers of the older name: the same rule.
  function annualizedNOI(series){ return noiRule(series); }

  return { SCHEMA: SCHEMA, CAP: CAP, monthlySeries: monthlySeries, merge: merge, deltas: deltas, windowMonths: windowMonths, ymShift: ymShift, monthNOI: monthNOI, annualizedNOI: annualizedNOI, noiRule: noiRule };
});
