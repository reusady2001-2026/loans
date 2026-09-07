// Unit tests for operating-assumptions.js (P6). Plain node, no framework:
//   /opt/node22/bin/node test/operating-assumptions.test.js
// Prints "  ok   …" / "  FAIL …" per assertion and exits 1 on any failure.
"use strict";
var OA = require("../operating-assumptions.js");

var fails = 0, passes = 0;
function ok(cond, msg){ if (cond){ passes++; console.log("  ok   " + msg); } else { fails++; console.log("  FAIL " + msg); } }
function J(v){ return JSON.stringify(v); }
function eq(actual, expected, msg){
  var same = (typeof expected === "object" && expected !== null) ? J(actual) === J(expected) : Object.is(actual, expected);
  ok(same, msg + (same ? "" : "  — got " + J(actual) + ", expected " + J(expected)));
}

// The app's global defaults, byte-for-byte the shape of uwDefaults().bench (index.html).
function globals(){
  return { vacancyPct:0.05, mgmtPct:0.025, reservePerUnit:200, budget:{},
           sizing:{ capRate:0.055, ltvMax:0.75, dscrMin:1.20, dyMin:0.07, intRate:0.055, amortYears:30 } };
}
function rec(assumptions){
  return { propKey:"name:alpha tower", propertyName:"Alpha Tower", units:96, period:null, lines:{},
           assumptions: assumptions === undefined ? null : assumptions,
           meta:{ createdAt:"2026-09-07T00:00:00.000Z", lastUpdated:"2026-09-07T00:00:00.000Z", sourceFile:null } };
}

console.log("resolve");
(function (){
  var G = globals(), snapG = J(G);
  var r = OA.resolve(rec(null), G);
  eq(r, globals(), "null assumptions → deep copy of the globals (every field, incl. sizing + budget)");
  ok(r !== G && r.sizing !== G.sizing && r.budget !== G.budget, "result shares no object with the globals");
  r.sizing.capRate = 0.99; r.budget.INS = 1; r.vacancyPct = 0.5;
  eq(J(G), snapG, "mutating the result leaves the globals untouched");
  eq(OA.resolve(rec(undefined), G), globals(), "record without an assumptions key → copy of the globals");
  eq(OA.resolve({ propKey:"x" }, G), globals(), "record with no assumptions property at all → copy of the globals");
  eq(OA.resolve(null, G), globals(), "null record → copy of the globals");

  var rc = rec({ sizing:{ capRate:0.065 } }), snapR = J(rc);
  var e = OA.resolve(rc, G);
  eq(e.sizing.capRate, 0.065, "nested override beats the global (sizing.capRate 0.065)");
  eq(e.sizing.ltvMax, 0.75, "sibling sizing field inherits (ltvMax 0.75)");
  eq(e.sizing.dscrMin, 1.2, "sibling sizing field inherits (dscrMin 1.2)");
  eq(e.sizing.dyMin, 0.07, "sibling sizing field inherits (dyMin 0.07)");
  eq(e.sizing.intRate, 0.055, "sibling sizing field inherits (intRate 0.055)");
  eq(e.sizing.amortYears, 30, "sibling sizing field inherits (amortYears 30)");
  eq(e.vacancyPct, 0.05, "top-level field inherits (vacancyPct 0.05)");
  eq(e.mgmtPct, 0.025, "top-level field inherits (mgmtPct 0.025)");
  eq(e.reservePerUnit, 200, "top-level field inherits (reservePerUnit 200)");
  eq(e.budget, {}, "budget passes through from the globals");
  eq(Object.keys(e).sort(), ["budget","mgmtPct","reservePerUnit","sizing","vacancyPct"], "no extra keys appear");
  eq(J(rc), snapR, "record.assumptions is not mutated by resolve");
  eq(J(G), snapG, "globals are not mutated by resolve");
  ok(e.sizing !== rc.assumptions.sizing, "result.sizing is not the record's sizing object");
  e.sizing.capRate = 0.01;
  eq(rc.assumptions.sizing.capRate, 0.065, "mutating the result leaves the record untouched");

  var e2 = OA.resolve(rec({ vacancyPct:0.08, reservePerUnit:250 }), G);
  eq([e2.vacancyPct, e2.mgmtPct, e2.reservePerUnit], [0.08, 0.025, 250], "top-level overrides beat globals, mgmtPct inherits");
  eq(e2.sizing, globals().sizing, "untouched sizing block equals the global sizing block");

  var e3 = OA.resolve(rec({ vacancyPct:null, sizing:{ dyMin:null, capRate:0.06, amortYears:undefined } }), G);
  eq([e3.vacancyPct, e3.sizing.dyMin, e3.sizing.capRate, e3.sizing.amortYears], [0.05, 0.07, 0.06, 30], "null / undefined leaves inherit instead of clobbering the global");

  var e4 = OA.resolve(rec({ sizing:{ custom:1 }, budget:{ INS:500 } }), G);
  eq(e4.sizing.custom, 1, "an override key absent from the globals is carried through");
  eq(e4.budget, { INS:500 }, "a nested override into budget merges into the global budget");
  eq(e4.sizing.capRate, 0.055, "…without disturbing the rest of sizing");

  var noSizing = { vacancyPct:0.05, mgmtPct:0.025, reservePerUnit:200 }, ov = { sizing:{ capRate:0.07, dyMin:null } };
  var e5 = OA.resolve(rec(ov), noSizing);
  eq(e5.sizing, { capRate:0.07 }, "globals without a sizing block: the override's sizing is brought in (null leaf dropped)");
  ok(e5.sizing !== ov.sizing, "…as a copy, not a reference into the record");

  eq(OA.resolve(rec({ sizing:{ capRate:0.06 } }), null), { sizing:{ capRate:0.06 } }, "null globals → copy of the record's assumptions");
  eq(OA.resolve(null, null), {}, "nothing at all → {} (never throws)");
  eq(OA.resolve(rec("garbage"), G), globals(), "non-object assumptions are ignored (inherit everything)");
})();

