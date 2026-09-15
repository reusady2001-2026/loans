/* Shared e2e harness (v2.9.0) — grouping refactor.
   Booting Electron is the slow part of an e2e run (~10-30s per launch); the assertions are quick.
   So related scenarios now share ONE launch and reset between them with page.reload() (a renderer
   reload, ~1-2s — the Electron main process stays up), instead of a full electron.launch() each.
   Each grouped file requires this module, runs its scenarios in sequence, and reports one total.
   Restart tests (assumptions, t12-disk) still launch twice on purpose and don't use grouping. */
const path = require('path'), os = require('os'), fs = require('fs'), crypto = require('crypto');
const APP = path.resolve(__dirname, '..', '..');
const electron = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright')._electron;

function tmp(prefix){ return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function propHash(key){ return crypto.createHash('sha1').update(String(key || '')).digest('hex').slice(0, 16); }
function propDir(UDATA, key){ return path.join(UDATA, 'documents', propHash(key)); }

async function launch(UDATA){
  const app = await electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')),
    args: [APP, '--user-data-dir=' + UDATA, '--no-sandbox'], cwd: APP, env: Object.assign({}, process.env) });
  const page = await app.firstWindow(); const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\//, r => r.abort());
  await page.waitForSelector('tr[data-goto]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { app, page, errors };
}

// A clean install WITHOUT relaunching Electron: wipe the on-disk property folders, clear browser
// storage, reload the renderer. The app re-seeds its loans and comes up as a fresh install.
async function reset(page, UDATA, errors){
  try { fs.rmSync(path.join(UDATA, 'documents'), { recursive: true, force: true }); } catch (e) {}
  try { await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }); } catch (e) {}
  if (errors) errors.length = 0;
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForSelector('tr[data-goto]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function openUw(page){
  await page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click();
    const o = document.querySelector('[data-tabopen="underwriting"]'); if (o) o.click(); });
  await page.waitForFunction(() => { const v = document.getElementById('uwView');
    return v && !v.hidden && document.getElementById('opPropPick'); }, null, { timeout: 8000 });
  await page.waitForTimeout(300);
}

async function pick(page, key){
  await page.evaluate((k) => { const s = document.getElementById('opPropPick'); s.value = k;
    s.dispatchEvent(new Event('change', { bubbles: true })); }, key);
  await page.waitForTimeout(500);
}

// Open Underwriting, select the property, drop its T12, wait for the statement NOI to render.
async function uploadT12(page, key, file){
  await openUw(page); await pick(page, key);
  await page.setInputFiles('#uwFile', file);
  await page.waitForFunction(() => /statement NOI/.test((document.getElementById('uwView') || {}).innerText || ''),
    null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// A pass/fail counter + section header, shared across scenarios so one file reports one total.
function counter(){
  const fails = { n: 0 };
  const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
  const section = (name) => console.log('— ' + name + ' —');
  return { fails, ok, section };
}

// Best-effort teardown: app.close() can hang when Electron's own shutdown is slow (a loaded CI
// container). Bound it so the process still prints its result and exits with the right code rather
// than being force-killed with a stuck exit status. A healthy close returns well within the cap.
async function closeApp(app){
  try { await Promise.race([ app.close().catch(() => {}), new Promise(r => setTimeout(r, 6000)) ]); } catch (e) {}
}

module.exports = { APP, path, fs, os, crypto, electron, tmp, propHash, propDir, launch, reset, openUw, pick, uploadT12, counter, closeApp };
