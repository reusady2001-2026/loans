/* Taxonomy tests (OPERATING-CONTRACT §3 / P5) — plain node, no framework:
     node test/operating-taxonomy.test.js
   Prints "  ok   …" / "  FAIL …", exits 1 on any failure. The module is pure, so
   no fixture and no localStorage are needed (the store round-trip injects an
   in-memory storage). The §3 arrays are re-typed here independently of the
   module so a drift in either is caught, and the module is checked against the
   live SetupBuilder / T12Classify it must agree with. */
"use strict";
var path = require("path"), fs = require("fs"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var OT  = require(path.join(ROOT, "operating-taxonomy.js"));
var SB  = require(path.join(ROOT, "setup-builder.js"));
var T12 = require(path.join(ROOT, "t12-classify.js"));

var passes = 0, fails = 0;
function show(v){ return typeof v === "symbol" ? String(v) : JSON.stringify(v); }
function ok(cond, msg){ if (cond) { passes++; console.log("  ok   " + msg); } else { fails++; console.log("  FAIL " + msg); } }
function eq(got, want, msg){ ok(got === want, msg + (got === want ? "" : "  -- got " + show(got) + ", want " + show(want))); }
function sameList(a, b){ return JSON.stringify(a) === JSON.stringify(b); }
function diff(a, b){ return a.filter(function (x){ return b.indexOf(x) < 0; }); }   // in a, not in b
function listed(arr){ return arr.length ? "  -- " + JSON.stringify(arr) : ""; }
function heading(t){ console.log("\n" + t); }
// A code introduced here ahead of the siblings (T12Classify, SetupBuilder) may be
// listed in TRANSITION to be tolerated as unknown to them until they catch up.
// BDX has landed everywhere, so the list is empty and every check below is strict.
var TRANSITION = [];
function tolerated(arr, msg){
  var bad = arr.filter(function (c){ return TRANSITION.indexOf(c) < 0; });
  ok(bad.length === 0, msg + (arr.length && !bad.length ? "  (tolerated during the BDX transition: " + JSON.stringify(arr) + ")" : "") + listed(bad));
}

// The module source, evaluated in a bare vm context with `require` absent and the
// deps on the root — the Electron renderer's path (nodeIntegration is off). It also
// lets a test hand the module a stub dependency without touching the shared one.
var SRC = fs.readFileSync(path.join(ROOT, "operating-taxonomy.js"), "utf8");
function loadBrowserLike(deps){
  var ctx = { console: console }; Object.keys(deps).forEach(function (k){ ctx[k] = deps[k]; });
  ctx.self = ctx; ctx.window = ctx;
  vm.runInNewContext(SRC, ctx, { filename: "operating-taxonomy.js" });
  return ctx;
}

// §3, typed independently of the module.
var C_RENTAL  = ["GPR","EMPL","MOD","VAC","CONC","BD"];
var C_OTHER   = ["RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH"];
var C_EXPENSE = ["RET","INS","UTIL","RM","CS","PAY","MGMT","GA","BDX","MKT","TRSH","CAB","PLL"];
var C_ORDER   = C_RENTAL.concat(C_OTHER, C_EXPENSE);

heading("ORDER -- the §3 array, verbatim");
ok(Array.isArray(OT.ORDER), "ORDER is an array");
eq(OT.ORDER.length, 33, "ORDER has 33 codes (6 rental + 14 other + 13 expense)");
ok(sameList(OT.ORDER, C_ORDER), "ORDER equals the §3 array exactly, in sequence" + (sameList(OT.ORDER, C_ORDER) ? "" : "  -- got " + JSON.stringify(OT.ORDER)));
eq(new Set(OT.ORDER).size, OT.ORDER.length, "ORDER has no duplicate code");
ok(sameList(OT.ORDER.slice(0, 6), SB.RENTAL), "rental block is SetupBuilder.RENTAL in the same sequence (buildSetup prices VAC off the running subtotal in that order)");
ok(sameList(OT.ORDER.slice(6, 20), SB.OTHER), "other-income block is SetupBuilder.OTHER in the same sequence");
var block = OT.ORDER.slice(20);
ok(diff(SB.EXPENSE, block).length === 0, "every SetupBuilder.EXPENSE code is in the expense block" + listed(diff(SB.EXPENSE, block)));
tolerated(diff(block, SB.EXPENSE), "every expense-block code is in SetupBuilder.EXPENSE (the sequence is §3's sheet layout, not the builder's)");
eq(OT.ORDER.indexOf("BDX"), OT.ORDER.indexOf("GA") + 1, "BDX sits immediately after GA");
ok(SB.EXPENSE.indexOf("BDX") >= 0, "SetupBuilder.EXPENSE carries BDX (the builder splits expense-side bad debt out of GA)");
var appAll = SB.RENTAL.concat(SB.OTHER, SB.EXPENSE);
var missing = diff(appAll, OT.ORDER), extra = diff(OT.ORDER, appAll);
ok(missing.length === 0, "every code in SetupBuilder.RENTAL/OTHER/EXPENSE is in ORDER" + listed(missing));
tolerated(extra, "every ORDER code is in SetupBuilder.RENTAL/OTHER/EXPENSE");
var t12All = Object.keys(T12.INCOME).concat(Object.keys(T12.EXPENSE));
var miss2 = diff(t12All, OT.ORDER), extra2 = diff(OT.ORDER, t12All);
ok(miss2.length === 0, "every code the classifier can emit (T12Classify.INCOME + EXPENSE, " + t12All.length + " codes) has a row in ORDER" + listed(miss2));
tolerated(extra2, "every ORDER code is one the classifier knows");

heading("section(code)");
var badR = C_RENTAL.filter(function (c){ return OT.section(c) !== "rental"; });
var badO = C_OTHER.filter(function (c){ return OT.section(c) !== "other"; });
var badE = C_EXPENSE.filter(function (c){ return OT.section(c) !== "expense"; });
ok(badR.length === 0, "GPR, EMPL, MOD, VAC, CONC, BD -> rental" + listed(badR));
ok(badO.length === 0, "RUBS .. OTH (14 codes) -> other" + listed(badO));
ok(badE.length === 0, "RET .. PLL (13 codes, BDX included) -> expense" + listed(badE));
var incomeOnly = null, ioErr = null;
try { incomeOnly = loadBrowserLike({ SetupBuilder: SB, T12Classify: { roleOf: function (){ return "income"; } } }).window.OperatingTaxonomy; } catch (e) { ioErr = e; }
eq(incomeOnly && incomeOnly.section("BDX"), "expense", "BDX is in the taxonomy's own table: still an expense on an instance whose classifier calls everything income" + (ioErr ? "  -- threw: " + ioErr.message : ""));
var changes = 0;
for (var i = 1; i < OT.ORDER.length; i++) if (OT.section(OT.ORDER[i]) !== OT.section(OT.ORDER[i - 1])) changes++;
eq(changes, 2, "sections are contiguous along ORDER (rental -> other -> expense), so the sheet can drop ERI / EGI subtotals at the two boundaries");
ok(sameList(OT.SECTIONS, ["rental","other","expense"]), "SECTIONS lists the three blocks in sheet order");

heading("role(code) -- must agree with T12Classify.roleOf");
var badRole = t12All.filter(function (c){ return OT.role(c) !== T12.roleOf(c); });
ok(badRole.length === 0, "role(code) === T12Classify.roleOf(code) for all " + t12All.length + " classifier codes" + listed(badRole));
var badCoh = OT.ORDER.filter(function (c){ return (OT.section(c) === "expense") !== (OT.role(c) === "expense"); });
ok(badCoh.length === 0, "role is \"expense\" exactly when section is \"expense\"" + listed(badCoh));
eq(OT.role("GPR"), "income", "role(GPR) = income");
eq(OT.role("VAC"), "income", "role(VAC) = income (a deduction is income-side, not an expense)");
eq(OT.role("TRSH RUB"), "income", "role(TRSH RUB) = income (reimbursement) ...");
eq(OT.role("TRSH"), "expense", "... while role(TRSH) = expense (removal)");
eq(OT.role("RET"), "expense", "role(RET) = expense");
eq(OT.role("MGMT"), "expense", "role(MGMT) = expense");
eq(OT.role("BDX"), "expense", "role(BDX) = expense (bad debt carried on the expense side) ...");
eq(OT.role("BD"), "income", "... while role(BD) = income (the rental deduction \"Less: Bad Debt\" is unchanged)");
ok(Object.prototype.hasOwnProperty.call(T12.EXPENSE, "BDX") && T12.roleOf("BDX") === "expense", "T12Classify.EXPENSE carries BDX as an expense, so the agreement above includes it");

heading("label(code) -- reuses SetupBuilder.LABEL");
var hasL = function (c){ return Object.prototype.hasOwnProperty.call(SB.LABEL, c); };
var badLbl = OT.ORDER.filter(function (c){ return hasL(c) && OT.label(c) !== SB.LABEL[c]; });
ok(badLbl.length === 0, "label() returns SetupBuilder.LABEL verbatim for every code the builder captions" + listed(badLbl));
tolerated(OT.ORDER.filter(function (c){ return !hasL(c); }), "every ORDER code has a SetupBuilder.LABEL caption");
var bare = OT.ORDER.filter(function (c){ return OT.label(c) === c || !OT.label(c); });
ok(bare.length === 0, "no ORDER row falls back to its bare code or an empty caption" + listed(bare));
eq(OT.label("GPR"), "Gross Potential Rent", "label(GPR)");
eq(OT.label("VAC"), "Less: Vacancy Loss", "label(VAC)");
eq(OT.label("EMPL"), "Less: Employee Discounts", "label(EMPL)");
eq(OT.label("RET"), "Real Estate Taxes", "label(RET)");
eq(OT.label("INS"), "Insurance", "label(INS)");
eq(OT.label("TRSH RUB"), "Trash Reimbursements", "label(TRSH RUB)");
eq(OT.label("TRSH COL"), "Trash Collection Income", "label(TRSH COL) has its own caption (the old duplicate of TRSH RUB was a defect)");
eq(OT.label("BDX"), "Bad Debt Expense", "label(BDX), from SetupBuilder.LABEL");
eq(SB.LABEL.BDX, "Bad Debt Expense", "SetupBuilder.LABEL captions BDX itself (no taxonomy-side caption is needed or kept)");
eq(OT.label("BD"), "Less: Bad Debt", "label(BD) is the income-side deduction, distinct from BDX");
var byCap = {}; OT.ORDER.forEach(function (c){ var l = OT.label(c); (byCap[l] = byCap[l] || []).push(c); });
var dups = Object.keys(byCap).filter(function (l){ return byCap[l].length > 1; }).map(function (l){ return l + " <- " + byCap[l].join(", "); });
ok(dups.length === 0, "no two ORDER codes share a caption" + listed(dups));
eq(OT.label("TRSH"), "Trash Removal", "label(TRSH) is the expense caption, distinct from the reimbursement");
eq(OT.label("PLL"), "Parking Lot Lease", "label(PLL)");
eq(OT.label("MGMT"), "Management Fee", "label(MGMT)");
eq(OT.label("ZZZ"), "ZZZ", "unknown code -> the code itself");
eq(OT.label("constructor"), "constructor", "a prototype key is not a caption (own-property lookup, no leaked function)");
eq(OT.label(null), "", "label(null) -> \"\" without throwing");
eq(OT.label(undefined), "", "label(undefined) -> \"\" without throwing");

heading("defaultControllable(code) / CONTROLLABLE_DEFAULT");
eq(OT.defaultControllable("RET"), false, "RET (taxes) -> false");
eq(OT.defaultControllable("INS"), false, "INS (insurance) -> false");
["UTIL","RM","CS","PAY","MGMT","GA","BDX","MKT","TRSH","CAB","PLL"].forEach(function (c){ eq(OT.defaultControllable(c), true, c + " -> true"); });
eq(OT.defaultControllable("GPR"), true, "GPR (income) -> true");
eq(OT.defaultControllable("OTH"), true, "OTH (income) -> true");
var badInc = C_RENTAL.concat(C_OTHER).filter(function (c){ return OT.defaultControllable(c) !== true; });
ok(badInc.length === 0, "every income code (rental + other) -> true" + listed(badInc));
var falses = Object.keys(OT.CONTROLLABLE_DEFAULT).filter(function (c){ return OT.CONTROLLABLE_DEFAULT[c] === false; });
ok(sameList(falses.slice().sort(), ["INS","RET"]), "CONTROLLABLE_DEFAULT has exactly two false entries: RET and INS" + listed(falses));
ok(sameList(Object.keys(OT.CONTROLLABLE_DEFAULT).sort(), C_ORDER.slice().sort()), "CONTROLLABLE_DEFAULT covers exactly the ORDER codes");
var nonBool = Object.keys(OT.CONTROLLABLE_DEFAULT).filter(function (c){ return typeof OT.CONTROLLABLE_DEFAULT[c] !== "boolean"; });
ok(nonBool.length === 0, "every CONTROLLABLE_DEFAULT value is a real boolean (not 0/1/undefined)" + listed(nonBool));
var badMap = OT.ORDER.filter(function (c){ return OT.defaultControllable(c) !== OT.CONTROLLABLE_DEFAULT[c]; });
ok(badMap.length === 0, "defaultControllable(code) === CONTROLLABLE_DEFAULT[code] for every code" + listed(badMap));
eq(OT.defaultControllable("ZZZ"), true, "unknown code -> true (only RET and INS are non-controllable)");

heading("isDeduction(code) -- rental lines stored negative");
["EMPL","MOD","VAC","CONC","BD"].forEach(function (c){ eq(OT.isDeduction(c), true, c + " is a deduction"); });
eq(OT.isDeduction("GPR"), false, "GPR is not a deduction");
eq(OT.isDeduction("BDX"), false, "BDX is not a deduction (an expense line, stored positive)");
var ded = OT.ORDER.filter(function (c){ return OT.isDeduction(c); });
eq(ded.length, 5, "exactly 5 deductions in ORDER");
ok(ded.every(function (c){ return OT.section(c) === "rental"; }), "every deduction sits in the rental block");
eq(OT.isDeduction("ZZZ"), false, "unknown code -> false");

heading("codes(section)");
ok(sameList(OT.codes("rental"), C_RENTAL), "codes(rental) is the rental block in order");
ok(sameList(OT.codes("other"), C_OTHER), "codes(other) is the other-income block in order");
ok(sameList(OT.codes("expense"), C_EXPENSE), "codes(expense) is the expense block in order");
ok(sameList(OT.codes("rental").concat(OT.codes("other"), OT.codes("expense")), OT.ORDER), "the three blocks concatenate to ORDER");
ok(sameList(OT.codes("bogus"), []), "unknown section -> []");
var mine = OT.codes("expense"); mine.push("X");
ok(sameList(OT.codes("expense"), C_EXPENSE), "codes() hands out a fresh array (a caller's mutation does not leak)");

heading("unknown codes -- §3 fallback through T12Classify.roleOf");
eq(OT.section("ZZZ"), "other", "unknown code the classifier calls income -> other");
eq(OT.role("ZZZ"), T12.roleOf("ZZZ"), "... and role agrees with roleOf");
// A code only the classifier knows as an expense must still land on the expense
// side. Probe it on a separately loaded instance bound to a STUB classifier, so
// the shared T12Classify maps are never mutated (frozen or not).
var stubT12 = { INCOME: T12.INCOME, EXPENSE: T12.EXPENSE, roleOf: function (c){ return c === "ZZX" ? "expense" : T12.roleOf(c); } };
var stubbed = null, stubErr = null;
try { stubbed = loadBrowserLike({ SetupBuilder: SB, T12Classify: stubT12 }).window.OperatingTaxonomy; } catch (e) { stubErr = e; }
ok(!!stubbed, "an instance bound to a stub classifier loads" + (stubErr ? "  -- threw: " + stubErr.message : ""));
eq(stubbed && stubbed.section("ZZX"), "expense", "unknown code the classifier calls expense -> expense");
eq(stubbed && stubbed.role("ZZX"), "expense", "... with role expense, agreeing with that classifier's roleOf");
eq(stubbed && stubbed.defaultControllable("ZZX"), true, "... and controllable by default");
eq(stubbed && stubbed.section("ZZZ"), "other", "... while a code that classifier calls income still -> other");
eq(OT.section("ZZX"), "other", "the real instance, bound to the real classifier, keeps ZZX as other (nothing shared, nothing cached)");
var weird = [null, undefined, "", 42, {}, [], Symbol("s"), "constructor", "__proto__", "hasOwnProperty", "toString"];
var threw = [];
weird.forEach(function (v){
  try { OT.section(v); OT.role(v); OT.label(v); OT.defaultControllable(v); OT.isDeduction(v); OT.codes(v); }
  catch (e) { threw.push(show(v) + ": " + e.message); }
});
ok(threw.length === 0, "no function throws on " + weird.length + " odd inputs (null, undefined, \"\", 42, {}, [], Symbol, prototype keys)" + listed(threw));
var badProto = ["constructor","__proto__","hasOwnProperty","toString"].filter(function (k){ return OT.role(k) !== T12.roleOf(k) || OT.isDeduction(k) !== false || OT.defaultControllable(k) !== true || OT.label(k) !== k; });
ok(badProto.length === 0, "prototype-key codes: role still agrees with roleOf, never a deduction, controllable, caption is the code" + listed(badProto));

heading("purity -- shared constants cannot become state");
try { OT.ORDER.push("X"); } catch (e) {}
ok(sameList(OT.ORDER, C_ORDER), "ORDER is frozen: push() has no effect");
try { OT.CONTROLLABLE_DEFAULT.RET = true; } catch (e) {}
eq(OT.CONTROLLABLE_DEFAULT.RET, false, "CONTROLLABLE_DEFAULT is frozen: RET stays false after an attempted write");
try { OT.CONTROLLABLE_DEFAULT.ZZZ = false; } catch (e) {}
eq(OT.defaultControllable("ZZZ"), true, "... and cannot grow new entries");
ok(Object.isFrozen(OT.ORDER) && Object.isFrozen(OT.SECTIONS) && Object.isFrozen(OT.CONTROLLABLE_DEFAULT), "ORDER, SECTIONS and CONTROLLABLE_DEFAULT are frozen");
try { OT.label = function (){ return "swapped"; }; } catch (e) {}
eq(OT.label("RET"), "Real Estate Taxes", "the API object is frozen: label() cannot be re-pointed");
try { OT.extra = 1; } catch (e) {}
ok(!("extra" in OT), "... and cannot grow new members");
ok(Object.isFrozen(OT), "the API object itself is frozen");

heading("isolation -- never the loans store, no extra dependencies");
ok(!/localStorage|ldsHub/.test(SRC), "module source never mentions localStorage or an ldsHub store key");
ok(/require\("\.\/setup-builder\.js"\)/.test(SRC) && /require\("\.\/t12-classify\.js"\)/.test(SRC), "node deps are setup-builder.js and t12-classify.js");
ok(!/require\("\.\/(underwriting|t12-parse|operating-(store|calc|upload|sheet|assumptions)|portfolio-rollup|action-scan)/.test(SRC), "no other module is required");

heading("UMD -- browser branch (no require; deps read off the root)");
var ctx = null, loadErr = null;
try { ctx = loadBrowserLike({ SetupBuilder: SB, T12Classify: T12 }); } catch (e) { loadErr = e; }
var bt = ctx && ctx.window.OperatingTaxonomy;
ok(bt && sameList(bt.ORDER, C_ORDER), "window.OperatingTaxonomy is built from root.SetupBuilder / root.T12Classify with the same ORDER" + (loadErr ? "  -- threw: " + loadErr.message : ""));
eq(bt && bt.label("RET"), "Real Estate Taxes", "browser-loaded label() reads SetupBuilder.LABEL");
eq(bt && bt.role("RET"), "expense", "browser-loaded role() reads T12Classify");
ok(bt && ctx.OperatingTaxonomy === bt, "globalThis alias is the same object");
var again = null, againErr = null;
try { if (ctx) { vm.runInNewContext(SRC, ctx, { filename: "operating-taxonomy.js" }); again = ctx.window.OperatingTaxonomy; } } catch (e) { againErr = e; }
ok(!!(again && again !== bt && Object.isFrozen(again) && sameList(again.ORDER, C_ORDER)), "a second load replaces window.OperatingTaxonomy with a fresh, equal, frozen instance (no throw)" + (againErr ? "  -- threw: " + againErr.message : ""));
var err = null; try { loadBrowserLike({ T12Classify: T12 }); } catch (e) { err = e; }
ok(err && /setup-builder\.js/.test(err.message), "loading before setup-builder.js fails loudly, naming the missing script" + (err ? "" : "  -- no error thrown"));
err = null; try { loadBrowserLike({ SetupBuilder: SB }); } catch (e) { err = e; }
ok(err && /t12-classify\.js/.test(err.message), "loading before t12-classify.js fails loudly, naming the missing script" + (err ? "" : "  -- no error thrown"));

heading("store round-trip -- defaults and flips persist via OperatingStore (P5: \"flips persist via store\")");
var STORE_PATH = path.join(ROOT, "operating-store.js");
if (!fs.existsSync(STORE_PATH)) console.log("  skipped: operating-store.js missing");
else (function (){
  var OS = require(STORE_PATH);
  // Map-backed storage, seeded with a loans blob the store must never touch.
  var LOANS_KEY = "ldsHub.loans.v7";
  var LOANS_BLOB = JSON.stringify([{ _id: "L1", propertyName: "Crest", propertyAddress: "1 Crest Way", principal: 1000000 }]);
  var m = new Map(); m.set(LOANS_KEY, LOANS_BLOB);
  var storage = { getItem: function (k){ return m.has(k) ? m.get(k) : null; }, setItem: function (k, v){ m.set(k, String(v)); } };
  var t = 0, now = function (){ return "2026-09-07T12:00:" + String(t++).padStart(2, "0") + ".000Z"; };
  OS.init({ storage: storage, now: now }); OS.load();
  var PK = "addr:1 crest way", seed = {};
  // No `controllable` in the seed: the store must fall back to ITS OWN default for each code.
  OT.ORDER.forEach(function (c, i){ seed[c] = { annual: (OT.isDeduction(c) ? -1 : 1) * (1000 + i), source: "manual" }; });
  var rec = OS.setLines(PK, seed, { period: "T12 ending 2025-06-30" }), lines = (rec && rec.lines) || {};
  var notWritten = OT.ORDER.filter(function (c){ return !lines[c]; });
  ok(notWritten.length === 0, "setLines wrote all 33 ORDER codes" + listed(notWritten));
  var drift = OT.ORDER.filter(function (c){ return !lines[c] || lines[c].controllable !== OT.defaultControllable(c); });
  ok(drift.length === 0, "every stored line.controllable === OperatingTaxonomy.defaultControllable(code) (the store's hand-typed defaults have not drifted)" + listed(drift));
  eq(lines.RET && lines.RET.controllable, false, "store default for RET is false");
  eq(lines.INS && lines.INS.controllable, false, "store default for INS is false");
  eq(lines.UTIL && lines.UTIL.controllable, true, "store default for UTIL is true");
  eq(lines.BDX && lines.BDX.controllable, true, "store default for BDX is true (flippable)");
  var f1 = OS.setControllable(PK, "RET", true), f2 = OS.setControllable(PK, "INS", true);
  eq(f1 && f1.lines.RET.controllable, true, "setControllable(RET, true) flips the flag");
  eq(f2 && f2.lines.INS.controllable, true, "setControllable(INS, true) flips the flag");
  OS.init({ storage: storage, now: now }); var reloaded = OS.load();   // a fresh init re-reads the same storage = a reload
  var back = OS.get(PK);
  ok(!!(reloaded && reloaded.records && reloaded.records[PK]), "re-init + load on the same storage finds the record again");
  eq(back && back.lines.RET.controllable, true, "RET's flip survived the reload");
  eq(back && back.lines.INS.controllable, true, "INS's flip survived the reload");
  var rest = OT.ORDER.filter(function (c){ return c !== "RET" && c !== "INS" && !(back && back.lines[c] && back.lines[c].controllable === OT.defaultControllable(c)); });
  ok(rest.length === 0, "the other 31 lines still carry their taxonomy default after the reload" + listed(rest));
  var amounts = OT.ORDER.filter(function (c){ return !(back && back.lines[c] && back.lines[c].annual === seed[c].annual); });
  ok(amounts.length === 0, "every amount (deductions negative) round-tripped exactly" + listed(amounts));
  eq(OT.defaultControllable("RET"), false, "the taxonomy default for RET is untouched by a stored flip (defaults are not state)");
  eq(OT.CONTROLLABLE_DEFAULT.INS, false, "CONTROLLABLE_DEFAULT.INS is untouched too");
  eq(m.get(LOANS_KEY), LOANS_BLOB, "storage[\"ldsHub.loans.v7\"] is byte-identical after seeding, flipping and reloading");
  eq(m.size, 2, "storage holds exactly the loans blob and " + OS.KEY + " (no stray keys)");
})();

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
