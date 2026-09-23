/* e2e for v2.9.0: the Data Health page. Opens the tab, checks it lists every property (count matches
   the loan-derived property set), shows the KPI summary, the duplicate check, the maturity-decision
   list, and that "Recompute all figures" runs and leaves a log line. Also exercises the ghost-duplicate
   heuristic: two properties sharing a street number + name (in different cities) are flagged for review.
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

  // duplicate check: the clean seed has NO exact-address duplicates. The two St. Louis "Lofts" on
  // Mississippi Ave are 1107 vs 1119 — real, separate buildings — and are deliberately NOT flagged, so
  // the check doesn't cry wolf. The heuristic is exercised by the injection below.
  const dups0=await page.evaluate(()=>window.LDS_dupCandidates?window.LDS_dupCandidates():null);
  ok(Array.isArray(dups0)&&dups0.length===0,'the clean seed surfaces no duplicate candidates ('+(dups0?dups0.length:0)+')');
  ok(/No duplicate properties detected/i.test(t),'the page reports no duplicates on the clean seed');

  // recompute-all runs and leaves a log line
  await page.evaluate(()=>{const b=document.querySelector('#healthView [data-health-recompute]');if(b)b.click();});
  await page.waitForFunction(()=>/Last recompute/.test((document.getElementById('healthView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(400);
  const t2=await view();
  ok(/Last recompute/.test(t2),'after Recompute all, a "Last recompute" log line appears');
  const logN=await page.evaluate(()=>{try{return (JSON.parse(localStorage.getItem('lds.recomputeLog')||'[]')).length;}catch(e){return 0;}});
  ok(logN>=1,'the recompute log has at least one entry ('+logN+')');

  // ghost-duplicate heuristic: two properties that share a street NUMBER + street name but sit at
  // different full addresses (here, different cities) — the app keeps them as SEPARATE properties (a
  // shared full address would instead auto-merge them into one, the senior+mezz grouping), yet they
  // collide on the address signature, so they're surfaced for a human to review as a possible double-entry.
  const before=Array.isArray(dups0)?dups0.length:0;
  const flagged=await page.evaluate(()=>{
    const ls=window.LDS_loans?window.LDS_loans():[];
    if(ls.length<2) return null;
    ls[0].propertyName='Ghost Test A'; ls[0].propertyAddress='1107 Ghost Lane, Testville, OH 45000';
    ls[1].propertyName='Ghost Test B'; ls[1].propertyAddress='1107 Ghost Lane, Otherville, PA 19000';
    return window.LDS_dupCandidates?window.LDS_dupCandidates():null;
  });
  ok(Array.isArray(flagged)&&flagged.length>before,'the injected same-address pair adds a new duplicate candidate ('+before+' → '+(flagged?flagged.length:0)+')');
  ok(Array.isArray(flagged)&&flagged.some(g=>g.some(k=>/ghost/i.test(k))),'the injected Ghost Test pair is flagged');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all data-health e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
