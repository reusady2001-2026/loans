/* e2e for 2.9.15 T1: a T12 whose section sums are printed WITHOUT "Total" (account-coded, each section's sum under
   its lines, a plain "Operating Expenses" row, Net Income below the NOI). Uploaded in Underwriting, the app reads
   only the detail lines, uses the statement's Net Operating Income, and the NOI ties to the statement.
   The statement is synthetic (test/fixtures/t12-subtotal-grid.js).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-subtotals-2915.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const G=require(path.join(APP,'test','fixtures','t12-subtotal-grid.js'));
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-t12sub-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const money=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function makeFile(withCodes){
  const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
  const st=G.statement(withCodes);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(st.grid),'Income Statement');
  const p=path.join(UDATA,(withCodes?'coded':'plain')+'-t12.xlsx'); fs.writeFileSync(p,XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
  return { file:p, st };
}

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent',LDS_RATES_OFFLINE:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(600);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);

  for(const withCodes of [true,false]){
    const {file,st}=makeFile(withCodes), tag=withCodes?'account-coded':'no account numbers';
    await page.setInputFiles('#uwFile',file);
    await page.waitForFunction((f)=>{const t=(document.getElementById('uwView')||{}).innerText||''; return /statement NOI/.test(t)&&t.includes(f);},path.basename(file),{timeout:20000}).catch(()=>{});
    await page.waitForTimeout(1500);
    const r=await page.evaluate((k)=>{const t=document.getElementById('uwView').innerText;
      const used=(t.match(/(\d+) lines read · NOI used (\$[\d,.]+)/)||[]);
      return { lines:+used[1]||0, used:used[2]||'', tie:(document.getElementById('uwNoiTie')||{}).innerText||'',
               loanNOI:window.LDS_loanNOI(window.LDS_loans().find(x=>window.propertyKey(x)===k)) };},KEY);
    ok(r.lines===st.nIncome+st.nExpense,tag+': '+(st.nIncome+st.nExpense)+' detail lines read — the section sums are not lines (got '+r.lines+')');
    ok(r.used===money(st.noi),tag+': NOI used is the statement\'s Net Operating Income '+money(st.noi)+', never Net Income (got '+r.used+')');
    ok(/ties to statement NOI/.test(r.tie)&&!/doesn.t tie/i.test(r.tie),tag+': the NOI ties to the statement ('+r.tie.trim()+')');
    ok(Math.abs((r.loanNOI||0)-st.noi)<1,tag+': the property\'s NOI is '+money(st.noi)+' (got '+money(r.loanNOI||0)+')');
  }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all t12-subtotals-2915 e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
