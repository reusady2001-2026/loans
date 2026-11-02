/* e2e for 2.9.15 P1: a pool release counts in today's balance once its date has passed — also when it is dated
   BEFORE the loan's first payment. Each released loan is compared with an identical twin that has no release.
   E1  first payment still ahead, released today          → balance = twin − release; the allocations add up to it;
                                                            the loan page and Home show it
   E2  first payment still ahead, release dated tomorrow  → not yet: balance = twin (the schedule already starts lower)
   E3  payments made, release dated yesterday             → balance = twin − release
   E4  payments made, release dated before the next payment but after today → not yet: balance = twin
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/pool-release-early-2915.e2e.js */
const path = require('path'), L = require('./pool/lib'), F = require('./pool/fixture'), report = require('./pool/report');
const APP = path.resolve(__dirname, '..', '..');
const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
const iso = (d) => d.toISOString().slice(0, 10);
const day = (y, m, d) => new Date(Date.UTC(y, m, d));
const T = new Date(), TY = T.getFullYear(), TM = T.getMonth(), TD = T.getDate();
const today = day(TY, TM, TD), plus = (n) => new Date(today.getTime() + n * 864e5);
// New loan: closes on the 1st of this month, first payment on the 1st of the month after next (always ahead of today).
const NEW = { originationDate: iso(day(TY, TM, 1)), firstPaymentDate: iso(day(TY, TM + 2, 1)), maturityDate: iso(day(TY + 10, TM + 1, 1)) };
// Seasoned loan: paying for a year; its payment day sits at least 2 days after today so "after today, before the next payment" exists.
const PDAY = TD <= 23 ? TD + 5 : 5, NEXT = TD <= 23 ? day(TY, TM, PDAY) : day(TY, TM + 1, PDAY);
const OLD = { originationDate: iso(day(TY - 1, NEXT.getUTCMonth() - 1, PDAY)), firstPaymentDate: iso(day(TY - 1, NEXT.getUTCMonth(), PDAY)), maturityDate: iso(day(TY + 9, NEXT.getUTCMonth() - 1, PDAY)) };
const POOL = (id, name, dates) => F.loan(id, Object.assign({}, F.BASE, dates, { propertyName: name, propertyAddress: '', lenderName: 'Early Bank', loanNumber: id.toUpperCase(),
  originalAmount: 18000000, annualRate: 0.06, rateType: 'Fixed', loanTermMonths: 120, amortizationMonths: 360,
  alsoSecures: name + ' North = 6000000; ' + name + ' South = 4000000' }));
const CASES = [
  { id: 'E1', name: 'Early One',   dates: NEW, when: iso(today),   counts: true,  what: 'first payment ahead, released today' },
  { id: 'E2', name: 'Early Two',   dates: NEW, when: iso(plus(1)), counts: false, what: 'first payment ahead, release dated tomorrow' },
  { id: 'E3', name: 'Early Three', dates: OLD, when: iso(plus(-1)), counts: true, what: 'payments made, released yesterday' },
  { id: 'E4', name: 'Early Four',  dates: OLD, when: iso(plus(1)), counts: false, what: 'payments made, release dated after today and before the next payment (' + iso(NEXT) + ')' },
];
async function run() {
  const out = [], book = [F.CONTROL_LOAN];
  CASES.forEach(c => { book.push(POOL('ln_' + c.id.toLowerCase(), c.name, c.dates)); book.push(POOL('ln_' + c.id.toLowerCase() + '_twin', c.name + ' Twin', c.dates)); });
  const s = await L.boot(APP, book);
  try {
    const before = await L.home(s.page), debtBefore = L.parseMoney(before.totalDebt);
    let released = 0;
    for (const c of CASES) {
      const id = 'ln_' + c.id.toLowerCase();
      const r = await s.page.evaluate(([id, when]) => {
        const k = window.LDS_poolKeys(id).find(x => / south$/.test(x)), df = window.LDS_poolReleaseDefault(id, k);
        window.LDS_poolRelease(id, k, df.price, when, true);
        const l = window.LDS_getLoan(id), tw = window.LDS_getLoan(id + '_twin'), rows = window.LDS_scheduleRows(id), al = window.LDS_poolAlloc(id);
        return { price: df.price, bal: window.LDS_computeBalance(l), twin: window.LDS_computeBalance(tw), allocSum: Object.keys(al).reduce((t, x) => t + al[x], 0),
          row1: rows[0].startingBalance, twinPaid: window.LDS_computeBalance(tw) < 18000000 - 1 };
      }, [id, c.when]);
      const want = c.counts ? r.twin - r.price : r.twin;
      if (c.counts) released += r.price;
      const pass = L.near(r.bal, want, 0.01) && r.price > 0;   // the price is the app's own default for the release
      out.push({ id: c.id + ' ' + c.what, pass, detail: 'balance today ' + money(r.bal) + ' — twin without the release ' + money(r.twin) + (c.counts ? ' minus the ' + money(r.price) + ' release = ' : ' (the release has not happened yet) = ') + money(want) });
      if (c.dates === NEW) out.push({ id: c.id + '-sched the schedule starts after the release', pass: L.near(r.row1, 14000000, 0.01) && L.near(r.twin, 18000000, 0.01),
        detail: 'first schedule row starts at ' + money(r.row1) + ' (twin ' + money(r.twin) + ')' });
      if (c.id === 'E1') out.push({ id: 'E1-alloc the remaining allocations add up to the balance', pass: L.near(r.allocSum, r.bal, 1), detail: 'allocations ' + money(r.allocSum) + ', balance ' + money(r.bal) });
      if (c.dates === OLD) out.push({ id: c.id + '-seasoned the twin has payments made', pass: r.twinPaid, detail: 'twin balance ' + money(r.twin) });
    }
    // the loan page shows the released balance
    const page = await s.page.evaluate(() => { window.LDS_selectLoan ? window.LDS_selectLoan('ln_e1') : (document.getElementById('loanSelect').value = 'ln_e1', document.getElementById('loanSelect').dispatchEvent(new Event('change', { bubbles: true })));
      const p = [...document.querySelectorAll('p')].find(x => (x.textContent || '').trim() === 'Current Balance'); return p && p.nextElementSibling ? p.nextElementSibling.textContent.trim() : ''; });
    out.push({ id: 'E1-page the loan page shows $14,000,000', pass: L.near(L.parseMoney(page), 14000000, 1), detail: 'Current Balance on the loan page: ' + page });
    // Home's total debt falls by exactly the releases that have happened (E1 + E3)
    const after = await L.home(s.page), debtAfter = L.parseMoney(after.totalDebt);
    out.push({ id: 'E-home Home total debt falls by the releases dated today or earlier', pass: L.near(debtBefore - debtAfter, released, Math.max(1, debtBefore * 0.0005)),
      detail: 'Home total debt ' + before.totalDebt + ' → ' + after.totalDebt + ' (released ' + money(released) + ')' });
    if (s.errors.length) out.push({ id: 'err page errors', pass: false, detail: s.errors.slice(0, 3).join(' | ') });
  } finally { await s.app.close(); }
  return out;
}
run().then(r => report('2.9.15 pool release before the first payment', r)).catch(e => { console.error('E2E CRASH', e); process.exit(2); });
