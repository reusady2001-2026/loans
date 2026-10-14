/* e2e for 3.0.0 — JOINING A GROUP, in the real app windows, against the test server (a real PostgreSQL with the app's
   setup SQL and the real "lds-join" function behind a stand-in for Supabase's web API; the Gmail API is answered by the
   stand-in, which keeps every email). The email links open the real pages (docs/decide.html, docs/confirm.html) in a
   browser.
     • the group's first admin (named by the maintainer) creates an account: picks the organization from the names that
       appear after 3 letters, confirms the email from the link, signs in;
     • someone else asks to join: waits; the admin gets a pop-up in the app (and an email) and approves; the person
       confirms the email and signs in as an editor;
     • someone is turned down from the email's page: they get an email saying so; the admin's app shows nobody waiting;
     • Members and codes has no way to add a person by email; the admin makes a member view only;
     • someone signed in but in no group asks from the app; approved, "Check again" opens the group;
     • the maintainer's Groups screen in the app.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/cloud-join.e2e.js
   (skipped where PostgreSQL isn't installed) */
const path = require('path'), os = require('os'), fs = require('fs'), http = require('http');
const APP = path.resolve(__dirname, '..', '..');
const PW = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const PG = require(path.join(APP, 'test', 'cloud', '_pg.js'));
const { startStandin } = require(path.join(APP, 'test', 'cloud', 'standin-server.js'));
const { createClient } = require(path.join(APP, 'cloud-client.js'));
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-join-e2e-'));
const ud = (n) => { const d = path.join(TMP, n); fs.mkdirSync(path.join(d, 'claude'), { recursive: true }); fs.writeFileSync(path.join(d, 'claude', 'signed-in.marker'), 'ok'); return d; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launch(udir, env){
  const app = await PW._electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')), args: [APP, '--user-data-dir=' + udir, '--no-sandbox'], cwd: APP,
    env: Object.assign({}, process.env, { LDS_CLOUD_POLL_MS: '800', LDS_CLOUD_AUTO_MS: '300' }, env || {}) });
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  return { app, page, errors };
}
async function until(page, fn, arg, ms){ const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(200); } return false; }
const waitApp = (page) => until(page, () => typeof window.LDS_loans === 'function' && !!document.getElementById('cloudDD') && !document.getElementById('cloudDD').classList.contains('hidden'), null, 30000);
const visible = (page, id) => until(page, (x) => { const e = document.getElementById(x); return !!e && !e.classList.contains('hidden'); }, id);
async function signUp(page, org, pick, name, email, pw){
  await page.waitForSelector('#toSignup', { timeout: 20000 });
  await page.click('#toSignup');
  await page.fill('#suOrg', org);
  const shown = await until(page, (p) => [...document.querySelectorAll('#suSugg button')].some(b => b.textContent === p), pick);
  await page.click('#suSugg button:has-text("' + pick + '")');
  await page.fill('#suName', name); await page.fill('#suEmail', email); await page.fill('#suPw', pw); await page.fill('#suPw2', pw);
  await page.click('#suGo');
  return shown;
}
async function signIn(page, email, pw){
  await page.waitForSelector('#siEmail', { timeout: 20000 });
  await page.fill('#siEmail', email); await page.fill('#siPw', pw); await page.click('#siGo');
}

