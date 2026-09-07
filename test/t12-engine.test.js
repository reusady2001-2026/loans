/* ============================================================================
   T12 engine tests — E1 (t12-parse.js) and E3 (setup-builder.js in-place NOI tie).
   Plain node, no framework:  /opt/node22/bin/node test/t12-engine.test.js
   Every figure asserted here is a hand-computed literal (see the fixture's
   comments) or the Crest statement's printed footing — never something the code
   under test produced. Each section runs guarded: a thrown section is a FAIL,
   not a crash, so the full failure list is always printed.
   ========================================================================== */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var T12 = require(path.join(ROOT, "t12-parse.js"));
var SB  = require(path.join(ROOT, "setup-builder.js"));
var CL  = require(path.join(ROOT, "t12-classify.js"));
var F   = require(path.join(__dirname, "fixtures", "synthetic-t12.js"));

var fails = 0, total = 0;
function ok(cond, msg){ total++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; }
function eq(got, want, msg){ ok(got === want, msg + " — got " + JSON.stringify(got) + (got === want ? "" : ", want " + JSON.stringify(want))); }
function cents(a){ return Math.round(a * 100); }              // exact-cent comparison of a float sum
function sumRows(rows, section){ return cents(rows.filter(function(r){ return r.section === section; }).reduce(function(s, r){ return s + r.amount; }, 0)) / 100; }
function noThrow(fn, msg){ try { var v = fn(); ok(true, msg); return v; } catch (e) { ok(false, msg + " — threw " + (e && e.message)); return null; } }
function run(title, fn){ console.log("\n" + title); try { fn(); } catch (e) { total++; fails++; console.log("  FAIL section threw: " + (e && e.stack || e)); } }
var CODES = Object.keys(CL.INCOME).concat(Object.keys(CL.EXPENSE));
var C = F.clean(), e = C.expect, p = T12.parseGrid(C.grid);

// ---------------------------------------------------------------------------
run("E1 · clean synthetic statement", function(){
  eq(T12.findHeader(C.grid).headerRow, e.headerRow, "findHeader: header row");
  eq(p.headerRow, e.headerRow, "parseGrid: header row");
  eq(p.cols.total, e.totalCol, "Total column auto-found");
  eq(p.descCol, e.descCol, "description column auto-found");
  eq(p.months.length, 12, "12 month columns recognised");
  eq(p.amountCol, e.totalCol, "amount column = Total on the default basis");
  eq(p.basisUsed, "total", "basisUsed reported");
  eq(JSON.stringify(p.periodsAvailable), '["total"]', "periodsAvailable = total only");
  eq(p.footing.incomeRow, e.footing.incomeRow, "TOTAL INCOME row located");
  eq(p.footing.expenseRow, e.footing.expenseRow, "TOTAL EXPENSES row located");
  eq(p.footing.noiRow, e.footing.noiRow, "NET OPERATING INCOME row located");
  eq(p.totals.income, e.income, "totals.income = printed TOTAL INCOME");
  eq(p.totals.expense, e.expense, "totals.expense = printed TOTAL EXPENSES");
  eq(p.totals.noi, e.noi, "totals.noi = printed NET OPERATING INCOME");
  eq(p.rows.length, e.rows, "detail rows");
  eq(sumRows(p.rows, "INCOME"), e.income, "Σ INCOME detail rows = printed income (to the cent)");
  eq(sumRows(p.rows, "EXPENSE"), e.expense, "Σ EXPENSE detail rows = printed expense (to the cent)");
  ok(p.rows.every(function(r){ return (r.row < p.footing.incomeRow) === (r.section === "INCOME"); }), "section follows the TOTAL INCOME divider row-by-row");
  ok(p.rows.every(function(r){ return !/^(TOTAL|NET)\b/i.test(r.name); }), "no subtotal/footing row counted as a detail line");
  eq(JSON.stringify(p.categories.map(function(c){ return [c.name, c.amount, c.section]; })), JSON.stringify(e.categories), "printed category subtotals (name, amount, section, order)");
  eq(p.belowLine.length, 0, "nothing below the line on a clean statement");
  var storage = p.rows.filter(function(r){ return r.name === "Storage Income"; })[0];
  eq(storage && storage.amount, 0, "a zero detail line is kept as a row (amount 0)");
  eq(p.rows.filter(function(r){ return r.name === "Manager Salary"; })[0].sub, "PAYROLL", "sub-section header carried onto detail lines");
  eq(p.rows.filter(function(r){ return r.name === "Real Estate Taxes"; })[0].sub, "TAXES AND INSURANCE", "sub-section resets at the EXPENSES caption (not inherited from OTHER INCOME)");
});

