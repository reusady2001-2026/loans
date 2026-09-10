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
var EXP = ["RET","INS","UTIL","PAY","GA","BDX","MKT","RM","CS","MGMT","TRSH","CAB","PLL"];
eq(Object.keys(T12.INCOME).sort().join(","), INC.slice().sort().join(","), "INCOME is exactly the 20 income codes");
eq(Object.keys(T12.EXPENSE).sort().join(","), EXP.slice().sort().join(","), "EXPENSE is exactly the 13 expense codes (incl. BDX)");
ok(INC.every(function (c){ return T12.roleOf(c) === "income"; }), "roleOf(income code) === \"income\" for all 20");
ok(EXP.every(function (c){ return T12.roleOf(c) === "expense"; }), "roleOf(expense code) === \"expense\" for all 13");
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
  ["Parking Lot Lease","EXPENSE","PLL"],
  // bad debt booked on the EXPENSE side is its own expense row; on the INCOME side it stays BD (tested above)
  ["Bad Debt","EXPENSE","BDX"], ["Bad debts expense","EXPENSE","BDX"], ["Bad Debt Recoveries","EXPENSE","BDX"], ["Write-Offs","EXPENSE","BDX"], ["Uncollectible Rent","EXPENSE","BDX"], ["Collection Loss","EXPENSE","BDX"]
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
eq(produced.length, 32, "32 of the 33 taxonomy codes are produced by a representative label (TRSH COL has no rule — see report)");
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
  ["Cable","INCOME","OTHER INCOME","OTH"], ["Cable","EXPENSE","UTILITIES","CAB"], ["DSL Internet Line/Phones","EXPENSE","UTILITIES","UTIL"],
  ["Late Fee","EXPENSE","OTHER EXPENSES","GA"], ["Late Fees","INCOME","OTHER INCOME","LATE"],
  ["Online Marketing Expense","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","MKT"], ["Resident Events","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"],
  ["Bad debts expense","EXPENSE","OTHER EXPENSES","BDX"], ["Bad Debt Recoveries","EXPENSE","OTHER EXPENSES","BDX"], ["Write-offs","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","BDX"],
  ["Bad Debt","EXPENSE","REPAIRS & MAINTENANCE","BDX"], ["Bad Debt","INCOME","RENTAL INCOME","BD"], ["Bad Debt Recovery","INCOME","OTHER INCOME","BD"],
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

