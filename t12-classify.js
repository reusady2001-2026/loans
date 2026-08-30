/* ============================================================================
   T12 line classifier — maps a raw operating-statement line (its account name,
   and optionally which section it sits in) to one of the standard underwriting
   category codes used to build a property Setup. Pure, rule-based, no AI.
   Validated: reproduces Azriel's manual tags for 99.3% of operating dollars
   across the 9 SASB properties.

   Category codes (income):   GPR VAC CONC EMPL MOD MTM BD  (rental & reductions)
                              RUBS "TRSH RUB" OTH AMEN PET LATE ADM APP PARK COM CAM ANT
   Category codes (expense):  RET INS UTIL PAY GA MKT RM CS MGMT TRSH CAB PLL
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.T12Classify = api;
  if (typeof globalThis !== "undefined") globalThis.T12Classify = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var INCOME = { GPR:1, VAC:1, CONC:1, EMPL:1, MOD:1, BD:1, MTM:1, RUBS:1, "TRSH RUB":1, "TRSH COL":1,
                 OTH:1, AMEN:1, PET:1, LATE:1, ADM:1, APP:1, PARK:1, COM:1, CAM:1, ANT:1 };
  var EXPENSE = { RET:1, INS:1, UTIL:1, PAY:1, GA:1, MKT:1, RM:1, CS:1, MGMT:1, TRSH:1, CAB:1, PLL:1 };
  function roleOf(code){ return EXPENSE[code] ? "expense" : "income"; }

  // Ordered rules — first match wins; returns a code or null (no confident match).
  function rulesMatch(s, isExp) {
    var has = function (re) { return re.test(s); };

    // ---- specific overrides (apply in any section) ----
    if (has(/employee\s+(concession|discount)/)) return "EMPL";
    if (has(/parking\s+lot\s+lease/)) return "PLL";
    if (has(/\bmodel\s+units?\b|\badmin\s+units?\b/)) return "MOD";
    if (has(/bad\s+debt|write[\s-]*off/)) return "BD";
    if (has(/\brubs\b/)) return "RUBS";               // Ratio Utility Billing System = tenant reimbursement income
    // tenant reimbursements / expense recoveries = income (check before expenses)
    if (has(/reimburs|recover/)) {
      if (has(/phone|toll/)) return "PAY";         // payroll expense reimbursements (phones/gas/tolls)
      if (has(/trash|garbage|rubbish|sanitation/)) return "TRSH RUB";
      if (has(/water|sewer|utilit|electric|\bgas\b/)) return "RUBS";
      if (has(/renter/)) return "OTH";
      return "OTH";
    }
    // payroll cluster (before RET so "payroll taxes" doesn't read as a tax)
    if (has(/payroll|salar|wages|workers?\s*comp|health\s+insurance|\bbonus\b|\bovertime\b|outside\s+services/)) return "PAY";

    // ---- income items ----
    // "Gross Potential Rent" / "Gross Scheduled Rent" are the standard top-line
    // rental-income captions on a T12 — added so a FLAT statement with no
    // sub-section header (rulesMatch's documented fallback role, e.g. an
    // AI-read statement, which has no sub-section signal at all) still tags
    // the top rent line as GPR instead of falling through to the OTH catch-all.
    if (has(/market\s+rent|gain\s+to\s+lease|loss.*lease|rent\s+adjustment|residential\s+rent|section\s*8|prepaid\s+rent|gross\s+(potential|scheduled)\s+rent|scheduled\s+gross\s+rent/) ||
        has(/gross\s+rental|rental\s+income.*(market|residential|gross)/)) return "GPR";
    if (has(/vacancy|down\s+units/)) return "VAC";
    if (has(/concession/)) return "CONC";
    if (has(/month\s*to\s*month/)) return "MTM";
    if (has(/\bpet\b/)) return "PET";
    if (has(/amenity/)) return "AMEN";
    if (has(/late\s+fee|bounced\s+check|\bnsf\b/)) return "LATE";
    if (has(/marketing\s+service\s+agreement/)) return "OTH";   // rev-share income, not a marketing expense
    if (has(/application/)) return "APP";
    if (has(/administrative\s+fee|admin\s+fees?\b/)) return "ADM";
    if (has(/commercial\s+rent/)) return "COM";
    if (has(/\bcam\b/)) return "CAM";
    if (has(/antenna/)) return "ANT";
    if (has(/parking/)) return "PARK";

    // ---- expense items ----
    if (has(/real\s+estate\s+tax|property\s+tax|\btaxes\b/)) return "RET";
    if (has(/renters?\s+insurance/)) return isExp ? "GA" : "OTH";
    if (has(/insurance/)) return "INS";
    if (has(/management\s+fee/)) return "MGMT";
    if (has(/electric|\bwater\b|\bgas\b|sewer|utilit/)) return "UTIL";
    if (has(/marketing|advertising|resident\s+(event|retention|referral|coffee)|promotion|brokers?\s+fee|leasing/)) return "MKT";
    if (has(/contract|exterminat|landscap|elevator|snow\s+removal|sprinkler|generator\s+inspection|vent\s+cleaning|scent\s+services/)) return "CS";
    if (has(/repair|mainten|turn[\s-]*over|paint|plumbing|hvac|supplies|\bparts\b|\btools\b|locks|\bkeys\b|fire\s+alarm|appliance|window|shades|hardware|janitorial|electrical/)) return "RM";
    if (has(/rubbish|sanitation|garbage|valet\s+trash|\btrash\b/)) return "TRSH";
    if (has(/\bcable\b/)) return "CAB";
    if (has(/legal/)) return isExp ? "GA" : "OTH";
    if (has(/general\s+and\s+admin|bank\s+(service|charge)|yardi|tenant\s+screening|travel|tech\s+cost|shipping|phones|internet|\boffice\b|software|uniform|auto\s+expense|employee\s+gift|\bfood\b|entertain|holiday\s+party|ramp\s+plus|bluemoon|\badmin\b/)) return "GA";

    // ---- other-income catch-alls ----
    if (has(/interest\s+income|cleaning\s+fee|damage|termination\s+fee|miscellaneous|\bmisc\b|rev\s+share|storage|key\s+charge|lockout|furnished|seller\s+arrears|transfer\s+apartment|charging\s+station|court\s+cost/)) return "OTH";
    return null;
  }

  // The T12's own account sub-section (e.g. "CONTRACT REPAIRS", "UTILITIES",
  // "RENTAL INCOME") is authoritative — it's the signal the underwriter tags by.
  // A line under "Contract Repairs" is CS; the same line under "Repairs &
  // Maintenance" is RM. This removes the CS/RM/UTIL/GA ambiguity entirely.
  function subMatch(s, S){
    if(!S) return null;
    // expense sub-groups
    if(/PAYROLL|SALAR/.test(S)) return "PAY";
    if(/MANAGEMENT\s+FEE/.test(S)) return "MGMT";
    if(/UNIT\s+TURNOVER|TURN\s*COST|APARTMENT\s+TURN/.test(S)) return "RM";
    if(/CONTRACT\s+(REPAIR|SERVICE)/.test(S)){
      if(/valet|trash|garbage|rubbish/.test(s)) return "TRSH";
      if(/software/.test(s)) return "GA";
      if(/pool|security|monitoring|fitness|amenity/.test(s)) return "RM";
      return "CS";
    }
    if(/REPAIR|MAINTEN|\bR&M\b|GROUNDS/.test(S)) return "RM";
    if(/LEASING|MARKET|ADVERTIS/.test(S)) return "MKT";
    if(/AUTO\s+EXPENSE/.test(S)) return "GA";
    if(/SECURITY/.test(S)) return "RM";
    if(/TAX|INSURAN/.test(S)) return /tax/.test(s) ? "RET" : "INS";
    if(/UTILIT/.test(S)){
      if(/trash|garbage|rubbish|sanitation|valet/.test(s)) return "TRSH";
      if(/cable|telephone/.test(s)) return "CAB";
      return "UTIL";
    }
    if(/GENERAL|ADMINISTRATIV|OFFICE|PROFESSIONAL/.test(S)){
      if(/bad\s+debt|write[\s-]*off/.test(s)) return "BD";
      if(/security/.test(s)) return "RM";
      if(/management\s+fee/.test(s)) return "MGMT";
      if(/real\s+(estate|property)\s+tax|\btaxes\b/.test(s)) return "RET";
      if(/\binsurance\b/.test(s) && !/health|renter/.test(s)) return "INS";
      return "GA";
    }
    // income sub-groups
    if(/RENTAL\s+INCOME|RENT\s+REVENUE|^REVENUE$|GROSS\s+(INCOME|REVENUE)/.test(S)){
      if(/employee\s+(concession|discount)/.test(s)) return "EMPL";
      if(/\bmodel\b|admin\s+unit/.test(s)) return "MOD";       // before vacancy: "vacancy loss-model"
      if(/concession/.test(s)) return "CONC";
      if(/vacancy|down\s+units/.test(s)) return "VAC";
      if(/bad\s+debt|write[\s-]*off/.test(s)) return "BD";
      if(/short\s*[- ]?term|month\s*to\s*month/.test(s)) return "MTM";
      if(/\bpet\b/.test(s)) return "PET";
      if(/parking/.test(s)) return "PARK";
      if(/utility\s+reimburs|reimburs/.test(s)) return "RUBS";
      if(/rental\s+income\s*[-–]\s*other|\bother\b|storage|arrears/.test(s)) return "OTH";
      return "GPR";
    }
    if(/COST\s+RECOVERY|RECOVERY/.test(S)){
      if(/trash|garbage/.test(s)) return "TRSH RUB";
      if(/water|sewer|utilit|electric|\bgas\b/.test(s)) return "RUBS";
      return "OTH";
    }
    if(/COMMERCIAL/.test(S)){
      if(/\bcam\b/.test(s)) return "CAM";
      if(/antenna/.test(s)) return "ANT";
      if(/parking/.test(s)) return "PARK";
      if(/rent/.test(s)) return "COM";
      return "OTH";
    }
    if(/OTHER\s+INCOME|MISC|INVESTMENT\s+INCOME|FEE\s+INCOME/.test(S)){
      if(/cable|satellite/.test(s)) return "CAB";
      if(/\bpet\b/.test(s)) return "PET";
      if(/late\s+fee|\bnsf\b|bounced/.test(s)) return "LATE";
      if(/application/.test(s)) return "APP";
      if(/admin/.test(s)) return "ADM";
      if(/amenity/.test(s)) return "AMEN";
      if(/parking/.test(s)) return "PARK";
      if(/reimburs|recover/.test(s)){ if(/trash|garbage/.test(s)) return "TRSH RUB"; if(/water|sewer|utilit|electric|gas/.test(s)) return "RUBS"; }
      return "OTH";
    }
    if(/OTHER\s+EXPENSE/.test(S)){
      if(/bad\s+debt|write[\s-]*off/.test(s)) return "BD";
      if(/parking\s+lot\s+lease/.test(s)) return "PLL";
      if(/late/.test(s)) return "LATE";
      return "GA";
    }
    return null;
  }

  function prep(name, section){
    var s = String(name || "").toLowerCase().trim();
    var isExp = String(section || "").toUpperCase().indexOf("EXP") >= 0;
    return { s: s, isExp: isExp };
  }
  // classify(name, section, sub) — account hierarchy first, keyword rules as
  // fallback for flat / GL-numbered statements with no sub-section headers.
  function classify(name, section, sub){
    var p = prep(name, section); if(!p.s) return null;
    var S = String(sub || "").toUpperCase().replace(/\s+/g, " ").trim();
    return subMatch(p.s, S) || rulesMatch(p.s, p.isExp) || (p.isExp ? "GA" : "OTH");
  }
  // {code, confident} — confident whenever the hierarchy or a keyword rule placed
  // the line; only the bare section fallback (no signal at all) is unconfident.
  function classifyConfident(name, section, sub){
    var p = prep(name, section); if(!p.s) return { code:null, confident:false };
    var S = String(sub || "").toUpperCase().replace(/\s+/g, " ").trim();
    var m = subMatch(p.s, S) || rulesMatch(p.s, p.isExp);
    return { code: m || (p.isExp ? "GA" : "OTH"), confident: m !== null };
  }

  return { classify: classify, classifyConfident: classifyConfident, subMatch: subMatch, roleOf: roleOf, INCOME: INCOME, EXPENSE: EXPENSE };
});
