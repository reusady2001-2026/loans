/* ============================================================================
   Operating sheet — a property's editable income / expense lines (P4).
   Pure model + DOM render, no global state:
     buildRows(record, derived, { basis })  → rows in the fixed taxonomy order
                                              with ERI / EGI / OPEX / NOI subtotals
     toHtml(rows, { basis, record })        → the table markup (a pure string)
     render(mountEl, props)                 → draws it and wires the callbacks
   The sheet does NO financial math: EGI, opex, NOI — and ERI when the caller hands
   over a derive() result (derived.result.inPlace.eri) — are read from `derived`
   (OperatingCalc.derive); without one, ERI falls back to the plain sum of the
   rental block, the same straight sum Underwriting.computeNOI uses in-place.
   Every §3 code is a row (SPEC §6: one row per line item); once a property has
   lines, its unused rows fold behind a per-section "show N more lines" toggle.
   Stored values are ANNUAL dollars. The monthly basis is display-only: ÷12 on the
   way out, ×12 on the way in — done in whole cents (integer arithmetic), so an
   edit reaches onEdit as the exact annual amount the user meant.
   Rental deductions (VAC, CONC, BD, MOD, EMPL) are typed and shown as amounts
   under their "Less: …" caption and always STORED negative (§2 statement sign),
   so a hand entry can never turn vacancy into income.
   Ruling (critic, kept): the controllable toggle is drawn on expense rows only —
   income lines carry no flag to flip, so the expense-shock scan never fires on them.
   Dependency-free on purpose (the taxonomy is mirrored from contract §3; a loaded
   OperatingTaxonomy is consulted for isDeduction): the sheet must load and test on
   its own, in the browser and in node.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OperatingSheet = api;
  if (typeof globalThis !== "undefined") globalThis.OperatingSheet = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  // ---- Taxonomy (contract §3) — the row order every property shares --------
  var RENTAL  = ["GPR", "EMPL", "MOD", "VAC", "CONC", "BD"];
  var OTHER   = ["RUBS", "TRSH RUB", "TRSH COL", "PARK", "PET", "MTM", "LATE", "APP", "ADM", "AMEN", "COM", "CAM", "ANT", "OTH"];
  var EXPENSE = ["RET", "INS", "UTIL", "RM", "CS", "PAY", "MGMT", "GA", "MKT", "TRSH", "CAB", "PLL"];
  var ORDER   = RENTAL.concat(OTHER, EXPENSE);
  var SECTION = {};
  RENTAL.forEach(function (c) { SECTION[c] = "rental"; });
  OTHER.forEach(function (c) { SECTION[c] = "other"; });
  EXPENSE.forEach(function (c) { SECTION[c] = "expense"; });
  // Same strings as SetupBuilder.LABEL (the taxonomy module reuses that map too);
  // test/operating-sheet.test.js asserts the two never drift apart.
  var LABEL = {
    GPR:"Gross Potential Rent", EMPL:"Less: Employee Discounts", MOD:"Less: Model Units",
    VAC:"Less: Vacancy Loss", CONC:"Less: Concessions", BD:"Less: Bad Debt",
    RUBS:"Utility Reimbursements (RUBS)", "TRSH RUB":"Trash Reimbursements", "TRSH COL":"Trash Reimbursements",
    PARK:"Parking Income", PET:"Pet Fees", MTM:"Month-to-Month Fees", LATE:"Late Fees",
    APP:"Application Fees", ADM:"Administrative Income", AMEN:"Amenity Fees",
    COM:"Commercial Rent", CAM:"CAM Income", ANT:"Antenna Income", OTH:"Other Income",
    RET:"Real Estate Taxes", INS:"Insurance", UTIL:"Utilities", PAY:"Payroll",
    GA:"General & Admin", MKT:"Marketing", RM:"Repairs & Maintenance", CS:"Contract Services",
    TRSH:"Trash Removal", CAB:"Cable", PLL:"Parking Lot Lease", MGMT:"Management Fee"
  };
  // The skeleton rows: never folded behind "show more", even with no line yet.
  var ALWAYS = { GPR:1, VAC:1, RET:1, INS:1, MGMT:1 };
  var NON_CONTROLLABLE = { RET:1, INS:1 };              // taxes & insurance default to non-controllable
  var DEDUCTION = { EMPL:1, MOD:1, VAC:1, CONC:1, BD:1 }; // rental deductions: typed as amounts, stored negative
  var SUBTOTAL = { ERI:"Effective Rental Income", EGI:"Effective Gross Income",
                   OPEX:"Total Operating Expenses", NOI:"Net Operating Income" };
  var SECTIONS = ["rental", "other", "expense"];
  // Own-property lookups only — codes and sources are free strings, and a plain
  // object would answer "constructor" / "toString" from its prototype.
  var has = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  // The taxonomy module is the authority when it is loaded (window in the app,
  // globalThis in node); the local table is the dependency-free fallback.
  function taxonomy() {
    var g = (typeof globalThis !== "undefined") ? globalThis.OperatingTaxonomy : null;
    return g || (root && root.OperatingTaxonomy) || null;
  }
  function isDeduction(code) {
    var T = taxonomy();
    if (T && typeof T.isDeduction === "function") return !!T.isDeduction(code);
    return has(DEDUCTION, code);
  }

  // ---- Small helpers ---------------------------------------------------------
  // Finite number or null. Numeric strings are tolerated (a hand-repaired store
  // file, a spreadsheet cell) exactly as underwriting.js tolerates them.
  function num(v) {
    if (typeof v === "string") v = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return (typeof v === "number" && isFinite(v)) ? v : null;
  }
  function normBasis(b) {
    if (b == null) return "annual";
    if (b === "annual" || b === "monthly") return b;
    throw new Error('OperatingSheet: basis must be "annual" or "monthly" (got ' + JSON.stringify(b) + ")");
  }
  function toBasis(annual, basis) { return annual == null ? null : (basis === "monthly" ? annual / 12 : annual); }
  function pick(derived, key) { return derived ? num(derived[key]) : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function formatMoney(v) {
    v = num(v);
    return v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Local calendar date in ISO layout: unambiguous for a US/IL user base and sorts.
  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // Typed amount → exact ANNUAL dollars (or null when it isn't a number).
  // Accepts "1,000.50", "$1,234", "(500)" and "-60,000". The digits are read as
  // an integer in units of 10^-k dollars (k = typed decimals), scaled ×12 for a
  // monthly entry, then rounded half-up to whole cents — all integer arithmetic,
  // so 1,000.50/month becomes exactly 12006 and never 12005.999999.
  // With a deduction `code` (VAC, CONC, BD, MOD, EMPL) the entry is a magnitude
  // under its "Less: …" caption and the result is forced negative — "60000" and
  // "-60000" both mean −60,000 — so a hand entry can never add vacancy to income.
  function toAnnual(text, basis, code) {
    var mult = normBasis(basis) === "monthly" ? 12 : 1;
    var s = String(text == null ? "" : text).trim(), neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }   // accounting-style negative
    s = s.replace(/[$,\s]/g, "");
    if (s.charAt(0) === "-" || s.charAt(0) === "+") { if (s.charAt(0) === "-") neg = !neg; s = s.slice(1); }
    var m = /^(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (!m[1] && !m[2])) return null;
    var frac = (m[2] || "").slice(0, 9);                    // 9 decimals is already far past a cent
    var digits = ((m[1] || "") + frac).replace(/^0+(?=\d)/, "");
    if (digits.length > 15) return null;                     // beyond exact integer range — not a real amount
    var k = frac.length, v = Number(digits) * mult, cents;
    if (k <= 2) cents = v * Math.pow(10, 2 - k);
    else { var d = Math.pow(10, k - 2), r = v % d; cents = (v - r) / d + (r * 2 >= d ? 1 : 0); }
    if (cents === 0) return 0;                               // no negative zero
    var v = (neg ? -cents : cents) / 100;
    return (code != null && isDeduction(code)) ? -Math.abs(v) : v;
  }

  // ---- Pure model -------------------------------------------------------------
  function lineRow(code, ln, basis) {
    var present = !!ln, annual = present ? num(ln.annual) : null, known = has(SECTION, code), ded = isDeduction(code);
    var value = toBasis(annual, basis);
    return {
      code: code, label: has(LABEL, code) ? LABEL[code] : String(code),
      section: known ? SECTION[code] : "unknown",
      role: known ? (SECTION[code] === "expense" ? "expense" : "income") : null,
      value: value, annual: annual,
      // what the input reads: a deduction as the magnitude under its "Less: …" caption
      shown: value == null ? null : (ded ? Math.abs(value) : value),
      deduction: ded,
      controllable: (present && typeof ln.controllable === "boolean") ? ln.controllable : !has(NON_CONTROLLABLE, code),
      source: (present && ln.source) ? String(ln.source) : null,
      updatedAt: (present && ln.updatedAt) ? String(ln.updatedAt) : null,
      note: (present && ln.note) ? String(ln.note) : null,
      present: present, editable: true
    };
  }

  // rows for one record: EVERY §3 code in order (absent ones with no value), with
  // the four subtotals in place. `derived` = OperatingCalc.derive output (egi /
  // opex / inPlaceNOI, and result.inPlace.eri when present); pass null for none.
  function buildRows(record, derived, opts) {
    var basis = normBasis(opts && opts.basis);
    var lines = (record && record.lines && typeof record.lines === "object") ? record.lines : {};
    var line = function (c) { return (has(lines, c) && lines[c]) ? lines[c] : null; };
    var rows = [];
    var block = function (codes) { codes.forEach(function (c) { rows.push(lineRow(c, line(c), basis)); }); };
    var sub = function (key, annual) { rows.push({ key: key, label: SUBTOTAL[key], section: "subtotal", value: toBasis(annual, basis), annual: annual, editable: false }); };

    block(RENTAL);
    // ERI: the engine's own in-place figure when a derive() result is passed;
    // otherwise the same straight sum of the rental block (deductions are stored
    // negative) — null, not 0, when there is nothing to sum yet.
    var eri = (derived && derived.result && derived.result.inPlace) ? num(derived.result.inPlace.eri) : null;
    if (eri == null) RENTAL.forEach(function (c) { var l = line(c), a = l ? num(l.annual) : null; if (a != null) eri = (eri == null ? 0 : eri) + a; });
    sub("ERI", eri);
    block(OTHER);
    sub("EGI", pick(derived, "egi"));
    block(EXPENSE);
    sub("OPEX", pick(derived, "opex"));
    sub("NOI", pick(derived, "inPlaceNOI"));
    // Codes the taxonomy doesn't know: nothing in the app writes them, but a
    // record is user data. Show them last and marked; derive() ignores them, so
    // they sit outside the NOI above.
    Object.keys(lines).forEach(function (c) { if (line(c) && !has(SECTION, c)) rows.push(lineRow(c, lines[c], basis)); });
    return rows;
  }

  // ---- Markup (pure) ----------------------------------------------------------
  var INPUT_CLS = "w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30";
  var SRC = { t12:    ["T12",    "border-brand-200 bg-brand-50 text-brand-700"],
              manual: ["Manual", "border-amber-200 bg-amber-50 text-amber-700"],
              budget: ["Budget", "border-sky-200 bg-sky-50 text-sky-700"] };
  var SECTION_TITLE = { rental:"Rental income", other:"Other income", expense:"Operating expenses", unknown:"Unclassified — not in the NOI above" };
  var DEDUCTION = { EMPL:1, MOD:1, VAC:1, CONC:1, BD:1 };

  function pill(text, cls) { return '<span class="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ' + cls + '" data-op-source>' + text + '</span>'; }

  function lineHtml(r, basis) {
    var src = r.source && SRC[r.source];
    var badge = src ? pill(src[0], src[1])
              : r.present ? pill(esc(r.source || "?"), "border-slate-200 bg-slate-50 text-slate-500")
              : pill("not set", "border-dashed border-slate-300 bg-white text-slate-400");
    var ctl = r.role === "expense"
      ? '<input type="checkbox" data-op-ctl' + (r.controllable ? ' checked' : '') + (r.present ? '' : ' disabled title="Enter a value first"') + ' aria-label="Controllable: ' + esc(r.label) + '">'
      : '<span class="text-[10px] text-slate-300">&mdash;</span>';
    return '<tr class="border-t border-slate-100' + (r.present ? '' : ' text-slate-400') + '" data-op-code="' + esc(r.code) + '" data-op-section="' + r.section + '" data-op-present="' + (r.present ? 1 : 0) + '">' +
      '<td class="py-1 pl-3 pr-3 text-sm ' + (r.present ? 'text-slate-700' : 'text-slate-400') + '">' + esc(r.label) +
        ' <span class="ml-1 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400">' + esc(r.code) + '</span>' +
        (r.note ? ' <span class="text-[10px] text-slate-400" title="' + esc(r.note) + '">&#9998;</span>' : '') + '</td>' +
      '<td class="py-1 px-2 text-right"><input class="' + INPUT_CLS + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-op-input' +
        ' value="' + (r.value == null ? '' : esc(formatMoney(r.value))) + '" placeholder="' + (basis === "monthly" ? "monthly" : "annual") + '"' +
        (DEDUCTION[r.code] ? ' title="A deduction: enter it as a negative amount"' : '') +
        ' aria-label="' + esc(r.label) + ' (' + basis + ')"></td>' +
      '<td class="py-1 px-2 text-center">' + ctl + '</td>' +
      '<td class="py-1 px-2">' + badge + '</td>' +
      '<td class="py-1 pl-2 pr-3 text-right text-[11px] tabular-nums text-slate-500" data-op-updated title="' + esc(r.updatedAt || '') + '">' + esc(formatDate(r.updatedAt)) + '</td></tr>';
  }
  function subHtml(r) {
    var strong = r.key === "EGI" || r.key === "NOI";
    var c = strong ? "font-bold text-slate-900" : "font-semibold text-slate-700";
    return '<tr class="border-t-2 border-slate-200 bg-slate-50/70" data-op-sub="' + r.key + '">' +
      '<td class="py-1 pl-3 pr-3 text-sm ' + c + '">' + esc(r.label) + '</td>' +
      '<td class="py-1 px-2 text-right text-sm tabular-nums ' + c + '" data-op-value>' + esc(formatMoney(r.value)) + '</td>' +
      '<td colspan="3"></td></tr>';
  }
  function sectionHtml(section) {
    return '<tr class="bg-slate-50" data-op-section-head="' + section + '"><td colspan="5" class="py-1 pl-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">' + SECTION_TITLE[section] + '</td></tr>';
  }
  function seg(key, text, basis) {
    var on = key === basis;
    return '<span data-op-basis-opt="' + key + '" class="px-2.5 py-1 ' + (on ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50') + '">' + text + '</span>';
  }

  function toHtml(rows, opts) {
    var basis = normBasis(opts && opts.basis), rec = (opts && opts.record) || null, unit = basis === "monthly" ? "Monthly" : "Annual";
    var body = "", prev = null;
    (rows || []).forEach(function (r) {
      if (!r.editable) { body += subHtml(r); return; }
      if (r.section !== prev) { body += sectionHtml(r.section); prev = r.section; }
      body += lineHtml(r, basis);
    });
    var meta = rec ? [rec.propertyName, rec.period, (rec.units != null ? rec.units + " units" : null)].filter(Boolean).map(esc).join(" &middot; ") : "";
    return '<div class="op-sheet space-y-2">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="text-[11px] text-slate-500" data-op-meta>' + (meta || "No operating record yet &mdash; type a value to start one.") + '</div>' +
        '<button type="button" id="opBasisToggle" data-basis="' + basis + '" aria-pressed="' + (basis === "monthly") + '" title="Switch the display between annual and monthly (values are stored annually)" class="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">' +
          seg("annual", "Annual", basis) + seg("monthly", "Monthly", basis) + '</button>' +
      '</div>' +
      '<div class="rounded-xl border border-slate-200 bg-white overflow-x-auto">' +
        '<table class="w-full min-w-[560px] border-collapse"><thead><tr class="text-left text-[11px] uppercase tracking-wide text-slate-500">' +
          '<th class="py-2 pl-3 pr-3">Line</th><th class="py-2 px-2 text-right" data-op-basis-label>' + unit + ' $</th>' +
          '<th class="py-2 px-2 text-center" title="Controllable expense">Ctl</th><th class="py-2 px-2">Source</th><th class="py-2 pl-2 pr-3 text-right">Updated</th>' +
        '</tr></thead><tbody>' + body + '</tbody></table>' +
      '</div>' +
      '<p class="text-[11px] text-slate-400">Values are stored annually; the monthly view shows &divide;12 and converts entries &times;12. Rental deductions (vacancy, concessions, bad debt) are entered as negative amounts.</p>' +
    '</div>';
  }

  // ---- DOM ------------------------------------------------------------------------
  // render(mountEl, { record, derived, basis, onEdit(code, annual),
  //                   onToggleControllable(code, bool), onBasisChange(basis) })
  // Idempotent: every call replaces the mount's content with a fresh tree, and the
  // listeners live on that tree (not on the mount), so re-rendering can't stack them.
  function render(mountEl, props) {
    if (!mountEl || typeof mountEl !== "object" || typeof mountEl.querySelector !== "function")
      throw new Error("OperatingSheet.render: mountEl must be a DOM element (got " + (mountEl === null ? "null" : typeof mountEl) + ")");
    props = props || {};
    var basis = normBasis(props.basis);
    var rows = buildRows(props.record, props.derived, { basis: basis });
    var byCode = {};
    rows.forEach(function (r) { if (r.editable) byCode[r.code] = r; });
    var cb = function (name) { return typeof props[name] === "function" ? props[name] : null; };
    var shown = function (row) { return row.value == null ? "" : formatMoney(row.value); };
    var rowSel = function (code) { return 'tr[data-op-code="' + String(code).replace(/["\\]/g, "\\$&") + '"]'; };

    mountEl.innerHTML = toHtml(rows, { basis: basis, record: props.record });
    var rootEl = mountEl.firstElementChild;

    rootEl.addEventListener("change", function (ev) {
      var t = ev.target, tr = t && t.closest ? t.closest("tr[data-op-code]") : null;
      var row = tr && byCode[tr.getAttribute("data-op-code")];
      if (!row) return;
      if (t.hasAttribute("data-op-input")) {
        var annual = toAnnual(t.value, basis);
        if (annual == null) { t.value = shown(row); return; }         // not a number: revert, write nothing
        t.value = formatMoney(toBasis(annual, basis));                 // normalise even if the host doesn't redraw
        if (annual === row.annual) return;                             // same number, different spelling: not an edit
        var onEdit = cb("onEdit"); if (onEdit) onEdit(row.code, annual);
      } else if (t.hasAttribute("data-op-ctl")) {
        var onCtl = cb("onToggleControllable"); if (onCtl) onCtl(row.code, !!t.checked);
      }
    });
    rootEl.addEventListener("keydown", function (ev) {
      var t = ev.target;
      if (!t || !t.hasAttribute || !t.hasAttribute("data-op-input")) return;
      if (ev.key === "Enter") { ev.preventDefault(); t.blur(); }        // commit: blur fires change
      else if (ev.key === "Escape") {                                   // abandon: restore, so blur fires no change
        var tr = t.closest("tr[data-op-code]"), row = tr && byCode[tr.getAttribute("data-op-code")];
        if (row) t.value = shown(row);
        t.blur();
      } else if (ev.key === "Tab") {
        // Only when a commit is pending: blur → change → the host usually redraws, replacing this
        // tree and dropping focus. Work out where native Tab would have gone (the row's toggle, or
        // the next line), commit, then put the caret on that element in the new tree. An unchanged
        // value takes the native path untouched, so toggles stay reachable by keyboard.
        var tr0 = t.closest("tr[data-op-code]"), row0 = tr0 && byCode[tr0.getAttribute("data-op-code")];
        if (!row0) return;
        var pending = toAnnual(t.value, basis);
        if (pending == null || pending === row0.annual) return;
        var stops = Array.prototype.slice.call(rootEl.querySelectorAll("[data-op-input], [data-op-ctl]:not([disabled])"));
        var target = stops[stops.indexOf(t) + (ev.shiftKey ? -1 : 1)];
        if (!target) return;                                              // leaving the sheet: the outside target survives the redraw
        var code = target.closest("tr[data-op-code]").getAttribute("data-op-code");
        var kind = target.hasAttribute("data-op-input") ? "[data-op-input]" : "[data-op-ctl]";
        ev.preventDefault(); t.blur();
        var next = mountEl.querySelector(rowSel(code) + " " + kind);
        if (next && !next.disabled) { next.focus(); if (next.select) next.select(); }
      }
    });
    rootEl.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("#opBasisToggle") : null;
      if (!btn) return;
      var next = basis === "monthly" ? "annual" : "monthly";
      var onBasis = cb("onBasisChange"); if (onBasis) onBasis(next);
      // A host that only records the basis (no redraw) still gets a working toggle;
      // one that redrew synchronously has already replaced this tree, so skip.
      if (mountEl.firstElementChild === rootEl) render(mountEl, Object.assign({}, props, { basis: next }));
    });

    return rows;
  }

  return {
    ORDER: ORDER.slice(), RENTAL: RENTAL.slice(), OTHER: OTHER.slice(), EXPENSE: EXPENSE.slice(),
    ALWAYS: Object.keys(ALWAYS), LABEL: LABEL, SUBTOTAL: SUBTOTAL,
    buildRows: buildRows, toHtml: toHtml, render: render,
    toAnnual: toAnnual, formatMoney: formatMoney, formatDate: formatDate
  };
});
