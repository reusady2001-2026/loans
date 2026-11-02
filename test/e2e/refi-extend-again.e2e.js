/* e2e — no limit on the number of extensions with today's lender (the operator, 2026-11-02: "Put no limit on the number
   of extensions that you can make"). A made-up book, every loan maturing 2 months from today:
   A  one loan extended three times (3 months each, the second at its own spread): each one starts when the one before it
      ends; the schedule runs each in turn (one balance, each on its own rate); the saved box lists them all; a date
      before the saved one is refused
   B  Undo takes back only the latest: 3 → 2 → 1 → none, each time back to the maturity before it
   C  the assistant: save_extension on an extended loan saves another; undo_extension takes back the latest
   D  a senior + mezzanine: saved together, then extended again together; Undo takes back each loan's latest
   Run: GN=/opt/node22/lib/node_modules LDS_CLOUD_OFF=1 xvfb-run -a /opt/node22/bin/node test/e2e/refi-extend-again.e2e.js */
const path = require('path');
const APP = path.resolve(__dirname, '..', '..');
const L = require('./pool/lib'), F = require('./pool/fixture');
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const near = (a, b, t) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (t == null ? 0.02 : t);

const t = new Date(), iso = (y, m) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), my = t.getUTCFullYear(), mm = t.getUTCMonth() + 2;
const LN = (id, name, addr, amt, rate, extra) => F.loan(id, Object.assign({ propertyName: name, propertyAddress: addr, lenderName: 'Bank ' + id.slice(3), loanNumber: id.toUpperCase(),
  originalAmount: amt, annualRate: rate, rateType: 'Fixed', originationDate: iso(my - 10, mm), firstPaymentDate: iso(my - 10, mm + 1), maturityDate: iso(my, mm), loanTermMonths: 120, amortizationMonths: 360 }, extra || {}));
const P = F.PROPS, DOG = P[3], ELM = P[4];
const LOANS = [
  LN('ln_elm', ELM.name, ELM.addr, 4000000, 0.049, { lenderName: 'Elm Bank' }),
  LN('ln_sr', DOG.name, DOG.addr, 9000000, 0.05, { lenderName: 'Senior Bank' }),
  LN('ln_mz', DOG.name + ' (Mezz)', DOG.addr, 2000000, 0.09, { lenderName: 'Mezz Fund', lienPosition: 'Mezzanine' })
];

