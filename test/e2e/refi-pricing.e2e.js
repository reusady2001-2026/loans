/* e2e for v2.8.3: the proposed loan is priced HONESTLY. A Fixed/Floating/Hybrid
   toggle (defaulting to the refinanced loan's own type), a base-index picker, and an
   editable spread (0 by default on the fixed side) build the rate as index + spread −
   tier discount. The old auto-machinery — a fabricated calibrated spread, the automatic
   Treasury↔SOFR switch, and an assumed cap cost — is gone.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-pricing.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refiprice-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const count=(page,sel)=>page.evaluate(s=>document.querySelectorAll(s).length,sel);
const val=(page,id)=>page.evaluate(i=>{const e=document.getElementById(i);return e?e.value:null;},id);
const rtxt=(page)=>page.evaluate(()=>(document.getElementById('refiView')||{}).innerText||'');

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  // open Villages of Whitewater (a Fixed loan) → its refinance analysis
  await page.evaluate(()=>{const h=document.querySelector('[data-tabsel="home"]');if(h)h.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('portfolioView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const loanId=await page.evaluate((k)=>{const ps=(window.opProperties?window.opProperties():[]);const p=ps.find(x=>x.key===k);return p&&p.loans&&p.loans[0]?p.loans[0]._id:null;},KEY);
  ok(!!loanId,'Villages of Whitewater (a Fixed loan) exists to open');
  // give the property an NOI so DSCR (1.58×) / LTV (47%) earn a credit tier — the seed loan carries none
  await page.evaluate((lid)=>{const ls=(window.LDS_loans?window.LDS_loans():[]);const l=ls.find(x=>x._id===lid);if(l){l.noi=1122512;l.capRate=0.055;}},loanId);
  await page.click('tr[data-goto="'+loanId+'"]').catch(()=>{});
  await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
  await page.click('#refiBtn').catch(()=>{});
  await page.waitForFunction(()=>{const v=document.getElementById('refiView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-rtype]').length>0,null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);

  // ---- rate-type toggle, defaulting to the loan's own type ----
  ok((await count(page,'#refiView [data-rtype]'))===3,'the Fixed / Floating / Hybrid toggle is present (3 options)');
  const activeType=await page.evaluate(()=>{const b=[...document.querySelectorAll('#refiView [data-rtype]')].find(x=>/bg-brand-600/.test(x.className));return b?b.getAttribute('data-rtype'):null;});
  ok(activeType==='Fixed','the toggle defaults to the loan’s own type (Fixed)');

  // ---- base-index picker + editable spread; 0 by default on the fixed side ----
  ok((await count(page,'#o1_index'))===1,'the base-index picker is present');
  ok((await count(page,'#o1_spread'))===1,'the spread box is present');
  ok((await val(page,'o1_spread'))==='0','the fixed-side spread defaults to 0');
  ok((await count(page,'#o1_rate'))===0,'the old free-type rate box is gone (the rate is built up now)');

  // ---- the old auto-machinery is gone ----
  const t=await rtxt(page);
  ok(!/Credit-aware market/i.test(t),'no fabricated "Credit-aware market" rate');
  ok(!/SOFR beats Treasury|Index choice|cheaper by/i.test(t),'no automatic Treasury-vs-SOFR index switch');
  ok(/Rate\b/.test(t)&&/bps spread/i.test(t),'the rate is spelled out as index + spread (− tier)');

  // ---- editing the spread re-prices live ----
  const before=await rtxt(page);
  await page.evaluate(()=>{const e=document.getElementById('o1_spread');if(e){e.value='250';e.dispatchEvent(new Event('change',{bubbles:true}));}});
  await page.waitForTimeout(400);
  ok(before!==(await rtxt(page)),'typing a spread re-prices the proposed loan live');
  ok((await val(page,'o1_spread'))==='250','the spread you typed sticks');

  // ---- the tier discount (all three metrics land Villages in Tier 4 → −40 bps) applies ----
  const priced=await rtxt(page);
  ok(/Tier 4/.test(priced),'the property earns Tier 4 (DSCR 1.58× · LTV 47%)');
  ok(/40 bps/.test(priced),'the −40 bps tier discount shows in the rate build-up (250 bps spread → 210 bps net)');

  // ---- switching to Floating: cap cost appears (default 0); index flips to SOFR ----
  await page.evaluate(()=>{const b=[...document.querySelectorAll('#refiView [data-rtype]')].find(x=>x.getAttribute('data-rtype')==='Floating');if(b)b.click();});
  await page.waitForTimeout(400);
  ok((await count(page,'#o1_capcost'))===1,'switching to Floating reveals a cap-cost box');
  ok((await val(page,'o1_capcost'))==='0','the cap cost defaults to 0 (enter the real premium only if you buy a cap)');
  ok((await val(page,'o1_index'))==='sofr','a floating loan defaults to the SOFR index');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all honest-pricing e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
