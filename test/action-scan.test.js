// ActionScan (contract §8, P8) — plain node, no framework:  node test/action-scan.test.js
// Every expectation below is hand-derived from the seeded numbers (see the comments).
// dscr/dy cases run against an in-test fake OperatingCalc with hand-set numbers; if
// operating-calc.js exists at test time one integration case runs against the real one.
"use strict";
var path = require("path"), fs = require("fs");
var ActionScan = require("../action-scan.js");

var passed = 0, failed = 0;
function ok(cond, msg){ console.log((cond ? "  ok   " : "  FAIL ") + msg); if (cond) passed++; else failed++; }
function eq(got, want, msg){ ok(got === want, msg + (got === want ? "" : "  — got " + JSON.stringify(got) + ", want " + JSON.stringify(want))); }
function near(got, want, msg){ var d = (typeof got === "number") ? Math.abs(got - want) : Infinity; ok(d < 1e-9, msg + (d < 1e-9 ? "" : "  — got " + JSON.stringify(got) + ", want " + want)); }
function has(str, sub, msg){ ok(typeof str === "string" && str.indexOf(sub) >= 0, msg + (typeof str === "string" && str.indexOf(sub) >= 0 ? "" : "  — " + JSON.stringify(sub) + " not in " + JSON.stringify(str))); }
function section(t){ console.log("\n" + t); }

// ---- fixtures -----------------------------------------------------------------
var GD = { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200,
           sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30 } };
var TODAY = new Date(2026, 8, 7);   // 7 Sep 2026 — fixed so month arithmetic is deterministic
var EXPENSE = { RET: 1, INS: 1, UTIL: 1, RM: 1, CS: 1, PAY: 1, MGMT: 1, GA: 1, MKT: 1, TRSH: 1, CAB: 1, PLL: 1 };

// The app's own key rule (§1) — the scan receives it as a hook, never computes it.
function propertyKey(l){ var a = String(l.propertyAddress || "").trim().toLowerCase(); return a ? "addr:" + a : "name:" + String(l.propertyName || l._id || "").trim().toLowerCase(); }
var hooks = {
  propertyKey: propertyKey,
  loansForProperty: function (l){ return [l]; },
  annualDebtService: function (l){ return l._ds; },
  currentBalance: function (l){ return l._bal; },
  capRate: function (){ return 0.055; },
  marketRate: function (l){ return l._mkt == null ? null : l._mkt; },
  today: function (){ return new Date(TODAY.getTime()); },
  globalDefaults: function (){ return GD; }
};
var seq = 0;
function loan(o){ return Object.assign({ _id: "L" + (++seq), propertyName: "P", propertyAddress: "", lenderName: "Bank", annualRate: 0.05,
  maturityDate: "2035-01-01", lienPosition: "Senior", _ds: 100000, _bal: 1000000, _mkt: null }, o); }
function line(annual, prev, ctl){ return { annual: annual, prevAnnual: prev === undefined ? null : prev, controllable: ctl, source: "manual", updatedAt: "2026-09-01T00:00:00.000Z", note: null }; }
// lines: { CODE: annual | [annual, prevAnnual, controllable?] }; controllable defaults per §3 (RET/INS false, else true)
function rec(key, name, lines, assumptions){
  var out = {};
  Object.keys(lines || {}).forEach(function (c){
    var v = lines[c], arr = Array.isArray(v) ? v : [v];
    out[c] = line(arr[0], arr[1], arr.length > 2 ? arr[2] : !(c === "RET" || c === "INS"));
  });
  return { propKey: key, propertyName: name, units: 100, period: "T12 ending 2026-06-30", lines: out,
           assumptions: assumptions === undefined ? null : assumptions,
           meta: { createdAt: "2026-09-01T00:00:00.000Z", lastUpdated: "2026-09-01T00:00:00.000Z", sourceFile: null } };
}
// In-test fake of contract §4: in-place NOI = Σ income lines − Σ expense lines; ratios null on NOI ≤ 0 / denominator ≤ 0.
var FakeCalc = {
  effectiveNOI: function (r){ if (!r || !r.lines || !Object.keys(r.lines).length) return null;
    var noi = 0; Object.keys(r.lines).forEach(function (c){ var a = r.lines[c].annual; noi += EXPENSE[c] ? -a : a; }); return noi; },
  stack: function (r, loans, h){
    var noi = FakeCalc.effectiveNOI(r), ds = 0, bal = 0;
    loans.forEach(function (l){ ds += h.annualDebtService(l); bal += h.currentBalance(l); });
    var cap = h.capRate(loans[0]), value = (noi > 0 && cap > 0) ? noi / cap : null;
    return { annualDS: ds, balance: bal, value: value, dscr: (noi > 0 && ds > 0) ? noi / ds : null, dy: (noi > 0 && bal > 0) ? noi / bal : null, ltv: (value > 0 && bal > 0) ? bal / value : null };
  }
};
function run(records, loans, opts){ return ActionScan.scan(records, loans, hooks, GD, Object.assign({ calc: FakeCalc }, opts || {})); }
function find(flags, kind, key){ return flags.filter(function (f){ return f.kind === kind && (key == null || f.propKey === key); })[0] || null; }
function kinds(flags){ return flags.map(function (f){ return f.kind; }).join(","); }

