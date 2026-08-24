/* ============================================================================
   T12 workbook parser — turns a raw property operating-statement sheet (as a
   2-D grid of cells, e.g. SheetJS sheet_to_json({header:1})) into clean
   { name, amount, section } lines, auto-detecting the description column, the
   period columns (12-month Total plus trailing T6 / T3 / T1), and the
   INCOME / EXPENSE section breaks. Subtotal ("Total …") rows are skipped so
   their detail lines aren't double-counted. No file typing, no manual paste.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.T12Parse = api;
  if (typeof globalThis !== "undefined") globalThis.T12Parse = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function str(v){ return v == null ? "" : String(v).trim(); }
  function toNum(v){
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = str(v); if (!s) return null;
    if (!/\d/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || s.indexOf("-") >= 0;
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function descriptive(s){ return /[A-Za-z]{3,}/.test(s) && !/^[\d\-.\s]+$/.test(s); }

  // Locate the header row and the period columns. The header row is the one that
  // carries an exact "Total" (or YTD/Annual) label AND several month columns —
  // that month test keeps metadata like "Statement (12 months)" from matching.
  var MONTH_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.\-]+\d{2,4}$|^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/i;
  function findHeader(grid){
    var cols = { total:-1, t12:-1, t6:-1, t3:-1, t1:-1 }, headerRow = -1;
    for (var r = 0; r < Math.min(grid.length, 15); r++){
      var row = grid[r] || [], total = -1, months = 0, t = {};
      for (var c = 0; c < row.length; c++){
        var s = str(row[c]).toLowerCase();
        if (!s) continue;
        if (s === "total" || s === "ytd" || s === "annual" || s === "year to date" || s === "total year") { if (total < 0) total = c; }
        else if (s === "t12") t.t12 = c;
        else if (s === "t6")  t.t6 = c;
        else if (s === "t3")  t.t3 = c;
        else if (s === "t1")  t.t1 = c;
        if (MONTH_RE.test(s)) months++;
      }
      if (total >= 0 && months >= 3){
        cols.total = total;
        if (t.t12 != null) cols.t12 = t.t12; if (t.t6 != null) cols.t6 = t.t6;
        if (t.t3 != null) cols.t3 = t.t3;    if (t.t1 != null) cols.t1 = t.t1;
        headerRow = r; break;
      }
    }
    return { headerRow: headerRow, cols: cols };
  }

  // The description column: the most word-like text column left of the amounts.
  function findDescCol(grid, dataStart, limit){
    var best = 0, bestScore = -1, wide = limit > 0 ? limit : (grid[0] ? grid[0].length : 1);
    for (var c = 0; c < wide; c++){
      var sc = 0;
      for (var r = dataStart; r < grid.length; r++){
        var v = grid[r] && grid[r][c];
        if (typeof v === "string" && descriptive(v.trim())) sc++;
      }
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    return best;
  }

  function parseGrid(grid, opts){
    opts = opts || {};
    var h = findHeader(grid), cols = h.cols;
    var dataStart = (h.headerRow >= 0 ? h.headerRow : 4) + 1;
    var descCol = (opts.descCol != null) ? opts.descCol : findDescCol(grid, dataStart, cols.total);
    var basis = (opts.basis || "total").toLowerCase();
    var byBasis = { total: cols.total, t12: (cols.t12 >= 0 ? cols.t12 : cols.total), t6: cols.t6, t3: cols.t3, t1: cols.t1 };
    var amountCol = (opts.amountCol != null) ? opts.amountCol
                  : (byBasis[basis] != null && byBasis[basis] >= 0) ? byBasis[basis] : cols.total;

    var rows = [], section = "INCOME";
    for (var r = dataStart; r < grid.length; r++){
      var name = str(grid[r] && grid[r][descCol]);
      if (!name) continue;
      var up = name.toUpperCase();
      var amt = toNum(grid[r] && grid[r][amountCol]);
      if (amt == null){                                        // a label row → maybe a section break
        if (/EXPENSE/.test(up)) section = "EXPENSE";
        else if (/INCOME/.test(up)) section = "INCOME";
        continue;
      }
      if (/^(TOTAL|SUBTOTAL|NET )\b/.test(up)){                // subtotal — details are summed instead
        if (/EXPENSE/.test(up)) section = "EXPENSE";
        continue;
      }
      rows.push({ name: name, amount: amt, section: section });
    }
    return { headerRow: h.headerRow, descCol: descCol, amountCol: amountCol, cols: cols,
             basis: basis, periodsAvailable: Object.keys(cols).filter(function(k){ return cols[k] >= 0; }),
             rows: rows };
  }

  return { parseGrid: parseGrid, findHeader: findHeader };
});
