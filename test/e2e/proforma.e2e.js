/* e2e — next stage F1 (a DRAFT): the pro forma in Underwriting, driven through the real screens.
   A made-up T12 (test/fixtures/proforma-t12.js) is dropped on a property; then:
     start a pro forma → the Pro forma column (Safe / Aggressive switch) equals the T12 column, adds up to the dollar
     the "Change this line" panel — every how (new total, take out, spread, new amount for one account, % of revenue,
       per unit), the story and the kind required, Safe / Aggressive / both, edit and remove
     the T3 revenue credit; a line the T12 doesn't have; the reconciliation for both versions (hand arithmetic)
     the property's assumptions.json and history; the two NOIs in General Data → the refinance's NOI choice
     the lender file (three sheets, reserves); the assistant's card (approve → saved, from the assistant)
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r test/e2e/_t12auto.js test/e2e/proforma.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-proforma-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b,t)=>typeof a==='number'&&Math.abs(a-b)<=(t==null?0.01:t);
const GRID=require(path.join(APP,'test','fixtures','proforma-t12.js')).grid();
const T12=path.join(UDATA,'Sample Gardens T12.xlsx');
const T12_NOI=616006.36;

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('dialog',d=>{ if(/^Remove|residential units/.test(d.message())) d.accept(); else d.dismiss(); });   // the units typed go to the profile too
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);
  // the T12 file
  const b64=await page.evaluate((g)=>{ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(g), 'T12'); return XLSX.write(wb,{type:'base64',bookType:'xlsx'}); },GRID);
  fs.writeFileSync(T12,Buffer.from(b64,'base64'));
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:10000}).catch(()=>{});
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(800);
  await page.setInputFiles('#uwFile',T12);
  await page.waitForFunction(()=>!!document.querySelector('input[data-uwline]'),null,{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(1200);
  await page.fill('input[data-uwf="units"]','120'); await page.evaluate(()=>{ const i=document.querySelector('input[data-uwf="units"]'); i.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(1200);

  // ---- before: the start button, no column ----
  let s=await page.evaluate(()=>({ start: !!document.querySelector('[data-pfstart]'), head: !!document.querySelector('[data-pfhead]') }));
  ok(s.start && !s.head, 'before: a "Start a pro forma" button and no Pro forma column');
  await page.click('[data-pfstart]'); await page.waitForTimeout(1200);
  const R=()=>page.evaluate(()=>{ const r=window.LDS_pfLast(); if(!r) return null; const v=(x)=>({ noi:x.noi, ok:x.reconciles, gap:x.gap, steps:x.steps.length, problems:x.problems.map(p=>p.reason), lines:Object.fromEntries(x.lines.map(l=>[l.key,l.value])), groups:x.groups.map(g=>[g.kind,Math.round(g.total*100)/100]) });
    return { base:v(r.res.base), aggr:v(r.res.aggressive), t12:r.res.t12 }; });
  let r=await R();
  s=await page.evaluate(()=>({ head: (document.querySelector('[data-pfhead]')||{}).textContent||'', cells: document.querySelectorAll('[data-pfline]').length, recons: document.querySelectorAll('[data-pfrecon]').length, ok: document.querySelectorAll('[data-pfrecon] [data-pfok]').length }));
  ok(/Pro forma/.test(s.head) && /Safe/.test(s.head) && s.cells>=15, 'started: the Pro forma column (Safe) with a clickable figure on every line ('+s.cells+')');
  ok(r && near(r.base.noi,T12_NOI) && near(r.t12.noi,T12_NOI) && r.base.ok && r.aggr.ok, 'it starts as the T12 column: NOI '+(r&&r.base.noi)+' = the T12 NOI, both versions add up');
  ok(s.recons===2 && s.ok===2, 'two reconciliations (Safe, Aggressive), each "reconciles to the dollar"');

  // ---- the panel ----
  const panel=async(o)=>{
    await page.evaluate(()=>{ const m=document.getElementById('pfModal'); if(m&&!m.classList.contains('hidden')) document.querySelector('#pfModal [data-pfclose]').click(); });
    await page.click('[data-pfline="'+o.line+'"]'); await page.waitForTimeout(250);
    await page.click('#pfModal [data-pfhow="'+o.how+'"]'); await page.waitForTimeout(150);
    for(const a of (o.accounts||[])) await page.evaluate((nm)=>{ const row=[...document.querySelectorAll('#pfModal [data-pfacctrow]')].find(r=>r.textContent.indexOf(nm)>=0); const cb=row&&row.querySelector('[data-pfacct]'); if(cb) cb.click(); },a);
    for(const k of ['value','pct','years','perUnit']) if(o[k]!=null) await page.fill('#pfModal [data-pfin="'+k+'"]',String(o[k]));
    if(o.kind) await page.selectOption('#pfModal select[data-pfin="kind"]',o.kind);
    if(o.story!=null) await page.fill('#pfModal textarea[data-pfin="story"]',o.story);
    if(o.column){ await page.click('#pfModal [data-pfcol="'+o.column+'"]'); await page.waitForTimeout(150); }
    await page.waitForTimeout(200);
    return page.evaluate(()=>({ why:(document.querySelector('#pfModal [data-pfwhy]')||{}).textContent||'', ready:!!document.querySelector('#pfModal [data-pfready]'), disabled:(document.querySelector('#pfModal [data-pfsave]')||{}).disabled, preview:(document.getElementById('pfPreview')||{}).innerText||'', closes:(document.querySelector('#pfModal [data-pfcloses]')||{}).textContent||'' }));
  };
  const save=async()=>{ await page.click('#pfModal [data-pfsave]'); await page.waitForTimeout(900); };

  // the story and the kind are required
  let p=await panel({ line:'MKT', how:'total', value:6000, kind:'operating', story:'' });
  ok(p.disabled && /write its reason/.test(p.why), 'no story → can’t save ("'+p.why.trim()+'")');
  p=await panel({ line:'MKT', how:'total', value:6000, story:'Occupancy is at 95%; the listing package is cut to the basic plan.' });
  ok(p.disabled && /kind/.test(p.why), 'no kind → can’t save ("'+p.why.trim()+'")');
  p=await panel({ line:'MKT', how:'total', value:6000, kind:'operating', story:'Occupancy is at 95%; the listing package is cut to the basic plan.' });
  ok(p.ready && !p.disabled && /\+\$3,075\.00/.test(p.preview), 'new total: the preview shows the line and NOI before → after (+$3,075)');
  await save(); r=await R();
  ok(near(r.base.lines.MKT,6000) && near(r.base.noi,T12_NOI+3075) && near(r.aggr.noi,T12_NOI+3075), 'saved: Marketing $6,000 in both versions, NOI +3,075');
  s=await page.evaluate(()=>({ dot: !!document.querySelector('[data-pfchanged="MKT"]'), tip: (document.querySelector('[data-pfline="MKT"]')||{}).title||'' }));
  ok(s.dot && /Operating change/.test(s.tip), 'the changed cell is marked and names its kind on hover ("'+s.tip+'")');

  p=await panel({ line:'GA', how:'takeOut', accounts:['Bank Charges'], kind:'partnership', story:'Bank charges are on the partnership account.' }); await save(); r=await R();
  ok(near(r.base.lines.GA,4210) && near(r.base.noi,T12_NOI+3075+816), 'take out an account: Bank Charges ($816) out of G&A');
  p=await panel({ line:'RM', how:'spread', accounts:['Exterior Painting'], years:5, kind:'spread', story:'Painted every 5 years.' }); await save(); r=await R();
  ok(near(r.base.lines.RM,55030-11520), 'spread over years: Exterior Painting $14,400 at 1/5 → R&M −11,520');
  p=await panel({ line:'CS', how:'accountTotal', accounts:['Snow Removal'], value:9000, kind:'normalized', story:'Snow far above a normal winter.' }); await save();
  p=await panel({ line:'CS', how:'accountTotal', accounts:['Pest Control'], value:3600, kind:'nonRecurring', story:'A one-time treatment in March.' }); await save(); r=await R();
  ok(near(r.base.lines.CS,32500-5000-3800), 'two accounts of one line changed on their own: Snow Removal → 9,000, Pest Control → 3,600 (CS 23,700)');
  // the same account twice in the same version is refused
  p=await panel({ line:'CS', how:'takeOut', accounts:['Pest Control'], kind:'nonRecurring', story:'x' });
  ok(p.disabled && /already changed/.test(p.why), 'the same account twice is refused ("'+p.why.trim().slice(0,70)+'…")');
  // a new total on that line would close its account changes — the panel says so
  p=await panel({ line:'CS', how:'total', value:20000, kind:'normalized', story:'x' });
  ok(/won’t count/.test(p.closes), 'a new total on a line with account changes warns they won’t count ("'+p.closes.slice(0,60)+'…")');
  await page.click('#pfModal [data-pfclose]');
  p=await panel({ line:'BD', how:'pctRevenue', pct:1, kind:'marketNorm', story:'Bad debt at 1% of rent.' }); await save(); r=await R();
  ok(near(r.base.lines.BD,-11775), '% of revenue on a deduction: bad debt = −1% × gross potential rent (1,177,500) = −11,775');
  p=await panel({ line:'PAY', how:'perUnit', perUnit:850, kind:'operating', column:'aggressive', story:'Shared maintenance role from January.' }); await save(); r=await R();
  ok(near(r.base.lines.PAY,113250.6) && near(r.aggr.lines.PAY,102000), 'per unit, Aggressive only: Safe payroll unchanged, Aggressive $850 × 120 = 102,000');

  // ---- revenue credit (T3) ----
  await page.click('[data-pfrevenue]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>({ used:(document.getElementById('pfBody').innerText.match(/Months used: ([^\n]+)/)||[])[1]||'' }));
  ok(/Apr 2026 → Jun 2026/.test(s.used), 'the revenue panel shows the months used ('+s.used+')');
  await page.click('#pfModal [data-pfrevsave]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>!document.getElementById('pfModal').classList.contains('hidden'));
  ok(s, 'a revenue credit without a story is not saved');
  await page.fill('#pfModal [data-pfrevstory]','The last three months show the rent after the spring renewals.');
  await page.click('#pfModal [data-pfrevsave]'); await page.waitForTimeout(900); r=await R();
  ok(near(r.base.lines.GPR,1223200) && near(r.base.lines.VAC,-44800) && near(r.base.lines.BD,-12232), 'T3: rent = last 3 months × 4 (1,223,200), vacancy −44,800; the 1% bad debt follows the new rent (−12,232)');

  // ---- a line the T12 doesn't have (Aggressive) ----
  await page.click('[data-pfadd]'); await page.waitForTimeout(250);
  await page.click('#pfModal [data-pfaddline="ANT"]'); await page.waitForTimeout(250);
  p=await (async()=>{ await page.click('#pfModal [data-pfhow="total"]'); await page.fill('#pfModal [data-pfin="value"]','6000'); await page.selectOption('#pfModal select[data-pfin="kind"]','operating'); await page.fill('#pfModal textarea[data-pfin="story"]','Antenna lease signed.'); await page.click('#pfModal [data-pfcol="aggressive"]'); await page.waitForTimeout(200); })();
  await save(); r=await R();
  ok(r.aggr.lines.ANT===6000 && r.base.lines.ANT===undefined, 'added line: Antenna Income $6,000 in Aggressive only');
  await page.click('[data-pfshow="aggressive"]'); await page.waitForTimeout(600);
  s=await page.evaluate(()=>({ head:(document.querySelector('[data-pfhead]')||{}).textContent||'', added:!!document.querySelector('[data-pfadded="ANT"]') }));
  ok(/Aggressive/.test(s.head) && s.added, 'the switch shows Aggressive, with the added line as its own row');
  await page.click('[data-pfshow="base"]'); await page.waitForTimeout(600);

  // ---- the reconciliation, by hand ----
  const SAFE=T12_NOI+72440+816+3800+11520+5000+3075-7672, AGGR=SAFE+11250.6+6000;
  ok(near(r.base.noi,SAFE) && r.base.ok, 'Safe NOI = T12 616,006.36 + revenue 72,440 + 816 + 3,800 + 11,520 + 5,000 + 3,075 − 7,672 = '+SAFE.toFixed(2)+' (got '+r.base.noi+'), reconciles');
  ok(near(r.aggr.noi,AGGR) && r.aggr.ok, 'Aggressive NOI = Safe + 11,250.60 + 6,000 = '+AGGR.toFixed(2)+' (got '+r.aggr.noi+')');
  ok(JSON.stringify(r.base.groups.map(g=>g[0]))===JSON.stringify(['revenue','partnership','nonRecurring','spread','normalized','operating','marketNorm']), 'grouped by kind in the plan’s order');

  // ---- edit, remove ----
  await page.click('[data-pfline="MKT"]'); await page.waitForTimeout(250);
  const mid=await page.evaluate(()=>document.querySelector('#pfModal [data-pfedit]').getAttribute('data-pfedit'));
  await page.click('#pfModal [data-pfedit="'+mid+'"]'); await page.waitForTimeout(250);
  await page.fill('#pfModal [data-pfin="value"]','7000'); await page.waitForTimeout(150); await save(); r=await R();
  ok(near(r.base.lines.MKT,7000) && near(r.base.noi,SAFE-1000) && r.base.steps===7, 'edit: Marketing → $7,000, still one change on the line');
  await page.click('[data-pfline="MKT"]'); await page.waitForTimeout(250);
  await page.click('#pfModal [data-pfremove]'); await page.waitForTimeout(900); r=await R();
  ok(near(r.base.lines.MKT,9075) && near(r.base.noi,SAFE-3075), 'remove: Marketing back to the T12');

  // ---- saved, with history ----
  await page.waitForTimeout(2500);
  const key=await page.evaluate(()=>window.opProperties().find(p=>/villages of whitewater/i.test(p.name)).key);
  const disk=await page.evaluate(async(k)=>{ const l=await ldsShell.docList(k); const f=(l.files||[]).filter(x=>x.role==='assumptions').sort((a,b)=>b.savedAt-a.savedAt)[0]; const rd=await ldsShell.docRead(k,f.id);
    const j=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rd.base64),c=>c.charCodeAt(0)))); const h=(l.files||[]).filter(x=>x.role==='history').sort((a,b)=>b.savedAt-a.savedAt)[0]; let hist=null;
    if(h){ const hr=await ldsShell.docRead(k,h.id); hist=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(hr.base64),c=>c.charCodeAt(0)))); }
    return { pf:j.proForma, hist: hist ? hist.entries.filter(e=>/^proForma/.test(e.field||'')).map(e=>({label:e.label,note:e.note,old:e.old,new:e.new})) : [] }; },key);
  ok(disk.pf && disk.pf.started && disk.pf.changes.length===7 && disk.pf.changes.every(c=>c.id&&c.story&&c.kind&&c.by&&c.at) && disk.pf.revenue.base.months===3, 'assumptions.json → proForma: 7 changes, each with an id, kind, story, who and when; the T3 revenue credit');
  ok(disk.hist.some(e=>/Marketing/.test(e.label)&&/edited/.test(e.note||'')) && disk.hist.some(e=>/Marketing/.test(e.label)&&e.new==='removed') && disk.hist.some(e=>/Revenue credit/.test(e.label)&&/spring renewals/.test(e.note||'')),
     'history.json: each change with its story (an edit, a removal, the revenue credit) — '+disk.hist.length+' entries');
  // read back after re-focusing the property
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(500);
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(2500);
  r=await R();
  ok(r && near(r.base.noi,SAFE-3075) && near(r.aggr.noi,AGGR-3075), 'the pro forma is read back from the property’s folder after re-focusing it'+(r?' ('+r.base.noi+' / '+r.aggr.noi+' '+JSON.stringify(r.aggr.problems)+')':' (none)'));

  // ---- General Data → the refinance's NOI choice ----
  await page.waitForTimeout(1000);
  const ref=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>/villages of whitewater/i.test(x.propertyName||'')); return l?{ id:l._id, o:window.LDS_refiNOIOptions(l) }:null; });
  ok(ref && near(ref.o.proForma,SAFE-3075) && near(ref.o.aggressive,AGGR-3075), 'the refinance can use the pro forma: Safe '+(ref&&ref.o.proForma)+' · Aggressive '+(ref&&ref.o.aggressive));
  if(ref){
    await page.click('[data-tabsel="home"]').catch(()=>{}); await page.waitForTimeout(400);
    await page.evaluate((id)=>{ const tr=document.querySelector('tr[data-goto="'+id+'"]'); if(tr) tr.click(); },ref.id);
    await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:10000}).catch(()=>{});
    await page.click('#refiBtn').catch(()=>{});
    await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-noibasis]').length>0,null,{timeout:10000}).catch(()=>{});
    s=await page.evaluate(()=>[...document.querySelectorAll('#refiView [data-noibasis]')].map(b=>b.getAttribute('data-noibasis')));
    ok(s.indexOf('proforma')>=0 && s.indexOf('aggressive')>=0, 'the NOI choice gains "Pro forma · Safe" and "Pro forma · Aggressive" ('+s.join(', ')+')');
    await page.click('#refiView [data-noibasis="proforma"]'); await page.waitForTimeout(800);
    s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const t=(document.querySelector('#refiView [data-refibasis]')||{}).innerText||''; return { b:window.LDS_refiBasis(l), noi:window.LDS_refiNOI(l), txt:t }; },ref.id);
    ok(s.b==='proforma' && near(s.noi,SAFE-3075,1) && /pro forma · Safe \(6 changes/.test(s.txt), 'picked: the refinance sizes on the Safe pro forma NOI and says so ("pro forma · Safe (6 changes; last by …)")'+(s.b==='proforma'?'':' basis '+s.b)+' '+s.noi+' '+s.txt.slice(0,160).replace(/\n/g,' '));
  }

  // ---- the lender file ----
  await page.click('[data-tabsel]:not([data-tabsel="home"])').catch(()=>{}); await page.waitForTimeout(800);
  const bk=await page.evaluate(()=>{ const b=window.LDS_pfLenderBook(true); if(!b) return null; const sh=(n)=>XLSX.utils.sheet_to_json(b.wb.Sheets[n],{header:1,raw:true});
    return { file:b.file, names:b.wb.SheetNames, pf:sh('Pro forma'), rec:sh('Reconciliation'), mo:sh('Monthly') }; });
  ok(bk && JSON.stringify(bk.names)==='["Pro forma","Reconciliation","Monthly"]' && /Pro forma — \d{4}-\d{2}-\d{2}\.xlsx$/.test(bk.file), 'the lender file: three sheets, named "<property> — Pro forma — <date>.xlsx"');
  if(bk){
    const noiRow=bk.pf.find(x=>x[0]==='Net Operating Income'), rsv=bk.pf.find(x=>/^Replacement reserves/.test(x[0]||'')), after=bk.pf.find(x=>x[0]==='NOI after reserves'), ga=bk.pf.find(x=>x[0]==='General & Admin');
    ok(noiRow && near(noiRow[1],T12_NOI) && near(noiRow[3],SAFE-3075) && near(noiRow[5],AGGR-3075), 'Pro forma sheet: NOI row T12 · Safe · Aggressive '+JSON.stringify(noiRow));
    ok(rsv && near(rsv[3],24000) && after && near(after[3],SAFE-3075-24000), 'reserves on both sides (120 units × $200 = 24,000) and the NOI after reserves '+JSON.stringify(rsv));
    ok(ga && /Bank Charges/.test(ga[7]) && /Partnership/.test(ga[8]) && /partnership account/.test(ga[9]), 'a changed line carries what changed, its kind and its story');
    ok(bk.rec.some(x=>x[0]==='Reconciles to the dollar') && bk.mo[1].filter(x=>x==='yes').length===3, 'Reconciliation sheet adds up; Monthly marks the 3 months used for the revenue credit');
  }

  // ---- the assistant: a change behind an Approve card ----
  const run=(o)=>page.evaluate((o)=>{ const r=window.LDS_asstAction(o); window.__r=r; return Promise.resolve(r).then(x=>{ window.__r=x; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop();
    return { ok:x&&x.ok, msg:x&&x.msg, card:!!(x&&x.pending), text:(x&&x.pending&&c)?c.textContent:'' }; }); },o);
  let a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Swimming pool',how:'total',value:1,kind:'operating',story:'x'}});
  ok(!a.card && /There is no line/.test(a.msg||''), 'assistant: an unknown line is refused with the list of lines');
  a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Utilities',how:'accountTotal',accounts:['Electric'],value:27000,kind:'operating',story:''}});
  ok(!a.card && /reason/.test(a.msg||''), 'assistant: no story → refused ("'+(a.msg||'')+'")');
  a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Utilities',how:'accountTotal',accounts:['Electric'],value:27000,kind:'operating',story:'LED lighting finished in June.',column:'aggressive'}});
  ok(a.card && /Utilities/.test(a.text) && /Pro forma NOI/.test(a.text) && /LED lighting/.test(a.text), 'assistant: a card with the line and the NOI before → after, the kind and the story');
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop(); if(b) b.click(); }); await page.waitForTimeout(2500);
  const pend=await page.evaluate(()=>window.__r&&window.__r.pending?window.__r.pending:null);
  const res=await Promise.resolve(pend);
  const saved=await page.evaluate(async(k)=>{ const l=await ldsShell.docList(k); const f=(l.files||[]).filter(x=>x.role==='assumptions').sort((a,b)=>b.savedAt-a.savedAt)[0]; const rd=await ldsShell.docRead(k,f.id);
    const j=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rd.base64),c=>c.charCodeAt(0)))); return (j.proForma.changes||[]).filter(c=>c.from==='assistant'); },key);
  ok(saved.length===1 && saved[0].line==='UTIL' && saved[0].column==='aggressive' && /Assistant/i.test(saved[0].by||''), 'approved: saved in the pro forma, marked as from the assistant ('+(saved[0]&&saved[0].by)+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all proforma e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
