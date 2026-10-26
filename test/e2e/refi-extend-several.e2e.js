/* e2e — extend with today's lender on several properties (the operator, 2026-10-26: "extend with today's lender for one
   loan, no matter how many properties"; "you should be able to do new loans and extend with today's lenders on a couple
   of properties together. It should work."). A made-up book, every loan maturing 8 months from today:
   A  a pooled loan on 3 properties (Maple Court, Birch Gardens, Cedar Point): Extend is open; it is sized on the three
      properties' NOI together; Save makes the same record Extended (new maturity, history); Undo puts it back
   B  a senior + mezzanine on Dogwood Flats: New loan (one for all) still works; "Extend with today's lenders" judges each
      loan with its own lender — the senior on the property's NOI, the mezzanine behind it (the limits on the two
      together, less the senior's extended amount, worked out here by hand); each loan's own terms (the mezz's spread)
      are kept with the package, with a history entry naming the loan; Save the extensions saves both; Undo all
   C  a portfolio of two properties with a loan each (Elm Terrace, Control Tower), from "Create a portfolio": New loan
      works, and Extend sizes each loan on its own property; saved together
   D  the assistant: a package's summary, set_extension on the mezzanine, save_extension saves the package
   Run: GN=/opt/node22/lib/node_modules LDS_CLOUD_OFF=1 xvfb-run -a /opt/node22/bin/node test/e2e/refi-extend-several.e2e.js */
const path = require('path');
const APP = path.resolve(__dirname, '..', '..');
const L = require('./pool/lib'), F = require('./pool/fixture');
const RX = require(path.join(APP, 'refi-extend.js'));
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const near = (a, b, t) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (t == null ? 0.02 : t);

const t = new Date(), iso = (y, m) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), my = t.getUTCFullYear(), mm = t.getUTCMonth() + 8;
const LN = (id, name, addr, amt, rate, extra) => F.loan(id, Object.assign({ propertyName: name, propertyAddress: addr, lenderName: 'Bank ' + id.slice(3), loanNumber: id.toUpperCase(),
  originalAmount: amt, annualRate: rate, rateType: 'Fixed', originationDate: iso(my - 10, mm), firstPaymentDate: iso(my - 10, mm + 1), maturityDate: iso(my, mm), loanTermMonths: 120, amortizationMonths: 360 }, extra || {}));
const P = F.PROPS, MAPLE = P[0], BIRCH = P[1], CEDAR = P[2], DOG = P[3], ELM = P[4], CTRL = F.CONTROL;
const BOOK = { loans: [
  LN('ln_pool', MAPLE.name, MAPLE.addr, 24000000, 0.045, { lenderName: 'Pool Bank', alsoSecures: BIRCH.name + ' = 10000000; ' + CEDAR.name + ' = 9000000' }),
  LN('ln_sr', DOG.name, DOG.addr, 14000000, 0.05, { lenderName: 'Senior Bank' }),
  LN('ln_mz', DOG.name + ' (Mezz)', DOG.addr, 8000000, 0.09, { lenderName: 'Mezz Fund', lienPosition: 'Mezzanine' }),   // big enough to need a pay-down behind its senior
  LN('ln_elm', ELM.name, ELM.addr, 4000000, 0.049, { lenderName: 'Elm Bank' }),
  LN('ln_ctl', CTRL.name, CTRL.addr, 8000000, 0.05, { lenderName: 'Control Bank' })
] };

