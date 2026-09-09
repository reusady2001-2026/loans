/* e2e for v2.8.1 lease-up NOI rule: a T12 whose gross rent doesn't begin until after the
   second month gets its in-place NOI annualized from the last 3 months × 4 (not the 12-month
   sum). Verifies general-data.json records the lease-up basis + both figures, the underwriting
   tab shows the lease-up banner, and the refinance calculator's in-place basis uses the
   annualized figure (folder-first) — not the understated statement total.
   Fixture: leaseup-t12.xlsx — statement NOI 1,760,000; lease-up NOI 2,760,000 (last3 230,000 ×3 ×4).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/leaseup.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-lu-'));
// A synthetic lease-up T12, generated at runtime (no binary fixture): gross rent is $0 for the
// first two months (Jul/Aug 2025), then ramps; taxes flat at 20,000/mo. 12-month NOI = 1,760,000;
// last-3-months (Apr/May/Jun 2026) NOI 230,000 each → annualized 2,760,000.
function makeFixture(){
  const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
  const MONTHS=["Jul 2025","Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"];
  const gpr=[0,0,50000,100000,150000,200000,250000,250000,250000,250000,250000,250000], tax=Array(12).fill(20000);
  const sum=a=>a.reduce((x,y)=>x+y,0), noi=gpr.map((g,i)=>g-tax[i]);
  const aoa=[["Account",...MONTHS,"Total"],["Gross Potential Rent",...gpr,sum(gpr)],["TOTAL INCOME",...gpr,sum(gpr)],
    ["Real Estate Taxes",...tax,sum(tax)],["TOTAL EXPENSES",...tax,sum(tax)],["NET OPERATING INCOME",...noi,sum(noi)]];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Report1");
  const p=path.join(UDATA,'leaseup-t12.xlsx'); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p;
}
const FIX=makeFixture();
const KEY='name:villages of whitewater';
const HASH=crypto.createHash('sha1').update(KEY).digest('hex').slice(0,16);
const PROPDIR=path.join(UDATA,'documents',HASH);
const STMT=1760000, LU=2760000;
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
function readGD(){ try{ const idx=JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8'));
  const f=(idx.files||[]).filter(x=>x.role==='general').sort((a,b)=>b.savedAt-a.savedAt)[0];
  return f?JSON.parse(fs.readFileSync(path.join(PROPDIR,f.stored),'utf8')):null; }catch(e){ return null; } }
const refiNoiShown=(page)=>page.evaluate(()=>{const dt=[...document.querySelectorAll('#refiView dt')].find(d=>/Annual NOI/i.test(d.textContent||''));const dd=dt?dt.nextElementSibling:null;return dd?Number((dd.textContent||'').replace(/[^0-9.]/g,'')):null;});

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',FIX);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForFunction(()=>/lease-?up/i.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(400);

  // ---- general-data.json records the lease-up correction ----
  const gd=readGD();
  ok(!!gd,'general-data.json written');
  ok(gd&&gd.noi&&gd.noi.inPlaceBasis==='leaseup','the in-place NOI basis is recorded as lease-up');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlace-LU)<2,'in-place NOI is annualized from the last 3 months × 4 = 2,760,000 (got '+(gd&&gd.noi&&gd.noi.inPlace)+')');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlaceStatement-STMT)<2,'the statement 12-month total is kept alongside = 1,760,000 (got '+(gd&&gd.noi&&gd.noi.inPlaceStatement)+')');
  ok(gd&&gd.noi&&Array.isArray(gd.noi.leaseUpMonths)&&gd.noi.leaseUpMonths.length===3,'the 3 months used are recorded');

  // ---- the underwriting tab shows the lease-up banner ----
  const uw=await page.evaluate(()=>document.getElementById('uwView').innerText||'');
  ok(/Lease-?up/i.test(uw)&&/last 3 months/i.test(uw),'the Setup shows a lease-up banner explaining the annualized figure');
  ok(uw.indexOf('2,760,000')>=0,'the banner shows the annualized working NOI (2,760,000)');
  ok(uw.indexOf('1,760,000')>=0,'the banner shows the 12-month statement total (1,760,000) for reference');

  // ---- the refinance calculator uses the lease-up figure (folder-first), not the statement total ----
  const loanId=await page.evaluate((k)=>{const ps=(window.opProperties?window.opProperties():[]);const p=ps.find(x=>x.key===k);return p&&p.loans&&p.loans[0]?p.loans[0]._id:null;},KEY);
  ok(!!loanId,'a loan exists on the property');
  if(loanId){
    await page.evaluate(()=>{const h=document.querySelector('[data-tabsel="home"]');if(h)h.click();});
    await page.waitForFunction(()=>{const v=document.getElementById('portfolioView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
    await page.click('tr[data-goto="'+loanId+'"]').catch(()=>{});
    await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:8000}).catch(()=>{});
    await page.click('#refiBtn').catch(()=>{});
    await page.waitForFunction(()=>{const v=document.getElementById('refiView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
    await page.click('[data-refimode="advanced"]').catch(()=>{});
    await page.waitForSelector('#refiView [data-noibasis="inplace"]',{timeout:8000}).catch(()=>{});
    await page.click('#refiView [data-noibasis="inplace"]').catch(()=>{});
    await page.waitForTimeout(300);
    const noiIP=await refiNoiShown(page);
    ok(noiIP!=null&&Math.abs(noiIP-LU)<2,'the refinance in-place NOI is the lease-up figure 2,760,000 (got '+noiIP+')');
    ok(noiIP!=null&&Math.abs(noiIP-STMT)>1000,'it is NOT the understated 12-month statement total (1,760,000)');
  }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all lease-up e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
