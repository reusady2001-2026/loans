/* e2e for v2.8.7: the refinance decision is a TWO-STAGE verdict.
     Stage 1 — CAN you? The property must support a new loan at least as big as the
       payoff, sized on all three limits (LTV 75% / DSCR 1.25× / debt yield 7%) at the
       proposed loan's rate. If the ceiling is below the payoff → can't refinance.
     Stage 2 — SHOULD you (only if you can)? Same money at a LOWER rate = yes; same
       money at a higher-or-equal rate = no. Cash-out and a maturing loan are separate yeses.
   The proposed-loan card + amortization schedule + "Save as a loan" appear ONLY when both
   stages clear. A single-loan property with no T12 on disk lets us drive refiNOI via l.noi.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-verdict.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refiverdict-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

// Put the target loan into a controlled state, size the payoff off the mutated loan, set NOI
// as a multiple of that payoff, reset the cached draft, and return the fresh verdict.
async function scenario(page, loanId, factor, rate){
  await page.evaluate((lid)=>{const s=document.getElementById('loanSelect'); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true}));}, loanId);
  await page.waitForFunction(()=>{const v=document.getElementById('loanView'); return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  const s = await page.evaluate(({lid,factor,rate})=>{
    const l=window.LDS_loans().find(x=>x._id===lid);
    l.rateType='Fixed'; l.isHistorical=false; l.amortType='Level'; l.capRate=0.05;
    l.loanTermMonths=480; l.amortizationMonths=480; l.ioMonths=0; l.annualRate=rate;   // far maturity → the maturity-forced path never fires
    l.floatIndexValue=null; l.floatIndexLive=null; l.floatRepricedOn=null; l.armInitialFixedMonths=null; l.armAdjustFreqMonths=null; l.rateFloor=null; l.rateCap=null; l.stackWith=null;
    const payoff = window.LDS_computeBalance(l); l.noi = payoff*factor;
    window.LDS_resetRefiDraft();
    const v = window.LDS_refiVerdict(l);
    return { payoff, noi:l.noi, can:v.can.can, binding:v.can.binding, maxLoan:v.can.maxLoan, gap:v.can.gap, should:(v.should?v.should.should:null), refi:v.refi };
  }, {lid:loanId, factor, rate});
  await page.waitForFunction(()=>{const b=document.getElementById('refiBtn'); return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
  await page.click('#refiBtn').catch(()=>{});
  await page.waitForFunction(()=>{const v=document.getElementById('refiView'); return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const dom = await page.evaluate(()=>({ text:(document.getElementById('refiView')||{}).innerText||'',
    o1:document.querySelectorAll('#refiView [id^="o1_"]').length,
    save:!!document.getElementById('refiSaveBtn'),
    tables:document.querySelectorAll('#refiView table').length }));
  return { s, dom };
}

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  await page.evaluate(()=>{const h=document.querySelector('[data-tabsel="home"]');if(h)h.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('portfolioView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const loanId=await page.evaluate((k)=>{const ps=(window.opProperties?window.opProperties():[]);const p=ps.find(x=>x.key===k);return p&&p.loans&&p.loans[0]?p.loans[0]._id:null;},KEY);
  ok(!!loanId,'Villages of Whitewater (single-loan) exists to open');

  // ---- Stage 1 fails: NOI far too low to support the payoff → CAN'T refinance ----
  const A = await scenario(page, loanId, 0.03, 0.05);
  console.log('    [A: payoff '+Math.round(A.s.payoff)+' · supports '+Math.round(A.s.maxLoan)+' ('+A.s.binding+') · gap '+Math.round(A.s.gap)+']');
  ok(A.s.can===false, 'Stage 1 fails when the most the property supports is below the payoff (Can = No)');
  ok(A.s.refi===false, 'the overall verdict is Don’t refinance');
  ok(!!A.s.binding, 'the binding limit is named ('+A.s.binding+')');
  ok(A.dom.o1===0 && A.dom.save===false, 'no proposed-loan boxes and no Save button when you can’t refinance');
  ok(/Can you\?\s*No/i.test(A.dom.text), 'the card spells out "Can you? No"');
  ok(/shortfall/i.test(A.dom.text) && /(debt yield|loan-to-value|debt coverage)/i.test(A.dom.text), 'it names the shortfall and the limiting metric in plain words');
  ok(!/Should you\?/i.test(A.dom.text), 'Stage 2 is not even asked when Stage 1 fails');

  // ---- Stage 1 clears, Stage 2 fails: same money at a HIGHER rate → shouldn't ----
  const B = await scenario(page, loanId, 0.20, 0.025);
  console.log('    [B: supports '+Math.round(B.s.maxLoan)+' ≥ payoff '+Math.round(B.s.payoff)+' · can='+B.s.can+' should='+B.s.should+']');
  ok(B.s.can===true, 'Stage 1 clears when the property supports more than the payoff (Can = Yes)');
  ok(B.s.should===false, 'Stage 2 fails at the same money and a higher current-vs-proposed rate (Should = No)');
  ok(B.s.refi===false, 'the overall verdict is still Don’t refinance');
  ok(B.dom.o1===0 && B.dom.save===false, 'the proposed loan + Save stay hidden — nothing worth proposing');
  ok(/Can you\?\s*Yes/i.test(B.dom.text) && /Should you\?\s*No/i.test(B.dom.text), 'it shows Can = Yes but Should = No');
  ok(/same money/i.test(B.dom.text), 'it explains the "same money" reasoning (not a payment-based one)');

  // ---- Both clear: cheaper rate on the same money → refinance, proposal revealed ----
  const C = await scenario(page, loanId, 0.20, 0.13);
  console.log('    [C: can='+C.s.can+' should='+C.s.should+' refi='+C.s.refi+']');
  ok(C.s.refi===true, 'both stages clear when the same money is cheaper (Refinance)');
  ok(C.dom.o1>0, 'the proposed-loan editable boxes appear only now (both stages Yes)');
  ok(C.dom.save===true, 'the "Save as a loan" button appears only on a Refinance verdict');
  ok(C.dom.tables>0, 'the amortization schedule appears only on a Refinance verdict');
  ok(/(^|\W)Refinance(\W|$)/.test(C.dom.text) && !/Don.t refinance/i.test(C.dom.text.split('Proposed New Loan')[0]||C.dom.text), 'the banner reads Refinance');

  // ---- card visibility tracks the verdict exactly across all three ----
  ok((A.dom.o1===0)&&(B.dom.o1===0)&&(C.dom.o1>0), 'the proposed-loan card is shown iff the verdict is Refinance');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all two-stage verdict e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
