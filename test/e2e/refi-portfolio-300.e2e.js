/* 3.0.0 — the refinance fixes from the 2026-10-13 meeting, on 5 made-up properties with 6 loans (test/e2e/pool/fixture.js).
   P1–P6: refinancing several properties together never counts a property with no NOI as $0 — each property's NOI and its
   source are shown, and the ones with none are named.
   Q1–Q7: one property — the proposed rate starts at a real spread shown as index + spread; today's loan vs the proposed
   loan are labeled and the size uses only the proposed rate; "supports $X" is broken down (NOI and source, rate,
   payment, each limit's loan, the binding one); the lender's limits (amortizing and interest-only coverage, LTV, debt
   yield) are typed per refinance and kept.
   R1–R4: a loan can be marked out of date (Terrazul Sweetwater) — its page, Needs Attention and its refinance say so,
   no figure changes, and it can be cleared. T1: the feature is called "Create a portfolio".
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-portfolio-300.e2e.js */
const L = require('./pool/lib'), F = require('./pool/fixture'), path = require('path');
const APP = path.resolve(__dirname, '..', '..');
const results = [];
const rec = (id, pass, detail) => { results.push({ id, pass }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' — ' + detail); };
const money = (n) => n == null ? 'null' : '$' + Math.round(n).toLocaleString('en-US');
const NO_NOI = 'Elm Terrace';
const WITH = F.PROPS.filter(p => p.name !== NO_NOI), SUM4 = WITH.reduce((a, p) => a + p.noi, 0), SUM5 = F.PROPS.reduce((a, p) => a + p.noi, 0);

