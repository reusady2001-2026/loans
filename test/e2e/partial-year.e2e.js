/* e2e for v2.9.0.1: the annualization rule is ONLY the first-two-months test. A statement whose first
   two months have POSITIVE NOI is NOT annualized — it is summed as-is — even if it has fewer than 12
   months. (This is the 2.8.8 "fewer-than-12-months" auto-annualize being REMOVED: Yuval's rule is that
   last-3-months × 4 applies only when the first two months' NOI are both <= 0.)
   Fixture (7 months, GPR 100k/mo, taxes 10k/mo — first two months NOI = 90k > 0): statement NOI is the
   7-month sum 630,000; it must be kept as-is (basis "statement"), NOT annualized to 1,080,000.
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

  // ---- general-data.json keeps the 7-month statement as-is; NO annualization (first two months are positive) ----
  const gd=readGD();
  ok(!!gd,'general-data.json written');
  ok(gd&&gd.noi&&gd.noi.inPlaceBasis==='statement','a statement with positive first two months is NOT annualized (basis "statement", not "annualized")');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlace-STMT)<2,'IN-PLACE NOI is the 7-month sum 630,000 (got '+(gd&&gd.noi&&gd.noi.inPlace)+')');
  ok(gd&&gd.noi&&Math.abs(gd.noi.inPlace-ANNUALIZED)>2,'IN-PLACE NOI is NOT the annualized 1,080,000');
  ok(gd&&gd.noi&&(gd.noi.annualizedMonths==null),'no annualization months are recorded');
  ok(gd&&gd.noi&&gd.noi.underwritten>0&&gd.noi.underwritten<700000,'UNDERWRITTEN NOI is off the 7-month statement (well under 700k), not annualized — got '+(gd&&gd.noi&&Math.round(gd.noi.underwritten)));

  // ---- the underwriting tab shows the statement figure, not an annualized one ----
  const uw=await page.evaluate(()=>document.getElementById('uwView').innerText||'');
  ok(uw.indexOf('630,000')>=0,'the tab shows the 7-month statement NOI (630,000)');
  ok(uw.indexOf('1,080,000')<0,'the tab does NOT show an annualized figure (1,080,000)');
  ok(!/last 3 months/i.test(uw),'no "last 3 months × 4" annualization banner appears');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all partial-year (not-annualized) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
