/* Unit tests for t12-read.js (2.9.16): the T12 reading the operator's way — read from Excel row 1, every row
   gets a role, each category is a box, and the checks: account Total = its months, category total = its
   accounts, a total of totals = its categories, income/expense totals, income − expenses = the printed NOI.
   Your changes (overrides) are re-checked; the AI's answer is compared at every level.
   The statements are SYNTHETIC (test/fixtures/t12-subtotal-grid.js and small grids built here).
   Run: node test/t12-read.test.js */
var R = require("../t12-read.js"), SB = require("../setup-builder.js"), G = require("./fixtures/t12-subtotal-grid.js");
var XLSX = require("../vendor/xlsx.full.min.js");
var fails = 0, passes = 0;
function ok(c, m){ if (c){ passes++; console.log("  ok   " + m); } else { fails++; console.log("  FAIL " + m); } }
function near(a, b, m){ ok(a != null && Math.abs(a - b) < 0.01, m + "  [got " + a + ", want " + b + "]"); }
function clone(g){ return JSON.parse(JSON.stringify(g)); }
// the grid as Excel holds it: two empty rows above the statement, so Excel row = grid row + 1 only when read from A1
function viaExcel(grid){ var ws = XLSX.utils.aoa_to_sheet([[], []].concat(grid)); ws["!ref"] = ws["!ref"]; var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "T12");
  var back = XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" }); return R.gridFromSheet(XLSX, back.Sheets.T12); }

console.log("— read from Excel row 1");
var st = G.statement(true), g = viaExcel(st.grid);
ok(g.length === st.grid.length + 2 && (g[0] || []).every(function (v){ return v == null; }), "the grid starts at Excel row 1 (two empty rows kept), so grid row + 1 = Excel row");
var rd = R.read(g), res = R.check(rd);
ok(rd.headerRow === 7, "header found on Excel row 8 (the statement's 6th row, after 2 empty rows) — got " + (rd.headerRow + 1));
ok(R.colName(rd.columns.category) === "A" && R.colName(rd.columns.account) === "B" && R.colName(rd.columns.code) === "A" && rd.columns.months.length === 12, "columns: categories A, accounts B, account numbers A, 12 months");
ok(res.rows.length === g.length && res.rows[0].excel === 1 && res.rows[2].role === "title", "every row from Excel row 1 has a role (rows 1–2 empty, row 3 the title)");

console.log("— the boxes and the checks on a statement that adds up");
var acc = res.rows.filter(function (e){ return e.role === "account"; });
ok(acc.length === st.nIncome + st.nExpense, "accounts: " + acc.length);
ok(res.boxes.length === 7 && res.boxes.every(function (b){ return b.totalRow; }), "7 category boxes above the NOI (4 income, 3 expense), each closed by its total row (got " + res.boxes.length + ")");
ok(res.groups.length === 1 && res.groups[0].label === "TOTAL RENT" && res.groups[0].of.join() === "Residential Rent,Rent Adjustments", "TOTAL RENT = the two rent categories (a total of totals)");
ok(res.ok && res.failures.length === 0, "every check passes (" + res.checks.length + " checks)");
near(res.income.printed, st.revenue, "income total row = income accounts"); near(res.expense.printed, st.opex, "expense total row = expense accounts");
near(res.noi.printed, st.noi, "printed NOI = income − expenses"); near(res.noi.computed, st.noi, "…computed the same");
ok(res.rows.filter(function (e){ return e.role === "after-noi"; }).some(function (e){ return /Net Income/.test(e.label); }), "Net Income is below the NOI — never read");
var fp = SB.fromParse(res.parsed); near(fp.inPlaceNOI, st.noi, "the figures every screen uses: in-place NOI"); ok(fp.reconcile.ties, "…and they tie");

console.log("— a check that fails");
var bad = clone(st.grid), r9 = bad.findIndex(function (r){ return r[1] === "Rent - Potential"; });
bad[r9][4] = bad[r9][4] + 500;   // one month off by $500: the Total no longer equals the months
var resB = R.check(R.read(viaExcel(bad)));
var fa = resB.failures.filter(function (f){ return f.level === "account"; });
ok(fa.length === 1 && fa[0].row === r9 + 3 && /months add up to/.test(fa[0].msg), "an account whose months don't add up to its Total fails, on its Excel row (" + (fa[0] && fa[0].msg) + ")");
var bad2 = clone(st.grid), tr = bad2.findIndex(function (r){ return r[1] === "TOTAL REVENUE"; }); bad2[tr][14] = bad2[tr][14] + 1000;
var resC = R.check(R.read(viaExcel(bad2)));
ok(resC.failures.some(function (f){ return f.level === "income" && /income accounts add up to/.test(f.msg); }), "an income total that doesn't equal the income accounts fails");
var bad3 = clone(st.grid), nr = bad3.findIndex(function (r){ return r[1] === "Net Operating Income"; }); bad3.splice(nr, 1);
var resD = R.check(R.read(viaExcel(bad3)));
ok(resD.failures.some(function (f){ return f.level === "noi" && /No Net Operating Income row/.test(f.msg); }), "no NOI row → a failure that asks you to mark it");
near(resD.noi.computed, st.noi, "…and the computed NOI is offered");