// ================================================================================
section("dscr — combined-stack DSCR below dscrMin (1.20 global)");
var A = loan({ propertyName: "Alpha", propertyAddress: "1 Alpha St", _ds: 100000, _bal: 1000000 }), kA = "addr:1 alpha st";
(function (){
  // GPR 150,000 − RET 40,000 = NOI 110,000 ; DS 100,000 → DSCR 1.10 ; 1.10 ≥ 1.20−0.10 → severity 2
  var f = run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 150000, RET: 40000 }) }, [A]);
  eq(f.length, 1, "1.10× fires exactly one flag (dy 0.11 is fine, no maturity/refi/expense)");
  var d = f[0];
  eq(d && d.kind, "dscr", "kind dscr"); eq(d && d.severity, 2, "severity 2 (breach < 0.10 deep)");
  eq(d && d.propKey, kA, "propKey"); eq(d && d.name, "Alpha", "name from the record");
  near(d && d.value, 1.10, "value = stack dscr 1.10"); near(d && d.threshold, 1.20, "threshold = global dscrMin");
  eq(d && d.impact, 10000, "impact = (1.20−1.10)×100,000 = $10,000 NOI shortfall");
  has(d && d.detail, "1.10×", "detail shows the DSCR"); has(d && d.detail, "$10,000", "detail shows the shortfall");
})();
(function (){
  // GPR 145,000 − RET 40,000 = 105,000 → DSCR 1.05 < 1.10 → severity 3 ; shortfall (1.20−1.05)×100,000 = 15,000
  var f = run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }) }, [A]);
  eq(kinds(f), "dscr", "1.05× fires dscr only"); eq(f[0].severity, 3, "severity 3 (more than 0.10 under)"); eq(f[0].impact, 15000, "impact $15,000");
})();
(function (){
  // NOI 110,000 on DS 100,000 → 1.10 exactly at the severity boundary (1.20 − 0.10) → stays 2, not 3
  var f = run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 110000 }) }, [A]);
  eq(f[0] && f[0].severity, 2, "exactly dscrMin−0.10 is severity 2 (boundary is strict)");
})();
(function (){
  // NOI 120,000 on DS 100,000 → DSCR 1.20 = dscrMin → does NOT fire
  var f = run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 160000, RET: 40000 }) }, [A]);
  eq(f.length, 0, "exactly AT dscrMin does not fire");
  // Float noise: GPR 81,481.25 + RUBS 2,779.73 − RET 16,974.88 = 67,286.10 = 1.20 × DS 56,071.75 exactly in decimal,
  // but in float the ratio lands at 1.1999999999999997 — a property AT its floor must still not fire. (balance 500,000 → DY 13.5%, fine)
  ok(((81481.25 + 2779.73) - 16974.88) / 56071.75 < 1.2, "fixture really lands under 1.20 in float (so this test can fail)");
  var B = loan({ propertyName: "Beta", propertyAddress: "2 Beta St", _ds: 56071.75, _bal: 500000 });
  var g = run({ "addr:2 beta st": rec("addr:2 beta st", "Beta", { GPR: 81481.25, RUBS: 2779.73, RET: 16974.88 }) }, [B]);
  eq(g.length, 0, "float noise at the threshold does not fire");
})();
(function (){
  // NOI 125,000 → 1.25: fine against the global 1.20, breaches a per-property dscrMin 1.30 (severity 2, shortfall (1.30−1.25)×100,000 = 5,000)
  var lines = { GPR: 165000, RET: 40000 };
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", lines) }, [A]).length, 0, "1.25× vs global 1.20 → no flag");
  var f = run({ "addr:1 alpha st": rec(kA, "Alpha", lines, { sizing: { dscrMin: 1.30 } }) }, [A]);
  eq(kinds(f), "dscr", "per-property dscrMin 1.30 → fires"); eq(f[0].severity, 2, "severity 2 against the override");
  near(f[0].threshold, 1.30, "threshold = the override"); eq(f[0].impact, 5000, "impact $5,000 vs the override");
  // NOI 115,000 → 1.15 breaches the global but not a per-property 1.10
  var l2 = { GPR: 155000, RET: 40000 };
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", l2) }, [A]).length, 1, "1.15× vs global 1.20 → fires");
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", l2, { sizing: { dscrMin: 1.10 } }) }, [A]).length, 0, "per-property dscrMin 1.10 → no flag");
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", l2, { sizing: { dscrMin: null, capRate: 0.06 } }) }, [A]).length, 1, "sizing.dscrMin null inherits the global (fires)");
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", l2, { vacancyPct: 0.07 }) }, [A]).length, 1, "assumptions without sizing inherit the global (fires)");
})();
(function (){
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 50000, RET: 60000 }) }, [A]).length, 0, "NOI ≤ 0 → dscr null → no flag");
  eq(run({}, [A]).length, 0, "no operating record → no NOI → no flag");
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", {}) }, [A]).length, 0, "record with no lines → no flag");
  eq(run([rec(kA, "Alpha", { GPR: 145000, RET: 40000 })], [A]).length, 1, "records may also be passed as an array");
  eq(run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }) }, function (){ return [A]; }).length, 1, "loans may be passed as a thunk (bridge style)");
  // globalDefaults omitted → falls back to hooks.globalDefaults()
  var f = ActionScan.scan({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }) }, [A], hooks, null, { calc: FakeCalc });
  eq(f.length, 1, "globalDefaults null → hooks.globalDefaults() is used");
  // combined stack: senior DS 100,000 + mezz DS 40,000 = 140,000 ; NOI 150,000 → 1.0714 < 1.10 → severity 3 (each loan alone would pass or be milder)
  var M = loan({ propertyName: "Alpha (Mezz)", propertyAddress: "1 Alpha St", lienPosition: "Mezzanine", _ds: 40000, _bal: 400000 });
  var g = run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 150000 }) }, [M, A]);
  eq(kinds(g), "dscr", "senior+mezz collapse to ONE flag on the combined stack");
  near(g[0].value, 150000 / 140000, "value = NOI ÷ (senior DS + mezz DS)"); eq(g[0].severity, 3, "combined 1.07× is severity 3");
  eq(g[0].impact, Math.round((1.2 - 150000 / 140000) * 140000 * 100) / 100, "impact vs the combined DS");
})();

// ================================================================================
section("dy — combined-stack debt yield below dyMin (0.07 global)");
var D = loan({ propertyName: "Delta", propertyAddress: "4 Delta Rd", _ds: 40000, _bal: 1000000 }), kD = "addr:4 delta rd";
(function (){
  // GPR 100,000 − RET 34,000 = 66,000 ; balance 1,000,000 → DY 6.6% ; ≥ 7%−1% → severity 2 ; shortfall (0.07−0.066)×1,000,000 = 4,000 ; DSCR 66,000/40,000 = 1.65 fine
  var f = run({ "addr:4 delta rd": rec(kD, "Delta", { GPR: 100000, RET: 34000 }) }, [D]);
  eq(kinds(f), "dy", "6.6% fires dy only"); eq(f[0].severity, 2, "severity 2");
  near(f[0].value, 0.066, "value = dy"); near(f[0].threshold, 0.07, "threshold = global dyMin"); eq(f[0].impact, 4000, "impact $4,000");
  has(f[0].detail, "6.60%", "detail shows the yield"); has(f[0].detail, "7.00%", "detail shows the floor");
})();
(function (){
  // NOI 55,000 → 5.5% < 6% → severity 3 ; shortfall 15,000
  var f = run({ "addr:4 delta rd": rec(kD, "Delta", { GPR: 100000, RET: 45000 }) }, [D]);
  eq(kinds(f), "dy", "5.5% fires dy only (DSCR 1.375 fine)"); eq(f[0].severity, 3, "severity 3"); eq(f[0].impact, 15000, "impact $15,000");
  eq(run({ "addr:4 delta rd": rec(kD, "Delta", { GPR: 100000, RET: 40000 }) }, [D])[0].severity, 2, "exactly dyMin−0.01 (6.0%) is severity 2");
  eq(run({ "addr:4 delta rd": rec(kD, "Delta", { GPR: 100000, RET: 30000 }) }, [D]).length, 0, "exactly AT dyMin (7.0%) does not fire");
})();
(function (){
  // NOI 75,000 → 7.5%: fine vs global, breaches per-property dyMin 8% (severity 2, shortfall (0.08−0.075)×1e6 = 5,000)
  var lines = { GPR: 100000, RET: 25000 };
  eq(run({ "addr:4 delta rd": rec(kD, "Delta", lines) }, [D]).length, 0, "7.5% vs global 7% → no flag");
  var f = run({ "addr:4 delta rd": rec(kD, "Delta", lines, { sizing: { dyMin: 0.08 } }) }, [D]);
  eq(kinds(f), "dy", "per-property dyMin 8% → fires"); eq(f[0].severity, 2, "severity 2"); near(f[0].threshold, 0.08, "threshold = override"); eq(f[0].impact, 5000, "impact $5,000");
  eq(run({ "addr:4 delta rd": rec(kD, "Delta", { GPR: 100000, RET: 45000 }, { sizing: { dyMin: 0.05 } }) }, [D]).length, 0, "per-property dyMin 5% → 5.5% no longer fires");
})();
(function (){
  // both rules on one property: NOI 60,000 ; DS 100,000 → DSCR 0.60 (sev 3, shortfall 60,000) ; bal 1e6 → DY 6% (sev 2, shortfall 10,000)
  var f = run({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 60000 }) }, [A]);
  eq(kinds(f), "dscr,dy", "dscr and dy both fire, ranked severity first");
  eq(f[0].impact, 60000, "dscr shortfall $60,000"); eq(f[1].impact, 10000, "dy shortfall $10,000"); eq(f[1].severity, 2, "dy severity 2");
})();

