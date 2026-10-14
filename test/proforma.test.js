/* Unit checks for proforma.js (next stage F1, draft): the pro forma's Safe and Aggressive versions, every way a line
   can change, the revenue credit, and the reconciliation from the T12 NOI to the pro forma NOI.
   The property is made up, shaped on Azriel's Queens Gate walk-through; every expected figure is worked out by hand
   in the comments, so the test can actually fail.  Run: node test/proforma.test.js */
const PF = require('../proforma.js');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL ' + m); } };
const eq = (a, b) => Math.abs(a - b) < 0.005;

// 12 months, Sep 2025 → Aug 2026. Gross rent: 420,000 a month for 9 months, then 480,000 (occupancy fixed) → 5,220,000.
// Vacancy: −20,000 a month for 9 months, then −5,000 → −195,000.  EGI = 5,025,000.
const months = []; for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(2025, 8 + i, 1)); months.push(d.toISOString().slice(0, 7)); }
const ser = (first9, last3) => { const o = {}; months.forEach((m, i) => { o[m] = i < 9 ? first9 : last3; }); return o; };
const monthly = { GPR: ser(420000, 480000), VAC: ser(-20000, -5000) };
// Expenses: RET 600,000 · INS 150,000 · UTIL 336,000 · PAY 400,000 · GA 87,000 · MKT 99,000 · RM 250,000 · CS 120,000 ·
// MGMT 150,750 (3% of 5,025,000) → 2,192,750.  T12 NOI = 5,025,000 − 2,192,750 = 2,832,250.
const lines = [
  { key: 'GPR', label: 'Gross Potential Rent', section: 'rental', t12: 5220000 },
  { key: 'VAC', label: 'Less: Vacancy Loss', section: 'rental', t12: -195000 },
  { key: 'RET', label: 'Real Estate Taxes', section: 'expense', t12: 600000 },
  { key: 'INS', label: 'Insurance', section: 'expense', t12: 150000 },
  { key: 'UTIL', label: 'Utilities', section: 'expense', t12: 336000 },
  { key: 'PAY', label: 'Payroll', section: 'expense', t12: 400000 },
  { key: 'GA', label: 'General & Admin', section: 'expense', t12: 87000 },
  { key: 'MKT', label: 'Marketing', section: 'expense', t12: 99000 },
  { key: 'RM', label: 'Repairs & Maintenance', section: 'expense', t12: 250000 },
  { key: 'CS', label: 'Contract Services', section: 'expense', t12: 120000 },
  { key: 'MGMT', label: 'Management Fee', section: 'expense', t12: 150750 },
  { key: 'reserves', label: 'Replacement Reserves', section: 'reserve', t12: 0 }
];
const accounts = [
  { name: 'Electric - common areas', line: 'UTIL', amount: 200000 }, { name: 'Electric - vacant units', line: 'UTIL', amount: 8000 },
  { name: 'Gas - vacant units', line: 'UTIL', amount: 4000 }, { name: 'Water & sewer', line: 'UTIL', amount: 124000 },
  { name: 'Travel', line: 'GA', amount: 5000 }, { name: 'Software', line: 'GA', amount: 9000 }, { name: 'Office & admin', line: 'GA', amount: 73000 },
  { name: 'Landscaping project', line: 'CS', amount: 30000 }, { name: 'Dryer vent cleaning', line: 'CS', amount: 15000 },
  { name: 'Snow removal', line: 'CS', amount: 37000 }, { name: 'Other contracts', line: 'CS', amount: 38000 }
];
const catalog = { BD: { label: 'Less: Bad Debt', section: 'rental' }, BDX: { label: 'Bad Debt Expense', section: 'expense' } };
const S = (o) => Object.assign({ by: 'You', at: '2026-10-14T10:00:00Z' }, o);
const base = { months: 3, story: 'Occupancy has run 95%+ for five months; the last three months are the run-rate.' };
const changes = [
  S({ id: 'c1', column: 'both', line: 'GA', how: 'takeOut', accounts: [{ name: 'Travel' }, { name: 'Software' }], kind: 'partnership', story: 'Corporate travel and software, not the building.' }),
  S({ id: 'c2', column: 'both', line: 'CS', how: 'takeOut', accounts: [{ name: 'Landscaping project' }], kind: 'nonRecurring', story: 'A one-time landscaping project.' }),
  S({ id: 'c3', column: 'both', line: 'CS', how: 'spread', years: 3, accounts: [{ name: 'Dryer vent cleaning' }], kind: 'spread', story: 'Done once every three years.' }),
  S({ id: 'c4', column: 'base', line: 'MKT', how: 'total', value: 60000, kind: 'operating', story: 'A smaller listing package now that occupancy is solid.' }),
  S({ id: 'c5', column: 'both', line: 'CS', how: 'accountTotal', value: 20000, accounts: [{ name: 'Snow removal' }], kind: 'normalized', story: 'A once-in-20-years winter.' }),
  S({ id: 'c6', column: 'both', line: 'MGMT', how: 'pctRevenue', pct: 0.03, kind: 'marketNorm', story: 'Management stays 3% of revenue.' }),
  S({ id: 'c7', column: 'aggressive', line: 'UTIL', how: 'takeOut', accounts: [{ name: 'Electric - vacant units' }, { name: 'Gas - vacant units' }], kind: 'operating', story: 'Full now: no vacant units to cool for showings.' }),
  S({ id: 'c8', column: 'aggressive', line: 'MKT', how: 'total', value: 48000, kind: 'operating', story: 'The base listing package.' })
];
const input = { lines, accounts, monthly, months, units: 145, catalog, pf: { revenue: { base }, changes } };
const R = PF.compute(input);

