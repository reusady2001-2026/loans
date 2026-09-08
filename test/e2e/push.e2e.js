/* e2e for v2.7.2 "what to push" — underwriting-aware. The app's own engine computes each operating
   move's EXACT effect on the UNDERWRITTEN NOI (raise rents, beat the vacancy/management-fee assumption,
   cut a controllable cost) and ranks them biggest-gain-first — no Claude needed to see the dollars.
   Claude only ANNOTATES each lever (effort / investment / feasibility). Verifies: levers + engine gains
   render on their own; full words only (NOI is the only abbreviation); the assumption-gating narrative is
   shown; no loan-covenant talk; the engine gains sent to Claude equal what is displayed; and clicking
   "Add Claude's read" merges the annotations. Fake CLI (real Claude quality judged live).
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
const KEY='name:villages of whitewater';  // name-first key (v2.7.2)
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const panelText=(page)=>page.evaluate(()=>(document.getElementById('opScanMount')||{}).innerText||'');
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
  // Pick the property, then drop its T12 (fresh folder → the app saves it, then reads + builds live).
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);
  await page.waitForTimeout(500);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  // Levers must render from the ENGINE alone — no Claude click.
  await page.waitForFunction(()=>/per year of NOI/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(300);
  const panel0=await panelText(page);

  ok(/What to push on this property/i.test(await page.evaluate(()=>document.getElementById('uwView').innerText)),'the section is titled "What to push on this property"');
  ok(/per year of NOI/i.test(panel0),'levers render from the engine with a per-year NOI gain — before any Claude call');
  ok(/Raise rents 3%/i.test(panel0),'the rent lever "Raise rents 3%" is shown');
  ok(/\+\$[\d,]+/.test(panel0),'each move shows a dollar NOI gain (e.g. +$…)');

  // The underwriting-assumption reframing Azriel asked for: a move only counts if it beats the assumption.
  ok(/underwriting already assumes/i.test(panel0),'the vacancy lever explains the underwriting ALREADY assumes a vacancy rate');
  ok(/only beating|does not raise the underwritten NOI/i.test(panel0),'it explains that only BEATING the assumption raises the underwritten NOI (closing the gap does not)');
  ok(/the number the loan is sized on|underwritten NOI/i.test(panel0),'the panel frames the ranking around the underwritten NOI');

  // Full words only — NOI is the only abbreviation allowed.
  const abbr=/\bGPR\b|\bEGI\b|\bEGR\b|\bOpEx\b|\bR&M\b|\bG&A\b|\bbps\b|\bCapEx\b/;
  ok(!abbr.test(panel0),'no forbidden abbreviations in the panel (GPR/EGI/OpEx/R&M/G&A/bps) — full words only'+(abbr.test(panel0)?' — found: '+(panel0.match(abbr)||[])[0]:''));
  ok(/repairs and maintenance|general and administrative|management fee|gross potential rent/i.test(panel0),'line names are spelled out in full words');

  // Not a covenant scan.
  ok(!/DSCR|debt service coverage|maturit|refinanc/i.test(panel0),'the panel does NOT talk about DSCR / maturities / refinancing (operations, not covenants)');

  // Engine truth: the underwritten NOI shown, and the gains sent to Claude, are the engine's own numbers.
  ok(/\$9,770,923/.test(panel0),'the underwritten NOI shown ties to the engine value ($9,770,923.03 at 5% vacancy)');

  // Now add Claude's read and prove the annotations merge in.
  ok(await page.evaluate(()=>!!document.getElementById('opPushRun')),'there is an "Add Claude’s read" button');
  await page.evaluate(()=>document.getElementById('opPushRun').click());
  await page.waitForFunction(()=>/FAKE-REALISTIC/i.test((document.getElementById('opScanMount')||{}).innerText||''),null,{timeout:15000}).catch(()=>{});
  const panel1=await panelText(page);
  ok(/Realistic\?/i.test(panel1)&&/FAKE-REALISTIC/i.test(panel1),'Claude’s feasibility note is merged onto the levers');
  ok(/FAKE-INVESTMENT/i.test(panel1),'Claude’s investment note is merged onto the levers');

  // Prove the ENGINE-computed input (not invented) is what was sent — and matches what is shown.
  const sent=(()=>{try{return JSON.parse(fs.readFileSync(INPUT,'utf8'));}catch(e){return null;}})();
  ok(sent&&/Villages of Whitewater/i.test(sent.property||''),'Claude was sent THIS property by name');
  ok(sent&&Math.abs((sent.underwrittenNOI||0)-9770923.03)<0.5,'Claude was sent the engine underwritten NOI 9,770,923.03 (got '+(sent&&sent.underwrittenNOI)+')');
  ok(sent&&sent.assumptions&&Math.abs(sent.assumptions.vacancyPercent-0.05)<1e-9,'Claude was sent the vacancy assumption (5%)');
  ok(sent&&Array.isArray(sent.levers)&&sent.levers.length>0&&sent.levers.every(l=>l.id&&typeof l.annualNoiGain==='number'),'every lever sent has an id and an engine-computed annualNoiGain');
  const rent=sent&&sent.levers.find(l=>l.id==='rent');
  ok(rent&&rent.annualNoiGain>0,'the rent lever carries a positive engine NOI gain');
  // What was SENT equals what is SHOWN (engine truth end-to-end): the rent gain string appears in the panel.
  const money=(x)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(x);
  ok(rent&&panel0.indexOf(money(rent.annualNoiGain))>=0,'the rent gain shown in the panel is exactly the number sent to Claude ('+(rent&&money(rent.annualNoiGain))+')');
  ok(sent&&sent.levers.some(l=>l.id&&l.id.indexOf('exp_')===0),'a controllable-cost lever (a specific expense line) is among the moves');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all push checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