async function openPicker(page) {
  await L.goHome(page);
  await page.evaluate(() => document.getElementById('poolRefiBtn').click());
  await page.waitForTimeout(400);
}
async function tick(page, names) {
  return page.evaluate((names) => { document.querySelectorAll('#poolPicker [data-poolpick]').forEach(cb => { const t = cb.parentElement.querySelector('span').textContent.trim();
    if (names.indexOf(t) >= 0) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
    return { note: document.getElementById('poolPickNote').textContent,
      rows: [...document.querySelectorAll('#poolPicker [data-poolpickrow]')].map(r => ({ name: r.querySelector('span').textContent.trim(), noi: (r.querySelector('[data-poolpicknoi]') || {}).textContent || '' })) }; }, names);
}
async function refiState(page) {
  return page.evaluate(() => { const v = document.getElementById('refiView'), l = window.LDS_activeLoan();
    const rows = [...v.querySelectorAll('[data-refipoolnoi]')].map(tr => [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim()));
    return { id: l && l._id, noi: l ? window.LDS_refiNOI(l) : null, rows, total: (v.querySelector('[data-refipooltotal]') || {}).textContent || '',
      missing: (v.querySelector('[data-refipoolmissing]') || {}).textContent || '', noNoi: (v.querySelector('[data-refinonoi]') || {}).textContent || '',
      verdict: (v.querySelector('[data-refiverdict]') || {}).getAttribute ? v.querySelector('[data-refiverdict]').getAttribute('data-refiverdict') : null,
      text: v.innerText.replace(/\s+/g, ' ') }; });
}

(async () => {
  const s = await L.boot(APP, F.bookR());
  try {
    await L.setNOIs(s.page, WITH.concat([F.CONTROL]));
    await L.setNOIs(s.page, [{ name: NO_NOI, addr: F.PROPS[4].addr, noi: '' }]);   // the fifth has no T12 and nothing typed
    await s.page.waitForTimeout(400);
    // P1 — the picker shows each property's NOI and its source, and names the one with none
    await openPicker(s.page);
    const pk = await tick(s.page, F.PROPS.map(p => p.name));
    const elmRow = pk.rows.find(r => r.name === NO_NOI), maple = pk.rows.find(r => r.name === 'Maple Court');
    rec('P1 picker: each property\'s NOI and source; the one with none is named', /no NOI/.test(elmRow && elmRow.noi) && /\$1,000,000/.test(maple && maple.noi) && /override/.test(maple.noi) && new RegExp('no NOI for ' + NO_NOI).test(pk.note) && !/NOI \$/.test(pk.note.replace(/NOI \$[\d,]+ ·/g, '')),
      'Maple row "' + (maple && maple.noi) + '", Elm row "' + (elmRow && elmRow.noi) + '", note "' + pk.note + '"');
    await s.page.evaluate(() => document.getElementById('poolPickGo').click());
    await s.page.waitForTimeout(1800);
    // P2 — the refinance lists all 5 with their NOI and source; Elm Terrace has none
    let r = await refiState(s.page);
    const elm = r.rows.find(x => x[0] === NO_NOI), mp = r.rows.find(x => x[0] === 'Maple Court');
    rec('P2 refinance: NOI by property, 5 rows with the source', r.rows.length === 5 && mp && /\$1,000,000/.test(mp[1]) && /override/.test(mp[2]) && elm && /no NOI/.test(elm[1]) && /no T12/.test(elm[2]),
      r.rows.map(x => x.join(' | ')).join(' ; '));
    // P3 — nothing is sized while one property has no NOI: no $0 sum, the property is named
    rec('P3 no NOI → not sized, never $0, the property named', r.noi == null && r.total.trim() === '—' && new RegExp(NO_NOI).test(r.missing) && new RegExp(NO_NOI).test(r.noNoi) && !/These \d+ properties support/.test(r.text),
      'refiNOI ' + money(r.noi) + ' (the 4 with NOI sum to ' + money(SUM4) + '), total "' + r.total + '", note "' + r.missing.slice(0, 120) + '", verdict note "' + r.noNoi.slice(0, 120) + '"');
    // P4 — typing its NOI in the table saves it on the property and sizes the package on all 5
    await s.page.evaluate((v) => { const i = document.querySelector('[data-refipooltype]'); i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true })); }, F.PROPS[4].noi);
    await s.page.waitForTimeout(1500);
    r = await refiState(s.page);
    const elm2 = r.rows.find(x => x[0] === NO_NOI);
    rec('P4 typing the missing NOI sizes the package on all 5', L.near(r.noi, SUM5, 1) && elm2 && /\$500,000/.test(elm2[1]) && /typed on the property/.test(elm2[2]) && /\$5,000,000/.test(r.total) && !r.missing && r.verdict != null,
      'refiNOI ' + money(r.noi) + ' (truth ' + money(SUM5) + '), Elm row "' + (elm2 || []).join(' | ') + '", total "' + r.total + '", verdict ' + r.verdict);
    // P5 — the typed NOI is the property's own (its page shows it after closing the refinance)
    const prof = await s.page.evaluate((n) => { const p = window.opProperties().find(x => x.name === n); return p ? window.LDS_profileEffective(p.key, 'noi') : null; }, NO_NOI);
    rec('P5 the typed NOI is saved on the property', prof != null && Number(prof.value != null ? prof.value : prof) === F.PROPS[4].noi, 'profile noi ' + JSON.stringify(prof));
    // P6 — an NOI typed on the property's own loan (no T12) counts too, named as such
    await s.page.evaluate(async (n) => { const p = window.opProperties().find(x => x.name === n); await window.LDS_setProfileField(p.key, 'noi', ''); }, NO_NOI);
    await s.page.evaluate(() => { const b = document.getElementById('refiCloseBtn'); if (b) b.click(); });
    await s.page.waitForTimeout(400);
    const ed = await s.page.evaluate((v) => { const l = window.LDS_getLoan('ln_r6'); if (!l) return false; l.noi = v; return true; }, F.PROPS[4].noi);   // as an Excel row brings it (the loan form has no NOI box)
    await openPicker(s.page);
    const pk2 = await tick(s.page, F.PROPS.map(p => p.name));
    await s.page.evaluate(() => document.getElementById('poolPickGo').click());
    await s.page.waitForTimeout(1800);
    r = await refiState(s.page);
    const elm3 = r.rows.find(x => x[0] === NO_NOI);
    rec('P6 an NOI typed on the property\'s own loan counts, named as such', ed && L.near(r.noi, SUM5, 1) && elm3 && /typed on its loan/.test(elm3[2]) && !/no NOI for/.test(pk2.note),
      'refiNOI ' + money(r.noi) + ' (truth ' + money(SUM5) + '), Elm row "' + (elm3 || []).join(' | ') + '", picker note "' + pk2.note + '"');
    if (s.errors.length) rec('P-err page errors', false, s.errors.slice(0, 3).join(' | ')); else rec('P-err page errors', true, 'none');
  } finally { try { await s.app.close(); } catch (e) {} }
  // Q — one property (Control Tower, NOI $900,000, a 5% fixed loan in Cincinnati): items 2–5
  const q = await L.boot(APP, F.bookR());
  try {
    await L.setNOIs(q.page, F.PROPS.concat([F.CONTROL]));
    await q.page.evaluate(() => { try { localStorage.removeItem('ldsHub.refiLimits.v1'); } catch (e) {} });
    const openRefi = async () => { await L.selectPos(q.page, 'ln_control'); await q.page.waitForTimeout(600);
      await q.page.evaluate(() => document.getElementById('refiBtn').click());
      await q.page.waitForFunction(() => document.querySelectorAll('#refiView [data-rtype]').length > 0, null, { timeout: 8000 }).catch(() => {}); await q.page.waitForTimeout(500); };
    const st = () => q.page.evaluate(() => { const v = document.getElementById('refiView'), l = window.LDS_activeLoan(), d = window.LDS_refiDraft(), c = window.LDS_refiCanNow(l);
      const legs = {}; v.querySelectorAll('[data-refileg]').forEach(tr => { legs[tr.getAttribute('data-refileg')] = { amt: (tr.querySelector('[data-refilegamt]') || {}).textContent || '', binds: /binds/.test(tr.textContent) }; });
      return { rate: window.LDS_refiDraftRate(), curRate: window.LDS_computeBalance ? null : null, type: d && d.rateType, index: d && d.index, base: d && d._baseSpread, eff: d && d._effSpread, from: d && d._spreadFrom,
        fromTxt: (v.querySelector('[data-refispreadfrom]') || {}).textContent || '', max: c.maxLoan, binding: c.binding, legsCalc: c.legs, legs, noi: c.noi,
        basis: ((v.querySelector('[data-refibasis]') || {}).innerText || '').replace(/\s+/g, ' '), atLoan: (v.querySelector('[data-refiatloan]') || {}).textContent || '', text: v.innerText.replace(/\s+/g, ' ') }; });
    const mc = (r) => L.pmt(1, r, 360) * 12; let m2 = null;
    await openRefi();
    let a = await st();
    // Q1 (item 3) — the proposed rate starts at a real spread with its source, never 0
    rec('Q1 fixed proposal starts at the market spread (175 bps, Cincinnati), not 0, and says so', a.type === 'Fixed' && Math.round(a.base * 10000) === 175 && /Cincinnati/.test(a.fromTxt) && /type your lender/.test(a.fromTxt),
      a.type + ' spread ' + Math.round(a.base * 10000) + ' bps, label "' + a.fromTxt + '"');
    await q.page.evaluate(() => document.querySelector('#refiView [data-rtype="Floating"]').click()); await q.page.waitForTimeout(600);
    a = await st();
    rec('Q2 floating starts at SOFR 30-day + 200 bps, shown as index + spread', a.index === 'sofr30' && Math.round(a.base * 10000) === 200 && (m2 = a.basis.match(/30-day Avg SOFR ([\d.]+)%[^+]*\+ (\d+) bps, floating/)) && Math.abs(+m2[1] / 100 + +m2[2] / 10000 - a.rate) < 0.0001 && +m2[2] === Math.round(a.eff * 10000),
      a.index + ' + ' + Math.round(a.base * 10000) + ' bps (after the tier ' + (a.eff * 10000).toFixed(2) + ') = ' + (a.rate * 100).toFixed(4) + '%; basis "' + a.basis.slice(0, 300) + '" — the rate is the index shown + the spread shown');
    // Q3 (item 2) — today's loan vs the proposed loan are labeled; the size uses only the proposed rate
    rec('Q3 labels: today\'s loan vs the proposed loan; sized on the proposed rate only', /Today’s loan rate/.test(a.text) && /Proposed loan rate/.test(a.text) && /Coverage & value — today’s loan/i.test(a.text) && /DSCR today/.test(a.text) && /never today’s loan’s rate/.test(a.basis) && L.near(a.max, Math.min(900000 / (1.25 * mc(a.rate)), 900000 / 0.07, a.legsCalc.LTV), 1),
      'supports ' + money(a.max) + ' (DSCR leg at the proposed ' + (a.rate * 100).toFixed(2) + '%: ' + money(900000 / (1.25 * mc(a.rate))) + ')');
    // Q4 (item 4) — the basis of "supports $X": NOI + source, rate, payment type, each limit's loan, the binding one
    const nBind = Object.keys(a.legs).filter(k => a.legs[k].binds).length;
    rec('Q4 "supports $X" shows NOI and source, rate, payment, each limit\'s loan and which binds', /NOI \$900,000[^—]*— your NOI \(override\)/.test(a.basis) && /amortizing over 30 years/.test(a.basis) && Object.keys(a.legs).length === 4 && nBind === 1 && a.legs[a.binding].binds && /not used/.test(a.legs['DSCR IO'].amt),
      'legs ' + Object.keys(a.legs).map(k => k + ' ' + a.legs[k].amt + (a.legs[k].binds ? ' (binds)' : '')).join(', '));
    // Q5 (item 5) — the lender's limits are typed per analysis: 1.11× amortizing, 1.35× interest-only
    const setLim = async (k, v) => { await q.page.evaluate(([k, v]) => { const i = document.querySelector('[data-refilim="' + k + '"]'); i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]); await q.page.waitForTimeout(500); };
    await setLim('dscr', 1.11); await setLim('dscrIO', 1.35);
    a = await st();
    const amortL = 900000 / (1.11 * mc(a.rate)), ioL = 900000 / (1.35 * a.rate);
    rec('Q5 typed limits: 1.11× amortizing and 1.35× interest-only size the loan', L.near(a.legsCalc.DSCR, amortL, 1) && L.near(a.legsCalc['DSCR IO'], ioL, 1) && L.near(a.max, Math.min(amortL, ioL, 900000 / 0.07, a.legsCalc.LTV), 1) && /interest-only/.test(a.atLoan),
      'amortizing ' + money(a.legsCalc.DSCR) + ' (truth ' + money(amortL) + '), interest-only ' + money(a.legsCalc['DSCR IO']) + ' (truth ' + money(ioL) + '), supports ' + money(a.max) + ' binding ' + a.binding + '; at-loan "' + a.atLoan + '"');
    await q.page.evaluate(() => document.getElementById('refiCloseBtn').click()); await q.page.waitForTimeout(400);
    await openRefi();
    const lim = await q.page.evaluate(() => window.LDS_refiLimits(window.LDS_activeLoan()));
    rec('Q6 the limits stay with this refinance after closing and reopening', lim.dscr === 1.11 && lim.dscrIO === 1.35 && lim.own, JSON.stringify(lim));
    await q.page.evaluate(() => document.querySelector('[data-refilimreset]').click()); await q.page.waitForTimeout(500);
    const lim2 = await q.page.evaluate(() => window.LDS_refiLimits(window.LDS_activeLoan()));
    rec('Q7 "back to 1.25× / 75% / 7%" resets them', lim2.dscr === 1.25 && lim2.dscrIO == null && lim2.ltv === 0.75 && lim2.dy === 0.07 && !lim2.own, JSON.stringify(lim2));
    // R — item 8: a loan whose terms are out of date (Terrazul Sweetwater's construction loan was refinanced; the new
    // loan's documents aren't in yet) is flagged with a note, its figures untouched and nothing made up
    await q.page.evaluate(() => document.getElementById('refiCloseBtn').click()); await q.page.waitForTimeout(400);
    await L.selectPos(q.page, 'ln_control'); await q.page.waitForTimeout(600);
    const before = await q.page.evaluate(() => { const l = window.LDS_getLoan('ln_control'); return JSON.stringify(Object.assign({}, l, { outOfDate: undefined, outOfDateSince: undefined, _history: undefined, history: undefined })); });
    const balBefore = await q.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_control')));
    await q.page.evaluate(() => document.getElementById('loanRecStale').click()); await q.page.waitForTimeout(300);
    await q.page.evaluate(() => { document.getElementById('staleNote').value = 'Refinanced — waiting for the new loan documents'; document.getElementById('staleGo').click(); });
    await q.page.waitForTimeout(700);
    await L.selectPos(q.page, 'ln_control'); await q.page.waitForTimeout(600);
    const s1 = await q.page.evaluate(() => { const l = window.LDS_getLoan('ln_control'), b = document.getElementById('staleBanner');
      return { flag: l.outOfDate, since: l.outOfDateSince, banner: b && !b.hidden ? b.innerText.replace(/\s+/g, ' ') : '', btn: document.getElementById('loanRecStale').textContent.trim() }; });
    const balAfter = await q.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_control')));
    const after = await q.page.evaluate(() => { const l = window.LDS_getLoan('ln_control'); return JSON.stringify(Object.assign({}, l, { outOfDate: undefined, outOfDateSince: undefined, _history: undefined, history: undefined })); });
    rec('R1 "Out of date…" flags the loan with its note; its page says so; no figure changes', /waiting for the new loan documents/.test(s1.flag) && /^\d{4}-\d{2}-\d{2}$/.test(s1.since) && /is out of date/.test(s1.banner) && /don’t rely on them/.test(s1.banner) && s1.btn === 'Up to date again' && balBefore === balAfter && before === after,
      'flag "' + s1.flag + '" since ' + s1.since + '; banner "' + s1.banner.slice(0, 160) + '"; balance ' + money(balBefore) + ' → ' + money(balAfter) + '; other fields ' + (before === after ? 'unchanged' : 'CHANGED'));
    await L.goHome(q.page);
    const rail = await q.page.evaluate(() => (document.getElementById('alertsRail') || {}).innerText || '');
    rec('R2 Needs Attention lists it first', /Control Tower[\s\S]*Out of date/.test(rail) && rail.indexOf('Out of date') < (rail.indexOf('Balloon') < 0 ? 1e9 : rail.indexOf('Balloon')), rail.replace(/\s+/g, ' ').slice(0, 200));
    await openRefi();
    const rs = await q.page.evaluate(() => (document.querySelector('#refiView [data-refistale]') || {}).textContent || '');
    rec('R3 its refinance says the figures are out of date', /out of date/.test(rs) && /This refinance uses those figures/.test(rs), rs.slice(0, 160));
    await q.page.evaluate(() => document.getElementById('refiCloseBtn').click()); await q.page.waitForTimeout(400);
    await L.selectPos(q.page, 'ln_control'); await q.page.waitForTimeout(600);
    await q.page.evaluate(() => document.querySelector('[data-stalefix]').click()); await L.confirmIfAsked(q.page);
    const s2 = await q.page.evaluate(() => { const l = window.LDS_getLoan('ln_control'), b = document.getElementById('staleBanner'); return { flag: l.outOfDate, banner: !!(b && !b.hidden) }; });
    rec('R4 "It’s up to date again" clears it', s2.flag == null && !s2.banner, JSON.stringify(s2));
    // T — item 7: the feature is called "Create a portfolio"
    await L.goHome(q.page);
    const t1 = await q.page.evaluate(() => { const b = document.getElementById('poolRefiBtn'); const t = b ? b.textContent.trim() : ''; if (b) b.click(); return t; });
    await q.page.waitForTimeout(400);
    const t2 = await q.page.evaluate(() => { const m = document.getElementById('poolPicker'); const r = { title: m ? m.querySelector('h3').textContent : '', go: (document.getElementById('poolPickGo') || {}).textContent || '' }; if (m) m.remove(); return r; });
    rec('T1 Home says "Create a portfolio…", and so does the picker', t1 === 'Create a portfolio…' && t2.title === 'Create a portfolio' && t2.go === 'Create the portfolio', 'button "' + t1 + '", title "' + t2.title + '", go "' + t2.go + '"');
    if (q.errors.length) rec('Q-err page errors', false, q.errors.slice(0, 3).join(' | ')); else rec('Q-err page errors', true, 'none');
  } finally { try { await q.app.close(); } catch (e) {} }
  const bad = results.filter(r => !r.pass).length;
  console.log('\n3.0.0 refinance fixes: ' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
