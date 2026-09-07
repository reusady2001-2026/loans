/* ============================================================================
   Synthetic T12 grids for the parser / setup-builder tests, in the SheetJS
   sheet_to_json({header:1}) shape (an array of row arrays). Every builder returns
   { grid, expect } where `expect` carries HAND-COMPUTED figures (the arithmetic is
   written out in the comments) — nothing in this file calls the parser, so a test
   comparing the two can actually fail.
   Month cells are exact: an annual amount in integer cents is split 12 ways
   (trunc(c/12) per month, the remainder in month 12) so Total = Σ months and the
   trailing T6 / T3 / T1 columns are the sums of the last 6 / 3 / 1 month cells.
   ========================================================================== */
"use strict";

var MONTHS = ["Jul 2025","Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025",
              "Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"];
function cents(d){ return Math.round(d * 100); }
function split12(c){ var b = Math.trunc(c / 12), m = []; for (var i = 0; i < 11; i++) m.push(b); m.push(c - 11 * b); return m; }
function zeros(){ return [0,0,0,0,0,0,0,0,0,0,0,0]; }

// A statement builder: rows are [label, m1..m12 (dollars), Total (dollars)].
// Footing / category rows carry the exact month-by-month sums of their lines.
function Builder(opts){
  opts = opts || {};
  this.periods = !!opts.periods;            // add T6 / T3 / T1 columns after Total
  this.grid = []; this.acc = {};            // running month sums per open subtotal key
  this.at = {};                             // row index of each footing / caption
}
Builder.prototype.push = function (row){ this.grid.push(row); return this.grid.length - 1; };
Builder.prototype.caption = function (label){ return this.push([label]); };
Builder.prototype.blank = function (){ return this.push([]); };
Builder.prototype.header = function (labels){
  var h = [null].concat(labels || MONTHS, ["Total"]);
  if (this.periods) h = h.concat(["T6","T3","T1"]);
  return this.push(h);
};
Builder.prototype.amountRow = function (label, m){       // m = 12 integer-cent month values
  var tot = m.reduce(function(a,b){ return a + b; }, 0);
  var row = [label].concat(m.map(function(x){ return x / 100; }), [tot / 100]);
  if (this.periods){
    var sum = function (from){ return m.slice(from).reduce(function(a,b){ return a + b; }, 0) / 100; };
    row = row.concat([sum(6), sum(9), sum(11)]);
  }
  return this.push(row);
};
Builder.prototype.line = function (label, dollars, keys){  // a detail line; adds into each open subtotal key
  var m = split12(cents(dollars)), self = this;
  (keys || []).forEach(function (k){
    if (!self.acc[k]) self.acc[k] = zeros();
    for (var i = 0; i < 12; i++) self.acc[k][i] += m[i];
  });
  return this.amountRow(label, m);
};
Builder.prototype.total = function (label, key, name){   // a subtotal / footing row from an accumulator
  var m = this.acc[key] || zeros();
  var r = this.amountRow(label, m);
  if (name) this.at[name] = r;
  return r;
};