// ================================================================================
section("maturity — earliest maturity within opts.maturityMonths (18) of today (2026-09-07); whole calendar months");
function matFlag(iso, opts, extra){
  var l = loan(Object.assign({ propertyName: "Mat", propertyAddress: "9 Mat Ave", lenderName: "Life Co", loanNumber: "777", maturityDate: iso, _bal: 5000000 }, extra || {}));
  var f = run({}, [l], opts); return { flags: f, m: find(f, "maturity") };
}
function sev(r){ return r && r.m ? r.m.severity : null; }   // null-guarded: a regression prints FAIL, not a TypeError
(function (){
  var r = matFlag("2027-01-15"), m = r.m || {};   // (2027−2026)×12 + (Jan−Sep) = 4 months
  eq(kinds(r.flags), "maturity", "4 months out fires maturity only"); eq(m.severity, 3, "≤ 6 months → severity 3");
  eq(m.value, 4, "value = months to maturity (4)"); eq(m.threshold, 18, "threshold = the window"); eq(m.impact, 5000000, "impact = balance");
  eq(m.date, "2027-01-15", "date carried"); eq(m.loanId, r.flags[0] && r.flags[0].loanId, "loanId carried");
  has(m.detail, "Life Co #777", "detail names the loan"); has(m.detail, "in 4 months", "detail says how soon"); has(m.detail, "$5,000,000", "detail shows the balance");
  eq(sev(matFlag("2027-03-01")), 3, "6 months → severity 3 (inclusive)");
  eq(sev(matFlag("2027-04-01")), 2, "7 months → severity 2");
  eq(sev(matFlag("2027-09-07")), 2, "12 months → severity 2 (inclusive)");
  eq(sev(matFlag("2027-10-01")), 1, "13 months → severity 1");
  eq(sev(matFlag("2028-03-31")), 1, "18 months (day ignored, app convention) → within the window, severity 1");
  eq(matFlag("2028-04-01").flags.length, 0, "19 months → beyond the window, no flag");
  eq(matFlag("2031-01-01").flags.length, 0, "years out → no flag");
  // already matured with a balance still on the books: a bookkeeping question, not a refi emergency
  var p = matFlag("2024-08-09").m || {};   // (2024−2026)×12 + (Aug−Sep) = −25
  eq(p.severity, 2, "already past → severity 2"); eq(p.value, -25, "value −25 months");
  has(p.detail, "matured 2024-08-09 — 25 months ago — confirm payoff or archive", "past-due wording");
  has(p.detail, "$5,000,000 still on the books", "past-due shows the balance as outstanding, not 'to refinance'");
  eq(matFlag("2024-08-09", null, { _bal: 0 }).flags.length, 0, "already matured with a $0 balance (paid off, like The Pepper Building) → no flag at all");
  eq(matFlag("2027-01-15", null, { _bal: 0 }).flags.length, 0, "a $0 balance inside the window → nothing left to refinance → no flag");
  var u = matFlag("2027-01-15", null, { _bal: null }).m || {};
  eq(u.severity, 3, "an UNKNOWN balance (hook null) still fires"); eq(u.impact, 0, "unknown balance → impact 0, never NaN");
  eq((matFlag("2026-09-30").m || {}).value, 0, "this month → 0 months");
  eq(matFlag(null).flags.length, 0, "no maturityDate → no flag");
  eq(matFlag("soon").flags.length, 0, "unparseable maturityDate → no flag");
  eq(matFlag("2027-04-01", { maturityMonths: 6 }).flags.length, 0, "opts.maturityMonths 6: 7 months → no flag");
  eq(matFlag("2027-03-01", { maturityMonths: 6 }).flags.length, 1, "opts.maturityMonths 6: 6 months → fires");
})();
(function (){
  // hooks.maturity (the app's derived maturity, bridge) fills a blank field; the field is the fallback when the hook has nothing; the hook wins when both exist
  var h = Object.assign({}, hooks, { maturity: function (l){ return l._derivedMat === undefined ? null : l._derivedMat; } });
  var blank = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: null, _derivedMat: "2027-01-15", _bal: 1 });
  eq((ActionScan.scan({}, [blank], h, GD, { calc: FakeCalc })[0] || {}).value, 4, "hooks.maturity supplies the maturity a blank field lacks (4 months)");
  var field = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: "2027-04-01", _bal: 1 });
  eq((ActionScan.scan({}, [field], h, GD, { calc: FakeCalc })[0] || {}).value, 7, "hook null → the stored field is used (7 months)");
  var both = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: "2031-01-01", _derivedMat: "2027-04-01", _bal: 1 });
  eq((ActionScan.scan({}, [both], h, GD, { calc: FakeCalc })[0] || {}).value, 7, "the hook's answer wins over the field");
  // a hook answer that does not parse ("" / "n/a") must not hide a dated loan: the stored field is used
  var junk1 = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: "2027-04-01", _derivedMat: "", _bal: 1 });
  eq((ActionScan.scan({}, [junk1], h, GD, { calc: FakeCalc })[0] || {}).value, 7, 'hook answers "" → the stored field is used (7 months)');
  var junk2 = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: "2027-01-15", _derivedMat: "n/a", _bal: 1 });
  eq((ActionScan.scan({}, [junk2], h, GD, { calc: FakeCalc })[0] || {}).value, 4, 'hook answers "n/a" → the stored field is used (4 months)');
  var junk3 = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: "soon", _derivedMat: "n/a", _bal: 1 });
  eq(ActionScan.scan({}, [junk3], h, GD, { calc: FakeCalc }).length, 0, "neither the hook nor the field parses → no flag");
})();
(function (){
  // today() is the hook, not the clock: from 2026-01-01, 2027-01-15 is 12 months → severity 2
  var h = Object.assign({}, hooks, { today: function (){ return new Date(2026, 0, 1); } });
  var l = loan({ propertyName: "Mat", propertyAddress: "9 Mat Ave", maturityDate: "2027-01-15" });
  var f = ActionScan.scan({}, [l], h, GD, { calc: FakeCalc });
  eq(f[0] && f[0].value, 12, "months measured from hooks.today()"); eq(f[0] && f[0].severity, 2, "12 months → severity 2");
})();
(function (){
  // senior 2029-02-10 (29 mo, outside) + mezz 2027-02-10 (5 mo): one flag, the mezz's; only in-window balance counts
  var S = loan({ propertyName: "Avalon", propertyAddress: "White Plains, NY", lenderName: "NYL", loanNumber: "1613", maturityDate: "2029-02-10", _bal: 96000000 });
  var Z = loan({ propertyName: "Avalon (Mezz)", propertyAddress: "White Plains, NY", lenderName: "NYL", loanNumber: "1614", lienPosition: "Mezzanine", maturityDate: "2027-02-10", _bal: 24000000 });
  var f = run({}, [S, Z]), m = f[0] || {};
  eq(kinds(f), "maturity", "two loans → ONE maturity flag"); eq(m.value, 5, "earliest (mezz) at 5 months"); eq(m.severity, 3, "severity 3");
  eq(m.impact, 24000000, "impact = balance of the loan(s) inside the window only"); eq(m.loanId, Z._id, "names the mezz"); has(m.detail, "(mezz)", "detail marks the mezz");
  // both inside the window: senior 2027-05-01 (8 mo), mezz 2027-02-01 (5 mo) → earliest drives severity, both balances need runway
  var S2 = Object.assign({}, S, { maturityDate: "2027-05-01" }), Z2 = Object.assign({}, Z, { maturityDate: "2027-02-01" });
  var g = run({}, [Z2, S2]), gm = g[0] || {};
  eq(g.length, 1, "still one flag"); eq(gm.value, 5, "earliest wins"); eq(gm.impact, 120000000, "impact = 96M + 24M"); has(gm.detail, "across 2 loans", "detail counts the loans");
  // a paid-off senior (matured, $0) next to a live mezz: the mezz drives the flag, the matured senior is not the "earliest"
  var paid = Object.assign({}, S, { maturityDate: "2024-08-09", _bal: 0 });
  var q = run({}, [paid, Z]), qm = q[0] || {};
  eq(kinds(q), "maturity", "paid-off senior + live mezz → one flag"); eq(qm.severity, 3, "the live mezz (5 months) drives it, not the matured senior"); eq(qm.loanId, Z._id, "…and names the mezz");
})();

