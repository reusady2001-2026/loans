/* Tests for rent-roll.js: parse a multifamily rent-roll grid (real Yardi shape — two-row header, several
   properties stacked in one sheet, status sections, a printed Summary Groups footing) into per-property
   unit records + unit statistics. Applies Azriel's rules: GPR grossed up (vacant at market), average
   ACTUAL rent excludes vacant zeros, the Future/Applicant pipeline is excluded, commercial kept for NOI
   but out of the residential per-unit math, stats by unit type. Run: node test/rent-roll.test.js */
"use strict";
var RR = require("../rent-roll.js");

var passes = 0, fails = 0;
function ok(cond, msg, detail){ if (cond) { passes++; console.log("  ok   " + msg); } else { fails++; console.log("  FAIL " + msg + (detail ? "\n         " + detail : "")); } }
function eq(a, b, msg){ ok(a === b, msg, a + " vs " + b); }
function group(name, fn){ console.log("\n" + name); try { fn(); } catch (e) { ok(false, name + " — unexpected exception", (e && e.stack) || String(e)); } }
function prop(res, name){ return res.properties.filter(function(p){ return p.name === name; })[0]; }
function stat(p, type){ return p.unitStats.filter(function(s){ return s.type === type; })[0]; }

// A synthetic rent roll in the real Yardi shape: title rows, a TWO-ROW header ("Market"/"Rent",
// "Actual"/"Rent", "Unit"/"Sq Ft"), two properties each closed by a "Total <name>" row, a
// Current/Notice/Vacant section and a Future/Applicant pipeline section, a VACANT unit, a CAM
// commercial unit, and a printed Summary Groups footing.
var GRID = [
  ["Rent Roll", null, null, null, null, null, null, null],
  ["For Selected Properties", null, null, null, null, null, null, null],
  ["As Of = 09/10/2026", null, null, null, null, null, null, null],
  ["Unit", "Unit Type", "Unit", "Resident", "Name", "Market", "Actual", "Move In"],   // header row 1
  ["", "", "Sq Ft", "", "", "Rent", "Rent", ""],                                       // header row 2 (sub)
  ["Current/Notice/Vacant Residents", null, null, null, null, null, null, null],
  ["10CAM", "CAM", "0", "t001", "Joe's Diner", "50", "5000", "44000"],                 // commercial (CAM)
  ["101", "A1", "800", "t002", "Alice", "1500", "1500", "45000"],                      // occupied
  ["102", "A1", "800", "VACANT", "VACANT", "1500", "0", ""],                           // vacant (market grossed up)
  ["Future Residents/Applicants", null, null, null, null, null, null, null],
  ["103", "A1", "800", "t003", "Bob", "1500", "0", "46500"],                           // FUTURE — excluded
  ["", "", "", "Total", "Maple Court(15001)", "3050", "6500", ""],
  [null, null, null, null, null, null, null, null],
  ["Current/Notice/Vacant Residents", null, null, null, null, null, null, null],
  ["201", "B2", "1000", "t004", "Carol", "2000", "1900", "45500"],                     // occupied
  ["202", "B2", "1000", "t005", "Dave", "2000", "2000", "45600"],                      // occupied
  ["", "", "", "Total", "Oak Plaza", "4000", "3900", ""],
  [null, null, null, null, null, null, null, null],
  ["406", "", "", "Total", "All Properties", "9050", "14400", ""],                     // grand total (not a property)
  ["Summary Groups", "", "", "", "Square", "Market", "Actual", "# Of Units"],
  ["", "", "", "", "Footage", "Rent", "Rent", "% Unit Occupancy"],
  ["Occupied Units", "", "", "", "", "", "", "3"],
  ["Total Vacant Units", "", "", "", "", "", "", "1"],
  ["Totals:", "", "", "", "", "", "", "4"]
];

group("two-row header detection", function(){
  var h = RR.findHeader(GRID);
  eq(h.headerRow, 3, "the header row is the first of the two-row header");
  ok(h.twoRow === true, "a two-row header is detected");
  eq(h.dataStart, 5, "data starts after both header rows");
  ok(h.map.market === 5 && h.map.actual === 6 && h.map.sqft === 2, "the merged header maps Market Rent / Actual Rent / Unit Sq Ft");
});

