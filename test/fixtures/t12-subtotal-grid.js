/* SYNTHETIC T12 (made-up amounts) laid out like a real account-coded statement whose section sums carry no "Total"
   (2.9.15 T1). Used by test/t12-subtotals.test.js and test/e2e/t12-subtotals-2915.e2e.js. statement(withCodes) → { grid, revenue, opex, noi, … } */
var MONTHS = ["Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026"];
var seed = 7; function rnd(){ seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
// a detail line: 12 months that differ month to month (so no two lines are alike by accident) + the year total
function months(base){ var m = []; for (var i = 0; i < 12; i++) m.push(Math.round(base * (0.9 + rnd() * 0.2) * 100) / 100); return m; }
function sumM(list){ var s = Array(12).fill(0); list.forEach(function (m){ m.forEach(function (v, i){ s[i] = Math.round((s[i] + v) * 100) / 100; }); }); return s; }
function tot(m){ return Math.round(m.reduce(function (a, b){ return a + b; }, 0) * 100) / 100; }

// Build an account-coded statement. withCodes=false drops the account column (description first).
function statement(withCodes){
  var g = [], lines = { income: [], expense: [] };
  function row(code, label, m){ var r = withCodes ? [code, label] : [label]; g.push(r.concat(m, [tot(m)])); }
  function head(label){ g.push(withCodes ? [label, ""] : [label]); }
  function section(role, title, items, subName){
    head(title); var ms = items.map(function (it){ var m = months(it[2]); row(it[0], it[1], m); lines[role].push(m); return m; });
    var s = sumM(ms); row("", subName || title, s); g.push([]); return s;
  }
  g.push(["Income Statement"], ["Synthetic Apartments"], ["Accrual Basis"], ["Aug 2025 - Jul 2026"], []);
  g.push((withCodes ? ["Account", "Account Name"] : ["Account Name"]).concat(MONTHS, ["Total"]));
  var gpr = section("income", "Residential Rent", [["41010001", "Rent - Potential", 400000], ["41020001", "Rent - Gain/Loss to Lease", -6000], ["41020002", "Rent - Vacancy", -18000]], "Gross Potential Rent");
  var adj = section("income", "Rent Adjustments", [["41020006", "Rent - Concessions", -9000], ["41020103", "Rent - Model Concessions", -700]]);
  row("", "TOTAL RENT", sumM([gpr, adj])); g.push([]);
  var fees = section("income", "Residential Fees", [["42010001", "Application Fees", 800], ["42010005", "Late Fees", 3000], ["42020003", "Recoveries - Electric", 11000]]);
  var bad = section("income", "Bad Debt", [["47000001", "Bad Debt - Allowance", -4000]]);   // a ONE-line section
  var revenue = sumM([gpr, adj, fees, bad]);
  row("", "TOTAL REVENUE", revenue); g.push([]);
  head("Operating Expenses");
  var pay = section("expense", "Payroll Expense", [["60021002", "Office Team", 15000], ["60021004", "Maintenance Team", 12000]]);
  var util = section("expense", "Utilities", [["60051001", "Electric", 9000], ["60051002", "Water/Sewer", 7000], ["60051003", "Gas", 1500]]);
  var tax = section("expense", "Property Taxes", [["60071001", "Real Estate Taxes", 40000]]);      // a ONE-line section
  var opex = sumM([pay, util, tax]);
  row("", "Operating Expenses", opex); g.push([]);
  var noi = revenue.map(function (v, i){ return Math.round((v - opex[i]) * 100) / 100; });
  row("", "Net Operating Income", noi); g.push([]);
  head("Other Expenses");
  var intr = section("expense", "Interest Expense", [["80010001", "Interest - Senior", 90000]]);
  row("", "Other Expenses", intr);
  row("", "Net Income", noi.map(function (v, i){ return Math.round((v - intr[i]) * 100) / 100; }));
  lines.expense.pop();                                   // interest is below NOI — not an operating line
  return { grid: g, revenue: tot(revenue), opex: tot(opex), noi: tot(noi),
           nIncome: lines.income.length, nExpense: lines.expense.length, revenueM: revenue };
}

module.exports = { statement: statement, MONTHS: MONTHS, months: months, sumM: sumM, tot: tot };
