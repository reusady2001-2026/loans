/* Tests for the 2.9.2 GL mapping overrides on T12Classify, and that a re-map moves a line's dollars
   into the new category through SetupBuilder.classifySum (the "$/unit moves after Recompute" mechanism).
   Empty overrides must leave classification (and every reference number) exactly as the pure rules.
   Run:  node test/gl-mapping.test.js */
"use strict";
var path = require("path");
global.window = {};
var C = require(path.join(__dirname, "..", "t12-classify.js"));
var SB = require(path.join(__dirname, "..", "setup-builder.js"));
delete global.window;

var pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } }
function eq(g, w, m){ ok(g === w, m + "  [got " + JSON.stringify(g) + ", want " + JSON.stringify(w) + "]"); }

// ── the override registry ──
console.log("\noverride registry");
eq(typeof C.setOverrides, "function", "T12Classify exposes setOverrides");
eq(JSON.stringify(C.getOverrides()), "{}", "overrides start empty");

var LINE = { name: "Cable & Internet Reimbursement", section: "EXPENSES", sub: "" };
var def = C.classifyConfident(LINE.name, LINE.section, LINE.sub).code;
ok(typeof def === "string" && def.length > 0, "the line classifies to some default category by the rules (" + def + ")");

// re-map it to Real Estate Taxes (a clearly different category)
C.setOverrides({ "Cable & Internet Reimbursement": "RET" });
var ov = C.classifyConfident(LINE.name, LINE.section, LINE.sub);
eq(ov.code, "RET", "after the re-map the line classifies to RET");
ok(ov.confident === true, "an overridden line is confident");
ok(def !== "RET", "…and RET is not where the rules put it (the re-map actually moved it)");

// name matching is normalized (case / whitespace insensitive)
eq(C.classifyConfident("  cable & internet   reimbursement ", "EXPENSES", "").code, "RET", "the override matches on a normalized name (case + spacing)");
// an unrelated line is untouched
var other = C.classifyConfident("Real Estate Taxes", "EXPENSES", "").code;
C.setOverrides({});
eq(C.classifyConfident("Real Estate Taxes", "EXPENSES", "").code, other, "an unmapped line is unaffected, and clearing restores the rule");
eq(C.classifyConfident(LINE.name, LINE.section, LINE.sub).code, def, "clearing the overrides restores the line's rule category");

// ── the re-map moves the DOLLARS through classifySum (what Recompute uses) ──
console.log("\nre-map moves the dollars (classifySum)");
var lines = [
  { name: "Rental Income", section: "INCOME", amount: 1000000 },
  { name: "Cable & Internet Reimbursement", section: "EXPENSES", amount: -12000 }
];
C.setOverrides({});
var s0 = SB.classifySum(lines).sums;
var home = def;                                   // the category the rules gave the cable line
eq(s0[home], -12000, "with no override, the 12,000 sits in its rule category (" + home + ")");
ok(!s0.RET || s0.RET === 0, "…and nothing is in RET yet");

C.setOverrides({ "Cable & Internet Reimbursement": "RET" });
var s1 = SB.classifySum(lines).sums;
eq(s1.RET, -12000, "after the re-map the 12,000 is summed into RET");
ok(!s1[home] || s1[home] === 0, "…and it has left its old category (" + home + ")");
C.setOverrides({});

// ── empty overrides never change classifySum output ──
console.log("\nempty overrides = pure rules");
var a = JSON.stringify(SB.classifySum(lines).sums);
C.setOverrides({});
var b = JSON.stringify(SB.classifySum(lines).sums);
eq(a, b, "classifySum is identical with empty overrides (reference numbers untouched)");

console.log("\n" + (fail ? (fail + " FAILED, " + pass + " passed") : ("all " + pass + " GL-mapping checks passed")));
process.exit(fail ? 1 : 0);
