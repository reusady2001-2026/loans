/* e2e for 2.9.15 C1: EVERY property counts in the portfolio, whatever its state — on Home and in Underwriting's roll-up,
   with the same numbers. The book (all made up): a control loan with NOI; a loan with NO NOI; a loan with a NEGATIVE NOI;
   a pool on 3 properties (one member with no NOI); a property with no loan and an NOI; a property with no loan and no NOI.
   Truth is built from the NOIs set here and each loan's own debt service and balance as the app computes them:
     DSCR = ΣNOI ÷ Σ yearly debt service, DY = ΣNOI ÷ Σ balance (no NOI = $0, a negative NOI as it is, every loan's debt).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/portfolio-every-property-2915.e2e.js */
const path = require('path'), L = require('./pool/lib'), F = require('./pool/fixture'), report = require('./pool/report');
const APP = path.resolve(__dirname, '..', '..');
const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
const P = F.PROPS;
const mk = (id, name, amt, rate) => F.loan(id, Object.assign({}, F.BASE, { propertyName: name, propertyAddress: '', lenderName: 'Bank ' + id, loanNumber: id.toUpperCase(),
  originalAmount: amt, annualRate: rate, rateType: 'Fixed', originationDate: '2023-06-01', firstPaymentDate: '2023-07-01', maturityDate: '2033-06-01', loanTermMonths: 120, amortizationMonths: 360 }));
const POOL = F.loan('ln_pool', Object.assign({}, F.POOL_TERMS, { propertyName: P[0].name, propertyAddress: P[0].addr,
  alsoSecures: P[1].name + ' = ' + P[1].ala + '; ' + P[2].name + ' = ' + P[2].ala }));
const BOOK = [F.CONTROL_LOAN, mk('ln_none', 'No NOI Tower', 20000000, 0.05), mk('ln_neg', 'Negative NOI Court', 10000000, 0.055), POOL];
const NOIS = [F.CONTROL, { name: 'Negative NOI Court', noi: -500000 }, { name: P[0].name, addr: P[0].addr, noi: P[0].noi }, { name: P[1].name, addr: P[1].addr, noi: P[1].noi },
  { name: 'Free Clear Plaza', noi: 300000 }];   // Cedar Point (in the pool) and No NOI Tower get no NOI; Empty Lot is added with none
