// 2.9.14 — stacked loans over a pool. X1: a pooled senior + a pooled mezz over the same 5 properties. X2: the pool + one
// member (Cedar Point) with its own separate mezz. Truth: each property's NOI counted ONCE, every loan's debt service
// counted, and one Home row showing the whole stack's coverage (X1 1.14×, X2 1.41×). run() returns [{ id, pass, detail }].
const path = require('path'), L = require('./lib'), F = require('./fixture');
const APP = path.resolve(__dirname, '..', '..', '..');
const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
const P = F.PROPS;
const MEZZ = Object.assign({}, F.POOL_TERMS, { lenderName: 'Mezz Fund', loanNumber: 'MZ-1', originalAmount: 10000000, annualRate: 0.09, lienPosition: 'Mezzanine', ioMonths: 0 });
const CMEZZ = F.loan('ln_cm', Object.assign({}, F.POOL_TERMS, { lenderName: 'Cedar Mezz', loanNumber: 'CM-1', originalAmount: 1500000, annualRate: 0.09, lienPosition: 'Mezzanine', ioMonths: 0,
  propertyName: 'Cedar Point Apartments (Mezz)', propertyAddress: P[2].addr }));
const C = F.CONTROL_LOAN, allProps = P.concat([F.CONTROL]);
const lead = (terms, extra) => F.loan(terms === MEZZ ? 'ln_mz' : 'ln_pool', Object.assign({}, terms, { propertyName: P[0].name + (terms === MEZZ ? ' (Mezz)' : ''), propertyAddress: P[0].addr }, extra || {}));
const alloc = (f) => P.slice(1).map(p => p.name + ' = ' + Math.round(p.ala * f)).join('; ');
async function run() {
  const out = [], allNOI = P.reduce((a, p) => a + p.noi, 0) + F.CONTROL.noi;
  const ctrlDS = 12 * L.pmt(10e6, 0.05, 360), poolDS = 12 * L.pmt(50e6, 0.055, 360), mezzDS = 12 * L.pmt(10e6, 0.09, 360), cmDS = 12 * L.pmt(1.5e6, 0.09, 360);
  const books = { X1: [C, lead(F.POOL_TERMS, { alsoSecures: alloc(1) }), lead(MEZZ, { alsoSecures: alloc(0.2) })], X2: [C, lead(F.POOL_TERMS, { alsoSecures: alloc(1) }), CMEZZ] };
  for (const [k, wantDS] of [['X1', ctrlDS + poolDS + mezzDS], ['X2', ctrlDS + poolDS + cmDS]]) {
    const s = await L.boot(APP, books[k]);
    try {
      await L.setNOIs(s.page, allProps);
      const h = await L.home(s.page);
      const stackDSCR = 5e6 / (wantDS - ctrlDS);
      const stackRow = h.rows.find(r => L.near(L.parseMoney(r[1]), 5e6, 1) && Math.abs(((r[2] || '').match(/([0-9.]+)×/) || [0, 0])[1] - stackDSCR) < 0.011);
      const noiOnce = L.near(h.cov.sumNOI, allNOI, 1), dsRight = L.near(h.cov.sumDS, wantDS, 5);
      out.push({ id: k + (k === 'X1' ? ' a pooled senior + a pooled mezz on the same 5 properties' : ' the pool + a member\'s own mezz'), pass: noiOnce && dsRight && !!stackRow,
        detail: 'NOI counted ' + money(h.cov.sumNOI) + ' (truth ' + money(allNOI) + '), debt service ' + money(h.cov.sumDS) + ' (truth ' + money(wantDS) + '), one row for the whole stack at ' + stackDSCR.toFixed(2) + '×: ' + !!stackRow });
      if (s.errors.length) out.push({ id: k + '-err page errors', pass: false, detail: s.errors.slice(0, 3).join(' | ') });
    } finally { await s.app.close(); }
  }
  return out;
}
module.exports = { run };