// ================================================================================
section("refi — marketRate < rate in effect (hooks.currentRate, else annualRate) − refiSpread (0.005); severity 3 ≥ 1.00 pt, 2 ≥ 0.75 pt, else 1");
function refi(rate, mkt, opts, extra){
  var l = loan(Object.assign({ propertyName: "Refi", propertyAddress: "5 Refi Ln", lenderName: "Santander", loanNumber: "7216141", annualRate: rate, _mkt: mkt, _bal: 6000000 }, extra || {}));
  var f = run({}, [l], opts); return { flags: f, r: find(f, "refi") };
}
function rsev(x){ return x && x.r ? x.r.severity : null; }
(function (){
  var x = refi(0.0566, 0.0440), xr = x.r || {};   // gap 1.26 pts ≥ 1.00 → 3 ; impact 6,000,000 × 0.0126 = 75,600
  eq(kinds(x.flags), "refi", "fires refi only"); eq(xr.severity, 3, "gap ≥ 1.00 pt → severity 3");
  near(xr.value, 0.0566, "value = the rate in effect"); near(xr.threshold, 0.044, "threshold = market rate"); eq(xr.impact, 75600, "impact = balance × gap = $75,600");
  has(xr.detail, "Santander #7216141", "detail names the loan"); has(xr.detail, "5.66% today", "rate in effect"); has(xr.detail, "4.40%", "market rate"); has(xr.detail, "1.26 pts", "gap");
  ok(typeof xr.detail === "string" && xr.detail.indexOf("(note") < 0, "no '(note …)' aside when the rate in effect IS the note rate");
  eq(rsev(refi(0.0566, 0.0466)), 3, "gap exactly 1.00 pt → severity 3 (inclusive)");
  eq(rsev(refi(0.0566, 0.0467)), 2, "gap 0.99 pt → severity 2");
  eq(rsev(refi(0.0566, 0.0491)), 2, "gap exactly 0.75 pt → severity 2 (inclusive)");
  eq(rsev(refi(0.0566, 0.0492)), 1, "gap 0.74 pt → severity 1");
  var y = refi(0.0566, 0.0500), yr = y.r || {};   // gap 0.66 pts → 1 ; impact 39,600
  eq(yr.severity, 1, "gap 0.66 pts → severity 1"); eq(yr.impact, 39600, "impact $39,600");
  eq(refi(0.0566, 0.0516).flags.length, 0, "gap exactly = refiSpread (0.50 pt) → no flag (strict)");
  eq(rsev(refi(0.0566, 0.0515)), 1, "gap 0.51 pt → fires at severity 1 (reachable at the default spread)");
  eq(refi(0.0566, null).flags.length, 0, "marketRate null → never fires");
  eq(refi(0.0566, 0.0440, null, { annualRate: null }).flags.length, 0, "no annualRate → no flag");
  eq(refi(0.0500, 0.0530).flags.length, 0, "market above the note → no flag");
  var z = refi(0.0566, 0.0530, { refiSpread: 0.0025 });   // gap 0.36 pt > 0.25 → fires ; < 0.50 → severity 1 ; impact 21,600
  eq(z.r && z.r.severity, 1, "opts.refiSpread 0.25 pt: gap 0.36 → severity 1"); eq(z.r && z.r.impact, 21600, "impact $21,600");
  eq(refi(0.0566, 0.0530).flags.length, 0, "same gap under the default spread → no flag");
  var h = Object.assign({}, hooks); delete h.marketRate;
  eq(ActionScan.scan({}, [loan({ propertyName: "R", propertyAddress: "5 Refi Ln", annualRate: 0.08, _mkt: 0.04 })], h, GD, { calc: FakeCalc }).length, 0, "hooks without marketRate → never fires");
})();
(function (){
  // senior 5.00% vs 4.40% (gap 0.60, sev 1, 10M → 60,000) + mezz 8.00% vs 6.80% (gap 1.20, sev 3, 2M → 24,000): one flag, the mezz's severity
  var S = loan({ propertyName: "Two", propertyAddress: "6 Two Ct", lenderName: "Senior Bank", annualRate: 0.05, _mkt: 0.044, _bal: 10000000 });
  var Z = loan({ propertyName: "Two (Mezz)", propertyAddress: "6 Two Ct", lenderName: "Mezz Fund", lienPosition: "Mezzanine", annualRate: 0.08, _mkt: 0.068, _bal: 2000000 });
  var f = run({}, [S, Z]), m = f[0] || {};
  eq(kinds(f), "refi", "two loans → ONE refi flag"); eq(m.severity, 3, "carries the worst severity"); eq(m.loanId, Z._id, "names the mezz");
  eq(m.impact, 24000, "impact of the named loan"); has(m.detail, "Mezz Fund", "detail names the mezz"); has(m.detail, "also: Senior Bank", "detail lists the other");
})();
(function (){
  // The rate in effect TODAY (hooks.currentRate) is the yardstick, never the origination rate:
  // a floater written at 5.00% now paying 6.20% against a 5.00% market is 1.20 pts over → severity 3
  var F = loan({ propertyName: "Float", propertyAddress: "8 Float Dr", lenderName: "Arbor", annualRate: 0.05, _cur: 0.062, _mkt: 0.05, _bal: 50000000 });
  var hc = Object.assign({}, hooks, { currentRate: function (l){ return l._cur === undefined ? null : l._cur; } });
  eq(run({}, [F]).length, 0, "no currentRate hook → the note rate is the fallback: 5.00% vs 5.00% market → no flag");
  var f = ActionScan.scan({}, [F], hc, GD, { calc: FakeCalc }), r = f[0] || {};
  eq(kinds(f), "refi", "with hooks.currentRate the live 6.20% fires"); eq(r.severity, 3, "gap 1.20 pts → severity 3");
  near(r.value, 0.062, "value = the rate in effect"); eq(r.impact, 600000, "impact = 50,000,000 × 0.012 = $600,000");
  has(r.detail, "6.20% today (note 5.00%)", "detail shows the current rate and the note rate it replaced");
  eq(ActionScan.scan({}, [Object.assign({}, F, { _cur: null })], hc, GD, { calc: FakeCalc }).length, 0, "hook answers null (rate in effect unknown) → no flag; the note rate is NOT substituted");
  eq(ActionScan.scan({}, [Object.assign({}, F, { annualRate: 0.08, _cur: 0.052 })], hc, GD, { calc: FakeCalc }).length, 0, "note 8.00% but 5.20% in effect vs 5.00% market → gap 0.20 < spread → no flag (a reset-down floater is no longer a call)");
})();

