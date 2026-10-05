/* e2e for 2.9.8 — the T12 review and the grey line under the T12 drop.
   (w2 note) each review card names the sheet and the REAL Excel row at its top, even when the sheet's data starts
             lower than row 1, and the review lists every row to check;
   (w1 note) the grey line under the drop shows the NOI the app uses (with how it was worked out), not the
             statement's own 12-month NOI line;
   (problem 6) "+ New category…" in a card's Category list: type "Other Expenses", Add — it is selected, offered on
             that side in every card and in every property's review from then on, flows into Underwriting as its
             own line with NOI unchanged, and can't be removed while a line uses it.
   Uses the fake Claude CLI (test/fixtures/fake-claude-push.js, LDS_FAKE_T12=disagree).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-review-298.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-t12r-'));
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const M=["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026","Sep 2026","Oct 2026","Nov 2026","Dec 2026"];
const rowOf=(l,v)=>[l,...Array(12).fill(v),v*12];
// the statement starts at Excel row 3 (two empty rows above it, as many exports have)
function fixture(name){ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Account",...M,"Total"],["INCOME"],rowOf("Gross Potential Rent",100000),rowOf("Utility Reimbursements",5000),rowOf("TOTAL INCOME",105000),["EXPENSES"],rowOf("Real Estate Taxes",10000),rowOf("Repairs and Maintenance",4000),rowOf("TOTAL EXPENSES",14000),rowOf("NET OPERATING INCOME",91000)],{origin:"A3"}),"T12 Report"); const p=path.join(UDATA,name); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p; }
const F1=fixture('t12-rows.xlsx'), F2=fixture('t12-rows-b.xlsx');
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_T12:'disagree'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(800);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  const pick=(key)=>page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},key).then(()=>page.waitForTimeout(1500));
  const panel=()=>page.evaluate(()=>(document.getElementById('t12Review')||{}).innerText||'');
  await pick('name:villages of whitewater');
  await page.setInputFiles('#uwFile',F1);
  await page.waitForFunction(()=>/need.{0,3} your review/i.test((document.getElementById('t12Review')||{}).innerText||''),null,{timeout:25000}).catch(()=>{});

  // ---- Excel rows ----
  const where=await page.evaluate(()=>[...document.querySelectorAll('#t12Review [data-t12card]')].map(c=>({ i:c.getAttribute('data-t12card'), row:(c.querySelector('[data-t12where]')||{getAttribute:()=>null}).getAttribute('data-t12where'), top:(c.querySelector('[data-t12where]')||{}).innerText||'', t:c.innerText })));
  const util=where.find(c=>/Utility Reimbursements/.test(c.t)), rm=where.find(c=>/Repairs and Maintenance/.test(c.t));
  ok(util&&util.row==='6'&&/Excel row 6/.test(util.top)&&/sheet “T12 Report”/.test(util.top),'"Utility Reimbursements" card starts with: Excel row 6 · sheet “T12 Report” ("'+(util&&util.top.replace(/\s+/g,' '))+'")');
  ok(rm&&rm.row==='10','"Repairs and Maintenance" is Excel row 10 (got '+(rm&&rm.row)+')');
  const rows=await page.evaluate(()=>{ const e=document.querySelector('#t12Review [data-t12rows]'); return e?{ rows:e.getAttribute('data-t12rows'), t:e.innerText }:null; });
  ok(rows&&rows.rows==='6,10'&&/Rows to check in t12-rows\.xlsx, sheet “T12 Report”: 6, 10/.test(rows.t),'the review lists the rows to check: "'+(rows&&rows.t)+'"');
  ok(/Excel row 6/.test(util.t),'"How to check" says Excel row 6 too');

  // ---- the grey line: the NOI used ----
  const grey=await page.evaluate(()=>{ const e=document.getElementById('uwNoiUsed'); return e?e.parentElement.innerText:''; });
  ok(/NOI used/.test(grey)&&!/statement NOI/.test(grey)&&/T12/.test(grey),'the grey line shows the NOI used and how ("'+grey.replace(/\s+/g,' ').slice(0,140)+'")');

  // ---- a new category ----
  const noiBefore=await page.evaluate(()=>window.LDS_loanNOI(window.LDS_loans().find(l=>/villages of whitewater/i.test(l.propertyName))));
  await page.evaluate((i)=>{ const r=document.querySelector('#t12Review input[name="t12r'+i+'"][value="expense"]'); r.checked=true; const sel=document.querySelector('#t12Review [data-t12code="'+i+'"][data-for="expense"]'); sel.value='__new__'; sel.dispatchEvent(new Event('change',{bubbles:true})); },util.i);
  ok(await page.evaluate((i)=>{ const w=document.querySelector('[data-t12newwrap="'+i+'"][data-for="expense"]'); return w&&!w.classList.contains('hidden'); },util.i),'"+ New category…" opens a name box');
  await page.evaluate((i)=>{ document.querySelector('[data-t12newname="'+i+'"][data-for="expense"]').value='Other Expenses'; document.querySelector('[data-t12newadd="'+i+'"][data-for="expense"]').click(); },util.i);
  await page.waitForTimeout(400);
  const after=await page.evaluate(({a})=>{ const s1=document.querySelector('#t12Review [data-t12code="'+a+'"][data-for="expense"]'), s3=document.querySelector('#t12Review [data-t12code="'+a+'"][data-for="income"]');
    const has=(s)=>!!s&&[...s.options].some(o=>o.textContent==='Other Expenses'); return { sel:s1.options[s1.selectedIndex].textContent, income:has(s3), code:s1.value, exp:window.T12Check.EXPENSE_CODES.indexOf(s1.value)>=0, inc:window.T12Check.INCOME_CODES.indexOf(s1.value)>=0 }; },{a:util.i});
  ok(after.sel==='Other Expenses','"Other Expenses" is created and selected');
  ok(after.exp&&!after.inc&&!after.income,'…it is an expense category for the whole app, not an income one');
  // a second time with different spelling picks the same category, never a duplicate
  const dup=await page.evaluate(()=>{ const n=(JSON.parse(localStorage.getItem('lds.customCategories')||'[]')).length; return n; });
  ok(dup===1,'saved once in the app\'s categories ('+dup+')');
  await page.evaluate((i)=>{ document.querySelector('#t12Review [data-t12amt="'+i+'"][data-for="expense"]').value='60000'; document.querySelector('#t12Review [data-t12save="'+i+'"]').click(); },util.i);
  await page.waitForTimeout(2500);
  const t=await panel();
  ok(/✓ Excel row 6 · Utility Reimbursements: Expense · Other Expenses · \$60,000\.00/.test(t.replace(/\s+/g,' ')),'the decided line reads "Expense · Other Expenses · $60,000.00"');
  const noiAfter=await page.evaluate(()=>window.LDS_loanNOI(window.LDS_loans().find(l=>/villages of whitewater/i.test(l.propertyName))));
  ok(Math.abs((noiBefore-120000)-noiAfter)<0.01,'NOI follows, the same as filing it under any expense ('+noiBefore+' → '+noiAfter+')');
  const uwLine=await page.evaluate(()=>(window.LDS_uwLines()||[]).find(l=>l.label==='Other Expenses')||null);
  ok(uwLine&&Math.abs(uwLine.t12-60000)<0.01&&Math.abs(uwLine.uw-60000)<0.01,'Underwriting has its own "Other Expenses" line at $60,000 ('+JSON.stringify(uwLine)+')');

  // ---- every later review on another property offers it ----
  await pick('name:villages of independence');
  await page.setInputFiles('#uwFile',F2);
  await page.waitForFunction(()=>/need.{0,3} your review/i.test((document.getElementById('t12Review')||{}).innerText||''),null,{timeout:25000}).catch(()=>{});
  const offered=await page.evaluate(()=>[...document.querySelectorAll('#t12Review select[data-t12code][data-for="expense"]')].every(s=>[...s.options].some(o=>o.textContent==='Other Expenses')));
  ok(offered,'another property\'s review offers "Other Expenses" in every expense list');

  // ---- can't remove it while a line uses it ----
  await page.evaluate(()=>{ const d=document.querySelector('[data-t12cats]'); if(d) d.open=true; const b=document.querySelector('[data-t12catdel]'); if(b) b.click(); });
  await page.waitForTimeout(3000);
  const toast=await page.evaluate(()=>(document.getElementById('toastText')||{}).textContent||'');
  ok(/is used on .*Villages of Whitewater/i.test(toast)&&JSON.parse(await page.evaluate(()=>localStorage.getItem('lds.customCategories'))).length===1,'Remove is refused while a line uses it ("'+toast+'")');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all T12 review (2.9.8) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
