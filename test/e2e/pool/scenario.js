// 2.9.14 — the pooled-loan core checks: E = a 5-property pool on one loan (totals, pages, calendar, Data Health, roll-up,
// assistant, refinance, remove/restore, backup, Excel, rename, edit); R = 5 properties on 6 loans refinanced into one;
// S = a pool of 12. run(['E']) etc. returns [{ id, pass, detail }].
const path = require('path'), fs = require('fs'), L = require('./lib'), F = require('./fixture'), A = require('./adapter');
const results = [];
const BASE = { poolRow: null, sees: {}, hasLoan: {}, nProps: null };   // the approach's own starting state: later operations must keep it, not invent it
const rec = (id, pass, detail) => { results.push({ id, pass, detail }); console.log((pass === true ? 'PASS ' : pass === false ? 'FAIL ' : 'N/A  ') + id + ' — ' + detail); };
const money = (n) => n == null ? 'null' : '$' + Math.round(n).toLocaleString('en-US');
const fmt2 = (n) => n == null ? 'null' : n.toFixed(3);
const POOLNOI = F.PROPS.reduce((a, p) => a + p.noi, 0), ALLNOI = POOLNOI + F.CONTROL.noi;
const poolPI = L.pmt(F.POOL_TERMS.originalAmount, F.POOL_TERMS.annualRate, 360), ctrlPI = L.pmt(10000000, 0.05, 360);
const poolDS = poolPI * 12, ctrlDS = ctrlPI * 12, poolDSCR = POOLNOI / poolDS;
function balAfter(P, rate, k) { const r = rate / 12, pm = L.pmt(P, rate, 360); return P * Math.pow(1 + r, k) - pm * (Math.pow(1 + r, k) - 1) / r; }
const others = (name, props) => props.filter(p => p.name !== name).map(p => p.name);
async function refBal(page, terms) { return page.evaluate((t) => window.LDS_computeBalance(Object.assign({}, t, { _id: 'ref_' + Math.random().toString(36).slice(2) })), terms); }
async function safe(id, fn) { try { await fn(); } catch (e) { rec(id, false, 'CRASH ' + String(e).slice(0, 200)); } }
function covRowsFor(h, name) { return h.rows.filter(r => (r[0] || '').toLowerCase().indexOf(name.toLowerCase()) === 0); }
const dscrOf = (row) => { const m = (row[2] || '').match(/([0-9.]+)×/); return m ? +m[1] : null; };