(async () => {
  if (!PG.findBin()) { console.log('skipped: PostgreSQL isn’t installed here'); return; }
  // the GitHub Pages site (docs/), with config.js pointing at the test server
  let fnUrl = '', key = '';
  const pages = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), name = path.basename(u.pathname);
    if (name === 'config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.LDS_JOIN = ' + JSON.stringify({ url: fnUrl, key }) + ';'); }
    const f = path.join(APP, 'docs', name);
    if (!/^[a-z]+\.html$/.test(name) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => pages.listen(0, '127.0.0.1', r));
  const PAGES = 'http://127.0.0.1:' + pages.address().port;
  const db = await PG.start(), si = await startStandin(db, { pagesUrl: PAGES });
  fnUrl = si.url + '/functions/v1/lds-join'; key = si.anonKey;
  const CLOUD = { LDS_CLOUD_URL: si.url, LDS_CLOUD_ANON_KEY: si.anonKey };
  const mailTo = (to) => si.mail.filter(m => m.to === to).slice(-1)[0] || null;
  const linkIn = (m, page) => m && m.links.find(x => x.indexOf('/' + page + '?') > 0);
  const browser = await PW.chromium.launch();
  const web = await browser.newPage();
  const apps = [];
  try {
    await si.sql("insert into app.maintainers(email) values ('op@co.com')");
    await si.sql("select app.make_group('Living Residential', 'op@co.com', 'Operator')");
    await si.sql("select app.make_group('Livermore Partners', 'lp@lp.com', 'L P')");

    console.log('\nthe first admin creates an account (named by the maintainer: no approval)');
    const A = await launch(ud('operator'), CLOUD); apps.push(A);
    await A.page.waitForSelector('#toSignup', { timeout: 20000 });
    await A.page.click('#toSignup');
    await A.page.fill('#suOrg', 'Li');
    await sleep(700);
    ok(await A.page.evaluate(() => document.querySelectorAll('#suSugg button').length === 0), 'two letters: no names yet');
    await A.page.fill('#suOrg', 'Liv');
    ok(await until(A.page, () => [...document.querySelectorAll('#suSugg button')].map(b => b.textContent).join('|') === 'Livermore Partners|Living Residential'), 'three letters: the groups whose name starts with them, to pick from');
    await A.page.click('#suSugg button:has-text("Living Residential")');
    ok(await A.page.evaluate(() => /Living Residential/.test(document.getElementById('suPicked').textContent) && document.querySelectorAll('#suSugg button').length === 0), 'picked: the list closes, the pick is shown');
    await A.page.fill('#suName', 'Operator'); await A.page.fill('#suEmail', 'op@co.com'); await A.page.fill('#suPw', 'op-pw-1234'); await A.page.fill('#suPw2', 'op-pw-1234');
    await A.page.click('#suGo');
    ok(await visible(A.page, 'vWaiting') && await A.page.evaluate(() => document.getElementById('wtTitle').textContent === 'Confirm your email'), 'on the list already: told to confirm the email');
    const opMail = mailTo('op@co.com');
    ok(!!linkIn(opMail, 'confirm.html') && linkIn(opMail, 'confirm.html').indexOf(PAGES + '/confirm.html?') === 0, 'the email has the confirmation link');
    await web.goto(linkIn(opMail, 'confirm.html'));
    ok(await until(web, () => /Your email is confirmed/.test(document.getElementById('title').textContent) && /sign in with op@co\.com/.test(document.getElementById('text').textContent)), 'the link’s page: “Your email is confirmed — go back to the app and sign in”');
    await A.page.click('#wtSignin');
    ok(await A.page.evaluate(() => document.getElementById('siEmail').value === 'op@co.com'), 'back on the sign-in screen with the email filled in');
    await A.page.fill('#siPw', 'op-pw-1234'); await A.page.click('#siGo');
    ok(await waitApp(A.page), 'the admin signs in: the app opens');

    console.log('\nsomeone asks to join; the admin approves in the app');
    const D = await launch(ud('dana'), CLOUD); apps.push(D);
    await signUp(D.page, 'living', 'Living Residential', 'Dana Cohen', 'dana@co.com', 'dana-pw-123');
    ok(await visible(D.page, 'vWaiting') && await D.page.evaluate(() => /Your request to join Living Residential is with its admin, Operator/.test(document.getElementById('wtText').textContent)), 'Dana waits for the admin’s approval');
    ok(/Dana Cohen asks to join Living Residential/.test((mailTo('op@co.com') || {}).subject || ''), 'the admin gets an email too');
    await D.page.click('#wtSignin');
    ok(await D.page.evaluate(() => !document.getElementById('siWaiting').classList.contains('hidden') && /Living Residential/.test(document.getElementById('siWaiting').textContent)), 'the sign-in screen remembers the request waits');
    await D.page.fill('#siPw', 'dana-pw-123'); await D.page.click('#siGo');
    ok(await until(D.page, () => /isn't ready yet/.test(document.getElementById('siMsg').textContent)), 'signing in before approval: “this account isn’t ready yet”');
    ok(await until(A.page, () => !!document.querySelector('#cloudJoinModal [data-join]') && /Dana Cohen/.test(document.getElementById('cloudJoinModal').textContent) && /dana@co\.com/.test(document.getElementById('cloudJoinModal').textContent)), 'the admin’s app pops up: Dana asks to join');
    ok(await A.page.evaluate(() => /1 asking to join/.test(document.getElementById('cloudChipText').textContent)), 'the chip shows it too');
    await A.page.click('#cloudJoinModal [data-jyes]');
    ok(await until(A.page, () => /Approved\. Dana Cohen gets an email to confirm/.test(document.getElementById('cloudJoinModal').textContent)), 'approved: Dana gets an email to confirm, then joins as an editor');
    await A.page.click('#cloudJoinModal [data-cm-btns] button');
    const dMail = mailTo('dana@co.com');
    ok(dMail && dMail.subject === 'Confirm your email to join Living Residential', 'Dana’s email: confirm to join');
    await web.goto(linkIn(dMail, 'confirm.html'));
    ok(await until(web, () => /Your email is confirmed/.test(document.getElementById('title').textContent)), 'Dana confirms');
    await D.page.fill('#siPw', 'dana-pw-123'); await D.page.click('#siGo');
    ok(await waitApp(D.page) && await until(D.page, () => /Dana Cohen · Editor/.test(document.getElementById('cloudChipText').textContent)), 'Dana signs in: an editor of the group');

    console.log('\nturned down from the email’s page');
    const X = await launch(ud('mallory'), CLOUD); apps.push(X);
    await signUp(X.page, 'Living', 'Living Residential', 'Mallory', 'mal@evil.com', 'mal-pw-1234');
    ok(await visible(X.page, 'vWaiting'), 'Mallory waits');
    const decide = new URL(mailTo('op@co.com').links.find(l => /a=turn_down/.test(l)));
    ok(decide.origin === PAGES, 'the admin’s email has a Turn down button');
    await web.goto(decide.href);
    ok(await until(web, () => /Mallory asks to join Living Residential/.test(document.getElementById('title').textContent) && !document.getElementById('buttons').classList.contains('hidden')), 'its page shows who asks; nothing decided yet');
    ok(Number((await si.sql("select count(*) n from app.join_requests where email = 'mal@evil.com' and status = 'waiting'")).rows[0].n) === 1, 'opening the page decided nothing');
    await web.click('#turnDown');
    ok(await until(web, () => /Turned down\. Mallory gets an email saying so/.test(document.getElementById('msg').textContent)), 'turned down');
    ok(/turned down your request/.test((mailTo('mal@evil.com') || {}).text || ''), 'Mallory’s email says so');
    await web.reload();
    ok(await until(web, () => /already turned down by Operator/.test(document.getElementById('msg').textContent) && document.getElementById('buttons').classList.contains('hidden')), 'the page again: already turned down');
    ok(await until(A.page, () => !/asking to join/.test(document.getElementById('cloudChipText').textContent)), 'the admin’s app: nobody waiting');
    ok(await until(A.page, () => !document.getElementById('cloudJoinModal')), 'its pop-up in the admin’s app closed by itself (decided from the email)');

    console.log('\nmembers and codes');
    await A.page.click('#cloudChip'); await A.page.click('[data-cloud="members"]');
    await A.page.waitForSelector('[data-role="dana@co.com"]');
    ok(await A.page.evaluate(() => !document.getElementById('cmEmail') && !document.getElementById('cmAdd')), 'no box to add a person by email');
    await A.page.selectOption('[data-role="dana@co.com"]', 'viewer');
    ok(await until(D.page, () => /Dana Cohen · View only/.test(document.getElementById('cloudChipText').textContent)), 'the admin makes Dana view only: her app shows it');
    await A.page.click('[data-cm-btns] button');

    console.log('\nsigned in, in no group: asks from the app');
    { const c = createClient({ url: si.url, anonKey: si.anonKey }); await c.signUp('gil@co.com', 'gil-pw-1234'); await si.confirm('gil@co.com'); }
    const G = await launch(ud('gil'), CLOUD); apps.push(G);
    await signIn(G.page, 'gil@co.com', 'gil-pw-1234');
    ok(await visible(G.page, 'vNoGroup'), 'Gil is in no group');
    await G.page.fill('#akOrg', 'Living R');
    await until(G.page, () => document.querySelectorAll('#akSugg button').length === 1);
    await G.page.click('#akSugg button'); await G.page.fill('#akName', 'Gil Green'); await G.page.click('#akGo');
    ok(await until(G.page, () => /Asked\. Living Residential's admin, Operator, approves it/.test(document.getElementById('akMsg').textContent)), 'asked with the account he is signed in with');
    ok(await until(A.page, () => !!document.querySelector('#cloudJoinModal [data-join]') && /Gil Green/.test(document.getElementById('cloudJoinModal').textContent)), 'the admin’s pop-up');
    await A.page.click('#cloudJoinModal [data-jyes]');
    ok(await until(A.page, () => /Approved\./.test(document.getElementById('cloudJoinModal').textContent)), 'approved');
    await A.page.click('#cloudJoinModal [data-cm-btns] button');
    ok((mailTo('gil@co.com') || {}).subject === 'You’ve joined Living Residential'.replace('’', "'"), 'Gil’s email: joined (his email was confirmed already)');
    await G.page.click('#ngRetry');
    ok(await waitApp(G.page) && await until(G.page, () => /Gil Green · Editor/.test(document.getElementById('cloudChipText').textContent)), '“Check again”: the group opens');

    console.log('\nthe maintainer’s groups');
    await A.page.click('#cloudChip'); 
    ok(await A.page.evaluate(() => !!document.querySelector('[data-cloud="groups"]')), 'the maintainer (also this group’s admin) has Groups in the menu');
    await A.page.click('[data-cloud="groups"]');
    ok(await until(A.page, () => /Living Residential/.test(document.body.textContent) && /Livermore Partners/.test(document.body.textContent) && !!document.getElementById('cgCreate')), 'every group and its admin, and making a new one');
    await A.page.fill('#cgName', 'Third Group'); await A.page.fill('#cgAdmin', 'third@t.com'); await A.page.fill('#cgAdminName', 'Tess'); await A.page.click('#cgCreate');
    ok(await until(A.page, () => /Third Group/.test(document.body.textContent)), 'a new group is made');

    const errs = [].concat(A.errors, D.errors, X.errors, G.errors);
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } catch (e) { ok(false, 'threw: ' + (e && e.stack || e)); }
  finally {
    for (const a of apps) { try { await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }); } catch (e) {} try { await a.app.close(); } catch (e) {} }
    try { await browser.close(); } catch (e) {}
    await si.stop(); await db.stop(); pages.close();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(fails.n ? '\n' + fails.n + ' FAILED' : '\nall passed');
  process.exit(fails.n ? 1 : 0);
})();
