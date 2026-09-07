/* ============================================================================
   Node test for operating-sheet.js (P4) — plain node, no framework:
     /opt/node22/bin/node test/operating-sheet.test.js
   Covers the pure model (buildRows / toAnnual / formatMoney / formatDate /
   toHtml) and the render() guard. Every number is hand-computed; the DOM
   behaviour (typing, toggles, idempotent redraw) lives in
   test/e2e/operating-sheet.e2e.js and runs after the UI is wired.
   ========================================================================== */
"use strict";
const path = require("path");
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
// what OperatingCalc.derive would hand back (only egi / opex / inPlaceNOI matter to the sheet)
const derived = { egi: 1181999.75, opex: 179000, inPlaceNOI: 1002999.75, underwrittenNOI: 950000.5,
                  egiUW: 1, opexUW: 2, worksheet: {}, sizing: {}, assumptions: {} };
const ORDER_S3 = ["GPR","EMPL","MOD","VAC","CONC","BD",
  "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH",
  "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL"];

section("taxonomy mirror (contract §3)");
eq(Sheet.ORDER, ORDER_S3, "ORDER is exactly the §3 list (32 codes)");
eq(Sheet.ALWAYS.slice().sort(), ["GPR","INS","MGMT","RET","VAC"].sort(), "always-shown rows are GPR, VAC, RET, INS, MGMT");
let SB = null; try { SB = require(path.join(__dirname, "..", "setup-builder.js")); } catch (e) {}
if (SB && SB.LABEL) {
  eq(ORDER_S3.filter(c => Sheet.LABEL[c] !== SB.LABEL[c]), [], "labels match SetupBuilder.LABEL for every §3 code (no drift)");
  eq(ORDER_S3.filter(c => !SB.RENTAL.concat(SB.OTHER, SB.EXPENSE).includes(c)), [], "every §3 code is a SetupBuilder category");
} else console.log("  skipped: setup-builder.js not loadable — label parity not checked");

section("buildRows — order and subtotal placement");
const rows = Sheet.buildRows(record, derived, { basis: "annual" });
eq(keysOf(rows), ["GPR","VAC","CONC","=ERI","RUBS","OTH","=EGI","RET","INS","UTIL","MGMT","=OPEX","=NOI"],
   "present lines in §3 order; ERI after rental, EGI after other income, OPEX after expenses, NOI last");
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
eq(by.CONC.value, -12000.5, "CONC keeps its negative sign: -12,000.50");
eq(sub.ERI.value, 1127999.5, "ERI = 1,200,000 − 60,000 − 12,000.50 = 1,127,999.50 (sum of the rental block)");
eq(sub.ERI.annual, 1127999.5, "ERI annual matches");
eq(sub.EGI.value, 1181999.75, "EGI = derived.egi = 1,181,999.75 (not recomputed)");
eq(sub.OPEX.value, 179000, "OPEX = derived.opex = 179,000.00");
eq(sub.NOI.value, 1002999.75, "NOI = derived.inPlaceNOI = 1,002,999.75");

section("buildRows — row fields");
eq(by.GPR.label, "Gross Potential Rent", "GPR label");
eq([by.VAC.section, by.VAC.role], ["rental","income"], "VAC is rental / income");
eq([by.RUBS.section, by.RUBS.role], ["other","income"], "RUBS is other / income");
eq([by.RET.section, by.RET.role], ["expense","expense"], "RET is expense / expense");
eq(by.RET.controllable, false, "RET stored flag false passes through");
eq(by.INS.controllable, true, "INS flag flipped to true passes through (user override wins over the default)");
eq(by.UTIL.controllable, true, "UTIL with no stored flag → default true");
eq(by.OTH.source, "budget", "source passes through (budget)");
eq(by.CONC.source, "manual", "source passes through (manual)");
eq(by.CONC.updatedAt, M, "updatedAt passes through");
eq(by.CONC.note, "Q3 specials", "note passes through");
eq([by.GPR.editable, by.GPR.present], [true, true], "line rows are editable and marked present");

section("buildRows — monthly basis (÷12, annual untouched)");
const mrows = Sheet.buildRows(record, derived, { basis: "monthly" });
const m = index(mrows);
eq(keysOf(mrows), keysOf(rows), "monthly basis keeps the same row order");
eq(m.by.GPR.value, 100000, "GPR monthly = 1,200,000 / 12 = 100,000.00");
eq(m.by.VAC.value, -5000, "VAC monthly = -60,000 / 12 = -5,000.00");
eq(m.by.CONC.value, -12000.5 / 12, "CONC monthly = -12,000.50 / 12 (exact division, unrounded)");
eq(m.by.GPR.annual, 1200000, "annual field unchanged in monthly basis");
eq(m.sub.ERI.value, 1127999.5 / 12, "ERI monthly = 1,127,999.50 / 12");
eq(m.sub.NOI.value, 1002999.75 / 12, "NOI monthly = 1,002,999.75 / 12");
eq(m.sub.NOI.annual, 1002999.75, "NOI annual kept alongside");
eq(Sheet.formatMoney(m.by.RET.value), "8,333.33", "RET monthly displays 100,000 / 12 to the cent");
eq(Sheet.formatMoney(m.sub.NOI.value), "83,583.31", "NOI monthly displays 1,002,999.75 / 12 = 83,583.3125 → 83,583.31");

