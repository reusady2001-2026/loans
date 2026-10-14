/* Tests for the opt-in MONTHLY extraction added to t12-parse.js: calendar-month
   resolution of period-column headers (monthTok / resolveMonthCols) and the
   per-line monthly values parseGrid({monthly:true}) attaches to each detail row.
   Plain node, no framework. Run:  node test/t12-monthly.test.js               */
"use strict";
var P = require("../t12-parse.js");

var passes = 0, fails = 0;
function ok(cond, msg, detail){
  if (cond) { passes++; console.log("  ok   " + msg); }
  else { fails++; console.log("  FAIL " + msg + (detail ? "\n         " + detail : "")); }
}
function deq(a, b){
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i++) if (!Object.prototype.hasOwnProperty.call(b, ka[i]) || !deq(a[ka[i]], b[ka[i]])) return false;
  return true;
}
function eq(actual, expected, msg){
  var same = deq(actual, expected);
  ok(same, msg, same ? "" : "expected " + JSON.stringify(expected) + "\n         actual   " + JSON.stringify(actual));
}
function group(name, fn){ console.log("\n" + name); try { fn(); } catch (e) { ok(false, name + " — unexpected exception", (e && e.stack) || String(e)); } }

// month labels → the resolved "YYYY-MM" list (ym only)
function yms(header, idx){ return P.resolveMonthCols(header, idx).map(function (c){ return c.ym; }); }

group("monthTok — single header cells", function (){
  eq(P.monthTok("Jan 2026"), { y: 2026, m: 1 }, "\"Jan 2026\" → 2026-01");
  eq(P.monthTok("January 2026"), { y: 2026, m: 1 }, "full month name + year");
  eq(P.monthTok("Dec-25"), { y: 2025, m: 12 }, "\"Dec-25\" → 2025-12 (2-digit year is this century)");
  eq(P.monthTok("2026-03"), { y: 2026, m: 3 }, "ISO YYYY-MM");
  eq(P.monthTok("2026/03/31"), { y: 2026, m: 3 }, "YYYY/MM/DD keeps the month");
  eq(P.monthTok("03/2026"), { y: 2026, m: 3 }, "MM/YYYY");
  eq(P.monthTok("1/31/2026"), { y: 2026, m: 1 }, "US MM/DD/YYYY");
  eq(P.monthTok("Sept 2025"), { y: 2025, m: 9 }, "\"Sept\" abbreviation");
  eq(P.monthTok("May"), { y: null, m: 5 }, "bare month → month only, no year");
  ok(P.monthTok("Description") == null, "a non-month word is not a month");
  ok(P.monthTok("Total") == null, "\"Total\" is not a month");
  ok(P.monthTok("2026") == null, "a bare year is not a month");
  // Excel serial: 2026-01-31 = 46053
  eq(P.monthTok(46053), { y: 2026, m: 1 }, "Excel serial date → its month");
  // A real Date cell
  eq(P.monthTok(new Date(Date.UTC(2026, 5, 30))), { y: 2026, m: 6 }, "a Date cell → its month");
  eq(P.monthTok(7), { y: null, m: 7 }, "a bare month NUMBER 1..12 → month only");
});

