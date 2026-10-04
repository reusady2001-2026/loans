/* e2e for 2.9.7 — the page of a property with no loan, and the senior + mezz view.
   #3/#83 choosing a property with no loan opens its page (profile, documents, Add the first loan,
          Open in Underwriting, Archive → Un-archive / Delete permanently) — never a blank page
   #134   the dropdown names a stack from its real loans ("senior + mezz") and marks "no loan yet"
   #67    the combined view's Rate Type comes from the real loans (not always "Fixed")
   #68    Edit on a senior + mezz property opens its profile and stays on the combined view
   #69    Add Property with a loan's name (a mezz) offers to add a loan to that property instead
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/property-page.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-ppage-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  const confirmOk=()=>page.evaluate(()=>document.getElementById('confirmOk').click());
  const modalText=()=>page.evaluate(()=>{ const m=document.getElementById('confirmModal'); return m&&!m.classList.contains('hidden')?document.getElementById('confirmText').textContent:''; });
  const pick=(v)=>page.evaluate((v)=>{ document.getElementById('scopeLoanBtn').click(); const s=document.getElementById('loanSelect'); s.value=v; s.dispatchEvent(new Event('change',{bubbles:true})); },v);

  // ---- #3: a property with no loan → its own page ----
  const key=await page.evaluate(async()=>await window.LDS_addProperty('Lonely Acres'));
  await page.waitForTimeout(500);
  const opt=await page.evaluate((k)=>{ const o=[...document.querySelectorAll('#loanSelect option')].find(x=>x.value==='prop:'+k); return o?o.textContent:null; },key);
  ok(!!opt&&/no loan yet/.test(opt),'the dropdown lists it as "'+opt+'"');
  await pick('prop:'+key); await page.waitForTimeout(800);
  const P=await page.evaluate(()=>{ const v=document.getElementById('propView'); return { shown:v&&!v.hidden, loanView:!document.getElementById('loanView').hidden,
    head:(document.getElementById('propHeader')||{}).innerText||'', prof:!!document.querySelector('#propProfilePanel [data-profilekey]'), docs:(document.getElementById('propDocsPanel')||{}).innerText||'' }; });
  ok(P.shown&&!P.loanView,'choosing it opens the property page (not a blank loan view)');
  ok(/Lonely Acres/.test(P.head)&&/No loan yet/i.test(P.head),'the page names the property and says "No loan yet"');
  ok(/Add the first loan/.test(P.head)&&/Open in Underwriting/.test(P.head)&&/Archive/.test(P.head),'it offers Add the first loan, Open in Underwriting and Archive');
  ok(P.prof,'the property profile is on the page');
  ok(/Documents/.test(P.docs),'the documents panel is on the page');
  // a profile edit on this page is saved
  await page.evaluate(()=>{ const i=document.querySelector('#propProfilePanel [data-pf="residentialUnits"]'); i.value='42'; i.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(500);
  ok(await page.evaluate((k)=>String(window.LDS_profileEffective(k,'residentialUnits'))==='42',key),'a profile field edited on this page is saved (42 units)');
  // Add the first loan → the form, pre-filled; Cancel → back to the page
  await page.evaluate(()=>document.querySelector('[data-propadd]').click()); await page.waitForTimeout(400);
  const pre=await page.evaluate(()=>({ form:!document.getElementById('formView').hidden, name:document.getElementById('f_propertyName').value }));
  ok(pre.form&&pre.name==='Lonely Acres','Add the first loan opens the form with the property filled in ("'+pre.name+'")');
  await page.click('#cancelBtn'); await page.waitForTimeout(400);
  ok(await page.evaluate(()=>!document.getElementById('propView').hidden),'Cancel goes back to the property page');
  // ---- #83: Archive → Un-archive / Delete permanently ----
  await page.evaluate(()=>document.querySelector('[data-proparchive]').click()); await page.waitForTimeout(300);
  await confirmOk(); await page.waitForTimeout(800);
  const A=await page.evaluate((k)=>({ arch:window.LDS_isArchived(k), head:(document.getElementById('propHeader')||{}).innerText||'', shown:!document.getElementById('propView').hidden }),key);
  ok(A.arch&&A.shown&&/archived/i.test(A.head)&&/Un-archive/.test(A.head)&&/Delete permanently/.test(A.head),'Archive keeps you on the page, now archived, with Un-archive and Delete permanently');
  await page.evaluate(()=>document.querySelector('[data-propunarchive]').click()); await page.waitForTimeout(800);
  ok(await page.evaluate((k)=>!window.LDS_isArchived(k)&&/No loan yet/i.test(document.getElementById('propHeader').innerText),key),'Un-archive brings it back');
  await page.evaluate(()=>document.querySelector('[data-proparchive]').click()); await page.waitForTimeout(300); await confirmOk(); await page.waitForTimeout(800);
  await page.evaluate(()=>document.querySelector('[data-propdelete]').click()); await page.waitForTimeout(300);
  ok(/for good/.test(await modalText()),'Delete permanently asks first');
  await confirmOk(); await page.waitForTimeout(1200);
  const D=await page.evaluate((k)=>({ gone:!window.opProperties().some(p=>p.key===k)&&!window.LDS_archivedProps().includes(k), propView:!document.getElementById('propView').hidden, portfolio:!document.getElementById('portfolioView').hidden }),key);
  ok(D.gone&&!D.propView&&D.portfolio,'after the delete the property is gone and Home shows (no blank page)');

  // ---- #134 / #67 / #68: a senior + mezz property ----
  const st=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans&&x.loans.length>1&&x.loans.some(l=>/mezz/i.test(l.propertyName||'')||l.lienPosition==='Mezzanine'));
    const types=[...new Set(p.loans.map(l=>l.rateType||'Fixed'))]; return { key:p.key, name:p.name, n:p.loans.length, expect:types.length===1?types[0]:'Mixed' }; });
  const o2=await page.evaluate((k)=>{ const o=[...document.querySelectorAll('#loanSelect option')].find(x=>x.value==='combo:'+k); return o?o.textContent:''; },st.key);
  ok(/senior \+ mezz/.test(o2),'the dropdown names the stack from its loans ("'+o2.trim()+'")');
  await pick('combo:'+st.key); await page.waitForTimeout(800);
  const kpi=await page.evaluate(()=>{ const c=[...document.querySelectorAll('#kpiGrid > div')].find(d=>/Rate Type/i.test(d.innerText)); return c?c.innerText:''; });
  ok(new RegExp(st.expect,'i').test(kpi)&&/senior/i.test(kpi)&&/mezz/i.test(kpi),'the combined Rate Type is the loans\' real type ('+st.expect+'): "'+kpi.replace(/\s+/g,' ')+'"');
  await page.click('#editBtn'); await page.waitForTimeout(700);
  const E=await page.evaluate((k)=>({ sel:document.getElementById('loanSelect').value, lv:!document.getElementById('loanView').hidden, open:!!document.querySelector('#loanProfilePanel details[open]') }),st.key);
  ok(E.sel==='combo:'+st.key&&E.lv&&E.open,'Edit opens the property profile and stays on the combined view ('+E.sel+')');

  // ---- #69: Add Property with the mezz loan's name ----
  const mz=await page.evaluate((k)=>{ const p=window.opProperties().find(x=>x.key===k); const m=p.loans.find(l=>/mezz/i.test(l.propertyName||'')||l.lienPosition==='Mezzanine'); return m.propertyName; },st.key);
  const before=await page.evaluate(()=>window.opProperties().length);
  const r=await page.evaluate(async(n)=>await window.LDS_addProperty(n),mz); await page.waitForTimeout(400);
  const mt=await modalText();
  ok(r===null&&/mezz loan of/.test(mt)&&/Add a loan to that property instead/.test(mt),'Add Property "'+mz+'" asks: "'+mt+'"');
  ok(await page.evaluate(()=>window.opProperties().length)===before,'no duplicate property was created');
  await confirmOk(); await page.waitForTimeout(500);
  const f=await page.evaluate(()=>({ form:!document.getElementById('formView').hidden, name:document.getElementById('f_propertyName').value }));
  ok(f.form&&f.name===st.name,'"Add a loan to it" opens the form for '+st.name+' (got "'+f.name+'")');
  await page.click('#cancelBtn'); await page.waitForTimeout(300);

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all property-page e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
