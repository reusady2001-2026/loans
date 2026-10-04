/* e2e for 2.9.7 (#11) — the T12 rule (per Azriel): a statement covering FEWER than 12 months is annualized
   from its last 3 months × 4 — even when its first two months are positive (the 2.9.0.1 first-two-months-only
   rule is replaced). Fixture (7 months, GPR 100k/mo, taxes 10k/mo): the 7-month sum is 630,000; the NOI must be
   the last 3 months × 4 = 1,080,000 (basis "annualized"), labelled "T3 × 4", with a banner saying the statement
   covers 7 months.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/partial-year.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-partial-'));
function makeFixture(){
  const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
  const MONTHS=["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026"];   // 7 months, all positive
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
const STMT=630000, ANNUALIZED=1080000;   // 630,000 is the 7-month sum; 1,080,000 is what it would be if (wrongly) annualized
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
function readGD(){ try{ const idx=JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8'));
  const f=(idx.files||[]).filter(x=>x.role==='general').sort((a,b)=>b.savedAt-a.savedAt)[0];
  return f?JSON.parse(fs.readFileSync(path.join(PROPDIR,f.stored),'utf8')):null; }catch(e){ return null; } }

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
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
  // The app writes general-data.json in the background after the upload — wait for it (a busy machine is slower).
  for(let t=0;t<50&&!((readGD()||{}).noi);t++) await page.waitForTimeout(300);

  // ---- general-data.json: the 7-month statement is annualized (last 3 months × 4) ----
  const gd=readGD();
  ok(!!gd,'general-data.json written');
  ok(gd&&gd.noi&&gd.noi.inPlaceBasis==='annualized'&&gd.noi.ruleWhy==='short','a 7-month statement is annualized because it covers fewer than 12 months (basis "annualized", why "short")');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlace-ANNUALIZED)<2,'IN-PLACE NOI is the last 3 months × 4 = 1,080,000 (got '+(gd&&gd.noi&&gd.noi.inPlace)+')');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlaceStatement-STMT)<2,'the 7-month statement total 630,000 is kept for reference');
  ok(gd&&gd.noi&&Array.isArray(gd.noi.annualizedMonths)&&gd.noi.annualizedMonths.join(',')==='2026-05,2026-06,2026-07','the annualization months are May, Jun, Jul 2026');
  ok(gd&&gd.noi&&gd.noi.underwritten>700000,'UNDERWRITTEN NOI is on the same annualized run-rate (over 700k) — got '+(gd&&gd.noi&&Math.round(gd.noi.underwritten)));

  // ---- the underwriting tab shows the annualized figure and says why ----
  const uw=await page.evaluate(()=>document.getElementById('uwView').innerText||'');
  ok(uw.indexOf('1,080,000')>=0,'the tab shows the annualized NOI (1,080,000)');
  ok(/last 3 months/i.test(uw)&&/covers 7 months/i.test(uw),'the banner says the statement covers 7 months and uses the last 3 months × 4');
  ok(/T3 × 4/.test(uw),'the NOI is labelled "T3 × 4"');
  const home=await page.evaluate(()=>window.LDS_loanNOI(window.LDS_loans().find(l=>/villages of whitewater/i.test(l.propertyName))));
  ok(Math.abs(home-ANNUALIZED)<2,'Home and the refinance read the same 1,080,000 (got '+home+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all partial-year (annualized) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