// ---------------------------------------------------------------- 5b. critic items (grade B → A): one exact verdict each
section("critic items — exact verdicts");
// 1. roleOf is an own-property lookup: prototype names are not codes
["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"].forEach(function (k){ eq(T12.roleOf(k), "income", "1. roleOf(" + JSON.stringify(k) + ") → \"income\" (not an expense code)"); });
eq(T12.roleOf("RET"), "expense", "1. roleOf(\"RET\") → \"expense\" unchanged");
// 2. the specific income rows beat the generic "… rent income" capture on a FLAT statement
[["Pet Rent Income","PET"], ["Garage Rent Income","PARK"], ["Parking Rental Income","PARK"], ["Clubhouse Rental Income","AMEN"], ["Storage Rent","OTH"], ["Storage Locker Rent","OTH"],
 ["Month to Month Rent Income","MTM"], ["Gross Potential Rent","GPR"], ["Old Rent","GPR"], ["Loss to Lease","GPR"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "INCOME", ""); ok(r.code === c[1] && r.confident, "2. flat " + JSON.stringify(c[0]) + " [INCOME] → " + c[1] + " (confident)" + (r.code === c[1] ? "" : "   (got " + r.code + ")"));
});
[["Pet Rent","RENTAL INCOME","PET"], ["Garage Rent","RENTAL INCOME","PARK"], ["Storage Rent","RENTAL INCOME","OTH"], ["Market Rent","RENTAL INCOME","GPR"], ["Clubhouse Rental","OTHER INCOME","AMEN"], ["Storage Rent","OTHER INCOME","OTH"]].forEach(function (c){
  eq(T12.classify(c[0], "INCOME", c[1]), c[2], "2. headed " + JSON.stringify(c[0]) + " under [" + c[1] + "] → " + c[2]);
});
// 3. the three header carve-outs to TRSH share the keyword rule's repair/supply exclusion
[["Trash Bags","REPAIRS & MAINTENANCE","RM"], ["Dumpster Repair","REPAIRS & MAINTENANCE","RM"], ["Trash Chute Repair","REPAIRS & MAINTENANCE","RM"], ["Valet Trash","REPAIRS & MAINTENANCE","TRSH"],
 ["Dumpster Repair","CONTRACT SERVICES","CS"], ["Dumpster Service","CONTRACT SERVICES","TRSH"], ["American Waste Services","CONTRACT SERVICES","TRSH"],
 ["Trash Compactor Repair","UTILITIES","UTIL"], ["Trash","UTILITIES","TRSH"]].forEach(function (c){
  eq(T12.classify(c[0], "EXPENSE", c[1]), c[2], "3. " + JSON.stringify(c[0]) + " under [" + c[1] + "] → " + c[2]);
});
[["Trash Bags","RM"], ["Dumpster Repair","RM"], ["Trash Chute Repair","RM"], ["Trash Can Liners","RM"], ["Trash Removal","TRSH"]].forEach(function (c){
  eq(T12.classify(c[0], "EXPENSE", ""), c[1], "3. flat " + JSON.stringify(c[0]) + " [EXPENSE] → " + c[1]);
});
// 4. under UTILITIES only cable / satellite / TV / bulk internet are CAB; phones, DSL, office internet stay UTIL as filed
[["DSL Internet Line/Phones","UTIL"], ["Emergency Phone line","UTIL"], ["Office Internet","UTIL"], ["Elevator Phone Line","UTIL"], ["Cable","CAB"], ["Satellite TV","CAB"], ["Bulk Internet","CAB"]].forEach(function (c){
  eq(T12.classify(c[0], "EXPENSE", "UTILITIES"), c[1], "4. " + JSON.stringify(c[0]) + " under [UTILITIES] → " + c[1]);
});
// 5. a bookkeeping plug is surfaced (low-confidence, section fallback) even under a recognized header
[["Suspense Account","EXPENSE","REPAIRS & MAINTENANCE","GA"], ["Clearing Account","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Error Deposit","INCOME","OTHER INCOME","OTH"],
 ["Notes- Loan Payable Rep.Funding","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["PO Suspense Expense","EXPENSE","REPAIRS & MAINTENANCE","GA"], ["Opening Balance Difference","EXPENSE","OPENING EXPENSE","GA"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], c[2]); ok(r.code === c[3] && !r.confident, "5. " + JSON.stringify(c[0]) + " under [" + c[2] + "] → " + c[3] + " low-confidence (surfaced)" + (r.code === c[3] ? "" : "   (got " + r.code + ")"));
});
eq(T12.classify("Snow Clearing Contract", "EXPENSE", ""), "CS", "5. \"Snow Clearing Contract\" is a contract, not a clearing account");
var cap = T12.classifyConfident("Capital Improvement", "EXPENSE", "REPAIRS & MAINTENANCE");
ok(cap.code === "RM" && cap.confident, "5. left open by design: \"Capital Improvement\" under [REPAIRS & MAINTENANCE] keeps the header's row RM, confident (surfacing headed capex would add 4 Crest rows); un-headed capex stays low-confidence (§4)");
// 6. fee-type income codes carry the side guard on a flat EXPENSE line (fromParse folds them to GA; the review display must agree)
[["Application Fee","GA"], ["Employee Concession","GA"], ["Pet Fee","GA"], ["Amenity Fee","GA"], ["Admin Fee","GA"], ["Parking","GA"], ["Concessions","GA"], ["Month to Month","GA"]].forEach(function (c){
  eq(T12.classify(c[0], "EXPENSE", ""), c[1], "6. flat " + JSON.stringify(c[0]) + " [EXPENSE] → " + c[1]);
});
eq(T12.classify("Application Fee", "INCOME", ""), "APP", "6. …and \"Application Fee\" [INCOME] → APP unchanged");
eq(T12.classify("Bad debts expense", "EXPENSE", "OTHER EXPENSES"), "BDX", "6. headed \"Bad debts expense\" → BDX (expense-side bad debt has its own expense row; BD stays income-side)");
// 7. documented headed-vs-flat choices (header comment)
[["Late Fee - Taxes","TAXES AND INSURANCE","RET"], ["Late Fee - Taxes","","GA"], ["Life Insurance","TAXES AND INSURANCE","INS"], ["Software Contract","REPAIRS & MAINTENANCE","RM"], ["Software Contract","CONTRACT SERVICES","GA"],
 ["Resident Events","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Resident Events","","MKT"], ["Resident Retention","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Resident Retention","","MKT"]].forEach(function (c){
  eq(T12.classify(c[0], "EXPENSE", c[1]), c[2], "7. " + JSON.stringify(c[0]) + (c[1] ? " under [" + c[1] + "]" : " flat") + " → " + c[2]);
});

