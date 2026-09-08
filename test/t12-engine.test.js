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
function flatGrid(lines){ var g = [[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"]]; lines.forEach(function(l){ g.push(typeof l === "string" ? [l] : [l[0], 0, 0, 0, l[1]]); }); return g; }
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
  var z = SB.fromParse({ rows: [{ name: amb.label, amount: 0, section: "INCOME" }, { name: amb.label, amount: 5, section: "INCOME" }], totals: {} });
  eq(JSON.stringify(z.review), JSON.stringify([{ name: amb.label, amount: 5, code: "OTH" }]), "a $0 low-confidence line is never review noise; the same caption with an amount is surfaced");
  var bg = SB.buildSetup({ parsed: pg, units: 120, benchmarks: {} });
  eq(bg.result.inPlace.noi, eg.noi, "buildSetup: in-place NOI === printed NOI");
  eq(bg.review.length, 1, "buildSetup carries the review list for the parsed path");
  eq(bg.result.underwritten.lines.VAC, -0.05 * 1512345.60, "underwritten vacancy prices off the real GPR (would be 0 if GPR were dropped)");
});

run("E1 · where the operating detail ends (NOI row, TOTAL EXPENSES, summary blocks)", function(){
  var X = F.noExpenseTotal(), px = T12.parseGrid(X.grid);
  eq(px.totals.expense, null, "no TOTAL EXPENSES row: expense total null");
  eq(px.totals.noi, X.expect.noi, "no TOTAL EXPENSES row: NOI read from its row");
  eq(px.rows.length, X.expect.rows, "no TOTAL EXPENSES row: the NOI row alone ends the detail (Interest after it is not a row)");
  eq(sumRows(px.rows, "EXPENSE"), X.expect.expenseRows, "no TOTAL EXPENSES row: Σ expense rows = 300.00 (Interest 400.00 excluded)");
  eq(px.rows.filter(function(r){ return r.name === "Interest"; }).length, 0, "no TOTAL EXPENSES row: 'Interest' never read");
  eq(px.categories.length, 0, "no TOTAL EXPENSES row: 'NET INCOME' after the NOI is not a category");
  eq(SB.buildSetup({ parsed: px }).result.inPlace.opex, 300, "no TOTAL EXPENSES row: in-place opex 300.00 (no printed total to plug; Interest never inside)");
  var D = F.noDividers(), pd = T12.parseGrid(D.grid);
  eq(pd.totals.income, null, "no TOTAL INCOME / no EXPENSES caption: income total null");
  eq(pd.totals.expense, D.expect.expense, "…TOTAL EXPENSES read");
  eq(pd.totals.noi, D.expect.noi, "…NOI read");
  eq(pd.rows.length, D.expect.rows, "…TOTAL EXPENSES ends the operating detail from any phase: 'Interest' after it is not a row");
  eq(pd.belowLine.length ? pd.belowLine[0].name : null, "Interest", "…'Interest' reported in belowLine");
  [true, false].forEach(function(withNoi){
    var Sm = F.summaryFirst({ noiInSummary: withNoi }), ps = T12.parseGrid(Sm.grid), es = Sm.expect, tag = "summary block above the detail (" + (withNoi ? "with" : "without") + " NOI): ";
    eq(ps.totals.income, es.income, tag + "TOTAL INCOME");
    eq(ps.totals.expense, es.expense, tag + "TOTAL EXPENSES");
    eq(ps.totals.noi, es.noi, tag + "NOI");
    eq(JSON.stringify(ps.footing), JSON.stringify(es.detailFooting), tag + "footing rows = the detail's own footing (authoritative), not the summary's");
    eq(JSON.stringify(ps.summaryTotals), JSON.stringify(es.summaryTotals), tag + "summaryTotals exposed");
    eq(ps.summaryMismatch, false, tag + "summary agrees with the detail → no mismatch");
    eq(ps.rows.length, es.rows, tag + "detail rows still read");
    eq(ps.categories.length, es.categories.length, tag + "category subtotals still read");
    eq(sumRows(ps.rows, "INCOME"), es.income, tag + "income rows foot");
    eq(sumRows(ps.rows, "EXPENSE"), es.expense, tag + "expense rows foot (split intact)");
    eq(ps.belowLine.length, 0, tag + "nothing below the line");
    var bs = SB.buildSetup({ parsed: ps });
    eq(bs.result.inPlace.noi, es.noi, tag + "in-place NOI ties");
    eq(bs.reconcile.incomeResidual, 0, tag + "no income plug");
    eq(bs.reconcile.expenseResidual, 0, tag + "no expense plug");
    eq(bs.reconcile.summaryMismatch, false, tag + "reconcile.summaryMismatch false");
    eq(bs.reconcile.ties, true, tag + "reconcile.ties (the detail genuinely foots)");
  });

  // T3 — a summary that DISAGREES with the detail footing: the detail wins, no silent plug, mismatch flagged
  var D3 = F.summaryDisagree(), p3 = T12.parseGrid(D3.grid), e3 = D3.expect;
  eq(JSON.stringify(p3.totals), JSON.stringify({ income: e3.income, expense: e3.expense, noi: e3.noi }), "T3: totals are the DETAIL footing 1,000 / 300 / 700 (not the summary's 1,100 / 300 / 800)");
  eq(JSON.stringify(p3.summaryTotals), JSON.stringify(e3.summaryTotals), "T3: the summary's 1,100 / 300 / 800 is exposed, not discarded");
  eq(p3.summaryMismatch, true, "T3: summaryMismatch flagged");
  ok(p3.warnings.length >= 1, "T3: a warning string is carried (" + JSON.stringify(p3.warnings[0]) + ")");
  eq(p3.rows.length, e3.rows, "T3: 2 detail rows");
  eq(sumRows(p3.rows, "INCOME"), e3.incomeRows, "T3: income rows foot to 1,000");
  var f3 = SB.fromParse(p3);
  eq(f3.reconcile.incomeResidual, 0, "T3: NO silent +100 OTH plug (detail foots to its own 1,000 total)");
  eq(f3.sums.OTH, undefined, "T3: OTH is not invented");
  eq(f3.reconcile.summaryMismatch, true, "T3: reconcile.summaryMismatch true");
  eq(f3.reconcile.ties, false, "T3: reconcile.ties is FALSE — the operator is not told the statement ties while the summary disagrees");
  eq(JSON.stringify(f3.reconcile.summaryTotals), JSON.stringify(e3.summaryTotals), "T3: reconcile carries the summary totals for the upload to surface");
  eq(SB.buildSetup({ parsed: p3 }).result.inPlace.noi, 700, "T3: in-place NOI is the footed 700, not the summary's 800");

  // T4 — a summary tree with a CATEGORY subtotal: twin rule still fires, split survives, category deduped
  var D4 = F.summaryCategories(), p4 = T12.parseGrid(D4.grid), e4 = D4.expect;
  eq(JSON.stringify(p4.totals), JSON.stringify({ income: e4.income, expense: e4.expense, noi: e4.noi }), "T4: totals 1,000 / 300 / 700");
  eq(p4.rows.length, e4.rows, "T4: the detail split survives — 2 rows (not [])");
  eq(JSON.stringify(p4.categories.map(function(c){ return [c.name, c.amount, c.section]; })), JSON.stringify(e4.categories), "T4: TOTAL RENTAL INCOME appears once (summary/detail twin deduped by name)");
  var f4 = SB.fromParse(p4);
  eq(f4.sums.GPR, e4.sums.GPR, "T4: GPR 1,000 (not folded to OTH — UW vacancy would price off 0 if the split were lost)");
  eq(f4.sums.RET, e4.sums.RET, "T4: RET 300");
  eq(f4.sums.OTH, undefined, "T4: nothing dumped into OTH");
  eq(f4.reconcile.incomeResidual, 0, "T4: income foots, no plug");
  eq(SB.buildSetup({ parsed: p4, units: 10, benchmarks: { vacancyPct: 0.05 } }).result.underwritten.lines.VAC, -50, "T4: UW vacancy = −5% × 1,000 GPR (0 if the split were lost)");

  // T7 — partial twin: a detail with TOTAL INCOME + NOI but no TOTAL EXPENSES keeps its split
  var D7 = F.summaryPartialTwin(), p7 = T12.parseGrid(D7.grid), e7 = D7.expect;
  eq(JSON.stringify(p7.totals), JSON.stringify({ income: e7.income, expense: e7.expense, noi: e7.noi }), "T7: totals 1,000 / 300 (from the summary fallback) / 700");
  eq(p7.rows.length, e7.rows, "T7: 2 detail rows — the un-twinned summary TOTAL EXPENSES did NOT push the detail into belowLine");
  eq(p7.belowLine.length, e7.belowLine, "T7: nothing in belowLine");
  eq(sumRows(p7.rows, "EXPENSE"), e7.expenseRows, "T7: the Taxes row is read as an EXPENSE (split intact)");
  eq(p7.summaryMismatch, false, "T7: summary agrees where it twins → no mismatch");
  eq(SB.buildSetup({ parsed: p7 }).result.inPlace.noi, 700, "T7: in-place NOI ties");

  // T9 — $0 stub rows above the summary block don't defeat detection
  var D9 = F.summaryStubs(), p9 = T12.parseGrid(D9.grid), e9 = D9.expect;
  eq(JSON.stringify(p9.totals), JSON.stringify({ income: e9.income, expense: e9.expense, noi: e9.noi }), "T9: totals 1,000 / 300 / 700 (the two $0 stubs above the summary did not block it)");
  eq(p9.rows.length, e9.rows, "T9: 4 rows (2 zero stubs + Rent + Taxes)");
  eq(sumRows(p9.rows, "INCOME"), e9.incomeRows, "T9: income rows (stubs are 0) foot to 1,000");
  eq(sumRows(p9.rows, "EXPENSE"), e9.expenseRows, "T9: expense rows foot to 300");

  // T6 — a KPI NOI on top with no NOI row below: parses fully, footed NOI authoritative.
  // T6a: the KPI AGREES with the derived footing (700) → no mismatch.
  var D6 = F.kpiNoiTop(700), p6 = T12.parseGrid(D6.grid), e6 = D6.expect;
  eq(JSON.stringify(p6.totals), JSON.stringify({ income: e6.income, expense: e6.expense, noi: e6.noi }), "T6a: totals 1,000 / 300 / 700 (NOI derived from the footing)");
  eq(p6.summaryTotals.noi, 700, "T6a: the KPI 700 is recorded in summaryTotals.noi");
  eq(p6.footing.noiRow, e6.noiRow, "T6a: no authoritative NOI row (derived) → footing.noiRow -1");
  eq(p6.rows.length, e6.rows, "T6a: the whole statement is read (2 rows), not broken at row 1");
  eq(p6.summaryMismatch, false, "T6a: KPI 700 == derived 700 → NO mismatch");
  eq(p6.warnings.length, 0, "T6a: no warning");
  eq(SB.buildSetup({ parsed: p6 }).result.inPlace.noi, 700, "T6a: in-place NOI 700");
  // T6b: the KPI DISAGREES with the derived footing (900 vs 700) → mismatch, even with no detail NOI row.
  var D6b = F.kpiNoiTop(900), p6b = T12.parseGrid(D6b.grid);
  eq(p6b.totals.noi, 700, "T6b: NOI is the derived footing 700, not the KPI 900");
  eq(p6b.summaryTotals.noi, 900, "T6b: the KPI 900 is exposed in summaryTotals.noi");
  eq(p6b.summaryMismatch, true, "T6b: summaryMismatch true — a KPI NOI disagreeing with the DERIVED footing is caught");
  ok(p6b.warnings.length >= 1, "T6b: a warning is carried (" + JSON.stringify(p6b.warnings[0]) + ")");
  eq(p6b.footing.noiRow, -1, "T6b: still no authoritative NOI row");
  eq(SB.fromParse(p6b).reconcile.summaryMismatch, true, "T6b: reconcile.summaryMismatch true");
  eq(SB.fromParse(p6b).reconcile.ties, false, "T6b: reconcile.ties false — the operator is not told it ties");
});

run("E1 · mixed-case 'Gross <roll-up>' rows are subtotals (item 3)", function(){
  ["Gross Income", "Gross Revenue", "Gross Operating Income"].forEach(function(l){
    var G = F.titleGross(l), q = T12.parseGrid(G.grid), ex = G.expect, L = JSON.stringify(l);
    eq(q.rows.filter(function(r){ return r.name === l; }).length, 0, L + " (title-case roll-up) is NOT a detail row");
    eq(q.rows.length, ex.rows, L + ": 4 detail rows (Gross Rent, Less: Vacancy, Other Income, Taxes) — the roll-up excluded");
    eq(sumRows(q.rows, "INCOME"), ex.income, L + ": income rows foot to 960 (no double count)");
    eq(q.totals.income, ex.income, L + ": TOTAL INCOME 960");
    eq(q.totals.noi, ex.noi, L + ": NOI 860");
    var fq = SB.fromParse(q);
    eq(fq.reconcile.incomeResidual, ex.incomeResidual, L + ": incomeResidual 0 (no plug masking a double count)");
    eq(fq.sums.GPR, ex.gpr, L + ": Gross Rent still classified GPR 1,000");
    ok(!fq.review.some(function(x){ return x.name === l; }), L + " is not surfaced in review");
  });
  // "Gross Rent" stays a DETAIL line (guarded by the ALL-CAPS/roll-up split)
  var gr = T12.parseGrid(F.titleGross("GROSS INCOME").grid).rows.filter(function(r){ return r.name === "Gross Rent"; })[0];
  eq(gr && gr.amount, 1000, "'Gross Rent' remains a detail row alongside an ALL-CAPS GROSS INCOME subtotal");
});

run("E1 · mixed-case 'Gross …' captions are detail lines; ALL-CAPS 'GROSS …' is a subtotal", function(){
  ["Gross Rent", "Gross Rental Income", "Gross Rents"].forEach(function(l){
    var Gr = F.grossRent(l), q = T12.parseGrid(Gr.grid), ex = Gr.expect, L = JSON.stringify(l);
    var row = q.rows.filter(function(r){ return r.name === l; })[0];
    eq(row && row.amount, ex.gpr, L + " is a detail row with its amount");
    eq(q.rows.length, ex.rows, L + ": detail rows");
    eq(JSON.stringify(q.categories.map(function(c){ return [c.name, c.amount, c.section]; })), JSON.stringify(ex.categories), L + ": ALL-CAPS GROSS INCOME is still a category subtotal, not a row");
    var fq = SB.fromParse(q);
    eq(fq.sums.GPR, ex.gpr, L + ": classified to GPR");
    eq(fq.reconcile.incomeResidual, 0, L + ": no income plug");
    var bq = SB.buildSetup({ parsed: q, units: 10, benchmarks: { vacancyPct: 0.05 } });
    eq(bq.result.underwritten.lines.VAC, -50, L + ": underwritten vacancy = −5% × 1,000.00 GPR (would be 0 if the row were dropped)");
    eq(bq.result.inPlace.noi, ex.noi, L + ": in-place NOI ties");
  });
});

run("E3 · printed totals the detail lines do not foot to: the residual plugs", function(){
  var U = F.unfooted(), pu = T12.parseGrid(U.grid);
  eq(pu.totals.income, 1183830.08, "printed TOTAL INCOME = detail 1,182,595.52 + 1,234.56");
  eq(pu.totals.expense, 512096.63, "printed TOTAL EXPENSES = detail 511,307.62 + 789.01");
  eq(pu.totals.noi, 671733.45, "printed NOI 671,733.45");
  eq(sumRows(pu.rows, "INCOME"), 1182595.52, "detail income rows still sum to 1,182,595.52");
  eq(sumRows(pu.rows, "EXPENSE"), 511307.62, "detail expense rows still sum to 511,307.62");
  var fu = SB.fromParse(pu);
  eq(fu.reconcile.incomeResidual, 1234.56, "income plug 1,234.56 reported");
  eq(fu.reconcile.expenseResidual, 789.01, "expense plug 789.01 reported");
  eq(fu.sums.OTH, 2549.81, "OTH = 1,315.25 + 1,234.56 plug");
  eq(fu.sums.GA, 5814.76, "GA = 5,025.75 + 789.01 plug");
  eq(fu.sums.GPR, 1203456.78, "other codes untouched (GPR)");
  eq(fu.sums.RET, 150250.00, "other codes untouched (RET)");
  var role = function(r){ return cents(Object.keys(fu.sums).filter(function(k){ return CL.roleOf(k) === r; }).reduce(function(s, k){ return s + fu.sums[k]; }, 0)) / 100; };
  eq(role("income"), 1183830.08, "Σ income-role sums = printed TOTAL INCOME");
  eq(role("expense"), 512096.63, "Σ expense-role sums = printed TOTAL EXPENSES");
  var bu = SB.buildSetup({ parsed: pu });
  eq(bu.result.inPlace.noi, 671733.45, "in-place NOI === printed NOI");
  eq(bu.result.inPlace.egi, 1183830.08, "in-place EGI === printed TOTAL INCOME");
  eq(bu.result.inPlace.opex, 512096.63, "in-place opex === printed TOTAL EXPENSES");
  eq(bu.reconcile.ties, true, "ties");
  var U2 = F.unfooted({ incExtra: -500.00, expExtra: -0.01 }), pu2 = T12.parseGrid(U2.grid), fu2 = SB.fromParse(pu2);
  eq(pu2.totals.income, 1182095.52, "negative plug: printed TOTAL INCOME 1,182,095.52");
  eq(fu2.reconcile.incomeResidual, -500, "negative income plug −500.00 reported");
  eq(fu2.reconcile.expenseResidual, -0.01, "one-cent expense plug −0.01 reported");
  eq(fu2.sums.OTH, 815.25, "OTH = 1,315.25 − 500.00");
  eq(fu2.sums.GA, 5025.74, "GA = 5,025.75 − 0.01");
  eq(SB.buildSetup({ parsed: pu2 }).result.inPlace.noi, 670787.91, "in-place NOI === printed 670,787.91");
});

run("E3 · expense-side bad debt rides its own pass-through line (a G&A budget never absorbs it)", function(){
  // Rent 1,000 · Taxes 100 · Office Supplies 20 (G&A) · Bad Debt Expense 40 − Recoveries 10 = 30 · TOTAL EXPENSES 150 · NOI 850
  var g = [[null].concat(F.MONTHS, ["Total"])], L = function (l, t){ g.push([l].concat([0,0,0,0,0,0,0,0,0,0,0,0], [t])); };
  L("Rent", 1000); L("TOTAL INCOME", 1000); g.push(["EXPENSES"]); L("Taxes", 100); L("Office Supplies", 20); L("Bad Debt Expense", 40); L("Bad Debt Recoveries", -10); L("TOTAL EXPENSES", 150); L("NET OPERATING INCOME", 850);
  var q = T12.parseGrid(g), fq = SB.fromParse(q);
  eq(JSON.stringify([CL.classify("Bad Debt Expense", "EXPENSE", ""), CL.classify("Bad Debt Recoveries", "EXPENSE", "")]), '["BDX","BDX"]', "both lines classify BDX (the expense-side bad-debt code)");
  eq(CL.roleOf("BDX"), "expense", "BDX is an expense-role code");
  eq(fq.expenseBadDebt, 30, "fromParse reports expense-side bad debt 30.00 (40.00 − 10.00)");
  eq(fq.sums.BDX, 30, "sums.BDX = 30.00 is the source of truth (the store's own code)");
  eq(fq.sums.GA, 20, "…G&A carries only its own 20.00 (nothing folded in)");
  eq(SB.fromParse({ rows: [{ name: "x", amount: 7, section: "EXPENSE" }].map(function(r){ return r; }), totals: {} }).sums.BDX, undefined, "a non-bad-debt expense line does not create BDX");
  // The classifier gives an expense-section bad-debt line the expense-role code BDX directly,
  // so setup-builder needs no BD→BDX fold (the dead branch was removed): pin that end to end.
  eq(CL.classify("Bad Debt", "EXPENSE", "RENTAL INCOME"), "BDX", "an expense-section bad-debt line classifies BDX directly (no BD-fold branch needed in setup-builder)");
  var routed = SB.fromParse({ rows: [{ name: "Bad Debt", amount: 12, section: "EXPENSE", sub: "RENTAL INCOME" }], totals: {} });
  eq(routed.sums.BDX, 12, "…and lands in sums.BDX (its expense-side home)");
  eq(routed.sums.GA, undefined, "…never folded into G&A");
  eq(fq.sums.BD, undefined, "no income-side BD is invented");
  eq(fq.reconcile.expenseResidual, 0, "expense section still foots to the printed 150.00");
  var b0 = SB.buildSetup({ parsed: q, units: 10, benchmarks: { reservePerUnit: 0 } });
  var find = function (b, k){ return b.worksheet.lines.filter(function(x){ return x.key === k; })[0]; };
  eq(find(b0, "BDX") && find(b0, "BDX").t12, 30, "worksheet: a BDX pass-through line with in-place 30.00");
  eq(find(b0, "BDX").label, "Bad Debt Expense", "worksheet: BDX caption");
  eq(find(b0, "BDX").method, "value", "worksheet: BDX is a value (pass-through) line");
  eq(find(b0, "GA").t12, 20, "worksheet: the G&A line carries only its own 20.00");
  eq(b0.result.inPlace.opex, 150, "in-place opex = the printed 150.00");
  eq(b0.result.underwritten.lines.BDX, 30, "no budget: BDX underwritten = its in-place 30.00 (pass-through)");
  eq(b0.result.inPlace.noi, 850, "in-place NOI === printed 850.00");
  eq(b0.result.underwritten.noi, 776.25, "no budget: underwritten NOI 950 − (100 + 20 + 30 + 23.75) = 776.25");
  eq(b0.expenseBadDebt, 30, "buildSetup reports expenseBadDebt");
  // vacancy 5% → EGI 950 · mgmt 2.5% = 23.75 · taxes 100 · G&A budget 5 × 10 = 50 (replaces the 20) · bad debt 30 → opex 203.75 · NOI 746.25 (reserves 0)
  var b1 = SB.buildSetup({ parsed: q, units: 10, benchmarks: { budget: { GA: 5 }, reservePerUnit: 0 } });
  eq(b1.result.underwritten.lines.GA, 50, "G&A budgeted at 5.00/unit × 10 = 50.00");
  eq(b1.result.underwritten.lines.BDX, 30, "…and the 30.00 bad debt still passes through");
  eq(b1.result.underwritten.opex, 203.75, "underwritten opex 100 + 50 + 30 + 23.75 = 203.75");
  eq(b1.result.underwritten.noi, 746.25, "underwritten NOI 950 − 203.75 = 746.25 (776.25 if the budget had swallowed the bad debt)");
  // the store path: OperatingCalc.derive → buildSetup({ categorySums }) must carry BDX the same way
  var st = SB.buildSetup({ categorySums: { GPR: 1000, RET: 100, GA: 20, BDX: 30 }, units: 10, benchmarks: { budget: { GA: 5 }, reservePerUnit: 0 } });
  eq(find(st, "BDX") && find(st, "BDX").t12, 30, "categorySums path: BDX worksheet line 30.00");
  eq(st.result.inPlace.noi, 850, "categorySums path: in-place NOI 850.00");
  eq(st.result.underwritten.lines.BDX, 30, "categorySums path: BDX passes through the G&A budget");
  eq(st.result.underwritten.noi, 746.25, "categorySums path: underwritten NOI 746.25 (same as the parsed path)");
  eq(st.expenseBadDebt, 30, "categorySums path: expenseBadDebt reported from sums.BDX");
  var none = SB.buildSetup({ parsed: T12.parseGrid(F.clean().grid), units: 10, benchmarks: {} });
  eq(find(none, "BDX"), undefined, "no BDX line when the statement has no expense-side bad debt");
  eq(none.expenseBadDebt, 0, "…and expenseBadDebt = 0");
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
  eq(T12.findHeader([["Total", "Jan 2025", "Feb 2025", "Mar 2025"]]).headerRow, -1, "a 'Total' caption in column 0 (the row-label header) is not the totals column → not accepted as a header");
  eq(T12.findHeader([[null, "Jan 2025", "Feb 2025", "Mar 2025", "Total"]]).cols.total, 4, "…but a 'Total' caption to the RIGHT of the months is the totals column");
  // twinBelow must require the twin to carry an AMOUNT: here the first TOTAL INCOME sits before
  // any detail row, and the only other 'TOTAL INCOME' below is amount-less (a section header).
  // If the amount check were dropped, that header would be mistaken for a twin and the first
  // TOTAL INCOME would be read as a summary (summaryTotals populated) — so pin summaryTotals null.
  var noAmtTwin = T12.parseGrid(flatGrid([["TOTAL INCOME", 1000], "TOTAL INCOME", ["TOTAL EXPENSES", 300], ["NET OPERATING INCOME", 700]]));
  eq(noAmtTwin.totals.income, 1000, "amount-less twin: the first TOTAL INCOME is the statement's own footing (1,000)");
  eq(noAmtTwin.summaryTotals, null, "amount-less 'TOTAL INCOME' header is NOT a summary twin → summaryTotals null (dies if twinBelow drops its amount check)");
  var dh = T12.findHeader([["Description", "Marketing", "Jul 2025", "August 2025", "Sep-25", "Total"]]);
  eq(JSON.stringify([dh.headerRow, dh.months]), JSON.stringify([0, [2, 3, 4]]), "'Description' / 'Marketing' header cells are not month columns (3-letter or full month names only)");
  eq(T12.parseGrid(F.twoLabelColumns(C.grid, e.headerRow).map(function(r, i){ return i === e.headerRow ? ["Category", "Description"].concat(r.slice(2)) : r; })).totals.noi, e.noi, "column-A/column-B labels still found with a 'Description' header cell");
  eq(T12.findHeader([["Statement"], ["Account", "Total", "%"], ["Rent", 100, 0.5]], { loose: true }).headerRow, 1, "loose header opt-in");
  eq(T12.findHeader([["Total", 1, 2, 3], ["Rent", 4, 5, 6]]).headerRow, -1, "a data row ['Total', 1, 2, 3] is not a header (a month-number run needs 'Total' as a column caption)");
  eq(T12.findHeader([["Total", 45839, 45870, 45900]]).headerRow, -1, "…nor is ['Total', <three serial dates>]");
  eq(T12.findHeader([[null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "Total"], ["Rent", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12]]).headerRow, 0, "a header of month numbers 1..12 + Total is accepted");
  eq(T12.findHeader([[null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "Total", 99]]).headerRow, -1, "…but not with a stray number in the row");
  var cur = T12.parseGrid([[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["Rent", 0, 0, 0, "$ 2,000.00"], ["Refund", 0, 0, 0, "$ (1,234.56)"], ["Zero", 0, 0, 0, "$ -"], ["TOTAL INCOME", 0, 0, 0, "$765.44"]]);
  eq(JSON.stringify(cur.rows.map(function(r){ return r.amount; })), JSON.stringify([2000, -1234.56, 0]), "currency-prefixed text: '$ (1,234.56)' is negative, '$ -' is zero");
  eq(cur.totals.income, 765.44, "currency-prefixed footing text");
  var noiFirst = [[null, "Jul 2025", "Aug 2025", "Sep 2025", "Total"], ["TOTAL INCOME", 0, 0, 0, 500], ["TOTAL EXPENSES", 0, 0, 0, 200], ["NET OPERATING INCOME", 0, 0, 0, 300], ["Rent", 0, 0, 0, 999]];
  eq(T12.parseGrid(noiFirst).rows.length, 0, "a footing block with no twin further down is the statement's own footing: nothing after its NOI row is read");
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
  var cent = SB.buildSetup({ parsed: { rows: [{ name: "Rent", amount: 1000, section: "INCOME" }, { name: "Taxes", amount: 300, section: "EXPENSE" }], totals: { income: 1000, expense: 300, noi: 700.01 } } });
  eq(cent.result.inPlace.noi, 700, "a ONE-CENT real gap (printed 700.01, built 700.00) is not snapped: in-place NOI stays the built 700.00");
  eq(cent.reconcile.noiDiff, -0.01, "…and reconcile.noiDiff = −0.01");
  eq(cent.reconcile.ties, false, "…ties = false");
  eq(cent.inPlaceNOIReported, 700.01, "…the printed 700.01 is still carried");
  var dust = SB.buildSetup({ parsed: { rows: [{ name: "Rent", amount: 0.1, section: "INCOME" }, { name: "Late Fees", amount: 0.2, section: "INCOME" }], totals: { income: 0.3, expense: 0, noi: 0.31 } } });
  eq(dust.result.inPlace.noi, 0.3, "float dust is cleaned even on a real gap: 0.1 + 0.2 vs printed 0.31 → in-place NOI is exactly 0.30, not 0.30000000000000004");
  eq(dust.result.inPlace.egi, 0.3, "…in-place EGI rounded to cents too");
  eq(dust.reconcile.noiDiff, -0.01, "…and the 1-cent gap is still reported");
  eq(dust.reconcile.incomeResidual, 0, "…with no income plug (0.30 detail = 0.30 printed)");
});

run("stable exports / other buildSetup paths", function(){
  eq(typeof T12.parseGrid + typeof T12.findHeader, "functionfunction", "T12Parse exports parseGrid, findHeader");
  ["buildSetup", "classifySum", "fromParse", "sizingSummary"].forEach(function(k){ eq(typeof SB[k], "function", "SetupBuilder." + k); });
  eq(JSON.stringify(SB.RENTAL), '["GPR","EMPL","MOD","VAC","CONC","BD"]', "SetupBuilder.RENTAL");
  eq(SB.OTHER.length + SB.EXPENSE.length, 27, "SetupBuilder.OTHER + EXPENSE cover the 27 non-rental codes (BDX included)");
  eq(SB.EXPENSE.indexOf("BDX"), SB.EXPENSE.indexOf("GA") + 1, "EXPENSE: BDX sits right after GA (as in the taxonomy ORDER)");
  eq(SB.LABEL.BDX, "Bad Debt Expense", "LABEL.BDX");
  ok(CODES.every(function(c){ return SB.RENTAL.indexOf(c) >= 0 || SB.OTHER.indexOf(c) >= 0 || SB.EXPENSE.indexOf(c) >= 0; }), "every classifier code lands on a worksheet line (nothing can drop out of the in-place column)");
  eq(SB.LABEL.RET, "Real Estate Taxes", "SetupBuilder.LABEL");
  eq(SB.LABEL["TRSH COL"], "Trash Collection Income", "LABEL: TRSH COL has its own caption");
  eq(SB.LABEL["TRSH RUB"], "Trash Reimbursements", "LABEL: TRSH RUB caption unchanged");
  var caps = Object.keys(SB.LABEL).map(function(k){ return SB.LABEL[k]; });
  eq(caps.filter(function(c, i){ return caps.indexOf(c) !== i; }).join(","), "", "LABEL: no two codes share a caption");
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
  eq(fc.sums.BDX, 388184.69, "sums.BDX 388,184.69 (rows 575/576: 415,390.18 − 27,205.49)");
  eq(fc.sums.GA, 554599.61, "sums.GA 554,599.61 — no bad debt folded into G&A");
  eq(bc.expenseBadDebt, 388184.69, "expenseBadDebt reported from sums.BDX");
  var gaLine = bc.worksheet.lines.filter(function(x){ return x.key === "GA"; })[0], bdxLine = bc.worksheet.lines.filter(function(x){ return x.key === "BDX"; })[0];
  eq(bdxLine && bdxLine.t12, 388184.69, "worksheet: BDX pass-through line 388,184.69");
  eq(gaLine.t12, 554599.61, "worksheet: G&A line 554,599.61 (= sums.GA)");
  eq(cents(gaLine.t12 + bdxLine.t12) / 100, 942784.30, "worksheet: G&A + BDX = 942,784.30 (the pre-BDX G&A figure)");
  eq(bdxLine.label + "|" + bdxLine.method, "Bad Debt Expense|value", "worksheet: BDX caption and pass-through method");
  eq(cents(bc.result.underwritten.noi) / 100, 9770923.03, "underwritten NOI at units 0 / no budget = 9,770,923.03 to the cent (a pass-through line does not move it; the % math leaves sub-cent dust)");
  var bud = SB.buildSetup({ parsed: pc, units: 500, benchmarks: { budget: { GA: 1000 } } });
  eq(bud.result.underwritten.lines.GA, 500000, "with a G&A budget of 1,000/unit × 500: underwritten G&A 500,000.00");
  eq(bud.result.underwritten.lines.BDX, 388184.69, "…the 388,184.69 bad debt still passes through instead of vanishing");
  eq(cents(bud.result.underwritten.opex) / 100, cents(bc.result.underwritten.opex - gaLine.t12 + 500000) / 100, "…underwritten opex = no-budget opex − G&A' + 500,000.00");
  eq(bud.result.inPlace.noi, NOI, "…in-place NOI still 9,483,604.28");
  var shaped = SB.buildSetup({ parsed: { rows: pc.rows, categories: pc.categories, totals: pc.totals }, units: 500, rrGPR: null, benchmarks: { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200, budget: {}, sizing: {} } });
  eq(shaped.result.inPlace.noi, NOI, "index.html's {rows, categories, totals} call shape → same tie");
  var zeroStubs = pc.rows.filter(function(r){ return r.amount === 0 && !CL.classifyConfident(r.name, r.section, r.sub).confident; });
  ok(zeroStubs.length >= 1, "Crest carries $0 low-confidence stubs above INCOME (" + zeroStubs.map(function(r){ return r.name; }).join(", ") + ")");
  eq(bc.review.filter(function(x){ return x.amount === 0; }).length, 0, "…none of them is review noise");
  eq(JSON.stringify(bc.review), "[]", "review on Crest is exactly [] under the current classifier (a new entry here is a classifier change, not a parser one)");
});

console.log("\n" + (fails ? "FAILED " + fails + " of " + total : "all " + total + " passed"));
process.exit(fails ? 1 : 0);
