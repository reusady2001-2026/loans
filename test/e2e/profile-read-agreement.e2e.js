/* e2e for v2.9.1: Read agreement — the confirm/edit/reject table with per-field citations.
   The AI extraction itself needs a live Claude connection, so this drives the SAME confirm-table + save
   path with a mock extraction (LDS_readAgreementPropose). On a fresh name-only property it verifies:
   the proposal rows show citations; rejecting a field keeps it out; editing a value lands the edit;
   confirmed profile fields save WITH their citation; and confirmed loan fields create the property's loan.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/profile-read-agreement.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-readag-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

const MOCK={
  propertyAddress:{value:"500 Test Ave, Testville, OH 45000",page:1,quote:"the Property located at 500 Test Ave"},
  residentialUnits:{value:704,page:3,quote:"consisting of 704 residential units"},
  yearBuilt:{value:2015,page:3,quote:"originally built in 2015"},
  lenderName:{value:"Test Bank NA",page:1,quote:"Test Bank, N.A. (the Lender)"},
  originalAmount:{value:50000000,page:2,quote:"in the principal amount of $50,000,000"},
  annualRate:{value:0.0525,page:2,quote:"bearing interest at 5.25% per annum"},
  maturityDate:{value:"2032-01-01",page:2,quote:"the Maturity Date of January 1, 2032"}
};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // proposals: coercion + drop empties
  const props=await page.evaluate((m)=>window.LDS_agreementProposals(m).map(p=>p.key),MOCK);
  ok(props.indexOf('residentialUnits')>=0 && props.indexOf('lenderName')>=0 && props.indexOf('annualRate')>=0,'the extraction maps to proposal rows');

  // a fresh name-only property (no loan)
  const key=await page.evaluate(async ()=>await window.LDS_addProperty('Agreement Test 2.9.1'));
  await page.waitForTimeout(300);
  const n0=await page.evaluate(()=>window.opProperties().length);
  ok(n0===28,'the new property brings the count to 28');
  ok(await page.evaluate((k)=>window.opProperties().find(p=>p.key===k).loans.length===0,key),'it has no loan yet');

  // render the confirm table from the mock extraction
  await page.evaluate(([k,m])=>window.LDS_readAgreementPropose(k,m),[key,MOCK]);
  await page.waitForFunction(()=>{const m=document.getElementById('readAgreementModal');return m&&/Read agreement/.test(m.innerText||'');},null,{timeout:6000});
  const modalTxt=await page.evaluate(()=>document.getElementById('readAgreementModal').innerText||'');
  ok(/704 residential units/i.test(modalTxt),'a citation quote is shown ("704 residential units")');
  ok(/p\.\s*3/i.test(modalTxt),'a page reference is shown (p. 3)');
  ok(await page.evaluate(()=>!!document.querySelector('[data-ag-ok="residentialUnits"]')&&!!document.querySelector('[data-ag-ok="lenderName"]')),'the table has confirm rows for the fields');

  // reject yearBuilt; edit residentialUnits 704 -> 700; keep the rest; save
  await page.evaluate(()=>{
    const yb=document.querySelector('[data-ag-ok="yearBuilt"]'); if(yb) yb.checked=false;
    const ru=document.querySelector('[data-ag-val="residentialUnits"]'); if(ru) ru.value='700';
  });
  await page.evaluate((k)=>window.LDS_readAgreementApply(k),key);
  await page.waitForTimeout(700);

  // profile: edited value + citation; rejected field absent
  const prof=await page.evaluate((k)=>{ const p=window.LDS_profile(k); const f=k=>p.fields[k]; return {
    units: f('residentialUnits')&&f('residentialUnits').value,
    unitsSrc: f('residentialUnits')&&f('residentialUnits').source,
    address: f('address')&&f('address').value,
    yearBuilt: f('yearBuilt')?f('yearBuilt').value:'ABSENT'
  };},key);
  ok(prof.units===700,'the EDITED residential units (700) landed, not the extracted 704');
  ok(prof.unitsSrc&&prof.unitsSrc.kind==='agreement'&&String(prof.unitsSrc.page)==='3'&&/704 residential units/.test(prof.unitsSrc.quote||''),'units carry the agreement citation (page 3 + quote)');
  ok(/500 Test Ave/.test(prof.address||''),'the address was saved to the profile');
  ok(prof.yearBuilt==='ABSENT','the REJECTED field (year built) was NOT saved');

  // loan: created from confirmed loan fields; property still one property, now loan-backed
  const loan=await page.evaluate((k)=>{ const p=window.opProperties().find(x=>x.key===k); const l=p&&p.loans&&p.loans[0]; return l?{lender:l.lenderName,amt:l.originalAmount,rate:l.annualRate,mat:l.maturityDate}:null; },key);
  ok(loan&&loan.lender==='Test Bank NA'&&loan.amt===50000000&&Math.abs(loan.rate-0.0525)<1e-9&&loan.mat==='2032-01-01','a loan was created from the confirmed loan fields');
  ok(await page.evaluate(()=>window.opProperties().length)===28,'the count is still 28 (the loan attached to the same property)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all read-agreement e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
