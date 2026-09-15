/* e2e for v2.9.2-F: benchmarks — payroll two size bands + a unit threshold, R&M, contract services and
   turnover (editable in Settings); a line beyond ±15% of its $/unit benchmark is flagged with the dollar
   gap; and the flagged gaps are handed to the "what to push" input. Driven through the LDS_bench* and
   LDS_uwSetupHtml diagnostics.
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

  // ---- defaults + the payroll size bands ----
  const d=await page.evaluate(()=>window.LDS_benchLoad());
  ok(d.payroll.big===1500 && d.payroll.small===1700 && d.payroll.threshold===200,'default payroll bands: 1,500 (200+ units) / 1,700 (under) at a 200-unit threshold');
  ok(d.RM===600,'default R&M benchmark is 600/unit');
  ok(d.CONTR===null && d.TURN===null,'contract services and turnover are present but blank');
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('PAY',250))===1500,'a 250-unit property picks the 1,500 payroll band');
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('PAY',150))===1700,'a 150-unit property picks the 1,700 payroll band');
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('RM',100))===600,'R&M benchmark is 600/unit regardless of size');

  // ---- ±15%: 20% off is flagged, 10% off is not ----
  const off20=await page.evaluate(()=>window.LDS_benchStatus('PAY',1800*250,250)); // 1,800/u vs 1,500 = +20%
  ok(off20 && off20.off===true && Math.round(off20.gapTotal)===75000,'a line 20% above benchmark is flagged, gap +$75,000 (300/u × 250)');
  const off10=await page.evaluate(()=>window.LDS_benchStatus('PAY',1650*250,250)); // 1,650/u vs 1,500 = +10%
  ok(off10 && off10.off===false,'a line 10% above benchmark is NOT flagged');

  // ---- editing a benchmark updates it everywhere ----
  await page.evaluate(()=>window.LDS_benchSet('RM',650));
  ok(await page.evaluate(()=>window.LDS_benchLoad().RM)===650,'changing R&M to 650 persists');
  ok(await page.evaluate(()=>window.LDS_benchUnitFor('RM',100))===650,'…and the benchmark lookup reflects 650 immediately');
  await page.evaluate(()=>window.LDS_benchSet('RM',600)); // restore

  // ---- the Setup highlights the flagged line and states the dollar gap ----
  const row=await page.evaluate(()=>{
    var html=window.LDS_uwSetupHtml({GPR:5000000, PAY:1800*250, RET:50000}, 250, false, {});
    var d=document.createElement('div'); d.innerHTML=html;
    var trs=Array.prototype.slice.call(d.querySelectorAll('tbody tr'));
    var pay=trs.find(function(r){ return /payroll/i.test((r.cells[0]||{}).innerText||''); });
    return pay ? { cls: pay.getAttribute('class')||'', txt: pay.cells[0].innerText } : null;
  });
  ok(row!=null,'the payroll line renders');
  if(row){ ok(/amber/.test(row.cls),'the flagged payroll line is highlighted'); ok(/vs \$1,500/.test(row.txt) && /\+\$75,000/.test(row.txt),'the line states its benchmark and the +$75,000 gap'); }

  // ---- the Settings Benchmarks editor renders ----
  await page.evaluate(()=>{ var dd=document.getElementById('settingsDD'); if(dd) dd.open=true; window.LDS_renderBench(); });
  await page.waitForTimeout(200);
  const bh=await page.evaluate(()=>{const h=document.getElementById('settingsBench');return h?h.innerHTML:'';});
  ok(/Benchmarks/i.test(bh) && /Payroll/i.test(bh) && /data-bench="RM"/.test(bh),'Settings shows the editable Benchmarks table (payroll bands, R&M, …)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all benchmarks e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