// ================================================================================
section("expense — NON-controllable line, prevAnnual != null, (annual−prev)/|prev| > shockPct (0.15)");
var E = loan({ propertyName: "Exp", propertyAddress: "7 Exp Way", _ds: 100000, _bal: 1000000 }), kE = "addr:7 exp way";
function exp(lines, opts){ var f = run({ "addr:7 exp way": rec(kE, "Exp", Object.assign({ GPR: 1000000 }, lines)) }, [E], opts); return { flags: f, x: find(f, "expense") }; }
(function (){
  var r = exp({ RET: [120000, 100000] });   // +20% → severity 2 ; jump $20,000
  eq(kinds(r.flags), "expense", "RET +20% fires expense only"); eq(r.x.severity, 2, "severity 2"); eq(r.x.code, "RET", "code");
  near(r.x.value, 0.2, "value = the jump (0.20)"); near(r.x.threshold, 0.15, "threshold = shockPct"); eq(r.x.impact, 20000, "impact = $ jump");
  has(r.x.detail, "Real Estate Taxes", "detail names the line (SetupBuilder label)"); has(r.x.detail, "+20%", "detail shows the % jump"); has(r.x.detail, "$100,000 → $120,000", "detail shows before → after");
  eq(exp({ RET: [115000, 100000] }).flags.length, 0, "exactly +15% does not fire");
  eq(exp({ RET: [115001, 100000] }).x.severity, 2, "+15.001% fires");
  eq(exp({ RET: [131000, 100000] }).x.severity, 3, "+31% → severity 3");
  eq(exp({ RET: [130000, 100000] }).x.severity, 2, "exactly +30% → severity 2 (boundary strict)");
  has(exp({ INS: [118500, 100000] }).x.detail, "Insurance +18.5%", "non-integer jump shown to a tenth");
  eq(exp({ UTIL: [200000, 100000] }).flags.length, 0, "controllable line (UTIL default) doubling does NOT fire");
  eq(exp({ RET: [200000, null] }).flags.length, 0, "prevAnnual null never fires");
  eq(exp({ RET: [200000] }).flags.length, 0, "prevAnnual absent never fires");
  eq(exp({ RET: [200000, 0] }).flags.length, 0, "prevAnnual 0 never fires (no base)");
  eq(exp({ RET: [50000, 100000] }).flags.length, 0, "a drop never fires");
  eq(exp({ RET: [150000, 100000, true] }).flags.length, 0, "RET flipped to controllable by the user → no flag");
  var u = exp({ UTIL: [150000, 100000, false] });
  eq(u.x && u.x.code, "UTIL", "UTIL flipped to non-controllable → fires"); has(u.x && u.x.detail, "Utilities", "labelled");
  eq(exp({ RET: [120000, 100000] }, { shockPct: 0.25 }).flags.length, 0, "opts.shockPct 0.25: +20% → no flag");
  var s = exp({ RET: [126000, 100000] }, { shockPct: 0.25 });
  eq(s.x && s.x.severity, 2, "opts.shockPct 0.25: +26% → severity 2"); near(s.x && s.x.threshold, 0.25, "threshold = opts.shockPct");
})();
(function (){
  // Role + direction: only a COST moving UP is a shock. VAC is an income-role deduction stored NEGATIVE:
  // −50,000 → −40,000 is vacancy IMPROVING, −50,000 → −80,000 is the real hit — neither is an expense shock.
  eq(exp({ VAC: [-40000, -50000, false] }).flags.length, 0, "VAC −50,000 → −40,000 (vacancy improved) → no flag (was a false '+20% shock')");
  eq(exp({ VAC: [-80000, -50000, false] }).flags.length, 0, "VAC −50,000 → −80,000 (vacancy worse) → still no expense flag: income role");
  eq(exp({ GPR: [1200000, 1000000, false] }).flags.length, 0, "a non-controllable income line rising (GPR +20%) → no flag");
  eq(exp({ RUBS: [150000, 100000, false] }).flags.length, 0, "other income (RUBS +50%) flagged non-controllable → no flag");
  eq((exp({ RET: [116000, 100000] }).x || {}).severity, 2, "RET +16% → flag (severity 2)");
  eq(exp({ RET: [84000, 100000] }).flags.length, 0, "RET −16% → no flag (a cost moving down is relief)");
  eq((exp({ INS: [140000, 100000] }).x || {}).impact, 40000, "INS +40% → impact is the dollar rise");
})();
(function (){
  // RET +20% (sev 2, $20,000) and INS +50% (sev 3, $50,000) → ONE flag: INS carries it, RET is named
  var r = exp({ RET: [120000, 100000], INS: [150000, 100000] });
  eq(kinds(r.flags), "expense", "two shocked lines → ONE expense flag"); eq(r.x.severity, 3, "worst severity"); eq(r.x.code, "INS", "worst line carries the flag");
  eq(r.x.impact, 50000, "impact = the named line's jump"); has(r.x.detail, "also: Real Estate Taxes +20%", "the other line is named");
  // no record → no expense flag ; controllable field missing → not treated as non-controllable
  eq(run({}, [E]).length, 0, "no record → nothing");
  var bare = rec(kE, "Exp", { GPR: 1000000 }); bare.lines.RET = { annual: 200000, prevAnnual: 100000, source: "t12" };
  eq(run({ "addr:7 exp way": bare }, [E]).length, 0, "line without a controllable flag is not assumed non-controllable");
})();

