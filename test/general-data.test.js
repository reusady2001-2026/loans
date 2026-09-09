/* Tests for general-data.js: the per-property rolling 24-month operating history.
   Plain node, no framework. Run:  node test/general-data.test.js              */
"use strict";
var G = require("../general-data.js");

var passes = 0, fails = 0;
function ok(cond, msg, detail){
  if (cond) { passes++; console.log("  ok   " + msg); }
  else { fails++; console.log("  FAIL " + msg + (detail ? "\n         " + detail : "")); }
}
function near(a, b, msg){ ok(typeof a === "number" && Math.abs(a - b) < 0.005, msg, a + " vs " + b); }
function group(name, fn){ console.log("\n" + name); try { fn(); } catch (e) { ok(false, name + " — unexpected exception", (e && e.stack) || String(e)); } }

// A stub classifier: the row name IS the code; role/label come from a fixed map.
var META = { RET: { role: "expense", label: "Real Estate Taxes" }, INS: { role: "expense", label: "Insurance" },
             GPR: { role: "income", label: "Gross Potential Rent" } };
function classify(name){ return META[name] ? { code: name, role: META[name].role, label: META[name].label } : null; }

// Build a parsed-like object: `spec` = { CODE: valuePerMonth }, `count` months from startYm.
function parsedFor(startYm, count, spec){
  var rows = Object.keys(spec).map(function (code){
    var monthly = {}; for (var i = 0; i < count; i++) monthly[G.ymShift(startYm, i)] = spec[code];
    return { name: code, section: META[code].role === "expense" ? "EXPENSE" : "INCOME", monthly: monthly };
  });
  return { rows: rows };
}
function series(startYm, count, spec){ return G.monthlySeries(parsedFor(startYm, count, spec), classify); }

group("monthlySeries — classify + per-month sum", function (){
  var s = series("2026-01", 12, { RET: 100, GPR: 1000 });
  ok(s.months.length === 12 && s.months[0] === "2026-01" && s.months[11] === "2026-12", "12 calendar months, sorted");
  ok(s.byCode.RET && s.byCode.RET.role === "expense" && s.byCode.RET.label === "Real Estate Taxes", "RET carries role + label");
  ok(Object.keys(s.byCode.RET.monthly).length === 12 && s.byCode.RET.monthly["2026-06"] === 100, "RET has all 12 months");
  // two raw rows on the same code sum together
  var parsed = { rows: [ { name: "RET", section: "EXPENSE", monthly: { "2026-01": 60 } },
                         { name: "RET", section: "EXPENSE", monthly: { "2026-01": 40 } } ] };
  var s2 = G.monthlySeries(parsed, classify);
  ok(s2.byCode.RET.monthly["2026-01"] === 100, "two rows under one code are summed per month");
  // an unclassified line is dropped
  var s3 = G.monthlySeries({ rows: [ { name: "MYSTERY", section: "EXPENSE", monthly: { "2026-01": 5 } } ] }, classify);
  ok(Object.keys(s3.byCode).length === 0, "an unclassified line contributes nothing");
});

group("merge — first upload of a 12-month T12", function (){
  var gd = G.merge(null, series("2026-01", 12, { RET: 100, INS: 30, GPR: 1000 }),
    { now: "2026-07-01T00:00:00Z", propKey: "name:whitewater", identity: { propertyName: "Villages of Whitewater", units: 240 },
      noi: { inPlace: 9840, underwritten: 10200, period: "12-mo Total", sourceFile: "WW.xlsx" } });
  ok(gd.schema === "lds.general-data.v1", "schema stamped");
  ok(gd.propKey === "name:whitewater" && gd.identity.units === 240, "identity carried");
  near(gd.noi.inPlace, 9840, "in-place NOI stored"); near(gd.noi.underwritten, 10200, "underwritten NOI stored");
  ok(gd.noi.computedAt === "2026-07-01T00:00:00Z", "noi stamped with the compute time");
  ok(gd.window.months.length === 12 && gd.window.cap === 24, "window = 12 months, cap 24");
  near(gd.lines.RET.ttm, 1200, "RET TTM = 12 × 100"); ok(gd.lines.RET.ttmMonths === 12, "RET has a full 12-month TTM");
  ok(gd.lines.RET.priorTtm === null && gd.lines.RET.priorMonths === 0, "no prior year yet");
});

group("merge — re-upload 3 months later keeps 15 months; taxes moved", function (){
  var gd1 = G.merge(null, series("2026-01", 12, { RET: 100, INS: 30, GPR: 1000 }),
    { now: "2026-07-01T00:00:00Z", propKey: "p", noi: { inPlace: 9840, underwritten: 10200 } });
  // three months later: trailing 12 = Apr 2026 .. Mar 2027, with taxes now 110/mo
  var gd2 = G.merge(gd1, series("2026-04", 12, { RET: 110, INS: 30, GPR: 1000 }),
    { now: "2026-10-01T00:00:00Z", propKey: "p", noi: { inPlace: 9900, underwritten: 10250 } });
  ok(gd2.window.months.length === 15, "15 months retained (12 + the 3 before it)");
  ok(gd2.window.months[0] === "2026-01" && gd2.window.months[14] === "2027-03", "window spans Jan 2026 → Mar 2027");
  ok(gd2.lines.RET.monthly["2026-04"] === 110, "an overlapping month takes the NEWER statement's figure");
  ok(gd2.lines.RET.monthly["2026-03"] === 100, "a month only the first upload had is preserved");
  near(gd2.lines.RET.ttm, 1320, "RET TTM now the latest 12 (12 × 110)"); ok(gd2.lines.RET.ttmMonths === 12, "full TTM");
  ok(gd2.lines.RET.priorMonths === 3, "only 3 prior-year months so far");
  near(gd2.noi.inPlace, 9900, "NOI refreshed to the newer upload");

  var d = G.deltas(gd2), ret = d.find(function (x){ return x.code === "RET"; });
  ok(ret.changePct === null, "TTM-vs-priorTTM % suppressed until a full prior 12 exists");
  near(ret.yoyMonthPct, 0.10, "single-month YoY shows taxes up 10% (Mar 2027 110 vs Mar 2026 100)");
});

