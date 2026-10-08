/* e2e for 2.9.7 (#108): the T12 double reading. A new T12 shows the regular reader's figures at once, the AI
   reads it in the background, and every line where the two disagree becomes a review card (where the line
   belongs / an amount). Until the user decides, the regular figures are used; each Save re-books the line and
   every figure follows (Underwriting, Home, the assistant); once all are decided: "✓ This T12 is checked".
   Decisions survive a restart. Readings that agree: "✓ checked by AI". Without Claude: "Not AI-checked yet".
   Uses the fake Claude CLI (test/fixtures/fake-claude-push.js, LDS_FAKE_T12=agree|disagree).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-double-read.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-t12dr-'));
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const M=["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026","Sep 2026","Oct 2026","Nov 2026","Dec 2026"];
const rowOf=(l,v)=>[l,...Array(12).fill(v),v*12];
function fixture(name){ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Account",...M,"Total"],["INCOME"],rowOf("Gross Potential Rent",100000),rowOf("Utility Reimbursements",5000),rowOf("TOTAL INCOME",105000),["EXPENSES"],rowOf("Real Estate Taxes",10000),rowOf("Repairs and Maintenance",4000),rowOf("TOTAL EXPENSES",14000),rowOf("NET OPERATING INCOME",91000)]),"Report1"); const p=path.join(UDATA,name); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p; }
const F1=fixture('t12-double.xlsx'), F2=fixture('t12-agree.xlsx'), F3=fixture('t12-noclaude.xlsx');
async function launch(env){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(800);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  return {app,page,errors};
}
const pick=(page,key)=>page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},key).then(()=>page.waitForTimeout(1200));
const panel=(page)=>page.evaluate(()=>(document.getElementById('t12Review')||{}).innerText||'');
const noi=(page,re)=>page.evaluate((re)=>window.LDS_loanNOI(window.LDS_loans().find(l=>new RegExp(re,'i').test(l.propertyName))),re);
(async()=>{
  let {app,page,errors}=await launch({LDS_CLAUDE_BIN:FAKE,LDS_FAKE_T12:'disagree'});
  await pick(page,'name:villages of whitewater');
  await page.setInputFiles('#uwFile',F1);
  await page.waitForFunction(()=>/need.{0,3} your review/i.test((document.getElementById('t12Review')||{}).innerText||''),null,{timeout:25000}).catch(()=>{});
  let t=await panel(page);
  ok(/2 lines on this T12 need your review/i.test(t)&&/regular reader’s version/i.test(t),'two disagreements → "⚠ 2 lines on this T12 need your review — until you decide, the app uses the regular reader\'s version"');
  ok(/The problem/i.test(t)&&/Why it matters/i.test(t)&&/How to check/i.test(t),'each card is a table: The problem / Why it matters / How to check');
  ok(/Utility Reimbursements/.test(t)&&/120,000/.test(t),'card 1 (where the line belongs): Utility Reimbursements, NOI $120,000 lower if the AI is right');
  ok(/Repairs and Maintenance/.test(t)&&/May 2026/.test(t)&&/\$600/.test(t),'card 2 (an amount): Repairs and Maintenance, May 2026, $600');
  ok(/row 4/i.test(t)&&/t12-double\.xlsx/.test(t),'how to check names the file and the row');
  let n0=await noi(page,'villages of whitewater');
  ok(Math.abs(n0-1092000)<0.01,'until decided, the regular reader\'s NOI is used (1,092,000; got '+n0+')');
  // decide card 1: it is an expense — Utilities, 60,000
  const idx=await page.evaluate(()=>{ const cards=[...document.querySelectorAll('#t12Review [data-t12card]')]; return cards.map(c=>({i:c.getAttribute('data-t12card'),t:c.innerText})); });
  const c1=idx.find(c=>/Utility Reimbursements/.test(c.t)).i, c2=idx.find(c=>/Repairs and Maintenance/.test(c.t)).i;
  await page.evaluate((i)=>{ const r=document.querySelector('#t12Review input[name="t12r'+i+'"][value="expense"]'); r.checked=true; const sel=document.querySelector('#t12Review [data-t12code="'+i+'"][data-for="expense"]'); sel.value='UTIL'; const amt=document.querySelector('#t12Review [data-t12amt="'+i+'"][data-for="expense"]'); amt.value='60000'; },c1);
  await page.evaluate((i)=>{ document.querySelector('#t12Review [data-t12note="'+i+'"]').value='checked against the GL'; document.querySelector('#t12Review [data-t12save="'+i+'"]').click(); },c1);
  await page.waitForTimeout(2500);
  t=await panel(page);
  ok(/1 line on this T12 needs your review/i.test(t),'after one Save, one line is left');
  ok(/✓ (Excel row \d+ · )?Utility Reimbursements: Expense · Utilities · \$60,000\.00 · chosen by You/.test(t)&&/Change/.test(t),'the decided line reads "✓ Utility Reimbursements: Expense · Utilities · $60,000.00 · chosen by You · … [Change]"');
  const n1=await noi(page,'villages of whitewater');
  ok(Math.abs(n1-(1092000-120000))<0.01,'the decision flows into the NOI at once (972,000; got '+n1+')');
  // decide card 2: the AI's amount
  const idx2=await page.evaluate(()=>[...document.querySelectorAll('#t12Review [data-t12card]')].map(c=>({i:c.getAttribute('data-t12card'),t:c.innerText})));
  const c2b=idx2.find(c=>/Repairs and Maintenance/.test(c.t)&&/Save/.test(c.t)).i;
  await page.evaluate((i)=>{ document.querySelector('#t12Review input[name="t12a'+i+'"][value="ai"]').checked=true; document.querySelector('#t12Review [data-t12save="'+i+'"]').click(); },c2b);
  await page.waitForTimeout(2500);
  t=await panel(page);
  ok(/This T12 is checked/i.test(t),'every card decided → "✓ This T12 is checked"');
  const n2=await noi(page,'villages of whitewater');
  ok(Math.abs(n2-971400)<0.01,'NOI follows both decisions: 1,092,000 − 120,000 − 600 = 971,400 (got '+n2+')');
  const asst=await page.evaluate(()=>(window.LDS_aiAsstSnapshot().find(x=>/villages of whitewater/i.test(x.property||x.name||''))||{}).noi);
  ok(Math.abs((asst||0)-971400)<0.01,'the assistant sees the same 971,400');
  // agree mode on another property
  ok(errors.length===0,'run 1: no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  ({app,page,errors}=await launch({LDS_CLAUDE_BIN:FAKE,LDS_FAKE_T12:'agree'}));
  const n3=await noi(page,'villages of whitewater');
  ok(Math.abs(n3-971400)<0.01,'after a restart the decisions still hold (971,400; got '+n3+')');
  await pick(page,'name:villages of whitewater');
  t=await panel(page);
  ok(/This T12 is checked/i.test(t)&&(t.match(/Change/g)||[]).length===2,'…and the panel shows both decisions with Change');
  await pick(page,'name:villages of independence');
  await page.setInputFiles('#uwFile',F2);
  await page.waitForFunction(()=>/checked by AI/i.test((document.getElementById('t12Review')||{}).innerText||''),null,{timeout:25000}).catch(()=>{});
  t=await panel(page);
  ok(/✓ checked by AI/.test(t),'readings that agree → "✓ checked by AI" ('+t.slice(0,80)+')');
  ok(errors.length===0,'run 2: no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  // without Claude
  ({app,page,errors}=await launch({LDS_CLAUDE_BIN:'/nonexistent'}));
  await pick(page,'name:villages of burlington');
  await page.setInputFiles('#uwFile',F3);
  await page.waitForFunction(()=>/Not AI-checked yet/i.test((document.getElementById('t12Review')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
  t=await panel(page);
  ok(/Not AI-checked yet/i.test(t),'without Claude the T12 is marked "Not AI-checked yet"');
  ok(errors.length===0,'run 3: no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all t12-double-read e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
