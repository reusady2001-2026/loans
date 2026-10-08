/* e2e for 2.9.7 — the refinance rules.
   #181-#183 stage 2 in order: ends within 12 months → Refinance; the lower rate pays for the early-payoff
             penalty (interest saved until today's loan ends ≥ penalty) → Refinance; lower rate, doesn't pay
             the penalty, extra cash > 20% → your decision; anything else → Don't refinance (a higher rate
             whatever the cash)
   #184/#185 the decision case shows the two options and the proposal; the amount can't go to ≤ 20% extra cash
             (2.9.14 R1 — and never so low that the extra cash doesn't cover the penalty: refi-arm-2914)
   #22/#23   the amount stops at what the property supports; "at this loan (…): DSCR · LTV · DY" under it
   #258      the proposed-rate row is in the verdict card whatever the verdict
   #25       a senior + mezz payoff = each loan at its own balance
   #24       Save replaces all the property's loans; the old ones read "Paid off (refinanced)"
   #26       a saved rate shows "Last saved rate · <date>"; never fetched → "Built-in rate — fetch to update"
   #80       a hybrid proposal shows both periods; #79 no "Retire mezz into senior" line
   #27/#28/#241 the assistant: the property's refinance in the background, only real NOI choices, ticks by name
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-rules.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refirules-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const LID=await page.evaluate(()=>window.opProperties().find(p=>p.name==='Villages of Whitewater').loans[0]._id);
  // a controlled single loan: fixed, 40 years left, the NOI at 20% of the payoff (Can = yes)
  const setup=(rate,prepay,step)=>page.evaluate(({lid,rate,prepay,step})=>{ const l=window.LDS_loans().find(x=>x._id===lid);
    Object.assign(l,{rateType:'Fixed',isHistorical:true,amortType:'Level',capRate:0.05,loanTermMonths:480,amortizationMonths:480,ioMonths:0,annualRate:rate,rateFloor:null,rateCap:null,prepayType:prepay,prepayConfirmed:true,stepDownPct:step||0,maturityDate:null});
    l.noi=window.LDS_computeBalance(l)*0.20; return window.LDS_computeBalance(l); },{lid:LID,rate,prepay,step});
  const verdict=(patch)=>page.evaluate(({lid,patch})=>{ const l=window.LDS_loans().find(x=>x._id===lid); const v=window.LDS_refiVerdictWith(l,patch||{}); const s=v.should||{};
    return { can:v.can.can, max:v.can.maxLoan, refi:v.refi, decision:v.decision, kind:s.kind, why:s.why, saved:s.saved, penalty:s.penalty, cashPct:s.cashPct, newRate:s.newRate, curRate:s.curRate, payoff:s.payoff }; },{lid:LID,patch});

  // 2.9.14 (R1): "your decision" also needs the extra cash to cover the penalty — so today's rate is 4.50% (the
  // proposal is lower, the saving small): a penalty of twice the saving stays well under 25% extra cash.
  // (3) the lower rate pays for a zero penalty → Refinance
  const payoff=await setup(0.0450,'Open / at par',0);
  const v1=await verdict();
  ok(v1.can&&v1.kind==='yes'&&v1.why==='saves'&&v1.saved>0&&v1.penalty===0,'lower rate, no penalty → Refinance (saves '+Math.round(v1.saved)+')');
  // penalty twice the saving → Don't refinance (no extra cash)
  const step=(2*v1.saved)/payoff;
  await setup(0.0450,'Step-down',step);
  const v2=await verdict();
  ok(v2.kind==='no'&&v2.why==='penalty'&&v2.penalty>v2.saved,'the saving ('+Math.round(v2.saved)+') doesn\'t pay the penalty ('+Math.round(v2.penalty)+') → Don\'t refinance');
  // (4) …but with extra cash above 20% of what you owe → your decision; 15% → Don't
  const v3=await verdict({originalAmount:payoff*1.25});
  ok(v3.kind==='decision'&&Math.abs(v3.cashPct-0.25)<1e-6,'same, with 25% extra cash → your decision');
  const v4=await verdict({originalAmount:payoff*1.15});
  ok(v4.kind==='no','with 15% extra cash → Don\'t refinance');
  // (5) a higher new rate → Don't, whatever the cash
  await setup(0.0300,'Open / at par',0);
  const v5=await verdict({originalAmount:payoff*1.5});
  ok(v5.kind==='no'&&v5.why==='pricier','a higher new rate with 50% extra cash → Don\'t refinance');
  // (2) ends within 12 months → Refinance, even at a higher rate
  await page.evaluate((lid)=>{ const l=window.LDS_loans().find(x=>x._id===lid); const t=new Date(); const m=new Date(Date.UTC(t.getFullYear(),t.getMonth()+8,1)); l.maturityDate=m.toISOString().slice(0,10); l.loanTermMonths=120; l.amortizationMonths=360; l.noi=window.LDS_computeBalance(l)*0.2; },LID);
  const v6=await verdict();
  ok(v6.kind==='yes'&&v6.why==='maturity','today\'s loan ends within 12 months → Refinance (even at a higher rate)');

  // ---- the screen in the decision case ----
  await setup(0.0450,'Step-down',step);
  await page.evaluate((lid)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true})); window.LDS_resetRefiDraft(); },LID);
  await page.waitForTimeout(400); await page.click('#refiBtn'); await page.waitForTimeout(600);
  let S=await page.evaluate(()=>({ v:document.querySelector('[data-refiverdict]').getAttribute('data-refiverdict'), pricing:!!document.querySelector('[data-refiverdict] #refiPricing #o1_spread'), amount:!!document.querySelector('#refiPricing #o1_amount'), atloan:(document.querySelector('[data-refiatloan]')||{}).textContent||'' }));
  ok(S.v==='no'&&S.pricing&&S.amount,'on "Don\'t refinance" the rate row and the amount are still in the verdict card (#258)');
  ok(/^at this loan \(\$[\d,]+(\.\d\d)?\): DSCR \d\.\d\d× · LTV [\d.]+% · DY [\d.]+%$/.test(S.atloan),'the line under the amount: "'+S.atloan+'"');
  const max=await page.evaluate((lid)=>window.LDS_refiVerdict(window.LDS_loans().find(x=>x._id===lid)).can.maxLoan,LID);
  await page.evaluate((v)=>{ const i=document.getElementById('o1_amount'); i.value=String(v); i.dispatchEvent(new Event('change',{bubbles:true})); },Math.round(max*1.5));
  await page.waitForTimeout(500);
  const clamp=await page.evaluate(()=>({ amt:window.LDS_refiDraft().originalAmount, toast:(document.getElementById('toastText')||{}).textContent||'' }));
  ok(Math.abs(clamp.amt-Math.floor(max))<=1&&/supports up to/.test(clamp.toast),'typing more than the property supports stops at '+Math.round(max)+' (#22)');
  await page.evaluate((v)=>{ const i=document.getElementById('o1_amount'); i.value=String(v); i.dispatchEvent(new Event('change',{bubbles:true})); },Math.round(payoff*1.25));
  await page.waitForTimeout(600);
  S=await page.evaluate(()=>({ v:document.querySelector('[data-refiverdict]').getAttribute('data-refiverdict'), opts:[...document.querySelectorAll('[data-refidecision] p.font-bold')].map(p=>p.textContent), save:(document.getElementById('refiSaveBtn')||{}).textContent||'', proposal:document.querySelectorAll('#refiOptions [id^="o1_"]').length }));
  ok(S.v==='decision'&&/^Refinance now — with \$[\d,]+(\.\d\d)? cash$/.test(S.opts[0]||'')&&/^Wait until [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(S.opts[1]||''),'your decision: "'+S.opts.join('" / "')+'"');
  ok(S.proposal>0&&/Refinance now/.test(S.save),'the full proposed loan and "Save as a loan — Refinance now" are shown (#184)');
  await page.evaluate((v)=>{ const i=document.getElementById('o1_amount'); i.value=String(v); i.dispatchEvent(new Event('change',{bubbles:true})); },Math.round(payoff*1.10));
  await page.waitForTimeout(500);
  const pop=await page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden')?document.getElementById('confirmText').textContent:''; });
  const kept=await page.evaluate(()=>window.LDS_refiDraft().originalAmount);
  ok(/You can’t do that — if you do, you won’t be able to refinance\./.test(pop)&&Math.abs(kept-payoff*1.25)<2,'lowering the amount to 10% extra cash is refused with the pop-up; the amount stays (#185)');
  await page.evaluate(()=>document.getElementById('confirmOk').click());
  // a ticked lever keeps the typed amount (#241)
  await page.evaluate(()=>{ document.getElementById('refiManualLabel').value='parking'; document.getElementById('refiManualAmt').value='10000'; document.getElementById('refiManualAdd').click(); });
  await page.waitForTimeout(500);
  ok(Math.abs(await page.evaluate(()=>window.LDS_refiDraft().originalAmount)-payoff*1.25)<2,'adding a lever keeps the amount you typed (#241)');
  // #26 — rates never fetched are labelled built-in
  ok(/Built-in rate — fetch to update/.test(await page.evaluate(()=>document.getElementById('refiPricing').innerText)),'a rate never fetched says "Built-in rate — fetch to update" (#26)');
  await page.click('#refiCloseBtn'); await page.waitForTimeout(300);

  // ---- senior + mezz ----
  const AV=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.name==='Avalon White Plains'); const combo=window.LDS_getLoan('combo:'+p.key);
    const sum=p.loans.reduce((a,l)=>a+window.LDS_computeBalance(l),0); return { key:p.key, ids:p.loans.map(l=>l._id), sum, payoff:window.LDS_refiPayoff(combo) }; });
  ok(Math.abs(AV.payoff-AV.sum)<0.01,'the senior + mezz payoff is each loan at its own balance ('+Math.round(AV.payoff)+') (#25)');
  await page.evaluate((k)=>{ const s=document.getElementById('loanSelect'); s.value='combo:'+k; s.dispatchEvent(new Event('change',{bubbles:true})); },AV.key);
  await page.waitForTimeout(400); await page.click('#refiBtn'); await page.waitForTimeout(700);
  ok(!/Retire mezz into senior/i.test(await page.evaluate(()=>document.getElementById('refiView').innerText)),'no "Retire mezz into senior" line (#79)');
  // hybrid proposal: both periods (#80)
  await page.evaluate(()=>document.querySelector('#refiPricing [data-rtype="Hybrid ARM"]').click()); await page.waitForTimeout(500);
  const H=await page.evaluate(()=>{ const t=document.getElementById('refiPricing').innerText; return { t, fx:(document.getElementById('o1_fxspread')||{}).value, mg:(document.getElementById('o1_spread')||{}).value, idx:(document.getElementById('o1_index')||{}).value }; });
  ok(/Months 1–60 · fixed/i.test(H.t)&&/After month 60 · adjustable/i.test(H.t)&&/if the index stays at today’s level/.test(H.t)&&H.fx==='0'&&H.mg==='0'&&H.idx==='ust5y','a hybrid shows both periods, spreads at 0, then the 5-yr Treasury "if the index stays at today\'s level"');
  ok(/Monthly payment \$[\d,]/.test(H.t),'…with the monthly payment for each period');
  // #27 — the assistant prepares the property's refinance in the background (screen not opened for it)
  await page.click('#refiCloseBtn'); await page.waitForTimeout(300);
  await page.evaluate(()=>document.getElementById('scopePortfolioBtn').click()); await page.waitForTimeout(400);
  await page.evaluate(()=>{ const sr=window.LDS_loans().find(x=>x.propertyName==='Avalon White Plains'); sr.noi=14000000; window.__asstRes=window.LDS_asstAction({action:'start_refinance',args:{name:'Avalon WP (Mezz)'}}); });
  await page.waitForTimeout(500);
  const A27=await page.evaluate(()=>({ mode:!document.getElementById('refiView').hidden, card:(document.getElementById('aiAsstLog')||{}).textContent||'', res:window.__asstRes&&window.__asstRes.msg }));
  const t27=(A27.card||'')+' '+(A27.res||'');
  ok(!A27.mode&&/Avalon White Plains/.test(t27)&&/on 2 loans together/.test(t27),'"refinance Avalon WP (Mezz)" works on the whole property, without opening the screen (#27)');
  // #28 — only the choices the property has
  const r28=await page.evaluate(()=>window.LDS_asstAction({action:'set_refi_noi_basis',args:{name:'Avalon White Plains',basis:'in-place'}}));
  ok(r28&&r28.ok===false&&/can use: Entered NOI \(\$14,000,000/.test(r28.msg),'asking for a basis the property doesn\'t have lists the ones it has ("'+(r28&&r28.msg)+'")');
  await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.propertyName==='Avalon White Plains'); l.noi=9000000; });   // (it had 14,000,000 typed above)
  // 2.9.7 (#95) — a refinance change is behind an Approve card; the result comes back once approved
  const r28b=await page.evaluate(()=>{ const r=window.LDS_asstAction({action:'set_refi_noi_basis',args:{name:'Avalon White Plains',basis:'entered'}}); window.__p=r&&r.pending; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); return { card:!!(r&&r.pending), msg:r&&r.msg, text:c?c.textContent:'' }; });
  let r28c=null;
  if(r28b.card){ await page.evaluate(()=>{ [...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop().click(); }); r28c=await page.evaluate(()=>window.__p); }
  ok(r28b.card&&/Entered NOI \(\$9,000,000/.test(r28b.text)&&r28c&&r28c.ok&&/Entered NOI \(\$9,000,000/.test(r28c.msg),'"entered" works when an NOI was typed — on a card, in plain names, and says so after checking ('+(r28c&&r28c.msg||r28b.msg||'').slice(0,90)+')');

  // ---- #24 Save replaces all the property's loans ----
  const MID=await page.evaluate(()=>window.LDS_loans().find(x=>x.propertyName==='M Lofts')._id);
  await page.evaluate((lid)=>{ const l=window.LDS_loans().find(x=>x._id===lid); l.noi=window.LDS_computeBalance(l)*0.25; const s=document.getElementById('loanSelect'); document.getElementById('scopeLoanBtn').click(); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true})); window.LDS_resetRefiDraft(); },MID);
  await page.waitForTimeout(400); await page.click('#refiBtn'); await page.waitForTimeout(700);
  const hasSave=await page.evaluate(()=>!!document.getElementById('refiSaveBtn'));
  if(hasSave){
    await page.click('#refiSaveBtn'); await page.waitForTimeout(300);
    const ask=await page.evaluate(()=>document.getElementById('confirmText').textContent);
    ok(/This replaces “M Lofts” with one new/.test(ask)&&/Paid off \(refinanced\)/.test(ask),'Save asks first: "'+ask.slice(0,110)+'…"');
    await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(800);
    const R=await page.evaluate((lid)=>{ const old=window.LDS_loans().find(x=>x._id===lid); const nw=window.LDS_loans().filter(x=>x.propertyName==='M Lofts'&&x._id!==lid);
      return { st:old.loanStatus, why:old.paidOffReason, at:old.paidOffAt, n:nw.length, newName:nw[0]&&nw[0].propertyName, key:nw[0]&&window.propertyKey(nw[0])===window.propertyKey(old), hist:(old._history||[]).some(h=>h.new==='Paid off (refinanced)') }; },MID);
    ok(R.st==='Paid off'&&R.why==='refinanced'&&/^\d{4}-\d\d-\d\d$/.test(R.at||'')&&R.hist,'the old loan is Paid off (refinanced), dated, in its history');
    ok(R.n===1&&R.key,'the new loan is the property\'s only loan, under the same name');
    const strip=await page.evaluate(()=>{ document.getElementById('scopePortfolioBtn').click(); return new Promise(r=>setTimeout(()=>r((document.getElementById('inactiveLoansStrip')||{}).innerText||''),500)); });
    ok(/Paid off \(refinanced\)/i.test(strip),'Home lists it under removed & paid-off loans');
  } else ok(false,'M Lofts should be a Refinance at NOI 25% of the payoff');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all refi-rules e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
