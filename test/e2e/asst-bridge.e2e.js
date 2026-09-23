/* e2e guard for the 2.9.5 bridge fix (regression introduced in 2.9.4). The shared
   `var aiStatusCache = null;` declaration was deleted with the retired aiRead block, so under the
   main script's "use strict" every connection reader threw ReferenceError — surfaced to the user as
   a false "Could not reach the AI bridge." Opening the assistant (#aiAsstFab) runs
   aiAsstFillModelEffort() → `var st=aiStatusCache||{}` (a READ of the undeclared var) and
   aiAsstRefreshConn() → `aiStatusCache = st` (an ASSIGN) — both throw once the declaration is gone.
   Sandbox note: preload DOES expose aiStatus/aiChat and ai.status() always RESOLVES an object, so the
   .then branch (where the crash lived) actually runs here — this reproduces the real bug.
   Proven: FAILS on shipped 2.9.4 ("ReferenceError: aiStatusCache is not defined"), PASSES with the fix.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-bridge.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-bridge-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow();
  const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(500);

  // (1) the bridge exists AND aiStatus() resolves — this is what makes the .then branch (the crash site) run
  const bridge=await page.evaluate(async()=>{
    const out={ chatAvail: !!(window.ldsShell && window.ldsShell.aiChat), statusFn: !!(window.ldsShell && window.ldsShell.aiStatus) };
    try{ const st=await Promise.race([window.ldsShell.aiStatus(), new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),8000))]);
         out.resolved=true; out.keys=Object.keys(st||{}).sort().join(','); }
    catch(e){ out.resolved=false; out.err=String(e).slice(0,120); }
    return out;
  });
  ok(bridge.chatAvail,'preload exposes ldsShell.aiChat → aiChatAvailable() is true in the sandbox');
  ok(bridge.statusFn,'preload exposes ldsShell.aiStatus');
  ok(bridge.resolved,'ldsShell.aiStatus() RESOLVES an object (the .then branch — where the crash lived — runs): {'+(bridge.keys||'')+'}'+(bridge.resolved?'':' err='+bridge.err));

  // (2) open the assistant — the exact user action that failed in 2.9.4
  const errBefore=errors.length;
  const fabClicked=await page.evaluate(()=>{ const f=document.getElementById('aiAsstFab'); if(!f) return false; f.click(); return true; });
  ok(fabClicked,'the assistant FAB (#aiAsstFab) exists and was clicked');
  await page.waitForTimeout(2500);

  const refErr=errors.slice(errBefore).filter(e=>/aiStatusCache/.test(e)||/is not defined/.test(e));
  ok(refErr.length===0,'opening the assistant threw NO ReferenceError'+(refErr.length?': '+refErr.join(' | '):' (aiStatusCache is declared in scope)'));

  const ui=await page.evaluate(()=>{
    const m=document.getElementById('aiAsstModal');
    const row=document.getElementById('aiAsstConnRow');
    return { modalShown: !!(m && !m.classList.contains('hidden')), row: row?(row.innerText||'').trim():'(no row)' };
  });
  ok(ui.modalShown,'the assistant modal opened (did not crash out of aiAsstOpen)');
  ok(!/could not reach the ai bridge/i.test(ui.row),'the connection row is NOT the false "Could not reach the AI bridge" — reads: "'+ui.row.replace(/\s+/g,' ').slice(0,140)+'"');

  ok(errors.length===0,'no page errors overall'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all asst-bridge checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
