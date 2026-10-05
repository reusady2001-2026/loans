/* 2.9.8 (problem 6) — the operator's own T12 categories.
   A category added in the T12 review ("Other Expenses", expense) joins the lists the review and the AI use,
   is its own line in the underwriting at its T12 amount, counts on its side of NOI, and is not reported as
   dropped by the operating model. Removing it from the registry puts everything back as it was.
   Run: node test/custom-categories.test.js */
const path = require("path");
let fails = 0, count = 0;
const ok = (c, m) => { count++; console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };
const T12 = require(path.join(__dirname, "..", "t12-classify.js"));
const SB = require(path.join(__dirname, "..", "setup-builder.js"));
const CHK = require(path.join(__dirname, "..", "t12-check.js"));
const OC = require(path.join(__dirname, "..", "operating-calc.js"));
const OT = require(path.join(__dirname, "..", "operating-taxonomy.js"));
const MINE = [{ code: "C_OTHER_EXPENSES", role: "expense", label: "Other Expenses" }, { code: "C_LAUNDRY", role: "income", label: "Laundry Income" }];
const setAll = (l) => { T12.setCustom(l); SB.setCustom(l); CHK.setCustom(l); };

// a statement: rent 1,000,000; taxes 100,000; an "Other Expenses" line of 50,000 the operator filed under their own category
const parsed = (code) => ({ rows: [
  { name: "Rent", amount: 1000000, section: "INCOME", sub: "" },
  { name: "Laundry", amount: 20000, section: "INCOME", sub: "", forceCode: code ? "C_LAUNDRY" : undefined },
  { name: "Real Estate Taxes", amount: 100000, section: "EXPENSE", sub: "" },
  { name: "Other Expenses", amount: 50000, section: "EXPENSE", sub: "", forceCode: code || undefined } ],
  totals: { income: 1020000, expense: 150000, noi: 870000 } });

setAll(MINE);
ok(T12.roleOf("C_OTHER_EXPENSES") === "expense" && T12.roleOf("C_LAUNDRY") === "income", "each own category knows its side of NOI");
ok(CHK.EXPENSE_CODES.indexOf("C_OTHER_EXPENSES") >= 0 && CHK.INCOME_CODES.indexOf("C_LAUNDRY") >= 0, "the review's lists offer them (expense list / income list)");
ok(CHK.EXPENSE_CODES.indexOf("C_LAUNDRY") < 0 && CHK.INCOME_CODES.indexOf("C_OTHER_EXPENSES") < 0, "…each only on its own side");
const enumList = CHK.schema().properties.lines.items.properties.category.enum;
ok(enumList.indexOf("C_OTHER_EXPENSES") >= 0 && enumList.indexOf("C_LAUNDRY") >= 0, "the AI may answer with them");
ok(/C_OTHER_EXPENSES Other Expenses/.test(CHK.instruction()) && /C_LAUNDRY Laundry Income/.test(CHK.instruction()), "the AI is told what they are");
ok(SB.LABEL.C_OTHER_EXPENSES === "Other Expenses" && OT.label("C_OTHER_EXPENSES") === "Other Expenses", "the underwriting and the operating model show the name");

const mine = SB.buildSetup({ parsed: parsed("C_OTHER_EXPENSES"), units: 100, benchmarks: { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200 } });
const asGA = SB.buildSetup({ parsed: parsed(null), units: 100, benchmarks: { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200 } });
const line = mine.worksheet.lines.find(l => l.key === "C_OTHER_EXPENSES");
ok(!!line && line.label === "Other Expenses" && line.section === "expense", "\"Other Expenses\" is its own expense line in the underwriting");
ok(line && line.t12 === 50000 && line.uw === 50000, "…carried at its T12 amount: 50,000 in place and underwritten");
ok(mine.result.inPlace.noi === 870000 && mine.result.inPlace.noi === asGA.result.inPlace.noi, "in-place NOI is the same 870,000 as when it was filed under G&A");
const laundry = mine.worksheet.lines.find(l => l.key === "C_LAUNDRY");
ok(!!laundry && laundry.section === "other" && laundry.t12 === 20000, "an own income category is an other-income line (20,000)");

const derived = OC.derive({ propKey: "k", units: 100, lines: { GPR: { annual: 1000000 }, RET: { annual: -100000 }, C_OTHER_EXPENSES: { annual: -50000 } } }, { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200 });
ok(derived && Array.isArray(derived.dropped) && derived.dropped.indexOf("C_OTHER_EXPENSES") < 0, "the operating model does not drop it (dropped: " + JSON.stringify(derived && derived.dropped) + ")");
const unknown = OC.derive({ propKey: "k", units: 100, lines: { GPR: { annual: 1000000 }, FOO: { annual: 5000 } } }, { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200 });
ok(unknown.dropped.indexOf("FOO") >= 0, "a code nobody added is still dropped and reported, as before");

setAll([]);
ok(CHK.EXPENSE_CODES.indexOf("C_OTHER_EXPENSES") < 0 && SB.LABEL.C_OTHER_EXPENSES === undefined && T12.roleOf("C_OTHER_EXPENSES") === "income", "removed: the lists, the names and the sides are back as they were");
ok(CHK.instruction() === CHK.INSTRUCTION, "…and the AI's instruction is the original one");

console.log("\n" + (fails ? fails + " of " + count + " checks FAILED" : "all " + count + " checks passed"));
process.exit(fails ? 1 : 0);