async function run() {
  const out = [];
  const s = await L.boot(APP, BOOK);
  try {
    await L.setNOIs(s.page, NOIS);
    await s.page.evaluate(async () => { await window.LDS_addProperty('Empty Lot'); try { window.LDS_renderPortfolio && window.LDS_renderPortfolio(); } catch (e) {} });
    const debt = await s.page.evaluate(() => { const H = window.LDS_OPERATING_HOOKS, o = {};
      window.LDS_loans().forEach(l => { o[l._id] = { ds: H.annualDebtService(l), bal: H.currentBalance(l) }; });
      const al = window.LDS_poolAlloc('ln_pool'), sum = Object.keys(al).reduce((t, k) => t + al[k], 0), cedar = Object.keys(al).find(k => /cedar/.test(k));
      return { o, cedarShare: al[cedar] / sum }; });
    const ids = ['ln_control', 'ln_none', 'ln_neg', 'ln_pool'];
    const sumDS = ids.reduce((t, k) => t + debt.o[k].ds, 0), sumBal = ids.reduce((t, k) => t + debt.o[k].bal, 0);
    const sumNOI = F.CONTROL.noi - 500000 + P[0].noi + P[1].noi + 300000;
    const wantDSCR = sumNOI / sumDS, wantDY = sumNOI / sumBal, wantNoNOIDebt = debt.o.ln_none.bal + debt.o.ln_pool.bal * debt.cedarShare;
    const h = await L.home(s.page), c = h.cov, nAll = await s.page.evaluate(() => window.opProperties().length);
    out.push({ id: 'C1-a Home DSCR counts every property', pass: L.near(c.wDscr, wantDSCR, 1e-9),
      detail: 'Home DSCR ' + (c.wDscr || 0).toFixed(4) + '× — truth ' + money(sumNOI) + ' NOI ÷ ' + money(sumDS) + ' debt service (all 4 loans) = ' + wantDSCR.toFixed(4) + '×' });
    out.push({ id: 'C1-b Home debt yield counts every loan\'s balance', pass: L.near(c.wDy, wantDY, 1e-9),
      detail: 'Home DY ' + ((c.wDy || 0) * 100).toFixed(3) + '% — truth ' + money(sumNOI) + ' ÷ ' + money(sumBal) + ' = ' + (wantDY * 100).toFixed(3) + '%' });
    out.push({ id: 'C1-c every property is counted, the pool once with its 3 properties', pass: c.nProps === 8 && c.nCov === 6 && nAll === 8,
      detail: c.nProps + ' properties counted (truth 8: Control, No NOI Tower, Negative NOI Court, the pool\'s 3, Free Clear Plaza, Empty Lot) in ' + c.nCov + ' items (truth 6) — the app knows ' + nAll + ' properties' });
    out.push({ id: 'C1-d Home names the properties with no NOI and their debt', pass: c.nNoNOI === 3 && L.near(c.noNOIDebt, wantNoNOIDebt, 1),
      detail: c.nNoNOI + ' with no NOI (truth 3: No NOI Tower, Cedar Point, Empty Lot), ' + money(c.noNOIDebt) + ' of debt (truth ' + money(wantNoNOIDebt) + ': No NOI Tower + Cedar Point\'s share of the pool)' });
    const tileWant = '8 of 8 properties';
    const dsTile = h.dscrKpi, sub = await s.page.evaluate(() => { const pv = document.getElementById('portfolioView'), lab = (t) => { const p = [...pv.querySelectorAll('p')].find(x => (x.textContent || '').trim() === t); return p && p.nextElementSibling && p.nextElementSibling.nextElementSibling ? p.nextElementSibling.nextElementSibling.textContent.trim() : ''; };
      const cap = [...pv.querySelectorAll('h3, p')].map(x => x.textContent || '').find(t => /every property counted/.test(t)) || '';
      const chips = [...pv.querySelectorAll('span')].filter(x => /amber-50/.test(x.className)).map(x => x.textContent.trim());
      return { dscr: lab('Portfolio DSCR'), dy: lab('Portfolio Debt Yield'), cap, chips }; });
    out.push({ id: 'C1-e the DSCR and debt-yield tiles say "8 of 8 properties" and how many have no NOI', pass: sub.dscr.includes(tileWant) && sub.dy.includes(tileWant) && /3 with no NOI \(\$/.test(sub.dscr) && /3 with no NOI \(\$/.test(sub.dy),
      detail: 'DSCR tile ' + dsTile + ' "' + sub.dscr + '" · DY tile "' + sub.dy + '"' });
    out.push({ id: 'C1-f the coverage chart says every property is counted', pass: /every property counted · 8 of 8 properties · 3 with no NOI, counted at \$0/.test(sub.cap), detail: '"' + sub.cap.trim() + '"' });
    out.push({ id: 'C1-g the loans with no NOI or NOI ≤ 0 are named off target', pass: sub.chips.some(t => /No NOI Tower · no NOI/.test(t)) && sub.chips.some(t => /Negative NOI Court · NOI ≤ 0/.test(t)),
      detail: 'off-target chips: ' + sub.chips.join(' | ') });
    const rowOf = (re) => h.rows.find(r => re.test(r[0] || '')) || [];
    const noneRow = rowOf(/^No NOI Tower/), negRow = rowOf(/^Negative NOI Court/);
    out.push({ id: 'C1-h each row keeps its own state', pass: /needs T12\/NOI/i.test(noneRow.join(' ')) && /NOI ≤ 0/.test(negRow.join(' ')) && /-\$500,000/.test(negRow[1] || ''),
      detail: 'No NOI Tower: ' + noneRow.slice(0, 3).concat(noneRow.slice(-1)).join(' | ') + ' · Negative NOI Court: ' + negRow.slice(0, 3).concat(negRow.slice(-1)).join(' | ') });
    // Underwriting's roll-up shows the same three numbers and counts the same properties
    const r = await L.rollup(s.page), tot = (r && r.total) || [];
    const scope = await s.page.evaluate(() => { const m = document.getElementById('opRollupMount'), t = m && m.querySelector('tr[data-op-scope]'); return t ? t.innerText.trim() : ''; });
    const hD = (c.wDscr).toFixed(2) + '×', hY = ((c.wDy) * 100).toFixed(2) + '%', hL = ((c.wLtv) * 100).toFixed(2) + '%';
    out.push({ id: 'C1-i Underwriting\'s roll-up shows the same DSCR, debt yield and LTV as Home', pass: tot[7] === hD && tot[8] === hY && tot[9] === hL,
      detail: 'roll-up ' + [tot[7], tot[8], tot[9]].join(' / ') + ' · Home ' + [hD, hY, hL].join(' / ') });
    out.push({ id: 'C1-j the roll-up counts the same 8 properties and names the 3 with no NOI', pass: /^Total — 8 properties/.test(tot[0] || '') && /^8 of 8 properties counted/.test(scope) && /3 with no NOI, counted at \$0/.test(scope),
      detail: '"' + (tot[0] || '') + '" · "' + scope + '"' });
    // giving the no-NOI property an NOI moves both screens the same way
    await L.setNOIs(s.page, [{ name: 'No NOI Tower', noi: 1500000 }]);
    const h2 = await L.home(s.page), r2 = await L.rollup(s.page), t2 = (r2 && r2.total) || [];
    const want2 = (sumNOI + 1500000) / sumDS;
    out.push({ id: 'C1-k an NOI for No NOI Tower lifts both screens to the same new DSCR', pass: L.near(h2.cov.wDscr, want2, 1e-9) && t2[7] === h2.cov.wDscr.toFixed(2) + '×' && h2.cov.nNoNOI === 2,
      detail: 'Home ' + h2.cov.wDscr.toFixed(4) + '× (truth ' + want2.toFixed(4) + '×), roll-up ' + t2[7] + ', with no NOI now ' + h2.cov.nNoNOI });
    if (s.errors.length) out.push({ id: 'err page errors', pass: false, detail: s.errors.slice(0, 3).join(' | ') });
  } finally { await s.app.close(); }
  return out;
}
run().then(r => report('2.9.15 every property counts', r)).catch(e => { console.error('E2E CRASH', e); process.exit(2); });
