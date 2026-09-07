/* t12-classify tests — plain node, no framework.
   run:  node test/t12-classify.test.js
   Synthetic cases always run; the Crest block needs test/fixtures/crest-t12.xlsx
   (real statement, git-ignored) and is skipped with a clear line when absent.  */
"use strict";
var path = require("path"), fs = require("fs");
var ROOT = path.join(__dirname, "..");
var T12 = require(path.join(ROOT, "t12-classify.js"));
var SB = require(path.join(ROOT, "setup-builder.js"));
var T12Parse = require(path.join(ROOT, "t12-parse.js"));

var fails = 0, total = 0;
function ok(cond, msg){ total++; if (cond) console.log("  ok   " + msg); else { fails++; console.log("  FAIL " + msg); } }
function eq(got, want, msg){ ok(got === want, msg + (got === want ? "" : "   (got " + JSON.stringify(got) + ", want " + JSON.stringify(want) + ")")); }
function money(v){ return (Math.round(v * 100) / 100).toFixed(2); }
// to-the-cent equality: the classifier moves whole statement lines, so a sum is
// either exactly the printed figure (± float dust) or off by a whole line
function eqCents(got, want, msg){ var hit = Math.abs(got - want) < 0.005; ok(hit, msg + " = " + money(got) + (hit ? "" : "   (want " + money(want) + ")")); }
function section(title){ console.log("\n" + title); }

// ---------------------------------------------------------------- 1. exports & taxonomy
section("exports / taxonomy sets");
["classify", "classifyConfident", "subMatch", "roleOf"].forEach(function (f){ eq(typeof T12[f], "function", "exports " + f + "()"); });
var INC = ["GPR","VAC","CONC","EMPL","MOD","BD","MTM","RUBS","TRSH RUB","TRSH COL","OTH","AMEN","PET","LATE","ADM","APP","PARK","COM","CAM","ANT"];
var EXP = ["RET","INS","UTIL","PAY","GA","MKT","RM","CS","MGMT","TRSH","CAB","PLL"];
eq(Object.keys(T12.INCOME).sort().join(","), INC.slice().sort().join(","), "INCOME is exactly the 20 income codes");
eq(Object.keys(T12.EXPENSE).sort().join(","), EXP.slice().sort().join(","), "EXPENSE is exactly the 12 expense codes");
ok(INC.every(function (c){ return T12.roleOf(c) === "income"; }), "roleOf(income code) === \"income\" for all 20");
ok(EXP.every(function (c){ return T12.roleOf(c) === "expense"; }), "roleOf(expense code) === \"expense\" for all 12");
ok(INC.every(function (c){ return !T12.EXPENSE[c]; }), "no code is in both sets");

