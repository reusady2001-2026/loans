/* e2e for 2.9.7 — loan change history, the Excel round trip, full interest-only loans and "Add loan".
   #4   the toolbar's "Add loan" pre-fills the property you're on (the real button, not a helper)
   #252 every edited loan field is recorded (old → new, when, who, where from) and shown as "history (N)"
   #5/#66 a loan interest-only for its whole term saves with no amortization period
   #71  an exported sheet re-imported untouched reads "unchanged" for every loan (rounding is not a change)
   #146 a re-imported sheet matches each loan by its Loan ID even when the name and number were changed
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/loan-history.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-hist-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);

  // ---- #4: open a loan, press the real "Add loan" button → Property Name is that loan's property ----
  // a loan that is its property's only loan, so the Loan Record header carries the per-loan Edit button
  const first=await page.evaluate(()=>{ const act=window.LDS_loans().filter(x=>!x.archived&&x.status!=='Paid off');
    const l=act.find(x=>act.filter(y=>y.propertyName===x.propertyName).length===1); return {id:l._id,name:l.propertyName}; });
  await page.evaluate((id)=>{ const r=document.querySelector('tr[data-goto="'+id+'"]'); if(r) r.click(); },first.id);
  await page.waitForTimeout(500);
  await page.click('#addBtn');
  await page.waitForTimeout(400);
  const pre=await page.evaluate(()=>{ const i=document.getElementById('f_propertyName'); return i?i.value:null; });
  ok(pre===first.name,'"Add loan" pre-fills the property you are on ("'+first.name+'", got "'+pre+'")');
  await page.click('#cancelBtn'); await page.waitForTimeout(300);

  // ---- #252: edit a field through the form → history (1) with old → new ----
  await page.evaluate((id)=>{ const r=document.querySelector('tr[data-goto="'+id+'"]'); if(r) r.click(); },first.id);
  await page.waitForTimeout(400);
  const oldLender=await page.evaluate((id)=>window.LDS_loans().find(l=>l._id===id).lenderName||'',first.id);
  await page.click('#loanRecEdit'); await page.waitForTimeout(400);
  await page.fill('#f_lenderName','History Test Bank');
  await page.click('#saveBtn'); await page.waitForTimeout(600);
  const h=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return (l._history||[]).filter(e=>e.field==='lenderName'); },first.id);
  ok(h.length===1&&h[0].new==='History Test Bank'&&(h[0].old||'')===oldLender&&h[0].who==='You'&&h[0].from==='typed','the lender edit is recorded once: "'+oldLender+'" → "History Test Bank", by You, typed');
  const link=await page.evaluate(()=>{ const b=document.querySelector('[data-loanhist="lenderName"]'); return b?b.textContent:''; });
  ok(/history \(1\)/.test(link),'the profile shows "history (1)" next to the lender (got "'+link+'")');
  await page.evaluate(()=>document.querySelector('[data-loanhist="lenderName"]').click()); await page.waitForTimeout(300);
  const modal=await page.evaluate(()=>{ const m=document.getElementById('historyModal'); return m&&!m.classList.contains('hidden')?m.innerText:''; });
  ok(/History Test Bank/.test(modal)&&/You/.test(modal)&&/typed/.test(modal),'the history window lists the change with who and where from');
  await page.evaluate(()=>document.getElementById('historyClose').click()); await page.waitForTimeout(200);
  // an unchanged save adds nothing
  await page.click('#loanRecEdit'); await page.waitForTimeout(300); await page.click('#saveBtn'); await page.waitForTimeout(500);
  const h2=await page.evaluate((id)=>(window.LDS_loans().find(x=>x._id===id)._history||[]).filter(e=>e.field!=='created').length,first.id);
  ok(h2===1,'saving again with no change records nothing new (entries: '+h2+')');

  // ---- #5/#66: interest-only for the whole term, amortization left blank → saves ----
  await page.click('#loanRecEdit'); await page.waitForTimeout(300);
  const term=await page.evaluate(()=>document.getElementById('f_loanTermMonths').value);
  await page.fill('#f_ioMonths',String(term)); await page.fill('#f_amortizationMonths','');
  await page.click('#saveBtn'); await page.waitForTimeout(600);
  const io=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const fe=document.getElementById('formError');
    return { mode:document.getElementById('loanView')&&!document.getElementById('loanView').hidden, err:fe&&!fe.classList.contains('hidden')?fe.textContent:'', io:l.ioMonths, term:l.loanTermMonths, am:l.amortizationMonths, bal:window.LDS_computeBalance(l) }; },first.id);
  ok(!io.err&&io.io===io.term&&!io.am,'a loan interest-only for its whole term saves with no amortization ('+io.io+'/'+io.term+' mo, error: "'+io.err+'")');
  ok(io.bal>0,'its balance still computes (got '+io.bal+')');
  const ioKpi=await page.evaluate(()=>document.getElementById('kpiGrid').innerText);
  ok(/the whole term/i.test(ioKpi),'the Interest-Only card says "the whole term"');

  // ---- #71: export → re-import untouched → every loan "unchanged", nothing to apply ----
  const nActive=await page.evaluate(()=>window.LDS_loans().filter(l=>!l.archived&&l.status!=='Paid off').length);
  const b64=await page.evaluate(()=>window.LDS_exportXlsxB64());
  await page.evaluate((b)=>window.LDS_importXlsxB64(b),b64); await page.waitForTimeout(500);
  const c1=await page.evaluate(()=>window.LDS_importCounts());
  ok(c1&&c1.un===nActive&&c1.nw===0&&c1.up===0,'an untouched export re-imports as '+nActive+' unchanged, 0 new, 0 updated (got '+JSON.stringify(c1)+')');
  const btn1=await page.evaluate(()=>{ const b=document.getElementById('importApplyBtn'); return {dis:b.disabled,t:b.textContent}; });
  ok(btn1.dis,'nothing to apply — the Apply button is off ("'+btn1.t+'")');
  await page.evaluate(()=>{ const m=document.getElementById('importPreview'); m.classList.add('hidden'); m.classList.remove('flex'); });

  // ---- #146: rename the property AND change the loan number in the sheet → still the same loan (Loan ID) ----
  const b64b=await page.evaluate((id)=>{
    const wb=XLSX.read(Uint8Array.from(atob(window.LDS_exportXlsxB64([id])),c=>c.charCodeAt(0)),{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]]; const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    aoa.forEach(r=>{ if(r[1]==='Property Name') r[2]='Renamed In Excel'; if(r[1]==='Loan Number') r[2]='XL-99'; });
    const wb2=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet(aoa),'Loan Debt Service');
    return XLSX.write(wb2,{type:'base64',bookType:'xlsx'}); },first.id);
  const before=await page.evaluate(()=>window.LDS_loans().length);
  await page.evaluate((b)=>window.LDS_importXlsxB64(b),b64b); await page.waitForTimeout(500);
  const c2=await page.evaluate(()=>window.LDS_importCounts());
  ok(c2&&c2.up===1&&c2.nw===0,'the changed sheet is one UPDATE, not a new loan (got '+JSON.stringify(c2)+')');
  await page.click('#importApplyBtn'); await page.waitForTimeout(700);
  const after=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return { n:window.LDS_loans().length, name:l.propertyName, num:l.loanNumber,
    hist:(l._history||[]).filter(e=>e.from==='excel-import').map(e=>e.field) }; },first.id);
  ok(after.n===before&&after.name==='Renamed In Excel'&&after.num==='XL-99','the same loan was updated (no new loan): '+after.name+' / '+after.num);
  ok(after.hist.includes('propertyName')&&after.hist.includes('loanNumber'),'both changes are in its history as "Excel import" ('+after.hist.join(', ')+')');
  const toastTxt=await page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');
  ok(/0 new, 1 updated, 0 unchanged/.test(toastTxt),'the toast reports new / updated / unchanged ("'+toastTxt+'")');

  // ---- the history survives a restart (it lives inside the loan record) ----
  await app.close();
  const app2=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const p2=await app2.firstWindow(); p2.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await p2.route(/^https?:\/\//,r=>r.abort());
  await p2.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await p2.waitForTimeout(800);
  const kept=await p2.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return l?(l._history||[]).length:-1; },first.id);
  ok(kept>=4,'after a restart the loan still has its history ('+kept+' entries)');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app2.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all loan-history e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
