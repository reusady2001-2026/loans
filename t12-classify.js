/* ============================================================================
   T12 line classifier — maps a raw operating-statement line (its account name,
   and optionally which section it sits in) to one of the standard underwriting
   category codes used to build a property Setup. Pure, rule-based, no AI.
   Validated: reproduces Azriel's manual tags for 99.3% of operating dollars
   across the 9 SASB properties.

   Category codes (income):   GPR VAC CONC EMPL MOD MTM BD  (rental & reductions)
                              RUBS "TRSH RUB" OTH AMEN PET LATE ADM APP PARK COM CAM ANT
   Category codes (expense):  RET INS UTIL PAY GA MKT RM CS MGMT TRSH CAB PLL

   Signals, in order of authority: (1) the statement's own sub-section header
   (subMatch), (2) keyword rules (rulesMatch), (3) the printed INCOME/EXPENSE
   section as a bare fallback. The section is also a hint inside the keyword
   rules: a line the statement prints under INCOME is income whatever it is
   called ("Water/Sewer" there is a utility reimbursement, not a utility bill),
   and an income-type catch-all on an EXPENSE line is G&A — so classify() and
   SetupBuilder.fromParse() (which folds codes to the printed side) agree.
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

  // A fee/amenity word next to one of these is an expense line ("Amenity Repairs",
  // "Pet Waste Station Supplies", "Parking Garage Management Contract"), not fee income.
  var EXP_WORD = /repair|mainten|supplies|equipment|expense|contract|program|cleaning|service|upgrade|improvement|purchase|waste|station|door|light|sweep|seal|strip/;

  // Ordered rules — first match wins; returns a code or null (no confident match).
  // isExp / isInc: the statement's printed section, when the caller knows it.
  function rulesMatch(s, isExp, isInc) {
    var has = function (re) { return re.test(s); };
    var X = function (c) { return isInc ? "OTH" : c; };   // expense keyword on a line printed under INCOME → other income
    var I = function (c) { return isExp ? "GA" : c; };    // income catch-all on a line printed under EXPENSE → G&A

    // ---- bookkeeping plugs / balance-sheet accounts: no taxonomy home — leave
    //      unconfident on purpose so the review list surfaces them ----
    if (has(/opening\s+balance|\bdifference\b|\bsuspense\b|\bclearing\b|do\s+not\s+use|old\s+code|receivable|payable|depository|\berror\b/)) return null;

    // ---- specific overrides (apply in any section) ----
    if (has(/employee\s+(concession|discount|rent|unit|apt|apartment)|resident\s+manager|manager'?s?\s+(unit|apt|apartment|credit)|staff\s+(unit|apt|apartment)/)) return "EMPL";
    if (has(/parking\s+lot\s+lease/)) return "PLL";
    if (has(/\bmodel\s+(unit|apt|apartment)s?\b|\bmodels?\s*$|\bmodel\s+(loss|vacancy)|(loss|vacancy)\s*[-–:]?\s*models?\b|\badmin(istrative)?\s+units?\b|non[\s-]*rev(enue)?\s+units?/)) return "MOD";
    if (has(/bad\s+debt|write[\s-]*off|uncollect|collection\s+loss|credit\s+loss/)) return "BD";
    if (has(/delinquen/) && !has(/tax|penalt|interest|fee/)) return "BD";
    if (has(/\brubs\b|ratio\s+utility/)) return "RUBS";
    // tenant reimbursements / cost recoveries = income (check before expenses);
    // "recoverable" is an adjective on an expense line and deliberately excluded
    if (has(/reimburs|recover(y|ies|ed)?\b/)) {
      if (has(/phone|toll|mileage|employee|staff/)) return "PAY";   // payroll expense reimbursements
      if (has(/antenna|cell\s+tower|rooftop/)) return "ANT";
      if (has(/\bcam\b|common\s+area/)) return "CAM";
      if (has(/trash|garbage|rubbish|sanitation|waste/)) return "TRSH RUB";
      if (has(/water|sewer|utilit|electric|\bgas\b|\bfuel\b|energy/)) return "RUBS";
      return "OTH";
    }
    // payroll cluster (before RET so "payroll taxes" doesn't read as a tax)
    if (has(/payroll|salar|wages|workers?'?s?\s*comp|health\s+insurance|\bbonus\b|\bovertime\b|outside\s+services|benefit|\bfica\b|\bsuta\b|\bfuta\b|401\s*k|severance|disability|unemployment|holiday\s+(\w+\s+)?rate|holiday\s+pay|vacation\s+pay|temp\s+help|\bhr\b/)) return X("PAY");
    // staff positions — unless the line is a vendor contract ("Concierge Services Contract")
    if (!has(/contract|agreement|program/) && has(/leasing\s+(consultant|agent|staff|manager|director)|property\s+manager|assistant\s+manager|community\s+manager|site\s+manager|maintenance\s+(tech|supervisor|staff|manager)|\bporters?\b|\bconcierge\b|groundskeeper|superintendent|handym[ae]n/)) return "PAY";

    // ---- fines, penalties, financing and other non-operating lines a statement
    //      prints above NOI: the printed total includes them, so they cannot be
    //      dropped — G&A is the catch-all (other income on the income side) ----
    if (has(/late\s+(fee|charge)s?/) && has(/tax|vendor|mortgage|insurance|penalt|utilit/)) return X("GA");
    if (has(/violation|penalt|\bfines?\b/)) return X("GA");
    if (!has(/repair|mainten/) && has(/interest\s+(expense|paid|on)|^interest\s*[-–]|interest-|mortgage|debt\s+service|loan\s+(interest|payment|fee)|amortiz|depreciat|financing\s+fee|prior\s+(year|period)|non[\s-]*recurring|lawsuit|settlement|contribution|donation|partnership|income\s+tax|corporat\w*\s+tax|franchise\s+tax|sales\s+tax|excise|cost\s+seg/)) return X("GA");

    // ---- income items ----
    var fee = !has(EXP_WORD);
    if (has(/rental\s+income\s*[-–:]\s*other|other\s+rental\s+income|cleaning\s+fee|insurance\s+(proceeds|claim|recover|reimb|refund)|forfeit|deposit\s+(forfeit|income|alternative|waiver)|security\s+deposit|sd\s+waiver/)) return I("OTH");
    if (has(/commercial\s+(rent|income|lease|tenant|space)|retail\s+(rent|income|lease|tenant|space)|store\s+rent/)) return "COM";
    if (has(/\bcam\b|common\s+area\s+(maint|charge|reimb|income)/)) return "CAM";
    if (has(/antenna|cell\s+tower|rooftop\s+(lease|license)|tower\s+(lease|rent|income)/)) return "ANT";
    // "Gross Potential Rent" / "Gross Scheduled Rent" are the standard top-line
    // rental-income captions on a T12 — so a FLAT statement with no sub-section
    // header (e.g. an AI-read statement) still tags the top rent line as GPR
    // instead of falling through to the OTH catch-all. Rent-program credits
    // (Section 8 / HAP / SCRIE / DRIE / abatements) are rent, not fees.
    if (has(/market\s+rent|gain\s+to\s+lease|loss.*lease|rent\s+adjustment|residential\s+rent|section\s*8|prepaid\s+rent|gross\s+(potential|scheduled)\s+rent|scheduled\s+gross\s+rent|potential\s+rent|scheduled\s+rent|\bgpr\b|gross\s+rent|apartment\s+rent|unit\s+rent|base\s+rent|rent\s+(income|revenue)|rental\s+(income|revenue)|\bhap\b|housing\s+assistance|subsid|voucher|rent\s+roll|tenant\s+rent|\bhud\b|\bpha\b|dhcr\s+rent|rent\s+reduction|s\.?c\.?r\.?i\.?e\b|d\.?r\.?i\.?e\b|rent\s+abatement|abatement\s*[-–]\s*(charge|credit)|preferential\s+rent|stabilized\s+rent|last\s+month\s+rent/) ||
        has(/gross\s+rental|rental\s+income.*(market|residential|gross)/)) return "GPR";
    if (has(/^rents?$/)) return isExp ? "GA" : "GPR";
    if (has(/vacancy|down\s+units/)) return "VAC";
    if (has(/concession|free\s+rent|rent[\s-]*free/)) return "CONC";
    if (has(/month[\s-]*to[\s-]*month|\bmtm\b|short[\s-]*term\s+(premium|fee|lease|rent)/)) return "MTM";
    if (fee && has(/\bpets?\b/)) return "PET";
    if (fee && has(/amenit|club\s*house|clubroom/)) return "AMEN";
    if (has(/late\s+(fee|charge)|bounced|returned\s+check|\bnsf\b/)) return I("LATE");   // a late fee PAID is a penalty
    if (has(/marketing\s+service\s+agreement|rev(enue)?\s+share/)) return "OTH";   // rev-share income, not a marketing expense
    if (fee && has(/application|app\s+fee/)) return "APP";
    if (fee && has(/administrative\s+fee|admin(istrative|istration)?\s+(fee|income|charge)s?\b|admin\s+fees?\b/)) return "ADM";
    if (fee && has(/parking|garage|carport/)) return "PARK";
    if (isInc && has(/\brents?\b/)) return "GPR";                    // any other "… Rent" printed under INCOME is rent

    // ---- expense items ----
    // professional fees first, so "Real Estate Tax Consultant" is a fee, not the tax
    if (!has(/marketing|advertis/) && has(/consult|account(ing|ant)|audit|bookkeep|legal|attorney|professional\s+fee|tax\s+(prep|return|service)|expedit/)) return isExp ? "GA" : "OTH";
    if (has(/real\s+estate\s+tax|property\s+tax|\btaxes\b|\bre\s+tax|school\s+tax|county\s+tax|city\s+tax|municipal\s+tax|\bpilot\b|tax\s+(bill|payment|escrow)/)) return (isInc || has(/income|refund|rebate/)) ? "OTH" : "RET";
    if (has(/renters?\s+insurance/)) return isExp ? "GA" : "OTH";
    if (has(/insurance|liability|umbrella|casualty|\bd&o\b|fidelity|flood\s+ins|earthquake|hazard\s+ins/)) return X("INS");
    if (has(/management\s+fees?|mgmt\s+fees?|^property\s+management$/)) return X("MGMT");
    if (!has(/repair|clean|drain|heater|treatment|inspect|pump|removal|snack|coffee|bottle/) &&
        has(/electric(?!al)|\bwater\b|\bgas\b|sewer|utilit|\bfuel\b|heating\s+oil|fuel\s+oil|\bsteam\b|propane|energy|flow\s+billing|water\s+billing/)) return isInc ? "RUBS" : "UTIL";
    // auto & travel → G&A (before marketing so "Auto Leasing" isn't leasing)
    if (has(/auto\s+(expense|leas|lease|rental|loan|payment)|vehicle|ez\s*pass|\btolls?\b|mileage|\buber\b|\btaxi\b|airfare|\bflights?\b|lodging|hotel|ground\s+transport|travel/)) return X("GA");
    if (has(/marketing|advertis|resident\s+(event|retention|referral|coffee|function)|promotion|broker'?s?\s+fee|leasing|locator|apartments\.com|zillow|\bils\b|internet\s+listing|signage|banner|brochure|flyer|photograph|virtual\s+tour|social\s+media|\bseo\b|referral\s+fee|commission/)) return X("MKT");
    // trash before the contract/repair words: "Trash Removal Contract" is trash, not a contract
    if (!has(/repair|supplies|bags?\b|cans?\b|liner|\bparts?\b/) &&
        has(/rubbish|sanitation|garbage|valet\s+trash|\btrash\b|dumpster|waste\s+(removal|management|disposal|haul)|\brefuse\b|compactor\s+(service|contract|rental|lease)/)) return isInc ? "TRSH RUB" : "TRSH";
    if (has(/contract|exterminat|pest\s+control|landscap|lawn\s+(care|service|maint)|elevator|snow\s+(removal|plow)|sprinkler|generator\s+inspection|vent\s+cleaning|scent\s+services|pool\s+service|janitorial\s+service|cleaning\s+service|backflow|hood\s+cleaning|window\s+(cleaning|washing)|chimney\s+sweep|grease\s+trap|duct\s+cleaning|uniform\s+(service|rental)|linen\s+service|alarm\s+monitoring|fire\s+(protection|alarm)\s+(service|monitoring|inspection)/)) return X("CS");
    // office / IT / admin overhead before the repair words ("Office Supplies" is G&A, not R&M)
    if (has(/\boffice\b|computer|software|copier|subscription|website|domain|\bit\s+(cost|setup|support|supplies|service|expense|monthly)|equipment\s+rental|rent\s*[-–]\s*(office|equipment)/)) return X("GA");
    if (has(/repair|mainten|turn[\s-]*over|make[\s-]*ready|paint|plumb|hvac|a\/c\b|air\s+condition|furnace|boiler|chiller|heater|supplies|\bparts\b|\btools\b|\block(s|smith)?\b|\bkeys?\b|fire\s+(alarm|escape|extinguisher|pump)|smoke\s+(alarm|detector)|extinguisher|appliance|window|shade|blind|screens?\b|hardware|janitorial|electrical|roof|gutter|carpet|floor|\btiles?\b|\bdoors?\b|fenc|\bgates?\b|\blight(ing|s|\s*bulb)|fixture|drywall|plaster|welding|\bglass\b|\bpump|generator|compactor|intercom|camera|security|patrol|alarm|monitoring|surveillance|access\s+(control|system)|power\s+wash|pressure\s+wash|paving|striping|asphalt|concrete|cement|masonry|caulk|ptac|filter|\bmold\b|lead\s+abate|environmental|\bpool\b|\bgym\b|fitness|playground|\bsigns?\b|cleaning|clean[\s-]*up|towing|furniture|equipment|materials|lumber|resurfac|reglaz|countertop|cabinet|vinyl|mirror|ceiling|stair|railing|\bdeck\b|balcony|patio|sidewalk|irrigation|shrub|mulch|weed|drain|leak|storm|vandal|graffiti|treatment|\bgrounds\b/)) return X("RM");
    if (has(/\bcable\b|satellite|\btv\b|bulk\s+(internet|wifi)/)) return X("CAB");
    if (has(/general\s+and\s+admin|g\s*&\s*a\b|bank\s+(service|charge|fee)|yardi|screening|background|tech\s+cost|shipping|postage|courier|delivery|phones?\b|telephone|internet|\bdsl\b|uniform|auto\s+expense|employee\s+gift|\bfood\b|meals?\b|groceries|snack|entertain|holiday\s+party|ramp\s+plus|bluemoon|clickpay|matterport|dropbox|\badmin\b|printing|copy\s+machine|\bdues\b|membership|licens|permit|registration|filing|inspection|credit\s+card|merchant|payment\s+(fee|processing)|online\s+payment|wire\s+(transfer|fee)|training|seminar|recruit|hiring|answering|messaging|\bgifts?\b|charit|decor|equipment\s+rental|rent\s*[-–]\s*(office|equipment)|hoa\b|association\s+(dues|fee)|condo\s+(fee|assoc)|ground\s+lease|land\s+lease|temp\s+housing|moving|other\s+fees|misc(ellaneous)?\s+expense|refund|discount|purchases?\b|fees\s+and\s+permits/)) return X("GA");

    // ---- other-income catch-alls. A bare "Other Income" / "… Income" line with no
    //      other signal is left unconfident on purpose: on a flat statement it may be
    //      an unrecognized roll-up rather than a detail line, and should be looked at ----
    if (has(/interest\s+income|damage|termination|miscellaneous|\bmisc\b|storage|key\s+(charge|fee)|lockout|furnished|arrears|transfer|charging\s+station|court\s+cost|laundry|vending|locker|\bbike\b|deposit|surcharge|convenience\s+fee|resident\s+satisfaction|smoking|corporate\s+(unit|housing)|buyout|relet|sublet|holdover|proceeds|gain\s+on|forgiveness|rebate|cash\s+back|credit|adjustment|unidentified|unallocated|unapplied|fees?\b|charges?\b/)) return I("OTH");
    return null;
  }

  // The T12's own account sub-section (e.g. "CONTRACT REPAIRS", "UTILITIES",
  // "RENTAL INCOME") is authoritative — it's the signal the underwriter tags by.
  // A line under "Contract Repairs" is CS; the same line under "Repairs &
  // Maintenance" is RM. This removes the CS/RM/UTIL/GA ambiguity entirely.
  // Inside a group, only lines whose taxonomy row is unmistakable are carved
  // out (trash removal, marketing, the rental deductions, tax vs insurance).
  function subMatch(s, S){
    if(!S) return null;
    // expense sub-groups
    if(/PAYROLL|SALAR|WAGES/.test(S)) return "PAY";
    if(/MANAGEMENT\s+FEE/.test(S)) return "MGMT";
    if(/UNIT\s+TURNOVER|TURN\s*COST|APARTMENT\s+TURN|MAKE[\s-]*READY/.test(S)) return "RM";
    if(/CONTRACT\s+(REPAIR|SERVICE)/.test(S)){
      if(/valet|trash|garbage|rubbish|sanitation|dumpster|waste/.test(s)) return "TRSH";
      if(/software/.test(s)) return "GA";
      if(/pool|security|monitoring|fitness|amenity/.test(s)) return "RM";
      return "CS";
    }
    if(/REPAIR|MAINTEN|\bR&M\b|GROUNDS/.test(S)){
      // trash removal has its own row, wherever the bookkeeper filed it
      if(/valet|\btrash\b|garbage|rubbish|sanitation|dumpster|waste\s+(removal|management|disposal)/.test(s)) return "TRSH";
      return "RM";
    }
    if(/LEASING|MARKET|ADVERTIS/.test(S)) return "MKT";
    if(/AUTO\s+EXPENSE|TRAVEL/.test(S)) return "GA";
    if(/SECURITY(?!\s+DEPOSIT)/.test(S)) return "RM";
    if(/VIOLATION|PENALT|\bFINES?\b/.test(S)) return "GA";           // fines & penalties are a G&A cost
    if(/OTHER\s+EXPENSE|MISC\w*\s+EXPENSE|SUNDRY/.test(S)){          // before the MISC income group
      if(/bad\s+debt|write[\s-]*off/.test(s)) return "BD";
      if(/parking\s+lot\s+lease/.test(s)) return "PLL";
      return "GA";                                                    // incl. a late fee PAID — a penalty, not LATE income
    }
    if(/TAX|INSURAN/.test(S)){
      if(/payroll\s+tax|workers?'?s?\s*comp|health\s+ins|disability|unemployment/.test(s)) return "PAY";   // payroll burden, wherever filed
      if(/income\s+tax|corporat\w*\s+tax|franchise|sales\s+tax|excise|consult|service|prep|finance\s+charge|pay\s+by\s+phone|convenience/.test(s)) return "GA";
      return /tax/.test(s) ? "RET" : "INS";
    }
    if(/UTILIT/.test(S)){
      if(/trash|garbage|rubbish|sanitation|valet|dumpster|waste/.test(s)) return "TRSH";
      if(/cable|satellite|telephone|\bphone|internet|\bdsl\b|\btv\b/.test(s)) return "CAB";
      return "UTIL";
    }
    if(/GENERAL|ADMINISTRATIV|OFFICE|PROFESSIONAL/.test(S)){
      if(/bad\s+debt|write[\s-]*off/.test(s)) return "BD";
      if(/security/.test(s)) return "RM";
      if(/management\s+fee/.test(s)) return "MGMT";
      if(/income\s+tax|corporat\w*\s+tax|franchise|sales\s+tax|excise|payroll\s+tax/.test(s)) return "GA";   // not a property tax
      if(/real\s+(estate|property)\s+tax|property\s+tax|\btaxes\b/.test(s)) return "RET";
      if(/\binsurance\b/.test(s) && !/health|renter|auto|vehicle|life/.test(s)) return "INS";
      if(/marketing|advertis/.test(s)) return "MKT";
      return "GA";
    }
    // income sub-groups
    if(/RENTAL\s+INCOME|RENT\s+REVENUE|RENTAL\s+REVENUE|^REVENUE$|GROSS\s+(INCOME|REVENUE)|RESIDENTIAL\s+INCOME|POTENTIAL\s+RENT/.test(S)){
      if(/employee\s+(concession|discount|rent|unit)|resident\s+manager|manager'?s?\s+(unit|apartment|credit)/.test(s)) return "EMPL";
      if(/\bmodel\b|admin\s+unit|non[\s-]*rev/.test(s)) return "MOD";       // before vacancy: "vacancy loss-model"
      if(/concession|free\s+rent/.test(s)) return "CONC";
      if(/vacancy|down\s+units/.test(s)) return "VAC";
      if(/bad\s+debt|write[\s-]*off|delinquen|uncollect/.test(s)) return "BD";
      if(/short\s*[- ]?term|month\s*to\s*month|\bmtm\b/.test(s)) return "MTM";
      if(/\bpets?\b/.test(s)) return "PET";
      if(/parking|garage|carport/.test(s)) return "PARK";
      if(/commercial|retail/.test(s)) return "COM";
      if(/\bcam\b/.test(s)) return "CAM";
      if(/antenna|cell\s+tower|rooftop/.test(s)) return "ANT";
      if(/late\s+(fee|charge)|\bnsf\b|bounced/.test(s)) return "LATE";
      if(/application/.test(s)) return "APP";
      if(/administrative\s+fee|admin\s+fee/.test(s)) return "ADM";
      if(/amenit/.test(s)) return "AMEN";
      if(/trash|garbage|rubbish/.test(s)) return "TRSH RUB";
      if(/reimburs|recover|\brubs\b|utilit|\bwater\b|sewer|electric|\bgas\b/.test(s)) return "RUBS";
      if(/rental\s+income\s*[-–]\s*other|\bother\b|storage|arrears|rev(enue)?\s+share|interest\s+income|laundry|vending|\bmisc/.test(s)) return "OTH";
      // rent-program lines (Section 8 / HUD / SCRIE / abatements / "Old Rent") are rent; a
      // bare fee or charge filed under rental income is not
      if(/\brent\b|abatement|scrie|drie|dhcr|\bhud\b|\bpha\b|section\s*8|subsid|voucher|lease/.test(s)) return "GPR";
      if(/\bfees?\b|\bcharges?\b|deposit/.test(s)) return "OTH";
      return "GPR";
    }
    if(/COST\s+RECOVERY|RECOVERY|REIMBURSEMENT/.test(S)){
      if(/trash|garbage|rubbish|waste/.test(s)) return "TRSH RUB";
      if(/water|sewer|utilit|electric|\bgas\b|\brubs\b/.test(s)) return "RUBS";
      if(/\bcam\b/.test(s)) return "CAM";
      if(/antenna/.test(s)) return "ANT";
      return "OTH";
    }
    if(/COMMERCIAL|RETAIL/.test(S)){
      if(/\bcam\b/.test(s)) return "CAM";
      if(/antenna|cell\s+tower/.test(s)) return "ANT";
      if(/parking|garage/.test(s)) return "PARK";
      if(/rent/.test(s)) return "COM";
      return "OTH";
    }
    if(/OTHER\s+INCOME|MISC|INVESTMENT\s+INCOME|FEE\s+INCOME|ANCILLARY|OTHER\s+REVENUE/.test(S)){
      // rental deductions a bookkeeper filed under other income keep their own rows
      if(/employee\s+(concession|discount)/.test(s)) return "EMPL";
      if(/\bmodel\s+unit|admin\s+unit/.test(s)) return "MOD";
      if(/bad\s+debt|write[\s-]*off/.test(s)) return "BD";
      if(/concession/.test(s)) return "CONC";
      if(/cable|satellite/.test(s)) return "OTH";                     // cable revenue-share is income; CAB is the expense row
      if(/\bpets?\b/.test(s)) return "PET";
      if(/late\s+(fee|charge)|\bnsf\b|bounced|returned\s+check/.test(s)) return "LATE";
      if(/application/.test(s)) return "APP";
      if(/admin/.test(s)) return "ADM";
      if(/amenit/.test(s)) return "AMEN";
      if(/parking|garage|carport/.test(s)) return "PARK";
      if(/month\s*to\s*month|\bmtm\b|short\s*[- ]?term\s+(premium|fee)/.test(s)) return "MTM";
      if(/commercial\s+(rent|income)|retail\s+(rent|income)/.test(s)) return "COM";
      if(/\bcam\b/.test(s)) return "CAM";
      if(/antenna|cell\s+tower/.test(s)) return "ANT";
      // utility-type names under other income are tenant reimbursements ("Water/Sewer", "Trash")
      if(/trash|garbage|rubbish|sanitation|waste/.test(s)) return "TRSH RUB";
      if(/\brubs\b|\bwater\b|sewer|utilit|electric|\bgas\b/.test(s) && !/renter|insurance/.test(s)) return "RUBS";
      return "OTH";
    }
    return null;
  }

  function prep(name, section){
    var s = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
    var SEC = String(section || "").toUpperCase();
    var isExp = SEC.indexOf("EXP") >= 0;
    return { s: s, isExp: isExp, isInc: !isExp && /INC|REV/.test(SEC) };
  }
  // classify(name, section, sub) — account hierarchy first, keyword rules as
  // fallback for flat / GL-numbered statements with no sub-section headers.
  function classify(name, section, sub){
    var p = prep(name, section); if(!p.s) return null;
    var S = String(sub || "").toUpperCase().replace(/\s+/g, " ").trim();
    return subMatch(p.s, S) || rulesMatch(p.s, p.isExp, p.isInc) || (p.isExp ? "GA" : "OTH");
  }
  // {code, confident} — confident whenever the hierarchy or a keyword rule placed
  // the line; only the bare section fallback (no signal at all) is unconfident.
  function classifyConfident(name, section, sub){
    var p = prep(name, section); if(!p.s) return { code:null, confident:false };
    var S = String(sub || "").toUpperCase().replace(/\s+/g, " ").trim();
    var m = subMatch(p.s, S) || rulesMatch(p.s, p.isExp, p.isInc);
    return { code: m || (p.isExp ? "GA" : "OTH"), confident: m !== null };
  }

  return { classify: classify, classifyConfident: classifyConfident, subMatch: subMatch, roleOf: roleOf, INCOME: INCOME, EXPENSE: EXPENSE };
});
