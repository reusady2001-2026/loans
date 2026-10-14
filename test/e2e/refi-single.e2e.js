/* e2e for v2.8.2: the refinance calculator is a SINGLE analysis with ONE editable
   suggested loan — the Regular/Advanced toggle and the two Option 1/Option 2 selector
   are gone; the verdict and the amortization schedule still render; the one loan's boxes
   are editable and re-drive the panel live.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-single.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refi1-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const count=(page,sel)=>page.evaluate(s=>document.querySelectorAll(s).length,sel);
const val=(page,id)=>page.evaluate(i=>{const e=document.getElementById(i);return e?e.value:null;},id);

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  // make the portfolio (home) view the active one, then open the first VISIBLE loan row
  // (property-group member rows are `hidden` and not clickable) and its refinance analysis
  await page.evaluate(()=>{const h=document.querySelector('[data-tabsel="home"]');if(h)h.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('portfolioView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const row=page.locator('#portfolioView tr[data-goto]:visible').first();
  const loanId=await row.getAttribute('data-goto').catch(()=>null);
  ok(!!loanId,'a loan exists to open');
  // The proposed-loan card shows only on a "Refinance" verdict (v2.8.7's two-stage gate).
  // Force one so this test can still assert the card's editable boxes + schedule: a high NOI
  // clears the Can-I sizing, and a high current rate makes today's proposed rate cheaper
  // (Should-I = yes). No T12 on disk in this fresh profile, so refiNOI reads l.noi directly.
  await page.evaluate((lid)=>{ const l=(window.LDS_loans?window.LDS_loans():[]).find(x=>x._id===lid); if(l){
    l.rateType='Fixed'; l.isHistorical=false; l.amortType='Level'; l.annualRate=0.13;
    l.noi=20000000; l.capRate=0.05;
    l.floatIndexValue=null; l.floatIndexLive=null; l.floatRepricedOn=null;
    l.armInitialFixedMonths=null; l.armAdjustFreqMonths=null; l.rateFloor=null; l.rateCap=null; l.stackWith=null;
  }}, loanId);
  await row.click().catch(()=>{});
  await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
  await page.click('#refiBtn').catch(()=>{});
  await page.waitForFunction(()=>{const v=document.getElementById('refiView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(400);

  // ---- one analysis, no toggles ----
  ok((await count(page,'#refiView [data-refimode]'))===0,'the Regular/Advanced analysis toggle is gone');
  ok((await count(page,'#refiView [data-refiselect]'))===0,'the Option 1 / Option 2 selector is gone');
  const txt=await page.evaluate(()=>document.getElementById('refiView').innerText||'');
  ok(!/\bRegular\b/.test(txt)&&!/\bAdvanced analysis\b/i.test(txt),'no "Regular" / "Advanced analysis" wording');
  ok(!/Option 1|Option 2/.test(txt),'no "Option 1/2" wording');

  // ---- one editable suggested loan (o1_ fields exist, no o2_) ----
  ok((await count(page,'#refiView [id^="o1_"]'))>0,'the single proposed loan’s editable boxes are present (o1_)');
  ok((await count(page,'#refiView [id^="o2_"]'))===0,'there is no second option (no o2_ boxes)');

  // ---- verdict + amortization schedule still render ----
  ok(/Refinance|Don’t refinance|Don't refinance/i.test(txt),'the Refinance / Don’t-refinance verdict still renders');
  ok(/Amortization schedule/i.test(txt),'the amortization schedule still renders');
  ok((await count(page,'#refiView table'))>0,'a schedule table is present');

  // ---- the loan is editable and re-drives the panel ----
  const before=Number((await val(page,'o1_amount')||'0').replace(/[^0-9.]/g,''));
  ok(before>0,'the loan amount box has a value ('+before+')');
  await page.evaluate(()=>{const e=document.getElementById('o1_amount');if(e){e.value=String(Math.round(Number(e.value.replace(/[^0-9.]/g,''))+1000000));e.dispatchEvent(new Event('change',{bubbles:true}));}});
  await page.waitForTimeout(400);
  const after=Number((await val(page,'o1_amount')||'0').replace(/[^0-9.]/g,''));
  ok(Math.abs(after-(before+1000000))<2,'editing the loan amount sticks through the live re-render ('+before+' → '+after+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all single-refi checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
