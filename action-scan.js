/* ============================================================================
   Action scan — "what needs to be pushed right now" (contract §8, aspect P8).
   Walks the portfolio property by property (loans grouped by the app's own
   propertyKey hook), reads each property's live operating record through
   OperatingCalc, and raises at most ONE flag per property per rule:
     dscr      combined-stack DSCR below the property's dscrMin
     dy        combined-stack debt yield below dyMin
     maturity  earliest loan maturity inside the refi runway (opts.maturityMonths)
     refi      a loan priced above today's market rate by more than opts.refiSpread
     expense   a NON-controllable line that jumped more than opts.shockPct since
               its previous value (a tax / insurance shock)
   Thresholds come from the property's own assumptions when set, else the global
   defaults. Flags rank severity desc → dollar impact desc → name, so the top of
   the list is what to push first. Pure: never mutates records, loans or hooks and
   never touches storage. Dependency-free — OperatingCalc is resolved at call time
   (browser global, node require, or opts.calc) so the modules can land in any order.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ActionScan = api;
  if (typeof globalThis !== "undefined") globalThis.ActionScan = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var DEFAULTS = { maturityMonths: 18, refiSpread: 0.005, shockPct: 0.15 };
  var KINDS = ["dscr", "dy", "maturity", "refi", "expense"];

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
  // OperatingAssumptions-style merge: a per-property value wins, null/absent inherits the global.
  function thresholds(rec, gd){
    var s = (rec && rec.assumptions && rec.assumptions.sizing) || {}, g = gd.sizing || {};
    return { dscrMin: num(s.dscrMin != null ? s.dscrMin : g.dscrMin), dyMin: num(s.dyMin != null ? s.dyMin : g.dyMin) };
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
    var calc = calcOf(ctx.o), st = calc.stack(ctx.rec, ctx.loans, ctx.hooks) || {}, th = thresholds(ctx.rec, ctx.gd), out = [];
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
    ctx.loans.forEach(function (l){
      var p = parts(l && l.maturityDate); if (!p) return;
      var m = monthsBetween(ctx.today, p);
      if (m > ctx.o.maturityMonths) return;
      n++; need += fin(bal(l));   // every loan inside the window needs runway, not only the earliest
      if (!first || m < first.months) first = { months: m, iso: isoOf(p), loan: l };
    });
    if (!first) return null;
    var m = first.months, sev = m <= 6 ? 3 : m <= 12 ? 2 : 1;   // past-due counts as "now"
    var when = m < 0 ? "matured " + first.iso + " — " + (-m) + " month" + (m === -1 ? "" : "s") + " ago"
             : m === 0 ? "matures " + first.iso + " — this month"
             : "matures " + first.iso + " — in " + m + " month" + (m === 1 ? "" : "s");
    return mk(ctx, "maturity", sev, m, ctx.o.maturityMonths, need,
      loanLabel(first.loan) + " " + when + " · " + money(need) + " to refinance" + (n > 1 ? " across " + n + " loans" : ""),
      { loanId: first.loan._id != null ? first.loan._id : null, date: first.iso });
  }

  function refiFlag(ctx){
    var mr = hook(ctx.hooks, "marketRate"), bal = hook(ctx.hooks, "currentBalance"), cands = [];
    ctx.loans.forEach(function (l){
      var rate = num(l && l.annualRate), mkt = num(mr(l));
      if (rate == null || mkt == null || !lt(mkt, rate - ctx.o.refiSpread)) return;   // no market yardstick → no call to make
      var gap = rate - mkt, b = fin(bal(l));
      cands.push({ loan: l, rate: rate, mkt: mkt, gap: gap, balance: b, impact: b * gap, sev: ge(gap, 0.01) ? 3 : ge(gap, 0.005) ? 2 : 1 });
    });
    var w = worst(cands); if (!w) return null;
    var b = w.best, detail = loanLabel(b.loan) + " at " + pct(b.rate) + " vs market " + pct(b.mkt) + " — " + pts(b.gap) + " over · " + money(b.balance) + " balance";
    if (w.also.length) detail += " · also: " + w.also.map(function (c){ return loanLabel(c.loan) + " +" + pts(c.gap); }).join(", ");
    return mk(ctx, "refi", b.sev, b.rate, b.mkt, b.impact, detail, { loanId: b.loan._id != null ? b.loan._id : null });
  }

  function expenseFlag(ctx){
    var lines = (ctx.rec && ctx.rec.lines) || {}, label = ctx.label, cands = [];
    Object.keys(lines).forEach(function (code){
      var ln = lines[code];
      if (!ln || ln.controllable !== false) return;            // controllable lines are the operator's to manage — not a shock
      var prev = num(ln.prevAnnual), cur = num(ln.annual);
      if (prev == null || prev === 0 || cur == null) return;   // nothing to compare against
      var p = (cur - prev) / Math.abs(prev);
      if (!gt(p, ctx.o.shockPct)) return;
      cands.push({ code: code, pct: p, prev: prev, cur: cur, impact: cur - prev, sev: gt(p, 0.30) ? 3 : 2 });
    });
    var w = worst(cands); if (!w) return null;
    var b = w.best, detail = label(b.code) + " " + jump(b.pct) + " (" + money(b.prev) + " → " + money(b.cur) + ", +" + money(b.impact) + ")";
    if (w.also.length) detail += " · also: " + w.also.map(function (c){ return label(c.code) + " " + jump(c.pct); }).join(", ");
    return mk(ctx, "expense", b.sev, b.pct, ctx.o.shockPct, b.impact, detail, { code: b.code });
  }

  // ---- scan -------------------------------------------------------------------
  function cmpStr(a, b){ a = String(a == null ? "" : a).toLowerCase(); b = String(b == null ? "" : b).toLowerCase(); return a < b ? -1 : a > b ? 1 : 0; }
  function byRank(a, b){ return (b.severity - a.severity) || (b.impact - a.impact) || cmpStr(a.name, b.name) || cmpStr(a.kind, b.kind); }

  function scan(records, loans, hooks, globalDefaults, opts){
    hooks = hooks || {};
    var o = options(opts), gd = defaultsOf(globalDefaults, hooks), recs = recordMap(records), today = todayOf(hooks), label = labelFn(o);
    var flags = [];
    groupLoans(loans, hooks).forEach(function (g){
      var rec = recs[g.key] || null;
      var ctx = { key: g.key, name: nameOf(rec, g.loans, g.key), rec: rec, loans: g.loans, hooks: hooks, gd: gd, o: o, today: today, label: label };
      var push = function (f){ if (f) flags.push(f); };
      if (rec) ratioFlags(ctx).forEach(push);   // no operating record → no NOI → nothing to measure
      push(maturityFlag(ctx));
      push(refiFlag(ctx));
      if (rec) push(expenseFlag(ctx));
    });
    return flags.sort(byRank);
  }

  // ---- render -----------------------------------------------------------------
  var SEV = {
    3: { wrap: "border-rose-200 bg-rose-50 hover:bg-rose-100",     chip: "bg-rose-600 text-white",  label: "Critical" },
    2: { wrap: "border-amber-200 bg-amber-50 hover:bg-amber-100",  chip: "bg-amber-500 text-white", label: "Watch" },
    1: { wrap: "border-slate-200 bg-white hover:bg-slate-50",      chip: "bg-slate-500 text-white", label: "Note" }
  };
  var KIND_LABEL = { dscr: "DSCR", dy: "Debt yield", maturity: "Maturity", refi: "Refinance", expense: "Expense shock" };
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
      var s = SEV[f.severity] || SEV[1];
      return '<button type="button" data-op-flag="' + esc(f.kind) + '" data-op-prop="' + esc(f.propKey) + '" data-op-sev="' + esc(f.severity) + '"' +
        ' class="w-full flex items-start gap-3 rounded-xl border px-3 py-2 text-left transition ' + s.wrap + '">' +
        '<span class="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + s.chip + '">' + s.label + '</span>' +
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
      if (row && typeof onOpen === "function") onOpen(row.getAttribute("data-op-prop"));
    };
  }

  return { scan: scan, render: render, html: html, DEFAULTS: DEFAULTS, KINDS: KINDS };
});
