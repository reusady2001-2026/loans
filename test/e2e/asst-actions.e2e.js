/* e2e for 2.9.7 — the assistant's property and loan actions, each behind an Approve card in the chat.
   #44/#232/#233 create: nothing opens; an archived name → Restore it / Start fresh; a loan's name; a similar name
   #240    archive: "Which one?" when a name fits two, refuses an archived one, real name, loans counted
   #47/#92 un-archive finds archived properties (with or without loans), real name on the card
   #48     remove_loan archives the loan (never deletes it); restore_loan brings it back
   #52     delete permanently: archived only, the card says "for good"
   #233    the Add Property form asks the same questions (archived → Restore it / Start fresh)
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-actions.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asstact-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  // run an action; returns its immediate result (msg) or, for a card, the card's text
  const run=(o)=>page.evaluate((o)=>{ const r=window.LDS_asstAction(o); window.__r=r; return Promise.resolve(r).then(x=>{ window.__r=x; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop();
    return { ok:x&&x.ok, msg:x&&x.msg, card:!!(x&&x.pending), text:(x&&x.pending&&c)?c.textContent:'' }; }); },o);
  const click=async(cls)=>{ await page.evaluate((cls)=>{ const b=[...document.querySelectorAll('#aiAsstLog .'+cls+':not(:disabled)')].pop(); if(b) b.click(); },cls);
    return page.evaluate(()=>window.__r&&window.__r.pending?window.__r.pending:null); };
  const view=()=>page.evaluate(()=>({ mode:window.LDS_state?window.LDS_state().mode:null, sel:document.getElementById('loanSelect').value }));

  // ---- create (#44/#232): nothing opens, plain result ----
  const v0=await view();
  let r=await run({action:'create_property',args:{name:'Maple Court Test'}});
  ok(r.card&&/Create a new property Maple Court Test/.test(r.text),'create shows an Approve card');
  let res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&/Created Maple Court Test \(no loans yet\)/.test(res.msg),'approved → "'+(res&&res.msg)+'"');
  const v1=await view();
  ok(v1.sel===v0.sel,'the screen did not change (still '+v1.sel+')');
  const mk=await page.evaluate(()=>window.opProperties().find(p=>p.name==='Maple Court Test').key);
  await page.evaluate((k)=>window.LDS_setProfileField(k,'residentialUnits',77),mk);

  // ---- similar name (#233) ----
  r=await run({action:'create_property',args:{name:'The Maple Court Test Apartments'}});
  ok(r.card&&/looks like/.test(r.text)&&/Maple Court Test/.test(r.text),'a similar name asks first: "'+r.text.slice(0,80)+'"');
  ok(await page.evaluate(()=>!![...document.querySelectorAll('#aiAsstLog .aiAsstEditAlt')].pop()),'…with Open it beside Create anyway');
  res=await click('aiAsstEditCancel');
  ok(res&&!res.ok&&/Not approved/.test(res.msg),'Cancel → nothing created ("'+(res&&res.msg)+'")');

  // ---- archive (#240) ----
  r=await run({action:'archive_property',args:{name:'Avalon'}});
  ok(!r.card&&/^Which one\?/.test(r.msg)&&/Avalon White Plains/.test(r.msg)&&/Avalon Norwalk/.test(r.msg),'a name that fits two asks: "'+r.msg+'"');
  r=await run({action:'archive_property',args:{name:'Maple Court Test'}});
  ok(r.card&&/Archive Maple Court Test\?/.test(r.text)&&/Un-archive it from the Archived strip on Home/.test(r.text),'the archive card names the property and how to undo');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&await page.evaluate((k)=>window.LDS_isArchived(k),mk),'approved → archived');
  r=await run({action:'archive_property',args:{name:'Maple Court Test'}});
  ok(!r.card&&/already archived/.test(r.msg),'archiving it again is refused: "'+r.msg+'"');
  const wp=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.name==='Avalon White Plains'); return p?p.loans.length:0; });
  r=await run({action:'archive_property',args:{name:'Avalon White Plains'}});
  ok(r.card&&new RegExp('its '+wp+' loans').test(r.text),'a property with loans: "It and its '+wp+' loans leave Home…"');
  await click('aiAsstEditCancel');

  // ---- create with an archived name (#44) → Start fresh ----
  r=await run({action:'create_property',args:{name:'Maple Court Test'}});
  ok(r.card&&/already exists \(archived on/.test(r.text)&&/Restore it/.test(await page.evaluate(()=>[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove')].pop().textContent)),'an archived name: "'+r.text.slice(0,70)+'…" with Restore it');
  res=await click('aiAsstEditAlt'); await page.waitForTimeout(800);
  const SF=await page.evaluate((k)=>({ archived:window.LDS_isArchived(k), units:window.LDS_profileEffective(k,'residentialUnits'), listed:window.opProperties().some(p=>p.key===k) }),mk);
  ok(res&&res.ok&&SF.listed&&!SF.archived&&(SF.units==null||SF.units===''),'Start fresh → a new property without the old data (units '+SF.units+')');

  // ---- un-archive (#47/#92) — a property with loans, by its name ----
  const ww=await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.loans.length===1&&/Whitewater/.test(x.name)); await window.LDS_archiveProperty(p.key,true); return { key:p.key, name:p.name }; });
  r=await run({action:'unarchive_property',args:{name:ww.name}});
  ok(r.card&&new RegExp('Bring '+ww.name).test(r.text)&&!/name:/.test(r.text),'un-archive finds the archived property and shows its real name');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&!(await page.evaluate((k)=>window.LDS_isArchived(k),ww.key)),'approved → back');

  // ---- a loan's name (#233) ----
  const mz=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>/\(Mezz\)/.test(x.propertyName||'')&&!x.archived); return l?l.propertyName:''; });
  r=await run({action:'create_property',args:{name:mz}});
  ok(!r.card&&/mezz loan of/.test(r.msg)&&/nothing was created/.test(r.msg),'"'+mz+'" → "'+r.msg+'"');

  // ---- remove / restore a loan (#48) ----
  const ln=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.propertyName==='M Lofts'); return l?{id:l._id,name:l.propertyName}:null; });
  r=await run({action:'remove_loan',args:{name:ln.name}});
  ok(r.card&&/Archive loan M Lofts\?/.test(r.text)&&/restore it later/.test(r.text),'remove_loan shows "Archive loan M Lofts? … restore it later"');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  const L1=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return l?{archived:!!l.archived}:null; },ln.id);
  ok(res&&res.ok&&L1&&L1.archived,'approved → archived, not deleted');
  r=await run({action:'restore_loan',args:{name:ln.name}});
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&await page.evaluate((id)=>!window.LDS_loans().find(x=>x._id===id).archived,ln.id),'restore_loan brings it back');

  // ---- delete permanently (#52) ----
  r=await run({action:'delete_property_permanently',args:{name:'Maple Court Test'}});
  ok(!r.card&&/must be archived/.test(r.msg),'an active property can’t be deleted permanently');
  await page.evaluate((k)=>window.LDS_archiveProperty(k,true),mk); await page.waitForTimeout(300);
  r=await run({action:'delete_property_permanently',args:{name:'Maple Court Test'}});
  ok(r.card&&/for good/.test(r.text),'the card says plainly it is for good');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(800);
  ok(res&&res.ok&&await page.evaluate((k)=>!window.opProperties().some(p=>p.key===k)&&!window.LDS_archivedProps().includes(k),mk),'approved → gone');

  // ---- the Add Property form asks the same (#233/#44) ----
  const fk=await page.evaluate(async()=>{ const k=await window.LDS_addProperty('Form Fresh Test'); await window.LDS_archiveProperty(k,true); return k; });
  await page.waitForTimeout(300);
  await page.evaluate(()=>window.LDS_addProperty('Form Fresh Test')); await page.waitForTimeout(400);
  const M=await page.evaluate(()=>({ title:document.getElementById('confirmTitle').textContent, ok:document.getElementById('confirmOk').textContent, alt:document.getElementById('confirmAlt').hidden?'':document.getElementById('confirmAlt').textContent }));
  ok(/already exists \(archived on/.test(M.title)&&M.ok==='Restore it'&&M.alt==='Start fresh','the form asks: "'+M.title+'" — '+M.ok+' / '+M.alt);
  await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(600);
  ok(await page.evaluate((k)=>!window.LDS_isArchived(k),fk),'Restore it brings the archived property back');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assistant-action e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
