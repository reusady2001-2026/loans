/* e2e — a new loan's interest-only is never copied from today's loan (the operator, 2026-10-26: "if a property had a
   loan, that in its terms there was an interest only period, it will be duplicated to the new loan agreement without me
   letting myself edit that"). A made-up book:
   A  a pooled loan on 3 properties with 24 months interest-only today: the proposed new loan starts with none
   B  a senior (36 months interest-only) + mezzanine on one property: the package's new loan starts with none
   C  one loan on one property, interest-only for its whole term: none on the new loan, and the proposal card's box says 0
   D  "How it's worked out" has the new loan's amortization and interest-only boxes: typing them changes the new loan
      and the Payment line, even when the answer is "Don't refinance" and the proposal card isn't shown
   Run: GN=/opt/node22/lib/node_modules LDS_CLOUD_OFF=1 xvfb-run -a /opt/node22/bin/node test/e2e/refi-new-io.e2e.js */
const path = require('path');
const APP = path.resolve(__dirname, '..', '..');
const L = require('./pool/lib'), F = require('./pool/fixture');
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };

const t = new Date(), iso = (y, m) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), my = t.getUTCFullYear(), mm = t.getUTCMonth() + 8;
const LN = (id, name, addr, amt, rate, extra) => F.loan(id, Object.assign({ propertyName: name, propertyAddress: addr, lenderName: 'Bank ' + id.slice(3), loanNumber: id.toUpperCase(),
  originalAmount: amt, annualRate: rate, rateType: 'Fixed', originationDate: iso(my - 10, mm), firstPaymentDate: iso(my - 10, mm + 1), maturityDate: iso(my, mm), loanTermMonths: 120, amortizationMonths: 360 }, extra || {}));
const P = F.PROPS, MAPLE = P[0], BIRCH = P[1], CEDAR = P[2], DOG = P[3], ELM = P[4], CTRL = F.CONTROL;
const LOANS = [
  LN('ln_pool', MAPLE.name, MAPLE.addr, 24000000, 0.045, { lenderName: 'Pool Bank', ioMonths: 24, alsoSecures: BIRCH.name + ' = 10000000; ' + CEDAR.name + ' = 9000000' }),
  LN('ln_sr', DOG.name, DOG.addr, 9000000, 0.05, { lenderName: 'Senior Bank', ioMonths: 36 }),
  LN('ln_mz', DOG.name + ' (Mezz)', DOG.addr, 2000000, 0.09, { lenderName: 'Mezz Fund', lienPosition: 'Mezzanine', ioMonths: 0 }),
  LN('ln_elm', ELM.name, ELM.addr, 3000000, 0.049, { lenderName: 'Elm Bank', ioMonths: 120 }),
  // far from maturity, at 3%: today's rates are higher, so the answer is "Don't refinance" and no proposal card is shown
  LN('ln_ctl', CTRL.name, CTRL.addr, 8000000, 0.03, { lenderName: 'Control Bank', ioMonths: 60, originationDate: iso(my - 2, mm - 8), firstPaymentDate: iso(my - 2, mm - 7), maturityDate: iso(my + 8, mm - 8) })
];