group("merge — rolling window caps at the latest 24 months", function (){
  var gd = null, start = "2025-01";
  // three consecutive 12-month uploads, each starting 12 months after the last → 36 distinct months
  for (var k = 0; k < 3; k++){
    gd = G.merge(gd, series(G.ymShift(start, k * 12), 12, { RET: 100 + k }), { now: "T" + k, propKey: "p", noi: { inPlace: 1, underwritten: 2 } });
  }
  ok(gd.window.months.length === 24, "capped at 24 months even after 36 were supplied");
  ok(gd.window.months[0] === "2026-01" && gd.window.months[23] === "2027-12", "kept the most recent 24 (2026-01 → 2027-12)");
  ok(gd.lines.RET.monthly["2025-06"] === undefined, "a month older than the window was dropped");
  ok(gd.lines.RET.priorMonths === 12 && gd.lines.RET.ttmMonths === 12, "now a clean 12-vs-12 comparison");
  var ret = G.deltas(gd).find(function (x){ return x.code === "RET"; });
  // latest 12 = third upload (RET 102), prior 12 = second upload (RET 101)
  near(ret.changePct, (102 - 101) / 101, "TTM-vs-priorTTM % available once 24 months exist");
});

group("deltas — income line and empty record", function (){
  var gd = G.merge(null, series("2026-01", 12, { GPR: 1000 }), { now: "T", propKey: "p", noi: { inPlace: 1, underwritten: 2 } });
  var g = G.deltas(gd).find(function (x){ return x.code === "GPR"; });
  ok(g.role === "income" && Math.abs(g.ttm - 12000) < 0.005, "income line rolls up too");
  ok(G.deltas({}).length === 0, "deltas of an empty record is empty, no throw");
});

group("leaseUpNOI — last 3 months × 4 when rent starts after month 2", function (){
  function ym(n){ return "2026-" + (n < 10 ? "0" : "") + n; }
  function build(gprArr, retArr){   // arrays indexed 0..11 for Jan..Dec 2026
    var gpr = {}, ret = {};
    for (var i = 0; i < 12; i++){ if (gprArr[i] != null) gpr[ym(i+1)] = gprArr[i]; if (retArr[i] != null) ret[ym(i+1)] = retArr[i]; }
    return G.monthlySeries({ rows: [ { name:"GPR", section:"INCOME", monthly: gpr }, { name:"RET", section:"EXPENSE", monthly: ret } ] }, classify);
  }
  var ret = [100,100,100,100,100,100,100,100,100,100,100,100];

  // lease-up: no rent in Jan or Feb, ramps from Mar; last 3 months (Oct/Nov/Dec) run GPR 1000 each
  var lu = G.leaseUpNOI(build([0,0,200,400,600,800,1000,1000,1000,1000,1000,1000], ret));
  ok(lu.applied === true, "lease-up detected: no gross rent in month 1 or 2");
  near(lu.noi, 10800, "NOI = last 3 months × 4 → (1000−100)×3 = 2700, ×4 = 10,800");
  ok(lu.monthsUsed && lu.monthsUsed.join(",") === "2026-10,2026-11,2026-12", "the last 3 calendar months were used");

  ok(G.leaseUpNOI(build([500,0,200,400,600,800,1000,1000,1000,1000,1000,1000], ret)).applied === false, "NOT applied when month 1 has gross rent");
  ok(G.leaseUpNOI(build([0,500,200,400,600,800,1000,1000,1000,1000,1000,1000], ret)).applied === false, "NOT applied when only month 2 has gross rent");
  ok(G.leaseUpNOI(build([500,500,500,500,500,500,500,500,500,500,500,0], ret)).applied === false, "a later EMPTY month does not trigger it when rent began in month 1 (still the 12-month sum)");

  var few = G.monthlySeries({ rows: [ { name:"GPR", section:"INCOME", monthly:{ "2026-01":0, "2026-02":0 } }, { name:"RET", section:"EXPENSE", monthly:{ "2026-01":100, "2026-02":100 } } ] }, classify);
  ok(G.leaseUpNOI(few).applied === false, "NOT applied with fewer than 3 months of data");

  // no gross-rent line at all → never a false positive (can't judge a lease-up without gross rent)
  var noGpr = G.monthlySeries({ rows: [ { name:"RET", section:"EXPENSE", monthly:{ "2026-01":100,"2026-02":100,"2026-03":100,"2026-04":100 } } ] }, classify);
  ok(G.leaseUpNOI(noGpr).applied === false, "NOT applied when there is no gross-rent line to judge");
});

console.log("\n" + (fails ? "FAIL — " + fails + " failing, " + passes + " passing" : "all " + passes + " general-data checks passed"));
process.exit(fails ? 1 : 0);
