/* e2e for 2.9.7 — reading files: scans, pictures, Word pictures, missing pages, progress, Stop, resume, no size limit.
   #248      a scanned page that also carries a real e-signature line is read by OCR — both kept
   #101      a real-text page keeps its line breaks (table rows stay rows)
   #100      every page is marked; scanned ones "read by OCR — may contain errors"
   #59       a page that couldn't be read is said ("1 page couldn't be read (page 1)")
   #250      pictures (JPG) and the pictures inside a Word file are read by OCR; Stop, and reading again continues
             where it stopped; a file being read when the app closed is finished at the next start; no 25 MB limit
   #61/#102  a file added to Documents shows what was read; a file read in the assistant is not read again
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/ocr-files.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-ocrf-'));
const FX=path.join(APP,'test','fixtures','ocr');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
// an async check, polled (waitForFunction treats a returned promise as "true" at once)
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||120000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(1000); } return false; };
const b64=(f)=>fs.readFileSync(path.join(FX,f)).toString('base64');
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}); await page.waitForTimeout(800);
  const read=(name,file,stop)=>page.evaluate(({name,b,stop})=>window.LDS_readFileBytes(name,b,stop),{name,b:b64(file),stop:stop||0});

  // ---- #248: a scan with a real e-signature line ----
  let r=await read('stamped-scan.pdf','stamped-scan.pdf');
  ok(/DocuSign Envelope ID/.test(r.text)&&/Loan Amount: \$12,450,000\.00/.test(r.text),'the scan with a real stamp line is read by OCR, and the stamp line is kept');
  ok(/\[page 1 · read by OCR — may contain errors\]/.test(r.text)&&r.label==='1 page · read by OCR — may contain errors','it is marked and labelled: "'+r.label+'"');

  // ---- #101/#100: a mixed PDF ----
  r=await read('mixed.pdf','mixed.pdf');
  ok(/\[page 1\]\nRENT SCHEDULE\nUnit 101\s+Market 1,500\s+Actual 1,450\nUnit 102/.test(r.text),'the real-text page keeps its rows on separate lines');
  ok(/\[page 2 · read by OCR — may contain errors\]/.test(r.text)&&/Tax Escrow/.test(r.text)&&/page 2 read by OCR/.test(r.label),'the scanned page 2 is read by OCR and marked ("'+r.label+'")');

  // ---- #59: a page that can't be read ----
  r=await read('blank-scan.pdf','blank-scan.pdf');
  ok(/1 page couldn’t be read \(page 1\)/.test(r.label)&&/\[page 1 · could not be read\]/.test(r.text),'a page that can’t be read is said: "'+r.label+'"');

  // ---- #250: pictures, and pictures inside Word ----
  r=await read('scan-page.jpg','scan-page.jpg');
  ok(/\[picture · read by OCR — may contain errors\]/.test(r.text)&&/Maturity Date: 2031-04-01/.test(r.text),'a JPG is read by OCR');
  r=await read('memo-with-picture.docx','memo-with-picture.docx');
  ok(/Cover memo/.test(r.text)&&/\[picture 1 in the document · read by OCR — may contain errors\]/.test(r.text)&&/Lender: First Harbor Capital Bank/.test(r.text)&&/End of memo/.test(r.text),'the picture inside a Word file is read by OCR, in its place');

  // ---- #250: Stop, then reading again continues where it stopped ----
  r=await read('mixed.pdf','mixed.pdf',1);
  ok(r.stopped&&r.stoppedAt===1&&/stopped at page 1 — read it again to continue/.test(r.label),'Stop stops between pages ("'+r.label+'")');
  const cache=await page.evaluate(async(sha)=>await window.ldsShell.ocrCacheGet(sha),r.sha);
  r=await read('mixed.pdf','mixed.pdf');
  ok(!r.stopped&&/\[page 2 · read by OCR/.test(r.text)&&cache&&cache.pages&&cache.pages['2'],'pages read by OCR are kept; reading again finishes the file');

  // ---- #61/#102: Documents upload shows what was read ----
  const K=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.name==='M Lofts'); window.LDS_openProfile(p.key); return p.key; }); await page.waitForTimeout(1200);
  await page.setInputFiles('#loanDocsFile',path.join(FX,'stamped-scan.pdf'));
  await until(page,async(k)=>{ const d=await window.ldsShell.docList(k); return (d.files||[]).some(f=>f.name==='stamped-scan.pdf'); },K);
  const D=await page.evaluate(async(k)=>{ const d=await window.ldsShell.docList(k); const f=(d.files||[]).find(x=>x.name==='stamped-scan.pdf'); const q=await window.ldsShell.readqList(); return { f, toast:(document.getElementById('toastText')||{}).textContent||'', q:(q.jobs||[]).length }; },K);
  ok(D.f&&D.f.textLen>200&&/read by OCR — may contain errors/.test(D.f.readLabel||''),'a scan added to Documents is read and saved with what was read ("'+(D.f&&D.f.readLabel)+'")');
  ok(/stamped-scan\.pdf”: 1 page · read by OCR — may contain errors/.test(D.toast),'the message says what was read: "'+D.toast.slice(0,140)+'"');
  ok(D.q===0,'the reading queue is empty once the file is filed');

  // ---- #250: a reading interrupted by closing the app is finished at the next start ----
  const R=await page.evaluate(async({k,b})=>{ const q=await window.ldsShell.readqAdd({ name:'resume-me.pdf', type:'application/pdf', base64:b, fallbackKey:k, fallbackName:'M Lofts', role:'' }); window.LDS_resumeReadingQueue(); return q; },{k:K,b:b64('mixed.pdf')});
  await until(page,async(k)=>{ const d=await window.ldsShell.docList(k); return (d.files||[]).some(f=>f.name==='resume-me.pdf'); },K);
  const RS=await page.evaluate(async(k)=>{ const d=await window.ldsShell.docList(k); const f=(d.files||[]).find(x=>x.name==='resume-me.pdf'); const q=await window.ldsShell.readqList(); return { textLen:f&&f.textLen, q:(q.jobs||[]).length }; },K);
  ok(R.ok&&RS.textLen>200&&RS.q===0,'a queued file is read and filed at the next start (as after closing the app halfway)');

  // ---- #250: no 25 MB limit ----
  const BIG=path.join(UDATA,'big.csv'); { const fd=fs.openSync(BIG,'w'); const line='Line,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,12000\n'; const chunk=line.repeat(10000); while(fs.statSync(BIG).size<26*1024*1024) fs.writeSync(fd,chunk); fs.closeSync(fd); }
  await page.evaluate(()=>document.getElementById('aiAsstFab').click()); await page.waitForTimeout(300);
  await page.setInputFiles('#aiAsstFile',BIG);
  await page.waitForFunction(()=>{ const c=document.querySelector('#aiAsstAttachRow [data-attachchip]'); return c&&!/reading/.test(c.textContent); },null,{timeout:60000}).catch(()=>{});
  const chip=await page.evaluate(()=>(document.querySelector('#aiAsstAttachRow [data-attachchip]')||{}).textContent||'');
  ok(!/too large/.test(chip)&&/characters/.test(chip),'a 26 MB file is read, no size limit ("'+chip.replace(/\s+/g,' ').slice(0,80)+'")');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all ocr-files e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