console.log("— a flat statement (no category boxes) still checks at the totals");
var flat = [["Description", "Jan 2026", "Feb 2026", "Mar 2026", "Total"], ["INCOME"], ["Rent", 100, 100, 100, 300], ["Fees", 10, 10, 10, 30], ["TOTAL INCOME", 110, 110, 110, 330],
            ["EXPENSES"], ["Taxes", 20, 20, 20, 60], ["TOTAL EXPENSES", 20, 20, 20, 60], ["NET OPERATING INCOME", 90, 90, 90, 270]];
var resF = R.check(R.read(flat));
ok(resF.ok && resF.income.accounts === 2 && resF.expense.accounts === 1, "accounts counted, income/expense/NOI checked — all pass");

console.log("— your changes, re-checked");
var row13 = res.rows.filter(function (e){ return e.label === "Gross Potential Rent"; })[0].excel;
var resO = R.check(rd, [{ row: row13, role: "account", side: "income" }]);
ok(!resO.ok && resO.failures.some(function (f){ return f.level === "income"; }), "marking a category total as an account makes the income check fail (it would count twice)");
var acct9 = acc[0].excel, resA = R.check(rd, [{ row: acct9, amount: 1, note: "test" }]);
ok(resA.rows.filter(function (e){ return e.excel === acct9; })[0].amountYours && resA.checks.filter(function (c){ return c.row === acct9; })[0].ok, "an amount you set (with a note) passes its own month check as yours");
var gpa = acc.filter(function (e){ return e.label === "Application Fees"; })[0].excel, resS = R.check(rd, [{ row: gpa, side: "expense", cat: "GA" }]);
var pS = resS.parsed.rows.filter(function (r){ return r.name === "Application Fees"; })[0];
ok(pS.section === "EXPENSE" && pS.forceCode === "GA", "a side and a category you set reach the figures (forceCode)");
var noiE = res.rows.filter(function (e){ return e.role === "noi"; })[0].excel, otherE = res.rows.filter(function (e){ return e.label === "Other Expenses"; })[0].excel;
var resN = R.check(rd, [{ row: otherE, role: "noi" }]);
ok(resN.noi.row === otherE && resN.rows.filter(function (e){ return e.excel === noiE; })[0].role !== "noi", "the NOI is one row: setting another row takes it over");
var resNo = R.check(rd, [{ row: acc[1].excel, role: "not-operating" }]);
ok(resNo.parsed.rows.length === acc.length - 1 && resNo.parsed.belowLine.length === 1, "a row you mark not operating leaves the accounts");

console.log("— your changes make the figures");
near(res.parsed.totals.noi, st.noi, "no changes → the statement's printed NOI");
var acctE = acc.filter(function (e){ return e.side === "expense"; })[0], resY = R.check(rd, [{ row: acctE.excel, amount: acctE.amount + 600, note: "per the GL" }]);
near(resY.parsed.totals.noi, st.noi - 600, "an expense amount you set $600 higher → the NOI is $600 lower (your reading, not the printed total)");
near(SB.fromParse(resY.parsed).inPlaceNOI, st.noi - 600, "…in the figures every screen uses too");
var pY = resY.parsed.rows.filter(function (r){ return r.row === acctE.row; })[0], mSum = Object.keys(pY.monthly).reduce(function (t, k){ return t + pY.monthly[k]; }, 0);
near(mSum, acctE.amount + 600, "…and its months carry your amount (spread in the file's proportions)");
var noiM = resY.parsed.totalsMonthly.noi, noiMSum = Object.keys(noiM).reduce(function (t, k){ return t + noiM[k]; }, 0);
near(noiMSum, st.noi - 600, "…so the monthly NOI adds up to it");
var incE = acc.filter(function (e){ return e.side === "income"; })[1], resZ = R.check(rd, [{ row: incE.excel, side: "expense" }]);
near(resZ.parsed.totals.noi, st.noi - 2 * incE.amount, "an income account you move to expenses lowers the NOI by twice its amount");
var resC2 = R.check(rd, [{ row: incE.excel, cat: "OTH" }]);
near(resC2.parsed.totals.noi, st.noi, "a category alone changes no total");

