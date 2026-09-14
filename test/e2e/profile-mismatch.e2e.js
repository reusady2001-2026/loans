/* e2e for v2.9.1: mismatch warning + resolution with reason in field history (the 704 vs 328 case).
   The profile already carries residentialUnits = 704 (set by hand). Read agreement proposes 328. The
   confirm row is flagged a mismatch, names both, and defaults to 704 so a plain confirm KEEPS 704. A
   second pass changes it to 328 with a reason → the profile becomes 328 and the field's history keeps the
   prior 704 with that reason.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/profile-mismatch.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-mism-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const PROP={residentialUnits:{value:328,page:3,quote:"328 units per Exhibit A"}};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // a property with a manually-set unit count of 704
  const key=await page.evaluate(async ()=>{ const k=await window.LDS_addProperty('Mismatch Test 2.9.1'); await window.LDS_setProfileField(k,'residentialUnits',704); return k; });
  await page.waitForTimeout(300);
  ok(await page.evaluate((k)=>window.LDS_profile(k).fields.residentialUnits.value,key)===704,'the profile starts at 704 units (set by hand)');

  // Read agreement proposes 328 → the row is a mismatch, defaults to 704, names both
  await page.evaluate(([k,m])=>window.LDS_readAgreementPropose(k,m),[key,PROP]);
  await page.waitForFunction(()=>document.querySelector('[data-ag-ok="residentialUnits"]'),null,{timeout:6000});
  ok(await page.evaluate(()=>!!document.querySelector('[data-ag-ok="residentialUnits"]').getAttribute('data-ag-mism')),'the residential-units row is flagged a mismatch');
  ok(await page.evaluate(()=>document.querySelector('[data-ag-val="residentialUnits"]').value)==='704','the value defaults to the profile’s 704 (so a plain confirm keeps it)');
  ok(await page.evaluate(()=>!!document.querySelector('[data-ag-reason="residentialUnits"]')),'a reason box is offered');
  const mtxt=await page.evaluate(()=>document.getElementById('readAgreementModal').innerText||'');
  ok(/704/.test(mtxt)&&/328/.test(mtxt),'the mismatch names BOTH values (704 and 328)');

  // Pass 1 — keep: confirm without changing → profile stays 704, provenance untouched (manual)
  await page.evaluate((k)=>window.LDS_readAgreementApply(k),key);
  await page.waitForTimeout(500);
  const kept=await page.evaluate((k)=>{const f=window.LDS_profile(k).fields.residentialUnits;return {v:f.value,src:f.source&&f.source.kind,hist:f.history.length};},key);
  ok(kept.v===704 && kept.src==='manual' && kept.hist===0,'confirming keeps 704 with its manual provenance and no history churn');

  // Pass 2 — change to 328 with a reason
  await page.evaluate(([k,m])=>window.LDS_readAgreementPropose(k,m),[key,PROP]);
  await page.waitForFunction(()=>document.querySelector('[data-ag-val="residentialUnits"]'),null,{timeout:6000});
  await page.evaluate(()=>{ document.querySelector('[data-ag-val="residentialUnits"]').value='328'; document.querySelector('[data-ag-reason="residentialUnits"]').value='agreement covers phase 1 only; whole property is 328'; });
  await page.evaluate((k)=>window.LDS_readAgreementApply(k),key);
  await page.waitForTimeout(500);
  const changed=await page.evaluate((k)=>{const f=window.LDS_profile(k).fields.residentialUnits;return {v:f.value,src:f.source&&f.source.kind,page:f.source&&String(f.source.page),h0:f.history[0]};},key);
  ok(changed.v===328,'changing it saves 328');
  ok(changed.src==='agreement' && changed.page==='3','328 carries the agreement citation (page 3)');
  ok(changed.h0 && changed.h0.value===704 && /phase 1 only/.test(changed.h0.reason||''),'the field history keeps the prior 704 WITH the resolution reason');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all mismatch e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
