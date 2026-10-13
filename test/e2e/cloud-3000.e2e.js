/* e2e for 3.0.0 — ONE SHARED DATABASE, in the real app window, against the test server (a real PostgreSQL with the
   app's setup SQL, behind a stand-in for Supabase's web API).
     • no shared database set up → the app works on today's data as before (2.9.17);
     • set up → the sign-in page; a person in no group is told so;
     • the admin of an empty group uploads this computer's data; today's files stay as they were;
     • an editor on another computer sees the same loans; a change waits in the bar for its reason; saved, it reaches
       the admin's window by itself;
     • a member changing what the admin changed: approval needed (code on the spot); a request pops up for the admin;
     • a view-only member sees everything and can't change anything;
     • offline: the banner, the last picture, view-only; a restart drops what wasn't saved.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/cloud-3000.e2e.js
   (skipped where PostgreSQL isn't installed) */
const path = require('path'), os = require('os'), fs = require('fs');
const APP = path.resolve(__dirname, '..', '..');
const { _electron: electron } = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const PG = require(path.join(APP, 'test', 'cloud', '_pg.js'));
const { startStandin } = require(path.join(APP, 'test', 'cloud', 'standin-server.js'));
const { createClient } = require(path.join(APP, 'cloud-client.js'));
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-cloud-e2e-'));
const ud = (n) => { const d = path.join(TMP, n); fs.mkdirSync(path.join(d, 'claude'), { recursive: true }); fs.writeFileSync(path.join(d, 'claude', 'signed-in.marker'), 'ok'); return d; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launch(udir, env){
  const app = await electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')), args: [APP, '--user-data-dir=' + udir, '--no-sandbox'], cwd: APP,
    env: Object.assign({}, process.env, { LDS_CLOUD_POLL_MS: '800', LDS_CLOUD_AUTO_MS: '300' }, env || {}) });
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  return { app, page, errors };
}
async function signIn(page, email){
  await page.waitForSelector('#siEmail', { timeout: 20000 });
  await page.fill('#siEmail', email); await page.fill('#siPw', 'secret-pw-1'); await page.click('#siGo');
}
// polls through page loads (signing in replaces the sign-in page with the app)
async function until(page, fn, arg, ms){ const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(200); } return false; }
const waitApp = (page) => until(page, () => typeof window.LDS_loans === 'function' && !!document.getElementById('cloudDD') && !document.getElementById('cloudDD').classList.contains('hidden'), null, 30000);
// a person's own edit: the keyboard first (so it counts as theirs), then the app's own save of the loan
const personEdit = (page, idx, field, value) => page.evaluate(([i, f, v]) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); return new Promise(r => setTimeout(() => r(window.LDS_cloudEditLoan(i, f, v)), 500)); }, [idx, field, value]);