console.log("— a T12 in two sheets: your changes reach the combined statement");
var FP = require("../file-parts.js"), T12Parse = require("../t12-parse.js");
var MM = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(function (m){ return m + " 2026"; });
var ln = function (l, v){ return [l].concat(MM.map(function (){ return v; })).concat([12 * v]); };
var ph = function (rent, rm){ return [["Phase"], [], ["Account"].concat(MM).concat(["Total"]), ["INCOME"], ln("Rent", rent), ln("TOTAL INCOME", rent), ["EXPENSES"], ln("Repairs", rm), ln("TOTAL EXPENSES", rm), ln("NET OPERATING INCOME", rent - rm)]; };
var g1 = ph(1000, 100), g2 = ph(500, 50), cm = FP.combineT12Grids([g1, g2], { T12Parse: T12Parse }, { title: "QG" });
var cov = R.combineOverrides([{ grid: g1, overrides: [{ row: 8, amount: 1260, note: "GL p1" }] }, { grid: g2, overrides: [{ row: 8, amount: 630, note: "GL p2" }, { row: 5, cat: "GPR" }] }], cm.grid);
var cRep = cov.filter(function (o){ return cm.grid[o.row - 1][0] === "Repairs"; })[0], cRent = cov.filter(function (o){ return cm.grid[o.row - 1][0] === "Rent"; })[0];
ok(cRep && cRep.amount === 1890 && /GL p1/.test(cRep.note) && /GL p2/.test(cRep.note), "the two sheets' repairs amounts of yours add up on the combined line (1,260 + 630 = 1,890), both notes kept");
ok(cRent && cRent.cat === "GPR" && cRent.amount == null, "a category set on one sheet's row reaches the combined line");
near(R.check(R.read(cm.grid), cov).parsed.totals.noi, 12 * 1500 - 1890, "the combined NOI follows them");

console.log("— the AI's answer, compared at every level");
function aiFrom(res2){ return { accounts: res2.rows.filter(function (e){ return e.role === "account"; }).map(function (e){ return { row: e.excel, label: e.label, role: e.side, category: e.cat, annual: e.amount, monthly: Object.keys(e.monthly).map(function (k){ return { month: k, amount: e.monthly[k] }; }) }; }),
  boxes: res2.boxes.map(function (b){ var t = res2.rows.filter(function (e){ return e.excel === b.totalRow; })[0]; return { name: b.name, nameRow: b.headingRow, totalRow: b.totalRow, total: t ? t.amount : null }; }),
  totals: { income: { row: res2.income.row, amount: res2.income.printed }, expense: { row: res2.expense.row, amount: res2.expense.printed }, noi: { row: res2.noi.row, amount: res2.noi.printed } } }; }
var same = R.compare(res, aiFrom(res));
ok(same.agree && same.items.length === 0, "the same reading → they agree");
var ai2 = aiFrom(res); ai2.accounts[0].annual += 100; ai2.accounts[2].role = "expense"; ai2.accounts.splice(5, 1);
ai2.accounts.push({ row: row13, label: "Gross Potential Rent", role: "income", category: "GPR", annual: 5000, monthly: [] });
ai2.totals.noi.row = noiE + 1;
var cmp = R.compare(res, ai2), kinds = cmp.items.map(function (i){ return i.kind; });
ok(!cmp.agree && kinds.indexOf("differs") >= 0 && kinds.indexOf("missing") >= 0 && kinds.indexOf("extra") >= 0 && kinds.indexOf("total-row") >= 0, "an amount, a side, a missing account, an extra one and the NOI row each make an item (" + kinds.join(",") + ")");
ok(cmp.items.filter(function (i){ return i.kind === "differs"; }).length === 2, "…two accounts differ (one amount, one side)");
ok(cmp.items.every(function (i){ return i.msg && /row \d+|Row \d+/.test(i.msg); }), "every item names its Excel row");
var ai3 = aiFrom(res); ai3.boxes[0].totalRow = acc[0].excel;
ok(R.compare(res, ai3).items.some(function (i){ return i.kind === "box"; }), "the AI calling an account row a category total is a disagreement");

console.log("— what the AI is given");
var inp = R.aiInput(g, { fileName: "x.xlsx", sheet: "T12" }).split("\n");
ok(/^Row 1: \(empty\)$/.test(inp[1]) && /^Row 3: Income Statement/.test(inp[3]), "the AI gets every row from Excel row 1, empty ones included, numbered as in Excel");
var serial = [["Description"].concat([46023, 46054, 46082]).concat(["Total"]), ["INCOME"], ["Rent", 100, 100, 100, 300], ["TOTAL INCOME", 100, 100, 100, 300], ["NET OPERATING INCOME", 100, 100, 100, 300]];
var sIn = R.aiInput(serial).split("\n");
ok(/^Row 1: Description \| Jan 2026 \| Feb 2026 \| Mar 2026 \| Total$/.test(sIn[0]), "month headings Excel keeps as dates are shown to the AI as the months they are (" + sIn[0] + ")");
ok(/from Excel row 1/.test(R.aiInstruction()) && /Stop at the Net Operating Income row/.test(R.aiInstruction()), "…and is told to read from row 1 and stop at the NOI");

console.log("\n" + (fails ? fails + " FAILED, " : "") + "all " + passes + " t12-read checks " + (fails ? "run" : "passed"));
process.exit(fails ? 1 : 0);