// ================================================================================
section("ranking — severity desc, then dollar impact desc, then name; mixed seeded set");
var mixed = (function (){
  var LA = loan({ propertyName: "Alpha", propertyAddress: "1 Alpha St", _ds: 100000, _bal: 1000000, maturityDate: "2028-03-01" });   // dscr 1.05 (3, $15,000) ; maturity 18mo (1, $1,000,000)
  var LB = loan({ propertyName: "Bravo", propertyAddress: "2 Bravo St", _ds: 100000, _bal: 1000000 });                                  // expense RET +50% (3, $50,000) ; NOI 350k healthy
  var LC = loan({ propertyName: "Charlie", propertyAddress: "3 Charlie Av", lenderName: "C Bank", _ds: 150000, _bal: 2000000, annualRate: 0.06, _mkt: 0.053, maturityDate: "2027-04-01" }); // refi gap 0.70 (1, $14,000) ; maturity 7mo (2, $2,000,000)
  var LD = loan({ propertyName: "Delta", propertyAddress: "4 Delta Rd", _ds: 40000, _bal: 1000000 });                                   // dy 6.6% (2, $4,000)
  var LE = loan({ propertyName: "Echo", propertyAddress: "5 Echo Pl", _ds: 100000, _bal: 1000000 });                                    // dscr 1.05 (3, $15,000) — ties Alpha, name breaks it
  var records = {
    "addr:1 alpha st":   rec("addr:1 alpha st", "Alpha", { GPR: 145000, RET: 40000 }),
    "addr:2 bravo st":   rec("addr:2 bravo st", "Bravo", { GPR: 500000, RET: [150000, 100000] }),
    "addr:3 charlie av": rec("addr:3 charlie av", "Charlie", { GPR: 600000, RET: 100000 }),
    "addr:4 delta rd":   rec("addr:4 delta rd", "Delta", { GPR: 100000, RET: 34000 }),
    "addr:5 echo pl":    rec("addr:5 echo pl", "Echo", { GPR: 145000, RET: 40000 })
  };
  return { records: records, loans: [LE, LD, LC, LB, LA] };   // deliberately shuffled input order
})();
(function (){
  var f = run(mixed.records, mixed.loans);
  var got = f.map(function (x){ return x.name + "/" + x.kind + "/" + x.severity + "/" + x.impact; }).join(" | ");
  var want = ["Bravo/expense/3/50000", "Alpha/dscr/3/15000", "Echo/dscr/3/15000", "Charlie/maturity/2/2000000", "Delta/dy/2/4000", "Alpha/maturity/1/1000000", "Charlie/refi/1/14000"].join(" | ");
  eq(f.length, 7, "seven flags on the mixed set");
  eq(got, want, "exact ranking: severity ↓, impact ↓, name ↑");
  var bad = f.filter(function (x){ return !(isFinite(x.value) && isFinite(x.threshold) && isFinite(x.impact) && [1, 2, 3].indexOf(x.severity) >= 0 &&
    ActionScan.KINDS.indexOf(x.kind) >= 0 && typeof x.propKey === "string" && typeof x.name === "string" && typeof x.detail === "string" && x.detail.length > 0); });
  eq(bad.length, 0, "every flag is well-formed: finite value/threshold/impact, severity 1..3, known kind, non-empty detail");
  ok(JSON.stringify(f).indexOf("NaN") < 0 && JSON.stringify(f).indexOf("null") < 0, "no NaN / null anywhere in the flags");
  eq(run(mixed.records, mixed.loans).map(function (x){ return x.name + x.kind; }).join(), f.map(function (x){ return x.name + x.kind; }).join(), "deterministic across runs");
})();

// ================================================================================
section("purity — inputs are never mutated");
(function (){
  var before = JSON.stringify([mixed.records, mixed.loans, GD]);
  run(mixed.records, mixed.loans);
  eq(JSON.stringify([mixed.records, mixed.loans, GD]), before, "records, loans and globalDefaults byte-identical after a scan");
  var deep = function (o){ if (o && typeof o === "object") { Object.freeze(o); Object.keys(o).forEach(function (k){ deep(o[k]); }); } return o; };
  var fr = deep(JSON.parse(JSON.stringify({ records: mixed.records, loans: mixed.loans, gd: GD })));
  var threw = null; try { ActionScan.scan(fr.records, fr.loans, hooks, fr.gd, { calc: FakeCalc }); } catch (e) { threw = e; }
  eq(threw, null, "scan runs on deep-frozen inputs (strict mode would throw on any write)");
})();

