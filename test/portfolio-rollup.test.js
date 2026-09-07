/* Portfolio roll-up — node test (plain node, no framework).
   run:  /opt/node22/bin/node test/portfolio-rollup.test.js
   Every expected figure below is hand-computed from the fixture numbers
   (see the arithmetic in the comments); nothing is read back from the module.
   The calc engine is a FAKE implementing exactly contract §4's three calls
   (effectiveNOI / derive / stack) with hand-set NOIs, plus — when
   operating-calc.js exists at test time — an integration block against the
   real engine. */
"use strict";
const fs = require("fs"), path = require("path");

let fails = 0, count = 0;
function ok(cond, msg){ count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; }
function cents(a, b){ return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005; }
function approx(a, b, eps){ return typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps == null ? 1e-9 : eps) * Math.max(1, Math.abs(b)); }
function section(name, fn){ console.log("\n" + name); try { fn(); } catch (e) { ok(false, "threw: " + (e && e.stack || e)); } }
function freeze(o){ if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => freeze(o[k])); } return o; }
const clone = o => JSON.parse(JSON.stringify(o));

// ---- fixtures ---------------------------------------------------------------
const GD = { vacancyPct: 0.05, mgmtPct: 0.025, reservePerUnit: 200, budget: {},
  sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30 } };
const K = { avalon: "addr:white plains, ny", weaver: "addr:308 finn ln, florence, ky 41042",
  mlofts: "addr:1107 mississippi ave, st. louis, mo 63104", zeta: "name:zeta court", lease: "addr:9 lease up way", orphan: "name:orphan record" };
const L = {
  avSr:   { _id: "l-av-sr",  propertyName: "Avalon White Plains", propertyAddress: "White Plains, NY", maturityDate: "2029-02-10" },
  avMz:   { _id: "l-av-mz",  propertyName: "Avalon WP (Mezz)",    propertyAddress: "White Plains, NY", lienPosition: "Mezzanine", maturityDate: "2028-02-10" },   // mezz matures a year earlier — the row must pick it
  weaver: { _id: "l-weaver", propertyName: "Weaver Mill",  propertyAddress: "308 Finn Ln, Florence, KY 41042", maturityDate: "2030-12-01" },
  mlofts: { _id: "l-mlofts", propertyName: "M Lofts",      propertyAddress: "1107 Mississippi Ave, St. Louis, MO 63104", maturityDate: "2027-05-01" },
  zeta:   { _id: "l-zeta",   propertyName: "Zeta Court",   propertyAddress: "",  maturityDate: "" },                          // no address → name key; no maturity
  lease:  { _id: "l-lease",  propertyName: "Lease-Up Lofts", propertyAddress: "9 Lease Up Way", maturityDate: "2031-06-15T00:00:00.000Z" }   // full timestamp → normalized to the day
};
// Hand-set debt figures per loan (what the app's hooks would return).
const DS  = { "l-av-sr": 5145600, "l-av-mz": 1646400, "l-weaver": 400000, "l-mlofts": 360000, "l-zeta": 12000, "l-lease": 60000 };
const BAL = { "l-av-sr": 96000000, "l-av-mz": 24000000, "l-weaver": 8000000, "l-mlofts": 6370000, "l-zeta": 100000, "l-lease": 1000000 };
const CAP = { "l-av-sr": 0.055, "l-av-mz": 0.12, "l-weaver": 0.06, "l-mlofts": 0.06, "l-zeta": 0.06, "l-lease": 0.06 };
const line = (annual, ctl) => ({ annual, prevAnnual: null, controllable: ctl !== false, source: "manual", updatedAt: "2026-09-01T00:00:00.000Z", note: null });
const meta = { createdAt: "2026-09-01T00:00:00.000Z", lastUpdated: "2026-09-01T00:00:00.000Z", sourceFile: null };
const REC = {};
REC[K.avalon] = { propKey: K.avalon, propertyName: "", units: 400, period: null, lines: { GPR: line(20000000), RET: line(3000000, false) }, assumptions: null, meta };   // no record name → the SENIOR's name
REC[K.weaver] = { propKey: K.weaver, propertyName: "Weaver Mill Apartments", units: 120, period: null, lines: { GPR: line(1000000) }, assumptions: null, meta };   // record name wins over the loan's
REC[K.lease]  = { propKey: K.lease, propertyName: "Lease-Up Lofts", units: 80, period: null, lines: { GPR: line(100000), RET: line(150000, false) }, assumptions: null, meta };
REC[K.orphan] = { propKey: K.orphan, propertyName: "Orphan Record", units: 10, period: null, lines: {}, assumptions: null, meta };   // record, no loans, no lines
// Hand-set NOIs the fake engine returns per property (in-place / underwritten).
const NOI = {}; NOI[K.avalon] = 12000000; NOI[K.weaver] = 815000; NOI[K.lease] = -50000;
const UW  = {}; UW[K.avalon]  = 11500000; UW[K.weaver]  = 795750; UW[K.lease]  = -40000;
// Mezz listed BEFORE its senior on purpose: senior-first order must come from the hook, not from the array.
const LOANS = [L.avMz, L.lease, L.zeta, L.mlofts, L.avSr, L.weaver];

