/* e2e (cleanup): the per-unit columns are ALWAYS on (no toggle). Every NOI line shows four value columns —
   in-place $, in-place $/unit, underwritten $ (editable), underwritten $/unit (DERIVED, no input). Commercial
   income is its own line: in the NOI, but a dash in BOTH residential $/unit columns (residential units are the
   denominator). Driven through the LDS_uwSetupHtml / LDS_uwSetupNoi diagnostics.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/commercial.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-comm-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const NO_COMM={ GPR:1000000, RET:50000 };
const WITH_COMM={ GPR:1000000, COM:200000, RET:50000 };

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- commercial income is IN the NOI (200,000 of other income, net of the 2.5% mgmt fee on it) ----
  const noiNo=await page.evaluate((m)=>window.LDS_uwSetupNoi(m,100,{}),NO_COMM);
  const noiComm=await page.evaluate((m)=>window.LDS_uwSetupNoi(m,100,{}),WITH_COMM);
  ok(noiComm>noiNo,'commercial income raises the NOI (it is included)');
  ok(Math.abs((noiComm-noiNo)-195000)<=1,'…by 200,000 less the 2.5% management fee on it (+195,000)');

  // ---- render: always-on four columns; commercial excluded from residential $/unit; $/unit never editable ----
  const view=await page.evaluate((m)=>{
    var html=window.LDS_uwSetupHtml(m,100,{});
    var d=document.createElement('div'); d.innerHTML=html;
    var trs=Array.prototype.slice.call(d.querySelectorAll('tbody tr'));
    var com=trs.find(function(r){ return /commercial/i.test((r.cells[0]||{}).innerText||''); });
    var gpr=trs.find(function(r){ return r.querySelector('input[data-uwline="GPR"]'); });
    var ths=Array.prototype.slice.call(d.querySelectorAll('thead th'));
    return {
      hasCom: !!com,
      comTag: com ? /commercial/i.test(com.cells[0].innerText) : false,
      comDashes: com ? Array.prototype.slice.call(com.cells).filter(function(c){return (c.innerText||'').trim()==='—';}).length : 0,
      gprHasLineInput: gpr ? !!gpr.querySelector('input[data-uwline="GPR"]') : false,
      anyPerInput: !!d.querySelector('input[data-uwlineper]'),
      headerCols: ths.length,
      gprInPlacePer: gpr ? (gpr.cells[2].innerText||'').trim() : ''
    };
  },WITH_COMM);
  ok(view.hasCom,'the commercial line renders (always on — no toggle)');
  ok(view.comTag,'…tagged "commercial"');
  ok(view.comDashes>=2,'commercial shows a dash in BOTH residential $/unit columns (in-place & underwritten)');
  ok(view.gprHasLineInput,'a residential line (GPR) has its editable underwritten input');
  ok(!view.anyPerInput,'there is NO $/unit input anywhere — the $/unit column is derived, not editable');
  ok(view.headerCols===5,'the table shows 5 columns: line + in-place $ + $/unit + underwritten $ + $/unit');
  ok(/[0-9]/.test(view.gprInPlacePer),'a residential line shows a computed in-place $/unit');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all commercial e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
