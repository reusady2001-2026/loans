/* ============================================================================
   Per-property operating assumptions (P6) — the effective underwriting and
   sizing benchmarks for ONE property = the app's global defaults with that
   property's explicit overrides laid on top, field by field:
     record.assumptions == null                → every field inherits the global
     record.assumptions = {sizing:{capRate:.06}} → only capRate is overridden
   A null/undefined LEAF inside record.assumptions also inherits — so a single
   override can be cleared with a { path: null } patch whatever the store does
   with it, and a null can never clobber a global (sizeLoan would read 0). The
   app's standard numbers (OperatingCalc.DEFAULTS) sit UNDER the globals, exactly
   as OperatingCalc.derive sizes, so a blanked global box still shows the number
   actually used. No result ever aliases either input: callers may mutate what
   they get back without touching the store or the globals.
   Also renders the compact panel (one input per field, an inherited/override
   badge, #opAssumpReset), validates entries (plain decimals, per-field ranges)
   and emits MINIMAL nested patches for OperatingStore.setAssumptions — none at
   all when an entry changes nothing. Browser + node; OperatingCalc is optional
   and looked up at call time.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OperatingAssumptions = api;
  if (typeof globalThis !== "undefined") globalThis.OperatingAssumptions = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  // The panel's fields in display order (= the §2 Assumptions shape). `kind` drives
  // the unit conversion: pct fields are STORED as fractions (0.055) but SHOWN as
  // percent numbers (5.5), exactly like the app's own sizing inputs. min/max are in
  // STORED units (fractions for pct); minEx = exclusive lower bound; `range` is the
  // wording of the out-of-range warning.
  var FIELDS = [
    { path:"vacancyPct",        label:"Vacancy",         kind:"pct",   suffix:"%",      group:"Underwriting", min:0, max:1,   range:"0–100%" },
    { path:"mgmtPct",           label:"Management fee",  kind:"pct",   suffix:"%",      group:"Underwriting", min:0, max:1,   range:"0–100%" },
    { path:"reservePerUnit",    label:"Reserves / unit", kind:"money", suffix:"$",      group:"Underwriting", min:0,          range:"$0 or more" },
    { path:"sizing.capRate",    label:"Cap rate",        kind:"pct",   suffix:"%",      group:"Debt sizing",  min:0, minEx:true, max:1, range:"above 0%, up to 100%" },
    { path:"sizing.ltvMax",     label:"Max LTV",         kind:"pct",   suffix:"%",      group:"Debt sizing",  min:0, max:1,   range:"0–100%" },
    { path:"sizing.dscrMin",    label:"Min DSCR",        kind:"mult",  suffix:"×", group:"Debt sizing",  min:0, minEx:true,   range:"above 0×" },
    { path:"sizing.dyMin",      label:"Min debt yield",  kind:"pct",   suffix:"%",      group:"Debt sizing",  min:0, max:1,   range:"0–100%" },
    { path:"sizing.intRate",    label:"Interest rate",   kind:"pct",   suffix:"%",      group:"Debt sizing",  min:0, max:1,   range:"0–100%" },
    { path:"sizing.amortYears", label:"Amortization",    kind:"int",   suffix:"yrs",    group:"Debt sizing",  min:0, max:50, integer:true, range:"whole years, 0–50" }
  ];
  var FIELD_BY_PATH = {};
  FIELDS.forEach(function (f){ FIELD_BY_PATH[f.path] = f; });

  // ---- plain-object helpers -------------------------------------------------
  function isObj(v){ return v !== null && typeof v === "object" && !Array.isArray(v); }
  function clone(v){
    if (Array.isArray(v)) return v.map(clone);
    if (!isObj(v)) return v;
    var o = {}; Object.keys(v).forEach(function (k){ o[k] = clone(v[k]); });
    return o;
  }
  // A fresh copy of `base` with `over`'s non-null leaves laid on top. null/undefined
  // in `over` means "inherit" — it never replaces a global with null.
  function merge(base, over){
    var out = clone(isObj(base) ? base : {});
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k){
      var v = over[k];
      if (v == null) return;
      out[k] = isObj(v) ? merge(isObj(out[k]) ? out[k] : {}, v) : clone(v);
    });
    return out;
  }
  function getPath(obj, path){
    var cur = obj, parts = String(path == null ? "" : path).split(".");
    for (var i = 0; i < parts.length; i++){ if (!isObj(cur)) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  // { "sizing.capRate": 0.06, … } — every NON-null leaf under obj, in walk order.
  function leaves(obj, prefix, out){
    out = out || {};
    if (!isObj(obj)) return out;
    Object.keys(obj).forEach(function (k){
      var v = obj[k], p = prefix ? prefix + "." + k : k;
      if (isObj(v)) leaves(v, p, out); else if (v != null) out[p] = v;
    });
    return out;
  }

  // ---- the app's standard numbers, underneath the globals --------------------
  // OperatingCalc.derive sizes with its DEFAULTS under the global bench (a blanked
  // Setup box stores null); the panel must show the same number, so the same
  // underlay sits under resolve. Looked up at call time — script order and node
  // require both work — with the identical literals as the fallback.
  var FALLBACK = { vacancyPct:0.05, mgmtPct:0.025, reservePerUnit:200, budget:{},
                   sizing:{ capRate:0.055, ltvMax:0.75, dscrMin:1.2, dyMin:0.07, intRate:0.055, amortYears:30 } };
  function appDefaults(){
    var oc = null;
    try { oc = (root && root.OperatingCalc) || ((typeof require === "function") ? require("./operating-calc.js") : null); } catch (e) { oc = null; }
    return (oc && isObj(oc.DEFAULTS)) ? oc.DEFAULTS : FALLBACK;
  }
  function baseline(globalDefaults){ return merge(appDefaults(), globalDefaults); }
  // The value a field takes when it is NOT overridden (global, else the app default).
  function inheritedValue(path, globalDefaults){ return getPath(baseline(globalDefaults), path); }

  // ---- the contract's three pure functions ---------------------------------
  function resolve(record, globalDefaults){
    return merge(baseline(globalDefaults), record && record.assumptions);
  }
  // true iff the record explicitly sets the leaf at `path` (an object path counts
  // when any leaf below it is set) — a null leaf is "inherit", not an override.
  function isOverridden(record, path){
    var v = getPath(record && record.assumptions, path);
    if (v == null) return false;
    return isObj(v) ? Object.keys(leaves(v)).length > 0 : true;
  }
  // Every overridden leaf as { path, global, override }: the panel's fields first, in
  // their canonical order, then anything else the record carries (e.g. budget.INS).
  // `global` is the inherited value actually used (global, else the app default).
  function diff(record, globalDefaults){
    var set = leaves(record && record.assumptions), seen = {}, out = [];
    var push = function (p){
      if (seen[p] || !Object.prototype.hasOwnProperty.call(set, p)) return;
      seen[p] = true;
      var g = inheritedValue(p, globalDefaults);
      out.push({ path: p, global: (g === undefined ? null : clone(g)), override: clone(set[p]) });
    };
    FIELDS.forEach(function (f){ push(f.path); });
    Object.keys(set).forEach(push);
    return out;
  }

  // ---- display ⇄ stored conversion -----------------------------------------
  // Round via integer ÷ 1e6: k/1e6 is the correctly rounded double of the decimal
  // k×10⁻⁶ — the very literal a test or the store would write — so 5.5% → 0.055
  // with no float drift (5.5/100 alone leaves 0.055000000000000005-style noise).
  function round6(x){ return Math.round(x * 1e6) / 1e6; }
  // "5.5", "6%", "$1,200", " 30 " → number; blank or anything that is not ONE plain
  // decimal once %, $, commas and whitespace are dropped → null ("1e3", "1.2.3",
  // "5-" are refused rather than silently read as 13 / 1.2 / 5).
  function num(raw){
    if (typeof raw === "number") return isFinite(raw) ? raw : null;
    var s = String(raw == null ? "" : raw).replace(/[%$,\s]/g, "");
    if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function kindOf(path){ var f = FIELD_BY_PATH[path]; return f ? f.kind : "num"; }
  function toDisplay(path, value){
    var v = num(value);
    if (v == null) return "";
    return String(kindOf(path) === "pct" ? round6(v * 100) : v);
  }
  function fromDisplay(path, raw){
    var v = num(raw);
    if (v == null) return null;
    return kindOf(path) === "pct" ? round6(v / 100) : v;
  }
  function inRange(f, v){
    if (!f) return true;
    if (f.integer && v !== Math.round(v)) return false;
    if (f.min != null && (f.minEx ? v <= f.min : v < f.min)) return false;
    if (f.max != null && v > f.max) return false;
    return true;
  }
  // One entry, judged: { value, error } — value null for a blank (= clear the
  // override), error "not a number" | "out of range" (+ `range` wording) otherwise.
  function check(path, raw){
    var f = FIELD_BY_PATH[path];
    if (raw == null || String(raw).trim() === "") return { value:null, error:null };
    var v = fromDisplay(path, raw);
    if (v == null) return { value:null, error:"not a number" };
    if (!inRange(f, v)) return { value:null, error:"out of range", range:f.range };
    return { value:v, error:null };
  }
  function build(path, v){
    var patch = {}, cur = patch, parts = String(path).split(".");
    for (var i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = {};
    cur[parts[parts.length - 1]] = v;
    return patch;
  }
  // The minimal nested patch for one input: {sizing:{capRate:0.06}}. A blank input
  // patches the leaf to null (= clear this override, inherit again); a non-numeric
  // or out-of-range entry yields null — nothing to apply.
  function patchFor(path, raw){
    var r = check(path, raw);
    return r.error ? null : build(path, r.value);
  }
  // What one committed entry means for the panel: the patch to emit (null = nothing
  // changes), the text the box should show, the badge state to flip to (null = leave
  // it) and a warning to show. Re-entering the inherited value is not an override —
  // it clears one if present and is otherwise a no-op; so is retyping the current
  // override, or blanking a field that inherits already.
  function commit(record, globals, path, raw){
    var r = check(path, raw), show = function (v){ return toDisplay(path, v); };
    var eff = getPath(resolve(record, globals), path), inh = inheritedValue(path, globals), over = isOverridden(record, path);
    if (r.error) return { patch:null, value:show(eff), state:null, warn:{ text:r.error, title:(r.range ? "Allowed: " + r.range : "Enter a plain number, e.g. 6.25") } };
    var v = r.value;
    if (v != null && show(v) === show(inh)) v = null;
    if (v == null) return over ? { patch:build(path, null), value:show(inh), state:"inherited", warn:null }
                               : { patch:null, value:show(inh), state:null, warn:null };
    if (over && show(v) === show(eff)) return { patch:null, value:show(v), state:null, warn:null };
    return { patch:build(path, v), value:show(v), state:"override", warn:null };
  }
  // Deep-assign a patch onto a copy of `base` (nulls kept) — the panel's own echo of
  // what the store will hold, so a second entry judges against the first even when
  // the host has not re-rendered yet.
  function applyPatch(base, patch){
    var out = clone(isObj(base) ? base : {});
    Object.keys(patch).forEach(function (k){ out[k] = isObj(patch[k]) ? applyPatch(out[k], patch[k]) : patch[k]; });
    return out;
  }

  // ---- panel -----------------------------------------------------------------
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
  var INPUT_CLS = "w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30";
  var BADGE_CLS = {
    inherited: "rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500",
    override:  "rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
  };
  var WARN_CLS = "rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700";
  function overrideCount(record){ return FIELDS.filter(function (f){ return isOverridden(record, f.path); }).length; }
  function countText(n){ return n ? n + " override" + (n > 1 ? "s" : "") : "all inherited"; }
  function globalText(f, globalDefaults){ var g = toDisplay(f.path, inheritedValue(f.path, globalDefaults)); return g === "" ? "—" : g + (f.kind === "pct" ? "%" : ""); }

  // Pure: the panel's markup for one record (unit-testable without a DOM). ONE column
  // — label left, control right — so every row fits the third-of-a-card mount the
  // host gives it (a two-column grid ran the inputs under the next label there).
  function panelHtml(record, globalDefaults){
    var eff = resolve(record, globalDefaults), group = null, rows = "";
    FIELDS.forEach(function (f){
      if (f.group !== group){ group = f.group; rows += '<div class="pt-1 text-[10px] uppercase tracking-wide text-slate-400">' + esc(group) + '</div>'; }
      var state = isOverridden(record, f.path) ? "override" : "inherited";
      var title = state === "override" ? ' title="Global default: ' + esc(globalText(f, globalDefaults)) + '"' : "";
      rows += '<label class="flex items-center justify-between gap-2 text-sm text-slate-600" data-op-assump-row="' + f.path + '" data-op-assump-state="' + state + '">' +
        '<span class="flex min-w-0 flex-wrap items-center gap-1.5">' + esc(f.label) + '<span class="' + BADGE_CLS[state] + '" data-op-badge="' + f.path + '" data-op-assump-state="' + state + '"' + title + '>' + state + '</span></span>' +
        '<span class="flex shrink-0 items-center gap-1"><input class="' + INPUT_CLS + '" type="text" inputmode="decimal" autocomplete="off" data-op-assump="' + f.path + '" value="' + esc(toDisplay(f.path, getPath(eff, f.path))) + '">' +
        '<span class="w-8 text-[11px] text-slate-400">' + esc(f.suffix) + '</span></span></label>';
    });
    return '<div class="space-y-2" data-op-assump-panel>' +
      '<div class="flex items-center justify-between gap-2">' +
        '<h3 class="text-xs font-bold uppercase tracking-wider text-brand-700">Assumptions</h3>' +
        '<div class="flex items-center gap-2"><span class="text-[11px] text-slate-400" data-op-assump-count>' + countText(overrideCount(record)) + '</span>' +
        '<button type="button" id="opAssumpReset" title="Clear every override on this property and inherit the global defaults" class="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Reset to defaults</button></div>' +
      '</div>' +
      '<div class="space-y-1.5">' + rows + '</div></div>';
  }
  // A red "out of range" / "not a number" chip beside the field's badge; gone at the
  // next successful entry on that field or the next render.
  function setWarn(mountEl, path, warn){
    var old = mountEl.querySelector('[data-op-warn="' + path + '"]');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!warn) return;
    var b = mountEl.querySelector('[data-op-badge="' + path + '"]');
    if (!b || !b.parentNode) return;
    var w = document.createElement("span");
    w.setAttribute("data-op-warn", path); w.className = WARN_CLS; w.textContent = warn.text; w.title = warn.title || "";
    b.parentNode.insertBefore(w, b.nextSibling);
  }

  // Flip one field's badge in place — an optimistic echo so the panel is right even
  // before the host re-renders it from the store.
  function setBadge(mountEl, path, state, globalDefaults){
    var b = mountEl.querySelector('[data-op-badge="' + path + '"]'), row = mountEl.querySelector('[data-op-assump-row="' + path + '"]');
    if (b){ b.textContent = state; b.className = BADGE_CLS[state]; b.setAttribute("data-op-assump-state", state);
      if (state === "override") b.setAttribute("title", "Global default: " + globalText(FIELD_BY_PATH[path], globalDefaults)); else b.removeAttribute("title"); }
    if (row) row.setAttribute("data-op-assump-state", state);
    var n = 0; Array.prototype.forEach.call(mountEl.querySelectorAll("[data-op-badge]"), function (x){ if (x.getAttribute("data-op-assump-state") === "override") n++; });
    var c = mountEl.querySelector("[data-op-assump-count]"); if (c) c.textContent = countText(n);
  }

  // render(mountEl, { record, globalDefaults, onChange(patch), onReset() }). Replaces
  // the mount's content on every call (listeners live on the new nodes only, so
  // re-rendering never stacks handlers).
  function render(mountEl, opts){
    if (!mountEl) return null;
    opts = opts || {};
    var record = opts.record, globals = opts.globalDefaults;
    // The panel's echo of the record's overrides: each emitted patch is applied here
    // too, so the next entry is judged against it even before the host re-renders.
    var local = { assumptions: clone(record && record.assumptions) };
    mountEl.innerHTML = panelHtml(record, globals);
    // Commit on 'change' (blur / Enter), not per keystroke: the host re-renders this
    // panel from the store after every patch, which would steal focus mid-entry.
    Array.prototype.forEach.call(mountEl.querySelectorAll("[data-op-assump]"), function (inp){
      inp.addEventListener("change", function (){
        var path = inp.getAttribute("data-op-assump"), d = commit(local, globals, path, inp.value);
        inp.value = d.value;                                  // normalise "6%" → "6"; restore after a refused entry
        setWarn(mountEl, path, d.warn);
        if (d.state) setBadge(mountEl, path, d.state, globals);
        if (!d.patch) return;
        local.assumptions = applyPatch(local.assumptions, d.patch);
        if (typeof opts.onChange === "function") opts.onChange(d.patch);
      });
    });
    var reset = mountEl.querySelector("#opAssumpReset");
    if (reset) reset.addEventListener("click", function (){ if (typeof opts.onReset === "function") opts.onReset(); });
    return mountEl;
  }

  return {
    resolve: resolve, isOverridden: isOverridden, diff: diff, render: render,
    FIELDS: FIELDS, toDisplay: toDisplay, fromDisplay: fromDisplay, patchFor: patchFor, check: check, commit: commit,
    inheritedValue: inheritedValue, panelHtml: panelHtml
  };
});
