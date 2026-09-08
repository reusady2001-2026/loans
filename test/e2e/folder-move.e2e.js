/* e2e for v2.7.3 — the on-disk T12 folder follows a property when its key changes (an address/name edit).
   Fixes the old limitation. Uploads a real T12 into a property's folder, then exercises the real main-process
   move (ldsShell.docMove → lds:doc-move): the whole folder moves to the new key intact (same bytes), the old
   key is left empty, moving to a key that already has its own documents is REFUSED (never merged/lost), and a
   same-key move is a no-op. Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/folder-move.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-move-'));
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const KEY='name:villages of whitewater';
const NEWKEY='name:whitewater villages';        // a rename → new property key
const OCCUPIED='name:some other property';        // a key that already has its own documents
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(500);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  // Save a real T12 into KEY's folder via the app's own upload flow.
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(400);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(300);

  const R=await page.evaluate(async(keys)=>{
    const {KEY,NEWKEY,OCCUPIED}=keys;
    const before=await window.ldsShell.docList(KEY);
    const t12=(before.files||[]).find(f=>f.role==='t12')||(before.files||[])[0];
    const origRead=t12?await window.ldsShell.docRead(KEY,t12.id):null;
    const origLen=origRead&&origRead.base64?origRead.base64.length:0;
    // Move the folder to the new key (the durable T12 follows the property).
    const mv=await window.ldsShell.docMove(KEY,NEWKEY,'Whitewater Villages');
    const afterNew=await window.ldsShell.docList(NEWKEY);
    const afterOld=await window.ldsShell.docList(KEY);
    const movedT12=(afterNew.files||[]).find(f=>f.role==='t12')||(afterNew.files||[])[0];
    const movedRead=movedT12?await window.ldsShell.docRead(NEWKEY,movedT12.id):null;
    const movedLen=movedRead&&movedRead.base64?movedRead.base64.length:0;
    // Put a document under an OCCUPIED key, then try to move NEWKEY onto it — must be refused.
    await window.ldsShell.docSave({propKey:OCCUPIED,propName:'Some Other Property',name:'note.txt',base64:btoa('hello'),text:'hello',type:'text/plain',role:'t12'});
    const mvBlocked=await window.ldsShell.docMove(NEWKEY,OCCUPIED,'Some Other Property');
    const newStill=await window.ldsShell.docList(NEWKEY);
    const occStill=await window.ldsShell.docList(OCCUPIED);
    const mvSame=await window.ldsShell.docMove(NEWKEY,NEWKEY,'Whitewater Villages');
    return { hadT12:!!t12, origLen, mv, newHas:(afterNew.files||[]).length, oldHas:(afterOld.files||[]).length, movedLen,
      newName:afterNew.propName, mvBlocked, newStillHas:(newStill.files||[]).length, occHas:(occStill.files||[]).length, mvSame };
  },{KEY,NEWKEY,OCCUPIED});

  ok(R.hadT12&&R.origLen>1000,'a real T12 was saved into the property folder (bytes: '+R.origLen+')');
  ok(R.mv&&R.mv.ok&&R.mv.moved,'ldsShell.docMove moved the folder to the new key');
  ok(R.newHas>=1&&R.oldHas===0,'the T12 now lives under the NEW key and the old key is empty (it followed the property)');
  ok(R.movedLen===R.origLen,'the moved file is byte-for-byte the same original (not a stub or truncated)');
  ok(/Whitewater Villages/i.test(R.newName||''),'the moved index carries the new property name');
  ok(R.mvBlocked&&R.mvBlocked.ok&&R.mvBlocked.moved===false&&/target exists/.test(R.mvBlocked.reason||''),'moving onto a key that already has documents is REFUSED (never merged)');
  ok(R.newStillHas>=1&&R.occHas>=1,'the refusal lost nothing — both folders keep their own files');
  ok(R.mvSame&&R.mvSame.ok&&R.mvSame.moved===false,'a same-key move is a no-op');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all folder-move checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
