/* ============================================================================
   Pro forma (next stage — F1, draft) — the NOI a lender is asked to accept: the T12 with changes, each with a
   kind and a story, adding up from the T12 NOI to the pro forma NOI to the dollar (Azriel's Queens Gate way).
   Two versions are kept, Safe ("base") and Aggressive; Aggressive = Safe + its own changes (an Aggressive change on
   the same line or account wins). Pure: the caller hands in the T12 lines (the in-place column of the Setup), the
   accounts under each line (on the same basis as the T12 rule), the monthly series for the revenue credit, the
   units, and the saved pro forma (assumptions.json → proForma). Nothing here reads or writes anything.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ProForma = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The kinds a change is filed as — the reconciliation groups by them (the order is the order shown).
  var KINDS = [
    { id: "revenue",      label: "Revenue credit",            hint: "recent months annualized" },
    { id: "partnership",  label: "Partnership / back-office", hint: "not an expense of the building" },
    { id: "nonRecurring", label: "Non-recurring",             hint: "happened once" },
    { id: "spread",       label: "Spread over years",         hint: "paid every few years, counted per year" },
    { id: "normalized",   label: "Normalized",                hint: "an unusual year brought to a normal one" },
    { id: "operating",    label: "Operating change",          hint: "how the property runs from now on" },
    { id: "marketNorm",   label: "Market norm",               hint: "brought to what the market runs" }
  ];
  var KIND = {}; KINDS.forEach(function (k){ KIND[k.id] = k; });
  var HOWS = { total: "New total", accountTotal: "New amount for one account", takeOut: "Take out accounts", spread: "Spread over years", pctRevenue: "% of revenue", perUnit: "Per unit" };
  // Rental deductions a "% of revenue" can price (as a % of gross potential rent); every expense line can (as a % of EGI).
  var DEDUCTIONS = { EMPL: 1, MOD: 1, VAC: 1, CONC: 1, BD: 1 };

  function r2(x){ return Math.round(x * 100) / 100; }
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function num(v){ if (typeof v === "string") v = parseFloat(v.replace(/[^0-9.\-]/g, "")); return isNum(v) ? v : null; }
  function norm(s){ return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
  function isIncome(sec){ return sec === "rental" || sec === "other"; }
  function isExpense(sec){ return sec === "expense"; }
  function wholeLine(how){ return how === "total" || how === "perUnit" || how === "pctRevenue" || how === "spreadLine"; }
  // a "spread" with accounts works on those accounts; with none, on the whole line
  function effHow(c){ return (c.how === "spread" && !(c.accounts && c.accounts.length)) ? "spreadLine" : c.how; }
  function inVersion(c, v){ var col = c.column || "both"; return v === "aggressive" ? true : (col === "base" || col === "both"); }

  // Why a change can't be used (null = it can). `line` is the line it changes ({key, section} or null).
  function problemOf(c, line, units){
    if (!c || !c.id) return "it has no id";
    if (!c.line) return "it names no line";
    if (!KIND[c.kind] || c.kind === "revenue") return "pick what kind of change it is";
    if (!String(c.story || "").trim()) return "write its reason (the story the lender reads)";
    if (["base", "aggressive", "both"].indexOf(c.column || "both") < 0) return "it applies to no version";
    var how = c.how;
    if (!HOWS[how]) return "pick how the line changes";
    if (how === "total" && num(c.value) == null) return "type the new total";
    if (how === "perUnit"){ if (num(c.perUnit) == null) return "type the $ per unit"; if (!(units > 0)) return "the property's units are missing"; }
    if (how === "pctRevenue"){
      var p = num(c.pct); if (p == null || p < 0 || p > 1) return "type the % (0 to 100)";
      if (line && !(isExpense(line.section) || DEDUCTIONS[line.key])) return "only an expense line or a rental deduction can be a % of revenue";
    }
    if (how === "takeOut" && !(c.accounts && c.accounts.length)) return "tick the accounts to take out";
    if (how === "accountTotal"){ if (!(c.accounts && c.accounts.length === 1)) return "tick the one account to change"; if (num(c.value) == null) return "type its new amount"; }
    if (how === "spread"){ var y = num(c.years); if (y == null || y < 2) return "type how many years (2 or more)"; }
    return null;
  }

  // The change in a few words, for the table, the reconciliation and the lender file.
  function describe(c, accountsOf){
    if (!c) return "";
    var n = (c.accounts || []).length;
    switch (c.how){
      case "total": return "New total " + money(num(c.value));
      case "perUnit": return money(num(c.perUnit)) + " per unit";
      case "pctRevenue": return pct(num(c.pct)) + " of revenue";
      case "takeOut": return "Took out " + (n === 1 ? "“" + c.accounts[0].name + "”" : n + " accounts");
      case "accountTotal": return (n ? "“" + c.accounts[0].name + "”" : "An account") + " set to " + money(num(c.value));
      case "spread": return (n ? (n === 1 ? "“" + c.accounts[0].name + "”" : n + " accounts") + " spread" : "Spread") + " over " + num(c.years) + " years";
      default: return HOWS[c.how] || "";
    }
  }
  function money(v){ if (!isNum(v)) return "—"; var s = Math.round(Math.abs(v)).toLocaleString("en-US"); return (v < 0 ? "-$" : "$") + s; }
  function pct(v){ if (!isNum(v)) return "—"; return (Math.round(v * 10000) / 100) + "%"; }

  // ---- one version (base = Safe, aggressive) --------------------------------------------------------------------
  // input: { lines:[{key,label,section,t12}], catalog?:{code:{label,section}}, accounts:[{name,line,amount,monthly?,sheet?,row?}],
  //          monthly:{code:{ym:amount}}, months:[ym…], units, pf:{revenue:{base,aggressive}, changes:[…]} }
  function computeVersion(input, v){
    var units = num(input.units);
    var pf = input.pf || {}, changes = Array.isArray(pf.changes) ? pf.changes : [];
    var catalog = input.catalog || {};
    // the lines, in the Setup's order; reserves are not part of the pro forma (they are an underwriting allowance)
    var order = [], L = {};
    (input.lines || []).forEach(function (ln){
      if (!ln || !ln.key || ln.section === "reserve") return;
      L[ln.key] = { key: ln.key, label: ln.label || ln.key, section: ln.section, t12: isNum(ln.t12) ? ln.t12 : 0, value: isNum(ln.t12) ? ln.t12 : 0, changes: [], kinds: [], added: false };
      order.push(ln.key);
    });
    var addLine = function (code){
      if (L[code]) return L[code];
      var c = catalog[code]; if (!c || !c.section || c.section === "reserve") return null;
      L[code] = { key: code, label: c.label || code, section: c.section, t12: 0, value: 0, changes: [], kinds: [], added: true };
      // an added line goes at the end of its section
      var lastIdx = -1; order.forEach(function (k, i){ if (L[k].section === c.section) lastIdx = i; });
      if (lastIdx < 0){ lastIdx = order.length - 1; if (c.section !== "expense") order.forEach(function (k, i){ if (isIncome(L[k].section)) lastIdx = i; }); }
      order.splice(lastIdx + 1, 0, code);
      return L[code];
    };
    var NOI = function (){ var n = 0; order.forEach(function (k){ var l = L[k]; if (isIncome(l.section)) n += l.value; else if (isExpense(l.section)) n -= l.value; }); return r2(n); };
    var EGI = function (){ var e = 0; order.forEach(function (k){ if (isIncome(L[k].section)) e += L[k].value; }); return r2(e); };
    var GPRv = function (){ return L.GPR ? L.GPR.value : 0; };
    var t12Noi = NOI(), steps = [], problems = [], stale = [];
    var step = function (rec, fn){ var before = NOI(); fn(); var eff = r2(NOI() - before); rec.effect = eff; steps.push(rec); };

    // 1. revenue credit — each income line = its last N months × 12 / N
    var rc = (pf.revenue && (v === "aggressive" ? (pf.revenue.aggressive || pf.revenue.base) : pf.revenue.base)) || null;
    var revenueInfo = null;
    if (rc){
      var nMo = num(rc.months), story = String(rc.story || "").trim();
      var months = Array.isArray(input.months) ? input.months.slice().sort() : [];
      if (!(nMo === 3 || nMo === 6)) problems.push({ id: "revenue", reason: "pick 3 or 6 months" });
      else if (!story) problems.push({ id: "revenue", reason: "write its reason (the story the lender reads)" });
      else if (months.length < nMo) problems.push({ id: "revenue", reason: "the T12 has fewer than " + nMo + " dated months" });
      else {
        var use = months.slice(months.length - nMo), monthly = input.monthly || {};
        revenueInfo = { months: use, n: nMo, story: story, lines: {} };
        step({ id: "revenue", kind: "revenue", line: null, label: "Revenue — last " + nMo + " months × " + (12 / nMo), story: story, how: "revenue", by: rc.by || null, at: rc.at || null }, function (){
          order.forEach(function (k){
            var l = L[k]; if (!isIncome(l.section)) return;
            var mo = monthly[k]; if (!mo) return;
            var s = 0, got = 0; use.forEach(function (ym){ if (isNum(mo[ym])){ s += mo[ym]; got++; } });
            if (!got) return;
            var nv = r2(s * 12 / nMo);
            revenueInfo.lines[k] = { from: l.value, to: nv };
            if (Math.abs(nv - l.value) > 0.004){ l.value = nv; if (l.changes.indexOf("revenue") < 0){ l.changes.push("revenue"); l.kinds.push("revenue"); } }
          });
        });
      }
    }

    // which changes count in this version; an Aggressive change on the same line (whole-line) or account wins
    var mine = changes.filter(function (c){ return c && inVersion(c, v); });
    var wholeOwner = {}, acctOwner = {};
    mine.forEach(function (c){
      var h = effHow(c), aggr = (c.column === "aggressive");
      if (wholeLine(h)){ var o = wholeOwner[c.line]; if (!o || (v === "aggressive" && aggr && o.column !== "aggressive")) wholeOwner[c.line] = c; }
      else (c.accounts || []).forEach(function (a){ var key = c.line + "|" + norm(a.name) + "|" + (a.sheet || ""), o = acctOwner[key]; if (!o || (v === "aggressive" && aggr && o.column !== "aggressive")) acctOwner[key] = c; });
    });

    // the accounts under each line
    var acctByLine = {}; (input.accounts || []).forEach(function (a){ if (!a || !a.line) return; (acctByLine[a.line] || (acctByLine[a.line] = [])).push(a); });
    var findAcct = function (line, ref){ var list = acctByLine[line] || [], n = norm(ref.name);
      return list.filter(function (a){ return norm(a.name) === n && (!ref.sheet || !a.sheet || ref.sheet === a.sheet); })[0] || null; };

    // 2. account changes (take out / spread), in the order they were made
    mine.forEach(function (c){
      var h = effHow(c); if (wholeLine(h)) return;
      var line = L[c.line] || null;
      var why = problemOf(c, line, units); if (!why && !line) why = "its line is not in this T12";
      if (why){ problems.push({ id: c.id, reason: why }); return; }
      if (wholeOwner[c.line]){ problems.push({ id: c.id, reason: "the line has a new total, so its accounts can't change too", soft: true }); return; }
      var mineAccts = (c.accounts || []).filter(function (a){ return acctOwner[c.line + "|" + norm(a.name) + "|" + (a.sheet || "")] === c; });
      if (!mineAccts.length) return;   // every account it names is changed by an Aggressive change instead
      var found = [], missing = [];
      mineAccts.forEach(function (a){ var f = findAcct(c.line, a); if (f) found.push(f); else missing.push(a.name); });
      if (missing.length){ stale.push({ id: c.id, missing: missing }); problems.push({ id: c.id, reason: "not in this T12 any more: " + missing.join(", "), stale: true }); return; }
      step({ id: c.id, kind: c.kind, line: c.line, label: line.label, story: String(c.story).trim(), how: c.how, what: describe(c), by: c.by || null, at: c.at || null, column: c.column || "both" }, function (){
        var amt = 0; found.forEach(function (a){ amt += num(a.amount) || 0; });
        var cut = (h === "spread") ? amt * (1 - 1 / num(c.years)) : (h === "accountTotal") ? amt - num(c.value) : amt;
        line.value = r2(line.value - cut);
        line.changes.push(c.id); line.kinds.push(c.kind);
      });
    });

    // 3. whole-line changes (new total, per unit, a whole line spread); 4. then % of revenue (it reads the version's revenue)
    var applyWhole = function (c){
      var h = effHow(c), line = L[c.line] || addLine(c.line);
      var why = problemOf(c, line, units); if (!why && !line) why = "that line can't be added";
      if (why){ problems.push({ id: c.id, reason: why }); return; }
      step({ id: c.id, kind: c.kind, line: c.line, label: line.label, story: String(c.story).trim(), how: c.how, what: describe(c), by: c.by || null, at: c.at || null, column: c.column || "both" }, function (){
        var nv = line.value;
        if (h === "total") nv = num(c.value);
        else if (h === "perUnit") nv = num(c.perUnit) * units;
        else if (h === "spreadLine") nv = line.value / num(c.years);
        else if (h === "pctRevenue") nv = (isExpense(line.section) ? 1 : -1) * num(c.pct) * (isExpense(line.section) ? EGI() : GPRv());
        line.value = r2(nv);
        line.changes.push(c.id); line.kinds.push(c.kind);
      });
    };
    mine.forEach(function (c){ var h = effHow(c); if (wholeLine(h) && h !== "pctRevenue" && wholeOwner[c.line] === c) applyWhole(c); });
    mine.forEach(function (c){ var h = effHow(c); if (h === "pctRevenue" && wholeOwner[c.line] === c) applyWhole(c); });
    // a whole-line change that lost to an Aggressive one on the same line is not an error — it just isn't this version's
    mine.forEach(function (c){ var h = effHow(c); if (wholeLine(h) && wholeOwner[c.line] !== c && problemOf(c, L[c.line] || null, units)) problems.push({ id: c.id, reason: problemOf(c, L[c.line] || null, units) }); });

    // the reconciliation: T12 NOI + every step = the pro forma NOI (a guard, not a fudge: it is worked out twice)
    var noi = NOI(), sum = t12Noi; steps.forEach(function (s){ sum += s.effect; }); sum = r2(sum);
    var gap = r2(noi - sum), reconciles = Math.abs(gap) < 0.01;
    var groups = KINDS.map(function (k){ var items = steps.filter(function (s){ return s.kind === k.id; });
      var tot = 0; items.forEach(function (s){ tot += s.effect; }); return { kind: k.id, label: k.label, items: items, total: r2(tot) }; }).filter(function (g){ return g.items.length; });
    var lines = order.map(function (k){ var l = L[k]; return { key: k, label: l.label, section: l.section, t12: l.t12, value: l.value, delta: r2(l.value - l.t12), changes: l.changes.slice(), kinds: l.kinds.slice(), added: l.added }; });
    var opex = 0; order.forEach(function (k){ if (isExpense(L[k].section)) opex += L[k].value; });
    return { version: v, lines: lines, byKey: L, egi: EGI(), opex: r2(opex), noi: noi, t12Noi: t12Noi, steps: steps, groups: groups,
             reconciles: reconciles, gap: gap, problems: problems, stale: stale, revenue: revenueInfo };
  }

  function compute(input){
    input = input || {};
    var t12 = { egi: 0, opex: 0, noi: 0 };
    (input.lines || []).forEach(function (l){ if (!l || l.section === "reserve") return; var v = isNum(l.t12) ? l.t12 : 0; if (isIncome(l.section)) t12.egi += v; else if (isExpense(l.section)) t12.opex += v; });
    t12.egi = r2(t12.egi); t12.opex = r2(t12.opex); t12.noi = r2(t12.egi - t12.opex);
    return { t12: t12, base: computeVersion(input, "base"), aggressive: computeVersion(input, "aggressive") };
  }

  // Each account under a line (the T12 reading's rows), on the same basis as the line: the 12-month total, or —
  // when the T12 rule annualized the statement — its last 3 months × 4 (or the last 12 of a longer file).
  // rows: [{name, amount, section, monthly, forceCode, row, sheet?}], lineOf(row) → line code, rule: {applied, trimmed, monthsUsed, window}
  function accountsFrom(rows, lineOf, rule){
    var out = [];
    (rows || []).forEach(function (r, i){
      if (!r) return; var code = lineOf(r); if (!code) return;
      var amt = num(r.amount) || 0, mo = r.monthly || null;
      if (rule && (rule.applied || rule.trimmed) && mo){
        var use = rule.applied ? (rule.monthsUsed || []) : (rule.window || []), s = 0;
        use.forEach(function (ym){ if (isNum(mo[ym])) s += mo[ym]; });
        amt = r2(s * (rule.applied ? 12 / Math.max(1, use.length) : 1));
      }
      out.push({ id: "a" + i, name: String(r.name || "").trim(), line: code, amount: r2(amt), monthly: mo, sheet: r.sheet || null, row: (r.row != null ? r.row : null) });
    });
    return out;
  }

  // The lender file's three sheets as rows (the caller turns them into a workbook).
  function lenderSheets(res, meta, opts){
    meta = meta || {}; opts = opts || {};
    var both = !!opts.both, b = res.base, a = res.aggressive, units = num(meta.units);
    var per = function (v){ return (units > 0 && isNum(v)) ? r2(v / units) : null; };
    var storyOf = function (ver, key){ var l = ver.byKey[key]; if (!l || !l.changes.length) return ["", "", ""];
      var sts = ver.steps.filter(function (s){ return l.changes.indexOf(s.id) >= 0; });
      return [sts.map(function (s){ return s.what || s.label; }).join("; "), sts.map(function (s){ return (KIND[s.kind] || {}).label || s.kind; }).join("; "), sts.map(function (s){ return s.story; }).join(" | ")]; };
    var head = [["Pro forma — " + (meta.property || "")], ["Units", units || ""], ["T12", meta.period || ""], ["Prepared", meta.date || ""], ["Prepared by", meta.by || ""], []];
    var cols = ["Line", "T12", "$/unit", "Pro forma (Safe)", "$/unit"].concat(both ? ["Aggressive", "$/unit"] : []).concat(["Change", "Kind", "Story"]);
    var pf = [cols], money = [];
    var keys = []; (b.lines || []).forEach(function (l){ keys.push(l.key); }); (a.lines || []).forEach(function (l){ if (keys.indexOf(l.key) < 0) keys.push(l.key); });
    var sec = function (k){ return (b.byKey[k] || a.byKey[k]).section; };
    var row = function (k){ var lb = b.byKey[k], la = a.byKey[k], t = (lb || la).t12, s = storyOf(both ? a : b, k), sb = storyOf(b, k);
      var r = [(lb || la).label, t, per(t), lb ? lb.value : t, per(lb ? lb.value : t)];
      if (both) r = r.concat([la ? la.value : t, per(la ? la.value : t)]);
      return r.concat(both ? s : sb); };
    var sub = function (label, t, vb, va){ var r = [label, t, per(t), vb, per(vb)]; if (both) r = r.concat([va, per(va)]); return r.concat(["", "", ""]); };
    var incK = keys.filter(function (k){ return isIncome(sec(k)); }), expK = keys.filter(function (k){ return isExpense(sec(k)); });
    incK.forEach(function (k){ pf.push(row(k)); });
    pf.push(sub("Effective Gross Income", res.t12.egi, b.egi, a.egi));
    expK.forEach(function (k){ pf.push(row(k)); });
    pf.push(sub("Total Operating Expenses", res.t12.opex, b.opex, a.opex));
    pf.push(sub("Net Operating Income", res.t12.noi, b.noi, a.noi));
    // reserves: the Underwriting's $/unit on both sides (the pro forma NOI itself is before reserves, like the T12 NOI)
    var rsv = num(meta.reserves);
    if (rsv != null && rsv > 0){
      pf.push(sub("Replacement reserves (the underwriting's)", rsv, rsv, rsv));
      pf.push(sub("NOI after reserves", r2(res.t12.noi - rsv), r2(b.noi - rsv), r2(a.noi - rsv)));
    }
    var rec = function (ver, title){
      var out = [[title], ["T12 NOI", "", "", ver.t12Noi]];
      ver.groups.forEach(function (g){ out.push([g.label, "", "", g.total]); g.items.forEach(function (s){ out.push(["", s.label + (s.what ? " — " + s.what : ""), s.story, s.effect]); }); });
      out.push(["Pro forma NOI", "", "", ver.noi]); out.push([ver.reconciles ? "Reconciles to the dollar" : "Does NOT reconcile — gap " + money(ver.gap)]); out.push([]);
      return out; };
    var recon = rec(b, "Safe").concat(both ? rec(a, "Aggressive") : []);
    // the T12 by month, with the months used for the revenue credit marked
    var monthly = [], months = (meta.months || []).slice().sort(), used = (b.revenue && b.revenue.months) || [];
    monthly.push(["Line"].concat(months).concat(["Total"]));
    monthly.push(["Used for the revenue credit"].concat(months.map(function (m){ return used.indexOf(m) >= 0 ? "yes" : ""; })).concat([""]));
    Object.keys(meta.monthly || {}).forEach(function (k){ var mo = meta.monthly[k], t = 0; var r = [(b.byKey[k] || {}).label || k].concat(months.map(function (m){ var x = mo[m]; if (isNum(x)) t += x; return isNum(x) ? x : null; })); r.push(r2(t)); monthly.push(r); });
    return { head: head, proForma: pf, reconciliation: recon, monthly: monthly };
  }

  return { KINDS: KINDS, KIND: KIND, HOWS: HOWS, DEDUCTIONS: DEDUCTIONS, compute: compute, computeVersion: computeVersion,
           accountsFrom: accountsFrom, problemOf: problemOf, describe: describe, lenderSheets: lenderSheets, money: money, pct: pct };
});