group("resolveMonthCols — one anchor fixes a consecutive run", function (){
  var idx = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // fully dated calendar year
  var h1 = ["", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026",
                "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026", "Total"];
  eq(yms(h1, idx), ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"], "a dated Jan–Dec year resolves straight through");

  // a fiscal run that crosses the year boundary, dated on every column
  var h2 = ["", "Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026",
                "Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026","Sep 2026", "Total"];
  eq(yms(h2, idx), ["2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"], "a fiscal Oct→Sep run keeps the year rolling over Dec→Jan");

  // bare month names with ONE dated anchor (the last column) — years propagate backward over the boundary
  var h3 = ["", "Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep 2026", "Total"];
  eq(yms(h3, idx), ["2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"], "one dated anchor back-fills the year across bare months");

  // no year anywhere → months carry m only, ym null (caller degrades to an annual snapshot)
  var h4 = ["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec", "Total"];
  var r4 = P.resolveMonthCols(h4, idx);
  ok(r4.every(function (c){ return c.ym === null; }), "with no dated column at all, every ym is null");
  ok(r4[0].m === 1 && r4[11].m === 12, "…but the month number is still known per column");
});

group("parseGrid({monthly:true}) — per-line monthly values", function (){
  // 12 dated month columns + a Total column; income build-up, two expenses, printed footing.
  var H = ["Account", "Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026",
                      "Jul 2026","Aug 2026","Sep 2026","Oct 2026","Nov 2026","Dec 2026", "Total"];
  function row(name, mo, tot){ return [name].concat(mo).concat([tot]); }
  var m1000 = [1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000];
  var mVac  = [-50,-50,-50,-50,-50,-50,-50,-50,-50,-50,-50,-50];
  var mTax  = [100,100,100,100,100,100,100,100,100,100,100,100];
  var mIns  = [30,30,30,30,30,30,30,30,30,30,30,30];
  var grid = [
    H,
    row("Gross Potential Rent", m1000, 12000),
    row("Vacancy Loss", mVac, -600),
    row("TOTAL INCOME", [950,950,950,950,950,950,950,950,950,950,950,950], 11400),
    row("Real Estate Taxes", mTax, 1200),
    row("Insurance", mIns, 360),
    row("TOTAL EXPENSES", [130,130,130,130,130,130,130,130,130,130,130,130], 1560),
    row("NET OPERATING INCOME", [820,820,820,820,820,820,820,820,820,820,820,820], 9840)
  ];
  var d = P.parseGrid(grid, { monthly: true });
  ok(d.headerRow === 0, "header row found");
  eq(d.totals, { income: 11400, expense: 1560, noi: 9840 }, "printed footing read straight off the Total column");
  ok(Array.isArray(d.monthCols) && d.monthCols.length === 12, "12 month columns resolved");
  eq(d.monthCols.map(function (c){ return c.ym; }),
     ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"],
     "month columns carry the right calendar months");

  var byName = {}; d.rows.forEach(function (r){ byName[r.name] = r; });
  ok(byName["Gross Potential Rent"] && byName["Gross Potential Rent"].monthly["2026-01"] === 1000, "GPR carries its January value");
  ok(byName["Gross Potential Rent"].monthly["2026-12"] === 1000, "GPR carries its December value");
  var taxSum = Object.keys(byName["Real Estate Taxes"].monthly).reduce(function (a, k){ return a + byName["Real Estate Taxes"].monthly[k]; }, 0);
  ok(taxSum === 1200, "the 12 monthly tax values sum to the annual tax figure (1200)");
  ok(byName["Vacancy Loss"].monthly["2026-06"] === -50, "a negative line (vacancy) keeps its sign per month");
  ok(Object.keys(byName["Real Estate Taxes"].monthly).length === 12, "every month is present on the tax line");
});

group("default parse is unchanged (no monthly key unless asked)", function (){
  var H = ["Account", "Jan 2026","Feb 2026","Mar 2026","Total"];
  var grid = [H, ["Gross Potential Rent", 1000,1000,1000, 3000], ["TOTAL INCOME",1000,1000,1000,3000],
              ["Real Estate Taxes",100,100,100,300], ["TOTAL EXPENSES",100,100,100,300], ["NET OPERATING INCOME",900,900,900,2700]];
  var d = P.parseGrid(grid);
  ok(d.monthCols == null, "monthCols is null without opts.monthly");
  ok(d.rows.length > 0 && !("monthly" in d.rows[0]), "detail rows carry no monthly key by default");
});

console.log("\n" + (fails ? "FAIL — " + fails + " failing, " + passes + " passing" : "all " + passes + " monthly-parse checks passed"));
process.exit(fails ? 1 : 0);
