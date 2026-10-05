/* e2e for 2.9.7 — one name per property, and the property's details.
   #36/#211 a new "Property name" / "Address" in the profile changes it on all the property's loans
   #216/#40 the rename moves the property's documents AND chats; onto a name that already has files it asks first
   #211     units / sq ft whole numbers ≥ 0, year built 1800 – this year (anything else isn't saved)
   #84/#86  the details redraw after every save ("last changed by" shows at once)
   #85      "history (N)" on each property detail: old → new, who, where from
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/property-rename.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-ren-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const setPf=async(fk,v)=>{ await page.evaluate(({fk,v})=>{ const i=document.querySelector('#loanProfilePanel [data-pf="'+fk+'"], #propProfilePanel [data-pf="'+fk+'"]'); i.value=v; i.dispatchEvent(new Event('change',{bubbles:true})); },{fk,v}); await page.waitForTimeout(900); };
  const modal=()=>page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden')?document.getElementById('confirmText').textContent:''; });

  // ---- a single-loan property with a document and a chat ----
  const S=await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.loans&&x.loans.length===1&&x.loans[0].propertyName==='M Lofts');
    await window.ldsShell.docSave({propKey:p.key,propName:p.name,name:'lease-abstract.txt',base64:btoa('M Lofts lease abstract'),text:'M Lofts lease abstract',type:'text/plain',role:'other'});
    const ch=await window.ldsShell.chatSave({scope:p.key,scopeName:p.name,title:'About M Lofts',messages:[{role:'user',content:'hi'}]});
    return { key:p.key, id:p.loans[0]._id, chat:ch.conversation.id }; });
  await page.evaluate((k)=>window.LDS_openProfile(k),S.key); await page.waitForTimeout(800);
  await setPf('propertyName','Middlesex Lofts');
  const R=await page.evaluate(async(S)=>{ const l=window.LDS_loans().find(x=>x._id===S.id); const k2=window.propertyKey(l);
    const d2=await window.ldsShell.docList(k2), d1=await window.ldsShell.docList(S.key), c2=await window.ldsShell.chatList({scope:k2}), c1=await window.ldsShell.chatList({scope:S.key});
    return { name:l.propertyName, k2, docNew:(d2.files||[]).some(f=>f.name==='lease-abstract.txt'), docOld:(d1.files||[]).length, chatNew:(c2.conversations||[]).some(c=>c.id===S.chat), chatOld:(c1.conversations||[]).length,
      hist:(l._history||[]).filter(h=>h.field==='propertyName').map(h=>h.old+'→'+h.new), dd:[...document.querySelectorAll('#loanSelect option')].map(o=>o.textContent).filter(t=>/Lofts/.test(t)) }; },S);
  ok(R.name==='Middlesex Lofts','the profile\'s new name is the loan\'s name ("'+R.name+'")');
  ok(R.docNew&&R.docOld===0,'the property\'s document moved to the new name (old folder empty)');
  ok(R.chatNew&&R.chatOld===0,'its chat moved with it (#40)');
  ok(R.hist.length===1&&/M Lofts→Middlesex Lofts/.test(R.hist[0]),'the loan\'s history records the rename ('+R.hist.join(', ')+')');
  ok(R.dd.some(t=>/Middlesex Lofts/.test(t))&&!R.dd.some(t=>/^M Lofts/.test(t)),'the dropdown shows the new name');

  // ---- senior + mezz: one rename changes both; one address changes both ----
  const A=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.name==='Avalon White Plains'); return { key:p.key, ids:p.loans.map(l=>l._id) }; });
  await page.evaluate((k)=>window.LDS_openProfile(k),A.key); await page.waitForTimeout(800);
  await setPf('propertyName','Avalon Westchester');
  await page.evaluate(()=>window.LDS_openProfile(window.opProperties().find(x=>x.name==='Avalon Westchester').key)); await page.waitForTimeout(800);
  await setPf('address','1 Avalon Way, White Plains, NY 10601');
  const AV=await page.evaluate((ids)=>{ const L=window.LDS_loans().filter(l=>ids.includes(l._id)); return { names:L.map(l=>l.propertyName).sort(), addrs:[...new Set(L.map(l=>l.propertyAddress))], keys:[...new Set(L.map(l=>window.propertyKey(l)))] }; },A.ids);
  ok(AV.names.join('|')==='Avalon Westchester|Avalon Westchester (Mezz)','the senior and the mezz both take the new name ('+AV.names.join(' / ')+')');
  ok(AV.addrs.length===1&&AV.addrs[0]==='1 Avalon Way, White Plains, NY 10601'&&AV.keys.length===1,'one address on both loans; still one property');

  // ---- onto a name that already has files: asked first, then put together ----
  await page.evaluate(async()=>{ const k=await window.LDS_addProperty('Target Place'); await window.ldsShell.docSave({propKey:k,propName:'Target Place',name:'target-note.txt',base64:btoa('t'),text:'t',type:'text/plain',role:'other'}); });
  await page.waitForTimeout(400);
  const midKey=await page.evaluate(()=>window.opProperties().find(x=>x.name==='Middlesex Lofts').key);
  await page.evaluate((k)=>window.LDS_openProfile(k),midKey); await page.waitForTimeout(800);
  await page.evaluate(()=>{ const i=document.querySelector('#loanProfilePanel [data-pf="propertyName"]'); i.value='Target Place'; i.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(800);
  const ask=await modal();
  ok(/already has 1 document/.test(ask)&&/Put them together/.test(await page.evaluate(()=>document.getElementById('confirmOk').textContent)),'renaming onto a name with files asks first ("'+ask.slice(0,90)+'…")');
  await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(1200);
  const M=await page.evaluate(async()=>{ const k=window.propertyKey(window.LDS_loans().find(l=>l.propertyName==='Target Place')||{}); const d=await window.ldsShell.docList(k); return (d.files||[]).map(f=>f.name).sort(); });
  ok(M.includes('lease-abstract.txt')&&M.includes('target-note.txt'),'"Put them together" keeps both properties\' documents ('+M.filter(n=>/\.txt$/.test(n)).join(', ')+')');

  // ---- number checks + redraw + history ----
  const tk=await page.evaluate(()=>window.opProperties().find(x=>x.name==='Target Place').key);
  await page.evaluate((k)=>window.LDS_openProfile(k),tk); await page.waitForTimeout(800);
  await setPf('residentialUnits','-3');
  const t1=await page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');
  ok(/whole number/.test(t1)&&await page.evaluate((k)=>window.LDS_profileEffective(k,'residentialUnits')!==-3,tk),'units "-3" is refused: "'+t1+'"');
  await setPf('yearBuilt','1700');
  ok(/between 1800 and/.test(await page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'')),'year built 1700 is refused');
  await setPf('residentialUnits','120'); await setPf('residentialUnits','130');
  const P=await page.evaluate(()=>{ const panel=document.querySelector('#loanProfilePanel'); const lab=[...panel.querySelectorAll('[data-pfhist="residentialUnits"]')].map(b=>b.textContent); return { open:!!panel.querySelector('details[open]'), stamp:/last changed by/.test(panel.innerText), link:lab[0]||'' }; });
  ok(P.open&&P.stamp,'the details redraw at once (still open, "last changed by" shown)');
  ok(/history \(2\)/.test(P.link),'units show "history (2)" ("'+P.link+'")');
  await page.evaluate(()=>document.querySelector('#loanProfilePanel [data-pfhist="residentialUnits"]').click()); await page.waitForTimeout(300);
  const hm=await page.evaluate(()=>{ const m=document.getElementById('historyModal'); return m&&!m.classList.contains('hidden')?m.innerText:''; });
  ok(/120/.test(hm)&&/130/.test(hm)&&/typed/.test(hm),'the history lists 120 → 130, typed');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all property-rename e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
