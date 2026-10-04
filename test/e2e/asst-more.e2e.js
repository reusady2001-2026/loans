/* e2e for 2.9.7 — the rest of what a user can do, through the assistant (#52), and "open …" (#50).
   #50/#88/#89  open actions bring their tab to the front (only when asked)
   #52          delete a loan permanently (archived only, "for good"), remove a document / change its type, pin an
                Underwriting line, back up now, list backups, recompute all — each behind an Approve card
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-more.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asstmore-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const run=(o)=>page.evaluate((o)=>{ const r=window.LDS_asstAction(o); return Promise.resolve(r).then(x=>{ window.__r=x; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop();
    return { ok:x&&x.ok, msg:x&&x.msg, data:x&&x.data, card:!!(x&&x.pending), text:(x&&x.pending&&c)?c.textContent:'' }; }); },o);
  const click=async(cls)=>{ await page.evaluate((cls)=>{ const b=[...document.querySelectorAll('#aiAsstLog .'+cls+':not(:disabled)')].pop(); if(b) b.click(); },cls);
    return page.evaluate(()=>window.__r&&window.__r.pending?window.__r.pending:null); };

  // ---- #50: open brings the tab to the front ----
  await page.evaluate(()=>window.LDS_asstAction({action:'open_calendar',args:{}})); await page.waitForTimeout(500);
  ok(await page.evaluate(()=>!document.getElementById('calendarPanel').hidden),'open_calendar shows the calendar');
  let r=await run({action:'open_loan',args:{name:'M Lofts'}}); await page.waitForTimeout(500);
  ok(r.ok&&await page.evaluate(()=>!document.getElementById('homePanel').hidden&&!document.getElementById('loanView').hidden),'open_loan from the calendar brings the loan page to the front');
  r=await run({action:'open_loan',args:{name:'Avalon White Plains'}}); await page.waitForTimeout(400);
  ok(r.ok,'open_loan by a property name works ('+r.msg+')');

  // ---- #52: delete a loan permanently ----
  r=await run({action:'delete_loan_permanently',args:{name:'M Lofts'}});
  ok(!r.card&&/archive it first/.test(r.msg),'an active loan can’t be deleted permanently');
  await run({action:'remove_loan',args:{name:'M Lofts'}}); await click('aiAsstEditApprove'); await page.waitForTimeout(300);
  r=await run({action:'delete_loan_permanently',args:{name:'M Lofts'}});
  ok(r.card&&/for good/.test(r.text),'archived → a "for good" card');
  let res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&await page.evaluate(()=>!window.LDS_loans().some(l=>l.propertyName==='M Lofts')),'approved → the loan record is gone');
  ok(await page.evaluate(()=>window.opProperties().some(p=>p.name==='M Lofts')),'…and the property stays');

  // ---- #52: documents ----
  const K=await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.name==='Avalon White Plains'); await window.ldsShell.docSave({propKey:p.key,propName:p.name,name:'side-letter.txt',base64:btoa('a side letter'),text:'a side letter',type:'text/plain',role:'other'}); return p.key; });
  r=await run({action:'set_document_type',args:{name:'Avalon White Plains',file:'side-letter',type:'Loan agreement'}});
  ok(r.card&&/side-letter\.txt/.test(r.text)&&/Loan agreement/i.test(r.text),'change a document’s type: card with old → new');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  const role=await page.evaluate(async(k)=>{ const d=await window.ldsShell.docList(k); const f=(d.files||[]).find(x=>x.name==='side-letter.txt'); return f&&f.role; },K);
  ok(res&&res.ok&&role&&role!=='other','approved → its type changed ('+role+')');
  r=await run({action:'remove_document',args:{name:'Avalon White Plains',file:'side-letter.txt'}});
  ok(r.card&&/automatic backups keep a copy/.test(r.text),'remove a document: a card first');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&await page.evaluate(async(k)=>!((await window.ldsShell.docList(k)).files||[]).some(x=>x.name==='side-letter.txt'),K),'approved → removed');

  // ---- #52: pin an Underwriting line ----
  r=await run({action:'pin_underwriting_line',args:{name:'Avalon White Plains',line:'Insurance',value:123456}});
  ok(r.card&&/Insurance/.test(r.text)&&/123,456/.test(r.text),'pin a line: card with the figure');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(800);
  r=await run({action:'read_property',args:{name:'Avalon White Plains'}});
  ok(res&&res.ok&&r.data&&r.data.assumptions.lineOverrides&&r.data.assumptions.lineOverrides.INS&&r.data.assumptions.lineOverrides.INS.value===123456,'approved → pinned in the property’s assumptions');

  // ---- #52: backups and recompute ----
  r=await run({action:'backup_now',args:{}});
  ok(r.card,'back up now: a card');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(800);
  r=await run({action:'list_backups',args:{}});
  ok(res&&res.ok&&r.ok&&Array.isArray(r.data)&&r.data.length>=1,'the backup is listed ('+(r.data||[]).length+')');
  r=await run({action:'restore_backup',args:{backup:(r.data[0]||{}).name}});
  ok(r.card&&/replaced for good/.test(r.text)&&/restarts/.test(r.text),'restore: the card says plainly what is replaced');
  await click('aiAsstEditCancel');
  r=await run({action:'recompute_all',args:{}});
  ok(r.card&&/Recompute every property/.test(r.text),'recompute all: a card');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(3000);
  ok(res&&res.ok&&/Recomputed/.test(res.msg),'approved → "'+(res&&res.msg)+'"');

  // every action Claude is told about exists, and every action exists in what Claude is told
  const AN=await page.evaluate(()=>{ const names=window.LDS_asstActionNames(), sys=window.LDS_asstSystem(); const told=[...new Set((sys.match(/\b[a-z]+(?:_[a-z]+)+(?= \{)/g)||[]))];
    return { missing: told.filter(n=>!names.includes(n)), untold: names.filter(n=>sys.indexOf(n)<0) }; });
  ok(AN.missing.length===0,'every action in Claude’s instructions exists'+(AN.missing.length?' (missing: '+AN.missing.join(', ')+')':''));
  ok(AN.untold.length===0,'every action is in Claude’s instructions'+(AN.untold.length?' (not told: '+AN.untold.join(', ')+')':''));

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assistant-more e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