run("E3 · clean synthetic statement: classified sums reconcile, in-place NOI ties", function(){
  var fp = SB.fromParse(p);
  Object.keys(e.sums).forEach(function(k){ eq(fp.sums[k], e.sums[k], "sum " + k); });
  eq(Object.keys(fp.sums).filter(function(k){ return e.sums[k] == null; }).join(","), "", "no unexpected category codes");
  eq(fp.reconcile.incomeRaw, e.income, "income detail lines foot to the printed total");
  eq(fp.reconcile.expenseRaw, e.expense, "expense detail lines foot to the printed total");
  eq(fp.reconcile.incomeResidual, 0, "income residual reported as 0");
  eq(fp.reconcile.expenseResidual, 0, "expense residual reported as 0");
  eq(fp.reconcile.noiBuilt, e.noi, "NOI implied by the built sums");
  eq(fp.reconcile.ties, true, "reconcile.ties");
  eq(fp.review.length, 0, "every line placed by the statement's hierarchy → no review items");
  eq(fp.inPlaceNOI, e.noi, "fromParse.inPlaceNOI = printed NOI");
  var b = SB.buildSetup({ parsed: p, units: 100, benchmarks: {} });
  eq(b.result.inPlace.noi, e.noi, "buildSetup: result.inPlace.noi === totals.noi (strict)");
  eq(b.result.inPlace.egi, e.income, "buildSetup: result.inPlace.egi === totals.income");
  eq(b.result.inPlace.opex, e.expense, "buildSetup: result.inPlace.opex === totals.expense");
  eq(b.inPlaceNOIReported, e.noi, "inPlaceNOIReported carried");
  eq(b.result.inPlace.noiReported, e.noi, "result.inPlace.noiReported carried");
  eq(b.reconcile && b.reconcile.ties, true, "reconcile report carried on the built setup");
  eq(b.result.inPlace.reserves, 0, "in-place reserves are 0 (reserves are an underwriting adjustment only)");
  eq(b.categorySums.GPR, e.sums.GPR, "categorySums exposed");
});

run("E1 · same statement, cell / layout variants", function(){
  var S = T12.parseGrid(F.stringify(C.grid, e.headerRow));
  eq(S.totals.income, e.income, "text amounts: TOTAL INCOME");
  eq(S.totals.expense, e.expense, "text amounts: TOTAL EXPENSES");
  eq(S.totals.noi, e.noi, "text amounts: NOI");
  eq(S.rows.length, e.rows, "text amounts: detail rows (accounting '-' zero kept as a row)");
  eq(sumRows(S.rows, "INCOME"), e.income, "text amounts: '(1,234.56)' parsed negative → income rows still foot");
  eq(SB.buildSetup({ parsed: S }).result.inPlace.noi, e.noi, "text amounts: in-place NOI ties");
  var W = T12.parseGrid(F.twoLabelColumns(C.grid, e.headerRow));
  eq(W.descCol, 1, "captions in col A / names in col B: description column = B");
  eq(W.totals.income, e.income, "two label columns: TOTAL INCOME found in column A");
  eq(W.totals.noi, e.noi, "two label columns: NOI found in column A");
  eq(W.rows.length, e.rows, "two label columns: detail rows");
  eq(W.categories.length, e.categories.length, "two label columns: category subtotals found in column A");
  eq(sumRows(W.rows, "EXPENSE"), e.expense, "two label columns: expense rows foot");
  [["Excel serial dates", F.serialHeader], ["JS Date objects", F.dateHeader], ["bare month names", F.bareMonthHeader]].forEach(function(v){
    var g = v[1](C.grid, e.headerRow), q = T12.parseGrid(g);
    eq(T12.findHeader(g).headerRow, e.headerRow, "header with " + v[0] + ": found");
    eq(q.totals.noi, e.noi, "header with " + v[0] + ": NOI");
  });
  var N = T12.parseGrid(F.without(C.grid, /^TOTAL INCOME$/));
  eq(N.totals.income, null, "no TOTAL INCOME row: income total is null (not invented)");
  eq(N.totals.expense, e.expense, "no TOTAL INCOME row: TOTAL EXPENSES still read");
  eq(N.totals.noi, e.noi, "no TOTAL INCOME row: NOI still read");
  eq(N.rows.length, e.rows, "no TOTAL INCOME row: detail rows");
  eq(sumRows(N.rows, "EXPENSE"), e.expense, "no TOTAL INCOME row: the EXPENSES caption still splits the sections");
  var nf = SB.fromParse(N);
  eq(nf.reconcile.incomeResidual, null, "no income total → income residual null (unreconciled), not 0");
  eq(nf.reconcile.expenseResidual, 0, "expense section still reconciled");
  eq(SB.buildSetup({ parsed: N }).result.inPlace.noi, e.noi, "in-place NOI still ties when the details foot");
  var NE = T12.parseGrid(F.without(C.grid, /^NET OPERATING INCOME$/));
  eq(NE.totals.noi, e.noi, "no NOI row: NOI derived = income − expenses (cents)");
  eq(NE.footing.noiRow, -1, "no NOI row: footing.noiRow = -1");
  var fb = T12.parseGrid(C.grid, { basis: "t3" });
  eq(fb.basisUsed, "total", "basis t3 requested but absent → basisUsed = total");
  eq(fb.amountCol, e.totalCol, "basis t3 absent → amount column falls back to Total");
  eq(fb.totals.noi, e.noi, "basis t3 absent → totals from the Total column");
});

