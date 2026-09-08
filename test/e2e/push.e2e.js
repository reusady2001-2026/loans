/* e2e for v2.7.1 "what to push" — a per-property Claude analysis of operating LEVERS (vacancy, rent,
   specific costs), grounded in the property's real T12. Verifies the property's own line items are sent
   to Claude and the ranked levers render. Uses a fake CLI (real Claude quality is judged live).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/push.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const SP='/tmp/claude-0/-home-user-loans/0ea2848d-a7d5-57d0-bf6f-575e4bc508cf/scratchpad';
const FAKE=path.join(SP,'fake-claude-push.js');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-push-'));
const INPUT=path.join(UDATA,'push-input.json');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const KEY='addr:10400 edgewood rd, harrison, oh 45030';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_INPUT_FILE:INPUT})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(500);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>/What to push on this property/i.test(document.getElementById('uwView').innerText)),'the section is titled "What to push on this property"');
  ok(await page.evaluate(()=>!!document.getElementById('opPushRun')),'there is an "Analyse what to push" button for the property');
  ok(!(await page.evaluate(()=>/DSCR|maturit|refinanc/i.test((document.getElementById('opScanMount')||{}).innerText||''))),'the push panel does NOT talk about DSCR / maturities / refinancing (not a covenant scan)');
  await page.evaluate(()=>document.getElementById('opPushRun').click());
  await page.waitForFunction(()=>/Reduce Vacancy/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:15000}).catch(()=>{});
  const panel=await page.evaluate(()=>(document.getElementById('opScanMount')||{}).innerText||'');
  ok(/Reduce Vacancy/i.test(panel),'a ranked lever "Reduce Vacancy" is shown');
  ok(/Repairs & Maintenance/i.test(panel),'a specific cost line ("Repairs & Maintenance") is shown as a lever');
  ok(/\$150,000/.test(panel),'the estimated annual NOI impact ($150,000) is shown');
  // Prove the REAL property data was sent to Claude
  const sent=(()=>{try{return JSON.parse(fs.readFileSync(INPUT,'utf8'));}catch(e){return null;}})();
  ok(sent&&sent.property&&/Villages of Whitewater/i.test(sent.property),'Claude was sent THIS property (name)');
  ok(sent&&Math.abs((sent.inPlaceNOI||0)-9483604.28)<0.5,'Claude was sent the live in-place NOI 9,483,604.28 (got '+(sent&&sent.inPlaceNOI)+')');
  ok(sent&&Array.isArray(sent.income)&&sent.income.length>0&&Array.isArray(sent.expense)&&sent.expense.length>0,'Claude was sent the property\'s own income + expense line items');
  ok(sent&&sent.expense.some(x=>/repairs|maintenance/i.test(x.label||'')),'the expense lines include the real T12 categories (Repairs & Maintenance)');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all push checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
