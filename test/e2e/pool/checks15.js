// 2.9.14 — the pooled-loan checks beyond the core: picking properties, a group of new properties on one loan, a refinance
// of properties with loans + a new one, releases, renames every way, the Excel warning, names as typed, the assistant,
// no limit (40 properties), the senior + mezz page. Each starts a fresh app and drives its screens. run(['N1', …]).
// Pictures only when LDS_POOL_SHOTS names a folder.
const path = require('path'), fs = require('fs'), L = require('./lib'), F = require('./fixture');
const APP = path.resolve(__dirname, '..', '..', '..'), SH = process.env.LDS_POOL_SHOTS || ''; if (SH) fs.mkdirSync(SH, { recursive: true });
const out = []; const rec = (id, name, pass, detail) => { out.push({ id: id + ' ' + name, pass, detail }); };
const money = (n) => n == null ? 'null' : '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const P = F.PROPS, names4 = P.slice(1), POOLNOI = P.reduce((a, p) => a + p.noi, 0);
const poolLoan = (props, terms) => F.loan('ln_pool', Object.assign({}, terms || F.POOL_TERMS, { propertyName: props[0].name, propertyAddress: props[0].addr, alsoSecures: props.slice(1).map(p => p.name + ' = ' + p.ala).join('; ') }));
const bookE = () => [F.CONTROL_LOAN, poolLoan(P)];
async function start(book, noiProps) {
  const s = await L.boot(APP, book);
  try { await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 1700)); } catch (e) {}
  await s.page.evaluate(() => { const st = document.createElement('style'); st.textContent = '#ldshSplash,#aiAsstFab,#toast{display:none!important} *,*::before,*::after{animation:none!important;transition:none!important} .animate-fade-up,.stagger>*,[data-reveal]{opacity:1!important;transform:none!important}'; document.head.appendChild(st); });
  await L.setNOIs(s.page, noiProps || P.concat([F.CONTROL]));
  await s.page.evaluate(() => { try { window.LDS_renderPortfolio(); } catch (e) {} });
  return s;
}
async function pic(s, sel, file) { if (!SH) return null; try { const n = await s.page.locator(sel).count(); if (!n) return null; await s.page.locator(sel).first().screenshot({ path: path.join(SH, file) }); return file; } catch (e) { return null; } }
async function homePic(s, file) {
  await L.home(s.page);
  await s.page.evaluate(() => { document.querySelectorAll('[data-shot]').forEach(e => e.removeAttribute('data-shot')); const h = [...document.querySelectorAll('#portfolioView h3')].find(x => /^Coverage —/.test(x.textContent || '')); let c = h; while (c && !(c.classList && c.classList.contains('boxline'))) c = c.parentElement; if (c) c.setAttribute('data-shot', '1'); });
  return pic(s, '[data-shot="1"]', file);
}
const poolRowOf = (h, noi, dscr) => h.rows.find(r => L.near(L.parseMoney(r[1]), noi, 1) && (dscr == null || Math.abs((+((r[2] || '').match(/([0-9.]+)×/) || [0, 0])[1]) - dscr) < 0.011));
const keysOf = (s, id) => s.page.evaluate((id) => window.LDS_poolKeys(id), id);
async function approveCard(s) { await s.page.waitForTimeout(500); const ok = await s.page.evaluate(() => { const b = [...document.querySelectorAll('.aiAsstEditApprove')].pop(); if (!b) return false; b.click(); return true; }); await s.page.waitForTimeout(1200); return ok; }
async function openEdit(s, posId) { await L.selectPos(s.page, posId); await s.page.waitForTimeout(600); await s.page.evaluate(() => document.getElementById('loanRecEdit').click()); await s.page.waitForTimeout(700); }
async function saveForm(s) { await s.page.evaluate(() => document.getElementById('saveBtn').click()); await L.confirmIfAsked(s.page); await s.page.waitForTimeout(1200); }
const checks = {
  // ---- the picker on the loan form ----
  async N1() {
    const s = await start(bookE());
    try {
      await openEdit(s, 'ln_pool');
      const shown = await s.page.evaluate(() => ({ boxes: document.querySelectorAll('#poolFormPicker [data-poolform]').length, ticked: document.querySelectorAll('#poolFormPicker [data-poolform]:checked').length, raw: document.getElementById('f_alsoSecures').type }));
      const p1 = await pic(s, '#poolFormPicker', 'N1-picker.png');
      await s.page.evaluate(() => { const cb = document.querySelector('#poolFormPicker [data-poolform="name:elm terrace"]'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); });
      await saveForm(s);
      const k1 = await keysOf(s, 'ln_pool'); const h1 = await L.home(s.page); const r1 = poolRowOf(h1, POOLNOI - 500000);
      await openEdit(s, 'ln_pool');
      await s.page.evaluate(() => { const cb = document.querySelector('#poolFormPicker [data-poolform="name:elm terrace"]'); cb.checked = true; const a = document.querySelector('#poolFormPicker [data-poolformamt="name:elm terrace"]'); a.value = '6000000'; cb.dispatchEvent(new Event('change', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); });
      await saveForm(s);
      const k2 = await keysOf(s, 'ln_pool'), al = await s.page.evaluate(() => window.LDS_poolAlloc('ln_pool'));
      const pass = shown.raw === 'hidden' && shown.ticked === 4 && shown.boxes >= 5 && k1.length === 4 && !!r1 && k2.length === 5 && al && Math.round(al['name:elm terrace']) === 6000000;
      rec('N1', 'Pick the pool\'s properties from a list on the loan form', pass, 'the form lists ' + shown.boxes + ' properties with ' + shown.ticked + ' ticked (no typed names); unticking Elm Terrace and saving leaves ' + k1.length + ' properties and a $4.5M pool row: ' + !!r1 + '; ticking it again with $6,000,000 brings back ' + k2.length + ', Elm allocated ' + money(al && al['name:elm terrace']), [p1]);
    } finally { await s.app.close(); }
  },
  // ---- a group of NEW properties on one loan (none of them in the app yet) ----
  async N2() {
    const NEW = [{ name: 'Oak Ridge', addr: '11 Oak Rd, Columbus, OH 43215', noi: 800000 }, { name: 'Pine Hollow', addr: '22 Pine St, Dayton, OH 45402', noi: 600000 }, { name: 'Spruce Lane', addr: '33 Spruce Ln, Akron, OH 44308', noi: 400000 }];
    const s = await start([F.CONTROL_LOAN], [F.CONTROL]);
    try {
      await s.page.evaluate(() => window.LDS_asstAction({ action: 'propose_new_loan', args: { open: true, fields: { propertyName: 'Oak Ridge', propertyAddress: '11 Oak Rd, Columbus, OH 43215', propertyType: 'Multifamily', lenderName: 'Group Bank', loanNumber: 'GRP-1',
        originalAmount: 18000000, annualRate: 0.06, rateType: 'Fixed', lienPosition: 'Senior', originationDate: '2026-10-01', firstPaymentDate: '2026-11-01', maturityDate: '2036-10-01', loanTermMonths: 120, amortizationMonths: 360, amortMethod: '30/360' } } }));
      await s.page.waitForTimeout(900);
      for (const n of ['Pine Hollow', 'Spruce Lane']) { await s.page.evaluate((n) => { const i = document.getElementById('poolFormNew'); i.value = n; document.getElementById('poolFormAdd').click(); }, n); await s.page.waitForTimeout(300); }
      await s.page.evaluate(() => { [['name:pine hollow', '6000000'], ['name:spruce lane', '4000000']].forEach(([k, v]) => { const a = document.querySelector('#poolFormPicker [data-poolformamt="' + k + '"]'); a.value = v; a.dispatchEvent(new Event('change', { bubbles: true })); }); });
      const p1 = await pic(s, '#poolFormPicker', 'N2-new-group.png');
      await saveForm(s);
      await L.setNOIs(s.page, NEW);
      await s.page.evaluate(() => { try { window.LDS_renderPortfolio(); } catch (e) {} });
      const h = await L.home(s.page), ds = 12 * L.pmt(18e6, 0.06, 360), row = poolRowOf(h, 1800000, 1800000 / ds);
      const lid = await s.page.evaluate(() => (window.LDS_loans().find(l => l.lenderName === 'Group Bank') || {})._id);
      const k = await keysOf(s, lid);
      const pg = await L.openProp(s.page, 'Spruce Lane'); const ok3 = pg.found && /Pooled loan/.test(pg.text || '') && /Oak Ridge/.test(pg.text || '') && /Pine Hollow/.test(pg.text || '');
      const p2 = await homePic(s, 'N2-home.png');
      const pass = k && k.length === 3 && h.props.length === 4 && !!row && ok3;
      rec('N2', 'Three new properties (not in the app yet) under one loan', pass, 'one new $18M loan on Oak Ridge, adding Pine Hollow and Spruce Lane in the form: ' + (k ? k.length : 0) + ' properties on it, ' + h.props.length + ' properties in the app, a pool row at $1.8M and ' + (1800000 / ds).toFixed(2) + '×: ' + !!row + ', Spruce Lane\'s page shows the pool and its partners: ' + ok3, [p1, p2]);
    } finally { await s.app.close(); }
  },
  // ---- one refinance for existing properties (with loans) + a new one (no loan) ----
  async N3() {
    const R = F.bookR(); const book = [R[0], R[1], R[2]];   // control, Maple's loan, Birch's loan
    const OAK = { name: 'Oak Ridge', addr: '11 Oak Rd, Columbus, OH 43215', noi: 700000 };
    const s = await start(book, [P[0], P[1], OAK, F.CONTROL]);
    try {
      const owed = await s.page.evaluate(() => ['ln_r1', 'ln_r2'].reduce((a, id) => a + window.LDS_computeBalance(window.LDS_getLoan(id)), 0));
      await L.goHome(s.page);
      await s.page.evaluate(() => document.getElementById('poolRefiBtn').click()); await s.page.waitForTimeout(500);
      await s.page.evaluate(() => { ['name:maple court', 'name:birch gardens', 'name:oak ridge'].forEach(k => { const cb = document.querySelector('#poolPicker [data-poolpick="' + k + '"]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }); });
      const note = await s.page.evaluate(() => document.getElementById('poolPickNote').textContent);
      const p1 = await pic(s, '#poolPicker > div', 'N3-picker.png');
      await s.page.evaluate(() => document.getElementById('poolPickGo').click()); await s.page.waitForTimeout(1500);
      const t = await s.page.evaluate(() => { const l = window.LDS_activeLoan(); return l ? { id: l._id, payoff: window.LDS_refiPayoff(l), noi: window.LDS_refiNOI(l) } : null; });
      const p2 = await pic(s, '[data-refiverdict]', 'N3-refi.png');
      const draftAmt = await s.page.evaluate(() => { const d = window.LDS_refiDraft(); return d ? Number(d.originalAmount) : null; });
      await s.page.evaluate(() => { const b = document.getElementById('refiSaveBtn'); if (b) b.click(); }); await L.confirmIfAsked(s.page); await s.page.waitForTimeout(1200);
      const st = await s.page.evaluate(() => ['ln_r1', 'ln_r2'].map(id => window.LDS_getLoan(id).loanStatus));
      const nl = await s.page.evaluate(() => (window.LDS_loans().filter(l => !l.archived && l.loanStatus !== 'Paid off' && l._id !== 'ln_control')[0] || {})._id);
      const k = nl ? await keysOf(s, nl) : [];
      const h = await L.home(s.page), row = poolRowOf(h, 2900000), oak = h.rows.some(r => /^Oak Ridge/.test(r[0]) && /no loan/i.test(r.join(' ')));
      const p3 = await homePic(s, 'N3-home.png');
      const pass = t && L.near(t.payoff, owed, 1) && L.near(t.noi, 2900000, 1) && st.every(x => x === 'Paid off') && k.length === 3 && !!row && !oak && draftAmt > 0;
      rec('N3', 'One refinance for 2 properties with loans + 1 new property', pass, 'picker: "' + note + '"; refinance payoff ' + money(t && t.payoff) + ' (the 2 loans owe ' + money(owed) + '), NOI ' + money(t && t.noi) + ' (all 3); after Save the 2 old loans are ' + st.join(' / ') + ', the new ' + money(draftAmt) + ' loan secures ' + k.length + ' properties, a pool row at $2.9M: ' + !!row + ', Oak Ridge wrongly left on its own as "no loan": ' + oak, [p1, p2, p3]);
    } finally { await s.app.close(); }
  },
  // ---- release a member through the pool panel ----
  async N4() {
    const s = await start(bookE());
    try {
      const bal0 = await s.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_pool')));
      const pm = await s.page.evaluate(() => { const r = window.LDS_scheduleRows('ln_pool'), t = new Date().toISOString().slice(0, 10); return r.filter(x => x.paymentDate <= t).length; });
      await L.openProp(s.page, 'Birch Gardens');
      await s.page.evaluate(() => document.querySelector('[data-poolrelease$="|name:elm terrace"]').click()); await s.page.waitForTimeout(500);
      const dflt = await s.page.evaluate(() => Number(document.getElementById('poolRelPrice').value));
      const p1 = await pic(s, '#poolRelModal > div', 'N4-release-dialog.png');
      await s.page.evaluate(() => document.getElementById('poolRelGo').click()); await s.page.waitForTimeout(1200);
      const bal1 = await s.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_pool')));
      const pi1 = await s.page.evaluate(() => (window.LDS_aiAsstSnapshot().find(x => x.lender === 'Pool Bank') || {}).monthlyPI);
      const want = L.pmt(bal0 - dflt, 0.055, 360 - pm);
      const k = await keysOf(s, 'ln_pool'), al = await s.page.evaluate(() => window.LDS_poolAlloc('ln_pool'));
      const h = await L.home(s.page), ds = 12 * want, row = poolRowOf(h, POOLNOI - 500000, (POOLNOI - 500000) / ds), elm = h.rows.some(r => /^Elm Terrace/.test(r[0]) && /no loan/i.test(r.join(' ')) && /\$500,000/.test(r[1]));
      const c = await L.calendar(s.page), ev = (c.events || []).filter(e => e.type === 'Maturity' && e.lender === 'Pool Bank');
      const pg = await L.openProp(s.page, 'Birch Gardens'); const relTxt = /Released: Elm Terrace/.test(pg.text || '');
      const p2 = await pic(s, '#propOpPanel', 'N4-after-release.png'); const p3 = await homePic(s, 'N4-home.png');
      // the release travels in Excel: export, import into a fresh copy, same balance
      const b64 = await s.page.evaluate(() => window.LDS_exportXlsxB64());
      const t = await L.boot(APP, [F.CONTROL_LOAN]); let balX = null;
      try { await t.page.evaluate((b) => window.LDS_importXlsxB64(b), b64); await t.page.waitForTimeout(800); await t.page.evaluate(() => document.getElementById('importApplyBtn').click()); await t.page.waitForTimeout(1200);
        balX = await t.page.evaluate(() => { const l = window.LDS_loans().find(x => x.lenderName === 'Pool Bank'); return l ? window.LDS_computeBalance(l) : null; }); } finally { await t.app.close(); }
      const pass = Math.abs(dflt - bal0 * 0.12) < 0.02 && L.near(bal1, bal0 - dflt, 0.05) && L.near(pi1, want, 0.05) && k.length === 4 && al && Math.round(al['name:maple court']) === 12000000 && !!row && elm && ev.length === 1 && relTxt && L.near(balX, bal1, 0.05);
      rec('N4', 'Release one property from the pool (Elm Terrace)', pass, 'default release price ' + money(dflt) + ' (12% of ' + money(bal0) + ', Elm\'s $6M of $50M allocated); balance ' + money(bal0) + ' → ' + money(bal1) + '; payment recalculated to ' + money(pi1) + ' (over the remaining ' + (360 - pm) + ' months: ' + money(want) + '); ' + k.length + ' properties left, Maple still allocated ' + money(al && al['name:maple court']) +
        '; a $4.5M pool row at ' + ((POOLNOI - 500000) / ds).toFixed(2) + '×: ' + !!row + '; Elm Terrace now "no loan" with its $500,000 NOI: ' + elm + '; ' + ev.length + ' maturity; the pages say "Released: Elm Terrace": ' + relTxt + '; after Excel to another copy the balance is ' + money(balX), [p1, p2, p3]);
    } finally { await s.app.close(); }
  },
  // ---- release the lead property: the loan moves to the member with the largest share ----
  async N5() {
    const s = await start(bookE());
    try {
      await L.openProp(s.page, 'Maple Court');
      await s.page.evaluate(() => document.querySelector('[data-poolrelease$="|name:maple court"]').click()); await s.page.waitForTimeout(500);
      await s.page.evaluate(() => document.getElementById('poolRelGo').click()); await s.page.waitForTimeout(1200);
      const l = await s.page.evaluate(() => { const x = window.LDS_getLoan('ln_pool'); return { name: x.propertyName, keys: window.LDS_poolKeys('ln_pool') }; });
      const h = await L.home(s.page), row = poolRowOf(h, POOLNOI - 1000000), maple = h.rows.some(r => /^Maple Court/.test(r[0]) && /no loan/i.test(r.join(' ')));
      const pass = l.name === 'Dogwood Flats' && l.keys.length === 4 && l.keys.indexOf('name:maple court') < 0 && !!row && maple;
      rec('N5', 'Release the lead property (Maple Court)', pass, 'the loan moved to ' + l.name + ' (the largest allocation, $13M); ' + l.keys.length + ' properties left; a $4.0M pool row: ' + !!row + '; Maple Court "no loan" with its NOI: ' + maple);
    } finally { await s.app.close(); }
  },
  // ---- renames through every path ----
  async N6() {
    const s = await start(bookE());
    try {
      await openEdit(s, 'ln_pool');
      await s.page.evaluate(() => { const i = document.getElementById('f_propertyName'); i.value = 'Maple Court East'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
      await saveForm(s);
      const k = await keysOf(s, 'ln_pool'), h = await L.home(s.page), row = poolRowOf(h, POOLNOI, 5e6 / (12 * L.pmt(50e6, 0.055, 360)));
      const pass = k.length === 5 && k[0] === 'name:maple court east' && !!row && h.props.length === 6;
      rec('N6', 'Rename the lead property through the loan form', pass, 'after "Maple Court" → "Maple Court East" on the loan form: ' + k.length + ' properties on the loan (lead ' + k[0] + '), the pool row at 1.47×: ' + !!row + ', ' + h.props.length + ' properties');
    } finally { await s.app.close(); }
  },
  async N7() {
    const s = await start(bookE());
    try {
      await s.page.evaluate(() => window.LDS_asstAction({ action: 'propose_profile_change', args: { name: 'Birch Gardens', changes: { propertyName: 'Birch Gardens West' } } }));
      const ap = await approveCard(s); await s.page.waitForTimeout(1200);
      const k = await keysOf(s, 'ln_pool'), lst = await s.page.evaluate(() => window.LDS_getLoan('ln_pool').alsoSecures);
      const h = await L.home(s.page), row = poolRowOf(h, POOLNOI);
      const pg = await L.openProp(s.page, 'Birch Gardens West'); const ok = pg.found && /Pooled loan/.test(pg.text || '');
      const pass = ap && k.length === 5 && k.indexOf('name:birch gardens west') >= 0 && /Birch Gardens West = 10000000/.test(lst) && !!row && ok;
      rec('N7', 'Rename a pledged property through the assistant', pass, 'approved: ' + ap + '; the loan now lists "' + lst + '"; ' + k.length + ' properties; pool row intact: ' + !!row + '; Birch Gardens West\'s page shows the pool: ' + ok);
    } finally { await s.app.close(); }
  },
  async N8() {
    const s = await start(bookE());
    try {
      const b64 = await s.page.evaluate(() => { const wb = XLSX.read(window.LDS_exportXlsxB64(), { type: 'base64' }), ws = wb.Sheets[wb.SheetNames[0]], a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const ri = a.findIndex(r => r[1] === 'Property Name'), ci = a.find(r => r[1] === 'Loan ID').indexOf('ln_pool'); a[ri][ci] = 'Maple Court North';
        wb.Sheets[wb.SheetNames[0]] = XLSX.utils.aoa_to_sheet(a); return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }); });
      await s.page.evaluate((b) => window.LDS_importXlsxB64(b), b64); await s.page.waitForTimeout(900);
      await s.page.evaluate(() => document.getElementById('importApplyBtn').click()); await L.confirmIfAsked(s.page); await s.page.waitForTimeout(1500);
      const k = await keysOf(s, 'ln_pool'), h = await L.home(s.page), row = poolRowOf(h, POOLNOI);
      const pass = k.length === 5 && k[0] === 'name:maple court north' && !!row && h.props.length === 6;
      rec('N8', 'Rename the lead property through an Excel import', pass, 'after the sheet renames it "Maple Court North" and is imported: ' + k.length + ' properties on the loan (lead ' + k[0] + '), pool row intact: ' + !!row + ', ' + h.props.length + ' properties');
    } finally { await s.app.close(); }
  },
  // ---- Excel import warns about names that aren't properties ----
  async N9() {
    const s = await start(bookE());
    try {
      const b64 = await s.page.evaluate(() => { const wb = XLSX.read(window.LDS_exportXlsxB64(), { type: 'base64' }), ws = wb.Sheets[wb.SheetNames[0]], a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const ri = a.findIndex(r => r[1] === 'Also secures (pooled loan)'), ci = a.find(r => r[1] === 'Loan ID').indexOf('ln_pool'); a[ri][ci] = String(a[ri][ci]).replace('Birch Gardens', 'Brich Gardens');
        wb.Sheets[wb.SheetNames[0]] = XLSX.utils.aoa_to_sheet(a); return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }); });
      await s.page.evaluate((b) => window.LDS_importXlsxB64(b), b64); await s.page.waitForTimeout(900);
      const note = await s.page.evaluate(() => { const n = document.getElementById('importPoolNote'); return n ? n.textContent : ''; });
      const p1 = await pic(s, '#importSummary', 'N9-import-warning.png');
      const pass = /Brich Gardens/.test(note) && !/Cedar Point/.test(note);
      rec('N9', 'Excel import names a property that isn\'t in the book before you apply', pass, 'the preview says: "' + note + '"', [p1]);
    } finally { await s.app.close(); }
  },
  // ---- names as you wrote them ----
  async N10() {
    const s = await start(bookE());
    try {
      const pg = await L.openProp(s.page, 'Birch Gardens'), t = pg.text || '';
      const h = await L.home(s.page), row = h.rows.find(r => /POOL/.test(r[0])) || [''];
      const pass = /Birch Gardens/.test(t) && /Cedar Point Apartments/.test(t) && !/birch gardens|cedar point apartments/.test(t) && /Birch Gardens/.test(row[0]) && !/birch gardens/.test(row[0]);
      rec('N10', 'Names shown as you wrote them', pass, 'pool panel and Home row: "' + row[0].slice(0, 90) + '"');
    } finally { await s.app.close(); }
  },
  // ---- the assistant ----
  async N11() {
    const R = F.bookR(); const s = await start([R[0], R[1]], P.concat([F.CONTROL]));
    try {
      await s.page.evaluate(() => window.LDS_asstAction({ action: 'set_pool', args: { name: 'Maple Court', properties: ['Birch Gardens', 'Cedar Point Apartments'], allocations: { 'Birch Gardens': 4000000, 'Cedar Point Apartments': 2000000 } } }));
      const ap = await approveCard(s);
      const k = await keysOf(s, 'ln_r1'), h = await L.home(s.page), row = poolRowOf(h, 3000000);
      const pass = ap && k.length === 3 && !!row;
      rec('N11', 'The assistant makes a loan a pooled loan (set_pool)', pass, 'approved: ' + ap + '; Maple Court\'s loan now secures ' + k.length + ' properties; a $3.0M pool row: ' + !!row);
    } finally { await s.app.close(); }
  },
  async N12() {
    const s = await start(bookE());
    try {
      const bal0 = await s.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_pool')));
      await s.page.evaluate(() => window.LDS_asstAction({ action: 'release_from_pool', args: { name: 'Maple Court', property: 'Elm Terrace' } }));
      const ap = await approveCard(s);
      const k = await keysOf(s, 'ln_pool'), bal1 = await s.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_pool')));
      const pass = ap && k.length === 4 && L.near(bal0 - bal1, bal0 * 0.12, 0.05);
      rec('N12', 'The assistant releases a property (release_from_pool)', pass, 'approved: ' + ap + '; ' + k.length + ' properties left; ' + money(bal0 - bal1) + ' paid down');
    } finally { await s.app.close(); }
  },
  async N13() {
    const s = await start(F.bookR());
    try {
      const owed = await s.page.evaluate(() => ['ln_r1', 'ln_r2', 'ln_r3', 'ln_r4', 'ln_r5', 'ln_r6'].reduce((a, id) => a + window.LDS_computeBalance(window.LDS_getLoan(id)), 0));
      const r = await s.page.evaluate(() => window.LDS_asstAction({ action: 'refinance_together', args: { properties: ['Maple Court', 'Birch Gardens', 'Cedar Point Apartments', 'Dogwood Flats', 'Elm Terrace'] } }));
      await s.page.waitForTimeout(1200);
      const t = await s.page.evaluate(() => { const l = window.LDS_activeLoan(); return l ? { payoff: window.LDS_refiPayoff(l), noi: window.LDS_refiNOI(l), shown: !!document.querySelector('[data-refiverdict]') } : null; });
      const pass = r && r.ok && t && L.near(t.payoff, owed, 1) && L.near(t.noi, POOLNOI, 1) && t.shown;
      rec('N13', 'The assistant opens one refinance for 5 properties (refinance_together)', pass, 'it says: "' + ((r && r.msg) || '').slice(0, 160) + '…"; the refinance screen is open with payoff ' + money(t && t.payoff) + ' (6 loans owe ' + money(owed) + ') and NOI ' + money(t && t.noi));
    } finally { await s.app.close(); }
  },
  // ---- no limit: 40 properties ----
  async N14() {
    const big = F.bigProps(40).map(p => Object.assign({}, p, { ala: 1200000 })), terms = Object.assign({}, F.BIG_TERMS, { originalAmount: 48000000 });
    const s = await start([F.CONTROL_LOAN, poolLoan(big, terms)], big.concat([F.CONTROL]));
    try {
      const noi = 40 * 400000, ds = 12 * L.pmt(48e6, 0.055, 360);
      const h = await L.home(s.page), row = poolRowOf(h, noi, noi / ds);
      const pg = await L.openProp(s.page, big[39].name), members = await s.page.evaluate(() => document.querySelectorAll('#propOpPanel [data-poolmember]').length);
      const p2 = await pic(s, '#propOpPanel', 'N14-40-panel.png');
      const c = await L.calendar(s.page), ev = (c.events || []).filter(e => e.type === 'Maturity' && e.lender === 'Scale Bank');
      const t = await s.page.evaluate(() => { const ks = window.opProperties().filter(p => /^Scale Property/.test(p.name)).map(p => p.key), l = window.LDS_getLoan('multi:' + ks.join('|')); return l ? { payoff: window.LDS_refiPayoff(l), noi: window.LDS_refiNOI(l), n: ks.length } : null; });
      const bal = await s.page.evaluate(() => window.LDS_computeBalance(window.LDS_getLoan('ln_pool')));
      const p1 = await homePic(s, 'N14-40-home.png');
      const pass = !!row && h.props.length === 41 && members === 40 && ev.length === 1 && t && t.n === 40 && L.near(t.payoff, bal, 1) && L.near(t.noi, noi, 1);
      rec('N14', 'No limit: one loan on 40 properties', pass, 'Home: one pool row at $16.0M and ' + (noi / ds).toFixed(2) + '× (' + (row ? row[0].slice(0, 70) : 'none') + '), ' + h.props.length + ' properties; property #40\'s page lists ' + members + ' members; ' + ev.length + ' maturity; a refinance of all ' + (t && t.n) + ' together: payoff ' + money(t && t.payoff) + ', NOI ' + money(t && t.noi), [p1, p2]);
    } finally { await s.app.close(); }
  },
  // ---- the combined (senior + mezz) page shows the real balance and payment ----
  async N15() {
    const s = await start(F.bookR());
    try {
      const want = await s.page.evaluate(() => ({ bal: ['ln_r3', 'ln_r4'].reduce((a, id) => a + window.LDS_computeBalance(window.LDS_getLoan(id)), 0), pi: ['ln_r3', 'ln_r4'].reduce((a, id) => a + window.LDS_scheduleRows(id)[0].payment, 0) }));
      const pg = await L.openProp(s.page, 'Cedar Point'), t = (pg.text || '').replace(/\n+/g, ' | ');
      const bal = L.parseMoney((t.match(/CURRENT BALANCE \| (\$[\d,.]+)/i) || [])[1]), pi = L.parseMoney((t.match(/MONTHLY P&I \| (\$[\d,.]+)/i) || [])[1]);
      const p1 = await pic(s, '#kpiGrid', 'N15-combined-page.png');
      const pass = L.near(bal, want.bal, 0.05) && L.near(pi, want.pi, 0.05);
      rec('N15', 'A senior + mezz page shows the real balance and payment', pass, 'Cedar Point\'s page: current balance ' + money(bal) + ' (its two loans owe ' + money(want.bal) + '), monthly P&I ' + money(pi) + ' (the two payments ' + money(want.pi) + ')', [p1]);
    } finally { await s.app.close(); }
  },
};
async function run(ids) {
  for (const id of ids) { try { await checks[id](); } catch (e) { rec(id, '', false, 'CRASH ' + String(e).slice(0, 300)); } }
  return out;
}
module.exports = { run, ids: Object.keys(checks) };
