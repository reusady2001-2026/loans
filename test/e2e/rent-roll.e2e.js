/* e2e for 2.9.3: the RentRoll module is loaded in the app, and a rent roll uploaded to a property's
   Documents panel is read back from the folder and parsed (opReadPropRentRoll / LDS_rentRoll) with the
   right unit statistics — GPR grossed up, average actual rent excluding vacant zeros, commercial split.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/rent-roll.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-rr-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const CSV=[
  'Unit,Unit Type,Sq Ft,Market Rent,Actual Rent,Status',
  '101,1BR/1BA,750,1500,1500,Occupied',
  '102,1BR/1BA,750,1500,0,Vacant',
  '201,2BR/2BA,1050,2000,1900,Occupied',
  '202,2BR/2BA,1050,2000,2000,Occupied',
  'C01,Commercial Retail,1200,3000,2800,Occupied'
].join('\n')+'\n';

(async()=>{
  const FIX=path.join(UDATA,'rent-roll.csv'); fs.writeFileSync(FIX,CSV);
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // the module is loaded and the pure parser works through the app's diagnostic
  ok(await page.evaluate(()=>!!window.RentRoll && typeof window.RentRoll.parse==='function'),'the RentRoll module is loaded in the app');
  const pure=await page.evaluate(()=>{ var g=[['Unit','Type','Market Rent','Actual Rent'],['1','1BR',1500,1500],['2','1BR',1500,0]]; return window.LDS_rentRollParse(g); });
  ok(pure && pure.residentialUnits===2 && pure.gprAnnual===36000 && pure.avgActualRent===1500,'LDS_rentRollParse computes GPR (36,000) and excludes the vacant zero from the actual average');

  // open a property and upload the rent roll to its Documents panel
  const key=await page.evaluate(()=>{ const p=window.opProperties()[0]; window.LDS_openProfile(p.key); return p.key; });
  await page.waitForFunction(()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&document.getElementById('loanDocsFile'); },null,{timeout:8000});
  await page.setInputFiles('#loanDocsFile',FIX);
  await page.waitForFunction(()=>{ const h=document.getElementById('loanDocsPanel'); return h&&/rent-roll\.csv/i.test(h.innerText||''); },null,{timeout:9000}).catch(()=>{});
  await page.waitForTimeout(400);

  // read it back from the folder and parse it
  const r=await page.evaluate(async (k)=>{ const res=await window.LDS_rentRoll(k); return res?res.roll:null; }, key);
  ok(r!=null,'the rent roll is found in the property folder and parsed');
  if(r){
    ok(r.residentialUnits===4,'4 residential units read from the uploaded rent roll');
    ok(r.commercialUnits===1,'1 commercial unit');
    ok(r.gprAnnual===84000,'GPR grossed up to 84,000 (vacant unit at market)');
    ok(r.avgActualRent===1800,'average actual rent 1,800 (vacant zero excluded)');
    ok(r.occupancy===0.75,'occupancy 0.75');
    ok(r.commercialAnnual===33600,'commercial income 33,600 kept out of the residential stats');
    ok(r.unitStats.length===2,'two residential unit-type stats rows');
  }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all rent-roll e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