// ================================================================================
section("render — ranked rows carry data-op-flag / data-op-prop, click → onOpen, empty state, idempotent");
(function (){
  var flags = run(mixed.records, mixed.loans);
  var opened = [], mount = { innerHTML: "", onclick: null };
  ActionScan.render(mount, flags, { onOpen: function (k){ opened.push(k); } });
  var h = mount.innerHTML;
  has(h, 'data-op-flag="expense"', "row marked with data-op-flag"); has(h, 'data-op-prop="addr:2 bravo st"', "row marked with data-op-prop");
  ok(h.indexOf('data-op-flag="expense"') < h.indexOf('data-op-flag="dscr"'), "rows appear in ranked order (expense/3 before dscr/3)");
  eq((h.match(/data-op-flag="/g) || []).length, 7, "one row per flag");
  has(h, 'data-op-sev="3"', "severity attribute"); has(h, 'data-op-count="7"', "count header"); has(h, "3 critical", "critical count"); has(h, "Bravo", "property name shown");
  has(h, "border-rose-200", "severity 3 styling"); has(h, "border-amber-200", "severity 2 styling"); has(h, "border-slate-200", "severity 1 styling");
  // delegated click on anything inside a row → onOpen(propKey)
  mount.onclick({ target: { closest: function (sel){ return sel === "[data-op-flag]" ? { getAttribute: function (a){ return a === "data-op-prop" ? "addr:2 bravo st" : null; } } : null; } } });
  eq(opened.join(), "addr:2 bravo st", "click → onOpen(propKey)");
  mount.onclick({ target: { closest: function (){ return null; } } });
  eq(opened.length, 1, "click outside a row is ignored");
  // idempotent: same markup, one handler
  var opened2 = []; ActionScan.render(mount, flags, { onOpen: function (k){ opened2.push(k); } });
  eq(mount.innerHTML, h, "re-render produces identical markup");
  mount.onclick({ target: { closest: function (){ return { getAttribute: function (){ return "addr:1 alpha st"; } }; } } });
  eq(opened2.join() + "|" + opened.length, "addr:1 alpha st|1", "re-render replaces the handler (old callback not fired again)");
  // empty state + escaping
  ActionScan.render(mount, [], { onOpen: function (){} });
  has(mount.innerHTML, "data-op-empty", "empty state marker"); has(mount.innerHTML, "All clear", "empty state text"); ok(mount.innerHTML.indexOf("data-op-flag") < 0, "no rows when empty");
  var odd = ActionScan.html([{ propKey: 'name:a "b" <c>', name: "A & B <Co>", kind: "dscr", severity: 2, value: 1, threshold: 1.2, impact: 0, detail: "x < y" }]);
  has(odd, "A &amp; B &lt;Co&gt;", "name escaped"); has(odd, 'data-op-prop="name:a &quot;b&quot; &lt;c&gt;"', "propKey escaped in the attribute"); has(odd, "x &lt; y", "detail escaped");
  // ONLY the portfolio-level error row (propKey null) has no property: no data-op-prop, and a click on it never calls onOpen
  var er = ActionScan.html([{ propKey: null, name: "Portfolio", kind: "error", severity: 1, value: 0, threshold: 0, impact: 0, detail: "Scan failed: x" }]);
  has(er, 'data-op-flag="error"', "portfolio-level error flag renders as a row"); ok(er.indexOf("data-op-prop") < 0, "…without a data-op-prop"); has(er, "Scan error", "…labelled Scan error");
  var noOpen = 0; ActionScan.render(mount, [], { onOpen: function (){ noOpen++; } });
  mount.onclick({ target: { closest: function (){ return { getAttribute: function (){ return null; } }; } } });
  eq(noOpen, 0, "clicking the portfolio-level row (no data-op-prop) does not call onOpen");
  // a PROPERTY-level error row carries data-op-prop like any other flag — clicking it opens that property
  var pr = ActionScan.html([{ propKey: "addr:0 boom st", name: "Boom", kind: "error", severity: 1, value: 0, threshold: 0, impact: 0, detail: "Scan failed: y" }]);
  has(pr, 'data-op-flag="error" data-op-prop="addr:0 boom st"', "property-level error row carries data-op-prop");
  var openedErr = []; ActionScan.render(mount, [], { onOpen: function (k){ openedErr.push(k); } });
  mount.onclick({ target: { closest: function (){ return { getAttribute: function (a){ return a === "data-op-prop" ? "addr:0 boom st" : null; } }; } } });
  eq(openedErr.join(), "addr:0 boom st", "clicking a property-level error row opens that property");
  ActionScan.render(null, flags, {}); ok(true, "render(null) is a no-op");
})();

// ================================================================================
section("isolation — a throwing hook or a bad record yields ONE error flag for that property; scan() never throws");
(function (){
  var bad = loan({ propertyName: "Boom", propertyAddress: "0 Boom St", _ds: 100000, _bal: 1000000, _explode: true });
  var good = loan({ propertyName: "Alpha", propertyAddress: "1 Alpha St", _ds: 100000, _bal: 1000000 });
  var h = Object.assign({}, hooks, { currentBalance: function (l){ if (l._explode) throw new Error("balance blew up"); return l._bal; } });
  var recs = { "addr:0 boom st": rec("addr:0 boom st", "Boom", { GPR: 145000, RET: [130000, 100000] }), "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }) };
  var f = null, threw = null; try { f = ActionScan.scan(recs, [bad, good], h, GD, { calc: FakeCalc }); } catch (e) { threw = e; }
  eq(threw, null, "scan() does not throw"); f = f || [];
  var errs = f.filter(function (x){ return x.kind === "error"; }), e0 = errs[0] || {};
  eq(errs.length, 1, "exactly one error flag for the broken property");
  eq(e0.propKey, "addr:0 boom st", "error flag carries the property key"); eq(e0.name, "Boom", "…and its name"); eq(e0.severity, 1, "error severity 1");
  has(e0.detail, "balance blew up", "detail carries the hook's message");
  eq(!!find(f, "expense", "addr:0 boom st"), true, "the broken property's rules that did not need the hook still fire (its expense shock)");
  eq(!!find(f, "dscr", "addr:1 alpha st"), true, "the healthy property is still fully evaluated");
  ok(f.every(function (x){ return isFinite(x.value) && isFinite(x.threshold) && isFinite(x.impact); }), "no NaN in any flag, error rows included");
  // a record the calc chokes on → one error flag with the calc's message, nothing else lost
  var g = ActionScan.scan({ "addr:1 alpha st": { propKey: kA, propertyName: "Alpha", lines: "oops" } }, [good], hooks, GD, { calc: { stack: function (){ throw new TypeError("lines.map is not a function"); } } });
  eq(kinds(g), "error", "a record the calc throws on → one error flag"); has((g[0] || {}).detail, "lines.map", "…with the calc's message");
  // missing key hook → one portfolio-level error flag, still no throw
  var k = ActionScan.scan({}, [good], { today: hooks.today }, GD, { calc: FakeCalc });
  eq(kinds(k), "error", "missing hooks.propertyKey → an error flag, not a throw"); has((k[0] || {}).detail, "hooks.propertyKey", "…naming the missing hook"); eq((k[0] || {}).propKey, null, "…with no property to open");
  // shared inputs that blow up: hooks.today, hooks.globalDefaults, a records-map getter, bad opts → ONE portfolio-level error flag each, never a throw
  var attempt = function (fn){ try { return { flags: fn(), threw: null }; } catch (e) { return { flags: null, threw: e }; } };
  var recsOK = { "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }) };
  var t1 = attempt(function (){ return ActionScan.scan(recsOK, [good], Object.assign({}, hooks, { today: function (){ throw new Error("clock broke"); } }), GD, { calc: FakeCalc }); });
  eq(t1.threw, null, "hooks.today throwing → no throw out of scan()"); eq(kinds(t1.flags || []), "error", "…one error flag"); eq(((t1.flags || [])[0] || {}).propKey, null, "…portfolio-level (no property)"); has(((t1.flags || [])[0] || {}).detail, "clock broke", "…with the hook's message");
  var t2 = attempt(function (){ return ActionScan.scan(recsOK, [good], Object.assign({}, hooks, { globalDefaults: function (){ throw new Error("bench broke"); } }), null, { calc: FakeCalc }); });
  eq(t2.threw, null, "hooks.globalDefaults throwing → no throw"); eq(kinds(t2.flags || []), "error", "…one portfolio-level error flag"); has(((t2.flags || [])[0] || {}).detail, "bench broke", "…with its message");
  var trap = {}; Object.defineProperty(trap, "addr:1 alpha st", { enumerable: true, get: function (){ throw new Error("store getter broke"); } });
  var t3 = attempt(function (){ return ActionScan.scan(trap, [good], hooks, GD, { calc: FakeCalc }); });
  eq(t3.threw, null, "a throwing records-map getter → no throw"); eq(kinds(t3.flags || []), "error", "…one portfolio-level error flag"); has(((t3.flags || [])[0] || {}).detail, "store getter broke", "…with its message");
  var badOpts = {}; Object.defineProperty(badOpts, "maturityMonths", { get: function (){ throw new Error("opts broke"); } });
  var t4 = attempt(function (){ return ActionScan.scan(recsOK, [good], hooks, GD, badOpts); });
  eq(t4.threw, null, "opts that throw on read → no throw"); eq(kinds(t4.flags || []), "error", "…one portfolio-level error flag");
  // a record whose propertyName getter throws → a PROPERTY-level error flag (data-op-prop = its key), the rest of the portfolio unaffected
  var badRec = { propKey: kA, lines: { GPR: line(145000, null, true) }, assumptions: null }; Object.defineProperty(badRec, "propertyName", { enumerable: true, get: function (){ throw new Error("name broke"); } });
  var t5 = attempt(function (){ return ActionScan.scan({ "addr:1 alpha st": badRec, "addr:4 delta rd": rec(kD, "Delta", { GPR: 100000, RET: 34000 }) }, [good, D], hooks, GD, { calc: FakeCalc }); });
  eq(t5.threw, null, "a record whose name getter throws → no throw");
  var e5 = find(t5.flags || [], "error", kA) || {};
  eq(e5.propKey, kA, "…a property-level error flag keyed to that property"); has(e5.detail, "name broke", "…with the getter's message");
  eq(!!find(t5.flags || [], "dy", kD), true, "…and the other property is still judged (its dy flag)");
})();

// ================================================================================
section("orphan records — a record whose loans are gone: the expense rule only, named from the record");
(function (){
  var orphan = rec("addr:9 gone st", "Gone Property", { GPR: 100000, RET: [150000, 100000] });   // RET +50% → severity 3
  var f = run({ "addr:9 gone st": orphan }, [A]);   // A sits on another property; nothing is loaned under "addr:9 gone st"
  eq(kinds(f.filter(function (x){ return x.propKey === "addr:9 gone st"; })), "expense", "orphan record → its expense shock is reported and nothing else");
  var o = find(f, "expense", "addr:9 gone st") || {};
  eq(o.name, "Gone Property", "named from record.propertyName"); eq(o.severity, 3, "severity from the jump"); eq(o.impact, 50000, "impact = $ jump");
  eq(run({ "addr:9 gone st": rec("addr:9 gone st", "Gone Property", { GPR: 60000 }) }, []).length, 0, "orphan with a low NOI but no loan → no dscr/dy/maturity/refi (nothing to judge)");
  eq((run({ "addr:9 gone st": rec("addr:9 gone st", "", { RET: [150000, 100000] }) }, [])[0] || {}).name, "addr:9 gone st", "no propertyName on the record → the key is the name");
})();

// ================================================================================
section("guards + thresholds — engine floors 1.20 / 7% underneath the bench, null = inherit (like OperatingCalc.mergeAssumptions)");
(function (){
  eq(ActionScan.scan({}, [], hooks, GD, { calc: FakeCalc }).length, 0, "no loans → empty list");
  eq(ActionScan.scan(null, null, hooks, GD, { calc: FakeCalc }).length, 0, "null inputs → empty list");
  eq(ActionScan.scan({}, [null, undefined], hooks, GD, { calc: FakeCalc }).length, 0, "null loans skipped");
  eq(ActionScan.DEFAULTS.maturityMonths + "/" + ActionScan.DEFAULTS.refiSpread + "/" + ActionScan.DEFAULTS.shockPct, "18/0.005/0.15", "defaults per §8");
  eq(ActionScan.KINDS.join(), "dscr,dy,maturity,refi,expense,error", "KINDS = the five rules + error");
  // no bench at all → the engine floors apply (the sizing card sizes with the same 1.20 / 7%), never silence
  var h = Object.assign({}, hooks, { globalDefaults: null });
  var f0 = ActionScan.scan({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 60000 }) }, [A], h, {}, { calc: FakeCalc });
  eq(kinds(f0), "dscr,dy", "no bench anywhere → 0.60× and 6.0% fire against the floors");
  near((f0[0] || {}).threshold, 1.2, "dscr floor 1.20"); near((f0[1] || {}).threshold, 0.07, "dy floor 7%");
  // a blanked bench field (null) inherits the floor instead of silencing the rule; a per-property override still wins
  var blank = { sizing: { dscrMin: null, dyMin: null, capRate: 0.055 } };
  var f1 = ActionScan.scan({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }) }, [A], hooks, blank, { calc: FakeCalc });
  eq(kinds(f1), "dscr", "global dscrMin null → 1.05× still fires at the 1.20 floor"); near((f1[0] || {}).threshold, 1.2, "threshold = the floor");
  eq(ActionScan.scan({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 145000, RET: 40000 }, { sizing: { dscrMin: 1.0 } }) }, [A], hooks, blank, { calc: FakeCalc }).length, 0, "per-property dscrMin 1.00 still wins over the floor (1.05× passes)");
  // when the calc offers mergeAssumptions, the scan uses it — one merge for sizing and scan
  var merging = Object.assign({}, FakeCalc, { mergeAssumptions: function (g, o){ return { sizing: { dscrMin: 1.5, dyMin: 0.07 } }; } });
  var f2 = ActionScan.scan({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 185000, RET: 40000 }) }, [A], hooks, GD, { calc: merging });   // 1.45× passes 1.20, fails the merged 1.50
  eq(kinds(f2), "dscr", "thresholds come from calc.mergeAssumptions when present"); near((f2[0] || {}).threshold, 1.5, "…its dscrMin");
})();