console.log("isOverridden");
(function (){
  var r = rec({ vacancyPct:null, sizing:{ capRate:0.065, dyMin:null } });
  eq(OA.isOverridden(r, "sizing.capRate"), true, "sizing.capRate explicitly set → true");
  eq(OA.isOverridden(r, "sizing.dyMin"), false, "sizing.dyMin set to null → false (null = inherit)");
  eq(OA.isOverridden(r, "vacancyPct"), false, "vacancyPct set to null → false");
  eq(OA.isOverridden(r, "mgmtPct"), false, "mgmtPct absent → false");
  eq(OA.isOverridden(r, "sizing.ltvMax"), false, "sizing.ltvMax absent → false");
  eq(OA.isOverridden(r, "sizing"), true, "an object path counts when any leaf below it is set");
  eq(OA.isOverridden(rec({ sizing:{ dyMin:null } }), "sizing"), false, "…and not when every leaf below it is null");
  eq(OA.isOverridden(r, "nope.nope"), false, "unknown path → false");
  eq(OA.isOverridden(rec({ vacancyPct:0 }), "vacancyPct"), true, "an explicit 0 IS an override");
  eq(OA.isOverridden(rec(null), "sizing.capRate"), false, "null assumptions → false");
  eq(OA.isOverridden(null, "sizing.capRate"), false, "null record → false");
  eq(OA.isOverridden(rec({ sizing:0.06 }), "sizing.capRate"), false, "a primitive where an object is expected → false, no throw");
})();

