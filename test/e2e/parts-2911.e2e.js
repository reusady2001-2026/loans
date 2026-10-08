/* e2e for 2.9.11 — full freedom over a file's parts, and results tied to the exact parts.
   (A)  A rent roll of ONE property in four phases ("Queens Gate Apartments Phase 1(qg1)" … "Phase 4(qg4)") on one
        sheet, imported from Queens Gate's page: all four sections are set to Queens Gate (their names start with its
        name), picking a property on one row no longer clears the others, and after Import the property's rent roll is
        the four phases together, unit by unit — the file's own totals. Its general-data.json records all four.
   (A)  A T12 workbook with two phase sheets: both given to Queens Gate on the card → its T12 is the two sheets added
        together (NOI = the two NOIs), and Underwriting says it is combined.
   (B)  A review and a "what to push" saved before 2.9.11 on ANOTHER sheet of the same file (the 40 N Euclid case) are
        dropped when the property's numbers are rebuilt — never shown or used as its own.
   (A2) A PDF holding two agreements: "Pages & properties" → pages 1–4 to Queens Gate, pages 5–10 to Villages of
        Whitewater AND Villages of Independence (one part, two properties). Each reads only its own pages.
   (A2) split_document (the assistant's proposal) shows the same card and links the pages on Approve.
   (B)  check_t12 re-runs the AI's double reading of the property's own sheets.
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/parts-2911.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-parts2911-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||20000)){ try{ if(await page.evaluate(fn,arg)) return true; }catch(e){} await page.waitForTimeout(300); } return false; };
const M=["Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026"];
const rowOf=(l,v)=>[l,...Array(12).fill(v),v*12];
const t12Sheet=(top,rent,tax)=>XLSX.utils.aoa_to_sheet([[top],["12 Month Statement"],["Account",...M,"Total"],["INCOME"],rowOf("Gross Potential Rent",rent),rowOf("TOTAL INCOME",rent),["EXPENSES"],rowOf("Real Estate Taxes",tax),rowOf("TOTAL EXPENSES",tax),rowOf("NET OPERATING INCOME",rent-tax)]);
// a Yardi rent roll: one property in phases, each phase a section closed by its "Total" row (sq ft 800 a unit)
const PH=[{name:'Queens Gate Apartments Phase 1(qg1)',units:5,occ:4},{name:'Queens Gate Apartments Phase 2(qg2)',units:6,occ:6},{name:'Queens Gate Apartments Phase 3(qg3)',units:4,occ:3},{name:'Queens Gate Apartments Phase 4(qg4)',units:3,occ:2}];
function rentRoll(file){ const lines=['Rent Roll','For Selected Properties - All Of Them Combined Are Queens Gate','Unit,Unit Type,Unit,Resident,Name,Market,Actual',',,Sq Ft,,,Rent,Rent','Current/Notice/Vacant Residents'];
  // a vacant unit is written VACANT, as the rent roll says it (2.9.12 — a unit with a resident is occupied, whatever its rent)
  PH.forEach((s,si)=>{ for(let u=0;u<s.units;u++) lines.push((100*(si+1)+u)+',A1,800,'+(u<s.occ?'t'+si+u+',Res '+u:'VACANT,VACANT')+','+(1500+si*100)+','+(u<s.occ?1450:0)); lines.push(',,,Total,'+s.name+','+((1500+si*100)*s.units)+','+(1450*s.occ)); });
  const p=path.join(UDATA,file); fs.writeFileSync(p,lines.join('\n')+'\n'); return p; }
(async()=>{
  const RR=rentRoll('RentRoll_QueensGate_Phases.csv');
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_T12:'agree',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(2500);
  const P=await page.evaluate(()=>{ const f=(re)=>{ const p=window.opProperties().find(x=>re.test(x.name)); return {key:p.key,name:p.name}; }; return { q:f(/queens gate/i), w:f(/villages of whitewater/i), i:f(/villages of independence/i) }; });

  // ---- (A) a rent roll in phases → one property, combined ----
  await page.evaluate((k)=>window.LDS_rrImportFor(k),P.q.key);
  await page.setInputFiles('#rrImportFile',RR);
  ok(await until(page,()=>{ const b=document.getElementById('rrImportBody'); return b&&b.querySelectorAll('[data-partsel]').length===4; },null,15000),'the importer shows the four phases as four parts');
  const c0=await page.evaluate(()=>({ sel:[...document.querySelectorAll('#rrImportBody [data-partsel]')].map(s=>s.value), tick:[...document.querySelectorAll('#rrImportBody [data-partuse]')].map(c=>c.checked), text:document.getElementById('rrImportBody').innerText }));
  ok(c0.sel.every(v=>v===P.q.key)&&c0.tick.every(Boolean),'all four phases are set to Queens Gate and ticked — their names start with its name ('+c0.sel.join(', ')+')');
  ok(/Parts 1, 2, 3 and 4 are set to Queens Gate Apartments — they are combined into one/.test(c0.text),'the card says parts 1–4 are set to Queens Gate and are combined');
  // picking another property on row 2 no longer clears the other rows (2.9.9 did)
  await page.evaluate((k)=>{ const s=document.querySelector('#rrImportBody [data-partsel="2"]'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },P.w.key);
  const c1=await page.evaluate(()=>[...document.querySelectorAll('#rrImportBody [data-partsel]')].map(s=>s.value));
  ok(c1[0]===P.q.key&&c1[2]===P.q.key&&c1[3]===P.q.key,'picking another property on row 2 leaves rows 1, 3 and 4 as they were');
  await page.evaluate((k)=>{ const s=document.querySelector('#rrImportBody [data-partsel="2"]'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },P.q.key);
  await page.click('#rrImportApply');
  ok(await until(page,()=>document.getElementById('rrImportModal').classList.contains('hidden'),null,15000),'Import closes the window');
  const rb=await page.evaluate((k)=>window.LDS_rrBlockFresh(k),P.q.key);
  const units=PH.reduce((a,s)=>a+s.units,0), occ=PH.reduce((a,s)=>a+s.occ,0), gpr=PH.reduce((a,s,si)=>a+(1500+si*100)*s.units,0)*12;
  ok(rb&&rb.combined&&rb.units===units&&rb.occupied===occ&&rb.vacant===units-occ,'Queens Gate’s rent roll is the four phases together: '+(rb&&rb.units)+' units, '+(rb&&rb.occupied)+' occupied (the file: '+units+' / '+occ+')');
  ok(rb&&Math.abs(rb.gpr-gpr)<1&&rb.sqft===units*800,'…rent a year '+(rb&&rb.gpr)+' and '+(rb&&rb.sqft)+' sq ft — every phase’s units counted');
  ok(rb&&/^Sections 1, 2, 3 and 4 of 4 on sheet 1 .* \(combined\)$/.test(rb.label),'…labelled "'+(rb&&rb.label)+'"');
  const recQ=await page.evaluate((k)=>window.LDS_gdRecords(k),P.q.key);
  const rrRec=recQ.find(r=>/RentRoll_QueensGate/.test(r.file));
  ok(rrRec&&rrRec.items&&rrRec.items.length===4&&rrRec.items.map(i=>i.sectionNo).join()==='1,2,3,4','general-data.json records all four sections for Queens Gate');

  // ---- (A) a T12 in two phase sheets → one property, added together ----
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,t12Sheet("Queens Gate Apartments Phase 1",100000,30000),"QG Phase 1");
  XLSX.utils.book_append_sheet(wb,t12Sheet("Queens Gate Apartments Phase 2",50000,10000),"QG Phase 2");
  const T12P=path.join(UDATA,'QG_T12_Phases.xlsx'); fs.writeFileSync(T12P,XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
  const t12card=await page.evaluate(async({k,b64})=>{ const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); const info=window.LDS_partsInfo(bytes,'QG_T12_Phases.xlsx');
    const d=window.LDS_partsDefaults(info,k,'QG_T12_Phases.xlsx','','page');
    await window.LDS_applyParts({name:'QG_T12_Phases.xlsx',bytes:bytes,text:'',type:'',label:''}, info, info.parts.map(p=>({part:p,use:true,keys:[k],key:k})), k);
    return { n:info.parts.length, keys:info.parts.map(p=>(d.rows[p.no].keys||[]).join('|')), tick:info.parts.map(p=>d.rows[p.no].tick) }; },{k:P.q.key,b64:fs.readFileSync(T12P).toString('base64')});
  ok(t12card.n===2&&t12card.keys.every(x=>x===P.q.key)&&t12card.tick.every(Boolean),'the card sets both phase sheets to Queens Gate, ticked ('+t12card.keys.join(', ')+')');
  ok(await until(page,(k)=>window.LDS_readT12(k).then(r=>!!r&&r.combined),P.q.key,30000),'Queens Gate’s T12 is the two phase sheets together');
  const tq=await page.evaluate((k)=>window.LDS_readT12(k),P.q.key);
  ok(tq&&Math.abs(tq.noi-(70000*12+40000*12))<1&&tq.sheet==='QG Phase 1 + QG Phase 2','…NOI '+(tq&&tq.noi)+' = the two sheets’ NOIs added ('+(70000*12+40000*12)+'), from "'+(tq&&tq.sheet)+'"');
  ok(tq&&/sheet 1 “QG Phase 1” \+ sheet 2 “QG Phase 2” \(combined\)|Sheet 1 “QG Phase 1” \+ sheet 2 “QG Phase 2” \(combined\)/.test(tq.partsLabel||''),'…labelled "'+(tq&&tq.partsLabel)+'"');

  // ---- (B) a review and a push saved on ANOTHER sheet of the same file are dropped on the rebuild ----
  const sha=await page.evaluate(async(k)=>{ const l=await window.ldsShell.docList(k); const f=l.files.find(x=>x.name==='QG_T12_Phases.xlsx'); return f&&f.sha; },P.q.key);
  await page.evaluate(async({k,sha})=>{ const gd=await window.LDS_gdDisk(k);
    gd.t12Review={ fileSha:sha, fileName:'QG_T12_Phases.xlsx', sheet:'Some Other Property', status:'needs-review', cards:[{ id:'x', label:'Gross Potential Rent', regular:{ row:5 } }] };
    gd.push={ summary:'old', moves:[{ title:'old move' }], sig:{ t12:sha } };
    if(gd.noi) gd.noi.computedWith='2.9.10';   // saved by the version before
    const s=JSON.stringify(gd); await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'general-data.json',base64:btoa(unescape(encodeURIComponent(s))),text:'',type:'application/json',role:'general'}); },{k:P.q.key,sha});
  await page.evaluate((k)=>window.LDS_ensureGD(k),P.q.key); await page.waitForTimeout(800);
  const gd2=await page.evaluate((k)=>window.LDS_gdDisk(k),P.q.key);
  // (the app's own background check of the newly linked T12 may already have saved a fresh, correct review)
  ok(gd2&&(!gd2.t12Review||gd2.t12Review.sheet!=='Some Other Property'),'a T12 review made on another sheet of the file is dropped when the numbers are rebuilt'+(gd2&&gd2.t12Review?' (a fresh one, made on '+gd2.t12Review.sheet+', replaced it)':''));
  ok(gd2&&!gd2.push,'…and so is a "what to push" worked out from it');
  ok(await page.evaluate((k)=>{ const rv=window.LDS_t12ReviewFor(k), pu=window.LDS_pushCache(k); return (!rv||rv.sheet!=='Some Other Property')&&(!pu||pu.summary!=='old'); },P.q.key),'…neither is used or shown');

  // ---- (B) check_t12 re-runs the double reading on the property's own sheets ----
  const ct=await page.evaluate((k)=>Promise.resolve(window.LDS_asstAction({action:'check_t12',args:{name:'Queens Gate Apartments'}})),P.q.key);
  ok(ct&&ct.ok&&/Checked Queens Gate Apartments’s T12/.test(ct.msg),'check_t12 re-runs the AI check ("'+(ct&&ct.msg)+'")');
  const rvNow=await page.evaluate(async(k)=>{ const gd=await window.LDS_gdDisk(k); return gd&&gd.t12Review; },P.q.key);
  ok(rvNow&&rvNow.partSig&&/\|1,2$/.test(rvNow.partSig)&&rvNow.combined===true,'…and the new review records the parts it was made on ('+(rvNow&&rvNow.partSig)+')');

  // ---- (A2) a PDF with two agreements: pages to properties ----
  const pdfText=Array.from({length:10},(_,i)=>'[page '+(i+1)+']\n'+(i<4?'LOAN AGREEMENT A — Queens Gate Apartments, page ':'LOAN AGREEMENT B — Villages portfolio, page ')+(i+1)).join('\n');
  await page.evaluate(async({k,t})=>{ await window.ldsShell.docSave({propKey:k,propName:'Queens Gate Apartments',name:'Two Agreements.pdf',base64:btoa('%PDF-1.4 test'),text:t,type:'application/pdf',role:'agreement'}); },{k:P.q.key,t:pdfText});
  await page.evaluate(async(q)=>{ const l=await window.ldsShell.docList(q); const f=l.files.find(x=>x.name==='Two Agreements.pdf'); window.LDS_pdfParts(q, f.id); return true; },P.q.key);
  ok(await until(page,()=>!!document.querySelector('[data-pdfmodal]'),null,15000),'"Pages & properties" opens the pages card');
  const pc=await page.evaluate(()=>{ const m=document.querySelector('[data-pdfmodal]'); return { text:m.innerText, rows:m.querySelectorAll('[data-pdfrow]').length, from:m.querySelector('[data-pdffrom]').value, to:m.querySelector('[data-pdfto]').value }; });
  ok(pc.rows===1&&pc.from==='1'&&pc.to==='10'&&/has 10 pages/.test(pc.text),'it starts as one part: pages 1–10 (the file has 10 pages)');
  await page.evaluate(()=>document.querySelector('[data-pdfmodal] [data-pdfadd]').click());
  await page.evaluate(({w,i})=>{ const m=document.querySelector('[data-pdfmodal]');
    const set=(sel,v)=>{ const e=m.querySelector(sel); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); };
    set('[data-pdfto="1"]','4'); set('[data-pdftitle="1"]','Loan agreement A'); set('[data-pdffrom="2"]','5'); set('[data-pdfto="2"]','10'); set('[data-pdftitle="2"]','Loan agreement B');
    const s2=m.querySelector('[data-partsel="2"]'); s2.value=w; s2.dispatchEvent(new Event('change',{bubbles:true}));
    m.querySelector('[data-partsadd="2"]').click(); const ss=m.querySelectorAll('[data-partsel="2"]'); ss[1].value=i; ss[1].dispatchEvent(new Event('change',{bubbles:true})); },{w:P.w.key,i:P.i.key});
  await page.evaluate(()=>document.querySelector('[data-pdfmodal] [data-pdfok]').click());
  ok(await until(page,()=>!document.querySelector('[data-pdfmodal]'),null,10000),'Approve closes the card');
  ok(await until(page,async(w)=>{ const l=await window.ldsShell.docList(w); return l.files.some(x=>x.name==='Two Agreements.pdf'); },P.w.key,20000),'the PDF went to Villages of Whitewater');
  ok(await page.evaluate(async(i)=>{ const l=await window.ldsShell.docList(i); return l.files.some(x=>x.name==='Two Agreements.pdf'); },P.i.key),'…and to Villages of Independence (one part, two properties)');
  const tQ=await page.evaluate((k)=>window.LDS_scopeDocText(k),P.q.key), tW=await page.evaluate((k)=>window.LDS_scopeDocText(k),P.w.key);
  ok(/THIS property's pages are 1–4 \(Loan agreement A\)/.test(tQ)&&/AGREEMENT A — Queens Gate Apartments, page 4/.test(tQ)&&!/AGREEMENT B/.test(tQ),'Claude reads only pages 1–4 for Queens Gate');
  ok(/THIS property's pages are 5–10 \(Loan agreement B\)/.test(tW)&&/AGREEMENT B — Villages portfolio, page 10/.test(tW)&&!/AGREEMENT A/.test(tW),'…and only pages 5–10 for Villages of Whitewater');
  const rd=await page.evaluate((w)=>Promise.resolve(window.LDS_asstAction({action:'read_documents',args:{name:'Villages of Whitewater',file:'Two Agreements.pdf'}})),P.w.key);
  ok(rd&&rd.ok&&/pages only/.test(rd.msg)&&!/AGREEMENT A/.test(rd.data.text)&&/AGREEMENT B/.test(rd.data.text),'read_documents by name gives the property’s pages only ("'+(rd&&rd.msg)+'")');

  // ---- (A2) split_document: the assistant proposes, the card shows it, Approve links it ----
  await page.evaluate(()=>document.getElementById('aiAsstFab').click()); await page.waitForTimeout(600);
  await page.evaluate((k)=>{ const s=document.getElementById('aiAsstProp'); if(s){ s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); } },P.q.key); await page.waitForTimeout(400);
  await page.evaluate(()=>Promise.resolve(window.LDS_asstAction({action:'split_document',args:{file:'Two Agreements.pdf',parts:[{from:1,to:6,title:'Agreement A (fixed)',names:['Queens Gate Apartments']},{from:7,to:10,title:'Agreement B',names:['Villages of Whitewater']}]}})).then(x=>{ window.__spr=x; return true; }));
  ok(await until(page,()=>!![...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop()?.querySelector('[data-pdfrow]'),null,15000),'split_document shows the pages card in the chat');
  const cardRows=await page.evaluate(()=>{ const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); return [...c.querySelectorAll('[data-pdfrow]')].map(r=>r.querySelector('[data-pdffrom]').value+'-'+r.querySelector('[data-pdfto]').value); });
  ok(cardRows.join()==='1-6,7-10','…with Claude’s ranges (1–6, 7–10) for you to change or approve');
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove')].pop(); if(b) b.click(); });
  const sp=await page.evaluate(()=>window.__spr&&window.__spr.pending?window.__spr.pending:window.__spr);
  ok(sp&&sp.ok&&/Linked “Two Agreements\.pdf”/.test(sp.html||sp.msg||''),'Approve links the pages ('+((sp&&(sp.html||sp.msg))||'').slice(0,140)+')');
  const tQ2=await page.evaluate((k)=>window.LDS_scopeDocText(k),P.q.key);
  ok(/pages are 1–6 \(Agreement A \(fixed\)\)/.test(tQ2)&&/page 6/.test(tQ2)&&!/page 7\]/.test(tQ2),'Queens Gate now reads pages 1–6');
  const tI=await page.evaluate((k)=>window.LDS_scopeDocText(k),P.i.key);
  ok(/None of this file's pages is this property's/.test(tI),'Villages of Independence, no longer named, reads none of it (and is told so)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all parts (2.9.11) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
