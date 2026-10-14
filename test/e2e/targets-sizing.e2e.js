/* e2e for 2.9.7 (#16, #119, #165): Home's portfolio targets and the Underwriting sizing card.
   - Home: Portfolio DSCR = total NOI ÷ total yearly payments (#119); a Portfolio LTV bar against a Max LTV
     target; the three targets come from Settings ("Minimum DSCR (target)", "Maximum LTV (target)", "Minimum
     debt yield (target)") and Home follows a change at once (#165).
   - Underwriting: the sizing card starts at 1.25× / 75% / 7% (#165), and editing a sizing input moves the
     "Max supportable loan" headline in the same step (#16).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/targets-sizing.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const T12=path.join(APP,'test','fixtures','sample-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-tgt-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(1500);
  // ---- Home ----
  const h=await page.evaluate(()=>({ cov:window.LDS_lastHomeCoverage, text:document.getElementById('portfolioView').innerText, ltvGauge:!!document.getElementById('gaugeLtv') }));
  ok(h.cov && h.cov.wDscr!=null && Math.abs(h.cov.wDscr - h.cov.sumNOI/h.cov.sumDS)<1e-12,'Portfolio DSCR = total NOI ÷ total yearly payments ('+(h.cov&&h.cov.wDscr&&h.cov.wDscr.toFixed(4))+')');
  ok(new RegExp('PORTFOLIO DSCR\\s*\\n?\\s*'+h.cov.wDscr.toFixed(2).replace('.','\\.')+'×','i').test(h.text),'the tile shows that figure ('+h.cov.wDscr.toFixed(2)+'×)');
  ok(h.ltvGauge && /Portfolio LTV/i.test(h.text) && /target ≤ 75\.00%/.test(h.text),'a Portfolio LTV bar against the 75% Max LTV target');
  ok(/Coverage vs targets/i.test(h.text) && /1\.25× DSCR, 75\.00% LTV and 8\.00% debt-yield targets/.test(h.text),'the coverage panel and table speak of the three targets');
  // Settings lines
  await page.click('#settingsDD > summary'); await page.waitForTimeout(400);
  const st=await page.evaluate(()=>document.getElementById('settingsTargets').innerText);
  ok(/Minimum DSCR \(target\)/.test(st)&&/Maximum LTV \(target\)/.test(st)&&/Minimum debt yield \(target\)/.test(st),'Settings has the three target lines');
  await page.evaluate(()=>{ const i=document.getElementById('tgtDscr'); i.value='1.40'; i.dispatchEvent(new Event('change',{bubbles:true})); const l=document.getElementById('tgtLtv'); l.value='65'; l.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(800);
  const h2=await page.evaluate(()=>({ text:document.getElementById('portfolioView').innerText, t:window.LDS_lastHomeCoverage.targets }));
  ok(Math.abs(h2.t.dscrMin-1.4)<1e-9 && Math.abs(h2.t.ltvMax-0.65)<1e-9,'a changed target is saved (1.40× / 65%)');
  ok(/1\.40× DSCR, 65\.00% LTV/.test(h2.text) && /target ≤ 65\.00%/.test(h2.text),'Home follows the new targets at once');
  await page.click('#settingsDD > summary'); await page.waitForTimeout(200);
  // ---- Underwriting sizing ----
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(600);
  await page.setInputFiles('#uwFile',T12);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1200);
  const sz=await page.evaluate(()=>{ const g=k=>(document.querySelector('#uwView [data-uwsize="'+k+'"]')||{}).value; return { dscr:g('dscrMin'), ltv:g('ltvMax'), dy:g('dyMin'), head:(document.getElementById('uwMaxLoanCard')||{}).textContent, card:(document.getElementById('uwSzMax')||{}).textContent }; });
  ok(sz.dscr==='1.25' && sz.ltv==='75' && sz.dy==='7','the sizing card starts at 1.25× / 75% / 7% ('+sz.dscr+' / '+sz.ltv+' / '+sz.dy+')');
  ok(sz.head===sz.card,'headline and sizing card agree ('+sz.head+')');
  await page.evaluate(()=>{ const i=document.querySelector('#uwView [data-uwsize="dscrMin"]'); i.focus(); i.value='1.60'; i.dispatchEvent(new Event('input',{bubbles:true})); });
  await page.waitForTimeout(400);
  const sz2=await page.evaluate(()=>({ head:(document.getElementById('uwMaxLoanCard')||{}).textContent, card:(document.getElementById('uwSzMax')||{}).textContent }));
  ok(sz2.card!==sz.card && sz2.head===sz2.card,'editing the DSCR input moves the headline in the same step ('+sz.head+' → '+sz2.head+')');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all targets-sizing e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