async function homeChecks(tag, s, truth, props, poolNOI, poolDSv) {
  const h = await L.home(s.page);
  const td = L.parseMoney(h.totalDebt);
  rec(tag + '1 total debt counted once', L.near(td, truth.totalDebt, 5), 'Home shows ' + money(td) + ', truth ' + money(truth.totalDebt));
  rec(tag + '2 every property NOI counted once', L.near(h.cov && h.cov.sumNOI, truth.allNOI, 1), 'sumNOI ' + money(h.cov && h.cov.sumNOI) + ', truth ' + money(truth.allNOI));
  rec(tag + '3 debt service counted once', L.near(h.cov && h.cov.sumDS, truth.allDS, 5), 'sumDS ' + money(h.cov && h.cov.sumDS) + ', truth ' + money(truth.allDS));
  rec(tag + '4 portfolio DSCR right', L.near(h.cov && h.cov.wDscr, truth.allNOI / truth.allDS, 0.005), 'Home ' + fmt2(h.cov && h.cov.wDscr) + ', truth ' + fmt2(truth.allNOI / truth.allDS));
  const want = poolNOI / poolDSv;
  const poolRow = h.rows.find(r => { const n = L.parseMoney(r[1]), d = dscrOf(r); return L.near(n, poolNOI, 1) && d != null && Math.abs(d - want) < 0.011; });
  if (tag === 'E') BASE.poolRow = !!poolRow;
  rec(tag + '5 the pool\'s own coverage shown on Home', !!poolRow, poolRow ? ('row "' + poolRow[0].slice(0, 80) + '" NOI ' + poolRow[1] + ' DSCR ' + poolRow[2]) : ('no row with NOI ' + money(poolNOI) + ' at ' + want.toFixed(2) + '×'));
  const bad = [];
  props.forEach(p => covRowsFor(h, p.name).forEach(r => {
    if (r === poolRow) return;
    if (/no loan/i.test(r.join(' '))) bad.push(p.name + ' shown as "no loan" (debt-free) though pledged');
    const d = dscrOf(r); if (d != null && Math.abs(d - p.noi / poolDSv) < 0.011) bad.push(p.name + ' carries the WHOLE pool debt against its own NOI (' + r[2] + ')');
  }));
  h.rows.forEach(r => { if (/needs T12\/NOI/i.test(r.join(' ')) && /pool/i.test(r[0])) bad.push('a pool row with no NOI: "' + r[0] + '"'); });
  rec(tag + '6 no misleading property row', bad.length === 0, bad.length ? bad.join('; ') : 'each pledged property reads right');
  { const m = (h.totalDebtSub || '').match(/(\d+) loans?/); const n = m ? +m[1] : null;
    rec(tag + '20 Home counts the pooled loan as one loan', n === truth.nLoans, 'Home says "' + (h.totalDebtSub || '') + '" — truth ' + truth.nLoans + ' loans'); }
  if (tag === 'E') BASE.nProps = h.props.length;
  const names = h.props.map(p => p.name.toLowerCase());
  const missing = props.concat([F.CONTROL]).filter(p => names.indexOf(p.name.toLowerCase()) < 0).map(p => p.name);
  const extra = h.props.length - (props.length + 1);
  rec(tag + '7 property list = the real properties', missing.length === 0 && extra === 0, h.props.length + ' properties' + (missing.length ? '; missing ' + missing.join(', ') : '') + (extra ? '; ' + extra + ' extra: ' + h.props.map(p => p.name).filter(n => !props.concat([F.CONTROL]).some(q => q.name.toLowerCase() === n.toLowerCase())).join(', ') : ''));
  return h;
}
async function pageChecks(tag, s, props, sample) {
  let seeLoan = 0, seeOthers = 0, seeNOI = 0, seeAla = 0; const notes = [];
  for (const p of (sample || props)) {
    const r = await L.openProp(s.page, p.name);
    if (!r.found) { notes.push(p.name + ': not in the selector'); continue; }
    const t = r.text || '';
    const hasLoan = !/no loan yet/i.test(t) && /(current balance|monthly p&i|loan record)/i.test(t);
    const o = others(p.name, props).filter(n => t.toLowerCase().indexOf(n.toLowerCase()) >= 0);
    const noiTxt = '$' + p.noi.toLocaleString('en-US');
    if (p.ala && t.indexOf('$' + p.ala.toLocaleString('en-US')) >= 0) seeAla++;
    if (tag === 'E') { BASE.sees[p.name] = o.length > 0; BASE.hasLoan[p.name] = hasLoan; }
    if (hasLoan) seeLoan++; if (o.length) seeOthers++; if (t.indexOf(noiTxt) >= 0) seeNOI++;
    notes.push(p.name + ': ' + (hasLoan ? 'loan shown' : 'NO loan shown') + ', names ' + o.length + ' other pool properties' + (t.indexOf(noiTxt) >= 0 ? ', own NOI shown' : ', own NOI NOT shown'));
  }
  const n = (sample || props).length;
  rec(tag + '8a each pledged property page shows its loan', seeLoan === n, seeLoan + '/' + n + ' — ' + notes.join(' | '));
  rec(tag + '8b each page says which other properties share the loan', seeOthers === n, seeOthers + '/' + n);
  rec(tag + '8c each page shows the property\'s own NOI', seeNOI === n, seeNOI + '/' + n);
  if (!sample) rec(tag + '19 (extra) each page shows its allocated share of the loan', seeAla === n, seeAla + '/' + n);
}
async function calendarCheck(tag, s, lender, balloon) {
  const c = await L.calendar(s.page);
  const ev = (c && c.events || []).filter(e => e.type === 'Maturity' && e.lender === lender);
  rec(tag + '9 calendar: one maturity for the pool', ev.length === 1 && L.near(ev.reduce((a, e) => a + e.amount, 0), balloon, 50),
    ev.length + ' maturity event(s), total balloon ' + money(ev.reduce((a, e) => a + e.amount, 0)) + ', truth ' + money(balloon));
}
async function rollupCheck(tag, s, truth, props, poolNOI, poolDSv) {
  const r = await L.rollup(s.page);
  if (!r || !r.total) { rec(tag + '21 Underwriting roll-up counts the pool once', false, 'roll-up did not render'); return; }
  const bal = L.parseMoney(r.total[5]), noi = L.parseMoney(r.total[3]), bad = [];
  props.forEach(p => r.rows.filter(x => (x[0] || '').toLowerCase().indexOf(p.name.toLowerCase()) === 0).forEach(x => {
    const d = (x[7] || '').match(/([0-9.]+)×/); if (d && Math.abs(+d[1] - p.noi / poolDSv) < 0.011) bad.push(p.name + ' carries the whole pool (' + x[7] + ')'); }));
  const poolRow = r.rows.some(x => L.near(L.parseMoney(x[3]), poolNOI, 1) && /([0-9.]+)×/.test(x[7] || '') && Math.abs(+(x[7].match(/([0-9.]+)×/)[1]) - poolNOI / poolDSv) < 0.011);
  rec(tag + '21 Underwriting roll-up counts the pool once', L.near(bal, truth.totalDebt, 5) && L.near(noi, truth.allNOI, 1) && !bad.length,
    'roll-up total debt ' + money(bal) + ' (truth ' + money(truth.totalDebt) + '), NOI ' + money(noi) + ' (truth ' + money(truth.allNOI) + ')' + (bad.length ? '; ' + bad.join('; ') : '') + '; pool row ' + poolRow + '; ' + r.rows.length + ' rows');
}
async function healthCheck(tag, s, props) {
  await s.page.evaluate(() => { const b = document.getElementById('tabNewBtn'); if (b) b.click(); const o = document.querySelector('[data-tabopen="health"]'); if (o) o.click(); });
  const ok = await s.page.waitForFunction(() => { const v = document.getElementById('healthView'); return v && !v.hidden && /Every property/.test(v.innerText || ''); }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const t = ok ? await s.page.evaluate(() => document.getElementById('healthView').innerText) : '';
  const dupLine = (t.match(/Possible duplicate properties[^\n]*/) || [''])[0];
  const dupHit = dupLine && props.some(p => t.indexOf(p.name) >= 0 && /duplicate/i.test(dupLine));
  const dec = (t.match(/Need a maturity decision\s*\n?\s*(\d+)/i) || [])[1];
  const nProps = (t.match(/Properties\s*\n?\s*(\d+)/i) || [])[1];
  rec(tag + '10 Data Health clean', ok && !dupLine && dec === '0' && +nProps === props.length + 1, ok ? ('properties ' + nProps + ', duplicates: ' + (dupLine || 'none') + ', maturity decisions ' + dec) : 'Data Health did not open');
  await L.goHome(s.page);
}
async function asstCheck(tag, s, truth, props, lender) {
  const snap = await s.page.evaluate(() => window.LDS_aiAsstSnapshot());
  const sum = snap.reduce((a, x) => a + (x.currentBalance || 0), 0);
  const pool = snap.filter(x => x.lender === lender);
  const allNamed = props.every(p => JSON.stringify(snap).toLowerCase().indexOf(p.name.toLowerCase()) >= 0);
  const poolDscrOk = pool.length > 0 && pool.every(x => x.dscr != null && Math.abs(x.dscr - poolDSCR) < 0.011);
  rec(tag + '11 assistant sees the debt once, the pool\'s coverage and all 5 properties', L.near(sum, truth.totalDebt, 5) && poolDscrOk && allNamed,
    'debt ' + money(sum) + ' (truth ' + money(truth.totalDebt) + '); pool records ' + pool.length + ' with DSCR ' + pool.map(x => x.dscr == null ? '—' : x.dscr.toFixed(2)).join('/') + ' (pool ' + poolDSCR.toFixed(2) + '); all 5 named: ' + allNamed);
  const pi = pool.reduce((a, x) => a + (x.monthlyPI || 0), 0);
  rec(tag + '12 the pool\'s payment equals the note\'s', L.near(pi, poolPI, 0.05), 'monthly P&I ' + pi.toFixed(2) + ' vs note ' + poolPI.toFixed(2));
}
async function renameCheck(tag, s, truth, props) {
  const from = props[1].name, to = from + ' II';
  const r = await L.openProp(s.page, from);
  if (!r.found) { rec(tag + '17 rename a pooled property', false, from + ' not found'); return props; }
  await s.page.evaluate((to) => { const i = document.querySelector('#loanProfilePanel [data-pf="propertyName"], #propProfilePanel [data-pf="propertyName"]'); if (!i) throw new Error('no name field'); i.value = to; i.dispatchEvent(new Event('change', { bubbles: true })); }, to);
  await s.page.waitForTimeout(1200);
  await s.page.evaluate(() => { const m = document.getElementById('confirmModal'); if (m && !m.classList.contains('hidden')) document.getElementById('confirmOk').click(); });
  await s.page.waitForTimeout(1500);
  const np = props.map(p => p.name === from ? Object.assign({}, p, { name: to }) : p);
  const h = await L.home(s.page);
  const td = L.parseMoney(h.totalDebt), poolRow = h.rows.some(x => L.near(L.parseMoney(x[1]), POOLNOI, 1) && Math.abs((dscrOf(x) || 0) - poolDSCR) < 0.011);
  const pg = await L.openProp(s.page, to);
  const keeps = pg.found && others(to, np).some(n => (pg.text || '').toLowerCase().indexOf(n.toLowerCase()) >= 0);
  const hasLoanNow = pg.found && !/no loan yet/i.test(pg.text || '') && /(current balance|monthly p&i|loan record)/i.test(pg.text || '');
  const pageNow = pg.found && hasLoanNow === !!BASE.hasLoan[from] && (keeps === !!BASE.sees[from]);
  rec(tag + '17 rename a pooled property', L.near(td, truth.totalDebt, 5) && L.near(h.cov.sumNOI, truth.allNOI, 1) && poolRow === BASE.poolRow && pageNow,
    'after "' + from + '" → "' + to + '": debt ' + money(td) + ', NOI ' + money(h.cov.sumNOI) + ', pool row ' + poolRow + ' (was ' + BASE.poolRow + '), its page shows its loan + partners ' + keeps + ' (was ' + !!BASE.sees[from] + ')');
  return np;
}
async function backupCheck(tag, s, truth) {
  const BK = path.join(s.udata, 'pool-backup.json');
  await s.app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); }, BK);
  await s.page.evaluate(() => { const dd = document.getElementById('dataDD'); dd.open = true; dd.querySelector('[data-data="backup"]').click(); });
  for (let t = 0; t < 40 && !fs.existsSync(BK); t++) await L.sleep(250);
  await L.sleep(500);
  if (!fs.existsSync(BK)) { rec(tag + '15 backup → restore keeps the pool', false, 'no backup file'); return; }
  await A.removePool(s.page, F);
  await s.page.waitForTimeout(600);
  const mid = L.parseMoney((await L.home(s.page)).totalDebt);
  await s.page.evaluate(() => { const dd = document.getElementById('dataDD'); dd.open = true; dd.querySelector('[data-data="restore"]').click(); });
  await s.page.waitForFunction(() => { const m = document.getElementById('confirmModal'); return m && !m.classList.contains('hidden'); }, null, { timeout: 8000 });
  await Promise.all([s.page.waitForEvent('load', { timeout: 20000 }).catch(() => {}), s.page.evaluate(() => document.getElementById('confirmOk').click())]);
  await s.page.waitForSelector('#loanSelect option', { timeout: 20000, state: 'attached' }).catch(() => {});
  await s.page.waitForFunction(() => !document.getElementById('portfolioLoading'), null, { timeout: 20000 }).catch(() => {});
  await s.page.waitForTimeout(1500);
  const h = await L.home(s.page);
  const td = L.parseMoney(h.totalDebt), poolRow = h.rows.some(x => L.near(L.parseMoney(x[1]), POOLNOI, 1) && Math.abs((dscrOf(x) || 0) - poolDSCR) < 0.011);
  rec(tag + '15 backup → restore keeps the pool', L.near(td, truth.totalDebt, 5) && poolRow === BASE.poolRow, 'removed → ' + money(mid) + '; restored → ' + money(td) + ' (truth ' + money(truth.totalDebt) + '), pool row ' + poolRow);
}
async function removeRestoreCheck(tag, s, truth, props) {
  await A.removePool(s.page, F); await s.page.waitForTimeout(700);
  const h = await L.home(s.page);
  const td = L.parseMoney(h.totalDebt);
  const noLoanRows = props.filter(p => covRowsFor(h, p.name).some(r => /no loan/i.test(r.join(' ')))).length;
  rec(tag + '16a pay off / remove the pool loan', L.near(td, truth.ctrlBal, 5) && L.near(h.cov.sumNOI, truth.allNOI, 1) && noLoanRows === props.length,
    'debt ' + money(td) + ' (truth ' + money(truth.ctrlBal) + '), NOI ' + money(h.cov.sumNOI) + ', ' + noLoanRows + '/' + props.length + ' properties now "no loan" with NOI kept');
  await A.restorePool(s.page, F); await s.page.waitForTimeout(700);
  const h2 = await L.home(s.page);
  const td2 = L.parseMoney(h2.totalDebt), poolRow = h2.rows.some(x => L.near(L.parseMoney(x[1]), POOLNOI, 1) && Math.abs((dscrOf(x) || 0) - poolDSCR) < 0.011);
  rec(tag + '16b restore the pool loan', L.near(td2, truth.totalDebt, 5) && poolRow === BASE.poolRow, 'debt ' + money(td2) + ', pool row ' + poolRow);
}
async function excelCheck(tag, s, truth, props) {
  const b64 = await s.page.evaluate(() => window.LDS_exportXlsxB64());
  const t = await L.boot(A.appDir, [F.CONTROL_LOAN]);
  try {
    await t.page.evaluate((b) => window.LDS_importXlsxB64(b), b64);
    await t.page.waitForFunction(() => { const m = document.getElementById('importPreview'); return m && !m.classList.contains('hidden'); }, null, { timeout: 10000 }).catch(() => {});
    await t.page.waitForTimeout(600);
    const counts = await t.page.evaluate(() => window.LDS_importCounts());
    await t.page.evaluate(() => { const b = document.getElementById('importApplyBtn'); if (b) b.click(); });
    await t.page.waitForTimeout(1500);
    await L.setNOIs(t.page, A.noiProps ? A.noiProps(F) : props.concat([F.CONTROL]));
    if (A.afterImport) await A.afterImport(t.page, F);
    const h = await L.home(t.page);
    const td = L.parseMoney(h.totalDebt), poolRow = h.rows.some(x => L.near(L.parseMoney(x[1]), POOLNOI, 1) && Math.abs((dscrOf(x) || 0) - poolDSCR) < 0.011);
    rec(tag + '14 Excel export → import into another copy keeps the pool', L.near(td, truth.totalDebt, 5) && poolRow === BASE.poolRow && h.props.length === BASE.nProps,
      'import counts ' + JSON.stringify(counts) + '; debt ' + money(td) + ' (truth ' + money(truth.totalDebt) + '), pool row ' + poolRow + ', ' + h.props.length + ' properties');
  } finally { await t.app.close(); }
}
async function editRateCheck(tag, s, truth) {
  const r = await A.editPoolRate(s.page, 0.06, F);
  await s.page.waitForTimeout(800);
  const h = await L.home(s.page);
  const wantDS = ctrlDS + 12 * L.pmt(F.POOL_TERMS.originalAmount, 0.06, 360);
  const recs = await s.page.evaluate(() => window.LDS_loans().filter(l => l.lenderName === 'Pool Bank' && !l.archived && l.loanStatus !== 'Paid off').map(l => l.annualRate));
  rec(tag + '13 change the pool\'s rate once → everything follows', L.near(h.cov.sumDS, wantDS, 5) && recs.every(x => x === 0.06),
    (r && r.edits != null ? r.edits + ' record edit(s); ' : '') + 'sumDS ' + money(h.cov.sumDS) + ' (truth ' + money(wantDS) + '); pool records at ' + recs.join(', '));
}
async function refiPoolCheck(tag, s, truth) {
  const id = await A.poolRefiTarget(s.page, F);
  if (!id) { rec(tag + '18 refinance the pool as one', false, 'no way to open one refinance for the whole pool'); return; }
  const r = await s.page.evaluate((id) => { const l = window.LDS_getLoan(id); return l ? { payoff: window.LDS_refiPayoff(l), noi: window.LDS_refiNOI(l) } : null; }, id);
  rec(tag + '18 refinance the pool as one', r && L.near(r.payoff, truth.poolBal, 5) && L.near(r.noi, POOLNOI, 1), r ? ('payoff ' + money(r.payoff) + ' (truth ' + money(truth.poolBal) + '), NOI ' + money(r.noi) + ' (truth ' + money(POOLNOI) + ')') : 'target not found');
}

