// Shared Playwright-Electron helpers for the operating-model e2e tests.
// Run:  GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/<x>.e2e.js
const path = require('path'), fs = require('fs'), os = require('os');
const APP = path.resolve(__dirname, '..', '..');
function playwright(){ return require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright'); }
// Launch the app on a FRESH user-data dir (isolated localStorage), network blocked.
async function launchApp(opts){
  opts = opts || {};
  const { _electron: electron } = playwright();
  const udata = opts.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'lds-e2e-'));
  const app = await electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')),
    args: [APP, '--user-data-dir=' + udata, '--no-sandbox'], cwd: APP, env: Object.assign({}, process.env, opts.env || {}) });
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\//, r => r.abort());
  await page.waitForSelector('tr[data-goto]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { app, page, errors, udata };
}
// The Underwriting tab is not open by default: "+" (#tabNewBtn) shows a body-level menu,
// then [data-tabopen="underwriting"] opens the tab and renders it.
async function openUnderwriting(page){
  await page.evaluate(() => {
    const b = document.getElementById('tabNewBtn'); if (b) b.click();
    const o = document.querySelector('[data-tabopen="underwriting"]'); if (o) o.click();
  });
  await page.waitForFunction(() => { const v = document.getElementById('uwView'); return v && !v.hidden && !!document.getElementById('uwDrop'); }, null, { timeout: 8000 });
  await page.waitForTimeout(300);
}
// Focus a property in the operating-model picker by its visible name (partial match).
async function pickProperty(page, name){
  const key = await page.evaluate((n) => { const s = document.getElementById('opPropPick'); if (!s) return null;
    const o = [...s.options].find(x => (x.textContent || '').toLowerCase().indexOf(String(n).toLowerCase()) >= 0); if (!o) return null;
    s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.value; }, name);
  await page.waitForTimeout(300);
  return key;
}
const ok = (fails) => (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
module.exports = { launchApp, openUnderwriting, pickProperty, ok, APP };
