/* e2e for 2.9.16 — THE T12 GATE. A T12 that comes in (Underwriting, Documents, Read again) is read by the reader (the
   sheet from Excel row 1, a box per category, every check) and by the AI before anything from it is used:
     • every check passes and the AI agrees → used at once, no pop-up ("✓ Checked by the reader and the AI");
     • a check fails → the review pops up with the file's own rows; nothing is used until you decide; "Keep it waiting"
       leaves it waiting (Underwriting, Documents, Data Health say so); an amount you change needs a note and changes
       the NOI; "Save anyway" when checks still fail;
     • the AI disagrees → the review pops up with the AI's points (Excel rows); saving it as is → "Reviewed by you";
     • Claude isn't connected → "Claude isn't connected": "Use the reader's reading" (only when every check passes),
       "Review it myself" or "Keep it waiting";
     • "Read again" redoes the whole reading; "Review the reading" is always there;
     • after the update every T12 read before 2.9.16 is re-read once: passes + agrees → checked; Claude off → in use,
       the AI re-check pending; old decisions on a row that is no longer an account are dropped → "needs your review"
       (still in use), listed in Data Health.
   Uses the fake Claude CLI (test/fixtures/fake-claude-push.js, LDS_FAKE_T12=agree|disagree). LDS_T12_MANUAL=1: this
   test answers the pop-ups itself.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-gate-2916.e2e.js */
process.env.LDS_T12_MANUAL = '1';
const path = require('path'), os = require('os'), fs = require('fs');
const APP = path.resolve(__dirname, '..', '..');
const { _electron: electron } = require((process.env.GN || '/opt/node22/lib/node_modules') + '/playwright');
const XLSX = require(path.join(APP, 'vendor', 'xlsx.full.min.js'));
const FAKE = path.join(APP, 'test', 'fixtures', 'fake-claude-push.js');
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lds-t12gate-'));
fs.mkdirSync(path.join(UDATA, 'claude'), { recursive: true }); fs.writeFileSync(path.join(UDATA, 'claude', 'signed-in.marker'), 'ok');
const CALLS = path.join(UDATA, 'fake-calls.txt'), INPUT = path.join(UDATA, 'fake-t12-input.txt');
const fails = { n: 0 }; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.n++; };
const M = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'];
const rowOf = (l, v) => [l, ...Array(12).fill(v), v * 12];
// two empty rows above the statement: Excel row N = the reader's row N only when the sheet is read from row 1
function fixture(name, bad){
  const a = [[], [], ['Account', ...M, 'Total'], ['INCOME'], rowOf('Gross Potential Rent', 100000), rowOf('Utility Reimbursements', 5000), rowOf('TOTAL INCOME', 105000),
    ['EXPENSES'], rowOf('Real Estate Taxes', 10000), rowOf('Repairs and Maintenance', 4000), rowOf('TOTAL EXPENSES', 14000), rowOf('NET OPERATING INCOME', 91000)];
  if (bad) a[9][1] = 4500;   // Excel row 10, January: the months no longer add up to the Total
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Report1');
  const p = path.join(UDATA, name); fs.writeFileSync(p, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return p;
}
const GOOD = fixture('t12-gate-good.xlsx', false), BAD = fixture('t12-gate-bad.xlsx', true);
const WW = 'name:villages of whitewater', IND = 'name:villages of independence', BUR = 'name:villages of burlington', FLO = 'name:villages of florence', WM = 'name:weaver mill';

async function launch(env){
  const app = await electron.launch({ executablePath: require(path.join(APP, 'node_modules', 'electron')), args: [APP, '--user-data-dir=' + UDATA, '--no-sandbox'], cwd: APP,
    env: Object.assign({}, process.env, { LDS_FAKE_CALLS_FILE: CALLS, LDS_FAKE_T12_INPUT: INPUT, LDS_T12_MANUAL: '1' }, env) });
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\//, r => r.abort()); await page.waitForSelector('tr[data-goto]', { state: 'attached', timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  // remember every pop-up that shows, with whether the property's T12 was in use at that moment
  await page.evaluate(() => { window.__pops = []; new MutationObserver(() => { ['data-t12rv', 'data-t12nc'].forEach(a => { const n = document.querySelector('[' + a + ']'); if (n && !n.__seen){ n.__seen = 1; window.__pops.push(a); } }); }).observe(document.body, { childList: true, subtree: true }); });
  return { app, page, errors };
}
async function openUw(page){
  await page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click(); const o = document.querySelector('[data-tabopen="underwriting"]'); if (o) o.click(); });
  await page.waitForFunction(() => { const v = document.getElementById('uwView'); return v && !v.hidden && !!document.getElementById('opPropPick'); }, null, { timeout: 8000 });
}
const pick = (page, key) => page.evaluate((k) => { const s = document.getElementById('opPropPick'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, key).then(() => page.waitForTimeout(1200));
const entries = (page, key) => page.evaluate((k) => window.LDS_t12Entries(k), key);
const entryOf = async (page, key, file) => (await entries(page, key)).filter(e => !file || e.fileName === file).slice(-1)[0] || null;
async function waitStatus(page, key, re, ms){ const t0 = Date.now(); let e = null; while (Date.now() - t0 < (ms || 30000)){ e = await entryOf(page, key); if (e && re.test(e.status)) return e; await page.waitForTimeout(250); } return e; }
const t12Noi = (page, key) => page.evaluate(async (k) => { const r = await window.LDS_readT12(k); return r ? r.noi : null; }, key);
const pops = (page) => page.evaluate(() => window.__pops.slice());
const popText = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.innerText : ''; }, sel);
const waitFor = (page, sel, ms) => page.waitForFunction((s) => !!document.querySelector(s), sel, { timeout: ms || 30000 }).then(() => true).catch(() => false);
const waitGone = (page, sel, ms) => page.waitForFunction((s) => !document.querySelector(s), sel, { timeout: ms || 15000 }).then(() => true).catch(() => false);
const click = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);
const callsN = () => { try { return (fs.readFileSync(CALLS, 'utf8').match(/T12-READ/g) || []).length; } catch (e) { return 0; } };
const lastToasts = (page) => page.evaluate(() => [...document.querySelectorAll('#toastHost > *, [data-toast], .toast')].map(t => t.innerText).join(' | '));
async function setRow(page, attr, row, value){
  return page.evaluate(({ attr, row, value }) => { const n = document.querySelector('[data-t12rv] [' + attr + '="' + row + '"]'); if (!n) return false; n.value = value; n.dispatchEvent(new Event('change', { bubbles: true })); return true; }, { attr, row, value });
}

