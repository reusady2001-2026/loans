/* e2e for 2.9.7 (#2, #6, #7, #18, #33, #72): the "active loans" rule. Archiving a property, removing a loan
   or marking it Paid off takes it out of every total, the loan table, the Calendar, the export and the
   assistant at once (the screen redraws by itself); Restore brings it back; each Home row shows the loan's
   status. Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/active-loans.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-active-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const num=s=>Number(String(s||'').replace(/[^0-9.\-]/g,''))||0;
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(800);
  const st=()=>page.evaluate(()=>{ const v=document.getElementById('portfolioView'); const t=v.innerText;
    const tot=(t.match(/Total Debt Outstanding\s*\n?\s*(\$[\d,\.]+)/i)||[])[1]||'';
    return { counter:document.getElementById('loanCountLabel').textContent, total:tot, header:(t.match(/(\d+) loans — where the whole book/)||[])[1],
      rows:document.querySelectorAll('#portfolioView tr[data-goto]').length, archivedStrip:/Archived \(\d+\)/i.test(t), inactiveStrip:(t.match(/Removed & paid-off loans \((\d+)\)/i)||[])[1]||'0',
      asst:window.LDS_aiAsstSnapshot().length, cal:(window.LDS_calendarDocHtml().match(/"loanCount":(\d+)/)||[])[1], props:window.opProperties().length,
      statusTags:document.querySelectorAll('#portfolioView [data-loanstatus]').length }; });
  await page.waitForTimeout(1500); const s0=await st();
  ok(s0.rows>20 && s0.asst===s0.rows && String(s0.cal)===String(s0.rows),'before: table rows, assistant and calendar all count the same loans ('+s0.rows+')');
  ok(s0.statusTags>=s0.rows,'every loan on Home shows its status as a small tag ('+s0.statusTags+')');
  // ---- archive a property (Avalon White Plains: senior + mezz) ----
  const key=await page.evaluate(()=>window.opProperties().find(p=>/avalon white plains/i.test(p.name)).key);
  const n=await page.evaluate((k)=>window.opProperties().find(p=>p.key===k).loans.length,key);
  await page.evaluate((k)=>window.LDS_archiveProperty(k,true),key); await page.waitForTimeout(800);
  const s1=await st();
  ok(s1.counter!==s0.counter && s1.props===s0.props-1,'the counter drops at once, no restart or tab switch ('+s0.counter+' → '+s1.counter+')');
  ok(s1.rows===s0.rows-n,'its '+n+' loans leave the loan table ('+s0.rows+' → '+s1.rows+')');
  ok(num(s1.total)<num(s0.total),'Total Debt Outstanding drops ('+s0.total+' → '+s1.total+')');
  ok(s1.header===String(s0.rows-n),'the "N loans" heading counts active loans only ('+s1.header+')');
  ok(s1.asst===s0.asst-n,'the assistant no longer sees its loans ('+s1.asst+')');
  ok(String(s1.cal)===String(s0.rows-n),'the calendar leaves them out ('+s1.cal+')');
  ok(s1.archivedStrip,'the Archived strip appears at once');
  // the Excel export offers active loans only
  const exp=await page.evaluate(()=>{ const r=window.LDS_asstAction({action:'open_export',args:{}}); return (document.getElementById('exportSummary')||{}).textContent||''; });
  ok(new RegExp(' of '+(s0.rows-n)+' loans').test(exp),'the Excel export lists active loans only ("'+exp+'")');
  await page.evaluate(()=>{ const b=document.getElementById('exportCancelBtn'); if(b) b.click(); }); await page.waitForTimeout(200);
  // un-archive from the strip
  await page.click('[data-unarchive]'); await page.waitForTimeout(800);
  const s2=await st();
  ok(s2.rows===s0.rows && s2.counter===s0.counter && !s2.archivedStrip,'un-archive from the strip redraws everything back ('+s2.rows+' rows, '+s2.counter+')');
  // ---- remove one loan (Loan Record → Remove) ----
  const lid=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans.length===1); return p.loans[0]._id; });
  await page.evaluate((id)=>{ const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },lid);
  await page.waitForTimeout(400);
  await page.click('#loanRecRemove'); await page.waitForTimeout(300);
  const dlg=await page.evaluate(()=>document.getElementById('confirmText').textContent);
  ok(/listed under/i.test(dlg)&&!/browser/i.test(dlg)&&!/permanently deleted/i.test(dlg),'the Remove dialog says it is listed for restore — no "deleted from your browser" ("'+dlg+'")');
  await page.click('#confirmOk'); await page.waitForTimeout(800);
  await page.evaluate(()=>{ const b=document.getElementById('scopePortfolioBtn'); if(b) b.click(); }); await page.waitForTimeout(600);
  const s3=await st();
  ok(s3.rows===s0.rows-1 && s3.inactiveStrip==='1','the removed loan leaves the table and is listed under "Removed & paid-off loans" ('+s3.rows+', strip '+s3.inactiveStrip+')');
  ok(await page.evaluate((id)=>!!window.LDS_loans().find(l=>l._id===id),lid),'the loan record still exists (archived, not deleted)');
  // ---- paid off counts like archived ----
  const pid=await page.evaluate(()=>{ const p=window.opProperties().filter(x=>x.loans.length===1)[1]; const l=p.loans[0]; l.loanStatus='Paid off'; return l._id; });
  await page.evaluate(()=>window.LDS_renderPortfolio&&window.LDS_renderPortfolio()); await page.evaluate(()=>{ const b=document.getElementById('scopePortfolioBtn'); if(b) b.click(); }); await page.waitForTimeout(500);
  const s4=await st();
  ok(s4.rows===s0.rows-2 && s4.inactiveStrip==='2','a "Paid off" loan is out of the totals too and listed separately ('+s4.rows+', strip '+s4.inactiveStrip+')');
  // ---- restore both ----
  await page.click('[data-restoreloan="'+lid+'"]'); await page.waitForTimeout(500);
  await page.click('[data-restoreloan="'+pid+'"]'); await page.waitForTimeout(1800);   // let the tiles' count-up animation settle
  const s5=await st();
  ok(s5.rows===s0.rows && s5.inactiveStrip==='0' && s5.total===s0.total,'Restore brings both back — same rows and total as before ('+s5.total+')');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all active-loans e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
