/* e2e for 2.9.8 (problem 1), as 2.9.9 (fix 2) does it — one T12 workbook with a sheet per property.
   2.9.9: the workbook never goes anywhere by itself — the card lists every sheet with a property list (the sheets that
   name a property are set to it, the property you're on is set when the app can tell, "Add as a new property" is
   never set) and nothing is saved until you approve.
   Dropped on a property's Documents, the file goes to EVERY property it names, each with its own sheet, and each
   property's NOI comes from its own sheet (Home, Underwriting); a sheet that fits no property is said. Uploading
   the same file again on a property it doesn't name is never blocked: the app asks which sheet is that property's
   (or keeps it as a document). The assistant can save an attached file to properties and copy / move a saved
   document between properties, each behind an Approve card.
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/multi-sheet-t12.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-multit12-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const REPLIES=path.join(UDATA,'replies.json'), CALLS=path.join(UDATA,'chat-calls.jsonl');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const act=(o)=>'```action\n'+JSON.stringify(o)+'\n```';
const script=(list)=>fs.writeFileSync(REPLIES,JSON.stringify(list));
const M=["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026","Sep 2026","Oct 2026","Nov 2026","Dec 2026"];
const rowOf=(l,v)=>[l,...Array(12).fill(v),v*12];
const sheet=(name,rent,tax)=>XLSX.utils.aoa_to_sheet([[name],["Trailing 12 Month Statement"],["Account",...M,"Total"],["INCOME"],rowOf("Gross Potential Rent",rent),rowOf("TOTAL INCOME",rent),["EXPENSES"],rowOf("Real Estate Taxes",tax),rowOf("TOTAL EXPENSES",tax),rowOf("NET OPERATING INCOME",rent-tax)]);
const BOOK=path.join(UDATA,'Portfolio T12s.xlsx');
{ const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,sheet("Queens Gate Apartments",300000,50000),"Queens Gate");
  XLSX.utils.book_append_sheet(wb,sheet("1222 Commerce St",100000,20000),"Commerce");
  XLSX.utils.book_append_sheet(wb,sheet("Nowhere Plaza",1000,100),"Nowhere");
  fs.writeFileSync(BOOK,XLSX.write(wb,{type:'buffer',bookType:'xlsx'})); }
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||20000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(400); } return false; };

(async()=>{
  script([]);
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CHAT_FILE:REPLIES,LDS_FAKE_CHAT_LOG:CALLS,LDS_FAKE_T12:'agree'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(1500);
  const P=await page.evaluate(()=>{ const f=(re)=>{ const p=window.opProperties().find(x=>re.test(x.name)); return {key:p.key,name:p.name}; }; return { qg:f(/queens gate/i), cm:f(/1222 commerce/i), ww:f(/villages of whitewater/i), ml:f(/m lofts/i) }; });
  const files=(k)=>page.evaluate(async(k)=>{ const d=await window.ldsShell.docList(k); return (d.files||[]).filter(f=>/Portfolio T12s|note\.txt/.test(f.name)).map(f=>({name:f.name,role:f.role,sheet:f.sheet||''})); },k);
  const noiOf=(re)=>page.evaluate((re)=>{ const l=window.LDS_loans().find(x=>new RegExp(re,'i').test(x.propertyName)&&!x.archived); return window.LDS_loanNOI(l); },re);

  // ---- dropped on Queens Gate's Documents: it goes to every property it names ----
  await page.evaluate((k)=>window.LDS_openProfile(k),P.qg.key);
  await until(page,()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&!!document.getElementById('loanDocsFile'); });
  await page.setInputFiles('#loanDocsFile',BOOK);
  ok(await until(page,()=>!!document.querySelector('[data-partsmodal]')),'dropping it shows the card: which sheet is whose');
  const k1=await page.evaluate(()=>{ const m=document.querySelector('[data-partsmodal]'); return { sel:[...m.querySelectorAll('[data-partsel]')].map(s=>s.value), tick:[...m.querySelectorAll('[data-partuse]')].map(c=>c.checked) }; });
  ok(k1.sel[0]===P.qg.key&&k1.tick[0]&&k1.sel[1]===P.cm.key&&k1.tick[1]&&k1.sel[2]===''&&!k1.tick[2],'Queens Gate and 1222 Commerce St are set on their own sheets; “Nowhere” is set to nothing ('+k1.sel.join(' | ')+')');
  await page.evaluate(()=>document.querySelector('[data-partsmodal] [data-partsok]').click());
  ok(await until(page,async(k)=>{ const d=await window.ldsShell.docList(k); return (d.files||[]).some(f=>f.name==='Portfolio T12s.xlsx'); },P.cm.key),'the file reached 1222 Commerce St too (it was dropped on Queens Gate)');
  const fq=await files(P.qg.key), fc=await files(P.cm.key);
  ok(fq.length===1&&fq[0].role==='t12'&&fq[0].sheet==='Queens Gate','Queens Gate: saved as its T12, sheet “Queens Gate” ('+JSON.stringify(fq)+')');
  ok(fc.length===1&&fc[0].role==='t12'&&fc[0].sheet==='Commerce','1222 Commerce St: saved as its T12, sheet “Commerce” ('+JSON.stringify(fc)+')');
  await until(page,()=>/Linked/.test((document.getElementById('toastText')||{}).textContent||''),null,15000);   // the message comes once every folder is saved
  const toast1=await page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');
  ok(/Linked “Portfolio T12s\.xlsx”: /.test(toast1)&&/Queens Gate Apartments ← Sheet 1 of 3/.test(toast1)&&/1222 Commerce St ← Sheet 2 of 3/.test(toast1),'the message says which sheet went where ("'+toast1.slice(0,200)+'")');
  ok(await until(page,(re)=>{ const l=window.LDS_loans().find(x=>new RegExp(re,'i').test(x.propertyName)&&!x.archived); return Math.abs((window.LDS_loanNOI(l)||0)-3000000)<1; },'queens gate',30000),'Queens Gate\'s NOI comes from its own sheet: $3,000,000 (got '+(await noiOf('queens gate'))+')');
  ok(await until(page,(re)=>{ const l=window.LDS_loans().find(x=>new RegExp(re,'i').test(x.propertyName)&&!x.archived); return Math.abs((window.LDS_loanNOI(l)||0)-960000)<1; },'1222 commerce',30000),'1222 Commerce St\'s NOI comes from ITS sheet: $960,000 (got '+(await noiOf('1222 commerce'))+')');

  // ---- the same file again, on a property it doesn't name: never blocked, the app asks which sheet ----
  await page.evaluate((k)=>window.LDS_openProfile(k),P.ww.key);
  await until(page,()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&!!document.getElementById('loanDocsFile'); });
  await page.setInputFiles('#loanDocsFile',BOOK);
  ok(await until(page,()=>!!document.querySelector('[data-partsmodal]')),'uploading it on Villages of Whitewater shows the card again');
  const k2=await page.evaluate(()=>{ const m=document.querySelector('[data-partsmodal]'); return { text:m.innerText, sel:[...m.querySelectorAll('[data-partsel]')].map(s=>s.value) }; });
  ok(/Which part is Villages of Whitewater’s\?/.test(k2.text)&&!k2.sel.includes(P.ww.key)&&k2.sel[0]===P.qg.key&&k2.sel[1]===P.cm.key,'…it asks which sheet is Villages of Whitewater’s (nothing set for it); the others keep their answers');
  await page.evaluate((k)=>{ const s=document.querySelector('[data-partsmodal] [data-partsel="3"]'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-partsmodal] [data-partsok]').click(); },P.ww.key);
  ok(await until(page,async(k)=>{ const d=await window.ldsShell.docList(k); return (d.files||[]).some(f=>f.name==='Portfolio T12s.xlsx'&&f.role==='t12'&&f.sheet==='Nowhere'); },P.ww.key),'Villages of Whitewater got it as its T12 with the sheet you picked — the same file elsewhere did not block it');
  ok((await files(P.qg.key)).length===1&&(await files(P.cm.key)).length===1,'the properties that already had it keep one copy each');

  // ---- Underwriting reads each property's own sheet ----
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},P.cm.key);
  await until(page,()=>{ const e=document.getElementById('uwNoiUsed'); return !!(e&&e.textContent); },null,20000);   // the property's figures load in the background
  const used=await page.evaluate(()=>{ const e=document.getElementById('uwNoiUsed'); return e?e.textContent:''; });
  ok(/960,000/.test(used),'Underwriting on 1222 Commerce St uses its sheet: NOI used '+used);

  // ---- the assistant: save an attached file, copy and move a saved document ----
  await page.evaluate(()=>document.getElementById('aiAsstFab').click());
  await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{});
  await page.evaluate(()=>{ const s=document.getElementById('aiAsstProp'); s.value=''; s.dispatchEvent(new Event('change',{bubbles:true})); });
  const NOTE=path.join(UDATA,'note.txt'); fs.writeFileSync(NOTE,'Inspection note for the files.');
  await page.setInputFiles('#aiAsstFile',NOTE); await page.waitForTimeout(800);
  const idle=()=>page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:20000}).catch(()=>{});
  const approve=async()=>{ await page.waitForFunction(()=>document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)').length>=1,null,{timeout:15000}).catch(()=>{}); const card=await page.evaluate(()=>{ const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); return c?c.innerText:''; }); await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop(); if(b) b.click(); }); await idle(); await page.waitForTimeout(1200); return card; };
  script([ 'I’ll save it to M Lofts.\n'+act({action:'save_attachment',args:{file:'note.txt',names:['M Lofts']}}), 'Done.' ]);
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='Save this note to M Lofts'; document.getElementById('aiAsstSend').click(); });
  const c1=await approve();
  ok(/Save .*note\.txt.* to 1 property/i.test(c1.replace(/\s+/g,' '))&&/M Lofts/.test(c1),'save_attachment shows an Approve card ("'+c1.replace(/\s+/g,' ').slice(0,90)+'")');
  ok((await files(P.ml.key)).some(f=>f.name==='note.txt'),'…and after Approve, M Lofts has note.txt');
  script([ 'Copying.\n'+act({action:'copy_document',args:{file:'Portfolio T12s.xlsx',from:'Queens Gate Apartments',to:['M Lofts']}}), 'Done.' ]);
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='Copy the portfolio T12 file from Queens Gate to M Lofts'; document.getElementById('aiAsstSend').click(); });
  const c2=await approve();
  ok(/Copy .*Portfolio T12s\.xlsx.* from Queens Gate Apartments/i.test(c2.replace(/\s+/g,' '))&&/Which part is M Lofts’s\?/.test(c2),'copy_document shows the parts card — it asks which sheet is M Lofts’s (none is set)');
  ok((await files(P.ml.key)).some(f=>f.name==='Portfolio T12s.xlsx'&&f.role==='other'),'…M Lofts has the copy, as a document — its NOI isn\'t touched');
  script([ 'Moving.\n'+act({action:'move_document',args:{file:'note.txt',from:'M Lofts',to:'Villages of Whitewater'}}), 'Done.' ]);
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='Move the note from M Lofts to Whitewater'; document.getElementById('aiAsstSend').click(); });
  const c3=await approve();
  ok(/Move .*note\.txt/i.test(c3.replace(/\s+/g,' ')),'move_document shows an Approve card');
  ok((await files(P.ww.key)).some(f=>f.name==='note.txt')&&!(await files(P.ml.key)).some(f=>f.name==='note.txt'),'…the note is now in Villages of Whitewater and gone from M Lofts');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all multi-sheet T12 e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
