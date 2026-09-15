/* e2e for General Data (v2.8.0 / v2.8.6) — GROUPED (v2.9.0): three scenarios that all begin from the
   same Villages + Crest T12 upload now share ONE Electron launch instead of three:
     A. general-data.json is written with a 24-month rolling history + both NOIs; the underwriting tab
        shows the history card; the refinance calculator gains a working NOI-basis toggle.
     B. disk-read — the cross-session read: clear the in-memory cache, re-read from general-data.json.
     C. backfill — a T12 in the folder with NO general-data.json still recovers both NOIs on load.
   (Was general-data.e2e.js + gd-diskread.e2e.js + gd-backfill.e2e.js.)
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/general-data.e2e.js */
const H = require('./_shared'); const { fs, path } = H;
const CREST = path.join(H.APP, 'test', 'fixtures', 'crest-t12.xlsx');
const UDATA = H.tmp('lds-gd-');
const KEY = 'name:villages of whitewater';
const PROPDIR = H.propDir(UDATA, KEY);
const { fails, ok, section } = H.counter();
const sum = o => Object.keys(o || {}).reduce((a, k) => a + o[k], 0);
function readGD(){
  try { const idx = JSON.parse(fs.readFileSync(path.join(PROPDIR, 'index.json'), 'utf8'));
    const f = (idx.files || []).filter(x => x.role === 'general').sort((a, b) => b.savedAt - a.savedAt)[0];
    return f ? JSON.parse(fs.readFileSync(path.join(PROPDIR, f.stored), 'utf8')) : null;
  } catch (e) { return null; }
}
const uwText = (page) => page.evaluate(() => (document.getElementById('uwView') || {}).innerText || '');
const refiNoiShown = (page) => page.evaluate(() => {
  const dt = [...document.querySelectorAll('#refiView dt')].find(d => /Annual NOI/i.test(d.textContent || ''));
  const dd = dt ? dt.nextElementSibling : null; return dd ? Number((dd.textContent || '').replace(/[^0-9.]/g, '')) : null;
});
const activeBasis = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('#refiView [data-noibasis]')].find(x => /bg-brand-600/.test(x.className));
  return b ? b.getAttribute('data-noibasis') : null;
});
const dscrPair = (page) => page.evaluate(() => {
  const rv = document.getElementById('refiView'); const txt = rv ? rv.innerText || '' : '';
  const dt = [...(rv ? rv.querySelectorAll('dt') : [])].find(d => /^DSCR$/i.test((d.textContent || '').trim()));
  const panel = dt && dt.nextElementSibling ? parseFloat((dt.nextElementSibling.textContent || '').replace(/[^0-9.]/g, '')) : null;
  const m = txt.match(/DSCR\s+([\d.]+)×\s*·\s*LTV/i);
  return { panel, tier: m ? parseFloat(m[1]) : null };
});

