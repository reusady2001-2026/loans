/* e2e for 2.9.9 (fixes 1–5) — files with several parts: you say which part is whose, the app remembers it.
   The case that broke: "40 N Euclid Ave" is "The Euclid" (Yardi code 15169) in its files. Here Queens Gate
   Apartments plays it: its T12 sheet is "12 Month Statement-15169" (above it: "The Euclid") and its rent-roll
   section is "The Euclid(15169)" — neither file names Queens Gate.
   (1) a 4-sheet T12 saved the 2.9.7 way (no sheet) is NEVER read from the first sheet: Queens Gate waits for an
       answer (Data Health lists it, its NOI is not another property's);
   (2) Answer → the card: nothing set for Queens Gate (it can't tell), the properties the sheets name are set,
       "Add as a new property" is never set; Queens Gate ← sheet 2 → it reads sheet 2, and its general-data.json
       records sheet number 2 and its name; the named properties get their own sheets;
       a new month's export (same tabs) arrives with the card filled in from last time;
   (3) a 3-section rent roll attached in Queens Gate's chat: the card sets "The Euclid(15169)" to Queens Gate (the
       code of the T12 sheet you linked), ticks only it, sets no new property; after approve Queens Gate reads
       that section and no "The Euclid" property is created; Claude's text holds only Queens Gate's sheet;
   (4) import_rent_roll in the chat with section:"…" — a section you pick "Add as a new property" for creates it,
       and the result says "Created a new property".
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/file-parts.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-parts-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const REPLIES=path.join(UDATA,'replies.json'), CALLS=path.join(UDATA,'chat-calls.jsonl');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const act=(o)=>'```action\n'+JSON.stringify(o)+'\n```';
const script=(list)=>fs.writeFileSync(REPLIES,JSON.stringify(list));
const calls=()=>{ try{ return fs.readFileSync(CALLS,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch(e){ return []; } };
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||20000)){ try{ if(await page.evaluate(fn,arg)) return true; }catch(e){} await page.waitForTimeout(300); } return false; };
const M=["Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026"];
const rowOf=(l,v)=>[l,...Array(12).fill(v),v*12];
// a T12 sheet: the property's Yardi name above the header; NOI = 12 × (rent − taxes)
const t12Sheet=(top,rent,tax)=>XLSX.utils.aoa_to_sheet([[top],["12 Month Statement"],["Account",...M,"Total"],["INCOME"],rowOf("Gross Potential Rent",rent),rowOf("TOTAL INCOME",rent),["EXPENSES"],rowOf("Real Estate Taxes",tax),rowOf("TOTAL EXPENSES",tax),rowOf("NET OPERATING INCOME",rent-tax)]);
function t12Book(file, bump){ const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,t12Sheet("Residences at Forest Park Hotel",200000+bump,65000),"12 Month Statement-15155");   // NOI 1,620,000 — sheet 1, nobody's here
  XLSX.utils.book_append_sheet(wb,t12Sheet("The Euclid",250000+bump,99583),"12 Month Statement-15169");                       // NOI 1,805,004 — Queens Gate's
  XLSX.utils.book_append_sheet(wb,t12Sheet("Villages of Whitewater",90000+bump,20000),"12 Month Statement-15200");
  XLSX.utils.book_append_sheet(wb,t12Sheet("Villages of Independence",80000+bump,30000),"12 Month Statement-15300");
  const p=path.join(UDATA,file); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p; }
// a Yardi-style rent roll: several properties' sections on ONE sheet, each closed by its "Total" row
function rentRoll(file, sections){ const lines=['Rent Roll','Unit,Unit Type,Unit,Resident,Name,Market,Actual',',,Sq Ft,,,Rent,Rent','Current/Notice/Vacant Residents'];
  sections.forEach((s,si)=>{ for(let u=0;u<s.units;u++) lines.push((100*(si+1)+u)+',A1,800,t'+si+u+',Res '+u+',1500,'+(u<s.occ?1450:0)); lines.push(',,,Total,'+s.name+','+(1500*s.units)+','+(1450*s.occ)); });
  const p=path.join(UDATA,file); fs.writeFileSync(p,lines.join('\n')+'\n'); return p; }
(async()=>{
  script([]);
  const BOOK=t12Book('Scheduler_Reports.xlsx',0);
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CHAT_FILE:REPLIES,LDS_FAKE_CHAT_LOG:CALLS})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(2500);
  const P=await page.evaluate(()=>{ const f=(re)=>{ const p=window.opProperties().find(x=>re.test(x.name)); return {key:p.key,name:p.name}; }; return { q:f(/queens gate/i), w:f(/villages of whitewater/i), i:f(/villages of independence/i), fp:f(/residences at forest park/i), n:window.opProperties().length }; });
  const toastText=()=>page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');

  // ---- (1) saved the 2.9.7 way: role T12, no sheet, on a property the file never names ----
  await page.evaluate(async({k,b64,text})=>{ await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'Scheduler_Reports.xlsx',base64:b64,text:text,type:'',role:'t12'}); },
    {k:P.q.key,b64:fs.readFileSync(BOOK).toString('base64'),text:(()=>{ const wb=XLSX.read(fs.readFileSync(BOOK)); return wb.SheetNames.map(n=>'# Sheet: '+n+'\n'+XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n'); })()});
  const r0=await page.evaluate((k)=>window.LDS_readT12(k),P.q.key);
  ok(r0===null,'a 4-sheet T12 with no answer is NOT read for Queens Gate — never the first sheet (got '+JSON.stringify(r0)+')');
  ok(((await page.evaluate((k)=>window.LDS_partsWaiting(k),P.q.key))||{}).t12.join()==='Scheduler_Reports.xlsx','…it waits for your answer');
  await page.evaluate(()=>{ const b=document.getElementById('tabNewBtn'); if(b) b.click(); const o=document.querySelector('[data-tabopen="health"]'); if(o) o.click(); });
  ok(await until(page,()=>{ const e=document.querySelector('[data-health-parts]'); return e&&e.getAttribute('data-health-parts')==='1'; },null,40000),'Data Health: "Files with several parts waiting for your answer: 1"');
  ok(/Queens Gate Apartments · “Scheduler_Reports\.xlsx” \(4 parts\)/.test(await page.evaluate(()=>document.querySelector('[data-health-parts]').innerText)),'…naming Queens Gate and the file');

  // ---- (2) Answer → the card ----
  await page.evaluate(()=>document.querySelector('[data-health-parts] [data-partsanswer]').click());
  ok(await until(page,()=>!!document.querySelector('[data-partsmodal]')),'Answer opens the card');
  const card=await page.evaluate(()=>{ const m=document.querySelector('[data-partsmodal]'); return { text:m.innerText, sel:[...m.querySelectorAll('[data-partsel]')].map(s=>s.value), tick:[...m.querySelectorAll('[data-partuse]')].map(c=>c.checked) }; });
  ok(/Which part is Queens Gate Apartments’s\?/.test(card.text),'the card asks which part is Queens Gate’s — nothing is set for it');
  ok(card.sel[0]===P.fp.key&&card.sel[1]===''&&card.sel[2]===P.w.key&&card.sel[3]===P.i.key,'sheets that name a property are set to it (sheet 1 “Residences at Forest Park Hotel” → The Residences at Forest Park); sheet 2 (“The Euclid”) is not ('+card.sel.join(' | ')+')');
  ok(!card.sel.includes('__new__')&&/Sheet 2 of 4 · 12 Month Statement-15169 · The Euclid/.test(card.text),'"Add as a new property" is never set; each row says "Sheet 2 of 4 · 12 Month Statement-15169 · The Euclid"');
  await page.evaluate((k)=>{ const s=document.querySelector('[data-partsmodal] [data-partsel="2"]'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },P.q.key);
  ok(await page.evaluate(()=>document.querySelector('[data-partsmodal] [data-partuse="2"]').checked),'picking Queens Gate ticks that row');
  await page.evaluate(()=>document.querySelector('[data-partsmodal] [data-partsok]').click());
  ok(await until(page,(k)=>window.LDS_readT12(k).then(r=>!!r&&r.sheetNo===2),P.q.key,30000),'Queens Gate now reads sheet 2');
  const r1=await page.evaluate((k)=>window.LDS_readT12(k),P.q.key);
  ok(r1&&r1.sheet==='12 Month Statement-15169'&&Math.abs(r1.noi-1805004)<1,'…“12 Month Statement-15169”, NOI $1,805,004 — its own sheet (got '+JSON.stringify(r1)+')');
  const rec=await page.evaluate((k)=>window.LDS_gdRecords(k),P.q.key);
  ok(rec.length===1&&rec[0].sheetNo===2&&rec[0].sheet==='12 Month Statement-15169'&&rec[0].sheets===4&&rec[0].file==='Scheduler_Reports.xlsx','general-data.json records it: sheet number 2 of 4, “12 Month Statement-15169” ('+JSON.stringify(rec)+')');
  const rw=await page.evaluate((k)=>window.LDS_readT12(k),P.w.key);
  ok(rw&&rw.sheetNo===3&&Math.abs(rw.noi-840000)<1,'Villages of Whitewater got its own sheet (3) and NOI ($840,000)');
  ok(await page.evaluate(()=>!document.querySelector('[data-partsmodal]')),'the card closes');

  // a new month's export (same tabs): the card arrives filled in from last time
  const BOOK2=t12Book('Scheduler_Reports_Aug.xlsx',1000);
  await page.evaluate((k)=>window.LDS_openProfile(k),P.q.key);
  await until(page,()=>!!document.getElementById('loanDocsFile')||!!document.getElementById('propDocsPanel'));
  await page.setInputFiles('#loanDocsFile',BOOK2);
  ok(await until(page,()=>!!document.querySelector('[data-partsmodal]')),'adding next month’s export in Documents shows the card');
  const card2=await page.evaluate(()=>{ const m=document.querySelector('[data-partsmodal]'); return { sel:[...m.querySelectorAll('[data-partsel]')].map(s=>s.value), tick:[...m.querySelectorAll('[data-partuse]')].map(c=>c.checked), text:m.innerText }; });
  ok(card2.sel[1]===P.q.key&&card2.tick[1]&&card2.sel[2]===P.w.key&&card2.sel[3]===P.i.key&&card2.sel[0]===P.fp.key,'…filled in from last time: sheet 1 → Forest Park, 2 → Queens Gate, 3 → Whitewater, 4 → Independence ('+card2.sel.join(' | ')+')');
  await page.evaluate(()=>document.querySelector('[data-partsmodal] [data-partsok]').click());
  ok(await until(page,(k)=>window.LDS_readT12(k).then(r=>!!r&&r.name==='Scheduler_Reports_Aug.xlsx'&&r.sheetNo===2),P.q.key,30000),'Queens Gate reads the new file’s sheet 2');

  // ---- (3) a rent roll with three properties' sections, attached in Queens Gate's chat ----
  const RR=rentRoll('RentRoll09_10_2026.csv',[{name:'Villages of Whitewater(15200)',units:3,occ:3},{name:'The Euclid(15169)',units:5,occ:4},{name:'Villages of Independence(15300)',units:2,occ:1}]);
  await page.evaluate(()=>document.getElementById('aiAsstFab').click());
  await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{});
  await page.evaluate((k)=>{ const s=document.getElementById('aiAsstProp'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },P.q.key); await page.waitForTimeout(500);
  await page.setInputFiles('#aiAsstFile',RR); await page.waitForTimeout(1200);
  script(['Noted — the rent roll is linked.']);
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='Here is the rent roll'; document.getElementById('aiAsstSend').click(); });
  ok(await until(page,()=>!!document.querySelector('#aiAsstLog [data-partscard]')),'attaching it in the chat shows the card in the chat');
  const c3=await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); return { text:b.innerText, sel:[...b.querySelectorAll('[data-partsel]')].map(s=>s.value), tick:[...b.querySelectorAll('[data-partuse]')].map(c=>c.checked) }; });
  ok(c3.sel[1]===P.q.key&&c3.tick[1],'“The Euclid(15169)” is set to Queens Gate and ticked — the code of the T12 sheet you linked ('+c3.sel.join(' | ')+')');
  ok(c3.sel[0]===P.w.key&&!c3.tick[0]&&c3.sel[2]===P.i.key&&!c3.tick[2],'the other sections show their property but are NOT ticked (a Queens Gate chat changes only Queens Gate)');
  ok(!c3.sel.includes('__new__')&&/Section 2 of 3 on sheet 1/.test(c3.text),'no section is set to a new property');
  calls();   // (nothing to check yet)
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop(); b.click(); });
  await page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:30000}).catch(()=>{}); await page.waitForTimeout(1200);
  const blk=await page.evaluate((k)=>window.LDS_rrBlockFresh(k),P.q.key);
  ok(blk&&blk.units===5&&blk.section==='The Euclid(15169)','Queens Gate reads its own section: 5 units ('+JSON.stringify(blk)+')');
  const wRR=await page.evaluate((k)=>window.LDS_rrBlockFresh(k),P.w.key);
  ok(!wRR||!wRR.units,'Villages of Whitewater was not touched (no rent roll linked: '+JSON.stringify(wRR)+')');
  ok(await page.evaluate((n)=>window.opProperties().length===n&&!window.opProperties().some(p=>/^the euclid$/i.test(p.name)),P.n),'no “The Euclid” property was created');
  const sent=calls().pop();
  ok(sent&&/THIS property's part is Sheet 2 of 4 · 12 Month Statement-15169/.test(sent.prompt)&&!/Residences at Forest Park Hotel/.test(sent.prompt.split('<file name="Scheduler_Reports')[1]||''),'Claude’s copy of the T12 holds only Queens Gate’s sheet');
  ok(/The Euclid\(15169\)/.test(sent.prompt)&&/use ONLY the section “The Euclid\(15169\)”/.test(sent.prompt),'…and of the rent roll, only its section is to be used');

  // ---- (4) import_rent_roll with the section named; a section you pick "Add as a new property" for ----
  const RR2=rentRoll('RentRoll10_10_2026.csv',[{name:'The Euclid(15169)',units:5,occ:5},{name:'Brand New Place(15999)',units:4,occ:2}]);
  await page.setInputFiles('#aiAsstFile',RR2); await page.waitForTimeout(1000);
  // attaching it shows the card first (it has 2 parts): cancel that one — the import action asks again
  script([act({action:'import_rent_roll',file:'RentRoll10_10_2026.csv',section:'The Euclid(15169)'}),'Done — see the card result.']);
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='Import this rent roll into this property'; document.getElementById('aiAsstSend').click(); });
  await until(page,()=>document.querySelectorAll('#aiAsstLog [data-partscard]').length>=2);
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditCancel:not(:disabled)')].pop(); b.click(); });
  ok(await until(page,()=>document.querySelectorAll('#aiAsstLog [data-partscard]').length>=3,null,30000),'import_rent_roll shows the card');
  const c4=await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); return { sel:[...b.querySelectorAll('[data-partsel]')].map(s=>s.value), tick:[...b.querySelectorAll('[data-partuse]')].map(c=>c.checked) }; });
  ok(c4.sel[0]===P.q.key&&c4.tick[0]&&c4.sel[1]===''&&!c4.tick[1],'the section Claude named is set to Queens Gate; “Brand New Place” is set to nothing ('+c4.sel.join(' | ')+')');
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); const s=b.querySelector('[data-partsel="2"]'); s.value='__new__'; s.dispatchEvent(new Event('change',{bubbles:true})); b.querySelector('.aiAsstEditApprove').click(); });
  await page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:30000}).catch(()=>{}); await page.waitForTimeout(1500);
  const res4=await page.evaluate(()=>[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop().parentElement.innerText);
  ok(/Created a new property: Brand New Place/.test(res4)&&/Queens Gate Apartments ← Section 1 of 2/.test(res4),'the result says what happened: linked to Queens Gate, and "Created a new property: Brand New Place"');
  ok(await page.evaluate(()=>window.opProperties().some(p=>p.name==='Brand New Place')),'…and Brand New Place exists');
  const fed=calls().pop();
  ok(fed&&/Created a new property: Brand New Place/.test(fed.prompt),'Claude is told the same result');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all file-parts e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