// T12
ok(eq(R.t12.egi, 5025000) && eq(R.t12.opex, 2192750) && eq(R.t12.noi, 2832250), 'T12: EGI 5,025,000 · expenses 2,192,750 · NOI 2,832,250 (got ' + R.t12.noi + ')');
// Safe — revenue credit: GPR 3×480,000×4 = 5,760,000 (+540,000); VAC 3×−5,000×4 = −60,000 (+135,000) → +675,000; EGI 5,700,000.
const B = R.base, A = R.aggressive;
const st = (v, id) => v.steps.find(s => s.id === id) || {};
ok(eq(st(B, 'revenue').effect, 675000) && eq(B.egi, 5700000), 'Safe: revenue credit (T3) adds 675,000; EGI 5,700,000 (got ' + st(B, 'revenue').effect + ', ' + B.egi + ')');
ok(B.revenue && B.revenue.months.join(',') === '2026-06,2026-07,2026-08', 'the revenue credit names the months it used (Jun → Aug 2026)');
ok(eq(st(B, 'c1').effect, 14000) && eq(B.byKey.GA.value, 73000), 'take out Travel + Software: +14,000; G&A 73,000');
ok(eq(st(B, 'c2').effect, 30000), 'take out the landscaping project: +30,000');
ok(eq(st(B, 'c3').effect, 10000), 'dryer vents spread over 3 years: 15,000 → 5,000 a year, +10,000');
ok(eq(st(B, 'c4').effect, 39000) && eq(B.byKey.MKT.value, 60000), 'marketing new total 60,000: +39,000');
ok(eq(st(B, 'c5').effect, 17000) && eq(B.byKey.CS.value, 63000), 'snow removal set to 20,000: +17,000; Contract Services 120,000 − 30,000 − 10,000 − 17,000 = 63,000');
ok(eq(st(B, 'c6').effect, -20250) && eq(B.byKey.MGMT.value, 171000), 'management 3% of the new revenue: 171,000 (−20,250)');
// Safe NOI = 2,832,250 + 675,000 + 14,000 + 30,000 + 10,000 + 39,000 + 17,000 − 20,250 = 3,597,000
ok(eq(B.noi, 3597000) && B.reconciles && eq(B.gap, 0), 'Safe NOI 3,597,000, reconciles to the dollar (got ' + B.noi + ', gap ' + B.gap + ')');
ok(!st(B, 'c7').id && !st(B, 'c8').id, 'Aggressive-only changes are not in the Safe version');
// Aggressive: c4 loses to c8 on Marketing (99,000 → 48,000: +51,000); vacant utilities out (+12,000).
// NOI = 2,832,250 + 675,000 + 14,000 + 30,000 + 10,000 + 17,000 − 20,250 + 12,000 + 51,000 = 3,621,000
ok(!st(A, 'c4').id && eq(st(A, 'c8').effect, 51000) && eq(A.byKey.MKT.value, 48000), 'Aggressive: its own Marketing total wins over the Safe one (99,000 → 48,000, +51,000)');
ok(eq(st(A, 'c7').effect, 12000) && eq(A.byKey.UTIL.value, 324000), 'Aggressive: vacant-unit electric and gas out: 336,000 → 324,000');
ok(eq(A.noi, 3621000) && A.reconciles, 'Aggressive NOI 3,621,000, reconciles (got ' + A.noi + ')');
ok(eq(A.byKey.GA.value, 73000) && eq(A.byKey.CS.value, 63000), 'Aggressive inherits the Safe changes it doesn\'t replace');
// the reconciliation groups
const g = (v, k) => (v.groups.find(x => x.kind === k) || {}).total;
ok(eq(g(B, 'revenue'), 675000) && eq(g(B, 'partnership'), 14000) && eq(g(B, 'nonRecurring'), 30000) && eq(g(B, 'spread'), 10000) && eq(g(B, 'normalized'), 17000) && eq(g(B, 'operating'), 39000) && eq(g(B, 'marketNorm'), -20250),
  'Safe groups: revenue 675,000 · partnership 14,000 · non-recurring 30,000 · spread 10,000 · normalized 17,000 · operating 39,000 · market norm −20,250');
