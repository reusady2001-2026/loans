/* e2e — the test build (next stage, draft): it never uses the shared database, and on its first start it works on a copy
   of this computer's data taken from the real app's folder (read only) — the group's picture when the real app is
   signed in, else the real app's own data. A bar says so. The real app's folder is never changed.
   (LDS_TEST_BUILD=1 stands for the test installer's flag; LDS_TEST_REAL_DIR for the real app's folder.)
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/test-build-local.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'lds-testbuild-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const REAL=path.join(TMP,'real'), MINE=path.join(TMP,'test-app');
const loan=(name,amt)=>({ _id:'t-'+name.replace(/\W+/g,''), propertyName:name, originalAmount:amt, annualRate:0.05, rateType:'Fixed', originationDate:'2020-01-01', firstPaymentDate:'2020-02-01', loanTermMonths:120, amortizationMonths:360, noi:500000 });
// the real app: its own (older) data, and its group picture (signed in) with one more loan and a saved document
fs.mkdirSync(path.join(REAL,'documents','abc'),{recursive:true});
fs.writeFileSync(path.join(REAL,'loans.json'),JSON.stringify([loan('Own Data Court',1000000)]));
const G=path.join(REAL,'cloud','g-123','data'); fs.mkdirSync(path.join(G,'documents','abc'),{recursive:true});
fs.writeFileSync(path.join(G,'loans.json'),JSON.stringify([loan('Group Picture Plaza',2000000),loan('Group Picture Lofts',3000000)]));
fs.writeFileSync(path.join(G,'documents','abc','index.json'),JSON.stringify({ files:[] }));
const hashDir=(d)=>{ const h=crypto.createHash('sha1'); const walk=(p)=>{ const st=fs.statSync(p); if(st.isDirectory()) fs.readdirSync(p).sort().forEach(n=>walk(path.join(p,n))); else { h.update(p); h.update(fs.readFileSync(p)); } }; walk(d); return h.digest('hex'); };
const before=hashDir(REAL);
const launch=async()=>{ const env=Object.assign({},process.env,{ LDS_TEST_BUILD:'1', LDS_TEST_REAL_DIR:REAL, LDS_CLAUDE_BIN:'/nonexistent' }); delete env.LDS_CLOUD_OFF; delete env.LDS_CLOUD_URL;
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+MINE,'--no-sandbox'],cwd:APP,env});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300))); await page.route(/^https?:\/\//,r=>r.abort());
  return { app, page, errors }; };
(async()=>{
  let L=await launch();
  ok(await L.page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}).then(()=>true).catch(()=>false), 'the test build opens the app — no sign-in page, though a shared database is set up (cloud-config.json)');
  await L.page.waitForTimeout(1500);
  let s=await L.page.evaluate(()=>({ names: window.LDS_loans().map(l=>l.propertyName).sort(), bar:(document.getElementById('testBuildBar')||{}).textContent||'', cloud: !!(window.ldsShell&&ldsShell.cloudMode) }));
  ok(s.names.indexOf('Group Picture Plaza')>=0 && s.names.indexOf('Group Picture Lofts')>=0 && s.names.indexOf('Own Data Court')<0, 'its data is a copy of the group’s picture (the real app was signed in), not the real app’s older own data');
  ok(/TEST app — a copy of your group’s data/.test(s.bar) && /Nothing you do here reaches your real app or the team/.test(s.bar), 'a bar says so: "'+s.bar+'"');
  ok(!s.cloud, 'not in shared-database mode');
  ok(fs.existsSync(path.join(MINE,'documents','abc','index.json')) && fs.existsSync(path.join(MINE,'test-copy.json')), 'the documents came too; test-copy.json records where from');
  // a change in the test app stays in the test app
  await L.page.evaluate(()=>{ const l=window.LDS_loans()[0]; l.lenderName='Test Bank'; });
  await L.page.evaluate(()=>{ try{ window.LDS_save && window.LDS_save(); }catch(e){} });
  await L.page.waitForTimeout(800);
  ok(L.errors.length===0, 'no page errors'+(L.errors.length?': '+L.errors.join(' | '):''));
  await L.app.close();
  ok(hashDir(REAL)===before, 'the real app’s folder is exactly as it was (read only)');
  // the copy is taken once: a later change in the real app doesn't replace the test app's data
  fs.writeFileSync(path.join(G,'loans.json'),JSON.stringify([loan('Later Loan',4000000)]));
  L=await launch(); await L.page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}).catch(()=>{}); await L.page.waitForTimeout(1000);
  s=await L.page.evaluate(()=>window.LDS_loans().map(l=>l.propertyName));
  ok(s.indexOf('Group Picture Plaza')>=0 && s.indexOf('Later Loan')<0, 'restarted: still its own copy (taken once — a later change in the real app doesn’t come over)');
  await L.app.close();
  try{ fs.rmSync(TMP,{recursive:true,force:true}); }catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all test-build-local e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
