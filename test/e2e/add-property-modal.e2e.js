/* e2e (cleanup): "Add Property" is a portfolio-level button that opens a small name-only modal (no Profile
   tab). Create adds the property to the portfolio; an empty name is rejected; Cancel closes without adding.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/add-property-modal.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-apm-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const shown=(page)=>page.evaluate(()=>{ const m=document.getElementById('addPropModal'); return !!m && !m.classList.contains('hidden'); });
// click the VISIBLE "Add Property" button (there is one on the portfolio view and one in the loan toolbar,
// which is hidden in portfolio scope) — offsetParent is null for a hidden element.
const clickAddProp=(page)=>page.evaluate(()=>{ const bs=Array.prototype.slice.call(document.querySelectorAll('[data-addprop]')); const vis=bs.find(function(b){return b.offsetParent!==null;})||bs[0]; if(vis) vis.click(); return !!vis; });

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  const n0=await page.evaluate(()=>window.opProperties().length);
  ok(n0===27,'baseline is 27 properties (got '+n0+')');
  ok(await page.evaluate(()=>document.getElementById('profileView')===null),'there is no Profile tab section');

  // the portfolio view exposes an "Add Property" button (portfolio level, always visible)
  ok(await page.evaluate(()=>{ const bs=Array.prototype.slice.call(document.querySelectorAll('[data-addprop]')); return bs.some(function(b){return b.offsetParent!==null;}); }),'the portfolio view shows an "Add Property" button');
  // open the modal from that portfolio button
  await clickAddProp(page);
  await page.waitForTimeout(200);
  ok(await shown(page),'clicking "Add Property" opens the Add Property modal');

  // empty name is rejected (error shows, nothing added, modal stays open)
  await page.evaluate(()=>{ document.getElementById('addPropName').value=''; document.getElementById('addPropCreate').click(); });
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>!document.getElementById('addPropErr').classList.contains('hidden')),'an empty name shows an error');
  ok(await page.evaluate(()=>window.opProperties().length)===27,'nothing is added on an empty name');
  ok(await shown(page),'the modal stays open');

  // a real name creates the property and closes the modal
  await page.fill('#addPropName','Modal Test Property');
  await page.click('#addPropCreate');
  await page.waitForTimeout(400);
  ok(!(await shown(page)),'creating closes the modal');
  ok(await page.evaluate(()=>window.opProperties().length)===28,'the property joins the portfolio (count 28)');
  ok(await page.evaluate(()=>window.opProperties().some(p=>/Modal Test Property/.test(p.name))),'…and it is present by name');

  // Cancel closes without adding
  await clickAddProp(page); await page.waitForTimeout(150);
  await page.fill('#addPropName','Should Not Exist');
  await page.click('#addPropCancel'); await page.waitForTimeout(150);
  ok(!(await shown(page)),'Cancel closes the modal');
  ok(await page.evaluate(()=>window.opProperties().length)===28,'Cancel adds nothing (still 28)');
  ok(await page.evaluate(()=>!window.opProperties().some(p=>/Should Not Exist/.test(p.name))),'the cancelled name was not added');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all add-property-modal e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
