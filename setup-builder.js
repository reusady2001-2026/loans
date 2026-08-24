/* ============================================================================
   Setup builder — turns a property's raw T12 lines into its underwriting Setup,
   exactly the way Azriel's spreadsheet does, but automatically:
     raw T12 lines  →  classify each  →  sum by category  →  Setup worksheet
                    →  in-place & underwritten NOI (via underwriting.js)  →  sizing.
   Rent-roll top line (units, annualized GPR) and the benchmarks are supplied by
   the caller. Depends on t12-classify.js and underwriting.js.
   ========================================================================== */
(function (root, factory) {
  var api = factory(
    (typeof require === "function") ? require("./underwriting.js") : (root.Underwriting),
    (typeof require === "function") ? require("./t12-classify.js") : (root.T12Classify)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.SetupBuilder = api;
})(typeof self !== "undefined" ? self : this, function (UW, T12) {
  "use strict";

  var LABEL = {
    GPR:"Gross Potential Rent", EMPL:"Less: Employee Discounts", MOD:"Less: Model Units",
    VAC:"Less: Vacancy Loss", CONC:"Less: Concessions", BD:"Less: Bad Debt",
    RUBS:"Utility Reimbursements (RUBS)", "TRSH RUB":"Trash Reimbursements", "TRSH COL":"Trash Reimbursements",
    PARK:"Parking Income", PET:"Pet Fees", MTM:"Month-to-Month Fees", LATE:"Late Fees",
    APP:"Application Fees", ADM:"Administrative Income", AMEN:"Amenity Fees",
    COM:"Commercial Rent", CAM:"CAM Income", ANT:"Antenna Income", OTH:"Other Income",
    RET:"Real Estate Taxes", INS:"Insurance", UTIL:"Utilities", PAY:"Payroll",
    GA:"General & Admin", MKT:"Marketing", RM:"Repairs & Maintenance", CS:"Contract Services",
    TRSH:"Trash Removal", CAB:"Cable", PLL:"Parking Lot Lease", MGMT:"Management Fee"
  };
  var RENTAL  = ["GPR","EMPL","MOD","VAC","CONC","BD"];
  var OTHER   = ["RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH"];
  var EXPENSE = ["RET","INS","UTIL","PAY","GA","MKT","RM","CS","TRSH","CAB","PLL","MGMT"];
  var BUDGET  = { INS:1, PAY:1, GA:1, MKT:1, RM:1, CS:1 };   // priced $/unit in the underwritten column
  var num = function (v){ if(typeof v==="string") v=parseFloat(v.replace(/[^0-9.\-]/g,"")); return (typeof v==="number"&&isFinite(v))?v:0; };

  // Lines the caller pastes/loads: [{name, amount, section?}]. Classify + sum by
  // category, collecting any low-confidence lines for operator review.
  function classifySum(t12Lines){
    var sums = {}, review = [];
    (t12Lines || []).forEach(function (ln){
      var r = T12.classifyConfident(ln.name, ln.section);
      if(!r.code) return;
      var amt = num(ln.amount);
      sums[r.code] = (sums[r.code] || 0) + amt;
      if(!r.confident) review.push({ name: ln.name, amount: amt, code: r.code });
    });
    return { sums: sums, review: review };
  }

  // input: { t12Lines | categorySums, units, rrGPR, benchmarks:{ vacancyPct, mgmtPct,
  //          reservePerUnit, budget:{code:$/unit}, sizing:{capRate,ltvMax,dscrMin,dyMin,intRate,amortYears} } }
  function buildSetup(input){
    input = input || {};
    var bm = input.benchmarks || {}, budget = bm.budget || {}, units = num(input.units);
    var cs = input.categorySums ? { sums: input.categorySums, review: [] } : classifySum(input.t12Lines);
    var sums = cs.sums;
    var has = function (c){ return sums[c] != null; };
    var lines = [];
    var L = function (key, section, method, opts){
      opts = opts || {};
      lines.push({ key:key, label: LABEL[key] || key, section:section, method:method,
        param: (opts.param != null ? opts.param : null),
        t12: (opts.t12 != null ? opts.t12 : (sums[key] || 0)),
        uw:  (opts.uw  != null ? opts.uw  : null) });
    };

    // Rental (order matters — vacancy/concessions price off the running subtotal)
    L("GPR", "rental", "value", { t12: sums.GPR || 0, uw: (input.rrGPR != null ? num(input.rrGPR) : (sums.GPR || 0)) });
    if(has("EMPL")) L("EMPL", "rental", "value", { uw: sums.EMPL });
    if(has("MOD"))  L("MOD",  "rental", "value", { uw: sums.MOD });
    L("VAC", "rental", "pctBase", { param: (bm.vacancyPct != null ? bm.vacancyPct : 0.05), t12: sums.VAC || 0 });
    if(has("CONC")) L("CONC", "rental", "value", { uw: sums.CONC });
    if(has("BD"))   L("BD",   "rental", "value", { uw: sums.BD });

    // Other income — one line per category present, pass-through
    OTHER.forEach(function (c){ if(has(c)) L(c, "other", "value", { uw: sums[c] }); });

    // Expenses — budget $/unit where a benchmark is given, else pass-through;
    // management fee is % of EGI; reserves are $/unit.
    EXPENSE.forEach(function (c){
      if(c === "MGMT"){ L("MGMT", "expense", "pctEGI", { param: (bm.mgmtPct != null ? bm.mgmtPct : 0.025), t12: sums.MGMT || 0 }); return; }
      if(!has(c)) return;
      if(BUDGET[c] && budget[c] != null) L(c, "expense", "perUnit", { param: budget[c] });
      else L(c, "expense", "value", { uw: sums[c] });
    });
    L("reserves", "reserve", "perUnit", { param: (bm.reservePerUnit != null ? bm.reservePerUnit : 200), t12: 0 });
    lines[lines.length-1].label = "Replacement Reserves";

    var ws = { units: units, lines: lines };
    var result = UW.computeNOI(ws);
    var sizing = UW.sizeLoan(result.underwritten.noi, bm.sizing || {});
    return { categorySums: sums, review: cs.review, worksheet: ws, result: result, sizing: sizing };
  }

  // Roll several built setups into a Debt-Sizing summary (per property + totals).
  function sizingSummary(setups){
    var rows = (setups || []).map(function (s){
      return { name: s.name, units: s.units,
        egi: s.result.underwritten.egi, opex: s.result.underwritten.opex,
        uwNoi: s.result.underwritten.noi, t12Noi: s.result.inPlace.noi,
        value: s.sizing.value, maxLoan: s.sizing.maxLoan, binding: s.sizing.binding,
        impliedLTV: s.sizing.impliedLTV, impliedDSCR: s.sizing.impliedDSCR, impliedDebtYield: s.sizing.impliedDebtYield };
    });
    var tot = rows.reduce(function (a, r){ a.uwNoi+=r.uwNoi; a.t12Noi+=r.t12Noi; a.value+=r.value; a.maxLoan+=r.maxLoan; a.units+=(r.units||0); return a; },
      { uwNoi:0, t12Noi:0, value:0, maxLoan:0, units:0 });
    return { rows: rows, total: tot };
  }

  return { buildSetup: buildSetup, classifySum: classifySum, sizingSummary: sizingSummary,
           LABEL: LABEL, RENTAL: RENTAL, OTHER: OTHER, EXPENSE: EXPENSE };
});
