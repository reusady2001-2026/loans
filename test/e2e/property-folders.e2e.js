/* e2e for 2.9.8 (problem 8) — every property the app shows has its folder, with profile.json and
   general-data.json, whatever way it came to be: properties that existed before (the sample book starts with
   loans and no folders), a loan imported from Excel on a new property, and a property renamed by an import.
   Data Health says "Properties without a folder: 0".
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/property-folders.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-folders-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const until=async(page,fn,arg,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||20000)){ if(await page.evaluate(fn,arg)) return true; await page.waitForTimeout(500); } return false; };
(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:'/nonexistent'})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}).catch(()=>{});
  const missing=()=>page.evaluate(async()=>{ const r=await window.ldsShell.docIndex(), by=(r&&r.byKey)||{};
    const props=window.opProperties().concat(window.opArchivedProps?window.opArchivedProps():[]);
    return { n:props.length, missing:props.filter(p=>{ const f=(by[p.key]&&by[p.key].files)||[]; return f.indexOf('profile.json')<0||f.indexOf('general-data.json')<0; }).map(p=>p.name) }; });

  // ---- at start: every property gets its folder ----
  ok(await until(page,async()=>{ const r=await window.ldsShell.docIndex(); return Object.keys((r&&r.byKey)||{}).length>=window.opProperties().length; },null,40000),'startup creates the folders');
  await page.waitForTimeout(1500);
  const m0=await missing();
  ok(m0.n>20&&m0.missing.length===0,'all '+m0.n+' properties have a folder with profile.json and general-data.json (missing: '+(m0.missing.join(', ')||'none')+')');
  const prof=await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.loans.length&&x.loans[0].propertyAddress); const pr=await window.LDS_ensureProfile(p.key); return { name:p.name, addr:p.loans[0].propertyAddress, pName:window.Profile.value(pr,'propertyName'), pAddr:window.Profile.value(pr,'propertyAddress') }; });
  ok(prof.pName===prof.name&&String(prof.pAddr||'').trim()===String(prof.addr).trim(),'the profile carries the property\'s name and address ('+prof.pName+' · '+prof.pAddr+')');
  const t12s=await page.evaluate(()=>window.opProperties().filter(p=>window.LDS_hasT12&&window.LDS_hasT12(p.key)).length);
  ok(t12s===0,'a starter general-data.json does not count as a T12 ('+t12s+' with a T12)');

  // ---- Excel import: a loan on a NEW property ----
  const first=await page.evaluate(()=>{ const l=window.LDS_loans().find(x=>!x.archived); return { id:l._id }; });
  const b64=await page.evaluate((id)=>{
    const wb=XLSX.read(Uint8Array.from(atob(window.LDS_exportXlsxB64([id])),c=>c.charCodeAt(0)),{type:'array'});
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''});
    aoa.forEach(r=>{ if(r[1]==='Property Name') r[2]='Imported Acres'; if(r[1]==='Property Address') r[2]='77 Import Way, Testville, NY'; if(r[1]==='Loan Number') r[2]='IMP-1'; if(r[1]==='Loan ID') r[2]=''; });
    const wb2=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet(aoa),'Loan Debt Service');
    return XLSX.write(wb2,{type:'base64',bookType:'xlsx'}); },first.id);
  await page.evaluate((b)=>window.LDS_importXlsxB64(b),b64); await page.waitForTimeout(600);
  const c1=await page.evaluate(()=>window.LDS_importCounts());
  ok(c1&&c1.nw===1,'the sheet is one NEW loan ('+JSON.stringify(c1)+')');
  await page.click('#importApplyBtn');
  ok(await until(page,async()=>{ const p=window.opProperties().find(x=>x.name==='Imported Acres'); if(!p) return false; const r=await window.ldsShell.docIndex(); const f=((r.byKey||{})[p.key]||{}).files||[]; return f.indexOf('profile.json')>=0&&f.indexOf('general-data.json')>=0; }),'the imported property has its folder at once (profile.json + general-data.json)');

  // ---- Excel import: renaming a property moves its folder ----
  const ren=await page.evaluate(async()=>{ const p=window.opProperties().find(x=>x.name==='Imported Acres'); const id=p.loans[0]._id;
    await window.ldsShell.docSave({ propKey:p.key, propName:p.name, name:'note.txt', base64:btoa('hello'), text:'hello', type:'text/plain', role:'other' }); return { id, key:p.key }; });
  const b64r=await page.evaluate((id)=>{
    const wb=XLSX.read(Uint8Array.from(atob(window.LDS_exportXlsxB64([id])),c=>c.charCodeAt(0)),{type:'array'});
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''});
    aoa.forEach(r=>{ if(r[1]==='Property Name') r[2]='Imported Acres Renamed'; if(r[1]==='Property Address') r[2]='78 Import Way, Testville, NY'; });
    const wb2=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet(aoa),'Loan Debt Service');
    return XLSX.write(wb2,{type:'base64',bookType:'xlsx'}); },ren.id);
  await page.evaluate((b)=>window.LDS_importXlsxB64(b),b64r); await page.waitForTimeout(600);
  await page.click('#importApplyBtn');
  ok(await until(page,async()=>{ const p=window.opProperties().find(x=>x.name==='Imported Acres Renamed'); if(!p) return false; const r=await window.ldsShell.docIndex(); const f=((r.byKey||{})[p.key]||{}).files||[]; return f.indexOf('note.txt')>=0&&f.indexOf('profile.json')>=0; }),'after a rename in Excel, the folder (with its file) moved to the new name');

  // ---- Data Health ----
  await page.evaluate(()=>{ const b=document.getElementById('tabNewBtn'); if(b) b.click(); const o=document.querySelector('[data-tabopen="health"]'); if(o) o.click(); });
  ok(await until(page,()=>!!document.querySelector('[data-health-folders]'),null,40000),'Data Health shows the folder check');
  const dh=await page.evaluate(()=>{ const e=document.querySelector('[data-health-folders]'); return { n:e.getAttribute('data-health-folders'), t:e.innerText }; });
  ok(dh.n==='0'&&/Properties without a folder: 0/.test(dh.t),'"Properties without a folder: 0" ("'+dh.t.slice(0,90)+'")');
  const m1=await missing();
  ok(m1.missing.length===0,'still no property without its folder ('+m1.n+' properties)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all property-folder e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
