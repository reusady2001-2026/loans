/* e2e — a property's combined position (the operator, 2026-11-02): "the starting balance was combined, the interest
   charged was combined, and the scheduled payment was combined. The rate was showing only the senior loan rate and not
   the combined rate. Once the extension starts, it changes"; "make it so I will be able to pick the combined position
   ... and then I can't select back the combined position of the property". A made-up book:
   a senior (9M, 7.69%, interest-only) and a mezzanine (2M, 13.5%, interest-only, started a year later) on one property,
   both maturing 2 months from today; and a property with one loan.
   A  the combined schedule is the loans added together, month by month: balance, interest and payment are the sums;
      the rate is each loan's rate weighted by what it owes; months before the mezz started count the senior only
   B  after both loans are extended (their own terms), every month before the extension still shows the combined rate
      and the combined interest — never the senior's alone
   C  the switch on the page: Combined position · Senior loan only · Mezz loan only, and back; the dropdown lists each
      loan under its property, and picking the property again brings back the combined position
   D  Close from a combined refinance goes back to the combined position (it used to switch to the senior)
   E  a property with one loan has no switch
   Run: GN=/opt/node22/lib/node_modules LDS_CLOUD_OFF=1 xvfb-run -a /opt/node22/bin/node test/e2e/combined-position.e2e.js */
const path = require('path');
const APP = path.resolve(__dirname, '..', '..');
const L = require('./pool/lib'), F = require('./pool/fixture');
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const near = (a, b, t) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (t == null ? 0.02 : t);

const t = new Date(), iso = (y, m) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), my = t.getUTCFullYear(), mm = t.getUTCMonth() + 2;
const LN = (id, name, addr, amt, rate, extra) => F.loan(id, Object.assign({ propertyName: name, propertyAddress: addr, lenderName: 'Bank ' + id.slice(3), loanNumber: id.toUpperCase(),
  originalAmount: amt, annualRate: rate, rateType: 'Fixed', originationDate: iso(my - 3, mm), firstPaymentDate: iso(my - 3, mm + 1), maturityDate: iso(my, mm), loanTermMonths: 36, amortizationMonths: 36, ioMonths: 36 }, extra || {}));
const DOG = F.PROPS[3], ELM = F.PROPS[4];
const LOANS = [
  LN('ln_sr', DOG.name, DOG.addr, 9000000, 0.0769, { lenderName: 'Senior Bank' }),
  LN('ln_mz', DOG.name + ' (Mezz)', DOG.addr, 2000000, 0.135, { lenderName: 'Mezz Fund', lienPosition: 'Mezzanine', originationDate: iso(my - 2, mm), firstPaymentDate: iso(my - 2, mm + 1), loanTermMonths: 24, amortizationMonths: 24, ioMonths: 24 }),
  LN('ln_elm', ELM.name, ELM.addr, 4000000, 0.049, { lenderName: 'Elm Bank', ioMonths: 0, amortizationMonths: 360 })
];