run("E1 · NOI row label variants", function(){
  [["NOI", true], ["NET OPERATING INCOME (NOI)", true], ["TOTAL NET OPERATING INCOME", true], ["NET OPERATING INCOME / (LOSS)", true],
   ["Net Operating Income", true], ["NOI before debt service", true],
   ["NET INCOME", false], ["NET INCOME BEFORE DEPRECIATION", false], ["NET OPERATING INCOME AFTER RESERVES", false], ["NOI MARGIN", false]
  ].forEach(function(v){
    // relabel the NOI row and put a decoy amount on it: matched labels must return the row's
    // figure; unmatched labels must be ignored (NOI derived from the printed totals instead)
    var g = F.relabel(C.grid, /^NET OPERATING INCOME$/, v[0]).map(function(r){ return (Array.isArray(r) && r[0] === v[0]) ? [v[0]].concat(r.slice(1, 13), [123456.78]) : r; });
    var q = T12.parseGrid(g);
    eq(q.totals.noi, v[1] ? 123456.78 : e.noi, JSON.stringify(v[0]) + (v[1] ? " is the NOI row" : " is NOT the NOI row (derived income − expense used)"));
  });
});

run("E1 · below-the-line section (mortgage, depreciation, NET INCOME)", function(){
  var B = F.belowTheLine(), pb = T12.parseGrid(B.grid), eb = B.expect;
  eq(pb.totals.noi, eb.noi, "NOI = NET OPERATING INCOME row, not the NET INCOME row");
  ok(pb.totals.noi !== eb.netIncome, "NET INCOME (" + eb.netIncome + ") ignored");
  eq(pb.footing.noiRow, eb.footing.noiRow, "NOI read from the NET OPERATING INCOME row index");
  eq(pb.rows.length, eb.rows, "detail rows stop at the operating bottom line");
  eq(pb.rows.filter(function(r){ return /^(Interest|Principal|Depreciation Expense)$/.test(r.name); }).length, 0, "mortgage / depreciation lines never read as expense");
  eq(pb.categories.filter(function(c){ return /MORTGAGE|DEPRECIATION/.test(c.name); }).length, 0, "TOTAL MORTGAGE / TOTAL DEPRECIATION never read as expense categories");
  eq(sumRows(pb.rows, "EXPENSE"), eb.expense, "expense rows still foot to TOTAL EXPENSES");
  ok(pb.rows.every(function(r){ return r.row < pb.footing.noiRow; }), "every detail row sits above the NOI row");
  var bb = SB.buildSetup({ parsed: pb, units: 100, benchmarks: {} });
  eq(bb.result.inPlace.noi, eb.noi, "buildSetup: in-place NOI === printed NOI");
  eq(bb.result.inPlace.opex, eb.expense, "buildSetup: in-place opex === printed TOTAL EXPENSES (no mortgage inside)");
  eq(bb.inPlaceNOIReported, eb.noi, "inPlaceNOIReported = printed NOI");
  var B2 = F.belowTheLine({ noNoiRow: true }), pb2 = T12.parseGrid(B2.grid), eb2 = B2.expect;
  eq(pb2.footing.noiRow, -1, "no NOI row printed: footing.noiRow = -1");
  eq(pb2.totals.noi, eb2.noi, "no NOI row printed: NOI derived from the printed totals, NET INCOME still ignored");
  eq(pb2.rows.length, eb2.rows, "no NOI row printed: rows after TOTAL EXPENSES are not detail lines");
  eq(pb2.belowLine.length, 6, "no NOI row printed: the 6 below-the-line rows are reported in belowLine");
  eq(pb2.belowLine.filter(function(r){ return r.name === "TOTAL MORTGAGE"; })[0].amount, eb2.totalMortgage, "belowLine carries TOTAL MORTGAGE");
  eq(pb2.belowLine[pb2.belowLine.length - 1].amount, eb2.netIncome, "belowLine carries NET INCOME");
  eq(pb2.categories.length, eb2.categories.length, "no NOI row printed: no below-the-line categories");
  eq(SB.buildSetup({ parsed: pb2 }).result.inPlace.noi, eb2.noi, "no NOI row printed: in-place NOI ties to income − expenses");
});

