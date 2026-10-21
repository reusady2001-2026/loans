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
  // Round 1 (the operator, 2026-10-19): a change is made to ONE ACCOUNT — "I'm not going to write a new total for a
  // whole category without any basis"; a line's pro forma is the T12 plus its accounts' changes. Each change names its
  // account (an account the T12 doesn't have is added with `newAccount: true`). The whole-line ways of the first draft
  // (a new total for the line, a whole line per unit / % of revenue / spread) are no longer made: a saved one is listed
  // as "not counted" so it can be removed.
  // (2026-10-19, later) "Take it out" is no longer offered — a new amount of $0 does it, and reads "Took out …"; a
  // saved takeOut still counts. "Annualize": the account = its last 3, 6 or 12 months × 12/N.
  var HOWS = { accountTotal: "New amount", spread: "Spread over years", annualize: "Annualize", pctRevenue: "% of revenue", perUnit: "Per unit", takeOut: "Take it out" };
  var ONE = { accountTotal: 1, pctRevenue: 1, perUnit: 1, annualize: 1 };   // the ways that set one account to a figure
  var MONTHS_OK = { 3: 1, 6: 1, 12: 1 };
  // Rental deductions a "% of revenue" can price (as a % of gross potential rent); every expense account can (as a % of EGI).
  var DEDUCTIONS = { EMPL: 1, MOD: 1, VAC: 1, CONC: 1, BD: 1 };

  function r2(x){ return Math.round(x * 100) / 100; }
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function num(v){ if (typeof v === "string") v = parseFloat(v.replace(/[^0-9.\-]/g, "")); return isNum(v) ? v : null; }
  function norm(s){ return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
  function isIncome(sec){ return sec === "rental" || sec === "other"; }
  function isExpense(sec){ return sec === "expense"; }
  // a change of the first draft that stands in for a whole line (no account named)
  function isWholeLine(c){ return !!c && (c.how === "total" || ((c.how === "perUnit" || c.how === "pctRevenue" || c.how === "spread") && !(c.accounts && c.accounts.length))); }
  function inVersion(c, v){ var col = c.column || "both"; return v === "aggressive" ? true : (col === "base" || col === "both"); }
  function acctKey(line, name, sheet){ return line + "|" + norm(name) + "|" + (sheet || ""); }

  // Why a change can't be used (null = it can). `line` is the line it changes ({key, section} or null).
  function problemOf(c, line, units){
    if (!c || !c.id) return "it has no id";
    if (!c.line) return "it names no line";
    if (isWholeLine(c)) return "it changes the whole line — the pro forma now changes one account at a time: remove it and change the accounts";
    if (!KIND[c.kind] || (c.kind === "revenue" && c.how !== "annualize")) return "pick what kind of change it is";
    if (!String(c.story || "").trim()) return "write its reason (the story the lender reads)";
    if (["base", "aggressive", "both"].indexOf(c.column || "both") < 0) return "it applies to no version";
    var how = c.how, n = (c.accounts || []).length;
    if (!HOWS[how]) return "pick how the account changes";
    if (!n) return "pick the account";
    if (ONE[how] && n !== 1) return "one account at a time";
    if (c.newAccount && (!ONE[how] || how === "annualize" || !String(c.accounts[0].name || "").trim())) return "name the new account and its amount";
    if (how === "annualize" && !MONTHS_OK[num(c.months)]) return "pick 3, 6 or 12 months";
    if (how === "accountTotal" && num(c.value) == null) return "type its new amount";
    if (how === "perUnit"){ if (num(c.perUnit) == null) return "type the $ per unit"; if (!(units > 0)) return "the property's units are missing"; }
    if (how === "pctRevenue"){
      var p = num(c.pct); if (p == null || p < 0 || p > 1) return "type the % (0 to 100)";
      if (line && !(isExpense(line.section) || DEDUCTIONS[line.key])) return "only an expense account or a rental deduction can be a % of revenue";
    }
    if (how === "spread"){ var y = num(c.years); if (y == null || y < 2) return "type how many years (2 or more)"; }
    return null;
  }

  // The change in a few words, for the table, the reconciliation and the lender file.
  function describe(c){
    if (!c) return "";
    var n = (c.accounts || []).length, nm = n ? "“" + c.accounts[0].name + "”" : "";
    if (isWholeLine(c)){
      if (c.how === "total") return "New total " + money(num(c.value)) + " for the whole line";
      if (c.how === "perUnit") return money(num(c.perUnit)) + " per unit for the whole line";
      if (c.how === "pctRevenue") return pct(num(c.pct)) + " of revenue for the whole line";
      return "The whole line spread over " + num(c.years) + " years";
    }
    var add = c.newAccount ? "Added " + nm + ": " : "", ofRev = DEDUCTIONS[c.line] ? " of gross potential rent" : " of revenue";
    switch (c.how){
      case "takeOut": return "Took out " + (n === 1 ? nm : n + " accounts");
      case "accountTotal": return c.newAccount ? add + money(num(c.value)) : (num(c.value) === 0 ? "Took out " + nm : nm + " set to " + money(num(c.value)));
      case "annualize": return nm + " annualized from its last " + num(c.months) + " months";
      case "spread": return (n === 1 ? nm : n + " accounts") + " spread over " + num(c.years) + " years";
      case "pctRevenue": return c.newAccount ? add + pct(num(c.pct)) + ofRev : nm + " at " + pct(num(c.pct)) + ofRev;
      case "perUnit": return c.newAccount ? add + money(num(c.perUnit)) + " per unit" : nm + " at " + money(num(c.perUnit)) + " per unit";
      default: return HOWS[c.how] || "";
    }
  }
  function money(v){ if (!isNum(v)) return "—"; var s = Math.round(Math.abs(v)).toLocaleString("en-US"); return (v < 0 ? "-$" : "$") + s; }
  function pct(v){ if (!isNum(v)) return "—"; return (Math.round(v * 10000) / 100) + "%"; }

  // ---- one version (base = Safe, aggressive) --------------------------------------------------------------------
  // input: { lines:[{key,label,section,t12}], catalog?:{code:{label,section}}, accounts:[{id,name,line,amount,monthly?,sheet?,row?,gap?}],
  //          monthly:{code:{ym:amount}}, months:[ym…], units, pf:{revenue:{base,aggressive}, changes:[…]} }
  // Every account carries its own pro forma value (its T12 amount until a change sets it); a line is its T12 figure plus
  // the moves of its accounts, so a line always equals the sum of its accounts.
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
    // the accounts, each with its value in this version
    var A = [], AK = {};
    (input.accounts || []).forEach(function (a, i){
      if (!a || !a.line || !L[a.line]) return;
      var o = { id: a.id || ("a" + i), name: String(a.name || "").trim(), line: a.line, amount: num(a.amount) || 0, value: num(a.amount) || 0, monthly: a.monthly || null, sheet: a.sheet || null, row: (a.row != null ? a.row : null), gap: !!a.gap, added: false, changes: [], kinds: [] };
      A.push(o); if (!AK[acctKey(o.line, o.name, o.sheet)]) AK[acctKey(o.line, o.name, o.sheet)] = o;
    });
    var findAcct = function (line, ref){ var n = norm(ref.name);
      return A.filter(function (a){ return a.line === line && norm(a.name) === n && (!ref.sheet || !a.sheet || ref.sheet === a.sheet); })[0] || null; };
    var setAcct = function (a, nv){ nv = r2(nv); L[a.line].value = r2(L[a.line].value + nv - a.value); a.value = nv; };
    var NOI = function (){ var n = 0; order.forEach(function (k){ var l = L[k]; if (isIncome(l.section)) n += l.value; else if (isExpense(l.section)) n -= l.value; }); return r2(n); };
    var EGI = function (){ var e = 0; order.forEach(function (k){ if (isIncome(L[k].section)) e += L[k].value; }); return r2(e); };
    var GPRv = function (){ return L.GPR ? L.GPR.value : 0; };
    var t12Noi = NOI(), steps = [], problems = [], stale = [];
    var step = function (rec, fn){ var before = NOI(); fn(); var eff = r2(NOI() - before); rec.effect = eff; steps.push(rec); };

    // 1. revenue credit — each income account = its last N months × 12 / N (a line with no monthly accounts: the line's own months)
    var rc = (pf.revenue && (v === "aggressive" ? (pf.revenue.aggressive || pf.revenue.base) : pf.revenue.base)) || null;
    var revenueInfo = null;
    if (rc){
      var nMo = num(rc.months), story = String(rc.story || "").trim();
      var months = Array.isArray(input.months) ? input.months.slice().sort() : [];
      if (!MONTHS_OK[nMo]) problems.push({ id: "revenue", reason: "pick 3, 6 or 12 months" });
      else if (!story) problems.push({ id: "revenue", reason: "write its reason (the story the lender reads)" });
      else if (months.length < nMo) problems.push({ id: "revenue", reason: "the T12 has fewer than " + nMo + " dated months" });
      else {
        var use = months.slice(months.length - nMo), monthly = input.monthly || {};
        var ann = function (mo){ var s = 0, got = 0; use.forEach(function (ym){ if (isNum(mo[ym])){ s += mo[ym]; got++; } }); return got ? r2(s * 12 / nMo) : null; };
        revenueInfo = { months: use, n: nMo, story: story, lines: {}, accounts: {} };
        step({ id: "revenue", kind: "revenue", line: null, label: "Revenue — last " + nMo + " months × " + (12 / nMo), story: story, how: "revenue", by: rc.by || null, at: rc.at || null }, function (){
          order.forEach(function (k){
            var l = L[k]; if (!isIncome(l.section)) return;
            var from = l.value, mine = A.filter(function (a){ return a.line === k && a.monthly; });
            if (mine.length){
              mine.forEach(function (a){ var nv = ann(a.monthly); if (nv == null) return; revenueInfo.accounts[a.id] = { from: a.value, to: nv }; setAcct(a, nv); });
            } else if (monthly[k]){ var nv = ann(monthly[k]); if (nv != null) l.value = nv; }
            if (Math.abs(l.value - from) > 0.004){ revenueInfo.lines[k] = { from: from, to: l.value }; if (l.changes.indexOf("revenue") < 0){ l.changes.push("revenue"); l.kinds.push("revenue"); } }
          });
        });
      }
    }

    // which changes count in this version; an Aggressive change on the same account wins
    var mine = changes.filter(function (c){ return c && inVersion(c, v); });
    var owner = {};
    mine.forEach(function (c){
      if (isWholeLine(c)) return;
      var aggr = (c.column === "aggressive");
      (c.accounts || []).forEach(function (a){ var key = acctKey(c.line, a.name, a.sheet || ""), o = owner[key]; if (!o || (v === "aggressive" && aggr && o.column !== "aggressive")) owner[key] = c; });
    });

    // 2. the account changes, in the order they were made; a % of revenue last (it reads this version's revenue):
    //    first the rental deductions (a % of gross potential rent), then the expenses (a % of EGI)
    var apply = function (c){
      var line = L[c.line] || (c.newAccount ? addLine(c.line) : null);
      var why = problemOf(c, line, units); if (!why && !line) why = "its line is not in this T12";
      if (why){ problems.push({ id: c.id, reason: why, legacy: isWholeLine(c) }); return; }
      var refs = (c.accounts || []).filter(function (a){ return owner[acctKey(c.line, a.name, a.sheet || "")] === c; });
      if (!refs.length) return;   // every account it names is changed by an Aggressive change instead
      var found = [], missing = [];
      refs.forEach(function (ref){
        var f = findAcct(c.line, ref);
        if (c.newAccount){
          if (f && !f.added){ missing.push(null); return; }
          if (!f){ f = { id: "new:" + c.line + "|" + norm(ref.name), name: String(ref.name).trim(), line: c.line, amount: 0, value: 0, monthly: null, sheet: null, row: null, gap: false, added: true, changes: [], kinds: [] }; A.push(f); }
        }
        if (f) found.push(f); else missing.push(ref.name);
      });
      if (c.newAccount && missing.length){ problems.push({ id: c.id, reason: "“" + c.accounts[0].name + "” is already in the T12 — change it there" }); return; }
      if (missing.length){ stale.push({ id: c.id, missing: missing }); problems.push({ id: c.id, reason: "not in this T12 any more: " + missing.join(", "), stale: true }); return; }
      var annTo = null;
      if (c.how === "annualize"){
        var nA = num(c.months), allM = Array.isArray(input.months) ? input.months.slice().sort() : [], useA = allM.slice(Math.max(0, allM.length - nA)), a0 = found[0];
        if (allM.length < nA){ problems.push({ id: c.id, reason: "the T12 has fewer than " + nA + " dated months" }); return; }
        var sA = 0, gotA = 0; if (a0.monthly) useA.forEach(function (ym){ if (isNum(a0.monthly[ym])){ sA += a0.monthly[ym]; gotA++; } });
        if (!gotA){ problems.push({ id: c.id, reason: "the T12 has no months for this account" }); return; }
        annTo = r2(sA * 12 / nA);
      }
      step({ id: c.id, kind: c.kind, line: c.line, account: found.length === 1 ? found[0].name : null, label: line.label, story: String(c.story).trim(), how: c.how, what: describe(c), by: c.by || null, at: c.at || null, column: c.column || "both" }, function (){
        found.forEach(function (a){
          var nv = a.value;
          if (c.how === "takeOut") nv = 0;
          else if (c.how === "annualize") nv = annTo;
          else if (c.how === "accountTotal") nv = num(c.value);
          else if (c.how === "spread") nv = a.value / num(c.years);
          else if (c.how === "perUnit") nv = num(c.perUnit) * units;
          else if (c.how === "pctRevenue") nv = isExpense(line.section) ? num(c.pct) * EGI() : -num(c.pct) * GPRv();
          setAcct(a, nv); a.changes.push(c.id); a.kinds.push(c.kind);
        });
        line.changes.push(c.id); line.kinds.push(c.kind);
      });
    };
    var isPct = function (c){ return c.how === "pctRevenue"; }, secOf = function (c){ var l = L[c.line] || catalog[c.line]; return l ? l.section : null; };
    mine.forEach(function (c){ if (!isPct(c)) apply(c); });
    mine.forEach(function (c){ if (isPct(c) && !isExpense(secOf(c))) apply(c); });
    mine.forEach(function (c){ if (isPct(c) && isExpense(secOf(c))) apply(c); });

    // the reconciliation: T12 NOI + every step = the pro forma NOI (a guard, not a fudge: it is worked out twice)
    var noi = NOI(), sum = t12Noi; steps.forEach(function (s){ sum += s.effect; }); sum = r2(sum);
    var gap = r2(noi - sum), reconciles = Math.abs(gap) < 0.01;
    var groups = KINDS.map(function (k){ var items = steps.filter(function (s){ return s.kind === k.id; });
      var tot = 0; items.forEach(function (s){ tot += s.effect; }); return { kind: k.id, label: k.label, items: items, total: r2(tot) }; }).filter(function (g){ return g.items.length; });
    var lines = order.map(function (k){ var l = L[k]; return { key: k, label: l.label, section: l.section, t12: l.t12, value: l.value, delta: r2(l.value - l.t12), changes: l.changes.slice(), kinds: l.kinds.slice(), added: l.added }; });
    var accounts = A.map(function (a){ return { id: a.id, name: a.name, line: a.line, amount: a.amount, value: a.value, delta: r2(a.value - a.amount), monthly: a.monthly, sheet: a.sheet, row: a.row, gap: a.gap, added: a.added, changes: a.changes.slice(), kinds: a.kinds.slice() }; });
    var acctById = {}; accounts.forEach(function (a){ acctById[a.id] = a; });
    var opex = 0; order.forEach(function (k){ if (isExpense(L[k].section)) opex += L[k].value; });
    return { version: v, lines: lines, byKey: L, accounts: accounts, acctById: acctById, egi: EGI(), opex: r2(opex), noi: noi, t12Noi: t12Noi, steps: steps, groups: groups,
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

  // ---- suggestions (round 1) ---------------------------------------------------------------------------------------
  function refOf(a){ var o = { name: a.name }; if (a.sheet) o.sheet = a.sheet; if (a.row != null) o.row = a.row; return o; }
  function r6(x){ return Math.round(x * 1e6) / 1e6; }
  // From the underwriting assumptions — the pro forma is the draft of the underwriting (the operator, 2026-10-19): "If I
  // assume a management fee of 2.5%, then that will be my default story for lowering the management fee if it was
  // higher." A line that runs ABOVE its assumption gets one suggested change on its biggest account, sized so the line
  // lands on the assumption (its other accounts stay as they are), with a ready story. Nothing is applied by itself.
  // assume: { mgmtPct, vacancyPct } (decimals).
  // (2026-10-21) an assumption that would LOWER the NOI is never a suggestion: it is a warning. The T12 runs better than
  // the assumption, the underwriting keeps the T12's figure, and the warning says what a lender underwriting the
  // assumption would take off the NOI (effect < 0).
  function assumptionWarnings(input, assume){
    input = input || {}; assume = assume || {};
    var out = [], lines = {}; (input.lines || []).forEach(function (l){ if (l && l.key) lines[l.key] = l; });
    var egi = 0; (input.lines || []).forEach(function (l){ if (l && isIncome(l.section) && isNum(l.t12)) egi += l.t12; });
    var gpr = lines.GPR && isNum(lines.GPR.t12) ? lines.GPR.t12 : 0;
    var mg = lines.MGMT, am = num(assume.mgmtPct);
    if (mg && am != null && am > 0 && egi > 0 && isNum(mg.t12) && mg.t12 >= 0 && mg.t12 / egi < am - 0.00005){
      var effM = r2(mg.t12 - am * egi);
      out.push({ id: "warn:MGMT", line: "MGMT", assumed: am, actual: r6(mg.t12 / egi), effect: effM,
        text: "Management fee: your assumption is " + pct(am) + " of revenue; this T12 runs " + pct(mg.t12 / egi) + " (" + money(mg.t12) + "). The underwriting keeps the T12's — at " + pct(am) + " the NOI would be " + money(-effM) + " lower." });
    }
    var vc = lines.VAC, av = num(assume.vacancyPct);
    if (av != null && av > 0 && gpr > 0){
      var loss = vc && isNum(vc.t12) ? -vc.t12 : 0;
      if (loss / gpr < av - 0.00005){
        var effV = r2(loss - av * gpr);
        out.push({ id: "warn:VAC", line: "VAC", assumed: av, actual: r6(loss / gpr), effect: effV,
          text: "Vacancy: your assumption is " + pct(av) + " of gross potential rent; this T12 runs " + pct(loss / gpr) + " (" + money(-loss) + "). The underwriting keeps the T12's — at " + pct(av) + " the NOI would be " + money(-effV) + " lower." });
      }
    }
    return out;
  }
  function assumptionSuggestions(input, assume){
    input = input || {}; assume = assume || {};
    var out = [], lines = {}; (input.lines || []).forEach(function (l){ if (l && l.key) lines[l.key] = l; });
    var egi = 0; (input.lines || []).forEach(function (l){ if (l && isIncome(l.section) && isNum(l.t12)) egi += l.t12; });
    var gpr = lines.GPR && isNum(lines.GPR.t12) ? lines.GPR.t12 : 0;
    // the biggest account of a line (sign 1: the largest amount; −1: the largest deduction)
    var pick = function (k, sign){
      var all = (input.accounts || []).filter(function (a){ return a && a.line === k; }), list = all.filter(function (a){ return !a.gap; });
      if (!list.length) list = all; if (!list.length) return null;
      return list.slice().sort(function (a, b){ return sign * ((num(b.amount) || 0) - (num(a.amount) || 0)); })[0];
    };
    var mg = lines.MGMT, am = num(assume.mgmtPct);
    if (mg && am != null && egi > 0 && mg.t12 > 0 && mg.t12 / egi > am + 0.00005){
      var actual = mg.t12 / egi, a = pick("MGMT", 1);
      if (a){ var others = r2(mg.t12 - (num(a.amount) || 0)), p = am - others / egi;
        if (p > 0) out.push({ id: "assume:MGMT", source: "assumption", line: "MGMT", account: refOf(a), accountId: a.id || null, how: "pctRevenue", pct: r6(p), kind: "marketNorm", column: "both",
          story: "Management fee at " + pct(am) + " of revenue, our underwriting assumption; the T12 ran " + pct(actual) + " (" + money(mg.t12) + ")." + (Math.abs(others) >= 0.01 ? " The line's other accounts stay as they are." : ""),
          why: "Your underwriting assumes a " + pct(am) + " management fee; this T12 runs " + pct(actual) + " of revenue." }); }
    }
    var vc = lines.VAC, av = num(assume.vacancyPct);
    if (vc && av != null && gpr > 0 && vc.t12 < 0 && -vc.t12 / gpr > av + 0.00005){
      var actualV = -vc.t12 / gpr, b = pick("VAC", -1);
      if (b){ var othersV = r2(vc.t12 - (num(b.amount) || 0)), pv = av + othersV / gpr;
        if (pv > 0) out.push({ id: "assume:VAC", source: "assumption", line: "VAC", account: refOf(b), accountId: b.id || null, how: "pctRevenue", pct: r6(pv), kind: "marketNorm", column: "both",
          story: "Vacancy at " + pct(av) + " of gross potential rent, our underwriting assumption; the T12 ran " + pct(actualV) + " (" + money(vc.t12) + ")." + (Math.abs(othersV) >= 0.01 ? " The line's other accounts stay as they are." : ""),
          why: "Your underwriting assumes " + pct(av) + " vacancy; this T12 runs " + pct(actualV) + " of gross potential rent." }); }
    }
    // (2026-10-21) the underwriting is the approved pro forma: the rent the rent roll proves today, and the commercial
    // leases lease by lease, come in as suggestions too — only when they RAISE the NOI (a suggestion never lowers it)
    var rr = num(assume.rrGPR), gl = lines.GPR;
    if (gl && rr != null && rr > 0 && isNum(gl.t12) && rr > gl.t12 + 0.5){
      var g = pick("GPR", 1);
      if (g){ var othersG = r2(gl.t12 - (num(g.amount) || 0)), vG = r2(rr - othersG);
        if (vG > 0) out.push({ id: "assume:GPR", source: "assumption", line: "GPR", account: refOf(g), accountId: g.id || null, how: "accountTotal", value: vG, kind: "operating", column: "both",
          story: "Gross potential rent from today's rent roll: " + money(rr) + " a year; the T12 shows " + money(gl.t12) + "." + (Math.abs(othersG) >= 0.01 ? " The line's other accounts stay as they are." : ""),
          why: "Today's rent roll comes to " + money(rr) + " a year of gross potential rent; the T12 shows " + money(gl.t12) + "." }); }
    }
    var rc = num(assume.rrCommercial), cl = lines.COM;
    if (cl && rc != null && rc > 0 && isNum(cl.t12) && rc > cl.t12 + 0.5){
      var cA = pick("COM", 1);
      if (cA){ var othersC = r2(cl.t12 - (num(cA.amount) || 0)), vC = r2(rc - othersC);
        if (vC > 0) out.push({ id: "assume:COM", source: "assumption", line: "COM", account: refOf(cA), accountId: cA.id || null, how: "accountTotal", value: vC, kind: "operating", column: "both",
          story: "Commercial rent from the rent roll's leases, lease by lease: " + money(rc) + " a year; the T12 shows " + money(cl.t12) + ".",
          why: "The commercial leases on the rent roll come to " + money(rc) + " a year; the T12 shows " + money(cl.t12) + "." }); }
    }
    return out;
  }
  // A suggestion Claude made (or the assistant proposed), matched to this T12: its line and account by name, its way
  // and its figures checked like any change. → { change, line, account } or { reason }.
  function matchSuggestion(input, s){
    input = input || {}; s = s || {};
    var lines = (input.lines || []).filter(function (l){ return l && l.key && l.section !== "reserve"; });
    var strip = function (x){ return norm(x).replace(/^less:\s*/, ""); }, w = strip(s.line);
    var line = lines.filter(function (l){ return l.key.toLowerCase() === w || strip(l.label) === w; })[0] || lines.filter(function (l){ return w && strip(l.label).indexOf(w) >= 0; })[0];
    if (!line) return { reason: "there is no line “" + (s.line || "") + "”" };
    var accts = (input.accounts || []).filter(function (a){ return a && a.line === line.key; }), an = norm(s.account);
    var a = accts.filter(function (x){ return norm(x.name) === an; })[0] || accts.filter(function (x){ return an && norm(x.name).indexOf(an) >= 0; })[0];
    if (!a) return { reason: "there is no account “" + (s.account || "") + "” under " + line.label };
    var how = String(s.how || ""); if (how === "takeOut"){ how = "accountTotal"; s = Object.assign({}, s, { value: 0 }); }
    if (!HOWS[how] || how === "takeOut") return { reason: "the way “" + how + "” is not one of accountTotal, spread, annualize, pctRevenue, perUnit" };
    var colIn = String(s.column || "both").toLowerCase(), col = /aggr/.test(colIn) ? "aggressive" : (/safe|base/.test(colIn) ? "base" : "both");
    var c = { line: line.key, how: how, accounts: [refOf(a)], kind: String(s.kind || ""), story: String(s.story || "").trim(), column: col };
    if (how === "accountTotal") c.value = num(s.value);
    if (how === "spread") c.years = num(s.years);
    if (how === "annualize") c.months = num(s.months);
    if (how === "perUnit") c.perUnit = num(s.perUnit);
    if (how === "pctRevenue"){ var p = num(s.pct); if (p != null && p > 1) p = p / 100; c.pct = p; }
    var why = problemOf(Object.assign({ id: "check" }, c), line, num(input.units));
    if (why) return { reason: why };
    return { change: c, line: line, account: a };
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
    // every changed account (round 1: a change is made to one account): line, account, T12, Safe, (Aggressive), what, kind, story
    var acc = [["Line", "Account", "T12", "Pro forma (Safe)"].concat(both ? ["Aggressive"] : []).concat(["Change", "Kind", "Story"])];
    var stepOf = function (ver, id){ return ver.steps.filter(function (s){ return s.id === id; })[0] || null; };
    var seen = {};
    (b.accounts || []).concat(both ? (a.accounts || []) : []).forEach(function (x){
      if (seen[x.id]) return; seen[x.id] = 1;
      var xb = b.acctById[x.id], xa = a.acctById[x.id];
      var ids = ((xb && xb.changes) || []).concat(both && xa ? xa.changes.filter(function (id){ return !xb || xb.changes.indexOf(id) < 0; }) : []);
      if (!ids.length) return;
      var sts = ids.map(function (id){ return stepOf(b, id) || stepOf(a, id); }).filter(Boolean);
      var r = [(b.byKey[x.line] || a.byKey[x.line] || {}).label || x.line, x.name + (x.added ? " (added)" : ""), x.amount, xb ? xb.value : x.amount];
      if (both) r.push(xa ? xa.value : x.amount);
      acc.push(r.concat([sts.map(function (s){ return s.what; }).join("; "), sts.map(function (s){ return (KIND[s.kind] || {}).label || s.kind; }).join("; "), sts.map(function (s){ return s.story; }).join(" | ")]));
    });
    return { head: head, proForma: pf, reconciliation: recon, monthly: monthly, accounts: acc };
  }

  return { KINDS: KINDS, KIND: KIND, HOWS: HOWS, DEDUCTIONS: DEDUCTIONS, MONTHS_OK: MONTHS_OK, compute: compute, computeVersion: computeVersion,
           accountsFrom: accountsFrom, problemOf: problemOf, describe: describe, isWholeLine: isWholeLine, acctKey: acctKey,
           assumptionSuggestions: assumptionSuggestions, assumptionWarnings: assumptionWarnings, matchSuggestion: matchSuggestion, lenderSheets: lenderSheets, money: money, pct: pct };
});