async function run(ONLY) {
  if (ONLY.indexOf('E') >= 0) {
    const bk = A.bookE(F);
    const s = await L.boot(A.appDir, bk.loans, bk.files);
    try {
      const noiProps = A.noiProps ? A.noiProps(F) : F.PROPS.concat([F.CONTROL]);
      await L.setNOIs(s.page, noiProps);
      if (A.afterBoot) await A.afterBoot(s.page, F);
      await s.page.waitForTimeout(600);
      const truth = { poolBal: await refBal(s.page, F.POOL_TERMS), ctrlBal: await refBal(s.page, F.CONTROL_LOAN) };
      truth.totalDebt = truth.poolBal + truth.ctrlBal; truth.allNOI = ALLNOI; truth.allDS = poolDS + ctrlDS; truth.nLoans = 2;
      const balloon = balAfter(F.POOL_TERMS.originalAmount, F.POOL_TERMS.annualRate, 119);
      await safe('E1-7', () => homeChecks('E', s, truth, F.PROPS, POOLNOI, poolDS));
      await safe('E8', () => pageChecks('E', s, F.PROPS));
      await safe('E9', () => calendarCheck('E', s, 'Pool Bank', balloon));
      await safe('E10', () => healthCheck('E', s, F.PROPS));
      await safe('E21', () => rollupCheck('E', s, truth, F.PROPS, POOLNOI, poolDS));
      await safe('E11', () => asstCheck('E', s, truth, F.PROPS, 'Pool Bank'));
      await safe('E18', () => refiPoolCheck('E', s, truth));
      await safe('E16', () => removeRestoreCheck('E', s, truth, F.PROPS));
      await safe('E15', () => backupCheck('E', s, truth));
      await safe('E14', () => excelCheck('E', s, truth, F.PROPS));
      await safe('E17', () => renameCheck('E', s, truth, F.PROPS));
      await safe('E13', () => editRateCheck('E', s, truth));
      if (s.errors.length) rec('E-err page errors', false, s.errors.slice(0, 3).join(' | ')); else rec('E-err page errors', true, 'none');
    } finally { try { await s.app.close(); } catch (e) {} }
  }
  if (ONLY.indexOf('R') >= 0) {
    const s = await L.boot(A.appDir, F.bookR());
    try {
      await L.setNOIs(s.page, F.PROPS.concat([F.CONTROL]));
      await s.page.waitForTimeout(500);
      const olds = ['ln_r1', 'ln_r2', 'ln_r3', 'ln_r4', 'ln_r5', 'ln_r6'];
      const oldBal = await s.page.evaluate((ids) => ids.reduce((a, id) => a + window.LDS_computeBalance(window.LDS_getLoan(id)), 0), olds);
      const ctrlBal = await refBal(s.page, F.CONTROL_LOAN);
      const t = A.refiFive ? await A.refiFive(s.page, F) : null;
      if (!t || t.unsupported) {
        rec('R1 refinance 5 properties as one package', false, (t && t.unsupported) || 'not supported');
      } else {
        const r = await s.page.evaluate((id) => { const l = window.LDS_getLoan(id); return l ? { payoff: window.LDS_refiPayoff(l), noi: window.LDS_refiNOI(l) } : null; }, t.id);
        rec('R1 refinance 5 properties as one package', r && L.near(r.payoff, oldBal, 5) && L.near(r.noi, POOLNOI, 1), r ? ('payoff ' + money(r.payoff) + ' (6 loans owe ' + money(oldBal) + '), NOI ' + money(r.noi) + ' (truth ' + money(POOLNOI) + ')') : 'target not found');
        const draftAmt = await s.page.evaluate(() => { const d = window.LDS_refiDraft(); return d ? Number(d.originalAmount) : null; });
        const sv = await A.saveRefiFive(s.page, t, F);
        await s.page.waitForTimeout(1000);
        const st = await s.page.evaluate((ids) => ids.map(id => { const l = window.LDS_getLoan(id); return l ? (l.loanStatus + '/' + (l.paidOffReason || '')) : 'gone'; }), olds);
        const paid = st.filter(x => x === 'Paid off/refinanced').length;
        const act = await s.page.evaluate(() => window.LDS_loans().filter(l => !l.archived && l.loanStatus !== 'Paid off' && l._id !== 'ln_control').map(l => ({ id: l._id, amt: l.originalAmount, name: l.propertyName })));
        const newAmt = act.reduce((a, x) => a + x.amt, 0);
        rec('R2 Save: the 6 old loans are Paid off (refinanced), one new loan', paid === 6 && act.length >= 1, paid + '/6 paid off; active new record(s): ' + act.length + ' totalling ' + money(newAmt) + (sv && sv.note ? ' — ' + sv.note : ''));
        const h = await L.home(s.page);
        const td = L.parseMoney(h.totalDebt);
        const noLoanRows = F.PROPS.filter(p => covRowsFor(h, p.name).some(r => /no loan/i.test(r.join(' ')))).length;
        rec('R3 after Save: debt once, NOI of all 5, nobody "no loan"', draftAmt != null && L.near(td, ctrlBal + draftAmt, 50) && L.near(h.cov.sumNOI, ALLNOI, 1) && noLoanRows === 0 && h.props.length === 6,
          'debt ' + money(td) + ' (truth ' + money(ctrlBal + draftAmt) + ' = control + the new loan ' + money(draftAmt) + '), NOI ' + money(h.cov.sumNOI) + ', "no loan" rows ' + noLoanRows + ', ' + h.props.length + ' properties');
        let seen = 0; const notes = [];
        for (const p of F.PROPS) { const pg = await L.openProp(s.page, p.name); const tx = pg.text || '';
          const ok = pg.found && !/no loan yet/i.test(tx) && others(p.name, F.PROPS).some(n => tx.toLowerCase().indexOf(n.toLowerCase()) >= 0); if (ok) seen++; notes.push(p.name + (ok ? ' ✓' : ' ✗')); }
        rec('R4 after Save: each of the 5 pages shows the new pooled loan and its partners', seen === 5, seen + '/5 — ' + notes.join(', '));
      }
      if (s.errors.length) rec('R-err page errors', false, s.errors.slice(0, 3).join(' | ')); else rec('R-err page errors', true, 'none');
    } finally { try { await s.app.close(); } catch (e) {} }
  }
  if (ONLY.indexOf('S') >= 0) {
    const big = F.bigProps(12), bk = A.bigBook ? A.bigBook(F, big) : null;
    if (!bk) rec('S1 a pool of 12 properties', false, 'approach cannot express it');
    else {
      const s = await L.boot(A.appDir, bk.loans, bk.files);
      try {
        await L.setNOIs(s.page, (A.bigNoiProps ? A.bigNoiProps(F, big) : big.concat([F.CONTROL])));
        if (A.afterBigBoot) await A.afterBigBoot(s.page, F, big);
        await s.page.waitForTimeout(600);
        const bigNOI = big.reduce((a, p) => a + p.noi, 0), bigDS = 12 * L.pmt(F.BIG_TERMS.originalAmount, F.BIG_TERMS.annualRate, 360);
        const truth = { poolBal: await refBal(s.page, F.BIG_TERMS), ctrlBal: await refBal(s.page, F.CONTROL_LOAN) };
        truth.totalDebt = truth.poolBal + truth.ctrlBal; truth.allNOI = bigNOI + F.CONTROL.noi; truth.allDS = bigDS + ctrlDS; truth.nLoans = 2;
        const h = await L.home(s.page);
        const td = L.parseMoney(h.totalDebt), want = bigNOI / bigDS;
        const poolRow = h.rows.some(x => L.near(L.parseMoney(x[1]), bigNOI, 1) && Math.abs((dscrOf(x) || 0) - want) < 0.011);
        const pg = await L.openProp(s.page, big[11].name);
        const sees = pg.found && !/no loan yet/i.test(pg.text || '') && others(big[11].name, big).some(n => (pg.text || '').toLowerCase().indexOf(n.toLowerCase()) >= 0);
        const c = await L.calendar(s.page); const ev = (c && c.events || []).filter(e => e.type === 'Maturity' && e.lender === 'Scale Bank');
        rec('S1 a pool of 12 properties', L.near(td, truth.totalDebt, 5) && L.near(h.cov.sumNOI, truth.allNOI, 1) && poolRow && h.props.length === 13 && sees && ev.length === 1,
          'debt ' + money(td) + ' (truth ' + money(truth.totalDebt) + '), NOI ' + money(h.cov.sumNOI) + ', pool row ' + poolRow + ' (' + want.toFixed(2) + '×), ' + h.props.length + ' properties, #12 page sees the pool ' + sees + ', ' + ev.length + ' maturity');
      } finally { try { await s.app.close(); } catch (e) {} }
    }
  }
  return results;
}
module.exports = { run };
