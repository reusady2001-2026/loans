/* e2e for v2.9.0.1: a loan that has matured (or whose extension is undecided) is flagged on its row in
   the portfolio roll-up, so a maturity decision that's due can't slip past. The seed has NO matured loan
   (every loan matures in the future), so this drives the flags directly: push one loan's maturity date
   into the past (derived "matured", no manual status) and set a second to "Extension undecided" (manual),
   then clear it and confirm the derived "matured" stays.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/rollup-status.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-rollstat-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  // open Underwriting so the roll-up mounts
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opRollupMount');},null,{timeout:8000});
  await page.waitForTimeout(400);

  const rollup=()=>page.evaluate(()=>{const m=document.getElementById('opRollupMount');return m?m.innerText:'';});
  const t0=await rollup();
  // clean seed: every loan matures in the future — nothing is flagged yet.
  ok(!/matured/i.test(t0),'clean seed → no loan reads "matured" (all mature in the future)');
  ok(!/undecided/i.test(t0),'clean seed → nothing reads "undecided" until a status is set');

  // push one loan's maturity date into the past → derived "matured" (no manual status set).
  const matured=await page.evaluate(()=>{
    const ls=window.LDS_loans?window.LDS_loans():[]; if(!ls.length) return null;
    const l=ls[0]; l.maturityDate='2020-01-01'; l.loanStatus='';
    if(window.LDS_renderPortfolio) window.LDS_renderPortfolio();
    return l.propertyName||'';
  });
  await page.waitForTimeout(300);
  ok(!!matured,'a loan was found to push past its maturity date');
  const tM=await rollup();
  ok(/matured/i.test(tM),'a past-maturity loan is flagged "matured" in the roll-up (derived, no manual status)');

  // set a DIFFERENT loan's extension status to undecided (manual), re-render the roll-up
  const flagged=await page.evaluate(()=>{
    const ls=window.LDS_loans?window.LDS_loans():[]; if(ls.length<2) return null;
    const l=ls[1]; l.loanStatus='Extension undecided';
    if(window.LDS_renderPortfolio) window.LDS_renderPortfolio();
    return l.propertyName||'';
  });
  await page.waitForTimeout(300);
  ok(!!flagged,'a second loan was found to flag');
  const t1=await rollup();
  ok(/undecided/i.test(t1),'after setting one loan to "Extension undecided", the roll-up reads "undecided"');
  ok(/matured/i.test(t1),'and the past-maturity loan still reads "matured" alongside it');

  // clearing the manual "undecided" status (back to Active) removes that flag; the derived "matured" stays
  await page.evaluate(()=>{const ls=window.LDS_loans?window.LDS_loans():[]; const l=ls[1]; if(l) l.loanStatus='Active'; if(window.LDS_renderPortfolio) window.LDS_renderPortfolio();});
  await page.waitForTimeout(300);
  const t2=await rollup();
  ok(/matured/i.test(t2)&&!/undecided/i.test(t2),'the derived "matured" stays; the cleared loan no longer reads "undecided"');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all rollup-status e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
