/* e2e for 2.9.7 — which index sets each month, and where the rate comes from.
   #255 K2 started on 1-month LIBOR: until its switch date is set the past months say so; with the date set,
        each month up to it uses the real LIBOR on its reset day + 3.75% (Jan 2022 = 0.10188% on Dec 30 2021 —
        Jan 1 2022 was a Saturday, so 2 business days before it is Thursday Dec 30)
   #256 1-month Term SOFR and 30-day Average SOFR as index choices: a past month uses the value on its reset
        day (2 business days before the month), a future month today's value (read by the main process)
   #130 the schedule CSV says how the rate works and, for every month, where the rate comes from; the
        on-screen schedule shows the same as a small tag
   The Term SOFR feed is answered from a file (LDS_RATES_FAKE); a second launch runs it offline.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/rates.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-rates-'));
const FAKE=path.join(UDATA,'..',path.basename(UDATA)+'-termsofr.json');
fs.writeFileSync(FAKE,JSON.stringify({live:{value:3.95,date:'2026-10-02'},history:{}}));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b,t)=>Math.abs(a-b)<(t||1e-7);
async function launch(env){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'},env)});
  const page=await app.firstWindow();
  await page.route(/^https?:\/\//,r=>r.abort());   // the page itself never reaches the internet here
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  return {app,page};
}
(async()=>{
  const errors=[];
  let {app,page}=await launch({LDS_RATES_FAKE:FAKE,LDS_RATES_OFFLINE:''}); page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  const ids=await page.evaluate(()=>{ const L=window.LDS_loans(); const f=(n)=>L.find(l=>l.propertyName===n);
    return { k2:f('K2 Sweetwater (FIU Residences)')._id, k2key:window.propertyKey(f('K2 Sweetwater (FIU Residences)')), ml:f('M Lofts')._id, ll:f('Living Lofts (Middlesex)')._id }; });
  const row=(id,label)=>page.evaluate(({id,label})=>(window.LDS_scheduleRows(id)||[]).find(r=>r.label===label)||null,{id,label});
  const editLoan=async(id,fill)=>{
    await page.evaluate((id)=>{ const r=document.querySelector('tr[data-goto="'+id+'"]'); if(r) r.click(); },id); await page.waitForTimeout(400);
    let opened=await page.evaluate((id)=>{ const b=document.querySelector('[data-loanedit="'+id+'"]'); if(b){ b.click(); return true; } const e=document.getElementById('loanRecEdit'); if(e&&!e.hidden){ e.click(); return true; } return false; },id);
    await page.waitForTimeout(400);
    await page.evaluate(fill); await page.click('#saveBtn'); await page.waitForTimeout(700);
    return opened;
  };

  // ---- #255: K2 before its switch date is set ----
  const j0=await row(ids.k2,'Jan 2022');
  ok(j0&&j0.tag==='No history'&&/LIBOR Until/.test(j0.text),'K2 Jan 2022 says the past rate needs the LIBOR switch date ("'+(j0&&j0.text)+'")');
  // set "On 1-Month LIBOR Until" = Jun 30 2023 (the date itself is still open with Azriel — this only tests the mechanism)
  await page.evaluate((k)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value='combo:'+k; s.dispatchEvent(new Event('change',{bubbles:true})); },ids.k2key);
  await page.waitForTimeout(500);
  await page.evaluate((id)=>document.querySelector('[data-loanedit="'+id+'"]').click(),ids.k2); await page.waitForTimeout(400);
  await page.evaluate(()=>{ const i=document.getElementById('f_liborUntil'); i.value='2023-06-30'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.click('#saveBtn'); await page.waitForTimeout(700);
  const lib=await page.evaluate(()=>window.RateHistory.LIBOR1M_DAILY['2021-12-30']);
  const j1=await row(ids.k2,'Jan 2022');
  ok(j1&&near(j1.rate,(lib+3.75)/100)&&j1.tag==='Actual','K2 Jan 2022 = LIBOR on Dec 30 2021 ('+lib+'%) + 3.75% = '+(j1&&(j1.rate*100).toFixed(5))+'%');
  ok(j1&&/Actual 1-month LIBOR on 12\/30\/2021 \(0\.102%\) \+ 3\.75%/.test(j1.text),'…and says so: "'+(j1&&j1.text)+'"');
  const jun=await row(ids.k2,'Jun 2023'), aug=await row(ids.k2,'Aug 2023');
  ok(jun&&/LIBOR/.test(jun.text),'Jun 2023 (reset May 30, before the switch) is still LIBOR');
  ok(aug&&!/LIBOR/.test(aug.text)&&/SOFR|not downloaded/.test(aug.text),'Aug 2023 (after the switch) uses the loan\'s SOFR index ("'+(aug&&aug.text)+'")');
  const dK2=await page.evaluate((id)=>window.LDS_describeRate(id),ids.k2);
  ok(/^1-month LIBOR \+ 3\.75% until 06\/30\/2023, then SOFR \+ 3\.75%, changes monthly, floor 3\.75%$/.test(dK2),'K2\'s rate in words: "'+dK2+'"');

  // ---- #256: M Lofts on 1-month Term SOFR ----
  await editLoan(ids.ml,()=>{ const s=document.getElementById('f_index'); s.value='termsofr1m'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  ok(await page.evaluate((id)=>window.LDS_loans().find(l=>l._id===id).index,ids.ml)==='termsofr1m','M Lofts now uses 1-month Term SOFR');
  await page.waitForTimeout(1500);   // the main process answers the Term SOFR feed
  const ts=await page.evaluate(()=>window.RateHistory.TERMSOFR1M_DAILY['2023-12-28']);
  const jan24=await row(ids.ml,'Jan 2024');
  ok(jan24&&near(jan24.rate,(ts+2.05)/100)&&jan24.tag==='Actual'&&/on 12\/28\/2023/.test(jan24.text),'Jan 2024 = Term SOFR on its reset day Dec 28 2023 ('+ts+'%) + 2.05% ("'+(jan24&&jan24.text)+'")');
  const cache=await page.evaluate(()=>window.LDS_indexCache('termsofr1m'));
  ok(cache&&near(cache.value,3.95,1e-9)&&cache.date==='2026-10-02'&&!cache.stale,'today\'s Term SOFR came from the main process with its date (3.95% on 2026-10-02)');
  const saved=await page.evaluate(()=>window.LDS_rateHist().termsofr1m||{});
  ok(saved['2026-10-02']===3.95,'the value is saved with its date');
  const fut=await page.evaluate((id)=>(window.LDS_scheduleRows(id)||[]).filter(r=>r.tag==='Projected'),ids.ml);
  ok(fut.length>0&&near(fut[fut.length-1].rate,0.06)&&/a projection/.test(fut[0].text),'future months use today\'s value: 3.95% + 2.05% = 6.00% ("'+(fut[0]&&fut[0].text)+'")');
  const sched=await page.evaluate(()=>[...document.querySelectorAll('#scheduleBody [data-ratesrc]')].map(x=>x.textContent).join(','));
  ok(/ACTUAL|Actual/.test(sched)&&/PROJECTED|Projected/i.test(sched),'the on-screen schedule shows the source as a tag on each row');
  const banner=await page.evaluate(()=>(document.getElementById('floatBanner')||{}).innerText||'');
  ok(/reset day/i.test(banner),'the floating banner says the month is set on its reset day');
  // ---- #130: the CSV ----
  const csv=await page.evaluate((id)=>window.LDS_scheduleCsv(id),ids.ml);
  ok(/How the rate works,"?1-month Term SOFR \+ 2\.05%, set 2 business days before each month, floor 2\.55%"?/.test(csv),'CSV top: how the rate works');
  ok(/Rate this month,/.test(csv)&&/Payment this month,/.test(csv),'CSV top: rate and payment this month');
  ok(/Where the rate comes from/.test(csv)&&/Actual 1-month Term SOFR on 12\/28\/2023/.test(csv),'CSV: a "Where the rate comes from" column on every month');
  const dLL=await page.evaluate((id)=>window.LDS_describeRate(id),ids.ll);
  ok(/^Fixed 3\.10% until [A-Z][a-z]{2} \d{4}, then 5-yr Treasury \+ 2\.63%, reset every \d+ months/.test(dLL),'a hybrid ARM in words: "'+dLL+'"');
  // ---- #256: 30-day Average SOFR ----
  await editLoan(ids.ml,()=>{ const s=document.getElementById('f_index'); s.value='sofr30'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  const s30=await page.evaluate(()=>window.RateHistory.SOFR30_DAILY['2023-12-28']);
  const jan24b=await row(ids.ml,'Jan 2024');
  ok(jan24b&&near(jan24b.rate,(s30+2.05)/100)&&/30-day Average SOFR on 12\/28\/2023/.test(jan24b.text),'on 30-day Average SOFR, Jan 2024 = its Dec 28 2023 value ('+s30+'%) + 2.05%');
  await editLoan(ids.ml,()=>{ const s=document.getElementById('f_index'); s.value='termsofr1m'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  await app.close();

  // ---- offline: the last saved value, labelled with its date ----
  ({app,page}=await launch({LDS_RATES_OFFLINE:'1',LDS_RATES_FAKE:''})); page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.evaluate((id)=>{ const r=document.querySelector('tr[data-goto="'+id+'"]'); if(r) r.click(); },ids.ml);
  await page.waitForTimeout(2000);
  const c2=await page.evaluate(()=>window.LDS_indexCache('termsofr1m'));
  ok(c2&&c2.stale&&near(c2.value,3.95,1e-9)&&c2.date==='2026-10-02','offline, Term SOFR is the last saved value (3.95% from 2026-10-02), marked as not fresh');
  const b2=await page.evaluate(()=>(document.getElementById('floatBanner')||{}).innerText||'');
  ok(/last saved 10\/02\/2026/.test(b2),'the banner labels it "last saved 10/02/2026"');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{ fs.rmSync(UDATA,{recursive:true,force:true}); fs.rmSync(FAKE,{force:true}); }catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all rates e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
