/* Tests for the 2.9.2 underwriting BASIS parameter of SetupBuilder.buildSetup.
   Borrower case (default): vacancy & management priced at the BETTER of assumption vs statement (min).
   Lender case: at the WORSE (max — vacancy no lower than the assumption, management no lower).
   Every expected figure is worked by hand in the comments; none is read back from the module.
   Run:  node test/basis.test.js */
"use strict";
var path = require("path");
global.window = {};
var SB = require(path.join(__dirname, "..", "setup-builder.js"));
delete global.window;

var pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } }
function near(a, b){ return typeof a === "number" && isFinite(a) && Math.abs(a - b) <= 0.005; }
function cents(got, want, m){ ok(near(got, want), m + "  [got " + got + ", want " + want + "]"); }
function eq(got, want, m){ ok(got === want, m + "  [got " + JSON.stringify(got) + ", want " + JSON.stringify(want) + "]"); }
function ratio(got, want, m){ ok(typeof got === "number" && Math.abs(got - want) <= 1e-9, m + "  [got " + got + ", want " + want + "]"); }

var BENCH = { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200, budget: {},
  sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30 } };

// ── Fixture A: the statement runs a TIGHTER vacancy (3%) than the 5% assumption ──
// GPR 1,000,000; VAC −30,000 (= 3% of the 1,000,000 rental base); RET 50,000 pass-through; 100 units.
// In-place NOI (basis-independent): ERI 970,000 − RET 50,000 − reserves 0 = 920,000.
// The management fee is ALWAYS underwritten at the assumption (2.5% of EGI) even with no statement MGMT line.
// Borrower underwritten: VAC = min(3%,5%) = 3% → −30,000; EGI 970,000; − RET 50,000 − MGMT(2.5%×970,000=24,250) − reserves(200×100=20,000) = 875,750.
// Lender  underwritten: VAC = max(3%,5%) = 5% → −50,000; EGI 950,000; − 50,000 − MGMT(2.5%×950,000=23,750) − 20,000 = 856,250 (diff 19,500: +20,000 vacancy, −500 mgmt on the lower EGI).
var A = { GPR: 1000000, VAC: -30000, RET: 50000 };

console.log("\nFixture A — actual vacancy 3% is BELOW the 5% assumption");
var bBorrow = SB.buildSetup({ categorySums: A, units: 100, benchmarks: BENCH, basis: "borrower" });
var bLender = SB.buildSetup({ categorySums: A, units: 100, benchmarks: BENCH, basis: "lender" });
var bDefault = SB.buildSetup({ categorySums: A, units: 100, benchmarks: BENCH });   // no basis given

eq(bBorrow.effective.basis, "borrower", "effective.basis is 'borrower'");
eq(bLender.effective.basis, "lender", "effective.basis is 'lender'");
cents(bBorrow.result.inPlace.noi, 920000, "in-place NOI is 920,000 (Borrower) — statement actual");
cents(bLender.result.inPlace.noi, 920000, "in-place NOI is 920,000 (Lender) — identical; in-place never repriced");

cents(bBorrow.result.underwritten.noi, 875750, "Borrower underwritten NOI = 875,750 (credits the proven 3% vacancy)");
cents(bLender.result.underwritten.noi, 856250, "Lender underwritten NOI = 856,250 (holds vacancy to the 5% floor)");
cents(bBorrow.result.underwritten.noi - bLender.result.underwritten.noi, 19500, "Lender is 19,500 below Borrower — the 2% vacancy floor (20,000) net of 500 less mgmt fee on the lower EGI");
ok(bLender.result.underwritten.noi < bBorrow.result.underwritten.noi, "Lender underwritten NOI < Borrower underwritten NOI");

ratio(bBorrow.effective.vacancy, 0.03, "Borrower prices vacancy at the statement's 3%");
ratio(bLender.effective.vacancy, 0.05, "Lender prices vacancy at the 5% floor");
ok(bBorrow.effective.vacancyFromActual === true, "Borrower: vacancy is 'from actual' (the proven figure was better)");
ok(bLender.effective.vacancyFromActual === false, "Lender: vacancy is NOT from actual (held to the assumption floor)");

// default === borrower, byte-for-byte
cents(bDefault.result.underwritten.noi, 875750, "no basis given defaults to Borrower (875,750)");
eq(JSON.stringify(bDefault.result.underwritten), JSON.stringify(bBorrow.result.underwritten), "default underwritten block equals Borrower's");

// ── basis rides in benchmarks.basis, and an explicit input.basis overrides ──
console.log("\nbasis plumbing");
var viaBench = SB.buildSetup({ categorySums: A, units: 100, benchmarks: Object.assign({}, BENCH, { basis: "lender" }) });
cents(viaBench.result.underwritten.noi, 856250, "basis carried inside benchmarks.basis reaches the engine (Lender 856,250)");
var override = SB.buildSetup({ categorySums: A, units: 100, benchmarks: Object.assign({}, BENCH, { basis: "lender" }), basis: "borrower" });
cents(override.result.underwritten.noi, 875750, "explicit input.basis overrides benchmarks.basis (Borrower wins → 875,750)");

