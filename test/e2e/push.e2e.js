/* e2e for v2.7.6 "what to push" — CLAUDE READS THE T12. The app sends Claude ONLY the underwriting
   assumptions (the user's editable per-property variables) and the property's own classified statement
   (income + expense lines, actual annual dollars) — no menu, no pre-computed actuals or NOI. Claude works out
   the actual figures itself and decides what raises the underwritten NOI most. Verifies: the analysis
   auto-runs and is Claude's; the payload is { property, address, units, underwritingAssumptions, benchmarksPerUnit, t12 }; the
   assumptions are the editable variables (a change flows straight through); full words only; no covenant talk;
   and a re-analysis at a higher assumption flips Claude to crediting the proven occupancy. Fake CLI.
   (2026-10-21) What to push runs on the APPROVED underwriting: not before it is approved; then the payload also carries
   the approved Safe and Aggressive (each change and its story) and every move has three effects.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/push.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','sample-t12.xlsx');
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');   // fake Claude CLI (no real model)
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
  // ---- (2026-10-21) not before the underwriting is approved ----
  await page.waitForFunction(()=>!!document.querySelector('#opScanMount [data-pushneedsapproval]'),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(2500);
  ok(await page.evaluate(()=>/Approve the underwriting first/i.test((document.querySelector('#opScanMount [data-pushneedsapproval]')||{}).textContent||'')),'before the underwriting is approved: "Approve the underwriting first"');
  ok(readInput()==null,'…and Claude is not asked yet');
  await page.waitForFunction(()=>!!document.querySelector('[data-uwapprove]')&&!document.querySelector('[data-uwapprove]').disabled,null,{timeout:20000}).catch(()=>{});
  await page.evaluate(()=>{ const b=document.querySelector('[data-uwapprove]'); if(b) b.click(); });
  await page.waitForFunction(()=>/FAKE-MOVE/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:25000}).catch(()=>{});
  await page.waitForTimeout(300);
  const panel=await panelText(page);

  // ---- The analysis is Claude's and auto-ran ----
  ok(/What to push on this property/i.test(await page.evaluate(()=>document.getElementById('uwView').innerText)),'the section is titled "What to push on this property"');
  ok(/Claude reads the T12 and the approved underwriting/i.test(panel),'the panel is framed as Claude reading the T12 and the approved underwriting');
  ok(/FAKE-MOVE/i.test(panel)&&/FAKE-RATIONALE/i.test(panel)&&/FAKE-SUMMARY/i.test(panel),'Claude’s moves rendered WITHOUT a manual click (auto-run)');
  const imp=await page.evaluate(()=>((document.querySelector('#opScanMount [data-pushimpacts]')||{}).innerText||'').replace(/\s+/g,' '));
  ok(/in.?place/i.test(imp)&&/safe/i.test(imp)&&/aggressive/i.test(imp)&&/40,000/.test(imp)&&/38,000/.test(imp),'each move shows Claude’s own three effects: in-place, Safe and Aggressive ("'+imp+'")');

  // ---- The app hands Claude ONLY the assumptions + the T12 — nothing else, no menu ----
  const sent=readInput();
  ok(sent&&/Villages of Whitewater/i.test(sent.property||''),'Claude was sent THIS property by name');
  ok(sent&&!('possibleMoves' in sent)&&!('actualsFromStatement' in sent),'no menu of moves and no pre-computed actuals are sent (Claude decides what to push)');
  ok(sent&&Object.keys(sent).sort().join(',')==='address,appNOI,benchmarksPerUnit,property,t12,underwriting,underwritingAssumptions,units','the payload is exactly { property, address, units, underwritingAssumptions, benchmarksPerUnit, t12, appNOI, underwriting } — nothing more (got: '+(sent&&Object.keys(sent).sort().join(','))+')');
  // 2.9.11 (the operator's decision) — the APP'S OWN in-place and underwritten NOI go with it, so Claude never works out a second one
  const gdn=await page.evaluate((k)=>{ const m=window.LDS_gdNOICache?window.LDS_gdNOICache():null; return (m&&m[k])||null; }, KEY).catch(()=>null);
  ok(sent&&sent.appNOI&&typeof sent.appNOI.inPlace==='number'&&typeof sent.appNOI.safe==='number'&&typeof sent.appNOI.aggressive==='number'&&typeof sent.appNOI.reserves==='number','Claude is given the app’s in-place NOI '+(sent&&sent.appNOI&&sent.appNOI.inPlace)+' and the approved Safe '+(sent&&sent.appNOI&&sent.appNOI.safe)+' / Aggressive '+(sent&&sent.appNOI&&sent.appNOI.aggressive)+' (after reserves)');
  ok(sent&&sent.underwriting&&sent.underwriting.safe&&Array.isArray(sent.underwriting.safe.changes)&&sent.underwriting.aggressive&&typeof sent.underwriting.safe.noi==='number','…and the approved underwriting itself — Safe and Aggressive, each with its changes and stories (so a push never repeats a story’s lever)');
  ok(!gdn||(Math.abs(gdn.inPlace-sent.appNOI.inPlace)<1&&Math.abs(gdn.underwritten-sent.appNOI.safe)<1),'…the same figures the app keeps ('+(gdn?gdn.inPlace+' / '+gdn.underwritten:'n/a')+')');
  ok(sent&&sent.t12&&Array.isArray(sent.t12.income)&&sent.t12.income.length>0&&Array.isArray(sent.t12.expense)&&sent.t12.expense.length>0,'Claude is sent the property’s own classified T12 (income + expense lines)');
  ok(sent&&sent.t12.income.every(r=>r.line&&typeof r.annual==='number')&&sent.t12.expense.some(r=>/repairs and maintenance/i.test(r.line)),'the T12 lines are full-word labels with actual annual dollars (e.g. "repairs and maintenance")');
  ok(sent&&sent.t12.income.some(r=>/gross potential rent/i.test(r.line))&&sent.t12.income.some(r=>/vacancy/i.test(r.line)),'the T12 carries gross potential rent AND the vacancy line, so Claude can derive the actual vacancy itself');

  // ---- The assumptions are the user's editable VARIABLES (from bench), not hardcoded ----
  ok(sent&&sent.underwritingAssumptions&&Math.abs(sent.underwritingAssumptions.vacancy-0.05)<1e-9&&typeof sent.underwritingAssumptions.managementFee==='number'&&typeof sent.underwritingAssumptions.reservePerUnit==='number'&&typeof sent.underwritingAssumptions.capRate==='number','Claude is sent the editable underwriting assumptions (vacancy, management fee, reserves, cap rate)');
  ok(/vacancy against a 5\.00% underwriting assumption/i.test(panel),'Claude reasoned from the statement vs the assumption (its own actual vacancy against the 5.00% assumption)');

  // ---- Full words; no covenant talk ----
  const abbr=/\bGPR\b|\bEGI\b|\bEGR\b|\bOpEx\b|\bR&M\b|\bG&A\b|\bbps\b|\bCapEx\b/;
  ok(!abbr.test(panel),'no forbidden abbreviations in the panel (full words only)'+(abbr.test(panel)?' — found: '+(panel.match(abbr)||[])[0]:''));
  // (the app's own line says where the pushes are used: "tick them in the refinance" — Claude's text never talks loans)
  const claudeText=panel.replace(/These are for you, not the lender: tick them in the refinance to see what they would get you\./,'');
  ok(!/DSCR|debt service coverage|maturit|refinanc/i.test(claudeText),'Claude’s text does NOT talk about loan covenants (operations only)');

  // ---- Raise the vacancy assumption to 8% (ABOVE the statement's 5.15%): the underwriting keeps the T12's proven figure
  //      (the assumption would lower the NOI — a warning, not used), and Claude never proposes "credit it". ----
  await page.evaluate(()=>{const i=[...document.querySelectorAll('#uwView [data-uwbench]')].find(x=>x.getAttribute('data-uwbench')==='vacancyPct');if(i){i.value='8';i.dispatchEvent(new Event('change',{bubbles:true}));}});
  await page.waitForTimeout(800);
  ok(await page.evaluate(()=>/your assumption is 8%/.test((document.querySelector('[data-pfassumewarnline="VAC"]')||{}).textContent||'')),'the underwriting warns that an 8% vacancy assumption would lower the NOI, and keeps the T12’s');
  await page.evaluate(()=>{const b=document.getElementById('opPushRun');if(b)b.click();});
  await page.waitForFunction(()=>/already credits the proven/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
  const panel2=await panelText(page), sent2=readInput();
  ok(sent2&&Math.abs(sent2.underwritingAssumptions.vacancy-0.08)<1e-9,'on re-analysis Claude is sent the new 8% assumption');
  ok(/already credits the proven 5\.15%/i.test(panel2),'Claude acknowledges the underwriting ALREADY credits the proven occupancy — there is no "credit it" move to make');
  ok(!/nearer the proven/i.test(panel2)&&!/improve/i.test((panel2.split('estimated NOI impact')[0]||'')),'no "credit the proven vacancy" move, and no "improve to a worse vacancy"');

  ok(await page.evaluate(()=>!!document.getElementById('opPushRun')),'a "Re-analyse" button is offered');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all push checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
