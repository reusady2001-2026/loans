/* e2e for 2.9.7 (#64): the loan records live in a file on disk (userData/loans.json), not in the browser's
   storage. First launch of 2.9.7 on an older install moves the book across once — backup first, write,
   read back and compare, and only then retire the browser copy (kept under a ".pre-2.9.7" name). After
   that every change is written to the file and survives a restart.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/loans-on-disk.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-disk-'));
const FILE=path.join(UDATA,'loans.json');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
async function launch(){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(800);
  return {app,page,errors};
}
(async()=>{
  // 1) a fresh install writes its book to disk at once
  let {app,page,errors}=await launch();
  ok(fs.existsSync(FILE),'a fresh install writes loans.json at once');
  const n0=JSON.parse(fs.readFileSync(FILE,'utf8')).length;
  // simulate an older install: the book only in the browser's storage, with a marked loan
  await page.evaluate(()=>{ const arr=window.LDS_loans().map(l=>Object.assign({},l)); arr[0].propertyName=arr[0].propertyName+' (OLD-COPY)'; localStorage.setItem('ldsHub.loans.v7',JSON.stringify(arr)); });
  await app.close(); fs.unlinkSync(FILE);
  // 2) first launch of the new version moves it to disk
  ({app,page,errors}=await launch());
  ok(fs.existsSync(FILE),'the book was moved to loans.json');
  const disk=JSON.parse(fs.readFileSync(FILE,'utf8'));
  ok(disk.length===n0 && /\(OLD-COPY\)/.test(disk[0].propertyName),'the moved book is the browser copy, loan for loan ('+disk.length+')');
  const ls=await page.evaluate(()=>({ cur:localStorage.getItem('ldsHub.loans.v7'), kept:!!localStorage.getItem('ldsHub.loans.v7.pre-2.9.7'), when:localStorage.getItem('lds.loansMovedToDisk') }));
  ok(!ls.cur && ls.kept && !!ls.when,'after the read-back matched, the browser copy is retired but kept under ".pre-2.9.7"');
  const bk=fs.existsSync(path.join(UDATA,'backups')) ? fs.readdirSync(path.join(UDATA,'backups')) : [];
  ok(bk.length>0,'a backup was taken before the move ('+bk.join(', ')+')');
  ok(await page.evaluate(()=>window.LDS_loans().some(l=>/\(OLD-COPY\)/.test(l.propertyName))),'the app shows the moved book');
  // 3) a change is written to the file at once and survives a restart
  await page.evaluate(()=>window.LDS_asstAction({action:'set_loan_status',args:{name:'Villages of Independence',status:'Extended'}}));
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ const b=document.querySelector('.aiAsstEditApprove'); if(b) b.click(); });
  await page.waitForTimeout(600);
  const onDisk=JSON.parse(fs.readFileSync(FILE,'utf8')).find(l=>/villages of independence/i.test(l.propertyName));
  ok(onDisk && onDisk.loanStatus==='Extended','the change is in loans.json at once');
  ok(fs.existsSync(path.join(UDATA,'loans.prev.json')),'the previous version is kept as loans.prev.json');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  ({app,page,errors}=await launch());
  const st=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>/villages of independence/i.test(x.propertyName)); return l&&l.loanStatus; });
  ok(st==='Extended','after a restart the change is still there ('+st+')');
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all loans-on-disk e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