// The app's §1 key + senior-first grouping, as the orchestrator's bridge provides them.
const keyOf = l => { const a = String(l.propertyAddress || "").trim().toLowerCase(); return a ? "addr:" + a : "name:" + String(l.propertyName || l._id || "").trim().toLowerCase(); };
const isMezz = l => l.lienPosition === "Mezzanine" || /\(\s*mezz/i.test(String(l.propertyName || ""));
function hooksFor(loans, over){
  return Object.assign({
    propertyKey: keyOf,
    loansForProperty: l => loans.filter(x => keyOf(x) === keyOf(l)).sort((x, y) => (isMezz(x) ? 1 : 0) - (isMezz(y) ? 1 : 0)),
    annualDebtService: l => DS[l._id], currentBalance: l => BAL[l._id], capRate: l => CAP[l._id],
    marketRate: () => null, loans: () => loans, today: () => new Date("2026-09-07T00:00:00Z"), globalDefaults: () => GD
  }, over || {});
}
// The FAKE engine: exactly the three §4 calls, with spies so the test can see
// which loans the roll-up handed to stack() and which defaults to derive().
function fakeCalc(noiTable, uwTable){
  const calls = { effectiveNOI: [], derive: [], stack: [] };
  const noiOf = r => (r && r.lines && Object.keys(r.lines).length) ? noiTable[r.propKey] : null;
  return { calls,
    effectiveNOI(r){ calls.effectiveNOI.push(r.propKey); return noiOf(r); },
    derive(r, gd){ calls.derive.push({ key: r.propKey, gd }); return { inPlaceNOI: noiOf(r), underwrittenNOI: uwTable[r.propKey], egi: null, opex: null, worksheet: null, sizing: null, assumptions: gd }; },
    stack(r, loans, hooks){
      calls.stack.push({ key: r.propKey, ids: loans.map(l => l._id) });
      const noi = noiOf(r); let ds = 0, bal = 0;
      loans.forEach(l => { ds += hooks.annualDebtService(l); bal += hooks.currentBalance(l); });
      const cap = loans.length ? hooks.capRate(loans[0]) : null, value = (noi > 0 && cap > 0) ? noi / cap : null;
      return { annualDS: ds, balance: bal, value, dscr: (noi > 0 && ds > 0) ? noi / ds : null, dy: (noi > 0 && bal > 0) ? noi / bal : null, ltv: (value > 0 && bal > 0) ? bal / value : null };
    } };
}

const PR = require(path.join(__dirname, "..", "portfolio-rollup.js"));
let fake = fakeCalc(NOI, UW);
global.OperatingCalc = fake;   // the module resolves root.OperatingCalc at call time
const byKey = rows => { const m = {}; rows.forEach(r => { m[r.propKey] = r; }); return m; };

let out, R;
section("buildRows — grouping, senior+mezz collapse, names, units, counts", () => {
  out = PR.buildRows(REC, LOANS, hooksFor(LOANS), GD); R = byKey(out.rows);
  ok(out.rows.length === 6, "6 rows: 5 properties with loans + 1 record-only (got " + out.rows.length + ")");
  ok(out.rows.filter(r => r.propKey === K.avalon).length === 1, "Avalon senior + mezz collapse into ONE row");
  ok(!out.rows.some(r => /Mezz/i.test(r.name)), "no row is named after the mezz");
  ok(R[K.avalon].loans === 2, "Avalon row counts 2 loans");
  ok(R[K.avalon].name === "Avalon White Plains", "record without a name → the SENIOR loan's name (got " + JSON.stringify(R[K.avalon].name) + ")");
  ok(R[K.weaver].name === "Weaver Mill Apartments", "record.propertyName wins over the loan's name");
  ok(R[K.mlofts].name === "M Lofts" && R[K.zeta].name === "Zeta Court", "loan-only rows are named by their loan");
  ok(R[K.orphan].name === "Orphan Record" && R[K.orphan].loans === 0, "record-only property appears with 0 loans");
  ok(R[K.avalon].units === 400 && R[K.weaver].units === 120 && R[K.orphan].units === 10, "units come from the record");
  ok(R[K.mlofts].units === null && R[K.zeta].units === null, "loan-only rows have units null");
  const av = fake.calls.stack.find(c => c.key === K.avalon);
  ok(av && av.ids.join(",") === "l-av-sr,l-av-mz", "stack() got BOTH Avalon loans, senior first (got " + (av && av.ids.join(",")) + ")");
  ok(fake.calls.stack.filter(c => c.key === K.avalon).length === 1, "stack() called once per property");
  ok(!fake.calls.effectiveNOI.includes(K.mlofts) && !fake.calls.stack.some(c => c.key === K.mlofts), "no calc call for a property without a record");
});

section("combined position — Avalon dscr/dy/ltv on the SUMMED debt service / balance", () => {
  const a = R[K.avalon];
  ok(cents(a.noi, 12000000), "noi = 12,000,000.00 (effectiveNOI)");
  ok(cents(a.uwNoi, 11500000), "uwNoi = 11,500,000.00 (derive().underwrittenNOI)");
  ok(cents(a.annualDS, 6792000), "annualDS = 5,145,600 + 1,646,400 = 6,792,000.00 (got " + a.annualDS + ")");
  ok(cents(a.balance, 120000000), "balance = 96,000,000 + 24,000,000 = 120,000,000.00 (got " + a.balance + ")");
  ok(approx(a.dscr, 1.76678445, 1e-7) && a.dscr === 12000000 / 6792000, "dscr = 12,000,000 / 6,792,000 = 1.76678445 (got " + a.dscr + ")");
  ok(a.dy === 0.1, "dy = 12,000,000 / 120,000,000 = 0.10 exactly (got " + a.dy + ")");
  ok(approx(a.ltv, 0.55, 1e-12), "ltv = 120,000,000 / (12,000,000 / 0.055) = 0.55 (got " + a.ltv + ")");
  // NOT what a per-loan read would give: senior alone would be 12,000,000 / 5,145,600 = 2.33
  ok(a.dscr < 2, "dscr is the stack's, not the senior's alone (2.33)");
});

section("single loan, loan-only, record-only, negative NOI", () => {
  const w = R[K.weaver];
  ok(cents(w.noi, 815000) && cents(w.uwNoi, 795750), "Weaver noi 815,000.00 / uwNoi 795,750.00");
  ok(cents(w.annualDS, 400000) && cents(w.balance, 8000000), "Weaver annualDS 400,000.00 / balance 8,000,000.00");
  ok(w.dscr === 2.0375, "Weaver dscr = 815,000 / 400,000 = 2.0375 exactly (got " + w.dscr + ")");
  ok(w.dy === 0.101875, "Weaver dy = 815,000 / 8,000,000 = 0.101875 exactly (got " + w.dy + ")");
  ok(approx(w.ltv, 0.58895706, 1e-7), "Weaver ltv = 8,000,000 / (815,000 / 0.06) = 0.58895706 (got " + w.ltv + ")");
  const m = R[K.mlofts];
  ok(m.noi === null && m.uwNoi === null, "loan-only: noi and uwNoi are null (not 0, not NaN)");
  ok(m.dscr === null && m.dy === null && m.ltv === null, "loan-only: ratios null");
  ok(cents(m.balance, 6370000) && cents(m.annualDS, 360000), "loan-only: balance 6,370,000.00 / annualDS 360,000.00 still shown from the hooks");
  const o = R[K.orphan];
  ok(o.noi === null && o.uwNoi === null, "record with no lines: noi/uwNoi null (derive not used for an empty record)");
  ok(!fake.calls.derive.some(c => c.key === K.orphan), "derive() not called for a record without lines");
  ok(o.balance === 0 && o.annualDS === 0 && o.dscr === null && o.maturity === null, "record-only: no debt, no ratios, no maturity");
  const l = R[K.lease];
  ok(cents(l.noi, -50000) && cents(l.uwNoi, -40000), "negative NOI is shown (−50,000.00 / −40,000.00), never hidden");
  ok(l.dscr === null && l.dy === null && l.ltv === null, "negative NOI → ratios null");
  ok(cents(l.balance, 1000000) && cents(l.annualDS, 60000), "negative NOI still carries its debt figures");
});

section("maturity — earliest among the property's loans", () => {
  ok(R[K.avalon].maturity === "2028-02-10", "Avalon: mezz 2028-02-10 beats senior 2029-02-10 (got " + R[K.avalon].maturity + ")");
  ok(R[K.weaver].maturity === "2030-12-01" && R[K.mlofts].maturity === "2027-05-01", "single-loan properties carry their loan's date");
  ok(R[K.lease].maturity === "2031-06-15", "a full ISO timestamp is normalized to its day (got " + R[K.lease].maturity + ")");
  ok(R[K.zeta].maturity === null, "no maturityDate → null");
  const ties = PR.buildRows({}, [Object.assign({}, L.avMz, { maturityDate: "2029-02-10" }), L.avSr], hooksFor(LOANS), GD).rows[0];
  ok(ties.maturity === "2029-02-10" && ties.loans === 2, "equal dates → that date, still one row");
  const junk = PR.buildRows({}, [{ _id: "j", propertyName: "Junk", maturityDate: "02/10/2029" }, { _id: "j2", propertyName: "Junk", maturityDate: 20290210 }], hooksFor(LOANS), GD).rows[0];
  ok(junk.maturity === null, "non-ISO maturity strings/numbers are ignored, never a NaN date");
});

section("totals", () => {
  const t = out.totals;
  ok(t.properties === 6 && t.loans === 6, "properties 6, loans 2+1+1+0+1+1 = 6 (got " + t.properties + "/" + t.loans + ")");
  ok(cents(t.noi, 12765000), "noi = 12,000,000 + 815,000 − 50,000 = 12,765,000.00 (nulls skipped) (got " + t.noi + ")");
  ok(cents(t.uwNoi, 12255750), "uwNoi = 11,500,000 + 795,750 − 40,000 = 12,255,750.00 (got " + t.uwNoi + ")");
  ok(cents(t.balance, 135470000), "balance = 120,000,000 + 1,000,000 + 6,370,000 + 0 + 8,000,000 + 100,000 = 135,470,000.00 (got " + t.balance + ")");
  ok(cents(t.annualDS, 7624000), "annualDS = 6,792,000 + 60,000 + 360,000 + 0 + 400,000 + 12,000 = 7,624,000.00 (got " + t.annualDS + ")");
  ok(approx(t.dscr, 1.6743179, 1e-7) && t.dscr === 12765000 / 7624000, "dscr = 12,765,000 / 7,624,000 = 1.6743179 (got " + t.dscr + ")");
  ok(approx(t.dy, 0.0942275, 1e-7) && t.dy === 12765000 / 135470000, "dy = 12,765,000 / 135,470,000 = 0.0942275 (got " + t.dy + ")");
  const none = PR.buildRows({}, [L.mlofts, L.zeta], hooksFor(LOANS), GD).totals;
  ok(none.noi === null && none.uwNoi === null && none.dscr === null && none.dy === null, "no NOI anywhere → noi/uwNoi/dscr/dy null (unknown ≠ zero)");
  ok(none.balance === 6470000 && none.annualDS === 372000 && none.properties === 2 && none.loans === 2, "…while the debt totals are still summed (6,470,000 / 372,000)");
  const neg = PR.buildRows({ [K.lease]: REC[K.lease] }, [L.lease], hooksFor(LOANS), GD).totals;
  ok(neg.noi === -50000 && neg.dscr === null && neg.dy === null, "Σnoi ≤ 0 → dscr/dy null, noi itself still reported");
  const empty = PR.buildRows({}, [], hooksFor([]), GD);
  ok(empty.rows.length === 0 && empty.totals.properties === 0 && empty.totals.loans === 0 && empty.totals.balance === 0, "empty portfolio → no rows, zero counts, no NaN");
});

section("sorting — by name, deterministic on ties, independent of input order", () => {
  ok(out.rows.map(r => r.name).join(" | ") === "Avalon White Plains | Lease-Up Lofts | M Lofts | Orphan Record | Weaver Mill Apartments | Zeta Court", "rows sorted by name (got " + out.rows.map(r => r.name).join(" | ") + ")");
  const rev = PR.buildRows(Object.fromEntries(Object.keys(REC).reverse().map(k => [k, REC[k]])), LOANS.slice().reverse(), hooksFor(LOANS.slice().reverse()), GD);
  ok(JSON.stringify(rev.rows) === JSON.stringify(out.rows), "reversed loans + reversed records → identical rows");
  const twins = [{ _id: "t2", propertyName: "Twin Oaks", propertyAddress: "2 Twin Rd" }, { _id: "t1", propertyName: "Twin Oaks", propertyAddress: "1 Twin Rd" }];
  const a = PR.buildRows({}, twins, hooksFor(twins), GD).rows.map(r => r.propKey).join(",");
  const b = PR.buildRows({}, twins.slice().reverse(), hooksFor(twins), GD).rows.map(r => r.propKey).join(",");
  ok(a === "addr:1 twin rd,addr:2 twin rd" && a === b, "equal names → ordered by propKey, whichever came first");
  const mixed = [{ _id: "m1", propertyName: "beta" }, { _id: "m2", propertyName: "Alpha" }, { _id: "m3", propertyName: "Gamma" }];
  ok(PR.buildRows({}, mixed, hooksFor(mixed), GD).rows.map(r => r.name).join(",") === "Alpha,beta,Gamma", "case-insensitive sort");
});

section("inputs are never mutated; store never touched", () => {
  const loansF = freeze(clone(LOANS)), recF = freeze(clone(REC));
  const snapL = JSON.stringify(loansF), snapR = JSON.stringify(recF);
  let threw = null;
  try { PR.buildRows(recF, loansF, hooksFor(loansF), freeze(clone(GD))); } catch (e) { threw = e; }
  ok(!threw, "runs on deep-frozen loans/records/defaults (a write would throw in strict mode)" + (threw ? " — " + threw.message : ""));
  ok(JSON.stringify(loansF) === snapL && JSON.stringify(recF) === snapR, "loans and records byte-identical after buildRows");
  ok(!fs.readFileSync(path.join(__dirname, "..", "portfolio-rollup.js"), "utf8").includes("localStorage"), "module never references localStorage");
});

section("inputs: records as array, loans/defaults from hooks, NaN guards, errors", () => {
  const arr = PR.buildRows(Object.keys(REC).map(k => REC[k]), LOANS, hooksFor(LOANS), GD);
  ok(JSON.stringify(arr) === JSON.stringify(out), "records given as an array → same result as the map");
  const viaHooks = PR.buildRows(REC, null, hooksFor(LOANS), GD);
  ok(JSON.stringify(viaHooks) === JSON.stringify(out), "loans omitted → hooks.loans()");
  fake.calls.derive.length = 0;
  PR.buildRows(REC, LOANS, hooksFor(LOANS));
  ok(fake.calls.derive.length === 3 && fake.calls.derive.every(c => c.gd === GD), "globalDefaults omitted → hooks.globalDefaults() handed to derive()");
  const gd2 = { vacancyPct: 0.07 };
  PR.buildRows(REC, LOANS, hooksFor(LOANS), gd2);
  ok(fake.calls.derive.slice(-3).every(c => c.gd === gd2), "explicit globalDefaults handed to derive() as given");
  // an engine returning garbage must not leak NaN/undefined/strings into a row
  global.OperatingCalc = { effectiveNOI: () => NaN, derive: () => ({ underwrittenNOI: undefined }), stack: () => ({ dscr: NaN, dy: undefined, ltv: "0.5", balance: Infinity, annualDS: null }) };
  const g = PR.buildRows({ [K.weaver]: REC[K.weaver] }, [L.weaver, L.mlofts], hooksFor(LOANS, { currentBalance: l => (l._id === "l-mlofts" ? undefined : BAL[l._id]), annualDebtService: l => (l._id === "l-mlofts" ? NaN : DS[l._id]) }), GD);
  const w = byKey(g.rows)[K.weaver], m = byKey(g.rows)[K.mlofts];
  ok(w.noi === null && w.uwNoi === null && w.dscr === null && w.dy === null && w.ltv === null && w.balance === null && w.annualDS === null, "non-finite / non-number engine outputs → null, never NaN");
  ok(m.balance === 0 && m.annualDS === 0, "loan-only sums treat an unknown hook value as 0, not NaN");
  ok([g.totals.noi, g.totals.uwNoi, g.totals.dscr, g.totals.dy].every(v => v === null) && g.totals.balance === 0 && g.totals.annualDS === 0, "totals stay null/finite");
  ok(!JSON.stringify(g).includes("null,null,null,null,null,null,null,null,null,null,null,null"), "sanity: rows still carry their keys/names");
  global.OperatingCalc = fake;
  let err = null; try { PR.buildRows(REC, LOANS, {}, GD); } catch (e) { err = e; }
  ok(err && /propertyKey/.test(err.message), "missing hooks.propertyKey → clear error");
  ok(JSON.stringify(PR.buildRows(REC, LOANS, hooksFor(LOANS, { loansForProperty: undefined }), GD).rows.find(r => r.propKey === K.avalon).loans) === "2", "no loansForProperty hook → still one row per key (order = as given)");
});

section("render — table, data-op-prop, formatting, totals row, idempotent re-render, onOpen", () => {
  const mount = () => ({ innerHTML: "", _l: {}, addEventListener(t, f){ (this._l[t] = this._l[t] || []).push(f); } });
  const m = mount(); let opened = [];
  PR.render(m, out, { onOpen: k => opened.push(k) });
  const html = m.innerHTML;
  ok((html.match(/<tr data-op-prop="/g) || []).length === 6, "6 rows marked data-op-prop");
  ok(html.includes('data-op-prop="' + K.avalon + '"') && html.includes('data-op-prop="' + K.zeta + '"'), "data-op-prop carries the propKey verbatim");
  const rowHtml = key => { const i = html.indexOf('data-op-prop="' + key + '"'); return html.slice(i, html.indexOf("</tr>", i)); };
  const av = rowHtml(K.avalon);
  ok(av.includes(">Avalon White Plains<") && av.includes(">400<") && av.includes(">2<"), "Avalon: name, 400 units, 2 loans");
  ok(av.includes(">$12,000,000.00<") && av.includes(">$11,500,000.00<"), "Avalon: NOI / UW NOI money to 2 decimals");
  ok(av.includes(">$120,000,000.00<") && av.includes(">$6,792,000.00<"), "Avalon: balance / annual DS");
  ok(av.includes(">1.77×<"), "Avalon: DSCR 1.7668 → 1.77×");
  ok(av.includes(">10.00%<") && av.includes(">55.00%<"), "Avalon: DY 10.00%, LTV 55.00%");
  ok(av.includes(">02/10/2028<"), "Avalon: earliest maturity shown 02/10/2028");
  const ml = rowHtml(K.mlofts);
  ok((ml.match(/>—</g) || []).length === 6, "loan-only row: units, NOI, UW NOI, DSCR, DY, LTV are all — (6 dashes, got " + (ml.match(/>—</g) || []).length + ")");
  ok(ml.includes(">$6,370,000.00<") && ml.includes(">$360,000.00<") && ml.includes(">05/01/2027<"), "loan-only row still shows balance, DS, maturity");
  const le = rowHtml(K.lease);
  ok(le.includes(">-$50,000.00<") && le.includes(">-$40,000.00<"), "negative money rendered -$50,000.00");
  const ti = html.indexOf("data-op-total"), tot = html.slice(ti, html.indexOf("</tr>", ti));
  ok(tot.includes("6 properties") && tot.includes(">6<"), "totals row: 6 properties, 6 loans");
  ok(tot.includes(">$12,765,000.00<") && tot.includes(">$12,255,750.00<") && tot.includes(">$135,470,000.00<") && tot.includes(">$7,624,000.00<"), "totals row money");
  ok(tot.includes(">1.67×<") && tot.includes(">9.42%<"), "totals row DSCR 1.67× / DY 9.42%");
  ok(html.indexOf("data-op-total") > html.lastIndexOf("data-op-prop="), "totals row comes last");
  ok(!/NaN|undefined/.test(html), "no NaN / undefined anywhere in the markup");
  // click → onOpen(propKey), via the delegated handler
  const ev = key => ({ target: { closest: sel => (sel === "tr[data-op-prop]" ? { getAttribute: () => key } : null) } });
  m._l.click[0](ev(K.weaver));
  ok(opened.join() === K.weaver, "click on a row → onOpen(propKey)");
  m._l.click[0]({ target: { closest: () => null } });
  ok(opened.length === 1, "click outside a row → nothing");
  const kd = Object.assign(ev(K.zeta), { key: "Enter", pd: 0, preventDefault(){ this.pd++; } });
  m._l.keydown[0](kd);
  ok(opened[1] === K.zeta && kd.pd === 1, "Enter on a focused row → onOpen, default prevented");
  m._l.keydown[0](Object.assign(ev(K.zeta), { key: "a", preventDefault(){ ok(false, "preventDefault on an unrelated key"); } }));
  ok(opened.length === 2, "other keys ignored");
  // idempotent: re-render twice with a new callback — one listener, latest callback, one table
  let opened2 = [];
  PR.render(m, out, { onOpen: k => opened2.push(k) }); PR.render(m, out, { onOpen: k => opened2.push(k) });
  ok(m._l.click.length === 1 && m._l.keydown.length === 1, "re-render never stacks listeners");
  m._l.click[0](ev(K.avalon));
  ok(opened2.join() === K.avalon && opened.length === 2, "re-render uses the latest onOpen");
  ok((m.innerHTML.match(/<table/g) || []).length === 1 && (m.innerHTML.match(/<tr data-op-prop="/g) || []).length === 6, "re-render replaces the table (one table, 6 rows)");
  // escaping + empty states
  const e = mount();
  PR.render(e, { rows: [{ propKey: 'addr:x"y', name: '<b>&"Evil"</b>', units: null, noi: null, uwNoi: null, dscr: null, dy: null, ltv: null, balance: null, annualDS: null, maturity: null, loans: 1 }], totals: { properties: 1, loans: 1, noi: null, uwNoi: null, balance: 0, annualDS: 0, dscr: null, dy: null } }, {});
  ok(e.innerHTML.includes("&lt;b&gt;&amp;&quot;Evil&quot;&lt;/b&gt;") && !e.innerHTML.includes("<b>"), "property name is HTML-escaped");
  ok(e.innerHTML.includes('data-op-prop="addr:x&quot;y"'), "propKey attribute is escaped");
  ok(e.innerHTML.includes("1 property<"), "singular 'property' in the totals label");
  PR.render(e, { rows: [], totals: out.totals && PR.buildRows({}, [], hooksFor([]), GD).totals }, {});
  ok(e.innerHTML.includes("No properties yet") && !e.innerHTML.includes("data-op-prop="), "empty portfolio → empty-state row, no data-op-prop");
  PR.render(e, null, null);
  ok(e.innerHTML.includes("No properties yet"), "render(mount, null) does not throw");
  PR.render(null, out, {});
  ok(true, "render(null mount) is a no-op");
});

section("formatters", () => {
  const f = PR.fmt;
  ok(f.money(1234.5) === "$1,234.50" && f.money(0) === "$0.00" && f.money(-1234567.891) === "-$1,234,567.89", "money: grouping, 2 decimals, sign");
  ok(f.money(-0.001) === "$0.00", "money: a rounding-to-zero negative is not -$0.00");
  ok(f.money(null) === "—" && f.money(NaN) === "—" && f.money("12") === "—" && f.money(Infinity) === "—", "money: null/NaN/string/Infinity → —");
  ok(f.pct(0.0815) === "8.15%" && f.pct(0.55) === "55.00%" && f.pct(null) === "—", "pct");
  ok(f.ratio(1.4818) === "1.48×" && f.ratio(2.0375) === "2.04×" && f.ratio(null) === "—", "ratio (DSCR)");
  ok(f.int(400) === "400" && f.int(null) === "—" && f.int(NaN) === "—", "int");
  ok(f.day("2029-02-10") === "02/10/2029" && f.day("2031-06-15T00:00:00.000Z") === "06/15/2031" && f.day(null) === "—" && f.day("junk") === "—", "day");
});

// ---- integration against the REAL engine (only if it exists at test time) --
section("integration — real OperatingCalc (operating-calc.js)", () => {
  const realPath = path.join(__dirname, "..", "operating-calc.js");
  if (!fs.existsSync(realPath)) { console.log("  integration: skipped — operating-calc.js not present at test time (fake OperatingCalc only)"); return; }
  delete global.OperatingCalc;   // exercise the module's require() fallback
  const loans = [
    { _id: "i-mz", propertyName: "Weaver Mill (Mezz)", propertyAddress: "308 Finn Ln", lienPosition: "Mezzanine", maturityDate: "2029-01-01" },
    { _id: "i-sr", propertyName: "Weaver Mill", propertyAddress: "308 Finn Ln", maturityDate: "2030-12-01" },
    { _id: "i-only", propertyName: "Loan Only", propertyAddress: "1 Only St", maturityDate: "2027-01-01" },
    { _id: "i-ov", propertyName: "Override Court", propertyAddress: "5 Override Ave", maturityDate: "2032-03-01" }
  ];
  const ds = { "i-sr": 400000, "i-mz": 150000, "i-only": 90000, "i-ov": 300000 }, bal = { "i-sr": 8000000, "i-mz": 2000000, "i-only": 1500000, "i-ov": 5000000 }, cap = { "i-sr": 0.06, "i-mz": 0.12, "i-only": 0.07, "i-ov": 0.065 };
  const hooks = hooksFor(loans, { annualDebtService: l => ds[l._id], currentBalance: l => bal[l._id], capRate: l => cap[l._id] });
  // Lines (annual, §2 signs): GPR 1,000,000 · VAC −50,000 · RUBS 20,000 · RET 100,000 · INS 30,000 · MGMT 25,000
  //   in-place NOI  = 1,000,000 − 50,000 + 20,000 − 100,000 − 30,000 − 25,000 = 815,000
  //   underwritten (units 100, defaults 5% vac / 2.5% mgmt / $200 reserves, budget {} → INS passes through):
  //     ERI 1,000,000 − 5%·1,000,000 = 950,000 ; EGI = 970,000 ; opex = 100,000 + 30,000 + 2.5%·970,000 (24,250) = 154,250 ; reserves 20,000
  //     NOI = 970,000 − 154,250 − 20,000 = 795,750
  const lines = () => ({ GPR: line(1000000), VAC: line(-50000), RUBS: line(20000), RET: line(100000, false), INS: line(30000, false), MGMT: line(25000) });
  const recs = {
    "addr:308 finn ln": { propKey: "addr:308 finn ln", propertyName: "Weaver Mill", units: 100, period: "T12 ending 2026-06-30", lines: lines(), assumptions: null, meta },
    // vacancy overridden to 10%: ERI 900,000 ; EGI 920,000 ; mgmt 23,000 ; opex 153,000 ; NOI = 920,000 − 153,000 − 20,000 = 747,000 (in-place unchanged)
    "addr:5 override ave": { propKey: "addr:5 override ave", propertyName: "Override Court", units: 100, period: null, lines: lines(), assumptions: { vacancyPct: 0.10 }, meta }
  };
  let res; try { res = PR.buildRows(recs, loans, hooks, GD); } catch (e) { ok(false, "real engine threw: " + (e && e.stack || e)); return; }
  console.log("  integration: real OperatingCalc exercised (" + realPath + ")");
  const r = byKey(res.rows), w = r["addr:308 finn ln"], o = r["addr:1 only st"], v = r["addr:5 override ave"];
  ok(res.rows.length === 3 && res.rows.map(x => x.name).join(",") === "Loan Only,Override Court,Weaver Mill", "3 rows sorted by name (got " + res.rows.map(x => x.name).join(",") + ")");
  ok(w && w.loans === 2 && w.name === "Weaver Mill", "senior + mezz → one row named for the senior");
  ok(w && cents(w.noi, 815000), "in-place NOI = 815,000.00 (got " + (w && w.noi) + ")");
  ok(w && cents(w.uwNoi, 795750), "underwritten NOI = 795,750.00 (got " + (w && w.uwNoi) + ")");
  ok(w && cents(w.annualDS, 550000) && cents(w.balance, 10000000), "stack annualDS 550,000.00 / balance 10,000,000.00 (got " + (w && w.annualDS) + " / " + (w && w.balance) + ")");
  ok(w && approx(w.dscr, 1.48181818, 1e-7), "stack dscr = 815,000 / 550,000 = 1.48181818 (got " + (w && w.dscr) + ")");
  ok(w && approx(w.dy, 0.0815, 1e-12), "stack dy = 815,000 / 10,000,000 = 0.0815 (got " + (w && w.dy) + ")");
  ok(w && approx(w.ltv, 0.73619632, 1e-7), "stack ltv = 10,000,000 / (815,000 / 0.06) = 0.73619632 (got " + (w && w.ltv) + ")");
  ok(w && w.maturity === "2029-01-01", "earliest maturity is the mezz's 2029-01-01 (got " + (w && w.maturity) + ")");
  ok(v && cents(v.noi, 815000) && cents(v.uwNoi, 747000), "per-property vacancy override → uwNoi 747,000.00, in-place still 815,000.00 (got " + (v && v.uwNoi) + ")");
  ok(v && approx(v.dscr, 815000 / 300000, 1e-12) && approx(v.dy, 0.163, 1e-12) && approx(v.ltv, 0.39877301, 1e-7), "override row ratios: dscr 2.7167, dy 16.3%, ltv 39.88%");
  ok(o && o.noi === null && o.uwNoi === null && o.dscr === null && cents(o.balance, 1500000) && cents(o.annualDS, 90000), "loan-only row next to real-engine rows: NOI null, debt shown");
  const t = res.totals;
  ok(t.properties === 3 && t.loans === 4, "totals: 3 properties, 4 loans");
  ok(cents(t.noi, 1630000) && cents(t.uwNoi, 1542750), "totals noi 1,630,000.00 / uwNoi 1,542,750.00 (got " + t.noi + " / " + t.uwNoi + ")");
  ok(cents(t.balance, 16500000) && cents(t.annualDS, 940000), "totals balance 16,500,000.00 / annualDS 940,000.00");
  ok(approx(t.dscr, 1630000 / 940000, 1e-12) && approx(t.dy, 1630000 / 16500000, 1e-12), "totals dscr 1.7340 / dy 9.88%");
  global.OperatingCalc = fake;
});

console.log("\n" + (fails ? fails + " of " + count + " checks FAILED" : "all " + count + " checks passed"));
process.exit(fails ? 1 : 0);
