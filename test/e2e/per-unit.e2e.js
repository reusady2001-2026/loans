/* e2e for v2.9.2-D: per-unit columns + per-user toggle + "units missing" state.
   The real line-item table needs a T12 uploaded; the render logic is exercised here through the
   LDS_uwSetupHtml diagnostic (build a Setup from category sums, render the same uwSetupOutputHtml the tab
   uses) so the $/unit columns are checked deterministically without a file upload. Toggle persistence is
   checked against localStorage.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/per-unit.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-pu-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const SUMS={ GPR:1000000, VAC:-50000, PAY:200000, RET:50000 };

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- toggle preference persists (per user) ----
  await page.evaluate(()=>window.LDS_perUnitSet(false));
  ok(await page.evaluate(()=>window.LDS_perUnitOn())===false,'the per-unit view defaults off');
  ok(await page.evaluate(()=>{try{return localStorage.getItem('lds.perUnit');}catch(e){return null;}})==='0','off is stored in localStorage');
  await page.evaluate(()=>window.LDS_perUnitSet(true));
  ok(await page.evaluate(()=>window.LDS_perUnitOn())===true,'the toggle turns the per-unit view on');
  ok(await page.evaluate(()=>{try{return localStorage.getItem('lds.perUnit');}catch(e){return null;}})==='1','on is remembered (survives a restart)');

  // ---- off: two-column table, no $/unit (check the table HEADER, not the toggle button label) ----
  const off=await page.evaluate((m)=>{ var html=window.LDS_uwSetupHtml(m,100,false); var d=document.createElement('div'); d.innerHTML=html; var th=d.querySelector('table thead'); return { err: html.indexOf('ERR:')===0, hdr: th?th.innerText:'' }; },SUMS);
  ok(!off.err,'the setup renders');
  ok(!/\$\/unit/i.test(off.hdr),'with the toggle off the table header has no $/unit column (today’s table)');

  // ---- on: $/unit column, and it ties to the totals (NOI $/unit × 100 ≈ NOI total) ----
  const on=await page.evaluate(([m,u])=>{
    var html=window.LDS_uwSetupHtml(m,u,true);
    var d=document.createElement('div'); d.innerHTML=html;
    var trs=Array.prototype.slice.call(d.querySelectorAll('table tbody tr'));
    var tr=trs.find(function(r){ return /net operating income/i.test((r.cells[0]||{}).innerText||''); });
    var money=function(s){ return Number(String(s||'').replace(/[^0-9.]/g,''))||0; };
    var hasHdr=/\$\/unit/i.test(html);
    var note=/Per unit on 100 residential units/i.test(html);
    return tr ? { hasHdr:hasHdr, note:note, uwTotal:money(tr.cells[3].innerText), uwPer:money(tr.cells[4].innerText) } : { hasHdr:hasHdr, note:note, uwTotal:0, uwPer:0 };
  },[SUMS,100]);
  ok(on.hasHdr,'toggling on adds the $/unit column');
  ok(on.note,'a note names the per-unit basis (100 residential units)');
  ok(on.uwPer>0 && Math.abs(on.uwTotal/100 - on.uwPer) <= Math.max(1, on.uwPer*0.01),'the underwritten NOI $/unit ties to the total: '+on.uwPer+' ≈ '+on.uwTotal+' / 100');

  // ---- units missing ----
  const missing=await page.evaluate((m)=>window.LDS_uwSetupHtml(m,null,true),SUMS);
  ok(/units missing/i.test(missing),'with no units, the $/unit view shows the "Units missing" state');
  ok(/property profile/i.test(missing),'…with a link to set units in the property profile');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all per-unit e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
