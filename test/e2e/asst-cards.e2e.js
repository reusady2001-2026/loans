/* e2e for 2.9.7 — more of the assistant's actions behind an Approve card in the chat, nothing opening by itself.
   #91  a new loan: missing required fields are asked for first; the card lists every field; the form opens only on ask
   #231 Excel import: "N new, M updated" on the card; applied on Approve
   #94  rent roll import: the file saved (or attached) is read; what will be imported is on the card
   #93  "what to push" needs a T12 first
   #95  refinance changes (terms, rate type, spread) on a card, in plain names
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-cards.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asstcards-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const CSV=['Rent Roll','Unit,Unit Type,Unit,Resident,Name,Market,Actual',',,Sq Ft,,,Rent,Rent','Current/Notice/Vacant Residents',
  '101,A1,800,t001,Alice,1500,1500','102,A1,800,VACANT,VACANT,1500,0',',,,Total,Card Rent Court,3000,1500'].join('\n')+'\n';
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const run=(o)=>page.evaluate((o)=>{ const r=window.LDS_asstAction(o); return Promise.resolve(r).then(x=>{ window.__r=x; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop();
    return { ok:x&&x.ok, msg:x&&x.msg, card:!!(x&&x.pending), text:(x&&x.pending&&c)?c.textContent:'' }; }); },o);
  const click=async(cls)=>{ await page.evaluate((cls)=>{ const b=[...document.querySelectorAll('#aiAsstLog .'+cls+':not(:disabled)')].pop(); if(b) b.click(); },cls);
    return page.evaluate(()=>window.__r&&window.__r.pending?window.__r.pending:null); };
  const sel0=await page.evaluate(()=>document.getElementById('loanSelect').value);

  // ---- #91 a new loan ----
  let r=await run({action:'propose_new_loan',args:{fields:{propertyName:'Cardinal Court',lenderName:'Card Bank'}}});
  ok(!r.card&&/I still need: .*Original Loan Amount/.test(r.msg)&&/Origination Date/.test(r.msg),'missing required fields are asked for first: "'+r.msg.slice(0,110)+'…"');
  const full={propertyName:'Cardinal Court',lenderName:'Card Bank',originalAmount:12000000,annualRate:0.061,rateType:'Fixed',originationDate:'2024-03-01',firstPaymentDate:'2024-04-01',maturityDate:'2034-03-01',loanTermMonths:120,amortizationMonths:360};
  r=await run({action:'propose_new_loan',args:{fields:full,sources:{originalAmount:{file:'term-sheet.pdf',page:1}}}});
  ok(r.card&&/Cardinal Court is a new property/.test(r.text)&&/Original Loan Amount/.test(r.text)&&/12,000,000/.test(r.text)&&/Maturity Date/.test(r.text)&&/from term-sheet\.pdf · p\.1/.test(r.text),'the card lists every field (with where the amount came from)');
  let res=await click('aiAsstEditApprove'); await page.waitForTimeout(500);
  const NL=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.propertyName==='Cardinal Court'); return l?{ amt:l.originalAmount, rate:l.annualRate, form:!document.getElementById('formView').hidden, hist:(l._history||[]).some(h=>h.field==='created'&&/Assistant/.test(h.who)) }:null; });
  ok(res&&res.ok&&NL&&NL.amt===12000000&&NL.rate===0.061&&NL.hist,'approved → the loan is added (history: Assistant, approved by You)');
  ok(NL&&!NL.form&&await page.evaluate(()=>document.getElementById('loanSelect').value)===sel0,'nothing opened — the screen stayed as it was');
  r=await run({action:'propose_new_loan',args:{fields:{propertyName:'Form Only'},open:true}});
  ok(r.ok&&await page.evaluate(()=>!document.getElementById('formView').hidden&&document.getElementById('f_propertyName').value==='Form Only'),'open:true opens the pre-filled form (only when asked)');
  await page.click('#cancelBtn'); await page.waitForTimeout(300);

  // ---- #231 Excel import ----
  const X=await page.evaluate(async()=>{ const ls=window.LDS_loans().filter(l=>!l.archived).slice(0,2); const b64=window.LDS_exportXlsxB64(ls.map(l=>l._id));
    const k=window.propertyKey(ls[0]); await window.ldsShell.docSave({propKey:k,propName:ls[0].propertyName,name:'book-export.xlsx',base64:b64,text:'',type:'',role:'other'});
    const was=ls[0].lenderName; ls[0].lenderName='Changed Lender'; return { id:ls[0]._id, was }; });
  r=await run({action:'import_excel',args:{file:'book-export'}});
  ok(r.card&&/0 new, 1 updated/.test(r.text),'the import card says "0 new, 1 updated" ('+r.text.replace(/\s+/g,' ').slice(0,80)+')');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(500);
  ok(res&&res.ok&&await page.evaluate((X)=>window.LDS_loans().find(l=>l._id===X.id).lenderName===X.was,X),'approved → the loan is updated from the sheet');
  r=await run({action:'import_excel',args:{file:'nope-not-here.xlsx'}});
  ok(!r.card&&/Attach the Excel file/.test(r.msg),'no file → it asks for one, nothing imported');

  // ---- #94 rent roll import ----
  const RK=await page.evaluate(async(csv)=>{ const k=await window.LDS_addProperty('Card Rent Court'); await window.ldsShell.docSave({propKey:k,propName:'Card Rent Court',name:'card-rentroll.csv',base64:btoa(csv),text:'',type:'text/csv',role:'other'}); return k; },CSV);
  await page.waitForTimeout(300);
  r=await run({action:'import_rent_roll',args:{name:'Card Rent Court',file:'card-rentroll.csv'}});
  ok(r.card&&/Card Rent Court/.test(r.text)&&/2 units, 1 occupied/.test(r.text)&&/update/.test(r.text),'the card shows what will be imported (2 units, 1 occupied → update Card Rent Court)');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(600);
  const RR=await page.evaluate(async(k)=>{ const d=await window.ldsShell.docList(k); return (d.files||[]).filter(f=>f.role==='rentroll').map(f=>f.name); },RK);
  ok(res&&res.ok&&RR.includes('card-rentroll.csv'),'approved → filed as the property’s rent roll');

  // ---- #93 what to push needs a T12 ----
  r=await run({action:'run_push',args:{name:'Card Rent Court'}});
  ok(!r.card&&/has no T12 yet\. Upload one and I’ll run it/.test(r.msg),'"what to push" without a T12: "'+r.msg+'"');

  // ---- #95 refinance terms on a card ----
  r=await run({action:'set_refi_terms',args:{name:'Cardinal Court',changes:{rateType:'Floating',spread:2.5,termYears:7}}});
  ok(r.card&&/Rate type/.test(r.text)&&/Floating/.test(r.text)&&/2\.50?0?%/.test(r.text)&&/7 years/.test(r.text),'rate type, spread and term on one card, in plain words');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  const D=await page.evaluate(()=>{ const d=window.LDS_refiDraft&&window.LDS_refiDraft(); return d?{ type:d.rateType, base:d._baseSpread, term:d.loanTermMonths }:null; });
  ok(res&&res.ok&&D&&D.type==='Floating'&&Math.abs(D.base-0.025)<1e-9&&D.term===84,'approved → the proposed loan is Floating, 2.50% spread, 7 years ('+JSON.stringify(D)+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assistant-card e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