section("buildRows — empty / partial records");
const e = Sheet.buildRows({ propKey: "x", propertyName: "Empty", lines: {} }, null, { basis: "annual" });
eq(keysOf(e), ["GPR","VAC","=ERI","=EGI","RET","INS","MGMT","=OPEX","=NOI"], "empty record still shows GPR, VAC, RET, INS, MGMT with the subtotals");
const ei = index(e);
eq([ei.by.GPR.value, ei.by.GPR.annual, ei.by.GPR.present], [null, null, false], "absent row: value null, annual null, present false");
eq([ei.by.GPR.source, ei.by.GPR.updatedAt], [null, null], "absent row: no source, no date");
eq(ei.by.GPR.editable, true, "absent row is still editable");
eq(ei.by.RET.controllable, false, "RET defaults to non-controllable");
eq(ei.by.INS.controllable, false, "INS defaults to non-controllable");
eq(ei.by.MGMT.controllable, true, "MGMT defaults to controllable");
eq(ei.sub.ERI.value, null, "no rental lines → ERI null (nothing to sum yet)");
eq([ei.sub.EGI.value, ei.sub.OPEX.value, ei.sub.NOI.value], [null, null, null], "no derived → EGI / OPEX / NOI null");
eq(keysOf(Sheet.buildRows(null, null, {})), keysOf(e), "null record renders the same empty sheet");
eq(keysOf(Sheet.buildRows(undefined, undefined)), keysOf(e), "undefined record + undefined opts render the empty sheet");
const p = Sheet.buildRows({ lines: { VAC: { annual: -60000, source: "manual", updatedAt: M, controllable: true } } }, { egi: -60000, opex: 0, inPlaceNOI: -60000 }, {});
eq(keysOf(p), ["GPR","VAC","=ERI","=EGI","RET","INS","MGMT","=OPEX","=NOI"], "only VAC present: GPR still drawn, no other-income rows");
eq(index(p).sub.ERI.value, -60000, "ERI sums only the rental lines that exist (VAC alone → -60,000)");
eq(index(p).sub.NOI.value, -60000, "a negative NOI from derived is shown as-is");
const q = Sheet.buildRows({ lines: { "TRSH RUB": { annual: 1000, source: "t12", updatedAt: T }, "TRSH COL": { annual: 500, source: "t12", updatedAt: T }, PLL: { annual: 12, source: "t12", updatedAt: T } } }, { egi: 1500, opex: 12, inPlaceNOI: 1488 }, {});
eq(keysOf(q), ["GPR","VAC","=ERI","TRSH RUB","TRSH COL","=EGI","RET","INS","MGMT","PLL","=OPEX","=NOI"], "codes with spaces and the last expense code land in §3 order");
eq(index(q).by["TRSH RUB"].label, "Trash Reimbursements", "'TRSH RUB' label");
eq(index(q).sub.EGI.value, 1500, "EGI from derived when there is other income");

