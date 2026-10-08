/* e2e for 2.9.14 — R1 and A1.
   R1  a refinance that loses money is never proposed: "your decision" (lower rate, the saving doesn't pay the penalty,
       extra cash > 20%) also needs the new loan > what you owe + the penalty; otherwise Don't refinance — "you'd lose $X".
       Closing costs don't count. "Refinance now — with $X cash" = new loan − what you owe − the penalty. In the decision
       case the amount can't be lowered into a loss either.
   A1  "At the Reset": keep the stated payment, or recalculate it over the amortization left at the reset rate, sized as the
       bank does (Actual/360 annuity ≈ rate × 365.25/360 ÷ 12). Set on 1222 Commerce St and The Botanic (Carteret), not on
       Living Lofts; an existing book gets it once (never over your own choice).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-arm-2914.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-r1a1-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const money=(n)=>'$'+(Math.round(n*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const ann=(P,r,n)=>P*r/(1-Math.pow(1+r,-n));
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);

  // ================= A1 =================
  ok(Math.abs(ann(24200000,0.061*365.25/360/12,360)-148062.35)<20&&Math.abs(ann(64000000,0.0594*365.25/360/12,360)-384807.04)<2,'the bank\'s sizing (Actual/360 annuity) gives both notes\' stated payments: $148,062.35 within $20, $384,807.04 within $2');
  const A=await page.evaluate(()=>{ const out={};
    for(const nm of ['1222 Commerce St','The Botanic (Carteret)','Living Lofts (Middlesex)']){ const l=window.LDS_loans().find(x=>x.propertyName===nm); const rows=window.LDS_scheduleRows(l._id); const i=rows.findIndex(r=>r.isReset);
      out[nm]={ id:l._id, setting:l.armResetPayment||'', i, before:rows[i-1].payment, at:rows[i].payment, next:rows[i+1].payment, bal:rows[i].startingBalance, rate:rows[i].rate, io:l.ioMonths, amort:l.amortizationMonths, last:rows[rows.length-1].type }; }
    return out; });
  const c=A['1222 Commerce St'], b=A['The Botanic (Carteret)'], lv=A['Living Lofts (Middlesex)'];
  ok(/^Recalculate/.test(c.setting)&&/^Recalculate/.test(b.setting)&&lv.setting==='','a new book: 1222 Commerce St and The Botanic recalculate at the reset; Living Lofts is left as it is');
  const want=(x)=>ann(x.bal,x.rate*365.25/360/12,x.io+x.amort-x.i);
  ok(Math.abs(c.before-148062.35)<0.01&&Math.abs(c.at-want(c))<0.01&&Math.abs(c.next-c.at)<0.01&&c.io+c.amort-c.i===312,'1222 Commerce St: '+money(c.before)+' until the reset, then '+money(c.at)+' — '+money(c.bal)+' over 312 months (26 years) at '+(c.rate*100).toFixed(2)+'%');
  ok(Math.abs(b.before-384807.04)<0.01&&Math.abs(b.at-want(b))<0.01&&b.io+b.amort-b.i===312,'The Botanic: '+money(b.before)+' until the reset, then '+money(b.at)+' (26 years at the reset rate)');
  ok(Math.abs(lv.at-lv.before)<0.01&&Math.abs(lv.at-151604.11)<0.01,'Living Lofts keeps its stated '+money(lv.at)+' across its reset');
  ok(c.last==='balloon'&&b.last==='balloon','both still end in a balloon at maturity');
  // the field on the loan form: only for a stated P&I on a hybrid
  await page.evaluate(({cid})=>{ const s=document.getElementById('scopeLoanBtn'); if(s) s.click(); const sel=document.getElementById('loanSelect');
    const p=window.opProperties().find(x=>x.loans.some(l=>l._id===cid)); sel.value=p.loans.length>1?'combo:'+p.key:cid; sel.dispatchEvent(new Event('change',{bubbles:true})); return true; },{cid:c.id});
  await page.waitForTimeout(500); await page.evaluate(()=>document.getElementById('loanRecEdit').click()); await page.waitForTimeout(700);
  const fld=await page.evaluate(()=>{ const s=document.getElementById('f_armResetPayment'); if(!s) return null; const w=s.closest('[data-fieldwrap]'); const fx=document.getElementById('f_fixedAmortAmount'), wx=fx&&fx.closest('[data-fieldwrap]'); return { value:s.value, opts:[...s.options].map(o=>o.textContent), shown:!!w&&!w.hidden, fixedShown:!!wx&&!wx.hidden }; });
  ok(fld&&fld.shown&&/^Recalculate/.test(fld.value)&&fld.opts.indexOf('Keep the stated payment')>=0,'the loan form shows "At the Reset" for 1222 Commerce St ('+(fld&&fld.value)+')');
  ok(fld&&fld.fixedShown,'…and its "Fixed Amortization Payment" (hidden on the form before 2.9.14)');
  await page.evaluate(()=>{ const s=document.getElementById('f_armResetPayment'); s.value='Keep the stated payment'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); document.getElementById('saveBtn').click(); });
  await page.waitForTimeout(400); await page.evaluate(()=>{ const m=document.getElementById('confirmModal'); if(m&&!m.classList.contains('hidden')) document.getElementById('confirmOk').click(); }); await page.waitForTimeout(800);
  const kept=await page.evaluate(({cid,i})=>{ const r=window.LDS_scheduleRows(cid); return r[i].payment; },{cid:c.id,i:c.i});
  ok(Math.abs(kept-148062.35)<0.01,'set to "Keep the stated payment" and saved: the payment stays '+money(kept)+' at the reset');
  const hidden=await page.evaluate(()=>{ const s=document.getElementById('f_rateType'); s.value='Fixed'; s.dispatchEvent(new Event('change',{bubbles:true})); const f=document.getElementById('f_armResetPayment'), w=f&&f.closest('[data-fieldwrap]'); return !w||w.hidden; });
  ok(hidden,'…and the setting is not offered on a fixed-rate loan');
  await page.evaluate(()=>{ const b=document.getElementById('cancelBtn')||document.getElementById('formCancel'); if(b) b.click(); }); await page.waitForTimeout(300);
  // an existing book gets the setting once, where it is blank — never over your own choice
  const S=await page.evaluate(()=>{ const book=window.LDS_loans().map(l=>Object.assign({},l));
    const a=book.find(l=>l.propertyName==='1222 Commerce St'), z=book.find(l=>l.propertyName==='The Botanic (Carteret)'); delete a.armResetPayment; z.armResetPayment='Keep the stated payment';
    try{ localStorage.removeItem('ldsHub.portfolioRev'); }catch(e){}
    const r=window.LDS_syncPortfolio(book); const g=(n)=>(r.loans.find(l=>l.propertyName===n)||{}).armResetPayment;
    return { set:r.set||[], c:g('1222 Commerce St'), b:g('The Botanic (Carteret)'), lv:g('Living Lofts (Middlesex)')||'' }; });
  ok(/^Recalculate/.test(S.c)&&S.b==='Keep the stated payment'&&S.lv===''&&S.set.length===1&&/1222 Commerce St/.test(S.set[0]),'an existing book: 1222 Commerce St is set once ("'+S.set.join('; ')+'"); a choice already made stays; Living Lofts untouched');

  // ================= R1 =================
  const LID=await page.evaluate(()=>window.opProperties().find(p=>p.name==='Villages of Whitewater').loans[0]._id);
  const setup=(rate,step)=>page.evaluate(({lid,rate,step})=>{ const l=window.LDS_loans().find(x=>x._id===lid);
    Object.assign(l,{rateType:'Fixed',isHistorical:true,amortType:'Level',capRate:0.05,loanTermMonths:480,amortizationMonths:480,ioMonths:0,annualRate:rate,rateFloor:null,rateCap:null,prepayType:'Step-down',prepayConfirmed:true,stepDownPct:step,maturityDate:null});
    l.noi=window.LDS_computeBalance(l)*0.20; return window.LDS_computeBalance(l); },{lid:LID,rate,step});
  const verdict=(patch)=>page.evaluate(({lid,patch})=>{ const l=window.LDS_loans().find(x=>x._id===lid); const v=window.LDS_refiVerdictWith(l,patch||{}); const s=v.should||{};
    return { decision:v.decision, kind:s.kind, why:s.why, saved:s.saved, penalty:s.penalty, cashPct:s.cashPct, cashNet:s.cashNet, loss:s.loss, payoff:s.payoff, newAmt:s.newAmt }; },{lid:LID,patch});
  const payoff=await setup(0.0450,0.10);
  let v=await verdict({originalAmount:payoff*1.25});
  ok(v.kind==='decision'&&Math.abs(v.cashNet-(payoff*1.25-payoff-v.penalty))<0.01&&v.cashNet>0,'penalty 10%, 25% extra cash → your decision, with '+money(v.cashNet)+' cash (new loan − what you owe − the penalty)');
  await setup(0.0450,0.23);
  v=await verdict({originalAmount:payoff*1.21});
  ok(v.kind==='no'&&v.why==='loses'&&v.cashPct>0.20&&v.loss>0&&Math.abs(v.loss-(v.penalty-(v.newAmt-v.payoff)))<0.01,'penalty 23%, 21% extra cash → Don\'t refinance — you\'d lose '+money(v.loss)+' (was "your decision" before 2.9.14)');
  v=await verdict({originalAmount:payoff*1.25});
  ok(v.kind==='decision'&&v.cashNet>0,'penalty 23%, 25% extra cash → still your decision ('+money(v.cashNet)+' cash)');
  // closing costs don't count: a cash figure that is positive before closing stays a decision even when closing would eat it
  v=await verdict({originalAmount:payoff*1.25,_closingPct:0.05});
  ok(v.kind==='decision','…closing costs (5%) don\'t turn it into a loss — they don\'t count');
  // the screen
  await page.evaluate((lid)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true})); window.LDS_resetRefiDraft(); },LID);
  await page.waitForTimeout(400); await page.click('#refiBtn'); await page.waitForTimeout(700);
  const setAmt=async(x)=>{ await page.evaluate((x)=>{ const i=document.getElementById('o1_amount'); i.value=String(x); i.dispatchEvent(new Event('change',{bubbles:true})); },Math.round(x)); await page.waitForTimeout(600); };
  await setAmt(payoff*1.21);
  let T=await page.evaluate(()=>({ v:document.querySelector('[data-refiverdict]').getAttribute('data-refiverdict'), t:document.querySelector('[data-refiverdict]').innerText.replace(/\s+/g,' ') }));
  ok(T.v==='no'&&/penalty is more than the extra cash/.test(T.t)&&/you’d lose \$[\d,]+\.\d\d/.test(T.t)&&/Don’t refinance/.test(T.t),'the screen: "'+((T.t.match(/the \$[\d,.]+ early-payoff penalty is more than the extra cash.*?you’d lose \$[\d,]+\.\d\d/)||[''])[0])+'"');
  await setAmt(payoff*1.25);
  T=await page.evaluate(()=>({ v:document.querySelector('[data-refiverdict]').getAttribute('data-refiverdict'), opts:[...document.querySelectorAll('[data-refidecision] p.font-bold')].map(p=>p.textContent), d:window.LDS_refiDraft().originalAmount }));
  const exp=await verdict({originalAmount:T.d});
  ok(T.v==='decision'&&T.opts[0]==='Refinance now — with '+money(exp.cashNet)+' cash','the decision label is the new loan − what you owe − the penalty: "'+T.opts[0]+'"');
  // #185 + R1: the amount can't be lowered into a loss (22% extra cash is still > 20%, but below the 23% penalty)
  await setAmt(payoff*1.22);
  const pop=await page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden')?document.getElementById('confirmText').textContent:''; });
  const stay=await page.evaluate(()=>window.LDS_refiDraft().originalAmount);
  ok(/won’t be able to refinance/.test(pop)&&Math.abs(stay-T.d)<2,'lowering the amount into a loss is refused with the pop-up; the amount stays');
  await page.evaluate(()=>{ const b=document.getElementById('confirmOk'); if(b) b.click(); });

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all 2.9.14 R1 + A1 e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
