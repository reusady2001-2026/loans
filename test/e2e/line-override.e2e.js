/* e2e for v2.9.2-E: the underwritten side is editable. The line-item table renders each underwritten value
   as an input (total, and $/unit in the per-unit view); a pinned line shows an "edited" tag + reset and the
   NOI reflects the pin. Driven through the LDS_uwSetupHtml / LDS_uwSetupNoi diagnostics (same render + engine
   the tab uses) because the environment's T12-upload path is currently wedged.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/line-override.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-ov-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const SUMS={ GPR:1000000, VAC:-50000, PAY:200000, RET:50000 };

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // the underwritten side renders as editable inputs (total), with a $/unit input in the per-unit view
  const inputs=await page.evaluate((m)=>{
    var html=window.LDS_uwSetupHtml(m,100,true,{});
    var d=document.createElement('div'); d.innerHTML=html;
    return { total: d.querySelectorAll('input[data-uwline]').length, per: d.querySelectorAll('input[data-uwlineper]').length, payVal: (d.querySelector('input[data-uwline="PAY"]')||{}).value };
  },SUMS);
  ok(inputs.total>0,'the underwritten totals render as editable inputs');
  ok(inputs.per>0,'in the per-unit view each underwritten line also has a $/unit input');
  ok(String(inputs.payVal)==='200000','the PAY input shows its computed underwritten value (200,000)');

  // pin PAY to 170,000 → the input shows it, an "edited" tag + reset appear, and the NOI moves
  const baseNoi=await page.evaluate((m)=>window.LDS_uwSetupNoi(m,100,{}),SUMS);
  const pinned=await page.evaluate((m)=>{
    var html=window.LDS_uwSetupHtml(m,100,false,{PAY:{value:170000,by:'Yuval',at:'2026-09-15T00:00:00Z'}});
    var d=document.createElement('div'); d.innerHTML=html;
    var row=Array.prototype.slice.call(d.querySelectorAll('tbody tr')).find(function(r){ return /payroll|pay\b/i.test((r.cells[0]||{}).innerText||'') || d.querySelector('input[data-uwline="PAY"]'); });
    return { payVal:(d.querySelector('input[data-uwline="PAY"]')||{}).value, edited:/edited/i.test(html), reset: !!d.querySelector('[data-uwlinereset="PAY"]') };
  },SUMS);
  const ovNoi=await page.evaluate((m)=>window.LDS_uwSetupNoi(m,100,{PAY:170000}),SUMS);
  ok(String(pinned.payVal)==='170000','after pinning, the PAY input shows 170,000');
  ok(pinned.edited,'the pinned line is tagged "edited"');
  ok(pinned.reset,'a reset control is offered for the pinned line');
  ok(typeof ovNoi==='number' && Math.abs(ovNoi-(baseNoi+30000))<=0.5,'the underwritten NOI moved by the pin (+30,000): '+ovNoi+' vs '+baseNoi);

  // clearing the override (empty map) returns to the computed value + NOI
  const cleared=await page.evaluate((m)=>({ noi: window.LDS_uwSetupNoi(m,100,{}), pay: (function(){ var d=document.createElement('div'); d.innerHTML=window.LDS_uwSetupHtml(m,100,false,{}); return (d.querySelector('input[data-uwline="PAY"]')||{}).value; })() }),SUMS);
  ok(Math.abs(cleared.noi-baseNoi)<=0.5,'clearing the pin restores the computed NOI');
  ok(String(cleared.pay)==='200000','…and the computed PAY value');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all line-override e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