(async () => {
  const { app, page, errors } = await H.launch(UDATA);

  // ===== Scenario A: general-data.json + history card + refi NOI-basis toggle =====
  section('general-data: write + history card + refi toggle');
  await H.uploadT12(page, KEY, CREST);
  await page.waitForFunction(() => /operating history/i.test((document.getElementById('uwView') || {}).innerText || ''), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  const gd = readGD();
  ok(!!gd, 'general-data.json is written to the property folder');
  ok(gd && gd.schema === 'lds.general-data.v1', 'the record carries the v1 schema');
  ok(gd && gd.window && Array.isArray(gd.window.months) && gd.window.months.length === 12, '12 months of history stored (' + (gd && gd.window && gd.window.months && gd.window.months.length) + ')');
  ok(gd && gd.window.months[0] === '2025-07' && gd.window.months[11] === '2026-06', 'the calendar months are Jul 2025 → Jun 2026 (parsed from the T12 columns)');
  ok(gd && gd.lines && gd.lines.RET && Object.keys(gd.lines.RET.monthly).length === 12, 'the real-estate-taxes line carries all 12 monthly values');
  ok(gd && gd.lines.RET && Math.abs(gd.lines.RET.ttm - sum(gd.lines.RET.monthly)) < 0.02, 'the taxes trailing-12 equals the sum of its 12 months');
  ok(gd && gd.noi && typeof gd.noi.inPlace === 'number' && gd.noi.inPlace > 0, 'in-place NOI stored (' + (gd && gd.noi && gd.noi.inPlace) + ')');
  ok(gd && gd.noi && typeof gd.noi.underwritten === 'number' && gd.noi.underwritten > 0, 'underwritten NOI stored (' + (gd && gd.noi && gd.noi.underwritten) + ')');
  ok(gd && gd.identity && /whitewater/i.test(gd.identity.propertyName || ''), 'the property identity is recorded');

  const uw = await uwText(page);
  ok(/General Data\s*[—-]\s*operating history/i.test(uw), 'the General Data history card renders in the underwriting tab');
  ok(/Real Estate Taxes/i.test(uw), 'the taxes line appears in the history readout');
  ok(/In-place NOI/i.test(uw) && /Underwritten NOI/i.test(uw), 'both NOIs are shown on the card');
  ok(/12 months/i.test(uw) && /2025-07/.test(uw) && /2026-06/.test(uw), 'the 12-month span is labelled');

  const loanId = await page.evaluate((k) => { const ps = (window.opProperties ? window.opProperties() : []); const p = ps.find(x => x.key === k); return p && p.loans && p.loans[0] ? p.loans[0]._id : null; }, KEY);
  ok(!!loanId, 'a loan exists on the property to refinance');
  if (loanId) {
    await page.evaluate(() => { const h = document.querySelector('[data-tabsel="home"]'); if (h) h.click(); });
    await page.waitForFunction(() => { const v = document.getElementById('portfolioView'); return v && !v.hidden; }, null, { timeout: 8000 }).catch(() => {});
    await page.click('tr[data-goto="' + loanId + '"]').catch(() => {});
    await page.waitForFunction(() => { const b = document.getElementById('refiBtn'); return b && !b.disabled; }, null, { timeout: 8000 }).catch(() => {});
    await page.click('#refiBtn').catch(() => {});
    await page.waitForFunction(() => { const v = document.getElementById('refiView'); return v && !v.hidden; }, null, { timeout: 8000 }).catch(() => {});
    await page.click('[data-refimode="advanced"]').catch(() => {});
    await page.waitForSelector('#refiView [data-noibasis]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);

    const nBtns = await page.evaluate(() => document.querySelectorAll('#refiView [data-noibasis]').length);
    ok(nBtns === 2, 'the NOI-basis toggle offers two options (in-place T12 + underwritten)');
    const bothFig = await page.evaluate(() => [...document.querySelectorAll('#refiView [data-noibasis]')].every(b => /\$/.test(b.textContent || '')));
    ok(bothFig, 'each basis button shows its own NOI figure');
    ok((await activeBasis(page)) === 'underwritten', 'the default basis is Underwritten — the figure a loan is sized on');
    const noiUW = await refiNoiShown(page);
    ok(gd && noiUW != null && Math.abs(noiUW - gd.noi.underwritten) < 2, 'the analysis runs on the underwritten NOI by default (' + noiUW + ')');
    const dpUW = await dscrPair(page);
    ok(dpUW.panel != null && dpUW.tier != null && Math.abs(dpUW.panel - dpUW.tier) < 0.02, 'on Underwritten, the credit tier DSCR (' + dpUW.tier + '×) matches the panel DSCR (' + dpUW.panel + '×)');
    await page.click('#refiView [data-noibasis="inplace"]').catch(() => {});
    await page.waitForTimeout(300);
    ok((await activeBasis(page)) === 'inplace', 'clicking In-place T12 makes it the active basis');
    const noiIP = await refiNoiShown(page);
    ok(gd && noiIP != null && Math.abs(noiIP - gd.noi.inPlace) < 2, 'the analysis now runs on the in-place NOI (' + noiIP + ')');
    ok(noiIP != null && noiUW != null && Math.abs(noiIP - noiUW) > 1, 'switching the basis actually changes the NOI the refinance is judged on');
    const dpIP = await dscrPair(page);
    ok(dpIP.panel != null && dpIP.tier != null && Math.abs(dpIP.panel - dpIP.tier) < 0.02, 'on In-place, the tier DSCR (' + dpIP.tier + '×) still matches the panel DSCR (' + dpIP.panel + '×) — the tier tracks the toggle');
    ok(dpIP.tier != null && dpUW.tier != null && Math.abs(dpIP.tier - dpUW.tier) > 0.01, 'and the tier DSCR moved when the basis flipped (' + dpUW.tier + '× → ' + dpIP.tier + '×)');
  }

  // ===== Scenario B: cross-session disk read (Villages + Crest still in place from A) =====
  section('disk-read: clear the in-memory cache, re-read from disk');
  const warm = await page.evaluate((k) => { const g = window.LDS_gdNOICache()[k]; return { has: !!g, inPlace: g ? g.inPlace : null, underwritten: g ? g.underwritten : null }; }, KEY);
  ok(warm.has && warm.inPlace != null && warm.underwritten != null, 'the in-memory cache holds both NOIs (in-place ' + warm.inPlace + ', underwritten ' + warm.underwritten + ')');
  await page.evaluate(() => window.LDS_clearGDCache());
  ok(await page.evaluate((k) => window.LDS_gdNOICache()[k] === undefined, KEY), 'the in-memory cache is cleared (a fresh launch)');
  const disk = await page.evaluate(async (k) => { await window.LDS_opEnsureGeneralData(k); return window.LDS_gdNOICache()[k]; }, KEY);
  ok(disk != null, 'the disk read repopulates the cache (not null)');
  ok(disk && disk.inPlace != null && disk.underwritten != null, 'THE DISK READ RECOVERS BOTH NOIs (in-place ' + (disk && disk.inPlace) + ', underwritten ' + (disk && disk.underwritten) + ')');
  const optsB = await page.evaluate((k) => { const l = window.LDS_loans().find(x => window.propertyKey(x) === k); return window.LDS_refiNOIOptionsFor(l); }, KEY);
  ok(optsB && (optsB.inPlace != null || optsB.underwritten != null), 'refiNOIOptions sees the NOIs off the disk read → the toggle would render');

  // ===== Scenario C: backfill — T12 in the folder, general-data.json removed =====
  section('backfill: regenerate general-data.json from the folder T12');
  const del = await page.evaluate(async (k) => {
    const list = await window.ldsShell.docList(k);
    const gf = (list.files || []).find(f => f.role === 'general'); if (!gf) return { ok: false };
    await window.ldsShell.docDelete(k, gf.id);
    const after = await window.ldsShell.docList(k);
    return { ok: true, hasT12: (after.files || []).some(f => f.role === 't12' || /t12|\.xls/i.test(f.name || '')),
      hasGeneral: (after.files || []).some(f => f.role === 'general') };
  }, KEY);
  ok(del.ok && del.hasT12 && !del.hasGeneral, 'broken state set up: T12 in the folder, general-data.json removed');
  await page.evaluate(() => window.LDS_clearGDCache());
  const rec = await page.evaluate(async (k) => { await window.LDS_opEnsureGeneralData(k); return window.LDS_gdNOICache()[k]; }, KEY);
  ok(rec != null && rec.inPlace != null && rec.underwritten != null, 'the refi backfills BOTH NOIs from the folder T12 (in-place ' + (rec && rec.inPlace) + ', underwritten ' + (rec && rec.underwritten) + ')');
  ok(await page.evaluate(async (k) => { const l = await window.ldsShell.docList(k); return (l.files || []).some(f => f.role === 'general'); }, KEY), 'general-data.json is regenerated in the folder');
  const optsC = await page.evaluate((k) => { const l = window.LDS_loans().find(x => window.propertyKey(x) === k); return window.LDS_refiNOIOptionsFor(l); }, KEY);
  ok(optsC && optsC.inPlace != null && optsC.underwritten != null, 'the NOI-basis toggle would now render');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await H.closeApp(app); try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  console.log(fails.n ? fails.n + ' FAILED' : 'all general-data (grouped: write + disk-read + backfill) e2e checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