// ---------------------------------------------------------------- 2. synthetic labels, flat (section only)
section("synthetic labels — every taxonomy code, flat statement (section, no sub-header)");
var CASES = [
  // income
  ["Gross Potential Rent","INCOME","GPR"], ["Market Rent","INCOME","GPR"], ["Gross Scheduled Rent","INCOME","GPR"],
  ["Rental Income","INCOME","GPR"], ["Loss to Lease","INCOME","GPR"], ["Section 8 Rent","INCOME","GPR"], ["Old Rent","INCOME","GPR"],
  ["Employee Discount","INCOME","EMPL"], ["Employee Concession","INCOME","EMPL"], ["Resident Manager Credit","INCOME","EMPL"],
  ["Model Units","INCOME","MOD"], ["Admin Units","INCOME","MOD"], ["Vacancy Loss - Model","INCOME","MOD"],
  ["Vacancy Loss","INCOME","VAC"], ["Less: Vacancy","INCOME","VAC"], ["Down Units","INCOME","VAC"],
  ["Concessions","INCOME","CONC"], ["Free Rent","INCOME","CONC"],
  ["Bad Debt","INCOME","BD"], ["Write-Off","INCOME","BD"], ["Bad Debt Recovery","INCOME","BD"], ["Delinquency","INCOME","BD"],
  ["Utility Reimbursement","INCOME","RUBS"], ["RUBS Income","INCOME","RUBS"], ["Water/Sewer","INCOME","RUBS"],
  ["Trash Reimbursement","INCOME","TRSH RUB"], ["Trash","INCOME","TRSH RUB"],
  ["Parking Income","INCOME","PARK"], ["Garage Rent","INCOME","PARK"],
  ["Pet Rent","INCOME","PET"], ["Pet Fees","INCOME","PET"],
  ["Month to Month Fees","INCOME","MTM"], ["MTM Premium","INCOME","MTM"],
  ["Late Fees","INCOME","LATE"], ["NSF Fees","INCOME","LATE"],
  ["Application Fees","INCOME","APP"], ["Administrative Fees","INCOME","ADM"], ["Admin Fee Income","INCOME","ADM"],
  ["Amenity Fees","INCOME","AMEN"], ["Clubhouse Rental","INCOME","AMEN"],
  ["Commercial Rent","INCOME","COM"], ["Retail Rent","INCOME","COM"],
  ["CAM Income","INCOME","CAM"], ["CAM Reimbursements","INCOME","CAM"],
  ["Antenna Income","INCOME","ANT"], ["Cell Tower Lease","INCOME","ANT"],
  ["Miscellaneous Income","INCOME","OTH"], ["Interest Income","INCOME","OTH"], ["Laundry Income","INCOME","OTH"], ["Cleaning Fee","INCOME","OTH"],
  // expense-looking names printed under INCOME are income (recoveries / rev-share), never an expense code
  ["Legal Fees","INCOME","OTH"], ["Management Fees","INCOME","OTH"], ["Real Estate Tax Income","INCOME","OTH"], ["Cable","INCOME","OTH"], ["Pest Control","INCOME","OTH"],
  // expense
  ["Real Estate Taxes","EXPENSE","RET"], ["Property Tax","EXPENSE","RET"], ["Taxes","EXPENSE","RET"],
  ["Property Insurance","EXPENSE","INS"], ["Insurance","EXPENSE","INS"], ["Property & Liability","EXPENSE","INS"], ["Umbrella","EXPENSE","INS"],
  ["Water & Sewer","EXPENSE","UTIL"], ["Electric","EXPENSE","UTIL"], ["Gas","EXPENSE","UTIL"], ["Utilities","EXPENSE","UTIL"],
  ["Payroll","EXPENSE","PAY"], ["Salaries & Wages","EXPENSE","PAY"], ["Payroll Taxes","EXPENSE","PAY"], ["Worker's Comp","EXPENSE","PAY"],
  ["Health Insurance","EXPENSE","PAY"], ["Employee Benefits","EXPENSE","PAY"], ["Leasing Consultant","EXPENSE","PAY"],
  ["Office Supplies","EXPENSE","GA"], ["Bank Service Charges","EXPENSE","GA"], ["Legal Fees","EXPENSE","GA"], ["Accounting and Tax Services","EXPENSE","GA"],
  ["RE Tax Consultant","EXPENSE","GA"], ["Renters Insurance","EXPENSE","GA"], ["Late Fee - Taxes","EXPENSE","GA"], ["Violation Penalty","EXPENSE","GA"],
  ["Interest Expense","EXPENSE","GA"], ["Income Taxes","EXPENSE","GA"], ["Miscellaneous Expense","EXPENSE","GA"],
  ["Marketing","EXPENSE","MKT"], ["Advertising","EXPENSE","MKT"], ["Online Marketing Expense","EXPENSE","MKT"],
  ["Repairs - Plumbing","EXPENSE","RM"], ["Repairs & Maintenance","EXPENSE","RM"], ["Unit Turnover - Painting","EXPENSE","RM"], ["HVAC Parts","EXPENSE","RM"],
  ["Electrical","EXPENSE","RM"], ["Electrical Supplies","EXPENSE","RM"], ["Security Camera","EXPENSE","RM"], ["Amenity Repairs & Maint","EXPENSE","RM"],
  ["Landscaping Contract","EXPENSE","CS"], ["Snow Removal","EXPENSE","CS"], ["Exterminating","EXPENSE","CS"], ["Elevator Maintenance Contract","EXPENSE","CS"],
  ["Management Fees","EXPENSE","MGMT"], ["Management Fee","EXPENSE","MGMT"],
  ["Trash Removal","EXPENSE","TRSH"], ["Valet Trash","EXPENSE","TRSH"], ["Rubbish Removal/Sanitation","EXPENSE","TRSH"], ["Trash Removal Contract","EXPENSE","TRSH"],
  ["Cable TV","EXPENSE","CAB"], ["Cable","EXPENSE","CAB"],
  ["Parking Lot Lease","EXPENSE","PLL"]
];
var covered = {};
CASES.forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], "");
  eq(r.code, c[2], JSON.stringify(c[0]) + " [" + c[1] + "] → " + c[2]);
  ok(r.confident, "    …and confident");
  ok(T12.classify(c[0], c[1], "") === r.code, "    …classify() agrees");
  ok(T12.roleOf(r.code) === (c[1] === "EXPENSE" ? "expense" : "income"), "    …role matches the printed section");
  covered[c[2]] = 1;
});
var produced = INC.concat(EXP).filter(function (c){ return covered[c]; });
eq(produced.length, 31, "31 of the 32 taxonomy codes are produced by a representative label (TRSH COL has no rule — see report)");
ok(!covered["TRSH COL"], "TRSH COL is the one code no rule produces");

