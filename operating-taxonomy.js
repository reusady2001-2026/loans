/* ============================================================================
   Operating taxonomy — the fixed row set of the per-property operating model
   (OPERATING-CONTRACT.md §3): one canonical line order, identical for every
   property, so two sheets read line-for-line against each other and the
   roll-up can sum by code. Pure lookup tables over the codes the classifier
   already emits (t12-classify.js) and the captions the underwriting Setup
   already shows (setup-builder.js) — nothing here invents a code or a name.
   No state, no storage.
   ========================================================================== */
(function (root, factory) {
  var api = factory(
    (typeof require === "function") ? require("./setup-builder.js") : (root.SetupBuilder),
    (typeof require === "function") ? require("./t12-classify.js") : (root.T12Classify)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OperatingTaxonomy = api;
  if (typeof globalThis !== "undefined") globalThis.OperatingTaxonomy = api;
})(typeof self !== "undefined" ? self : this, function (SB, T12) {
  "use strict";
  // Fail loudly at load when the script order is wrong: a quiet fallback would
  // render every row as its bare code and hide the integration mistake.
  if (!SB || !SB.LABEL || !T12 || typeof T12.roleOf !== "function")
    throw new Error("operating-taxonomy.js: load setup-builder.js and t12-classify.js first");

  // Own-property lookups only — codes arrive as free strings, and a plain object
  // would answer "constructor" / "toString" from its prototype.
  var has = function (o, k){ return Object.prototype.hasOwnProperty.call(o, k); };

  // §3 order, verbatim. The rental block keeps buildSetup's sequence (vacancy is
  // priced off the running subtotal in that order); the expense sequence is the
  // spec's sheet layout (fixed costs first), NOT SetupBuilder.EXPENSE's — the
  // same set, deliberately in a different order.
  var RENTAL   = ["GPR","EMPL","MOD","VAC","CONC","BD"];
  var OTHER    = ["RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH"];
  var EXPENSE  = ["RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL"];
  var SECTIONS = ["rental","other","expense"];
  var ORDER    = RENTAL.concat(OTHER, EXPENSE);
  var SECTION  = {};
  RENTAL.forEach(function (c){ SECTION[c] = "rental"; });
  OTHER.forEach(function (c){ SECTION[c] = "other"; });
  EXPENSE.forEach(function (c){ SECTION[c] = "expense"; });

  // Taxes and insurance are set by the assessor and the carrier, not by
  // management, so a jump there cannot be managed away — which is exactly why
  // ActionScan's expense-shock rule watches only NON-controllable lines.
  // Everything else, income included, defaults to controllable; the user may
  // flip any line's flag (persisted per line by the store).
  var NON_CONTROLLABLE = { RET:1, INS:1 };
  var CONTROLLABLE_DEFAULT = {};
  ORDER.forEach(function (c){ CONTROLLABLE_DEFAULT[c] = !has(NON_CONTROLLABLE, c); });

  // Rental deductions are carried NEGATIVE in Line.annual (statement sign, §2),
  // so the sheet sums the rental block straight through to ERI.
  var DEDUCTION = { EMPL:1, MOD:1, VAC:1, CONC:1, BD:1 };

  // Unknown code → the classifier's role decides the side of NOI. roleOf can only
  // say "expense" for a code in ITS expense map, so a code this taxonomy has not
  // caught up with still lands on the right side of NOI, and role() keeps
  // agreeing with T12Classify.roleOf even for codes ORDER does not carry.
  function section(code){
    if (has(SECTION, code)) return SECTION[code];
    return T12.roleOf(code) === "income" ? "other" : "expense";
  }
  function role(code){ return section(code) === "expense" ? "expense" : "income"; }
  function label(code){
    if (has(SB.LABEL, code)) return SB.LABEL[code];
    return code == null ? "" : String(code);
  }
  // Only RET and INS are non-controllable and both sit in ORDER, so an unknown
  // code can only be controllable.
  function defaultControllable(code){ return has(CONTROLLABLE_DEFAULT, code) ? CONTROLLABLE_DEFAULT[code] : true; }
  function isDeduction(code){ return has(DEDUCTION, code); }
  // The rows of one block, in ORDER. A fresh array each call — callers may
  // sort or splice their copy without touching the shared order.
  function codes(sec){ return ORDER.filter(function (c){ return SECTION[c] === sec; }); }

  // The shared constants are frozen: the order must stay identical for every
  // property, so no caller can turn it into state.
  Object.freeze(ORDER); Object.freeze(SECTIONS); Object.freeze(CONTROLLABLE_DEFAULT);

  return { ORDER: ORDER, SECTIONS: SECTIONS, CONTROLLABLE_DEFAULT: CONTROLLABLE_DEFAULT,
           section: section, role: role, label: label, defaultControllable: defaultControllable,
           isDeduction: isDeduction, codes: codes };
});