(async () => {
  if (!PG.findBin()) { console.log('skipped: PostgreSQL isn’t installed here'); return; }
  const db = await PG.start(), si = await startStandin(db);
  const CLOUD = { LDS_CLOUD_URL: si.url, LDS_CLOUD_ANON_KEY: si.anonKey };
  const acct = async (email) => { const c = createClient({ url: si.url, anonKey: si.anonKey }); await c.signUp(email, 'secret-pw-1'); await si.confirm(email); await c.signIn(email, 'secret-pw-1'); return c; };
  const apps = [];
  try {
    await si.sql("insert into app.maintainers(email) values ('maint@co.com')");
    const M = await acct('maint@co.com'); await acct('op@co.com'); await acct('ed@co.com'); await acct('view@co.com'); await acct('stranger@co.com');
    await M.rpc('lds_group_create', { name: 'Living Residential', admin_email: 'op@co.com', admin_name: 'Operator' });

    const OP = ud('operator');
    console.log('\nno shared database set up: today’s app');
    let L = await launch(OP, { LDS_CLOUD_OFF: '1' }); apps.push(L);   // the app's own data (the project's address in cloud-config.json is switched off)
    ok(await until(L.page, () => typeof window.LDS_loans === 'function' && LDS_loans().length > 20 && !!document.querySelector('tr[data-goto]')), 'the app opens on this computer’s own loans');
    ok(await L.page.evaluate(() => document.getElementById('cloudDD').classList.contains('hidden') && !window.ldsShell.cloudMode), 'no shared-database chip');
    await sleep(2500);
    const localLoans = fs.readFileSync(path.join(OP, 'loans.json'), 'utf8'), localCount = JSON.parse(localLoans).length;
    await L.app.close(); apps.pop();

    console.log('\nsigning in');
    L = await launch(ud('stranger'), CLOUD); apps.push(L);
    await signIn(L.page, 'stranger@co.com');
    ok(await until(L.page, () => !document.getElementById('vNoGroup').classList.contains('hidden') && /not in a group/.test(document.getElementById('ngTitle').textContent)), 'someone in no group is told to ask their admin');
    await L.app.close(); apps.pop();

    console.log('\nthe admin: an empty group, then this computer’s data');
    const A = await launch(OP, CLOUD); apps.push(A);
    await signIn(A.page, 'op@co.com');
    ok(await waitApp(A.page), 'signed in: the app opens');
    ok(await until(A.page, () => LDS_loans().length === 0 && /no data yet/.test((document.getElementById('cloudBanner') || {}).textContent || '')), 'an empty group: no loans (never the built-in ones), and the banner says so');
    ok(await A.page.evaluate(() => /Operator · Admin/.test(document.getElementById('cloudChipText').textContent)), 'the chip shows who is signed in and their role');
    await A.page.click('#cloudBanner [data-cloud-banner="upload"]');
    await A.page.waitForSelector('#cuWhy');
    await A.page.click('#cuGo');
    ok(await until(A.page, (n) => LDS_loans().length === n, localCount, 60000), 'uploaded: the group has this computer’s ' + localCount + ' loans');
    ok(fs.readFileSync(path.join(OP, 'loans.json'), 'utf8') === localLoans, 'today’s loans file on this computer is untouched');
    ok(Number((await si.sql("select count(*) n from app.records where path like 'props/%/profile.json'")).rows[0].n) > 20, 'the properties’ records are in the shared database');
    ok(Number((await si.sql("select count(*) n from app.locks")).rows[0].n) === 0, 'the starting data locks nothing');
    // the admin adds the people
    const AC = await acct('op@co.com');
    await AC.rpc('lds_member_set', { email: 'ed@co.com', name: 'Eddie', role: 'editor' });
    await AC.rpc('lds_member_set', { email: 'view@co.com', name: 'Vera', role: 'viewer' });

    console.log('\nan editor on another computer');
    const E = await launch(ud('editor'), CLOUD); apps.push(E);
    await signIn(E.page, 'ed@co.com');
    ok(await waitApp(E.page) && await until(E.page, (n) => LDS_loans().length === n, localCount), 'the editor sees the same ' + localCount + ' loans');
    await sleep(3000);   // the start-up checks settle
    ok(await E.page.evaluate(() => !document.getElementById('cloudBar')), 'the app’s own start-up work doesn’t ask the editor for a reason');
    const name0 = await E.page.evaluate(() => LDS_loans()[0].propertyName);
    const id0 = await personEdit(E.page, 0, 'lenderName', 'E2E Bank');
    ok(await until(E.page, () => !!document.getElementById('cloudBar') && /Loans/.test(document.getElementById('cloudBarWhat').textContent)), 'the change waits in the bar: "Not saved yet — Loans"');
    await E.page.click('#cloudSaveBtn');
    ok(await E.page.evaluate(() => !!document.getElementById('cloudBar')), 'no reason: not saved');
    await E.page.fill('#cloudReason', 'New lender after the assignment');
    await E.page.click('#cloudSaveBtn');
    ok(await until(E.page, () => !document.getElementById('cloudBar')), 'saved with the reason: the bar is gone');
    const ch = (await si.sql("select * from app.changes where reason = 'New lender after the assignment'")).rows;
    ok(ch.length === 1 && ch[0].field === '[' + id0 + '].lenderName' && ch[0].by_name === 'Eddie', 'the change record: that loan’s lender, by Eddie, with the reason');
    ok(await until(A.page, (id) => (LDS_loans().find(l => l._id === id) || {}).lenderName === 'E2E Bank', id0, 15000), 'it reaches the admin’s window by itself');

    console.log('\nwhat the admin changed');
    await personEdit(A.page, 0, 'servicingFee', 111);
    ok(await until(A.page, () => !!document.getElementById('cloudBar')), 'the admin’s change waits too');
    await A.page.fill('#cloudReason', 'Fee per the servicer'); await A.page.click('#cloudSaveBtn');
    ok(await until(A.page, () => !document.getElementById('cloudBar')), 'the admin saved');
    await AC.rpc('lds_admin_codes', { approval_code: 'open-sesame' });
    ok(await until(E.page, (id) => (LDS_loans().find(l => l._id === id) || {}).servicingFee === 111, id0, 15000), 'the editor sees it');
    await personEdit(E.page, 0, 'servicingFee', 222);
    await until(E.page, () => !!document.getElementById('cloudBar'));
    await E.page.fill('#cloudReason', 'Fee typo'); await E.page.click('#cloudSaveBtn');
    ok(await until(E.page, () => !!document.getElementById('cloudApproveCode') && /Operator made the last change/.test(document.body.innerText)), 'the editor is asked for the admin’s approval');
    await E.page.click('text=Send to Operator');
    ok(await until(E.page, (id) => !document.getElementById('cloudBar') && (LDS_loans().find(l => l._id === id) || {}).servicingFee === 111, id0), 'sent as a request: the old value stays');
    ok(await until(A.page, () => !!document.getElementById('cloudReqModal') && /Fee typo/.test(document.getElementById('cloudReqModal').innerText), null, 15000), 'the request pops up for the admin');
    await A.page.click('#cloudReqModal [data-apr]');
    ok(await until(A.page, (id) => (LDS_loans().find(l => l._id === id) || {}).servicingFee === 222, id0, 15000), 'approved: it takes effect');
    ok(await until(E.page, (id) => (LDS_loans().find(l => l._id === id) || {}).servicingFee === 222, id0, 15000), '…on the editor’s computer too');

    console.log('\nview-only');
    const V = await launch(ud('viewer'), CLOUD); apps.push(V);
    await signIn(V.page, 'view@co.com');
    ok(await waitApp(V.page) && await until(V.page, (n) => LDS_loans().length === n, localCount), 'the viewer sees everything');
    ok(await until(V.page, () => /View only/.test((document.getElementById('cloudBanner') || {}).textContent || '')), 'the banner: view only');
    await personEdit(V.page, 1, 'lenderName', 'Should not stick');
    ok(await until(V.page, () => !document.getElementById('cloudBar') && LDS_loans()[1].lenderName !== 'Should not stick'), 'a viewer’s change is refused and the screen goes back');

    console.log('\noffline, and a restart');
    await personEdit(E.page, 1, 'lenderName', 'Unsaved Bank');
    await until(E.page, () => !!document.getElementById('cloudBar'));
    si.setDown(true);
    ok(await until(E.page, () => /Offline/.test((document.getElementById('cloudBanner') || {}).textContent || '') && /offline/.test(document.getElementById('cloudChipText').textContent), null, 15000), 'the server unreachable: the offline banner');
    ok(await E.page.evaluate((n) => LDS_loans().length === n, localCount), 'the last picture is still shown');
    si.setDown(false);
    // closing with a change not saved: the app asks; "Close without saving" drops it
    await E.app.evaluate(({ dialog }) => { global.__asked = 0; dialog.showMessageBox = async () => { global.__asked++; return { response: 1 }; }; });
    await E.app.close(); apps.splice(apps.indexOf(E), 1);
    const E2 = await launch(path.join(TMP, 'editor'), CLOUD); apps.push(E2);
    ok(await waitApp(E2.page), 'the editor’s app opens signed in');
    ok(await until(E2.page, () => LDS_loans()[1].lenderName !== 'Unsaved Bank' && !document.getElementById('cloudBar')), 'the change that wasn’t saved is gone');
    for (const x of [A, V, E2]) ok(x.errors.length === 0, 'no page errors (' + (x === A ? 'admin' : x === V ? 'viewer' : 'editor') + ')' + (x.errors.length ? ': ' + x.errors[0] : ''));
  } catch (e) { ok(false, 'threw: ' + (e && e.stack || e)); }
  finally {
    for (const x of apps) { try { await x.app.close(); } catch (e) {} }
    await si.stop(); await db.stop();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(fails.n ? '\nFAILED: ' + fails.n : '\nall cloud e2e checks passed');
  process.exit(fails.n ? 1 : 0);
})();
