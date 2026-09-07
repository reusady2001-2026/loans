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
    RUBS:"Utility Reimbursements (RUBS)", "TRSH RUB":"Trash Reimbursements", "TRSH COL":"Trash Collection Income",
    PARK:"Parking Income", PET:"Pet Fees", MTM:"Month-to-Month Fees", LATE:"Late Fees",
    APP:"Application Fees", ADM:"Administrative Income", AMEN:"Amenity Fees",
    COM:"Commercial Rent", CAM:"CAM Income", ANT:"Antenna Income", OTH:"Other Income",
    RET:"Real Estate Taxes", INS:"Insurance", UTIL:"Utilities", PAY:"Payroll",
    GA:"General & Admin", BDX:"Bad Debt Expense", MKT:"Marketing", RM:"Repairs & Maintenance", CS:"Contract Services",
    TRSH:"Trash Removal", CAB:"Cable", PLL:"Parking Lot Lease", MGMT:"Management Fee"
  };
  var RENTAL  = ["GPR","EMPL","MOD","VAC","CONC","BD"];
  var OTHER   = ["RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH"];
  var EXPENSE = ["RET","INS","UTIL","PAY","GA","BDX","MKT","RM","CS","TRSH","CAB","PLL","MGMT"];
  var BUDGET  = { INS:1, PAY:1, GA:1, MKT:1, RM:1, CS:1 };   // priced $/unit in the underwritten column
  // "(1,234.56)" is an accounting negative — stripping the parens used to flip its sign.
  var num = function (v){
    if(typeof v==="string"){ var neg=/^\s*\(.*\)\s*$/.test(v); v=parseFloat(v.replace(/[^0-9.\-]/g,"")); if(neg && v>0) v=-v; }
    return (typeof v==="number"&&isFinite(v))?v:0;
  };
  var r2 = function (x){ return Math.round(x*100)/100; };

  // Lines the caller pastes/loads: [{name, amount, section?, sub?}]. Classify +
  // sum by category. The account sub-section is passed through so the classifier
  // can use the statement's own hierarchy.
  function classifySum(t12Lines){
    var sums = {}, review = [];
    (t12Lines || []).forEach(function (ln){
      var r = T12.classifyConfident(ln.name, ln.section, ln.sub);
      if(!r.code) return;
      var amt = num(ln.amount);
      sums[r.code] = (sums[r.code] || 0) + amt;
      if(!r.confident) review.push({ name: ln.name, amount: amt, code: r.code });
    });
    return { sums: sums, review: review };
  }

  // Build category sums straight from a parsed statement (t12-parse.parseGrid
  // output: {rows, categories, totals}). The statement's PRINTED footing is the
  // authority: in-place income, expense and NOI are read from totals.{income,
  // expense,noi}. Detail lines are classified for the build-up split, then each
  // section is reconciled to its printed total to the cent — so the in-place
  // NOI always equals the statement's own NET OPERATING INCOME exactly. (A T12's
  // per-line annual column can be internally inconsistent; its printed subtotals
  // never are.) Returns { sums, inPlaceNOI, totals, review, reconcile } — `review`
  // lists the low-confidence lines (bare section fallback), `reconcile` reports the
  // residual each section needed (null = that section had no printed total) so a
  // gap between the detail lines and the footing is visible, never silently absorbed.
  function fromParse(parsed){
    parsed = parsed || {};
    var rows = Array.isArray(parsed.rows) ? parsed.rows : [], totals = parsed.totals || {};
    var incSum = {}, expSum = {}, incRaw = 0, expRaw = 0, review = [];
    var fin = function (v){ return (typeof v==="number" && isFinite(v)) ? v : null; };
    rows.forEach(function (r){
      if(!r) return;
      var isExp = String(r.section || "").toUpperCase().indexOf("EXP") >= 0;
      var cc = T12.classifyConfident(r.name, r.section, r.sub), code = cc.code;
      if(code == null) return;
      var amt = num(r.amount), expCode = (T12.roleOf(code) === "expense");
      // a $0 line (balance-sheet stub, zero plug) can never move a figure — not review noise
      if(!cc.confident && amt !== 0) review.push({ name: r.name, amount: amt, code: code });
      if(isExp){
        // a line in the printed EXPENSE section is an expense dollar, whatever it is
        // called: income-role codes fold into G&A — except bad debt, which is the
        // expense-side code BDX (its own pass-through line, never absorbed by a G&A
        // $/unit budget). The classifier already emits BDX there; BD is routed for safety.
        var ce = expCode ? code : (code === "BD" ? "BDX" : "GA");
        expSum[ce] = (expSum[ce] || 0) + amt; expRaw += amt;
      } else {
        var ci = expCode ? "OTH" : code;
        incSum[ci] = (incSum[ci] || 0) + amt; incRaw += amt;
      }
    });
    // Statement amounts are cents; summing hundreds of them leaves float dust that
    // would break an exact tie, so keep every sum in cents.
    Object.keys(incSum).forEach(function(k){ incSum[k] = r2(incSum[k]); });
    Object.keys(expSum).forEach(function(k){ expSum[k] = r2(expSum[k]); });
    incRaw = r2(incRaw); expRaw = r2(expRaw);
    // Reconcile each section to the statement's printed total (residual → the
    // catch-all bucket) so the sums foot exactly to the printed figures.
    var pInc = fin(totals.income), pExp = fin(totals.expense), pNoi = fin(totals.noi);
    var di = (pInc != null) ? r2(pInc - incRaw) : null, de = (pExp != null) ? r2(pExp - expRaw) : null;
    if(di) incSum.OTH = r2((incSum.OTH || 0) + di);
    if(de) expSum.GA  = r2((expSum.GA  || 0) + de);
    var sums = {}, incBuilt = 0, expBuilt = 0;
    Object.keys(incSum).forEach(function(k){ sums[k] = incSum[k]; incBuilt += incSum[k]; });
    Object.keys(expSum).forEach(function(k){ sums[k] = r2((sums[k] || 0) + expSum[k]); expBuilt += expSum[k]; });
    var noi = (pNoi != null) ? pNoi : (pInc != null && pExp != null) ? r2(pInc - pExp) : null;
    var built = r2(incBuilt - expBuilt);
    var reconcile = { incomeRaw: incRaw, expenseRaw: expRaw, incomeResidual: di, expenseResidual: de,
                      noiBuilt: built, noiPrinted: noi, noiDiff: (noi != null) ? r2(built - noi) : null,
                      ties: (noi != null && Math.abs(built - noi) < 0.005) };
    return { sums: sums, inPlaceNOI: noi, totals: totals, review: review, reconcile: reconcile, expenseBadDebt: (expSum.BDX || 0) };
  }

  // input: { t12Lines | categorySums, units, rrGPR, benchmarks:{ vacancyPct, mgmtPct,
  //          reservePerUnit, budget:{code:$/unit}, sizing:{capRate,ltvMax,dscrMin,dyMin,intRate,amortYears} } }
  function buildSetup(input){
    input = input || {};
    var bm = input.benchmarks || {}, budget = bm.budget || {}, units = num(input.units);
    var cs, inPlaceAuth = null, fp = null;
    if(input.parsed){ fp = fromParse(input.parsed); cs = { sums: fp.sums, review: fp.review }; inPlaceAuth = fp.inPlaceNOI; }
    else if(input.categorySums){ cs = { sums: input.categorySums, review: [] }; }
    else { cs = classifySum(input.t12Lines); }
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
      // BDX (expense-side bad debt) is not in BUDGET: it always passes through, so a G&A
      // $/unit budget never absorbs it — on the parsed AND the store (categorySums) path.
      if(BUDGET[c] && budget[c] != null) L(c, "expense", "perUnit", { param: budget[c] });
      else L(c, "expense", "value", { uw: sums[c] });
    });
    L("reserves", "reserve", "perUnit", { param: (bm.reservePerUnit != null ? bm.reservePerUnit : 200), t12: 0 });
    lines[lines.length-1].label = "Replacement Reserves";

    var ws = { units: units, lines: lines };
    var result = UW.computeNOI(ws);
    // The statement's printed NET OPERATING INCOME is authoritative for in-place;
    // carry it through (the built sums foot to it, so this is a guard, not a fudge).
    if(fp){
      // The in-place column is a sum of cents (fromParse keeps every sum in cents), so
      // only float dust can separate it from the printed footing whenever the two tie:
      // rounding to cents makes the tie exact and can never mask a real gap — a printed
      // NOI its own sections don't foot to stays different, and visible in `reconcile`.
      var ip = result.inPlace;
      ip.eri = r2(ip.eri); ip.otherIncome = r2(ip.otherIncome); ip.egi = r2(ip.egi); ip.opex = r2(ip.opex); ip.noi = r2(ip.noi);
    }
    if(inPlaceAuth != null) result.inPlace.noiReported = inPlaceAuth;
    var sizing = UW.sizeLoan(result.underwritten.noi, bm.sizing || {});
    return { categorySums: sums, review: cs.review, worksheet: ws, result: result, sizing: sizing,
             inPlaceNOIReported: inPlaceAuth, reconcile: fp ? fp.reconcile : null, expenseBadDebt: num(sums.BDX) };
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

  return { buildSetup: buildSetup, classifySum: classifySum, fromParse: fromParse, sizingSummary: sizingSummary,
           LABEL: LABEL, RENTAL: RENTAL, OTHER: OTHER, EXPENSE: EXPENSE };
});