// ---------------------------------------------------------------- 3. hierarchy honored
section("statement hierarchy (sub-section header) is honored");
var H = [
  ["Elevator Contract","EXPENSE","CONTRACT REPAIRS","CS"], ["Elevator Contract","EXPENSE","REPAIRS & MAINTENANCE","RM"],
  ["Valet Trash","EXPENSE","REPAIRS & MAINTENANCE","TRSH"], ["Valet Trash","EXPENSE","CONTRACT SERVICES","TRSH"],
  ["Trash","EXPENSE","UTILITIES","TRSH"], ["Trash","INCOME","OTHER INCOME","TRSH RUB"],
  ["Water/Sewer","INCOME","OTHER INCOME","RUBS"], ["Water Expense","EXPENSE","UTILITIES","UTIL"],
  ["Gas","EXPENSE","AUTO EXPENSE","GA"], ["Gas","EXPENSE","UTILITIES","UTIL"],
  ["Parking","EXPENSE","AUTO EXPENSE","GA"], ["Parking Income","INCOME","OTHER INCOME","PARK"],
  ["Payroll Services","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Payroll- Leasing","EXPENSE","Admin. salaries","PAY"],
  ["Employee Concession","INCOME","OTHER INCOME","EMPL"], ["Resident Satisfaction Concession","INCOME","OTHER INCOME","CONC"],
  ["Cable","INCOME","OTHER INCOME","OTH"], ["Cable","EXPENSE","UTILITIES","CAB"], ["DSL Internet Line/Phones","EXPENSE","UTILITIES","CAB"],
  ["Late Fee","EXPENSE","OTHER EXPENSES","GA"], ["Late Fees","INCOME","OTHER INCOME","LATE"],
  ["Online Marketing Expense","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","MKT"], ["Resident Events","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"],
  ["Bad debts expense","EXPENSE","OTHER EXPENSES","BD"],
  ["Real Estate Taxes","EXPENSE","TAXES AND INSURANCE","RET"], ["Property & Liability","EXPENSE","TAXES AND INSURANCE","INS"],
  ["Worker's Comp","EXPENSE","TAXES AND INSURANCE","PAY"], ["Income taxes","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"],
  ["Property Tax","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","RET"], ["Legal L & T","EXPENSE","PROFESSIONAL FEES","GA"],
  ["Violation Penalty","EXPENSE","VIOLATION","GA"], ["Violation supplies","EXPENSE","VIOLATION","GA"],
  ["Snow Removal Contract","EXPENSE","REPAIRS & MAINTENANCE","RM"],       // documented design: under an R&M header a contract is RM
  ["COMMERCIAL RENT","INCOME","RENTAL INCOME","COM"], ["CAM Income","INCOME","RENTAL INCOME","CAM"], ["Antenna Income","INCOME","RENTAL INCOME","ANT"],
  ["Antenna Reimbursement Revenue","INCOME","RENTAL INCOME","ANT"], ["Rev Share","INCOME","RENTAL INCOME","OTH"], ["Old Rent","INCOME","RENTAL INCOME","GPR"],
  ["Estoppel Fee","INCOME","RENTAL INCOME","OTH"], ["Section 8","INCOME","RENTAL INCOME","GPR"], ["HUD Credit","INCOME","RENTAL INCOME","GPR"],
  ["Pet Rent","INCOME","RENTAL INCOME","PET"], ["Month to Month","INCOME","RENTAL INCOME","MTM"], ["Vacancy Loss-Model","INCOME","RENTAL INCOME","MOD"],
  ["Delinquency","INCOME","RENTAL INCOME","BD"], ["Resident Manager Credit","INCOME","RENTAL INCOME","EMPL"], ["SELLER ARREARS","INCOME","RENTAL INCOME","OTH"],
  ["Miscellaneous","EXPENSE","MISCELLANEOUS EXPENSES","GA"],               // an expense MISC group must not fall into the MISC income group
  ["Security Deposit Refunds","INCOME","SECURITY DEPOSITS","OTH"],
  ["Trash Recovery","INCOME","COST RECOVERY","TRSH RUB"], ["Electric Recovery","INCOME","COST RECOVERY","RUBS"],
  ["Retail Rent","INCOME","COMMERCIAL","COM"], ["CAM Charges","INCOME","COMMERCIAL","CAM"]
];
H.forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], c[2]);
  eq(r.code, c[3], JSON.stringify(c[0]) + " under [" + c[2] + "] → " + c[3]);
  ok(r.confident, "    …and confident");
});
eq(T12.subMatch("valet trash", "REPAIRS & MAINTENANCE"), "TRSH", "subMatch(): trash under R&M → TRSH");
eq(T12.subMatch("anything", ""), null, "subMatch(): no header → null");
eq(T12.subMatch("anything", "UNRECOGNIZED HEADER"), null, "subMatch(): unknown header → null (keyword rules take over)");
eq(T12.classifyConfident("Zzyzx", "EXPENSE", "GENERAL AND ADMINISTRATIVE EXPENSES").confident, true, "a recognized header places even a meaningless name (confident)");