// ---------------------------------------------------------------------------
// The clean statement. Hand arithmetic (dollars):
//   RENTAL: 1,203,456.78 − 61,234.56 − 12,345.67 − 4,567.89 − 6,000.00 − 9,012.34 = 1,110,296.32
//   OTHER : 48,123.45 + 7,250.00 + 3,610.50 + 2,400.00 + 9,600.00 + 0.00 + 1,315.25 = 72,299.20
//   TOTAL INCOME = 1,110,296.32 + 72,299.20 = 1,182,595.52
//   T&I 192,350.75 · UTIL 97,552.50 · R&M 40,575.25 · CS 18,000.00 · PAY 113,250.50
//   G&A 5,025.75 · MKT 9,075.00 · MGMT 35,477.87  → TOTAL EXPENSES = 511,307.62
//   NET OPERATING INCOME = 1,182,595.52 − 511,307.62 = 671,287.90
// Trailing bases (Σ over lines of c − k·trunc(c/12), k = 6 / 9 / 11):
//   T6: income 591,297.80  expense 255,654.16  noi 335,643.64
//   T3: income 295,648.94  expense 127,827.43  noi 167,821.51
//   T1: income  98,549.70  expense  42,609.61  noi  55,940.09
function body(b){
  b.caption("Synthetic Gardens (synth)"); b.caption("Cash Flow (12 months)"); b.caption("Period = Jul 2025-Jun 2026"); b.blank();
  b.at.header = b.header();
  b.caption("INCOME");
  b.caption("RENTAL INCOME");
  b.line("Residential Rent",     1203456.78, ["rent","inc"]);
  b.line("Vacancy Loss",          -61234.56, ["rent","inc"]);
  b.line("Concessions",           -12345.67, ["rent","inc"]);
  b.line("Bad Debt",               -4567.89, ["rent","inc"]);
  b.line("Employee Discount",      -6000.00, ["rent","inc"]);
  b.line("Model Units",            -9012.34, ["rent","inc"]);
  b.total("TOTAL RENTAL INCOME", "rent");
  b.blank();
  b.caption("OTHER INCOME");
  b.line("Utility Reimbursements", 48123.45, ["oth","inc"]);
  b.line("Pet Fees",                7250.00, ["oth","inc"]);
  b.line("Late Fees",               3610.50, ["oth","inc"]);
  b.line("Application Fees",        2400.00, ["oth","inc"]);
  b.line("Parking Income",          9600.00, ["oth","inc"]);
  b.line("Storage Income",             0.00, ["oth","inc"]);
  b.line("Miscellaneous Income",    1315.25, ["oth","inc"]);
  b.total("TOTAL OTHER INCOME", "oth");
  b.blank();
  b.total("TOTAL INCOME", "inc", "income");
  b.blank();
  b.caption("EXPENSES");
  b.caption("TAXES AND INSURANCE");
  b.line("Real Estate Taxes",     150250.00, ["ti","exp"]);
  b.line("Property Insurance",     42100.75, ["ti","exp"]);
  b.total("TOTAL TAXES AND INSURANCE", "ti");
  b.caption("UTILITIES");
  b.line("Electric",               30120.40, ["ut","exp"]);
  b.line("Water & Sewer",          55432.10, ["ut","exp"]);
  b.line("Trash Removal",          12000.00, ["ut","exp"]);
  b.total("TOTAL UTILITIES", "ut");
  b.caption("REPAIRS & MAINTENANCE");
  b.line("Plumbing Repairs",       18500.25, ["rm","exp"]);
  b.line("Turnover Costs",         22075.00, ["rm","exp"]);
  b.total("TOTAL REPAIRS & MAINTENANCE", "rm");
  b.caption("CONTRACT SERVICES");
  b.line("Landscaping",            14400.00, ["cs","exp"]);
  b.line("Pest Control",            3600.00, ["cs","exp"]);
  b.total("TOTAL CONTRACT SERVICES", "cs");
  b.caption("PAYROLL");
  b.line("Manager Salary",         65000.00, ["pay","exp"]);
  b.line("Maintenance Salary",     48250.50, ["pay","exp"]);
  b.total("TOTAL PAYROLL", "pay");
  b.caption("GENERAL AND ADMINISTRATIVE");
  b.line("Office Supplies",         4210.15, ["ga","exp"]);
  b.line("Bank Charges",             815.60, ["ga","exp"]);
  b.total("TOTAL GENERAL AND ADMINISTRATIVE", "ga");
  b.caption("MARKETING");
  b.line("Advertising",             9075.00, ["mkt","exp"]);
  b.total("TOTAL MARKETING", "mkt");
  b.caption("MANAGEMENT FEES");
  b.line("Management Fee",         35477.87, ["mg","exp"]);
  b.total("TOTAL MANAGEMENT FEES", "mg");
  b.blank();
  b.total("TOTAL EXPENSES", "exp", "expense");
  b.blank();
  // NOI row: income months − expense months
  var m = zeros(); for (var i = 0; i < 12; i++) m[i] = b.acc.inc[i] - b.acc.exp[i];
  b.at.noi = b.amountRow("NET OPERATING INCOME", m);
}
var CLEAN_EXPECT = {
  income: 1182595.52, expense: 511307.62, noi: 671287.90,
  rows: 28, descCol: 0, totalCol: 13,
  categories: [
    ["TOTAL RENTAL INCOME", 1110296.32, "INCOME"], ["TOTAL OTHER INCOME", 72299.20, "INCOME"],
    ["TOTAL TAXES AND INSURANCE", 192350.75, "EXPENSE"], ["TOTAL UTILITIES", 97552.50, "EXPENSE"],
    ["TOTAL REPAIRS & MAINTENANCE", 40575.25, "EXPENSE"], ["TOTAL CONTRACT SERVICES", 18000.00, "EXPENSE"],
    ["TOTAL PAYROLL", 113250.50, "EXPENSE"], ["TOTAL GENERAL AND ADMINISTRATIVE", 5025.75, "EXPENSE"],
    ["TOTAL MARKETING", 9075.00, "EXPENSE"], ["TOTAL MANAGEMENT FEES", 35477.87, "EXPENSE"]
  ],
  // classified category sums (each line's code follows the statement's own sub-section)
  sums: { GPR: 1203456.78, VAC: -61234.56, CONC: -12345.67, BD: -4567.89, EMPL: -6000.00, MOD: -9012.34,
          RUBS: 48123.45, PET: 7250.00, LATE: 3610.50, APP: 2400.00, PARK: 9600.00, OTH: 1315.25,
          RET: 150250.00, INS: 42100.75, UTIL: 85552.50, TRSH: 12000.00, RM: 40575.25, CS: 18000.00,
          PAY: 113250.50, GA: 5025.75, MKT: 9075.00, MGMT: 35477.87 },
  t6: { income: 591297.80, expense: 255654.16, noi: 335643.64 },
  t3: { income: 295648.94, expense: 127827.43, noi: 167821.51 },
  t1: { income:  98549.70, expense:  42609.61, noi:  55940.09 }
};
function withFooting(exp, at){ var e = JSON.parse(JSON.stringify(exp)); e.footing = { incomeRow: at.income, expenseRow: at.expense, noiRow: at.noi }; e.headerRow = at.header; return e; }