// ---------------------------------------------------------------- 5c. critic round 2 — exact verdicts
section("critic round 2 — exact verdicts");
// (1) skips / evictions / doubtful accounts are bad debt on both sides (BDX on the expense side, BD on the income side)
[["Skips & Evictions","EXPENSE","OTHER EXPENSES","BDX"], ["Skips and Evictions","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","BDX"], ["Allowance for Doubtful Accounts","EXPENSE","","BDX"], ["Evictions","EXPENSE","REPAIRS & MAINTENANCE","BDX"],
 ["Loss to Skips","INCOME","RENTAL INCOME","BD"], ["Skips and Evictions","INCOME","RENTAL INCOME","BD"], ["Allowance for Doubtful Accounts","INCOME","RENTAL INCOME","BD"], ["Skips & Evictions","INCOME","","BD"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], c[2]); ok(r.code === c[3] && r.confident, "r2-1. " + JSON.stringify(c[0]) + (c[2] ? " under [" + c[2] + "]" : " flat") + " [" + c[1] + "] → " + c[3] + " (confident)" + (r.code === c[3] ? "" : "   (got " + r.code + ")"));
});
eq(T12.classify("Eviction Fees", "INCOME", ""), "OTH", "r2-1. \"Eviction Fees\" [INCOME] is a fee charged back, not bad debt → OTH");
// (2) an insurance line or a payables service is not a bookkeeping plug; real plugs still are
[["Error and Omissions Insurance","EXPENSE","TAXES AND INSURANCE","INS"], ["Errors & Omissions","EXPENSE","","INS"], ["E&O Insurance","EXPENSE","","INS"], ["Accounts Payable Service Fee","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], c[2]); ok(r.code === c[3] && r.confident, "r2-2. " + JSON.stringify(c[0]) + (c[2] ? " under [" + c[2] + "]" : " flat") + " → " + c[3] + " (confident)" + (r.code === c[3] ? "" : "   (got " + r.code + (r.confident ? "" : " low") + ")"));
});
[["Error Deposit","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Notes- Loan Payable Rep.Funding","EXPENSE","GENERAL AND ADMINISTRATIVE EXPENSES","GA"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], c[2]); ok(r.code === c[3] && !r.confident, "r2-2. " + JSON.stringify(c[0]) + " under [" + c[2] + "] is still a plug → " + c[3] + " low-confidence");
});
// (3) the cost of collecting bad debt, and a non-operating write-off, are G&A — bad debt itself stays BDX
[["Bad Debt Collection Costs","GA"], ["Collection Agency Fees","GA"], ["Write-off of Fixed Assets","GA"], ["Bad Debt Recoveries","BDX"], ["Bad Debt","BDX"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "EXPENSE", ""); ok(r.code === c[1] && r.confident, "r2-3. flat " + JSON.stringify(c[0]) + " [EXPENSE] → " + c[1] + " (confident)" + (r.code === c[1] ? "" : "   (got " + r.code + (r.confident ? "" : " low") + ")"));
});
// (4) second, independent assertions: the BDX pre-header path (headers whose own carve-outs cannot produce BDX) and the fee-income side guard
[["Uncollectible Rent","GENERAL AND ADMINISTRATIVE EXPENSES"], ["Collection Loss","UTILITIES"], ["Write-offs","Admin. salaries"], ["Skips & Evictions","OTHER EXPENSES"]].forEach(function (c){
  eq(T12.classify(c[0], "EXPENSE", c[1]), "BDX", "r2-4. " + JSON.stringify(c[0]) + " under [" + c[1] + "] → BDX (only the pre-header check can place it)");
});
[["Application Fees","GA"], ["Rental Application Fee","GA"], ["App Fee","GA"], ["Admin Fees","GA"], ["Pet Deposit","GA"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "EXPENSE", ""); ok(r.code === c[1] && T12.roleOf(r.code) === "expense", "r2-4. flat " + JSON.stringify(c[0]) + " [EXPENSE] → " + c[1] + " (side guard)" + (r.code === c[1] ? "" : "   (got " + r.code + ")"));
});
eq(T12.classify("Application Fees", "INCOME", ""), "APP", "r2-4. …and \"Application Fees\" [INCOME] → APP");