run("E1 · trailing T6 / T3 / T1 period columns", function(){
  var P = F.periods(), ep = P.expect;
  var hp = T12.findHeader(P.grid);
  eq(JSON.stringify([hp.cols.total, hp.cols.t6, hp.cols.t3, hp.cols.t1]), JSON.stringify([13, 14, 15, 16]), "Total / T6 / T3 / T1 columns auto-found");
  eq(JSON.stringify(T12.parseGrid(P.grid).periodsAvailable), '["total","t6","t3","t1"]', "periodsAvailable");
  [["total", 13, { income: ep.income, expense: ep.expense, noi: ep.noi }], ["t6", 14, ep.t6], ["t3", 15, ep.t3], ["t1", 16, ep.t1]].forEach(function(v){
    var q = T12.parseGrid(P.grid, { basis: v[0] });
    eq(q.amountCol, v[1], "basis " + v[0] + ": amount column");
    eq(q.basisUsed, v[0], "basis " + v[0] + ": basisUsed");
    eq(q.totals.income, v[2].income, "basis " + v[0] + ": TOTAL INCOME");
    eq(q.totals.expense, v[2].expense, "basis " + v[0] + ": TOTAL EXPENSES");
    eq(q.totals.noi, v[2].noi, "basis " + v[0] + ": NOI");
    eq(q.rows.length, ep.rows, "basis " + v[0] + ": detail rows");
    eq(SB.buildSetup({ parsed: q }).result.inPlace.noi, v[2].noi, "basis " + v[0] + ": in-place NOI ties");
  });
  var rr = function(q){ return q.rows.filter(function(r){ return r.name === "Residential Rent"; })[0].amount; };
  eq(rr(T12.parseGrid(P.grid, { basis: "t6" })), 601728.42, "Residential Rent T6 = 1,203,456.78 − 6 × 100,288.06");
  eq(rr(T12.parseGrid(P.grid, { basis: "t3" })), 300864.24, "Residential Rent T3 = 1,203,456.78 − 9 × 100,288.06");
  eq(rr(T12.parseGrid(P.grid, { basis: "t1" })), 100288.12, "Residential Rent T1 = month 12 = 1,203,456.78 − 11 × 100,288.06");
  eq(T12.parseGrid(P.grid, { basis: "t12" }).amountCol, 13, "basis t12 without a T12 column → Total column");
  eq(T12.parseGrid(P.grid, { basis: "T3" }).amountCol, 15, "basis is case-insensitive");
  var sum = T12.findHeader([["Account", "T12", "T6", "T3", "T1"], ["Rent", 1, 2, 3, 4]]);
  eq(JSON.stringify([sum.headerRow, sum.cols.total, sum.cols.t12, sum.cols.t6, sum.cols.t3, sum.cols.t1]), JSON.stringify([0, 1, 1, 2, 3, 4]), "period-only header (no month columns): T12 stands in for Total");
  var lab = T12.findHeader([[null, "Jul 2025", "Aug 2025", "Sep 2025", "T-12", "Trailing 6 (ann.)", "Trailing 3 Months", "T1"]]);
  eq(JSON.stringify([lab.cols.total, lab.cols.t12, lab.cols.t6, lab.cols.t3, lab.cols.t1]), JSON.stringify([4, 4, 5, 6, 7]), "period label variants (T-12, Trailing 6 (ann.), Trailing 3 Months)");
});

