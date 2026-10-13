/* e2e for 3.0.0 — the shared database's screens, in the real app window against the test server:
     • the maintainer creates an account in the app, signs in, makes a group and names its admin;
     • the admin: members and codes (add an editor, make them view-only, set the approval code);
     • a document added on the admin's computer waits for its reason, then opens on the editor's computer;
     • a chat is read by everyone and continued only by the person who started it;
     • the change history lists each change with who and why;
     • the admin puts a daily backup back.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/cloud-3000-admin.e2e.js
   (skipped where PostgreSQL isn't installed) */
const path = require('path'), os = require('os'), fs = require('fs');
const APP = path.resolve(__dirname, '..', '..');
const { _electron: electron } = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const PG = require(path.join(APP, 'test', 'cloud', '_pg.js'));
const { startStandin } = require(path.join(APP, 'test', 'cloud', 'standin-server.js'));
const { createClient } = require(path.join(APP, 'cloud-client.js'));
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-cloud-adm-'));
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
// the bar of changes not saved: type why, Save
async function saveWith(page, reason){ await until(page, () => !!document.getElementById('cloudBar')); await page.fill('#cloudReason', reason); await page.click('#cloudSaveBtn'); return until(page, () => !document.getElementById('cloudBar')); }

(async () => {
  if (!PG.findBin()) { console.log('skipped: PostgreSQL isn’t installed here'); return; }
  const db = await PG.start(), si = await startStandin(db);
  const CLOUD = { LDS_CLOUD_URL: si.url, LDS_CLOUD_ANON_KEY: si.anonKey };
  const acct = async (email) => { const c = createClient({ url: si.url, anonKey: si.anonKey }); await c.signUp(email, 'secret-pw-1'); await si.confirm(email); await c.signIn(email, 'secret-pw-1'); return c; };
  const apps = [];
  try {
    await si.sql("insert into app.maintainers(email) values ('maint@co.com')");
    // the maintainer's account is made in Supabase's dashboard; the others' accounts (asking to join: cloud-join.e2e.js)
    await acct('maint@co.com'); await acct('op@co.com'); await acct('ed@co.com');

    console.log('\nthe maintainer');
    const M = await launch(ud('maint'), CLOUD); apps.push(M);
    await signIn(M.page, 'maint@co.com');
    ok(await until(M.page, () => !document.getElementById('maint').classList.contains('hidden')), 'the maintainer sees Groups');
    await M.page.fill('#gName', 'Living Residential'); await M.page.fill('#gAdmin', 'op@co.com'); await M.page.fill('#gAdminName', 'Operator');
    await M.page.click('#fGroup button[type=submit]');
    ok(await until(M.page, () => /Living Residential/.test(document.getElementById('gList').textContent) && /op@co.com/.test(document.getElementById('gList').textContent)), 'the group is made, with its admin');

    console.log('\nthe admin: members and codes');
    const A = await launch(ud('admin'), CLOUD); apps.push(A);
    await signIn(A.page, 'op@co.com'); ok(await waitApp(A.page), 'the admin is in');
    // Eddie asked to join and the admin approved (that flow: cloud-join.e2e.js)
    await si.addMember('ed@co.com', (await si.sql("select group_id from app.members where email = 'op@co.com'")).rows[0].group_id, 'Eddie', 'editor');
    await menu(A.page, 'members');
    ok(await until(A.page, () => /ed@co.com/.test(document.body.innerText) && !!document.querySelector('[data-role="ed@co.com"]')), 'the editor is listed');
    await A.page.selectOption('[data-role="ed@co.com"]', 'viewer');
    await sleep(800);
    ok((await si.sql("select role from app.members where email = 'ed@co.com'")).rows[0].role === 'viewer', 'made view-only');
    await A.page.selectOption('[data-role="ed@co.com"]', 'editor'); await sleep(800);
    await A.page.fill('#cmAppr', 'open-sesame'); await A.page.fill('#cmOff', 'offline-123'); await A.page.click('#cmCodes');
    await sleep(800);
    const codes = (await si.sql("select approval_hash, offline_hash from app.members where email = 'op@co.com'")).rows[0];
    ok(!!codes.approval_hash && /^pbkdf2\$/.test(codes.offline_hash || ''), 'the codes are set (kept only as hashes)');
    await A.page.keyboard.press('Escape'); await A.page.evaluate(() => document.querySelectorAll('.fixed.inset-0.z-\\[85\\]').forEach(n => n.remove()));

    console.log('\na document and a chat');
    const key = 'name:alpha tower';
    // a person adds a document (the keyboard first, so it is theirs)
    await A.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))); await sleep(500);
    const saved = await A.page.evaluate((k) => window.ldsShell.docSave({ propKey: k, propName: 'Alpha Tower', name: 'Loan Agreement.pdf', base64: btoa('%PDF-1.4 the agreement'), text: 'agreement text', type: 'application/pdf', role: 'agreement' }), key);
    ok(saved && saved.ok, 'a document is added on the admin’s computer');
    ok(await until(A.page, () => !!document.getElementById('cloudBar') && /documents/.test(document.getElementById('cloudBarWhat').textContent)), 'it waits for its reason');
    ok(await saveWith(A.page, 'The signed agreement'), 'saved with the reason');
    const chat = await A.page.evaluate(() => window.ldsShell.chatSave({ scope: 'portfolio', scopeName: 'Portfolio', title: 'Rates', messages: [{ role: 'user', text: 'what is SOFR?' }, { role: 'assistant', text: 'A rate.' }] }));
    ok(chat && chat.ok, 'the admin talks to the assistant (a chat)');
    const E = await launch(ud('editor'), CLOUD); apps.push(E);
    await signIn(E.page, 'ed@co.com'); ok(await waitApp(E.page), 'the editor is in');
    ok(await until(E.page, async (k) => { const l = await window.ldsShell.docList(k); const f = l && (l.files || []).find(x => x.name === 'Loan Agreement.pdf'); if (!f) return false; const r = await window.ldsShell.docRead(k, f.id); return r && r.ok && atob(r.base64) === '%PDF-1.4 the agreement'; }, key, 20000), 'the document opens on the editor’s computer');
    const list = await E.page.evaluate(() => window.ldsShell.chatListAll());
    const c = (list.conversations || []).find(x => x.id === chat.conversation.id);
    ok(c && c.ownerName === 'Operator', 'the editor sees the chat, with who started it');
    const cont = await E.page.evaluate((id) => window.ldsShell.chatSave({ scope: 'portfolio', id, title: 'Rates', messages: [{ role: 'user', text: 'mine now' }] }), chat.conversation.id);
    ok(cont && cont.ok === false && /Only Operator/.test(cont.error), 'only the person who started it continues it');

    console.log('\nthe change history');
    await menu(E.page, 'history');
    ok(await until(E.page, () => /The signed agreement/.test((document.getElementById('chList') || {}).textContent || '') && /Operator/.test(document.getElementById('chList').textContent)), 'the history lists the change, who made it and why');
    await E.page.fill('#chFind', 'no such thing');
    ok(await until(E.page, () => /No changes found/.test(document.getElementById('chList').textContent)), 'it can be searched');

    console.log('\nthe daily backup');
    await si.sql('select app.daily_backup()');
    await A.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))); await sleep(500);
    const del = await A.page.evaluate(async (k) => { const l = await window.ldsShell.docList(k); const f = l.files.find(x => x.name === 'Loan Agreement.pdf'); return window.ldsShell.docDelete(k, f.id); }, key);
    ok(del && del.ok && await saveWith(A.page, 'Removed by mistake'), 'the admin removes the document (by mistake)');
    await menu(A.page, 'backups');
    await A.page.waitForSelector('[data-day]'); await A.page.click('[data-day]');
    await A.page.waitForSelector('#cloudAskIn'); await A.page.fill('#cloudAskIn', 'Undo the removal');
    await A.page.click('text=Put it back');
    ok(await until(A.page, async (k) => { const l = await window.ldsShell.docList(k); return (l.files || []).some(x => x.name === 'Loan Agreement.pdf'); }, key, 20000), 'the day is put back: the document is there again');
    ok(await until(E.page, async (k) => { const l = await window.ldsShell.docList(k); return (l.files || []).some(x => x.name === 'Loan Agreement.pdf'); }, key, 20000), '…on the editor’s computer too');
    const rc = (await si.sql("select count(*) n from app.changes where kind = 'restore' and reason like '%Undo the removal%'")).rows[0].n;
    ok(Number(rc) > 0, 'putting it back is recorded with the reason');
    for (const x of [M, A, E]) ok(x.errors.length === 0, 'no page errors' + (x.errors.length ? ': ' + x.errors[0] : ''));
  } catch (e) { ok(false, 'threw: ' + (e && e.stack || e)); }
  finally {
    for (const x of apps) { try { await x.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }); } catch (e) {} try { await x.app.close(); } catch (e) {} }
    await si.stop(); await db.stop();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(fails.n ? '\nFAILED: ' + fails.n : '\nall cloud admin e2e checks passed');
  process.exit(fails.n ? 1 : 0);
})();
