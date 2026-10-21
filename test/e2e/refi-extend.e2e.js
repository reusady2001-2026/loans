/* e2e — next stage F4 (a DRAFT): lender scenarios in the refinance, on Queens Gate (built-in data).
   D1  a loan that must be dealt with: can't cover what you owe AND its rate resets within 12 months → "pay down $X"
       (data-refiverdict="paydown"), the reset next to today's rate, Save allowed up to what it supports (the gap paid in)
   D9  the refinance's own inputs kept with the property (assumptions.json, "refi"), with history; old browser limits move in once
       appraised value: replaces NOI ÷ cap rate in the LTV limit and in the line under the amount
   D7  extend with today's lender: owed when today's terms end, what its limits allow, the pay-down (worked out here on its
       own), coverage at the extended amount, each penalty choice (full / on the pay-down / a part % / a part $ / none,
       "assumed" until one is picked), the fee, the cash needed
   D10 Save the extension: the same loan record — new maturity, rate terms, status Extended, the pay-down as a principal
       payment in the schedule, a history entry per field; Undo puts it back exactly
   D11 interest-only for the whole term: the hint, both coverage lines shown
   D13 lender presets (local: this app is the admin): picking one fills the limits and names it; a type it doesn't allow is greyed
   + a loan outside the 12 months that can't cover stays "Don't refinance"; the assistant sets the appraisal and the deal
   Run: GN=/opt/node22/lib/node_modules LDS_CLOUD_OFF=1 xvfb-run -a /opt/node22/bin/node test/e2e/refi-extend.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const RefiExtend=require(path.join(APP,'refi-extend.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refiext-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b,t)=>typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<(t||0.02);
const money=(t)=>{ const m=String(t||'').match(/\$([\d,]+\.\d\d)/); return m?Number(m[1].replace(/,/g,'')):null; };

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_CLOUD_OFF:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);
  let ids=await page.evaluate(()=>{ const L=window.LDS_loans(); const q=L.find(x=>/queens gate/i.test(x.propertyName||'')); return { q:q&&q._id }; });

  // ---- D9: this computer's old limits move into the property's record once ----
  await page.evaluate((id)=>{ localStorage.setItem('ldsHub.refiLimits.v1', JSON.stringify({ [id]: { dscr: 1.3, off: ['Debt Yield'] } })); }, ids.q);
  await page.reload(); await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);
  await require('./_t12seed').seedT12(page);   // (2026-10-21) a refinance is sized on the property's T12: each property's NOI as its T12 NOI
  const Q=()=>page.evaluate((id)=>window.LDS_loans().find(x=>x._id===id),ids.q);
  const openRefi=async(id)=>{ await page.click('[data-tabsel="home"]').catch(()=>{}); await page.waitForTimeout(300);
    await page.evaluate((id)=>{ const tr=document.querySelector('tr[data-goto="'+id+'"]'); if(tr) tr.click(); },id); await page.waitForTimeout(500);
    await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:10000}).catch(()=>{});
    await page.click('#refiBtn').catch(()=>{});
    await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-refiverdict]').length>0,null,{timeout:10000}).catch(()=>{});
    await page.waitForTimeout(1500); };
  await openRefi(ids.q);
  const moved=await page.evaluate(async(id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const k=window.LDS_refiHomeKey(l); const b=await window.LDS_readAssumptions(k);
    const h=await window.LDS_propHistory(k); return { file:b&&b.refi&&b.refi[id], local:JSON.parse(localStorage.getItem('ldsHub.refiLimits.v1')||'{}')[id]||null, lim:window.LDS_refiLimits(l), hist:(h.entries||[]).filter(e=>/Refinance · lender limits/.test(e.label)).map(e=>e.old+' → '+e.new) }; },ids.q);
  ok(moved.file&&moved.file.limits&&moved.file.limits.dscr===1.3&&!moved.local, 'the old browser limits moved into the property’s assumptions.json (refi), and out of the browser');
  ok(moved.lim.dscr===1.3&&moved.lim.off.indexOf('Debt Yield')>=0&&moved.hist.length===1&&/kept on this computer only/.test(moved.hist[0]), 'the move is in the history once ('+(moved.hist[0]||'').slice(0,80)+'…)');
  await page.click('#refiView [data-refilimreset]').catch(()=>{}); await page.waitForTimeout(1200);

  // ---- D1: must act — the rate resets within 12 months and the property can't cover ----
  let s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const v=window.LDS_refiVerdict(l);
    return { kind:document.querySelector('[data-refiverdict]').getAttribute('data-refiverdict'), v:{ paydown:v.paydown, payDown:v.payDown, max:v.can.maxLoan, payoff:v.can.payoff, reset:v.reset },
      when:(document.querySelector('[data-refimustwhen]')||{}).textContent||'', refi:(document.querySelector('[data-refipaydown="refi"]')||{}).textContent||'', resetStat:(document.querySelector('[data-refireset]')||{}).textContent||'',
      save:(document.getElementById('refiSaveBtn')||{}).textContent||'', amount:Number((document.getElementById('o1_amount')||{}).value), title:(document.querySelector('[data-refiverdict] p')||{}).textContent||'' }; },ids.q);
  ok(s.kind==='paydown'&&s.v.paydown, 'Queens Gate: data-refiverdict="paydown" ('+s.title.slice(0,70)+')');
  ok(/resets Dec 1, 2026/.test(s.when)&&/3\.00% → /.test(s.when)&&s.v.reset&&s.v.reset.to>0.03, 'says when the rate resets and to what ('+s.when.trim().slice(0,70)+')');
  ok(near(s.v.payDown,s.v.payoff-s.v.max)&&near(money(s.refi),Math.round(s.v.payDown*100)/100,0.011), 'To refinance at these limits: pay down '+money(s.refi)+' = what you owe − what it supports');
  ok(/→/.test(s.resetStat)&&/12\/01\/2026/.test(s.resetStat), 'the reset is shown next to today’s rate ('+s.resetStat.trim()+')');
  ok(/pay in \$/.test(s.save)&&s.amount<=Math.floor(s.v.max)+1, 'Save as a loan is allowed up to what it supports, the gap paid in ('+s.save.trim()+')');
  const sum=await page.evaluate(()=>Promise.resolve(window.LDS_asstAction({action:'start_refinance',args:{name:'Queens Gate'}})).then(x=>({ msg:(x&&x.msg)||'', card:([...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop()||{}).textContent||'' })));
  ok(/Must act: today’s rate resets/.test(sum.msg+sum.card)&&/pay down \$/.test(sum.msg+sum.card), 'the assistant’s summary says it must act and the pay-down');
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditCancel:not(:disabled)')].pop(); if(b) b.click(); }); await page.waitForTimeout(300);

  // ---- appraised value (kept with the refinance) ----
  await page.fill('#refiView [data-refiappr="value"]','65000000'); await page.dispatchEvent('#refiView [data-refiappr="value"]','change'); await page.waitForTimeout(1500);
  s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const c=window.LDS_refiCanStage(l); return { ltv:c.legs.LTV, lim:c.limits.ltv, value:c.value, at:(document.querySelector('[data-refiatloan]')||{}).textContent||'', fact:(document.querySelector('[data-refivalue]')||{}).textContent||'' }; },ids.q);
  ok(near(s.ltv,s.lim*65000000)&&s.value===65000000, 'the LTV limit is measured on the appraisal: '+Math.round(s.ltv)+' = '+(s.lim*100)+'% × $65,000,000');
  ok(/on the appraisal/.test(s.at)&&/the appraisal/.test(s.fact), 'the line under the amount and the Value line say so');
  const rec1=await page.evaluate(async(id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const b=await window.LDS_readAssumptions(window.LDS_refiHomeKey(l)); return b&&b.refi&&b.refi[id]; },ids.q);
  ok(rec1&&rec1.appraisal&&rec1.appraisal.value===65000000, 'the appraisal is kept in the property’s assumptions.json');
  await page.click('#refiView [data-refihist]'); await page.waitForTimeout(1200);
  const hm=await page.evaluate(()=>{ const m=document.getElementById('historyModal'); return m?m.textContent:''; });
  ok(/Refinance — change history/.test(hm)&&/Refinance · appraised value/.test(hm)&&/\$65,000,000/.test(hm)&&/Refinance · lender limits/.test(hm), 'the refinance’s own Change history lists the appraisal and the limits');
  await page.evaluate(()=>{ const m=document.getElementById('historyModal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } });

  // ---- D7: extend with today's lender ----
  await page.click('#refiView [data-refideal="extend"]'); await page.waitForTimeout(1500);
  // the operator, after testing (2026-10-15): the kind of deal comes first, and with "Extend" everything below is the
  // extension's — its own verdict (not a new loan's), its rate, one limits table, its terms, and its payment schedule
  let lay=await page.evaluate(()=>({ order:[...document.querySelectorAll('#refiView [data-refidealrow], #refiView [data-refiverdict], #refiView [data-refiext="draft"], #refiView [data-refiextsched]')].map(e=>e.hasAttribute('data-refidealrow')?'deal':e.hasAttribute('data-refiverdict')?'verdict':e.hasAttribute('data-refiextsched')?'schedule':'terms'),
    kind:(document.querySelector('#refiView [data-refiverdict]')||{getAttribute:()=>''}).getAttribute('data-refiverdict'), rtype:document.querySelectorAll('#refiView [data-rtype]').length, amount:!!document.getElementById('o1_amount'),
    basis:document.querySelectorAll('#refiView [data-refibasis]').length, ext:document.querySelectorAll('#refiView [data-refibasisext] [data-refiextlim]').length, newLims:document.querySelectorAll('#refiView [data-refilim]').length,
    presets:document.querySelectorAll('#refiView [data-refipresetrow], #refiView [data-refiextpresetrow]').length, value:document.querySelectorAll('#refiView [data-refiappr="value"]').length,
    saveNew:!!document.getElementById('refiSaveBtn'), saveExt:!!document.getElementById('refiExtSaveBtn') }));
  ok(lay.order.join(',')==='deal,verdict,terms,schedule', 'the kind of deal comes first, then the extension’s verdict, its terms and its schedule ('+lay.order.join(' → ')+')');
  ok(lay.kind==='extend' && lay.rtype===0 && !lay.amount, 'with Extend, the verdict is the extension’s ('+lay.kind+') — no Fixed / Floating / Hybrid, no new-loan amount');
  ok(lay.basis===1 && lay.ext===4 && lay.newLims===0 && lay.presets===1 && lay.value===1, 'nothing twice: one limits table (the extension’s), one preset row, one appraised value');
  ok(!lay.saveNew && lay.saveExt, 'the button on top is “Save the extension” (no “Save as a loan”)');
  const setLim=async(k,v)=>{ await page.fill('#refiView [data-refiextlim="'+k+'"]',String(v)); await page.dispatchEvent('#refiView [data-refiextlim="'+k+'"]','change'); await page.waitForTimeout(900); };
  await setLim('dscr',1.11); await setLim('dscrIO',1.35);
  const extF=async(f,v)=>{ const sel=await page.$('#refiView select[data-refiextf="'+f+'"]'); if(sel) await page.selectOption('#refiView select[data-refiextf="'+f+'"]',String(v)); else await page.fill('#refiView [data-refiextf="'+f+'"]',String(v)); await page.dispatchEvent('#refiView [data-refiextf="'+f+'"]','change'); await page.waitForTimeout(900); };
  await extF('index','sofr30'); await extF('spreadBps',200); await extF('months',36);
  const R=()=>page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const r=window.LDS_refiExtResult(l); const c=window.LDS_compute(l);
    return { r, rows:c.rows.map(x=>({d:x.paymentDate,end:x.endingBalance,start:x.startingBalance,type:x.type})), pen:window.LDS_refiPenalty(l),
      pd:(document.querySelector('[data-refipaydown="extend-card"]')||{}).textContent||'', cash:(document.querySelector('[data-refiextcash]')||{}).textContent||'', assumed:!!document.querySelector('[data-refiextassumed]'),
      verdictExt:(document.querySelector('[data-refipaydown="extend"]')||{}).textContent||'' }; },ids.q);
  let x=await R();
  // worked out here on its own: owed when today's terms end, the limits at 30-day SOFR + 200, interest-only
  const k=x.rows.reduce((a,row,i)=>row.d<=x.r.terms.date?i:a,-1), owed=x.rows[k].end;
  const rate=x.r.rate, lc=(12*(rate/12))/(1-Math.pow(1+rate/12,-360));
  const legs=[x.r.noi/(1.11*lc), x.r.noi/(1.35*rate), 0.75*65000000, x.r.noi/0.07];
  const allowed=Math.min(...legs), payDown=Math.max(0,owed-allowed);
  ok(x.r.terms.date==='2026-11-01'&&near(x.r.owed,owed), 'today’s terms end Nov 1, 2026 (the payment before the reset); owed then '+Math.round(owed));
  ok(near(x.r.allowed,allowed,1)&&near(x.r.payDown,payDown,1), 'what its limits allow ('+Math.round(allowed)+') and the pay-down ('+Math.round(payDown)+') match the arithmetic');
  ok(near(money(x.pd),Math.round(payDown*100)/100,1), 'the card shows the pay-down needed: '+x.pd.trim());
  ok(/To extend with today’s lender: pay down/.test(x.verdictExt)&&near(money(x.verdictExt),Math.round(payDown*100)/100,1), 'the extension’s verdict: "To extend with today’s lender: pay down $Y"');
  const ev=await page.evaluate((id)=>{ const v=window.LDS_refiExtVerdict(window.LDS_loans().find(x=>x._id===id)); return { kind:v.kind, why:v.why }; },ids.q);
  const should=await page.evaluate(()=>[...document.querySelectorAll('#refiView [data-refiverdict] p')].map(p=>p.textContent).find(t=>/^Should you\?/.test(t))||'');
  ok(ev.kind==='yes'&&ev.why==='reset'&&/Should you\? Yes/.test(should), 'Should you? Yes — today’s rate resets within 12 months (the same rule as a new loan, applied to the extension)');
  const sch=await page.evaluate(()=>{ const b=document.querySelector('#refiView [data-refiextsched]'); return { title:(b.querySelector('h3')||{}).textContent||'', first:(b.querySelector('tbody tr td:nth-child(2)')||{}).textContent||'', paid:(b.querySelector('[data-schedpaid]')||{}).textContent||'', starts:!!b.querySelector('[data-schedext]'), extRows:b.querySelectorAll('[data-schedext-row]').length, rows:b.querySelectorAll('tbody tr').length }; });
  ok(/from today to 11\/01\/2029/.test(sch.title)&&/Oct 2026/.test(sch.first), 'the payment schedule with the extension, from today (Oct 2026) to the new maturity ('+sch.title.trim()+')');
  ok(near(money(sch.paid),Math.round(payDown*100)/100,1)&&sch.starts&&sch.extRows===36, 'it shows the pay-down ('+sch.paid.trim()+'), where the extension starts, and its 36 months');
  ok(x.r.implied&&near(x.r.implied.ltv,x.r.amount/65000000,1e-6)&&near(x.r.implied.dscrIO,x.r.noi/(x.r.amount*rate),1e-6), 'coverage at the extended amount: LTV on the appraisal, interest-only DSCR');
  // each penalty choice
  const full=x.pen;
  ok(x.assumed&&near(x.r.penalty.amount,Math.round(full*payDown/owed*100)/100,0.02), 'not picked: the penalty on the pay-down, marked "assumed — confirm with the lender"');
  await extF('penaltyHow','full'); x=await R(); ok(!x.assumed&&near(x.r.penalty.amount,Math.round(full*100)/100,0.02), 'the full penalty: '+x.r.penalty.amount);
  await extF('penaltyHow','paydown'); x=await R(); ok(!x.assumed&&near(x.r.penalty.amount,Math.round(full*payDown/owed*100)/100,0.02), 'on the pay-down only: '+x.r.penalty.amount);
  await extF('penaltyHow','pct'); await extF('penaltyPct',40); x=await R(); ok(near(x.r.penalty.amount,Math.round(full*0.4*100)/100,0.02), 'a part, 40% of the full penalty: '+x.r.penalty.amount);
  await extF('penaltyHow','amt'); await extF('penaltyAmt',250000); x=await R(); ok(x.r.penalty.amount===250000, 'a part, a dollar amount: '+x.r.penalty.amount);
  await extF('penaltyHow','none'); x=await R(); ok(x.r.penalty.amount===0, 'none: 0');
  await extF('penaltyHow','paydown'); await extF('feeValue',0.5); x=await R();
  ok(near(x.r.fee,Math.round(0.005*x.r.amount*100)/100,0.02)&&near(money(x.cash),Math.round((x.r.payDown+x.r.penalty.amount+x.r.fee)*100)/100,0.03), 'fee 0.5% of the extended amount; cash needed = pay-down + penalty + fee ('+x.cash.trim()+')');
  ok(await page.evaluate(()=>/interest-only for its whole term/.test((document.querySelector('#refiView [data-refibasisext] [data-refiiohint]')||{}).textContent||'')), 'D11: whole-term interest-only — the hint to untick the amortizing line; both lines shown');
  const pure=RefiExtend.extend({ owed, noi:x.r.noi, value:65000000, rate, amortMonths:360, limits:{dscr:1.11,dscrIO:1.35,ltv:0.75,dy:0.07}, off:[], penaltyFull:full, penalty:{how:'paydown'}, fee:{kind:'pct',value:0.005} });
  ok(near(pure.cash,x.r.cash,0.05), 'the screen and refi-extend.js agree on the cash needed');
  const recE=await page.evaluate(async(id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const b=await window.LDS_readAssumptions(window.LDS_refiHomeKey(l)); return b&&b.refi&&b.refi[id]; },ids.q);
  ok(recE&&recE.deal==='extend'&&recE.ext&&recE.ext.limits&&recE.ext.limits.dscr===1.11&&recE.ext.spreadBps===200&&recE.ext.penalty.how==='paydown', 'the deal and the extension’s terms are kept with the property');

  // ---- D10: save the extension ----
  const before=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return { loan:JSON.parse(JSON.stringify(l)), rows:JSON.stringify(window.LDS_compute(l).rows.map(r=>[r.paymentDate,r.rate,r.payment,r.endingBalance,r.type])) }; },ids.q);
  const exp=x.r;
  await page.click('#refiExtSaveBtn'); await page.waitForTimeout(400);
  const dlg=await page.evaluate(()=>(document.getElementById('confirmText')||{}).textContent||'');
  ok(/Today's loan stays the same record/.test(dlg)&&/paid down \$/.test(dlg), 'Save the extension asks first ('+dlg.slice(0,90)+'…)');
  await page.click('#confirmOk'); await page.waitForTimeout(1200);
  const after=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const c=window.LDS_compute(l); return { l:JSON.parse(JSON.stringify(l)), rows:c.rows.map(r=>({d:r.paymentDate,rate:r.rate,pay:r.payment,end:r.endingBalance,start:r.startingBalance,type:r.type,pd:r.paydown||0,ext:!!r.ext})), d:c.derived }; },ids.q);
  ok(after.l._id===ids.q&&after.l.loanStatus==='Extended'&&after.l.rateType==='Floating'&&after.l.index==='sofr30'&&near(after.l.spread,0.02,1e-9), 'the same loan record: status Extended, rate 30-day SOFR + 200');
  ok(after.l.maturityDate===exp.newMaturity&&after.l.maturityDate==='2029-11-01', 'new maturity '+after.l.maturityDate+' (36 months from Nov 2026)');
  const pp=(after.l.principalPayments||[])[0];
  ok(pp&&pp.date==='2026-11-01'&&near(pp.amount,exp.payDown,0.01), 'the pay-down is a principal payment on Nov 1, 2026: '+(pp&&pp.amount));
  const rk=after.rows.findIndex(r=>r.d==='2026-11-01'), nx=after.rows[rk+1];
  ok(rk>=0&&near(after.rows[rk].pd,exp.payDown,0.01)&&near(after.rows[rk].end,owed-exp.payDown,0.01), 'the schedule shows the principal payment and the balance after it ('+Math.round(after.rows[rk].end)+')');
  ok(nx&&nx.ext&&nx.type==='io'&&near(nx.rate,exp.rate,1e-9)&&near(nx.start,owed-exp.payDown,0.01), 'Dec 1, 2026: interest-only at the new rate on the paid-down balance');
  ok(after.rows[after.rows.length-1].d==='2029-11-01'&&after.rows[after.rows.length-1].type==='balloon', 'the schedule ends at the new maturity with the balloon');
  ok(JSON.stringify(after.rows.slice(0,rk).map(r=>[r.d,r.rate,r.pay])).length>0&&after.rows.slice(0,rk).every((r,i)=>{ const b=JSON.parse(before.rows)[i]; return b&&b[0]===r.d&&near(b[1],r.rate,1e-12)&&near(b[2],r.pay,1e-6); }), 'nothing before Nov 2026 changes');
  const hist=(after.l._history||[]).filter(h=>/^Extended with /.test(h.note||''));
  const hf=new Set(hist.map(h=>h.field));
  ok(['maturityDate','rateType','index','spread','loanStatus','principalPayments'].every(f=>hf.has(f)), 'a history entry for every field ('+[...hf].join(', ')+')');
  ok(/Extended with New York Community Bank: 36 months interest-only at 30-day Av(erage|g) SOFR \+ 200 bps from 11\/01\/2026; paid down \$/.test(hist[0].note), 'the note: '+hist[0].note);

  // ---- Undo the extension ----
  await openRefi(ids.q);
  ok(await page.$('#refiView [data-refiext="saved"]')!==null, 'the refinance shows the saved extension, with Undo');
  await page.click('#refiView [data-refiextundo]'); await page.waitForTimeout(300); await page.click('#confirmOk'); await page.waitForTimeout(1200);
  const undone=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return { l:JSON.parse(JSON.stringify(l)), rows:JSON.stringify(window.LDS_compute(l).rows.map(r=>[r.paymentDate,r.rate,r.payment,r.endingBalance,r.type])) }; },ids.q);
  ok(!undone.l.extension&&undone.l.rateType===before.loan.rateType&&undone.l.maturityDate===before.loan.maturityDate&&(undone.l.loanStatus||'')===(before.loan.loanStatus||'')&&!(undone.l.principalPayments||[]).length, 'Undo: back to Hybrid ARM, maturity '+undone.l.maturityDate+', no principal payment');
  ok(undone.rows===before.rows, 'Undo: the schedule is exactly what it was');
  ok((undone.l._history||[]).some(h=>/^Undid the extension/.test(h.note||'')), 'the undo is in the history too');

  // ---- D13 presets (this app is local: it is the admin) ----
  await openRefi(ids.q);
  await page.click('#refiView [data-refideal="new"]'); await page.waitForTimeout(1200);
  lay=await page.evaluate((id)=>({ kind:document.querySelector('#refiView [data-refiverdict]').getAttribute('data-refiverdict'), newLims:document.querySelectorAll('#refiView [data-refilim]').length, extLims:document.querySelectorAll('#refiView [data-refiextlim]').length, rtype:document.querySelectorAll('#refiView [data-rtype]').length,
    keep:(window.LDS_refiRec(window.LDS_loans().find(x=>x._id===id)).ext||{}).limits }),ids.q);
  ok(lay.kind==='paydown'&&lay.newLims===4&&lay.extLims===0&&lay.rtype===3&&lay.keep&&lay.keep.dscr===1.11, 'back to New loan: the new loan’s verdict and limits again; the extension’s limits are kept for later');
  await page.click('#refiView [data-presetmanage]'); await page.waitForTimeout(300);
  await page.click('#presetModal [data-presetadd]'); await page.waitForTimeout(200);
  const pf=async(f,v)=>{ await page.fill('#presetModal [data-pi="0"][data-pf="'+f+'"]',String(v)); await page.dispatchEvent('#presetModal [data-pi="0"][data-pf="'+f+'"]','change'); };
  await pf('name','Fannie Mae'); await pf('dscr',1.25); await pf('ltv',75); await pf('dy',7); await pf('maxAmortYears',30); await pf('source','test');
  await page.uncheck('#presetModal [data-pi="0"][data-pf="type:Floating"]'); await page.dispatchEvent('#presetModal [data-pi="0"][data-pf="type:Floating"]','change');
  await page.click('#presetModal [data-presetsave]'); await page.waitForTimeout(900);
  const ps=await page.evaluate(()=>window.LDS_lenderPresets());
  ok(ps.length===1&&ps[0].name==='Fannie Mae'&&ps[0].rateTypes.indexOf('Floating')<0&&ps[0].limits.ltv===0.75, 'the admin adds a preset (Fannie Mae, no floating)');
  await page.selectOption('#refiView [data-refipreset]',ps[0].id); await page.dispatchEvent('#refiView [data-refipreset]','change'); await page.waitForTimeout(1500);
  s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const lim=window.LDS_refiLimits(l);
    return { lim, chip:(document.querySelector('[data-refipresetchip]')||{}).textContent||'', off:(document.querySelector('#refiView [data-rtype="Floating"]')||{}).getAttribute&&document.querySelector('#refiView [data-rtype="Floating"]').getAttribute('data-rtypeoff') }; },ids.q);
  ok(s.lim.dscr===1.25&&s.lim.ltv===0.75&&s.lim.dy===0.07&&/Fannie Mae preset/.test(s.chip), 'picking it fills the limits, and the table says "'+s.chip.trim().slice(0,40)+'"');
  ok(s.off==='Fannie Mae: no floating', 'a rate type it doesn’t allow is greyed with the reason ("'+s.off+'")');
  await page.click('#refiView [data-rtype="Floating"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(()=>window.LDS_refiDraft().rateType)!=='Floating', 'clicking it doesn’t switch to floating');

  // ---- a loan outside the 12 months that can't cover: "Don't refinance", as before ----
  const other=await page.evaluate(()=>{ const L=window.LDS_loans().filter(l=>!l.archived); for(const l of L){ try{ const v=window.LDS_refiVerdict(l); if(v.can.sized&&!v.can.can&&!v.paydown) return l._id; }catch(e){} } return null; });
  if(other){ await openRefi(other); ok(await page.evaluate(()=>document.querySelector('[data-refiverdict]').getAttribute('data-refiverdict'))==='no', 'a loan that can’t cover but doesn’t mature or reset within 12 months: still "Don’t refinance"'); }
  else ok(true, '(no other loan here that can’t cover outside the 12 months)');
  const nv=await page.evaluate(()=>{ for(const l of window.LDS_loans().filter(l=>!l.archived)){ try{ const v=window.LDS_refiExtVerdict(l); if(v&&v.r&&v.why==='notyet') return { name:l.propertyName, kind:v.kind, date:v.r.terms.date }; }catch(e){} } return null; });
  ok(nv&&nv.kind==='no', 'a loan whose terms run past 12 months: the extension says “Not yet” ('+(nv?nv.name+', to '+nv.date:'none found')+')');

  // ---- the assistant: the appraisal and the deal, behind a card ----
  const r=await page.evaluate(()=>Promise.resolve(window.LDS_asstAction({action:'set_refi_terms',args:{name:'Queens Gate',changes:{appraisedValue:70000000, deal:'extend'}}})).then(x=>({ pending:!!(x&&x.pending), text:([...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop()||{}).textContent||'' })));
  ok(r.pending&&/Appraised value/.test(r.text)&&/Extend with today’s lender/.test(r.text), 'set_refi_terms shows a card with the appraisal and the deal');
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop(); if(b) b.click(); }); await page.waitForTimeout(1500);
  const rec2=await page.evaluate((id)=>window.LDS_refiRec(window.LDS_loans().find(x=>x._id===id)),ids.q);
  ok(rec2.appraisal&&rec2.appraisal.value===70000000&&rec2.deal==='extend', 'approved: the appraisal is $70,000,000 and the deal is the extension');
  const names=await page.evaluate(()=>window.LDS_asstActionNames());
  ok(['set_extension','save_extension','undo_extension'].every(n=>names.indexOf(n)>=0), 'the assistant has set_extension, save_extension and undo_extension');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all refi-extend e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
