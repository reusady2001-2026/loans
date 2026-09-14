/* e2e for v2.9.1: upload a typed document from the property page (Profile tab).
   Opens a property's Profile tab, uploads a file as "Loan agreement", confirms it appears in the
   Documents list with its type and lands in the property folder on disk with role "agreement", and that
   Remove takes it out.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/profile-docs.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-pdocs-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const FIX=path.join(UDATA,'agreement.txt'); fs.writeFileSync(FIX,'LOAN AGREEMENT\nBorrower: Test LLC\nUnits: 704\nMaturity: 2031-06-01\n');
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  const key=await page.evaluate(()=>{ const p=window.opProperties()[0]; window.LDS_openProfile(p.key); return p.key; });
  await page.waitForFunction(()=>{const v=document.getElementById('profileView');return v&&!v.hidden&&document.getElementById('profileDocFile');},null,{timeout:8000});
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>!!document.getElementById('profileDocType')),'the Documents card has a type selector');

  await page.selectOption('#profileDocType','agreement');
  await page.setInputFiles('#profileDocFile',FIX);
  await page.waitForFunction(()=>{const l=document.getElementById('profileDocList');return l&&/agreement\.txt/i.test(l.innerText||'');},null,{timeout:9000}).catch(()=>{});
  await page.waitForTimeout(400);
  const listTxt=await page.evaluate(()=>(document.getElementById('profileDocList')||{}).innerText||'');
  ok(/agreement\.txt/i.test(listTxt),'the uploaded file appears in the Documents list');
  ok(/Loan agreement/i.test(listTxt),'it is shown with its type (Loan agreement)');

  const HASH=crypto.createHash('sha1').update(key).digest('hex').slice(0,16);
  let role=null,textSaved=false; try{ const idx=JSON.parse(fs.readFileSync(path.join(UDATA,'documents',HASH,'index.json'),'utf8')); const f=(idx.files||[]).find(x=>x.name==='agreement.txt'); role=f&&f.role; textSaved=!!(f&&f.textLen>0); }catch(e){}
  ok(role==='agreement','the file is stored in the property folder with role "agreement"');
  ok(textSaved,'its extracted text is stored too (so Read agreement can use it)');

  // remove it
  await page.evaluate(()=>{const b=document.querySelector('#profileDocList [data-docdel]');if(b)b.click();});
  await page.waitForFunction(()=>!/agreement\.txt/i.test((document.getElementById('profileDocList')||{}).innerText||''),null,{timeout:6000}).catch(()=>{});
  ok(await page.evaluate(()=>!/agreement\.txt/i.test((document.getElementById('profileDocList')||{}).innerText||'')),'removing the document takes it out of the list');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all profile-docs e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
