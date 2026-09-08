/* ============================================================================
   T12 workbook parser — turns a raw property operating-statement sheet (as a
   2-D grid of cells, e.g. SheetJS sheet_to_json({header:1})) into clean
   { name, amount, section } detail lines, PLUS the statement's own printed
   footing: totals.{income,expense,noi} (from the TOTAL INCOME / TOTAL EXPENSES /
   NET OPERATING INCOME rows) and categories:[{name,amount,section}] (the
   ALL-CAPS "TOTAL <category>" subtotals). Those printed figures are the
   authoritative numbers — a T12's detail-line annual column can be internally
   inconsistent, but the accountant's printed subtotals always foot to the
   printed NOI, so in-place NOI is read straight off the statement.
   Auto-detects the description column, the period columns (12-month Total plus
   trailing T12 / T6 / T3 / T1 when the statement prints them), and the INCOME /
   EXPENSE break (everything before the printed TOTAL INCOME row is income;
   everything after is expense; nothing after TOTAL EXPENSES / NET OPERATING
   INCOME is operating). Never throws: junk, empty, header-less or all-text
   input yields an empty/partial parse with the same shape.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.T12Parse = api;
  if (typeof globalThis !== "undefined") globalThis.T12Parse = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Dates/objects/booleans are never labels or amounts (String(new Date()) has
  // digits in it and used to parse as a huge number).
  function str(v){ return (v == null || typeof v === "object" || typeof v === "boolean") ? "" : String(v).trim(); }
  function toNum(v){
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var s = v.replace(/[\s$€£]/g, ""); if (!s) return null;   // "$ (1,234.56)": the sign sits before the parens
    if (/^[-–—]+$/.test(s)) return 0;                          // accounting zero: "-", "$ -"
    if (!/\d/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || s.indexOf("-") >= 0;
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function descriptive(s){ return /[A-Za-z]{3,}/.test(s) && !/^[\d\-.\s]+$/.test(s); }

  // Locate the header row and the period columns. The header row is the one that
  // carries a "Total" (12-month / YTD / annual) label AND several month columns —
  // that month test keeps metadata like "Statement (12 months)" from matching. A
  // statement that prints only trailing-period columns (T12 | T6 | T3 | T1) is
  // accepted too, with T12 standing in for Total.
  // Month names must be the 3-letter or full form: "Description" / "Marketing" in a
  // header row are not months (a bare prefix match counted them as one).
  var MONTH_RE = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?([\s.\-\/'’]*\d{2,4})?$|^\d{4}[-\/.]\d{1,2}([-\/.]\d{1,2})?$|^\d{1,2}[-\/.]\d{4}$|^\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}$/i;
  var TOTAL_RE = /^(grand\s+)?total(\s*[\(\-–]?\s*(12|twelve)[\s-]*(mo|mos|month|months)\)?)?$|^(12|twelve)[\s-]*(mo|mos|month|months)(\s+total)?$|^(ytd|annual|annual\s+total|ytd\s+total|total\s+ytd|year\s+to\s+date|total\s+year|full\s+year|fy|fiscal\s+year|current\s+year)$/;
  function periodOf(s){                                      // "T12" / "T-6" / "Trailing 3 (ann.)" / "TTM" → 12|6|3|1
    if (/^ttm(\b.*)?$/.test(s)) return 12;
    var m = /^(?:t|trailing|last)[\s-]*(12|6|3|1)(?:\b.*)?$/.exec(s);
    return m ? +m[1] : 0;
  }
  // opts.loose: also accept a bare "<label> | Total" header (no month columns) when
  // nothing better exists — used by parseGrid for two-column statements, NOT by
  // the default (strict) findHeader that picks the operating sheet out of a workbook.
  function findHeader(grid, opts){
    opts = opts || {};
    var cols = { total:-1, t12:-1, t6:-1, t3:-1, t1:-1 }, headerRow = -1, months = [];
    if (!grid || typeof grid !== "object") return { headerRow: headerRow, cols: cols, months: months };
    var loose = null;
    for (var r = 0; r < Math.min(grid.length || 0, 60); r++){
      var row = grid[r]; if (!row || typeof row !== "object") continue;
      var total = -1, t = {}, mon = [], nums = 0, cells = 0, serial = [], small = [], pS = null, pM = null;
      for (var c = 0; c < row.length; c++){
        var v = row[c];
        if (v instanceof Date) { mon.push(c); cells++; continue; }
        if (typeof v === "number"){
          cells++; nums++;
          // Month columns can arrive as Excel serial dates (~30 days apart) or as
          // bare month numbers (1..12 in sequence); any other number = a data row.
          if (v === Math.floor(v) && v >= 25569 && v <= 73050 && (pS == null || (v - pS >= 28 && v - pS <= 31))) { serial.push(c); pS = v; }
          else if (v >= 1 && v <= 12 && v === Math.floor(v) && (pM == null || v === pM + 1 || (pM === 12 && v === 1))) { small.push(c); pM = v; }
          continue;
        }
        var s = str(v).toLowerCase(); if (!s) continue;
        cells++;
        if (TOTAL_RE.test(s)) { if (total < 0 && c > 0) total = c; continue; }   // a "Total" in col 0 is the label header, not the totals column
        var p = periodOf(s); if (p) { if (t["t"+p] == null) t["t"+p] = c; continue; }
        if (MONTH_RE.test(s)) mon.push(c);
      }
      if (total < 0 && t.t12 != null) total = t.t12;        // T12 stands in for Total
      if (total < 0) continue;
      // Numeric month runs only count when "Total" is a column caption — not the row's
      // first cell (["Total", 1, 2, 3] is a data row) — and no other number is in the row.
      var runs = (total > 0) ? (serial.length >= 3 ? serial : []).concat(small.length >= 6 ? small : []) : [];
      var tCount = Object.keys(t).length;
      if (mon.length >= 3 || tCount >= 2 || (runs.length >= 3 && nums === runs.length)){
        cols.total = total;
        if (t.t12 != null) cols.t12 = t.t12; if (t.t6 != null) cols.t6 = t.t6;
        if (t.t3 != null) cols.t3 = t.t3;    if (t.t1 != null) cols.t1 = t.t1;
        headerRow = r; months = mon.concat(runs).sort(function(a,b){ return a - b; }); break;
      }
      if (opts.loose && !loose && total > 0 && nums === 0 && cells <= 6) loose = { row: r, total: total, t: t };
    }
    if (headerRow < 0 && loose){
      headerRow = loose.row; cols.total = loose.total;
      ["t12","t6","t3","t1"].forEach(function(k){ if (loose.t[k] != null) cols[k] = loose.t[k]; });
    }
    return { headerRow: headerRow, cols: cols, months: months };
  }

  // The description column: the most word-like text column left of the amounts.
  function findDescCol(grid, dataStart, limit, skip){
    var wide = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i] && grid[i].length > wide) wide = grid[i].length;
    if (limit > 0 && limit < wide) wide = limit;
    var best = 0, bestScore = -1;
    for (var c = 0; c < wide; c++){
      if (c === skip) continue;
      var sc = 0;
      for (var r = dataStart; r < grid.length; r++){
        var v = grid[r] && grid[r][c];
        if (typeof v === "string" && descriptive(v.trim())) sc++;
      }
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    return best;
  }

  // The three printed footing rows, matched by exact account name so category
  // subtotals like "TOTAL RENTAL INCOME" or "TOTAL OTHER EXPENSES" never match.
  // EFFECTIVE GROSS INCOME is the income total on underwriting-style statements.
  var RE_INCTOT = /^TOTAL\s+(OPERATING\s+)?(INCOME|REVENUES?)$|^(TOTAL\s+)?EFFECTIVE\s+GROSS\s+(INCOME|REVENUES?)$|^EGI$/;
  var RE_EXPTOT = /^TOTAL\s+(OPERATING\s+)?(EXPENSES?|EXPENDITURES?)$|^TOTAL\s+OPEX$/;
  // The operating bottom line. NOT plain "NET INCOME" — that is a BELOW-the-line
  // figure (after debt service / depreciation), a different number, and matching it
  // used to overwrite the real NOI on statements that print both. A trailing
  // "(NOI)" / "/ (LOSS)" / "before debt service" qualifier is still the NOI.
  var RE_NOI    = /^(TOTAL\s+)?(NET\s+OPERATING\s+INCOME|NOI)(\s*[\(\/\-–:].*|\s+BEFORE\b.*)?$/;
  var RE_EXPHDR = /^(OPERATING\s+)?(EXPENSES?|EXPENDITURES?)$|^OPEX$/;
  function isCaps(s){ return /[A-Z]/.test(s) && s === s.toUpperCase(); }

  function parseGrid(grid, opts){
    opts = opts || {};
    if (!grid || typeof grid !== "object") grid = [];          // junk input → empty parse, never a throw
    var h = findHeader(grid, { loose: true }), cols = h.cols;
    var dataStart = h.headerRow >= 0 ? h.headerRow + 1 : 0;
    var basis = String(opts.basis || "total").toLowerCase();
    var byBasis = { total: cols.total, t12: (cols.t12 >= 0 ? cols.t12 : cols.total), t6: cols.t6, t3: cols.t3, t1: cols.t1 };
    var amountCol = (opts.amountCol != null) ? +opts.amountCol
                  : (byBasis[basis] != null && byBasis[basis] >= 0) ? byBasis[basis] : cols.total;
    // A basis whose column the statement lacks falls back to Total — say so, rather
    // than letting the caller believe it read a trailing-3 figure.
    var basisUsed = (opts.amountCol != null) ? "column" : (cols[basis] >= 0 ? basis : "total");
    // Labels live left of the first period column; a month cell is never a name.
    var firstNum = Infinity;
    Object.keys(cols).forEach(function(k){ if (cols[k] >= 0 && cols[k] < firstNum) firstNum = cols[k]; });
    h.months.forEach(function(c){ if (c < firstNum) firstNum = c; });
    var descCol = (opts.descCol != null) ? +opts.descCol : findDescCol(grid, dataStart, isFinite(firstNum) ? firstNum : 0, amountCol);
    // Some exports put section/total captions in column A and detail names in
    // column B: when the description cell is blank, take the row's other label.
    function labelOf(row){
      var s = str(row[descCol]); if (s) return s;
      var lim = isFinite(firstNum) ? firstNum : row.length;
      for (var c = 0; c < lim && c < row.length; c++){
        if (c === descCol || c === amountCol) continue;
        var v = row[c]; if (typeof v === "string" && descriptive(v.trim())) return v.trim();
      }
      return "";
    }
    // Does the same footing print again further down the sheet, carrying an amount? (An
    // amount-less twin is a section header, not a footing, so it does not confirm a summary.)
    function twinBelow(kind, from){
      var re = kind === "income" ? RE_INCTOT : kind === "expense" ? RE_EXPTOT : RE_NOI;
      for (var i = from + 1; i < grid.length; i++){
        var rw = grid[i]; if (!rw || typeof rw !== "object") continue;
        var nm = labelOf(rw); if (!nm) continue;
        if (re.test(nm.toUpperCase().replace(/\s+/g, " ").trim()) && toNum(rw[amountCol]) != null) return true;
      }
      return false;
    }

    // The statement's own account hierarchy is authoritative: an ALL-CAPS label with
    // no amount is a section/sub-section header; mixed-case rows with an amount are
    // detail lines; "Total …"/"Net …" rows are subtotals (skipped as detail). The
    // INCOME/EXPENSE break is driven by the printed TOTAL INCOME row rather than
    // keyword-guessing per header: everything up to and including TOTAL INCOME is
    // income, everything after is expense. That is exactly how the statement foots.
    // Phases: income → expense (at TOTAL INCOME, or at an EXPENSES header when the
    // statement prints no income total) → below (after TOTAL EXPENSES: debt service,
    // reserves, depreciation… are NOT operating lines) → stop at NET OPERATING INCOME.
    var TOP = /^(INCOME|EXPENSES?|EXPENDITURES?|OPEX|OPERATING\s+(INCOME|EXPENSES?|EXPENDITURES?)|OPERATING\s+REVENUES?|REVENUES?|GROSS\s+(INCOME|REVENUE))$/;
    var rows = [], categories = [], belowLine = [], totals = { income: null, expense: null, noi: null };
    var footing = { incomeRow: -1, expenseRow: -1, noiRow: -1 };
    // A statement can print a SUMMARY block (its top-line totals, sometimes with category
    // subtotals) ABOVE the detail. Those figures are a fallback only: the DETAIL footing the
    // rows actually add up to is authoritative and overrides them, and any disagreement is
    // surfaced (summaryTotals + a warning) rather than silently absorbed into a residual plug.
    var summaryTotals = { income: null, expense: null, noi: null };
    var summaryFooting = { incomeRow: -1, expenseRow: -1, noiRow: -1 };
    var detailFooted = {}, catSeen = {}, warnings = [];
    var phase = "income", sub = "", inSummary = false, nzRows = 0;
    for (var r = dataStart; r < grid.length; r++){
      var row = grid[r]; if (!row || typeof row !== "object") continue;
      var name = labelOf(row);
      if (!name) continue;
      var up = name.toUpperCase().replace(/\s+/g, " ").trim();
      var amt = toNum(row[amountCol]);
      var foot = RE_INCTOT.test(up) ? "income" : RE_EXPTOT.test(up) ? "expense" : RE_NOI.test(up) ? "noi" : null;
      // A "Gross …" row is a subtotal only when printed ALL-CAPS (GROSS INCOME, GROSS
      // REVENUE); mixed-case "Gross Rent" / "Gross Rental Income" and any "Gross
      // Potential/Scheduled/Market Rent" are the top-line DETAIL of a rent build-up —
      // dropping them zeroed GPR, so underwritten vacancy priced off nothing.
      // A "Gross …" row is a subtotal when it names an income roll-up — GROSS INCOME /
      // REVENUE / OPERATING (INCOME) / PROFIT, in ANY case — or when printed ALL-CAPS; a
      // mixed-case "Gross Rent" / "Gross Rental Income" (and any "Gross Potential/Scheduled/
      // Market Rent") is the top-line DETAIL of a rent build-up. Dropping the detail zeroed GPR.
      var isTotal = foot != null || /^(TOTAL|SUB-?TOTAL|NET)\b/.test(up)
                 || /^GROSS\s+(INCOME|REVENUES?|OPERATING|PROFIT)\b/.test(up)
                 || (isCaps(name) && /^GROSS\b/.test(up) && !/^GROSS\s+(POTENTIAL|SCHEDULED|MARKET)\b/.test(up));
      var section = (phase === "income") ? "INCOME" : "EXPENSE";

      if (amt == null){                                        // header / label row
        if (isTotal) continue;
        if (TOP.test(up)){                                     // a top-level section starts a new hierarchy
          if (phase === "income" && RE_EXPHDR.test(up)) phase = "expense";
          sub = ""; continue;
        }
        sub = name; continue;
      }
      if (isTotal){                                            // a subtotal / footing row
        if (foot != null){
          // A footing seen before any NON-ZERO detail row belongs to a summary block above
          // the statement when its twin prints again below, when we are already inside such a
          // block (so a partial summary whose own twin is missing still doesn't end the
          // detail), or when it's a KPI NOI printed on top before any income total exists.
          var isSummary = nzRows === 0 && (twinBelow(foot, r) || inSummary || (foot === "noi" && totals.income == null));
          if (isSummary){
            inSummary = true;
            if (summaryTotals[foot] == null){ summaryTotals[foot] = amt; summaryFooting[foot + "Row"] = r; }
            continue;                                          // a summary line never changes phase or ends the detail
          }
          // the DETAIL footing — authoritative; it overrides a summary's provisional figure
          if (totals[foot] == null || !detailFooted[foot]){ totals[foot] = amt; footing[foot + "Row"] = r; detailFooted[foot] = true; }
          if (foot === "income"){ if (phase === "income"){ phase = "expense"; sub = ""; } }
          else if (foot === "expense") phase = "below";        // TOTAL EXPENSES ends the operating detail from any phase
          else if (foot === "noi") break;                      // operating bottom line — rows below (debt service, depreciation, net income) are not operating
          continue;
        }
        if (phase === "below") belowLine.push({ name: name, amount: amt, row: r });
        else if (isCaps(name)){                                // ALL-CAPS "TOTAL <category>" subtotal — dedupe a summary/detail twin by name (first wins)
          if (!catSeen[up]){ catSeen[up] = 1; categories.push({ name: name, amount: amt, section: section, row: r }); }
        }
        continue;                                              // never counted as a detail line
      }
      if (phase === "below"){ belowLine.push({ name: name, amount: amt, row: r }); continue; }
      rows.push({ name: name, amount: amt, section: section, sub: sub, row: r });
      if (amt) nzRows++;                                       // $0 stub rows above a summary block must not defeat its detection
    }
    // A total only the summary printed (e.g. no detail TOTAL EXPENSES) still stands as a fallback.
    var hasSummary = summaryTotals.income != null || summaryTotals.expense != null || summaryTotals.noi != null;
    ["income", "expense", "noi"].forEach(function (k){
      if (totals[k] == null && summaryTotals[k] != null){ totals[k] = summaryTotals[k]; footing[k + "Row"] = summaryFooting[k + "Row"]; }
    });
    // Flag a summary whose figure disagrees with the statement's own detail footing (the one
    // the rows add up to) — the authoritative total wins, but the operator must be told.
    var summaryMismatch = false;
    if (hasSummary) ["income", "expense", "noi"].forEach(function (k){
      if (detailFooted[k] && summaryTotals[k] != null && Math.abs(summaryTotals[k] - totals[k]) > 0.005) summaryMismatch = true;
    });
    if (summaryMismatch) warnings.push("summary totals differ from the statement's own footing; using the footing the detail lines add up to");
    // Derived NOI as a cross-check / fallback when a statement omits the NOI row
    // (printed figures are cents, so keep their difference in cents).
    if (totals.noi == null && totals.income != null && totals.expense != null) totals.noi = Math.round((totals.income - totals.expense) * 100) / 100;
    return { headerRow: h.headerRow, descCol: descCol, amountCol: amountCol, cols: cols, months: h.months,
             basis: basis, basisUsed: basisUsed, periodsAvailable: Object.keys(cols).filter(function(k){ return cols[k] >= 0; }),
             rows: rows, categories: categories, totals: totals, footing: footing, belowLine: belowLine,
             summaryTotals: hasSummary ? summaryTotals : null, summaryFooting: hasSummary ? summaryFooting : null,
             summaryMismatch: summaryMismatch, warnings: warnings };
  }

  return { parseGrid: parseGrid, findHeader: findHeader };
});
