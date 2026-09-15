/* e2e for v2.9.2-C: the GL mapping overrides wired into the running app — a re-map persists, bumps the
   compute version (so Recompute reclassifies), and the classifier reflects it; reset restores the rules.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/gl-mapping.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-gl-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // baseline: no overrides, the classifier uses its rules
  const base=await page.evaluate(async ()=>({ map: window.LDS_glMap(), sig: window.LDS_glSig(), def: window.LDS_classify('Cable & Internet Reimbursement','EXPENSES','').code, ver: await window.LDS_computeVersion() }));
  ok(Object.keys(base.map).length===0,'no GL overrides at start');
  ok(base.sig==='','the GL signature is empty at start (compute version = today’s)');
  ok(typeof base.def==='string' && base.def.length>0 && base.def!=='RET','the line classifies to a rule category ('+base.def+'), not RET');

  // re-map that line to RET
  await page.evaluate(async ()=>{ await window.LDS_glSet('Cable & Internet Reimbursement','RET'); });
  await page.waitForTimeout(400);
  const after=await page.evaluate(async ()=>({ map: window.LDS_glMap(), sig: window.LDS_glSig(), cls: window.LDS_classify('Cable & Internet Reimbursement','EXPENSES','').code, ver: await window.LDS_computeVersion(), ls: (function(){try{return localStorage.getItem('lds.glMap');}catch(e){return '';}})() }));
  ok(after.map['cable & internet reimbursement']==='RET','the override is stored (normalized name → RET)');
  ok(after.cls==='RET','the running classifier now returns RET for that line');
  ok(after.sig.length>0,'the GL signature is non-empty after a re-map');
  ok(after.ver!==base.ver,'the compute version changed, so Recompute will reclassify every property');
  ok(/RET/.test(after.ls||''),'the mapping persisted to localStorage (survives a restart)');

  // the Settings GL mapping section renders
  await page.evaluate(()=>{ var d=document.getElementById('settingsDD'); if(d) d.open=true; });
  await page.evaluate(()=>window.LDS_renderGlMap());
  await page.waitForTimeout(400);
  const glHtml=await page.evaluate(()=>{const h=document.getElementById('settingsGlMap');return h?h.innerHTML:'';});
  ok(/GL mapping/i.test(glHtml),'Settings shows a "GL mapping" section');

  // reset restores the rules
  await page.evaluate(async ()=>{ await window.LDS_glReset(); });
  await page.waitForTimeout(400);
  const reset=await page.evaluate(async ()=>({ map: window.LDS_glMap(), sig: window.LDS_glSig(), cls: window.LDS_classify('Cable & Internet Reimbursement','EXPENSES','').code, ver: await window.LDS_computeVersion() }));
  ok(Object.keys(reset.map).length===0,'reset clears the overrides');
  ok(reset.sig==='','the GL signature is empty again after reset');
  ok(reset.cls===base.def,'the classifier is back to the rule category');
  ok(reset.ver===base.ver,'the compute version is back to today’s (empty overrides add nothing)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all GL-mapping e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