// ---------------------------------------------------------------- 5d. critic round 3 — keyword-edge verdicts
section("critic round 3 — keyword-edge verdicts");
// (1) "skip" as bad debt is a skipped TENANT only — collections/equipment/court-cost uses are not bad debt
[["Skip Tracing","","GA"], ["Skip Tracing","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Dumpster / Skip Rental","","TRSH"], ["Skip Loader Rental","","GA"],
 ["Evictions - Court Costs","","GA"], ["Evictions - Court Costs","OTHER EXPENSES","GA"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "EXPENSE", c[1]); ok(r.code === c[2] && r.confident, "r3-1. " + JSON.stringify(c[0]) + (c[1] ? " under [" + c[1] + "]" : " flat") + " → " + c[2] + " (confident, not bad debt)" + (r.code === c[2] ? "" : "   (got " + r.code + (r.confident ? "" : " low") + ")"));
});
// …while genuine skipped-tenant / eviction bad debt is still BDX on the expense side, BD on the income side
[["Loss to Skips","EXPENSE","OTHER EXPENSES","BDX"], ["Skips & Evictions","EXPENSE","","BDX"], ["Evictions","EXPENSE","REPAIRS & MAINTENANCE","BDX"], ["Loss to Skips","INCOME","RENTAL INCOME","BD"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], c[1], c[2]); eq(r.code, c[3], "r3-1. " + JSON.stringify(c[0]) + (c[2] ? " under [" + c[2] + "]" : " flat") + " [" + c[1] + "] → " + c[3] + " (still bad debt)");
});
// (2) an eviction COST (guarded out of bad debt) now lands confidently in G&A instead of the low-confidence fallback
[["Eviction Costs",""], ["Eviction Expense",""], ["Eviction Legal Fees",""], ["Eviction Costs","OTHER EXPENSES"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "EXPENSE", c[1]); ok(r.code === "GA" && r.confident, "r3-2. " + JSON.stringify(c[0]) + (c[1] ? " under [" + c[1] + "]" : " flat") + " → GA (confident)" + (r.code === "GA" ? "" : "   (got " + r.code + (r.confident ? "" : " low") + ")"));
});
eq(T12.classify("Eviction Fees", "INCOME", ""), "OTH", "r3-2. \"Eviction Fees\" [INCOME] is still a fee charged back → OTH");
// (3) a receivable WRITE-OFF is bad debt, not a balance-sheet plug (the plug pre-check must not swallow it)
[["Accounts Receivable Write-off","OTHER EXPENSES"], ["Receivable Write-Off",""], ["A/R Write-off","OTHER EXPENSES"], ["Accounts Receivable Write off","GENERAL AND ADMINISTRATIVE EXPENSES"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "EXPENSE", c[1]); ok(r.code === "BDX" && r.confident, "r3-3. " + JSON.stringify(c[0]) + (c[1] ? " under [" + c[1] + "]" : " flat") + " → BDX (write-off beats the receivable plug word)" + (r.code === "BDX" ? "" : "   (got " + r.code + (r.confident ? "" : " low") + ")"));
});
// …but a bare receivable with no write-off is still a plug (low-confidence)
[["Accounts Receivable",""], ["Loans Receivable","OTHER INCOME"], ["Notes- Loan Payable Rep.Funding","GENERAL AND ADMINISTRATIVE EXPENSES"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], /INCOME/.test(c[1]) ? "INCOME" : "EXPENSE", c[1]); ok(!r.confident, "r3-3. " + JSON.stringify(c[0]) + " (no write-off) is still a plug → low-confidence");
});

