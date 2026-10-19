/* e2e — the app bugs found while taking the Guide's pictures (2026-10-19), each fixed and checked here on the real app:
   1  "Keep the stated payment" below the interest: the unpaid interest is added to what is owed (never just lost), and
      the schedule says so (Living Lofts, a built-in loan, resets in 2026 to a rate whose interest is above its payment)
   2  a pooled loan's allocated amounts: the rest of the loan goes to the properties with no amount by NOI — the loan
      form's line says the same (it said "the lead's" while the panel split it evenly)
   3  "1 part", never "1 parts" (the rent-roll import)
   4  a property whose loans are all removed: its profile shows "NOI (annual, entered)", and a typed NOI is used
   5  Home after the first upload to a shared database: checked in cloud-3000.e2e.js (it needs the test server)
   6  the chat on a 900-pixel window with Claude not connected: the message box and Send stay in the window
   7  the tab strip has no stray vertical scrollbar
   8  the calendar's Sort box shows the order the list is in after a redraw
   9  a workbook added through "which part is whose" is saved with its text
   10 "Extend with today's lender" clicked while the property's refinance record is being read stays Extend
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r ./test/e2e/_t12auto.js test/e2e/guide-found-bugs.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-found-'));
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true});   // the stand-in Claude, not signed in
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function until(page,fn,arg,ms){ const t0=Date.now(); while(Date.now()-t0<(ms||20000)){ try{ if(await page.evaluate(fn,arg)) return true; }catch(e){} await sleep(250); } return false; }
const money=(n)=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const homeTab=(page)=>page.evaluate(()=>{ const b=document.querySelector('[data-tabsel="home"]'); if(b) b.click(); });
const openLoan=async(page,id)=>{ await homeTab(page); await page.evaluate((id)=>{ const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },id); await page.waitForTimeout(700); };
const openPage=async(page,k)=>{ await homeTab(page); await page.evaluate((k)=>window.LDS_openProfile(k),k); await until(page,()=>{ const v=document.getElementById('propView'); return v&&!v.hidden; }); await page.waitForTimeout(800); };
const M=['Jul 2025','Aug 2025','Sep 2025','Oct 2025','Nov 2025','Dec 2025','Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026'];
const rowOf=(n,y)=>[n].concat(M.map(()=>Math.round(y/12)),[Math.round(y/12)*12]);
const t12=(top,rent,tax)=>[[top],['12 Month Statement'],['Account'].concat(M,['Total']),['INCOME'],rowOf('Gross Potential Rent',rent),rowOf('TOTAL INCOME',rent),['EXPENSES'],rowOf('Real Estate Taxes',tax),rowOf('TOTAL EXPENSES',tax),rowOf('NET OPERATING INCOME',rent-tax)];

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:path.join(APP,'test','fixtures','fake-claude-push.js'),CLAUDE_CONFIG_DIR:path.join(UDATA,'claude'),LDS_RATES_OFFLINE:'1',LDS_CLOUD_OFF:'1'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(1500);
  try{ const win=await app.browserWindow(page); await win.evaluate(w=>{w.setSize(1440,900);}); }catch(e){}
  await page.waitForTimeout(800);

  // ---- 7: the tab strip ----
  const ts=await page.evaluate(()=>{ const s=document.getElementById('tabStrip'); return { full:s.clientWidth===s.offsetWidth, oy:getComputedStyle(s).overflowY }; });
  ok(ts.full&&ts.oy==='hidden','7  the tab strip has no vertical scrollbar ('+JSON.stringify(ts)+')');

  // ---- 1: a kept payment below the interest ----
  const LL=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>/Living Lofts/.test(x.propertyName)); const c=window.LDS_compute(l); const short=c.rows.filter(r=>r.unpaidInterest>0);
    const first=short[0]||null, grows=short.every(r=>Math.abs(r.endingBalance-(r.startingBalance+r.unpaidInterest))<0.01 && r.principalPaid===0 && Math.abs(r.payment-l.fixedAmortAmount)<0.01);
    const last=c.rows[c.rows.length-1];
    return { id:l._id, setting:l.armResetPayment||'', n:short.length, first:first&&{ label:first.label, pay:first.payment, int:first.interest, start:first.startingBalance, end:first.endingBalance }, grows,
      sum:short.reduce((t,r)=>t+r.unpaidInterest,0), totP:c.totalPaid, totI:c.totalInterest, orig:l.originalAmount, balloon:last.payment }; });
  ok(LL.n>0&&LL.first&&LL.first.int>LL.first.pay,'1  Living Lofts keeps its stated '+money(LL.first&&LL.first.pay)+' at its reset ('+(LL.first&&LL.first.label)+'), below the '+money(LL.first&&LL.first.int)+' of interest');
  ok(LL.grows,'1  …no principal is paid and the interest left unpaid is added to what is owed, every month it is short ('+LL.n+' months, '+money(LL.sum)+')');
  ok(Math.abs(LL.totP-(LL.orig+LL.totI))<1,'1  everything paid = the loan + all its interest ('+money(LL.totP)+' = '+money(LL.orig)+' + '+money(LL.totI)+') — none of the interest disappears');
  await openLoan(page,LL.id);
  const sn=await page.evaluate(()=>{ const n=document.querySelector('#scheduleKeyDates [data-schedunpaidnote]'); return { note:n?n.innerText:'', badges:document.querySelectorAll('#scheduleBody [data-schedunpaid]').length }; });
  ok(/less than the interest/.test(sn.note)&&/added to what is owed/.test(sn.note)&&sn.badges===LL.n,'1  the schedule says so above the table, and marks each short month ('+sn.badges+'): "'+sn.note.slice(0,110)+'…"');

  // ---- 2: a pooled loan's allocated amounts ----
  const P=await page.evaluate(()=>{ const ps=window.opProperties().filter(p=>p.loans.length===1); const lead=ps[0].loans[0], a=ps[1], b=ps[2];
    const was=lead.alsoSecures||''; window.LDS_setGDNOI(window.propertyKey(lead),{ inPlace:3000000 }); window.LDS_setGDNOI(b.key,{ inPlace:1000000 });
    lead.alsoSecures=a.name+' = 2000000; '+b.name; const al=window.LDS_poolAlloc(lead._id); lead.alsoSecures=was;
    return { lead:al&&al[window.propertyKey(lead)], a:al&&al[a.key], b:al&&al[b.key], loan:Number(lead.originalAmount) }; });
  const rest=P.loan-2000000;
  ok(P.a===2000000&&Math.abs(P.lead-rest*0.75)<1&&Math.abs(P.b-rest*0.25)<1,'2  the typed amount as typed; the other '+money(rest)+' split by NOI 3:1 between the lead ('+money(P.lead)+') and the partner left blank ('+money(P.b)+')');
  await homeTab(page); await page.click('#addBtn'); await page.waitForTimeout(900);
  const pf=await page.evaluate(()=>{ const set=(id,v)=>{ const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); };
    set('f_originalAmount','10000000');
    const cbs=[...document.querySelectorAll('#poolFormPicker [data-poolform]')].slice(0,2); cbs.forEach(cb=>{ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); });
    const amt=document.querySelector('#poolFormPicker [data-poolformamt="'+CSS.escape(cbs[0].getAttribute('data-poolform'))+'"]'); amt.value='2000000'; amt.dispatchEvent(new Event('change',{bubbles:true}));
    return (document.getElementById('poolFormAllocSum')||{}).textContent||''; });
  ok(/\$8,000,000\.00 is shared by NOI between this loan's own property and the 1 ticked without an amount/.test(pf),'2  the loan form says the same: "'+pf+'"');
  await page.evaluate(()=>{ const c=document.getElementById('cancelBtn'); if(c) c.click(); }); await page.waitForTimeout(500);

  // ---- 3: "1 part" ----
  const rr=await page.evaluate(async()=>{ const csv=['Rent Roll','Unit,Unit Type,Unit,Resident,Name,Market,Actual',',,Sq Ft,,,Rent,Rent','Current/Notice/Vacant Residents','101,1BR,720,t1001,Resident A,1450,1425','102,2BR,960,t1002,Resident B,1825,1790',',,,Total,Birch Commons (made-up),3275,3215'].join('\n')+'\n';
    await window.LDS_rentRollImportRead(new File([csv],'Birch Commons rent roll (made-up).csv',{type:'text/csv'}));
    const t=(document.getElementById('rrImportBody')||{}).innerText||'', sub=(document.getElementById('rrImportSub')||{}).textContent||''; try{ document.getElementById('rrImportCancel').click(); }catch(e){} return { t, sub }; });
  ok(/has 1 part\b/.test(rr.t)&&!/1 parts/.test(rr.t+rr.sub),'3  the rent-roll import says "has 1 part" ("'+rr.t.split('\n')[0].slice(0,90)+'")');

  // ---- 4: a property whose only loan is removed ----
  const pick=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.loans.length===1&&!window.LDS_gdNOICache()[x.key]&&!/Living Lofts/.test(x.name)); return p?{ id:p.loans[0]._id, key:p.key, name:p.name }:null; });
  await openLoan(page,pick.id); await page.click('#loanRecRemove'); await page.waitForTimeout(300); await page.click('#confirmOk'); await page.waitForTimeout(900);
  await openPage(page,pick.key);
  const nf=await page.evaluate(()=>{ const d=document.querySelector('#propProfilePanel details'); if(d) d.open=true; return !!document.querySelector('#propProfilePanel [data-pf="noi"]'); });
  ok(nf,'4  '+pick.name+' (its only loan removed): the profile shows "NOI (annual, entered)"');
  await page.evaluate((k)=>window.LDS_setProfileField(k,'noi','1234567'),pick.key); await page.waitForTimeout(600);
  await openPage(page,pick.key);
  const nb=await page.evaluate(()=>{ const h=document.getElementById('propOpPanel'); return { tile:(h&&h.querySelector('.text-sm.font-bold')||{}).innerText||'', src:((h&&h.querySelector('[data-loanopsrc]'))||{}).innerText||'' }; });
  ok(/1,234,567/.test(nb.tile)&&/entered NOI/i.test(nb.src),'4  the NOI typed there is the property’s NOI ('+nb.tile+', "'+nb.src+'")');

  // ---- 6: the chat on a 900-pixel window, Claude not connected ----
  await homeTab(page);
  await page.evaluate(()=>{ const b=document.getElementById('aiAsstFab'); b.hidden=false; b.click(); }); await page.waitForTimeout(900);
  await until(page,()=>!!document.getElementById('claudeSignInAsst'),null,15000);
  const ch=await page.evaluate(()=>{ const box=document.querySelector('#aiAsstModal > div').getBoundingClientRect(), s=document.getElementById('aiAsstSend').getBoundingClientRect(), i=document.getElementById('aiAsstInput').getBoundingClientRect();
    return { ih:innerHeight, box:Math.round(box.bottom), send:Math.round(s.bottom), input:Math.round(i.top), settings:!document.getElementById('aiAsstSettings').classList.contains('hidden') }; });
  ok(ch.settings&&ch.send<=ch.box&&ch.box<=ch.ih&&ch.input>0,'6  not connected, on a 900-px window: the connection choices are open and the message box and Send stay in the window ('+JSON.stringify(ch)+')');
  await page.evaluate(()=>document.getElementById('aiAsstClose').click()); await page.waitForTimeout(400);

  // ---- 8: the calendar's Sort after a redraw ----
  await page.evaluate(()=>{ document.getElementById('tabNewBtn').click(); const o=document.querySelector('[data-tabopen="calendar"]'); if(o) o.click(); }); await page.waitForTimeout(1500);
  const frame=()=>page.frame({ url:/about:srcdoc/ }) || page.frames().find(f=>f!==page.mainFrame());
  let f=frame(); await f.waitForSelector('#sortSel',{timeout:15000});
  await f.selectOption('#sortSel','amtDesc'); await page.waitForTimeout(500);
  const calTab=await page.evaluate(()=>{ const t=[...document.querySelectorAll('[data-tabsel]')].find(b=>/calendar/i.test(b.textContent)); return t?t.getAttribute('data-tabsel'):null; });
  await homeTab(page); await page.waitForTimeout(600); await page.click('[data-tabsel="'+calTab+'"]'); await page.waitForTimeout(1500);
  f=frame(); await f.waitForSelector('#sortSel',{timeout:15000});
  const cs=await f.evaluate(()=>{ const amts=[...document.querySelectorAll('[data-amt], .amt')].map(e=>Number(String(e.getAttribute('data-amt')||e.textContent).replace(/[^\d.]/g,''))).filter(n=>n>0); return { sel:document.getElementById('sortSel').value, kept:(window.__calState()||{}).sort }; });
  ok(cs.sel==='amtDesc'&&cs.kept==='amtDesc','8  after the calendar redraws (another tab and back), Sort still reads "Largest amount", the order the list is in ('+JSON.stringify(cs)+')');

  // ---- 9: a workbook added through "which part is whose" keeps its text ----
  const QG=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>x.propertyName==='Queens Gate Apartments'); return { id:l._id, key:window.propertyKey(l) }; });
  await openLoan(page,QG.id);
  const b64=await page.evaluate((a)=>{ const wb=XLSX.utils.book_new(); a.forEach(s=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(s.g),s.n)); return XLSX.write(wb,{type:'base64',bookType:'xlsx'}); },
    [{ n:'Queens', g:t12('Queens Gate Apartments',600000,120000) }, { n:'Lofts', g:t12('M Lofts',400000,90000) }]);
  const WB=path.join(UDATA,'Owner statements (made-up).xlsx'); fs.writeFileSync(WB,Buffer.from(b64,'base64'));
  await page.setInputFiles('#loanDocsFile',WB);
  ok(await until(page,()=>!!document.querySelector('[data-partsmodal] [data-partsok]'),null,20000),'9  a two-part workbook added on Queens Gate’s page asks which part is whose');
  await page.evaluate(()=>{ document.querySelectorAll('[data-partsmodal] input[data-partuse]').forEach((cb,i)=>{ cb.checked=(i===0); cb.dispatchEvent(new Event('change',{bubbles:true})); }); }); await page.waitForTimeout(200);
  await page.click('[data-partsmodal] [data-partsok]');
  const saved=await until(page,async(k)=>{ const r=await window.ldsShell.docList(k); return !!(r&&r.ok&&(r.files||[]).some(f=>/Owner statements/.test(f.name))); },QG.key,60000);
  const doc=await page.evaluate(async(k)=>{ const r=await window.ldsShell.docList(k); const f=(r.files||[]).find(f=>/Owner statements/.test(f.name)); return f?{ name:f.name, textLen:f.textLen||0 }:null; },QG.key);
  ok(saved&&doc&&doc.textLen>50,'9  …saved to Queens Gate with its text read ('+JSON.stringify(doc)+') — not "no readable text"');

  // ---- 10: Extend clicked while the property's refinance record is being read ----
  const seen=await page.evaluate((id)=>window.LDS_refiRecRace(id,'extend'),QG.id);
  await page.waitForTimeout(1500);
  const after=await page.evaluate((id)=>{ const l=window.LDS_getLoan(id); return (window.LDS_refiRec(l)||{}).deal||'new'; },QG.id);
  ok(seen==='extend'&&after==='extend','10 "Extend with today’s lender" clicked while the record is being read: the screen shows Extend when the read lands ('+seen+') and it is saved ('+after+')');
  await page.evaluate((id)=>window.LDS_refiRecRace(id,'new'),QG.id); await page.waitForTimeout(1200);

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{ fs.rmSync(UDATA,{recursive:true,force:true}); }catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all found-bug checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
