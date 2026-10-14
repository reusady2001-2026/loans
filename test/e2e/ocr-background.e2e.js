/* e2e for 2.9.8 (problem 3) — OCR keeps reading while the app window is in the background.
   The window is hidden (as when you switch to another program) and a scanned PDF is read: the reading
   finishes without the window coming back to the front.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/ocr-background.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-ocrbg-'));
const FX=path.join(APP,'test','fixtures','ocr');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const b64=(f)=>fs.readFileSync(path.join(FX,f)).toString('base64');
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}); await page.waitForTimeout(800);

  // the window goes to the background: hidden, as when another program is in front
  await app.evaluate(({BrowserWindow})=>{ BrowserWindow.getAllWindows().forEach(w=>{ try{ w.hide(); }catch(e){} }); });
  await page.waitForTimeout(1500);
  const shown=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()));
  ok(!(await shown()),'the window is in the background (not shown)');

  const t0=Date.now();
  const r=await Promise.race([
    page.evaluate(({b})=>window.LDS_readFileBytes('stamped-scan.pdf',b,0),{b:b64('stamped-scan.pdf')}),
    new Promise(res=>setTimeout(()=>res({timedOut:true}),90000))
  ]);
  const secs=Math.round((Date.now()-t0)/1000);
  ok(!r.timedOut,'the scanned page was read while the window stayed in the background ('+(r.timedOut?'still waiting after 90 s':secs+' s')+')');
  ok(!r.timedOut&&/Loan Amount: \$12,450,000\.00/.test(r.text||''),'…and the text is right');
  ok(!(await shown()),'the window never came back to the front by itself');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all OCR-in-the-background e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
