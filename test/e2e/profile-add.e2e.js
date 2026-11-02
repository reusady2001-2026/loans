/* e2e for v2.9.1: Add Property (a name-only property is first-class) + Archive/un-archive.
   Adds "Test Property 2.9.1" with only a name, confirms it joins the list / roll-up / Data Health and
   bumps the count to 28; that adding a loan to an existing property does NOT change the count; that
   archiving removes it from the list, roll-up and count and un-archiving brings it back; and that the
   added property survives a reload (re-registered from profile.json on disk).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/profile-add.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-addprop-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  const n0=await page.evaluate(()=>window.opProperties().length);
  ok(n0===27,'baseline is 27 properties (got '+n0+')');

  // "Add loan" onto an existing property does not create a property
  const dup=await page.evaluate(()=>{ const ls=window.LDS_loans(); const before=window.opProperties().length; ls.push(Object.assign({},ls[0],{_id:'test-dup-loan'})); const after=window.opProperties().length; ls.pop(); return {before,after}; });
  ok(dup.after===dup.before,'a second loan on an existing property does not change the count ('+dup.before+'→'+dup.after+')');

  // Add Property with only a name
  const key=await page.evaluate(async ()=>await window.LDS_addProperty('Test Property 2.9.1'));
  await page.waitForTimeout(300);
  ok(!!key,'Add Property returns a key');
  ok(await page.evaluate(()=>window.opProperties().length)===28,'after Add Property the count is 28');
  ok(await page.evaluate(()=>window.opProperties().some(p=>/Test Property 2\.9\.1/.test(p.name)&&p.loans.length===0)),'the new property is in the list with no loans');
  ok(await page.evaluate((k)=>window.LDS_standaloneProps().indexOf(k)>=0,key),'it is registered as a standalone (loan-less) property');

  // shows in the roll-up (as an explained blank)
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opRollupMount');},null,{timeout:8000});
  await page.waitForTimeout(500);
  ok(await page.evaluate(()=>/Test Property 2\.9\.1/.test((document.getElementById('opRollupMount')||{}).innerText||'')),'the new property shows in the portfolio roll-up');

  // shows in Data Health
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="health"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('healthView');return v&&!v.hidden&&/Data Health/.test(v.innerText||'');},null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>/Test Property 2\.9\.1/.test((document.getElementById('healthView')||{}).innerText||'')),'the new property shows in Data Health');

  // profile.json on disk
  const HASH=crypto.createHash('sha1').update(key).digest('hex').slice(0,16);
  let onDisk=false; try{ const idx=JSON.parse(fs.readFileSync(path.join(UDATA,'documents',HASH,'index.json'),'utf8')); onDisk=(idx.files||[]).some(f=>f.role==='profile'); }catch(e){}
  ok(onDisk,'the new property has a profile.json on disk');

  // archive → leaves list, roll-up, count; un-archive → returns
  await page.evaluate(async (k)=>await window.LDS_archiveProperty(k,true), key);
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>window.opProperties().length)===27,'archiving returns the count to 27');
  ok(await page.evaluate((k)=>window.opProperties().every(p=>p.key!==k),key),'the archived property is gone from the list');
  ok(await page.evaluate((k)=>window.LDS_archivedProps().indexOf(k)>=0,key),'it appears in the archived list');
  await page.evaluate(async (k)=>await window.LDS_archiveProperty(k,false), key);
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>window.opProperties().length)===28,'un-archiving returns the count to 28');

  // survives a reload (re-registered from disk)
  await page.reload(); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  await page.evaluate(async ()=>{ await window.LDS_loadAllProfiles(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>window.opProperties().length)===28,'after a reload, the added property is restored from disk (28)');
  ok(await page.evaluate(()=>window.opProperties().some(p=>/Test Property 2\.9\.1/.test(p.name))),'and it is present by name after the reload');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all add-property e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
