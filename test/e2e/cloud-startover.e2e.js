/* e2e for 3.0.0 — starting the group over, and the first upload from a backup file, in the real app window against
   the test server:
     • the admin's group has data; "Start the group over…" asks for the group's name, then everything goes;
     • "Upload this computer's data" → "Upload from a backup file instead…" (a backup made with Data → Back up to a
       file…): what it holds is shown, then uploaded — its loans, documents, custom categories and saved market rates;
     • the window then calculates from the backup's saved rates (the group's rates, the same for every member).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/cloud-startover.e2e.js
   (skipped where PostgreSQL isn't installed) */
const path = require('path'), os = require('os'), fs = require('fs'), crypto = require('crypto');
const APP = path.resolve(__dirname, '..', '..');
const { _electron: electron } = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const PG = require(path.join(APP, 'test', 'cloud', '_pg.js'));
const { startStandin } = require(path.join(APP, 'test', 'cloud', 'standin-server.js'));
const { createClient } = require(path.join(APP, 'cloud-client.js'));
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-cloud-over-'));
const ud = (n) => { const d = path.join(TMP, n); fs.mkdirSync(path.join(d, 'claude'), { recursive: true }); fs.writeFileSync(path.join(d, 'claude', 'signed-in.marker'), 'ok'); return d; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(page, fn, arg, ms){ const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(200); } return false; }
async function launch(udir, env){
  const app = await electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')), args: [APP, '--user-data-dir=' + udir, '--no-sandbox'], cwd: APP,
    env: Object.assign({}, process.env, { LDS_CLOUD_POLL_MS: '800', LDS_CLOUD_AUTO_MS: '300' }, env || {}) });
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  return { app, page, errors };
}
async function signIn(page, email){ await page.waitForSelector('#siEmail', { timeout: 20000 }); await page.fill('#siEmail', email); await page.fill('#siPw', 'secret-pw-1'); await page.click('#siGo'); }
const waitApp = (page) => until(page, () => typeof window.LDS_loans === 'function' && !!document.getElementById('cloudDD') && !document.getElementById('cloudDD').classList.contains('hidden'), null, 30000);
const menu = async (page, what) => { await page.click('#cloudChip'); await page.click('#cloudMenu [data-cloud="' + what + '"]'); };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

