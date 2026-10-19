/* Unit checks for proforma.js (next stage F1, draft): the pro forma's Safe and Aggressive versions, every way an
   ACCOUNT can change (round 1: a change is made to one account; a line is the sum of its accounts), the revenue credit,
   the suggestions from the underwriting assumptions, and the reconciliation from the T12 NOI to the pro forma NOI.
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
  { name: 'Snow removal', line: 'CS', amount: 37000 }, { name: 'Other contracts', line: 'CS', amount: 38000 },
  { name: 'Listing package', line: 'MKT', amount: 82000 }, { name: 'Signage & print', line: 'MKT', amount: 17000 },
  { name: 'Salaries', line: 'PAY', amount: 320000 }, { name: 'Payroll taxes', line: 'PAY', amount: 80000 },
  { name: 'Management fee', line: 'MGMT', amount: 150750 }
];
const catalog = { BD: { label: 'Less: Bad Debt', section: 'rental' }, BDX: { label: 'Bad Debt Expense', section: 'expense' } };
const S = (o) => Object.assign({ by: 'You', at: '2026-10-14T10:00:00Z' }, o);
const base = { months: 3, story: 'Occupancy has run 95%+ for five months; the last three months are the run-rate.' };
const changes = [
  S({ id: 'c1', column: 'both', line: 'GA', how: 'takeOut', accounts: [{ name: 'Travel' }], kind: 'partnership', story: 'Corporate travel and software, not the building.' }),
  S({ id: 'c1b', column: 'both', line: 'GA', how: 'takeOut', accounts: [{ name: 'Software' }], kind: 'partnership', story: 'Corporate travel and software, not the building.' }),
  S({ id: 'c2', column: 'both', line: 'CS', how: 'takeOut', accounts: [{ name: 'Landscaping project' }], kind: 'nonRecurring', story: 'A one-time landscaping project.' }),
  S({ id: 'c3', column: 'both', line: 'CS', how: 'spread', years: 3, accounts: [{ name: 'Dryer vent cleaning' }], kind: 'spread', story: 'Done once every three years.' }),
  S({ id: 'c4', column: 'base', line: 'MKT', how: 'accountTotal', value: 43000, accounts: [{ name: 'Listing package' }], kind: 'operating', story: 'A smaller listing package now that occupancy is solid.' }),
  S({ id: 'c5', column: 'both', line: 'CS', how: 'accountTotal', value: 20000, accounts: [{ name: 'Snow removal' }], kind: 'normalized', story: 'A once-in-20-years winter.' }),
  S({ id: 'c6', column: 'both', line: 'MGMT', how: 'pctRevenue', pct: 0.03, accounts: [{ name: 'Management fee' }], kind: 'marketNorm', story: 'Management stays 3% of revenue.' }),
  // an older change that names two accounts still counts (each account is changed)
  S({ id: 'c7', column: 'aggressive', line: 'UTIL', how: 'takeOut', accounts: [{ name: 'Electric - vacant units' }, { name: 'Gas - vacant units' }], kind: 'operating', story: 'Full now: no vacant units to cool for showings.' }),
  S({ id: 'c8', column: 'aggressive', line: 'MKT', how: 'accountTotal', value: 31000, accounts: [{ name: 'Listing package' }], kind: 'operating', story: 'The base listing package.' })
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
ok(eq(st(B, 'c1').effect, 5000) && eq(st(B, 'c1b').effect, 9000) && eq(B.byKey.GA.value, 73000), 'take out Travel and Software, each its own change with its own story: +5,000 +9,000; G&A 73,000');
ok(st(B, 'c1').account === 'Travel' && B.acctById && Object.values(B.acctById).some(a => a.name === 'Travel' && eq(a.value, 0) && eq(a.amount, 5000) && a.changes[0] === 'c1'), 'the step and the account both say which account changed (Travel 5,000 → 0)');
ok(eq(st(B, 'c2').effect, 30000), 'take out the landscaping project: +30,000');
ok(eq(st(B, 'c3').effect, 10000), 'dryer vents spread over 3 years: 15,000 → 5,000 a year, +10,000');
ok(eq(st(B, 'c4').effect, 39000) && eq(B.byKey.MKT.value, 60000), 'listing package 82,000 → 43,000: +39,000; Marketing = 43,000 + 17,000 = 60,000');
ok(eq(st(B, 'c5').effect, 17000) && eq(B.byKey.CS.value, 63000), 'snow removal set to 20,000: +17,000; Contract Services 120,000 − 30,000 − 10,000 − 17,000 = 63,000');
ok(eq(st(B, 'c6').effect, -20250) && eq(B.byKey.MGMT.value, 171000), 'the management fee account at 3% of the new revenue (the operator chose it): 171,000 (−20,250)');
// Safe NOI = 2,832,250 + 675,000 + 14,000 + 30,000 + 10,000 + 39,000 + 17,000 − 20,250 = 3,597,000
ok(eq(B.noi, 3597000) && B.reconciles && eq(B.gap, 0), 'Safe NOI 3,597,000, reconciles to the dollar (got ' + B.noi + ', gap ' + B.gap + ')');
ok(!st(B, 'c7').id && !st(B, 'c8').id, 'Aggressive-only changes are not in the Safe version');
// Aggressive: c4 loses to c8 on Marketing (99,000 → 48,000: +51,000); vacant utilities out (+12,000).
// NOI = 2,832,250 + 675,000 + 14,000 + 30,000 + 10,000 + 17,000 − 20,250 + 12,000 + 51,000 = 3,621,000
ok(!st(A, 'c4').id && eq(st(A, 'c8').effect, 51000) && eq(A.byKey.MKT.value, 48000), 'Aggressive: its own listing package wins over the Safe one (31,000; Marketing 99,000 → 48,000, +51,000)');
ok(eq(st(A, 'c7').effect, 12000) && eq(A.byKey.UTIL.value, 324000), 'Aggressive: vacant-unit electric and gas out: 336,000 → 324,000');
ok(eq(A.noi, 3621000) && A.reconciles, 'Aggressive NOI 3,621,000, reconciles (got ' + A.noi + ')');
ok(eq(A.byKey.GA.value, 73000) && eq(A.byKey.CS.value, 63000), 'Aggressive inherits the Safe changes it doesn\'t replace');
// the reconciliation groups
const g = (v, k) => (v.groups.find(x => x.kind === k) || {}).total;
ok(eq(g(B, 'revenue'), 675000) && eq(g(B, 'partnership'), 14000) && B.groups.find(x => x.kind === 'partnership').items.length === 2 && eq(g(B, 'nonRecurring'), 30000) && eq(g(B, 'spread'), 10000) && eq(g(B, 'normalized'), 17000) && eq(g(B, 'operating'), 39000) && eq(g(B, 'marketNorm'), -20250),
  'Safe groups: revenue 675,000 · partnership 14,000 · non-recurring 30,000 · spread 10,000 · normalized 17,000 · operating 39,000 · market norm −20,250');
ok(B.groups.map(x => x.kind).join(',') === 'revenue,partnership,nonRecurring,spread,normalized,operating,marketNorm', 'groups in the fixed order');
ok(!B.problems.length && !A.problems.length, 'no problems on a complete pro forma (' + JSON.stringify(B.problems.concat(A.problems)) + ')');
// reserves are not part of the pro forma
ok(!B.byKey.reserves, 'reserves stay out of the pro forma');

// ---- refusals ----
const one = (c, extra) => PF.compute(Object.assign({}, input, { pf: { changes: [c] } }, extra || {})).base;
let r = one(S({ id: 'x1', column: 'both', line: 'MKT', how: 'accountTotal', value: 1, accounts: [{ name: 'Listing package' }], kind: 'operating', story: '  ' }));
ok(r.problems.some(p => p.id === 'x1' && /reason/.test(p.reason)) && eq(r.noi, 2832250), 'a change with no story is refused and changes nothing');
r = one(S({ id: 'x2', column: 'both', line: 'MKT', how: 'accountTotal', value: 1, accounts: [{ name: 'Listing package' }], kind: 'revenue', story: 's' }));
ok(r.problems.some(p => p.id === 'x2' && /kind/.test(p.reason)), 'a change with no kind (or the revenue kind) is refused');
r = one(S({ id: 'x3', column: 'both', line: 'GPR', how: 'pctRevenue', pct: 0.5, accounts: [{ name: 'Gross rent' }], kind: 'marketNorm', story: 's' }));
ok(r.problems.some(p => p.id === 'x3' && /expense account or a rental deduction/.test(p.reason)) && eq(r.noi, 2832250), 'gross rent can\'t be a % of revenue');
r = one(S({ id: 'x4', column: 'both', line: 'CS', how: 'takeOut', accounts: [{ name: 'Pool lifeguards' }], kind: 'nonRecurring', story: 's' }));
ok(r.problems.some(p => p.id === 'x4' && p.stale) && r.stale.length === 1 && eq(r.noi, 2832250), 'an account no longer in the T12 is marked, left out, never dropped quietly');
r = one(S({ id: 'x5', column: 'both', line: 'PAY', how: 'perUnit', perUnit: 2000, accounts: [{ name: 'Salaries' }], kind: 'marketNorm', story: 's' }), { units: 145 });
ok(eq(r.byKey.PAY.value, 370000) && eq(st(r, 'x5').effect, 30000), 'per unit on one account: salaries $2,000 × 145 = 290,000 (+30,000); payroll 290,000 + 80,000 = 370,000');
r = one(S({ id: 'x6', column: 'both', line: 'PAY', how: 'perUnit', perUnit: 2000, accounts: [{ name: 'Salaries' }], kind: 'marketNorm', story: 's' }), { units: null });
ok(r.problems.some(p => p.id === 'x6' && /units/.test(p.reason)), 'per unit without units is refused');
r = one(S({ id: 'x7', column: 'both', line: 'CS', how: 'takeOut', kind: 'nonRecurring', story: 's' }));
ok(r.problems.some(p => p.id === 'x7' && /pick the account/.test(p.reason)), 'a change that names no account is refused');
r = one(S({ id: 'x7b', column: 'both', line: 'CS', how: 'accountTotal', value: 1, accounts: [{ name: 'Snow removal' }, { name: 'Other contracts' }], kind: 'normalized', story: 's' }));
ok(r.problems.some(p => p.id === 'x7b' && /one account at a time/.test(p.reason)), 'a new amount is for one account at a time');
// the first draft's whole-line changes are no longer made — a saved one is listed as not counted, never applied
for (const c of [S({ id: 'w1', column: 'both', line: 'MKT', how: 'total', value: 1, kind: 'operating', story: 's' }), S({ id: 'w2', column: 'both', line: 'RM', how: 'spread', years: 2, kind: 'spread', story: 's' }),
                 S({ id: 'w3', column: 'both', line: 'MGMT', how: 'pctRevenue', pct: 0.02, kind: 'marketNorm', story: 's' }), S({ id: 'w4', column: 'both', line: 'PAY', how: 'perUnit', perUnit: 1, kind: 'operating', story: 's' })]) {
  r = one(c);
  ok(r.problems.some(p => p.id === c.id && p.legacy && /whole line/.test(p.reason)) && eq(r.noi, 2832250) && /whole line/.test(PF.describe(c)), 'a whole-line ' + c.how + ' (first draft) is not counted and says why');
}
// an account the T12 doesn't have
r = one(S({ id: 'x8', column: 'both', line: 'BDX', how: 'pctRevenue', pct: 0.01, accounts: [{ name: 'Bad debt (market norm)' }], newAccount: true, kind: 'marketNorm', story: 'Market norm 1%.' }));
ok(r.byKey.BDX && r.byKey.BDX.added && eq(r.byKey.BDX.value, 50250) && eq(r.noi, 2832250 - 50250) && r.accounts.some(a => a.added && a.name === 'Bad debt (market norm)' && eq(a.value, 50250)),
   'a new account on a line the T12 lacks (bad debt expense) is added at 1% of EGI = 50,250');
ok(PF.describe(r.steps[0] ? { how: 'pctRevenue', pct: 0.01, accounts: [{ name: 'Bad debt (market norm)' }], newAccount: true } : null) === 'Added “Bad debt (market norm)”: 1% of revenue', 'a new account reads "Added …"');
r = one(S({ id: 'x9', column: 'both', line: 'CS', how: 'accountTotal', value: 1, accounts: [{ name: 'Snow removal' }], newAccount: true, kind: 'normalized', story: 's' }));
ok(r.problems.some(p => p.id === 'x9' && /already in the T12/.test(p.reason)) && eq(r.noi, 2832250), 'a "new" account that the T12 already has is refused');
// the management fee stays at the T12 when only the revenue changes (the operator: never moved by the revenue credit)
r = PF.compute(Object.assign({}, input, { pf: { revenue: { base }, changes: [] } })).base;
ok(eq(r.byKey.MGMT.value, 150750) && eq(r.egi, 5700000), 'revenue credit alone: the management fee stays 150,750 (the T12), though revenue rose to 5,700,000');
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

// ---- the revenue credit works account by account ----
const in2 = { months, units: 100, lines: [ { key: 'GPR', label: 'Gross Potential Rent', section: 'rental', t12: 5220000 }, { key: 'OTH', label: 'Other Income', section: 'other', t12: 10000 },
  { key: 'MGMT', label: 'Management Fee', section: 'expense', t12: 150000 } ],
  accounts: [ { id: 'r1', name: 'Apartment rent', line: 'GPR', amount: 4980000, monthly: ser(400000, 460000) }, { id: 'r2', name: 'Garage rent', line: 'GPR', amount: 240000, monthly: ser(20000, 20000) },
    { id: 'o1', name: 'Laundry', line: 'OTH', amount: 6000, monthly: ser(400, 800) }, { id: 'gap-OTH', name: 'Difference to the statement’s printed total', line: 'OTH', amount: 4000, monthly: null, gap: true },
    { id: 'm1', name: 'Management fee', line: 'MGMT', amount: 150000, monthly: ser(12500, 12500) } ],
  monthly: {}, pf: { revenue: { base: { months: 3, story: 's' } }, changes: [] } };
r = PF.compute(in2).base;
ok(eq(r.acctById.r1.value, 5520000) && eq(r.acctById.r2.value, 240000) && eq(r.byKey.GPR.value, 5760000), 'T3 per account: apartment rent 460,000 × 12 = 5,520,000; garage 240,000 stays; the line 5,760,000');
ok(eq(r.acctById.o1.value, 9600) && eq(r.acctById['gap-OTH'].value, 4000) && eq(r.byKey.OTH.value, 13600), 'an account with no months (the difference to the printed total) keeps its amount: other income 9,600 + 4,000 = 13,600');
ok(eq(r.byKey.MGMT.value, 150000) && r.reconciles, 'the management fee is not moved by the revenue credit');

// ---- annualize one account (3, 6 or 12 months); a new amount of $0 reads "Took out" ----
// in2's Laundry: 9 months at 400, then 3 at 800 → T3 = 800 × 12 = 9,600; T6 = (3×400 + 3×800) × 2 = 7,200; T12 = 6,000
const inA = Object.assign({}, in2, { pf: { changes: [] } });
const ann = (n, extra) => PF.compute(Object.assign({}, inA, { pf: { changes: [S(Object.assign({ id: 'an', column: 'both', line: 'OTH', how: 'annualize', months: n, accounts: [{ name: 'Laundry' }], kind: 'revenue', story: 'Laundry contract renewed in June.' }, extra || {}))] } })).base;
r = ann(3); ok(eq(r.acctById.o1.value, 9600) && eq(r.byKey.OTH.value, 13600) && eq(st(r, 'an').effect, 3600), 'annualize T3: Laundry 800 × 12 = 9,600 (+3,600); the kind may be Revenue credit');
ok(PF.describe({ how: 'annualize', months: 3, accounts: [{ name: 'Laundry' }] }) === '“Laundry” annualized from its last 3 months', 'it reads “Laundry” annualized from its last 3 months');
ok(r.groups.length === 1 && r.groups[0].kind === 'revenue', 'an annualized revenue account is grouped with the revenue credit');
r = ann(6); ok(eq(r.acctById.o1.value, 7200), 'annualize T6: (3 × 400 + 3 × 800) × 2 = 7,200');
r = ann(12); ok(eq(r.acctById.o1.value, 6000) && eq(st(r, 'an').effect, 0), 'annualize T12 on a 12-month statement = the T12 (no change)');
r = ann(4); ok(r.problems.some(p => p.id === 'an' && /3, 6 or 12/.test(p.reason)), 'only 3, 6 or 12 months');
r = ann(3, { accounts: [{ name: 'Difference to the statement’s printed total' }] });
ok(r.problems.some(p => p.id === 'an' && /no months/.test(p.reason)), 'an account the statement gives no months for can’t be annualized');
r = PF.compute(Object.assign({}, inA, { months: months.slice(0, 2), pf: { changes: [S({ id: 'an2', column: 'both', line: 'OTH', how: 'annualize', months: 3, accounts: [{ name: 'Laundry' }], kind: 'operating', story: 's' })] } })).base;
ok(r.problems.some(p => p.id === 'an2' && /fewer than 3/.test(p.reason)), 'annualizing needs that many dated months');
r = PF.compute(Object.assign({}, inA, { pf: { changes: [S({ id: 'kr', column: 'both', line: 'OTH', how: 'accountTotal', value: 1, accounts: [{ name: 'Laundry' }], kind: 'revenue', story: 's' })] } })).base;
ok(r.problems.some(p => p.id === 'kr' && /kind/.test(p.reason)), 'the Revenue credit kind is only for annualizing');
ok(PF.describe({ how: 'accountTotal', value: 0, accounts: [{ name: 'Travel' }] }) === 'Took out “Travel”', 'a new amount of $0 reads “Took out …”');
r = PF.compute(Object.assign({}, in2, { pf: { revenue: { base: { months: 12, story: 's' } }, changes: [] } })).base;
ok(eq(r.byKey.GPR.value, 5220000) && !r.problems.length, 'a 12-month revenue credit on a 12-month statement leaves revenue as the T12');
const mT = PF.matchSuggestion(input, { line: 'General & Admin', account: 'Travel', how: 'takeOut', kind: 'partnership', story: 's' });
ok(mT.change && mT.change.how === 'accountTotal' && mT.change.value === 0, 'Claude’s “takeOut” becomes a new amount of $0');

// ---- suggestions from the underwriting assumptions ----
let sug = PF.assumptionSuggestions(input, { mgmtPct: 0.025, vacancyPct: 0.05 });
const sm = sug.find(x => x.line === 'MGMT');
ok(sm && sm.account.name === 'Management fee' && eq(sm.pct, 0.025) && sm.how === 'pctRevenue' && sm.kind === 'marketNorm' && /2\.5% of revenue, our underwriting assumption; the T12 ran 3%/.test(sm.story),
   'management fee runs 3% against a 2.5% assumption → a suggestion on its account at 2.5%, with the default story ("' + (sm && sm.story) + '")');
ok(!sug.some(x => x.line === 'VAC'), 'vacancy runs 3.7% under a 5% assumption → no suggestion (and a line with no accounts gets none)');
ok(!PF.assumptionSuggestions(input, { mgmtPct: 0.03 }).length, 'at the assumption → no suggestion');
const inV = Object.assign({}, input, { accounts: input.accounts.concat([{ id: 'v1', name: 'Vacancy loss', line: 'VAC', amount: -150000 }, { id: 'v2', name: 'Model unit', line: 'VAC', amount: -45000 }]) });
sug = PF.assumptionSuggestions(inV, { vacancyPct: 0.02 });
const sv = sug.find(x => x.line === 'VAC');
ok(sv && sv.account.name === 'Vacancy loss' && eq(sv.pct, 0.011379) && /other accounts stay/.test(sv.story), 'vacancy 3.7% against 2%: the biggest deduction (vacancy loss) is sized so the line lands on 2% (1.1379% + the model unit)');
const cV = S({ id: 'sv', column: 'both', line: 'VAC', how: sv.how, pct: sv.pct, accounts: [sv.account], kind: sv.kind, story: sv.story });
r = PF.compute(Object.assign({}, inV, { pf: { changes: [cV] } })).base;
ok(Math.abs(r.byKey.VAC.value - (-104400)) < 5, 'applied: the vacancy line ≈ −2% × 5,220,000 = −104,400 (got ' + r.byKey.VAC.value + ')');

// ---- a suggestion from Claude, matched to the T12 ----
let m = PF.matchSuggestion(input, { line: 'Contract Services', account: 'snow', how: 'accountTotal', value: 20000, kind: 'normalized', story: 'A hard winter.', column: 'safe' });
ok(m.change && m.change.line === 'CS' && m.change.accounts[0].name === 'Snow removal' && m.change.column === 'base' && eq(m.change.value, 20000), 'Claude’s suggestion is matched by line label and account name (Snow removal, Safe)');
ok(/no account/.test(PF.matchSuggestion(input, { line: 'CS', account: 'Pool', how: 'takeOut', kind: 'nonRecurring', story: 's' }).reason || ''), 'an account that is not in the T12 is refused');
ok(/not one of/.test(PF.matchSuggestion(input, { line: 'Marketing', account: 'Listing package', how: 'total', value: 1, kind: 'operating', story: 's' }).reason || ''), 'a whole-line way is refused');
m = PF.matchSuggestion(input, { line: 'management fee', account: 'Management fee', how: 'pctRevenue', pct: 2.5, kind: 'marketNorm', story: 's' });
ok(m.change && eq(m.change.pct, 0.025), 'a % given as 2.5 is read as 2.5%');
ok(/reason/.test(PF.matchSuggestion(input, { line: 'CS', account: 'Snow removal', how: 'takeOut', kind: 'nonRecurring', story: '' }).reason || ''), 'a suggestion with no story is refused');

// ---- the lender file ----
const sh = PF.lenderSheets(R, { property: 'Queens-Gate-shaped test', units: 145, period: 'Sep 2025 → Aug 2026', date: '2026-10-14', by: 'You', months, monthly }, { both: true });
const noiRow = sh.proForma.find(x => x[0] === 'Net Operating Income');
ok(noiRow && eq(noiRow[1], 2832250) && eq(noiRow[3], 3597000) && eq(noiRow[5], 3621000), 'lender file: NOI row T12 · Safe · Aggressive');
const mkt = sh.proForma.find(x => x[0] === 'Marketing');
ok(mkt && /Listing package/.test(mkt[7]) && /31,000/.test(mkt[7]) && /Operating change/.test(mkt[8]) && /base listing/.test(mkt[9]), 'lender file: a changed line carries what changed (the account), its kind and its story');
const snow = sh.accounts.find(x => x[1] === 'Snow removal'), trav = sh.accounts.find(x => x[1] === 'Travel');
ok(sh.accounts[0].join('|') === 'Line|Account|T12|Pro forma (Safe)|Aggressive|Change|Kind|Story' && snow && eq(snow[2], 37000) && eq(snow[3], 20000) && /Normalized/.test(snow[6]) && trav && /not the building/.test(trav[7]) && !sh.accounts.some(x => x[1] === 'Other contracts'),
   'lender file: every changed account (and only those) with its T12, pro forma, kind and story');
ok(sh.reconciliation.some(x => x[0] === 'Reconciles to the dollar') && sh.reconciliation.some(x => x[0] === 'Pro forma NOI' && eq(x[3], 3597000)), 'lender file: the reconciliation, ending on the pro forma NOI');
ok(sh.monthly[1].slice(10, 13).join(',') === 'yes,yes,yes', 'lender file: the months used for the revenue credit are marked');
ok(!sh.proForma.some(x => x[0] === 'NOI after reserves'), 'lender file: no reserves given → no reserves rows');
const shR = PF.lenderSheets(R, { property: 'x', units: 145, months, monthly, reserves: 29000 }, { both: false });
const rsvRow = shR.proForma.find(x => x[0] === "Replacement reserves (the underwriting's)"), afterRow = shR.proForma.find(x => x[0] === 'NOI after reserves');
ok(rsvRow && eq(rsvRow[1], 29000) && eq(rsvRow[3], 29000) && afterRow && eq(afterRow[1], 2832250 - 29000) && eq(afterRow[3], 3597000 - 29000) && afterRow.length === 8,
   'lender file: reserves on both sides (the underwriting\'s $/unit) and the NOI after reserves; Safe only = no Aggressive columns');

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' proforma checks passed');
process.exit(fails ? 1 : 0);