(async () => {
  const s = await L.boot(APP, LOANS), page = s.page;
  await L.setNOIs(page, [MAPLE, BIRCH, CEDAR, DOG, ELM, CTRL]); await page.waitForTimeout(600);
  const openRefiOf = async (loanId) => {
    await L.goHome(page);
    // a stack (a senior + mezz) is one entry in the property list ("combo:…"): pick it by the property the loan is on
    await page.evaluate((id) => { const s = document.getElementById('loanSelect'), l = window.LDS_loans().find(x => x._id === id), key = l ? window.propertyKey(l) : null;
      const o = [...s.options].find(o => o.value === id) || [...s.options].find(o => key && o.value === 'combo:' + key);
      if (o){ s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } else { const tr = document.querySelector('tr[data-goto="' + id + '"]'); if (tr) tr.click(); } }, loanId);
    await page.waitForTimeout(600);
    await page.waitForFunction(() => { const b = document.getElementById('refiBtn'); return b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
    await page.click('#refiBtn').catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('#refiView [data-refiverdict]').length > 0, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };
  const state = () => page.evaluate(() => { const d = window.LDS_refiDraft(), l = window.LDS_activeLoan(), v = document.querySelector('#refiView [data-refiverdict]');
    const pay = document.querySelector('#refiView [data-refibasis]:not([data-refibasisext]) [data-refipay]'), io = document.querySelector('#refiView [data-refidraftf="io"]'), am = document.querySelector('#refiView [data-refidraftf="amortYrs"]'), card = document.getElementById('o1_io');
    return { id: l && l._id, combined: !!(l && l._combined), todayIO: l ? (l.ioMonths || 0) : null, draftIO: d ? d.ioMonths : null, draftAmort: d ? d.amortizationMonths : null, verdict: v ? v.getAttribute('data-refiverdict') : '',
      pay: pay ? pay.textContent : null, ioBox: io ? io.value : null, amBox: am ? am.value : null, cardIO: card ? card.value : null }; });
  const typeBox = async (f, v) => { await page.fill('#refiView [data-refidraftf="' + f + '"]', String(v)); await page.dispatchEvent('#refiView [data-refidraftf="' + f + '"]', 'change'); await page.waitForTimeout(900); };

  // ---- A: a pooled loan with interest-only today ----
  await openRefiOf('ln_pool');
  let a = await state();
  ok(a.id === 'ln_pool' && a.todayIO === 24, 'A  the pooled loan (3 properties) has 24 months interest-only today');
  ok(a.draftIO === 0, 'A  …the proposed new loan starts with no interest-only (' + a.draftIO + ')');
  ok(a.pay != null && /amortizing over \d+ years/.test(a.pay) && !/interest-only/.test(a.pay), 'A  …the Payment line says amortizing, no interest-only (“' + a.pay + '”)');
  ok(a.ioBox === '0' && a.amBox === '30', 'A  …“How it’s worked out” shows the boxes: amortization ' + a.amBox + ' years, interest-only ' + a.ioBox + ' months');

  // ---- B: a senior with interest-only + a mezzanine ----
  await openRefiOf('ln_sr');
  let b = await state();
  ok(b.combined, 'B  the senior + mezz opens as one package');
  ok(b.draftIO === 0, 'B  …the package’s new loan starts with no interest-only (the senior has 36 months today; ' + b.draftIO + ')');

  // ---- C: one loan, interest-only for its whole term ----
  await openRefiOf('ln_elm');
  let c = await state();
  ok(c.todayIO === 120 && c.draftIO === 0, 'C  interest-only for its whole term today; the new loan has none (' + c.draftIO + ')');
  ok(c.cardIO == null || c.cardIO === '0', 'C  …the proposal card’s Interest-only box (when shown) says 0 (' + c.cardIO + ', answer ' + c.verdict + ')');
  if (c.cardIO != null) {   // the inline box and the card's box are the same number
    await typeBox('io', 12); c = await state();
    ok(c.draftIO === 12 && c.cardIO === '12', 'C  typing 12 in “How it’s worked out” updates the proposal card too (' + c.cardIO + ')');
  }

  // ---- D: "Don't refinance" — the proposal card is hidden, the boxes still work ----
  await openRefiOf('ln_ctl');
  let d = await state();
  ok(d.verdict === 'no' && d.cardIO == null, 'D  “Don’t refinance” (3% today): the proposal card isn’t shown (' + d.verdict + ')');
  ok(d.draftIO === 0 && d.ioBox === '0', 'D  …the new loan has no interest-only (today’s 60 months not copied)');
  await typeBox('io', 24); d = await state();
  ok(d.draftIO === 24 && /after 24 months interest-only/.test(d.pay || ''), 'D  typing 24 months interest-only changes the new loan and the Payment line (“' + d.pay + '”)');
  await typeBox('amortYrs', 25); d = await state();
  ok(d.draftAmort === 300 && /amortizing over 25 years/.test(d.pay || '') && d.amBox === '25', 'D  typing 25 years amortization changes it too (' + d.draftAmort + ' months)');
  await typeBox('io', 0); d = await state();
  ok(d.draftIO === 0 && !/interest-only/.test(d.pay || ''), 'D  back to 0: no interest-only again');

  ok(s.errors.length === 0, 'no page errors' + (s.errors.length ? ': ' + s.errors.join(' | ') : ''));
  await s.app.close();
  console.log(fails.n ? fails.n + ' FAILED' : 'all refi-new-io checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