// ---------------------------------------------------------------- 4. null / low-confidence surfacing
section("null and low-confidence lines are surfaced");
eq(T12.classify("", "INCOME"), null, "classify(\"\") → null");
eq(T12.classify(null, "EXPENSE"), null, "classify(null) → null");
eq(JSON.stringify(T12.classifyConfident("")), JSON.stringify({ code:null, confident:false }), "classifyConfident(\"\") → {null,false}");
[["Zzyzx","INCOME","OTH"], ["Zzyzx","EXPENSE","GA"], ["Zzyzx","","OTH"],
 ["Opening Balance Difference","EXPENSE","GA"], ["Security Difference","EXPENSE","GA"],
 ["Old Code Do Not Use - Wells Depository","INCOME","OTH"], ["Linden Loans Receivable","INCOME","OTH"],
 ["Capital Improvement","EXPENSE","GA"], ["Gut renovation","EXPENSE","GA"]
].forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], "");
  ok(r.code === c[2] && r.confident === false, JSON.stringify(c[0]) + " [" + c[1] + "] → " + c[2] + " low-confidence (surfaced for review)");
});
// the section fallback survives a header that the hierarchy does not know
var u = T12.classifyConfident("Opening Balance Difference", "EXPENSE", "OPENING EXPENSE");
ok(u.code === "GA" && !u.confident, "unknown header + bookkeeping plug → GA, low-confidence");

