/* e2e for v2.8.0 General Data: a T12 upload writes general-data.json to the property
   folder with a 24-month rolling history (12 real months from the crest fixture) and
   both NOIs; the underwriting tab shows the history card; and the refinance calculator
   gains a NOI-basis toggle (in-place T12 vs underwritten) that re-drives the analysis.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/general-data.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-gd-'));
const KEY='name:villages of whitewater';
const HASH=crypto.createHash('sha1').update(KEY).digest('hex').slice(0,16);
const PROPDIR=path.join(UDATA,'documents',HASH);
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const sum=o=>Object.keys(o||{}).reduce((a,k)=>a+o[k],0);
function readGD(){
  try{
    const idx=JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8'));
    const f=(idx.files||[]).filter(x=>x.role==='general').sort((a,b)=>b.savedAt-a.savedAt)[0];
    return f?JSON.parse(fs.readFileSync(path.join(PROPDIR,f.stored),'utf8')):null;
  }catch(e){ return null; }
}
async function launch(){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  return {app,page,errors};
}
const uwText=(page)=>page.evaluate(()=>(document.getElementById('uwView')||{}).innerText||'');
// The "Annual NOI" figure currently shown in the advanced refi panel (digits only).
const refiNoiShown=(page)=>page.evaluate(()=>{
  const dt=[...document.querySelectorAll('#refiView dt')].find(d=>/Annual NOI/i.test(d.textContent||''));
  const dd=dt?dt.nextElementSibling:null; return dd?Number((dd.textContent||'').replace(/[^0-9.]/g,'')):null;
});
const activeBasis=(page)=>page.evaluate(()=>{
  const b=[...document.querySelectorAll('#refiView [data-noibasis]')].find(x=>/bg-brand-600/.test(x.className));
  return b?b.getAttribute('data-noibasis'):null;
});
// The DSCR shown in the Coverage & Value panel (dt/dd) and the DSCR shown in the credit-tier
// readout ("DSCR x× · LTV …"). v2.8.5 makes the tier grade on the toggled NOI, so they must match.
const dscrPair=(page)=>page.evaluate(()=>{
  const rv=document.getElementById('refiView'); const txt=rv?rv.innerText||'':'';
  const dt=[...(rv?rv.querySelectorAll('dt'):[])].find(d=>/^DSCR$/i.test((d.textContent||'').trim()));
  const panel=dt&&dt.nextElementSibling?parseFloat((dt.nextElementSibling.textContent||'').replace(/[^0-9.]/g,'')):null;
  const m=txt.match(/DSCR\s+([\d.]+)×\s*·\s*LTV/i);   // the tier readout line: "DSCR x× · LTV …"
  return { panel, tier:m?parseFloat(m[1]):null };
});

(async()=>{
  const {app,page,errors}=await launch();
  // open Underwriting, pick the property, upload the (monthly) T12
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForFunction(()=>/operating history/i.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(400);

  // ---- A. general-data.json written to the property folder ----
  const gd=readGD();
  ok(!!gd,'general-data.json is written to the property folder');
  ok(gd&&gd.schema==='lds.general-data.v1','the record carries the v1 schema');
  ok(gd&&gd.window&&Array.isArray(gd.window.months)&&gd.window.months.length===12,'12 months of history stored ('+(gd&&gd.window&&gd.window.months&&gd.window.months.length)+')');
  ok(gd&&gd.window.months[0]==='2025-07'&&gd.window.months[11]==='2026-06','the calendar months are Jul 2025 → Jun 2026 (parsed from the T12 columns)');
  ok(gd&&gd.lines&&gd.lines.RET&&Object.keys(gd.lines.RET.monthly).length===12,'the real-estate-taxes line carries all 12 monthly values');
  ok(gd&&gd.lines.RET&&Math.abs(gd.lines.RET.ttm-sum(gd.lines.RET.monthly))<0.02,'the taxes trailing-12 equals the sum of its 12 months');
  ok(gd&&gd.noi&&typeof gd.noi.inPlace==='number'&&gd.noi.inPlace>0,'in-place NOI stored ('+(gd&&gd.noi&&gd.noi.inPlace)+')');
  ok(gd&&gd.noi&&typeof gd.noi.underwritten==='number'&&gd.noi.underwritten>0,'underwritten NOI stored ('+(gd&&gd.noi&&gd.noi.underwritten)+')');
  ok(gd&&gd.identity&&/whitewater/i.test(gd.identity.propertyName||''),'the property identity is recorded');

  // ---- B. the underwriting tab shows the General Data history card ----
  const uw=await uwText(page);
  ok(/General Data\s*[—-]\s*operating history/i.test(uw),'the General Data history card renders in the underwriting tab');
  ok(/Real Estate Taxes/i.test(uw),'the taxes line appears in the history readout');
  ok(/In-place NOI/i.test(uw)&&/Underwritten NOI/i.test(uw),'both NOIs are shown on the card');
  ok(/12 months/i.test(uw)&&/2025-07/.test(uw)&&/2026-06/.test(uw),'the 12-month span is labelled');

  // ---- C. the refinance calculator gains a NOI-basis toggle ----
  const loanId=await page.evaluate((k)=>{const ps=(window.opProperties?window.opProperties():[]);const p=ps.find(x=>x.key===k);return p&&p.loans&&p.loans[0]?p.loans[0]._id:null;},KEY);
  ok(!!loanId,'a loan exists on the property to refinance');
  if(loanId){
    // back to the main shell (home tab) → open the loan → open its refinance analysis → Advanced
    await page.evaluate(()=>{const h=document.querySelector('[data-tabsel="home"]');if(h)h.click();});
    await page.waitForFunction(()=>{const v=document.getElementById('portfolioView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
    await page.click('tr[data-goto="'+loanId+'"]').catch(()=>{});
    await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
    await page.click('#refiBtn').catch(()=>{});
    await page.waitForFunction(()=>{const v=document.getElementById('refiView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
    await page.click('[data-refimode="advanced"]').catch(()=>{});
    await page.waitForSelector('#refiView [data-noibasis]',{timeout:8000}).catch(()=>{});
    await page.waitForTimeout(300);

    const nBtns=await page.evaluate(()=>document.querySelectorAll('#refiView [data-noibasis]').length);
    ok(nBtns===2,'the NOI-basis toggle offers two options (in-place T12 + underwritten)');
    const bothFig=await page.evaluate(()=>[...document.querySelectorAll('#refiView [data-noibasis]')].every(b=>/\$/.test(b.textContent||'')));
    ok(bothFig,'each basis button shows its own NOI figure');
    ok((await activeBasis(page))==='underwritten','the default basis is Underwritten — the figure a loan is sized on');
    const noiUW=await refiNoiShown(page);
    ok(gd&&noiUW!=null&&Math.abs(noiUW-gd.noi.underwritten)<2,'the analysis runs on the underwritten NOI by default ('+noiUW+')');
    const dpUW=await dscrPair(page);   // v2.8.5: the tier grades on the SAME (underwritten) NOI the panel shows
    ok(dpUW.panel!=null&&dpUW.tier!=null&&Math.abs(dpUW.panel-dpUW.tier)<0.02,'on Underwritten, the credit tier DSCR ('+dpUW.tier+'×) matches the panel DSCR ('+dpUW.panel+'×)');
    // switch to in-place → the analysis re-drives off the in-place NOI
    await page.click('#refiView [data-noibasis="inplace"]').catch(()=>{});
    await page.waitForTimeout(300);
    ok((await activeBasis(page))==='inplace','clicking In-place T12 makes it the active basis');
    const noiIP=await refiNoiShown(page);
    ok(gd&&noiIP!=null&&Math.abs(noiIP-gd.noi.inPlace)<2,'the analysis now runs on the in-place NOI ('+noiIP+')');
    ok(noiIP!=null&&noiUW!=null&&Math.abs(noiIP-noiUW)>1,'switching the basis actually changes the NOI the refinance is judged on');
    const dpIP=await dscrPair(page);
    ok(dpIP.panel!=null&&dpIP.tier!=null&&Math.abs(dpIP.panel-dpIP.tier)<0.02,'on In-place, the tier DSCR ('+dpIP.tier+'×) still matches the panel DSCR ('+dpIP.panel+'×) — the tier tracks the toggle');
    ok(dpIP.tier!=null&&dpUW.tier!=null&&Math.abs(dpIP.tier-dpUW.tier)>0.01,'and the tier DSCR moved when the basis flipped ('+dpUW.tier+'× → '+dpIP.tier+'×)');
  }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all general-data e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
