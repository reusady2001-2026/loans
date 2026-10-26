/* Tests for the 2.9.2 per-line underwritten OVERRIDES in SetupBuilder.buildSetup: pinning a line's
   underwritten value fixes that line and recomputes the NOI from it. Empty overrides leave every number
   exactly as before. Every expected figure is worked by hand; none is read back from the module.
   Run:  node test/line-override.test.js */
"use strict";
var path = require("path");
global.window = {};
var SB = require(path.join(__dirname, "..", "setup-builder.js"));
delete global.window;

var pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } }
function cents(g, w, m){ ok(typeof g === "number" && Math.abs(g - w) <= 0.005, m + "  [got " + g + ", want " + w + "]"); }

var BENCH = { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200, badDebtPct: 0.01, budget: {},
  sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30 } };
var SUMS = { GPR: 1000000, VAC: -50000, PAY: 200000, RET: 50000 };   // PAY passes through at 200,000 by default

console.log("\nbaseline (no overrides)");
var base = SB.buildSetup({ categorySums: SUMS, units: 100, benchmarks: BENCH });
cents(base.result.underwritten.lines.PAY, 200000, "PAY underwritten passes through at 200,000");
var baseNoi = base.result.underwritten.noi;
ok(typeof baseNoi === "number" && baseNoi > 0, "baseline underwritten NOI computes (" + baseNoi + ")");

console.log("\npin PAY to 170,000 (input.lineOverrides)");
var ov = SB.buildSetup({ categorySums: SUMS, units: 100, benchmarks: BENCH, lineOverrides: { PAY: 170000 } });
cents(ov.result.underwritten.lines.PAY, 170000, "PAY is pinned to 170,000");
cents(ov.result.underwritten.noi, baseNoi + 30000, "the NOI recomputes from the pin (30,000 less expense → +30,000 NOI)");

console.log("\npin via a { value, by, at } record, and via benchmarks.lineOverrides");
var rec = SB.buildSetup({ categorySums: SUMS, units: 100, benchmarks: BENCH, lineOverrides: { PAY: { value: 170000, by: "Yuval", at: "2026-09-15T00:00:00Z" } } });
cents(rec.result.underwritten.lines.PAY, 170000, "the { value, ... } record form pins the same 170,000");
cents(rec.result.underwritten.noi, baseNoi + 30000, "…and moves the NOI identically");
var viaBench = SB.buildSetup({ categorySums: SUMS, units: 100, benchmarks: Object.assign({}, BENCH, { lineOverrides: { PAY: 170000 } }) });
cents(viaBench.result.underwritten.noi, baseNoi + 30000, "an override carried inside benchmarks.lineOverrides reaches the engine too");

console.log("\n$/unit pin: 1,700/unit on 100 units = 170,000 total");
// the app converts a $/unit edit to a total (value × units) before storing; the engine sees the total.
var perUnitTotal = 1700 * 100;
var pu = SB.buildSetup({ categorySums: SUMS, units: 100, benchmarks: BENCH, lineOverrides: { PAY: perUnitTotal } });
cents(pu.result.underwritten.lines.PAY, 170000, "1,700/unit × 100 units pins PAY at 170,000");

console.log("\nempty overrides = no change");
var empty = SB.buildSetup({ categorySums: SUMS, units: 100, benchmarks: BENCH, lineOverrides: {} });
cents(empty.result.underwritten.noi, baseNoi, "an empty override map leaves the NOI exactly at baseline");
ok(JSON.stringify(empty.result.underwritten) === JSON.stringify(base.result.underwritten), "…and the whole underwritten block is byte-identical");

console.log("\n" + (fail ? (fail + " FAILED, " + pass + " passed") : ("all " + pass + " line-override checks passed")));
process.exit(fail ? 1 : 0);
