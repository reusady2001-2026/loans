/* ============================================================================
   Node test for operating-sheet.js (P4) — plain node, no framework:
     /opt/node22/bin/node test/operating-sheet.test.js
   Covers the pure model (buildRows / toAnnual / formatMoney / formatDate /
   toHtml), the render() guard, and render()'s commit path driven through a
   minimal fake DOM (deduction sign rule, same-value guard, re-entrancy latch).
   Every number is hand-computed. Real-DOM behaviour (typing, toggles, fold,
   focus, idempotent redraw) lives in test/e2e/operating-sheet.e2e.js.
   ========================================================================== */
"use strict";
const path = require("path"), fs = require("fs");
const Sheet = require(path.join(__dirname, "..", "operating-sheet.js"));

let fails = 0, passes = 0;
function ok(cond, msg) { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (cond) passes++; else fails++; }
function eq(actual, expected, msg) {
  const same = Object.is(actual, expected) ||
    (actual !== null && typeof actual === "object" && JSON.stringify(actual) === JSON.stringify(expected));
  ok(same, msg + (same ? "" : "  — got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected)));
}
function throws(fn, re, msg) {
  let err = null; try { fn(); } catch (e) { err = e; }
  ok(!!err && re.test(String(err && err.message)), msg + (err ? "" : "  — did not throw"));
}
function section(name) { console.log("\n" + name); }
const keysOf = rows => rows.map(r => (r.editable ? r.code : "=" + r.key));
const index = rows => { const by = {}, sub = {}; rows.forEach(r => { if (r.editable) by[r.code] = r; else sub[r.key] = r; }); return { by, sub }; };
const count = (s, re) => (s.match(re) || []).length;
const trTag = (h, code) => { const m = h.match(new RegExp('<tr[^>]*data-op-code="' + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*>')); return m ? m[0] : ""; };

// ---- Fixture: one record, amounts chosen so every sum is exact in binary -------
// ERI  = 1,200,000 − 60,000 − 12,000.50 = 1,127,999.50
// other = 48,000 + 6,000.25 = 54,000.25      EGI = 1,181,999.75
// OPEX = 100,000 + 30,000 + 24,000 + 25,000 = 179,000      NOI = 1,002,999.75
const T = "2025-07-01T12:00:00.000Z", M = "2026-09-01T12:00:00.000Z";
const record = {
  propKey: "name:test gardens", propertyName: "Test Gardens", units: 100, period: "T12 ending 2025-06-30",
  lines: {
    GPR:  { annual: 1200000,  prevAnnual: null,  controllable: true,  source: "t12",    updatedAt: T, note: null },
    VAC:  { annual: -60000,   prevAnnual: null,  controllable: true,  source: "t12",    updatedAt: T, note: null },
    CONC: { annual: -12000.5, prevAnnual: null,  controllable: true,  source: "manual", updatedAt: M, note: "Q3 specials" },
    RUBS: { annual: 48000,    prevAnnual: null,  controllable: true,  source: "t12",    updatedAt: T, note: null },
    OTH:  { annual: 6000.25,  prevAnnual: null,  controllable: true,  source: "budget", updatedAt: M, note: null },
    RET:  { annual: 100000,   prevAnnual: 90000, controllable: false, source: "t12",    updatedAt: T, note: null },
    INS:  { annual: 30000,    prevAnnual: null,  controllable: true,  source: "manual", updatedAt: M, note: null },   // user flipped it on
    UTIL: { annual: 24000,    prevAnnual: null,  source: "t12", updatedAt: T },                                        // no flag stored
    MGMT: { annual: 25000,    prevAnnual: null,  controllable: true,  source: "t12",    updatedAt: T, note: null }
  },
  assumptions: null, meta: { createdAt: T, lastUpdated: M, sourceFile: "test.xlsx" }
};
// what OperatingCalc.derive hands back (only egi / opex / inPlaceNOI matter here; no `result` → ERI is summed locally)
const derived = { egi: 1181999.75, opex: 179000, inPlaceNOI: 1002999.75, underwrittenNOI: 950000.5,
                  egiUW: 1, opexUW: 2, worksheet: {}, sizing: {}, assumptions: {} };
const ORDER_S3 = ["GPR","EMPL","MOD","VAC","CONC","BD",
  "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH",
  "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL"];
// every §3 code is a row; the four subtotals sit after their blocks
const ALL_KEYS = ["GPR","EMPL","MOD","VAC","CONC","BD","=ERI",
  "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH","=EGI",
  "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL","=OPEX","=NOI"];

section("taxonomy mirror (contract §3)");
eq(Sheet.ORDER, ORDER_S3, "ORDER is exactly the §3 list (32 codes)");
eq(Sheet.ALWAYS.slice().sort(), ["GPR","INS","MGMT","RET","VAC"].sort(), "skeleton rows (never folded) are GPR, VAC, RET, INS, MGMT");
let SB = null; try { SB = require(path.join(__dirname, "..", "setup-builder.js")); } catch (e) {}
if (SB && SB.LABEL) {
  eq(ORDER_S3.filter(c => Sheet.LABEL[c] !== SB.LABEL[c]), [], "labels match SetupBuilder.LABEL for every §3 code (no drift)");
  eq(ORDER_S3.filter(c => !SB.RENTAL.concat(SB.OTHER, SB.EXPENSE).includes(c)), [], "every §3 code is a SetupBuilder category");
} else console.log("  skipped: setup-builder.js not loadable — label parity not checked");
eq(["EMPL","MOD","VAC","CONC","BD"].filter(c => !Sheet.isDeduction(c)), [], "the five rental deductions are deduction codes");
eq(ORDER_S3.filter(c => Sheet.isDeduction(c)).length, 5, "…and nothing else is");

section("buildRows — every §3 code drawn, subtotals in place");
const rows = Sheet.buildRows(record, derived, { basis: "annual" });
eq(keysOf(rows), ALL_KEYS, "all 32 codes in §3 order; ERI after rental, EGI after other income, OPEX after expenses, NOI last");
eq(rows.filter(r => r.editable).length, 32, "32 editable rows");
eq(rows.filter(r => r.editable && r.present).map(r => r.code), ["GPR","VAC","CONC","RUBS","OTH","RET","INS","UTIL","MGMT"], "the nine stored lines are the present ones");
const { by, sub } = index(rows);
eq(rows.filter(r => !r.editable).map(r => r.key), ["ERI","EGI","OPEX","NOI"], "exactly four subtotal rows");
eq(rows.filter(r => !r.editable).every(r => r.editable === false && r.section === "subtotal"), true, "subtotals are not editable");
eq(sub.ERI.label, "Effective Rental Income", "ERI label");
eq(sub.EGI.label, "Effective Gross Income", "EGI label");
eq(sub.OPEX.label, "Total Operating Expenses", "OPEX label");
eq(sub.NOI.label, "Net Operating Income", "NOI label");

section("buildRows — annual values");
eq(by.GPR.value, 1200000, "GPR value (annual basis) = 1,200,000");
eq(by.GPR.annual, 1200000, "GPR annual = 1,200,000");
eq(by.CONC.value, -12000.5, "CONC value keeps the stored sign: -12,000.50");
eq(sub.ERI.value, 1127999.5, "ERI = 1,200,000 − 60,000 − 12,000.50 = 1,127,999.50 (rental-block sum, no engine result passed)");
eq(sub.ERI.annual, 1127999.5, "ERI annual matches");
eq(sub.EGI.value, 1181999.75, "EGI = derived.egi = 1,181,999.75 (not recomputed)");
eq(sub.OPEX.value, 179000, "OPEX = derived.opex = 179,000.00");
eq(sub.NOI.value, 1002999.75, "NOI = derived.inPlaceNOI = 1,002,999.75");
const d2 = Object.assign({}, derived, { result: { inPlace: { eri: 999.5, egi: 1, opex: 2, noi: 3 } } });
eq(index(Sheet.buildRows(record, d2, {})).sub.ERI.value, 999.5, "ERI comes from derived.result.inPlace.eri when a derive() result is passed");
const d3 = Object.assign({}, derived, { result: { inPlace: { eri: "n/a" } } });
eq(index(Sheet.buildRows(record, d3, {})).sub.ERI.value, 1127999.5, "a non-numeric engine ERI falls back to the rental-block sum");
eq(index(Sheet.buildRows({ lines: {} }, { egi: 0, opex: 0, inPlaceNOI: 0, result: { inPlace: { eri: 0 } } }, {})).sub.ERI.value, 0, "empty record with an engine result → ERI 0, matching EGI 0");

section("buildRows — row fields");
eq(by.GPR.label, "Gross Potential Rent", "GPR label");
eq([by.VAC.section, by.VAC.role], ["rental","income"], "VAC is rental / income");
eq([by.RUBS.section, by.RUBS.role], ["other","income"], "RUBS is other / income");
eq([by.RET.section, by.RET.role], ["expense","expense"], "RET is expense / expense");
eq(by.RET.controllable, false, "RET stored flag false passes through");
eq(by.INS.controllable, true, "INS flag flipped to true passes through (user override wins over the default)");
eq(by.UTIL.controllable, true, "UTIL with no stored flag → default true");
eq(by.PAY.controllable, true, "absent PAY → default true");
eq(by.OTH.source, "budget", "source passes through (budget)");
eq(by.CONC.source, "manual", "source passes through (manual)");
eq(by.CONC.updatedAt, M, "updatedAt passes through");
eq(by.CONC.note, "Q3 specials", "note passes through");
eq([by.GPR.editable, by.GPR.present], [true, true], "line rows are editable and marked present");
eq([by.PAY.present, by.PAY.value, by.PAY.annual, by.PAY.source, by.PAY.updatedAt], [false, null, null, null, null], "an absent code is a row with no value, source or date");

section("buildRows — deductions: value keeps the stored sign, `shown` is the magnitude");
eq([by.VAC.deduction, by.CONC.deduction, by.GPR.deduction, by.RET.deduction], [true, true, false, false], "deduction flag on VAC / CONC only");
eq(by.VAC.shown, 60000, "VAC shown = 60,000 (magnitude under its Less: caption)");
eq(by.VAC.value, -60000, "VAC value = −60,000 (stored sign)");
eq(by.CONC.shown, 12000.5, "CONC shown = 12,000.50");
eq(by.GPR.shown, 1200000, "GPR shown = value");
eq(by.EMPL.shown, null, "absent EMPL shown null");

section("buildRows — monthly basis (÷12, annual untouched)");
const mrows = Sheet.buildRows(record, derived, { basis: "monthly" });
const m = index(mrows);
eq(keysOf(mrows), keysOf(rows), "monthly basis keeps the same row order");
eq(m.by.GPR.value, 100000, "GPR monthly = 1,200,000 / 12 = 100,000.00");
eq(m.by.VAC.value, -5000, "VAC monthly = -60,000 / 12 = -5,000.00");
eq(m.by.VAC.shown, 5000, "VAC monthly shown = 5,000.00 (magnitude)");
eq(m.by.CONC.value, -12000.5 / 12, "CONC monthly = -12,000.50 / 12 (exact division, unrounded)");
eq(m.by.GPR.annual, 1200000, "annual field unchanged in monthly basis");
eq(m.sub.ERI.value, 1127999.5 / 12, "ERI monthly = 1,127,999.50 / 12");
eq(m.sub.NOI.value, 1002999.75 / 12, "NOI monthly = 1,002,999.75 / 12");
eq(m.sub.NOI.annual, 1002999.75, "NOI annual kept alongside");
eq(Sheet.formatMoney(m.by.RET.value), "8,333.33", "RET monthly displays 100,000 / 12 to the cent");
eq(Sheet.formatMoney(m.sub.NOI.value), "83,583.31", "NOI monthly displays 1,002,999.75 / 12 = 83,583.3125 → 83,583.31");

section("buildRows — empty / partial records");
const e = Sheet.buildRows({ propKey: "x", propertyName: "Empty", lines: {} }, null, { basis: "annual" });
eq(keysOf(e), ALL_KEYS, "empty record: all 32 rows in §3 order with the subtotals");
eq(e.filter(r => r.editable).length, 32, "empty record: 32 editable rows");
eq(e.filter(r => r.editable && r.present).length, 0, "empty record: none present");
const ei = index(e);
eq([ei.by.GPR.value, ei.by.GPR.annual, ei.by.GPR.present], [null, null, false], "absent row: value null, annual null, present false");
eq([ei.by.GPR.source, ei.by.GPR.updatedAt], [null, null], "absent row: no source, no date");
eq(ei.by.GPR.editable, true, "absent row is still editable");
eq(ei.by.RET.controllable, false, "RET defaults to non-controllable");
eq(ei.by.INS.controllable, false, "INS defaults to non-controllable");
eq(ei.by.MGMT.controllable, true, "MGMT defaults to controllable");
eq(ei.sub.ERI.value, null, "no rental lines, no engine result → ERI null (nothing to sum yet)");
eq([ei.sub.EGI.value, ei.sub.OPEX.value, ei.sub.NOI.value], [null, null, null], "no derived → EGI / OPEX / NOI null");
eq(keysOf(Sheet.buildRows(null, null, {})), ALL_KEYS, "null record renders the same empty sheet");
eq(keysOf(Sheet.buildRows(undefined, undefined)), ALL_KEYS, "undefined record + undefined opts render the empty sheet");
const p = Sheet.buildRows({ lines: { VAC: { annual: -60000, source: "manual", updatedAt: M, controllable: true } } }, { egi: -60000, opex: 0, inPlaceNOI: -60000 }, {});
eq(keysOf(p), ALL_KEYS, "only VAC present: the row set is still all 32");
eq(index(p).sub.ERI.value, -60000, "ERI sums only the rental lines that exist (VAC alone → -60,000)");
eq(index(p).sub.NOI.value, -60000, "a negative NOI from derived is shown as-is");
const q = Sheet.buildRows({ lines: { "TRSH RUB": { annual: 1000, source: "t12", updatedAt: T }, "TRSH COL": { annual: 500, source: "t12", updatedAt: T }, PLL: { annual: 12, source: "t12", updatedAt: T } } }, { egi: 1500, opex: 12, inPlaceNOI: 1488 }, {});
eq(q.filter(r => r.editable && r.present).map(r => r.code), ["TRSH RUB","TRSH COL","PLL"], "codes with spaces and the last expense code are found and kept in §3 order");
eq(index(q).by["TRSH RUB"].label, "Trash Reimbursements", "'TRSH RUB' label");
eq(index(q).sub.EGI.value, 1500, "EGI from derived when there is other income");

section("buildRows — robustness");
const rec2 = JSON.parse(JSON.stringify(record)); rec2.lines.ZZZ = { annual: 5, controllable: true, source: "manual", updatedAt: M };
const u = Sheet.buildRows(rec2, derived, {});
eq(u[u.length - 1].code, "ZZZ", "an unknown code is shown last, after NOI");
eq([u[u.length - 1].section, u[u.length - 1].role, u[u.length - 1].label], ["unknown", null, "ZZZ"], "unknown code: section 'unknown', no role, label = code");
eq(index(u).sub.ERI.value, 1127999.5, "an unknown code never touches ERI");
eq(keysOf(u).slice(0, -1), keysOf(rows), "the known rows are unaffected by an unknown code");
const weird = { propKey: "w", lines: JSON.parse('{"constructor":{"annual":5,"source":"constructor","updatedAt":"' + T + '"},"__proto__":{"annual":7,"source":"manual","updatedAt":"' + T + '"},"toString":{"annual":9,"source":"t12","updatedAt":"' + T + '"}}') };
const wr = Sheet.buildRows(weird, null, {});
eq(wr.slice(-3).map(r => [r.code, r.section, r.label, r.source, r.annual]),
   [["constructor","unknown","constructor","constructor",5],["__proto__","unknown","__proto__","manual",7],["toString","unknown","toString","t12",9]],
   "prototype-named codes are drawn as unknown rows with their own label, source and value (own-property lookups)");
eq(wr.filter(r => r.editable).length, 35, "…in addition to the 32 taxonomy rows");
const wh = Sheet.toHtml(wr, { basis: "annual", record: weird });
ok(wh.indexOf("undefined") < 0, "no 'undefined' leaks into the markup for prototype-named codes or sources");
ok(wh.includes("data-op-source>constructor<"), "a source named 'constructor' renders as its own (escaped) text");
const rec3 = JSON.parse(JSON.stringify(record)); rec3.lines.GPR.annual = "1,200,000"; rec3.lines.VAC.annual = "junk"; rec3.lines.RET = null;
const r3 = index(Sheet.buildRows(rec3, derived, {}));
eq(r3.by.GPR.annual, 1200000, "a numeric string annual is read like underwriting.js reads cells");
eq([r3.by.VAC.annual, r3.by.VAC.present], [null, true], "a non-numeric annual shows as null but the line stays present");
eq(r3.by.RET.present, false, "a null line entry counts as absent (RET still drawn)");
eq(r3.sub.ERI.value, 1200000 - 12000.5, "ERI skips the unreadable VAC and sums the rest");
eq(keysOf(Sheet.buildRows({ lines: "not an object" }, null, {})), ALL_KEYS, "a non-object lines field is treated as empty");
throws(() => Sheet.buildRows(record, derived, { basis: "weekly" }), /basis/, "an invalid basis throws a clear error");
eq(Sheet.buildRows(record, derived, { basis: null })[0].value, 1200000, "basis null → annual");
const before = JSON.stringify(record), dBefore = JSON.stringify(derived);
Sheet.buildRows(record, derived, { basis: "monthly" }); Sheet.toHtml(mrows, { basis: "monthly", record });
eq(JSON.stringify(record), before, "buildRows / toHtml never mutate the record");
eq(JSON.stringify(derived), dBefore, "buildRows never mutates derived");
eq(Sheet.buildRows(record, derived, {}) !== rows, true, "each call returns fresh row objects");

section("toAnnual — typed text → exact annual dollars");
eq(Sheet.toAnnual("1,000.50", "monthly"), 12006, "1,000.50 / month → 12,006.00 exactly");
eq(Sheet.toAnnual("12,006.00", "annual"), 12006, "12,006.00 annual passes through");
eq(Sheet.toAnnual("1000.505", "monthly"), 12006.06, "sub-cent monthly entry: ×12 first, then rounded to the cent (12,006.06)");
eq(Sheet.toAnnual("8,333.33", "monthly"), 99999.96, "8,333.33 / month → 99,999.96 (no float drift)");
eq(Sheet.toAnnual("(500)", "annual"), -500, "accounting parentheses read as negative");
eq(Sheet.toAnnual("-60,000", "annual"), -60000, "leading minus");
eq(Sheet.toAnnual("$1,234.56", "annual"), 1234.56, "dollar sign and commas stripped");
eq(Sheet.toAnnual(" 250 ", "monthly"), 3000, "whitespace tolerated, 250 × 12 = 3,000");
eq(Sheet.toAnnual("0.005", "annual"), 0.01, "half a cent rounds up");
eq(Sheet.toAnnual("0.004", "annual"), 0, "under half a cent rounds down");
eq(Sheet.toAnnual("0.001", "monthly"), 0.01, "0.001 × 12 = 0.012 → 0.01");
eq(Sheet.toAnnual("-0.001", "monthly"), -0.01, "negative sub-cent rounds by magnitude");
eq(Sheet.toAnnual(".5", "annual"), 0.5, "leading-dot decimal");
eq(Sheet.toAnnual("5.", "annual"), 5, "trailing-dot integer");
eq(Sheet.toAnnual("+42", "annual"), 42, "explicit plus");
eq(Sheet.toAnnual("123,456,789.99", "monthly"), 1481481479.88, "large amount ×12 stays exact (1,481,481,479.88)");
eq(Object.is(Sheet.toAnnual("-0", "annual"), 0), true, "-0 becomes plain 0");
eq(Object.is(Sheet.toAnnual("(0.00)", "monthly"), 0), true, "(0.00) becomes plain 0");
eq(Sheet.toAnnual("", "annual"), null, "empty → null (no write)");
eq(Sheet.toAnnual("   ", "annual"), null, "blank → null");
eq(Sheet.toAnnual("abc", "annual"), null, "letters → null");
eq(Sheet.toAnnual("1.2.3", "annual"), null, "two dots → null");
eq(Sheet.toAnnual(".", "annual"), null, "lone dot → null");
eq(Sheet.toAnnual("1e5", "annual"), null, "exponent notation is not an amount");
eq(Sheet.toAnnual("--5", "annual"), null, "double minus → null");
eq(Sheet.toAnnual(null, "annual"), null, "null → null");
eq(Sheet.toAnnual(undefined, "monthly"), null, "undefined → null");
throws(() => Sheet.toAnnual("1", "weekly"), /basis/, "invalid basis throws");
let bad = 0;
for (let k = 1; k <= 5000; k++) {                      // annual = 12·k cents ⇒ monthly is a whole-cent amount
  const annual = (12 * k) / 100, typed = Sheet.formatMoney(annual / 12);
  if (Sheet.toAnnual(typed, "monthly") !== annual) { bad++; if (bad < 4) console.log("     mismatch: annual " + annual + " shown " + typed + " → " + Sheet.toAnnual(typed, "monthly")); }
}
eq(bad, 0, "monthly display → retyped → ×12 round-trips exactly for 5,000 amounts");

section("toAnnual — deduction codes: typed as a magnitude, always negative");
eq(Sheet.toAnnual("60000", "annual", "VAC"), -60000, "VAC typed 60000 → −60,000 (annual)");
eq(Sheet.toAnnual("-60000", "annual", "VAC"), -60000, "VAC typed -60000 → −60,000 (annual)");
eq(Sheet.toAnnual("(60,000)", "annual", "VAC"), -60000, "VAC typed (60,000) → −60,000");
eq(Sheet.toAnnual("5,000", "monthly", "VAC"), -60000, "VAC typed 5,000 monthly → −60,000");
eq(Sheet.toAnnual("-5,000.00", "monthly", "VAC"), -60000, "VAC typed -5,000.00 monthly → −60,000");
eq(Sheet.toAnnual("1,000.50", "monthly", "CONC"), -12006, "CONC 1,000.50/mo → −12,006 exactly");
eq(Sheet.toAnnual("(1,000.50)", "monthly", "CONC"), -12006, "CONC (1,000.50)/mo → −12,006");
["EMPL","MOD","VAC","CONC","BD"].forEach(c => eq(Sheet.toAnnual("1", "annual", c), -1, c + " typed 1 → −1"));
eq(Sheet.toAnnual("-100", "annual", "RET"), -100, "a non-deduction keeps a typed minus (an expense credit passes through)");
eq(Sheet.toAnnual("100", "annual", "GPR"), 100, "GPR unaffected");
eq(Sheet.toAnnual("60000", "annual"), 60000, "no code → plain parse (the two-argument API is unchanged)");
eq(Object.is(Sheet.toAnnual("0", "annual", "VAC"), 0), true, "a zero deduction is plain 0, not −0");
eq(Sheet.toAnnual("abc", "annual", "VAC"), null, "garbage on a deduction row is still null");

section("formatMoney / formatDate");
eq(Sheet.formatMoney(1234.5), "1,234.50", "two decimals, thousands separators");
eq(Sheet.formatMoney(-60000), "-60,000.00", "negative");
eq(Sheet.formatMoney(8333.333333), "8,333.33", "rounds to the cent");
eq(Sheet.formatMoney(0), "0.00", "zero");
eq(Sheet.formatMoney(null), "—", "null → em dash");
eq(Sheet.formatMoney(NaN), "—", "NaN → em dash");
eq(Sheet.formatMoney("1200"), "1,200.00", "numeric string tolerated");
eq(Sheet.formatDate("2025-07-01T12:00:00.000Z"), "2025-07-01", "ISO instant → local calendar date");
eq(Sheet.formatDate(null), "—", "missing date → em dash");
eq(Sheet.formatDate("not a date"), "—", "invalid date → em dash");

section("toHtml — markup contract (pure string)");
const html = Sheet.toHtml(rows, { basis: "annual", record });
eq(count(html, /data-op-code="/g), 32, "one data-op-code row per taxonomy code");
eq(count(html, /data-op-input/g), 32, "one data-op-input per row");
eq(count(html, /data-op-ctl/g), 12, "controllable toggle on the 12 expense rows only");
eq(count(html, /data-op-ctl( checked)? disabled/g), 8, "…disabled on the 8 expense rows with no value yet");
eq(count(html, /data-op-sub="/g), 4, "four subtotal rows");
eq(count(html, /id="opBasisToggle"/g), 1, "exactly one #opBasisToggle");
ok(html.includes('id="opBasisToggle" data-basis="annual"'), "toggle reports the annual basis");
ok(html.includes('class="op-sheet space-y-2" data-op-key="name:test gardens"'), "the root carries the record's propKey");
const at = s => { const i = html.indexOf(s); ok(i >= 0, "markup contains " + s); return i; };
const iG = at('data-op-code="GPR"'), iE = at('data-op-sub="ERI"'), iR = at('data-op-code="RUBS"'), iEG = at('data-op-sub="EGI"'),
      iRET = at('data-op-code="RET"'), iO = at('data-op-sub="OPEX"'), iN = at('data-op-sub="NOI"');
ok(iG < iE && iE < iR && iR < iEG && iEG < iRET && iRET < iO && iO < iN, "markup order: GPR < ERI < RUBS < EGI < RET < OPEX < NOI");
ok(html.includes('value="1,200,000.00"'), "GPR input value 1,200,000.00");
ok(html.includes('value="12,000.50"') && !html.includes('value="-12,000.50"'), "CONC input shows the magnitude 12,000.50, not -12,000.50");
ok(html.includes('value="60,000.00"') && !html.includes('value="-60,000.00"'), "VAC input shows 60,000.00, not -60,000.00");
ok(trTag(html, "VAC").includes('data-op-deduction="1"') && !trTag(html, "GPR").includes("data-op-deduction"), "deduction rows are marked, income rows are not");
ok(html.includes("data-op-source>T12<") && html.includes("data-op-source>Manual<") && html.includes("data-op-source>Budget<"), "T12 / Manual / Budget badges");
ok(html.includes(">2025-07-01<") && html.includes(">2026-09-01<"), "last-updated dates rendered");
ok(html.includes('<input type="checkbox" data-op-ctl aria-label="Controllable: Real Estate Taxes">'), "RET toggle unchecked and enabled");
ok(html.includes('<input type="checkbox" data-op-ctl checked aria-label="Controllable: Insurance">'), "INS toggle checked");
ok(html.includes("Test Gardens") && html.includes("T12 ending 2025-06-30") && html.includes("100 units"), "record name, period and units shown");
ok(html.includes("<tbody>") && html.includes("</table>"), "a table is rendered");
ok(!html.includes("data-op-sign-warn"), "no sign warning when deductions are stored negative");
const posh = Sheet.toHtml(Sheet.buildRows({ lines: { VAC: { annual: 60000, source: "t12", updatedAt: T } } }, null, {}), { basis: "annual" });
ok(trTag(posh, "VAC").includes('data-op-sign-warn="1"') && posh.includes("stored positive"), "a deduction stored POSITIVE is flagged, never silently shown as a deduction");
const mhtml = Sheet.toHtml(mrows, { basis: "monthly", record });
ok(mhtml.includes('data-basis="monthly"') && mhtml.includes('aria-pressed="true"'), "monthly toggle state");
ok(mhtml.includes('value="100,000.00"') && mhtml.includes('value="8,333.33"') && mhtml.includes('value="5,000.00"'), "monthly inputs show ÷12 values to the cent (VAC as 5,000.00)");
ok(mhtml.includes(">Monthly $<") && html.includes(">Annual $<"), "column header names the basis");
const ehtml = Sheet.toHtml(e, { basis: "annual", record: null });
eq(count(ehtml, /data-op-present="0"/g), 32, "all 32 rows are marked not present on an empty sheet");
eq(count(ehtml, /data-op-ctl( checked)? disabled/g), 12, "all 12 expense toggles disabled until a value exists (MGMT etc. still show their default tick)");
eq(count(ehtml, />not set</g), 32, "absent rows carry a 'not set' badge");
ok(ehtml.includes('value=""'), "absent rows render an empty input");
ok(ehtml.includes("No operating record yet"), "empty-record hint shown without a record");
const xr = Sheet.buildRows({ lines: { GPR: { annual: 1, source: "<b>x</b>", updatedAt: T, note: "a<b" } } }, null, {});
const xh = Sheet.toHtml(xr, { basis: "annual", record: { propertyName: "<script>alert(1)</script>", period: 'x" onmouseover="y', propKey: '"><i>' } });
ok(!xh.includes("<script>") && xh.includes("&lt;script&gt;"), "property name is HTML-escaped");
ok(!xh.includes("<b>x</b>") && xh.includes("&lt;b&gt;x&lt;/b&gt;"), "an unrecognised source string is escaped");
ok(!xh.includes('x" onmouseover') && !xh.includes('data-op-key=""><i>'), "attribute-breaking quotes are escaped (period, propKey)");
throws(() => Sheet.toHtml(rows, { basis: "quarterly" }), /basis/, "toHtml rejects an invalid basis");

section("toHtml — unused rows fold per section");
eq(count(html, /<tr[^>]* hidden[^>]*>/g), 23, "record with lines: 23 unused rows folded by default (3 rental + 12 other + 8 expense)");
eq(count(html, /data-op-more="/g), 3, "one fold toggle per section");
ok(html.includes('data-op-more="rental" data-op-count="3" aria-expanded="false"') && html.includes(">Show 3 more lines<"), "rental toggle: Show 3 more lines (EMPL, MOD, BD)");
ok(html.includes('data-op-more="other" data-op-count="12" aria-expanded="false"') && html.includes(">Show 12 more lines<"), "other-income toggle: Show 12 more lines");
ok(html.includes('data-op-more="expense" data-op-count="8" aria-expanded="false"') && html.includes(">Show 8 more lines<"), "expense toggle: Show 8 more lines");
ok(/ hidden/.test(trTag(html, "PAY")) && /data-op-optional="expense"/.test(trTag(html, "PAY")), "unused PAY carries hidden + data-op-optional");
ok(/ hidden/.test(trTag(html, "EMPL")) && / hidden/.test(trTag(html, "PARK")), "unused EMPL / PARK are hidden");
ok(!/ hidden/.test(trTag(html, "RET")) && !/ hidden/.test(trTag(html, "GPR")) && !/ hidden/.test(trTag(html, "OTH")), "present rows are never hidden");
const iBD = html.indexOf('data-op-code="BD"'), iMoreR = html.indexOf('data-op-more="rental"'), iERI = html.indexOf('data-op-sub="ERI"');
ok(iBD < iMoreR && iMoreR < iERI, "the rental fold toggle sits after the last rental row and before ERI");
const iPLL = html.indexOf('data-op-code="PLL"'), iMoreX = html.indexOf('data-op-more="expense"'), iOPEX = html.indexOf('data-op-sub="OPEX"');
ok(iPLL < iMoreX && iMoreX < iOPEX, "the expense fold toggle sits after PLL and before OPEX");
eq(count(ehtml, /<tr[^>]* hidden[^>]*>/g), 0, "empty record: nothing folded by default (a fresh property shows every row)");
ok(ehtml.includes('data-op-more="expense" data-op-count="9" aria-expanded="true"') && ehtml.includes(">Hide 9 unused lines<"), "empty record: expense toggle reads Hide 9 unused lines (12 − RET/INS/MGMT)");
ok(ehtml.includes(">Hide 4 unused lines<") && ehtml.includes(">Hide 14 unused lines<"), "empty record: rental 4 (6 − GPR/VAC) / other 14");
const fh = Sheet.toHtml(e, { basis: "annual", record: null, expanded: false });
eq(count(fh, /<tr[^>]* hidden[^>]*>/g), 27, "expanded:false on an empty record hides 27 of 32 rows — the five skeleton rows stay");
ok(!/ hidden/.test(trTag(fh, "MGMT")) && !/ hidden/.test(trTag(fh, "VAC")) && !/ hidden/.test(trTag(fh, "INS")) && / hidden/.test(trTag(fh, "UTIL")), "skeleton rows (GPR, VAC, RET, INS, MGMT) never fold");
eq(count(Sheet.toHtml(rows, { basis: "annual", record, expanded: { expense: true } }), /<tr[^>]* hidden[^>]*>/g), 15, "per-section map: expense open, rental + other folded (3 + 12)");
eq(count(Sheet.toHtml(rows, { basis: "annual", record, expanded: true }), /<tr[^>]* hidden[^>]*>/g), 0, "expanded:true unfolds everything");
ok(Sheet.toHtml(rows, { basis: "annual", record, expanded: true }).includes(">Hide 8 unused lines<"), "…and the toggle then reads Hide N unused lines");
eq(count(wh, /data-op-more="/g), 3, "unknown-code rows (after NOI) get no fold toggle of their own");

section("render — guard");
throws(() => Sheet.render(null, { record, derived }), /mountEl/, "render(null) throws a clear error naming mountEl");
throws(() => Sheet.render(undefined, {}), /mountEl/, "render(undefined) throws");
throws(() => Sheet.render({}, { record }), /mountEl/, "render({}) — not an element — throws");
throws(() => Sheet.render("opSheetMount", {}), /mountEl/, "render(\"id\") — a string — throws");
eq(typeof Sheet.render, "function", "render is exported");

section("render — commit path through a fake DOM");
// Enough DOM for render() to draw and for its handlers to be driven by hand: innerHTML is
// a string, and every assignment yields a NEW root object that records the listeners.
function fakeMount() {
  const roots = [];
  const mk = () => { const h = {}; return { handlers: h, addEventListener: (n, f) => { (h[n] = h[n] || []).push(f); },
    querySelectorAll: () => [], querySelector: () => null, getAttribute: () => null, contains: () => false }; };
  const mnt = { _html: "", _root: null, querySelector: () => null, querySelectorAll: () => [], contains: () => false };
  Object.defineProperty(mnt, "innerHTML", { get: () => mnt._html, set: (v) => { mnt._html = v; mnt._root = mk(); roots.push(mnt._root); } });
  Object.defineProperty(mnt, "firstElementChild", { get: () => mnt._root });
  return { mnt, roots };
}
function fakeInput(code, value) {
  const tr = { getAttribute: (a) => (a === "data-op-code" ? code : null), hidden: false };
  return { value, disabled: false, hasAttribute: (a) => a === "data-op-input", closest: (s) => (s.indexOf("tr") === 0 ? tr : null), blur() {}, focus() {}, select() {} };
}
const fire = (root, name, target, extra) => root.handlers[name].forEach(f => f(Object.assign({ target, key: null, preventDefault() {} }, extra || {})));
{
  const { mnt, roots } = fakeMount(); const edits = [];
  const out = Sheet.render(mnt, { record, derived, basis: "annual", onEdit: (c, a) => edits.push([c, a]) });
  eq(out.length, 36, "render returns the 36 rows it drew");
  eq(roots.length, 1, "one tree drawn");
  eq(Object.keys(roots[0].handlers).sort(), ["change","click","keydown","pointerdown"], "listeners: change, click, keydown, pointerdown — on the tree, not the mount");
  ok(mnt.innerHTML.includes('data-op-code="GPR"'), "the mount holds the sheet markup");
  const vac = fakeInput("VAC", "70000");
  fire(roots[0], "change", vac);
  eq(edits, [["VAC", -70000]], "VAC typed 70000 → onEdit(VAC, −70000)");
  eq(vac.value, "70,000.00", "the input reads the magnitude 70,000.00");
  vac.value = "(70,000)"; fire(roots[0], "change", vac);
  eq(edits.length, 1, "VAC retyped as (70,000) is the same −70,000 → no write");
  vac.value = "-60000"; fire(roots[0], "change", vac);
  eq(edits[1], ["VAC", -60000], "VAC typed -60000 → onEdit(VAC, −60000)");
  const gpr = fakeInput("GPR", "$1,200,000.00"); fire(roots[0], "change", gpr);
  eq(edits.length, 2, "GPR retyped as $1,200,000.00 → same number, no write");
  eq(gpr.value, "1,200,000.00", "…but the text is normalised");
  gpr.value = "1200000"; fire(roots[0], "change", gpr);
  eq(edits.length, 2, "GPR retyped as 1200000 → no write");
  gpr.value = "1,200,000.5"; fire(roots[0], "change", gpr);
  eq(edits[2], ["GPR", 1200000.5], "a real change writes the exact number");
  gpr.value = "abc"; fire(roots[0], "change", gpr);
  eq(edits.length, 3, "garbage is not a write");
  eq(gpr.value, "1,200,000.50", "garbage reverts to the last committed value");
  gpr.value = "junk"; fire(roots[0], "keydown", gpr, { key: "Escape" });
  eq(gpr.value, "1,200,000.50", "Escape restores the last committed value");
  const ret = fakeInput("RET", "-100"); fire(roots[0], "change", ret);
  eq(edits[3], ["RET", -100], "a non-deduction keeps a typed minus");
  const ctl = { checked: true, hasAttribute: (a) => a === "data-op-ctl", closest: (s) => (s.indexOf("tr") === 0 ? { getAttribute: () => "RET" } : null) };
  const flips = [];
  Sheet.render(mnt, { record, derived, basis: "annual", onToggleControllable: (c, b) => flips.push([c, b]) });
  fire(roots[1], "change", ctl);
  eq(flips, [["RET", true]], "a checkbox change calls onToggleControllable(RET, true)");
}
{
  const { mnt, roots } = fakeMount(); const edits = [];
  Sheet.render(mnt, { record, derived, basis: "monthly", onEdit: (c, a) => edits.push([c, a]) });
  const vac = fakeInput("VAC", "6,000"); fire(roots[0], "change", vac);
  eq(edits, [["VAC", -72000]], "monthly VAC typed 6,000 → onEdit(VAC, −72,000)");
  eq(vac.value, "6,000.00", "monthly deduction input reads 6,000.00");
  const ins = fakeInput("INS", "1,000.50"); fire(roots[0], "change", ins);
  eq(edits[1], ["INS", 12006], "monthly INS typed 1,000.50 → onEdit(INS, 12006) exactly");
  eq(ins.value, "1,000.50", "monthly INS input reads 1,000.50");
}

section("render — re-entrancy: a synchronous host redraw inside onEdit");
{
  const { mnt, roots } = fakeMount(); const edits = []; let threw = null;
  const host = { record: { propKey: "k", lines: {} }, derived: null, basis: "annual" };
  const gpr = fakeInput("GPR", "1,200,000");
  const draw = () => Sheet.render(mnt, Object.assign({}, host, { onEdit: (code, annual) => {
    edits.push([code, annual]);
    host.record = { propKey: "k", lines: { GPR: { annual, source: "manual", updatedAt: T, controllable: true } } };
    draw();                                  // the host redraws SYNCHRONOUSLY inside the callback (innerHTML replaced)…
    fire(roots[0], "change", gpr);           // …and the browser fires the removed input's change again mid-removal
  } }));
  draw();
  try { fire(roots[0], "change", gpr); } catch (e) { threw = e; }
  eq(threw, null, "a synchronous host redraw inside onEdit does not throw");
  eq(edits, [["GPR", 1200000]], "onEdit fired exactly once for one edit (the re-entrant change is ignored)");
  eq(roots.length, 2, "the host's redraw replaced the tree exactly once");
  ok(mnt.innerHTML.includes('value="1,200,000.00"'), "the redrawn tree shows the committed value");
  gpr.value = "1,300,000"; fire(roots[0], "change", gpr);
  eq(edits.length, 2, "a later, different edit on the same input still commits (the latch is released)");
  eq(edits[1], ["GPR", 1300000], "…with the new number");
  gpr.value = "1300000.00"; fire(roots[0], "change", gpr);
  eq(edits.length, 2, "and the same number again is not a write");
}

section("taxonomy binding (operating-taxonomy.js when present)");
const taxPath = path.join(__dirname, "..", "operating-taxonomy.js");
if (fs.existsSync(taxPath)) {
  try {
    const OT = require(taxPath);
    eq(Sheet.ORDER, Array.prototype.slice.call(OT.ORDER), "ORDER mirrors OperatingTaxonomy.ORDER exactly");
    eq(Sheet.ORDER.filter(c => Sheet.LABEL[c] !== OT.label(c)), [], "labels agree with OperatingTaxonomy.label for every code");
    eq(Sheet.ORDER.filter(c => Sheet.isDeduction(c) !== OT.isDeduction(c)), [], "isDeduction agrees with OperatingTaxonomy.isDeduction for every code");
    const secs = index(Sheet.buildRows({ lines: {} }, null, {})).by;
    eq(Sheet.ORDER.filter(c => secs[c].section !== OT.section(c)), [], "section agrees with OperatingTaxonomy.section for every code");
    eq(Sheet.ORDER.filter(c => secs[c].controllable !== OT.defaultControllable(c)), [], "controllable defaults agree with OperatingTaxonomy.defaultControllable");
    eq(Sheet.toAnnual("60000", "annual", "VAC"), -60000, "with the taxonomy loaded, VAC is still forced negative (delegated isDeduction)");
    const saved = globalThis.OperatingTaxonomy;
    globalThis.OperatingTaxonomy = { isDeduction: (c) => c === "GPR" };
    eq([Sheet.isDeduction("GPR"), Sheet.isDeduction("VAC")], [true, false], "isDeduction consults the loaded OperatingTaxonomy at call time");
    globalThis.OperatingTaxonomy = saved;
    eq([Sheet.isDeduction("GPR"), Sheet.isDeduction("VAC")], [false, true], "…and follows it back");
  } catch (e) { console.log("  skipped: operating-taxonomy.js failed to load (" + e.message + ")"); }
} else console.log("  skipped: operating-taxonomy.js not present (taxonomy binding)");

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