// ---------------------------------------------------------------- 5. determinism & normalization
section("deterministic, order-independent, whitespace/case-insensitive");
var run = function (list){ return list.map(function (c){ return T12.classify(c[0], c[1], c[2] || ""); }).join("|"); };
var all = CASES.concat(H);
eq(run(all), run(all), "same input twice → identical codes");
eq(run(all.slice().reverse()), run(all).split("|").reverse().join("|"), "reversed order → identical codes (no shared state)");
eq(T12.classify("  REAL   ESTATE\tTAXES ", "expense"), "RET", "case/whitespace normalized: \"  REAL   ESTATE\\tTAXES \" → RET");
eq(T12.classify("real estate taxes", "Expenses", "taxes  and   insurance"), "RET", "sub-header whitespace/case normalized");
eq(T12.classify("Payroll- Leasing", "EXPENSE", "Admin. salaries"), "PAY", "mixed-case sub-header (\"Admin. salaries\") recognized");

// ---------------------------------------------------------------- 6. synthetic statement → parseGrid → fromParse (residual accounting)
section("synthetic statement through SetupBuilder.fromParse — sums and the reconcile plug to the cent");
function grid(incomeTotal, expenseTotal){
  var R = function (name, amt){ return amt == null ? [name] : [name, 1, 2, 3, amt]; };
  return [
    ["Synthetic Gardens"], ["Statement (12 months)"], [], [],
    ["Account", "Jan 2025", "Feb 2025", "Mar 2025", "Total"],
    R("INCOME"), R("RENTAL INCOME"),
    R("Market Rent", 1200000.00), R("Less: Vacancy", -60000.00), R("Concessions", -12000.00), R("Employee Concession", -6000.00),
    R("TOTAL RENTAL INCOME", 1122000.00),
    R("OTHER INCOME"),
    R("Water/Sewer", 40000.00), R("Trash", 9000.00), R("Pet Rent", 5000.00), R("Late Fees", 2500.00), R("Cable", 1200.00), R("Laundry", 800.00),
    R("TOTAL OTHER INCOME", 58500.00),
    R("TOTAL INCOME", incomeTotal),
    R("EXPENSES"),
    R("TAXES AND INSURANCE"), R("Real Estate Taxes", 150000.00), R("Property Insurance", 45000.00),
    R("UTILITIES"), R("Electric", 30000.00), R("Water & Sewer", 42000.00), R("Trash", 8000.00),
    R("REPAIRS & MAINTENANCE"), R("Repairs - Plumbing", 12000.00), R("Valet Trash", 6000.00),
    R("CONTRACT SERVICES"), R("Landscaping Contract", 15000.00),
    R("PAYROLL"), R("Salaries", 120000.00),
    R("GENERAL AND ADMINISTRATIVE EXPENSES"), R("Office Supplies", 3000.00), R("Online Marketing Expense", 7000.00),
    R("MANAGEMENT FEES"), R("Management Fees", 35000.00),
    R("OTHER EXPENSES"), R("Bad Debt", 4000.00), R("Parking Lot Lease", 2000.00),
    R("TOTAL EXPENSES", expenseTotal),
    R("NET OPERATING INCOME", incomeTotal - expenseTotal),
    R("Interest Expense", 300000.00), R("NET INCOME", incomeTotal - expenseTotal - 300000.00)
  ];
}
function sumRole(sums, role){ return Object.keys(sums).reduce(function (a, k){ return a + (T12.roleOf(k) === role ? sums[k] : 0); }, 0); }
function rawSums(parsed){   // what fromParse sees before it plugs: every classified line, by printed section
  var inc = 0, exp = 0;
  parsed.rows.forEach(function (r){ if (T12.classify(r.name, r.section, r.sub) == null) return; if (/EXP/.test(r.section)) exp += r.amount; else inc += r.amount; });
  return { inc: inc, exp: exp };
}
// (a) a statement whose printed totals differ from its own lines by a known amount
var p1 = T12Parse.parseGrid(grid(1180512.34, 478995.00));
eq(p1.rows.length, 24, "parser: 24 detail lines — 10 income + 14 expense (headers/subtotals skipped, below-the-line rows ignored)");
eqCents(p1.totals.income, 1180512.34, "parser: TOTAL INCOME");
eqCents(p1.totals.expense, 478995.00, "parser: TOTAL EXPENSES");
eqCents(p1.totals.noi, 701517.34, "parser: NET OPERATING INCOME");
ok(p1.rows.every(function (r){ return T12.classify(r.name, r.section, r.sub) != null; }), "every detail line receives a code");
var raw1 = rawSums(p1);
eqCents(raw1.inc, 1180500.00, "classified income lines sum");
eqCents(raw1.exp, 479000.00, "classified expense lines sum");
var f1 = SB.fromParse(p1);
var want1 = { GPR:1200000.00, VAC:-60000.00, CONC:-12000.00, EMPL:-6000.00, RUBS:40000.00, "TRSH RUB":9000.00, PET:5000.00, LATE:2500.00,
              OTH:2012.34,     // Cable 1,200 + Laundry 800 + the 12.34 reconcile plug
              RET:150000.00, INS:45000.00, UTIL:72000.00, TRSH:14000.00, RM:12000.00, CS:15000.00, PAY:120000.00,
              GA:6995.00,      // Office Supplies 3,000 + Bad Debt 4,000 folded to the expense side − the 5.00 reconcile plug
              MKT:7000.00, MGMT:35000.00, PLL:2000.00 };