function clean(){ var b = new Builder(); body(b); return { grid: b.grid, expect: withFooting(CLEAN_EXPECT, b.at) }; }

// The clean statement continued BELOW the operating line: mortgage, depreciation
// and a NET INCOME row (671,287.90 − 290,000.00 − 120,000.00 = 261,287.90) that a
// naive parser reads as the NOI. opts.noNoiRow drops the NET OPERATING INCOME row
// so the parser has to derive NOI = income − expenses and still ignore the rest.
function belowTheLine(opts){
  opts = opts || {};
  var b = new Builder(); body(b);
  if (opts.noNoiRow){ b.grid.splice(b.at.noi, 1); b.at.noi = -1; }
  b.blank();
  b.caption("MORTGAGE");
  b.line("Interest",             250000.00, ["mtg","bl"]);
  b.line("Principal",             40000.00, ["mtg","bl"]);
  b.total("TOTAL MORTGAGE", "mtg");
  b.caption("DEPRECIATION");
  b.line("Depreciation Expense", 120000.00, ["dep","bl"]);
  b.total("TOTAL DEPRECIATION", "dep");
  b.blank();
  var m = zeros(); for (var i = 0; i < 12; i++) m[i] = b.acc.inc[i] - b.acc.exp[i] - b.acc.bl[i];
  b.at.netIncome = b.amountRow(" NET INCOME", m);
  var e = withFooting(CLEAN_EXPECT, b.at);
  e.netIncome = 261287.90; e.totalMortgage = 290000.00; e.netIncomeRow = b.at.netIncome;
  return { grid: b.grid, expect: e };
}

