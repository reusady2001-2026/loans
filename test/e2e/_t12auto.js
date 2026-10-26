// 2.9.16 — the T12 gate in tests written before it. A T12 that comes in is read by the reader and the AI before it is
// used, and a pop-up asks the operator when a check fails, the AI disagrees or Claude isn't connected (Claude is off in
// every test unless it brings its fake). This module, loaded into every e2e test process (run-e2e.js: node -r), answers
// those pop-ups as an operator taking the reader's reading would: "Use the reader's reading", or — when a check fails —
// "Review it myself" → "Save this reading" → "Save anyway". It only clicks the app's real buttons.
// The gate's own tests launch with env LDS_T12_MANUAL=1 and answer the pop-ups themselves.
const GN = process.env.GN || '/opt/node22/lib/node_modules';
function inPage(){
  if (window.__t12Auto) return; window.__t12Auto = true;
  const tick = () => {
    if (!window.__t12Auto || !document.body) return;
    const nc = document.querySelector('[data-t12nc]');
    if (nc){ const b = nc.querySelector('[data-t12nc-use]') || nc.querySelector('[data-t12nc-review]'); if (b && !b.__auto){ b.__auto = 1; b.click(); } }
    const rv = document.querySelector('[data-t12rv]');
    if (rv){ const sv = rv.querySelector('[data-t12rv-save]'); if (sv && !sv.__auto){ sv.__auto = 1; sv.click(); } }
    const cm = document.getElementById('confirmModal'), ct = document.getElementById('confirmTitle');
    if (cm && !cm.classList.contains('hidden') && ct && /checks? still fail/i.test(ct.textContent || '')){ const okb = document.getElementById('confirmOk'); if (okb && !okb.__auto){ okb.__auto = 1; okb.click(); setTimeout(() => { okb.__auto = 0; }, 500); } }
  };
  const start = () => new MutationObserver(tick).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
async function install(page){
  const go = () => page.evaluate(inPage).catch(() => {});
  page.on('domcontentloaded', go);
  await go();
}
let patched = false;
function patch(){
  if (patched) return; patched = true;
  let pw = null; try { pw = require(GN + '/playwright'); } catch (e) { return; }
  const el = pw && pw._electron; if (!el || typeof el.launch !== 'function') return;
  const orig = el.launch.bind(el);
  el.launch = async function (o){
    const app = await orig(o);
    if ((o && o.env && o.env.LDS_T12_MANUAL) || process.env.LDS_T12_MANUAL) return app;
    const fw = app.firstWindow.bind(app); let first = null;
    app.firstWindow = async function (...a){ const p = await fw(...a); if (p !== first){ first = p; await install(p); } return p; };
    app.on('window', (p) => { if (p !== first) install(p); });
    return app;
  };
}
patch();
module.exports = { install, inPage };