run("E1 · underwriting-style flat statement (GPR line, EGI total, reserves below the line)", function(){
  // The review path needs a line the CURRENT classifier cannot place (flat statement, no
  // sub-section → bare section fallback, confident:false). Classifier rules broaden over
  // time ("Other Income" became confident), so probe candidates and fail loudly if none is
  // ambiguous any more — the fixture must then get a new candidate, not a silent pass.
  var CANDIDATES = ["Sundry Receipts", "Ledger Suspense", "Unallocated Item", "Frobozz Line Item", "Plugh"];
  var probe = CANDIDATES.map(function(l){ return { label: l, r: CL.classifyConfident(l, "INCOME", "") }; });
  var amb = probe.filter(function(x){ return x.r.code === "OTH" && x.r.confident === false; })[0];
  ok(!!amb, "a candidate label is still low-confidence to the current classifier: " + probe.map(function(x){ return x.label + " → " + JSON.stringify(x.r); }).join(" | ") + (amb ? "" : "  ← none is; add a label the classifier cannot place to CANDIDATES"));
  if (!amb) return;
  var G = F.gprStyle({ ambiguousLabel: amb.label }), pg = T12.parseGrid(G.grid), eg = G.expect;
  eq(CL.classifyConfident(amb.label, "INCOME", "").confident, false, "fixture line " + JSON.stringify(amb.label) + " is low-confidence under the current rules");
  eq(pg.headerRow, eg.headerRow, "'Jul-25' style month header found");
  eq(pg.totals.income, eg.income, "EFFECTIVE GROSS INCOME read as the income total");
  eq(pg.totals.expense, eg.expense, "TOTAL OPERATING EXPENSES read as the expense total");
  eq(pg.totals.noi, eg.noi, "NOI read from the NET OPERATING INCOME row");
  eq(pg.footing.noiRow, eg.footing.noiRow, "NOI row index");
  eq(pg.rows.length, eg.rows, "detail rows (reserves / cash flow after reserves excluded)");
  var gpr = pg.rows.filter(function(r){ return r.name === "Gross Potential Rent"; })[0];
  eq(gpr && gpr.amount, 1512345.60, "'Gross Potential Rent' is a detail line, not a GROSS subtotal");
  eq(JSON.stringify(pg.categories.map(function(c){ return [c.name, c.amount, c.section]; })), JSON.stringify(eg.categories), "NET RENTAL INCOME is a category subtotal");
  ok(pg.rows.every(function(r){ return r.name !== "Replacement Reserves"; }), "reserves below the line never read as expense");
  eq(sumRows(pg.rows, "INCOME"), eg.income, "income rows foot to EGI");
  eq(sumRows(pg.rows, "EXPENSE"), eg.expense, "expense rows foot to total opex");
  var fg = SB.fromParse(pg);
  Object.keys(eg.sums).forEach(function(k){ eq(fg.sums[k], eg.sums[k], "sum " + k); });
  eq(Object.keys(fg.sums).length, Object.keys(eg.sums).length, "no extra category codes");
  eq(fg.reconcile.incomeResidual, 0, "income residual 0");
  eq(fg.reconcile.expenseResidual, 0, "expense residual 0");
  eq(JSON.stringify(fg.review.map(function(x){ return [x.name, x.code]; })), JSON.stringify([[amb.label, "OTH"]]), "low-confidence line " + JSON.stringify(amb.label) + " surfaced in review (only that line)");
  var bg = SB.buildSetup({ parsed: pg, units: 120, benchmarks: {} });
  eq(bg.result.inPlace.noi, eg.noi, "buildSetup: in-place NOI === printed NOI");
  eq(bg.review.length, 1, "buildSetup carries the review list for the parsed path");
  eq(bg.result.underwritten.lines.VAC, -0.05 * 1512345.60, "underwritten vacancy prices off the real GPR (would be 0 if GPR were dropped)");
});