ok(B.groups.map(x => x.kind).join(',') === 'revenue,partnership,nonRecurring,spread,normalized,operating,marketNorm', 'groups in the fixed order');
ok(!B.problems.length && !A.problems.length, 'no problems on a complete pro forma (' + JSON.stringify(B.problems.concat(A.problems)) + ')');
// reserves are not part of the pro forma
ok(!B.byKey.reserves, 'reserves stay out of the pro forma');

// ---- refusals ----
const one = (c, extra) => PF.compute(Object.assign({}, input, { pf: { changes: [c] } }, extra || {})).base;
let r = one(S({ id: 'x1', column: 'both', line: 'MKT', how: 'total', value: 1, kind: 'operating', story: '  ' }));
ok(r.problems.some(p => p.id === 'x1' && /reason/.test(p.reason)) && eq(r.noi, 2832250), 'a change with no story is refused and changes nothing');
r = one(S({ id: 'x2', column: 'both', line: 'MKT', how: 'total', value: 1, kind: 'revenue', story: 's' }));
ok(r.problems.some(p => p.id === 'x2' && /kind/.test(p.reason)), 'a change with no kind (or the revenue kind) is refused');
r = one(S({ id: 'x3', column: 'both', line: 'GPR', how: 'pctRevenue', pct: 0.5, kind: 'marketNorm', story: 's' }));
ok(r.problems.some(p => p.id === 'x3') && eq(r.noi, 2832250), 'gross rent can\'t be a % of revenue');
r = one(S({ id: 'x4', column: 'both', line: 'CS', how: 'takeOut', accounts: [{ name: 'Pool lifeguards' }], kind: 'nonRecurring', story: 's' }));
ok(r.problems.some(p => p.id === 'x4' && p.stale) && r.stale.length === 1 && eq(r.noi, 2832250), 'an account no longer in the T12 is marked, left out, never dropped quietly');
r = one(S({ id: 'x5', column: 'both', line: 'PAY', how: 'perUnit', perUnit: 2000, kind: 'marketNorm', story: 's' }), { units: 145 });
ok(eq(r.byKey.PAY.value, 290000) && eq(st(r, 'x5').effect, 110000), 'per unit: $2,000 × 145 units = 290,000 (+110,000)');
r = one(S({ id: 'x6', column: 'both', line: 'PAY', how: 'perUnit', perUnit: 2000, kind: 'marketNorm', story: 's' }), { units: null });
ok(r.problems.some(p => p.id === 'x6' && /units/.test(p.reason)), 'per unit without units is refused');
r = one(S({ id: 'x7', column: 'both', line: 'RM', how: 'spread', years: 2, kind: 'spread', story: 's' }));
ok(eq(r.byKey.RM.value, 125000), 'a whole line spread over 2 years: 250,000 → 125,000');
r = one(S({ id: 'x8', column: 'both', line: 'BDX', how: 'pctRevenue', pct: 0.01, kind: 'marketNorm', story: 'Market norm 1%.' }));
ok(r.byKey.BDX && r.byKey.BDX.added && eq(r.byKey.BDX.value, 50250) && eq(r.noi, 2832250 - 50250), 'a line the T12 lacks (bad debt expense) is added at 1% of EGI = 50,250');
r = PF.compute(Object.assign({}, input, { pf: { changes: [S({ id: 'y1', column: 'both', line: 'CS', how: 'takeOut', accounts: [{ name: 'Snow removal' }], kind: 'nonRecurring', story: 's' }), S({ id: 'y2', column: 'both', line: 'CS', how: 'total', value: 100000, kind: 'operating', story: 's' })] } })).base;
ok(r.problems.some(p => p.id === 'y1' && p.soft) && eq(r.byKey.CS.value, 100000) && r.reconciles, 'a new total on a line closes its account changes (and still reconciles)');
// T6
r = PF.compute(Object.assign({}, input, { pf: { revenue: { base: { months: 6, story: 's' } }, changes: [] } })).base;
// GPR 3×420,000 + 3×480,000 = 2,700,000 × 2 = 5,400,000 (+180,000); VAC (3×−20,000 + 3×−5,000) × 2 = −150,000 (+45,000)
ok(eq(st(r, 'revenue').effect, 225000), 'T6 revenue credit: +225,000');
r = PF.compute(Object.assign({}, input, { months: months.slice(0, 2), pf: { revenue: { base: { months: 3, story: 's' } }, changes: [] } })).base;
ok(r.problems.some(p => p.id === 'revenue') && eq(r.noi, 2832250), 'a revenue credit needs that many dated months');

