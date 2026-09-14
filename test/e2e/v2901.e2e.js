/* e2e for v2.9.0.1 — the whole patch in one Electron launch:
   • Pepper removed: 27 properties, no loan named "Pepper"; and SYNC_REMOVE pulls Pepper from an existing book.
   • Item 2: no duplicate candidates on the clean seed; Settings → Portfolio shows 27 + property names + "No duplicate…".
   • Item 3: the assistant snapshot's noi equals loanNOI (the four screens' figure) for every loan; a T12-driven
     property carries a noiBasis label and omits egi/opex.
   • Item 1: a matured / extension-undecided loan is flagged in the calendar (payload flag + rendered banner).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/v2901.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-v2901-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- Pepper removed: 27 properties, no Pepper ----
  const nProps=await page.evaluate(()=>window.opProperties?window.opProperties().length:-1);
  ok(nProps===27,'the portfolio has 27 properties, Pepper removed (got '+nProps+')');
  const noPepper=await page.evaluate(()=>!(window.LDS_loans?window.LDS_loans():[]).some(l=>/pepper/i.test(l.propertyName||'')));
  ok(noPepper,'no loan named "Pepper" is in the book');

  // ---- SYNC_REMOVE: an older book that still has Pepper gets it pulled on the rev bump ----
  const sync=await page.evaluate(()=>{
    const book=(window.LDS_loans?window.LDS_loans():[]).map(l=>Object.assign({},l));
    book.push({_id:'pep-mig',propertyName:'The Pepper Building',propertyAddress:'1830 Lombard Street, Philadelphia, PA',originalAmount:53160000,annualRate:0.033,maturityDate:'2024-08-09'});
    try{localStorage.removeItem('ldsHub.portfolioRev');}catch(e){}   // force sync to run
    const res=window.LDS_syncPortfolio?window.LDS_syncPortfolio(book):{removed:[],loans:book};
    return {removed:res.removed||[],stillHasPepper:(res.loans||[]).some(l=>/pepper/i.test(l.propertyName||''))};
  });
  ok(sync.removed.indexOf('The Pepper Building')>=0,'SYNC_REMOVE reports pulling The Pepper Building');
  ok(!sync.stillHasPepper,'after sync, an existing book no longer contains Pepper');

  // ---- Item 2: no duplicate candidates on the clean seed; Settings shows count + names + none ----
  const dups=await page.evaluate(()=>window.LDS_dupCandidates?window.LDS_dupCandidates():null);
  ok(Array.isArray(dups)&&dups.length===0,'no duplicate candidates on the clean seed ('+(dups?dups.length:'?')+') — the St. Louis lofts are not falsely flagged');
  // open the Settings dropdown (its "toggle" fires renderSettingsPortfolio); read innerHTML so the check
  // is independent of the <details> visibility.
  await page.evaluate(()=>{ var d=document.getElementById('settingsDD'); if(d) d.open=true; if(window.LDS_renderSettingsPortfolio) window.LDS_renderSettingsPortfolio(); });
  await page.waitForTimeout(200);
  const settings=await page.evaluate(()=>{const h=document.getElementById('settingsPortfolio');return h?h.innerHTML:'';});
  ok(settings.length>0,'Settings → Portfolio renders content ('+settings.length+' chars)');
  ok(/>\s*27\s*</.test(settings)||/\b27\b/.test(settings),'Settings → Portfolio shows the count 27');
  ok(/No duplicate properties detected/i.test(settings),'Settings shows "No duplicate properties detected"');
  ok(/Villages of Whitewater/.test(settings)&&/M Lofts/.test(settings),'Settings lists every property by name (Villages of Whitewater, M Lofts)');
  ok(!/Pepper/i.test(settings),'Settings does NOT list The Pepper Building');

  // ---- Item 3: snapshot noi == loanNOI for every loan; a T12-driven property carries noiBasis, omits egi/opex ----
  const cons=await page.evaluate(()=>{
    const ls=window.LDS_loans(),snap=window.LDS_aiAsstSnapshot(),norm=v=>(v==null?null:v);
    let all=true;for(let i=0;i<ls.length;i++){ if(norm(snap[i]&&snap[i].noi)!==norm(window.LDS_loanNOI(ls[i]))) all=false; }
    return {all,n:ls.length};
  });
  ok(cons.all,'every snapshot noi equals loanNOI — the figure the four screens show ('+cons.n+' loans)');
  const inj=await page.evaluate(()=>{
    const ls=window.LDS_loans(),L=ls[0],key=window.propertyKey(L);
    window.LDS_setGDNOI(key,{inPlace:1777000,underwritten:1500000,inPlaceStatement:1777000,inPlaceBasis:'statement',leaseUpMonths:null,months:['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'],period:'12-mo Total'});
    let idx=-1;for(let i=0;i<ls.length;i++){ if(window.propertyKey(ls[i])===key && !/mezz/i.test(ls[i].propertyName||'')){idx=i;break;} }
    const e=window.LDS_aiAsstSnapshot()[idx];
    return {noi:e.noi,basis:e.noiBasis,egi:e.egi,opex:e.opex,loanNOI:window.LDS_loanNOI(ls[idx])};
  });
  ok(inj.noi===1777000,'after a T12 NOI is stored, the snapshot noi is that figure ('+inj.noi+')');
  ok(inj.noi===inj.loanNOI,'and it equals loanNOI (matches the screens)');
  ok(typeof inj.basis==='string'&&/T12/.test(inj.basis),'noiBasis names the T12 method ('+inj.basis+')');
  ok(inj.egi===undefined&&inj.opex===undefined,'egi/opex are omitted when a T12 drives the NOI');

  // ---- Item 1: a matured / extension-undecided loan is flagged in the calendar ----
  const cal=await page.evaluate(()=>{
    const ls=window.LDS_loans();
    ls[0].maturityDate='2020-01-01'; ls[0].loanStatus='';         // derived "matured"
    ls[1].loanStatus='Extension undecided';                        // manual "undecided"
    const html=window.LDS_calendarDocHtml();
    return {mat:/"flag":"matured"/.test(html),und:/"flag":"undecided"/.test(html)};
  });
  ok(cal.mat,'the calendar payload flags the past-maturity loan "matured"');
  ok(cal.und,'the calendar payload flags the extension-undecided loan "undecided"');
  // render check: open the calendar tab and read the banner in its iframe
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="calendar"]');if(o)o.click();});
  await page.waitForFunction(()=>{const f=document.getElementById('calendarFrame');return f&&f.contentDocument&&f.contentDocument.body&&/decision|Maturity|No events/i.test(f.contentDocument.body.innerText||'');},null,{timeout:9000}).catch(()=>{});
  const frameText=await page.evaluate(()=>{const f=document.getElementById('calendarFrame');return (f&&f.contentDocument&&f.contentDocument.body)?f.contentDocument.body.innerText:'';});
  ok(/Needs a maturity decision/i.test(frameText),'the calendar renders the "Needs a maturity decision" banner');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all v2.9.0.1 e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