Object.keys(want1).forEach(function (k){ eqCents(f1.sums[k] || 0, want1[k], "fromParse sums." + k); });
eq(Object.keys(f1.sums).sort().join(","), Object.keys(want1).sort().join(","), "no other codes present (BD folded into GA on the expense side)");
eqCents(p1.totals.income - raw1.inc, 12.34, "plug into OTH (printed − classified income)");
eqCents(p1.totals.expense - raw1.exp, -5.00, "plug into GA (printed − classified expense)");
eqCents(sumRole(f1.sums, "income"), 1180512.34, "income-role codes reconcile to TOTAL INCOME");
eqCents(sumRole(f1.sums, "expense"), 478995.00, "expense-role codes reconcile to TOTAL EXPENSES");
eqCents(f1.inPlaceNOI, 701517.34, "inPlaceNOI = printed NET OPERATING INCOME");
// (b) the same statement, internally consistent → no plug at all
var p2 = T12Parse.parseGrid(grid(1180500.00, 479000.00)), f2 = SB.fromParse(p2), raw2 = rawSums(p2);
eqCents(p2.totals.income - raw2.inc, 0, "consistent statement: plug into OTH");
eqCents(p2.totals.expense - raw2.exp, 0, "consistent statement: plug into GA");
eqCents(f2.sums.OTH, 2000.00, "consistent statement: OTH is exactly its lines");
eqCents(f2.sums.GA, 7000.00, "consistent statement: GA is exactly its lines");
eqCents(f2.inPlaceNOI, 701500.00, "consistent statement: NOI");