(async () => {
  const s = await L.boot(APP, LOANS), page = s.page;
  await L.setNOIs(page, [DOG, ELM]); await page.waitForTimeout(600);
  const confirm = () => L.confirmIfAsked(page);
  const openRefiOf = async (loanId) => {
    await L.goHome(page);
    await page.evaluate((id) => { const s = document.getElementById('loanSelect'), l = window.LDS_loans().find(x => x._id === id), key = l ? window.propertyKey(l) : null;
      const o = [...s.options].find(o => o.value === id) || [...s.options].find(o => key && o.value === 'combo:' + key);
      if (o){ s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } }, loanId);
    await page.waitForTimeout(600);
    await page.waitForFunction(() => { const b = document.getElementById('refiBtn'); return b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
    await page.click('#refiBtn').catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('#refiView [data-refiverdict]').length > 0, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (!(await page.evaluate(() => { const b = document.querySelector('#refiView [data-refideal="extend"]'); return !!(b && b.classList.contains('bg-violet-600')); }))) {
      await page.click('#refiView [data-refideal="extend"]'); await page.waitForTimeout(1500); }
  };
  const setExt = async (f, v, mem) => { const sel = '#refiView ' + (mem ? '[data-refiextm="' + mem + '"]' : ':not([data-refiextm])') + '[data-refiextf="' + f + '"]';
    await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'change'); await page.waitForTimeout(1500); };
  const info = (id) => page.evaluate((id) => { const l = window.LDS_loans().find(x => x._id === id); const xs = []; let e = l && l.extension; while (e){ xs.unshift(e); e = e.before && e.before.extension; }
    return { n: xs.length, maturity: l.maturityDate, status: l.loanStatus || '', pp: (l.principalPayments || []).length, dates: xs.map(x => x.date), spreads: xs.map(x => Math.round((x.spread || 0) * 10000)) }; }, id);
  const verdict = () => page.evaluate(() => { const l = window.LDS_activeLoan(), v = window.LDS_refiExtVerdict(l); return v && v.r ? { kind: v.kind, date: v.r.terms.date, newMaturity: v.r.newMaturity, oldMaturity: v.r.oldMaturity, rate: v.r.rate } : null; });
  const saveOne = async () => { await page.click('#refiExtSaveBtn'); await confirm(); await page.waitForTimeout(1500); };

  // ---- A: one loan, extended three times ----
  await openRefiOf('ln_elm');
  const a0 = await info('ln_elm');
  await setExt('months', 3);
  let v1 = await verdict();
  ok(v1 && v1.kind === 'yes', 'A  first extension (3 months): Extend (' + (v1 && v1.kind) + ')');
  await saveOne();
  let a1 = await info('ln_elm');
  ok(a1.n === 1 && a1.status === 'Extended' && a1.maturity === v1.newMaturity, 'A  saved: 1 extension, maturity ' + a0.maturity + ' → ' + a1.maturity);

  await openRefiOf('ln_elm');
  let v2 = await verdict();
  let ui = await page.evaluate(() => ({ saved: !!document.querySelector('#refiView [data-refiext="saved"]'), boxes: [...document.querySelectorAll('#refiView [data-refiverdict]')].map(b => b.getAttribute('data-refiverdict')),
    btn: (document.getElementById('refiExtSaveBtn') || {}).textContent || '' }));
  ok(ui.saved && v2 && v2.kind === 'yes' && v2.oldMaturity === a1.maturity && v2.date > a1.dates[0], 'A  an extended loan can be extended again: the saved box, then the next one, from ' + (v2 && v2.date) + ' (after ' + a1.dates[0] + ')');
  ok(ui.boxes[0] === 'extended' && ui.boxes[1] === 'extend' && /Save another extension/.test(ui.btn), 'A  …“' + ui.btn.trim() + '” (' + ui.boxes.join(', ') + ')');
  // a date before the saved one is refused; the stored date doesn't change
  await setExt('date', a1.dates[0]);
  const after = await page.evaluate(() => { const r = window.LDS_refiRec(window.LDS_activeLoan()); return r && r.ext && r.ext.date; });
  const vd = (await verdict()).date;
  ok(after !== a1.dates[0] && vd === v2.date, 'A  a date on or before the saved extension’s (' + a1.dates[0] + ') is refused: not kept, the next one still starts ' + vd);
  // the second at today's lender's new quote (the first kept the loan's own 4.90%, the default since 2026-11-02)
  await page.selectOption('#refiView select:not([data-refiextm])[data-refiextf="rateHow"]', 'quote'); await page.dispatchEvent('#refiView select:not([data-refiextm])[data-refiextf="rateHow"]', 'change'); await page.waitForTimeout(1500);
  await setExt('spreadBps', 400);
  v2 = await verdict();
  await saveOne();
  let a2 = await info('ln_elm');
  ok(a2.n === 2 && a2.maturity === v2.newMaturity && a2.dates[1] > a2.dates[0] && a2.spreads[1] === 400, 'A  second extension saved: 2 extensions, maturity ' + a2.maturity + ', its own spread (' + a2.spreads.join(', ') + ' bps)');

  await openRefiOf('ln_elm');
  let v3 = await verdict();
  ok(v3 && v3.kind === 'yes', 'A  …and a third (' + (v3 && v3.kind) + ')');
  await saveOne();
  let a3 = await info('ln_elm');
  ok(a3.n === 3 && a3.maturity === v3.newMaturity && a3.pp === 0, 'A  third extension saved: 3 extensions, maturity ' + a3.maturity);
  // the schedule runs each extension in turn: one balance throughout, each on its own rate, to $0 at the new maturity
  const sc = await page.evaluate(() => { const l = window.LDS_loans().find(x => x._id === 'ln_elm'), c = window.LDS_compute(l), rows = c.rows;
    let gap = 0; for (let i = 1; i < rows.length; i++) gap = Math.max(gap, Math.abs(rows[i].startingBalance - rows[i - 1].endingBalance));
    const starts = rows.map((r, i) => r.extStart ? i : -1).filter(i => i >= 0);
    return { starts: starts, gap: gap, last: rows[rows.length - 1].endingBalance, n: rows.length, nan: rows.some(r => !isFinite(r.payment) || !isFinite(r.endingBalance)),
      p0: starts.length ? rows[starts[0] - 1].payment : null, p1: starts.length ? rows[starts[0]].payment : null, t0: starts.length ? rows[starts[0] - 1].type : '', t1: starts.length ? rows[starts[0]].type : '',
      r1: starts.length > 1 ? rows[starts[0]].rate : null, r2: starts.length > 1 ? rows[starts[1]].rate : null, r3: starts.length > 2 ? rows[starts[2]].rate : null, mat: c.derived.maturityDate }; });
  ok(sc.starts.length === 3 && sc.starts[0] < sc.starts[1] && sc.starts[1] < sc.starts[2], 'A  the schedule marks where each extension starts (rows ' + sc.starts.map(i => i + 1).join(', ') + ')');
  ok(sc.t0 === 'amort' && sc.t1 === 'amort' && near(sc.p0, sc.p1, 15), 'A  the first extension keeps the loan’s own terms: amortizing, the same payment before and after it starts (' + (sc.p0 || 0).toFixed(2) + ' → ' + (sc.p1 || 0).toFixed(2) + ')');
  ok(sc.gap < 0.01 && Math.abs(sc.last) < 0.01 && !sc.nan, 'A  …one balance throughout (largest gap ' + sc.gap.toFixed(4) + '), $0 at the end');
  ok(near(sc.r1, 0.049, 1e-9) && a3.spreads[1] === 400 && a3.spreads[2] === 400 && near(sc.r2, sc.r3, 1e-9) && Math.abs(sc.r2 - sc.r1) > 0.001, 'A  …each extension on its own rate: the first the loan’s own, then today’s lender’s quote (' + [sc.r1, sc.r2, sc.r3].map(r => (r * 100).toFixed(3) + '%').join(' → ') + ')');
  await openRefiOf('ln_elm');
  ui = await page.evaluate(() => ({ rows: document.querySelectorAll('#refiView [data-refiextsavedrow]').length, title: (document.querySelector('#refiView [data-refiext="saved"]') || {}).textContent || '',
    undo: ((document.querySelector('#refiView [data-refiext="saved"] [data-refiextundo]') || {}).textContent || '').trim() }));
  ok(ui.rows === 3 && /3 times/.test(ui.title) && ui.undo === 'Undo the latest extension', 'A  the saved box lists all 3, “Extended … 3 times”, with “' + ui.undo + '”');

  // ---- B: Undo takes back only the latest ----
  await page.click('#refiView [data-refiext="saved"] [data-refiextundo]'); await confirm(); await page.waitForTimeout(1500);
  let b = await info('ln_elm');
  ok(b.n === 2 && b.maturity === a2.maturity && b.status === 'Extended', 'B  Undo: back to 2 extensions, maturity ' + b.maturity);
  await openRefiOf('ln_elm');
  await page.click('#refiView [data-refiext="saved"] [data-refiextundo]'); await confirm(); await page.waitForTimeout(1500);
  b = await info('ln_elm');
  ok(b.n === 1 && b.maturity === a1.maturity && b.dates[0] === a1.dates[0], 'B  Undo again: back to the first extension, maturity ' + b.maturity);

  // ---- C: the assistant ----
  await openRefiOf('ln_elm');
  const card = await page.evaluate(() => Promise.resolve(window.LDS_asstAction({ action: 'save_extension', args: { name: 'Elm Terrace' } })).then(x => ({ ok: !!(x && (x.pending || x.ok)), msg: (x && x.msg) || '' })));
  await page.evaluate(() => { const b = [...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove')].pop(); if (b) b.click(); }); await page.waitForTimeout(1800);
  let c = await info('ln_elm');
  ok(card.ok && !/already/.test(card.msg) && c.n === 2, 'C  save_extension on an extended loan saves another (' + c.n + ' extensions)');
  await page.evaluate(() => Promise.resolve(window.LDS_asstAction({ action: 'undo_extension', args: { name: 'Elm Terrace' } })));
  await page.evaluate(() => { const b = [...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove')].pop(); if (b) b.click(); }); await page.waitForTimeout(1500);
  c = await info('ln_elm');
  ok(c.n === 1 && c.maturity === a1.maturity, 'C  undo_extension takes back only the latest (' + c.n + ' left, maturity ' + c.maturity + ')');
  await openRefiOf('ln_elm');
  await page.click('#refiView [data-refiext="saved"] [data-refiextundo]'); await confirm(); await page.waitForTimeout(1500);
  c = await info('ln_elm');
  ok(c.n === 0 && c.maturity === a0.maturity && c.status !== 'Extended' && c.pp === a0.pp, 'C  the last Undo: no extension, back to ' + c.maturity);

  // ---- D: a senior + mezzanine, extended twice together ----
  await openRefiOf('ln_sr');
  const pk = () => page.evaluate(() => window.LDS_refiExtPkg(window.LDS_activeLoan()));
  await setExt('months', 3, 'ln_sr'); await setExt('months', 3, 'ln_mz');
  let X = await pk();
  ok(X.yes === 2, 'D  the package: both loans to extend (' + X.yes + ')');
  await saveOne();
  let d1s = await info('ln_sr'), d1m = await info('ln_mz');
  ok(d1s.n === 1 && d1m.n === 1, 'D  saved together: 1 extension each');
  await openRefiOf('ln_sr');
  X = await pk();
  const pkUi = await page.evaluate(() => ({ again: document.querySelectorAll('#refiView [data-refiextagain]').length, btn: (document.getElementById('refiExtSaveBtn') || {}).textContent || '' }));
  ok(X.yes === 2 && X.list.every(x => x.saved) && pkUi.again === 2 && /Save the extensions \(2\)/.test(pkUi.btn), 'D  …and both can be extended again (“Extend again” on each, ' + pkUi.btn.trim() + ')');
  await saveOne();
  let d2s = await info('ln_sr'), d2m = await info('ln_mz');
  ok(d2s.n === 2 && d2m.n === 2 && d2s.maturity > d1s.maturity && d2m.maturity > d1m.maturity, 'D  saved again: 2 extensions each (' + d2s.maturity + ', ' + d2m.maturity + ')');
  await openRefiOf('ln_sr');
  const ua = ((await page.evaluate(() => (document.querySelector('#refiView [data-refiextundoall]') || {}).textContent)) || '').trim();
  await page.click('#refiView [data-refiextundoall]'); await confirm(); await page.waitForTimeout(1500);
  const u2s = await info('ln_sr'), u2m = await info('ln_mz');
  ok(/latest/.test(ua) && u2s.n === 1 && u2m.n === 1 && u2s.maturity === d1s.maturity && u2m.maturity === d1m.maturity, 'D  “' + ua + '”: each loan back to its first extension');

  ok(s.errors.length === 0, 'no page errors' + (s.errors.length ? ': ' + s.errors.join(' | ') : ''));
  await s.app.close();
  console.log(fails.n ? fails.n + ' FAILED' : 'all refi-extend-again checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
