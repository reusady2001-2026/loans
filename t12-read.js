/* ============================================================================
   t12-read.js — 2.9.16: the T12 reading, the operator's way. Pure, no I/O.

   The sheet is read from its FIRST row (Excel row 1, column A), so every row and column number is the one you
   see in Excel. The reader:
     1. finds the columns — the category names, the account names, the account numbers, every month, the Total;
     2. decides what EVERY row is: a title above the header, the header, a heading (category name), an account,
        a total, the income total, the expense total, the Net Operating Income, a row below the NOI;
     3. puts each category in its own box and checks it:
          • every account: its Total = the sum of its months;
          • the category's total row (after its last account) = the sum of its accounts;
          • a total of totals ("TOTAL RENT") = the categories it adds up;
          • the income total = all income accounts; the expense total = all expense accounts;
          • income − expenses = the Net Operating Income printed on its row.
   A gap under $1 counts as equal. Nothing here decides what is saved — the app compares this reading with the
   AI's and asks you when anything fails or disagrees. Your changes (what a row is, its side, its category, an
   amount with a note) are "overrides", re-checked live and turned into the figures every screen uses.
   ========================================================================== */
(function (root, factory) {
  var api = factory(
    (typeof require === "function") ? require("./t12-parse.js") : root.T12Parse,
    (typeof require === "function") ? require("./t12-classify.js") : root.T12Classify
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.T12Read = api;
})(typeof self !== "undefined" ? self : this, function (T12Parse, T12Classify) {
  "use strict";

  var TOL = 1;   // under $1 is the same figure
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function r2(x){ return Math.round(x * 100) / 100; }
  function str(v){ return (v == null || typeof v === "object" || typeof v === "boolean") ? "" : String(v).trim(); }
  function toNum(v){
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var s = v.replace(/[\s$€£]/g, ""); if (!s) return null;
    if (/^[-–—]+$/.test(s)) return 0;
    if (!/\d/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || s.indexOf("-") >= 0, n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function descriptive(s){ return /[A-Za-z]{3,}/.test(s) && !/^[\d\-.\s]+$/.test(s); }
  function colName(c){ var s = ""; c = c + 1; while (c > 0){ var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function money(n){ if (!isNum(n)) return "—"; var a = Math.abs(n).toFixed(2), i = a.indexOf("."); return (n < 0 ? "−$" : "$") + a.slice(0, i).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + a.slice(i); }
  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
  var RE_CODE = /^\d[\d.\-]{2,}$/;
  var TOP = /^(INCOME|EXPENSES?|EXPENDITURES?|OPEX|OPERATING\s+(INCOME|EXPENSES?|EXPENDITURES?)|OPERATING\s+REVENUES?|REVENUES?|GROSS\s+(INCOME|REVENUE))$/;
  var EXPENSE_CODES = { RET:1, INS:1, UTIL:1, PAY:1, GA:1, BDX:1, MKT:1, RM:1, CS:1, MGMT:1, TRSH:1, CAB:1, PLL:1 };
  function isExpenseCode(c){ return !!EXPENSE_CODES[c] || !!(T12Classify && T12Classify.roleOf && T12Classify.roleOf(c) === "expense"); }

  // What a row can be (the words the review shows).
  var ROLES = {
    title: "Above the header", header: "Header row", blank: "Empty", heading: "Category name", account: "Account",
    total: "Total", "income-total": "Income total", "expense-total": "Expense total", noi: "Net Operating Income",
    "not-operating": "Not operating", "after-noi": "Below the NOI — not read", unlabeled: "Amount with no name", summary: "Summary above the statement"
  };
  // Roles you can give a row in the review.
  var EDITABLE_ROLES = ["account", "total", "heading", "not-operating", "income-total", "expense-total", "noi"];

  // A worksheet as a grid that starts at Excel A1 (grid[r][c] = Excel row r+1, column c+1).
  function gridFromSheet(XLSX, ws){
    if (!ws || !ws["!ref"]) return [];
    var rng = XLSX.utils.decode_range(ws["!ref"]); rng.s.r = 0; rng.s.c = 0;
    var g = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: XLSX.utils.encode_range(rng), blankrows: true });
    g._r0 = 0; return g;
  }

  // ---- 1 + 2: the columns, and what every row is ------------------------------------------------------
  function read(grid, opts){
    opts = opts || {};
    grid = Array.isArray(grid) ? grid : [];
    var p = T12Parse.parseGrid(grid, { basis: "total", monthly: true });
    var out = { ok: p.headerRow >= 0, headerRow: p.headerRow, parse: p, rows: [], columns: null, error: null };
    if (p.headerRow < 0){ out.error = "No header row with a Total column and month columns was found."; return out; }
    var amountCol = p.amountCol, descCol = p.descCol, codeCol = p.codeCol;
    var monthCols = (p.monthCols || []).filter(function (m){ return m && m.ym; });
    var firstNum = Infinity; Object.keys(p.cols).forEach(function (k){ if (p.cols[k] >= 0 && p.cols[k] < firstNum) firstNum = p.cols[k]; }); (p.months || []).forEach(function (c){ if (c < firstNum) firstNum = c; });
    function labelOf(row){ var s = str(row[descCol]); if (s) return { text: s, col: descCol };
      for (var c = 0; c < firstNum && c < row.length; c++){ if (c === descCol || c === amountCol) continue; var v = row[c]; if (typeof v === "string" && descriptive(v.trim())) return { text: v.trim(), col: c }; }
      return { text: "", col: -1 }; }
    var lineAt = {}; (p.rows || []).forEach(function (r){ lineAt[r.row] = r; });
    var below = {}; (p.belowLine || []).forEach(function (b){ below[b.row] = 1; });
    var summary = {}; if (p.summaryFooting) ["incomeRow", "expenseRow", "noiRow"].forEach(function (k){ if (p.summaryFooting[k] >= 0) summary[p.summaryFooting[k]] = 1; });
    var headingCols = {};
    var noiRow = p.footing.noiRow, incRow = p.footing.incomeRow, expRow = p.footing.expenseRow;
    var side = "income";
    for (var i = 0; i < grid.length; i++){
      var row = Array.isArray(grid[i]) ? grid[i] : [], L = labelOf(row), amt = toNum(row[amountCol]);
      var any = row.some(function (v){ return v != null && str(v) !== ""; });
      var code = codeCol >= 0 ? str(row[codeCol]) : "";
      var monthly = {}, msum = 0, mn = 0;
      monthCols.forEach(function (mc){ var v = toNum(row[mc.col]); if (v != null){ monthly[mc.ym] = v; msum += v; mn++; } });
      var e = { row: i, excel: i + 1, label: L.text, labelCol: L.col, code: RE_CODE.test(code) ? code : "", amount: amt, monthly: monthly, monthsSum: mn ? r2(msum) : null,
                role: "blank", side: null, sub: "", top: false };
      if (i === incRow) side = "income";
      if (i < p.headerRow) e.role = any ? "title" : "blank";
      else if (i === p.headerRow) e.role = "header";
      else if (noiRow >= 0 && i > noiRow) e.role = any ? "after-noi" : "blank";
      else if (lineAt[i]){ e.role = "account"; e.side = lineAt[i].section === "EXPENSE" ? "expense" : "income"; e.sub = lineAt[i].sub || ""; }
      else if (i === incRow) e.role = "income-total";
      else if (i === expRow) e.role = "expense-total";
      else if (i === noiRow) e.role = "noi";
      else if (summary[i]) e.role = "summary";
      else if (below[i]) e.role = "not-operating";
      else if (!L.text) e.role = (amt != null && amt !== 0) ? "unlabeled" : "blank";
      else if (amt == null){ e.role = "heading"; e.top = TOP.test(L.text.toUpperCase().replace(/\s+/g, " ").trim()); if (!e.top) headingCols[L.col] = (headingCols[L.col] || 0) + 1; }
      else e.role = "total";
      if (e.role !== "account") e.side = (incRow >= 0 && i > incRow) || (incRow < 0 && side === "expense") ? "expense" : "income";
      if (e.role === "heading" && e.top && /EXPENS|EXPENDIT|OPEX/i.test(L.text)) side = "expense";
      out.rows.push(e);
    }
    var catCol = -1, best = 0; Object.keys(headingCols).forEach(function (c){ if (headingCols[c] > best){ best = headingCols[c]; catCol = +c; } });
    out.columns = { category: catCol, account: descCol, code: codeCol, total: amountCol, months: monthCols.map(function (m){ return { col: m.col, ym: m.ym, label: m.label }; }) };
    out.amountCol = amountCol; out.descCol = descCol; out.codeCol = codeCol;
    return out;
  }

  // ---- your changes ------------------------------------------------------------------------------------
  // override: { row (Excel row), role?, side?, cat?, amount?, note?, by?, at? }
  function applyOverrides(reading, overrides){
    var rows = clone(reading.rows), byExcel = {}; rows.forEach(function (e){ byExcel[e.excel] = e; });
    var ov = (overrides || []).filter(function (o){ return o && byExcel[o.row]; }), moved = { income: false, noi: null };
    // the three printed totals are one row each: giving a row that role takes it from any other row
    ov.forEach(function (o){
      var e = byExcel[o.row];
      if (o.role && ROLES[o.role]){
        if (o.role === "income-total" || o.role === "expense-total" || o.role === "noi")
          rows.forEach(function (x){ if (x !== e && x.role === o.role) x.role = isNum(x.amount) ? "total" : "heading"; });
        if (o.role === "income-total") moved.income = true;
        if (o.role === "noi") moved.noi = e.row;
        e.role = o.role; e.yours = true;
        if (o.role === "account" || o.role === "not-operating" || o.role === "total" || o.role === "heading") e.figYours = true;   // which rows count changes
      }
    });
    // a NOI row you set moves where the reading stops: rows after it are below the NOI; rows that were below the
    // old one and are now above it are read (a name with an amount is an account, a name alone a heading)
    var noiAt = -1; rows.forEach(function (x){ if (x.role === "noi") noiAt = x.row; });
    if (moved.noi != null) rows.forEach(function (x){
      if (x.row > noiAt && x.role !== "blank" && x.role !== "title" && x.role !== "header") x.role = "after-noi";
      else if (x.row < noiAt && x.role === "after-noi") x.role = x.label ? (isNum(x.amount) ? "account" : "heading") : "blank";
    });
    // a moved income total moves where income ends
    var incAt = -1; rows.forEach(function (x){ if (x.role === "income-total") incAt = x.row; });
    if (moved.income && incAt >= 0) rows.forEach(function (x){ if (x.row > reading.headerRow) x.side = x.row <= incAt ? "income" : "expense"; });
    ov.forEach(function (o){
      var e = byExcel[o.row];
      if (o.side === "income" || o.side === "expense"){ if (e.side !== o.side) e.figYours = true; e.side = o.side; e.yours = true; }
      if (o.cat){ e.cat = o.cat; e.catYours = true; e.yours = true; }
      if (isNum(o.amount)){ e.printed = e.amount; e.amount = o.amount; e.amountYours = true; e.note = o.note || ""; e.yours = true; e.figYours = true; }
      if (o.note && !e.note) e.note = o.note;
    });
    // headings: each account sits under the last category name above it
    var heading = "";
    rows.forEach(function (x){
      if (x.role === "heading"){ heading = x.top ? "" : x.label; return; }
      if (x.role === "income-total" || x.role === "expense-total") heading = "";
      if (x.role === "account") x.sub = heading;
    });
    return rows;
  }

  // The category a line falls in (the same rule every figure uses).
  function categoryOf(e){
    if (e.cat) return e.cat;
    var c = T12Classify ? T12Classify.classifyConfident(e.label, e.side === "expense" ? "EXPENSE" : "INCOME", e.sub) : null, code = c && c.code;
    if (!code) return e.side === "expense" ? "GA" : "OTH";
    if (e.side === "expense" && !isExpenseCode(code)) code = "GA";
    if (e.side === "income" && isExpenseCode(code)) code = "OTH";
    return code;
  }

  // ---- 3: the boxes and the checks ------------------------------------------------------------------------
  function check(reading, overrides){
    if (!reading || !reading.ok) return { ok: false, rows: [], boxes: [], checks: [{ id: "header", level: "file", ok: false, msg: (reading && reading.error) || "The file could not be read." }], failures: 1, parsed: null };
    var rows = applyOverrides(reading, overrides), checks = [], boxes = [], groups = [];
    var hasMonths = reading.columns.months.length > 0;
    function add(c){ c.ok = !!c.ok; checks.push(c); return c; }
    var open = null, closed = [], incSum = 0, expSum = 0, incN = 0, expN = 0;
    var incRowE = null, expRowE = null, noiRowE = null;
    function closeOpen(totalRow){ if (open && open.accounts.length){ open.totalRow = totalRow || null; boxes.push(open); closed.push(open); } open = null; }
    rows.forEach(function (e){
      if (e.row <= reading.headerRow) return;
      if (e.role === "after-noi") return;
      if (e.role === "heading"){
        if (open && open.accounts.length) closeOpen(null);   // a category that prints no total of its own
        open = { name: e.top ? "" : e.label, headingRow: e.excel, side: e.side, accounts: [], sum: 0, months: {} };
        return;
      }
      if (e.role === "account"){
        e.cat = categoryOf(e);
        if (!open) open = { name: "", headingRow: null, side: e.side, accounts: [], sum: 0, months: {} };
        open.accounts.push(e.excel); open.sum = r2(open.sum + (e.amount || 0)); open.side = e.side;
        if (e.side === "expense"){ expSum = r2(expSum + (e.amount || 0)); expN++; } else { incSum = r2(incSum + (e.amount || 0)); incN++; }
        if (hasMonths && e.monthsSum != null && isNum(e.amount)){
          var gap = r2(e.amount - e.monthsSum);
          e.check = add({ id: "a" + e.excel, level: "account", row: e.excel, label: e.label, expected: e.monthsSum, actual: e.amount, gap: gap,
            ok: Math.abs(gap) < TOL || e.amountYours, yours: !!e.amountYours,
            msg: Math.abs(gap) < TOL ? "" : (e.amountYours ? "You set this amount (" + money(e.amount) + "); its months add up to " + money(e.monthsSum) + "." :
              "Row " + e.excel + " “" + e.label + "”: the Total is " + money(e.amount) + " but its months add up to " + money(e.monthsSum) + " (a gap of " + money(Math.abs(gap)) + ").") });
        }
        return;
      }
      if (e.role === "total"){
        var amt = e.amount, kind = null, of = null;
        if (open && open.accounts.length && isNum(amt) && Math.abs(open.sum - amt) < TOL){ kind = "box"; of = open.accounts.slice(); var bx = open; closeOpen(e.excel); bx.printed = amt; bx.ok = true; }
        else if (open && open.accounts.length > 1 && isNum(amt)){
          var s = 0, k = 0; for (var j = open.accounts.length - 1; j >= 0; j--){ var acc = rows.filter(function (x){ return x.excel === open.accounts[j]; })[0]; s = r2(s + (acc.amount || 0)); k++; if (Math.abs(s - amt) < TOL){ kind = "part"; of = open.accounts.slice(j); break; } }
        }
        if (!kind && isNum(amt)){
          if (open && open.accounts.length) closeOpen(null);
          var gs = 0; for (var q = closed.length - 1; q >= 0; q--){ gs = r2(gs + (closed[q].printed != null ? closed[q].printed : closed[q].sum)); if (Math.abs(gs - amt) < TOL && closed.length - q >= 2){ kind = "group"; of = closed.slice(q).map(function (b){ return b.name || ("rows " + b.accounts[0] + "–" + b.accounts[b.accounts.length - 1]); }); closed = closed.slice(0, q).concat([{ name: e.label, accounts: [e.excel], sum: amt, printed: amt, group: true }]); break; } }
        }
        e.totalKind = kind || "unmatched"; e.totalOf = of;
        if (kind === "group") groups.push({ row: e.excel, label: e.label, amount: amt, of: of });
        add({ id: "t" + e.excel, level: kind === "group" ? "group" : "box", row: e.excel, label: e.label, actual: amt, expected: kind ? amt : null, ok: !!kind,
          msg: kind ? "" : "Row " + e.excel + " “" + e.label + "” (" + money(amt) + ") isn’t the total of the accounts or the categories just above it." });
        return;
      }
      if (e.role === "income-total"){ incRowE = e; if (open && open.accounts.length) closeOpen(null); closed = []; return; }
      if (e.role === "expense-total"){ expRowE = e; if (open && open.accounts.length) closeOpen(null); closed = []; return; }
      if (e.role === "noi"){ noiRowE = e; if (open && open.accounts.length) closeOpen(null); return; }
      if (e.role === "unlabeled") add({ id: "u" + e.excel, level: "row", row: e.excel, label: "", actual: e.amount, ok: false, msg: "Row " + e.excel + " has an amount (" + money(e.amount) + ") but no name." });
    });
    if (open && open.accounts.length) closeOpen(null);
    var incomeTotal = incRowE ? incRowE.amount : null, expenseTotal = expRowE ? expRowE.amount : null;
    if (incRowE) add({ id: "income", level: "income", row: incRowE.excel, label: incRowE.label, expected: incSum, actual: incomeTotal, gap: r2(incomeTotal - incSum), ok: Math.abs(incomeTotal - incSum) < TOL,
      msg: Math.abs(incomeTotal - incSum) < TOL ? "" : "Row " + incRowE.excel + " “" + incRowE.label + "” is " + money(incomeTotal) + " but the " + incN + " income accounts add up to " + money(incSum) + " (a gap of " + money(Math.abs(incomeTotal - incSum)) + ")." });
    if (expRowE) add({ id: "expense", level: "expense", row: expRowE.excel, label: expRowE.label, expected: expSum, actual: expenseTotal, gap: r2(expenseTotal - expSum), ok: Math.abs(expenseTotal - expSum) < TOL,
      msg: Math.abs(expenseTotal - expSum) < TOL ? "" : "Row " + expRowE.excel + " “" + expRowE.label + "” is " + money(expenseTotal) + " but the " + expN + " expense accounts add up to " + money(expSum) + " (a gap of " + money(Math.abs(expenseTotal - expSum)) + ")." });
    var computed = r2(incSum - expSum);
    if (noiRowE) add({ id: "noi", level: "noi", row: noiRowE.excel, label: noiRowE.label, expected: computed, actual: noiRowE.amount, gap: r2(noiRowE.amount - computed), ok: isNum(noiRowE.amount) && Math.abs(noiRowE.amount - computed) < TOL,
      msg: (isNum(noiRowE.amount) && Math.abs(noiRowE.amount - computed) < TOL) ? "" : "Row " + noiRowE.excel + " “" + noiRowE.label + "” is " + money(noiRowE.amount) + " but income minus expenses is " + money(computed) + " (a gap of " + money(Math.abs((noiRowE.amount || 0) - computed)) + ")." });
    else add({ id: "noi", level: "noi", row: null, label: "", expected: computed, actual: null, ok: false, msg: "No Net Operating Income row was found. Mark the NOI row, or keep the computed NOI (" + money(computed) + ")." });
    var failures = checks.filter(function (c){ return !c.ok; });
    var result = { ok: failures.length === 0, rows: rows, boxes: boxes, groups: groups, checks: checks, failures: failures,
      income: { row: incRowE ? incRowE.excel : null, printed: incomeTotal, sum: incSum, accounts: incN },
      expense: { row: expRowE ? expRowE.excel : null, printed: expenseTotal, sum: expSum, accounts: expN },
      noi: { row: noiRowE ? noiRowE.excel : null, printed: noiRowE ? noiRowE.amount : null, computed: computed },
      columns: reading.columns, headerRow: reading.headerRow };
    result.parsed = toParsed(reading, result);
    return result;
  }

  // ---- the figures every screen uses (the shape t12-parse returns) ----------------------------------------------
  // The figures every screen uses. Without your changes they are the statement's: its accounts and its printed income,
  // expense and NOI rows. Once you change what counts (a row's role, an account's side, an amount), the figures are YOUR
  // reading: income = your income accounts, expenses = your expense accounts, NOI = income − expenses (month by month too;
  // an amount you set spreads over its months in the file's proportions, evenly when its months are empty).
  function scaleMonths(m, amount){
    var keys = Object.keys(m || {}), sum = 0; keys.forEach(function (k){ sum += m[k] || 0; });
    var out = {}; if (!keys.length) return out;
    keys.forEach(function (k){ out[k] = Math.abs(sum) >= 0.005 ? r2((m[k] || 0) * amount / sum) : r2(amount / keys.length); });
    var s2 = 0; keys.forEach(function (k){ s2 += out[k]; }); out[keys[keys.length - 1]] = r2(out[keys[keys.length - 1]] + amount - s2);   // cents land on the last month
    return out;
  }
  function toParsed(reading, res){
    var p = reading.parse || {}, rows = [], subtotals = [], belowLine = [];
    var yoursFig = res.rows.some(function (e){ return e.figYours; });
    var foot = { incomeRow: -1, expenseRow: -1, noiRow: -1 }, totals = { income: null, expense: null, noi: null };
    res.rows.forEach(function (e){
      if (e.role === "account") rows.push({ name: e.label, amount: isNum(e.amount) ? e.amount : 0, section: e.side === "expense" ? "EXPENSE" : "INCOME", sub: e.sub || "", row: e.row,
        monthly: e.amountYours ? scaleMonths(e.monthly, e.amount) : (clone(e.monthly) || {}), forceCode: e.catYours ? e.cat : undefined, decided: !!e.yours });
      else if (e.role === "total" && e.totalKind !== "group") subtotals.push({ name: e.label, amount: e.amount, section: e.side === "expense" ? "EXPENSE" : "INCOME", row: e.row });
      else if (e.role === "not-operating") belowLine.push({ name: e.label, amount: e.amount, row: e.row });
      else if (e.role === "income-total"){ foot.incomeRow = e.row; totals.income = e.amount; }
      else if (e.role === "expense-total"){ foot.expenseRow = e.row; totals.expense = e.amount; }
      else if (e.role === "noi"){ foot.noiRow = e.row; totals.noi = e.amount; }
    });
    rows.forEach(function (r){ if (r.forceCode === undefined) delete r.forceCode; });
    if (totals.noi == null && totals.income != null && totals.expense != null) totals.noi = r2(totals.income - totals.expense);
    if (totals.noi == null) totals.noi = res.noi.computed;
    var totalsMonthly = {};
    ["income", "expense", "noi"].forEach(function (k){ var ri = foot[k + "Row"]; if (ri >= 0){ var e = res.rows[ri]; totalsMonthly[k] = clone(e.monthly) || {}; } });
    if (yoursFig){
      totals = { income: r2(res.income.sum), expense: r2(res.expense.sum), noi: r2(res.noi.computed) };
      var tm = { income: {}, expense: {}, noi: {} };
      rows.forEach(function (r){ var k = r.section === "EXPENSE" ? "expense" : "income"; Object.keys(r.monthly || {}).forEach(function (ym){ tm[k][ym] = r2((tm[k][ym] || 0) + (r.monthly[ym] || 0)); }); });
      Object.keys(tm.income).concat(Object.keys(tm.expense)).forEach(function (ym){ tm.noi[ym] = r2((tm.income[ym] || 0) - (tm.expense[ym] || 0)); });
      totalsMonthly = tm;
    }
    var cats = res.groups.map(function (g){ return { name: g.label, amount: g.amount, row: g.row - 1 }; });
    return { headerRow: reading.headerRow, descCol: reading.descCol, amountCol: reading.amountCol, codeCol: reading.codeCol, cols: p.cols, months: p.months, monthCols: p.monthCols,
      totalsMonthly: totalsMonthly, basis: "total", basisUsed: "total", periodsAvailable: p.periodsAvailable, rows: rows, categories: cats, totals: totals, footing: foot,
      belowLine: belowLine, subtotals: subtotals, summaryTotals: p.summaryTotals || null, summaryFooting: p.summaryFooting || null, summaryMismatch: !!p.summaryMismatch, warnings: p.warnings || [],
      checked: { ok: res.ok, failures: res.failures.length, yours: yoursFig } };
  }

  // grid → the checked reading in one call (your overrides applied)
  function readAndCheck(grid, overrides){ return check(read(grid), overrides); }

  // ---- what the AI is given, how it answers, and the comparison at every level ------------------------------
  var MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function aiInput(grid, opts){
    opts = opts || {}; var out = [];
    // a month heading Excel stores as a date (a serial number, or a Date) is shown as the month it is ("Jan 2026"), so the
    // AI sees the months the reader sees; every other cell is given exactly as it is
    var hdr = -1, mcol = {};
    try { var p = T12Parse.parseGrid(grid || [], { basis: "total", monthly: true }); hdr = p.headerRow; (p.monthCols || []).forEach(function (mc){ if (mc && mc.ym) mcol[mc.col] = mc.ym; }); } catch (e) { hdr = -1; }
    var cellText = function (c, i, j){
      if (c == null) return "";
      if (i === hdr && mcol[j] && (typeof c === "number" || c instanceof Date)){ var ym = mcol[j].split("-"); return MON3[+ym[1] - 1] + " " + ym[0]; }
      if (c instanceof Date) return isNaN(c) ? "" : c.toISOString().slice(0, 10);
      return String(c).trim();
    };
    (grid || []).forEach(function (row, i){
      var cells = Array.isArray(row) ? row.map(function (c, j){ return cellText(c, i, j); }) : [];
      out.push("Row " + (i + 1) + ": " + (cells.some(function (c){ return c !== ""; }) ? cells.join(" | ") : "(empty)"));
    });
    return (opts.fileName ? "File: " + opts.fileName + (opts.sheet ? " · sheet " + opts.sheet : "") + "\n" : "") + out.join("\n");
  }
  var AI_INSTRUCTION =
    "You are reading a property's trailing-twelve-month operating statement (T12), given below row by row from Excel row 1 " +
    "(\"Row N: cell | cell | …\"; N is the row number exactly as Excel shows it; cells are the columns from A). Read it from Row 1, " +
    "every row, top to bottom, the way an analyst would: find which column holds the category names, which the account names, which " +
    "each month, and which the Total. Every category is a box: its accounts, then (usually) the category's total row right after its " +
    "last account — that row equals the sum of its accounts. A total row is never an account. Then give: every ACCOUNT (row number, " +
    "label exactly as printed, income or expense — or 'other' when it is not part of the operating statement — its category code from " +
    "the list, its Total-column amount, and its amount in every month column as {month:'YYYY-MM', amount}); every CATEGORY BOX (its " +
    "name, the row of its name, the row of its total — null when the statement prints none — and that total); the rows and amounts of " +
    "the printed TOTAL INCOME, TOTAL EXPENSES and NET OPERATING INCOME. Stop at the Net Operating Income row: nothing below it (interest, " +
    "depreciation, capital items, net income) is read. Category codes — income: GPR gross potential rent, VAC vacancy, CONC concessions, " +
    "EMPL employee units, MOD model units, BD bad debt (income side), MTM month-to-month fees, RUBS utility reimbursements, TRSH RUB trash " +
    "reimbursements, TRSH COL trash collection income, OTH other income, AMEN amenity fees, PET pet fees, LATE late fees, ADM administrative " +
    "income, APP application fees, PARK parking, COM commercial rent, CAM CAM income, ANT antenna income; expense: RET real estate taxes, INS " +
    "insurance, UTIL utilities, PAY payroll, GA general & administrative, BDX bad debt expense, MKT marketing, RM repairs & maintenance, CS " +
    "contract services, MGMT management fee, TRSH trash removal, CAB cable, PLL parking lot lease; NONOP not operating. Copy every number " +
    "exactly as printed; never estimate, round or fill in a missing month.";
  var INCOME_CODES = ["GPR","VAC","CONC","EMPL","MOD","BD","MTM","RUBS","TRSH RUB","TRSH COL","OTH","AMEN","PET","LATE","ADM","APP","PARK","COM","CAM","ANT"];
  var EXP_CODES = ["RET","INS","UTIL","PAY","GA","BDX","MKT","RM","CS","MGMT","TRSH","CAB","PLL"];
  var CUSTOM = [];
  function setCustom(list){ CUSTOM = (list || []).filter(function (c){ return c && typeof c.code === "string" && c.label && (c.role === "income" || c.role === "expense"); }); }
  function aiInstruction(){
    if (!CUSTOM.length) return AI_INSTRUCTION;
    return AI_INSTRUCTION + " The operator's own categories (use one when a line is exactly that): " + CUSTOM.map(function (c){ return c.code + " " + c.label + " (" + c.role + ")"; }).join(", ") + ".";
  }
  function aiSchema(){
    var codes = INCOME_CODES.concat(EXP_CODES, CUSTOM.map(function (c){ return c.code; }), ["NONOP"]);
    var rowAmt = { type: "object", properties: { row: { type: "integer" }, amount: { type: "number" } } };
    return { type: "object", properties: {
      accounts: { type: "array", items: { type: "object", properties: {
        row: { type: "integer" }, label: { type: "string" }, role: { type: "string", enum: ["income", "expense", "other"] },
        category: { type: "string", enum: codes }, annual: { type: "number" },
        monthly: { type: "array", items: { type: "object", properties: { month: { type: "string" }, amount: { type: "number" } }, required: ["month", "amount"] } }
      }, required: ["row", "label", "role", "annual"] } },
      boxes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, nameRow: { type: "integer" }, totalRow: { type: ["integer", "null"] }, total: { type: ["number", "null"] } }, required: ["name"] } },
      totals: { type: "object", properties: { income: rowAmt, expense: rowAmt, noi: rowAmt } }
    }, required: ["accounts", "totals"] };
  }
  function norm(s){ return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function aiMonthly(a){ var m = {}; (a && Array.isArray(a.monthly) ? a.monthly : []).forEach(function (x){ if (x && /^\d{4}-\d{2}$/.test(String(x.month)) && isNum(x.amount)) m[x.month] = x.amount; }); return m; }
  // Compare the reader's checked reading with the AI's answer at every level: each account (is it an account, its
  // side, category, Total and months), the category totals, and the income total, expense total and NOI.
  // Returns { agree, items:[{ id, level, row, label, reader, ai, msg }] } — one item per disagreement.
  function compare(res, ai){
    var items = [];
    var acc = (ai && Array.isArray(ai.accounts)) ? ai.accounts : [], used = {};
    var readerAcc = res.rows.filter(function (e){ return e.role === "account"; });
    function find(e){ var i; for (i = 0; i < acc.length; i++) if (!used[i] && acc[i] && acc[i].row === e.excel){ used[i] = 1; return acc[i]; }
      for (i = 0; i < acc.length; i++) if (!used[i] && acc[i] && norm(acc[i].label) === norm(e.label)){ used[i] = 1; return acc[i]; } return null; }
    readerAcc.forEach(function (e){
      var a = find(e), side = e.side, cat = e.cat || categoryOf(e);
      if (!a){ if (isNum(e.amount) && Math.abs(e.amount) >= TOL) items.push({ id: "r" + e.excel, level: "account", row: e.excel, label: e.label, kind: "missing", reader: { role: "account", side: side, cat: cat, amount: e.amount }, ai: null,
        msg: "The reader counts row " + e.excel + " “" + e.label + "” as an account; the AI does not." }); return; }
      var aSide = a.role === "expense" ? "expense" : (a.role === "other" ? "other" : "income"), aCat = a.category || (aSide === "expense" ? "GA" : "OTH");
      var am = aiMonthly(a), months = [];
      Object.keys(e.monthly || {}).concat(Object.keys(am)).forEach(function (ym){ if (months.indexOf(ym) >= 0) return; var x = isNum((e.monthly || {})[ym]) ? e.monthly[ym] : 0, y = isNum(am[ym]) ? am[ym] : 0; if (Math.abs(x - y) >= TOL) months.push(ym); });
      var aAmt = isNum(a.annual) ? a.annual : 0, gap = r2(aAmt - (e.amount || 0));
      var why = [];
      if (aSide !== side) why.push(aSide === "other" ? "the AI says it isn’t part of the operating statement" : "the AI puts it on the " + aSide + " side");
      else if (aCat !== cat) why.push("the AI files it under " + aCat + " (the reader: " + cat + ")");
      if (Math.abs(gap) >= TOL) why.push("the AI reads the Total as " + money(aAmt) + " (the reader: " + money(e.amount) + ")");
      if (months.length) why.push("the AI reads " + months.length + " month" + (months.length === 1 ? "" : "s") + " differently (" + months.join(", ") + ")");
      if (why.length) items.push({ id: "r" + e.excel, level: "account", row: e.excel, label: e.label, kind: "differs", reader: { role: "account", side: side, cat: cat, amount: e.amount, monthly: e.monthly },
        ai: { side: aSide, cat: aCat, amount: aAmt, monthly: am }, months: months, msg: "Row " + e.excel + " “" + e.label + "”: " + why.join("; ") + "." });
    });
    acc.forEach(function (a, i){
      if (used[i] || !a || a.role === "other" || !isNum(a.annual) || Math.abs(a.annual) < TOL) return;
      var re = res.rows.filter(function (e){ return e.excel === a.row; })[0];
      items.push({ id: "a" + a.row, level: "account", row: a.row, label: a.label, kind: "extra", reader: re ? { role: re.role } : null,
        ai: { side: a.role === "expense" ? "expense" : "income", cat: a.category || (a.role === "expense" ? "GA" : "OTH"), amount: a.annual, monthly: aiMonthly(a) },
        msg: "The AI counts row " + a.row + " “" + a.label + "” as an account" + (re ? " (the reader: " + (ROLES[re.role] || re.role).toLowerCase() + ")" : "") + "." });
    });
    // category totals: the rows the AI says close a box, against the reader's totals
    (ai && Array.isArray(ai.boxes) ? ai.boxes : []).forEach(function (b){
      if (!b || b.totalRow == null) return;
      var re = res.rows.filter(function (e){ return e.excel === b.totalRow; })[0];
      if (!re) return;
      if (re.role !== "total" && re.role !== "income-total" && re.role !== "expense-total"){ if (!items.some(function (it){ return it.row === b.totalRow; }))
        items.push({ id: "b" + b.totalRow, level: "box", row: b.totalRow, label: re.label, kind: "box", reader: { role: re.role }, ai: { role: "total", amount: b.total }, msg: "The AI says row " + b.totalRow + " “" + re.label + "” is the total of the category “" + (b.name || "") + "” (the reader: " + (ROLES[re.role] || re.role).toLowerCase() + ")." }); }
      else if (isNum(b.total) && isNum(re.amount) && Math.abs(b.total - re.amount) >= TOL)
        items.push({ id: "b" + b.totalRow, level: "box", row: b.totalRow, label: re.label, kind: "box", reader: { role: re.role, amount: re.amount }, ai: { amount: b.total }, msg: "Row " + b.totalRow + " “" + re.label + "”: the AI reads " + money(b.total) + " (the reader: " + money(re.amount) + ")." });
    });
    // the three printed totals
    var t = (ai && ai.totals) || {};
    [["income", "income total", res.income], ["expense", "expense total", res.expense], ["noi", "Net Operating Income", { row: res.noi.row, printed: res.noi.printed }]].forEach(function (x){
      var a = t[x[0]]; if (!a || (a.row == null && !isNum(a.amount))) return;
      var rRow = x[2].row, rAmt = x[2].printed;
      if (a.row != null && rRow != null && a.row !== rRow) items.push({ id: "T" + x[0], level: x[0], row: rRow, label: x[1], kind: "total-row", reader: { row: rRow, amount: rAmt }, ai: { row: a.row, amount: a.amount }, msg: "The AI reads the " + x[1] + " on row " + a.row + "; the reader on row " + rRow + "." });
      else if (a.row != null && rRow == null) items.push({ id: "T" + x[0], level: x[0], row: a.row, label: x[1], kind: "total-row", reader: { row: null }, ai: { row: a.row, amount: a.amount }, msg: "The AI finds the " + x[1] + " on row " + a.row + "; the reader found none." });
      else if (isNum(a.amount) && isNum(rAmt) && Math.abs(a.amount - rAmt) >= TOL) items.push({ id: "T" + x[0], level: x[0], row: rRow, label: x[1], kind: "total-amount", reader: { amount: rAmt }, ai: { amount: a.amount }, msg: "The AI reads the " + x[1] + " as " + money(a.amount) + "; the reader " + money(rAmt) + "." });
    });
    return { agree: items.length === 0, items: items, compared: readerAcc.length };
  }

  // ---- a T12 in several sheets (a property in phases): your changes, made sheet by sheet, on the combined statement ----
  // FileParts.combineT12Grids adds the sheets line by line (a line is its name — the cells left of the months — and
  // which time that name occurs). Each change you made on a sheet's row goes to the same line of the combined
  // statement: what the row is, its side and category (the first sheet that sets one wins), and an amount as the
  // difference it makes (the combined line = the sheets' amounts with yours in place of the file's).
  function lineKeys(grid){
    var h = T12Parse.findHeader(grid || [], { loose: true }); if (h.headerRow < 0 || h.cols.total < 0) return null;
    var mcs = T12Parse.resolveMonthCols(grid[h.headerRow], h.months || []);
    var firstNum = mcs.length ? Math.min.apply(null, mcs.map(function (m){ return m.col; })) : h.cols.total;
    var seen = {}, keys = {};
    for (var r = h.headerRow + 1; r < grid.length; r++){
      var row = grid[r] || [], pre = [];
      for (var c = 0; c < firstNum; c++) pre.push(str(row[c]));
      var label = pre.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ");
      var any = toNum(row[h.cols.total]) != null || mcs.some(function (m){ return toNum(row[m.col]) != null; });
      if (!label && !any) continue;
      var n = seen[label] = (seen[label] || 0) + 1; keys[r + 1] = label + "#" + n;
    }
    return { keys: keys, totalCol: h.cols.total };
  }
  function combineOverrides(parts, combined){
    var ck = lineKeys(combined); if (!ck) return [];
    var at = {}; Object.keys(ck.keys).forEach(function (ex){ at[ck.keys[ex]] = +ex; });
    var acc = {}, order = [];
    (parts || []).forEach(function (pt){
      var pk = pt && pt.grid ? lineKeys(pt.grid) : null; if (!pk) return;
      (pt.overrides || []).forEach(function (o){
        var cr = o && at[pk.keys[o.row]]; if (!cr) return;
        var c = acc[cr]; if (!c){ c = acc[cr] = { row: cr, by: o.by, at: o.at, notes: [], delta: 0, amt: false }; order.push(cr); }
        if (o.role && !c.role) c.role = o.role; if (o.side && !c.side) c.side = o.side; if (o.cat && !c.cat) c.cat = o.cat;
        if (isNum(o.amount)){ c.delta = r2(c.delta + o.amount - (toNum((pt.grid[o.row - 1] || [])[pk.totalCol]) || 0)); c.amt = true; }
        if (o.note) c.notes.push(o.note);
      });
    });
    return order.map(function (cr){
      var c = acc[cr], o = { row: cr, by: c.by, at: c.at };
      if (c.role) o.role = c.role; if (c.side) o.side = c.side; if (c.cat) o.cat = c.cat;
      if (c.amt) o.amount = r2((toNum((combined[cr - 1] || [])[ck.totalCol]) || 0) + c.delta);
      if (c.notes.length) o.note = c.notes.join(" · ");
      return o;
    });
  }

  return { TOL: TOL, ROLES: ROLES, EDITABLE_ROLES: EDITABLE_ROLES, gridFromSheet: gridFromSheet, read: read, check: check, readAndCheck: readAndCheck, applyOverrides: applyOverrides,
           categoryOf: categoryOf, toParsed: toParsed, aiInput: aiInput, aiInstruction: aiInstruction, aiSchema: aiSchema, setCustom: setCustom, compare: compare,
           colName: colName, money: money, combineOverrides: combineOverrides };
});
