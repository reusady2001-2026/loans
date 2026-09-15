/* e2e for v2.7.4 — the underwriting property selector lists PROPERTIES, not loans. Every loan against a
   property (senior AND mezzanine) groups into one entry, keyed and named by the senior — even though the
   mezz carries a different name string ("Avalon WP (Mezz)" vs "Avalon White Plains"). Regression guard for
   the name-first keying that used to split the two mezz loans off as their own rows.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/property-grouping.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-group-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(500);

  // ---- The Portfolio view (default) — coverage/DSCR, debt yield and refinance opportunities are all PER
  //      PROPERTY: a senior and its mezzanine are ONE combined row, never two. --------------------------
  const PV=await page.evaluate(()=>{
    // First-column text of the visible rows of the table inside the card whose <h3> matches titleRe.
    const firstCol=(titleRe)=>{
      const h=[...document.querySelectorAll('#portfolioView h3')].find(x=>titleRe.test(x.textContent||''));
      if(!h) return null;
      let card=h; while(card && !card.querySelector('table')) card=card.parentElement;
      if(!card) return null;
      return [...card.querySelector('table').querySelectorAll('tbody tr')].filter(tr=>!tr.hasAttribute('hidden'))
        .map(tr=>{const td=tr.querySelector('td'); return td?(td.textContent||'').replace(/\s+/g,' ').trim():'';});
    };
    const props=window.opProperties?window.opProperties().length:null;
    return { coverage:firstCol(/Coverage/i), refi:firstCol(/Refinance Opportunities/i), nProps:props };
  });

  const hasCombined=(rows)=> rows && rows.some(t=>/Avalon White Plains/i.test(t)&&/2 loans/i.test(t));
  const hasMezzRow=(rows)=> rows && rows.some(t=>/\(Mezz\)/i.test(t) || /^Avalon WP\b/i.test(t) || /K2 Sweetwater \(Mezz\)/i.test(t));
  ok(PV.coverage&&PV.coverage.length>0,'the coverage (DSCR/debt yield) table rendered ('+(PV.coverage&&PV.coverage.length)+' rows)');
  ok(hasCombined(PV.coverage),'coverage: Avalon is ONE combined row ("Avalon White Plains … 2 loans")');
  ok(!hasMezzRow(PV.coverage),'coverage: NO mezzanine is its own row (senior + mezz are combined)');
  ok(PV.coverage&&PV.nProps!=null&&PV.coverage.length===PV.nProps,'coverage has exactly one row PER PROPERTY ('+(PV.coverage&&PV.coverage.length)+' rows = '+PV.nProps+' properties), not per loan');
  ok(hasCombined(PV.refi),'refinance opportunities: Avalon is ONE combined opportunity ("Avalon White Plains … 2 loans")');
  ok(!hasMezzRow(PV.refi),'refinance opportunities: NO mezzanine is its own row');
  ok(PV.refi&&PV.nProps!=null&&PV.refi.length===PV.nProps,'refinance opportunities has one row PER PROPERTY ('+(PV.refi&&PV.refi.length)+' = '+PV.nProps+'), not per loan');

  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);

  const R=await page.evaluate(()=>{
    const s=document.getElementById('opPropPick');
    const opts=[...s.options].filter(o=>o.value).map(o=>({value:o.value,text:(o.textContent||'').trim()}));
    // The engine's own view of a property (all loans against it) for Avalon.
    const props=window.opProperties?window.opProperties():null;
    return { opts, texts: opts.map(o=>o.text), props: props?props.map(p=>({key:p.key,name:p.name,loans:p.loans.length})):null };
  });

  const texts=R.texts;
  ok(texts.length>0,'the selector has property options ('+texts.length+')');
  // The two mezzanine loans must NOT appear as their own rows.
  ok(!texts.some(t=>/Avalon WP\b/i.test(t)&&!/White Plains/i.test(t)),'the mezzanine "Avalon WP (Mezz)" is NOT a separate selector row');
  ok(!texts.some(t=>/K2 Sweetwater \(Mezz\)/i.test(t)),'the mezzanine "K2 Sweetwater (Mezz)" is NOT a separate selector row');
  ok(!texts.some(t=>/\(Mezz\)/i.test(t)),'NO selector row is a mezzanine loan — the list is properties, not loans');
  // The seniors appear once, and carry both their loans.
  const avalon=texts.find(t=>/Avalon White Plains/i.test(t));
  const k2=texts.find(t=>/K2 Sweetwater \(FIU Residences\)/i.test(t));
  ok(!!avalon,'"Avalon White Plains" is listed by its property name');
  ok(/\(2 loans\)/.test(avalon||''),'Avalon shows it carries 2 loans (senior + mezzanine grouped): "'+avalon+'"');
  ok(!!k2&&/\(2 loans\)/.test(k2),'"K2 Sweetwater (FIU Residences)" is listed once and carries its 2 loans: "'+k2+'"');
  // Cross-check via the engine: the Avalon property groups both loans under the senior's key.
  const avProp=R.props&&R.props.find(p=>/Avalon White Plains/i.test(p.name));
  ok(avProp&&avProp.loans===2&&/^name:avalon white plains/.test(avProp.key),'the engine keys Avalon under the senior ('+(avProp&&avProp.key)+') with 2 loans');
  ok(R.props&&!R.props.some(p=>/^name:avalon wp$/.test(p.key)),'there is NO separate "name:avalon wp" property (the old split is gone)');
  // Villages of Whitewater — a single-loan property — keeps its exact key (no uploaded T12 is orphaned).
  ok(R.props&&R.props.some(p=>p.key==='name:villages of whitewater'),'a single-loan property keeps its existing key (name:villages of whitewater) — no T12 folder is orphaned');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all property-grouping checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
