/* e2e for v2.9.0: the LEASE-UP PROPERTY STATUS suppresses annualization. A partial-year T12 on an
   ordinary (stabilized) property is annualized last 3 months × 4 — the 2.8.8 rule. But once the
   property is flagged "Lease-up" (a climbing asset, still ramping from zero), the last-3-months × 4
   of a climb is misleading, so annualization is SUPPRESSED: the raw statement stands (basis
   "statement") under the Lease-up badge, and it is left out of the portfolio-weighted coverage.
   Same 7-month fixture as partial-year: GPR 100k/mo, taxes 10k/mo → statement NOI 630,000;
   annualized in-place would be 1,080,000.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/leaseup-status.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-leasestat-'));
function makeFixture(){
  const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
  const MONTHS=["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026"];   // 7 dated months
  const gpr=Array(7).fill(100000), tax=Array(7).fill(10000);
  const sum=a=>a.reduce((x,y)=>x+y,0), noi=gpr.map((g,i)=>g-tax[i]);
  const aoa=[["Account",...MONTHS,"Total"],["Gross Potential Rent",...gpr,sum(gpr)],["TOTAL INCOME",...gpr,sum(gpr)],
    ["Real Estate Taxes",...tax,sum(tax)],["TOTAL EXPENSES",...tax,sum(tax)],["NET OPERATING INCOME",...noi,sum(noi)]];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Report1");
  const p=path.join(UDATA,'partial-t12.xlsx'); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p;
}
const FIX=makeFixture();
const KEY='name:villages of whitewater';
const HASH=crypto.createHash('sha1').update(KEY).digest('hex').slice(0,16);
const PROPDIR=path.join(UDATA,'documents',HASH);
const STMT=630000, LU=1080000;
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
function readGD(){ try{ const idx=JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8'));
  const f=(idx.files||[]).filter(x=>x.role==='general').sort((a,b)=>b.savedAt-a.savedAt)[0];
  return f?JSON.parse(fs.readFileSync(path.join(PROPDIR,f.stored),'utf8')):null; }catch(e){ return null; } }

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.evaluate(()=>{const u=[...document.querySelectorAll('#uwView [data-uwf]')].find(x=>x.getAttribute('data-uwf')==='units');if(u){u.value='';u.dispatchEvent(new Event('change',{bubbles:true}));}});
  await page.waitForTimeout(200);
  await page.setInputFiles('#uwFile',FIX);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(500);

  // ---- baseline: a partial-year statement on a STABILIZED property is annualized (2.8.8) ----
  let gd=readGD();
  ok(gd&&gd.noi&&gd.noi.inPlaceBasis==='leaseup','stabilized + partial year → annualized (basis "leaseup")');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlace-LU)<2,'stabilized in-place is annualized 1,080,000 (got '+(gd&&gd.noi&&gd.noi.inPlace)+')');
  // the property reads as Stabilized before the flag
  const st0=await page.evaluate((k)=>window.LDS_propertyStatus?window.LDS_propertyStatus(k):'?',KEY);
  ok(st0==='Stabilized','before the flag the property status is Stabilized (got '+st0+')');

  // ---- flag the property "Lease-up" (held on the senior loan), recompute from disk ----
  const flagged=await page.evaluate((k)=>window.LDS_setPropStatus?window.LDS_setPropStatus(k,'Lease-up'):false,KEY);
  ok(flagged,'senior loan found and flagged propStatus="Lease-up"');
  const st1=await page.evaluate((k)=>window.LDS_propertyStatus?window.LDS_propertyStatus(k):'?',KEY);
  ok(st1==='Lease-up','after the flag the property status is Lease-up (got '+st1+')');
  await page.evaluate(()=>window.LDS_recomputeAll('test'));
  await page.waitForTimeout(600);

  // ---- suppression: the raw statement now stands, no annualization ----
  gd=readGD();
  ok(gd&&gd.noi&&gd.noi.inPlaceBasis==='statement','lease-up flag suppresses annualization → basis "statement" (got '+(gd&&gd.noi&&gd.noi.inPlaceBasis)+')');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlace-STMT)<2,'lease-up in-place is the RAW 7-month statement 630,000, not annualized (got '+(gd&&gd.noi&&gd.noi.inPlace)+')');
  ok(gd&&gd.noi&&gd.noi.underwritten<700000,'lease-up underwritten is NOT annualized either (well under 700k) — got '+(gd&&gd.noi&&Math.round(gd.noi.underwritten)));
  ok(gd&&gd.noi&&(gd.noi.leaseUpMonths==null),'lease-up basis carries no annualization months');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all lease-up-status e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
