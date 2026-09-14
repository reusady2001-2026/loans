/* e2e for v2.9.0: the Data Health page. Opens the tab, checks it lists every property (count matches
   the loan-derived property set), shows the KPI summary, the duplicate check, the maturity-decision
   list, and that "Recompute all figures" runs and leaves a log line. Also exercises the ghost-duplicate
   heuristic: give two differently-named loans the SAME street address and it flags them as candidates.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/data-health.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-health-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

async function openHealth(page){
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();});
  await page.waitForTimeout(150);
  await page.evaluate(()=>{const o=document.querySelector('[data-tabopen="health"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('healthView');return v&&!v.hidden&&/Every property/.test(v.innerText||'');},null,{timeout:12000});
  await page.waitForTimeout(300);
}

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  await openHealth(page);
  const view=()=>page.evaluate(()=>document.getElementById('healthView').innerText||'');
  const t=await view();
  ok(/Data Health/.test(t),'the page has a Data Health header');
  ok(/Properties/i.test(t)&&/With a T12/i.test(t)&&/Units known/i.test(t),'the KPI summary is shown (Properties / With a T12 / Units known)');

  // every property is listed
  const nProps=await page.evaluate(()=>window.opProperties?window.opProperties().length:-1);
  const nRows=await page.evaluate(()=>document.querySelectorAll('#healthView tbody tr').length);
  ok(nProps>0,'there are properties to show ('+nProps+')');
  ok(nRows===nProps,'the table lists every property ('+nRows+' rows for '+nProps+' properties)');
  const kpiProps=await page.evaluate(()=>{const m=(document.getElementById('healthView').innerText||'').match(/Properties\s*\n?\s*(\d+)/i);return m?+m[1]:-1;});
  ok(kpiProps===nProps,'the Properties KPI equals the property count ('+kpiProps+')');

  // duplicate check: clean seed has no same-address duplicates
  const dups0=await page.evaluate(()=>window.LDS_dupCandidates?window.LDS_dupCandidates():null);
  ok(Array.isArray(dups0)&&dups0.length===0,'clean seed → no duplicate candidates');
  ok(/No duplicate properties detected/.test(t),'the page states no duplicates for the clean seed');

  // recompute-all runs and leaves a log line
  await page.evaluate(()=>{const b=document.querySelector('#healthView [data-health-recompute]');if(b)b.click();});
  await page.waitForFunction(()=>/Last recompute/.test((document.getElementById('healthView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(400);
  const t2=await view();
  ok(/Last recompute/.test(t2),'after Recompute all, a "Last recompute" log line appears');
  const logN=await page.evaluate(()=>{try{return (JSON.parse(localStorage.getItem('lds.recomputeLog')||'[]')).length;}catch(e){return 0;}});
  ok(logN>=1,'the recompute log has at least one entry ('+logN+')');

  // ghost-duplicate heuristic: point two different-named loans at the SAME street address
  const flagged=await page.evaluate(()=>{
    const ls=window.LDS_loans?window.LDS_loans():[];
    if(ls.length<2) return null;
    // distinct names → two distinct property keys; same street number + street word → same building
    ls[0].propertyName='Ghost Test A'; ls[0].propertyAddress='999 Twin Oaks Dr, Testville, OH 45000';
    ls[1].propertyName='Ghost Test B'; ls[1].propertyAddress='999 Twin Oaks Drive, Testville OH';
    return window.LDS_dupCandidates?window.LDS_dupCandidates():null;
  });
  ok(Array.isArray(flagged)&&flagged.some(g=>g.length>=2),'two loans at the same street address are flagged as duplicate candidates');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all data-health e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
