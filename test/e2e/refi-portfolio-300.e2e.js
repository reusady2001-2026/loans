/* 3.0.0 — the refinance fixes from the 2026-10-13 meeting, on 5 made-up properties with 6 loans (test/e2e/pool/fixture.js).
   P1–P6: refinancing several properties together never counts a property with no NOI as $0 — each property's NOI and its
   source are shown, and the ones with none are named.
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
  const bad = results.filter(r => !r.pass).length;
  console.log('\n3.0.0 refinance fixes: ' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
