/* e2e for 2.9.13 — the page of a property with NO loan carries everything about the PROPERTY that a loan property's
   page has:
   (1) its NOI box — the same NOI as everywhere else (the T12 rule's), how it was worked out, its value at a cap rate
       (the last loan's, else the default), and "Debt: None" instead of DSCR / debt yield / LTV; the Underwriting
       button lives there, as on a loan's page;
   (2) its Rent roll summary — tiles, the non-revenue and commercial lines, Import / Update rent roll;
   (3) its removed / paid-off loans with Restore — restoring one turns the page into its loan page.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/noloan-page-2913.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-2913-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b,t)=>typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=(t==null?1:t);
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||15000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(250); } return false; };
const num=s=>{ const t=String(s||'').replace(/,/g,''); const m=t.match(/(-)?\$?(-)?([\d.]+)/); return m?Number(m[3])*((m[1]||m[2])?-1:1):null; };
// ---- fixtures (made up; the same shapes as the 2.9.12 test) ----
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
const panel=(page)=>page.evaluate(()=>{ const h=document.getElementById('propOpPanel'); if(!h) return null; const tiles=[...h.querySelectorAll('.text-sm.font-bold')].map(e=>e.innerText); return { text:h.innerText, tiles, src:((h.querySelector('[data-loanopsrc]')||{}).innerText||''), btn:!!h.querySelector('#propOpOpen') }; });
const homeTab=(page)=>page.evaluate(()=>{ const b=document.querySelector('[data-tabsel="home"]'); if(b) b.click(); });
const openPage=async(page,k)=>{ await homeTab(page); await page.evaluate((k)=>window.LDS_openProfile(k),k); await until(page,()=>{ const v=document.getElementById('propView'); return v&&!v.hidden; }); await page.waitForTimeout(800); };

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}).catch(()=>{}); await page.waitForTimeout(1500);

  // ---- (A) a property added with no loan ----
  await page.evaluate(()=>window.LDS_addProperty('Test Plaza'));
  const K=await page.evaluate(()=>{ const p=window.opProperties().find(x=>/^test plaza$/i.test(x.name)); return p?p.key:null; });
  ok(!!K,'a property with no loan: '+K);
  await openPage(page,K);
  let s0=await page.evaluate((k)=>({ rr:!!document.querySelector('#propUnitStatsPanel [data-rrimportfor="'+k+'"]'), rrTitle:/Rent roll summary/.test((document.getElementById('propUnitStatsPanel')||{}).innerText||''), headerUw:!!document.querySelector('#propHeader [data-propuw]'), inactive:((document.getElementById('propInactivePanel')||{}).innerHTML||'').length }),K);
  let p0=await panel(page);
  ok(p0&&/Property NOI/i.test(p0.text)&&/No NOI yet/.test(p0.src),'(1) its page has the NOI box — before any T12: "'+(p0&&p0.src)+'"');
  ok(p0&&p0.btn&&!s0.headerUw,'…with "Open in Underwriting" in the box (as on a loan’s page), not twice');
  ok(s0.rrTitle&&s0.rr,'(2) its page has the Rent roll summary, with Import rent roll for this property');
  ok(s0.inactive===0,'(3) no removed loans → no removed-loans section');
  // the rent roll through its page
  await page.setInputFiles('#loanDocsFile',FRR);
  await until(page,()=>/4 units|Units\s*4/i.test(((document.getElementById('propUnitStatsPanel')||{}).innerText||'').replace(/\n/g,' ')),null,15000);
  await page.waitForTimeout(800);
  const rr=await page.evaluate(()=>{ const h=document.getElementById('propUnitStatsPanel'); const t=[...h.querySelectorAll('.text-sm.font-bold')].map(e=>e.innerText); return { tiles:t, text:h.innerText }; });
  ok(rr.tiles[0]==='4'&&rr.tiles[1]==='2'&&rr.tiles[2]==='1','the rent roll shows on its page: 4 units, 2 occupied, 1 vacant (got '+rr.tiles.slice(0,3).join(' / ')+')');
  ok(/non-revenue/.test(rr.text)&&/lease by lease/.test(rr.text),'…with the non-revenue and the commercial (lease by lease) lines');
  // the T12 through Underwriting, then back to its page
  await page.evaluate((k)=>window.LDS_openSizing(k),K); await until(page,(k)=>window.LDS_uwFocus&&window.LDS_uwFocus()===k,K); await page.waitForTimeout(800);
  await page.setInputFiles('#uwFile',FT12);
  await until(page,()=>/last 3 months/i.test((document.getElementById('uwView')||{}).innerText||''),null,20000); await page.waitForTimeout(1500);
  const uwNoi=await page.evaluate(()=>{ const e=document.getElementById('uwInPlaceNoi'); return e?e.innerText:''; });
  await openPage(page,K);
  await until(page,()=>/T3 × 4/.test(((document.getElementById('propOpPanel')||{}).innerText||'')),null,15000);
  const p1=await panel(page);
  ok(p1&&near(num(p1.tiles[0]),RULE,1)&&near(num(p1.tiles[0]),num(uwNoi),1),'its NOI is the T12 rule’s, the same as Underwriting ('+(p1&&p1.tiles[0])+' = '+uwNoi+')');
  ok(p1&&/From the T12/.test(p1.src)&&/T3 × 4/.test(p1.src),'…and says how it was worked out ("'+(p1&&p1.src)+'")');
  ok(p1&&near(num(p1.tiles[1]),RULE/0.06,1)&&/6\.00%/.test(p1.tiles[2])&&/the default/.test(p1.text),'its value is NOI ÷ the default 6% cap rate ('+(p1&&p1.tiles[1])+')');
  ok(p1&&p1.tiles[3]==='None'&&/no DSCR, debt yield or LTV/.test(p1.text),'Debt: None — no DSCR, debt yield or LTV');
  await page.click('#propOpOpen'); await until(page,(k)=>window.LDS_uwFocus&&window.LDS_uwFocus()===k,K,8000);
  ok(await page.evaluate((k)=>window.LDS_uwFocus()===k,K),'"Open in Underwriting" opens it in Underwriting');

  // ---- (B) a property whose only loan is removed ----
  await homeTab(page); await page.waitForTimeout(400);
  const pick=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans.length===1&&Number(x.loans[0].noi)>0&&!window.LDS_gdNOICache()[x.key]); return p?{ id:p.loans[0]._id, key:p.key, name:p.name, noi:Number(p.loans[0].noi), cap:p.loans[0].capRate }:null; });
  ok(!!pick,'picked a property with one loan, its own NOI and no T12 ('+(pick&&pick.name)+')');
  await page.evaluate((id)=>{ const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },pick.id);
  await page.waitForTimeout(400); await page.click('#loanRecRemove'); await page.waitForTimeout(300); await page.click('#confirmOk'); await page.waitForTimeout(800);
  await openPage(page,pick.key);
  const ib=await page.evaluate((id)=>{ const h=document.getElementById('propInactivePanel'); return { text:h?h.innerText:'', btn:!!(h&&h.querySelector('[data-proprestoreloan="'+id+'"]')) }; },pick.id);
  ok(ib.btn&&/removed & paid-off loans \(1\)/i.test(ib.text),'(3) its page lists its removed loan with Restore ("'+ib.text.replace(/\n+/g,' · ').slice(0,120)+'")');
  const p2=await panel(page);
  const cr=await page.evaluate((id)=>{ const l=window.LDS_getLoan(id); return l&&l.capRate>0?l.capRate:null; },pick.id);
  ok(p2&&near(num(p2.tiles[0]),pick.noi,1)&&/last loan/.test(p2.src),'its NOI box shows the last loan’s own NOI ('+(p2&&p2.tiles[0])+', "'+(p2&&p2.src)+'")');
  ok(p2&&/the last loan’s/.test(p2.text)&&(cr==null||near(num(p2.tiles[1]),pick.noi/cr,2)),'…valued at the last loan’s cap rate ('+(p2&&p2.tiles[2])+' → '+(p2&&p2.tiles[1])+')');
  await page.click('[data-proprestoreloan="'+pick.id+'"]');
  ok(await until(page,()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden; },null,8000),'Restore brings the loan back and opens its loan page');
  ok(await page.evaluate((id)=>{ const l=window.LDS_getLoan(id); return !!l&&!l.archived; },pick.id),'…the loan is active again');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all 2.9.13 no-loan page e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
