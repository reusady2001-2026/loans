/* e2e for v2.7.3 "what to push" — CLAUDE is the analyst. The app hands Claude a menu of possible moves,
   each with its EXACT engine-computed effect on the underwritten NOI (and, for assumption-gated moves, the
   real occupancy swing needed from today's actual). Claude chooses which to push, picks the target size, and
   ranks them; the app renders Claude's list with engine-true dollars. Verifies: the analysis is Claude's and
   auto-runs on select (no app-made list, no manual click); Claude can pick the DEEPER vacancy target; the
   real-swing framing is shown; full words only; no covenant talk; the menu (not a ranked list) is sent with
   engine gains; and sent==shown end to end. Fake CLI (real Claude quality judged live).
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
const KEY='name:villages of whitewater';  // name-first key
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const panelText=(page)=>page.evaluate(()=>(document.getElementById('opScanMount')||{}).innerText||'');
const money=(x)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(x);
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
  // Claude's analysis must appear on its own — auto-run on select, no manual click.
  await page.waitForFunction(()=>/FAKE-REALISTIC/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:20000}).catch(()=>{});
  await page.waitForTimeout(300);
  const panel=await panelText(page);

  ok(/What to push on this property/i.test(await page.evaluate(()=>document.getElementById('uwView').innerText)),'the section is titled "What to push on this property"');
  ok(/Claude’s read of what to push/i.test(panel),'the panel is framed as Claude’s analysis');
  ok(/FAKE-REALISTIC/i.test(panel)&&/FAKE-RATIONALE/i.test(panel),'the ranked moves are Claude’s (its feasibility + rationale are shown) — and appeared WITHOUT a manual click (auto-run)');
  ok(/FAKE-SUMMARY/i.test(panel),'Claude’s headline summary is shown');
  ok(/per year of NOI/i.test(panel)&&/\+\$[\d,]+/.test(panel),'each move shows its engine dollar NOI gain');

  // Claude picked the DEEPER vacancy target (vac_2 → 3% vacancy), and the real occupancy swing is shown.
  ok(/Improve occupancy to 3\.00% vacancy/i.test(panel),'Claude chose the deeper occupancy target (to 3.00% vacancy), not just one point');
  ok(/percentage point occupancy improvement from today/i.test(panel),'the real occupancy swing needed from today is spelled out (the weighting the operator asked for)');
  ok(/HEAVY EFFORT/i.test(panel),'the two-point occupancy push is weighed as heavy effort');

  // Full words; no covenant talk.
  const abbr=/\bGPR\b|\bEGI\b|\bEGR\b|\bOpEx\b|\bR&M\b|\bG&A\b|\bbps\b|\bCapEx\b/;
  ok(!abbr.test(panel),'no forbidden abbreviations in the panel (full words only)'+(abbr.test(panel)?' — found: '+(panel.match(abbr)||[])[0]:''));
  ok(!/DSCR|debt service coverage|maturit|refinanc/i.test(panel),'the panel does NOT talk about loan covenants (operations only)');

  // The app sent Claude a MENU (not a pre-ranked list), each move engine-priced, with multiple vacancy targets.
  const sent=(()=>{try{return JSON.parse(fs.readFileSync(INPUT,'utf8'));}catch(e){return null;}})();
  ok(sent&&/Villages of Whitewater/i.test(sent.property||''),'Claude was sent THIS property by name');
  ok(sent&&Array.isArray(sent.possibleMoves)&&sent.possibleMoves.length>=6,'Claude was sent a MENU of possible moves (not a ready-made ranked list)');
  ok(sent&&sent.possibleMoves.every(m=>m.id&&typeof m.annualNoiGain==='number'&&m.context),'every menu move carries an id, an engine-computed annualNoiGain, and grounded context');
  ok(sent&&sent.possibleMoves.some(m=>m.id==='vac_1')&&sent.possibleMoves.some(m=>m.id==='vac_2'),'the menu offers MULTIPLE vacancy targets so Claude picks how far to push');
  const vac2=sent&&sent.possibleMoves.find(m=>m.id==='vac_2'), vac1=sent&&sent.possibleMoves.find(m=>m.id==='vac_1');
  ok(vac2&&vac1&&vac2.annualNoiGain>vac1.annualNoiGain*1.5,'the deeper vacancy target is worth materially more (roughly double the one-point gain)');
  ok(vac2&&panel.indexOf(money(vac2.annualNoiGain))>=0,'the vacancy gain shown is exactly the engine number sent for the target Claude chose ('+(vac2&&money(vac2.annualNoiGain))+')');
  ok(sent&&sent.assumptions&&Math.abs(sent.assumptions.vacancyPercent-0.05)<1e-9,'Claude was sent the vacancy assumption (5%)');

  ok(await page.evaluate(()=>!!document.getElementById('opPushRun')),'a "Re-analyse" button is offered');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all push checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
