/* e2e for 2.9.3: content-based file routing. A file dropped anywhere is saved into the property folder(s)
   its CONTENT names — a multi-property rent roll is copied into each — not (only) the property it was dropped
   on. Add two properties, drop a two-property rent roll while viewing a THIRD, and confirm it lands in both
   named folders and not the drop location.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/file-routing.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-route-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
// Two-property Yardi-shaped rent roll (two-row header, Total rows name each property).
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

  // opFileTargets identifies both properties from the rent roll's content
  const keys=await page.evaluate(async ()=>{
    const mk=await window.LDS_addProperty('Maple Court');
    const ok2=await window.LDS_addProperty('Oak Plaza');
    const other=window.opProperties().find(p=>p.loans&&p.loans.length>0);
    return { mk, ok2, other: other.key, otherName: other.name };
  });
  ok(!!keys.mk && !!keys.ok2,'added Maple Court and Oak Plaza');

  // open a THIRD property and drop the rent roll on its Documents panel
  await page.evaluate((k)=>window.LDS_openProfile(k), keys.other);
  await page.waitForFunction(()=>{ const v=document.getElementById('loanView'); return v&&!v.hidden&&document.getElementById('loanDocsFile'); },null,{timeout:8000});
  await page.setInputFiles('#loanDocsFile',FIX);
  await page.waitForTimeout(1500);   // async: read → detect → route → save to each folder

  // it routed by CONTENT into both named folders, not the drop location
  const routed=await page.evaluate(async (k)=>{
    const m=await window.LDS_rentRollBlock(k.mk), o=await window.LDS_rentRollBlock(k.ok2), d=await window.LDS_rentRollBlock(k.other);
    return { maple: m&&m.block?m.block.residentialUnits:null, oak: o&&o.block?o.block.residentialUnits:null, drop: d&&d.block?d.block.name:null };
  }, keys);
  ok(routed.maple===2,'the rent roll was saved into Maple Court\'s folder (2 units read back)');
  ok(routed.oak===2,'…and into Oak Plaza\'s folder (2 units)');
  ok(routed.drop===null,'…and NOT into the property it was dropped on — routed by content, not drop location');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all file-routing e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
