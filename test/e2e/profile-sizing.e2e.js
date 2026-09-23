/* e2e for v2.9.1-F — the profile ↔ Sizing integration:
   • the Sizing tab's Units box is PRE-FILLED from the profile's confirmed residential-unit count;
   • changing Units in Sizing offers to write the new count back to the profile (confirm→yes updates it,
     confirm→no leaves it), and the write carries a manual provenance + keeps the prior value in history;
   • Data Health shows a per-property completeness line ("Profile complete" / "Profile incomplete — needs …").
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/profile-sizing.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-pfsize-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ── a real loan-backed property; set its profile residential units by hand to 512 ──
  const key=await page.evaluate(()=>{ const l=window.LDS_loans()[0]; return window.propertyKey(l); });
  await page.evaluate((k)=>window.LDS_setProfileField(k,'residentialUnits',512),key);
  await page.waitForTimeout(200);
  ok(await page.evaluate((k)=>window.LDS_profileEffective(k,'residentialUnits'),key)===512,'the profile carries 512 residential units');

  // ── open the property in Sizing → the Units box is pre-filled from the profile ──
  await page.evaluate((k)=>window.LDS_openSizing(k),key);
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.querySelector('#uwView [data-uwf="units"]');},null,{timeout:8000});
  await page.waitForTimeout(300);
  const filled=await page.evaluate(()=>window.LDS_uwUnitsInput());
  ok(String(filled)==='512','the Sizing Units box is pre-filled from the profile (got '+filled+')');

  // ── change Units to 500 and DECLINE the "update profile?" prompt → profile stays 512 ──
  await page.evaluate(()=>{ window.confirm=()=>false; });
  await page.evaluate(()=>{ const el=document.querySelector('#uwView [data-uwf="units"]'); el.value='500'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(400);
  ok(await page.evaluate((k)=>window.LDS_profile(k).fields.residentialUnits.value,key)===512,'declining the prompt leaves the profile at 512');

  // ── change Units to 640 and ACCEPT → profile becomes 640, prior 512 kept in history ──
  let asked=false;
  await page.evaluate(()=>{ window.__asked=false; window.confirm=(msg)=>{ window.__asked=/update this property/i.test(String(msg||'')); return true; }; });
  await page.evaluate(()=>{ const el=document.querySelector('#uwView [data-uwf="units"]'); el.value='640'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(500);
  asked=await page.evaluate(()=>window.__asked);
  ok(asked,'changing Units prompts "update this property’s profile?"');
  const after=await page.evaluate((k)=>{const f=window.LDS_profile(k).fields.residentialUnits;return {v:f.value,src:f.source&&f.source.kind,h0:f.history[0]&&f.history[0].value};},key);
  ok(after.v===640,'accepting writes the new count (640) to the profile');
  ok(after.src==='manual','the write is recorded as a manual (Sizing) edit');
  ok(after.h0===512,'the prior 512 is kept in the field history');

  // ── Data Health shows the per-property completeness line ──
  // an incomplete property (name only, no units/acq/manager) and a fully-filled one.
  await page.evaluate(async ()=>{
    await window.LDS_addProperty('Sizing Incomplete 2.9.1');                 // stays incomplete (missing units/acq/manager)
    const kc=await window.LDS_addProperty('Sizing Complete 2.9.1');
    await window.LDS_setProfileField(kc,'residentialUnits',120);
    await window.LDS_setProfileField(kc,'acquisitionDate','2021-06-01');
    await window.LDS_setProfileField(kc,'manager','Living Residential');
  });
  await page.waitForTimeout(200);
  // open the Data Health tab (its open handler calls renderDataHealth)
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="health"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('healthView');return v&&!v.hidden&&/Profile (complete|incomplete)/i.test(v.innerText||'');},null,{timeout:9000});
  await page.waitForTimeout(300);
  const healthText=await page.evaluate(()=>{const v=document.getElementById('healthView');return v?v.innerText:'';});
  ok(/Profile incomplete\s+—\s+needs/i.test(healthText),'an incomplete property shows "Profile incomplete — needs …"');
  ok(/Profile complete/i.test(healthText),'a fully-filled property shows "Profile complete"');
  ok(/acquisition date/i.test(healthText),'the incomplete line names a missing field ("acquisition date")');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all profile-sizing e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