// ---- accounts on the T12 rule's basis ----
const rows = [{ name: 'Snow removal', amount: 37000, monthly: ser(0, 12000) }, { name: 'Gross rent', amount: 5220000, monthly: monthly.GPR }];
const lineOf = (row) => row.name === 'Snow removal' ? 'CS' : 'GPR';
let acc = PF.accountsFrom(rows, lineOf, { applied: false });
ok(acc[0].line === 'CS' && eq(acc[0].amount, 37000), 'a 12-month statement: an account is its 12-month total');
acc = PF.accountsFrom(rows, lineOf, { applied: true, monthsUsed: months.slice(9) });
ok(eq(acc[0].amount, 144000) && eq(acc[1].amount, 5760000), 'annualized by the T12 rule: an account is its last 3 months × 4 (12,000 × 3 × 4 = 144,000)');

// ---- the lender file ----
const sh = PF.lenderSheets(R, { property: 'Queens-Gate-shaped test', units: 145, period: 'Sep 2025 → Aug 2026', date: '2026-10-14', by: 'You', months, monthly }, { both: true });
const noiRow = sh.proForma.find(x => x[0] === 'Net Operating Income');
ok(noiRow && eq(noiRow[1], 2832250) && eq(noiRow[3], 3597000) && eq(noiRow[5], 3621000), 'lender file: NOI row T12 · Safe · Aggressive');
const mkt = sh.proForma.find(x => x[0] === 'Marketing');
ok(mkt && /48,000/.test(mkt[7]) && /Operating change/.test(mkt[8]) && /base listing/.test(mkt[9]), 'lender file: a changed line carries what changed, its kind and its story');
ok(sh.reconciliation.some(x => x[0] === 'Reconciles to the dollar') && sh.reconciliation.some(x => x[0] === 'Pro forma NOI' && eq(x[3], 3597000)), 'lender file: the reconciliation, ending on the pro forma NOI');
ok(sh.monthly[1].slice(10, 13).join(',') === 'yes,yes,yes', 'lender file: the months used for the revenue credit are marked');
ok(!sh.proForma.some(x => x[0] === 'NOI after reserves'), 'lender file: no reserves given → no reserves rows');
const shR = PF.lenderSheets(R, { property: 'x', units: 145, months, monthly, reserves: 29000 }, { both: false });
const rsvRow = shR.proForma.find(x => x[0] === "Replacement reserves (the underwriting's)"), afterRow = shR.proForma.find(x => x[0] === 'NOI after reserves');
ok(rsvRow && eq(rsvRow[1], 29000) && eq(rsvRow[3], 29000) && afterRow && eq(afterRow[1], 2832250 - 29000) && eq(afterRow[3], 3597000 - 29000) && afterRow.length === 8,
   'lender file: reserves on both sides (the underwriting\'s $/unit) and the NOI after reserves; Safe only = no Aggressive columns');

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' proforma checks passed');
process.exit(fails ? 1 : 0);