section("buildRows — robustness");
const rec2 = JSON.parse(JSON.stringify(record)); rec2.lines.ZZZ = { annual: 5, controllable: true, source: "manual", updatedAt: M };
const u = Sheet.buildRows(rec2, derived, {});
eq(u[u.length - 1].code, "ZZZ", "an unknown code is shown last, after NOI");
eq([u[u.length - 1].section, u[u.length - 1].role, u[u.length - 1].label], ["unknown", null, "ZZZ"], "unknown code: section 'unknown', no role, label = code");
eq(index(u).sub.ERI.value, 1127999.5, "an unknown code never touches ERI");
eq(keysOf(u).slice(0, -1), keysOf(rows), "the known rows are unaffected by an unknown code");
const rec3 = JSON.parse(JSON.stringify(record)); rec3.lines.GPR.annual = "1,200,000"; rec3.lines.VAC.annual = "junk"; rec3.lines.RET = null;
const r3 = index(Sheet.buildRows(rec3, derived, {}));
eq(r3.by.GPR.annual, 1200000, "a numeric string annual is read like underwriting.js reads cells");
eq([r3.by.VAC.annual, r3.by.VAC.present], [null, true], "a non-numeric annual shows as null but the line stays present");
eq(r3.by.RET.present, false, "a null line entry counts as absent (RET still drawn)");
eq(r3.sub.ERI.value, 1200000 - 12000.5, "ERI skips the unreadable VAC and sums the rest");
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
const count = (s, re) => (s.match(re) || []).length;
eq(count(html, /data-op-code="/g), 9, "one data-op-code row per editable line");
eq(count(html, /data-op-input/g), 9, "one data-op-input per editable row");
eq(count(html, /data-op-ctl/g), 4, "controllable toggle on expense rows only (RET, INS, UTIL, MGMT)");
eq(count(html, /data-op-sub="/g), 4, "four subtotal rows");
eq(count(html, /id="opBasisToggle"/g), 1, "exactly one #opBasisToggle");
ok(html.includes('id="opBasisToggle" data-basis="annual"'), "toggle reports the annual basis");
const at = s => { const i = html.indexOf(s); ok(i >= 0, "markup contains " + s); return i; };
const iG = at('data-op-code="GPR"'), iE = at('data-op-sub="ERI"'), iR = at('data-op-code="RUBS"'), iEG = at('data-op-sub="EGI"'),
      iRET = at('data-op-code="RET"'), iO = at('data-op-sub="OPEX"'), iN = at('data-op-sub="NOI"');
ok(iG < iE && iE < iR && iR < iEG && iEG < iRET && iRET < iO && iO < iN, "markup order: GPR < ERI < RUBS < EGI < RET < OPEX < NOI");
ok(html.includes('value="1,200,000.00"'), "GPR input value 1,200,000.00");
ok(html.includes('value="-12,000.50"'), "CONC input value -12,000.50");
ok(html.includes("data-op-source>T12<") && html.includes("data-op-source>Manual<") && html.includes("data-op-source>Budget<"), "T12 / Manual / Budget badges");
ok(html.includes(">2025-07-01<") && html.includes(">2026-09-01<"), "last-updated dates rendered");
ok(html.includes('<input type="checkbox" data-op-ctl aria-label="Controllable: Real Estate Taxes">'), "RET toggle unchecked and enabled");
ok(html.includes('<input type="checkbox" data-op-ctl checked aria-label="Controllable: Insurance">'), "INS toggle checked");
ok(html.includes("Test Gardens") && html.includes("T12 ending 2025-06-30") && html.includes("100 units"), "record name, period and units shown");
ok(html.includes("<tbody>") && html.includes("</table>"), "a table is rendered");
const mhtml = Sheet.toHtml(mrows, { basis: "monthly", record });
ok(mhtml.includes('data-basis="monthly"') && mhtml.includes('aria-pressed="true"'), "monthly toggle state");
ok(mhtml.includes('value="100,000.00"') && mhtml.includes('value="8,333.33"') && mhtml.includes('value="-5,000.00"'), "monthly inputs show ÷12 values to the cent");
ok(mhtml.includes(">Monthly $<") && html.includes(">Annual $<"), "column header names the basis");
const ehtml = Sheet.toHtml(e, { basis: "annual", record: null });
eq(count(ehtml, /data-op-present="0"/g), 5, "the five always-rows are marked not present on an empty sheet");
eq(count(ehtml, /data-op-ctl disabled/g), 3, "toggles disabled on the three absent expense rows");
eq(count(ehtml, />not set</g), 5, "absent rows carry a 'not set' badge");
ok(ehtml.includes('value=""'), "absent rows render an empty input");
ok(ehtml.includes("No operating record yet"), "empty-record hint shown without a record");
const xr = Sheet.buildRows({ lines: { GPR: { annual: 1, source: "<b>x</b>", updatedAt: T, note: "a<b" } } }, null, {});
const xh = Sheet.toHtml(xr, { basis: "annual", record: { propertyName: "<script>alert(1)</script>", period: 'x" onmouseover="y' } });
ok(!xh.includes("<script>") && xh.includes("&lt;script&gt;"), "property name is HTML-escaped");
ok(!xh.includes("<b>x</b>") && xh.includes("&lt;b&gt;x&lt;/b&gt;"), "an unrecognised source string is escaped");
ok(!xh.includes('x" onmouseover'), "attribute-breaking quotes are escaped");
throws(() => Sheet.toHtml(rows, { basis: "quarterly" }), /basis/, "toHtml rejects an invalid basis");

section("render — guard (DOM behaviour is e2e-tested)");
throws(() => Sheet.render(null, { record, derived }), /mountEl/, "render(null) throws a clear error naming mountEl");
throws(() => Sheet.render(undefined, {}), /mountEl/, "render(undefined) throws");
throws(() => Sheet.render({}, { record }), /mountEl/, "render({}) — not an element — throws");
throws(() => Sheet.render("opSheetMount", {}), /mountEl/, "render(\"id\") — a string — throws");
eq(typeof Sheet.render, "function", "render is exported");

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
