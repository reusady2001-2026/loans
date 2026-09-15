/* e2e for v2.8.5: the "Specific Property" window is property-based. The selector lists
   PROPERTIES (a senior+mezz stack collapses to one entry); selecting a stack opens the
   COMBINED position (Edit/Remove off — its loans are edited from their cards; Refinance on,
   one loan vs the combined payoff); a single-loan property opens as itself, editable.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/refi-property.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-refiprop-'));
const KEY='name:villages of whitewater';
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- the selector lists PROPERTIES, not loans ----
  const meta = await page.evaluate((k)=>{
    const opts=[...document.getElementById('loanSelect').options].map(o=>o.value);
    const props=window.opProperties(), loans=window.LDS_loans();
    const stacked=props.find(p=>p.loans.length>=2);
    const vill=loans.find(l=>window.propertyKey(l)===k);
    return { nOpts:opts.length, nProps:props.length, nLoans:loans.length,
             label:(document.getElementById('loanCountLabel')||{}).textContent||'',
             stackedCombo: stacked?('combo:'+stacked.key):null, stackedName: stacked?stacked.name:null,
             villagesId: vill?vill._id:null, optsHasCombo: stacked?opts.indexOf('combo:'+stacked.key)>=0:false };
  }, KEY);
  ok(meta.nOpts===meta.nProps, 'the selector lists one option per property ('+meta.nOpts+' options = '+meta.nProps+' properties)');
  ok(meta.nProps < meta.nLoans, 'fewer than the loan count ('+meta.nProps+' properties < '+meta.nLoans+' loans — senior+mezz collapsed)');
  ok(/propert/i.test(meta.label), 'the count label reads "properties", not "loans" ("'+meta.label.trim()+'")');
  ok(!!meta.stackedCombo && meta.optsHasCombo, 'a stacked property is one option, valued as its combined position'+(meta.stackedName?(' ('+meta.stackedName+')'):''));

  // ---- selecting a stacked property opens the COMBINED position ----
  await page.evaluate((combo)=>{const s=document.getElementById('loanSelect');s.value=combo;s.dispatchEvent(new Event('change',{bubbles:true}));}, meta.stackedCombo);
  await page.waitForFunction(()=>{const v=document.getElementById('loanView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const c = await page.evaluate(()=>({ text:(document.getElementById('loanView')||{}).innerText||'',
    editOff:document.getElementById('editBtn').disabled, removeOff:document.getElementById('removeBtn').disabled,
    refiOn:!document.getElementById('refiBtn').disabled, selVal:document.getElementById('loanSelect').value }));
  ok(/Combined position/i.test(c.text), 'selecting the stack renders the combined position (whole property)');
  ok(c.editOff && c.removeOff, 'Edit and Remove are off for the synthetic combined position');
  ok(c.refiOn, 'Refinance is on for the property');
  ok(c.selVal===meta.stackedCombo, 'the selector stays on the property');

  // ---- the property refinances as one combined position ----
  await page.click('#refiBtn').catch(()=>{});
  await page.waitForFunction(()=>{const v=document.getElementById('refiView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const rtext = await page.evaluate(()=>(document.getElementById('refiView')||{}).innerText||'');
  ok(/whole property/i.test(rtext), 'the refinance is the whole property (combined), not one slice');

  // ---- a single-loan property opens as itself, editable ----
  ok(!!meta.villagesId, 'Villages of Whitewater (single-loan) is selectable');
  await page.evaluate((lid)=>{const s=document.getElementById('loanSelect');s.value=lid;s.dispatchEvent(new Event('change',{bubbles:true}));}, meta.villagesId);
  await page.waitForFunction(()=>{const v=document.getElementById('loanView');return v&&!v.hidden;},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  const single = await page.evaluate(()=>({ editOn:!document.getElementById('editBtn').disabled, sel:document.getElementById('loanSelect').value }));
  ok(single.editOn, 'a single-loan property is directly editable (Edit on)');
  ok(single.sel===meta.villagesId, 'the selector shows the single-loan property (its loan id)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all property-window e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
