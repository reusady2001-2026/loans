/* Tests for operating-calc.js (OPERATING-CONTRACT §4, acceptance P2).
   Plain node, no framework:  node test/operating-calc.test.js
   Every expected figure is worked BY HAND in the comments next to it — none is
   read back from the module under test. */
"use strict";
var fs = require("fs"), path = require("path");
var SRC = path.join(__dirname, "..", "operating-calc.js");

// The contract's UMD rule: module.exports AND window.<Name>. Fake a window
// before loading so the browser branch of the wrapper is exercised too.
global.window = {};
var Calc = require(SRC);
var windowExport = global.window.OperatingCalc;
delete global.window;
var UW = require(path.join(__dirname, "..", "underwriting.js"));   // only to prove sizing is a pass-through

var pass = 0, fail = 0;
function ok(cond, msg){ if (cond){ pass++; console.log("  ok   " + msg); } else { fail++; console.log("  FAIL " + msg); } }
function near(a, b, tol){ return typeof a === "number" && typeof b === "number" && isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol; }
function cents(got, want, msg){ ok(near(got, want, 0.005), msg + "  [got " + got + ", want " + want + "]"); }
function ratio(got, want, msg){ ok(near(got, want, 1e-12), msg + "  [got " + got + ", want " + want + "]"); }
function isNull(got, msg){ ok(got === null, msg + "  [got " + String(got) + "]"); }
function eq(got, want, msg){ ok(got === want, msg + "  [got " + JSON.stringify(got) + ", want " + JSON.stringify(want) + "]"); }
function same(got, want, msg){ ok(got === want, msg); }   // snapshot equality without echoing the whole snapshot
function deepEq(got, want, msg){ var g = JSON.stringify(got), w = JSON.stringify(want); ok(g === w, msg + "  [got " + g + ", want " + w + "]"); }
function section(t){ console.log("\n" + t); }
function line(annual, extra){ return Object.assign({ annual: annual, prevAnnual: null, controllable: true, source: "manual", updatedAt: "2026-09-07T00:00:00.000Z", note: null }, extra || {}); }

// The app's global bench, copied from index.html uwDefaults() (line 3152).
var BENCH = { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200, budget: {},
  sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30 } };