console.log("diff");
(function (){
  var G = globals();
  // amortYears inserted BEFORE capRate on purpose: the list must come out in canonical field order.
  var r = rec({ sizing:{ amortYears:25, dyMin:null, capRate:0.065 }, vacancyPct:0.08 });
  eq(OA.diff(r, G), [
    { path:"vacancyPct",        global:0.05,  override:0.08 },
    { path:"sizing.capRate",    global:0.055, override:0.065 },
    { path:"sizing.amortYears", global:30,    override:25 }
  ], "exact overridden list in canonical order; null leaves excluded");
  eq(OA.diff(rec(null), G), [], "null assumptions → empty list");
  eq(OA.diff(rec({ sizing:{ dyMin:null } }), G), [], "only-null leaves → empty list");
  eq(OA.diff(rec({ budget:{ INS:500 }, mgmtPct:0.03 }), G),
     [{ path:"mgmtPct", global:0.025, override:0.03 }, { path:"budget.INS", global:null, override:500 }],
     "extra (non-panel) leaves follow the panel fields, global null when the globals lack the path");
  eq(OA.diff(rec({ sizing:{ capRate:0.06 } }), null), [{ path:"sizing.capRate", global:null, override:0.06 }], "null globals → global null");
})();

console.log("percent / plain conversion (fromDisplay)");
(function (){
  eq(OA.fromDisplay("sizing.capRate", "5"), 0.05, "5 → 0.05");
  eq(OA.fromDisplay("sizing.capRate", "5.5"), 0.055, "5.5 → 0.055");
  eq(OA.fromDisplay("vacancyPct", "5.55"), 0.0555, "5.55 → 0.0555");
  eq(OA.fromDisplay("vacancyPct", "5.5555555"), 0.055556, "5.5555555 → 0.055556 (6-decimal rounding)");
  eq(OA.fromDisplay("sizing.dyMin", "7"), 0.07, "7 → 0.07");
  eq(OA.fromDisplay("sizing.intRate", "0.01"), 0.0001, "0.01 → 0.0001");
  eq(OA.fromDisplay("sizing.ltvMax", "12.345678"), 0.123457, "12.345678 → 0.123457");
  eq(OA.fromDisplay("sizing.capRate", "6%"), 0.06, "'6%' → 0.06 (suffix tolerated)");
  eq(OA.fromDisplay("sizing.capRate", " 6.25 "), 0.0625, "' 6.25 ' → 0.0625 (whitespace tolerated)");
  eq(OA.fromDisplay("sizing.capRate", 6), 0.06, "numeric 6 → 0.06");
  eq(OA.fromDisplay("reservePerUnit", "250"), 250, "dollars stay plain: 250 → 250");
  eq(OA.fromDisplay("reservePerUnit", "$1,200"), 1200, "'$1,200' → 1200");
  eq(OA.fromDisplay("sizing.amortYears", "30"), 30, "years stay plain: 30 → 30");
  eq(OA.fromDisplay("sizing.dscrMin", "1.25"), 1.25, "multiples stay plain: 1.25 → 1.25");
  eq(OA.fromDisplay("sizing.capRate", ""), null, "blank → null");
  eq(OA.fromDisplay("sizing.capRate", "abc"), null, "non-numeric → null");
  eq(OA.fromDisplay("sizing.capRate", null), null, "null → null");
  eq(OA.fromDisplay("unknown.path", "5"), 5, "unknown path → plain number, no percent conversion");
  // No float drift anywhere on the grid a user will actually type (0.1% steps).
  var drift = 0;
  for (var k = 1; k <= 999; k++){ var pct = String(k / 10); if (OA.fromDisplay("sizing.capRate", pct) !== Number((k / 1000).toFixed(6))) drift++; }
  eq(drift, 0, "0.1% … 99.9% all convert to the exact 6-decimal literal (0 drifts of 999)");
})();

