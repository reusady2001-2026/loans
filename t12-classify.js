/* ============================================================================
   T12 line classifier — maps a raw operating-statement line (its account name,
   and optionally which section it sits in) to one of the standard underwriting
   category codes used to build a property Setup. Pure, rule-based, no AI.

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

  // Which section each code belongs to — drives EGI / OpEx / NOI roll-ups.
  var INCOME = { GPR:1, VAC:1, CONC:1, EMPL:1, MOD:1, BD:1, MTM:1, RUBS:1, "TRSH RUB":1, "TRSH COL":1,
                 OTH:1, AMEN:1, PET:1, LATE:1, ADM:1, APP:1, PARK:1, COM:1, CAM:1, ANT:1 };
  var EXPENSE = { RET:1, INS:1, UTIL:1, PAY:1, GA:1, MKT:1, RM:1, CS:1, MGMT:1, TRSH:1, CAB:1, PLL:1 };
  function roleOf(code){ return EXPENSE[code] ? "expense" : (INCOME[code] ? "income" : "income"); }

  // Ordered rules — first match wins. Specific overrides come before generic
  // keywords; section-ambiguous words (legal, taxes, insurance) are guarded.
  function classify(name, section) {
    var s = String(name || "").toLowerCase().trim();
    if (!s) return null;
    var isExp = String(section || "").toUpperCase().indexOf("EXP") >= 0;
    var has = function (re) { return re.test(s); };

    // ---- specific overrides (apply in any section) ----
    if (has(/employee\s+(concession|discount)/)) return "EMPL";
    if (has(/parking\s+lot\s+lease/)) return "PLL";
    if (has(/\bmodel\s+units?\b|\badmin\s+units?\b/)) return "MOD";
    if (has(/bad\s+debt|write[\s-]*off/)) return "BD";
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
    if (has(/market\s+rent|gain\s+to\s+lease|loss.*lease|rent\s+adjustment|residential\s+rent|section\s*8|prepaid\s+rent/) ||
        has(/gross\s+rental|rental\s+income.*(market|residential|gross)/)) return "GPR";
    if (has(/vacancy|down\s+units/)) return "VAC";
    if (has(/concession/)) return "CONC";
    if (has(/bad\s+debt/)) return "BD";
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

    // ---- other income catch-alls ----
    if (has(/interest\s+income|cleaning\s+fee|damage|termination\s+fee|miscellaneous|\bmisc\b|rev\s+share|storage|key\s+charge|lockout|furnished|seller\s+arrears|transfer\s+apartment|charging\s+station|court\s+cost/)) return "OTH";

    // ---- fallback by section ----
    return isExp ? "GA" : "OTH";
  }

  return { classify: classify, roleOf: roleOf, INCOME: INCOME, EXPENSE: EXPENSE };
});
