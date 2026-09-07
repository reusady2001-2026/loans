/* ============================================================================
   Action scan — "what needs to be pushed right now" (contract §8, aspect P8).
   Walks the portfolio property by property (loans grouped by the app's own
   propertyKey hook), reads each property's live operating record through
   OperatingCalc, and raises at most ONE flag per property per rule:
     dscr      combined-stack DSCR below the property's dscrMin
     dy        combined-stack debt yield below dyMin
     maturity  earliest loan maturity inside the refi runway (opts.maturityMonths)
     refi      a loan whose rate in effect TODAY (hooks.currentRate — a floater's live
               index + spread; else the note rate) sits above the market rate by more
               than opts.refiSpread; severity 3 at ≥ 1.00 pt over, 2 at ≥ 0.75 pt, else 1
     expense   a NON-controllable EXPENSE-role line whose cost moved UP by more than
               opts.shockPct since its previous value (a tax / insurance shock) —
               income lines and the stored-negative deductions are never read as shocks
     error     one per property whose hooks / record blew up: the scan never throws,
               the operator sees what broke instead of a blank panel
   Thresholds resolve the way OperatingCalc.mergeAssumptions does (engine floors ⊕
   global bench ⊕ per-property override; null = inherit), so a blanked bench field
   falls back to 1.20 / 7% exactly like the sizing card. A record whose loans are
   gone is judged on the expense rule only. Flags rank severity desc → "impact"
   desc → name; impact deliberately mixes units — maturity = principal at risk,
   everything else = annual dollars — it is a size-of-problem tiebreak inside one
   severity band, never a sum across kinds. Pure: never mutates records, loans or
   hooks and never touches storage. Dependency-free — OperatingCalc is resolved at
   call time (browser global, node require, or opts.calc) so builds land in any order.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ActionScan = api;
  if (typeof globalThis !== "undefined") globalThis.ActionScan = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var DEFAULTS = { maturityMonths: 18, refiSpread: 0.005, shockPct: 0.15 };
  var KINDS = ["dscr", "dy", "maturity", "refi", "expense", "error"];

  // Ratio comparisons carry float noise (NOI ÷ DS can land an ulp under an exact
  // 1.20), so "below the floor" means below by more than EPS — a property sitting
  // exactly AT its threshold must not fire.
  var EPS = 1e-9;
  function lt(a, b){ return a < b - EPS; }
  function gt(a, b){ return a > b + EPS; }
  function ge(a, b){ return a >= b - EPS; }

  function num(v){ if (typeof v === "string" && v.trim() !== "") v = Number(v); return (typeof v === "number" && isFinite(v)) ? v : null; }
  function fin(v){ v = num(v); return v == null ? 0 : v; }
  function cents(v){ return Math.round(fin(v) * 100) / 100; }
  function hook(h, name){ var f = h && h[name]; return typeof f === "function" ? f : function (){ return null; }; }
  function globalOf(name){ var g = (typeof globalThis !== "undefined") ? globalThis : root; return (g && g[name]) || null; }

  // Optional collaborators, looked up when needed: a browser global (loaded by
  // index.html's <script> tags) or, in node, the sibling module file. `strict`
  // lets a BROKEN module surface (a load-bearing dependency) while a missing one
  // just means "not built yet".
  function optional(name, file, strict){
    var g = globalOf(name); if (g) return g;
    if (typeof require === "function") {
      try { return require(file); }
      catch (e) { if (strict && !(e && e.code === "MODULE_NOT_FOUND")) throw e; }
    }
    return null;
  }
  function calcOf(o){
    var c = o.calc || optional("OperatingCalc", "./operating-calc.js", true);
    if (!c || typeof c.stack !== "function") throw new Error("ActionScan: OperatingCalc is not available — load operating-calc.js before scanning (or pass opts.calc)");
    return c;
  }
  // Line labels are cosmetic: taxonomy → SetupBuilder.LABEL → the code itself.
  function labelFn(o){
    if (o.label) return o.label;
    var tx = optional("OperatingTaxonomy", "./operating-taxonomy.js", false);
    if (tx && typeof tx.label === "function") return function (c){ return tx.label(c); };
    var sb = optional("SetupBuilder", "./setup-builder.js", false), L = (sb && sb.LABEL) || {};
    return function (c){ return L[c] || c; };
  }
  // Which side of NOI a line sits on: the taxonomy's role (which must agree with
  // T12Classify.roleOf) → the classifier → the §3 expense list as a last resort.
  var EXPENSE_CODES = { RET: 1, INS: 1, UTIL: 1, RM: 1, CS: 1, PAY: 1, MGMT: 1, GA: 1, MKT: 1, TRSH: 1, CAB: 1, PLL: 1 };
  function roleFn(){
    var tx = optional("OperatingTaxonomy", "./operating-taxonomy.js", false);
    if (tx && typeof tx.role === "function") return function (c){ return tx.role(c); };
    var t12 = optional("T12Classify", "./t12-classify.js", false);
    if (t12 && typeof t12.roleOf === "function") return function (c){ return t12.roleOf(c); };
    return function (c){ return Object.prototype.hasOwnProperty.call(EXPENSE_CODES, c) ? "expense" : "income"; };
  }

  function options(opts){
    opts = opts || {};
    var pick = function (k){ var v = num(opts[k]); return v == null ? DEFAULTS[k] : v; };
    return { maturityMonths: pick("maturityMonths"), refiSpread: pick("refiSpread"), shockPct: pick("shockPct"),
             calc: opts.calc || null, label: (typeof opts.label === "function") ? opts.label : null };
  }
  // The bridge exposes globalDefaults as a thunk (uwState.input.bench is live);
  // accept the object, the thunk, or fall back to hooks.globalDefaults.
  function defaultsOf(gd, hooks){
    if (typeof gd === "function") gd = gd();
    if (!gd && hooks && hooks.globalDefaults) gd = (typeof hooks.globalDefaults === "function") ? hooks.globalDefaults() : hooks.globalDefaults;
    return gd || {};
  }
  // The floors the ratios are judged against: engine defaults ⊕ global bench ⊕
  // per-property override, null = inherit — OperatingCalc.mergeAssumptions when the
  // calc is present (one merge for sizing and scan), the same merge locally when not.
  // A blanked bench field (null) therefore falls back to 1.20 / 7% like the sizing
  // card does, instead of silencing the rule.
  var FLOORS = { dscrMin: 1.20, dyMin: 0.07 };
  function thresholds(rec, gd, calc){
    var over = rec && rec.assumptions, s = {};
    if (calc && typeof calc.mergeAssumptions === "function") { var m = calc.mergeAssumptions(gd, over); s = (m && m.sizing) || {}; }
    else {
      var g = (gd && gd.sizing) || {}, o = (over && over.sizing) || {};
      Object.keys(FLOORS).forEach(function (k){ s[k] = o[k] != null ? o[k] : g[k] != null ? g[k] : FLOORS[k]; });
    }
    var d = num(s.dscrMin), y = num(s.dyMin);
    return { dscrMin: d == null ? FLOORS.dscrMin : d, dyMin: y == null ? FLOORS.dyMin : y };
  }

  // records: the store map { propKey: record } (OperatingStore.all()) or an array of records.
  function recordMap(records){
    var m = {};
    if (Array.isArray(records)) records.forEach(function (r){ if (r && r.propKey != null) m[r.propKey] = r; });
    else if (records && typeof records === "object") Object.keys(records).forEach(function (k){ if (records[k]) m[k] = records[k]; });
    return m;
  }
  // Mirrors the app's isMezz so the calc sees senior(s) first, mezz last (value = NOI ÷ capRate(senior)).
  function isMezz(l){ return !!l && (l.lienPosition === "Mezzanine" || /\(\s*mezz/i.test(String(l.propertyName || ""))); }
  function groupLoans(loans, hooks){
    if (typeof loans === "function") loans = loans();
    var keyOf = hooks && hooks.propertyKey;
    if (typeof keyOf !== "function") throw new Error("ActionScan: hooks.propertyKey is required");
    var order = [], by = {};
    (loans || []).forEach(function (l){
      if (!l) return;
      var k = keyOf(l); if (k == null || k === "") return;
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(l);
    });
    return order.map(function (k){
      return { key: k, loans: by[k].slice().sort(function (a, b){ return (isMezz(a) ? 1 : 0) - (isMezz(b) ? 1 : 0); }) };
    });
  }
  function nameOf(rec, loans, key){
    var n = rec && rec.propertyName; if (typeof n === "string" && n.trim()) return n.trim();
    for (var i = 0; i < loans.length; i++) { var p = loans[i] && loans[i].propertyName; if (typeof p === "string" && p.trim()) return p.trim(); }
    return String(key);
  }
  function loanLabel(l){
    var base = l.lenderName || l.propertyName || l._id || "loan";
    return String(base) + (l.loanNumber ? " #" + l.loanNumber : "") + (isMezz(l) ? " (mezz)" : "");
  }

  // ---- formatting (detail strings are plain text; render() escapes them) ------
  function money(v){ v = fin(v); var s = "$" + Math.round(Math.abs(v)).toLocaleString("en-US"); return v < 0 ? "-" + s : s; }
  function pct(v){ return (fin(v) * 100).toFixed(2) + "%"; }
  function pts(v){ return (fin(v) * 100).toFixed(2) + " pts"; }
  function times(v){ return fin(v).toFixed(2) + "×"; }
  function jump(v){ var s = (fin(v) * 100).toFixed(1).replace(/\.0$/, ""); return (v >= 0 ? "+" : "") + s + "%"; }

  // ---- dates: whole calendar months, day-of-month ignored — the same yardstick
  // as the app's maturity calendar (index.html mAway), so both agree on "n months out".
  function parts(v){
    if (v instanceof Date) return isNaN(v.getTime()) ? null : { y: v.getFullYear(), mo: v.getMonth(), d: v.getDate() };
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v == null ? "" : v).trim());
    return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
  }
  function isoOf(p){ var mm = p.mo + 1; return p.y + "-" + (mm < 10 ? "0" : "") + mm + "-" + (p.d < 10 ? "0" : "") + p.d; }
  function monthsBetween(a, b){ return (b.y - a.y) * 12 + (b.mo - a.mo); }
  function todayOf(hooks){
    var t = hook(hooks, "today")();
    var d = (t instanceof Date) ? t : (t != null ? new Date(t) : new Date());
    if (isNaN(d.getTime())) d = new Date();
    return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate() };
  }

  // One flag per property per kind: when several loans / lines qualify, the
  // worst (severity, then dollar impact) carries the flag and the rest are
  // named in its detail so nothing is hidden.
  function worst(cands){
    cands.sort(function (a, b){ return (b.sev - a.sev) || (b.impact - a.impact); });
    return cands.length ? { best: cands[0], also: cands.slice(1) } : null;
  }
  function mk(ctx, kind, sev, value, threshold, impact, detail, extra){
    var f = { propKey: ctx.key, name: ctx.name, kind: kind, severity: sev, value: fin(value), threshold: fin(threshold), impact: cents(impact), detail: detail };
    if (extra) Object.keys(extra).forEach(function (k){ f[k] = extra[k]; });
    return f;
  }

  // ---- rules ------------------------------------------------------------------
  // dscr / dy read the COMBINED stack (senior + mezz) — leverage is judged on the
  // whole position. The dollar impact is the NOI the property is short of its
  // floor, derived from the same ratio that fired so the two never disagree.
  function ratioFlags(ctx){
    var calc = calcOf(ctx.o), st = calc.stack(ctx.rec, ctx.loans, ctx.hooks) || {}, th = thresholds(ctx.rec, ctx.gd, calc), out = [];
    var dscr = num(st.dscr), dy = num(st.dy);
    if (dscr != null && th.dscrMin != null && lt(dscr, th.dscrMin)) {
      var shortD = (th.dscrMin - dscr) * fin(st.annualDS);
      out.push(mk(ctx, "dscr", lt(dscr, th.dscrMin - 0.10) ? 3 : 2, dscr, th.dscrMin, shortD,
        "DSCR " + times(dscr) + " vs " + times(th.dscrMin) + " minimum — NOI " + money(shortD) + " short of the floor"));
    }
    if (dy != null && th.dyMin != null && lt(dy, th.dyMin)) {
      var shortY = (th.dyMin - dy) * fin(st.balance);
      out.push(mk(ctx, "dy", lt(dy, th.dyMin - 0.01) ? 3 : 2, dy, th.dyMin, shortY,
        "Debt yield " + pct(dy) + " vs " + pct(th.dyMin) + " minimum — NOI " + money(shortY) + " short of the floor"));
    }
    return out;
  }

  function maturityFlag(ctx){
    var bal = hook(ctx.hooks, "currentBalance"), first = null, need = 0, n = 0;
    // hooks.maturity is the app's own maturity (derived from first payment + term when
    // the field is blank); the stored field is the fallback when the hook has nothing.
    var mat = (ctx.hooks && typeof ctx.hooks.maturity === "function") ? ctx.hooks.maturity : null;
    ctx.loans.forEach(function (l){
      var iso = mat ? mat(l) : null; if (iso == null && l) iso = l.maturityDate;
      var p = parts(iso); if (!p) return;
      var m = monthsBetween(ctx.today, p);
      if (m > ctx.o.maturityMonths) return;
      var b = num(bal(l));
      if (b != null && b <= 0) return;   // a KNOWN zero balance: paid off / fully amortised — nothing left to refinance (an unknown balance still counts)
      n++; need += b || 0;               // every loan inside the window needs runway, not only the earliest
      if (!first || m < first.months) first = { months: m, iso: isoOf(p), loan: l };
    });
    if (!first) return null;
    var m = first.months, past = m < 0;
    // Past-due is a bookkeeping question (was it paid off? extended?), not a refi emergency: severity 2 with its own wording.
    var sev = past ? 2 : m <= 6 ? 3 : m <= 12 ? 2 : 1;
    var when = past ? "matured " + first.iso + " — " + (-m) + " month" + (m === -1 ? "" : "s") + " ago — confirm payoff or archive"
             : m === 0 ? "matures " + first.iso + " — this month"
             : "matures " + first.iso + " — in " + m + " month" + (m === 1 ? "" : "s");
    var tail = past ? (need > 0 ? " · " + money(need) + " still on the books" : "")
                    : " · " + money(need) + " to refinance" + (n > 1 ? " across " + n + " loans" : "");
    return mk(ctx, "maturity", sev, m, ctx.o.maturityMonths, need, loanLabel(first.loan) + " " + when + tail,
      { loanId: first.loan._id != null ? first.loan._id : null, date: first.iso });
  }

  function refiFlag(ctx){
    var mr = hook(ctx.hooks, "marketRate"), bal = hook(ctx.hooks, "currentBalance"), cands = [];
    // The rate in effect TODAY is the yardstick (a floater = live index + spread — what
    // the app's own refi scan compares); the note rate only when the app offers no hook.
    var cr = (ctx.hooks && typeof ctx.hooks.currentRate === "function") ? ctx.hooks.currentRate : null;
    ctx.loans.forEach(function (l){
      var rate = num(cr ? cr(l) : (l && l.annualRate)), mkt = num(mr(l));
      if (rate == null || mkt == null || !lt(mkt, rate - ctx.o.refiSpread)) return;   // no rate in effect / no market yardstick → no call to make
      var gap = rate - mkt, b = fin(bal(l)), note = num(l && l.annualRate);
      cands.push({ loan: l, rate: rate, note: note, mkt: mkt, gap: gap, balance: b, impact: b * gap, sev: ge(gap, 0.01) ? 3 : ge(gap, 0.0075) ? 2 : 1 });
    });
    var w = worst(cands); if (!w) return null;
    var b = w.best, detail = loanLabel(b.loan) + " at " + pct(b.rate) + " today" +
      (b.note != null && Math.abs(b.note - b.rate) > EPS ? " (note " + pct(b.note) + ")" : "") +
      " vs market " + pct(b.mkt) + " — " + pts(b.gap) + " over · " + money(b.balance) + " balance";
    if (w.also.length) detail += " · also: " + w.also.map(function (c){ return loanLabel(c.loan) + " +" + pts(c.gap); }).join(", ");
    return mk(ctx, "refi", b.sev, b.rate, b.mkt, b.impact, detail, { loanId: b.loan._id != null ? b.loan._id : null });
  }

  function expenseFlag(ctx){
    var lines = (ctx.rec && ctx.rec.lines) || {}, label = ctx.label, cands = [];
    Object.keys(lines).forEach(function (code){
      var ln = lines[code];
      if (!ln || ln.controllable !== false) return;            // controllable lines are the operator's to manage — not a shock
      if (ctx.role(code) !== "expense") return;                // only a COST can shock: income lines and the stored-negative deductions read the other way round
      var prev = num(ln.prevAnnual), cur = num(ln.annual);
      if (prev == null || prev === 0 || cur == null) return;   // nothing to compare against
      var delta = cur - prev;
      if (delta <= 0) return;                                  // a cost that moved DOWN is relief, not a shock
      var p = delta / Math.abs(prev);
      if (!gt(p, ctx.o.shockPct)) return;
      cands.push({ code: code, pct: p, prev: prev, cur: cur, impact: delta, sev: gt(p, 0.30) ? 3 : 2 });
    });
    var w = worst(cands); if (!w) return null;
    var b = w.best, detail = label(b.code) + " " + jump(b.pct) + " (" + money(b.prev) + " → " + money(b.cur) + ", +" + money(b.impact) + ")";
    if (w.also.length) detail += " · also: " + w.also.map(function (c){ return label(c.code) + " " + jump(c.pct); }).join(", ");
    return mk(ctx, "expense", b.sev, b.pct, ctx.o.shockPct, b.impact, detail, { code: b.code });
  }

  // ---- scan -------------------------------------------------------------------
  function cmpStr(a, b){ a = String(a == null ? "" : a).toLowerCase(); b = String(b == null ? "" : b).toLowerCase(); return a < b ? -1 : a > b ? 1 : 0; }
  function byRank(a, b){ return (b.severity - a.severity) || (b.impact - a.impact) || cmpStr(a.name, b.name) || cmpStr(a.kind, b.kind); }

  function errorFlag(key, name, e){
    return { propKey: key, name: name, kind: "error", severity: 1, value: 0, threshold: 0, impact: 0,
             detail: "Scan failed: " + String((e && e.message) || e).slice(0, 200) };
  }

  function scan(records, loans, hooks, globalDefaults, opts){
    hooks = hooks || {};
    var o = options(opts), gd = defaultsOf(globalDefaults, hooks), recs = recordMap(records), today = todayOf(hooks), label = labelFn(o), role = roleFn();
    var flags = [], seen = {};
    var push = function (f){ if (f) flags.push(f); };
    // Per-property isolation: one throwing hook or a bad record must not abort the
    // whole scan. Each rule runs on its own; the FIRST failure of a property becomes
    // its single "error" flag and the other rules still get their say.
    var judge = function (ctx, rules){
      var err = null;
      rules.forEach(function (rule){ try { var r = rule(ctx); (Array.isArray(r) ? r : [r]).forEach(push); } catch (e) { if (!err) err = e; } });
      if (err) push(errorFlag(ctx.key, ctx.name, err));
    };
    var groups = [];
    try { groups = groupLoans(loans, hooks); }
    catch (e) { push(errorFlag(null, "Portfolio", e)); }   // no key hook → nothing can be grouped; say so instead of throwing
    groups.forEach(function (g){
      seen[g.key] = true;
      var rec = recs[g.key] || null;
      var ctx = { key: g.key, name: nameOf(rec, g.loans, g.key), rec: rec, loans: g.loans, hooks: hooks, gd: gd, o: o, today: today, label: label, role: role };
      judge(ctx, [maturityFlag, refiFlag].concat(rec ? [ratioFlags, expenseFlag] : []));   // no operating record → no NOI → nothing to measure
    });
    // A record whose loans are gone (the roll-up still lists it): no debt to judge, but
    // a tax / insurance shock on it is still real — the expense rule alone applies.
    Object.keys(recs).forEach(function (k){
      if (seen[k]) return;
      var rec = recs[k];
      judge({ key: k, name: nameOf(rec, [], k), rec: rec, loans: [], hooks: hooks, gd: gd, o: o, today: today, label: label, role: role }, [expenseFlag]);
    });
    return flags.sort(byRank);
  }

  // ---- render -----------------------------------------------------------------
  var SEV = {
    3: { wrap: "border-rose-200 bg-rose-50 hover:bg-rose-100",     chip: "bg-rose-600 text-white",  label: "Critical" },
    2: { wrap: "border-amber-200 bg-amber-50 hover:bg-amber-100",  chip: "bg-amber-500 text-white", label: "Watch" },
    1: { wrap: "border-slate-200 bg-white hover:bg-slate-50",      chip: "bg-slate-500 text-white", label: "Note" }
  };
  var KIND_LABEL = { dscr: "DSCR", dy: "Debt yield", maturity: "Maturity", refi: "Refinance", expense: "Expense shock", error: "Scan error" };
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function html(flags){
    flags = flags || [];
    if (!flags.length) return '<div data-op-empty class="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">' +
      '<span class="inline-flex h-2 w-2 rounded-full bg-brand-500 mr-2"></span><span class="font-semibold text-slate-700">All clear</span> — nothing to push right now.</div>';
    var crit = flags.filter(function (f){ return f.severity === 3; }).length;
    var head = '<div class="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">' +
      '<span data-op-count="' + flags.length + '">' + flags.length + ' item' + (flags.length === 1 ? '' : 's') + ' to push</span>' +
      (crit ? '<span class="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">' + crit + ' critical</span>' : '') + '</div>';
    var rows = flags.map(function (f){
      var s = SEV[f.severity] || SEV[1], chip = f.kind === "error" ? "bg-slate-700 text-white" : s.chip, chipLabel = f.kind === "error" ? "Error" : s.label;
      return '<button type="button" data-op-flag="' + esc(f.kind) + '"' + (f.propKey != null ? ' data-op-prop="' + esc(f.propKey) + '"' : '') + ' data-op-sev="' + esc(f.severity) + '"' +
        ' class="w-full flex items-start gap-3 rounded-xl border px-3 py-2 text-left transition ' + s.wrap + '">' +
        '<span class="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + chip + '">' + chipLabel + '</span>' +
        '<span class="min-w-0 flex-1">' +
          '<span class="flex items-baseline gap-2"><span data-op-name class="truncate text-sm font-semibold text-slate-900">' + esc(f.name) + '</span>' +
          '<span class="text-[10px] uppercase tracking-wide text-slate-500">' + esc(KIND_LABEL[f.kind] || f.kind) + '</span></span>' +
          '<span class="block text-[12px] text-slate-600">' + esc(f.detail) + '</span>' +
        '</span></button>';
    }).join("");
    return head + '<div class="space-y-1.5">' + rows + '</div>';
  }

  function render(mountEl, flags, cbs){
    if (!mountEl) return;
    mountEl.innerHTML = html(flags);
    var onOpen = cbs && cbs.onOpen;
    // One delegated handler, ASSIGNED rather than added, so re-rendering never stacks listeners.
    mountEl.onclick = function (ev){
      var t = ev && ev.target, row = (t && typeof t.closest === "function") ? t.closest("[data-op-flag]") : null;
      var key = row ? row.getAttribute("data-op-prop") : null;   // a portfolio-level error row has no property to open
      if (key != null && typeof onOpen === "function") onOpen(key);
    };
  }

  return { scan: scan, render: render, html: html, DEFAULTS: DEFAULTS, KINDS: KINDS };
});
