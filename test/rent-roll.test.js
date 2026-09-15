/* Tests for rent-roll.js: parse a multifamily rent-roll grid into unit records + unit statistics,
   applying Azriel's rules — GPR = grossed-up market rent (vacant units at market), average ACTUAL rent
   excludes vacant zeros, commercial excluded from residential per-unit figures, stats by unit type.
   Plain node, no framework. Run:  node test/rent-roll.test.js */
"use strict";
var RR = require("../rent-roll.js");

var passes = 0, fails = 0;
function ok(cond, msg, detail){
  if (cond) { passes++; console.log("  ok   " + msg); }
  else { fails++; console.log("  FAIL " + msg + (detail ? "\n         " + detail : "")); }
}
function eq(a, b, msg){ ok(a === b, msg, a + " vs " + b); }
function group(name, fn){ console.log("\n" + name); try { fn(); } catch (e) { ok(false, name + " — unexpected exception", (e && e.stack) || String(e)); } }
function stat(res, type){ return res.unitStats.filter(function(s){ return s.type === type; })[0]; }

// A rent roll as SheetJS would hand it back (array-of-arrays). Two title rows above the header,
// then one row per unit. 102 is vacant (market rent present, actual rent 0). C01 is commercial.
var GRID = [
  ["Whitewater Apartments — Rent Roll", null, null, null, null, null],
  ["As of 09/01/2026", null, null, null, null, null],
  ["Unit", "Unit Type", "Sq Ft", "Market Rent", "Actual Rent", "Status"],
  ["101", "1BR/1BA", 750, 1500, 1500, "Occupied"],
  ["102", "1BR/1BA", 750, 1500, 0, "Vacant"],
  ["201", "2BR/2BA", 1050, 2000, 1900, "Occupied"],
  ["202", "2BR/2BA", 1050, 2000, 2000, "Occupied"],
  ["C01", "Commercial Retail", 1200, 3000, 2800, "Occupied"],
  ["", "Total", null, 10000, 8200, ""]   // a summary/total row must be ignored
];

group("header + column detection", function(){
  var h = RR.findHeader(GRID);
  eq(h.headerRow, 2, "the header row is found past the title rows (row 2)");
  ok(h.map.unit === 0 && h.map.type === 1 && h.map.sqft === 2 && h.map.market === 3 && h.map.actual === 4 && h.map.status === 5, "every column maps to the right index");
});

group("unit records + residential/commercial split", function(){
  var r = RR.parse(GRID);
  eq(r.units.length, 5, "5 unit rows parsed (the Total row is skipped)");
  eq(r.residentialUnits, 4, "4 residential units (commercial excluded)");
  eq(r.commercialUnits, 1, "1 commercial unit");
  ok(r.units.filter(function(u){ return u.commercial; }).length === 1, "the commercial row is flagged commercial");
});

group("GPR = grossed-up market rent (vacant units at market), annualized", function(){
  var r = RR.parse(GRID);
  // (1500 + 1500 + 2000 + 2000) * 12 = 7000 * 12 = 84,000 — the vacant unit is grossed up at its market rent
  eq(r.gprAnnual, 84000, "GPR is the market rent of ALL residential units × 12 (84,000), vacant unit included");
});

group("average rents — market over all, actual excludes vacant zeros", function(){
  var r = RR.parse(GRID);
  eq(r.avgMarketRent, 1750, "average market rent over all 4 residential units = 1,750");
  // occupied residential actuals: 1500, 1900, 2000 → mean 1800 (the vacant 0 is excluded)
  eq(r.avgActualRent, 1800, "average ACTUAL rent excludes the vacant zero: (1500+1900+2000)/3 = 1,800");
  eq(r.occupancy, 0.75, "occupancy is 3 of 4 residential units = 0.75");
});

group("commercial income is kept for the NOI, annualized", function(){
  var r = RR.parse(GRID);
  eq(r.commercialAnnual, 33600, "commercial actual rent × 12 = 33,600 (kept for NOI, out of residential stats)");
});

group("unit statistics, by unit type", function(){
  var r = RR.parse(GRID);
  var one = stat(r, "1BR/1BA"), two = stat(r, "2BR/2BA");
  ok(!!one && !!two, "there is a stats row per residential unit type");
  ok(!r.unitStats.some(function(s){ return /commercial/i.test(s.type); }), "commercial is NOT a residential unit-stats type");
  // 1BR: 2 units, 1 occupied (0.5), avg sqft 750, avg market 1500, avg occupied rent 1500 (only 101 is occupied)
  eq(one.count, 2, "1BR count = 2");
  eq(one.occPct, 0.5, "1BR occupancy = 0.5");
  eq(one.avgSqft, 750, "1BR avg sqft = 750");
  eq(one.avgMarketRent, 1500, "1BR avg market rent = 1,500");
  eq(one.avgOccupiedRent, 1500, "1BR avg occupied rent = 1,500 (the vacant unit is excluded)");
  // 2BR: 2 units, 2 occupied (1.0), avg market 2000, avg occupied (1900+2000)/2 = 1950
  eq(two.occPct, 1, "2BR occupancy = 1.0");
  eq(two.avgOccupiedRent, 1950, "2BR avg occupied rent = (1900+2000)/2 = 1,950");
  eq(two.occupiedSqft, 2100, "2BR occupied square feet = 2 × 1050 = 2,100");
});

group("occupancy inferred from a positive actual rent when there is no status column", function(){
  var g = GRID.map(function(row){ return row.slice(0, 5); });   // drop the Status column
  var r = RR.parse(g);
  eq(r.residentialUnits, 4, "still 4 residential units without a status column");
  eq(r.occupancy, 0.75, "102 is treated as vacant because its actual rent is 0");
  eq(r.avgActualRent, 1800, "the actual-rent average still excludes the zero-rent unit");
});

group("anomalies are listed, not dropped or thresholded", function(){
  var g = [
    ["Unit", "Unit Type", "Market Rent", "Actual Rent"],
    ["1", "1BR", 1500, 1600],          // actual above market — flagged
    ["2", "", 1400, 1400],             // no unit type — flagged
    ["3", "1BR", null, null]           // no rents — flagged
  ];
  var r = RR.parse(g);
  ok(r.warnings.some(function(w){ return /above its market/.test(w); }), "an actual rent above market is listed as a warning");
  ok(r.warnings.some(function(w){ return /no unit type/.test(w); }), "a unit with no type is listed");
  ok(r.warnings.some(function(w){ return /no market or actual rent/.test(w); }), "a unit with no rents is listed");
});

group("junk / empty input never throws", function(){
  ok(RR.parse(null).headerRow === -1, "null grid → empty parse");
  ok(RR.parse([["hello","world"],["a","b"]]).headerRow === -1, "a header-less grid → empty parse");
  ok(RR.parse([]).units.length === 0, "empty grid → no units");
});

console.log("\n" + (fails ? (fails + " FAILED, " + passes + " passed") : ("all " + passes + " rent-roll tests passed")));
process.exit(fails ? 1 : 0);
