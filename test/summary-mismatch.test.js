const T12 = require('../t12-parse.js');
const OU = require('../operating-upload.js');
const MONTHS = ["Jul 2025","Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"];
function row(label, amt){ const m = new Array(12).fill(0); m[0] = amt; return [label, ...m, amt]; }
const grid = [
  [null, ...MONTHS, "Total"],
  row("TOTAL INCOME", 1100),               // SUMMARY block (twins appear below)
  row("TOTAL EXPENSES", 300),
  row("NET OPERATING INCOME", 800),
  row("Rental Income", 1000),              // DETAIL foots to 1000 / 300 / 700
  row("TOTAL INCOME", 1000),
  row("Repairs & Maintenance", 300),
  row("TOTAL EXPENSES", 300),
  row("NET OPERATING INCOME", 700),
];
const d = T12.parseGrid(grid, { basis: "total" });
let fails = 0; const ok = (c,m)=>{ console.log((c?'  ok   ':'  FAIL ')+m); if(!c) fails++; };
ok(d.summaryMismatch === true, "parseGrid flags summaryMismatch on a summary/detail disagreement (got " + d.summaryMismatch + ")");
ok(d.totals && Math.abs(d.totals.noi - 700) < 0.005, "totals.noi is the DETAIL footing 700, not the summary 800 (got " + (d.totals&&d.totals.noi) + ")");
ok(d.summaryTotals && Math.abs(d.summaryTotals.noi - 800) < 0.005, "summaryTotals.noi carries the disagreeing summary 800 (got " + (d.summaryTotals&&d.summaryTotals.noi) + ")");
// Fake store just enough for OperatingUpload.apply
function fakeStore(){ const recs={}; return {
  ensure:(k,o)=>{ recs[k]=recs[k]||{propKey:k,propertyName:(o&&o.propertyName)||k,lines:{},assumptions:null,meta:{}}; return recs[k]; },
  get:(k)=>recs[k]||null,
  setLines:(k,obj)=>{ recs[k]=recs[k]||{propKey:k,lines:{}}; Object.keys(obj).forEach(c=>{ recs[k].lines[c]={annual:obj[c].annual,source:obj[c].source||'t12',controllable:obj[c].controllable}; }); },
  setUnits:()=>{}, setPeriod:()=>{}, };
}
const store = fakeStore(); store.ensure("addr:x", { propertyName:"X" });
const res = OU.apply(store, "addr:x", d, { fileName:"mismatch.xlsx", period:"12-mo Total", propertyName:"X" });
ok(res.printedNOI != null && Math.abs(res.builtNOI - res.printedNOI) < 0.005,
   "OLD toast would LIE: builtNOI " + res.builtNOI + " ties res.printedNOI " + res.printedNOI + " (< 0.005) — so without the summaryMismatch branch the operator sees 'NOI ties'");
// A clean statement (no summary block) must NOT flag
const clean = [ [null, ...MONTHS, "Total"], row("Rental Income", 1000), row("TOTAL INCOME", 1000), row("Repairs & Maintenance", 300), row("TOTAL EXPENSES", 300), row("NET OPERATING INCOME", 700) ];
const dc = T12.parseGrid(clean, { basis:"total" });
ok(dc.summaryMismatch === false, "a clean statement (no summary block) does NOT flag summaryMismatch (got " + dc.summaryMismatch + ")");
ok(Math.abs(dc.totals.noi - 700) < 0.005, "clean totals.noi 700");
console.log(fails ? fails+" FAILED" : "all harness checks passed");
process.exit(fails?1:0);
