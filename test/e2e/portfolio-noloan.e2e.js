/* e2e for 2.9.8 (problem 4) — removing a loan keeps the property's NOI in the portfolio.
   The property is still owned: its NOI stays in the portfolio with no debt against it, so Portfolio DSCR and
   debt yield go UP and LTV goes DOWN; the property stays in the Coverage table ("no loan"); Restore gives back
   exactly the earlier numbers. Total debt and the weighted-average rate cover loans only.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/portfolio-noloan.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-noloan-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<0.5;
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(2500);
  const cov=()=>page.evaluate(()=>Object.assign({},window.LDS_lastHomeCoverage));
  const home=async()=>{ await page.evaluate(()=>{ const b=document.getElementById('scopePortfolioBtn'); if(b) b.click(); }); await page.waitForTimeout(800); };
  const tiles=async()=>{ let a=null,b=null; for(let i=0;i<12;i++){ b=await tilesNow(); if(a&&a.debt===b.debt&&a.rate===b.rate) return b; a=b; await page.waitForTimeout(500); } return b; };   // the tiles count up — read once they stop moving
  const tilesNow=()=>page.evaluate(()=>{ const t=document.getElementById('portfolioView').innerText; return { debt:(t.match(/Total Debt Outstanding\s*\n?\s*(\$[\d,\.]+)/i)||[])[1]||'', rate:(t.match(/Weighted-Avg Rate\s*\n?\s*([\d\.]+%)/i)||[])[1]||'' }; });
  await home();
  const c0=await cov(), t0=await tiles();
  ok(c0.wDscr>0&&c0.wDy>0&&c0.wLtv>0,'before: the portfolio has a DSCR, debt yield and LTV ('+(c0.wDscr||0).toFixed(3)+'× / '+((c0.wDy||0)*100).toFixed(2)+'% / '+((c0.wLtv||0)*100).toFixed(2)+'%)');

  // a single-loan property with an NOI of its own
  const pick=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans.length===1&&Number(x.loans[0].noi)>0); return p?{ id:p.loans[0]._id, key:p.key, name:p.name, noi:Number(p.loans[0].noi) }:null; });
  ok(!!pick,'picked a property with one loan and an NOI ('+(pick&&pick.name)+')');
  await page.evaluate((id)=>{ const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },pick.id);
  await page.waitForTimeout(400); await page.click('#loanRecRemove'); await page.waitForTimeout(300); await page.click('#confirmOk'); await page.waitForTimeout(800);
  await home();
  const c1=await cov(), t1=await tiles();
  ok(near(c1.sumNOI,c0.sumNOI),'the portfolio NOI is unchanged ('+Math.round(c0.sumNOI)+' → '+Math.round(c1.sumNOI)+')');
  ok(c1.wDscr>c0.wDscr,'Portfolio DSCR goes up ('+c0.wDscr.toFixed(3)+' → '+c1.wDscr.toFixed(3)+')');
  ok(c1.wDy>c0.wDy,'Portfolio debt yield goes up ('+(c0.wDy*100).toFixed(2)+'% → '+(c1.wDy*100).toFixed(2)+'%)');
  ok(c1.wLtv<c0.wLtv,'Portfolio LTV goes down ('+(c0.wLtv*100).toFixed(2)+'% → '+(c1.wLtv*100).toFixed(2)+'%)');
  ok(c1.nNoLoan>=1,'the property is counted as one with no loan ('+c1.nNoLoan+')');
  ok(t1.debt!==t0.debt,'Total Debt Outstanding leaves the loan out ('+t0.debt+' → '+t1.debt+')');
  const row=await page.evaluate((k)=>{ const r=document.querySelector('#portfolioView tr[data-covnoloan="'+CSS.escape(k)+'"]'); return r?r.innerText.replace(/\s+/g,' '):''; },pick.key);
  ok(row.indexOf(pick.name)>=0&&/no loan/i.test(row)&&/NOI counted/i.test(row),'it stays in the Coverage table with its NOI and "no loan" ("'+row.slice(0,140)+'")');

  // Restore → exactly the earlier numbers
  await page.click('[data-restoreloan="'+pick.id+'"]'); await page.waitForTimeout(1800);
  await home();
  const c2=await cov(), t2=await tiles();
  ok(c2.wDscr===c0.wDscr&&c2.wDy===c0.wDy&&c2.wLtv===c0.wLtv&&near(c2.sumNOI,c0.sumNOI),'Restore gives back exactly the earlier DSCR, debt yield, LTV and NOI');
  ok(t2.debt===t0.debt&&t2.rate===t0.rate,'…and the same total debt and weighted-average rate ('+t2.debt+' · '+t2.rate+')');
  ok(!(await page.evaluate((k)=>!!document.querySelector('#portfolioView tr[data-covnoloan="'+CSS.escape(k)+'"]'),pick.key)),'the "no loan" row is gone again');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all removed-loan portfolio e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