// The clean statement with trailing T6 / T3 / T1 columns after Total.
function periods(){ var b = new Builder({ periods: true }); body(b); var e = withFooting(CLEAN_EXPECT, b.at); e.cols = { total: 13, t6: 14, t3: 15, t1: 16 }; return { grid: b.grid, expect: e }; }

// An underwriting-style FLAT statement (no sub-section headers, "Jul-25" month
// labels): Gross Potential Rent as a detail line, EFFECTIVE GROSS INCOME as the
// income total, an OPERATING EXPENSES caption, reserves below the line.
//   NET RENTAL INCOME = 1,512,345.60 − 75,617.28 − 15,123.45 = 1,421,604.87
//   EGI  = 1,421,604.87 + 30,250.10 = 1,451,854.97
//   OPEX = 201,234.56 + 50,123.40 + 80,456.70 + 43,555.65 = 375,370.31
//   NOI  = 1,451,854.97 − 375,370.31 = 1,076,484.66 ; after 12,000.00 reserves = 1,064,484.66
function gprStyle(){
  var b = new Builder();
  b.at.header = b.push(["Account"].concat(["Jul-25","Aug-25","Sep-25","Oct-25","Nov-25","Dec-25","Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26"], ["Total"]));
  b.line("Gross Potential Rent",  1512345.60, ["nri","inc"]);
  b.line("Less: Vacancy",          -75617.28, ["nri","inc"]);
  b.line("Less: Concessions",      -15123.45, ["nri","inc"]);
  b.total("NET RENTAL INCOME", "nri");
  b.line("Other Income",            30250.10, ["inc"]);
  b.total("EFFECTIVE GROSS INCOME", "inc", "income");
  b.blank();
  b.caption("OPERATING EXPENSES");
  b.line("Real Estate Taxes",      201234.56, ["exp"]);
  b.line("Insurance",               50123.40, ["exp"]);
  b.line("Repairs & Maintenance",   80456.70, ["exp"]);
  b.line("Management Fee",          43555.65, ["exp"]);
  b.total("TOTAL OPERATING EXPENSES", "exp", "expense");
  var m = zeros(); for (var i = 0; i < 12; i++) m[i] = b.acc.inc[i] - b.acc.exp[i];
  b.at.noi = b.amountRow("NET OPERATING INCOME", m);
  b.line("Replacement Reserves",    12000.00, ["res"]);
  for (i = 0; i < 12; i++) m[i] -= b.acc.res[i];
  b.amountRow("CASH FLOW AFTER RESERVES", m);
  var e = { income: 1451854.97, expense: 375370.31, noi: 1076484.66, rows: 8, descCol: 0, totalCol: 13,
            categories: [["NET RENTAL INCOME", 1421604.87, "INCOME"]],
            sums: { GPR: 1512345.60, VAC: -75617.28, CONC: -15123.45, OTH: 30250.10,
                    RET: 201234.56, INS: 50123.40, RM: 80456.70, MGMT: 43555.65 },
            review: ["Other Income"] };
  return { grid: b.grid, expect: withFooting(e, b.at) };
}

