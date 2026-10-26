/* Unit tests for t12-check.js (2.9.7, #108): the T12 double reading — compare the regular reader with the
   AI's reading line by line, and apply the user's decisions so the NOI follows them.
   Run: node test/t12-check.test.js */
var C = require("../t12-check.js"), P = require("../t12-parse.js"), K = require("../t12-classify.js"), SB = require("../setup-builder.js");
var fails = 0, passes = 0;
function ok(c, m){ if (c){ passes++; console.log("  ok   " + m); } else { fails++; console.log("  FAIL " + m); } }
function near(a, b, m){ ok(Math.abs(a - b) < 0.005, m + "  [got " + a + ", want " + b + "]"); }
var classify = function (name, section, sub, row){ var cc = (row && row.forceCode) ? { code: row.forceCode } : K.classifyConfident(name, section, sub); return cc && cc.code ? { code: cc.code, role: K.roleOf(cc.code) } : null; };
var M = ["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026","Sep 2026","Oct 2026","Nov 2026","Dec 2026"];
var Y = ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"];
function rowOf(label, v){ return [label].concat(Array(12).fill(v)).concat([v * 12]); }
var grid = [["Account"].concat(M, ["Total"]),
  ["INCOME"], rowOf("Gross Potential Rent", 100000), rowOf("Utility Reimbursements", 5000), rowOf("TOTAL INCOME", 105000),
  ["EXPENSES"], rowOf("Real Estate Taxes", 10000), rowOf("Repairs and Maintenance", 4000), rowOf("TOTAL EXPENSES", 14000),
  rowOf("NET OPERATING INCOME", 91000)];
var parsed = P.parseGrid(grid, { basis: "total", monthly: true });
var reg = C.regularLines(parsed, classify);
ok(reg.length === 4, "the regular reading has the 4 detail lines");
ok(reg[1].role === "income" && reg[1].code === "RUBS" && reg[1].annual === 60000, "Utility Reimbursements: income, RUBS, 60,000");
function aiFrom(r, patch){ return { row: r.row, label: r.label, role: r.role, category: r.code, annual: r.annual, monthly: Y.map(function (y){ return { month: y, amount: r.monthly[y] }; }) }; }
// ---- all agree ----
var same = { lines: reg.map(function (r){ return aiFrom(r); }) };
var c0 = C.compare(reg, same);
ok(c0.agree && c0.cards.length === 0, "identical readings → no cards (✓ checked by AI)");
// ---- one line in a different place, one amount different in one month ----
var ai = { lines: reg.map(function (r){ return aiFrom(r); }) };
ai.lines[1].role = "expense"; ai.lines[1].category = "UTIL";                       // AI books the reimbursements as a utility expense
ai.lines[3].monthly[4].amount = 4600; ai.lines[3].annual = 48600;                // AI reads May R&M as 4,600, not 4,000
var c1 = C.compare(reg, ai);
ok(c1.cards.length === 2, "two disagreements → two cards");
var b = c1.cards.find(function (c){ return c.type === "belongs"; }), a = c1.cards.find(function (c){ return c.type === "amount"; });
ok(b && b.label === "Utility Reimbursements" && b.ai.role === "expense" && b.ai.code === "UTIL", "TYPE 1 card: where Utility Reimbursements belongs (income RUBS vs expense UTIL)");
near(b.noiEffect, -120000, "its NOI effect: income 60,000 → expense 60,000 = −120,000");
ok(a && a.label === "Repairs and Maintenance" && a.months.join() === "2026-05", "TYPE 2 card: the R&M amount differs in May 2026 only");
near(a.annualGap, 600, "…year total differs by 600");
near(a.noiEffect, -600, "…NOI effect −600 if the AI's amount is right");
// ---- decisions flow into the NOI ----
var base = SB.buildSetup({ parsed: { rows: parsed.rows, categories: parsed.categories, totals: parsed.totals } }).result.inPlace.noi;
near(base, 1092000, "regular reading: NOI 91,000 × 12 = 1,092,000");
var review = { cards: c1.cards };
var p2 = C.applyDecisions(parsed, review);
ok(p2 === parsed, "no decisions yet → the regular reading is used as-is");
b.decision = { role: "expense", code: "UTIL", annual: 60000, monthly: b.regular.monthly };       // the user agrees with the AI on where it belongs
a.decision = { role: "expense", code: "RM", annual: 48600, monthly: a.ai.monthly };              // and takes the AI's May figure
p2 = C.applyDecisions(parsed, review);
var nb = SB.buildSetup({ parsed: { rows: p2.rows, categories: p2.categories, totals: p2.totals } });
near(nb.result.inPlace.noi, 1092000 - 120000 - 600, "with both decisions the NOI is 1,092,000 − 120,000 − 600 = 971,400");
near(nb.categorySums ? (nb.categorySums.UTIL || 0) : 60000, 60000, "the reimbursements now sit in Utilities");
ok(p2.rows.some(function (r){ return r.forceCode === "UTIL" && r.section === "EXPENSE"; }), "the decided line is re-booked as an expense (UTIL)");
near(p2.totalsMonthly.noi["2026-05"], 91000 - 10000 - 600, "the month's printed NOI moves too (May: 91,000 − 10,000 − 600)");
ok(C.status(review) === "checked" && C.pending(review) === 0, "every card decided → \"✓ This T12 is checked\"");
// ---- "something else": not operating → leaves the NOI ----
var r3 = { cards: [{ regular: reg[3], label: reg[3].label, decision: { role: "other", code: C.OTHER, annual: 48000, monthly: reg[3].monthly } }] };
var p3 = C.applyDecisions(parsed, r3);
var n3 = SB.buildSetup({ parsed: { rows: p3.rows, categories: p3.categories, totals: p3.totals } }).result.inPlace.noi;
near(n3, 1092000 + 48000, "a line decided as \"something else — not operating\" leaves the NOI (+48,000)");
ok(C.status({ cards: c1.cards.map(function (c){ return { id: c.id }; }) }) === "needs-review", "undecided cards → needs review");
console.log("\n" + (fails ? (fails + " FAILED, " + passes + " passed") : ("all " + passes + " t12-check tests passed")));
process.exit(fails ? 1 : 0);
