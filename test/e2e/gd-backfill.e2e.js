/* CONFIRM the bug + fix: a property with a T12 in its folder but NO general-data.json (a T12
   saved before General Data existed, or outside the underwriting-tab drop) must still get its two
   NOIs — the refi backfills general-data.json from the folder's T12 on load, so the
   in-place/underwritten toggle appears without a re-upload.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/gd-backfill.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-gdbf-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // upload the T12 via the underwriting tab (this DOES generate general-data.json)
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/operating history/i.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(400);

  // ---- simulate "a T12 in the folder but no general-data.json": delete the general-data file,
  //      keep the T12, clear the in-memory cache (a fresh launch) ----
  const del=await page.evaluate(async(k)=>{
    const list=await window.ldsShell.docList(k);
    const gf=(list.files||[]).find(f=>f.role==='general'); if(!gf) return {ok:false};
    await window.ldsShell.docDelete(k, gf.id);
    const after=await window.ldsShell.docList(k);
    return { ok:true,
      hasT12:(after.files||[]).some(f=>f.role==='t12'||/t12|\.xls/i.test(f.name||'')),
      hasGeneral:(after.files||[]).some(f=>f.role==='general') };
  },KEY);
  ok(del.ok && del.hasT12 && !del.hasGeneral, 'broken state set up: T12 in the folder, general-data.json removed');
  await page.evaluate(()=>window.LDS_clearGDCache());

  // ---- the fix: opEnsureGeneralData backfills general-data.json from the T12 ----
  const rec=await page.evaluate(async(k)=>{ await window.LDS_opEnsureGeneralData(k); return window.LDS_gdNOICache()[k]; },KEY);
  ok(rec!=null && rec.inPlace!=null && rec.underwritten!=null, 'the refi backfills BOTH NOIs from the folder T12 (in-place '+(rec&&rec.inPlace)+', underwritten '+(rec&&rec.underwritten)+')');

  // ---- general-data.json is written back to the folder (so it persists next launch) ----
  ok(await page.evaluate(async(k)=>{ const l=await window.ldsShell.docList(k); return (l.files||[]).some(f=>f.role==='general'); },KEY),
     'general-data.json is regenerated in the folder');

  // ---- refiNOIOptions (what the toggle checks) now sees them ----
  const opts=await page.evaluate((k)=>{ const l=window.LDS_loans().find(x=>window.propertyKey(x)===k); return window.LDS_refiNOIOptionsFor(l); },KEY);
  ok(opts && opts.inPlace!=null && opts.underwritten!=null, 'the NOI-basis toggle would now render');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all backfill e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
