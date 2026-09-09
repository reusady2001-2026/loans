/* e2e for v2.7.5 "what to push" — CLAUDE READS THE T12. The app no longer builds a menu of moves; it hands
   Claude the property's own classified statement (income + expense lines, actual annual dollars), the
   underwriting assumptions, and the two figures that make them concrete (the vacancy and management fee the
   statement ACTUALLY runs at), then Claude decides and ranks what to push. Verifies: the analysis auto-runs
   and is Claude's; the app sends the T12 + assumptions + actuals (NOT a pre-built list); the actual vacancy
   sent matches the statement (so Claude can never be told to move a figure the wrong way); full words only;
   no covenant talk; and a re-analysis with a higher assumption flips the framing to crediting proven
   occupancy. Fake CLI (real Claude quality judged live).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/push.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const SP='/tmp/claude-0/-home-user-loans/0ea2848d-a7d5-57d0-bf6f-575e4bc508cf/scratchpad';
const FAKE=path.join(SP,'fake-claude-push.js');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-push-'));
const INPUT=path.join(UDATA,'push-input.json');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const panelText=(page)=>page.evaluate(()=>(document.getElementById('opScanMount')||{}).innerText||'');
const readInput=()=>{try{return JSON.parse(fs.readFileSync(INPUT,'utf8'));}catch(e){return null;}};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_INPUT_FILE:INPUT})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(500);
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForFunction(()=>/FAKE-MOVE/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
  await page.waitForTimeout(300);
  const panel=await panelText(page);

  // ---- The analysis is Claude's and auto-ran ----
  ok(/What to push on this property/i.test(await page.evaluate(()=>document.getElementById('uwView').innerText)),'the section is titled "What to push on this property"');
  ok(/Claude’s read of what to push/i.test(panel),'the panel is framed as Claude reading the statement');
  ok(/FAKE-MOVE/i.test(panel)&&/FAKE-RATIONALE/i.test(panel)&&/FAKE-SUMMARY/i.test(panel),'Claude’s moves rendered WITHOUT a manual click (auto-run)');
  ok(/estimated NOI impact/i.test(panel)&&/FAKE-IMPACT/i.test(panel),'each move shows Claude’s own estimated NOI impact (not an app-computed engine figure)');

  // ---- The app hands Claude the T12 + assumptions + actuals — NOT a menu of moves ----
  const sent=readInput();
  ok(sent&&/Villages of Whitewater/i.test(sent.property||''),'Claude was sent THIS property by name');
  ok(sent&&!('possibleMoves' in sent),'the app sends NO pre-built menu of moves (possibleMoves is gone)');
  ok(sent&&sent.t12&&Array.isArray(sent.t12.income)&&sent.t12.income.length>0&&Array.isArray(sent.t12.expense)&&sent.t12.expense.length>0,'Claude is sent the property’s own classified T12 (income + expense lines)');
  ok(sent&&sent.t12.income.every(r=>r.line&&typeof r.annual==='number')&&sent.t12.expense.some(r=>/repairs and maintenance/i.test(r.line)),'the T12 lines are full-word labels with actual annual dollars (e.g. "repairs and maintenance")');
  ok(sent&&sent.underwritingAssumptions&&Math.abs(sent.underwritingAssumptions.vacancy-0.05)<1e-9,'Claude is sent the underwriting vacancy assumption (5%)');
  ok(sent&&typeof sent.underwrittenNOI==='number'&&typeof sent.inPlaceNOI==='number','Claude is sent both the in-place and the underwritten NOI');

  // ---- The ACTUAL vacancy the statement runs at is sent (so Claude reasons from the truth, never "improves" to a worse number) ----
  ok(sent&&sent.actualsFromStatement&&typeof sent.actualsFromStatement.vacancy==='number','Claude is sent the vacancy the statement ACTUALLY runs at');
  ok(sent&&Math.abs(sent.actualsFromStatement.vacancy-0.0611)<0.002,'the actual vacancy sent matches the statement (~6.11%, got '+(sent&&(sent.actualsFromStatement.vacancy*100).toFixed(2))+'%)');
  ok(/6\.11% vacancy against a 5\.00% underwriting assumption/i.test(panel),'Claude reasoned from the real actual-vs-assumption (6.11% vs 5.00%)');

  // ---- Full words; no covenant talk ----
  const abbr=/\bGPR\b|\bEGI\b|\bEGR\b|\bOpEx\b|\bR&M\b|\bG&A\b|\bbps\b|\bCapEx\b/;
  ok(!abbr.test(panel),'no forbidden abbreviations in the panel (full words only)'+(abbr.test(panel)?' — found: '+(panel.match(abbr)||[])[0]:''));
  ok(!/DSCR|debt service coverage|maturit|refinanc/i.test(panel),'the panel does NOT talk about loan covenants (operations only)');

  // ---- Re-analyse with a HIGHER assumption (8%): now the actual (6.11%) is BELOW it → credit framing ----
  await page.evaluate(()=>{const i=[...document.querySelectorAll('#uwView [data-uwbench]')].find(x=>x.getAttribute('data-uwbench')==='vacancyPct');if(i){i.value='8';i.dispatchEvent(new Event('change',{bubbles:true}));}});
  await page.waitForTimeout(400);
  await page.evaluate(()=>{const b=document.getElementById('opPushRun');if(b)b.click();});
  await page.waitForFunction(()=>/underwrite vacancy nearer the proven/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
  const panel2=await panelText(page), sent2=readInput();
  ok(sent2&&Math.abs(sent2.underwritingAssumptions.vacancy-0.08)<1e-9,'on re-analysis Claude is sent the new 8% assumption');
  ok(/underwrite vacancy nearer the proven 6\.11%/i.test(panel2),'now that the property runs UNDER the assumption, the move is to CREDIT proven occupancy — never "improve to a worse vacancy"');
  ok(!/improve/i.test((panel2.split('estimated NOI impact')[0]||'')),'the credit case is not mislabelled as an occupancy "improvement"');

  ok(await page.evaluate(()=>!!document.getElementById('opPushRun')),'a "Re-analyse" button is offered');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all push checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
