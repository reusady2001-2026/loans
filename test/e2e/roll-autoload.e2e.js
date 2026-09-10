/* e2e for v2.8.7: the Underwriting roll-up loads every property's T12 from disk AUTOMATICALLY
   on launch — no "Load every property's T12" button to click. OperatingStore is in-memory
   (session-only), so a fresh launch starts empty and the disk files are the source of truth.
   Two launches share one profile: upload a T12 in launch 1, then a fresh launch 2 must show
   that property in the roll-up on its own, with no button and no click.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/roll-autoload.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-autoload-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const launch=()=>electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
const openUW=async(page)=>{ await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000}); await page.waitForTimeout(300); };

(async()=>{
  // ---- launch 1: upload Villages' T12 (written to the property folder on disk) ----
  let app=await launch();
  let page=await app.firstWindow(); const e1=[]; page.on('pageerror',e=>e1.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  await openUW(page);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/operating history/i.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(400);
  ok(await page.evaluate((k)=>!!window.OperatingStore.get(k),KEY), 'launch 1: after upload, the T12 is in the session store (and on disk)');
  ok(e1.length===0,'launch 1: no page errors'+(e1.length?': '+e1.join(' | '):''));
  await app.close(); await new Promise(r=>setTimeout(r,800));

  // ---- launch 2 (same profile): the roll-up must auto-load that T12 from disk, no click ----
  app=await launch();
  page=await app.firstWindow(); const e2=[]; page.on('pageerror',e=>e2.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  // fresh session store is empty (in-memory) — the disk file is the only copy
  const before=await page.evaluate((k)=>{ try{ return !!(window.OperatingStore && window.OperatingStore.get(k)); }catch(e){ return false; } },KEY);
  ok(before===false,'launch 2: the session store starts empty (nothing read yet)');
  // open the underwriting tab — do NOT click anything else
  await openUW(page);
  // the auto-load reads the folder and repopulates the store without any button press
  const loaded=await page.waitForFunction((k)=>!!(window.OperatingStore && window.OperatingStore.get(k)),KEY,{timeout:10000}).then(()=>true).catch(()=>false);
  ok(loaded,'launch 2: opening the roll-up auto-loads the property from disk — WITHOUT a click');
  ok(await page.evaluate(()=>!!(window.LDS_opAutoPreloaded && window.LDS_opAutoPreloaded())), 'launch 2: the once-per-session auto-load actually fired');
  ok(await page.evaluate(()=>!document.getElementById('opLoadAll')), 'launch 2: the "Load every property’s T12" button is gone');
  const rollText=await page.evaluate(()=>{const m=document.getElementById('opRollupMount');return m?(m.innerText||''):'';});
  ok(/T12 read|Reading every property/i.test(rollText) || /whitewater/i.test(rollText), 'launch 2: the roll-up shows loaded state / the property, not a load button');
  ok(e2.length===0,'launch 2: no page errors'+(e2.length?': '+e2.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all auto-load e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
