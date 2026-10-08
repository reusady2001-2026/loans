/* e2e for 2.9.12 — one NOI everywhere; commercial rent lease by lease; occupied = what the rent roll says.
   A synthetic property shaped like the one that showed the bug: a T12 whose first six months are $0 (lease-up →
   the T12 rule takes the last 3 months × 4), commercial units written as unit type "Comm.man" (market rent $0, the
   lease in Actual Rent), an apartment with a resident at $0 rent, a MODEL, and VACANT units.
   (N1) the property page's NOI, DSCR, debt yield and LTV are the T12 rule's — the same NOI Underwriting shows —
        never the operating lines' 12-month total; its label says how the NOI was worked out; the Underwriting
        "Portfolio roll-up" row shows the same NOI;
   (N3) occupied / vacant / non-revenue follow the rent roll (its own summary block agrees);
   (N2) the underwritten Commercial Rent is the leases × 12 (a vacant unit $0); the in-place keeps the T12's; the
        leases are listed under the line; the saved NOI (general-data.json) carries it.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/noi-commercial-2912.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-2912-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b,t)=>typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=(t==null?1:t);
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||15000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(250); } return false; };
const num=s=>{ const t=String(s||'').replace(/,/g,''); const m=t.match(/(-)?\$?(-)?([\d.]+)/); return m?Number(m[3])*((m[1]||m[2])?-1:1):null; };
// ---- fixtures (made up) ----
// T12 Sep 2025 → Aug 2026: rent starts in month 7. Monthly NOI: 0 ×6, then 30,000, then 90,000 ×5.
// 12-month total = 480,000; the rule (first two months ≤ $0 → lease-up) = last 3 × 4 = 1,080,000.
// Commercial Rent 10,000/mo from month 8 → in-place (last 3 × 4) 120,000.
const MONTHS=["Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026"];
const GPR=[0,0,0,0,0,0,50000,100000,100000,100000,100000,100000], COM=[0,0,0,0,0,0,0,10000,10000,10000,10000,10000], RET=[0,0,0,0,0,0,20000,20000,20000,20000,20000,20000];
const STMT=480000, RULE=1080000;
function makeT12(){ const sum=a=>a.reduce((x,y)=>x+y,0), inc=GPR.map((g,i)=>g+COM[i]), noi=inc.map((v,i)=>v-RET[i]);
  const aoa=[["Test Plaza (commerce)"],["Account",...MONTHS,"Total"],["Gross Potential Rent",...GPR,sum(GPR)],["Commercial Rent",...COM,sum(COM)],["TOTAL INCOME",...inc,sum(inc)],
    ["Real Estate Taxes",...RET,sum(RET)],["TOTAL EXPENSES",...RET,sum(RET)],["NET OPERATING INCOME",...noi,sum(noi)]];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Report1");
  const p=path.join(UDATA,'12_Month_Cash_Flow_test.xlsx'); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p; }
// Rent roll (Yardi shape). Commercial: 2 leases (12,000 + 2,500 /mo) + 1 vacant. Apartments: 4 — one occupied,
// one with a resident at $0 rent (occupied), one VACANT, one MODEL (non-revenue).
const COMM_ANNUAL=(12000+2500)*12;
function makeRR(){ const aoa=[["Rent Roll"],["Test Plaza (commerce)"],["As Of = 10/06/2026"],
    ["Unit","Unit Type","Unit","Resident","Name","Market","Actual","Resident","Other","Move In","Lease","Move Out","Balance"],
    [null,null,"Sq Ft",null,null,"Rent","Rent","Deposit","Deposit",null,"Expiration",null,null],
    ["Current/Notice/Vacant Residents"],
    ["100","Comm.man",4000,"t100","Test Charter Co",0,12000,0,0,40087,51348,null,0],
    ["150","Comm.man",1000,"t150","Test Sandwich Co",0,2500,0,0,40352,47664,null,0],
    ["160","Comm.man",800,"VACANT","VACANT",0,0,0,0,null,null,null,0],
    ["201","1X1",700,"t201","Resident A",1400,1400,500,0,45960,46416,null,0],
    ["202","1X1",700,"t202","Resident B",1300,0,500,0,46269,null,null,0],
    ["203","1X1",700,"VACANT","VACANT",1500,0,0,0,null,null,null,0],
    ["204","1X1",760,"MODEL","MODEL",1392,0,0,0,null,null,null,0],
    [null,null,null,"Total","Test Plaza(commerce)",5592,15900,1000,0,null,null,null,0],[],
    ["Summary Groups",null,null,null,"Square","Market","Actual","Security","Other","# Of","% Unit","% Sqft","Balance"],
    [null,null,null,null,"Footage","Rent","Rent","Deposit","Deposits","Units","Occupancy","Occupied",null],
    ["Occupied Units",null,null,null,"6,400.00","2,700.00",null,null,null,"4","57.14",null,null],
    ["Total Non Rev Units",null,null,null,"760.00","1,392.00",null,null,null,"1","14.29",null,null],
    ["Total Vacant Units",null,null,null,"1,500.00","1,500.00",null,null,null,"2","28.57",null,null],
    ["Totals:",null,null,null,"9,660.00","5,592.00","15,900.00",null,null,"7","100.00",null,null]];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Report1");
  const p=path.join(UDATA,'RentRoll_test.xlsx'); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p; }
const FT12=makeT12(), FRR=makeRR();

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}).catch(()=>{}); await page.waitForTimeout(1500);
  const P=await page.evaluate(()=>{ const p=window.opProperties().find(x=>/^villages of whitewater$/i.test(x.name)); return {key:p.key,name:p.name}; });

  // the rent roll goes to the property's Documents
  await page.evaluate((k)=>window.LDS_openProfile(k),P.key);
  await until(page,()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&!!document.getElementById('loanDocsFile'); });
  await page.setInputFiles('#loanDocsFile',FRR);
  await until(page,(n)=>{ const h=document.getElementById('loanDocsPanel'); return h&&h.innerText.indexOf(n)>=0; },'RentRoll_test.xlsx');
  await page.waitForTimeout(800);
  // the T12 through Underwriting, with the property picked
  await page.evaluate((k)=>window.LDS_openSizing(k),P.key);
  await until(page,(k)=>window.LDS_uwFocus&&window.LDS_uwFocus()===k,P.key);
  await page.waitForTimeout(800);
  await page.setInputFiles('#uwFile',FT12);
  await until(page,()=>/last 3 months/i.test((document.getElementById('uwView')||{}).innerText||''),null,20000);
  await page.waitForTimeout(1500);

  // ---- (N3) the rent roll's own counts ----
  const b=await page.evaluate(async(k)=>{ const r=await window.LDS_rrBlockFresh(k); return r?{res:r.units,occ:r.occupied,vac:r.vacant,nr:r.nonRevenue,comm:r.commercial,ca:r.commercialAnnual,avg:r.avgMarketOccupied,leases:r.commercialLeases}:null; },P.key);
  ok(b&&b.res===4&&b.occ===2&&b.vac===1&&b.nr===1,'apartments: 4 — 2 occupied (one at $0 rent), 1 vacant, 1 non-revenue (got '+JSON.stringify(b)+')');
  ok(b&&b.comm===3,'3 commercial units (unit type "Comm.man")');
  ok(b&&b.occ+2===4&&b.vac+1===2,'with the 2 leased commercial units: 4 occupied, 2 vacant, 1 non-revenue — the rent roll’s own summary');
  ok(b&&b.avg===1350,'average market rent of the occupied apartments = (1,400 + 1,300) / 2 = 1,350 (got '+(b&&b.avg)+')');
  ok(b&&b.ca===COMM_ANNUAL&&b.leases===3,'commercial lease by lease: (12,000 + 2,500) × 12 = 174,000, the vacant one $0 (got '+(b&&b.ca)+')');

  // ---- (N2) Underwriting: the Commercial Rent line ----
  await page.evaluate((k)=>window.LDS_openSizing(k),P.key);
  await until(page,()=>!!document.querySelector('#uwView [data-uwcomleases]'),null,15000);
  const com=await page.evaluate(()=>{ const l=(window.LDS_uwLines()||[]).find(x=>x.key==='COM'); const row=document.querySelector('#uwView [data-uwcomleases]'); return { t12:l&&l.t12, uw:l&&l.uw, row: row?row.innerText:'' }; });
  ok(near(com.uw,COMM_ANNUAL,0.01),'the underwritten Commercial Rent = the leases, 174,000 (got '+com.uw+')');
  ok(near(com.t12,120000,0.01),'the in-place Commercial Rent stays the T12’s own (last 3 × 4 = 120,000; got '+com.t12+')');
  ok(/Test Charter Co/.test(com.row)&&/Test Sandwich Co/.test(com.row)&&/\$0 \(vacant\)/.test(com.row)&&/174,000/.test(com.row),'the leases are listed under the line, the vacant one at $0 ("'+com.row.slice(0,160)+'…")');
  const uwNoi=await page.evaluate(()=>{ const e=document.getElementById('uwInPlaceNoi'); return e?e.innerText:''; });
  ok(near(num(uwNoi),RULE,1),'Underwriting’s in-place NOI is the T12 rule’s 1,080,000 (got '+uwNoi+')');
  // the saved NOI carries the leases
  const gd=await page.evaluate(async(k)=>{ await window.LDS_ensureGD(k); const g=window.LDS_gdNOICache()[k]; return g?{ip:g.inPlace,uw:g.underwritten}:null; },P.key);
  ok(gd&&near(gd.ip,RULE,1),'general-data.json: in-place 1,080,000 (got '+(gd&&gd.ip)+')');
  const uwNoiShown=await page.evaluate(()=>{ const e=document.getElementById('uwUwNoi'); return e?e.innerText:null; });
  ok(gd&&gd.uw!=null&&uwNoiShown!=null&&near(gd.uw,num(uwNoiShown),1),'…and its underwritten NOI is the one Underwriting shows (saved '+(gd&&gd.uw)+', shown '+uwNoiShown+')');

  // ---- (N1) the property page: one NOI ----
  await page.evaluate((k)=>window.LDS_openProfile(k),P.key);
  await until(page,()=>{ const h=document.getElementById('loanOpPanel'); return h&&/T3 × 4/.test(h.innerText||''); },null,15000);
  const pan=await page.evaluate(()=>{ const h=document.getElementById('loanOpPanel'); const tiles=[...h.querySelectorAll('.text-sm.font-bold')].map(e=>e.innerText); const src=(h.querySelector('[data-loanopsrc]')||{}).innerText||''; const l=window.LDS_activeLoan(); return { tiles, src, dscr: window.LDS_loanDSCR(l) }; });
  ok(near(num(pan.tiles[0]),RULE,1),'the property page’s NOI is the T12 rule’s 1,080,000 — not the 12-month total 480,000 (got '+pan.tiles[0]+')');
  ok(/From the T12/.test(pan.src)&&/T3 × 4/.test(pan.src)&&!/operating model/.test(pan.src),'its label says how the NOI was worked out ("'+pan.src+'")');
  const cp=await page.evaluate((k)=>{ const ls=window.LDS_loans().filter(l=>window.propertyKey(l)===k&&!l.archived); const h=window.LDS_OPERATING_HOOKS; const ds=ls.reduce((a,l)=>a+(h.annualDebtService(l)||0),0), bal=ls.reduce((a,l)=>a+(h.currentBalance(l)||0),0); return {ds,bal}; },P.key);
  ok(near(Number(pan.tiles[1].replace(/[^0-9.]/g,'')),RULE/cp.ds,0.006),'DSCR (combined) runs on that NOI ('+pan.tiles[1]+' = 1,080,000 ÷ '+Math.round(cp.ds)+')');
  ok(near(num(pan.tiles[2]),RULE/cp.bal*100,0.002),'debt yield runs on that NOI ('+pan.tiles[2]+')');
  // the Underwriting "Portfolio roll-up" row
  const roll=await page.evaluate((k)=>{ const rows=window.PortfolioRollup.buildRows(Object.assign({},window.OperatingStore.all()),window.LDS_loans().filter(l=>!l.archived),window.LDS_OPERATING_HOOKS).rows; const r=rows.find(x=>x.propKey===k); return r?{noi:r.noi,uw:r.uwNoi,dscr:r.dscr}:null; },P.key);
  ok(roll&&near(roll.noi,RULE,1),'the Portfolio roll-up row shows the same NOI, 1,080,000 (got '+(roll&&roll.noi)+')');
  ok(roll&&gd&&near(roll.uw,gd.uw,1),'…and the same underwritten NOI as Underwriting ('+(roll&&roll.uw)+')');
  const opTotal=await page.evaluate((k)=>{ const r=window.OperatingStore.get(k); return r?window.OperatingCalc.effectiveNOI(r):null; },P.key);
  ok(near(opTotal,STMT,1),'(the operating lines still hold the statement’s 12-month total, 480,000 — shown nowhere as the NOI)');
  // the rent-roll card says it
  const card=await page.evaluate(()=>{ const h=document.getElementById('loanUnitStatsPanel'); return h?h.innerText:''; });
  ok(/non-revenue/.test(card)&&/lease by lease/.test(card),'the rent-roll card shows the non-revenue unit and the commercial rent lease by lease');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all 2.9.12 e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