// ---------------------------------------------------------------- 5e. critic round 4 — the write-off plug exception is qualifier-gated
section("critic round 4 — write-off plug exception is qualifier-gated");
// only a receivable / bad-debt / tenant / rent write-off escapes the plug rule → BDX
[["A/R Write-off","OTHER EXPENSES"], ["Accounts Receivable Write-off","OTHER EXPENSES"], ["Receivable Write-Off",""], ["Bad Debt Write-off","GENERAL AND ADMINISTRATIVE EXPENSES"], ["Tenant Write-off","OTHER EXPENSES"]].forEach(function (c){
  var r = T12.classifyConfident(c[0], "EXPENSE", c[1]); ok(r.code === "BDX" && r.confident, "r4. " + JSON.stringify(c[0]) + (c[1] ? " under [" + c[1] + "]" : " flat") + " → BDX (qualified write-off escapes the plug)" + (r.code === "BDX" ? "" : "   (got " + r.code + (r.confident ? "" : " low") + ")"));
});
// a genuine plug write-off (no receivable/bad-debt qualifier) stays a plug → GA low-confidence, even under G&A
["Suspense write-off", "Clearing write-off", "Opening Balance write-off", "Difference write-off", "Old Code write-off"].forEach(function (n){
  var r = T12.classifyConfident(n, "EXPENSE", "GENERAL AND ADMINISTRATIVE EXPENSES"); ok(r.code === "GA" && !r.confident, "r4. " + JSON.stringify(n) + " under [G&A] → GA low-confidence (still a plug)" + (r.code === "GA" ? (r.confident ? "   (was confident!)" : "") : "   (got " + r.code + ")"));
});
eq(T12.classifyConfident("Accounts Receivable", "EXPENSE", "").confident, false, "r4. bare \"Accounts Receivable\" (no write-off) is still a plug → low-confidence");
eq(T12.classify("Snow Clearing Contract", "EXPENSE", ""), "CS", "r4. \"Snow Clearing Contract\" unaffected by the widened clearing plug → CS");

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
              GA:2995.00,      // Office Supplies 3,000 − the 5.00 reconcile plug
              BDX:4000.00,     // Bad Debt booked under OTHER EXPENSES: its own expense row, not folded into GA
              MKT:7000.00, MGMT:35000.00, PLL:2000.00 };