// ---- transforms (return a NEW grid; expectations are unchanged unless noted) ----
function copy(grid){ return grid.map(function (r){ return Array.isArray(r) ? r.slice() : r; }); }
function isRowCaps(s){ return /[A-Z]/.test(s) && s === s.toUpperCase(); }
// Amount cells as accounting text: "1,234.56", "(1,234.56)", "-" for zero.
function stringify(grid, headerRow){
  var fmt = function (n){ var a = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); return n === 0 ? "-" : n < 0 ? "(" + a + ")" : a; };
  return grid.map(function (r, i){ return (!Array.isArray(r) || i <= headerRow) ? r : r.map(function (v){ return typeof v === "number" ? fmt(v) : v; }); });
}
// Captions / totals in column A, detail names in column B (a common export layout).
function twoLabelColumns(grid, headerRow){
  return grid.map(function (r, i){
    if (!Array.isArray(r) || !r.length) return r;
    var label = r[0], rest = r.slice(1);
    if (i === headerRow) return [null, "Account"].concat(rest);
    if (typeof label === "string" && isRowCaps(label.trim())) return [label, null].concat(rest);
    return [null, label].concat(rest);
  });
}
function without(grid, re){ return grid.filter(function (r){ return !(Array.isArray(r) && typeof r[0] === "string" && re.test(r[0].trim())); }); }
function relabel(grid, re, label){ return grid.map(function (r){ return (Array.isArray(r) && typeof r[0] === "string" && re.test(r[0].trim())) ? [label].concat(r.slice(1)) : r; }); }
// Header month cells as Excel serial dates (2025-07-01 = 45839, one month apart) / JS Dates / bare names.
function serialHeader(grid, headerRow){
  var g = copy(grid), d0 = Date.UTC(2025, 6, 1), epoch = Date.UTC(1899, 11, 30);
  for (var i = 0; i < 12; i++){ var d = new Date(d0); d.setUTCMonth(6 + i); g[headerRow][1 + i] = (d.getTime() - epoch) / 86400000; }
  return g;
}
function dateHeader(grid, headerRow){
  var g = copy(grid);
  for (var i = 0; i < 12; i++){ var d = new Date(Date.UTC(2025, 6, 1)); d.setUTCMonth(6 + i); g[headerRow][1 + i] = d; }
  return g;
}
function bareMonthHeader(grid, headerRow){
  var g = copy(grid), names = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
  for (var i = 0; i < 12; i++) g[headerRow][1 + i] = names[i];
  return g;
}

// Inputs that must never throw. Each yields an empty (or partial) parse.
function malformed(){
  var c = clean().grid;
  return [
    { label: "undefined", grid: undefined }, { label: "null", grid: null }, { label: "a number", grid: 42 },
    { label: "a string", grid: "TOTAL INCOME 1000" }, { label: "an object", grid: { rows: [] } },
    { label: "empty grid", grid: [] }, { label: "one empty row", grid: [[]] }, { label: "null rows", grid: [null, undefined, null] },
    { label: "null cells", grid: [[null, null], [null, null]] },
    { label: "all text", grid: [["Income", "Rent"], ["Expenses", "Taxes"], ["TOTAL INCOME", "lots"]] },
    { label: "all numbers", grid: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
    { label: "ragged junk", grid: [["x"], 7, "str", [[1], {}], [new Date(), true, false], [{ a: 1 }, null]] },
    { label: "header only", grid: c.slice(0, 5) },
    { label: "header, no amounts", grid: c.map(function (r, i){ return (Array.isArray(r) && i > 4) ? [r[0]] : r; }) },
    { label: "rows but no header", grid: c.filter(function (r, i){ return i !== 4; }) },
    { label: "dates/booleans in amount cells", grid: c.map(function (r, i){ return (Array.isArray(r) && i > 4 && r.length > 1) ? r.slice(0, 13).concat([i % 2 ? new Date() : true]) : r; }) }
  ];
}

module.exports = { clean: clean, belowTheLine: belowTheLine, periods: periods, gprStyle: gprStyle, malformed: malformed,
                   stringify: stringify, twoLabelColumns: twoLabelColumns, without: without, relabel: relabel,
                   serialHeader: serialHeader, dateHeader: dateHeader, bareMonthHeader: bareMonthHeader, MONTHS: MONTHS };
