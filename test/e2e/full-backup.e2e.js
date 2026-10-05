/* e2e for 2.9.7 (#9, #70, #142–#144) — ONE complete backup.
   Back up → the file holds the loans, the settings, every property file and every chat (and NOT the
   Claude config). Change all of it → Restore from the file → everything comes back (after the window
   reloads). The Recent list then shows "Before a restore · <time>", and restoring THAT snapshot undoes
   the restore. A tampered backup (a file path outside the app's folders) is refused with nothing changed.
   The Save / Open dialogs are answered from the main process (the test points them at a temp file).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/full-backup.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-fullbk-'));
const BK=path.join(UDATA,'..',path.basename(UDATA)+'-backup.json');
const BAD=path.join(UDATA,'..',path.basename(UDATA)+'-tampered.json');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const errors=[];
  let page=await app.firstWindow(); page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const setDialogs=(f)=>app.evaluate(({dialog},f)=>{ dialog.showSaveDialog=async()=>({canceled:false,filePath:f}); dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]}); },f);
  const toastText=()=>page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');
  const dataMenu=async(act)=>{ await page.evaluate((a)=>{ const dd=document.getElementById('dataDD'); dd.open=true; dd.querySelector('[data-data="'+a+'"]').click(); },act); };
  const confirmOk=()=>page.evaluate(()=>document.getElementById('confirmOk').click());

  // ---- the "before" state: a property file, a chat, a target setting, a loan field ----
  const S=await page.evaluate(async()=>{
    const p=window.opProperties().find(x=>x.loans&&x.loans.length===1); const l=p.loans[0];
    const sv=await window.ldsShell.docSave({propKey:p.key,propName:p.name,name:'backup-note.txt',base64:btoa('keep me'),text:'keep me',type:'text/plain',role:'other'});
    const ch=await window.ldsShell.chatSave({scope:p.key,scopeName:p.name,title:'Backup chat',messages:[{role:'user',content:'remember this'}]});
    localStorage.setItem('lds.portfolioTargets',JSON.stringify({dscrMin:1.4,ltvMax:0.7,dyMin:0.09}));
    return {key:p.key,name:p.name,id:l._id,lender:l.lenderName||'',docId:sv&&sv.file&&sv.file.id,chatId:ch&&ch.conversation&&ch.conversation.id};
  });
  ok(!!S.docId&&!!S.chatId,'set up a property file and a chat on '+S.name);
  fs.writeFileSync(path.join(UDATA,'ai-config.json'),JSON.stringify({apiKey:'sk-test-should-not-be-backed-up'}));

  // ---- Back up to a file ----
  await setDialogs(BK);
  await dataMenu('backup');
  for(let t=0;t<40&&!fs.existsSync(BK);t++) await sleep(250);
  await page.waitForTimeout(500);
  const tb=await toastText();
  ok(/Backed up everything/.test(tb),'the toast says everything was backed up ("'+tb+'")');
  const heading=await page.evaluate(()=>document.getElementById('dataDD').textContent);
  ok(/all data/i.test(heading),'the Data menu heading says "all data"');
  let B=null; try{ B=JSON.parse(fs.readFileSync(BK,'utf8')); }catch(e){}
  ok(B&&B.format===2&&Array.isArray(B.loans)&&B.loans.length>0,'the backup is one full file (format 2) with '+(B&&B.loans.length)+' loans');
  const paths=(B&&B.files||[]).map(f=>f.path);
  const note=(B&&B.files||[]).find(f=>/^documents\//.test(f.path)&&Buffer.from(f.base64||'','base64').toString()==='keep me');
  ok(!!note,'the property file is inside the backup (its bytes, not a pointer)');
  ok(paths.some(p=>/^chats\/.+\.json$/.test(p)&&!/index\.json$/.test(p)),'the chat is inside the backup');
  ok(paths.some(p=>/^documents\/[0-9a-f]+\/index\.json$/.test(p)),'the property folder indexes are inside the backup');
  ok(B&&B.settings&&/1\.4/.test(B.settings['lds.portfolioTargets']||''),'the Home targets setting is inside the backup');
  ok(!fs.readFileSync(BK,'utf8').includes('sk-test-should-not-be-backed-up'),'the Claude config (API key) is NOT in the backup');

  // ---- change everything ----
  await page.evaluate(async(S)=>{ await window.ldsShell.docDelete(S.key,S.docId); await window.ldsShell.chatDelete({scope:S.key,id:S.chatId}); localStorage.setItem('lds.portfolioTargets',JSON.stringify({dscrMin:1.5,ltvMax:0.65,dyMin:0.1})); },S);
  await page.evaluate((id)=>{ const r=document.querySelector('tr[data-goto="'+id+'"]'); if(r) r.click(); },S.id); await page.waitForTimeout(400);
  await page.click('#loanRecEdit'); await page.waitForTimeout(300); await page.fill('#f_lenderName','Changed After Backup'); await page.click('#saveBtn'); await page.waitForTimeout(500);
  const gone=await page.evaluate(async(S)=>{ const l=await window.ldsShell.docList(S.key); return !(l.files||[]).some(f=>f.name==='backup-note.txt'); },S);
  ok(gone,'the property file was removed (to prove the restore brings it back)');

  // ---- Restore from the file ----
  await dataMenu('restore');
  await page.waitForFunction(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden'); },null,{timeout:8000});
  const ctext=await page.evaluate(()=>document.getElementById('confirmText').textContent);
  ok(/replaces everything/.test(ctext)&&/property folder/.test(ctext)&&/chat/.test(ctext),'the confirm says it replaces everything — loans, property folders and chats');
  await Promise.all([page.waitForEvent('load',{timeout:20000}).catch(()=>{}), confirmOk()]);
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(1200);
  const R=await page.evaluate(async(S)=>{ const l=await window.ldsShell.docList(S.key); const c=await window.ldsShell.chatList({scope:S.key});
    const loan=window.LDS_loans().find(x=>x._id===S.id);
    return { doc:(l.files||[]).some(f=>f.name==='backup-note.txt'), chat:(c.conversations||[]).some(x=>x.id===S.chatId), lender:loan&&loan.lenderName,
      tgt:JSON.parse(localStorage.getItem('lds.portfolioTargets')||'{}').dscrMin, toast:(document.getElementById('toastText')||{}).textContent||'' }; },S);
  ok(R.doc,'after the restore the property file is back');
  ok(R.chat,'after the restore the chat is back');
  ok(R.lender===S.lender,'after the restore the loan field is back ("'+R.lender+'")');
  ok(R.tgt===1.4,'after the restore the Home targets setting is back (DSCR '+R.tgt+')');
  ok(/Restored .*loan.*property folder.*chat/.test(R.toast),'the window says what came back ("'+R.toast+'")');

  // ---- #70: the Recent list shows why and when ----
  const recent=await page.evaluate(()=>new Promise(res=>{ const dd=document.getElementById('dataDD'); dd.open=true; dd.dispatchEvent(new Event('toggle'));
    setTimeout(()=>res([...document.querySelectorAll('#dataRecent [data-recent]')].map(b=>({name:b.getAttribute('data-recent'),t:b.innerText}))),1200); }));
  const pre=recent.find(r=>/Before a restore/.test(r.t));
  ok(!!pre&&/Before a restore · [A-Z][a-z]{2} \d{1,2}, \d\d:\d\d/.test(pre.t.replace(/\s+/g,' ')),'Recent shows "Before a restore · <Mon d, hh:mm>" ('+(pre?pre.t.replace(/\s+/g,' '):recent.map(r=>r.t).join(' | '))+')');
  ok(recent.every(r=>!/^\s*auto\s*$/i.test(r.t)),'no entry is just "auto" — each says why');

  // ---- restore THAT snapshot → back to the changed state (the restore can be undone) ----
  await page.evaluate((n)=>{ const b=document.querySelector('#dataRecent [data-recent="'+n+'"]'); b.click(); },pre.name);
  await page.waitForFunction(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden'); },null,{timeout:8000});
  await Promise.all([page.waitForEvent('load',{timeout:20000}).catch(()=>{}), confirmOk()]);
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(1200);
  const U=await page.evaluate(async(S)=>{ const l=await window.ldsShell.docList(S.key); const loan=window.LDS_loans().find(x=>x._id===S.id);
    return { doc:(l.files||[]).some(f=>f.name==='backup-note.txt'), lender:loan&&loan.lenderName, tgt:JSON.parse(localStorage.getItem('lds.portfolioTargets')||'{}').dscrMin }; },S);
  ok(!U.doc&&U.lender==='Changed After Backup'&&U.tgt===1.5,'restoring the "Before a restore" snapshot undoes the restore (file gone, lender "'+U.lender+'", DSCR '+U.tgt+')');

  // ---- a tampered backup (path outside the app's folders) is refused, nothing changes ----
  const T=JSON.parse(fs.readFileSync(BK,'utf8')); T.files.push({path:'documents/../../evil.txt',size:4,sha1:'',base64:Buffer.from('evil').toString('base64')});
  fs.writeFileSync(BAD,JSON.stringify(T));
  await setDialogs(BAD);
  await dataMenu('restore'); await page.waitForTimeout(1200);
  const tt=await toastText();
  const modalOpen=await page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden'); });
  ok(!modalOpen&&/outside the app/.test(tt),'a backup with a file outside the app\'s folders is refused ("'+tt+'")');
  ok(!fs.existsSync(path.join(UDATA,'..','evil.txt'))&&!fs.existsSync(path.join(UDATA,'evil.txt')),'nothing was written outside the app\'s folders');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{ fs.rmSync(UDATA,{recursive:true,force:true}); fs.rmSync(BK,{force:true}); fs.rmSync(BAD,{force:true}); }catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all full-backup e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
