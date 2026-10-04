/* e2e for 2.9.7 — where changes come from, and two Home / loan-form fixes.
   #253 an Underwriting assumption change is recorded in the property's history (old → new, who), typing
        is grouped into ONE entry, and the assumption shows "history (N)"
   #252 a change the assistant made (after you approved it) reads "Assistant, approved by You"
   #136 a new address on one loan asks to change it on the property's other loans too (Yes keeps it one property)
   #124 picking the mezz loan's lender on Home shows its senior + mezz group already opened on that loan
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/history-wiring.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-hwire-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const readHist=(k)=>page.evaluate(async(k)=>{ const l=await window.ldsShell.docList(k); const f=(l.files||[]).find(x=>x.role==='history'); if(!f) return [];
    const rd=await window.ldsShell.docRead(k,f.id); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rd.base64),c=>c.charCodeAt(0)))).entries||[]; },k);

  // ---- #253: Underwriting assumptions ----
  const key=await page.evaluate(()=>window.opProperties().find(p=>p.loans&&p.loans.length===1).key);
  await page.evaluate((k)=>window.LDS_openSizing(k),key);
  await page.waitForFunction(()=>!!document.getElementById('uwFile'),null,{timeout:15000});
  await page.setInputFiles('#uwFile',path.join(APP,'test','fixtures','sample-t12.xlsx'));   // the assumptions show once the property has a T12
  await page.waitForFunction(()=>!!document.querySelector('#uwView input[data-uwbench="vacancyPct"]'),null,{timeout:20000});
  await page.waitForTimeout(1500);
  await page.waitForTimeout(600);
  await page.evaluate(()=>{ const i=document.querySelector('#uwView input[data-uwbench="vacancyPct"]'); i.value='6'; i.dispatchEvent(new Event('change',{bubbles:true})); });
  // typing a sizing limit key by key is ONE change
  for(const v of ['1','1.3','1.35']){ await page.evaluate((v)=>{ const i=document.querySelector('#uwView input[data-uwsize="dscrMin"]'); i.value=v; i.dispatchEvent(new Event('input',{bubbles:true})); },v); await page.waitForTimeout(150); }
  await page.waitForTimeout(2500);
  const H=await readHist(key);
  const vac=H.filter(e=>e.field==='vacancyPct'), dscr=H.filter(e=>e.field==='sizing.dscrMin');
  ok(vac.length===1&&/5\.00%/.test(vac[0].old||'')&&/6\.00%/.test(vac[0].new||'')&&vac[0].who==='You','the vacancy change is recorded: '+(vac[0]?vac[0].old+' → '+vac[0].new+' by '+vac[0].who:'none'));
  ok(dscr.length===1&&/1\.35×/.test(dscr[0].new||''),'typing 1 → 1.3 → 1.35 is ONE entry ('+dscr.length+': '+dscr.map(e=>e.old+'→'+e.new).join(', ')+')');
  const link=await page.evaluate(()=>{ const s=document.querySelector('#uwView [data-uwhistslot="vacancyPct"]'); return s?s.textContent:''; });
  ok(/history \(1\)/.test(link),'Vacancy shows "history (1)" ("'+link+'")');
  await page.evaluate(()=>document.querySelector('#uwView [data-uwhist="vacancyPct"]').click()); await page.waitForTimeout(300);
  const m=await page.evaluate(()=>{ const x=document.getElementById('historyModal'); return x&&!x.classList.contains('hidden')?x.innerText:''; });
  ok(/6\.00%/.test(m)&&/You/.test(m),'the history window lists it');
  await page.evaluate(()=>document.getElementById('historyClose').click());
  const all=await page.evaluate(()=>{ const b=document.querySelector('#uwView [data-uwhistall] button'); return b?b.textContent:''; });
  ok(/Change history \(2\)/.test(all),'the assumptions show "Change history (2)" ("'+all+'")');

  // ---- #252: the assistant's change, approved by you ----
  await page.evaluate(()=>{ const t=document.querySelector('[data-tabsel="home"]'); if(t) t.click(); }); await page.waitForTimeout(400);
  const target=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>!x.archived&&x.loanStatus!=='Paid off'); return {id:l._id,name:l.propertyName,lender:l.lenderName||''}; });
  await page.evaluate((n)=>window.LDS_asstAction({action:'propose_loan_change',args:{name:n,changes:{lenderName:'Assistant Bank'}}}),target.name);
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('.aiAsstEditApprove')].pop(); if(b) b.click(); }); await page.waitForTimeout(500);
  const ah=await page.evaluate((id)=>(window.LDS_loans().find(l=>l._id===id)._history||[]).filter(e=>e.field==='lenderName'),target.id);
  ok(ah.length===1&&ah[0].new==='Assistant Bank'&&ah[0].who==='Assistant, approved by You'&&ah[0].from==='assistant','the assistant\'s change reads "Assistant, approved by You" ('+JSON.stringify(ah[0]||{})+')');

  // ---- #136: a new address on the senior asks about the mezz ----
  const pair=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans&&x.loans.length===2); const sr=p.loans.find(l=>!/mezz/i.test(l.propertyName||'')&&l.lienPosition!=='Mezzanine')||p.loans[0]; const mz=p.loans.find(l=>l!==sr);
    return { key:p.key, sr:sr._id, mz:mz._id, mzName:mz.propertyName, addr:sr.propertyAddress }; });
  await page.evaluate((id)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },'combo:'+pair.key);
  await page.waitForTimeout(500);
  await page.evaluate((id)=>{ const b=document.querySelector('[data-loanedit="'+id+'"]'); if(b) b.click(); },pair.sr);   // the combined view's per-loan Edit
  await page.waitForTimeout(400);
  const formOpen=await page.evaluate(()=>!document.getElementById('formView').hidden);
  ok(formOpen,'the senior loan\'s edit form is open');
  if(formOpen){
    await page.fill('#f_propertyAddress','1 New Street, Somewhere, NY 10601');
    await page.click('#saveBtn'); await page.waitForTimeout(400);
    const q=await page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden')?{t:document.getElementById('confirmTitle').textContent,ok:document.getElementById('confirmOk').textContent,no:document.getElementById('confirmCancel').textContent}:null; });
    ok(q&&q.t.includes(pair.mzName)&&/Yes/.test(q.ok)&&/only this loan/.test(q.no),'saving asks "'+(q&&q.t)+'" — ['+(q&&q.ok)+'] / ['+(q&&q.no)+']');
    await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(700);
    const after=await page.evaluate((p)=>{ const L=window.LDS_loans(); const sr=L.find(l=>l._id===p.sr), mz=L.find(l=>l._id===p.mz); return { a1:sr.propertyAddress, a2:mz.propertyAddress, k1:window.propertyKey(sr), k2:window.propertyKey(mz), h:(mz._history||[]).filter(e=>e.field==='propertyAddress').length }; },pair);
    ok(after.a1===after.a2&&after.k1===after.k2,'Yes changed both — the property stays one property ('+after.k1+')');
    ok(after.h===1,'the mezz loan\'s history records its address change');
  }

  // ---- #124: pick the mezz's lender → its group shows, opened, with that loan ----
  await page.evaluate(()=>document.getElementById('scopePortfolioBtn').click()); await page.waitForTimeout(600);
  const lend=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans&&x.loans.length===2&&new Set(x.loans.map(l=>l.lenderName)).size===2);
    if(!p) return null; const mz=p.loans.find(l=>/mezz/i.test(l.propertyName||'')||l.lienPosition==='Mezzanine')||p.loans[1]; return { lender:mz.lenderName, id:mz._id }; });
  if(lend){
    await page.evaluate((ln)=>{ const cb=document.querySelector('[data-lenderopt="'+ln.replace(/"/g,'\\"')+'"]'); cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); },lend.lender);
    await page.waitForTimeout(400);
    const G=await page.evaluate((id)=>{ const r=document.querySelector('tr[data-propmember][data-goto="'+id+'"]'); if(!r) return null; const h=document.querySelector('tr[data-proptoggle="'+r.getAttribute('data-propmember')+'"]');
      return { rowShown:!r.hidden&&r.style.display!=='none', headShown:h.style.display!=='none', open:h.classList.contains('prop-open') }; },lend.id);
    ok(G&&G.headShown&&G.open&&G.rowShown,'filtering by "'+lend.lender+'" shows the group opened on that loan ('+JSON.stringify(G)+')');
    await page.evaluate(()=>document.getElementById('lenderClear').click()); await page.waitForTimeout(300);
    const C=await page.evaluate((id)=>{ const r=document.querySelector('tr[data-propmember][data-goto="'+id+'"]'); const h=document.querySelector('tr[data-proptoggle="'+r.getAttribute('data-propmember')+'"]'); return { open:h.classList.contains('prop-open'), rowHidden:r.hidden }; },lend.id);
    ok(!C.open&&C.rowHidden,'clearing the filter closes the group it opened');
  } else ok(true,'(no senior + mezz group with two lenders in the seed — #124 skipped)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all history-wiring e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
