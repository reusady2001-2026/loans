/* e2e for v2.8.8: Claude's "what to push" moves appear as checkboxes in the refinance calculator,
   each with its two NOI-impact figures (in-place + underwritten). Ticking a move adds its impact to
   the working NOI on the active basis and RE-DRIVES the two-stage verdict live (a bigger working NOI
   supports a bigger loan). A what-if — never saved to the property.
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

  // select the loan (loan view), give it a base NOI, and inject a saved "what to push" with two moves,
  // each carrying an in-place and an underwritten annual dollar impact.
  await page.evaluate((lid)=>{const s=document.getElementById('loanSelect'); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true}));}, loanId);
  await page.waitForFunction(()=>{const v=document.getElementById('loanView'); return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  const setup = await page.evaluate((lid)=>{
    const l=window.LDS_loans().find(x=>x._id===lid);
    l.rateType='Fixed'; l.isHistorical=false; l.amortType='Level'; l.annualRate=0.06; l.noi=5000000; l.capRate=0.05;
    l.floatIndexValue=null; l.floatIndexLive=null; l.armInitialFixedMonths=null; l.armAdjustFreqMonths=null; l.stackWith=null;
    const key=window.propertyKey(l);
    window.LDS_setPush(key, { summary:'Push rents; trim utilities.', at:{vacancyPct:0.05,mgmtPct:0.025}, computedAt:new Date().toISOString(), moves:[
      { title:'Push rents to market', rank:1, impact:'about $150,000 a year', impactInPlace:200000, impactUnderwritten:150000, effort:'moderate', rationale:'Below-market in-place rents.' },
      { title:'Trim utilities', rank:2, impact:'about $100,000 a year', impactInPlace:100000, impactUnderwritten:100000, effort:'light', rationale:'High utility run-rate.' } ] });
    window.LDS_resetRefiDraft();
    return { key: key };
  }, loanId);
  ok(!!setup.key, 'a saved push was injected for the property');

  await page.waitForFunction(()=>{const b=document.getElementById('refiBtn'); return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
  await page.click('#refiBtn').catch(()=>{});
  await page.waitForFunction(()=>{const v=document.getElementById('refiView'); return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-refimove]').length>0,null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);

  // ---- the moves render as checkboxes with both impact figures ----
  const view = await page.evaluate(()=>({ text:(document.getElementById('refiView')||{}).innerText||'', boxes:document.querySelectorAll('#refiView [data-refimove]').length }));
  ok(view.boxes===2, 'both push moves render as checkboxes in the refinance ('+view.boxes+')');
  ok(/What to push/i.test(view.text) && /Push rents to market/i.test(view.text), 'the push section names the moves');
  ok(/in.?place/i.test(view.text) && /underwritten/i.test(view.text), 'each move shows its in-place AND underwritten impact');

  // ---- ticking a move raises the working NOI by that move's impact and re-drives the verdict ----
  const before = await page.evaluate(()=>{ const l=window.LDS_activeLoan(); return { noi: window.LDS_refiNOI(l), max: window.LDS_refiCanStage(l).maxLoan }; });
  await page.click('#refiView [data-refimove="0"]').catch(()=>{});
  await page.waitForTimeout(400);
  const after = await page.evaluate(()=>{ const l=window.LDS_activeLoan(); return { noi: window.LDS_refiNOI(l), max: window.LDS_refiCanStage(l).maxLoan, boost: window.LDS_refiMoveBoost(l), text:(document.getElementById('refiView')||{}).innerText||'' }; });
  ok(Math.abs((after.noi - before.noi) - 150000) < 1, 'ticking "Push rents" adds its underwritten impact (+$150,000) to the working NOI ('+before.noi+' → '+after.noi+')');
  ok(after.boost===150000, 'the applied boost equals the checked move’s impact');
  ok(after.max > before.max + 1, 'the two-stage verdict re-drives on the higher NOI — the property now supports a bigger loan ('+Math.round(before.max)+' → '+Math.round(after.max)+')');
  ok(/applied to the working NOI/i.test(after.text), 'the panel shows the applied boost');

  // ---- unticking restores it ----
  await page.click('#refiView [data-refimove="0"]').catch(()=>{});
  await page.waitForTimeout(300);
  const restored = await page.evaluate(()=>{ const l=window.LDS_activeLoan(); return window.LDS_refiNOI(l); });
  ok(Math.abs(restored - before.noi) < 1, 'unticking restores the working NOI ('+restored+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all refi push-checkbox e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
