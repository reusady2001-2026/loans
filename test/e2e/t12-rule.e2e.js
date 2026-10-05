/* e2e for 2.9.7 — the T12 rule and the tie check.
   (a) #257: a file covering 18 months uses only its LAST 12 — NOI 1,080,000, not the 18-month 1,620,000 —
       labelled "last 12 of 18 months", and the tie check compares the last 12 printed months (ties).
   (b) #10/#74: a statement whose printed totals contradict its own lines (printed NOI 960,000 while the lines
       add to 1,080,000) shows a red "Doesn't tie" with both numbers, the gap and the line that absorbed it —
       never the green "ties" badge.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-rule.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-t12rule-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const sum=a=>a.reduce((x,y)=>x+y,0);
function write(name,aoa){ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Report1"); const p=path.join(UDATA,name); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p; }
// (a) 18 months: Jul 2025 → Dec 2026, GPR 100k / taxes 10k every month
const m18=[]; for(let i=0;i<18;i++){ const y=2025+Math.floor((i+6)/12), m=(i+6)%12; m18.push(MON[m]+" "+y); }
const g18=Array(18).fill(100000), t18=Array(18).fill(10000), n18=g18.map((g,i)=>g-t18[i]);
const F18=write('t12-18mo.xlsx',[["Account",...m18,"Total"],["Gross Potential Rent",...g18,sum(g18)],["TOTAL INCOME",...g18,sum(g18)],["Real Estate Taxes",...t18,sum(t18)],["TOTAL EXPENSES",...t18,sum(t18)],["NET OPERATING INCOME",...n18,sum(n18)]]);
// (b) 12 months whose printed expense total and NOI contradict the lines (taxes 10k/mo, printed expenses 20k/mo, printed NOI 80k/mo)
const m12=MON.map(m=>m+" 2026"), g12=Array(12).fill(100000), t12=Array(12).fill(10000), pe=Array(12).fill(20000), pn=Array(12).fill(80000);
const FBAD=write('t12-contradicts.xlsx',[["Account",...m12,"Total"],["Gross Potential Rent",...g12,sum(g12)],["TOTAL INCOME",...g12,sum(g12)],["Real Estate Taxes",...t12,sum(t12)],["TOTAL EXPENSES",...pe,sum(pe)],["NET OPERATING INCOME",...pn,sum(pn)]]);
// (c) #14: an OLDER year's T12 (Jul 2024 → Jun 2025) uploaded after the sample T12 (Jul 2025 → Jun 2026)
const mOld=[]; for(let i=0;i<12;i++){ const y=2024+Math.floor((i+6)/12), m=(i+6)%12; mOld.push(MON[m]+" "+y); }
const gO=Array(12).fill(50000), tO=Array(12).fill(5000), nO=gO.map((g,i)=>g-tO[i]);
const FOLD=write('t12-older-year.xlsx',[["Account",...mOld,"Total"],["Gross Potential Rent",...gO,sum(gO)],["TOTAL INCOME",...gO,sum(gO)],["Real Estate Taxes",...tO,sum(tO)],["TOTAL EXPENSES",...tO,sum(tO)],["NET OPERATING INCOME",...nO,sum(nO)]]);
const SAMPLE=path.join(APP,'test','fixtures','sample-t12.xlsx');
async function upload(page,key,file){
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},key); await page.waitForTimeout(600);
  await page.setInputFiles('#uwFile',file);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1200);
  return page.evaluate((k)=>({ uw:document.getElementById('uwView').innerText, tie:(document.getElementById('uwNoiTie')||{}).innerText||'', tieCls:(document.getElementById('uwNoiTie')||{}).className||'',
    noi:window.LDS_loanNOI(window.LDS_loans().find(l=>window.propertyKey(l)===k)) }),key);
}
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(800);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  // (a) 18 months
  const a=await upload(page,'name:villages of whitewater',F18);
  ok(Math.abs(a.noi-1080000)<1,'an 18-month file: NOI is the last 12 months only, 1,080,000 (got '+a.noi+')');
  ok(/last 12 of 18 months/i.test(a.uw),'the NOI label says "last 12 of 18 months"');
  ok(/covers 18 months/i.test(a.uw)&&/Jan 2026 → Dec 2026/.test(a.uw),'a note says the file covers 18 months and names the 12 used (Jan 2026 → Dec 2026)');
  ok(/ties to statement NOI/i.test(a.tie)&&/last 12 months/i.test(a.tie),'the tie check compares the same 12 months and ties ("'+a.tie.replace(/\s+/g,' ')+'")');
  // (b) statement contradicts itself
  const b=await upload(page,'name:villages of independence',FBAD);
  ok(!/ties to statement NOI/i.test(b.tie),'a contradicting statement never shows the green "ties" badge');
  ok(/Doesn.t tie/i.test(b.tie)&&/960,000/.test(b.tie)&&/1,080,000/.test(b.tie)&&/gap \$120,000/.test(b.tie),'red "Doesn\'t tie: statement says $960,000, lines add to $1,080,000 (gap $120,000)" ("'+b.tie.replace(/\s+/g,' ').slice(0,200)+'")');
  ok(/General & administrative/i.test(b.tie),'it names the line that absorbed the gap (General & administrative)');
  ok(/rose/.test(b.tieCls),'the badge is red');
  // (c) older year after newer
  const c1=await upload(page,'name:villages of burlington',SAMPLE);
  ok(Math.abs(c1.noi-671287.90)<0.01,'the sample T12 (Jul 2025 → Jun 2026) gives 671,287.90');
  await page.setInputFiles('#uwFile',FOLD);
  const toasts=await page.waitForFunction(()=>{ const t=(document.getElementById('toastText')||{}).textContent||''; return /older file/i.test(t)?t:null; },null,{timeout:15000}).then(h=>h.jsonValue()).catch(()=>'');
  await page.waitForTimeout(800);
  const c2=await page.evaluate(()=>({ noi:window.LDS_loanNOI(window.LDS_loans().find(l=>window.propertyKey(l)==='name:villages of burlington')) }));
  ok(Math.abs(c2.noi-671287.90)<0.01,'uploading an OLDER year keeps the newer statement in use (NOI still 671,287.90, got '+c2.noi+')');
  ok(/Using Jul 2025 – Jun 2026 \(newest\)\. The older file was added to history\./.test(toasts),'the user is told: "Using Jul 2025 – Jun 2026 (newest). The older file was added to history." ('+toasts.slice(0,160)+')');
  const hist=(()=>{ try{ const dir=path.join(UDATA,'documents',crypto.createHash('sha1').update('name:villages of burlington').digest('hex').slice(0,16)); const idx=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8')); const g=(idx.files||[]).filter(f=>f.role==='general').sort((a,b)=>b.savedAt-a.savedAt)[0]; return JSON.parse(fs.readFileSync(path.join(dir,g.stored),'utf8')).window.months; }catch(e){ return null; } })();
  ok(hist&&hist.indexOf('2024-07')>=0&&hist.indexOf('2026-06')>=0,'the history now spans Jul 2024 → Jun 2026 ('+(hist?hist[0]+' → '+hist[hist.length-1]:'none')+')');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all t12-rule e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
