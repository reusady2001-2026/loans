// 2.9.14 — how the pooled-loan checks drive the app: one loan record whose "Also secures" lists every other property
// it secures, each with its allocated amount; the user actions (edit, remove, restore, refinance together) go through the screens.
const path = require('path'), L = require('./lib');
function make(o) {
  const poolLoan = (F, props, terms) => F.loan('ln_pool', Object.assign({}, terms, { propertyName: props[0].name, propertyAddress: props[0].addr }, o.loanExtra ? o.loanExtra(props) : {}));
  return {
    id: o.id, name: o.name, appDir: path.resolve(__dirname, '..', '..', '..'),
    bookE: (F) => ({ loans: [F.CONTROL_LOAN, poolLoan(F, F.PROPS, F.POOL_TERMS)] }),
    afterBoot: async (page, F) => { if (o.afterBoot) await o.afterBoot(page, F.PROPS); },
    afterImport: async (page, F) => { if (o.afterImport) await o.afterImport(page, F.PROPS); },
    editPoolRate: async (page, rate) => { await L.editLoanUI(page, 'ln_pool', { annualRate: String(rate * 100) }); return { edits: 1 }; },
    removePool: async (page) => { await L.removeLoanUI(page, 'ln_pool'); },
    restorePool: async (page) => { await L.restoreLoanUI(page, 'ln_pool'); },
    poolRefiTarget: async () => 'ln_pool',
    refiFive: async (page, F) => {
      await L.goHome(page);
      const ok = await page.evaluate(() => { const b = document.getElementById('poolRefiBtn'); if (!b) return false; b.click(); return true; });
      if (!ok) return { unsupported: 'no "refinance several properties" button' };
      await page.waitForTimeout(400);
      await page.evaluate((names) => { document.querySelectorAll('#poolPicker [data-poolpick]').forEach(cb => { const sp = cb.parentElement.querySelector('span'); const t = (sp ? sp.textContent : cb.parentElement.textContent).trim(); if (names.indexOf(t) >= 0) cb.checked = true; }); document.getElementById('poolPickGo').click(); }, F.PROPS.map(p => p.name));
      await page.waitForTimeout(1500);
      const id = await page.evaluate(() => { const l = window.LDS_activeLoan(); return l && l._id; });
      return id ? { id } : { unsupported: 'the package did not open' };
    },
    saveRefiFive: async (page) => {
      const has = await page.evaluate(() => { const b = document.getElementById('refiSaveBtn'); if (!b) return false; b.click(); return true; });
      if (!has) { const v = await page.evaluate(() => { const r = document.getElementById('refiResults') || document.getElementById('refiView'); return r ? r.innerText.slice(0, 300).replace(/\s+/g, ' ') : ''; }); return { note: 'no Save button on the refinance — screen says: ' + v }; }
      await L.confirmIfAsked(page); await page.waitForTimeout(800); return { note: 'saved through the refinance screen' };
    },
    bigBook: (F, big) => ({ loans: [F.CONTROL_LOAN, poolLoan(F, big, F.BIG_TERMS)] }),
    afterBigBoot: async (page, F, big) => { if (o.afterBoot) await o.afterBoot(page, big); },
  };
}
module.exports = make({ id: 'pool', name: 'one loan + "also secures" with allocated amounts + stacks',
  loanExtra: (props) => ({ alsoSecures: props.slice(1).map(p => p.name + ' = ' + (p.ala || 4000000)).join('; ') }) });
