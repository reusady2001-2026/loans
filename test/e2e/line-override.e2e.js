/* e2e (2026-10-21): lines are NOT pinned any more. The underwriting is the property's APPROVED pro forma (Safe and
   Aggressive): a line is the T12 plus its accounts' changes, each with a story (proforma.e2e.js). So the table has no
   line inputs and no "edited"/reset controls — not even for a pin saved before (lineOverrides stays on disk, unused).
   The assistant's pin_underwriting_line is refused (asst-more.e2e.js). Driven through LDS_uwSetupHtml (same render).
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

  const look=(ov)=>page.evaluate(([m,ov])=>{ var html=window.LDS_uwSetupHtml(m,100,ov); var d=document.createElement('div'); d.innerHTML=html;
    return { inputs: d.querySelectorAll('input[data-uwline]').length, per: d.querySelectorAll('input[data-uwlineper]').length, reset: d.querySelectorAll('[data-uwlinereset]').length, edited: /\bedited\b/i.test(html), err: /^ERR:/.test(html) }; },[SUMS,ov]);
  const plain=await look({});
  ok(!plain.err && plain.inputs===0 && plain.per===0,'no line input and no $/unit input — lines are not pinned');
  const old=await look({PAY:{value:170000,by:'Yuval',at:'2026-09-15T00:00:00Z'}});
  ok(!old.err && old.inputs===0 && old.reset===0 && !old.edited,'a pin saved before shows nothing: no input, no "edited" tag, no reset');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all line-override e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
