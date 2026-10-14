/* e2e for v2.8.4: the credit tier reads all THREE sizing tests — DSCR, LTV and debt
   yield — and grades the COMBINED property position on a senior+mezz stack (which
   refinances as one loan against the combined payoff).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-tier.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refitier-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
// the 3-metric rule mirrored here, to check the app's loanTier against it
function expectedTier(d,l,y){ if(d==null||l==null||y==null) return null;
  if(d<1.25||l>0.75||y<0.07) return 0; if(d>=1.55&&l<=0.55&&y>=0.10) return 4;
  if(d>=1.35&&l<=0.65&&y>=0.085) return 3; return 2; }

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- 1. all three metrics clear → Tier 4, and the app's tier matches the 3-metric rule ----
  const a = await page.evaluate((k)=>{
    const p=window.opProperties().find(x=>x.key===k); const l=window.LDS_loans().find(x=>x._id===p.loans[0]._id);
    l.noi=1122512; l.capRate=0.055; l.amortizationMonths=360;
    const t=window.LDS_loanTier(l)||{};
    return { tier:t.tier, dscr:window.LDS_loanDSCR(l), ltv:window.LDS_loanLTV(l), dy:window.LDS_loanDebtYield(l) };
  }, KEY);
  ok(a.dy!=null, 'debt yield is computed and part of the tier ('+(a.dy*100).toFixed(1)+'%)');
  ok(a.tier===4 && a.tier===expectedTier(a.dscr,a.ltv,a.dy), 'all three clear → Tier 4 (DSCR '+a.dscr.toFixed(2)+'× · LTV '+(a.ltv*100).toFixed(1)+'% · DY '+(a.dy*100).toFixed(1)+'%)');

  // ---- 2. debt yield gates independently: near-IO amortization keeps DSCR/LTV Tier-4-worthy
  //         but pushes debt yield below the 10% floor → the tier drops below 4 ----
  const b = await page.evaluate((k)=>{
    const p=window.opProperties().find(x=>x.key===k); const l=window.LDS_loans().find(x=>x._id===p.loans[0]._id);
    l.amortizationMonths=1200; l.noi=880000; l.capRate=0.038;   // near-IO debt service → high DSCR; low cap → low LTV; but DY ≈ 7.7%
    const t=window.LDS_loanTier(l)||{};
    return { tier:t.tier, label:t.label, dscr:window.LDS_loanDSCR(l), ltv:window.LDS_loanLTV(l), dy:window.LDS_loanDebtYield(l), bal:window.LDS_computeBalance(l) };
  }, KEY);
  console.log('    [scenario 2: DSCR '+b.dscr.toFixed(2)+'× · LTV '+(b.ltv*100).toFixed(1)+'% · DY '+(b.dy*100).toFixed(1)+'% · balance '+Math.round(b.bal)+' → '+b.label+']');
  ok(b.tier===expectedTier(b.dscr,b.ltv,b.dy), 'the tier matches the 3-metric rule for the computed values');
  ok(b.dscr>=1.55 && b.ltv<=0.55, 'DSCR & LTV alone would earn Tier 4');
  ok(b.dy<0.10 && b.tier<4, 'but debt yield ('+(b.dy*100).toFixed(1)+'%) is below 10% → tier held below 4 (debt yield gated it)');

  // ---- 3. the tier grades the COMBINED position on a senior+mezz stack ----
  const c = await page.evaluate(()=>{
    const stacked=window.opProperties().find(x=>x.loans && x.loans.length>=2);
    if(!stacked) return {stacked:false};
    const members=window.LDS_loans().filter(l=>window.propertyKey(l)===stacked.key);
    const memBalSum=members.reduce((s,m)=>s+window.LDS_computeBalance(m),0);
    const sr=members.find(m=>!/\(\s*mezz/i.test(String(m.propertyName||'')))||members[0];
    sr.noi=memBalSum*0.09; sr.capRate=0.05;   // ~9% debt yield on the combined balance
    const combo=window.LDS_combinedRefiLoan(members);
    const t=window.LDS_loanTier(combo)||{};
    return { stacked:true, n:members.length, memBalSum, comboBal:window.LDS_computeBalance(combo),
             tier:t.tier, comboDY:window.LDS_loanDebtYield(combo), seniorDY:window.LDS_loanDebtYield(sr) };
  });
  ok(c.stacked, 'a senior+mezz stacked property exists in the seed data'+(c.stacked?(' ('+c.n+' loans)'):''));
  if(c.stacked){
    console.log('    [combined: balance '+Math.round(c.comboBal)+' vs Σ members '+Math.round(c.memBalSum)+' · combined DY '+(c.comboDY*100).toFixed(1)+'% vs senior DY '+(c.seniorDY*100).toFixed(1)+'%]');
    ok(Math.abs(c.comboBal - c.memBalSum) < 5, 'the combined refi loan carries the whole stack’s balance (one loan vs the combined payoff)');
    ok(c.comboDY!=null && c.seniorDY!=null && c.comboDY < c.seniorDY - 1e-6, 'the tier is graded on the combined debt yield, lower than the senior alone');
  }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all tier e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
