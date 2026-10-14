/* Unit tests for 2.9.15 T1: T12 subtotals printed WITHOUT the word "Total" are not lines.
   Some statements print each section's sum under its lines with no "Total" — repeating the section's name
   ("Utilities" under the utility lines), or naming it differently ("Gross Potential Rent" under "Residential Rent"),
   and close the expenses with a plain "Operating Expenses" row. Read as lines, those sums doubled income and
   expenses. The grids here are SYNTHETIC (made-up amounts), laid out like a real account-coded statement.
   Run: node test/t12-subtotals.test.js */
var P = require("../t12-parse.js"), SB = require("../setup-builder.js");
var fails = 0, passes = 0;
function ok(c, m){ if (c){ passes++; console.log("  ok   " + m); } else { fails++; console.log("  FAIL " + m); } }
function near(a, b, m){ ok(a != null && Math.abs(a - b) < 0.01, m + "  [got " + a + ", want " + b + "]"); }
var G = require("./fixtures/t12-subtotal-grid.js"), statement = G.statement, MONTHS = G.MONTHS, months = G.months, sumM = G.sumM, tot = G.tot;

function check(name, st){
  var p = P.parseGrid(st.grid, { basis: "total", monthly: true });
  var inc = p.rows.filter(function (r){ return r.section === "INCOME"; }), exp = p.rows.filter(function (r){ return r.section === "EXPENSE"; });
  var sum = function (rs){ return Math.round(rs.reduce(function (a, r){ return a + r.amount; }, 0) * 100) / 100; };
  console.log("— " + name);
  ok(p.rows.length === st.nIncome + st.nExpense, name + ": only the detail lines are read (" + (st.nIncome + st.nExpense) + "), got " + p.rows.length);
  near(sum(inc), st.revenue, name + ": the income lines add up to the printed revenue");
  near(sum(exp), st.opex, name + ": the expense lines add up to the printed operating expenses");
  near(p.totals.income, st.revenue, name + ": the income total is the statement's TOTAL REVENUE");
  near(p.totals.expense, st.opex, name + ": the plain \"Operating Expenses\" row is the expense total");
  near(p.totals.noi, st.noi, name + ": NOI is the printed Net Operating Income — never Net Income");
  ok(!p.rows.some(function (r){ return /^(Gross Potential Rent|Rent Adjustments|TOTAL RENT|Residential Fees|Bad Debt|TOTAL REVENUE|Payroll Expense|Utilities|Property Taxes|Operating Expenses|Interest Expense)$/.test(r.name); }),
     name + ": no section sum is read as a line");
  ok(!p.rows.some(function (r){ return /Interest/.test(r.name); }), name + ": nothing below NOI is an operating line");
  var b = SB.buildSetup({ parsed: { rows: p.rows, categories: p.categories, totals: p.totals } });
  near(b.result.inPlace.noi, st.noi, name + ": the operating model's in-place NOI = the printed NOI");
  if (p.totalsMonthly && p.totalsMonthly.income) near(p.totalsMonthly.income["2026-01"], st.revenueM[5], name + ": January's revenue reads right too");
  return p;
}

var coded = check("account-coded statement", statement(true));
ok(coded.codeCol === 0, "the account-number column is found (column A)");
ok(coded.subtotals.length >= 7, "the section sums are reported as subtotals (" + coded.subtotals.length + ")");
check("same statement without account numbers", statement(false));

// ---- what must NOT be taken for a subtotal ----
console.log("— lines that only look like sums");
// (a) two-column statement (one amount column): a real line that happens to equal the two lines above it stays a line
var g2 = [["Description", "Annual"], ["INCOME"], ["Rent", 100000], ["Parking", 5000], ["Laundry", 105000], ["TOTAL INCOME", 210000],
          ["EXPENSES"], ["Taxes", 20000], ["Insurance", 8000], ["TOTAL EXPENSES", 28000], ["NET OPERATING INCOME", 182000]];
var p2 = P.parseGrid(g2, { basis: "total" });
ok(p2.rows.length === 5 && p2.rows.some(function (r){ return r.name === "Laundry"; }), "one amount column: \"Laundry\" = Rent + Parking by chance is still a line");
near(p2.totals.noi, 182000, "…and the NOI is the printed one");
// (b) monthly, coded: a coded line identical to the line above it stays a line
var m1 = months(3000), m2 = m1.slice();
var g3 = [["Account", "Account Name"].concat(MONTHS, ["Total"]), ["INCOME", ""], ["41010001", "Rent"].concat(months(50000), [0]), ["TOTAL INCOME", ""],
          ["EXPENSES", ""], ["60051001", "Water"].concat(m1, [tot(m1)]), ["60051002", "Sewer"].concat(m2, [tot(m2)]),
          ["", "TOTAL EXPENSES"].concat(sumM([m1, m2]), [tot(m1) + tot(m2)])];
g3[2][14] = tot(g3[2].slice(2, 14)); g3[3] = ["", "TOTAL INCOME"].concat(g3[2].slice(2));
var p3 = P.parseGrid(g3, { basis: "total", monthly: true });
ok(p3.rows.some(function (r){ return r.name === "Sewer"; }), "a coded line equal to the one above it (Sewer = Water) is still a line");
near(p3.totals.expense, tot(m1) + tot(m2), "…and both are in the expense total");
// (c) monthly, no codes: one line equal to the single line above it, under a different name, stays a line
var g4 = [["Account Name"].concat(MONTHS, ["Total"]), ["INCOME"], ["Rent"].concat(months(50000)), ["EXPENSES"], ["Water"].concat(m1, [tot(m1)]), ["Sewer"].concat(m2, [tot(m2)])];
g4[2].push(tot(g4[2].slice(1)));
var p4 = P.parseGrid(g4, { basis: "total", monthly: true });
ok(p4.rows.some(function (r){ return r.name === "Sewer"; }), "no account numbers: a line equal to the ONE line above it is still a line");
// (d) a row of zeros is never a subtotal
var z = Array(12).fill(0);
var g5 = [["Account", "Account Name"].concat(MONTHS, ["Total"]), ["INCOME", ""], ["41010001", "Rent"].concat(m1, [tot(m1)]), ["EXPENSES", ""],
          ["60051001", "Pest Control"].concat(z, [0]), ["", "Snow Removal"].concat(z, [0]), ["60051003", "Water"].concat(m2, [tot(m2)])];
var p5 = P.parseGrid(g5, { basis: "total", monthly: true });
ok(p5.rows.some(function (r){ return r.name === "Snow Removal"; }), "a $0 row under a $0 row stays a line");

console.log("\n" + (fails ? fails + " FAILED, " : "") + "all " + passes + " t12-subtotals checks " + (fails ? "run" : "passed"));
process.exit(fails ? 1 : 0);
