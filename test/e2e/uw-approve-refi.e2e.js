/* e2e (2026-10-21) — the four phases end to end: the loan exists → Underwriting (the APPROVED pro forma, Safe and
   Aggressive) → What to push (runs on the approved underwriting; three effects per push) → the refinance (In-place T12 /
   Safe / Aggressive per property, pushes ticked per property, the amount to cover; no T12 → no refinance).
   A made-up T12 (test/fixtures/proforma-t12.js) on Villages of Whitewater (120 units) and Villages of Whitewater II
   (100 units); Claude is the scripted stand-in (test/fixtures/fake-claude-push.js with guide/fixtures/push.json).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r ./test/e2e/_t12auto.js test/e2e/uw-approve-refi.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-uwrefi-'));
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const K1='name:villages of whitewater', K2='name:villages of whitewater ii', P1='Villages of Whitewater', P2='Villages of Whitewater II';
const VAC='Raise rents about 3% at renewal next year';   // the sample's top push (guide/fixtures/push.json)
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const num=s=>Number(String(s||'').replace(/[^0-9.\-]/g,''))||0;
const near=(a,b,t)=>a!=null&&b!=null&&Math.abs(a-b)<=(t==null?1:t);
const money=n=>n==null?'null':'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:path.join(APP,'test','fixtures','fake-claude-push.js'),CLAUDE_CONFIG_DIR:path.join(UDATA,'claude'),
      LDS_FAKE_PUSH_FILE:path.join(APP,'guide','fixtures','push.json'),LDS_FAKE_STORIES_FILE:path.join(APP,'guide','fixtures','stories.json')})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(1500);
  const win=await app.browserWindow(page); await win.evaluate(w=>w.setSize(1500,1000)); await page.waitForTimeout(400);
  const GRID=require(path.join(APP,'test','fixtures','proforma-t12.js')).grid();
  const b64=await page.evaluate((g)=>{ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(g),'T12'); return XLSX.write(wb,{type:'base64',bookType:'xlsx'}); },GRID);
  const T12=path.join(UDATA,'Sample Gardens T12.xlsx'); fs.writeFileSync(T12,Buffer.from(b64,'base64'));

  // ---- helpers ----
  const gd=(k)=>page.evaluate((k)=>{ const g=(window.LDS_gdNOICache()||{})[k]; return g?{ inPlace:g.inPlace, uw:g.underwritten, ag:g.underwrittenAggressive, model:g.uwModel, ap:g.uwApproved }:null; },k);
  const chip=()=>page.evaluate(()=>{ const c=document.querySelector('[data-uwstatus]'); return c?c.getAttribute('data-uwstatus'):null; });
  const toUw=async()=>{ await page.evaluate(()=>{ const t=document.querySelector('[data-tabsel="underwriting"]'); if(t) t.click(); else { const b=document.getElementById('tabNewBtn'); if(b) b.click(); const o=document.querySelector('[data-tabopen="underwriting"]'); if(o) o.click(); } });
    await page.waitForFunction(()=>{ const v=document.getElementById('uwView'); return v&&!v.hidden&&document.getElementById('opPropPick'); },null,{timeout:10000}).catch(()=>{}); await page.waitForTimeout(500); };
  const pick=async(k)=>{ await page.evaluate((k)=>{ const s=document.getElementById('opPropPick'); if(s.value!==k){ s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); } },k); await page.waitForTimeout(1200); };
  const setUnits=async(n)=>{ await page.fill('input[data-uwf="units"]',String(n)); await page.evaluate(()=>{ const i=document.querySelector('input[data-uwf="units"]'); i.dispatchEvent(new Event('change',{bubbles:true})); }); await page.waitForTimeout(2000); };
  const upload=async(k,units)=>{ await toUw(); await pick(k); await page.setInputFiles('#uwFile',T12);
    await page.waitForFunction(()=>!!document.querySelector('[data-pfline]'),null,{timeout:40000}).catch(()=>{}); await page.waitForTimeout(1500); await setUnits(units); };
  const approve=async(k)=>{ await page.waitForFunction(()=>{ const b=document.querySelector('[data-uwapprove]'); return b&&!b.disabled; },null,{timeout:20000}).catch(()=>{});
    await page.evaluate(()=>document.querySelector('[data-uwapprove]').click());
    await page.waitForFunction((k)=>{ const g=(window.LDS_gdNOICache()||{})[k]; return !!(g&&g.underwritten!=null&&g.uwApproved&&g.uwApproved.current); },k,{timeout:20000}).catch(()=>{}); await page.waitForTimeout(800); };
  const closeRefi=async()=>{ await page.evaluate(()=>{ const b=document.getElementById('refiCloseBtn'); if(b) b.click(); }); await page.waitForTimeout(500); };
  const openRefiFor=async(name)=>{ const id=await page.evaluate((n)=>{ const l=window.LDS_loans().find(x=>x.propertyName===n&&!x.archived); return l&&l._id; },name);
    await page.evaluate(()=>{ const t=document.querySelector('[data-tabsel="home"]'); if(t) t.click(); }); await page.waitForTimeout(400);
    await page.evaluate((id)=>{ const tr=document.querySelector('tr[data-goto="'+id+'"]'); if(tr) tr.click(); },id); await page.waitForTimeout(600);
    await page.waitForFunction(()=>{ const b=document.getElementById('refiBtn'); return b&&!b.disabled; },null,{timeout:10000}).catch(()=>{});
    await page.evaluate(()=>document.getElementById('refiBtn').click());
    await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-refiverdict], #refiView [data-refinot12]').length>0,null,{timeout:15000}).catch(()=>{});
    await page.waitForTimeout(1500); return id; };
  const refi=(id)=>page.evaluate((id)=>{ const v=document.getElementById('refiView'), q=(s)=>v.querySelector(s); const l=id?window.LDS_loans().find(x=>x._id===id):window.LDS_activeLoan();
    const rec=l?(window.LDS_refiRec(l)||{}):{};
    return { noi:l?window.LDS_refiNOI(l):null, basis:l?window.LDS_refiBasis(l):null, bases:rec.bases||null, pushes:rec.pushes||null, cover:rec.cover,
      verdict:q('[data-refiverdict]')?q('[data-refiverdict]').getAttribute('data-refiverdict'):null, not12:(q('[data-refinot12]')||{}).innerText||'',
      uploads:[...v.querySelectorAll('[data-refiuploadt12]')].map(b=>b.getAttribute('data-refiuploadt12')),
      btns:[...v.querySelectorAll('[data-noibasis]')].map(b=>({ id:b.getAttribute('data-noibasis'), dis:b.disabled, on:/bg-brand-600/.test(b.className) })),
      cov:[...v.querySelectorAll('[data-reficover]')].map(b=>({ id:b.getAttribute('data-reficover'), amt:Number((b.textContent.match(/\$([\d,]+\.\d\d)/)||[])[1].replace(/,/g,'')), on:/bg-brand-600/.test(b.className) })),
      target:(q('[data-refitarget]')||{}).innerText||'', moves:[...v.querySelectorAll('[data-refimove]')].map(c=>({ k:c.getAttribute('data-refimove'), t:c.getAttribute('data-refimovetitle'), on:c.checked })),
      pool:num0((q('[data-refipooltotal]')||{}).textContent), keyBases:[...v.querySelectorAll('[data-refikeybasis]')].map(s=>s.getAttribute('data-refikeybasis')+'='+s.value) };
    function num0(s){ const n=Number(String(s||'').replace(/[^0-9.\-]/g,'')); return s&&isFinite(n)?n:null; } },id);
  const click=async(sel)=>{ await page.evaluate((s)=>{ const e=document.querySelector(s); if(e) e.click(); },sel); await page.waitForTimeout(1500); };
  const tick=async(k,title)=>{ await page.evaluate(([k,t])=>{ const c=[...document.querySelectorAll('#refiView [data-refimove]')].find(x=>x.getAttribute('data-refimove')===k&&x.getAttribute('data-refimovetitle')===t); if(c) c.click(); },[k,title]); await page.waitForTimeout(1800); };

  // ================= Phase 2: the draft =================
  await upload(K1,120);
  let g1=await gd(K1);
  // 1 — before approval
  ok(await chip()==='draft','1a. the underwriting is a draft (chip "draft")');
  ok(g1&&g1.inPlace>0&&g1.uw==null&&g1.model===2,'1b. General Data: the in-place NOI ('+money(g1&&g1.inPlace)+') and no underwriting NOI yet (got '+(g1&&g1.uw)+')');
  await page.waitForFunction(()=>!!document.querySelector('#opScanMount [data-pushneedsapproval]'),null,{timeout:10000}).catch(()=>{});
  ok(await page.evaluate(()=>/Approve the underwriting first/.test((document.querySelector('#opScanMount [data-pushneedsapproval]')||{}).textContent||'')),'1c. What to push: "Approve the underwriting first"');
  const safe0=num(await page.evaluate(()=>(document.getElementById('uwSafeNoi')||{}).textContent));
  ok(near(safe0,g1.inPlace-120*200,0.02),'1d. the draft Safe = in-place − 120 units × $200 reserves = '+money(g1.inPlace-24000)+' (shown '+money(safe0)+')');
  const id1=await openRefiFor(P1);
  let r=await refi(id1);
  const bI=r.btns.find(b=>b.id==='inplace'), bS=r.btns.find(b=>b.id==='underwritten'), bA=r.btns.find(b=>b.id==='aggressive');
  ok(r.btns.length===3&&bI&&!bI.dis&&bI.on&&bS&&bS.dis&&bA&&bA.dis,'1e. the refinance offers In-place T12 only — Safe and Aggressive are disabled until approved ('+JSON.stringify(r.btns)+')');
  ok(near(r.noi,g1.inPlace,0.01)&&r.basis==='inplace','1f. …and sizes on the in-place T12 ('+money(r.noi)+')');
  await closeRefi();

  // 2 — an assumption that would lower the NOI is a warning, never a change
  await toUw(); await pick(K1);
  await page.waitForFunction(()=>!!document.querySelector('[data-uwbench="vacancyPct"]'),null,{timeout:10000}).catch(()=>{});
  const setVac=async(v)=>{ await page.evaluate((v)=>{ const e=document.querySelector('[data-uwbench="vacancyPct"]'); e.value=v; e.dispatchEvent(new Event('change',{bubbles:true})); },v); await page.waitForTimeout(1500); };
  await setVac('15');
  const w=await page.evaluate(()=>({ t:(document.querySelector('[data-pfassumewarnline="VAC"]')||{}).textContent||'', safe:(document.getElementById('uwSafeNoi')||{}).textContent }));
  ok(/your assumption is 15%/.test(w.t)&&/would be \$[\d,]+ lower/.test(w.t),'2a. a 15% vacancy assumption (the T12 runs less) is a warning: "'+w.t.trim().slice(0,170)+'"');
  ok(near(num(w.safe),safe0,0.02),'2b. …and the Safe NOI does not move ('+w.safe+')');
  await setVac('5');
  ok(!(await page.evaluate(()=>!!document.querySelector('[data-pfassumewarnline="VAC"]'))),'2c. back at 5% (the T12 runs above it): no warning');

  // ================= approve =================
  // 3
  await approve(K1);
  g1=await gd(K1);
  ok(await chip()==='approved','3a. approved: chip "approved"');
  ok(g1&&near(g1.uw,g1.inPlace-24000,0.02)&&near(g1.ag,g1.uw,0.02)&&g1.model===2&&g1.ap&&g1.ap.current===true&&!!g1.ap.at,'3b. General Data: underwritten = Safe after reserves '+money(g1&&g1.uw)+', Aggressive '+money(g1&&g1.ag)+', uwModel 2, approval current');
  await page.waitForFunction(()=>(document.querySelectorAll('#opScanMount [data-pushimpacts]')||[]).length>=3,null,{timeout:25000}).catch(()=>{});
  const pm=await page.evaluate(()=>({ n:document.querySelectorAll('#opScanMount [data-pushimpacts]').length, t:((document.querySelector('#opScanMount [data-pushimpacts]')||{}).innerText||'').replace(/\s+/g,' '), txt:(document.getElementById('opScanMount')||{}).innerText||'' }));
  ok(pm.n===3&&/Raise rents about 3%/.test(pm.txt),'3c. What to push runs on the approved underwriting: 3 pushes ('+pm.n+')');
  ok(/11,800/.test(pm.t)&&/11,500/.test(pm.t)&&/in.?place/i.test(pm.t)&&/safe/i.test(pm.t)&&/aggressive/i.test(pm.t),'3d. each push has three effects — in-place, Safe, Aggressive ("'+pm.t+'")');

  // ================= the refinance =================
  // 4 — the bases, and a push on each basis
  await openRefiFor(P1); r=await refi(id1);
  ok(r.basis==='underwritten'&&r.btns.every(b=>!b.dis)&&(r.btns.find(b=>b.id==='underwritten')||{}).on,'4a. approved → the refinance starts on the Safe underwriting, all three bases offered');
  ok(near(r.noi,g1.uw,0.01),'4b. …sized on Safe '+money(r.noi));
  await click('#refiView [data-noibasis="inplace"]'); r=await refi(id1);
  ok(r.basis==='inplace'&&near(r.noi,g1.inPlace,0.01)&&r.bases&&r.bases[K1]==='inplace','4c. In-place T12 → '+money(r.noi)+', kept in refi.bases');
  await click('#refiView [data-noibasis="aggressive"]'); r=await refi(id1);
  ok(r.basis==='aggressive'&&near(r.noi,g1.ag,0.01)&&r.bases[K1]==='aggressive','4d. Aggressive → '+money(r.noi)+', kept in refi.bases');
  await click('#refiView [data-noibasis="inplace"]');
  await tick(K1,VAC); r=await refi(id1);
  ok(near(r.noi,g1.inPlace+11800,0.01),'4e. on In-place, ticking "'+VAC+'" adds its in-place effect +11,800 → '+money(r.noi));
  ok(r.pushes&&Array.isArray(r.pushes[K1])&&r.pushes[K1].indexOf(VAC)>=0,'4f. the tick is kept with the refinance (refi.pushes)');
  await click('#refiView [data-noibasis="underwritten"]'); r=await refi(id1);
  ok(near(r.noi,g1.uw+11500,0.01),'4g. on Safe the same push adds its Safe effect +11,500 (net of what Safe counts) → '+money(r.noi));
  await tick(K1,VAC); r=await refi(id1);
  ok(near(r.noi,g1.uw,0.01)&&!(r.pushes&&r.pushes[K1]&&r.pushes[K1].length),'4h. un-ticked → back to Safe '+money(r.noi));

  // 5 — the amount to cover
  r=await refi(id1);
  const cv=(id)=>(r.cov.find(c=>c.id===id)||{}).amt;
  ok(r.cov.map(c=>c.id).join(',')==='today,open,maturity'&&(r.cov.find(c=>c.id==='today')||{}).on,'5a. three choices — Today\'s payoff (chosen), No penalty, At maturity');
  ok(cv('maturity')>0&&cv('maturity')<cv('open')&&cv('open')<cv('today'),'5b. at maturity '+money(cv('maturity'))+' > 0 (a maturity on the 1st no longer counts the final payment) < no penalty '+money(cv('open'))+' < today '+money(cv('today')));
  ok(r.target.indexOf('To cover '+money(cv('today')))>=0,'5c. the target line covers today\'s payoff ("'+r.target.slice(0,120)+'")');
  await click('#refiView [data-reficover="open"]'); r=await refi(id1);
  ok(r.target.indexOf('To cover '+money(cv('open')))>=0&&r.cover==='open','5d. No penalty → "To cover '+money(cv('open'))+'", kept as refi.cover "open"');
  await click('#refiView [data-reficover="maturity"]'); r=await refi(id1);
  ok(r.target.indexOf('To cover '+money(cv('maturity')))>=0&&r.cover==='maturity','5e. At maturity → "To cover '+money(cv('maturity'))+'", kept as "maturity"');
  await click('#refiView [data-reficover="today"]'); r=await refi(id1);
  ok(r.target.indexOf('To cover '+money(cv('today')))>=0&&r.cover==null,'5f. back to today\'s payoff — the choice is removed from the record');
  await closeRefi();

  // 6 — a property with no T12 is not refinanced
  const idA=await openRefiFor('Avalon White Plains'); r=await refi(idA);
  ok(/No T12 yet/.test(r.not12)&&r.uploads.length===1&&r.verdict==null&&r.noi==null,'6. Avalon White Plains (no T12): "No T12 yet", an upload button, no verdict, nothing sized');
  await closeRefi();

  // ================= 7 — a package, each property on its own basis =================
  const together=()=>page.evaluate(()=>Promise.resolve(window.LDS_asstAction({action:'refinance_together',args:{properties:['Villages of Whitewater','Villages of Whitewater II']}})).then(x=>x&&(x.msg||x.html)));
  await together(); await page.waitForTimeout(2500); r=await refi(null);
  ok(/Villages of Whitewater II has no T12/.test(r.not12)&&r.uploads.length===1&&r.uploads[0]===K2&&r.verdict==null,'7a. before II has a T12: "No T12 yet" names Villages of Whitewater II only ('+JSON.stringify(r.uploads)+')');
  await closeRefi();
  await upload(K2,100); await approve(K2);
  const g2=await gd(K2);
  ok(g2&&near(g2.uw,g2.inPlace-100*200,0.02),'7b. II approved: Safe '+money(g2&&g2.uw)+' (100 units of reserves)');
  await page.waitForFunction((k)=>{ const p=window.LDS_getPush(k); return !!(p&&Array.isArray(p.moves)&&p.moves.length===3); },K2,{timeout:25000}).catch(()=>{});
  await together(); await page.waitForTimeout(2500); r=await refi(null);
  ok(r.keyBases.length===2&&r.keyBases.indexOf(K1+'=underwritten')>=0&&r.keyBases.indexOf(K2+'=underwritten')>=0,'7c. the package picks the basis per property — both on Safe ('+r.keyBases.join(', ')+')');
  ok(near(r.pool,g1.uw+g2.uw,0.02)&&near(r.noi,g1.uw+g2.uw,0.02),'7d. total = Safe I + Safe II = '+money(g1.uw+g2.uw)+' (table '+money(r.pool)+', refinance '+money(r.noi)+')');
  await page.selectOption('#refiView [data-refikeybasis="'+K2+'"]','inplace'); await page.waitForTimeout(1800); r=await refi(null);
  ok(near(r.noi,g1.uw+g2.inPlace,0.02)&&r.bases&&r.bases[K2]==='inplace'&&r.basis==='mixed','7e. II on In-place, I on Safe: '+money(r.noi)+' — "mixed", kept per property');
  await tick(K1,VAC); await tick(K2,VAC); r=await refi(null);
  ok(near(r.noi,g1.uw+11500+g2.inPlace+11800,0.02),'7f. the same push ticked on both properties counts on each one\'s own basis: +11,500 (Safe) + 11,800 (in-place) → '+money(r.noi));
  ok(r.pushes&&(r.pushes[K1]||[]).indexOf(VAC)>=0&&(r.pushes[K2]||[]).indexOf(VAC)>=0,'7g. each property\'s ticks are kept apart (refi.pushes per property)');
  await tick(K1,VAC); await tick(K2,VAC);
  await page.selectOption('#refiView [data-refikeybasis="'+K2+'"]','underwritten'); await page.waitForTimeout(1200);
  await closeRefi();

  // ================= 8 — the approval goes stale =================
  await toUw(); await pick(K1);
  await page.waitForFunction(()=>!!document.querySelector('[data-uwstatus]'),null,{timeout:20000}).catch(()=>{});
  ok(await chip()==='approved','8a. back on Villages of Whitewater: still approved');
  await setUnits(150);
  ok(await chip()==='changed','8b. new units move the reserves: "changed since approved"');
  await page.waitForFunction((k)=>{ const g=(window.LDS_gdNOICache()||{})[k]; return !!(g&&g.uwApproved&&g.uwApproved.current===false); },K1,{timeout:15000}).catch(()=>{});
  const g1s=await gd(K1);
  ok(g1s&&near(g1s.uw,g1.uw,0.02)&&g1s.ap&&g1s.ap.current===false,'8c. until approved again, the kept underwriting is the approved one ('+money(g1s&&g1s.uw)+') and General Data marks it not current, like the chip (current: '+(g1s&&g1s.ap&&g1s.ap.current)+')');
  await openRefiFor(P1); r=await refi(id1);
  ok(r.basis==='underwritten'&&near(r.noi,g1.uw,0.01),'8d. the refinance still sizes on the last approved Safe '+money(r.noi));
  await closeRefi();
  await toUw(); await pick(K1);
  await page.waitForFunction(()=>!!document.querySelector('[data-uwapprove]'),null,{timeout:20000}).catch(()=>{});
  await page.evaluate(()=>document.querySelector('[data-uwapprove]').click());
  await page.waitForFunction((v)=>{ const g=(window.LDS_gdNOICache()||{})['name:villages of whitewater']; return !!(g&&g.underwritten!=null&&Math.abs(g.underwritten-v)<0.05); },g1.inPlace-150*200,{timeout:20000}).catch(()=>{});
  const g1b=await gd(K1);
  ok(await chip()==='approved'&&g1b&&near(g1b.uw,g1.inPlace-150*200,0.02)&&g1b.ap&&g1b.ap.current===true,'8e. approved again: Safe '+money(g1b&&g1b.uw)+' (150 units of reserves), approval current');

  // 9
  ok(errors.length===0,'9. no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{ fs.rmSync(UDATA,{recursive:true,force:true}); }catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all underwriting → refinance e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{ console.error('E2E CRASH',e); process.exit(2); });
