/* e2e for 2.9.9 (fixes 7, 8) — the SOFRs in Refinance, and a list of every rate.
   (7) Refinance's Index list has SOFR 30-day Average and 1-month Term SOFR next to overnight SOFR; picking one prices
       the new loan from ITS rate (the line says "30-day Avg SOFR x.xx%", not the overnight value).
   (8) "Fetch live rate" also opens a list of every rate the app holds: its value, where it comes from, and which of
       your loans use it; "Other / Custom" reads "each loan's own value", not 5%.
   2.9.10 (g7) — Refinance's Index lists (Floating, and Hybrid's fixed-period one) hold EVERY rate the app fetches
       (US Prime Rate and Fed Funds were missing), and nothing it doesn't fetch.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/rates-299.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-rates299-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(1500);

  // ---- (8) the list of every rate ----
  await page.evaluate(()=>document.getElementById('fetchRateBtn').click());
  ok(await page.waitForFunction(()=>!!document.querySelector('[data-rateslist]'),null,{timeout:30000}).then(()=>true).catch(()=>false),'"Fetch live rate" opens the list of rates');
  const L=await page.evaluate(()=>{ const m=document.querySelector('[data-rateslist]'); const row=(id)=>{ const r=m.querySelector('[data-raterow="'+id+'"]'); return r?{ v:r.querySelector('[data-ratevalue]').textContent, src:r.querySelector('[data-ratesrc]').textContent, loans:r.querySelector('[data-rateloans]').textContent }:null; };
    return { n:m.querySelectorAll('[data-raterow]').length, head:m.innerText.slice(0,200), sofr:row('sofr'), sofr30:row('sofr30'), term:row('termsofr1m'), other:row('other'), ust10:row('ust10y') }; });
  ok(L.n===13,'all 13 rates are listed ('+L.n+')');
  ok(/Couldn’t fetch \(offline\?\) — the last saved values/.test(L.head),'offline, it says the values are the last saved ones');
  ok(L.sofr30&&/%$/.test(L.sofr30.v)&&L.term&&/%$/.test(L.term.v),'SOFR 30-day Average and 1-month Term SOFR are there with values ('+L.sofr30.v+', '+L.term.v+')');
  ok(L.sofr&&L.sofr.src.length>3,'each rate says where it comes from ("'+(L.sofr&&L.sofr.src)+'")');
  ok(L.other&&L.other.v==='each loan’s own value'&&!/5\.0/.test(L.other.v),'"Other / Custom" reads "each loan’s own value", not 5%');
  ok(L.sofr&&/\((floating|hybrid)\)/.test(L.sofr.loans),'it says which of your loans use a rate ("'+(L.sofr&&L.sofr.loans.slice(0,80))+'…")');
  await page.evaluate(()=>document.querySelector('[data-rateslistclose]').click());
  ok(await page.evaluate(()=>!document.querySelector('[data-rateslist]')),'✕ closes it');

  // ---- (7) the SOFRs in Refinance ----
  const LID=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.rateType==='Floating'&&x.originalAmount>1000000)||window.LDS_loans()[0]; return l._id; });
  await page.evaluate((lid)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value=lid; s.dispatchEvent(new Event('change',{bubbles:true})); if(window.LDS_resetRefiDraft) window.LDS_resetRefiDraft(); },LID);
  await page.waitForTimeout(500); await page.click('#refiBtn'); await page.waitForTimeout(800);
  await page.evaluate(()=>{ const b=document.querySelector('#refiPricing [data-rtype="Floating"]'); if(b) b.click(); }); await page.waitForTimeout(600);
  const opts=await page.evaluate(()=>{ const s=document.getElementById('o1_index'); return s?[...s.options].map(o=>o.textContent):[]; });
  ok(opts.includes('SOFR (overnight)')&&opts.includes('SOFR 30-day Average (NY Fed)')&&opts.includes('1-month Term SOFR (CME)'),'Refinance’s Index list: SOFR (overnight), SOFR 30-day Average, 1-month Term SOFR ('+opts.slice(0,4).join(' | ')+'…)');
  // 2.9.10 (g7) — EVERY rate the app fetches is in Refinance's lists (Prime and Fed Funds were missing), and only those
  const fetched=await page.evaluate(()=>window.LDS_indexCatalog().filter(c=>c.live).map(c=>c.label));
  const fx=await page.evaluate(()=>{ const b=document.querySelector('#refiPricing [data-rtype="Hybrid ARM"]'); return !!b; });
  ok(fetched.length===12&&opts.length===fetched.length&&fetched.every(l=>opts.includes(l)),'the Floating Index list has every fetched rate — '+opts.length+' of '+fetched.length+' (US Prime Rate: '+opts.includes('US Prime Rate')+', Fed Funds: '+opts.includes('Fed Funds (EFFR)')+')');
  ok(!opts.some(o=>/Other|30-Year/.test(o)),'…and nothing the app doesn’t fetch (no “Other / Custom”, no 30-year Treasury)');
  // the rate the app holds for an index: fetched or saved, else the built-in value (offline, Prime/Fed Funds were never fetched here)
  const rate=(id)=>page.evaluate((id)=>{ const c=window.LDS_indexCache&&window.LDS_indexCache(id); if(c&&c.value!=null) return c.value; const k=window.LDS_indexCatalog().find(x=>x.id===id); return k?k.fallback:null; },id);
  for(const [id,short] of [['sofr30','30-day Avg SOFR'],['termsofr1m','1-mo Term SOFR'],['prime','Prime'],['effr','EFFR']]){
    await page.evaluate((id)=>{ const s=document.getElementById('o1_index'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },id); await page.waitForTimeout(1200);
    const t=await page.evaluate(()=>document.getElementById('refiPricing').innerText);
    const v=await rate(id);
    const m=t.match(new RegExp(short.replace(/[-]/g,'\\-')+' ([0-9.]+)%'));
    ok(m&&v!=null&&Math.abs(parseFloat(m[1])-v)<0.01,'picking '+short+' prices it from its own rate ('+(m&&m[1])+'% vs the '+id+' rate '+v+'%)');
  }
  if(fx){ await page.evaluate(()=>document.querySelector('#refiPricing [data-rtype="Hybrid ARM"]').click()); await page.waitForTimeout(600);
    const fxo=await page.evaluate(()=>{ const s=document.getElementById('o1_fxindex'); return s?[...s.options].map(o=>o.textContent):[]; });
    ok(fxo.length===fetched.length&&fetched.every(l=>fxo.includes(l)),'the Hybrid “Index (matches the fixed period)” list has every fetched rate too ('+fxo.length+')'); }
  const sofrV=parseFloat(L.sofr.v), s30=await rate('sofr30');
  ok(isFinite(sofrV)&&s30!=null&&Math.abs(sofrV-s30)>0.0001,'…which is not the overnight SOFR value ('+s30+'% vs '+sofrV+'%)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all rates (2.9.9) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