// ================================================================================
section("integration — the real OperatingCalc, when operating-calc.js exists");
(function (){
  var file = path.join(__dirname, "..", "operating-calc.js");
  if (!fs.existsSync(file)) {
    console.log("  skip operating-calc.js not present — dscr/dy cases above ran against the in-test fake only");
    var nf = ActionScan.scan({ "addr:1 alpha st": rec(kA, "Alpha", { GPR: 60000 }) }, [A], hooks, GD, {});
    eq(kinds(nf), "error", "without a calc (file absent, none injected) the property gets an error flag; scan() does not throw"); has((nf[0] || {}).detail, "OperatingCalc", "…naming the missing module");
    return;
  }
  var real; try { real = require(file); } catch (e) { ok(false, "real operating-calc.js failed to load: " + e.message); return; }
  console.log("  info real OperatingCalc exercised (" + Object.keys(real).join(", ") + ")");
  // GPR 1,000,000 − RET 100,000 → in-place NOI 900,000 (reserves in-place 0, MGMT in-place 0) ; DS 800,000 → DSCR 1.125 → severity 2 ; shortfall (1.20−1.125)×800,000 = 60,000
  var L = loan({ propertyName: "Real", propertyAddress: "8 Real Blvd", _ds: 800000, _bal: 12000000 });
  var r = rec("addr:8 real blvd", "Real", { GPR: 1000000, RET: 100000 });
  var f = null, err = null;
  try { f = ActionScan.scan({ "addr:8 real blvd": r }, [L], hooks, GD, {}); } catch (e) { err = e; }   // no opts.calc: the module resolves ./operating-calc.js itself
  eq(err, null, "scan resolves the real calc at call time" + (err ? " — threw: " + err.message : ""));
  if (!f) return;
  eq(kinds(f), "dscr", "real calc: NOI 900,000 / DS 800,000 → dscr flag only (dy 7.5% fine)");
  near(f[0] && f[0].value, 1.125, "real calc: value 1.125"); eq(f[0] && f[0].severity, 2, "real calc: severity 2"); eq(f[0] && f[0].impact, 60000, "real calc: impact $60,000");
  eq(ActionScan.scan({ "addr:8 real blvd": rec("addr:8 real blvd", "Real", { GPR: 1000000, RET: 40000 }) }, [L], hooks, GD, {}).length, 0, "real calc: NOI 960,000 → 1.20 exactly → no flag");
  // a blanked bench (null dscrMin) resolves through the real mergeAssumptions to the engine's 1.20 — the rule still fires
  var nb = ActionScan.scan({ "addr:8 real blvd": r }, [L], hooks, { sizing: { dscrMin: null, dyMin: null } }, {});
  eq(kinds(nb), "dscr", "real calc: null global dscrMin → 1.125× still fires"); near((nb[0] || {}).threshold, 1.2, "real calc: threshold resolved to the engine's 1.20");
  // an orphan record judged through the real calc's presence: expense only
  var ob = ActionScan.scan({ "addr:8 real blvd": r, "addr:0 orphan": rec("addr:0 orphan", "Orphan", { RET: [150000, 100000] }) }, [L], hooks, GD, {});
  eq(kinds(ob.filter(function (x){ return x.propKey === "addr:0 orphan"; })), "expense", "real calc present: orphan record still reports only its expense shock");
})();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
