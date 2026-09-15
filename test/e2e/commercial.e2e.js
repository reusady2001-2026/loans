/* e2e for v2.9.2-G: commercial income is its own line — included in NOI, excluded from the residential
   $/unit view (the denominator is residential units only), and re-mappable to "COM" in the GL mapping.
   Driven through the LDS_uwSetupHtml / LDS_uwSetupNoi diagnostics.
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

  // ---- render: the COM line is present, tagged commercial, with NO residential $/unit ----
  const view=await page.evaluate((m)=>{
    var html=window.LDS_uwSetupHtml(m,100,true,{});
    var d=document.createElement('div'); d.innerHTML=html;
    var trs=Array.prototype.slice.call(d.querySelectorAll('tbody tr'));
    var com=trs.find(function(r){ return /commercial/i.test((r.cells[0]||{}).innerText||''); });
    var gpr=trs.find(function(r){ return (r.querySelector('input[data-uwline="GPR"]')); });
    // in the per-unit view a residential row has BOTH a $/unit input and an in-place $/unit number; COM has neither
    return {
      hasCom: !!com,
      comTag: com ? /commercial/i.test(com.cells[0].innerText) : false,
      comHasPerInput: com ? !!com.querySelector('input[data-uwlineper="COM"]') : true,
      comLastCell: com ? (com.cells[com.cells.length-1].innerText||'').trim() : '',
      gprHasPerInput: gpr ? !!gpr.querySelector('input[data-uwlineper="GPR"]') : false
    };
  },WITH_COMM);
  ok(view.hasCom,'the commercial line renders');
  ok(view.comTag,'…tagged "commercial"');
  ok(!view.comHasPerInput,'commercial has NO editable residential $/unit input');
  ok(view.comLastCell==='—' || view.comLastCell==='—','commercial’s $/unit cell is a dash (excluded from residential per-unit)');
  ok(view.gprHasPerInput,'a residential line (GPR) still has its $/unit input — only commercial is excluded');

  // ---- "COM" is offered as a re-map target in the GL mapping (so any line can be tagged commercial) ----
  const cats=await page.evaluate(()=>window.LDS_glCategories().map(function(c){return c.code;}));
  ok(cats.indexOf('COM')>=0,'the GL mapping offers "COM" (commercial) as a category to re-map a line to');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all commercial e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
