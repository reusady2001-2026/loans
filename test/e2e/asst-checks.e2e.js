/* e2e for 2.9.7 — the NOI rule and the checks on the assistant's changes.
   #45/#234/#235 an NOI from a T12 (or your own override) is never changed by the assistant — in every route; you can
                 override it on the property page and every figure follows
   #46/#234      a property with no loan: the NOI is saved on the property; negative is allowed and shown
   #236          loan changes use the loan form's checks; a real date only; maturity in the past flagged; "5.5" = 5.5%;
                 the senior's new address asks "Move the whole property (mezz too)?"
   #237          profile changes use the profile's checks
   #238          assumptions show before → after, an unusual cap rate is flagged, the screen is not switched
   #111          a tick box per line; where each figure came from is on the card and in the history
   #53           read_property returns what it read
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-checks.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asstchk-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const run=(o)=>page.evaluate((o)=>{ const r=window.LDS_asstAction(o); return Promise.resolve(r).then(x=>{ window.__r=x; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop();
    return { ok:x&&x.ok, msg:x&&x.msg, data:x&&x.data, card:!!(x&&x.pending), text:(x&&x.pending&&c)?c.textContent:'' }; }); },o);
  const click=async(cls)=>{ await page.evaluate((cls)=>{ const b=[...document.querySelectorAll('#aiAsstLog .'+cls+':not(:disabled)')].pop(); if(b) b.click(); },cls);
    return page.evaluate(()=>window.__r&&window.__r.pending?window.__r.pending:null); };

  // a single-loan property we treat as having a T12 NOI
  const T=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans.length===1&&x.name==='M Lofts'); window.LDS_setGDNOI(p.key,{inPlace:900000,underwritten:880000}); return { key:p.key, name:p.name, id:p.loans[0]._id }; });

  // ---- #45/#235: the T12 NOI is never changed by the assistant, in any route ----
  let r=await run({action:'set_property_noi',args:{name:T.name,noi:1200000}});
  ok(!r.card&&/comes from its T12 \(\$900,000/.test(r.msg)&&/override it yourself on the property page/.test(r.msg),'set NOI on a T12 property is refused: "'+r.msg.slice(0,110)+'…"');
  r=await run({action:'propose_loan_change',args:{name:T.name,changes:{noi:1200000,opex:5,lenderName:'Check Bank'}}});
  ok(r.card&&/Lender Name/.test(r.text)&&!/NOI \(annual\)\s*\(none\)/.test(r.text)&&/Left alone: .*NOI/.test(r.text),'a loan change carrying NOI/expenses keeps only the rest, saying why');
  await click('aiAsstEditCancel');

  // ---- #45: your override on the property page ----
  await page.evaluate((k)=>window.LDS_openProfile(k),T.key); await page.waitForTimeout(800);
  const F=await page.evaluate(()=>({ ov:!!document.querySelector('#loanProfilePanel [data-pf="noiOverride"]'), en:!!document.querySelector('#loanProfilePanel [data-pf="noi"]') }));
  ok(F.ov&&!F.en,'the property page has "NOI override" (and no entered NOI box on a property with a loan)');
  await page.evaluate(()=>{ const d=document.querySelector('#loanProfilePanel details'); if(d) d.open=true; const i=document.querySelector('#loanProfilePanel [data-pf="noiOverride"]'); i.value='$1,050,000'; i.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(900);
  const O=await page.evaluate((T)=>{ const l=window.LDS_loans().find(x=>x._id===T.id); return { noi:window.LDS_loanNOI(l), snap:(window.LDS_aiAsstSnapshot().find(x=>x.property===T.name)||{}) }; },T);
  ok(O.noi===1050000,'your override replaces the T12 NOI ('+O.noi+')');
  ok(/override/.test(O.snap.noiBasis||'')&&O.snap.noi===1050000,'Claude sees it as your override ("'+O.snap.noiBasis+'")');
  r=await run({action:'set_property_noi',args:{name:T.name,noi:5}});
  ok(!r.card&&/your own override/.test(r.msg),'the assistant can’t change your override: "'+r.msg.slice(0,80)+'…"');
  r=await run({action:'propose_profile_change',args:{name:T.name,changes:{noiOverride:5}}});
  ok(!r.card&&/yours to type/.test(r.msg),'…not through the profile either');

  // ---- #46/#234: a property with no loan, negative NOI ----
  const NK=await page.evaluate(async()=>await window.LDS_addProperty('Noi Lot Test')); await page.waitForTimeout(300);
  r=await run({action:'set_property_noi',args:{name:'Noi Lot Test',noi:-250000}});
  ok(r.card&&/saved on the property itself/.test(r.text)&&/-\$250,000(\.00)? \(negative\)/.test(r.text),'no loan: the card shows the negative NOI clearly');
  let res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(res&&res.ok&&await page.evaluate((k)=>Number(window.LDS_profileEffective(k,'noi'))===-250000,NK),'approved → saved on the property (-250,000)');

  // ---- #236: loan checks ----
  r=await run({action:'propose_loan_change',args:{name:T.name,changes:{maturityDate:'2026-02-30'}}});
  ok(!r.card&&/valid/.test(r.msg),'Feb 30 is not a real date — nothing proposed');
  r=await run({action:'propose_loan_change',args:{name:T.name,changes:{loanTermMonths:9999,ioMonths:0}}});
  ok(!r.card&&/would break the loan/.test(r.msg),'a term longer than the amortization is refused in the form’s words: "'+r.msg.slice(0,100)+'…"');
  r=await run({action:'propose_loan_change',args:{name:T.name,changes:{maturityDate:'2020-01-01',annualRate:5.5}}});
  ok(r.card&&/in the past/.test(r.text)&&/5\.50?0?%/.test(r.text),'a past maturity is flagged and "5.5" reads as 5.5%');
  // ticks: untick the rate → only the maturity is applied
  await page.evaluate(()=>{ const c=[...document.querySelectorAll('#aiAsstLog .aiAsstLine[data-asstline="annualRate"]')].pop(); c.checked=false; });
  const rate0=await page.evaluate((id)=>window.LDS_loans().find(x=>x._id===id).annualRate,T.id);
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  const L=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return { mat:l.maturityDate, rate:l.annualRate }; },T.id);
  ok(res&&res.ok&&L.mat==='2020-01-01'&&L.rate===rate0&&/Not applied \(unticked\): Annual Interest Rate/.test(res.msg),'only the ticked line is applied (#111): "'+(res&&res.msg||'').slice(0,120)+'"');

  // ---- #111: where a figure came from ----
  r=await run({action:'propose_loan_change',args:{name:T.name,changes:{lenderName:'Agreement Bank'},sources:{lenderName:{file:'loan-agreement.pdf',page:3,quote:'Lender: Agreement Bank'}}}});
  ok(r.card&&/from loan-agreement\.pdf · p\.3 · “Lender: Agreement Bank”/.test(r.text),'the card says where the figure came from');
  await click('aiAsstEditApprove'); await page.waitForTimeout(300);
  const H=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const h=(l._history||[]).filter(x=>x.field==='lenderName').pop(); return h?{file:h.file,page:h.page,who:h.who}:null; },T.id);
  ok(H&&H.file==='loan-agreement.pdf'&&H.page==='3'&&/Assistant/.test(H.who),'…and the history keeps it ('+JSON.stringify(H)+')');

  // ---- #236/#136: the senior's new address moves the mezz too ----
  const AV=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.name==='Avalon White Plains'); const sr=p.loans.find(l=>l.propertyName==='Avalon White Plains'); return { ids:p.loans.map(l=>l._id), sr:sr.propertyName }; });
  r=await run({action:'propose_loan_change',args:{name:AV.sr,changes:{propertyAddress:'9 New Road, White Plains, NY 10601'}}});
  ok(r.card&&/Move the whole property \(mezz too\)\?/.test(r.text),'the senior’s new address asks "Move the whole property (mezz too)?"');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(1200);
  const AA=await page.evaluate((ids)=>[...new Set(window.LDS_loans().filter(l=>ids.includes(l._id)).map(l=>l.propertyAddress))],AV.ids);
  ok(res&&res.ok&&AA.length===1&&AA[0]==='9 New Road, White Plains, NY 10601','approved → both loans have the new address');

  // ---- #237: profile checks ----
  r=await run({action:'propose_profile_change',args:{name:'Noi Lot Test',changes:{residentialUnits:-3,yearBuilt:2999,manager:'Check Mgmt'}}});
  ok(r.card&&/Manager/.test(r.text)&&!/Residential units\s*\(none\)/.test(r.text)&&/whole number/.test(r.text)&&/between 1800/.test(r.text),'negative units and a future year are left out, saying why');
  await click('aiAsstEditApprove'); await page.waitForTimeout(400);
  ok(await page.evaluate((k)=>window.LDS_profileEffective(k,'manager')==='Check Mgmt'&&!window.LDS_profileEffective(k,'residentialUnits'),NK),'only the manager is saved');

  // ---- #238: assumptions ----
  const before=await page.evaluate(()=>({ tab:document.querySelector('.ldsTab.active,[aria-selected="true"]')?.textContent||'', sel:document.getElementById('loanSelect').value }));
  r=await run({action:'edit_assumptions',args:{name:'Noi Lot Test',changes:{capRate:0.30,vacancy:6}}});
  ok(r.card&&/5\.50?%/.test(r.text)&&/30\.00?%/.test(r.text)&&/Cap rate 30\.00?% is unusual — are you sure\?/.test(r.text),'before → after with "Cap rate 30% is unusual — are you sure?"');
  res=await click('aiAsstEditApprove'); await page.waitForTimeout(1200);
  r=await run({action:'read_property',args:{name:'Noi Lot Test'}});
  ok(res&&res.ok&&r.data&&r.data.assumptions.sizing.capRate===0.3&&Math.abs(r.data.assumptions.vacancy-0.06)<1e-9&&r.data.assumptions.ownToThisProperty,'approved → saved to the property (read_property sees cap 30%, vacancy 6%)');
  const after=await page.evaluate(()=>({ tab:document.querySelector('.ldsTab.active,[aria-selected="true"]')?.textContent||'', sel:document.getElementById('loanSelect').value }));
  ok(before.sel===after.sel&&before.tab===after.tab,'the screen was not switched');
  ok(r.data&&r.data.noi&&r.data.noi.entered===-250000&&r.data.profile.manager==='Check Mgmt','read_property returns the property’s NOI and profile');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assistant-check e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
