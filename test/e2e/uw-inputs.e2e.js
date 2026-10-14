/* e2e for v2.8.1 underwriting-input cleanup: the dead duplicate "Property" box is gone,
   no "optional"/"GPR" jargon in the input row, plain-language explainers are present, and
   the "average rent per unit" helper fills the yearly gross potential rent (avg × units × 12).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/uw-inputs.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-uwin-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

// set an underwriting input by its data-uwf key and fire input+change (change drives the compute/re-render)
async function setUwf(page,key,val){
  await page.evaluate(({key,val})=>{
    const el=document.querySelector('#uwView [data-uwf="'+key+'"]'); if(!el) return;
    el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  },{key,val});
  await page.waitForTimeout(250);
}
const uwfVal=(page,key)=>page.evaluate((key)=>{const el=document.querySelector('#uwView [data-uwf="'+key+'"]');return el?el.value:null;},key);

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  // open Underwriting
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('uwDrop');},null,{timeout:8000});
  await page.waitForTimeout(300);

  // ---- the dead duplicate "Property" box is gone ----
  ok(await page.evaluate(()=>!document.querySelector('#uwView [data-uwf="name"]')),'the duplicate/dead "Property" name box is removed');
  ok(await page.evaluate(()=>document.querySelectorAll('#uwView [data-uwf="units"]').length===1 && !!document.querySelector('#uwView [data-uwf="rrGPR"]')),'Units and the yearly-rent box are still there');

  // ---- no "optional", no "GPR" jargon in the input area ----
  const rowText=await page.evaluate(()=>{
    const u=document.querySelector('#uwView [data-uwf="units"]'); const card=u&&u.closest('.boxline'); return card?card.innerText:'';
  });
  ok(!/optional/i.test(rowText),'the word "optional" is gone from the input row');
  ok(!/\bGPR\b/.test(rowText),'no "GPR" jargon in the input row (spelled out instead)');
  ok(/Gross potential rent/i.test(rowText),'the rent box is labelled in plain words ("Gross potential rent")');
  ok(/Average rent per unit/i.test(rowText),'the "average rent per unit" helper is offered');

  // ---- explainers present ----
  ok(/from the rent roll/i.test(rowText)&&/replacement reserve/i.test(rowText),'Units carries a plain-language explainer');
  ok(/every unit were leased at market/i.test(rowText),'the yearly-rent box carries a plain-language explainer');

  // ---- the average-per-unit helper fills the yearly rent (avg × units × 12) ----
  await setUwf(page,'units','200');
  await setUwf(page,'avgRentUnit','1500');
  const yearly=Number((await uwfVal(page,'rrGPR')||'').replace(/[^0-9.]/g,''));
  ok(yearly===3600000,'average rent per unit fills the yearly rent: 1,500 × 200 × 12 = 3,600,000 (got '+yearly+')');
  // change units → the yearly figure follows
  await setUwf(page,'units','250');
  const yearly2=Number((await uwfVal(page,'rrGPR')||'').replace(/[^0-9.]/g,''));
  ok(yearly2===4500000,'changing units re-computes the yearly rent: 1,500 × 250 × 12 = 4,500,000 (got '+yearly2+')');
  // typing the yearly figure directly clears the per-unit helper (no silent disagreement)
  await setUwf(page,'rrGPR','5000000');
  ok((await uwfVal(page,'avgRentUnit'))==='','typing the yearly figure directly clears the average-per-unit box');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all underwriting-input checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