// ---------------------------------------------------------------------------
section("module shape");
ok(typeof Calc.derive === "function" && typeof Calc.effectiveNOI === "function" && typeof Calc.perLoan === "function" && typeof Calc.stack === "function", "exports derive / effectiveNOI / perLoan / stack");
ok(windowExport === Calc, "window.OperatingCalc is the same api object as module.exports");
var src = fs.readFileSync(SRC, "utf8");
ok(src.indexOf("localStorage") < 0 && src.indexOf("ldsHub") < 0, "source never references localStorage or the ldsHub stores");
var requireTargets = (src.match(/require\(\s*["'][^"']+["']\s*\)/g) || []).map(function (s){ return s.replace(/^require\(\s*["']|["']\s*\)$/g, ""); })
  .filter(function (t, i, a){ return a.indexOf(t) === i; }).sort();
deepEq(requireTargets, ["./setup-builder.js", "./underwriting.js"], "the set of ALL require() targets in the module is exactly {./setup-builder.js, ./underwriting.js}");
deepEq(Calc.DEFAULTS, BENCH, "DEFAULTS reproduces the app's uwDefaults().bench exactly");

// ---------------------------------------------------------------------------
section("derive — case A (hand-calc, 100 units, per-property overrides)");
// Record lines (annual $). Rental deductions stored NEGATIVE per §2.
var recA = { propKey: "name:a", propertyName: "A", units: 100, period: "T12",
  lines: { GPR: line(1200000), VAC: line(-60000), CONC: line(-12000), RUBS: line(48000), OTH: line(6500),
           RET: line(95000, { controllable: false }), INS: line(30000, { controllable: false }), UTIL: line(55000),
           RM: line(42000), PAY: line(88000), MGMT: line(34000), GA: line(12000) },
  assumptions: { vacancyPct: 0.07, mgmtPct: 0.03, reservePerUnit: 250,
                 sizing: { capRate: 0.06, ltvMax: 0.70, dscrMin: 1.25, dyMin: 0.08, intRate: 0.06, amortYears: 0 } },
  meta: { createdAt: "2026-09-07T00:00:00.000Z", lastUpdated: "2026-09-07T00:00:00.000Z", sourceFile: null } };
var snapA = JSON.stringify(recA), snapBench = JSON.stringify(BENCH);
var dA = Calc.derive(recA, BENCH);
// In-place (actuals):
//   ERI  = 1,200,000 − 60,000 − 12,000                                   = 1,128,000
//   other = 48,000 + 6,500                                               =    54,500
//   EGI  = 1,128,000 + 54,500                                            = 1,182,500
//   opex = 95,000 + 30,000 + 55,000 + 42,000 + 88,000 + 34,000 + 12,000  =   356,000
//   NOI  = 1,182,500 − 356,000                                           =   826,500
cents(dA.egi, 1182500, "in-place EGI = 1,182,500");
cents(dA.opex, 356000, "in-place opex = 356,000");
cents(dA.inPlaceNOI, 826500, "in-place NOI = 826,500");
// Underwritten (record overrides: vacancy 7%, mgmt 3%, reserves $250/unit):
//   VAC_uw  = −0.07 × 1,200,000                                          =   −84,000
//   ERI_uw  = 1,200,000 − 84,000 − 12,000 (CONC pass-through)            = 1,104,000
//   EGI_uw  = 1,104,000 + 54,500                                         = 1,158,500
//   MGMT_uw = 0.03 × 1,158,500                                           =    34,755
//   opex_uw = 95,000+30,000+55,000+42,000+88,000+12,000 (=322,000) + 34,755 =  356,755
//   reserves = 250 × 100                                                 =    25,000
//   NOI_uw  = 1,158,500 − 356,755 − 25,000                               =   776,745
cents(dA.egiUW, 1158500, "underwritten EGI = 1,158,500 (vacancy at 7% of GPR)");
cents(dA.opexUW, 356755, "underwritten opex = 356,755 (mgmt 3% of UW EGI, reserves excluded)");
cents(dA.reservesUW, 25000, "underwritten reserves = 25,000 ($250 × 100 units)");
cents(dA.underwrittenNOI, 776745, "underwritten NOI = 776,745");
cents(dA.underwrittenNOI, dA.egiUW - dA.opexUW - dA.reservesUW, "identity: underwrittenNOI = egiUW − opexUW − reservesUW");
cents(dA.result.underwritten.lines.VAC, -84000, "result.underwritten.lines.VAC = −84,000");
cents(dA.result.underwritten.lines.MGMT, 34755, "result.underwritten.lines.MGMT = 34,755");
cents(dA.result.underwritten.lines.reserves, 25000, "result.underwritten.lines.reserves = 25,000");
cents(dA.result.inPlace.reserves, 0, "in-place reserves = 0 (reserves as today: underwritten column only)");
ok(dA.egi !== dA.egiUW && dA.opex !== dA.opexUW, "egi/opex are the IN-PLACE figures, distinct from egiUW/opexUW");
eq(dA.units, 100, "units carried through");
eq(dA.hasLines, true, "hasLines true");
deepEq(dA.dropped, [], "every code on the record is a taxonomy code → dropped []");
deepEq(dA.categorySums, { GPR: 1200000, VAC: -60000, CONC: -12000, RUBS: 48000, OTH: 6500, RET: 95000, INS: 30000, UTIL: 55000, RM: 42000, PAY: 88000, MGMT: 34000, GA: 12000 }, "categorySums handed to the engine = { code: annual } verbatim");
var keysA = dA.worksheet.lines.map(function (l){ return l.key; });
ok(keysA.indexOf("GPR") === 0 && keysA.indexOf("VAC") > 0 && keysA.indexOf("MGMT") > 0 && keysA[keysA.length - 1] === "reserves", "worksheet has GPR first, VAC, MGMT, reserves last");
ok(keysA.indexOf("CONC") > 0 && keysA.indexOf("EMPL") < 0 && keysA.indexOf("BD") < 0, "worksheet carries only the lines present (CONC yes; EMPL/BD no)");
var vacLine = dA.worksheet.lines.filter(function (l){ return l.key === "VAC"; })[0];
ok(vacLine.method === "pctBase" && vacLine.param === 0.07 && vacLine.t12 === -60000, "VAC line: pctBase at the record's 7%, in-place −60,000");
// Sizing on the underwritten NOI with the record's sizing (amortYears 0 → interest-only constant = 6%):
//   value    = 776,745 / 0.06                    = 12,945,750
//   loanLTV  = 0.70 × 12,945,750                 =  9,062,025
//   loanDSCR = 776,745 / (1.25 × 0.06)           = 10,356,600
//   loanDY   = 776,745 / 0.08                    =  9,709,312.50
//   maxLoan  = min(...)                          =  9,062,025  → binding LTV
//   impliedLTV 0.70 ; impliedDSCR = 776,745 / (9,062,025 × 0.06) = 10/7 ; impliedDY = 776,745 / 9,062,025 = 3/35
cents(dA.sizing.value, 12945750, "sizing.value = 12,945,750");
cents(dA.sizing.loanLTV, 9062025, "sizing.loanLTV = 9,062,025");
cents(dA.sizing.loanDSCR, 10356600, "sizing.loanDSCR = 10,356,600");
cents(dA.sizing.loanDY, 9709312.5, "sizing.loanDY = 9,709,312.50");
cents(dA.sizing.maxLoan, 9062025, "sizing.maxLoan = 9,062,025");
eq(dA.sizing.binding, "LTV", "sizing.binding = LTV");
ratio(dA.sizing.impliedLTV, 0.70, "sizing.impliedLTV = 0.70");
ratio(dA.sizing.impliedDSCR, 10 / 7, "sizing.impliedDSCR = 10/7");
ratio(dA.sizing.impliedDebtYield, 3 / 35, "sizing.impliedDebtYield = 3/35");
deepEq(dA.sizing, UW.sizeLoan(dA.underwrittenNOI, dA.assumptions.sizing), "sizing is exactly Underwriting.sizeLoan(underwrittenNOI, effective sizing) — a pass-through, nothing re-derived");
deepEq(dA.assumptions, { vacancyPct: 0.07, mgmtPct: 0.03, reservePerUnit: 250, budget: {},
  sizing: { capRate: 0.06, ltvMax: 0.70, dscrMin: 1.25, dyMin: 0.08, intRate: 0.06, amortYears: 0 } }, "effective assumptions = record overrides over the bench");
same(JSON.stringify(recA), snapA, "derive did not mutate the record");
same(JSON.stringify(BENCH), snapBench, "derive did not mutate the global defaults");
var dA2 = Calc.derive(recA, BENCH);
ok(dA2.underwrittenNOI === dA.underwrittenNOI && dA2.inPlaceNOI === dA.inPlaceNOI && dA2.worksheet !== dA.worksheet, "deterministic, with a fresh worksheet per call");
dA.assumptions.sizing.capRate = 999; dA.assumptions.vacancyPct = 999;
ok(BENCH.sizing.capRate === 0.055 && recA.assumptions.sizing.capRate === 0.06 && recA.assumptions.vacancyPct === 0.07, "mutating derive().assumptions leaks into neither the bench nor the record");

// ---------------------------------------------------------------------------
section("derive — case B (EMPL/MOD/BD present, assumptions null → bench, 150 units)");
var recB = { propKey: "name:b", propertyName: "B", units: 150, period: null, assumptions: null,
  lines: { GPR: line(2000000), EMPL: line(-20000), MOD: line(-15000), VAC: line(-150000), CONC: line(-30000), BD: line(-10000),
           PARK: line(24000), RET: line(120000, { controllable: false }), MGMT: line(50000) } };
var dB = Calc.derive(recB, BENCH);
// In-place: ERI = 2,000,000 − 20,000 − 15,000 − 150,000 − 30,000 − 10,000 = 1,775,000 ; other 24,000 ;
//           EGI = 1,799,000 ; opex = 120,000 + 50,000 = 170,000 ; NOI = 1,629,000
cents(dB.egi, 1799000, "in-place EGI = 1,799,000");
cents(dB.opex, 170000, "in-place opex = 170,000");
cents(dB.inPlaceNOI, 1629000, "in-place NOI = 1,629,000");
// Underwritten at the bench (5% / 2.5% / $200):
//   VAC prices off the running subtotal GPR+EMPL+MOD = 1,965,000 → VAC_uw = −0.05 × 1,965,000 = −98,250 (NOT −100,000 off GPR alone)
//   ERI_uw = 1,965,000 − 98,250 − 30,000 − 10,000 = 1,826,750 ; EGI_uw = 1,850,750
//   MGMT_uw = 0.025 × 1,850,750 = 46,268.75 ; opex_uw = 120,000 + 46,268.75 = 166,268.75
//   reserves = 200 × 150 = 30,000 ; NOI_uw = 1,850,750 − 166,268.75 − 30,000 = 1,654,481.25
cents(dB.result.underwritten.lines.VAC, -98250, "VAC_uw = −98,250 (5% of GPR+EMPL+MOD, the running subtotal)");
cents(dB.egiUW, 1850750, "underwritten EGI = 1,850,750");
cents(dB.opexUW, 166268.75, "underwritten opex = 166,268.75");
cents(dB.reservesUW, 30000, "underwritten reserves = 30,000");
cents(dB.underwrittenNOI, 1654481.25, "underwritten NOI = 1,654,481.25");
deepEq(dB.assumptions, BENCH, "assumptions null → the bench verbatim");

// ---------------------------------------------------------------------------
section("derive — bench budget $/unit flows through (engine behaviour, unchanged)");
var benchBudget = JSON.parse(JSON.stringify(BENCH)); benchBudget.budget = { INS: 400 };
var recA2 = Object.assign({}, recA, { assumptions: { vacancyPct: 0.07, mgmtPct: 0.03, reservePerUnit: 250 } });
var dA3 = Calc.derive(recA2, benchBudget);
// INS_uw = 400 × 100 = 40,000 replaces the 30,000 actual → opex_uw = 356,755 − 30,000 + 40,000 = 366,755 ; NOI_uw = 1,158,500 − 366,755 − 25,000 = 766,745
cents(dA3.result.underwritten.lines.INS, 40000, "INS priced at $400/unit in the underwritten column");
cents(dA3.opexUW, 366755, "underwritten opex = 366,755");
cents(dA3.underwrittenNOI, 766745, "underwritten NOI = 766,745");
cents(dA3.opex, 356000, "in-place opex unchanged at 356,000");
deepEq(dA3.assumptions.sizing, BENCH.sizing, "sizing absent on the record → the bench's sizing");
cents(dA3.sizing.value, 766745 / 0.055, "sizing.value uses the bench cap rate 5.5% = 13,940,818.18");

// ---------------------------------------------------------------------------
section("mergeAssumptions — override beats global, null inherits, 0 overrides");
var m1 = Calc.mergeAssumptions(BENCH, { vacancyPct: null, mgmtPct: 0.04, sizing: { capRate: null, dyMin: 0.09 } });
deepEq(m1, { vacancyPct: 0.05, mgmtPct: 0.04, reservePerUnit: 200, budget: {},
  sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.09, intRate: 0.055, amortYears: 30 } }, "null fields inherit; set fields override; untouched sizing fields inherit");
deepEq(Calc.mergeAssumptions(BENCH, { sizing: null }), BENCH, "sizing: null inherits the whole sizing block");
deepEq(Calc.mergeAssumptions(BENCH, null), BENCH, "record assumptions null → bench");
deepEq(Calc.mergeAssumptions(BENCH, undefined), BENCH, "record assumptions undefined → bench");
deepEq(Calc.mergeAssumptions(undefined, { vacancyPct: 0.08 }), Object.assign({}, BENCH, { vacancyPct: 0.08 }), "no global bench → DEFAULTS underneath the override");
deepEq(Calc.mergeAssumptions({ vacancyPct: 0.09 }, null), Object.assign({}, BENCH, { vacancyPct: 0.09 }), "partial global bench is back-filled from DEFAULTS");
ok(Calc.mergeAssumptions(BENCH, null) !== BENCH && Calc.mergeAssumptions(BENCH, null).sizing !== BENCH.sizing, "merge output is a fresh deep copy");
var dZeroVac = Calc.derive(Object.assign({}, recA, { assumptions: { vacancyPct: 0 } }), BENCH);
// vacancyPct 0 is an OVERRIDE (not inherit): VAC_uw = 0 → ERI_uw = 1,200,000 − 12,000 = 1,188,000 ; EGI_uw = 1,242,500
cents(dZeroVac.result.underwritten.lines.VAC, 0, "vacancyPct: 0 is honoured as an override (VAC_uw = 0)");
cents(dZeroVac.egiUW, 1242500, "underwritten EGI at 0% vacancy = 1,242,500");
eq(dZeroVac.assumptions.mgmtPct, 0.025, "…while the other fields still inherit the bench");

// ---------------------------------------------------------------------------
section("effectiveNOI");
cents(Calc.effectiveNOI(recA), 826500, "record with lines → in-place NOI 826,500");
cents(Calc.effectiveNOI(recB), 1629000, "case B → 1,629,000");
isNull(Calc.effectiveNOI({ propKey: "x", units: 50, lines: {}, assumptions: null }), "empty lines map → null");
isNull(Calc.effectiveNOI({ propKey: "x", units: 50, lines: null }), "lines null → null");
isNull(Calc.effectiveNOI({}), "bare object → null");
isNull(Calc.effectiveNOI(null), "null record → null");
isNull(Calc.effectiveNOI(undefined), "undefined record → null");
eq(Calc.effectiveNOI({ lines: { GPR: line(0) } }), 0, "a single $0 line is still a line → 0, not null");
eq(Calc.effectiveNOI({ lines: { GPR: null } }), null, "a null line entry does not count as a line");
cents(Calc.effectiveNOI({ lines: { GPR: line("1,200,000"), RET: line("55000") } }), 1145000, "numeric strings are left to the engine's own coercion → 1,145,000");
var recNeg = { lines: { GPR: line(400000), RET: line(500000) } };
cents(Calc.effectiveNOI(recNeg), -100000, "negative in-place NOI is reported as entered (−100,000), not nulled");

// ---------------------------------------------------------------------------
section("derive — unknown / mis-cased codes are surfaced as `dropped`, never silently summed");
// buildSetup lays out only RENTAL/OTHER/EXPENSE codes, so FOO's 50,000 reaches no figure:
//   in-place EGI = NOI = 1,000,000 (GPR alone; MGMT 0, reserves 0 in-place)
var dFoo = Calc.derive({ units: 10, lines: { GPR: line(1000000), FOO: line(50000) } }, BENCH);
deepEq(dFoo.dropped, ["FOO"], "GPR + FOO → dropped === [\"FOO\"]");
cents(dFoo.inPlaceNOI, 1000000, "NOI excludes FOO's 50,000 → 1,000,000");
cents(dFoo.egi, 1000000, "in-place EGI excludes FOO → 1,000,000");
cents(dFoo.opex, 0, "in-place opex excludes FOO → 0");
ok(dFoo.worksheet.lines.every(function (l){ return l.key !== "FOO"; }), "FOO is not a worksheet line");
eq(dFoo.categorySums.FOO, 50000, "…while categorySums still carries FOO's dollars (so the sheet can show what was ignored)");
var dCase = Calc.derive({ units: 10, lines: { GPR: line(1000000), gpr: line(25000), RET: line(100000) } }, BENCH);
deepEq(dCase.dropped, ["gpr"], "mis-cased `gpr` is dropped (codes are case-sensitive): dropped === [\"gpr\"]");
cents(dCase.inPlaceNOI, 900000, "NOI = 1,000,000 − 100,000 = 900,000, excluding the mis-cased 25,000");
var dMulti = Calc.derive({ lines: { ZZZ: line(1), GPR: line(2), FOO: line(3) } }, BENCH);
deepEq(dMulti.dropped, ["ZZZ", "FOO"], "several unknown codes, in record order");
deepEq(dB.dropped, [], "case B (EMPL/MOD/BD/PARK all taxonomy codes) → dropped []");
// The engine's synthetic `reserves` line is built with t12: 0 regardless of sums.reserves
// (setup-builder.js L("reserves", …, { t12: 0 })), so a record line coded `reserves` reaches
// no figure — it must be reported, while VAC/MGMT (whose synthetic lines DO read sums) must not:
//   in-place ERI = VAC −5,000 (no GPR) ; opex = MGMT 3,000 ; reserves 0 → NOI = −8,000 (the 9 ignored)
var dRes = Calc.derive({ units: 10, lines: { VAC: line(-5000), MGMT: line(3000), reserves: line(9) } }, BENCH);
deepEq(dRes.dropped, ["reserves"], "a line coded `reserves` is reported as dropped (VAC/MGMT are honoured, so not listed)");
cents(dRes.inPlaceNOI, -8000, "NOI = −5,000 − 3,000 = −8,000, ignoring the `reserves` line's 9");
cents(dRes.result.inPlace.reserves, 0, "in-place reserves stay 0 (the 9 was not summed anywhere)");

section("derive — record with no lines never throws and yields zeros");
var dEmpty = null, threw = false;
try { dEmpty = Calc.derive({ propKey: "e", propertyName: "E", units: 100, lines: {}, assumptions: null }, BENCH); } catch (e){ threw = true; }
ok(!threw, "derive on an empty record does not throw");
if (dEmpty){
  cents(dEmpty.egi, 0, "in-place EGI 0"); cents(dEmpty.opex, 0, "in-place opex 0"); cents(dEmpty.inPlaceNOI, 0, "in-place NOI 0");
  cents(dEmpty.egiUW, 0, "underwritten EGI 0"); cents(dEmpty.opexUW, 0, "underwritten opex 0 (2.5% of 0)");
  cents(dEmpty.reservesUW, 20000, "underwritten reserves = 200 × 100 = 20,000 (engine: reserves are per unit, lines or not)");
  cents(dEmpty.underwrittenNOI, -20000, "underwritten NOI = −20,000 (EGI 0 − reserves)");
  eq(dEmpty.hasLines, false, "hasLines false");
  deepEq(dEmpty.categorySums, {}, "categorySums {}");
  deepEq(dEmpty.dropped, [], "dropped [] (the engine's always-present GPR/VAC/MGMT/reserves lines are not 'dropped')");
  deepEq(dEmpty.sizing, UW.sizeLoan(dEmpty.underwrittenNOI, dEmpty.assumptions.sizing), "sizing on a non-positive underwritten NOI is whatever the engine says for it — passed through untouched");
  ok(!Object.keys(dEmpty.sizing).some(function (k){ var v = dEmpty.sizing[k]; return typeof v === "number" && !isFinite(v); }), "…and carries no NaN/Infinity");
}
var dNeg = Calc.derive({ lines: { GPR: line(400000), RET: line(500000) }, units: 10 }, BENCH);
cents(dNeg.inPlaceNOI, -100000, "negative record: in-place NOI −100,000");
deepEq(dNeg.sizing, UW.sizeLoan(dNeg.underwrittenNOI, dNeg.assumptions.sizing), "negative underwritten NOI: sizing still the engine's own answer, passed through");
var dNoUnits = Calc.derive({ lines: {}, units: null }, BENCH);
cents(dNoUnits.underwrittenNOI, 0, "no lines and no units → underwritten NOI 0");
threw = false; try { Calc.derive(null, BENCH); Calc.derive(undefined, undefined); Calc.derive({}, {}); Calc.derive({ lines: { GPR: 5 } }); } catch (e){ threw = true; }
ok(!threw, "derive tolerates null/undefined/bare records and a raw-number line");
cents(Calc.derive({ lines: { GPR: 5 } }).inPlaceNOI, 5, "a raw-number line value is read as its annual");
cents(Calc.derive(null).inPlaceNOI, 0, "derive(null) → in-place NOI 0");
deepEq(Calc.derive(null).assumptions, BENCH, "derive(null) → DEFAULTS as the effective assumptions");

// ---------------------------------------------------------------------------
section("perLoan — senior + mezz, hand-computed");
var senior = { _id: "sr", propertyName: "A", propertyAddress: "1 Main St", lienPosition: "Senior", originalAmount: 10000000 };
var mezz   = { _id: "mz", propertyName: "A (Mezz)", propertyAddress: "1 Main St", lienPosition: "Mezzanine", originalAmount: 1500000 };
var loans = [senior, mezz], snapLoans = JSON.stringify(loans);
var DS = { sr: 600000, mz: 150000 }, BAL = { sr: 9000000, mz: 1500000 }, CAP = { sr: 0.06, mz: 0.09 };
var capCalls = [];
var hooks = { annualDebtService: function (l){ return DS[l._id]; }, currentBalance: function (l){ return BAL[l._id]; },
              capRate: function (l){ capCalls.push(l); return CAP[l._id]; } };
var rows = Calc.perLoan(recA, loans, hooks);
// NOI 826,500 ; value = 826,500 / 0.06 (SENIOR cap rate; the mezz's 9% must be ignored) = 13,775,000
// senior: dscr = 826,500/600,000 = 1.3775 ; dy = 826,500/9,000,000 ; ltv = 9,000,000/13,775,000
// mezz:   dscr = 826,500/150,000 = 5.51   ; dy = 826,500/1,500,000 = 0.551 ; ltv = 1,500,000/13,775,000
eq(rows.length, 2, "one row per loan");
eq(rows[0].loanId, "sr", "row 0 is the senior"); eq(rows[1].loanId, "mz", "row 1 is the mezz");
eq(rows[0].annualDS, 600000, "senior annualDS echoed"); eq(rows[0].balance, 9000000, "senior balance echoed");
eq(rows[1].annualDS, 150000, "mezz annualDS echoed"); eq(rows[1].balance, 1500000, "mezz balance echoed");
cents(rows[0].value, 13775000, "value = 826,500 / 0.06 = 13,775,000");
cents(rows[1].value, 13775000, "mezz row carries the same property value (senior cap rate, not 9%)");
ratio(rows[0].dscr, 1.3775, "senior DSCR = 1.3775");
ratio(rows[0].dy, 826500 / 9000000, "senior debt yield = 826,500 / 9,000,000");
ratio(rows[0].ltv, 9000000 / 13775000, "senior LTV = 9,000,000 / 13,775,000");
ratio(rows[1].dscr, 5.51, "mezz DSCR = 5.51");
ratio(rows[1].dy, 0.551, "mezz debt yield = 0.551");
ratio(rows[1].ltv, 1500000 / 13775000, "mezz LTV = 1,500,000 / 13,775,000");
ok(capCalls.length >= 1 && capCalls.every(function (l){ return l === senior; }), "capRate hook is asked about the senior only, by identity");
same(JSON.stringify(loans), snapLoans, "perLoan did not mutate the loans");
same(JSON.stringify(recA), snapA, "perLoan did not mutate the record");
deepEq(Object.keys(rows[0]).sort(), ["annualDS", "balance", "dscr", "dy", "loanId", "ltv", "value"], "row carries exactly the §4 fields");
deepEq(Calc.perLoan(recA, [], hooks), [], "no loans → []");

// ---------------------------------------------------------------------------
section("stack — the combined position");
var st = Calc.stack(recA, loans, hooks);
// annualDS = 600,000 + 150,000 = 750,000 ; balance = 9,000,000 + 1,500,000 = 10,500,000 ; value 13,775,000
// dscr = 826,500/750,000 = 1.102 ; dy = 826,500/10,500,000 ; ltv = 10,500,000/13,775,000
cents(st.annualDS, 750000, "combined annualDS = 750,000");
cents(st.balance, 10500000, "combined balance = 10,500,000");
cents(st.value, 13775000, "value = 13,775,000 (senior cap rate)");
ratio(st.dscr, 1.102, "combined DSCR = 1.102");
ratio(st.dy, 826500 / 10500000, "combined debt yield = 826,500 / 10,500,000");
ratio(st.ltv, 10500000 / 13775000, "combined LTV = 10,500,000 / 13,775,000");
cents(st.noi, 826500, "stack.noi = 826,500"); eq(st.count, 2, "stack.count = 2");
ok(st.dscr < rows[0].dscr && st.ltv > rows[0].ltv, "the stack is more levered than the senior alone");
var stSolo = Calc.stack(recA, [senior], hooks);
ratio(stSolo.dscr, rows[0].dscr, "a one-loan stack equals that loan's row (dscr)");
ratio(stSolo.ltv, rows[0].ltv, "a one-loan stack equals that loan's row (ltv)");
var hooksNullMezz = { annualDebtService: function (l){ return l._id === "mz" ? null : DS[l._id]; },
                      currentBalance: function (l){ return l._id === "mz" ? undefined : BAL[l._id]; }, capRate: hooks.capRate };
var stNull = Calc.stack(recA, loans, hooksNullMezz);
cents(stNull.annualDS, 600000, "an unknown (null) mezz debt service counts as 0 in the sum, like combinedPosition's || 0");
cents(stNull.balance, 9000000, "an unknown (undefined) mezz balance counts as 0 in the sum");
var rowsNull = Calc.perLoan(recA, loans, hooksNullMezz);
isNull(rowsNull[1].annualDS, "…but the per-loan row reports that unknown as null, not 0");
isNull(rowsNull[1].dscr, "…and its DSCR is null");
same(JSON.stringify(loans), snapLoans, "stack did not mutate the loans");
var stEmpty = Calc.stack(recA, [], hooks);
deepEq(stEmpty, { count: 0, noi: 826500, annualDS: 0, balance: 0, value: null, dscr: null, dy: null, ltv: null }, "no loans → zero sums, null value/ratios");

// ---------------------------------------------------------------------------
section("nulls, never NaN/Infinity");
var notNumber = function (v){ return v === null; };
var recZero = { lines: { GPR: line(500000), RET: line(500000) } };   // NOI exactly 0
eq(Calc.effectiveNOI(recZero), 0, "zero-NOI record: effectiveNOI 0");
var rz = Calc.perLoan(recZero, loans, hooks), sz = Calc.stack(recZero, loans, hooks);
ok(rz.every(function (r){ return notNumber(r.dscr) && notNumber(r.dy) && notNumber(r.ltv) && notNumber(r.value); }), "NOI = 0 → every ratio and the value are null on every row");
ok(notNumber(sz.dscr) && notNumber(sz.dy) && notNumber(sz.ltv) && notNumber(sz.value), "NOI = 0 → stack ratios and value null");
eq(sz.annualDS, 750000, "…while the stack still sums debt service"); eq(sz.balance, 10500000, "…and balance");
var rn = Calc.perLoan(recNeg, loans, hooks), sn = Calc.stack(recNeg, loans, hooks);
ok(rn.every(function (r){ return notNumber(r.dscr) && notNumber(r.dy) && notNumber(r.ltv) && notNumber(r.value); }), "negative NOI → null ratios/value per loan");
ok(notNumber(sn.dscr) && notNumber(sn.dy) && notNumber(sn.ltv) && notNumber(sn.value), "negative NOI → null stack ratios/value");
var recNone = { propKey: "n", lines: {}, units: 10 };
var re = Calc.perLoan(recNone, loans, hooks), se = Calc.stack(recNone, loans, hooks);
ok(re.every(function (r){ return notNumber(r.dscr) && notNumber(r.dy) && notNumber(r.ltv) && notNumber(r.value); }), "no lines (NOI null) → null ratios/value per loan");
eq(re[0].annualDS, 600000, "…but annualDS is still echoed"); eq(re[1].balance, 1500000, "…and balance");
isNull(se.noi, "no lines → stack.noi null"); isNull(se.dscr, "no lines → stack.dscr null");
var h0 = function (over){ return Object.assign({}, hooks, over); };
var rDS0 = Calc.perLoan(recA, [senior], h0({ annualDebtService: function (){ return 0; } }))[0];
isNull(rDS0.dscr, "annualDS 0 → dscr null"); ratio(rDS0.dy, 826500 / 9000000, "…dy unaffected"); ratio(rDS0.ltv, 9000000 / 13775000, "…ltv unaffected");
var rBal0 = Calc.perLoan(recA, [senior], h0({ currentBalance: function (){ return 0; } }))[0];
isNull(rBal0.dy, "balance 0 → dy null"); isNull(rBal0.ltv, "balance 0 → ltv null"); ratio(rBal0.dscr, 1.3775, "…dscr unaffected");
var rBalNeg = Calc.perLoan(recA, [senior], h0({ currentBalance: function (){ return -5; } }))[0];
isNull(rBalNeg.dy, "negative balance → dy null"); isNull(rBalNeg.ltv, "negative balance → ltv null");
var rCap0 = Calc.perLoan(recA, [senior], h0({ capRate: function (){ return 0; } }))[0];
isNull(rCap0.value, "capRate 0 → value null"); isNull(rCap0.ltv, "capRate 0 → ltv null"); ratio(rCap0.dscr, 1.3775, "…dscr unaffected"); ratio(rCap0.dy, 826500 / 9000000, "…dy unaffected");
var rCapNull = Calc.perLoan(recA, [senior], h0({ capRate: function (){ return null; } }))[0];
isNull(rCapNull.value, "capRate null → value null"); isNull(rCapNull.ltv, "capRate null → ltv null");
var rNaN = Calc.perLoan(recA, [senior], h0({ annualDebtService: function (){ return NaN; }, currentBalance: function (){ return Infinity; }, capRate: function (){ return "0.06"; } }))[0];
isNull(rNaN.annualDS, "NaN debt service → annualDS null"); isNull(rNaN.dscr, "NaN debt service → dscr null");
isNull(rNaN.balance, "Infinity balance → balance null"); isNull(rNaN.dy, "Infinity balance → dy null");
isNull(rNaN.value, "a string cap rate is not a number → value null");
var rNoHooks = Calc.perLoan(recA, [senior], {})[0];
deepEq(rNoHooks, { loanId: "sr", annualDS: null, balance: null, value: null, dscr: null, dy: null, ltv: null }, "missing hooks → all null, no throw");
deepEq(Calc.stack(recA, [senior], undefined), { count: 1, noi: 826500, annualDS: 0, balance: 0, value: null, dscr: null, dy: null, ltv: null }, "stack with no hooks → zero sums, nulls");
var everything = [].concat(rz, rn, re, [rDS0, rBal0, rCap0, rNaN, rNoHooks], [sz, sn, se, stEmpty]);
var badVal = everything.some(function (o){ return Object.keys(o).some(function (k){ var v = o[k]; return typeof v === "number" && !isFinite(v); }); });
ok(!badVal, "no NaN or Infinity anywhere in any row or stack");
eq(Calc.perLoan(recA, [{ id: "legacy" }], hooks)[0].loanId, "legacy", "loanId falls back to `id` when `_id` is absent");
isNull(Calc.perLoan(recA, [{}], hooks)[0].loanId, "loanId null when the loan has no id");

// ---------------------------------------------------------------------------
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
