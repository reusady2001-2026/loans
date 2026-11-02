/* e2e for v2.8.8, reworked 2026-10-21: Claude's "what to push" moves appear as checkboxes in the refinance calculator.
   A push is future and only raises the NOI; it carries three effects — on the in-place T12, on the Safe and on the
   Aggressive underwriting, each net of what that version already counts. Ticking a move adds its effect ON THE BASIS
   CHOSEN for its property and RE-DRIVES the two-stage verdict live; switching the basis switches the effect. The ticks
   are the operator's plan, kept with the refinance (never in the property's NOI).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-push.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refipush-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  const loanId=await page.evaluate((k)=>{const ps=(window.opProperties?window.opProperties():[]);const p=ps.find(x=>x.key===k);return p&&p.loans&&p.loans[0]?p.loans[0]._id:null;},KEY);
  ok(!!loanId,'Villages of Whitewater (single-loan) exists to open');

  // select the loan (loan view); the property has a T12 (in-place 5,000,000) and an APPROVED underwriting (Safe 4,800,000,
  // Aggressive 4,900,000); inject a saved "what to push" with two moves, each with its three effects.
  await page.evaluate((lid)=>{const s=document.getElementById('loanSelect'); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true}));}, loanId);
  await page.waitForFunction(()=>{const v=document.getElementById('loanView'); return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  const setup = await page.evaluate((lid)=>{
    const l=window.LDS_loans().find(x=>x._id===lid);
    l.rateType='Fixed'; l.isHistorical=false; l.amortType='Level'; l.annualRate=0.06; l.noi=5000000; l.capRate=0.05;
    l.floatIndexValue=null; l.floatIndexLive=null; l.armInitialFixedMonths=null; l.armAdjustFreqMonths=null; l.stackWith=null;
    const key=window.propertyKey(l);
    window.LDS_setGDNOI(key, { inPlace:5000000, underwritten:4800000, underwrittenAggressive:4900000, uwModel:2, uwApproved:{ at:new Date().toISOString(), by:'Test', current:true } });
    window.LDS_setPush(key, { summary:'Push rents; trim utilities.', at:{vacancyPct:0.05,mgmtPct:0.025}, computedAt:new Date().toISOString(), moves:[
      { title:'Push rents to market', rank:1, impact:'about $150,000 a year', impactInPlace:200000, impactSafe:150000, impactAggressive:120000, lever:'rent', effort:'moderate', rationale:'Below-market in-place rents.' },
      { title:'Trim utilities', rank:2, impact:'about $100,000 a year', impactInPlace:100000, impactSafe:100000, impactAggressive:100000, lever:'utilities', effort:'light', rationale:'High utility run-rate.' } ] });
    window.LDS_resetRefiDraft();
    return { key: key };
  }, loanId);
  ok(!!setup.key, 'a T12, an approved underwriting and a saved push were set up for the property');

  await page.waitForFunction(()=>{const b=document.getElementById('refiBtn'); return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
  await page.click('#refiBtn').catch(()=>{});
  await page.waitForFunction(()=>{const v=document.getElementById('refiView'); return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-refimove]').length>0,null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const RENTS='#refiView [data-refimovetitle="Push rents to market"]';
  const st=()=>page.evaluate(()=>{ const l=window.LDS_activeLoan(); return { noi: window.LDS_refiNOI(l), max: window.LDS_refiCanStage(l).maxLoan, boost: window.LDS_refiMoveBoost(l), basis: window.LDS_refiBasis(l), rec: window.LDS_refiRec(l), text:(document.getElementById('refiView')||{}).innerText||'' }; });

  // ---- the moves render as checkboxes with their three effects ----
  const view = await page.evaluate(()=>({ text:(document.getElementById('refiView')||{}).innerText||'', boxes:document.querySelectorAll('#refiView [data-refimove]').length }));
  ok(view.boxes===2, 'both push moves render as checkboxes in the refinance ('+view.boxes+')');
  ok(/What to push/i.test(view.text) && /Push rents to market/i.test(view.text), 'the push section names the moves');
  ok(/in.?place \+\$200,000/i.test(view.text) && /Safe \+\$150,000/.test(view.text) && /Aggressive \+\$120,000/.test(view.text), 'each move shows its in-place, Safe and Aggressive effects');

  // ---- ticking a move raises the working NOI by its effect on the basis in use (Safe, once approved) and re-drives the verdict ----
  const before = await st();
  ok(before.basis==='underwritten' && Math.abs(before.noi-4800000)<1, 'the refinance starts on the approved Safe underwriting (4,800,000; got '+before.basis+' '+before.noi+')');
  await page.click(RENTS).catch(()=>{});
  await page.waitForTimeout(600);
  const after = await st();
  ok(Math.abs((after.noi - before.noi) - 150000) < 1, 'ticking "Push rents" adds its Safe effect (+$150,000) to the working NOI ('+before.noi+' → '+after.noi+')');
  ok(after.boost===150000, 'the applied boost equals the checked move’s Safe effect');
  ok(after.max > before.max + 1, 'the two-stage verdict re-drives on the higher NOI — the property now supports a bigger loan ('+Math.round(before.max)+' → '+Math.round(after.max)+')');
  ok(/\+\$150,000\.00\/yr added to the NOI/.test(after.text), 'the panel shows the applied boost');
  ok(after.rec && after.rec.pushes && JSON.stringify(after.rec.pushes[setup.key])==='["Push rents to market"]', 'the tick is kept with the refinance ('+JSON.stringify(after.rec&&after.rec.pushes)+')');

  // ---- the same tick counts its effect on whichever basis is chosen ----
  await page.click('#refiView [data-noibasis="inplace"]').catch(()=>{}); await page.waitForTimeout(600);
  const inp = await st();
  ok(inp.basis==='inplace' && Math.abs(inp.noi-5200000)<1 && inp.boost===200000, 'on the In-place T12: 5,000,000 + its in-place effect 200,000 ('+inp.noi+')');
  await page.click('#refiView [data-noibasis="aggressive"]').catch(()=>{}); await page.waitForTimeout(600);
  const ag = await st();
  ok(ag.basis==='aggressive' && Math.abs(ag.noi-5020000)<1 && ag.boost===120000, 'on the Aggressive underwriting: 4,900,000 + its Aggressive effect 120,000 ('+ag.noi+')');

  // ---- unticking restores it ----
  await page.click(RENTS).catch(()=>{});
  await page.waitForTimeout(500);
  const restored = await st();
  ok(Math.abs(restored.noi - 4900000) < 1 && restored.boost===0, 'unticking restores the working NOI ('+restored.noi+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all refi push-checkbox e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
