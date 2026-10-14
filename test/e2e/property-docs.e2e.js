/* e2e for 2.9.7 — a property's documents, routing, permanent delete, reset months, pop-out.
   #37  a type for uploads and on every file (changeable)      #38  the app's own records are not listed
   #212 a same-named, different file is kept as "… (2)"         #213 every removal asks; a removed T12 takes its NOI with it
   #39  a document naming one property is filed there; #214 naming two → "Which property is this for?"
   #206-208 permanent delete: archived only, the confirm lists what goes, files first
   #221 a hybrid with a fixed payment still has its reset month marked
   #43  Data Health pops out into its own window and docks back
   #216 Data Health lists files left without a property; they can be attached
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/property-docs.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-pdocs-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const toastText=()=>page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');
  const modal=()=>page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden')?document.getElementById('confirmText').textContent:''; });
  const P=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans&&x.loans.length===1&&x.loans[0].propertyName==='Queens Gate Apartments'); return { key:p.key, id:p.loans[0]._id }; });
  const open=async(id)=>{ await page.evaluate((id)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },id); await page.waitForTimeout(700); };

  // ---- #212: same name, different content → kept as a copy ----
  const two=await page.evaluate(async(k)=>{ const a=await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'Loan Agreement.txt',base64:btoa('first'),text:'first',type:'text/plain',role:'agreement'});
    const b=await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'Loan Agreement.txt',base64:btoa('second'),text:'second',type:'text/plain',role:'agreement'});
    const l=await window.ldsShell.docList(k); return { renamed:b.renamed, names:(l.files||[]).map(f=>f.name) }; },P.key);
  ok(two.renamed==='Loan Agreement (2).txt'&&two.names.includes('Loan Agreement.txt')&&two.names.includes('Loan Agreement (2).txt'),'a second, different "Loan Agreement.txt" is kept as "Loan Agreement (2).txt"');
  // ---- #37/#38 the panel ----
  await page.evaluate(async(k)=>{ await window.LDS_ensureProfile(k); await window.LDS_setProfileField(k,'manager','Living'); },P.key);   // writes profile.json into the folder
  await open(P.id);
  const D=await page.evaluate(()=>{ const h=document.getElementById('loanDocsPanel'); return { text:h.innerText, types:[...h.querySelectorAll('[data-doctype]')].map(s=>s.value), upload:[...h.querySelectorAll('#loanDocsType option')].map(o=>o.textContent) }; });
  ok(!/profile\.json/.test(D.text),'profile.json is not listed (#38)');
  ok(D.types.length===2&&D.types.every(t=>t==='agreement')&&D.upload.includes('Loan agreement')&&D.upload.includes('Detect automatically'),'each file shows its type and uploads can be typed (#37)');
  await page.evaluate(()=>{ const s=document.querySelectorAll('#loanDocsPanel [data-doctype]')[1]; s.value='other'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(700);
  ok(await page.evaluate(async(k)=>(await window.ldsShell.docList(k)).files.filter(f=>/Loan Agreement/.test(f.name)).map(f=>f.role).sort().join(),P.key)==='agreement,other','a file\'s type can be changed after upload');
  // ---- #213 removal asks ----
  await page.evaluate(()=>document.querySelector('#loanDocsPanel [data-docdel]').click()); await page.waitForTimeout(300);
  ok(/deleted from .*folder/.test(await modal()),'removing a document asks first');
  await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(700);
  ok(await page.evaluate(async(k)=>(await window.ldsShell.docList(k)).files.filter(f=>/Loan Agreement/.test(f.name)).length,P.key)===1,'…and then removes it');
  // ---- #213 a removed T12 takes its NOI with it ----
  await page.evaluate((k)=>window.LDS_openSizing(k),P.key);
  await page.waitForFunction(()=>!!document.getElementById('uwFile'),null,{timeout:15000});
  await page.setInputFiles('#uwFile',path.join(APP,'test','fixtures','sample-t12.xlsx'));
  await page.waitForFunction((k)=>{ const g=window.LDS_gdNOICache()[k]; return g&&g.inPlace>0; },P.key,{timeout:20000}).catch(()=>{});
  const noi1=await page.evaluate((k)=>(window.LDS_gdNOICache()[k]||{}).inPlace,P.key);
  await page.evaluate(()=>{ const t=document.querySelector('[data-tabsel="home"]'); if(t) t.click(); }); await open(P.id);
  await page.evaluate(()=>{ const row=[...document.querySelectorAll('#loanDocsPanel [data-docrow]')].find(r=>/sample-t12/.test(r.innerText)); row.querySelector('[data-docdel]').click(); });
  await page.waitForTimeout(400);
  const tm=await modal();
  ok(/It is the T12 in use: its NOI \(\$671,28[78]/.test(tm)&&/Home, DSCR and the refinance/.test(tm),'removing the T12 in use says its NOI goes ("'+tm.slice(0,140)+'…")');
  await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(2500);
  const after=await page.evaluate((k)=>window.LDS_gdNOICache()[k],P.key);
  ok(noi1>0&&(after==null||after.inPlace==null),'its NOI is gone ('+noi1+' → '+JSON.stringify(after)+')');

  // ---- #39 / #214 routing by the text inside ----
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lds-route-'));
  const one=path.join(tmp,'memo.txt'); fs.writeFileSync(one,'Insurance renewal for Heritage Key Villas, effective next month.');
  const both=path.join(tmp,'portfolio-memo.txt'); fs.writeFileSync(both,'Notes covering Heritage Key Villas and Creekside at Grand Prairie.');
  await page.setInputFiles('#loanDocsFile',one); for(let i=0;i<20&&!/memo\.txt/.test(await toastText());i++) await page.waitForTimeout(400);   // waits for the save message
  const tr=await toastText();
  const hk=await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.name==='Heritage Key Villas'); return ((await window.ldsShell.docList(p.key)).files||[]).some(f=>f.name==='memo.txt'); });
  ok(hk&&/mentions “Heritage Key Villas”, so it was filed under Heritage Key Villas/.test(tr),'a document naming one property is filed there, and says so ("'+tr.slice(0,120)+'")');
  await page.setInputFiles('#loanDocsFile',both); await page.waitForTimeout(1200);
  const ch=await page.evaluate(()=>{ const m=document.querySelector('[data-whichprop]'); return m?{ t:m.innerText, opts:[...m.querySelectorAll('[data-whichsel] option')].slice(0,2).map(o=>o.textContent) }:null; });
  ok(ch&&/Which property is this for\?/.test(ch.t)&&ch.opts.includes('Heritage Key Villas')&&ch.opts.includes('Creekside at Grand Prairie'),'a document naming two properties asks "Which property is this for?" ('+(ch&&ch.opts.join(' / '))+')');
  await page.evaluate(()=>{ const m=document.querySelector('[data-whichprop]'); const s=m.querySelector('[data-whichsel]'); s.value=[...s.options].find(o=>o.textContent==='Creekside at Grand Prairie').value; m.querySelector('[data-whichok]').click(); });
  await page.waitForTimeout(1200);
  ok(await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.name==='Creekside at Grand Prairie'); return ((await window.ldsShell.docList(p.key)).files||[]).some(f=>f.name==='portfolio-memo.txt'); }),'…and files it under the property you picked');

  // ---- #221 reset month for a hybrid with a fixed payment ----
  const bot=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.propertyName==='The Botanic (Carteret)'); const r=(window.LDS_scheduleRows(l._id)||[]).filter(x=>x.isReset).map(x=>String(x.paymentDate).slice(0,7)); return { type:l.amortType, resets:r }; });
  const com=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.propertyName==='1222 Commerce St'); return (window.LDS_scheduleRows(l._id)||[]).filter(x=>x.isReset).map(x=>String(x.paymentDate).slice(0,7)); });
  ok(com.includes('2031-05'),'1222 Commerce St\'s reset is marked — paid May 2031 ('+com.join(', ')+')');
  ok(bot.resets.includes('2031-01'),'The Botanic\'s reset is marked — paid Jan 2031 ('+bot.type+'; '+bot.resets.join(', ')+')');

  // ---- #206-#208 permanent delete ----
  const notArch=await page.evaluate(async(k)=>await window.ldsShell.propPurge({propKey:k}),P.key);
  ok(notArch&&notArch.ok===false&&notArch.notArchived,'the delete path refuses a property that isn\'t archived ("'+(notArch&&notArch.error)+'")');
  await page.evaluate(async(k)=>{ await window.ldsShell.chatSave({scope:k,scopeName:'Queens Gate Apartments',title:'qg',messages:[{role:'user',content:'x'}]}); await window.LDS_archiveProperty(k,true); },P.key);
  await page.waitForTimeout(600);
  await page.evaluate(()=>document.getElementById('scopePortfolioBtn').click()); await page.waitForTimeout(600);
  await page.evaluate((k)=>document.querySelector('[data-harddelete="'+k+'"]').click(),P.key); await page.waitForTimeout(800);
  const dm=await modal();
  ok(/1 loan \(\$48,000,000(\.00)?\)/.test(dm)&&/document/.test(dm)&&/1 chat/.test(dm)&&/profile/.test(dm)&&/can’t be undone here; the automatic backups keep a copy/.test(dm),'the confirm lists what goes: "'+dm.slice(0,160)+'…"');
  await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(1500);
  const gone=await page.evaluate(async(k)=>({ loans:window.LDS_loans().filter(l=>window.propertyKey(l)===k).length, files:((await window.ldsShell.docList(k)).files||[]).length, chats:((await window.ldsShell.chatList({scope:k})).conversations||[]).length }),P.key);
  ok(gone.loans===0&&gone.files===0&&gone.chats===0,'deleted: no loan, no file, no chat left ('+JSON.stringify(gone)+')');

  // ---- #216 files without a property ----
  await page.evaluate(async()=>{ await window.ldsShell.docSave({propKey:'name:old name before rename',propName:'Old Name Before Rename',name:'left-behind.txt',base64:btoa('x'),text:'x',type:'text/plain',role:'other'}); });
  await page.evaluate(()=>{ document.getElementById('tabNewBtn').click(); document.querySelector('[data-tabopen="health"]').click(); });
  await page.waitForFunction(()=>/Files without a property/.test((document.getElementById('healthView')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
  const orow=await page.evaluate(()=>{ const r=document.querySelector('[data-orphan="name:old name before rename"]'); return r?r.innerText:''; });
  ok(/Old Name Before Rename/.test(orow)&&/left-behind\.txt/.test(orow),'Data Health lists the folder left behind');
  const target=await page.evaluate(()=>{ const r=document.querySelector('[data-orphan="name:old name before rename"]'); const s=r.querySelector('[data-orphanto]'); const o=[...s.options].find(x=>x.textContent==='Creekside at Grand Prairie'); s.value=o.value; r.querySelector('[data-orphanattach]').click(); return o.value; });
  await page.waitForTimeout(300); await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(1500);
  ok(await page.evaluate(async(k)=>((await window.ldsShell.docList(k)).files||[]).some(f=>f.name==='left-behind.txt'),target),'"Attach" moves the files into the chosen property');

  // ---- #43 Data Health pops out and docks back ----
  const winP=app.waitForEvent('window',{timeout:15000});
  await page.evaluate(()=>{ const t=[...document.querySelectorAll('[data-tabsel]')].find(b=>/Data Health/.test(b.textContent)); t.querySelector('[data-tabpop]').click(); });
  const pw=await winP.catch(()=>null);
  if(pw){ await pw.waitForLoadState('domcontentloaded'); await pw.waitForFunction(()=>/Data Health/.test(document.body.innerText)&&!document.getElementById('healthView').hidden,null,{timeout:20000}).catch(()=>{}); }
  const pinfo=pw?await pw.evaluate(()=>({ url:location.search, panel:document.body.getAttribute('data-panelwin'), shown:!document.getElementById('healthView').hidden })):null;
  ok(pinfo&&pinfo.panel==='health'&&pinfo.shown,'Data Health opens in its own window ('+JSON.stringify(pinfo)+')');
  if(pw){ const closed=pw.waitForEvent('close',{timeout:10000}).catch(()=>null); await pw.evaluate(()=>document.getElementById('panelDockBtn').click()); await closed; }
  await page.waitForTimeout(800);
  ok(await page.evaluate(()=>!document.getElementById('healthView').hidden),'"Dock into main window" brings it back as the open tab');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{ fs.rmSync(UDATA,{recursive:true,force:true}); fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all property-docs e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
