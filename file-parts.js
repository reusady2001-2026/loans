/* ============================================================================
   File parts (2.9.9) - a workbook often holds several properties: a T12 with
   one sheet per property, or a rent roll with one section per property on a
   single sheet. Each such sheet or section is a PART. The operator says which
   part belongs to which property (one approval card), and each property keeps
   that answer in its general-data.json:

     fileParts: [{ file, sha, sheets, parts, kind, sheetNo, sheet, sectionNo,
                   section, linkedAt, linkedBy }]          (or { ..., none: true })

   so the app reads ONLY that part for that property - never another
   property's numbers. A sheet is numbered by its position in the workbook
   (1 = the first tab), as the operator sees it in Excel.

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
  // The part a record points at — by its sheet number and section number, checked against the sheet's name so
  // a different file with the same name never points at the wrong tab. null when it no longer fits.
  function partForRecord(info, rec) {
    if (!info || !rec || rec.none) return null;
    return (info.parts || []).filter(function (p) {
      return p.sheetNo === rec.sheetNo && (p.sectionNo || null) === (rec.sectionNo || null) && (!rec.sheet || p.sheet === rec.sheet);
    })[0] || null;
  }
  function makeRecord(file, sha, info, part, who, when) {
    var r = { file: file, sha: sha || "", sheets: info ? info.sheetsCount : null, parts: info ? info.parts.length : null,
      linkedAt: when || new Date().toISOString(), linkedBy: who || null };
    if (!part) { r.none = true; return r; }
    r.kind = part.kind; r.sheetNo = part.sheetNo; r.sheet = part.sheet; r.sectionNo = part.sectionNo || null; r.section = part.section || null;
    return r;
  }
  // Put a record into a property's list (one per file: the sha replaces an earlier answer for the same file).
  function upsertRecord(records, rec) {
    var list = (Array.isArray(records) ? records : []).filter(function (x) { return x && !(rec.sha ? x.sha === rec.sha : x.file === rec.file); });
    list.push(rec); return list;
  }
  // A new month's export: an earlier answer for a file with the same name (or the same sheet / section name)
  // pre-fills the card. byKey = { propKey: [records] }. → { partNo: propKey }
  function suggestFromRecords(info, byKey, fileName, sha) {
    var out = {}, used = {};
    var norm = function (s) { return str(s).toLowerCase().replace(/\s+/g, " "); };
    var base = norm(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""));
    Object.keys(byKey || {}).forEach(function (k) {
      (byKey[k] || []).forEach(function (rec) {
        if (!rec || rec.none) return;
        var p = null;
        if (sha && rec.sha === sha) p = partForRecord(info, rec);
        if (!p && rec.section) p = (info.parts || []).filter(function (x) { return x.section && norm(x.section) === norm(rec.section); })[0] || null;
        if (!p && rec.sheet && !rec.section && base && norm(String(rec.file || "").replace(/\.[a-z0-9]+$/i, "")) === base)
          p = (info.parts || []).filter(function (x) { return !x.section && norm(x.sheet) === norm(rec.sheet); })[0] || null;
        if (!p && rec.sheet && !rec.section) p = (info.parts || []).filter(function (x) { return !x.section && x.kind === rec.kind && norm(x.sheet) === norm(rec.sheet) && /\d{3,}/.test(x.sheet); })[0] || null;   // a coded tab name ("…-15169") is the property's in any export
        if (p && out[p.no] == null && !used[k]) { out[p.no] = k; used[k] = 1; }
      });
    });
    return out;
  }

  return { analyzeWorkbook: analyzeWorkbook, partLabel: partLabel, partName: partName, findRecord: findRecord,
    partForRecord: partForRecord, makeRecord: makeRecord, upsertRecord: upsertRecord, suggestFromRecords: suggestFromRecords };
});