(async () => {
  // ═══ run 1: Claude connected, the AI agrees ═════════════════════════════════════════════════════════════════════
  let { app, page, errors } = await launch({ LDS_CLAUDE_BIN: FAKE, LDS_FAKE_T12: 'agree' });
  await openUw(page);
  console.log('— a T12 that passes every check, and the AI agrees');
  await pick(page, WW);
  await page.setInputFiles('#uwFile', GOOD);
  let e = await waitStatus(page, WW, /^checked$/);
  ok(e && e.status === 'checked' && e.reader && e.reader.ok && e.ai && e.ai.status === 'agree', 'read by the reader and the AI, every check passes and they agree → "checked" (got ' + (e && e.status) + ')');
  ok((await pops(page)).length === 0, 'no pop-up');
  ok(Math.abs((await t12Noi(page, WW)) - 1092000) < 0.01, 'its NOI is used: $1,092,000');
  await page.waitForTimeout(800);
  const inuse = await page.evaluate(() => { const n = document.querySelector('[data-t12inuse]'); return n ? n.getAttribute('data-t12inuse') + ' | ' + n.innerText : ''; });
  ok(/^checked \|/.test(inuse) && /Checked by the reader and the AI/.test(inuse) && /Review the reading/.test(inuse) && /Read again/.test(inuse), 'Underwriting: "✓ Checked by the reader and the AI" with Review the reading and Read again (' + inuse.slice(0, 120) + ')');
  const given = fs.existsSync(INPUT) ? fs.readFileSync(INPUT, 'utf8') : '';
  ok(/^Row 1: \(empty\)$/m.test(given) && /^Row 2: \(empty\)$/m.test(given) && /^Row 3: Account \| Jan 2026/m.test(given) && /^Row 12: NET OPERATING INCOME \|/m.test(given), 'the AI was given the sheet from Excel row 1, rows numbered as in Excel (row 3 the header, row 12 the NOI)');

  console.log('— Review the reading (always there)');
  await click(page, '[data-t12inuse] [data-t12open]');
  ok(await waitFor(page, '[data-t12rv]', 10000), 'the review opens');
  const rv1 = await page.evaluate(() => { const v = (r) => { const s = document.querySelector('[data-t12rv] [data-t12rv-role="' + r + '"]'); return s ? s.value : null; };
    return { r5: v(5), r7: v(7), r10: v(10), r11: v(11), r12: v(12), first: (document.querySelector('[data-t12rv] tbody tr td') || {}).innerText, text: document.querySelector('[data-t12rv]').innerText }; });
  ok(rv1.r5 === 'account' && rv1.r7 === 'income-total' && rv1.r10 === 'account' && rv1.r11 === 'expense-total' && rv1.r12 === 'noi', 'every row as Excel numbers it: row 5 an account, row 7 the income total, row 11 the expense total, row 12 the NOI');
  ok(rv1.first === '1', 'the table starts at Excel row 1');
  ok(/every check passes/.test(rv1.text) && /the AI agrees with the reader/.test(rv1.text), '"every check passes · the AI agrees with the reader"');
  await click(page, '[data-t12rv] [data-t12rv-wait]');
  ok(await waitGone(page, '[data-t12rv]'), '"Close without saving" closes it');
  ok(((await entryOf(page, WW)) || {}).status === 'checked', '…and nothing changed');

  console.log('— Read again');
  const n0 = callsN(), at0 = ((await entryOf(page, WW)) || {}).at;
  await click(page, '[data-t12again]');
  await page.waitForFunction(() => window.LDS_t12Busy().length > 0, null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => window.LDS_t12Busy().length === 0, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  e = await entryOf(page, WW);
  ok(callsN() === n0 + 1 && e.status === 'checked' && e.at !== at0, 'the whole reading runs again (the AI read it again), still checked');

  console.log('— a check fails: the review pops up before anything is used');
  await pick(page, IND);
  const indBefore = await t12Noi(page, IND);
  await page.setInputFiles('#uwFile', BAD);
  ok(await waitFor(page, '[data-t12rv]', 30000), 'the review pops up');
  e = await entryOf(page, IND);
  ok(e && e.status === 'waiting' && e.reader && !e.reader.ok && e.reader.failures === 1, 'the T12 waits for you (1 check fails)');
  ok((await t12Noi(page, IND)) === indBefore, 'nothing from it is used while it waits (' + indBefore + ')');
  let t = await popText(page, '[data-t12rv]');
  ok(/1 check fails/.test(t) && /Row 10/.test(t) && /Repairs and Maintenance/.test(t) && /months add up to \$48,500\.00/.test(t), 'it shows the failing check on Excel row 10: the Total is $48,000.00 but its months add up to $48,500.00');
  await click(page, '[data-t12rv] [data-t12rv-wait]');
  ok(await waitGone(page, '[data-t12rv]'), '"Keep it waiting" closes it');
  await page.waitForTimeout(800);
  ok((await entryOf(page, IND)).status === 'waiting' && (await t12Noi(page, IND)) === indBefore, '…still waiting, still unused');
  const wbox = await page.evaluate(() => { const n = document.querySelector('[data-t12waiting]'); return n ? n.innerText : ''; });
  ok(/t12-gate-bad\.xlsx/.test(wbox) && /waiting for your review/.test(wbox) && /1 check fails/.test(wbox), 'Underwriting says it is waiting for your review, and why (' + wbox.slice(0, 100) + ')');
  // Documents: the file says so too
  await page.evaluate((k) => window.LDS_openProfile(k), IND);
  await page.waitForFunction(() => !!document.querySelector('[data-doct12]'), null, { timeout: 8000 }).catch(() => {});
  const docBadge = await page.evaluate(() => [...document.querySelectorAll('[data-doct12]')].map(n => n.getAttribute('data-doct12') + ':' + n.innerText).join(' | '));
  ok(/waiting:T12: Waiting for your review/.test(docBadge) && /Review/.test(docBadge), 'Documents: "T12: Waiting for your review · Review" (' + docBadge + ')');
  await openUw(page); await pick(page, IND);

  console.log('— you decide: an amount of yours needs a note, and it changes the NOI');
  await click(page, '[data-t12waiting] [data-t12open]');
  ok(await waitFor(page, '[data-t12rv]', 10000), 'Review opens it again');
  await setRow(page, 'data-t12rv-amt', 10, '48500');
  await page.waitForTimeout(300);
  await click(page, '[data-t12rv] [data-t12rv-save]');
  await page.waitForTimeout(600);
  ok(!!(await page.$('[data-t12rv]')) && /needs one|Add a note/.test(await lastToasts(page) + (await page.evaluate(() => document.body.innerText))), 'Save without a note is refused: an amount that differs from the file needs one');
  await setRow(page, 'data-t12rv-note', 10, 'the months are right — per the GL');
  await page.waitForTimeout(300);
  t = await popText(page, '[data-t12rv]');
  ok(/1 change of yours/.test(t), '"1 change of yours"');
  await click(page, '[data-t12rv] [data-t12rv-save]');
  const conf = await page.waitForFunction(() => { const m = document.getElementById('confirmModal'); return m && !m.classList.contains('hidden') ? document.getElementById('confirmTitle').innerText + ' | ' + document.getElementById('confirmText').innerText : null; }, null, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => '');
  ok(/Some checks still fail/.test(conf) && /Your reading is used/.test(conf), 'checks still fail (the printed totals) → "Save anyway?", saying your reading is used (' + conf.slice(0, 140) + ')');
  ok(await page.evaluate(() => { const m = document.getElementById('confirmModal'); const r = document.querySelector('[data-t12rv]'); return !r || +getComputedStyle(m).zIndex > +getComputedStyle(r).zIndex; }), '…on top of the review');
  await click(page, '#confirmOk');
  e = await waitStatus(page, IND, /^reviewed$/, 15000);
  ok(e && e.status === 'reviewed' && e.overrides.length === 1 && e.overrides[0].row === 10 && e.overrides[0].amount === 48500 && /per the GL/.test(e.overrides[0].note), 'saved: "Reviewed by you", your change kept with its note (row 10, $48,500)');
  await page.waitForTimeout(800);
  ok(Math.abs((await t12Noi(page, IND)) - 1091500) < 0.01, 'your amount reaches the NOI: $1,092,000 − $500 = $1,091,500 (got ' + (await t12Noi(page, IND)) + ')');
  ok(errors.length === 0, 'run 1: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();

  // ═══ run 2: the AI disagrees ═════════════════════════════════════════════════════════════════════════════════════
  ({ app, page, errors } = await launch({ LDS_CLAUDE_BIN: FAKE, LDS_FAKE_T12: 'disagree' }));
  await openUw(page);
  console.log('— after a restart');
  ok(((await entryOf(page, WW)) || {}).status === 'checked' && ((await entryOf(page, IND)) || {}).status === 'reviewed', 'the readings are kept (checked · reviewed)');
  ok(Math.abs((await t12Noi(page, IND)) - 1091500) < 0.01, '…and your change still holds ($1,091,500)');
  console.log('— the AI disagrees: the review pops up');
  await pick(page, BUR);
  await page.setInputFiles('#uwFile', GOOD);
  ok(await waitFor(page, '[data-t12rv]', 30000), 'the review pops up');
  e = await entryOf(page, BUR);
  ok(e && e.status === 'waiting' && e.reader.ok && e.ai.status === 'disagree' && e.ai.items.length === 2, 'every check passes, the AI disagrees on 2 points → waiting');
  ok((await t12Noi(page, BUR)) == null, 'nothing from it is used yet');
  t = await popText(page, '[data-t12rv]');
  ok(/the AI disagrees on 2 points/.test(t) && /Row 6/.test(t) && /Row 10/.test(t), 'it lists the AI\'s points on their Excel rows (6: the reimbursements\' side; 10: repairs $600 higher)');
  await click(page, '[data-t12rv] [data-t12rv-save]');
  e = await waitStatus(page, BUR, /^reviewed$/, 15000);
  ok(e && e.status === 'reviewed' && e.overrides.length === 0, 'you keep the reader\'s reading → "Reviewed by you"');
  await page.waitForTimeout(800);
  ok(Math.abs((await t12Noi(page, BUR)) - 1092000) < 0.01, '…and it is used ($1,092,000)');
  console.log('— Read again finds a disagreement on a T12 in use');
  await pick(page, WW);
  await click(page, '[data-t12again]');
  ok(await waitFor(page, '[data-t12rv]', 30000), 'the review pops up');
  await click(page, '[data-t12rv] [data-t12rv-wait]');
  e = await waitStatus(page, WW, /^recheck-review$/, 8000);
  ok(e && e.status === 'recheck-review', '"Read again — needs your review (still in use)"');
  ok(Math.abs((await t12Noi(page, WW)) - 1092000) < 0.01, '…its numbers stay in use until you decide');
  ok(errors.length === 0, 'run 2: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();

  // ═══ run 3: Claude isn't connected ═══════════════════════════════════════════════════════════════════════════════
  ({ app, page, errors } = await launch({ LDS_CLAUDE_BIN: '/nonexistent' }));
  await openUw(page);
  console.log('— Claude isn\'t connected, every check passes');
  await pick(page, FLO);
  await page.setInputFiles('#uwFile', GOOD);
  ok(await waitFor(page, '[data-t12nc]', 30000), 'a pop-up');
  t = await popText(page, '[data-t12nc]');
  ok(/Claude isn’t connected/.test(t) && /Nothing from it is used yet/.test(t) && /The reader’s checks all pass/.test(t) && /Use the reader’s reading/.test(t) && /Review it myself/.test(t) && /Keep it waiting/.test(t), '"Claude isn\'t connected" — Use the reader\'s reading · Review it myself · Keep it waiting');
  ok(((await entryOf(page, FLO)) || {}).status === 'waiting' && (await t12Noi(page, FLO)) == null, 'nothing is used until you choose');
  await click(page, '[data-t12nc] [data-t12nc-use]');
  e = await waitStatus(page, FLO, /^reader-only$/, 15000);
  ok(e && e.status === 'reader-only', '"Use the reader\'s reading" → used as the reader read it');
  await page.waitForTimeout(800);
  ok(Math.abs((await t12Noi(page, FLO)) - 1092000) < 0.01, '…$1,092,000');
  console.log('— Claude isn\'t connected and a check fails (through Documents)');
  await page.evaluate((k) => window.LDS_openProfile(k), WM);
  await page.waitForFunction(() => { const v = document.getElementById('loanView'); return v && !v.hidden && document.getElementById('loanDocsFile'); }, null, { timeout: 8000 }).catch(() => {});
  await page.setInputFiles('#loanDocsFile', BAD);   // the file names no property
  ok(await waitFor(page, '[data-whichsheet]', 15000), 'a T12 that names no property, added in its Documents: "Which sheet is Weaver Mill’s T12?"');
  await page.evaluate(() => { const m = document.querySelector('[data-whichsheet]'); m.querySelector('[data-sheetsel]').value = 'Report1'; m.querySelector('[data-sheetok]').click(); });
  ok(await waitFor(page, '[data-t12nc]', 30000), '…saved as its T12, it goes through the same reading: the pop-up shows');
  t = await popText(page, '[data-t12nc]');
  ok(/1 of the reader’s checks fail/.test(t) && !/Use the reader’s reading/.test(t), 'a check fails → no "Use the reader\'s reading" (only Review it myself / Keep it waiting)');
  await click(page, '[data-t12nc] [data-t12nc-wait]');
  await page.waitForTimeout(800);
  ok(((await entryOf(page, WM)) || {}).status === 'waiting' && (await t12Noi(page, WM)) == null, 'kept waiting, unused');
  console.log('— Data Health lists what needs you');
  await page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click(); const o = document.querySelector('[data-tabopen="health"]'); if (o) o.click(); });
  await page.waitForFunction(() => !!document.querySelector('[data-health-t12]'), null, { timeout: 12000 }).catch(() => {});
  const dh = await page.evaluate(() => { const n = document.querySelector('[data-health-t12]'); return n ? n.getAttribute('data-health-t12') + ' | ' + n.innerText : ''; });
  ok(/^2 \|/.test(dh) && /Weaver Mill/.test(dh) && /Waiting for your review/.test(dh) && /Villages of Whitewater/.test(dh) && /Read again — needs your review/.test(dh), 'Data Health: "T12s that need your review: 2" — Weaver Mill (waiting) and Villages of Whitewater (read again) (' + dh.slice(0, 160).replace(/\n/g, ' / ') + ')');
  ok(errors.length === 0, 'run 3: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

  // ═══ run 4: a T12 read before 2.9.16 — re-read once after the update ══════════════════════════════════════════════
  console.log('— the one-time re-check of T12s read before 2.9.16');
  // Florence and Burlington become "read before the update": no reading on record, the update ran after they were
  // saved. Burlington also carries decisions from the old review: one on a row that is still an account (kept), one
  // on a row that is now the income total (dropped).
  await page.evaluate(async ({ FLO, BUR }) => {
    const save = async (k, gd) => { const json = JSON.stringify(gd), bytes = new TextEncoder().encode(json); let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      await window.ldsShell.docSave({ propKey: k, propName: k, name: 'general-data.json', base64: btoa(s), text: '', type: 'application/json', role: 'general' }); };
    for (const k of [FLO, BUR]){
      const gd = await window.LDS_gdDisk(k); const sha = (gd.t12Readings || [])[0].sha;
      delete gd.t12Readings; delete gd.t12GateDone;
      if (k === BUR) gd.t12Review = { fileSha: sha, fileName: 't12-gate-good.xlsx', sheet: 'Report1', rowOffset: 2, status: 'needs-review', cards: [
        { id: 'r8', type: 'amount', row: 8, label: 'Repairs and Maintenance', regular: { row: 8, role: 'expense', code: 'RM', annual: 48000 }, decision: { role: 'expense', code: 'RM', annual: 48600, by: 'You', at: '2026-05-01T00:00:00Z', note: 'GL' } },
        { id: 'r5', type: 'belongs', row: 5, label: 'TOTAL INCOME', regular: { row: 5, role: 'income', code: 'OTH', annual: 1260000 }, decision: { role: 'income', code: 'OTH', annual: 1260000, by: 'You', at: '2026-05-01T00:00:00Z' } } ] };
      await save(k, gd);
    }
    localStorage.setItem('lds.t12GateSince', String(Date.now()));
  }, { FLO, BUR });
  await app.close();
  ({ app, page, errors } = await launch({ LDS_CLAUDE_BIN: '/nonexistent' }));
  await page.waitForFunction(() => window.LDS_t12MigrateState && !window.LDS_t12MigrateState().running && window.LDS_t12MigrateState().done > 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);
  e = await entryOf(page, FLO);
  ok(e && e.status === 'legacy' && e.aiPending && e.reader.ok, 'Claude off: a T12 that passes every check stays in use, the AI re-check pending (' + (e && e.status) + ')');
  ok(Math.abs((await t12Noi(page, FLO)) - 1092000) < 0.01, '…its numbers are used as before');
  e = await entryOf(page, BUR);
  ok(e && e.status === 'legacy-review' && e.droppedDecisions === 1 && e.overrides.length === 1 && e.overrides[0].row === 10 && e.overrides[0].amount === 48600, 'old decisions: the one on a row that is still an account is kept (row 10, $48,600); the one on the income total is dropped → "needs your review" (' + (e && e.status) + ')');
  ok(Math.abs((await t12Noi(page, BUR)) - 1091400) < 0.01, '…still in use, with the kept decision ($1,091,400; got ' + (await t12Noi(page, BUR)) + ')');
  await app.close();
  ({ app, page, errors } = await launch({ LDS_CLAUDE_BIN: FAKE, LDS_FAKE_T12: 'agree' }));
  await page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click(); const o = document.querySelector('[data-tabopen="health"]'); if (o) o.click(); });
  e = await waitStatus(page, FLO, /^checked$/, 60000);
  ok(e && e.status === 'checked', 'Claude connected: the pending re-check runs — passes and agrees → checked');
  ok(((await entryOf(page, BUR)) || {}).status === 'legacy-review', 'the one with a dropped decision still waits for your review');
  ok(errors.length === 0, 'run 4: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (x) {}
  console.log('\n' + (fails.n ? fails.n + ' FAILED' : 'all T12 gate (2.9.16) e2e checks passed'));
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
