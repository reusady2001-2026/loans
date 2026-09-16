/* e2e (cleanup): the property profile lives ON the property view (a collapsible panel under the metrics
   panel) — there is NO separate Profile tab. LDS_openProfile opens the property's own view and expands the
   panel. Confirms the fields render in the panel, values + provenance persist, profile.json lands in the
   property folder, and the values survive a reload (read from disk).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/profile.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-profile-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // open a known property's OWN view (no Profile tab) — the profile panel expands on the property page
  const key=await page.evaluate(()=>{ const ps=window.opProperties(); const p=ps.find(x=>/whitewater/i.test(x.name))||ps[0]; window.LDS_openProfile(p.key); return p.key; });
  await page.waitForFunction(()=>{ const v=document.getElementById('loanView'); const p=document.getElementById('loanProfilePanel'); return v&&!v.hidden&&p&&/data-profilekey/.test(p.innerHTML||''); },null,{timeout:8000});
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>document.getElementById('profileView')===null),'there is NO separate Profile tab section (removed)');
  const panel=await page.evaluate(()=>document.getElementById('loanProfilePanel').innerText||'');
  ok(/Property profile/i.test(panel),'the property view shows a "Property profile" panel');
  ok(/Residential units/i.test(panel)&&/Acquisition date/i.test(panel)&&/Manager/i.test(panel)&&/Year built/i.test(panel)&&/Notes/i.test(panel),'the panel lists the profile fields');
  ok(await page.evaluate(()=>{ const d=document.querySelector('#loanProfilePanel details'); return !!(d&&d.open); }),'the panel is expanded when opened from the units link / navigation');
  ok(/Needs|Profile complete/i.test(panel),'a completeness indicator is shown');

  // set the three profile-only completeness fields (through the same store the panel writes to)
  await page.evaluate(async (k)=>{ await window.LDS_setProfileField(k,'residentialUnits',704); await window.LDS_setProfileField(k,'acquisitionDate','2021-06-01'); await window.LDS_setProfileField(k,'manager','Living'); }, key);
  await page.waitForTimeout(400);
  const after=await page.evaluate((k)=>({ units: window.LDS_profileEffective(k,'residentialUnits'), stored: window.LDS_profile(k).fields.residentialUnits, comp: window.LDS_profileComplete(k) }), key);
  ok(after.units===704,'residential units read back as 704');
  ok(after.stored && after.stored.value===704 && !!after.stored.changedBy && !!after.stored.changedAt,'the units field carries value + changedBy + changedAt (provenance)');
  ok(after.comp.complete,'with units + acquisition + manager set (name derived), the profile is complete ('+after.comp.filled+'/'+after.comp.total+')');

  // an untouched integer field is EMPTY, not 0
  ok(await page.evaluate((k)=>window.LDS_profile(k).fields.commercialUnits===undefined, key),'an untouched field (commercial units) is empty, not stored as 0');

  // 2.9.4 — archiving moved to the toolbar "Remove" (archive the property); un-archive lives in the
  // Properties list. The profile panel no longer carries its own Archive button.
  ok(await page.evaluate(()=>!document.getElementById('loanProfileArchive')),'the profile panel no longer has its own Archive button (moved to the toolbar Remove / Properties list)');
  await page.evaluate((k)=>window.LDS_archiveProperty(k,true), key); await page.waitForTimeout(250);
  ok(await page.evaluate((k)=>window.LDS_isArchived(k)===true,key),'archiving the property works (the toolbar Remove path)');
  await page.evaluate((k)=>window.LDS_archiveProperty(k,false), key); await page.waitForTimeout(200);
  ok(await page.evaluate((k)=>window.LDS_isArchived(k)===false,key),'un-archiving restores it');

  // profile.json is on disk in the property folder
  const HASH=crypto.createHash('sha1').update(key).digest('hex').slice(0,16);
  const PROPDIR=path.join(UDATA,'documents',HASH);
  let onDisk=false; try{ const idx=JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8')); onDisk=(idx.files||[]).some(f=>f.role==='profile'); }catch(e){}
  ok(onDisk,'profile.json is saved in the property folder on disk');

  // survives a reload — read from disk, not memory
  await page.reload(); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  const reloaded=await page.evaluate(async (k)=>{ await window.LDS_ensureProfile(k); const p=window.LDS_profile(k); return { units: window.LDS_profileEffective(k,'residentialUnits'), manager: p.fields.manager&&p.fields.manager.value, acq: p.fields.acquisitionDate&&p.fields.acquisitionDate.value }; }, key);
  ok(reloaded.units===704 && reloaded.manager==='Living' && reloaded.acq==='2021-06-01','after a reload, the profile is read back from disk (704 / Living / 2021-06-01)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all profile e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