group("several properties split at their Total rows", function(){
  var r = RR.parse(GRID);
  eq(r.properties.length, 2, "two properties (the All Properties grand total is not a property)");
  ok(!!prop(r, "Maple Court") && !!prop(r, "Oak Plaza"), "properties named from their Total rows, with the (code) stripped");
});

group("Maple Court — residential/commercial split, grossed-up GPR, vacant-excluded average", function(){
  var m = prop(RR.parse(GRID), "Maple Court");
  eq(m.residentialUnits, 2, "2 residential units (the CAM tenant is commercial; the Future unit is excluded)");
  eq(m.commercialUnits, 1, "1 commercial unit (the CAM restaurant)");
  eq(m.vacantUnits, 1, "1 vacant residential unit");
  eq(m.gprAnnual, 36000, "GPR grossed up: both residential units at market 1,500 × 12 = 36,000 (vacant included)");
  eq(m.avgActualRent, 1500, "average actual rent excludes the vacant zero (only unit 101 counts)");
  eq(m.occupancy, 0.5, "occupancy is 1 of 2 = 0.5");
  eq(m.commercialAnnual, 60000, "commercial income = the CAM actual 5,000 × 12 = 60,000 (kept for NOI)");
});

group("the Future/Applicant section is the pipeline and is excluded", function(){
  var m = prop(RR.parse(GRID), "Maple Court");
  ok(!m.units.some(function(u){ return u.unit === "103"; }), "the future unit 103 is not among Maple Court's units");
});

group("Oak Plaza — fully occupied", function(){
  var o = prop(RR.parse(GRID), "Oak Plaza");
  eq(o.residentialUnits, 2, "2 residential units");
  eq(o.commercialUnits, 0, "no commercial");
  eq(o.avgActualRent, 1950, "average actual rent = (1900+2000)/2 = 1,950");
  eq(o.occupancy, 1, "occupancy 1.0");
  var b2 = stat(o, "B2");
  ok(b2 && b2.count === 2 && b2.avgSqft === 1000 && b2.avgMarketRent === 2000, "the B2 unit-type stats: 2 units, 1,000 sqft, 2,000 market");
});

group("the printed Summary Groups footing is captured for reconciliation", function(){
  var s = RR.parse(GRID).summary;
  ok(!!s, "a summary block is captured");
  eq(s.totalUnits, 4, "total units 4");
  eq(s.occupiedUnits, 3, "occupied units 3");
  eq(s.vacantUnits, 1, "vacant units 1");
});

group("a single-property sheet (one-row header, no Total row) still parses", function(){
  var g = [
    ["Unit", "Unit Type", "Sq Ft", "Market Rent", "Actual Rent", "Status"],
    ["101", "1BR", 750, 1500, 1500, "Occupied"],
    ["102", "1BR", 750, 1500, 0, "Vacant"]
  ];
  var r = RR.parse(g);
  eq(r.properties.length, 1, "one property");
  eq(r.properties[0].residentialUnits, 2, "2 residential units");
  eq(r.properties[0].gprAnnual, 36000, "GPR 36,000");
  eq(r.properties[0].avgActualRent, 1500, "actual-rent average excludes the vacant zero");
});

group("anomalies are listed per property, not dropped or thresholded", function(){
  var g = [
    ["Unit", "Unit Type", "Market Rent", "Actual Rent"],
    ["1", "1BR", 1500, 1600],   // actual above market
    ["2", "", 1400, 1400],      // no type
    ["3", "1BR", null, null]    // no rents
  ];
  var w = RR.parse(g).properties[0].warnings.join(" | ");
  ok(/above its market/.test(w), "an actual rent above market is listed");
  ok(/no unit type/.test(w), "a unit with no type is listed");
  ok(/no market or actual rent/.test(w), "a unit with no rents is listed");
});

group("junk / empty input never throws", function(){
  ok(RR.parse(null).headerRow === -1, "null grid → empty parse");
  ok(RR.parse([["hello", "world"], ["a", "b"]]).headerRow === -1, "a header-less grid → empty parse");
  ok(RR.parse([]).properties.length === 0, "empty grid → no properties");
});

console.log("\n" + (fails ? (fails + " FAILED, " + passes + " passed") : ("all " + passes + " rent-roll tests passed")));
process.exit(fails ? 1 : 0);