console.log("display formatting (toDisplay)");
(function (){
  eq(OA.toDisplay("vacancyPct", 0.05), "5", "0.05 → '5'");
  eq(OA.toDisplay("sizing.capRate", 0.055), "5.5", "0.055 → '5.5' (no 5.500000000000001)");
  eq(OA.toDisplay("sizing.capRate", 0.0555), "5.55", "0.0555 → '5.55'");
  eq(OA.toDisplay("sizing.dyMin", 0.07), "7", "0.07 → '7' (no 7.000000000000001)");
  eq(OA.toDisplay("mgmtPct", 0.025), "2.5", "0.025 → '2.5'");
  eq(OA.toDisplay("sizing.ltvMax", 0.75), "75", "0.75 → '75'");
  eq(OA.toDisplay("vacancyPct", 0), "0", "0 → '0' (a real value, not blank)");
  eq(OA.toDisplay("reservePerUnit", 200), "200", "200 → '200'");
  eq(OA.toDisplay("reservePerUnit", 1234.5), "1234.5", "1234.5 → '1234.5'");
  eq(OA.toDisplay("sizing.dscrMin", 1.2), "1.2", "1.2 → '1.2'");
  eq(OA.toDisplay("sizing.amortYears", 30), "30", "30 → '30'");
  eq(OA.toDisplay("sizing.capRate", null), "", "null → ''");
  eq(OA.toDisplay("sizing.capRate", undefined), "", "undefined → ''");
  eq(OA.toDisplay("sizing.capRate", NaN), "", "NaN → ''");
  var bad = 0;
  for (var k = 1; k <= 999; k++){ var s = String(k / 10); if (OA.toDisplay("sizing.capRate", OA.fromDisplay("sizing.capRate", s)) !== s) bad++; }
  eq(bad, 0, "round trip percent → fraction → percent is the identity on 0.1 … 99.9 (0 mismatches of 999)");
})();

console.log("patchFor — minimal nested patches");
(function (){
  var p = OA.patchFor("sizing.capRate", "6");
  eq(p, { sizing:{ capRate:0.06 } }, "'sizing.capRate' 6 → { sizing:{ capRate:0.06 } }");
  eq(Object.keys(p), ["sizing"], "…with no other top-level keys");
  eq(Object.keys(p.sizing), ["capRate"], "…and no other sizing keys");
  eq(OA.patchFor("vacancyPct", "5.5"), { vacancyPct:0.055 }, "'vacancyPct' 5.5 → { vacancyPct:0.055 }");
  eq(OA.patchFor("reservePerUnit", "250"), { reservePerUnit:250 }, "'reservePerUnit' 250 → { reservePerUnit:250 }");
  eq(OA.patchFor("sizing.amortYears", "25"), { sizing:{ amortYears:25 } }, "'sizing.amortYears' 25 → { sizing:{ amortYears:25 } }");
  eq(OA.patchFor("sizing.dscrMin", "1.3"), { sizing:{ dscrMin:1.3 } }, "'sizing.dscrMin' 1.3 → { sizing:{ dscrMin:1.3 } }");
  eq(OA.patchFor("sizing.capRate", ""), { sizing:{ capRate:null } }, "blank → leaf null (clear this override → inherit)");
  eq(OA.patchFor("sizing.capRate", "   "), { sizing:{ capRate:null } }, "whitespace → leaf null");
  eq(OA.patchFor("sizing.capRate", "abc"), null, "non-numeric → null (nothing to apply)");
  eq(OA.patchFor("foo.bar", "1"), { foo:{ bar:1 } }, "unknown path → nested plain-number patch");
  // The patch must round-trip through resolve exactly: apply it as the record's override.
  var eff = OA.resolve(rec(OA.patchFor("sizing.capRate", "6.25")), globals());
  eq(eff.sizing.capRate, 0.0625, "resolve(record with the emitted patch).sizing.capRate === 0.0625");
  eq(eff.sizing.ltvMax, 0.75, "…and the rest of sizing still inherits");
})();

console.log("FIELDS");
(function (){
  eq(OA.FIELDS.map(function (f){ return f.path; }),
     ["vacancyPct","mgmtPct","reservePerUnit","sizing.capRate","sizing.ltvMax","sizing.dscrMin","sizing.dyMin","sizing.intRate","sizing.amortYears"],
     "exactly the nine §2 paths, in panel order");
  eq(OA.FIELDS.filter(function (f){ return f.kind === "pct"; }).map(function (f){ return f.path; }),
     ["vacancyPct","mgmtPct","sizing.capRate","sizing.ltvMax","sizing.dyMin","sizing.intRate"], "the six percent fields");
  eq(OA.FIELDS.filter(function (f){ return f.kind !== "pct"; }).map(function (f){ return f.path + ":" + f.kind; }),
     ["reservePerUnit:money","sizing.dscrMin:mult","sizing.amortYears:int"], "dollars / multiple / years are plain");
})();

