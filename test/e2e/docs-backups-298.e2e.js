/* e2e for 2.9.8 — your Part 1 fails b2 and d4.
   (b2) each automatic backup says WHAT changed ("…: Year built → 1999"), not just "After a change".
   (d4) a file in Documents shows how it was read under its name ("1 page · read by OCR — may contain errors"),
        and a loan agreement added without picking a type is recognised as a "Loan agreement", not "Other";
        a type you pick still wins.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/docs-backups-298.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-docsbk-'));
const FX=path.join(APP,'test','fixtures','ocr');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||30000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(500); } return false; };
(async()=>{
  const AGR=path.join(UDATA,'Note 2024.txt'); fs.writeFileSync(AGR,'LOAN AGREEMENT\nThis Loan Agreement is made between the Borrower and the Lender.\nPrincipal Amount: $12,000,000. Interest Rate: 5.25%. Maturity Date: 2031-04-01. Prepayment: yield maintenance.\n');
  const MEMO=path.join(UDATA,'Note 2025.txt'); fs.writeFileSync(MEMO,'LOAN AGREEMENT (second copy for the type test). Borrower and Lender.\n');
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(6000);   // the start-up folder check settles
  const P=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans.length); return {key:p.key,name:p.name}; });

  // ---- b2: the backup says what changed ----
  await page.evaluate((k)=>window.LDS_setProfileField(k,'yearBuilt',1999),P.key);
  ok(await until(page,async(n)=>{ const l=await window.ldsShell.autoBackupList(); const b=(l.backups||l||[])[0]; return !!(b&&/Year built/i.test(b.reasonLabel||'')); },P.name,30000),'the newest automatic backup says what changed');
  const why=await page.evaluate(async()=>{ const l=await window.ldsShell.autoBackupList(); const b=(l.backups||l||[])[0]; return b?b.reasonLabel:''; });
  ok(new RegExp('^After: .*'+P.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+': Year built → 1999','i').test(why)&&!/^After a change$/.test(why),'…in words: "'+why+'"');

  // ---- d4: how a file was read, and a loan agreement recognised ----
  await page.evaluate((k)=>window.LDS_openProfile(k),P.key);
  await until(page,()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&!!document.getElementById('loanDocsFile'); });
  await page.setInputFiles('#loanDocsFile',path.join(FX,'stamped-scan.pdf'));
  ok(await until(page,()=>{ const h=document.getElementById('loanDocsPanel'); return h&&/stamped-scan\.pdf/.test(h.innerText)&&!!h.querySelector('[data-docread]'); },null,120000),'the scanned file is in Documents with a reading line');
  const row=await page.evaluate(()=>{ const r=[...document.querySelectorAll('#loanDocsPanel [data-docrow]')].find(x=>/stamped-scan\.pdf/.test(x.innerText)); return r?{ read:(r.querySelector('[data-docread]')||{}).textContent||'', type:(r.querySelector('[data-doctype]')||{}).value||'' }:null; });
  ok(row&&/1 page · read by OCR — may contain errors/.test(row.read),'under its name: "'+(row&&row.read)+'"');
  await page.setInputFiles('#loanDocsFile',AGR);
  ok(await until(page,()=>{ const h=document.getElementById('loanDocsPanel'); return h&&/Note 2024\.txt/.test(h.innerText); }),'the agreement (a .txt) is saved');
  const t1=await page.evaluate(()=>{ const r=[...document.querySelectorAll('#loanDocsPanel [data-docrow]')].find(x=>/Note 2024\.txt/.test(x.innerText)); return r?(r.querySelector('[data-doctype]')||{}).value:''; });
  ok(t1==='agreement','a loan agreement added with "Detect automatically" is a Loan agreement, not Other (got '+t1+')');
  await page.evaluate(()=>{ const s=document.getElementById('loanDocsType'); s.value='other'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.setInputFiles('#loanDocsFile',MEMO);
  await until(page,()=>{ const h=document.getElementById('loanDocsPanel'); return h&&/Note 2025\.txt/.test(h.innerText); });
  const t2=await page.evaluate(()=>{ const r=[...document.querySelectorAll('#loanDocsPanel [data-docrow]')].find(x=>/Note 2025\.txt/.test(x.innerText)); return r?(r.querySelector('[data-doctype]')||{}).value:''; });
  ok(t2==='other','a type you pick wins ("Other" stays Other, got '+t2+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all Documents / backups (2.9.8) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
