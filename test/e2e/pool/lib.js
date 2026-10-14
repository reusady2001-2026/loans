// 2.9.14 — pooled-loan e2e helpers: launch the app on a controlled book of loans and read Home, pages, the calendar.
const path = require('path'), os = require('os'), fs = require('fs');
const { _electron: electron } = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const ENV = { LDS_CLAUDE_BIN: '/nonexistent', LDS_RATES_OFFLINE: '1' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launch(appDir, udata) {
  const app = await electron.launch({ executablePath: require(path.join(appDir, 'node_modules', 'electron')),
    args: [appDir, '--user-data-dir=' + udata, '--no-sandbox'], cwd: appDir, env: Object.assign({}, process.env, ENV) });
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\//, r => r.abort());
  await page.waitForSelector('#loanSelect option', { timeout: 25000, state: 'attached' }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('portfolioLoading'), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(900);
  return { app, page, errors, udata };
}
// A fresh install, then the book replaced on disk, then relaunch: the app starts on exactly `book`.
async function boot(appDir, book, extraFiles) {
  const udata = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-pool-'));
  let s = await launch(appDir, udata); await s.app.close();
  fs.writeFileSync(path.join(udata, 'loans.json'), JSON.stringify(book));
  try { fs.unlinkSync(path.join(udata, 'loans.prev.json')); } catch (e) {}
  (extraFiles || []).forEach(f => { fs.mkdirSync(path.dirname(path.join(udata, f.path)), { recursive: true }); fs.writeFileSync(path.join(udata, f.path), f.data); });
  // the first launch's seed folders are left on disk; drop the documents tree so only our properties exist
  try { fs.rmSync(path.join(udata, 'documents'), { recursive: true, force: true }); } catch (e) {}
  return launch(appDir, udata);
}
async function relaunch(s) { try { await s.app.close(); } catch (e) {} return launch(s.appDir || s._appDir, s.udata); }

// Make sure each named property exists (a property with no loan of its own is added as a standalone property)
// and give each its NOI as the property's own figure (the profile's NOI override — persisted in profile.json).
async function setNOIs(page, props) {
  return page.evaluate(async (props) => {
    const out = {};
    for (const p of props) {
      let key = (window.opProperties().find(x => x.name.toLowerCase() === p.name.toLowerCase()) || {}).key;
      if (!key) { key = await window.LDS_addProperty(p.name); }
      await window.LDS_ensureProfile(key);
      if (p.addr) { try { await window.LDS_setProfileField(key, 'propertyAddress', p.addr); } catch (e) {} }
      await window.LDS_setProfileField(key, 'noiOverride', p.noi);
      out[p.name] = key;
    }
    try { window.LDS_renderPortfolio && window.LDS_renderPortfolio(); } catch (e) {}
    return out;
  }, props);
}
const parseMoney = (t) => { if (t == null) return null; const s = String(t).replace(/[^0-9.\-−]/g, '').replace('−', '-'); const n = parseFloat(s); return isFinite(n) ? n : null; };
async function goHome(page) {
  await page.evaluate(() => { const b = document.querySelector('[data-tabsel="home"]'); if (b) b.click(); const s = document.getElementById('scopePortfolioBtn'); if (s) s.click(); });
  await page.waitForTimeout(500);
}
async function home(page) {
  await goHome(page);
  // the Home KPIs count up from 0 over ~1 s: wait until every number has settled
  await page.waitForFunction(() => [...document.querySelectorAll('#portfolioView p.tabular-nums')].every(p => !p.__cuAnim && (p.__cuShown == null || p.__cuShown === p.textContent)), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const pv = document.getElementById('portfolioView');
    const kpi = (label) => { const p = [...pv.querySelectorAll('p')].find(x => (x.textContent || '').trim().toLowerCase() === label.toLowerCase()); return p && p.nextElementSibling ? p.nextElementSibling.textContent.trim() : null; };
    const h = [...pv.querySelectorAll('h3')].find(x => /^Coverage/.test(x.textContent || ''));
    let rows = [];
    if (h) { let card = h; while (card && !card.querySelector('table')) card = card.parentElement;
      rows = [...card.querySelector('table').querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim())); }
    const props = window.opProperties().map(p => ({ key: p.key, name: p.name, loans: p.loans.length, inactive: (p.inactive || []).length }));
    const kpiSub = (label) => { const p = [...pv.querySelectorAll('p')].find(x => (x.textContent || '').trim().toLowerCase() === label.toLowerCase()); const v = p && p.nextElementSibling; return v && v.nextElementSibling ? v.nextElementSibling.textContent.trim() : null; };
    return { totalDebt: kpi('Total Debt Outstanding'), totalDebtSub: kpiSub('Total Debt Outstanding'), dscrKpi: kpi('Portfolio DSCR'), cov: window.LDS_lastHomeCoverage, rows, props,
      select: [...document.querySelectorAll('#loanSelect option')].map(o => ({ v: o.value, t: o.textContent })) };
  });
}
// Open a property's page through the position selector (the same control the user clicks) and read it.
async function openProp(page, name) {
  const r = await page.evaluate(async (name) => {
    const s = document.getElementById('loanSelect'); const o = [...s.options].find(x => (x.textContent || '').toLowerCase().indexOf(name.toLowerCase()) === 0);
    if (!o) return { found: false };
    const b = document.querySelector('[data-tabsel="home"]'); if (b) b.click();
    s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true, id: o.value };
  }, name);
  if (!r.found) return r;
  await page.waitForTimeout(900);
  await page.waitForFunction(() => [...document.querySelectorAll('#kpiGrid p.tabular-nums, #portfolioView p.tabular-nums')].every(p => !p.__cuAnim), null, { timeout: 5000 }).catch(() => {});
  const t = await page.evaluate(() => {
    const vis = ['loanView', 'propView'].map(id => document.getElementById(id)).filter(e => e && !e.hidden && e.offsetParent !== null);
    return vis.map(e => e.innerText).join('\n');
  });
  return Object.assign(r, { text: t });
}
async function calendar(page) {
  return page.evaluate(() => { const h = window.LDS_calendarDocHtml(); const m = h.match(/window\.__CAL_DATA__=(\{[\s\S]*?\});(?:window\.__CAL_STATE__|<\/script>)/); return m ? JSON.parse(m[1]) : null; });
}
function pmt(P, rate, n) { const r = rate / 12; return P * r / (1 - Math.pow(1 + r, -n)); }
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 1 : tol);
// The user's own clicks, for a loan that is the only loan on its property (its position id is the loan id).
async function selectPos(page, value) {
  return page.evaluate((v) => { const b = document.querySelector('[data-tabsel="home"]'); if (b) b.click();
    const s = document.getElementById('loanSelect'); if (![...s.options].some(o => o.value === v)) return false; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }, value);
}
async function confirmIfAsked(page) { await page.waitForTimeout(300); await page.evaluate(() => { const m = document.getElementById('confirmModal'); if (m && !m.classList.contains('hidden')) document.getElementById('confirmOk').click(); }); await page.waitForTimeout(500); }
async function editLoanUI(page, loanId, fields) {
  if (!(await selectPos(page, loanId))) return false; await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('loanRecEdit').click()); await page.waitForTimeout(500);
  await page.evaluate((f) => { Object.keys(f).forEach(k => { const n = document.getElementById('f_' + k); if (n) { n.value = f[k]; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); } }); }, fields);
  await page.evaluate(() => document.getElementById('saveBtn').click()); await confirmIfAsked(page); return true;
}
async function removeLoanUI(page, loanId) {
  if (!(await selectPos(page, loanId))) return false; await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('loanRecRemove').click()); await confirmIfAsked(page); return true;
}
async function restoreLoanUI(page, loanId) {
  await goHome(page);
  const ok = await page.evaluate((id) => { const b = document.querySelector('[data-restoreloan="' + id + '"]'); if (!b) return false; b.click(); return true; }, loanId);
  await confirmIfAsked(page); return ok;
}
async function rollup(page) {
  await page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click(); const o = document.querySelector('[data-tabopen="underwriting"]'); if (o) o.click(); });
  await page.waitForFunction(() => { const m = document.getElementById('opRollupMount'); return m && m.querySelector('tr[data-op-total]'); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const m = document.getElementById('opRollupMount'); if (!m) return null;
    const cells = (tr) => [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim());
    return { rows: [...m.querySelectorAll('tr[data-op-prop]')].map(cells), total: m.querySelector('tr[data-op-total]') ? cells(m.querySelector('tr[data-op-total]')) : null }; });
  await goHome(page);
  return r;
}
module.exports = { rollup, selectPos, confirmIfAsked, editLoanUI, removeLoanUI, restoreLoanUI, launch, boot, setNOIs, home, openProp, calendar, pmt, near, parseMoney, sleep, goHome };