console.log("panelHtml (pure markup)");
(function (){
  var G = globals();
  var html = OA.panelHtml(rec({ sizing:{ capRate:0.065 }, vacancyPct:0.08 }), G);
  var count = function (re){ return (html.match(re) || []).length; };
  OA.FIELDS.forEach(function (f){ ok(html.indexOf('data-op-assump="' + f.path + '"') >= 0, "input for " + f.path + " present"); });
  eq(count(/data-op-assump="/g), 9, "exactly nine inputs");
  ok(html.indexOf('id="opAssumpReset"') >= 0, "#opAssumpReset present");
  ok(/data-op-badge="sizing\.capRate"[^>]*>override</.test(html), "capRate badge reads 'override'");
  ok(/data-op-badge="vacancyPct"[^>]*>override</.test(html), "vacancyPct badge reads 'override'");
  ok(/data-op-badge="sizing\.ltvMax"[^>]*>inherited</.test(html), "ltvMax badge reads 'inherited'");
  ok(/data-op-badge="mgmtPct"[^>]*>inherited</.test(html), "mgmtPct badge reads 'inherited'");
  eq(count(/>override</g), 2, "two 'override' badges");
  eq(count(/>inherited</g), 7, "seven 'inherited' badges");
  ok(/data-op-assump="sizing\.capRate" value="6\.5"/.test(html), "capRate input shows the override as a percent: 6.5");
  ok(/data-op-assump="vacancyPct" value="8"/.test(html), "vacancy input shows 8");
  ok(/data-op-assump="sizing\.ltvMax" value="75"/.test(html), "inherited ltvMax shows the global 75");
  ok(/data-op-assump="sizing\.dscrMin" value="1\.2"/.test(html), "inherited dscrMin shows 1.2 (plain)");
  ok(/data-op-assump="reservePerUnit" value="200"/.test(html), "inherited reservePerUnit shows 200 (plain)");
  ok(/data-op-assump="sizing\.amortYears" value="30"/.test(html), "inherited amortYears shows 30 (plain)");
  ok(html.indexOf("2 overrides") >= 0, "summary reads '2 overrides'");
  ok(html.indexOf('title="Global default: 5.5%"') >= 0, "override badge carries the global default in its title");

  var h2 = OA.panelHtml(rec(null), G);
  eq((h2.match(/>inherited</g) || []).length, 9, "all-inherited record: nine 'inherited' badges");
  eq((h2.match(/>override</g) || []).length, 0, "…and no 'override' badge");
  ok(h2.indexOf("all inherited") >= 0, "summary reads 'all inherited'");
  var h3 = OA.panelHtml(rec({ vacancyPct:0.06 }), G);
  ok(h3.indexOf("1 override<") >= 0, "single override summary is singular");
})();

console.log("render without a real DOM");
(function (){
  eq(OA.render(null, {}), null, "render(null) → null, no throw");
  // A minimal fake mount: enough surface to prove render writes the panel and
  // survives an environment with no matching nodes to bind.
  var fake = { innerHTML:"", querySelectorAll:function (){ return []; }, querySelector:function (){ return null; } };
  var out = OA.render(fake, { record: rec({ sizing:{ capRate:0.065 } }), globalDefaults: globals() });
  ok(out === fake, "render returns the mount");
  ok(fake.innerHTML.indexOf('data-op-assump="sizing.capRate" value="6.5"') >= 0, "the mount now holds the panel markup with the override shown");
  OA.render(fake, { record: rec(null), globalDefaults: globals() });
  ok(fake.innerHTML.indexOf('data-op-assump="sizing.capRate" value="5.5"') >= 0 && fake.innerHTML.indexOf(">override<") < 0, "re-render replaces the panel (idempotent)");
})();

console.log("");
console.log(passes + " passed, " + fails + " failed");
if (fails) process.exit(1);
