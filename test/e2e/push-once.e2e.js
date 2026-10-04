/* e2e for 2.9.7 (#78): "what to push" runs only when something it reads changed — a new or different T12 (by
   checksum) or changed assumptions — or when the user clicks Re-analyse. Otherwise the saved result is shown,
   also after a restart. Uses the fake Claude CLI (test/fixtures/fake-claude-push.js) and counts its calls.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/push-once.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js'), T12=path.join(APP,'test','fixtures','sample-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-push1-')), CALLS=path.join(UDATA,'calls.txt');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const calls=()=>{ try{ return fs.readFileSync(CALLS,'utf8').trim().split('\n').filter(l=>l&&!/T12-CHECK/.test(l)).length; }catch(e){ return 0; } };   // "what to push" calls only (the T12 double reading is counted separately)
// an older year's T12 (Jul 2024 → Jun 2025)
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], ms=[]; for(let i=0;i<12;i++){ const y=2024+Math.floor((i+6)/12); ms.push(MON[(i+6)%12]+" "+y); }
const g=Array(12).fill(50000), t=Array(12).fill(5000), sum=a=>a.reduce((x,y)=>x+y,0);
const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Account",...ms,"Total"],["Gross Potential Rent",...g,sum(g)],["TOTAL INCOME",...g,sum(g)],["Real Estate Taxes",...t,sum(t)],["TOTAL EXPENSES",...t,sum(t)],["NET OPERATING INCOME",...g.map((x,i)=>x-t[i]),sum(g)-sum(t)]]),"Report1");
const OLD=path.join(UDATA,'older-year.xlsx'); fs.writeFileSync(OLD,XLSX.write(wb,{type:"buffer",bookType:"xlsx"}));
async function launch(){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CALLS_FILE:CALLS})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(800);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(1500);
  return {app,page,errors};
}
const waitCalls=async(n,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||15000)){ if(calls()>=n) break; await new Promise(r=>setTimeout(r,300)); } };
const settle=(page)=>page.waitForFunction(()=>!/Claude is reading/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:20000}).catch(()=>{}).then(()=>page.waitForTimeout(1200));
(async()=>{
  let {app,page,errors}=await launch();
  await page.setInputFiles('#uwFile',T12); await page.waitForFunction(()=>/FAKE-MOVE/.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:20000}).catch(()=>{}); await settle(page);
  ok(calls()===1,'a new T12 runs "what to push" once ('+calls()+')');
  await page.setInputFiles('#uwFile',T12); await page.waitForTimeout(2500);
  ok(calls()===1,'uploading the same file again does not run it ('+calls()+')');
  await page.setInputFiles('#uwFile',OLD); await page.waitForTimeout(3000);
  ok(calls()===1,'an older year\'s T12 (the newer one stays in use) does not run it ('+calls()+')');
  await app.close();
  ({app,page,errors}=await launch()); await page.waitForTimeout(1500);
  ok(calls()===1,'after a restart, focusing the property shows the saved result without running it ('+calls()+')');
  ok(/FAKE-MOVE/.test(await page.evaluate(()=>(document.getElementById('opScanMount')||{}).innerText||'')),'the saved moves are on screen');
  // change an assumption and save → it runs again
  await page.evaluate(()=>{const i=document.querySelector('#uwView [data-uwbench="vacancyPct"]'); i.value='7'; i.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(600);
  await page.evaluate(()=>{const b=document.getElementById('uwSaveBtn'); if(b) b.click();}); await waitCalls(2); await settle(page);
  ok(calls()===2,'changed assumptions run it again ('+calls()+')');
  await page.evaluate(()=>{const b=document.getElementById('opPushRun'); if(b) b.click();}); await waitCalls(3); await settle(page);
  ok(calls()===3,'Re-analyse runs it on request ('+calls()+')');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all push-once e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
