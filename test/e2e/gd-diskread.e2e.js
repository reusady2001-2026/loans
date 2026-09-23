/* Reproduce the CROSS-SESSION disk read of general-data (the NOI-basis toggle). The other
   e2e upload a T12 and read the NOIs from the IN-MEMORY cache in one session — but the real
   app must re-read general-data.json FROM DISK on a fresh launch. This clears the in-memory
   cache and re-reads from disk, the way renderRefi does when you reopen the app.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/gd-diskread.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-gdread-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // upload the T12 to Villages via the underwriting tab (writes general-data.json to the folder)
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/operating history/i.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(400);

  // the in-memory cache has the NOIs now (from the upload path)
  const warm=await page.evaluate((k)=>{ const g=window.LDS_gdNOICache()[k]; return { has:!!g, inPlace:g?g.inPlace:null, underwritten:g?g.underwritten:null }; },KEY);
  ok(warm.has && warm.inPlace!=null && warm.underwritten!=null, 'after upload, the in-memory cache holds both NOIs (in-place '+warm.inPlace+', underwritten '+warm.underwritten+')');

  // ---- simulate a fresh session: clear the in-memory cache; only the DISK file remains ----
  await page.evaluate(()=>window.LDS_clearGDCache());
  ok(await page.evaluate((k)=>window.LDS_gdNOICache()[k]===undefined, KEY), 'the in-memory cache is cleared (a fresh launch)');

  // re-read from DISK, exactly as renderRefi does on a fresh launch
  const disk=await page.evaluate(async(k)=>{ await window.LDS_opEnsureGeneralData(k); return window.LDS_gdNOICache()[k]; },KEY);
  ok(disk!=null, 'the disk read repopulates the cache (not null)');
  ok(disk && disk.inPlace!=null && disk.underwritten!=null, 'THE DISK READ RECOVERS BOTH NOIs (in-place '+(disk&&disk.inPlace)+', underwritten '+(disk&&disk.underwritten)+')');

  // and refiNOIOptions (what the toggle checks) sees them off the disk read
  const opts=await page.evaluate((k)=>{ const l=window.LDS_loans().find(x=>window.propertyKey(x)===k); return window.LDS_refiNOIOptionsFor(l); },KEY);
  ok(opts && (opts.inPlace!=null || opts.underwritten!=null), 'refiNOIOptions sees the NOIs off the disk read → the toggle would render');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all disk-read e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
