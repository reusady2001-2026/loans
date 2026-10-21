/* e2e — next stage F1 (a DRAFT): the pro forma in Underwriting, driven through the real screens.
   Round 1 (the operator, 2026-10-19): a change is made to ONE ACCOUNT, each with its own story; the panel is about 80%
   of the window and shows every account of the line (a $0 one too) with its 12 months; click an account and its choices
   open under it; the management fee is never moved by the revenue credit; the underwriting assumptions give default
   stories (suggestions); Claude's stories can be put in the draft.
   Round 2 (the operator, 2026-10-21): the UNDERWRITING is the approved pro forma. The draft starts by itself on the T12
   (no start button, no Underwritten column, no line pins); replacement reserves are a line in both Safe and Aggressive;
   Claude's stories sit under the table; "Approve the underwriting" makes Safe and Aggressive the property's underwriting
   (General Data, the refinance's Safe / Aggressive bases); a change after that reads "changed since approved";
   "Start over" clears the draft and keeps the approval.
   A made-up T12 (test/fixtures/proforma-t12.js) is dropped on a property; Claude is the scripted stand-in
   (test/fixtures/fake-claude-push.js). Every expected figure is worked out by hand in the comments.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r ./test/e2e/_t12auto.js test/e2e/proforma.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-proforma-'));
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js'), STORIES_IN=path.join(UDATA,'stories-input.json');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const near=(a,b,t)=>typeof a==='number'&&Math.abs(a-b)<=(t==null?0.01:t);
const GRID=require(path.join(APP,'test','fixtures','proforma-t12.js')).grid();
const T12=path.join(UDATA,'Sample Gardens T12.xlsx');
const T12_NOI=616006.36, T12_EGI=1155640;

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,CLAUDE_CONFIG_DIR:path.join(UDATA,'claude'),LDS_FAKE_STORIES_INPUT:STORIES_IN})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('dialog',d=>{ if(/^Remove|residential units|^Start this property/.test(d.message())) d.accept(); else d.dismiss(); });   // the units typed go to the profile too; "Start over" asks first
  await page.route(/^https?:\/\//,r=>r.abort());
  try{ const win=await app.browserWindow(page); await win.evaluate(w=>{w.setSize(1600,1000);}); }catch(e){}
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);
  // the T12 file
  const b64=await page.evaluate((g)=>{ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(g), 'T12'); return XLSX.write(wb,{type:'base64',bookType:'xlsx'}); },GRID);
  fs.writeFileSync(T12,Buffer.from(b64,'base64'));
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:10000}).catch(()=>{});
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(800);
  await page.setInputFiles('#uwFile',T12);
  await page.waitForFunction(()=>!!document.querySelector('[data-pfline]')&&!!document.querySelector('[data-pfbar]'),null,{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.fill('input[data-uwf="units"]','120'); await page.evaluate(()=>{ const i=document.querySelector('input[data-uwf="units"]'); i.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(1500);
  const num=(t)=>Number(String(t||'').replace(/[^0-9.\-]/g,''))||0;

  // ---- the draft starts by itself on the T12: no start button, no Underwritten column, no line pins ----
  const R=()=>page.evaluate(()=>{ const r=window.LDS_pfLast(); if(!r) return null; const v=(x)=>({ noi:x.noi, ok:x.reconciles, gap:x.gap, steps:x.steps.length, problems:x.problems.map(p=>p.reason), lines:Object.fromEntries(x.lines.map(l=>[l.key,l.value])),
      accts:Object.fromEntries(x.accounts.map(a=>[a.name,a.value])), groups:x.groups.map(g=>[g.kind,Math.round(g.total*100)/100]) });
    return { base:v(r.res.base), aggr:v(r.res.aggressive), t12:r.res.t12 }; });
  let r=await R();
  const uwState=()=>page.evaluate(()=>({ chip:(document.querySelector('[data-uwstatus]')||{getAttribute:()=>null}).getAttribute('data-uwstatus'), line:(document.querySelector('[data-uwapproved]')||{}).textContent||'',
    approve:((document.querySelector('[data-uwapprove]')||{}).textContent||'').trim(), safe:(document.getElementById('uwSafeNoi')||{}).textContent||'', aggr:(document.getElementById('uwAggrNoi')||{}).textContent||'' }));
  let s=await page.evaluate(()=>({ start: !!document.querySelector('[data-pfstart]'), pins: document.querySelectorAll('input[data-uwline]').length, head: (document.querySelector('[data-pfhead]')||{}).textContent||'',
    ths:[...document.querySelectorAll('#uwSetupTable thead th')].map(t=>t.textContent.trim()), cells: document.querySelectorAll('[data-pfline]').length, recons: document.querySelectorAll('[data-pfrecon]').length, ok: document.querySelectorAll('[data-pfrecon] [data-pfok]').length,
    bar:((document.querySelector('[data-pfbar]')||{}).innerText||'') }));
  ok(!s.start && s.pins===0, 'no "Start a pro forma" button and no line pins — the draft starts by itself on the T12');
  ok(s.ths.length===5 && /^In-Place/.test(s.ths[1]) && /Underwriting · Safe/.test(s.head) && !s.ths.some(t=>/^Underwritten/.test(t)) && s.cells>=15,
     'the table: Line · In-Place · $/unit · Underwriting · Safe · $/unit — no Underwritten column; a clickable figure on every line ('+s.ths.join(' | ')+'; '+s.cells+')');
  ok(/UNDERWRITING/i.test(s.bar) && /Start over/.test(s.bar), 'the bar is the UNDERWRITING, with "Start over"');
  ok(r && near(r.base.noi,T12_NOI) && near(r.t12.noi,T12_NOI) && r.base.ok && r.aggr.ok, 'it starts as the T12: NOI '+(r&&r.base.noi)+' = the T12 NOI, both versions add up');
  ok(s.recons===2 && s.ok===2, 'two reconciliations (Safe, Aggressive), each "reconciles to the dollar"');
  // reserves are a line in both versions: 120 units × $200 = 24,000
  s=await page.evaluate(()=>({ rsv:[...document.querySelectorAll('[data-pfrecon] [data-pfreserves]')].map(x=>x.innerText.replace(/\s+/g,' ')), base:(document.querySelector('[data-pfuwnoi="base"]')||{}).textContent||'', aggr:(document.querySelector('[data-pfuwnoi="aggressive"]')||{}).textContent||'',
    before:/= NOI before reserves/.test((document.querySelector('[data-pfrecon="base"]')||{}).innerText||'') }));
  ok(s.rsv.length===2 && s.rsv.every(x=>/24,000/.test(x)) && s.before && near(num(s.base),T12_NOI-24000) && near(num(s.aggr),T12_NOI-24000),
     'replacement reserves are a line in both: NOI before reserves − 24,000 (120 × $200) = Safe / Aggressive underwriting NOI '+s.base+' / '+s.aggr);
  let u=await uwState();
  ok(u.chip==='draft' && /Approve the underwriting/.test(u.approve) && /Not approved yet/.test(u.line), 'not approved yet: the chip reads "draft", with "Approve the underwriting"');
  ok(near(num(u.safe),T12_NOI-24000) && near(num(u.aggr),T12_NOI-24000), 'the Safe and Aggressive cards show the underwriting NOI after reserves ('+u.safe+' · '+u.aggr+')');
  s=await page.evaluate(()=>[...document.querySelectorAll('#uwSizingOut [data-uwsizing]')].map(x=>x.getAttribute('data-uwsizing')));
  ok(JSON.stringify(s)==='["base","aggressive"]', 'debt sizing shows Safe and Aggressive side by side');
  let gd0=await page.evaluate(()=>{ const g=(window.LDS_gdNOICache()||{})['name:villages of whitewater']; return g?{ip:g.inPlace,uw:g.underwritten}:null; });
  ok(gd0 && near(gd0.ip,T12_NOI) && gd0.uw==null, 'General Data: the in-place NOI, and no underwriting NOI until it is approved');

  // ---- suggestions from the underwriting assumptions (2.5% management fee, 5% vacancy) ----
  // management fee: 34,669.20 / EGI 1,155,640 = 3.0% > 2.5%; vacancy: 64,300 / 1,177,500 = 5.46% > 5%
  let sug=await page.evaluate(()=>(window.LDS_pfSuggestions()||[]).map(x=>({ id:x.id, src:x.source, line:x.line, open:x.open, pct:x.change.pct, how:x.change.how, kind:x.change.kind, story:x.change.story })));
  const sM=sug.find(x=>x.line==='MGMT'), sV=sug.find(x=>x.line==='VAC');
  ok(sM && sM.src==='assumption' && sM.how==='pctRevenue' && near(sM.pct,0.025,1e-9) && sM.kind==='marketNorm' && /2\.5% of revenue, our underwriting assumption; the T12 ran 3%/.test(sM.story),
     'the management fee runs 3% against the 2.5% assumption → a suggestion at 2.5% with its default story ("'+(sM&&sM.story)+'")');
  ok(sV && near(sV.pct,0.05,1e-9) && /5% of gross potential rent/.test(sV.story), 'vacancy runs 5.46% against 5% → a suggestion at 5% ("'+(sV&&sV.story)+'")');
  s=await page.evaluate(()=>({ dots:[...document.querySelectorAll('[data-pfsugdot]')].map(x=>x.getAttribute('data-pfsugdot')).sort(), chip:(document.querySelector('[data-pfsuglist]')||{}).textContent||'' }));
  ok(JSON.stringify(s.dots)==='["MGMT","VAC"]' && /2 suggestions/.test(s.chip), 'the Underwriting column marks the two lines with a suggestion; the bar says "2 suggestions"');
  ok(await page.evaluate(()=>!document.querySelector('[data-pfassumewarn]')), 'both lines run ABOVE their assumptions → suggestions that raise the NOI; no warning');

  // ---- Claude's stories for the underwriting: under the table, while drafting ----
  s=await page.evaluate(()=>{ const m=document.getElementById('opStoriesMount'), out=document.getElementById('uwSetupOut'), push=document.getElementById('opScanMount');
    return { inUw: !!(m&&out&&out.contains(m)), inPush: !!(m&&push&&push.contains(m)), title:/Claude’s stories for the underwriting/i.test((m||{}).innerText||'') }; });
  ok(s.inUw && !s.inPush && s.title, 'Claude’s stories sit under the underwriting table ("Claude’s stories for the underwriting"), not in What to push');
  await page.click('#pfStoriesRun'); await page.waitForTimeout(4000);
  s=await page.evaluate(()=>({ txt:(document.getElementById('opStoriesMount')||{}).innerText||'', cards:[...document.querySelectorAll('#opStoriesMount [data-pfstory]')].map(x=>x.getAttribute('data-pfstory')), left:(document.querySelector('#opStoriesMount [data-pfstoriesleft]')||{}).textContent||'' }));
  ok(s.cards.length===2 && /FAKE-STORIES-SUMMARY/.test(s.txt) && /To back it with the lender: FAKE-BACKED the snow-removal invoices/.test(s.txt) && /How Claude got the number: FAKE-BASIS/.test(s.txt),
     'Claude’s stories: 2 cards, each with its story, how Claude got the number and what backs it ('+s.cards.join(', ')+')');
  ok(/FAKE-NOT-IN-THE-T12/.test(s.left) && /no account/.test(s.left), 'a suggestion on an account that is not in the T12 is left out, and says so');
  ok(/\+\$5,000\.00/.test(s.txt) && /Put it in the draft/.test(s.txt), 'the snow card shows what it does to the Safe NOI (+$5,000: 14,000 → 9,000), with "Put it in the draft"');
  const sin=JSON.parse(fs.readFileSync(STORIES_IN,'utf8'));
  const csIn=sin.lines.find(l=>l.line==='Contract Services'), pool=csIn&&csIn.accounts.find(a=>a.account==='Pool Service'), snowIn=csIn&&csIn.accounts.find(a=>a.account==='Snow Removal');
  ok(sin.months.length===12 && snowIn && snowIn.months.join(',')==='0,0,0,0,1400,4200,4800,3600,0,0,0,0' && pool && pool.t12===0 && near(sin.underwritingAssumptions.managementFee,0.025),
     'Claude gets every account with its 12 months (snow by month; the $0 pool service too) and the assumptions');
  // put the snow story in the draft: the panel opens on Contract Services with Snow Removal filled in
  await page.click('[data-pfputsug^="claude:CS|snow removal"]'); await page.waitForTimeout(500);
  s=await page.evaluate(()=>({ title:document.getElementById('pfTitle').textContent, open:(document.querySelector('#pfModal tr.bg-teal-50[data-pfacct]')||{}).textContent||'', v:(document.querySelector('#pfModal [data-pfin="value"]')||{}).value,
    kind:(document.querySelector('#pfModal select[data-pfin="kind"]')||{}).value, story:(document.querySelector('#pfModal textarea[data-pfin="story"]')||{}).value, ready:!!document.querySelector('#pfModal [data-pfready]') }));
  ok(s.title==='Contract Services' && /Snow Removal/.test(s.open) && s.v==='9000' && s.kind==='normalized' && /FAKE-STORY/.test(s.story) && s.ready, '"Put it in the draft" opens Snow Removal with the amount, kind and story filled in, ready to check and save');
  await page.click('#pfModal [data-pfsave]'); await page.waitForTimeout(1200); r=await R();
  ok(near(r.base.accts['Snow Removal'],9000) && near(r.base.lines.CS,27500) && near(r.base.noi,T12_NOI+5000), 'saved: Snow Removal 14,000 → 9,000; Contract Services 32,500 → 27,500; NOI +5,000');

  // ---- the panel: 80% of the window, every account with 12 months ----
  s=await page.evaluate(()=>{ const b=document.getElementById('pfBox').getBoundingClientRect(), rows=[...document.querySelectorAll('#pfModal [data-pfacct]')];
    const pool=rows.find(x=>/Pool Service/.test(x.textContent)); return { w:b.width/innerWidth, h:b.height/innerHeight, n:rows.length, names:rows.map(x=>x.querySelector('td').innerText.split('\n')[0]),
      poolCells: pool ? [...pool.querySelectorAll('td')].length : 0, poolTxt: pool ? pool.innerText.replace(/\s+/g,' ') : '', months:[...document.querySelectorAll('#pfModal [data-pfacctwrap] thead th')].length,
      open: !document.getElementById('pfModal').classList.contains('hidden'), tag:(rows.find(x=>/Snow Removal/.test(x.textContent))||{}).innerText||'' }; });
  ok(s.open && s.w>0.78 && s.w<0.82 && s.h>0.8 && s.h<0.9, 'the panel stays open after the save and is about 80% of the window ('+Math.round(s.w*100)+'% × '+Math.round(s.h*100)+'%)');
  ok(s.n===4 && JSON.stringify(s.names)==='["Landscaping","Snow Removal","Pest Control","Pool Service"]' && s.months===17, 'every account of the line is listed (4, the $0 one too), with 12 month columns + T12, Safe, Aggressive ('+s.names.join(', ')+')');
  ok(s.poolCells===17 && /Pool Service.* 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0/.test(s.poolTxt), 'the pool service at $0 all year is shown with its 12 zeros — nothing hidden');
  ok(/9,000/.test(s.tag) && /Both · Normalized/.test(s.tag), 'the changed account shows its pro forma figure and its tag (Both · Normalized)');

  // ---- a change, account by account ----
  const pick=async(line, acct)=>{
    const opened=await page.evaluate((l)=>{ const m=document.getElementById('pfModal'); return m && !m.classList.contains('hidden') && document.getElementById('pfBox').getAttribute('data-pfopenline')===l; },line);
    if(!opened){ await page.evaluate(()=>{ const m=document.getElementById('pfModal'); if(m&&!m.classList.contains('hidden')) document.querySelector('#pfModal [data-pfclose]').click(); });
      await page.click('[data-pfline="'+line+'"]'); await page.waitForTimeout(300); }
    if(acct==='new'){ await page.click('#pfModal [data-pfnewacct]'); await page.waitForTimeout(250); return; }
    await page.evaluate((nm)=>{ const row=[...document.querySelectorAll('#pfModal [data-pfacct]')].find(x=>x.querySelector('td').innerText.split('\n')[0]===nm); row.click(); },acct); await page.waitForTimeout(250);
  };
  const fill=async(o)=>{
    if(o.how){ await page.click('#pfModal [data-pfhow="'+o.how+'"]'); await page.waitForTimeout(150); }
    for(const k of ['newName','value','pct','years','perUnit']) if(o[k]!=null) await page.fill('#pfModal [data-pfin="'+k+'"]',String(o[k]));
    if(o.kind) await page.selectOption('#pfModal select[data-pfin="kind"]',o.kind);
    if(o.story!=null) await page.fill('#pfModal textarea[data-pfin="story"]',o.story);
    if(o.column){ await page.click('#pfModal [data-pfcol="'+o.column+'"]'); await page.waitForTimeout(150); }
    await page.waitForTimeout(200);
    return page.evaluate(()=>({ why:(document.querySelector('#pfModal [data-pfwhy]')||{}).textContent||'', ready:!!document.querySelector('#pfModal [data-pfready]'), disabled:(document.querySelector('#pfModal [data-pfsave]')||{}).disabled, preview:(document.getElementById('pfPreview')||{}).innerText||'' }));
  };
  const save=async()=>{ await page.click('#pfModal [data-pfsave]'); await page.waitForTimeout(1000); };

  // Marketing → its one account, Advertising (756.25 × 12 = 9,075)
  await pick('MKT','Advertising');
  s=await page.evaluate(()=>[...document.querySelectorAll('#pfModal [data-pfhow]')].map(b=>b.textContent));
  ok(JSON.stringify(s)==='["New amount","Spread over years","Annualize","% of revenue","Per unit"]', 'clicking an account opens its choices under it (no “Take it out” — a new amount of $0 does it): '+s.join(' · '));
  let p=await fill({ how:'accountTotal', value:6000, kind:'operating', story:'' });
  ok(p.disabled && /write its reason/.test(p.why), 'no story → can’t save ("'+p.why.trim()+'")');
  await page.selectOption('#pfModal select[data-pfin="kind"]',''); p=await fill({ story:'Occupancy is at 95%; the listing package is cut to the basic plan.' });
  ok(p.disabled && /kind/.test(p.why), 'no kind → can’t save ("'+p.why.trim()+'")');
  p=await fill({ kind:'operating' });
  ok(p.ready && !p.disabled && /\+\$3,075\.00/.test(p.preview) && /T12\s+756\s+756/.test(p.preview) && /After · Safe\s+500\s+500/.test(p.preview),
     'the preview shows the account’s 12 months before → after (756 → 500 a month) and the line and NOI (+$3,075)');
  await save(); r=await R();
  ok(near(r.base.lines.MKT,6000) && near(r.base.noi,T12_NOI+5000+3075) && near(r.aggr.noi,T12_NOI+5000+3075), 'saved: Advertising $6,000 in both versions, NOI +3,075');
  s=await page.evaluate(()=>({ dot: !!document.querySelector('[data-pfchanged="MKT"]'), tip: (document.querySelector('[data-pfline="MKT"]')||{}).title||'' }));
  ok(s.dot && /Operating change/.test(s.tip), 'the changed cell is marked and names its kind on hover');
  // clicking the open account again closes its choices
  await pick('MKT','Advertising'); s=await page.evaluate(()=>!!document.querySelector('#pfModal [data-pfeditor]'));
  await page.evaluate(()=>{ [...document.querySelectorAll('#pfModal [data-pfacct]')].find(x=>/Advertising/.test(x.textContent)).click(); }); await page.waitForTimeout(250);
  ok(s && !(await page.evaluate(()=>!!document.querySelector('#pfModal [data-pfeditor]'))), 'click the account again → its choices close');

  await pick('GA','Bank Charges'); await fill({ how:'accountTotal', value:0, kind:'partnership', story:'Bank charges are on the partnership account.' }); await save(); r=await R();
  ok(near(r.base.lines.GA,4210) && near(r.base.accts['Bank Charges'],0), 'a new amount of $0 takes it out: Bank Charges ($816) out of G&A (5,026 → 4,210)');
  s=await page.evaluate(()=>((document.querySelector('[data-pfrecon="base"]')||{}).innerText||''));
  ok(/Took out “Bank Charges”/.test(s), 'and reads “Took out “Bank Charges”” in how it adds up');
  // annualize one account: Electric (UTIL) — last 3 (Apr–Jun) 2,100 + 2,300 + 2,700 = 7,100 × 4 = 28,400; last 6 = 14,700 × 2 = 29,400; last 12 = 30,300 = the T12
  await pick('UTIL','Electric'); await fill({ how:'annualize' });
  s=await page.evaluate(()=>[...document.querySelectorAll('#pfModal [data-pfmo]')].map(b=>({ n:b.getAttribute('data-pfmo'), t:b.innerText.replace(/\s+/g,' '), off:b.disabled, kind:(document.querySelector('#pfModal select[data-pfin="kind"]')||{}).value })));
  ok(s.length===3 && /\$28,400\.00/.test(s[0].t) && /\$29,400\.00/.test(s[1].t) && /\$30,300\.00 a year · same as the T12/.test(s[2].t) && s[0].kind==='operating',
     'Annualize offers the last 3, 6 or 12 months with what each gives (28,400 · 29,400 · 30,300 = the T12, greyed); an expense defaults to Operating change');
  await page.click('#pfModal [data-pfmo="3"]'); await page.waitForTimeout(200);
  p=await fill({ story:'A new electricity contract since April.' });
  ok(p.ready && /Months used: Apr 2026 → Jun 2026/.test(await page.evaluate(()=>document.getElementById('pfBody').innerText)) && /\+\$1,900\.00/.test(p.preview), 'last 3 months picked: months used Apr → Jun 2026, NOI +1,900');
  await save(); r=await R();
  ok(near(r.base.accts['Electric'],28400) && near(r.base.lines.UTIL,97732.08-1900), 'saved: Electric 30,300 → 28,400; Utilities −1,900');
  await pick('RM','Exterior Painting'); await fill({ how:'spread', years:5, kind:'spread', story:'Painted every 5 years.' }); await save(); r=await R();
  ok(near(r.base.lines.RM,55030-11520) && near(r.base.accts['Exterior Painting'],2880), 'spread over 5 years: Exterior Painting 14,400 → 2,880 a year (R&M −11,520)');
  await pick('CS','Pest Control'); await fill({ how:'accountTotal' });
  s=await page.evaluate(()=>[...document.querySelectorAll('#pfModal select[data-pfsamestory] option')].map(o=>o.textContent).slice(1));
  ok(s.length===5 && s.some(x=>/^Snow Removal: FAKE-STORY/.test(x)) && s.some(x=>/^Bank Charges: Bank charges/.test(x)), '"Same story as…" lists the stories already written, with their account ('+s.length+')');
  await page.selectOption('#pfModal select[data-pfsamestory]','0'); await page.waitForTimeout(250);
  s=await page.evaluate(()=>({ story:document.querySelector('#pfModal textarea[data-pfin="story"]').value, kind:document.querySelector('#pfModal select[data-pfin="kind"]') ? document.querySelector('#pfModal select[data-pfin="kind"]').value : null }));
  ok(/FAKE-STORY Snow/.test(s.story), 'picking one fills the story in (one cause, several accounts)');
  await fill({ value:3600, kind:'nonRecurring', story:'A one-time treatment in March.' }); await save(); r=await R();
  ok(near(r.base.lines.CS,23700) && near(r.base.accts['Pest Control'],3600), 'two accounts of one line, each its own change: Snow 9,000 and Pest Control 3,600 (CS 23,700)');
  await pick('CS','Pest Control'); p=await fill({ how:'accountTotal', value:0, kind:'nonRecurring', story:'x' });
  ok(p.disabled && /already has/.test(p.why), 'the same account twice in the same version is refused ("'+p.why.trim().slice(0,70)+'…")');
  await page.click('#pfModal [data-pfcancel]'); await page.waitForTimeout(200);
  // a rental deduction as a % of revenue: Bad Debt (−380 × 12 = −4,560) → −1% × 1,177,500 = −11,775
  await pick('BD','Bad Debt'); await fill({ how:'pctRevenue', pct:1, kind:'marketNorm', story:'Bad debt at 1% of rent.' }); await save(); r=await R();
  ok(near(r.base.lines.BD,-11775), '% of revenue on a deduction: Bad Debt = −1% × gross potential rent (1,177,500) = −11,775');
  // per unit, Aggressive only: Maintenance Salary 48,250.56 → $300 × 120 = 36,000
  await pick('PAY','Maintenance Salary'); await fill({ how:'perUnit', perUnit:300, kind:'operating', column:'aggressive', story:'A shared maintenance role from January.' }); await save(); r=await R();
  ok(near(r.base.lines.PAY,113250.6) && near(r.aggr.lines.PAY,65000.04+36000), 'per unit, Aggressive only: Safe payroll unchanged; Aggressive Maintenance Salary $300 × 120 = 36,000');

  // ---- revenue credit (T3) — account by account; the management fee does NOT move ----
  await page.click('#pfModal [data-pfclose]'); await page.waitForTimeout(200);
  await page.click('[data-pfrevenue]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>({ used:(document.getElementById('pfBody').innerText.match(/Months used: ([^\n]+)/)||[])[1]||'' }));
  ok(/Apr 2026 → Jun 2026/.test(s.used), 'the revenue panel shows the months used ('+s.used+')');
  await page.click('#pfModal [data-pfrevmo="12"]'); await page.waitForTimeout(250);
  ok(await page.evaluate(()=>!!document.querySelector('#pfModal [data-pfrevsame]')), 'T12 is offered too; on a 12-month file it says it changes nothing');
  await page.click('#pfModal [data-pfrevmo="3"]'); await page.waitForTimeout(250);
  await page.click('#pfModal [data-pfrevsave]'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>!document.getElementById('pfModal').classList.contains('hidden')), 'a revenue credit without a story is not saved');
  await page.fill('#pfModal [data-pfrevstory]','The last three months show the rent after the spring renewals.');
  await page.click('#pfModal [data-pfrevsave]'); await page.waitForTimeout(1000); r=await R();
  ok(near(r.base.lines.GPR,1223200) && near(r.base.lines.VAC,-44800) && near(r.base.lines.BD,-12232), 'T3: rent = last 3 months × 4 (1,223,200), vacancy −44,800; the 1% bad debt follows the new rent (−12,232)');
  ok(near(r.base.lines.MGMT,34669.2) && near(r.aggr.lines.MGMT,34669.2), 'the management fee stays at the T12 (34,669.20) though revenue rose — it moves only if you change its account');

  // ---- use the assumption suggestion on the management fee; set the vacancy one aside ----
  await page.click('[data-pfline="MGMT"]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>({ chip:!!document.querySelector('#pfModal [data-pfsugchip="assume:MGMT"]'), note:/stays at the T12 figure/.test(document.getElementById('pfBody').innerText) }));
  ok(s.chip && s.note, 'the management fee panel says it stays at the T12 unless changed, and its account carries a "Suggested" chip');
  await page.evaluate(()=>{ [...document.querySelectorAll('#pfModal [data-pfacct]')][0].click(); }); await page.waitForTimeout(250);
  s=await page.evaluate(()=>(document.querySelector('#pfModal [data-pfsug="assume:MGMT"]')||{}).innerText||'');
  ok(/From your underwriting assumption/i.test(s) && /Your underwriting assumes a 2\.5% management fee; this T12 runs 3%/.test(s), 'opening the account shows the suggestion and why');
  await page.click('#pfModal [data-pfusesug="assume:MGMT"]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>({ how:(document.querySelector('#pfModal [data-pfhow].bg-teal-600')||{}).getAttribute ? document.querySelector('#pfModal [data-pfhow].bg-teal-600').getAttribute('data-pfhow') : '', pct:document.querySelector('#pfModal [data-pfin="pct"]').value, story:document.querySelector('#pfModal textarea[data-pfin="story"]').value }));
  ok(s.how==='pctRevenue' && s.pct==='2.5' && /our underwriting assumption/.test(s.story), '"Use this" fills in 2.5% of revenue and the default story — you can still change it');
  await save(); r=await R();
  // Safe EGI = 1,155,640 + 72,440 (credit) − 7,672 (bad debt) = 1,220,408 → 2.5% = 30,510.20 ; Aggressive the same (no own income change yet)
  ok(near(r.base.lines.MGMT,30510.2) && near(r.aggr.lines.MGMT,30510.2), 'saved: the management fee account at 2.5% of each version’s revenue (30,510.20) — because you chose it');
  await page.click('#pfModal [data-pfclose]'); await page.waitForTimeout(200);
  await page.click('[data-pfline="VAC"]'); await page.waitForTimeout(300);
  await page.evaluate(()=>{ [...document.querySelectorAll('#pfModal [data-pfacct]')][0].click(); }); await page.waitForTimeout(250);
  await page.click('#pfModal [data-pfskip="assume:VAC"]'); await page.waitForTimeout(900);
  s=await page.evaluate(()=>({ chip:!!document.querySelector('#pfModal [data-pfsugchip="assume:VAC"]'), aside:/You set this one aside/.test(document.getElementById('pfBody').innerText), sugs:(window.LDS_pfSuggestions()||[]).filter(x=>x.open).length }));
  ok(!s.chip && s.aside && s.sugs===0, '"Not this one" sets the vacancy suggestion aside (no chip, no open suggestions left; it can be brought back)');
  await page.click('#pfModal [data-pfclose]'); await page.waitForTimeout(200);

  // ---- an account the T12 doesn't have (Aggressive): Antenna Income, a line the T12 lacks ----
  await page.click('[data-pfadd]'); await page.waitForTimeout(250);
  await page.click('#pfModal [data-pfaddline="ANT"]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>[...document.querySelectorAll('#pfModal [data-pfhow]')].map(b=>b.getAttribute('data-pfhow')));
  ok(JSON.stringify(s)==='["accountTotal","perUnit"]', 'a new account: its amount or per unit (an income line has no % of revenue) — '+s.join(', '));
  p=await fill({ how:'accountTotal', value:6000, kind:'operating', column:'aggressive', story:'Antenna lease signed.' });
  ok(p.disabled && /name the new account/.test(p.why), 'a new account needs its name');
  p=await fill({ newName:'Rooftop antenna lease' }); await save(); r=await R();
  ok(r.aggr.lines.ANT===6000 && r.base.lines.ANT===undefined && near(r.aggr.accts['Rooftop antenna lease'],6000), 'added: “Rooftop antenna lease” $6,000 under Antenna Income, in Aggressive only');
  // Aggressive EGI = 1,220,408 + 6,000 = 1,226,408 → its management fee 2.5% = 30,660.20
  ok(near(r.aggr.lines.MGMT,30660.2), 'the Aggressive management fee (2.5% you chose) follows Aggressive’s own revenue: 30,660.20');
  await page.click('#pfModal [data-pfclose]'); await page.waitForTimeout(200);
  await page.click('[data-pfshow="aggressive"]'); await page.waitForTimeout(600);
  s=await page.evaluate(()=>({ head:(document.querySelector('[data-pfhead]')||{}).textContent||'', added:!!document.querySelector('[data-pfadded="ANT"]') }));
  ok(/Aggressive/.test(s.head) && s.added, 'the switch shows Aggressive, with the added line as its own row');
  await page.click('[data-pfshow="base"]'); await page.waitForTimeout(600);

  // ---- the reconciliation, by hand ----
  const SAFE=T12_NOI+72440+816+1900+3800+5000+11520+3075-7672+(34669.2-30510.2), AGGR=SAFE-(34669.2-30510.2)+(34669.2-30660.2)+(48250.56-36000)+6000;
  ok(near(r.base.noi,SAFE) && r.base.ok, 'Safe NOI = T12 616,006.36 + revenue 72,440 + 816 + 1,900 + 3,800 + 5,000 + 11,520 + 3,075 − 7,672 + 4,159 = '+SAFE.toFixed(2)+' (got '+r.base.noi+'), reconciles');
  ok(near(r.aggr.noi,AGGR) && r.aggr.ok, 'Aggressive NOI = '+AGGR.toFixed(2)+' (got '+r.aggr.noi+'), reconciles');
  ok(JSON.stringify(r.base.groups.map(g=>g[0]))===JSON.stringify(['revenue','partnership','nonRecurring','spread','normalized','operating','marketNorm']), 'grouped by kind in the plan’s order');

  // ---- edit, remove ----
  await pick('MKT','Advertising');
  const mid=await page.evaluate(()=>document.querySelector('#pfModal [data-pfedit]').getAttribute('data-pfedit'));
  await page.click('#pfModal [data-pfedit="'+mid+'"]'); await page.waitForTimeout(250);
  await page.fill('#pfModal [data-pfin="value"]','7000'); await page.waitForTimeout(150); await save(); r=await R();
  ok(near(r.base.lines.MKT,7000) && near(r.base.noi,SAFE-1000), 'edit: Advertising → $7,000, still one change on the account');
  await pick('MKT','Advertising'); await page.click('#pfModal [data-pfremove]'); await page.waitForTimeout(1000); r=await R();
  ok(near(r.base.lines.MKT,9075) && near(r.base.noi,SAFE-3075), 'remove: Advertising back to the T12');
  await page.click('#pfModal [data-pfclose]'); await page.waitForTimeout(200);

  // ---- a whole-line change saved by the first draft is not counted, and can be removed ----
  await page.evaluate(()=>window.LDS_pfAddRaw({ id:'old1', column:'both', line:'INS', how:'total', value:1, kind:'operating', story:'From the first draft.', by:'You', at:new Date().toISOString() })); await page.waitForTimeout(1200); r=await R();
  s=await page.evaluate(()=>({ bar:(document.querySelector('[data-pfproblems]')||{}).textContent||'' }));
  ok(near(r.base.noi,SAFE-3075) && /whole line/.test(s.bar), 'a first-draft whole-line change is listed as not counted ("…changes the whole line…") and changes nothing');
  await page.click('[data-pfline="INS"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>!!document.querySelector('#pfModal [data-pflegacy] [data-pfremove="old1"]')), 'its line panel offers to remove it');
  await page.click('#pfModal [data-pflegacy] [data-pfremove="old1"]'); await page.waitForTimeout(1000);
  ok(await page.evaluate(()=>!document.querySelector('[data-pfproblems]')), 'removed');
  await page.click('#pfModal [data-pfclose]'); await page.waitForTimeout(200);

  // ---- saved, with history ----
  await page.waitForTimeout(2500);
  const key=await page.evaluate(()=>window.opProperties().find(p=>/villages of whitewater/i.test(p.name)).key);
  const disk=await page.evaluate(async(k)=>{ const l=await ldsShell.docList(k); const f=(l.files||[]).filter(x=>x.role==='assumptions').sort((a,b)=>b.savedAt-a.savedAt)[0]; const rd=await ldsShell.docRead(k,f.id);
    const j=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rd.base64),c=>c.charCodeAt(0)))); const h=(l.files||[]).filter(x=>x.role==='history').sort((a,b)=>b.savedAt-a.savedAt)[0]; let hist=null;
    if(h){ const hr=await ldsShell.docRead(k,h.id); hist=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(hr.base64),c=>c.charCodeAt(0)))); }
    return { pf:j.proForma, hist: hist ? hist.entries.filter(e=>/^proForma/.test(e.field||'')).map(e=>({label:e.label,note:e.note,old:e.old,new:e.new})) : [] }; },key);
  ok(disk.pf && disk.pf.started && disk.pf.changes.length===9 && disk.pf.changes.every(c=>c.id&&c.story&&c.kind&&c.by&&c.at&&c.accounts&&c.accounts.length===1) && disk.pf.revenue.base.months===3,
     'assumptions.json → proForma: 9 changes, each on ONE account with a kind, story, who and when; the T3 revenue credit');
  ok(disk.pf.changes.some(c=>c.from==='claude'&&c.accounts[0].name==='Snow Removal') && disk.pf.changes.some(c=>c.from==='assumption'&&c.line==='MGMT') && disk.pf.changes.some(c=>c.newAccount&&c.accounts[0].name==='Rooftop antenna lease') && (disk.pf.skipped||[]).some(x=>x.id==='assume:VAC'),
     'it records where each came from (Claude’s story, your assumption), the new account, and the suggestion set aside');
  ok(disk.hist.some(e=>/Marketing · Advertising/.test(e.label)&&/edited/.test(e.note||'')) && disk.hist.some(e=>/Advertising/.test(e.label)&&e.new==='removed') && disk.hist.some(e=>/Contract Services · Snow Removal/.test(e.label)&&e.old==='$14,000.00'&&e.new==='$9,000.00') && disk.hist.some(e=>/Revenue credit/.test(e.label)&&/spring renewals/.test(e.note||'')),
     'history.json: each change with its account and story (an edit, a removal, Snow 14,000 → 9,000, the revenue credit) — '+disk.hist.length+' entries');
  // read back after re-focusing the property
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(500);
  await page.evaluate(()=>{const s=document.getElementById('opPropPick');s.value='name:villages of whitewater';s.dispatchEvent(new Event('change',{bubbles:true}));}); await page.waitForTimeout(2500);
  r=await R();
  ok(r && near(r.base.noi,SAFE-3075) && near(r.aggr.noi,AGGR-3075), 'the pro forma is read back from the property’s folder after re-focusing it'+(r?' ('+r.base.noi+' / '+r.aggr.noi+')':' (none)'));
  s=await page.evaluate(()=>({ cards:document.querySelectorAll('#opStoriesMount [data-pfstory]').length, taken:/In the pro forma ✓/.test((document.getElementById('opStoriesMount')||{}).innerText||'') }));
  ok(s.cards===2 && s.taken, 'Claude’s stories are kept with the property (general-data.json) and the snow one shows "In the pro forma ✓"');

  // ---- approve: Safe and Aggressive become the property's underwriting (after reserves) ----
  await page.waitForTimeout(1000);
  const ref0=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>/villages of whitewater/i.test(x.propertyName||'')); return l?window.LDS_refiNOIOptions(l):null; });
  ok(ref0 && near(ref0.inPlace,T12_NOI) && ref0.underwritten==null && ref0.aggressive==null, 'before the approval the refinance has only the in-place T12 ('+JSON.stringify(ref0)+')');
  await page.evaluate(()=>{ const b=document.querySelector('[data-uwapprove]'); if(b) b.click(); });
  await page.waitForFunction(()=>{ const g=(window.LDS_gdNOICache()||{})['name:villages of whitewater']; return !!(g&&g.underwritten!=null); },null,{timeout:20000}).catch(()=>{});
  await page.waitForTimeout(1500);
  u=await uwState();
  ok(u.chip==='approved' && /Approved by/.test(u.line) && !u.approve, 'approved: the chip reads "approved", with who and when; no approve button while nothing changed');
  const gdA=await page.evaluate(()=>{ const g=(window.LDS_gdNOICache()||{})['name:villages of whitewater']; return g?{uw:g.underwritten,ag:g.underwrittenAggressive,ap:g.uwApproved,m:g.uwModel}:null; });
  ok(gdA && near(gdA.uw,SAFE-3075-24000) && near(gdA.ag,AGGR-3075-24000) && gdA.ap && gdA.ap.current && gdA.m===2, 'General Data: the underwriting NOI = Safe after reserves '+(gdA&&gdA.uw)+' · Aggressive '+(gdA&&gdA.ag)+', approved');
  const apDisk=await page.evaluate(async(k)=>{ const l=await ldsShell.docList(k); const f=(l.files||[]).filter(x=>x.role==='assumptions').sort((a,b)=>b.savedAt-a.savedAt)[0]; const rd=await ldsShell.docRead(k,f.id);
    const j=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rd.base64),c=>c.charCodeAt(0)))); return j.proForma&&j.proForma.approved; },key);
  ok(apDisk && near(apDisk.base,SAFE-3075-24000) && near(apDisk.aggressive,AGGR-3075-24000) && near(apDisk.reserves,24000) && apDisk.by && apDisk.at && apDisk.snapshot && apDisk.snapshot.changes.length===9,
     'assumptions.json → proForma.approved: Safe, Aggressive, the reserves, who, when, and the changes as approved');

  // ---- the refinance: In-place T12 · Safe underwriting · Aggressive underwriting ----
  const ref=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>/villages of whitewater/i.test(x.propertyName||'')); return l?{ id:l._id, o:window.LDS_refiNOIOptions(l) }:null; });
  ok(ref && near(ref.o.underwritten,SAFE-3075-24000) && near(ref.o.aggressive,AGGR-3075-24000), 'the refinance can use the approved underwriting: Safe '+(ref&&ref.o.underwritten)+' · Aggressive '+(ref&&ref.o.aggressive));
  if(ref){
    await page.click('[data-tabsel="home"]').catch(()=>{}); await page.waitForTimeout(400);
    await page.evaluate((id)=>{ const tr=document.querySelector('tr[data-goto="'+id+'"]'); if(tr) tr.click(); },ref.id);
    await page.waitForFunction(()=>{const b=document.getElementById('refiBtn');return b&&!b.disabled;},null,{timeout:10000}).catch(()=>{});
    await page.click('#refiBtn').catch(()=>{});
    await page.waitForFunction(()=>document.querySelectorAll('#refiView [data-noibasis]').length>0,null,{timeout:10000}).catch(()=>{});
    s=await page.evaluate(()=>[...document.querySelectorAll('#refiView [data-noibasis]')].map(b=>b.getAttribute('data-noibasis')+(b.disabled?':off':'')));
    ok(JSON.stringify(s)==='["inplace","underwritten","aggressive"]', 'the NOI basis: In-place T12 · Safe underwriting · Aggressive underwriting, all open once approved ('+s.join(', ')+')');
    s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const t=(document.querySelector('#refiView [data-refibasis]')||{}).innerText||''; return { b:window.LDS_refiBasis(l), noi:window.LDS_refiNOI(l), txt:t }; },ref.id);
    ok(s.b==='underwritten' && near(s.noi,SAFE-3075-24000,1) && /Safe underwriting \(approved/.test(s.txt), 'it starts on the Safe underwriting and says so ("Safe underwriting (approved …)") — '+s.b+' '+s.noi);
    await page.evaluate(()=>{ const b=document.querySelector('#refiView [data-noibasis="aggressive"]'); if(b) b.click(); }); await page.waitForTimeout(1000);
    s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); const t=(document.querySelector('#refiView [data-refibasis]')||{}).innerText||''; return { b:window.LDS_refiBasis(l), noi:window.LDS_refiNOI(l), txt:t }; },ref.id);
    ok(s.b==='aggressive' && near(s.noi,AGGR-3075-24000,1) && /Aggressive underwriting/.test(s.txt), 'picked Aggressive: the refinance sizes on Aggressive after reserves ('+s.noi+')');
    await page.evaluate(()=>{ const b=document.querySelector('#refiView [data-noibasis="inplace"]'); if(b) b.click(); }); await page.waitForTimeout(1000);
    s=await page.evaluate((id)=>{ const l=window.LDS_loans().find(x=>x._id===id); return { b:window.LDS_refiBasis(l), noi:window.LDS_refiNOI(l) }; },ref.id);
    ok(s.b==='inplace' && near(s.noi,T12_NOI,1), 'picked In-place T12: the T12 NOI ('+s.noi+')');
    await page.evaluate(()=>{ const b=document.getElementById('refiCloseBtn'); if(b) b.click(); }); await page.waitForTimeout(400);
  }

  // ---- the lender file ----
  await page.click('[data-tabsel]:not([data-tabsel="home"])').catch(()=>{}); await page.waitForTimeout(800);
  const bk=await page.evaluate(()=>{ const b=window.LDS_pfLenderBook(true); if(!b) return null; const sh=(n)=>XLSX.utils.sheet_to_json(b.wb.Sheets[n],{header:1,raw:true});
    return { file:b.file, names:b.wb.SheetNames, pf:sh('Pro forma'), acc:sh('Changed accounts'), rec:sh('Reconciliation'), mo:sh('Monthly') }; });
  ok(bk && JSON.stringify(bk.names)==='["Pro forma","Changed accounts","Reconciliation","Monthly"]' && /Pro forma — \d{4}-\d{2}-\d{2}\.xlsx$/.test(bk.file), 'the lender file: four sheets (Pro forma, Changed accounts, Reconciliation, Monthly)');
  if(bk){
    const noiRow=bk.pf.find(x=>x[0]==='Net Operating Income'), rsv=bk.pf.find(x=>/^Replacement reserves/.test(x[0]||'')), after=bk.pf.find(x=>x[0]==='NOI after reserves'), ga=bk.pf.find(x=>x[0]==='General & Admin');
    ok(noiRow && near(noiRow[1],T12_NOI) && near(noiRow[3],SAFE-3075) && near(noiRow[5],AGGR-3075), 'Pro forma sheet: NOI row T12 · Safe · Aggressive '+JSON.stringify(noiRow));
    ok(rsv && near(rsv[3],24000) && after && near(after[3],SAFE-3075-24000), 'reserves on both sides (120 units × $200 = 24,000) and the NOI after reserves');
    ok(ga && /Bank Charges/.test(ga[7]) && /Partnership/.test(ga[8]) && /partnership account/.test(ga[9]), 'a changed line carries what changed (the account), its kind and its story');
    const snowA=bk.acc.find(x=>x[1]==='Snow Removal'), antA=bk.acc.find(x=>/Rooftop antenna lease/.test(x[1]||''));
    ok(snowA && near(snowA[2],14000) && near(snowA[3],9000) && /FAKE-STORY/.test(snowA[7]) && antA && /added/.test(antA[1]) && near(antA[4],6000) && !bk.acc.some(x=>x[1]==='Pool Service'||x[1]==='Landscaping'),
       'Changed accounts: Snow Removal 14,000 → 9,000 with its story; the added antenna lease; unchanged accounts not listed');
    ok(bk.rec.some(x=>x[0]==='Reconciles to the dollar') && bk.mo[1].filter(x=>x==='yes').length===3, 'Reconciliation sheet adds up; Monthly marks the 3 months used for the revenue credit');
  }

  // ---- the assistant: one account, behind an Approve card ----
  const run=(o)=>page.evaluate((o)=>{ const r=window.LDS_asstAction(o); window.__r=r; return Promise.resolve(r).then(x=>{ window.__r=x; const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop();
    return { ok:x&&x.ok, msg:x&&x.msg, card:!!(x&&x.pending), text:(x&&x.pending&&c)?c.textContent:'' }; }); },o);
  let a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Swimming pool',account:'x',how:'takeOut',kind:'operating',story:'x'}});
  ok(!a.card && /There is no line/.test(a.msg||''), 'assistant: an unknown line is refused with the list of lines');
  a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Utilities',how:'total',value:1,kind:'operating',story:'x'}});
  ok(!a.card && /one account at a time/.test(a.msg||''), 'assistant: a new total for a whole line is refused ("'+(a.msg||'').slice(0,80)+'")');
  a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Utilities',account:'Gas',how:'accountTotal',value:1,kind:'operating',story:'x'}});
  ok(!a.card && /No account "Gas"/.test(a.msg||'') && /Electric/.test(a.msg||''), 'assistant: an account that isn’t under the line is refused with its accounts');
  a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Utilities',account:'Electric',how:'accountTotal',value:27000,kind:'operating',story:''}});
  ok(!a.card && /reason/.test(a.msg||''), 'assistant: no story → refused ("'+(a.msg||'')+'")');
  a=await run({action:'propose_pro_forma_change',args:{name:'Villages of Whitewater',line:'Utilities',account:'Electric',how:'accountTotal',value:27000,kind:'operating',story:'LED lighting finished in June.',column:'aggressive'}});
  ok(a.card && /Electric/.test(a.text) && /Pro forma NOI/.test(a.text) && /LED lighting/.test(a.text), 'assistant: a card with the account, the line and the NOI before → after, the kind and the story');
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop(); if(b) b.click(); }); await page.waitForTimeout(2500);
  const saved=await page.evaluate(async(k)=>{ const l=await ldsShell.docList(k); const f=(l.files||[]).filter(x=>x.role==='assumptions').sort((a,b)=>b.savedAt-a.savedAt)[0]; const rd=await ldsShell.docRead(k,f.id);
    const j=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rd.base64),c=>c.charCodeAt(0)))); return (j.proForma.changes||[]).filter(c=>c.from==='assistant'); },key);
  ok(saved.length===1 && saved[0].line==='UTIL' && saved[0].accounts[0].name==='Electric' && saved[0].column==='aggressive' && /Assistant/i.test(saved[0].by||''), 'approved: saved on the Electric account, marked as from the assistant ('+(saved[0]&&saved[0].by)+')');

  // ---- a change after the approval: "changed since approved"; the approved figures stay in use until approved again ----
  await page.evaluate(()=>{ const t=[...document.querySelectorAll('[data-tabsel]')].find(x=>x.getAttribute('data-tabsel')!=='home'); if(t) t.click(); }); await page.waitForTimeout(1500);
  u=await uwState();
  const gdC=await page.evaluate(()=>{ const g=(window.LDS_gdNOICache()||{})['name:villages of whitewater']; return g?{uw:g.underwritten,ap:g.uwApproved}:null; });
  ok(u.chip==='changed' && /Approve again/.test(u.approve) && gdC && near(gdC.uw,SAFE-3075-24000) && gdC.ap && gdC.ap.current===false,
     'after the assistant’s change: "changed since approved", "Approve again"; the refinance keeps the approved Safe '+(gdC&&gdC.uw)+' until then');
  // ---- Start over: the draft goes back to the T12, the approval stays ----
  await page.evaluate(()=>{ const b=document.querySelector('[data-pfclear]'); if(b) b.click(); }); await page.waitForTimeout(2000);
  r=await R(); u=await uwState();
  const gdS=await page.evaluate(()=>{ const g=(window.LDS_gdNOICache()||{})['name:villages of whitewater']; return g?{uw:g.underwritten}:null; });
  ok(r && near(r.base.noi,T12_NOI) && near(r.aggr.noi,T12_NOI) && u.chip==='changed' && gdS && near(gdS.uw,SAFE-3075-24000), '"Start over": the draft is the T12 again ('+(r&&r.base.noi)+'); the approved underwriting stays in use ('+(gdS&&gdS.uw)+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all proforma e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
