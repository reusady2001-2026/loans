/* ============================================================================
   File parts (2.9.9) - a workbook often holds several properties: a T12 with
   one sheet per property, or a rent roll with one section per property on a
   single sheet. Each such sheet or section is a PART. The operator says which
   part belongs to which property (one approval card), and each property keeps
   that answer in its general-data.json:

     fileParts: [{ file, sha, sheets, parts, items:[{ kind, sheetNo, sheet,
                   sectionNo, section }], linkedAt, linkedBy }]   (or { ..., none: true })

   so the app reads ONLY those parts for that property - never another
   property's numbers. A sheet is numbered by its position in the workbook
   (1 = the first tab), as the operator sees it in Excel.
   2.9.11 - any part can go to any property: several parts to one property
   (a property in phases: they are combined - a rent roll unit by unit, T12s
   line by line, month by month) and one part to several properties. A record
   made before 2.9.11 holds one part in its own fields (kind, sheetNo, …); it
   reads as a one-item list.

   Pure: the caller passes the workbook and the parsers. Unit-testable.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.FileParts = api;
  if (typeof globalThis !== "undefined") globalThis.FileParts = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function str(v) { return v == null ? "" : String(v).trim(); }
  function nonEmpty(grid) { return (grid || []).some(function (r) { return r && r.some(function (c) { return str(c) !== ""; }); }); }
  function money(v) { return (v == null || !isFinite(v)) ? "" : "$" + Math.round(v).toLocaleString("en-US"); }

  // Every part of a workbook, in workbook order. deps: { XLSX, T12Parse, RentRoll, topName(grid) }.
  // A rent-roll sheet with several properties is one part per property section; any other non-empty
  // sheet is one part (kind "t12" when it reads as a T12, else "sheet").
  function analyzeWorkbook(wb, deps) {
    var parts = [], names = (wb && wb.SheetNames) || [];
    names.forEach(function (nm, i) {
      var ws = wb.Sheets[nm]; if (!ws) return;
      var g = deps.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!nonEmpty(g)) return;
      var isR = !!(deps.RentRoll && deps.RentRoll.findHeader(g).headerRow >= 0);
      var isT = !isR && !!(deps.T12Parse && deps.T12Parse.findHeader(g).headerRow >= 0);
      if (isR) {
        var roll = null; try { roll = deps.RentRoll.parse(g); } catch (e) { roll = null; }
        var ps = (roll && roll.properties) || [];
        if (ps.length > 1) ps.forEach(function (b, j) {
          parts.push({ sheetNo: i + 1, sheet: nm, kind: "rentroll", sectionNo: j + 1, sections: ps.length,
            section: str(b.fullName) || str(b.name) || ("Section " + (j + 1)), title: str(b.name) && !/^\(property\)$/.test(b.name) ? str(b.name) : "",
            info: b.residentialUnits + " units, " + b.occupiedUnits + " occupied" });
        });
        else parts.push({ sheetNo: i + 1, sheet: nm, kind: "rentroll", sectionNo: null, sections: ps.length, section: null,
          title: (ps[0] && str(ps[0].name) && !/^\(property\)$/.test(ps[0].name)) ? str(ps[0].name) : "",
          info: ps[0] ? (ps[0].residentialUnits + " units, " + ps[0].occupiedUnits + " occupied") : "" });
      } else if (isT) {
        var info = ""; try { var d = deps.T12Parse.parseGrid(g, { basis: "total" }); if (d && d.totals && d.totals.noi != null) info = "NOI " + money(d.totals.noi); } catch (e) {}
        parts.push({ sheetNo: i + 1, sheet: nm, kind: "t12", sectionNo: null, section: null, title: (deps.topName && deps.topName(g)) || "", info: info });
      } else {
        parts.push({ sheetNo: i + 1, sheet: nm, kind: "sheet", sectionNo: null, section: null, title: "", info: "" });
      }
    });
    parts.forEach(function (p, k) { p.no = k + 1; });
    return { parts: parts, sheetsCount: names.length, multi: parts.length > 1 };
  }

  // "Sheet 3 of 6 · 12 Month Statement-15169 · The Euclid" / "Section 3 of 6 on sheet 1 “Rent Roll” · The Euclid(15169)"
  function partLabel(p, sheetsCount) {
    if (!p) return "";
    if (p.kind === "pages") return "Pages " + p.from + (p.to !== p.from ? "–" + p.to : "") + (p.title ? " · " + p.title : "");   // 2.9.11 — a PDF's part
    if (p.sectionNo) return "Section " + p.sectionNo + " of " + p.sections + " on sheet " + p.sheetNo + " “" + p.sheet + "” · " + p.section;
    return "Sheet " + p.sheetNo + " of " + (sheetsCount || "?") + " · " + p.sheet + (p.title && p.title !== p.sheet ? " · " + p.title : "");
  }
  // What a part is called in files (for matching to property names).
  function partName(p) { return p ? (p.section || p.title || p.sheet || "") : ""; }

  // The record a property keeps for a file (sha first; the file name only when the sha is unknown).
  function findRecord(records, sha, fileName) {
    var list = Array.isArray(records) ? records : [];
    if (sha) { var r = list.filter(function (x) { return x && x.sha === sha; })[0]; if (r) return r; }
    if (!sha && fileName) return list.filter(function (x) { return x && x.file === fileName; })[0] || null;
    return null;
  }
  // A record's parts: its list (2.9.11), or the one part a record made before 2.9.11 holds in its own fields.
  function recItems(rec) {
    if (!rec || rec.none) return [];
    if (Array.isArray(rec.items)) return rec.items.filter(Boolean);
    return (rec.sheetNo != null || rec.sheet) ? [{ kind: rec.kind || null, sheetNo: rec.sheetNo, sheet: rec.sheet || "", sectionNo: rec.sectionNo || null, section: rec.section || null }] : [];
  }
  function itemFits(p, it) {
    if (p.kind === "pages" || it.kind === "pages") return p.kind === it.kind && p.from === it.from && p.to === it.to;
    return p.sheetNo === it.sheetNo && (p.sectionNo || null) === (it.sectionNo || null) && (!it.sheet || p.sheet === it.sheet);
  }
  // The parts a record points at — each by its sheet number and section number, checked against the sheet's name
  // so a different file with the same name never points at the wrong tab. [] when none fits any more.
  function partsForRecord(info, rec) {
    if (!info || !rec || rec.none) return [];
    var out = [];
    recItems(rec).forEach(function (it) { var p = (info.parts || []).filter(function (x) { return itemFits(x, it); })[0]; if (p && out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  function partForRecord(info, rec) { return partsForRecord(info, rec)[0] || null; }
  function itemOf(p) {
    if (p.kind === "pages") return { kind: "pages", from: p.from, to: p.to, title: p.title || "" };
    return { kind: p.kind, sheetNo: p.sheetNo, sheet: p.sheet, sectionNo: p.sectionNo || null, section: p.section || null };
  }
  // parts: one part, a list of parts, or null ("none of its parts is this property's").
  function makeRecord(file, sha, info, parts, who, when) {
    var r = { file: file, sha: sha || "", sheets: info ? info.sheetsCount : null, parts: info ? info.parts.length : null,
      linkedAt: when || new Date().toISOString(), linkedBy: who || null };
    var list = parts == null ? [] : (Array.isArray(parts) ? parts.filter(Boolean) : [parts]);
    if (!list.length) { r.none = true; return r; }
    r.items = list.map(itemOf);
    var f = list[0]; r.kind = f.kind; r.sheetNo = f.sheetNo; r.sheet = f.sheet; r.sectionNo = f.sectionNo || null; r.section = f.section || null;   // the first part, as before 2.9.11
    return r;
  }
  // Put a record into a property's list (one per file: the sha replaces an earlier answer for the same file).
  function upsertRecord(records, rec) {
    var list = (Array.isArray(records) ? records : []).filter(function (x) { return x && !(rec.sha ? x.sha === rec.sha : x.file === rec.file); });
    list.push(rec); return list;
  }
  // A new month's export: an earlier answer for a file with the same name (or the same sheet / section name)
  // pre-fills the card. byKey = { propKey: [records] }. → { partNo: [propKeys] } — every part a property had
  // (2.9.11: a property can have several parts, and a part can go to several properties).
  function suggestFromRecords(info, byKey, fileName, sha) {
    var out = {};
    var norm = function (s) { return str(s).toLowerCase().replace(/\s+/g, " "); };
    var base = norm(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""));
    var add = function (p, k) { var l = out[p.no] || (out[p.no] = []); if (l.indexOf(k) < 0) l.push(k); };
    Object.keys(byKey || {}).forEach(function (k) {
      (byKey[k] || []).forEach(function (rec) {
        if (!rec || rec.none) return;
        if (sha && rec.sha === sha) { var exact = partsForRecord(info, rec); if (exact.length) { exact.forEach(function (p) { add(p, k); }); return; } }
        recItems(rec).forEach(function (it) {
          var p = null;
          if (it.section) p = (info.parts || []).filter(function (x) { return x.section && norm(x.section) === norm(it.section); })[0] || null;
          if (!p && it.sheet && !it.section && base && norm(String(rec.file || "").replace(/\.[a-z0-9]+$/i, "")) === base)
            p = (info.parts || []).filter(function (x) { return !x.section && norm(x.sheet) === norm(it.sheet); })[0] || null;
          if (!p && it.sheet && !it.section) p = (info.parts || []).filter(function (x) { return !x.section && x.kind === it.kind && norm(x.sheet) === norm(it.sheet) && /\d{3,}/.test(x.sheet); })[0] || null;   // a coded tab name ("…-15169") is the property's in any export
          if (p) add(p, k);
        });
      });
    });
    return out;
  }

  // "Sheets 1 and 3 (combined)" / "Sections 1–4 on sheet 1 (combined)" — several parts of one property, in words.
  function partsLabel(parts, sheetsCount) {
    var list = (parts || []).filter(Boolean);
    if (list.length <= 1) return partLabel(list[0], sheetsCount);
    if (list.every(function (p) { return p.kind === "pages"; })) return "Pages " + list.map(function (p) { return p.from + (p.to !== p.from ? "–" + p.to : ""); }).join(" + ");
    var join = function (a) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; };
    var oneSheet = list.every(function (p) { return p.sheetNo === list[0].sheetNo; });
    if (oneSheet && list.every(function (p) { return p.sectionNo; }))
      return "Sections " + join(list.map(function (p) { return String(p.sectionNo); })) + " of " + list[0].sections + " on sheet " + list[0].sheetNo + " “" + list[0].sheet + "” (combined)";
    return list.map(function (p) { return p.sectionNo ? "sheet " + p.sheetNo + " section " + p.sectionNo : "sheet " + p.sheetNo + " “" + p.sheet + "”"; })
      .map(function (t, i) { return i ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join(" + ") + " (combined)";
  }

  // ── 2.9.11 — several T12 sheets of one property, added together ────────────────────────────────────────────
  // grids: [grid] (each a T12 sheet; grid._sheet its name). The first sheet's layout is kept (its title rows, its
  // section headers and line order); every line is matched by its account label (and, for a label printed twice,
  // by which time it is printed) and its month and total cells are ADDED. A line only another sheet has is put
  // right after the line it follows there. Months are calendar months: sheets covering different months are put
  // side by side (monthsDiffer says so). → { grid, months:[ym], sheets:[names], monthsDiffer } or null.
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function numOf(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = str(v); if (!s || s === "-") return null;
    var neg = /^\(.*\)$/.test(s); s = s.replace(/[()$,\s]/g, ""); if (!/^-?\d*\.?\d+$/.test(s)) return null;
    var n = parseFloat(s); return neg ? -n : n;
  }
  function combineT12Grids(grids, deps, opts) {
    opts = opts || {};
    var T = deps && deps.T12Parse; if (!T || !Array.isArray(grids) || !grids.length) return null;
    var sheets = [], allYm = {}, perSheetYm = [], first = null, entries = [];
    for (var gi = 0; gi < grids.length; gi++) {
      var g = grids[gi]; if (!g) return null;
      var h = T.findHeader(g, { loose: true }); if (h.headerRow < 0 || h.cols.total < 0) return null;
      var mcs = T.resolveMonthCols(g[h.headerRow], h.months || []);
      if (mcs.some(function (m) { return !m.ym; })) return null;   // months that can't be dated can't be lined up
      var firstNum = mcs.length ? Math.min.apply(null, mcs.map(function (m) { return m.col; })) : h.cols.total;
      var ymSet = {}; mcs.forEach(function (m) { ymSet[m.ym] = 1; allYm[m.ym] = 1; }); perSheetYm.push(Object.keys(ymSet).sort().join(","));
      sheets.push(g._sheet || ("Sheet " + (gi + 1)));
      var rows = [], seen = {};
      for (var r = h.headerRow + 1; r < g.length; r++) {
        var row = g[r] || [], pre = [];
        for (var c = 0; c < firstNum; c++) pre.push(row[c] == null ? null : row[c]);
        var label = pre.map(str).filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ");
        var vals = {}, any = false;
        mcs.forEach(function (m) { var v = numOf(row[m.col]); if (v != null) { vals[m.ym] = v; any = true; } });
        var tot = numOf(row[h.cols.total]); if (tot != null) any = true;
        if (!label && !any) { rows.push({ blank: true }); continue; }
        var n = seen[label] = (seen[label] || 0) + 1;
        rows.push({ key: label + "#" + n, pre: pre, vals: vals, total: tot, any: any });
      }
      if (!first) { first = { g: g, h: h, firstNum: firstNum };
        rows.forEach(function (x) { entries.push(x.blank ? { blank: true } : { key: x.key, pre: x.pre, vals: Object.assign({}, x.vals), total: x.total, any: x.any }); });
        continue; }
      var anchor = -1;
      rows.forEach(function (x) {
        if (x.blank) return;
        var idx = -1; for (var i = 0; i < entries.length; i++) if (entries[i].key === x.key) { idx = i; break; }
        if (idx >= 0) {
          var e = entries[idx];
          Object.keys(x.vals).forEach(function (ym) { e.vals[ym] = Math.round(((e.vals[ym] || 0) + x.vals[ym]) * 100) / 100; });
          if (x.total != null) e.total = Math.round(((e.total || 0) + x.total) * 100) / 100;
          e.any = e.any || x.any; anchor = idx;
        } else {
          entries.splice(anchor + 1, 0, { key: x.key, pre: x.pre, vals: Object.assign({}, x.vals), total: x.total, any: x.any }); anchor = anchor + 1;
        }
      });
    }
    var months = Object.keys(allYm).sort(), P = first.firstNum, out = [];
    for (var t = 0; t < first.h.headerRow; t++) out.push((first.g[t] || []).slice(0, P + months.length + 1));
    if (opts.title && out.length) out[0] = [opts.title];
    var hdr = (first.g[first.h.headerRow] || []).slice(0, P);
    while (hdr.length < P) hdr.push(null);
    out.push(hdr.concat(months.map(function (ym) { return MON[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4); }), ["Total"]));
    entries.forEach(function (e) {
      if (e.blank) { out.push([]); return; }
      var pre = e.pre.slice(0, P); while (pre.length < P) pre.push(null);
      out.push(pre.concat(months.map(function (ym) { return e.vals[ym] != null ? e.vals[ym] : null; }), [e.any ? (e.total != null ? e.total : null) : null]));
    });
    out._sheet = sheets.join(" + "); out._r0 = null; out._combined = sheets.slice();
    return { grid: out, months: months, sheets: sheets, monthsDiffer: perSheetYm.some(function (x) { return x !== perSheetYm[0]; }) };
  }

  // ── 2.9.11 — a PDF's parts: page ranges you set (several agreements in one file, or one agreement for several
  // properties). info for the card / the records: { parts:[{ no, kind:"pages", from, to, title }], pages, pdf:true }
  function pdfInfo(pages, ranges) {
    var parts = (ranges || []).map(function (r, i) {
      var a = Math.max(1, Math.round(+r.from || 1)), b = Math.max(a, Math.round(+r.to || a));
      if (pages) { a = Math.min(a, pages); b = Math.min(b, pages); }
      return { no: i + 1, kind: "pages", from: a, to: b, title: str(r.title), sheet: "", sheetNo: null, sectionNo: null, section: null };
    });
    return { parts: parts, pages: pages || null, sheetsCount: null, multi: parts.length > 1, pdf: true };
  }
  // The pages of a file's text ("[page N …]" marks each page) that fall in the ranges — only those are read.
  function pagesOfText(text, items) {
    var t = String(text || ""), re = /^\[page (\d+)[^\]\n]*\]/gm, m, marks = [];
    while ((m = re.exec(t))) marks.push({ at: m.index, page: +m[1] });
    if (!marks.length) return t;
    var want = (items || []).filter(function (it) { return it && it.kind === "pages"; });
    var inRange = function (n) { return want.some(function (it) { return n >= it.from && n <= it.to; }); };
    var out = [];
    marks.forEach(function (mk, i) { if (inRange(mk.page)) out.push(t.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : t.length).replace(/\s+$/, "")); });
    return out.join("\n");
  }
  function pageCount(text) { var re = /^\[page (\d+)/gm, m, n = 0; while ((m = re.exec(String(text || "")))) if (+m[1] > n) n = +m[1]; return n; }

  return { analyzeWorkbook: analyzeWorkbook, partLabel: partLabel, pdfInfo: pdfInfo, pagesOfText: pagesOfText, pageCount: pageCount, partsLabel: partsLabel, partName: partName, findRecord: findRecord,
    recItems: recItems, partsForRecord: partsForRecord, partForRecord: partForRecord, makeRecord: makeRecord, upsertRecord: upsertRecord,
    suggestFromRecords: suggestFromRecords, combineT12Grids: combineT12Grids };
});