run("E1 · header / footing detection edge cases", function(){
  var two = [["Account", "Total"], ["Rent", 1000], ["Vacancy", -50], ["TOTAL INCOME", 950], ["EXPENSES"], ["Taxes", 100], ["TOTAL EXPENSES", 100], ["NET OPERATING INCOME", 850], ["Debt Service", 400], ["NET INCOME", 450]];
  eq(T12.findHeader(two).headerRow, -1, "strict findHeader (the workbook sheet picker) still needs month/period columns");
  var pt = T12.parseGrid(two);
  eq(JSON.stringify([pt.headerRow, pt.amountCol, pt.descCol]), JSON.stringify([0, 1, 0]), "parseGrid accepts a bare 'label | Total' two-column statement");
  eq(JSON.stringify(pt.totals), JSON.stringify({ income: 950, expense: 100, noi: 850 }), "two-column statement: printed totals");
  eq(pt.rows.length, 3, "two-column statement: 3 detail rows (debt service ignored)");
  var decoy = [[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["Total", 1, 2, 3, 6]];
  eq(T12.findHeader(decoy).headerRow, 0, "a data row named 'Total' is not the header");
  eq(T12.findHeader([["Cash Flow (12 months)"], ["Total", 5]]).headerRow, -1, "metadata / a lone 'Total' cell is not a header");
  var dh = T12.findHeader([["Description", "Marketing", "Jul 2025", "August 2025", "Sep-25", "Total"]]);
  eq(JSON.stringify([dh.headerRow, dh.months]), JSON.stringify([0, [2, 3, 4]]), "'Description' / 'Marketing' header cells are not month columns (3-letter or full month names only)");
  eq(T12.parseGrid(F.twoLabelColumns(C.grid, e.headerRow).map(function(r, i){ return i === e.headerRow ? ["Category", "Description"].concat(r.slice(2)) : r; })).totals.noi, e.noi, "column-A/column-B labels still found with a 'Description' header cell");
  eq(T12.findHeader([["Statement"], ["Account", "Total", "%"], ["Rent", 100, 0.5]], { loose: true }).headerRow, 1, "loose header opt-in");
  var noiFirst = [[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["TOTAL INCOME", 0, 0, 0, 500], ["TOTAL EXPENSES", 0, 0, 0, 200], ["NET OPERATING INCOME", 0, 0, 0, 300], ["Rent", 0, 0, 0, 999]];
  eq(T12.parseGrid(noiFirst).rows.length, 0, "nothing after the NOI row is read, even detail-looking lines");
  var expFirst = T12.parseGrid([[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["Rent", 0, 0, 0, 100], ["TOTAL REVENUES", 0, 0, 0, 100], ["Taxes", 0, 0, 0, 30], ["TOTAL OPEX", 0, 0, 0, 30], ["NET OPERATING INCOME (NOI)", 0, 0, 0, 70]]);
  eq(JSON.stringify(expFirst.totals), JSON.stringify({ income: 100, expense: 30, noi: 70 }), "TOTAL REVENUES / TOTAL OPEX / NET OPERATING INCOME (NOI) footing labels");
  var defv = [[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["INCOME", null, null, null, null], ["Rent", 1, 1, 1, 3], ["TOTAL INCOME", 1, 1, 1, 3], ["EXPENSES", null, null, null, null], ["Tax", 1, 1, 1, 3], ["TOTAL EXPENSES", 1, 1, 1, 3], ["NET OPERATING INCOME", 0, 0, 0, 0]];
  eq(T12.parseGrid(defv).totals.noi, 0, "sheet_to_json({defval:null}) padding: an NOI of 0 is still read (not treated as missing)");
});

run("E1 · malformed / empty / header-less / all-text input never throws", function(){
  F.malformed().forEach(function(m){
    var q = noThrow(function(){ return T12.parseGrid(m.grid); }, "parseGrid(" + m.label + ") does not throw");
    if (q){
      ok(Array.isArray(q.rows) && Array.isArray(q.categories) && q.totals && Array.isArray(q.periodsAvailable), "parseGrid(" + m.label + ") returns the standard shape");
      eq(q.rows.length, 0, "parseGrid(" + m.label + ") yields no detail rows");
      eq(q.totals.noi, null, "parseGrid(" + m.label + ") yields no NOI");
    }
    noThrow(function(){ return T12.findHeader(m.grid); }, "findHeader(" + m.label + ") does not throw");
    noThrow(function(){ return SB.buildSetup({ parsed: q || {} }); }, "buildSetup({parsed}) on that parse does not throw");
  });
  noThrow(function(){ return T12.parseGrid(C.grid, { basis: 5, descCol: "x", amountCol: null }); }, "junk opts do not throw");
  noThrow(function(){ return T12.parseGrid(C.grid, null); }, "null opts do not throw");
  eq(T12.parseGrid([[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["Rent", 1, 1, 1, new Date()]]).rows.length, 0, "a Date in the amount cell is not a number");
  eq(T12.parseGrid([[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["Rent", 1, 1, 1, "n/a"]]).rows.length, 0, "'n/a' in the amount cell is not a number");
  noThrow(function(){ return SB.fromParse(null); }, "fromParse(null) does not throw");
  noThrow(function(){ return SB.fromParse({ rows: [null, {}, { name: "x" }], totals: { income: "abc", noi: NaN } }); }, "fromParse with junk rows / totals does not throw");
  var partial = SB.buildSetup({ parsed: { rows: [], categories: [], totals: { income: 1000.55, expense: 400.25, noi: 600.30 } } });
  eq(partial.result.inPlace.noi, 600.30, "totals-only parse (no detail rows) still ties in-place NOI to the printed figure");
  eq(partial.reconcile.incomeResidual, 1000.55, "…and reports the whole income as residual, not hidden");
  eq(partial.reconcile.expenseResidual, 400.25, "…and the whole expense as residual");
  var gap = SB.buildSetup({ parsed: { rows: [{ name: "Rent", amount: 1000, section: "INCOME" }, { name: "Taxes", amount: 300, section: "EXPENSE" }], totals: { income: 1000, expense: 300, noi: 650 } } });
  eq(gap.result.inPlace.noi, 700, "a printed NOI its own sections don't foot to is NOT snapped (700 built vs 650 printed)");
  eq(gap.reconcile.noiDiff, 50, "…and the 50.00 gap is reported in reconcile.noiDiff");
  eq(gap.reconcile.ties, false, "…with ties = false");
  eq(gap.inPlaceNOIReported, 650, "…while the printed figure is still carried");
});

run("stable exports / other buildSetup paths", function(){
  eq(typeof T12.parseGrid + typeof T12.findHeader, "functionfunction", "T12Parse exports parseGrid, findHeader");
  ["buildSetup", "classifySum", "fromParse", "sizingSummary"].forEach(function(k){ eq(typeof SB[k], "function", "SetupBuilder." + k); });
  eq(JSON.stringify(SB.RENTAL), '["GPR","EMPL","MOD","VAC","CONC","BD"]', "SetupBuilder.RENTAL");
  eq(SB.OTHER.length + SB.EXPENSE.length, 26, "SetupBuilder.OTHER + EXPENSE cover the 26 non-rental codes");
  ok(CODES.every(function(c){ return SB.RENTAL.indexOf(c) >= 0 || SB.OTHER.indexOf(c) >= 0 || SB.EXPENSE.indexOf(c) >= 0; }), "every classifier code lands on a worksheet line (nothing can drop out of the in-place column)");
  eq(SB.LABEL.RET, "Real Estate Taxes", "SetupBuilder.LABEL");
  var cs = SB.buildSetup({ categorySums: { GPR: 1000, VAC: -50, RET: 100.25 }, units: 10, benchmarks: {} });
  eq(cs.result.inPlace.noi, 849.75, "categorySums path: in-place NOI");
  eq(cs.inPlaceNOIReported, null, "categorySums path: no reported NOI");
  eq(cs.reconcile, null, "categorySums path: no reconcile report");
  var tl = SB.buildSetup({ t12Lines: [{ name: "Gross Potential Rent", amount: "1,000.00", section: "INCOME" }, { name: "Mystery line", amount: "(250.00)", section: "INCOME" }, { name: "Taxes", amount: 100, section: "EXPENSE" }] });
  eq(tl.result.inPlace.noi, 650, "t12Lines path: '(250.00)' string amount is negative");
  eq(tl.review.length, 1, "t12Lines path: low-confidence line surfaced");
});

// ---------------------------------------------------------------------------
var CREST = path.join(__dirname, "fixtures", "crest-t12.xlsx");
if (!fs.existsSync(CREST)) {
  console.log("\nCrest fixture (real statement)\n  skipped: fixture missing (" + CREST + ")");
} else run("Crest fixture (real statement) · E1 parse + E3 in-place NOI tie", function(){
  var XLSX = require(path.join(ROOT, "vendor", "xlsx.full.min.js"));
  var wb = XLSX.read(fs.readFileSync(CREST), { type: "buffer" }), ws = wb.Sheets["Report1"];
  var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  var INC = 18323614.31, EXP = 8840010.03, NOI = 9483604.28;
  var hc = T12.findHeader(grid);
  eq(hc.headerRow, 4, "header row 4");
  eq(hc.cols.total, 13, "Total column N (13)");
  eq(hc.months.length, 12, "12 month columns");
  var pc = T12.parseGrid(grid);
  eq(pc.descCol, 0, "description column A");
  eq(pc.amountCol, 13, "amount column = Total");
  eq(JSON.stringify(pc.periodsAvailable), '["total"]', "only the 12-month Total is printed");
  eq(pc.totals.income, INC, "TOTAL INCOME 18,323,614.31");
  eq(pc.totals.expense, EXP, "TOTAL EXPENSES 8,840,010.03");
  eq(pc.totals.noi, NOI, "NET OPERATING INCOME 9,483,604.28");
  eq(pc.footing.incomeRow, 154, "TOTAL INCOME on row 154");
  eq(pc.footing.expenseRow, 670, "TOTAL EXPENSES on row 670");
  eq(pc.footing.noiRow, 672, "NOI read from row 672 (NET OPERATING INCOME), not row 719 (NET INCOME 5,210,718.69)");
  ok(pc.totals.noi !== 5210718.69, "below-the-line NET INCOME ignored");
  eq(sumRows(pc.rows, "INCOME"), INC, "Σ income detail rows = 18,323,614.31 (to the cent)");
  eq(sumRows(pc.rows, "EXPENSE"), EXP, "Σ expense detail rows = 8,840,010.03 (to the cent)");
  ok(pc.rows.every(function(r){ return r.row < 672; }), "every detail row sits above the NOI row");
  eq(pc.rows.filter(function(r){ return /^(Interest|Mortgage Service Fees|Platform Fee|Amortization Expense|Depreciation expense)$/.test(r.name); }).length, 0, "mortgage / depreciation / platform-fee lines never read as expense");
  eq(pc.rows.filter(function(r){ return r.amount === 3988921.61; }).length, 0, "the 3,988,921.61 mortgage interest is not in any row");
  eq(pc.categories.length, 14, "14 printed category subtotals");
  var cat = function(n){ var c = pc.categories.filter(function(x){ return x.name === n; })[0]; return c ? c.amount : null; };
  eq(cat("TOTAL RENTAL INCOME"), 16948753.52, "TOTAL RENTAL INCOME 16,948,753.52");
  eq(cat("TOTAL OTHER INCOME"), 1374860.79, "TOTAL OTHER INCOME 1,374,860.79");
  eq(cat("TOTAL PAYROLL"), 1092532.68, "TOTAL PAYROLL 1,092,532.68");
  eq(cat("TOTAL UTILITIES"), 757274.47, "TOTAL UTILITIES 757,274.47");
  eq(cat("TOTAL TAXES AND INSURANCE"), 4200839.01, "TOTAL TAXES AND INSURANCE 4,200,839.01");
  eq(cat("TOTAL MORTGAGE"), null, "TOTAL MORTGAGE 3,989,171.61 (below the line) is not a category");
  eq(cents(cat("TOTAL RENTAL INCOME") + cat("TOTAL OTHER INCOME")) / 100, INC, "income categories foot to TOTAL INCOME");
  eq(cents(pc.categories.filter(function(c){ return c.section === "EXPENSE"; }).reduce(function(s, c){ return s + c.amount; }, 0)) / 100, EXP, "expense categories foot to TOTAL EXPENSES");
  eq(T12.parseGrid(grid, { basis: "t3" }).basisUsed, "total", "basis t3 requested on a Total-only statement → basisUsed = total");
  var padded = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });    // the shape index.html feeds
  eq(T12.parseGrid(padded).totals.noi, NOI, "defval:null padded grid (index.html's call) → same NOI");
  eq(T12.parseGrid(padded).rows.length, pc.rows.length, "defval:null padded grid → same rows");

  var fc = SB.fromParse(pc);
  eq(fc.reconcile.incomeRaw, INC, "classified income lines foot to the printed TOTAL INCOME");
  eq(fc.reconcile.expenseRaw, EXP, "classified expense lines foot to the printed TOTAL EXPENSES");
  eq(fc.reconcile.incomeResidual, 0, "income residual 0");
  eq(fc.reconcile.expenseResidual, 0, "expense residual 0");
  eq(fc.reconcile.noiDiff, 0, "NOI diff 0");
  ok(Object.keys(fc.sums).every(function(k){ return CODES.indexOf(k) >= 0; }), "every sum is a taxonomy code");
  var role = function(r){ return cents(Object.keys(fc.sums).filter(function(k){ return CL.roleOf(k) === r; }).reduce(function(s, k){ return s + fc.sums[k]; }, 0)) / 100; };
  eq(role("income"), INC, "Σ income-role sums = 18,323,614.31");
  eq(role("expense"), EXP, "Σ expense-role sums = 8,840,010.03");
  ok(Object.keys(fc.sums).every(function(k){ return fc.sums[k] === Math.round(fc.sums[k] * 100) / 100; }), "sums are whole cents (no float dust)");
  var bc = SB.buildSetup({ parsed: pc, units: 0, benchmarks: {} });
  eq(bc.result.inPlace.noi, NOI, "result.inPlace.noi === 9,483,604.28 (strict)");
  eq(bc.result.inPlace.egi, INC, "result.inPlace.egi === 18,323,614.31");
  eq(bc.result.inPlace.opex, EXP, "result.inPlace.opex === 8,840,010.03");
  eq(bc.inPlaceNOIReported, NOI, "inPlaceNOIReported carried");
  eq(bc.result.inPlace.noiReported, NOI, "result.inPlace.noiReported carried");
  eq(bc.reconcile.ties, true, "reconcile.ties");
  var shaped = SB.buildSetup({ parsed: { rows: pc.rows, categories: pc.categories, totals: pc.totals }, units: 500, rrGPR: null, benchmarks: { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200, budget: {}, sizing: {} } });
  eq(shaped.result.inPlace.noi, NOI, "index.html's {rows, categories, totals} call shape → same tie");
  ok(bc.review.length > 0, "low-confidence Crest lines surfaced via the parsed path (" + bc.review.length + ")");
});

console.log("\n" + (fails ? "FAILED " + fails + " of " + total : "all " + total + " passed"));
process.exit(fails ? 1 : 0);
