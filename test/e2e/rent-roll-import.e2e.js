/* e2e for 2.9.3: portfolio-level rent-roll IMPORT. One Yardi file can hold many properties; the import
   modal lists each with its summary and lets you add (new) or update (existing), then saves the file into
   each property's folder. Add two new properties from a two-property rent roll and confirm both are created
   and each reads its own block back from its folder.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/rent-roll-import.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-rrimp-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const CSV=[
  'Rent Roll',
  'Unit,Unit Type,Unit,Resident,Name,Market,Actual',
  ',,Sq Ft,,,Rent,Rent',
  'Current/Notice/Vacant Residents',
  '101,A1,800,t001,Alice,1500,1500',
  '102,A1,800,VACANT,VACANT,1500,0',
  ',,,Total,Maple Court,3000,1500',
  '201,B2,1000,t004,Carol,2000,1900',
  '202,B2,1000,t005,Dave,2000,2000',
  ',,,Total,Oak Plaza,4000,3900'
].join('\n')+'\n';

(async()=>{
  const FIX=path.join(UDATA,'StLouis-RentRoll.csv'); fs.writeFileSync(FIX,CSV);
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  const n0=await page.evaluate(()=>window.opProperties().length);
  ok(n0===27,'baseline 27 properties (got '+n0+')');
  ok(await page.evaluate(()=>!!document.querySelector('[data-rrimport]')),'the portfolio shows an "Import rent roll" button');

  // feed the file into the import modal (bypass the OS picker by setting the hidden input)
  await page.setInputFiles('#rrImportFile',FIX);
  await page.waitForFunction(()=>{ const b=document.getElementById('rrImportBody'); return b && /Maple Court/.test(b.innerText||'') && /Oak Plaza/.test(b.innerText||''); },null,{timeout:8000});
  const modal=await page.evaluate(()=>document.getElementById('rrImportBody').innerText||'');
  ok(/Maple Court/.test(modal) && /Oak Plaza/.test(modal),'the modal lists both properties from the file');
  ok(/add new/i.test(modal),'…each shown as "add new" (not in the portfolio yet)');
  ok(/2 units/.test(modal),'…with its summary (2 units)');
  const st=await page.evaluate(()=>{ const s=window.LDS_rentRollImportState(); return s?s.rows.map(r=>({name:r.block.name, key:r.key, units:r.block.residentialUnits})):null; });
  ok(st && st.length===2 && st.every(r=>r.key===null),'both are matched as new (no existing key)');

  // import
  await page.click('#rrImportApply');
  await page.waitForTimeout(1500);
  ok(await page.evaluate(()=>document.getElementById('rrImportModal').classList.contains('hidden')),'the modal closes after import');
  const n1=await page.evaluate(()=>window.opProperties().length);
  ok(n1===29,'both properties were added to the portfolio (29)');

  // each new property reads its own block back from its folder (the file was saved into both)
  const back=await page.evaluate(async ()=>{
    const props=window.opProperties();
    const mk=props.find(p=>/maple court/i.test(p.name)), ok2=props.find(p=>/oak plaza/i.test(p.name));
    const m=mk?await window.LDS_rentRollBlock(mk.key):null, o=ok2?await window.LDS_rentRollBlock(ok2.key):null;
    return { maple: m&&m.block?m.block.residentialUnits:null, oak: o&&o.block?o.block.residentialUnits:null };
  });
  ok(back.maple===2,'Maple Court reads its rent roll from its own folder (2 units)');
  ok(back.oak===2,'Oak Plaza reads its rent roll from its own folder (2 units)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all rent-roll-import e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