Object.keys(want1).forEach(function (k){ eqCents(f1.sums[k] || 0, want1[k], "fromParse sums." + k); });
eq(Object.keys(f1.sums).sort().join(","), Object.keys(want1).sort().join(","), "no other codes present (expense-side Bad Debt is BDX, income-side BD absent)");
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
eqCents(f2.sums.GA, 3000.00, "consistent statement: GA is exactly its lines");
eqCents(f2.sums.BDX, 4000.00, "consistent statement: BDX is exactly its line");
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
                  "Error Deposit (INCOME / OTHER INCOME) 0.00 → OTH",
                  "Error Deposit (EXPENSE / GENERAL AND ADMINISTRATIVE EXPENSES) 0.00 → GA",
                  "Notes- Loan Payable Rep.Funding (EXPENSE / GENERAL AND ADMINISTRATIVE EXPENSES) 0.00 → GA",
                  "PO Suspense Expense (EXPENSE / REPAIRS & MAINTENANCE) 0.00 → GA",
                  "Security Difference (EXPENSE / OPENING EXPENSE) 0.00 → GA", "Opening Balance Difference (EXPENSE / OPENING EXPENSE) 0.00 → GA"];
  eq(low.join("\n"), WANT_LOW.join("\n"), "low-confidence lines: exactly the 8 balance-sheet/plug accounts (4 un-headed + 4 under recognized headers, surfaced by the PLUG pre-check), all $0.00");
  ok(low.every(function (l){ return / 0\.00 → /.test(l); }), "every low-confidence line is $0.00");
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
               RET:3630730.07, INS:570108.94, UTIL:757274.47, RM:1005176.69, PAY:1092532.68, MGMT:550512.58, GA:554599.61, BDX:388184.69,
               MKT:72687.62, TRSH:218202.68, PLL:0 };   // no CAB: the two $0 phone/DSL rows under UTILITIES stay UTIL (item 4)
  Object.keys(WANT).forEach(function (k){ eqCents(fp.sums[k] || 0, WANT[k], "Crest sums." + k); });
  eq(Object.keys(fp.sums).sort().join(","), Object.keys(WANT).sort().join(","), "exactly these codes present (no CS header on Crest; no CAB line; TRSH COL unproduced)");
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
  eq(line("DSL Internet Line/Phones", "UTILITIES"), "UTIL", "Crest sheet row 645: \"DSL Internet Line/Phones\" under UTILITIES → UTIL ($0.00; item 4)");
  eq(line("Emergency Phone line", "UTILITIES"), "UTIL", "Crest sheet row 653: \"Emergency Phone line\" under UTILITIES → UTIL ($0.00; item 4)");
  eq(line("Bad debts expense", "OTHER EXPENSES"), "BDX", "Crest sheet row 575: \"Bad debts expense\" under OTHER EXPENSES → BDX (415,390.18)");
  eq(line("Bad Debt Recoveries", "OTHER EXPENSES"), "BDX", "Crest sheet row 576: \"Bad Debt Recoveries\" under OTHER EXPENSES → BDX (−27,205.49)");
  var wrong = parsed.rows.filter(function (r){ var c = T12.classify(r.name, r.section, r.sub); return (T12.roleOf(c) === "expense") !== /EXP/.test(r.section); });
  eq(wrong.length, 0, "Crest: 0 wrong-side rows (every code's role matches the printed section)");
  eq(line("Rubbish Removal/Sanitation", "REPAIRS & MAINTENANCE"), "TRSH", "Crest: \"Rubbish Removal/Sanitation\" under R&M still TRSH (112,919.48; the item-3 exclusion does not fire)");
  [["Error Deposit","OTHER INCOME","OTH"], ["Error Deposit","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["Notes- Loan Payable Rep.Funding","GENERAL AND ADMINISTRATIVE EXPENSES","GA"], ["PO Suspense Expense","REPAIRS & MAINTENANCE","GA"]].forEach(function (c){
    var r = parsed.rows.filter(function (x){ return x.name === c[0] && x.sub === c[1]; })[0], v = r ? T12.classifyConfident(r.name, r.section, r.sub) : { code:"(missing)", confident:true };
    ok(v.code === c[2] && !v.confident && r.amount === 0, "Crest: \"" + c[0] + "\" under " + c[1] + " → " + c[2] + " low-confidence ($0.00; item 5)");
  });

  // (d) deterministic on the real statement: reversed order and a second pass give identical codes
  var codes = parsed.rows.map(function (r){ return T12.classify(r.name, r.section, r.sub); });
  var again = parsed.rows.slice().reverse().map(function (r){ return T12.classify(r.name, r.section, r.sub); }).reverse();
  eq(codes.join("|"), again.join("|"), "Crest: codes identical on a reversed second pass");
}

console.log("\n" + (fails ? "FAILED " + fails + " of " + total : "all " + total + " passed"));
process.exit(fails ? 1 : 0);
