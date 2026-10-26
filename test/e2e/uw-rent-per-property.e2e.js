/* e2e for 2.9.8 (problem 5) — Underwriting's average rent and gross potential rent belong to each property.
   Two properties with their own rent rolls and one without: opening A → B → C → A shows each one's own rent
   (C's boxes empty), never the first property's. A rent typed on B stays on B only, and B's saved figure uses
   B's rent even while another property is open.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/uw-rent-per-property.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-uwrent-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const rr=(rents)=>['Unit,Unit Type,Sq Ft,Market Rent,Actual Rent,Status'].concat(rents.map((r,i)=>(101+i)+',1BR/1BA,750,'+r+','+r+',Occupied')).join('\n')+'\n';
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||10000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(250); } return false; };
const val=(page,k)=>page.evaluate((k)=>{ const e=document.querySelector('#uwView [data-uwf="'+k+'"]'); return e?String(e.value):null; },k);
const num=v=>v==null||v===''?null:Number(String(v).replace(/[^0-9.\-]/g,''));
(async()=>{
  const FA=path.join(UDATA,'rent-roll-a.csv'), FB=path.join(UDATA,'rent-roll-b.csv');
  fs.writeFileSync(FA,rr([1000,1000,1000,1000])); fs.writeFileSync(FB,rr([2500,2500,2500,2500]));   // A averages $1,000, B $2,500
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}).catch(()=>{}); await page.waitForTimeout(1500);
  const P=await page.evaluate(()=>window.opProperties().slice(0,3).map(p=>({key:p.key,name:p.name})));
  const [A,B,C]=P;
  // the rent rolls go to A's and B's Documents
  for(const [p,f] of [[A,FA],[B,FB]]){
    await page.evaluate((k)=>window.LDS_openProfile(k),p.key);
    await until(page,()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&!!document.getElementById('loanDocsFile'); });
    await page.setInputFiles('#loanDocsFile',f);
    await until(page,(n)=>{ const h=document.getElementById('loanDocsPanel'); return h&&h.innerText.indexOf(n)>=0; },path.basename(f));
    await page.waitForTimeout(500);
  }
  const open=async(p)=>{ await page.evaluate((k)=>window.LDS_openSizing(k),p.key); await until(page,(k)=>!window.LDS_uwFocus||window.LDS_uwFocus()===k,p.key); await page.waitForTimeout(1500); return { avg:num(await val(page,'avgRentUnit')), gpr:num(await val(page,'rrGPR')) }; };

  const a1=await open(A);
  ok(a1.avg===1000,'A shows its own rent roll: $1,000 average (got '+a1.avg+')');
  const b1=await open(B);
  ok(b1.avg===2500,'B shows ITS rent roll: $2,500 — not A\'s $1,000 (got '+b1.avg+')');
  ok(b1.gpr!=null&&b1.gpr!==a1.gpr,'B\'s gross potential rent is its own ('+b1.gpr+' vs A '+a1.gpr+')');
  const c1=await open(C);
  ok(c1.avg===null&&c1.gpr===null,'C has no rent roll: both boxes are empty, nothing carried over (got '+c1.avg+' / '+c1.gpr+')');
  const a2=await open(A);
  ok(a2.avg===1000&&a2.gpr===a1.gpr,'back to A: its own $1,000 and the same yearly rent');

  // a rent typed on B stays on B
  await open(B);
  await page.evaluate(()=>{ const e=document.querySelector('#uwView [data-uwf="avgRentUnit"]'); e.value='2222'; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(1500);
  const bT=await open(B), aT=await open(A);
  ok(aT.avg===1000,'typing on B leaves A alone (A still $1,000, got '+aT.avg+')');
  const bBack=await open(B);
  ok(bBack.avg===2222,'B keeps the $2,222 you typed for it (got '+bBack.avg+')');
  await open(A);
  const gB=await page.evaluate((k)=>window.LDS_propGPR?window.LDS_propGPR(k):'missing',B.key);
  ok(gB===bBack.gpr&&gB!=null,'with A open, B\'s saved figure still uses B\'s own rent ('+gB+' = '+bBack.gpr+')');
  const gC=await page.evaluate((k)=>window.LDS_propGPR?window.LDS_propGPR(k):'missing',C.key);
  ok(gC===null,'C, with no rent roll and nothing typed, has no rent figure (got '+gC+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all Underwriting rent-per-property e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
