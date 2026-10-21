/* e2e — next stage (draft): which lender limits this lender uses. In the refinance's "How 'supports $X' is worked out",
   each of the four limits has a "Lender uses" tick box. The smallest of the ticked ones binds; all ticked (the start)
   is the smallest of all four, as before. Kept per refinance (per loan), on this computer. The limit rows no longer
   light up under the mouse; only the binding row is highlighted.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-lender-uses.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-lenderuses-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b)=>typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<0.01;

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);
  await require('./_t12seed').seedT12(page);   // (2026-10-21) a refinance is sized on the property's T12
  const ids=await page.evaluate(()=>{ const L=window.LDS_loans(); const q=L.find(x=>/queens gate/i.test(x.propertyName||'')); const o=L.find(x=>x!==q&&Number(x.noi)>0&&!/queens gate/i.test(x.propertyName||'')); return { q:q&&q._id, o:o&&o._id }; });
  const openRefi=async(id)=>{ await page.click('[data-tabsel="home"]').catch(()=>{}); await page.waitForTimeout(300);
    await page.evaluate((id)=>{ const tr=document.querySelector('tr[data-goto="'+id+'"]'); if(tr) tr.click(); },id); await page.waitForTimeout(500);
    await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:10000}).catch(()=>{});
    await page.click('#refiBtn').catch(()=>{});
    await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-refiuse]').length>0,null,{timeout:10000}).catch(()=>{});
    await page.waitForTimeout(500); };
  const read=()=>page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const c=window.LDS_refiCanStage(l);
    const rows=[...document.querySelectorAll('#refiView [data-refileg]')].map(r=>({ key:r.getAttribute('data-refileg'), ticked:r.querySelector('[data-refiuse]').checked, off:r.hasAttribute('data-refilegoff'), binds:/binds/i.test(r.textContent), chip:/not used by this lender/.test(r.textContent) }));
    return { maxLoan:c.maxLoan, binding:c.binding, legs:c.legs, rows, smallest:(document.querySelector('#refiView [data-refismallest]')||{}).textContent||'', supports:(document.querySelector('#refiView [data-refibasis] p')||{}).textContent||'' }; },ids.q);
  const tick=async(key)=>{ await page.click('#refiView [data-refiuse="'+key+'"]'); await page.waitForTimeout(700); };

  await openRefi(ids.q);
  let r=await read();
  const min=Math.min(...['DSCR','LTV','Debt Yield'].map(k=>r.legs[k]).filter(v=>v>0));
  ok(r.rows.length===4 && r.rows.every(x=>x.ticked), 'every limit starts ticked: "Lender uses" on all four');
  ok(near(r.maxLoan,min) && r.binding==='DSCR' && /^The smallest,/.test(r.smallest), 'all ticked: the smallest binds, as before ('+r.binding+')');
  // no hover highlight on the limit rows; the binding row keeps its own
  const ltvRow=await page.$('#refiView [data-refileg="LTV"]'); await ltvRow.hover(); await page.waitForTimeout(300);
  const hov=await page.evaluate(()=>{ const s=getComputedStyle(document.querySelector('#refiView [data-refileg="LTV"]')); return { shadow:s.boxShadow, bg:s.backgroundImage }; });
  ok((hov.shadow==='none'||hov.shadow==='') && (hov.bg==='none'||hov.bg===''), 'a limit row under the mouse is not highlighted ('+hov.shadow+' / '+hov.bg+')');
  const bindBg=await page.evaluate(()=>getComputedStyle(document.querySelector('#refiView [data-refileg="DSCR"]')).backgroundColor);
  ok(bindBg && bindBg!=='rgba(0, 0, 0, 0)', 'the binding row is highlighted ('+bindBg+')');

  // the lender sizes on LTV only
  await tick('DSCR'); await tick('Debt Yield');
  r=await read();
  ok(r.binding==='LTV' && near(r.maxLoan,r.legs.LTV) && r.maxLoan>min, 'LTV only: LTV binds and allows more than the debt coverage would ('+Math.round(r.legs.LTV)+' > '+Math.round(min)+')');
  ok(r.rows.find(x=>x.key==='DSCR').chip && r.rows.find(x=>x.key==='DSCR').off && !r.rows.find(x=>x.key==='DSCR').binds && r.rows.find(x=>x.key==='LTV').binds, 'the unticked lines say "not used by this lender"; only LTV says "binds"');
  ok(/smallest of the limits this lender uses/.test(r.smallest) && r.supports.indexOf(Math.round(r.legs.LTV).toLocaleString('en-US'))>=0, 'the text says it is the smallest of the limits this lender uses, and "supports $X" follows ('+r.smallest.trim().slice(0,70)+'…)');
  // the last limit can't be unticked
  await tick('LTV'); r=await read();
  ok(r.rows.find(x=>x.key==='LTV').ticked && r.binding==='LTV', 'the last limit that sizes can’t be unticked');
  // LTV and debt yield: the smaller of the two
  await tick('Debt Yield'); r=await read();
  const exp2=Math.min(r.legs.LTV,r.legs['Debt Yield']);
  ok(near(r.maxLoan,exp2), 'LTV and debt yield ticked: the smaller of the two binds');

  // per refinance (per loan): another loan's refinance is untouched; this one keeps its choice
  if(ids.o){
    await openRefi(ids.o);
    const other=await page.evaluate(()=>[...document.querySelectorAll('#refiView [data-refiuse]')].every(x=>x.checked));
    ok(other, 'another loan’s refinance still uses all four (the choice is per loan)');
  }
  await openRefi(ids.q); r=await read();
  ok(!r.rows.find(x=>x.key==='DSCR').ticked && r.rows.find(x=>x.key==='LTV').ticked && r.binding==='LTV', 'back on Queens Gate: its own choice is kept');
  // back to the start
  await page.click('#refiView [data-refilimreset]').catch(()=>{}); await page.waitForTimeout(700); r=await read();
  ok(r.rows.every(x=>x.ticked) && r.binding==='DSCR', '"back to 1.25× / 75% / 7%, all used" ticks all four again');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all refi-lender-uses e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
