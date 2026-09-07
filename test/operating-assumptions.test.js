// Unit tests for operating-assumptions.js (P6). Plain node, no framework:
//   /opt/node22/bin/node test/operating-assumptions.test.js
// Prints "  ok   …" / "  FAIL …" per assertion and exits 1 on any failure.
"use strict";
var OA = require("../operating-assumptions.js");

var fails = 0, passes = 0;
function ok(cond, msg){ if (cond){ passes++; console.log("  ok   " + msg); } else { fails++; console.log("  FAIL " + msg); } }
// Key-order-insensitive deep equality: the defaults underlay carries OperatingCalc's key
// order, which is not the point of any assertion here — the numbers are.
function sortKeys(v){ if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === "object"){ var o = {}; Object.keys(v).sort().forEach(function (k){ o[k] = sortKeys(v[k]); }); return o; } return v; }
function J(v){ return JSON.stringify(sortKeys(v)); }
function nest(path, v){ var o = {}, c = o, p = path.split("."); for (var i = 0; i < p.length - 1; i++) c = c[p[i]] = {}; c[p[p.length - 1]] = v; return o; }
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
  var e5 = OA.resolve(rec(ov), noSizing), s5 = globals().sizing; s5.capRate = 0.07;
  eq(e5.sizing, s5, "globals without a sizing block: the app defaults fill in under the override (null leaf → the default 0.07)");
  ok(e5.sizing !== ov.sizing, "…as a copy, not a reference into the record");

  var g6 = globals(); g6.sizing.capRate = 0.06;
  eq(OA.resolve(rec({ sizing:{ capRate:0.06 } }), null), g6, "null globals → the app defaults underneath the record's override");
  eq(OA.resolve(null, null), globals(), "nothing at all → the app defaults (never throws)");
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
  eq(OA.diff(rec({ sizing:{ capRate:0.06 } }), null), [{ path:"sizing.capRate", global:0.055, override:0.06 }], "null globals → global is the app default 0.055 actually inherited");
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
  ok(html.indexOf("grid-cols-2") < 0, "single-column layout: no two-column grid anywhere");
  eq(count(/<label class="flex items-center justify-between gap-2/g), 9, "nine rows, each label-left / control-right (the app's own sizing-row idiom)");

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

console.log("strict numeric entry — one plain decimal or nothing");
(function (){
  eq(OA.fromDisplay("sizing.capRate", "1e3"), null, "'1e3' → null (not silently 13)");
  eq(OA.fromDisplay("sizing.capRate", "1.2.3"), null, "'1.2.3' → null (not 1.2)");
  eq(OA.fromDisplay("sizing.capRate", "5-"), null, "'5-' → null (not 5)");
  eq(OA.fromDisplay("sizing.capRate", "--5"), null, "'--5' → null");
  eq(OA.fromDisplay("sizing.capRate", "5."), null, "'5.' → null");
  eq(OA.fromDisplay("sizing.capRate", "5 5"), null, "'5 5' → null (not 55)");
  eq(OA.fromDisplay("sizing.capRate", "5x"), null, "'5x' → null");
  eq(OA.fromDisplay("sizing.capRate", ".5"), 0.005, "'.5' → 0.005");
  eq(OA.fromDisplay("sizing.capRate", "+5"), 0.05, "'+5' → 0.05");
  eq(OA.fromDisplay("sizing.capRate", "6 %"), 0.06, "'6 %' → 0.06");
  eq(OA.patchFor("sizing.capRate", "1e3"), null, "'1e3' → no patch");
  eq(OA.patchFor("sizing.capRate", "1.2.3"), null, "'1.2.3' → no patch");
  eq(OA.patchFor("sizing.capRate", "5-"), null, "'5-' → no patch");
  eq(OA.check("sizing.capRate", "1e3"), { value:null, error:"not a number" }, "check('1e3') → 'not a number'");
  eq(OA.check("sizing.capRate", ""), { value:null, error:null }, "check('') → blank, no error");
  eq(OA.check("sizing.capRate", "6"), { value:0.06, error:null }, "check('6') → 0.06");
})();

console.log("ranges — out of range → no patch");
(function (){
  var no = function (path, raw, msg){ eq(OA.patchFor(path, raw), null, msg + " → no patch"); eq(OA.check(path, raw).error, "out of range", msg + " → 'out of range'"); };
  var yes = function (path, raw, v, msg){ eq(OA.patchFor(path, raw), nest(path, v), msg + " → " + J(nest(path, v))); };
  no("vacancyPct", "-5", "vacancy -5"); yes("vacancyPct", "0", 0, "vacancy 0"); yes("vacancyPct", "100", 1, "vacancy 100"); no("vacancyPct", "100.1", "vacancy 100.1");
  no("mgmtPct", "-10", "mgmt -10"); yes("mgmtPct", "2.5", 0.025, "mgmt 2.5"); no("mgmtPct", "101", "mgmt 101");
  no("reservePerUnit", "-1", "reserve -1"); yes("reservePerUnit", "0", 0, "reserve 0"); yes("reservePerUnit", "1500", 1500, "reserve 1500");
  no("sizing.capRate", "-5", "cap rate -5"); no("sizing.capRate", "0", "cap rate 0 (exclusive bound)"); yes("sizing.capRate", "0.01", 0.0001, "cap rate 0.01"); yes("sizing.capRate", "100", 1, "cap rate 100"); no("sizing.capRate", "100.5", "cap rate 100.5");
  no("sizing.ltvMax", "120", "LTV 120"); no("sizing.ltvMax", "-1", "LTV -1"); yes("sizing.ltvMax", "0", 0, "LTV 0"); yes("sizing.ltvMax", "100", 1, "LTV 100");
  no("sizing.dscrMin", "0", "DSCR 0 (exclusive bound)"); no("sizing.dscrMin", "-1", "DSCR -1"); yes("sizing.dscrMin", "0.5", 0.5, "DSCR 0.5"); yes("sizing.dscrMin", "3", 3, "DSCR 3");
  no("sizing.dyMin", "-1", "debt yield -1"); yes("sizing.dyMin", "100", 1, "debt yield 100"); no("sizing.dyMin", "550", "debt yield 550");
  no("sizing.intRate", "550", "interest 550"); no("sizing.intRate", "-0.5", "interest -0.5"); yes("sizing.intRate", "0", 0, "interest 0"); yes("sizing.intRate", "100", 1, "interest 100");
  no("sizing.amortYears", "-5", "amort -5"); yes("sizing.amortYears", "0", 0, "amort 0"); yes("sizing.amortYears", "50", 50, "amort 50"); no("sizing.amortYears", "51", "amort 51"); no("sizing.amortYears", "27.5", "amort 27.5 (not a whole year)");
  eq(OA.check("sizing.ltvMax", "120"), { value:null, error:"out of range", range:"0–100%" }, "check carries the field's range wording");
  eq(OA.check("sizing.amortYears", "27.5"), { value:null, error:"out of range", range:"whole years, 0–50" }, "…amortYears wording");
  eq(OA.patchFor("foo.bar", "-99"), { foo:{ bar:-99 } }, "unknown paths have no range (unchanged behaviour)");
})();

console.log("underlay — the app defaults sit under the globals (OperatingCalc.DEFAULTS)");
(function (){
  var OC = null; try { OC = require("../operating-calc.js"); } catch (e) { OC = null; }
  var D = { vacancyPct:0.05, mgmtPct:0.025, reservePerUnit:200, budget:{}, sizing:{ capRate:0.055, ltvMax:0.75, dscrMin:1.2, dyMin:0.07, intRate:0.055, amortYears:30 } };
  ok(!!(OC && OC.DEFAULTS), "operating-calc.js loads in node and exposes DEFAULTS");
  if (OC) eq(OC.DEFAULTS, D, "OperatingCalc.DEFAULTS carries the app's standard numbers (panel and calc share them)");
  eq(OA.resolve(null, null), D, "no record, no globals → the app defaults");
  var G = globals(); G.sizing.capRate = null; G.vacancyPct = null;   // the Setup tab stores null for a blanked box
  var e = OA.resolve(rec(null), G);
  eq([e.sizing.capRate, e.vacancyPct, e.sizing.ltvMax], [0.055, 0.05, 0.75], "a null GLOBAL leaf falls back to the app default; the others keep the global");
  eq(OA.isOverridden(rec(null), "sizing.capRate"), false, "…and the field is still 'inherited' for the record");
  eq(OA.inheritedValue("sizing.capRate", G), 0.055, "inheritedValue(capRate) with a null global → 0.055");
  eq(OA.inheritedValue("sizing.ltvMax", G), 0.75, "inheritedValue(ltvMax) → the global 0.75");
  var G2 = globals(); G2.sizing.capRate = 0.0625;
  eq(OA.inheritedValue("sizing.capRate", G2), 0.0625, "a real global wins over the default");
  eq(OA.inheritedValue("budget.INS", G2), undefined, "no default and no global → undefined");
  ok(OA.panelHtml(rec(null), G).indexOf('data-op-assump="sizing.capRate" value="5.5"') >= 0, "panel shows 5.5 — the number actually used — for a null global cap rate, not an empty box");
  ok(/data-op-badge="sizing\.capRate"[^>]*>inherited</.test(OA.panelHtml(rec(null), G)), "…badged 'inherited'");
  eq(OA.diff(rec({ sizing:{ capRate:0.07 } }), G)[0], { path:"sizing.capRate", global:0.055, override:0.07 }, "diff.global reports the default actually inherited when the global is null");
  if (OC) eq(OA.resolve(rec({ sizing:{ capRate:0.07 } }), G), OC.mergeAssumptions(G, { sizing:{ capRate:0.07 } }), "resolve agrees with OperatingCalc.mergeAssumptions field for field");
})();

console.log("commit — what one entry means for the panel");
(function (){
  var G = globals(), inh = rec(null), ovr = rec({ sizing:{ capRate:0.0625 } });
  eq(OA.commit(inh, G, "sizing.ltvMax", "75"), { patch:null, value:"75", state:null, warn:null }, "re-entering the inherited 75 into an inherited field → no patch, nothing flips");
  eq(OA.commit(inh, G, "sizing.ltvMax", "75.0"), { patch:null, value:"75", state:null, warn:null }, "'75.0' is the same value → no patch, box normalised to 75");
  eq(OA.commit(inh, G, "sizing.ltvMax", "80"), { patch:{ sizing:{ ltvMax:0.8 } }, value:"80", state:"override", warn:null }, "a different value → override patch, badge → override");
  eq(OA.commit(ovr, G, "sizing.capRate", "5.5"), { patch:{ sizing:{ capRate:null } }, value:"5.5", state:"inherited", warn:null }, "typing the inherited 5.5 into an overridden field → clears the override (leaf null)");
  eq(OA.commit(ovr, G, "sizing.capRate", "6.250"), { patch:null, value:"6.25", state:null, warn:null }, "retyping the current override → no patch");
  eq(OA.commit(ovr, G, "sizing.capRate", "7"), { patch:{ sizing:{ capRate:0.07 } }, value:"7", state:"override", warn:null }, "a new override value → patch");
  eq(OA.commit(ovr, G, "sizing.capRate", ""), { patch:{ sizing:{ capRate:null } }, value:"5.5", state:"inherited", warn:null }, "blank on an overridden field → clear it, box shows the inherited 5.5");
  eq(OA.commit(inh, G, "sizing.capRate", ""), { patch:null, value:"5.5", state:null, warn:null }, "blank on an inherited field → nothing to clear, box restored");
  eq(OA.commit(ovr, G, "sizing.capRate", "abc"), { patch:null, value:"6.25", state:null, warn:{ text:"not a number", title:"Enter a plain number, e.g. 6.25" } }, "'abc' → no patch, box restored to the effective 6.25, 'not a number'");
  eq(OA.commit(inh, G, "sizing.ltvMax", "120"), { patch:null, value:"75", state:null, warn:{ text:"out of range", title:"Allowed: 0–100%" } }, "'120' → no patch, box restored to 75, 'out of range' with the allowed range");
  eq(OA.commit(inh, G, "sizing.amortYears", "-5"), { patch:null, value:"30", state:null, warn:{ text:"out of range", title:"Allowed: whole years, 0–50" } }, "amortYears -5 → refused, box restored to 30");
  var Gn = globals(); Gn.sizing.capRate = null;
  eq(OA.commit(inh, Gn, "sizing.capRate", "5.5"), { patch:null, value:"5.5", state:null, warn:null }, "with a null global, typing the default 5.5 is a no-op (the underlay IS the inherited value)");
  eq(OA.commit(null, G, "vacancyPct", "8"), { patch:{ vacancyPct:0.08 }, value:"8", state:"override", warn:null }, "null record → inherits everything, so 8 is an override");
})();

console.log("");
console.log(passes + " passed, " + fails + " failed");
if (fails) process.exit(1);