// ---------------------------------------------------------------- 7. Crest fixture
section("Crest fixture (test/fixtures/crest-t12.xlsx)");
var FIX = path.join(ROOT, "test", "fixtures", "crest-t12.xlsx");
if (!fs.existsSync(FIX)) {
  console.log("  skipped: fixture missing (" + FIX + ")");
} else {
  var XLSX = require(path.join(ROOT, "vendor", "xlsx.full.min.js"));
  var wb = XLSX.read(fs.readFileSync(FIX), { type: "buffer" });
  var ws = wb.Sheets["Report1"] || wb.Sheets[wb.SheetNames[0]];
  var parsed = T12Parse.parseGrid(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }));
  eqCents(parsed.totals.income, 18323614.31, "printed TOTAL INCOME");
  eqCents(parsed.totals.expense, 8840010.03, "printed TOTAL EXPENSES");
  eqCents(parsed.totals.noi, 9483604.28, "printed NET OPERATING INCOME");
  eq(parsed.rows.length, 610, "610 detail lines");

  // (b) coverage: every line gets a code, classify()/classifyConfident() agree, low-confidence list is exactly the bookkeeping accounts
  var low = [], nulls = 0, agree = true;
  parsed.rows.forEach(function (r){
    var c = T12.classify(r.name, r.section, r.sub), rc = T12.classifyConfident(r.name, r.section, r.sub);
    if (c == null) nulls++;
    if (c !== rc.code) agree = false;
    if (!rc.confident) low.push(r.name + " (" + r.section + (r.sub ? " / " + r.sub : "") + ") " + money(r.amount) + " → " + rc.code);
  });
  eq(nulls, 0, "null codes: 0 of 610");
  ok(agree, "classify() and classifyConfident().code agree on every line");
  var WANT_LOW = ["Old Code Do Not Use - Wells Depository (INCOME) 0.00 → OTH", "Linden Loans Receivable (INCOME) 0.00 → OTH",
                  "Security Difference (EXPENSE / OPENING EXPENSE) 0.00 → GA", "Opening Balance Difference (EXPENSE / OPENING EXPENSE) 0.00 → GA"];
  eq(low.join("\n"), WANT_LOW.join("\n"), "low-confidence lines: exactly the 4 balance-sheet/plug accounts, all $0.00");
  low.forEach(function (l){ console.log("         low-confidence: " + l); });

  // (a) reconcile: the plug fromParse needs, then the section sums
  var raw = rawSums(parsed), plugOTH = parsed.totals.income - raw.inc, plugGA = parsed.totals.expense - raw.exp;
  console.log("         residual plugged into OTH: " + money(plugOTH) + "   into GA: " + money(plugGA));
  eqCents(plugOTH, 0, "plug into OTH is $0.00 (every income line classified; statement foots)");
  eqCents(plugGA, 0, "plug into GA is $0.00 (every expense line classified; statement foots)");
  var fp = SB.fromParse(parsed);
  eqCents(sumRole(fp.sums, "income"), 18323614.31, "income-role sums reconcile to TOTAL INCOME");
  eqCents(sumRole(fp.sums, "expense"), 8840010.03, "expense-role sums reconcile to TOTAL EXPENSES");
  eqCents(fp.inPlaceNOI, 9483604.28, "inPlaceNOI = printed NOI");
  eqCents(sumRole(fp.sums, "income") - sumRole(fp.sums, "expense"), 9483604.28, "built income − expense = printed NOI");

  // the statement's own internal consistency: each printed category subtotal equals its detail lines
  var SUBS = { "RENTAL INCOME":16948753.52, "OTHER INCOME":1374860.79, "AUTO EXPENSE":13129.66, "GENERAL AND ADMINISTRATIVE EXPENSES":326901.25,
               "MANAGEMENT FEES":550512.58, "PROFESSIONAL FEES":177463.22, "TAXES AND INSURANCE":4200839.01, "REPAIRS & MAINTENANCE":1223379.37,
               "OTHER EXPENSES":491977.79, "Admin. salaries":1092532.68, "UTILITIES":757274.47, "VIOLATION":6000.00 };
  Object.keys(SUBS).forEach(function (s){
    var det = parsed.rows.reduce(function (a, r){ return a + (r.sub === s ? r.amount : 0); }, 0);
    var printed = parsed.categories.some(function (c){ return Math.abs(c.amount - SUBS[s]) < 0.005; });
    ok(printed, "printed subtotal " + money(SUBS[s]) + " exists for [" + s + "]");
    eqCents(det, SUBS[s], "detail lines under [" + s + "] foot to it");
  });

  // per-code sums (hand-derived from the fixture's own lines)
  var WANT = { GPR:18182259.31, EMPL:-94566.03, MOD:-84244.00, VAC:-1100066.34, CONC:-149392.64, BD:0,
               RUBS:654856.77, "TRSH RUB":237057.20, PARK:0, PET:37663.98, MTM:68069.11, LATE:73750.00, APP:27185.39, ADM:80535.00,
               AMEN:260057.81, COM:0, CAM:0, ANT:0, OTH:130448.75,
               RET:3630730.07, INS:570108.94, UTIL:757274.47, RM:1005176.69, PAY:1092532.68, MGMT:550512.58, GA:942784.30,
               MKT:72687.62, TRSH:218202.68, CAB:0, PLL:0 };
  Object.keys(WANT).forEach(function (k){ eqCents(fp.sums[k] || 0, WANT[k], "Crest sums." + k); });
  eq(Object.keys(fp.sums).sort().join(","), Object.keys(WANT).sort().join(","), "exactly these codes present (no CS header on Crest; TRSH COL unproduced)");
  // a few lines that prove the section/sub hints drive the code on the real statement
  var line = function (name, sub){ var r = parsed.rows.filter(function (x){ return x.name === name && (sub == null || x.sub === sub); })[0]; return r ? T12.classify(r.name, r.section, r.sub) : "(missing)"; };
  eq(line("Water/Sewer", "OTHER INCOME"), "RUBS", "Crest: \"Water/Sewer\" under OTHER INCOME → RUBS (606,314.75)");
  eq(line("Trash", "OTHER INCOME"), "TRSH RUB", "Crest: \"Trash\" under OTHER INCOME → TRSH RUB (237,057.20)");
  eq(line("Employee Concession", "OTHER INCOME"), "EMPL", "Crest: \"Employee Concession\" under OTHER INCOME → EMPL (−94,566.03)");
  eq(line("Valet Trash", "REPAIRS & MAINTENANCE"), "TRSH", "Crest: \"Valet Trash\" under R&M → TRSH");
  eq(line("Snow Removal Contract", "REPAIRS & MAINTENANCE"), "RM", "Crest: \"Snow Removal Contract\" under R&M → RM (hierarchy wins over the contract keyword)");
  eq(line("Gas", "AUTO EXPENSE"), "GA", "Crest: \"Gas\" under AUTO EXPENSE → GA, not UTIL");
  eq(line("Payroll Services", "GENERAL AND ADMINISTRATIVE EXPENSES"), "GA", "Crest: \"Payroll Services\" under G&A → GA, not PAY");
  eq(line("Management Fees", "OTHER INCOME"), "OTH", "Crest: \"Management Fees\" under OTHER INCOME → OTH, not MGMT");
  eq(line("Violation Penalty", "VIOLATION"), "GA", "Crest: \"Violation Penalty\" under VIOLATION → GA");

  // (d) deterministic on the real statement: reversed order and a second pass give identical codes
  var codes = parsed.rows.map(function (r){ return T12.classify(r.name, r.section, r.sub); });
  var again = parsed.rows.slice().reverse().map(function (r){ return T12.classify(r.name, r.section, r.sub); }).reverse();
  eq(codes.join("|"), again.join("|"), "Crest: codes identical on a reversed second pass");
}

console.log("\n" + (fails ? "FAILED " + fails + " of " + total : "all " + total + " passed"));
process.exit(fails ? 1 : 0);
