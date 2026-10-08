/* e2e for 2.9.10 (fixes 1, 2) — Claude reaches the property's own records when told to read all the files; the
   property's name, address and units live in its profile only.
   (1a) every message's file list names the property's documents and, apart, the app's own records (profile.json,
        general-data.json …) — it no longer calls them documents;
   (1b) an ordinary question sends the documents only — not the records' contents;
   (1c) "Read all the files of this property" sends the records too, each marked as the app's own record;
   (1d) read_documents lists the documents and the records apart, and reads a record by its name;
   (1e) read_files reads a record by its name;
   (2)  general-data.json keeps no copy of the name / address / units (an old copy is dropped on the next save).
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-records.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-records-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const REPLIES=path.join(UDATA,'replies.json'), CALLS=path.join(UDATA,'chat-calls.jsonl'), PLANS=path.join(UDATA,'plans.json'), PLANLOG=path.join(UDATA,'plans.jsonl');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const lines=(f)=>{ try{ return fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch(e){ return []; } };
const RRT='RENT ROLL as of 09/10/2026\nUnit 101 occupied rent 1,500\nTotal: 85 units, 83 occupied';
(async()=>{
  fs.writeFileSync(REPLIES,'[]'); fs.writeFileSync(PLANS,'[]');
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CHAT_FILE:REPLIES,LDS_FAKE_CHAT_LOG:CALLS,LDS_FAKE_PLAN_FILE:PLANS,LDS_FAKE_PLAN_LOG:PLANLOG,LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'});
  const Q=await page.evaluate(()=>{ const p=window.opProperties().find(x=>/queens gate/i.test(x.name)); return {key:p.key,name:p.name}; });
  // every property gets its folder with profile.json and general-data.json at start (2.9.8) — wait for Queens Gate's
  const have=()=>page.evaluate(async(k)=>{ const r=await window.ldsShell.docIndex(); return (r&&r.byKey&&r.byKey[k])||null; },Q.key);
  for(let i=0;i<40;i++){ const e=await have(); if(e&&e.records&&e.records.indexOf('profile.json')>=0&&e.records.indexOf('general-data.json')>=0) break; await page.waitForTimeout(500); }
  await page.evaluate(async({k,r})=>{ const b=(s)=>btoa(unescape(encodeURIComponent(s)));
    await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'RentRoll.txt',base64:b(r),text:r,type:'text/plain',role:'other'}); },{k:Q.key,r:RRT});
  const idx=await have();
  ok(idx&&idx.docs.join()==='RentRoll.txt'&&idx.records.indexOf('profile.json')>=0&&idx.records.indexOf('general-data.json')>=0,'the file index keeps documents and the app’s records apart (docs: '+(idx&&idx.docs.join(', '))+' · records: '+(idx&&idx.records.join(', '))+')');

  // ---- (2) general-data.json has no copy of the name / address / units ----
  const gdOf=()=>page.evaluate(async(k)=>{ const l=await window.ldsShell.docList(k); const f=(l.files||[]).find(x=>x.role==='general'); if(!f) return null; const r=await window.ldsShell.docRead(k,f.id); return JSON.parse(decodeURIComponent(escape(atob(r.base64)))); },Q.key);
  let gd=await gdOf();
  ok(gd&&gd.propKey===Q.key&&!('propertyName' in gd)&&!('identity' in gd),'a new general-data.json keeps no copy of the name, address or units ('+Object.keys(gd||{}).join(', ')+')');
  // an old file that still carries a copy loses it at its next save (here: the saved "what to push")
  await page.evaluate(async({k,g})=>{ const o=Object.assign({},g,{ propertyName:'Old Name', identity:{ propertyName:'Old Name', address:'1 Old St', units:200 } }); const s=JSON.stringify(o);
    await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'general-data.json',base64:btoa(unescape(encodeURIComponent(s))),text:'',type:'application/json',role:'general'}); },{k:Q.key,g:gd});
  ok(((await gdOf())||{}).identity,'(an old-style file with a copy is in place)');
  await page.evaluate(async(k)=>{ await window.LDS_gdPersistExtras(k,{ push:{ moves:[], test:true } }); },Q.key);   // the app's own save, read from disk (not from its memory)
  gd=await gdOf();
  ok(gd&&!('identity' in gd)&&!('propertyName' in gd)&&gd.push&&gd.push.test===true,'its next save drops the old copy and keeps everything else (“what to push” saved: '+!!(gd&&gd.push)+')');

  // ---- the assistant, on Queens Gate ----
  await page.evaluate(()=>document.getElementById('aiAsstFab').click());
  await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{});
  await page.evaluate((k)=>{ const s=document.getElementById('aiAsstProp'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },Q.key); await page.waitForTimeout(500);
  const idle=()=>page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:60000}).catch(()=>{});
  const send=async(q)=>{ await page.evaluate((q)=>{ document.getElementById('aiAsstInput').value=q; document.getElementById('aiAsstSend').click(); },q); await idle(); await page.waitForTimeout(600); };

  // (1a, 1b) an ordinary question
  fs.writeFileSync(REPLIES,JSON.stringify(['83 of 85 units are occupied.']));
  let c0=lines(CALLS).length; await send('How many units are occupied?');
  let p1=(lines(CALLS).slice(c0)[0]||{}).prompt||'';
  const fl=(p1.match(/Queens Gate Apartments \[([^\]]*)\]/)||[])[1]||'';
  ok(/^RentRoll\.txt; the app’s own records: /.test(fl)&&/profile\.json/.test(fl)&&/general-data\.json/.test(fl),'the file list names the documents, and apart “the app’s own records” ("'+fl+'")');
  ok(/Unit 101 occupied/.test(p1),'an ordinary question sends the documents…');
  ok(!/<file name="profile\.json"/.test(p1)&&!/lds\.profile\.v1/.test(p1)&&!/lds\.general-data\.v1/.test(p1),'…but not the records’ contents');

  // (1c) read all the files
  fs.writeFileSync(REPLIES,JSON.stringify(['Read the rent roll and the app’s records.']));
  c0=lines(CALLS).length; await send('Read all the files of this property');
  const p2=(lines(CALLS).slice(c0)[0]||{}).prompt||'';
  ok(/<file name="profile\.json" read="the app’s own record — the Profile tab">/.test(p2)&&/lds\.profile\.v1/.test(p2),'“Read all the files” sends profile.json, marked as the app’s own record');
  ok(/<file name="general-data\.json" read="the app’s own record — the property’s numbers[^"]*">/.test(p2)&&/"noT12": true/.test(p2)&&/"test": true/.test(p2),'…and general-data.json (with its contents)');
  ok(/Unit 101 occupied/.test(p2),'…and the documents');
  ok(!/"Old Name"/.test(p2),'…and no old copy of the name in it');

  // (1d) read_documents
  const run=(o)=>page.evaluate((o)=>Promise.resolve(window.LDS_asstAction(o)),o);
  let r=await run({action:'read_documents',args:{name:Q.name}});
  ok(r&&r.ok&&r.data&&r.data.documents.map(x=>x.file).join()==='RentRoll.txt'&&r.data.appRecords.some(x=>x.file==='profile.json'&&/Profile tab/.test(x.holds)),'read_documents lists the documents and, apart, the app’s records with what each holds ("'+(r&&r.msg)+'")');
  r=await run({action:'read_documents',args:{name:Q.name,file:'profile.json'}});
  ok(r&&r.ok&&r.data&&/lds\.profile\.v1/.test(r.data.text),'read_documents reads profile.json by its name');
  r=await run({action:'read_documents',args:{name:Q.name,file:'nothing.pdf'}});
  ok(r&&!r.ok&&/RentRoll\.txt/.test(r.msg)&&/the app’s own records \([^)]*profile\.json/.test(r.msg),'a name that isn’t there says what is: documents and records ("'+(r&&r.msg)+'")');

  // (1e) read_files reads a record by its name
  fs.writeFileSync(REPLIES,JSON.stringify(['NOTES: general-data.json holds the property’s NOI record.\nANSWERED: yes']));
  r=await run({action:'read_files',args:{files:['general-data.json']}});
  ok(r&&r.ok&&/Read general-data\.json/.test(r.msg),'read_files reads general-data.json ("'+(r&&r.msg)+'")');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all records (2.9.10) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
