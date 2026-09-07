/* ============================================================================
   Portfolio roll-up — ONE row per PROPERTY, every property at a glance.
   A property may carry several loans (a senior plus a mezz behind it, e.g.
   Avalon White Plains); leverage on a property is read on the COMBINED stack,
   never one piece alone, so senior + mezz collapse into a single row whose
   DSCR / debt yield / LTV use the SUMMED debt service and balance.
   Each row carries the property's live operating numbers (in-place and
   underwritten NOI from its operating record) next to its debt (balance,
   annual debt service, earliest maturity). A property that has loans but no
   operating record yet still appears — with NOI "—" — so nothing is hidden.

   Pure: buildRows() computes, render() paints. No store access, nothing global
   mutated, loans and records are read only. The math is OperatingCalc's
   (operating-calc.js, contract §4: effectiveNOI / derive / stack); it is looked
   up at call time so the <script> order in index.html does not matter.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PortfolioRollup = api;
  if (typeof globalThis !== "undefined") globalThis.PortfolioRollup = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function (root) {
  "use strict";

  // The calc engine is resolved per call, not at load: in the browser the module
  // scripts may load in any order; in node a test can put a fake on the global
  // (checked first) or let the real file be required.
  function calc(){
    var c = root && root.OperatingCalc;
    if (!c && typeof require === "function") { try { c = require("./operating-calc.js"); } catch (e) { c = null; } }
    if (!c) throw new Error("PortfolioRollup: OperatingCalc is not loaded (operating-calc.js)");
    return c;
  }

  var DASH = "—";
  // number | null — never NaN / undefined / a string. Every figure that reaches a
  // row or the totals goes through here, so a null upstream stays null.
  function fin(v){ return (typeof v === "number" && isFinite(v)) ? v : null; }
  function hookSum(list, fn){
    if (typeof fn !== "function") return 0;
    return list.reduce(function (a, l){ var v = fin(fn(l)); return a + (v == null ? 0 : v); }, 0);
  }
  var ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

  // Loans of one property in the app's own order (senior(s) first, mezz last —
  // hooks.loansForProperty), restricted to the loans we were actually given so a
  // hook reading a different list can neither add nor drop a member. The senior
  // must come first: it names the row and prices the value (capRate(senior)).
  function ordered(group, hooks){
    if (group.length < 2 || typeof hooks.loansForProperty !== "function") return group.slice();
    var byId = {}; group.forEach(function (l){ if (l && l._id != null) byId[l._id] = l; });
    var out = [];
    (hooks.loansForProperty(group[0]) || []).forEach(function (l){
      var m = (group.indexOf(l) >= 0) ? l : (l && byId[l._id]);
      if (m && out.indexOf(m) < 0) out.push(m);
    });
    group.forEach(function (l){ if (out.indexOf(l) < 0) out.push(l); });   // anything the hook did not list keeps its place, at the end
    return out;
  }

  // Earliest maturity among the property's loans, as an ISO day (YYYY-MM-DD) or
  // null. hooks.maturity(loan) is the app's own figure (derived from first payment
  // + term when the field is blank); without it, the stored loan.maturityDate.
  // Only ISO strings count — anything else is not a date this app knows. Ties
  // keep the first (senior).
  function isoDay(v){ var m = (typeof v === "string") && v.match(ISO_DAY); return m ? m[0] : null; }
  function earliest(group, hooks){
    var best = null, bestT = Infinity, viaHook = !!hooks && typeof hooks.maturity === "function";
    group.forEach(function (l){
      var s = (viaHook ? isoDay(hooks.maturity(l)) : null) || isoDay(l && l.maturityDate);
      if (!s) return;
      var t = Date.parse(s);
      if (!isFinite(t) || t >= bestT) return;
      bestT = t; best = s;
    });
    return best;
  }

  // Lines the calc will count (its lineCodes): a non-array object whose non-null
  // entries are the lines — so noi and uwNoi are null together on an empty sheet.
  function lineCount(rec){
    var ls = rec && rec.lines;
    if (ls == null || typeof ls !== "object" || Array.isArray(ls)) return 0;
    return Object.keys(ls).filter(function (k){ return ls[k] != null; }).length;
  }
  var MEZZ_SUFFIX = /\s*\(\s*mezz[^)]*\)/i;
  function isMezzLoan(l){ return !!l && (l.lienPosition === "Mezzanine" || MEZZ_SUFFIX.test(String(l.propertyName || ""))); }
  // The property's display name off its loans: a non-mezz loan's name, else the
  // mezz's with its "(Mezz…)" suffix stripped — the same name the app's picker shows.
  function loanName(group){
    var i;
    for (i = 0; i < group.length; i++) if (group[i] && group[i].propertyName && !isMezzLoan(group[i])) return String(group[i].propertyName).trim();
    for (i = 0; i < group.length; i++) if (group[i] && group[i].propertyName) return String(group[i].propertyName).replace(MEZZ_SUFFIX, "").trim();
    return "";
  }

  // One property → one row. Whatever goes wrong for ONE property (a hostile
  // record, a hook or the engine throwing) stays in that row: it comes back with
  // "—" cells and an `error`, and the rest of the portfolio still renders.
  function rowFor(key, rec, group, hooks, gd, C, calcErr){
    var row = { propKey: key, name: null, units: null, noi: null, uwNoi: null, dscr: null, dy: null, ltv: null,
                balance: null, annualDS: null, maturity: null, loans: group.length };
    try {
      group = ordered(group, hooks);
      row.name = (rec && rec.propertyName) || loanName(group) || key;   // a row is never anonymous
      row.units = fin(rec && rec.units);
      row.maturity = earliest(group, hooks);
      var st;
      if (rec) {
        if (calcErr) throw calcErr;
        row.noi = fin(C.effectiveNOI(rec));
        // A record with no lines has no underwritten NOI either: derive() on nothing
        // would just return minus reserves, which is not an underwriting of anything.
        if (lineCount(rec) > 0) { var d = C.derive(rec, gd); row.uwNoi = fin(d && d.underwrittenNOI); }
        st = C.stack(rec, group, hooks) || {};
      } else {
        // No operating record yet: the debt side is still known (same definition as
        // stack — every loan's debt service / balance summed), the NOI side is not.
        st = { annualDS: hookSum(group, hooks.annualDebtService), balance: hookSum(group, hooks.currentBalance) };
      }
      row.dscr = fin(st.dscr); row.dy = fin(st.dy); row.ltv = fin(st.ltv);
      row.balance = fin(st.balance); row.annualDS = fin(st.annualDS);
    } catch (e) {
      row.error = String((e && e.message) || e);
      row.noi = row.uwNoi = row.dscr = row.dy = row.ltv = row.balance = row.annualDS = null;   // half-computed figures are worse than none
      if (row.name == null) { try { row.name = loanName(group) || key; } catch (e2) { row.name = key; } }
    }
    return row;
  }

  // Portfolio totals. Dollar columns (NOI, UW NOI, balance, DS) are summed over
  // ALL properties — NOI only where a property has one: "unknown" is not zero, so
  // with no NOI anywhere the total stays null. The coverage ratios are read ONLY
  // over the properties that HAVE an NOI: DSCR = ΣNOI / Σdebt service and
  // DY = ΣNOI / Σbalance of those properties (dsCovered / balanceCovered). A
  // property without an NOI must not sit in the denominator with nothing in the
  // numerator — one entered NOI would read as 0.01× coverage across the whole
  // book. noiProps / props state the scope; null, never 0 or NaN, unless both
  // sides are positive.
  function totalsOf(rows){
    var t = { properties: rows.length, props: rows.length, loans: 0, noi: null, uwNoi: null, balance: 0, annualDS: 0,
              noiProps: 0, dsCovered: 0, balanceCovered: 0, dscr: null, dy: null };
    rows.forEach(function (r){
      t.loans += r.loans || 0;
      if (r.balance != null)  t.balance  += r.balance;
      if (r.annualDS != null) t.annualDS += r.annualDS;
      if (r.uwNoi != null) t.uwNoi = (t.uwNoi == null ? 0 : t.uwNoi) + r.uwNoi;
      if (r.noi == null) return;
      t.noi = (t.noi == null ? 0 : t.noi) + r.noi;
      t.noiProps++;
      t.dsCovered += (r.annualDS == null ? 0 : r.annualDS);
      t.balanceCovered += (r.balance == null ? 0 : r.balance);
    });
    t.dscr = (t.noi > 0 && t.dsCovered > 0) ? t.noi / t.dsCovered : null;
    t.dy   = (t.noi > 0 && t.balanceCovered > 0) ? t.noi / t.balanceCovered : null;
    return t;
  }

  // By name (case-insensitive), then by key — so equal names still come out in
  // one deterministic order whatever order the loans or records arrived in.
  function byName(a, b){
    var x = String(a.name).toLowerCase(), y = String(b.name).toLowerCase();
    if (x !== y) return x < y ? -1 : 1;
    return a.propKey < b.propKey ? -1 : a.propKey > b.propKey ? 1 : 0;
  }

  // records: OperatingStore.all() ({ propKey: record }) or an array of records.
  // loans: the app's loan list (falls back to hooks.loans()). hooks: the §4
  // bridge (window.LDS_OPERATING_HOOKS). globalDefaults: uwState.input.bench
  // (falls back to hooks.globalDefaults()).
  function buildRows(records, loans, hooks, globalDefaults){
    hooks = hooks || {};
    if (typeof hooks.propertyKey !== "function") throw new Error("PortfolioRollup: hooks.propertyKey is required");
    var C = null, calcErr = null;
    try { C = calc(); } catch (e) { calcErr = e; }   // reported on each record's row, so the debt side still renders without the engine
    var gd = (globalDefaults != null) ? globalDefaults : ((typeof hooks.globalDefaults === "function" && hooks.globalDefaults()) || {});
    var list = Array.isArray(loans) ? loans : ((typeof hooks.loans === "function" && hooks.loans()) || []);
    var recs = {};
    if (Array.isArray(records)) records.forEach(function (r){ if (r && r.propKey) recs[r.propKey] = r; });
    else if (records) Object.keys(records).forEach(function (k){ if (records[k]) recs[k] = records[k]; });

    // One key per property: every loan's key, plus every record's key (a record
    // whose loans are gone still shows). First-seen order; sorted by name below.
    var groups = {}, keys = [];
    list.forEach(function (l){ if (!l) return; var k = hooks.propertyKey(l); if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(l); });
    Object.keys(recs).forEach(function (k){ if (!groups[k]) { groups[k] = []; keys.push(k); } });

    var rows = keys.map(function (k){ return rowFor(k, recs[k] || null, groups[k], hooks, gd, C, calcErr); });
    rows.sort(byName);
    return { rows: rows, totals: totalsOf(rows) };
  }

  // ---- render ----------------------------------------------------------------
  // Formatting matches the app (fmtMoney / fmtPct / "1.20×"), done here so the
  // module has no dependency on index.html's helpers.
  function money(v){
    v = fin(v); if (v == null) return DASH;
    var s = Math.abs(v).toFixed(2), i = s.indexOf(".");
    return ((v < 0 && s !== "0.00") ? "-$" : "$") + s.slice(0, i).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + s.slice(i);
  }
  function pct(v){ v = fin(v); return v == null ? DASH : (v * 100).toFixed(2) + "%"; }
  function ratio(v){ v = fin(v); return v == null ? DASH : v.toFixed(2) + "×"; }
  function int(v){ v = fin(v); return v == null ? DASH : String(Math.round(v)); }
  // Compact dollars for the scope line ($1.45M, $120.00M, $850K).
  function short(v){
    v = fin(v); if (v == null) return DASH;
    var a = Math.abs(v), s = a >= 1e9 ? (a / 1e9).toFixed(2) + "B" : a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "K" : a.toFixed(0);
    return (v < 0 ? "-$" : "$") + s;
  }
  // What the totals ratios cover, spelled out next to them.
  function scopeText(t){
    var props = t.props + (t.props === 1 ? " property" : " properties");
    if (!t.noiProps) return "NOI on 0 of " + props + " — enter operating lines to get a portfolio DSCR / debt yield";
    return "DSCR " + ratio(t.dscr) + " · DY " + pct(t.dy) + " · NOI on " + t.noiProps + " of " + props + ", " + short(t.dsCovered) + " DS, " + short(t.balanceCovered) + " balance";
  }
  function day(iso){ var m = (typeof iso === "string") && iso.match(ISO_DAY); return m ? (m[2] + "/" + m[3] + "/" + m[1]) : DASH; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }

  var COLS = ["Property", "Units", "Loans", "In-place NOI", "UW NOI", "Balance", "Annual DS", "DSCR", "Debt yield", "LTV", "Maturity"];
  function td(s, cls, title){ return '<td class="py-1 px-2 text-right text-sm tabular-nums ' + (cls || "text-slate-600") + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + s + '</td>'; }

  // render(mountEl, buildRows(...), { onOpen(propKey) }). Idempotent: every call
  // repaints the whole table; the click/keyboard handler is bound ONCE per mount
  // (delegated) and reads the latest onOpen, so re-rendering never stacks listeners.
  function render(mountEl, data, opts){
    if (!mountEl) return;
    opts = opts || {};
    var rows = (data && data.rows) || [], t = (data && data.totals) || totalsOf(rows);
    var head = COLS.map(function (c, i){ return '<th class="pb-2' + (i ? ' px-2 text-right' : '') + '">' + c + '</th>'; }).join("");
    var body = rows.map(function (r){
      // A record with no loan in the book cannot be opened (the picker lists loans'
      // properties only), so its row is inert and muted; a failed row carries a "!".
      var orphan = !(r.loans > 0);
      return '<tr data-op-prop="' + esc(r.propKey) + '"' + (orphan
          ? ' data-op-orphan="1" title="No loan in the book for this property" class="border-t border-slate-100 text-slate-400"'
          : ' tabindex="0" title="Open ' + esc(r.name) + '" class="border-t border-slate-100 cursor-pointer hover:bg-brand-50/40 focus:bg-brand-50/40 outline-none"') + '>' +
        '<td class="py-1 pr-3 text-sm font-semibold ' + (orphan ? 'text-slate-400' : 'text-slate-800') + ' whitespace-nowrap">' + esc(r.name) +
          (r.error ? ' <span data-op-error class="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700" title="' + esc(r.error) + '">!</span>' : '') + '</td>' +
        td(int(r.units)) + td(int(r.loans)) + td(money(r.noi), "text-slate-800") + td(money(r.uwNoi)) + td(money(r.balance)) + td(money(r.annualDS)) +
        td(ratio(r.dscr)) + td(pct(r.dy)) + td(pct(r.ltv)) + td(day(r.maturity)) + '</tr>';
    }).join("");
    var empty = rows.length ? "" : '<tr><td colspan="' + COLS.length + '" class="py-3 text-sm text-slate-400">No properties yet &mdash; add a loan or an operating record.</td></tr>';
    var total = '<tr data-op-total class="border-t-2 border-slate-200 bg-slate-50/70">' +
      '<td class="py-1 pr-3 text-sm font-bold text-slate-900">Total &mdash; ' + t.properties + (t.properties === 1 ? ' property' : ' properties') + '</td>' +
      td("", "text-slate-900 font-bold") + td(int(t.loans), "text-slate-900 font-bold") + td(money(t.noi), "text-slate-900 font-bold") + td(money(t.uwNoi), "text-slate-900 font-bold") +
      td(money(t.balance), "text-slate-900 font-bold") + td(money(t.annualDS), "text-slate-900 font-bold") + td(ratio(t.dscr), "text-slate-900 font-bold") + td(pct(t.dy), "text-slate-900 font-bold") +
      td("", "text-slate-900") + td("", "text-slate-900") + '</tr>';
    // Just the table: the host mount (#opRollupMount) already sits inside the
    // app's card with its own heading and horizontal scroll.
    mountEl.innerHTML = '<table class="w-full min-w-[920px] border-collapse"><thead><tr class="text-left text-[11px] uppercase tracking-wide text-slate-500">' + head + '</tr></thead>' +
      '<tbody>' + body + empty + total + '</tbody></table>';

    mountEl._opRollupOpen = opts.onOpen;
    if (!mountEl._opRollupBound) {
      var fire = function (e){
        var tr = e && e.target && e.target.closest && e.target.closest("tr[data-op-prop]");
        if (!tr) return false;
        var fn = mountEl._opRollupOpen;
        if (typeof fn === "function") fn(tr.getAttribute("data-op-prop"));
        return true;
      };
      mountEl.addEventListener("click", fire);
      mountEl.addEventListener("keydown", function (e){ if ((e.key === "Enter" || e.key === " ") && fire(e) && e.preventDefault) e.preventDefault(); });
      mountEl._opRollupBound = true;
    }
  }

  return { buildRows: buildRows, render: render, COLS: COLS, fmt: { money: money, pct: pct, ratio: ratio, int: int, day: day } };
});