(async () => {
  const s = await L.boot(APP, BOOK.loans), page = s.page;
  await L.setNOIs(page, [MAPLE, BIRCH, CEDAR, DOG, ELM, CTRL]); await page.waitForTimeout(600);
  const confirm = () => L.confirmIfAsked(page);
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
  const pickDeal = async (v) => { await page.click('#refiView [data-refideal="' + v + '"]'); await page.waitForTimeout(1500); };
  const loanOf = (id) => page.evaluate((id) => { const l = window.LDS_loans().find(x => x._id === id); return l ? { status: l.loanStatus || '', maturity: l.maturityDate, ext: !!l.extension, spread: l.spread, rateType: l.rateType, hist: (l._history || l.history || []).length } : null; }, id);

  // ---- A: one loan on three properties ----
  await openRefiOf('ln_pool');
  let a = await page.evaluate(() => { const b = document.querySelector('#refiView [data-refideal="extend"]'); return { exists: !!b, disabled: !!(b && b.disabled), text: b ? b.textContent : '' }; });
  ok(a.exists && !a.disabled, 'A  a pooled loan (one loan, 3 properties): “Extend with today’s lender” can be picked');
  await pickDeal('extend');
  const before = await loanOf('ln_pool');
  a = await page.evaluate(() => { const l = window.LDS_activeLoan(), r = window.LDS_refiExtResult(l), v = window.LDS_refiExtVerdict(l);
    return { id: l && l._id, kind: v && v.kind, verdict: (document.querySelector('#refiView [data-refiverdict]') || {}).getAttribute && document.querySelector('#refiView [data-refiverdict]').getAttribute('data-refiverdict'),
      r: r ? { noi: r.noi, value: r.value, rate: r.rate, owed: r.owed, allowed: r.allowed, amortMonths: r.terms.amortMonths, limits: r.limits } : null, save: !!document.getElementById('refiExtSaveBtn') }; });
  const poolNOI = MAPLE.noi + BIRCH.noi + CEDAR.noi;
  ok(a.r && near(a.r.noi, poolNOI, 1), 'A  …sized on the three properties’ NOI together (' + (a.r && Math.round(a.r.noi)) + ' = ' + poolNOI + ')');
  if (a.r) { const sz = RX.size({ noi: a.r.noi, value: a.r.value, rate: a.r.rate, amortMonths: a.r.amortMonths, limits: a.r.limits, off: a.r.limits.off });
    ok(near(a.r.allowed, sz.maxLoan, 1), 'A  …what today’s lender allows is the engine’s sizing of that NOI (' + Math.round(a.r.allowed) + ')'); }
  ok(a.kind === 'yes' && /extend/.test(a.verdict || '') && a.save, 'A  …it matures within 12 months: “Extend with today’s lender”, with Save (' + a.kind + ')');
  await page.click('#refiExtSaveBtn'); await confirm(); await page.waitForTimeout(1200);
  let after = await loanOf('ln_pool');
  ok(after.ext && after.status === 'Extended' && after.maturity > before.maturity && after.rateType === 'Floating', 'A  Save: the same loan record is Extended, maturing ' + after.maturity + ' (was ' + before.maturity + ')');
  await openRefiOf('ln_pool');
  ok(await page.evaluate(() => !!document.querySelector('#refiView [data-refiext="saved"]')), 'A  its refinance shows the saved extension, with Undo');
  await page.click('#refiView [data-refiextundo]'); await confirm(); await page.waitForTimeout(1200);
  after = await loanOf('ln_pool');
  ok(!after.ext && after.maturity === before.maturity && after.status !== 'Extended', 'A  Undo: back to its terms before (maturity ' + after.maturity + ')');

  // ---- B: a senior + mezzanine on one property ----
  await openRefiOf('ln_sr');
  let b = await page.evaluate(() => { const l = window.LDS_activeLoan(); const n = document.querySelector('#refiView [data-refideal="new"]'), x = document.querySelector('#refiView [data-refideal="extend"]');
    return { combined: !!(l && l._combined), newTxt: n ? n.textContent : '', extTxt: x ? x.textContent : '', extOff: !!(x && x.disabled), verdict: (document.querySelector('#refiView [data-refiverdict]') || {}).getAttribute && document.querySelector('#refiView [data-refiverdict]').getAttribute('data-refiverdict') }; });
  ok(b.combined && /New loan/.test(b.newTxt) && b.verdict && !/^extend/.test(b.verdict), 'B  a senior + mezz opens as one package; New loan (one for all) works (' + b.verdict + ')');
  ok(/today’s lenders/.test(b.extTxt) && !b.extOff, 'B  “Extend with today’s lenders” can be picked');
  await pickDeal('extend');
  const pk = () => page.evaluate(() => window.LDS_refiExtPkg(window.LDS_activeLoan()));
  let X = await pk();
  const sr = X.list.find(x => x.id === 'ln_sr'), mz = X.list.find(x => x.id === 'ln_mz');
  b = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#refiView [data-refiextrow]')].map(r => r.getAttribute('data-refiextrow')), ahead: (document.querySelector('#refiView [data-refiextmember="ln_mz"] [data-refiextahead]') || {}).textContent || '',
    srAhead: !!document.querySelector('#refiView [data-refiextmember="ln_sr"] [data-refiextahead]'), cards: document.querySelectorAll('#refiView [data-refiextmember]').length, limits: !!document.querySelector('#refiView [data-refiextpkglimits]') }));
  ok(JSON.stringify(b.rows) === '["ln_sr","ln_mz"]' && b.cards === 2 && b.limits, 'B  the package lists both loans (senior first), each with its own terms, and the limits once');
  ok(sr && sr.r && near(sr.r.noi, DOG.noi, 1) && !sr.r.ahead, 'B  the senior is sized on the property’s NOI alone (' + (sr && sr.r && Math.round(sr.r.noi)) + ')');
  if (sr && sr.r && mz && mz.r) {
    const want = RX.size({ noi: mz.r.noi, value: mz.r.value, rate: mz.r.rate, amortMonths: mz.r.amortMonths, limits: mz.r.limits, off: mz.r.limits.off, ahead: { amount: sr.r.amount, constant: sr.r.constant, rate: sr.r.rate } });
    ok(mz.r.ahead && near(mz.r.ahead.amount, sr.r.amount, 1) && near(mz.r.allowed, want.maxLoan, 1) && /comes first/.test(b.ahead) && !b.srAhead,
      'B  the mezzanine is sized behind its senior: the limits on the two together, less the senior’s ' + Math.round(sr.r.amount) + ' — allows ' + Math.round(mz.r.allowed) + ' (by hand ' + Math.round(want.maxLoan) + ')');
  } else ok(false, 'B  both loans have an extension result');
  // the mezzanine's own spread: kept with the package, history names the loan; the senior is unchanged
  const srSpread0 = sr && sr.r && sr.r.spreadBps;
  await page.fill('#refiView [data-refiextm="ln_mz"][data-refiextf="spreadBps"]', '650'); await page.dispatchEvent('#refiView [data-refiextm="ln_mz"][data-refiextf="spreadBps"]', 'change'); await page.waitForTimeout(1800);
  X = await pk();
  const mz2 = X.list.find(x => x.id === 'ln_mz'), sr2 = X.list.find(x => x.id === 'ln_sr');
  const rec = await page.evaluate(async () => { const l = window.LDS_activeLoan(), k = window.LDS_refiHomeKey(l); await new Promise(r => setTimeout(r, 400)); const bb = await window.LDS_readAssumptions(k), h = await window.LDS_propHistory(k);
    return { m: bb && bb.refi && bb.refi[l._id] && bb.refi[l._id].ext && bb.refi[l._id].ext.members, hist: (h.entries || []).filter(e => /Refinance · extension · .*Mezz/.test(e.label)).map(e => e.label + ': ' + e.new) }; });
  ok(mz2 && mz2.r && mz2.r.spreadBps === 650 && sr2 && sr2.r && sr2.r.spreadBps === srSpread0 && rec.m && rec.m.ln_mz && rec.m.ln_mz.spreadBps === 650,
     'B  the mezzanine’s spread (650 bps) is its own, kept with the package; the senior’s stays ' + srSpread0);
  ok(rec.hist.length >= 1, 'B  …with a history entry naming the loan (' + (rec.hist[0] || '') + ')');
  b = await page.evaluate(() => ({ foot: (document.querySelector('#refiView [data-refiextpkgpay]') || {}).textContent || '', btn: (document.getElementById('refiExtSaveBtn') || {}).textContent || '' }));
  X = await pk();
  ok(X.yes === 2 && near(L.parseMoney(b.foot), X.payDown, 0.6) && /Save the extensions \(2\)/.test(b.btn), 'B  both should extend now; the pay-down in all is shown (' + b.foot.trim() + '), and “' + b.btn.trim() + '”');
  { const s2 = X.list.find(x => x.id === 'ln_sr'), m2 = X.list.find(x => x.id === 'ln_mz');
    ok(s2.r.payDown === 0 && m2.r.payDown > 1000 && near(m2.r.payDown, m2.r.owed - m2.r.allowed, 1) && near(X.payDown, s2.r.payDown + m2.r.payDown, 1) && /pay down \$/.test(b.btn),
       'B  the senior needs no pay-down; the mezzanine pays down ' + Math.round(m2.r.payDown) + ' = what it owes less what fits behind its senior; the total is the sum'); }
  const bSr = await loanOf('ln_sr'), bMz = await loanOf('ln_mz');
  await page.click('#refiExtSaveBtn'); await confirm(); await page.waitForTimeout(1500);
  const aSr = await loanOf('ln_sr'), aMz = await loanOf('ln_mz');
  const mzPaid = await page.evaluate(() => { const l = window.LDS_loans().find(x => x._id === 'ln_mz'); return (l.principalPayments || []).reduce((a, p) => a + (p.amount || 0), 0); });
  ok(mzPaid > 1000 && near(mzPaid, (X.list.find(x => x.id === 'ln_mz').r || {}).payDown, 1), 'B  the mezzanine’s pay-down (' + Math.round(mzPaid) + ') is recorded on its own schedule');
  ok(aSr.ext && aMz.ext && aSr.status === 'Extended' && aMz.status === 'Extended' && aSr.maturity > bSr.maturity && aMz.maturity > bMz.maturity && near(aMz.spread, 0.065, 1e-9),
     'B  Save the extensions: both loans stay their own records, Extended (' + aSr.maturity + ', ' + aMz.maturity + '), the mezzanine at its own spread');
  b = await page.evaluate(() => ({ verdict: (document.querySelector('#refiView [data-refiextpkg]') || {}).getAttribute && document.querySelector('#refiView [data-refiextpkg]').getAttribute('data-refiverdict'), undo: !!document.querySelector('#refiView [data-refiextundoall]') }));
  ok(b.verdict === 'extended' && b.undo, 'B  the package now reads “Extended with today’s lenders”, with Undo');
  await page.click('#refiView [data-refiextundoall]'); await confirm(); await page.waitForTimeout(1500);
  const uSr = await loanOf('ln_sr'), uMz = await loanOf('ln_mz');
  ok(!uSr.ext && !uMz.ext && uSr.maturity === bSr.maturity && uMz.maturity === bMz.maturity, 'B  Undo all: both loans back to their terms before');

  // ---- C: a portfolio of two properties, each with its own loan ----
  await L.goHome(page);
  const opened = await page.evaluate((names) => { const b = document.getElementById('poolRefiBtn'); if (!b) return false; b.click(); return true; }, []);
  await page.waitForTimeout(500);
  await page.evaluate((names) => { document.querySelectorAll('#poolPicker [data-poolpick]').forEach(cb => { const sp = cb.parentElement.querySelector('span'); const t = (sp ? sp.textContent : cb.parentElement.textContent).trim(); if (names.indexOf(t) >= 0) cb.checked = true; }); const g = document.getElementById('poolPickGo'); if (g) g.click(); }, [ELM.name, CTRL.name]);
  await page.waitForFunction(() => document.querySelectorAll('#refiView [data-refiverdict]').length > 0, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  let c = await page.evaluate(() => { const l = window.LDS_activeLoan(); return { id: l && l._id, multi: !!(l && /^multi:/.test(l._id)), verdict: (document.querySelector('#refiView [data-refiverdict]') || {}).getAttribute && document.querySelector('#refiView [data-refiverdict]').getAttribute('data-refiverdict') }; });
  ok(opened && c.multi && c.verdict && !/^extend/.test(c.verdict), 'C  “Create a portfolio” of two properties opens one package; New loan works (' + c.verdict + ')');
  await pickDeal('extend');
  X = await pk();
  const elm = X.list.find(x => x.id === 'ln_elm'), ctl = X.list.find(x => x.id === 'ln_ctl');
  ok(X.list.length === 2 && elm && elm.r && ctl && ctl.r && near(elm.r.noi, ELM.noi, 1) && near(ctl.r.noi, CTRL.noi, 1) && !elm.r.ahead && !ctl.r.ahead,
     'C  “Extend with today’s lenders”: each loan sized on its own property (' + (elm && elm.r && Math.round(elm.r.noi)) + ', ' + (ctl && ctl.r && Math.round(ctl.r.noi)) + ')');
  if (X.yes) { await page.click('#refiExtSaveBtn'); await confirm(); await page.waitForTimeout(1500); }
  const cE = await loanOf('ln_elm'), cC = await loanOf('ln_ctl');
  ok(X.yes === 2 && cE.ext && cC.ext, 'C  saved together: both loans Extended (' + cE.maturity + ', ' + cC.maturity + ')');

  // ---- D: the assistant ----
  await openRefiOf('ln_sr');
  const sum = await page.evaluate(() => Promise.resolve(window.LDS_asstAction({ action: 'start_refinance', args: { name: 'Dogwood Flats' } })).then(x => (x && x.msg) || ''));
  ok(/Extend with today’s lenders: /.test(sum) && /Dogwood Flats \(Mezz\)/.test(sum), 'D  the assistant’s summary of the package names each loan’s extension (' + sum.slice(sum.indexOf('Extend with'), sum.indexOf('Extend with') + 90) + '…)');
  const card = await page.evaluate(() => Promise.resolve(window.LDS_asstAction({ action: 'set_extension', args: { name: 'Dogwood Flats (Mezz)', changes: { months: 24 } } })).then(x => ({ pending: !!(x && x.pending), msg: (x && x.msg) || '' })));
  await page.evaluate(() => { const b = [...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove')].pop(); if (b) b.click(); }); await page.waitForTimeout(1500);
  X = await pk();
  const mzA = X.list.find(x => x.id === 'ln_mz');
  ok(mzA && mzA.r && await page.evaluate(() => { const l = window.LDS_activeLoan(); const r = window.LDS_refiRec(l); return !!(r && r.ext && r.ext.members && r.ext.members.ln_mz && r.ext.members.ln_mz.months === 24); }), 'D  set_extension on the mezzanine: its months (24) are kept with the package');
  await page.evaluate(() => Promise.resolve(window.LDS_asstAction({ action: 'save_extension', args: { name: 'Dogwood Flats' } })));
  await page.evaluate(() => { const b = [...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove')].pop(); if (b) b.click(); }); await page.waitForTimeout(1800);
  const dS = await loanOf('ln_sr'), dM = await loanOf('ln_mz');
  ok(dS.ext && dM.ext, 'D  save_extension saves the package: both loans Extended');

  ok(s.errors.length === 0, 'no page errors' + (s.errors.length ? ': ' + s.errors.join(' | ') : ''));
  await s.app.close();
  console.log(fails.n ? fails.n + ' FAILED' : 'all refi-extend-several checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
