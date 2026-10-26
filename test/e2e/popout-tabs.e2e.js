/* e2e for 2.9.8 (problem 2) — popping a tab out works like dragging a browser tab out.
   The tab LEAVES the main window's strip and its window opens on what the tab was showing (Underwriting's
   property, the Calendar's view and filters). "+" for a tool that is out doesn't make a second copy. Docking puts
   the tab back in the same place, showing what the window was showing. Closing the window with its X closes the tab.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/popout-tabs.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-popout-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const until=async(pg,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||15000)){ try{ if(await pg.evaluate(fn,arg)) return true; }catch(e){} await pg.waitForTimeout(300); } return false; };
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{state:'attached',timeout:20000}).catch(()=>{}); await page.waitForTimeout(1500);
  const plus=(kind)=>page.evaluate((k)=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="'+k+'"]');if(o)o.click();},kind);
  const tabs=()=>page.evaluate(()=>window.LDS_tabs());
  const popBtn=(re)=>page.evaluate((re)=>{ const t=[...document.querySelectorAll('[data-tabsel]')].find(b=>new RegExp(re).test(b.textContent)); t.querySelector('[data-tabpop]').click(); },re);
  const P=await page.evaluate(()=>window.opProperties().slice(0,2).map(p=>({key:p.key,name:p.name})));

  // ---- Underwriting on property A, between Home and the Calendar ----
  await plus('underwriting'); await page.waitForFunction(()=>document.getElementById('opPropPick'),null,{timeout:8000});
  await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},P[0].key); await page.waitForTimeout(1500);
  await plus('calendar'); await page.waitForTimeout(800);
  const t0=await tabs();
  ok(t0.join(',')==='home,underwriting,calendar','strip: Home · Underwriting · Calendar');
  await page.evaluate(()=>{ const t=[...document.querySelectorAll('[data-tabsel]')].find(b=>/Underwriting/.test(b.textContent)); t.click(); }); await page.waitForTimeout(500);

  // ---- pop it out: it leaves the strip, its window opens on property A ----
  const winP=app.waitForEvent('window',{timeout:15000});
  await popBtn('Underwriting');
  const uw=await winP; await uw.waitForLoadState('domcontentloaded');
  ok(await until(uw,(k)=>window.LDS_uwFocus&&window.LDS_uwFocus()===k,P[0].key,20000),'the window opens on the same property ('+P[0].name+')');
  await page.waitForTimeout(500);
  const t1=await tabs();
  ok(t1.join(',')==='home,calendar','the Underwriting tab LEFT the main window ('+t1.join(', ')+')');
  ok((await page.evaluate(()=>window.LDS_popped())).join()==='underwriting','…it lives in its own window now');

  // ---- "+" Underwriting while it is out: no second copy ----
  const wins0=app.windows().length;
  await plus('underwriting'); await page.waitForTimeout(800);
  ok((await tabs()).join(',')==='home,calendar'&&app.windows().length===wins0,'"+" Underwriting brings its window up — no second tab, no second window');

  // ---- in the window: switch to property B, then dock ----
  await uw.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},P[1].key);
  await until(uw,(k)=>window.LDS_uwFocus()===k,P[1].key);
  const closed=uw.waitForEvent('close',{timeout:10000}).catch(()=>null);
  await uw.evaluate(()=>document.getElementById('panelDockBtn').click()); await closed;
  await page.waitForTimeout(1500);
  ok((await tabs()).join(',')==='home,underwriting,calendar','docked: back in the SAME place (Home · Underwriting · Calendar)');
  ok(await until(page,(k)=>window.LDS_uwFocus()===k&&!document.getElementById('uwView').hidden,P[1].key),'…open, and showing what the window showed ('+P[1].name+')');

  // ---- the Calendar keeps its view and filters both ways ----
  await page.evaluate(()=>{ const t=[...document.querySelectorAll('[data-tabsel]')].find(b=>/Calendar/.test(b.textContent)); t.click(); }); await page.waitForTimeout(1200);
  await page.evaluate(()=>{ const d=document.getElementById('calendarFrame').contentWindow.document; const b=d.querySelector('[data-view="calendar"]'); if(b) b.click(); }); await page.waitForTimeout(400);
  const cs=await page.evaluate(()=>document.getElementById('calendarFrame').contentWindow.__calState());
  ok(cs.view==='calendar','in the tab: the Calendar shows the calendar view (not the list)');
  const winC=app.waitForEvent('window',{timeout:15000});
  await popBtn('Calendar');
  const cw=await winC; await cw.waitForLoadState('domcontentloaded');
  ok(await until(cw,()=>{ const f=document.getElementById('calendarFrame'); return f&&f.contentWindow&&f.contentWindow.__calState&&f.contentWindow.__calState().view==='calendar'; },null,20000),'the Calendar window opens on the same view');
  const lender=await cw.evaluate(()=>{ const d=document.getElementById('calendarFrame').contentWindow.document; const c=d.querySelector('[data-lender]'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); const b=d.querySelector('[data-view="list"]'); if(b) b.click(); return c.getAttribute('data-lender'); });
  const closedC=cw.waitForEvent('close',{timeout:10000}).catch(()=>null);
  await cw.evaluate(()=>document.getElementById('panelDockBtn').click()); await closedC; await page.waitForTimeout(1500);
  const cs2=await page.evaluate(()=>{ const w=document.getElementById('calendarFrame').contentWindow; return w&&w.__calState?w.__calState():null; });
  ok(cs2&&cs2.view==='list'&&cs2.lenders[lender]===true,'docked: the Calendar tab shows the window\'s view and lender filter ('+lender+')');
  ok(await page.evaluate((l)=>{ const d=document.getElementById('calendarFrame').contentWindow.document; const c=[...d.querySelectorAll('[data-lender]')].find(x=>x.getAttribute('data-lender')===l); return !!(c&&c.checked); },lender),'…with the filter box ticked');

  // ---- closing the window with its X closes the tab ----
  await plus('health'); await page.waitForTimeout(1500);
  const winH=app.waitForEvent('window',{timeout:15000});
  await popBtn('Data Health');
  const hw=await winH; await hw.waitForLoadState('domcontentloaded'); await page.waitForTimeout(800);
  ok(!(await tabs()).includes('health'),'Data Health popped out — gone from the strip');
  await hw.close(); await page.waitForTimeout(1200);
  ok(!(await tabs()).includes('health')&&(await page.evaluate(()=>window.LDS_popped())).length===0,'closing its window with X closes the tab (it does not come back)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all pop-out e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