(async () => {
  if (!PG.findBin()) { console.log('skipped: PostgreSQL isn’t installed here'); return; }
  const db = await PG.start(), si = await startStandin(db);
  const CLOUD = { LDS_CLOUD_URL: si.url, LDS_CLOUD_ANON_KEY: si.anonKey };
  const acct = async (email) => { const c = createClient({ url: si.url, anonKey: si.anonKey }); await c.signUp(email, 'secret-pw-1'); await si.confirm(email); await c.signIn(email, 'secret-pw-1'); return c; };
  const apps = [];
  try {
    await acct('op@co.com');
    await si.sql("select app.make_group('Living Residential', 'op@co.com', 'Operator')");
    // a backup file made by the normal app on some computer: two loans, a property's documents, custom categories and
    // the saved market rates (a day the app's built-in history doesn't have)
    const h = crypto.createHash('sha1').update('name:alpha tower').digest('hex').slice(0, 16);
    const pdf = Buffer.from('%PDF-1.4 the agreement');
    const files = [
      { path: 'documents/' + h + '/index.json', data: Buffer.from(JSON.stringify({ propKey: 'name:alpha tower', propName: 'Alpha Tower', files: [{ id: 'dpdf1', stored: 'dpdf1.pdf', name: 'Loan Agreement.pdf', role: 'agreement', savedAt: 6, type: 'application/pdf' }] })) },
      { path: 'documents/' + h + '/dpdf1.pdf', data: pdf }];
    const settings = { 'lds.customCategories': JSON.stringify({ 'Parking income': 'income' }),
                       'ldsHub.rateHist.v2': JSON.stringify({ sofr30: { '2031-01-02': 9.99 }, meta: {} }) };
    const loans = [{ _id: 'ln_a', propertyName: 'Alpha Tower', originalAmount: 1000000, annualRate: 5, rateType: 'Fixed', loanTermMonths: 120, amortizationMonths: 360, originationDate: '2024-01-01', firstPaymentDate: '2024-02-01', maturityDate: '2034-01-01' },
                   { _id: 'ln_b', propertyName: 'Beta Court', originalAmount: 2000000, annualRate: 6, rateType: 'Fixed', loanTermMonths: 120, amortizationMonths: 360, originationDate: '2024-01-01', firstPaymentDate: '2024-02-01', maturityDate: '2034-01-01' }];
    const backup = path.join(TMP, 'LDS-Hub-backup.json');
    const head = JSON.stringify({ app: 'LDS Hub', schema: 7, exportedAt: '2026-10-14T10:02:00.000Z', loanCount: 2, loans, settings, format: 2, kind: 'full', fileCount: files.length, propertyFolders: 1, chatCount: 0 });
    fs.writeFileSync(backup, head.slice(0, -1) + ',"files":[' + files.map(f => JSON.stringify({ path: f.path, size: f.data.length, sha1: sha1(f.data), base64: f.data.toString('base64') })).join(',') + ']}');

    console.log('\nthe group has data');
    const OP = ud('operator');
    // this computer's own data (as the normal app keeps it): three loans
    fs.writeFileSync(path.join(OP, 'loans.json'), JSON.stringify(['One', 'Two', 'Three'].map((n, i) => Object.assign({}, loans[0], { _id: 'ln_' + i, propertyName: n + ' Place' }))));
    const A = await launch(OP, CLOUD); apps.push(A);
    await signIn(A.page, 'op@co.com'); ok(await waitApp(A.page), 'the admin is in');
    await A.page.click('#cloudBanner [data-cloud-banner="upload"]');
    await A.page.waitForSelector('#cuGo'); await A.page.click('#cuGo');
    ok(await until(A.page, () => LDS_loans().length === 3, null, 60000), 'this computer’s loans are the group’s data');
    ok(await until(A.page, () => !document.querySelector('#cloudMenu [data-cloud="upload"]') && !!document.querySelector('#cloudMenu [data-cloud="startover"]')), 'the menu offers “Start the group over…” (not the upload)');
    await A.page.click('#cloudChip');

    console.log('\nstarting it over');
    await A.page.click('#cloudMenu [data-cloud="startover"]');
    await A.page.waitForSelector('#cloudAskIn');
    await A.page.fill('#cloudAskIn', 'Living');
    await A.page.click('text=Remove everything');
    ok(await until(A.page, () => /Type the group.s name exactly/.test(document.body.innerText)), 'a wrong name: nothing is removed');
    ok(Number((await si.sql("select count(*) n from app.records")).rows[0].n) > 0, '…the group still has its records');
    await A.page.click('#cloudChip'); await A.page.click('#cloudMenu [data-cloud="startover"]');
    await A.page.waitForSelector('#cloudAskIn'); await A.page.fill('#cloudAskIn', 'living residential');
    await A.page.click('text=Remove everything');
    ok(await until(A.page, () => LDS_loans().length === 0 && /no data yet/.test((document.getElementById('cloudBanner') || {}).textContent || ''), null, 30000), 'started over: no loans, and the banner offers the upload');
    ok(Number((await si.sql("select count(*) n from app.records")).rows[0].n) === 0, 'the shared database holds no records');
    ok(JSON.parse(fs.readFileSync(path.join(OP, 'loans.json'), 'utf8')).length === 3, 'this computer’s own loans file is untouched');

    console.log('\nuploading from a backup file');
    await A.page.click('#cloudBanner [data-cloud-banner="upload"]');
    await A.page.waitForSelector('#cuFromBackup');
    await A.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, backup);
    await A.page.click('#cuFromBackup');
    ok(await until(A.page, () => /From the backup file “LDS-Hub-backup\.json”/.test(document.getElementById('cuSize').textContent) && /2 loans, 1 properties, 1 documents/.test(document.getElementById('cuSize').textContent) && /saved market rates and settings go too/.test(document.getElementById('cuSize').textContent)), 'the pop-up says what the backup holds (' + await A.page.evaluate(() => document.getElementById('cuSize').textContent) + ')');
    await A.page.click('#cuGo');
    ok(await until(A.page, () => LDS_loans().length === 2 && LDS_loans().some(l => l.propertyName === 'Beta Court'), null, 60000), 'the backup’s loans are the group’s data');
    ok(await until(A.page, async () => { const l = await window.ldsShell.docList('name:alpha tower'); const f = l && (l.files || []).find(x => x.name === 'Loan Agreement.pdf'); if (!f) return false; const r = await window.ldsShell.docRead('name:alpha tower', f.id); return r && r.ok && atob(r.base64) === '%PDF-1.4 the agreement'; }, null, 20000), 'its document opens');
    ok(await until(A.page, () => { try { return JSON.parse(localStorage.getItem('lds.customCategories'))['Parking income'] === 'income'; } catch (e) { return false; } }), 'its custom categories are the group’s');
    ok(await until(A.page, () => { const r = window.LDS_rateHist && window.LDS_rateHist(); return !!(r && r.sofr30 && r.sofr30['2031-01-02'] === 9.99); }), 'its saved market rates are what the window calculates from');
    const shared = (await si.sql("select content from app.records where path = 'settings.json'")).rows[0];
    ok(shared && shared.content['ldsHub.rateHist.v2'].sofr30['2031-01-02'] === 9.99, 'the rates are in the group’s shared settings (the same for every member)');
    ok(!fs.existsSync(path.join(OP, 'cloud', 'upload-from-backup')), 'the unpacked backup is cleared away after the upload');
    ok(A.errors.length === 0, 'no page errors' + (A.errors.length ? ': ' + A.errors[0] : ''));
  } catch (e) { ok(false, 'threw: ' + (e && e.stack || e)); }
  finally {
    for (const x of apps) { try { await x.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }); } catch (e) {} try { await x.app.close(); } catch (e) {} }
    await si.stop(); await db.stop();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(fails.n ? '\nFAILED: ' + fails.n : '\nall start-over e2e checks passed');
  process.exit(fails.n ? 1 : 0);
})();
