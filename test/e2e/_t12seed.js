// (2026-10-21) A refinance is sized on the property's T12 (or the underwriting approved from it) — never on a typed NOI.
// The sample loans have no T12, so the refinance tests written before that rule give each property a T12 NOI here:
// the NOI the property already shows (its typed NOI), as the in-place T12 NOI in General Data. Every figure the tests
// check stays the same; only where it comes from changes. Call it after the app has loaded (and again after a test
// types a new NOI on a loan it then refinances).
//   const { seedT12 } = require('./_t12seed'); await seedT12(page);            // every active property with an NOI
//   await seedT12(page, ['Avalon White Plains']);                                // only these (by property name)
//   await seedT12(page, null, { 'name:x': 1234567 });                             // given figures, by property key
async function seedT12(page, names, figures){
  return page.evaluate(([names, figures]) => {
    const out = {}, want = names ? names.map((n) => String(n).toLowerCase()) : null;
    if (figures) Object.keys(figures).forEach((k) => { window.LDS_setGDNOI(k, { inPlace: figures[k] }); (window.__t12seeded || (window.__t12seeded = {}))[k] = 1; out[k] = figures[k]; });
    const seen = {};
    const mz = (l) => /mezz/i.test(String(l.lienPosition || '') + ' ' + String(l.propertyName || '')) ? 1 : 0;   // the senior's NOI is the property's
    (window.LDS_loans() || []).filter((l) => !l.archived && !l.paidOff).sort((a, b) => mz(a) - mz(b)).forEach((l) => {
      const k = window.propertyKey(l); if (seen[k] || (figures && figures[k] != null)) return;
      if (want && want.indexOf(String(l.propertyName || '').replace(/\s*\((mezz|mezzanine)[^)]*\)\s*$/i, '').trim().toLowerCase()) < 0) return;
      const mine = window.__t12seeded || (window.__t12seeded = {});
      const g = (window.LDS_gdNOICache() || {})[k]; if (g && g.inPlace != null && !mine[k]) { seen[k] = 1; return; }   // a real T12 stays
      if (mine[k]) window.LDS_setGDNOI(k, { inPlace: null });   // seeded before: read the loan's NOI as it is now
      const n = window.LDS_loanNOI(l); if (n == null || !isFinite(n)) return;
      seen[k] = 1; mine[k] = 1; window.LDS_setGDNOI(k, { inPlace: n }); out[k] = n;
    });
    return out;
  }, [names || null, figures || null]);
}
module.exports = { seedT12 };
