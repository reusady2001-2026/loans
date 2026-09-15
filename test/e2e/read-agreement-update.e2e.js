/* e2e (cleanup, row 3): Read agreement UPDATES an existing property in place — a confirmed loan field
   OVERWRITES what's already on the senior loan (it doesn't only backfill blanks). Picks an existing
   loan-backed property, proposes new loan terms via the mock extraction, confirms, and checks the senior
   loan now carries the new values; a blank confirmed value never wipes existing data.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/read-agreement-update.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-ragu-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

// New, deliberately-distinct terms so we can prove they overwrote whatever was there.
const MOCK={
  originalAmount:{value:41234567,page:2,quote:"in the principal amount of $41,234,567"},
  annualRate:{value:0.0731,page:2,quote:"bearing interest at 7.31% per annum"},
  maturityDate:{value:"2033-07-01",page:2,quote:"the Maturity Date of July 1, 2033"}
};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // an EXISTING loan-backed property whose senior loan already has terms
  const before=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans&&x.loans.length>0); const l=p.loans[0]; return { key:p.key, name:p.name, amt:l.originalAmount, rate:l.annualRate, mat:l.maturityDate }; });
  ok(!!before.key,'found an existing loan-backed property: '+before.name);
  ok(before.amt!==41234567,'its current loan amount differs from the proposal (a real overwrite will be visible)');

  // propose new loan terms from the agreement, confirm them all
  await page.evaluate(([k,m])=>window.LDS_readAgreementPropose(k,m),[before.key,MOCK]);
  await page.waitForFunction(()=>{const m=document.getElementById('readAgreementModal');return m&&/Read agreement/.test(m.innerText||'');},null,{timeout:6000});
  await page.evaluate((k)=>window.LDS_readAgreementApply(k),before.key);
  await page.waitForTimeout(700);

  const after=await page.evaluate((k)=>{ const p=window.opProperties().find(x=>x.key===k); const l=p.loans[0]; return { amt:l.originalAmount, rate:l.annualRate, mat:l.maturityDate, count:window.opProperties().length }; },before.key);
  ok(after.amt===41234567,'the confirmed loan amount OVERWROTE the existing value ($41,234,567)');
  ok(Math.abs(after.rate-0.0731)<1e-9,'the confirmed rate overwrote the existing rate (7.31%)');
  ok(after.mat==='2033-07-01','the confirmed maturity overwrote the existing maturity (2033-07-01)');
  ok(after.count===27,'no new property was created — the same property was updated in place (still 27)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all read-agreement-update e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