(async () => {
  const s = await L.boot(APP, LOANS), page = s.page;
  await L.setNOIs(page, [DOG, ELM]); await page.waitForTimeout(600);
  const pick = async (value) => { await L.goHome(page); await page.evaluate((v) => { const s = document.getElementById('loanSelect'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, value); await page.waitForTimeout(900); };
  const comboId = await page.evaluate(() => 'combo:' + window.propertyKey(window.LDS_loans().find(l => l._id === 'ln_sr')));
  // the combined schedule against the two loans' own schedules, month by month
  const check = () => page.evaluate((cid) => {
    const c = window.LDS_compute(window.LDS_activeLoan()), sr = window.LDS_compute(window.LDS_loans().find(l => l._id === 'ln_sr')), mz = window.LDS_compute(window.LDS_loans().find(l => l._id === 'ln_mz'));
    const by = (rows) => { const o = {}; rows.forEach(r => o[r.paymentDate] = r); return o; }, S = by(sr.rows), M = by(mz.rows);
    let worst = 0, rateWorst = 0, seniorOnly = 0, both = 0, extRows = 0, seniorRateRows = 0;
    c.rows.forEach(r => { const a = S[r.paymentDate], b = M[r.paymentDate], parts = [a, b].filter(Boolean);
      const bal = parts.reduce((t, x) => t + x.startingBalance, 0), int = parts.reduce((t, x) => t + x.interest, 0), pay = parts.reduce((t, x) => t + x.payment, 0), rate = bal > 0 ? parts.reduce((t, x) => t + x.rate * x.startingBalance, 0) / bal : 0;
      worst = Math.max(worst, Math.abs(r.startingBalance - bal), Math.abs(r.interest - int), Math.abs(r.payment - pay)); rateWorst = Math.max(rateWorst, Math.abs(r.rate - rate));
      if (a && !b) seniorOnly++; if (a && b) { both++; if (Math.abs(r.rate - a.rate) < 1e-9) seniorRateRows++; } if (r.ext) extRows++; });
    const d = c.derived;
    return { id: (window.LDS_activeLoan() || {})._id === cid, rows: c.rows.length, worst, rateWorst, seniorOnly, both, extRows, seniorRateRows, combined: c.combined,
      bal: d.currentBalance, sumBal: sr.derived.currentBalance + mz.derived.currentBalance, rate: d.currentRate,
      meta: (document.getElementById('scheduleMeta') || {}).textContent || '', kpi: (document.getElementById('kpiGrid') || {}).textContent || '' }; }, comboId);

  // ---- A: the loans added together ----
  await pick(comboId);
  let a = await check();
  ok(a.id && a.combined === 2, 'A  picking the property opens its combined position (2 loans)');
  ok(a.worst < 0.01 && a.rateWorst < 1e-9, 'A  every month: balance, interest and payment are the two loans’ sums; the rate is their rates weighted by what each owes (' + a.rows + ' months)');
  ok(a.seniorOnly >= 12 && a.both >= 12, 'A  months before the mezz started count the senior only (' + a.seniorOnly + '), then both (' + a.both + ')');
  ok(near(a.bal, a.sumBal, 0.01) && near(a.rate, (9000000 * 0.0769 + 2000000 * 0.135) / 11000000, 1e-6), 'A  the current balance is the sum, the rate today the combined ' + (a.rate * 100).toFixed(3) + '%');
  ok(/added together/.test(a.meta) && /Each loan’s own/.test(a.kpi) && /senior/.test(a.kpi) && /mezz/.test(a.kpi), 'A  the schedule says it is the loans added together; the terms cards name each loan’s own');

  // ---- B: after both are extended, the months before the extension keep the combined rate ----
  await page.click('#refiBtn'); await page.waitForTimeout(2000);
  await page.click('#refiView [data-refideal="extend"]'); await page.waitForTimeout(2000);
  for (const id of ['ln_sr', 'ln_mz']) { const sel = '#refiView [data-refiextm="' + id + '"][data-refiextf="months"]'; await page.fill(sel, '3'); await page.dispatchEvent(sel, 'change'); await page.waitForTimeout(1500); }
  await page.click('#refiExtSaveBtn'); await L.confirmIfAsked(page); await page.waitForTimeout(1500);
  const ext = await page.evaluate(() => window.LDS_loans().filter(l => l.extension).length);
  // ---- D: Close from a combined refinance goes back to the combined position ----
  await page.click('#refiCloseBtn'); await page.waitForTimeout(1200);
  const back = await page.evaluate((cid) => ({ id: (window.LDS_activeLoan() || {})._id, view: !document.getElementById('loanView').hidden, sel: document.getElementById('loanSelect').value }), comboId);
  ok(back.id === comboId && back.view && back.sel === comboId, 'D  Close from the combined refinance goes back to the combined position (not the senior alone)');
  let b = await check();
  ok(ext === 2 && b.extRows >= 3, 'B  both loans extended 3 months on their own terms; the combined schedule has the extension’s months (' + b.extRows + ')');
  ok(b.worst < 0.01 && b.rateWorst < 1e-9 && b.seniorRateRows === 0, 'B  every month before the extension still shows the combined rate and interest — never the senior’s alone');

  // ---- C: the switch, and the dropdown ----
  const sw = () => page.evaluate(() => ({ btns: [...document.querySelectorAll('#stackSwitch [data-stackpick]')].map(b => b.textContent.trim().slice(0, 24) + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    id: (window.LDS_activeLoan() || {})._id, sel: document.getElementById('loanSelect').value, rate: (document.querySelector('#scheduleBody tr[data-schedrow] td:nth-child(5)') || {}).textContent || '' }));
  let c = await sw();
  ok(c.btns.length === 3 && /^Combined position.*\*$/.test(c.btns[0]) && /^Senior loan only/.test(c.btns[1]) && /^Mezz loan only/.test(c.btns[2]), 'C  the switch: ' + c.btns.join(' | '));
  await page.click('#stackSwitch [data-stackpick="ln_sr"]'); await page.waitForTimeout(900); c = await sw();
  ok(c.id === 'ln_sr' && c.sel === 'loan:ln_sr' && /7\.69/.test(c.rate) && /\*$/.test(c.btns[1]), 'C  Senior loan only: the senior’s page and schedule (' + c.rate.trim() + '), the dropdown on its own entry');
  await page.click('#stackSwitch [data-stackpick="' + comboId + '"]'); await page.waitForTimeout(900); c = await sw();
  ok(c.id === comboId && c.sel === comboId && /^Combined position.*\*$/.test(c.btns[0]), 'C  …and back to the combined position in one click');
  const opts = await page.evaluate(() => [...document.getElementById('loanSelect').options].map(o => o.value));
  const i0 = opts.indexOf(comboId);
  ok(i0 >= 0 && opts[i0 + 1] === 'loan:ln_sr' && opts[i0 + 2] === 'loan:ln_mz', 'C  the dropdown lists the property (combined), then each of its loans on its own');
  await pick('loan:ln_mz'); c = await sw();
  ok(c.id === 'ln_mz' && c.sel === 'loan:ln_mz' && /13\.5/.test(c.rate), 'C  picking the mezz in the dropdown: its own page (' + c.rate.trim() + ')');
  await pick(comboId); c = await sw();
  ok(c.id === comboId && /^Combined position.*\*$/.test(c.btns[0]), 'C  picking the property again brings back the combined position');

  // ---- E: one loan, no switch ----
  await pick('ln_elm');
  const e = await page.evaluate(() => ({ id: (window.LDS_activeLoan() || {})._id, hidden: document.getElementById('stackSwitch').hidden }));
  ok(e.id === 'ln_elm' && e.hidden, 'E  a property with one loan: no switch');

  ok(s.errors.length === 0, 'no page errors' + (s.errors.length ? ': ' + s.errors.join(' | ') : ''));
  await s.app.close();
  console.log(fails.n ? fails.n + ' FAILED' : 'all combined-position checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