// ── Fixture B: the statement runs a LOOSER vacancy (7%) than the 5% assumption ──
// Borrower holds to the 5% floor (min); Lender uses the worse actual 7% (max).
console.log("\nFixture B — actual vacancy 7% is ABOVE the 5% assumption");
var B = { GPR: 1000000, VAC: -70000, RET: 50000 };
var bB_borrow = SB.buildSetup({ categorySums: B, units: 100, benchmarks: BENCH, basis: "borrower" });
var bB_lender = SB.buildSetup({ categorySums: B, units: 100, benchmarks: BENCH, basis: "lender" });
ratio(bB_borrow.effective.vacancy, 0.05, "Borrower holds vacancy to the 5% assumption (better than the 7% actual)");
ratio(bB_lender.effective.vacancy, 0.07, "Lender uses the worse actual 7%");
// Borrower: VAC 5% → −50,000; EGI 950,000 − 50,000 − MGMT(23,750) − 20,000 = 856,250.  Lender: VAC 7% → −70,000; EGI 930,000 − 50,000 − MGMT(23,250) − 20,000 = 836,750.
cents(bB_borrow.result.underwritten.noi, 856250, "Borrower underwritten NOI = 856,250 (5% floor)");
cents(bB_lender.result.underwritten.noi, 836750, "Lender underwritten NOI = 836,750 (7% actual)");
ok(bB_lender.result.underwritten.noi <= bB_borrow.result.underwritten.noi, "Lender NOI <= Borrower NOI in both directions of the vacancy gap");

// ── Bad debt & concessions (the 4th assumption, 1%): Borrower passes the statement's actual through
//    (reference numbers unchanged); Lender floors it at the assumption. ──
console.log("\nFixture C — concessions 0.5% (BELOW the 1% assumption): Lender floors, Borrower keeps actual");
// GPR 1,000,000; CONC −5,000 (0.5%); RET 50,000; 100 units. VAC has no actual → 5% both (−50,000). MGMT 2.5% of EGI.
var C = { GPR: 1000000, CONC: -5000, RET: 50000 };
var cBorrow = SB.buildSetup({ categorySums: C, units: 100, benchmarks: BENCH, basis: "borrower" });
var cLender = SB.buildSetup({ categorySums: C, units: 100, benchmarks: BENCH, basis: "lender" });
cents(cBorrow.result.underwritten.lines.CONC, -5000, "Borrower keeps concessions at the statement's actual −5,000 (0.5%)");
cents(cLender.result.underwritten.lines.CONC, -10000, "Lender floors concessions at 1% → −10,000");
ratio(cBorrow.effective.badDebt, 0.005, "Borrower effective bad-debt rate = the actual 0.5%");
ratio(cLender.effective.badDebt, 0.01, "Lender effective bad-debt rate = the 1% floor");
ratio(cBorrow.effective.assumeBadDebt, 0.01, "the assumption is 1%");
// Borrower: EGI 945,000 − RET 50,000 − MGMT(2.5%×945,000=23,625) − reserves 20,000 = 851,375.
// Lender:   EGI 940,000 − 50,000 − MGMT(2.5%×940,000=23,500) − 20,000 = 846,500.
cents(cBorrow.result.underwritten.noi, 851375, "Borrower underwritten NOI = 851,375");
cents(cLender.result.underwritten.noi, 846500, "Lender underwritten NOI = 846,500 (extra 4,875 of concession floor, net of mgmt on lower EGI)");
ok(cLender.result.underwritten.noi < cBorrow.result.underwritten.noi, "Lender NOI < Borrower NOI when the concession floor binds");

console.log("\nFixture D — concessions 3% (ABOVE the 1% assumption): both keep the actual, reference numbers unchanged");
var D = { GPR: 1000000, CONC: -30000, RET: 50000 };
var dBorrow = SB.buildSetup({ categorySums: D, units: 100, benchmarks: BENCH, basis: "borrower" });
var dLender = SB.buildSetup({ categorySums: D, units: 100, benchmarks: BENCH, basis: "lender" });
cents(dBorrow.result.underwritten.lines.CONC, -30000, "Borrower keeps concessions at the actual −30,000 (never inflates NOI by capping at 1%)");
cents(dLender.result.underwritten.lines.CONC, -30000, "Lender keeps the worse actual −30,000 (the 1% floor doesn't reduce it)");
eq(JSON.stringify(dBorrow.result.underwritten.lines.CONC), JSON.stringify(dLender.result.underwritten.lines.CONC), "above the assumption, both bases agree on concessions — the number is the statement's own");

console.log("\n" + (fail ? (fail + " FAILED, " + pass + " passed") : ("all " + pass + " basis checks passed")));
process.exit(fail ? 1 : 0);
