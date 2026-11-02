/* e2e (cleanup): benchmarks are PER PROPERTY, editable in the underwriting tab (payroll + R&M $/unit) — not in
   Settings, no size bands/threshold. A line beyond ±15% of its benchmark is flagged with the dollar gap.
   Driven through the LDS_bench* / LDS_uwSetupHtml diagnostics.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/benchmarks.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-bm-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- defaults: payroll 1,700/unit and R&M 600/unit (the two Azriel named); no bands, no threshold ----
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('PAY',{}))===1700,'default payroll benchmark is 1,700/unit');
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('RM',{}))===600,'default R&M benchmark is 600/unit');
  // ---- per property: a property's own benchmark overrides the default ----
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('PAY',{PAY:1600}))===1600,'a property-specific payroll benchmark overrides the default');

  // ---- ±15%: 17.6% off is flagged with the dollar gap; ~6% off is not ----
  const off=await page.evaluate(()=>window.LDS_benchStatus('PAY',2000*250,250,{})); // 2,000/u vs 1,700 = +17.6%
  ok(off && off.off===true && Math.round(off.gapTotal)===75000,'a payroll line 17.6% above benchmark is flagged, gap +$75,000 (300/u × 250)');
  const near=await page.evaluate(()=>window.LDS_benchStatus('PAY',1800*250,250,{})); // 1,800/u vs 1,700 = +5.9%
  ok(near && near.off===false,'a payroll line ~6% above benchmark is NOT flagged');

  // ---- the benchmark editor is IN the underwriting tab (not Settings), editable per property ----
  const html=await page.evaluate(()=>window.LDS_uwSetupHtml({GPR:5000000, PAY:2000*250, RET:50000}, 250, {}));
  ok(/data-uwbenchmark="PAY"/.test(html) && /data-uwbenchmark="RM"/.test(html),'the tab has editable per-property benchmark inputs (payroll + R&M)');

  // ---- the flagged payroll line is highlighted and states the dollar gap ----
  const row=await page.evaluate((h)=>{ var d=document.createElement('div'); d.innerHTML=h;
    var trs=Array.prototype.slice.call(d.querySelectorAll('tbody tr'));
    var pay=trs.find(function(r){ return /payroll/i.test((r.cells[0]||{}).innerText||''); });
    return pay ? { cls: pay.getAttribute('class')||'', txt: pay.cells[0].innerText } : null;
  }, html);
  ok(row!=null,'the payroll line renders');
  if(row){ ok(/amber/.test(row.cls),'the flagged payroll line is highlighted'); ok(/vs \$1,700/.test(row.txt) && /\+\$75,000/.test(row.txt),'the line states its benchmark and the +$75,000 gap'); }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all benchmarks e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
