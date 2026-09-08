/* Foundation e2e for v2.7.1 — the T12 lives in the property's ON-DISK folder, never in browser
   storage, and its numbers are re-parsed from the file (so nothing goes stale). Verified against the
   REAL Crest T12 in the REAL Electron app, across a restart.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-disk.e2e.js */
const path = require('path'), os = require('os'), fs = require('fs'), crypto = require('crypto');
const APP = path.resolve(__dirname, '..', '..');
const { _electron: electron } = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const CREST = path.join(APP, 'test', 'fixtures', 'crest-t12.xlsx');
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-t12disk-'));
const KEY = 'name:villages of whitewater';                        // name-first key (v2.7.2)
const HASH = crypto.createHash('sha1').update(KEY).digest('hex').slice(0, 16);
const PROPDIR = path.join(UDATA, 'documents', HASH);
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };

async function launch(){
  const app = await electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')),
    args: [APP, '--user-data-dir=' + UDATA, '--no-sandbox'], cwd: APP, env: Object.assign({}, process.env) });
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\//, r => r.abort());
  await page.waitForSelector('tr[data-goto]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { app, page, errors };
}
async function openUw(page){
  await page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click(); const o = document.querySelector('[data-tabopen="underwriting"]'); if (o) o.click(); });
  await page.waitForFunction(() => { const v = document.getElementById('uwView'); return v && !v.hidden && !!document.getElementById('opPropPick'); }, null, { timeout: 8000 });
  await page.waitForTimeout(300);
}
const pick = async (page) => { await page.evaluate((k) => { const s = document.getElementById('opPropPick'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, KEY); await page.waitForTimeout(600); };
const ls = (page, k) => page.evaluate((k) => localStorage.getItem(k), k);
const bodyText = (page) => page.evaluate(() => document.getElementById('uwView').innerText);

(async () => {
  // ---- run 1: fresh install, upload the Crest T12 to a property --------------------------------------
  let { app, page, errors } = await launch();
  await openUw(page);
  ok((await ls(page, 'ldsHub.operating.v1')) === null, 'fresh: no operating data in browser storage (ldsHub.operating.v1 is null)');
  const setup0 = await ls(page, 'lds_setup_v1');
  ok(!setup0 || (!/t12Meta/.test(setup0) && !/5,?210,?718/.test(setup0)), 'fresh: no T12 grid/meta and no stale NOI in browser storage');
  ok(!fs.existsSync(PROPDIR), 'fresh: the property folder does not exist yet');

  await pick(page);
  await page.setInputFiles('#uwFile', CREST);
  await page.waitForFunction(() => /statement NOI/.test((document.getElementById('uwView') || {}).innerText || ''), null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(800);

  const t1 = await bodyText(page);
  ok(/9,483,604\.28/.test(t1), 'after upload: statement NOI reads $9,483,604.28 (the real NET OPERATING INCOME)');
  ok(!/5,210,718\.69/.test(t1), 'after upload: the wrong below-the-line NET INCOME $5,210,718.69 is NOT shown');

  ok(fs.existsSync(PROPDIR), 'the property folder was created on disk (userData/documents/' + HASH + ')');
  const filesOnDisk = fs.existsSync(PROPDIR) ? fs.readdirSync(PROPDIR) : [];
  const idx = (() => { try { return JSON.parse(fs.readFileSync(path.join(PROPDIR, 'index.json'), 'utf8')); } catch (e) { return {}; } })();
  ok((idx.files || []).some(f => f.role === 't12'), 'index.json records a T12 file under the property (role "t12")');
  ok(filesOnDisk.some(f => /\.xlsx$/i.test(f)), 'the original .xlsx is stored in the property folder');
  const stored = (idx.files || []).find(f => f.role === 't12');
  ok(stored && fs.statSync(path.join(PROPDIR, stored.stored)).size === fs.statSync(CREST).size, 'the stored file is the original T12, byte-for-byte');

  // layout (v2.7.2): the editable operating-model card + CTL are gone; sections in the right order
  ok(!(await page.evaluate(() => !!document.getElementById('opSheetMount'))), 'the duplicate editable operating-model sheet (#opSheetMount) is gone');
  ok(!(await page.evaluate(() => /\bCTL\b/.test((document.getElementById('uwView')||{}).innerText||''))), 'no "CTL" column anywhere');
  const order = await page.evaluate(() => { const t = document.getElementById('uwView').innerText;
    const idx = (re) => { const m = t.match(re); return m ? m.index : -1; };
    return { drop: idx(/Drop the T12 file here/i), noi: idx(/statement NOI/i), sizing: idx(/Debt sizing/i), rollup: idx(/Portfolio roll-up/i), push: idx(/What to push on this property/i) }; });
  ok(order.drop >= 0 && order.noi > order.drop && order.sizing > order.noi && order.rollup > order.sizing && order.push > order.rollup,
     'order top-to-bottom: drop/classify -> statement NOI -> debt sizing -> portfolio roll-up -> what to push (got ' + JSON.stringify(order) + ')');
  ok((await ls(page, 'ldsHub.operating.v1')) === null, 'after upload: STILL nothing in browser storage (ldsHub.operating.v1 null)');
  const setup1 = await ls(page, 'lds_setup_v1');
  ok(!setup1 || (!/t12Grid/.test(setup1) && !/t12Meta/.test(setup1) && !/9,?483,?604|948360/.test(setup1)), 'after upload: the T12 grid/parsed figures are NOT persisted to browser storage');
  ok(errors.length === 0, 'run 1: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();

  // ---- run 2: relaunch the SAME install; the T12 comes back FROM DISK, still nothing stored ----------
  ({ app, page, errors } = await launch());
  await openUw(page);
  ok((await ls(page, 'ldsHub.operating.v1')) === null, 'restart: clean slate — nothing operating in browser storage');
  const t2before = await bodyText(page);
  ok(!/9,483,604\.28|5,210,718\.69/.test(t2before), 'restart: before selecting a property, no T12 figure is shown (nothing cached)');
  await pick(page);
  await page.waitForFunction(() => /statement NOI/.test((document.getElementById('uwView') || {}).innerText || ''), null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(600);
  const t2 = await bodyText(page);
  ok(/9,483,604\.28/.test(t2), 'restart: selecting the property re-reads its T12 from disk → $9,483,604.28');
  ok(!/5,210,718\.69/.test(t2), 'restart: no stale $5,210,718.69 anywhere');
  ok((await ls(page, 'ldsHub.operating.v1')) === null, 'restart: reading the T12 wrote nothing to browser storage');
  ok(errors.length === 0, 'run 2: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();

  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  console.log(fails.n ? fails.n + ' FAILED' : 'all t12-disk checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
