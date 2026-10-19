/* ============================================================================
   A made-up T12 for the pro forma tests (next stage, F1): "Sample Gardens", with real month-to-month movement —
   spring renewals (the revenue credit), a snowy winter (normalized), a one-time pest treatment (non-recurring),
   exterior painting every few years (spread), bank charges (partnership), a pool service at $0 all year. Every total row is the exact sum of its
   lines, in cents. Returns the grid in the SheetJS sheet_to_json({header:1}) shape.
   Hand arithmetic for the tests (dollars):
     Residential Rent 12 months 1,177,500; last 3 (Apr–Jun) 101,500 + 102,000 + 102,300 = 305,800 → × 4 = 1,223,200
     Vacancy Loss −64,300; last 3 −11,200 → × 4 = −44,800 · Concessions −11,200; last 3 −1,300 → −5,200
     Other income 73,200; last 3 18,610 → 74,440 · flat lines (discounts, models, bad debt) annualize to themselves
     → the T3 revenue credit = (1,223,200 − 1,177,500) + (−44,800 + 64,300) + (−5,200 + 11,200) + (74,440 − 73,200) = +72,440
     T12 NOI 616,006.36 (income 1,155,640 − expenses 539,633.64)
   ========================================================================== */
"use strict";
var MONTHS = ["Jul 2025","Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"];
function grid(){
  var g = [], acc = {};
  var c = function (d){ return Math.round(d * 100); }, z = function (){ return [0,0,0,0,0,0,0,0,0,0,0,0]; };
  var push = function (r){ g.push(r); return g.length - 1; };
  var row = function (label, m){ return push([label].concat(m.map(function (x){ return x / 100; }), [m.reduce(function (a, b){ return a + b; }, 0) / 100])); };
  var line = function (label, months, keys){ var m = months.map(c); keys.forEach(function (k){ acc[k] = acc[k] || z(); for (var i = 0; i < 12; i++) acc[k][i] += m[i]; }); return row(label, m); };
  var flat = function (v){ return [v,v,v,v,v,v,v,v,v,v,v,v]; };
  var total = function (label, k){ return row(label, acc[k] || z()); };
  push(["Sample Gardens (made-up figures)"]); push(["Cash Flow (12 months)"]); push(["Period = Jul 2025-Jun 2026"]); push([]);
  push([null].concat(MONTHS, ["Total"]));
  push(["INCOME"]); push(["RENTAL INCOME"]);
  line("Residential Rent", [96000,96200,96400,96500,96800,97000,97300,97500,98000,101500,102000,102300], ["rent","inc"]);
  line("Vacancy Loss", [-6500,-6400,-6300,-6100,-6000,-5800,-5600,-5400,-5000,-3900,-3700,-3600], ["rent","inc"]);
  line("Concessions", [-1500,-1400,-1300,-1200,-1100,-1000,-900,-800,-700,-500,-400,-400], ["rent","inc"]);
  line("Bad Debt", flat(-380), ["rent","inc"]);
  line("Employee Discount", flat(-500), ["rent","inc"]);
  line("Model Units", flat(-750), ["rent","inc"]);
  total("TOTAL RENTAL INCOME", "rent"); push([]);
  push(["OTHER INCOME"]);
  line("Utility Reimbursements", [4000,4000,4020,4040,4060,4080,4100,4120,4140,4180,4200,4200], ["oth","inc"]);
  line("Pet Fees", flat(600), ["oth","inc"]);
  line("Late Fees", [320,300,280,310,290,300,330,300,290,260,250,240], ["oth","inc"]);
  line("Application Fees", [250,220,200,180,160,150,160,180,220,240,260,250], ["oth","inc"]);
  line("Parking Income", flat(800), ["oth","inc"]);
  line("Miscellaneous Income", flat(110), ["oth","inc"]);
  total("TOTAL OTHER INCOME", "oth"); push([]);
  total("TOTAL INCOME", "inc"); push([]);
  push(["EXPENSES"]); push(["TAXES AND INSURANCE"]);
  line("Real Estate Taxes", flat(12520.83), ["ti","exp"]);
  line("Property Insurance", flat(3508.40), ["ti","exp"]);
  total("TOTAL TAXES AND INSURANCE", "ti");
  push(["UTILITIES"]);
  line("Electric", [2900,3000,2700,2300,2200,2500,2700,2600,2300,2100,2300,2700], ["ut","exp"]);
  line("Water & Sewer", flat(4619.34), ["ut","exp"]);
  line("Trash Removal", flat(1000), ["ut","exp"]);
  total("TOTAL UTILITIES", "ut");
  push(["REPAIRS & MAINTENANCE"]);
  line("Plumbing Repairs", [1500,1550,1600,1500,1450,1600,1650,1500,1550,1600,1500,1550], ["rm","exp"]);
  line("Turnover Costs", flat(1840), ["rm","exp"]);
  line("Exterior Painting", [0,0,0,0,0,0,0,0,0,0,14400,0], ["rm","exp"]);
  total("TOTAL REPAIRS & MAINTENANCE", "rm");
  push(["CONTRACT SERVICES"]);
  line("Landscaping", [1500,1500,1500,1200,600,0,0,0,600,1200,1500,1500], ["cs","exp"]);
  line("Snow Removal", [0,0,0,0,1400,4200,4800,3600,0,0,0,0], ["cs","exp"]);
  line("Pest Control", [300,300,300,300,300,300,300,300,4100,300,300,300], ["cs","exp"]);
  line("Pool Service", z(), ["cs","exp"]);   // round 1 — an account at $0 all year: shown, never hidden
  total("TOTAL CONTRACT SERVICES", "cs");
  push(["PAYROLL"]);
  line("Manager Salary", flat(5416.67), ["pay","exp"]);
  line("Maintenance Salary", flat(4020.88), ["pay","exp"]);
  total("TOTAL PAYROLL", "pay");
  push(["GENERAL AND ADMINISTRATIVE"]);
  line("Office Supplies", [350,340,360,355,345,350,365,340,350,360,345,350], ["ga","exp"]);
  line("Bank Charges", flat(68), ["ga","exp"]);
  total("TOTAL GENERAL AND ADMINISTRATIVE", "ga");
  push(["MARKETING"]);
  line("Advertising", flat(756.25), ["mkt","exp"]);
  total("TOTAL MARKETING", "mkt");
  push(["MANAGEMENT FEES"]);
  line("Management Fee", acc.inc.map(function (x){ return Math.round(x * 0.03) / 100; }), ["mg","exp"]);
  total("TOTAL MANAGEMENT FEES", "mg"); push([]);
  total("TOTAL EXPENSES", "exp"); push([]);
  var noi = z(); for (var i = 0; i < 12; i++) noi[i] = acc.inc[i] - acc.exp[i];
  row("NET OPERATING INCOME", noi);
  return g;
}
module.exports = { grid: grid, MONTHS: MONTHS };
