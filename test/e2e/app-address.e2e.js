/* e2e for 2.9.7 (#60, #62) — the app runs from its internal address, lds://app/, so both OCR engines work.
   - the window shows lds://app/index.html; the settings saved at the old file address are copied over once
   - a scanned page is read by BOTH engines (tesseract + PaddleOCR) with no hidden errors (#62)
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/app-address.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-addr-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const launch=async()=>{ const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
  args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}); await page.waitForTimeout(600);
  return { app, page, errors }; };
(async()=>{
  // ---- 1) the app's address; plant settings at the OLD address as a 2.9.6 install would have them ----
  let A=await launch();
  ok(A.page.url()==='lds://app/index.html','the app runs from lds://app/index.html ('+A.page.url()+')');
  ok(fs.existsSync(path.join(UDATA,'storage-origin.json')),'the one-time settings copy is recorded');
  await A.app.evaluate(async({BrowserWindow},dir)=>{ const w=new BrowserWindow({show:false}); await w.loadFile(dir+'/legacy-storage.html');
    await w.webContents.executeJavaScript('localStorage.setItem("lds.portfolioTargets", JSON.stringify({dscrMin:1.4,ltvMax:0.7,dyMin:0.09})); localStorage.setItem("lds.e2eOldKey","from-2.9.6"); true'); w.destroy(); },APP);
  await A.page.evaluate(()=>{ localStorage.removeItem('lds.originMigrated'); localStorage.removeItem('lds.portfolioTargets'); });
  await A.app.close(); fs.rmSync(path.join(UDATA,'storage-origin.json'),{force:true});

  // ---- 2) restart: the old settings are copied over ----
  A=await launch();
  const S=await A.page.evaluate(()=>({ old:localStorage.getItem('lds.e2eOldKey'), t:JSON.parse(localStorage.getItem('lds.portfolioTargets')||'{}'), mark:!!localStorage.getItem('lds.originMigrated') }));
  ok(S.old==='from-2.9.6'&&S.t.dscrMin===1.4&&S.mark,'the settings saved at the old address are there after the move ('+JSON.stringify(S)+')');

  // ---- 3) both OCR engines read a scanned page, no hidden errors ----
  const b64=fs.readFileSync(path.join(APP,'test','fixtures','ocr','scan-page.jpg')).toString('base64');
  const R=await A.page.evaluate(async(b64)=>{ const img=new Image(); img.src='data:image/jpeg;base64,'+b64; await img.decode(); const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; cv.getContext('2d').drawImage(img,0,0);
    const t=await window.LDS_OCR.recognizePage(cv); return { t, used:window.LDS_OCR.enginesUsed() }; },b64);
  ok(R.used.a&&R.used.b,'both engines read the page (tesseract '+R.used.a+', PaddleOCR '+R.used.b+')');
  ok(/Loan Amount: \$12,450,000\.00/.test(R.t)&&/Maturity Date: 2031-04-01/.test(R.t),'the page’s figures come through');
  ok(A.errors.length===0,'no page errors (no hidden OCR errors)'+(A.errors.length?': '+A.errors.slice(0,3).join(' | ')+' (+'+(A.errors.length-3)+')':''));
  await A.app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all app-address e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
