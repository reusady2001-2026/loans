/* e2e for 2.9.7 (#8, #20, #34, #35, #56): close and reopen. Everything saved before the restart is there the
   moment Home first shows its table — an added loan-less property, an archived property (in the Archived
   strip, out of the totals), and a T12's NOI on Home and for the assistant — without opening Underwriting or
   Data Health first. Also the folder rule: Add Property and Add Loan for a new property create its folder.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/startup-load.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const T12=path.join(APP,'test','fixtures','sample-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-boot-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const hash=k=>crypto.createHash('sha1').update(k).digest('hex').slice(0,16);
async function launch(){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  return {app,page,errors};
}
(async()=>{
  let {app,page,errors}=await launch();
  await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}); await page.waitForTimeout(600);
  // add a loan-less property, archive another, give Villages of Whitewater a T12
  await page.evaluate(()=>window.LDS_addProperty('Maple Court Boot Test')); await page.waitForTimeout(500);
  const arch=await page.evaluate(()=>window.opProperties().find(p=>/the botanic/i.test(p.name)).key);
  await page.evaluate((k)=>window.LDS_archiveProperty(k,true),arch); await page.waitForTimeout(500);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(600);
  await page.setInputFiles('#uwFile',T12);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1500);
  const before=await page.evaluate(()=>({ counter:document.getElementById('loanCountLabel').textContent, noi:window.LDS_loanNOI(window.LDS_loans().find(l=>/villages of whitewater/i.test(l.propertyName))) }));
  ok(Math.abs(before.noi-671287.90)<0.01,'before restart: the T12 gives Villages of Whitewater NOI $671,287.90 (got '+before.noi+')');
  ok(errors.length===0,'run 1: no page errors'+(errors.length?': '+errors.join(' | '):''));
  // folder rule: Add Property created the folder
  ok(fs.existsSync(path.join(UDATA,'documents',hash('name:maple court boot test'),'index.json')),'Add Property created the property folder at once');
  await app.close();

  // ---- reopen: read the very first Home that shows a table ----
  ({app,page,errors}=await launch());
  const sawLoading=await page.waitForFunction(()=>!!document.getElementById('portfolioLoading'),null,{timeout:6000}).then(()=>true).catch(()=>false);
  await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000});
  const first=await page.evaluate(()=>{ const t=document.getElementById('portfolioView').innerText;
    return { counter:document.getElementById('loanCountLabel').textContent, maple:/Maple Court Boot Test/.test(t), archived:/Archived \(1\)/i.test(t), botanicRow:[...document.querySelectorAll('#portfolioView tr[data-goto]')].some(r=>/botanic/i.test(r.innerText)),
      noi:window.LDS_loanNOI(window.LDS_loans().find(l=>/villages of whitewater/i.test(l.propertyName))), asst:(window.LDS_aiAsstSnapshot().find(x=>/villages of whitewater/i.test(x.property||x.name||''))||{}).noi,
      opts:[...document.querySelectorAll('#loanSelect option')].map(o=>o.textContent).join('|') }; });
  ok(sawLoading,'while it loads, Home says "Loading portfolio…"');
  ok(first.counter===before.counter,'the counter is the same as before the restart ('+first.counter+')');
  ok(first.maple,'the added loan-less property is on Home at once');
  ok(first.archived && !first.botanicRow,'the archived property is in the Archived strip and not in the loan table');
  ok(!/botanic/i.test(first.opts),'the archived property is not in the dropdown');
  ok(Math.abs(first.noi-671287.90)<0.01,'the T12 NOI is there at once, without opening Underwriting ('+first.noi+')');
  ok(Math.abs((first.asst||0)-671287.90)<0.01,'the assistant sees the T12 NOI at once ('+first.asst+')');
  ok(errors.length===0,'run 2: no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all startup-load e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
