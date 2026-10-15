// Unit tests — refi-extend.js (next stage F4, draft): extending with today's lender, and a loan that must be dealt with.
// A Queens-Gate-shaped fixture (made up): owes $47M, the extension at a 6.30% floating rate interest-only, NOI $3.34M,
// an appraisal of $65M, the lender's limits 1.11× amortizing / 1.35× interest-only / 75% / 7%. Expected amounts are worked
// out here by hand formulas, not by the module.
const RX = require('../refi-extend.js');
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c){ fails++; console.log('  FAIL ' + m); } };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.01 : t);
const NOI = 3340000, OWED = 47000000, VALUE = 65000000, RATE = 0.063;
const mc = RATE / 12, K = 12 * mc / (1 - Math.pow(1 + mc, -360));            // the 30-year loan constant at 6.30%
const DSCR = NOI / (1.11 * K), IO = NOI / (1.35 * RATE), LTV = 0.75 * VALUE, DY = NOI / 0.07;
const lim = { dscr: 1.11, dscrIO: 1.35, ltv: 0.75, dy: 0.07 };

// sizing
let s = RX.size({ noi: NOI, value: VALUE, rate: RATE, amortMonths: 360, limits: lim, off: [] });
ok(near(s.legs.DSCR, DSCR) && near(s.legs['DSCR IO'], IO) && near(s.legs.LTV, LTV) && near(s.legs['Debt Yield'], DY), 'each limit’s loan by hand');
ok(s.binding === 'DSCR IO' && near(s.maxLoan, Math.min(DSCR, IO, LTV, DY)), 'all used: the smallest binds (' + s.binding + ')');
s = RX.size({ noi: NOI, value: VALUE, rate: RATE, amortMonths: 360, limits: lim, off: ['DSCR IO', 'DSCR'] });
ok(s.binding === 'Debt Yield' && near(s.maxLoan, Math.min(LTV, DY)), 'only LTV and debt yield used: the smaller of those binds');
s = RX.size({ noi: NOI, value: VALUE, rate: RATE, amortMonths: 360, limits: { dscr: 1.11, ltv: 0.75, dy: 0.07 }, off: [] });
ok(s.legs['DSCR IO'] === null && s.binding === 'DSCR', 'no interest-only limit typed: that test isn’t used');

// the extension
const e = RX.extend({ owed: OWED, noi: NOI, value: VALUE, rate: RATE, amortMonths: 360, limits: lim, off: ['DSCR'], penaltyFull: 1000000, penalty: null, fee: { kind: 'pct', value: 0.005 } });
const allowed = Math.min(IO, LTV, DY), pd = OWED - allowed, amt = OWED - pd;
ok(e.binding === 'DSCR IO' && near(e.allowed, allowed) && near(e.payDown, pd) && e.needed, 'pay-down needed = what you owe − what the lender allows (' + Math.round(pd) + ')');
ok(near(e.amount, amt) && near(e.implied.dscrIO, 1.35, 1e-6) && near(e.implied.ltv, amt / VALUE, 1e-9) && near(e.implied.dy, NOI / amt, 1e-9), 'at the extended amount: interest-only coverage sits at 1.35×, LTV on the appraisal, debt yield');
ok(e.penalty.how === 'paydown' && e.penalty.assumed && near(e.penalty.amount, 1000000 * pd / OWED), 'no choice yet: the penalty on the pay-down, marked assumed');
ok(near(e.fee, 0.005 * amt) && near(e.cash, pd + e.penalty.amount + e.fee), 'fee 0.5% of the extended amount; cash needed = pay-down + penalty + fee');
const none = RX.extend({ owed: 30000000, noi: NOI, value: VALUE, rate: RATE, amortMonths: 360, limits: lim, off: [], penaltyFull: 1000000, penalty: { how: 'full' }, fee: { kind: 'amt', value: 50000 } });
ok(!none.needed && none.payDown === 0 && none.amount === 30000000 && none.penalty.amount === 1000000 && none.cash === 1050000, 'covered: no pay-down; full penalty + a $ fee is the cash needed');

// the four penalty choices (D7)
const P = (c) => RX.penaltyOf(1000000, 40000000, 4000000, c);
ok(P({ how: 'full' }).amount === 1000000 && !P({ how: 'full' }).assumed, 'the full penalty');
ok(P({ how: 'paydown' }).amount === 100000, 'on the pay-down only: 10% of the balance paid down → 10% of the penalty');
ok(P({ how: 'pct', pct: 0.25 }).amount === 250000 && P({ how: 'amt', amt: 300000 }).amount === 300000, 'a part: 25% of it, or $300,000');
ok(P({ how: 'none' }).amount === 0 && P(null).assumed && P(null).how === 'paydown', 'none; and nothing picked = on the pay-down, assumed');

// D1 — must be dealt with
ok(RX.mustAct({ canCover: false, monthsToMaturity: 6 }).must, 'can’t cover and matures in 6 months → must be dealt with');
ok(RX.mustAct({ canCover: false, monthsToMaturity: 60, monthsToReset: 3 }).must && RX.mustAct({ canCover: false, monthsToMaturity: 60, monthsToReset: 3 }).resetting, 'can’t cover and its rate resets in 3 months → must be dealt with (Queens Gate’s case)');
ok(!RX.mustAct({ canCover: false, monthsToMaturity: 30 }).must, 'can’t cover, ends in 30 months, no reset → not yet (stays “Don’t refinance”)');
ok(!RX.mustAct({ canCover: true, monthsToMaturity: 6 }).must, 'covers what you owe → the usual rules');

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' refi-extend checks passed');
process.exit(fails ? 1 : 0);
