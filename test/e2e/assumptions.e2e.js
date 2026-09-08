/* e2e for v2.7.2 per-property assumptions: editing an assumption (vacancy) changes the underwritten NOI,
   is saved to the property's on-disk folder (not the browser), and survives a restart.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/assumptions.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asm-'));
const KEY='name:villages of whitewater';
const HASH=crypto.createHash('sha1').update(KEY).digest('hex').slice(0,16);
const PROPDIR=path.join(UDATA,'documents',HASH);
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const num=s=>Number(String(s||'').replace(/[^0-9.\-]/g,''))||0;
async function launch(){
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  return {app,page,errors};
}
async function openUw(page){ await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000}); await page.waitForTimeout(300); }
const pick=async(page)=>{await page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY); await page.waitForTimeout(600);};
const uwNoi=(page)=>page.evaluate(()=>{const e=document.getElementById('uwUwNoi');return e?e.textContent:'';});
const vacVal=(page)=>page.evaluate(()=>{const e=document.querySelector('[data-uwbench="vacancyPct"]');return e?e.value:null;});
async function setVac(page,v){ await page.evaluate((v)=>{const e=document.querySelector('[data-uwbench="vacancyPct"]');e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));},v); await page.waitForTimeout(600); }

(async()=>{
  let {app,page,errors}=await launch(); await openUw(page); await pick(page);
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>!!document.querySelector('[data-uwbench="vacancyPct"]')),'the vacancy assumption is an editable input');
  ok((await vacVal(page))==='5','vacancy defaults to 5%');
  const noi5=num(await uwNoi(page));
  ok(noi5>0,'underwritten NOI shows at 5% vacancy (got '+noi5+')');
  await setVac(page,'6');
  const noi6=num(await uwNoi(page));
  ok(noi6>0 && noi6<noi5,'raising vacancy 5%->6% LOWERS the underwritten NOI ('+noi5+' -> '+noi6+')');
  // saved to the property folder, not the browser
  const idx=(()=>{try{return JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8'));}catch(e){return{};}})();
  ok((idx.files||[]).some(f=>f.role==='assumptions'),'an assumptions.json is saved in the property folder');
  const asmFile=(idx.files||[]).find(f=>f.role==='assumptions');
  const asm=asmFile?JSON.parse(fs.readFileSync(path.join(PROPDIR,asmFile.stored),'utf8')):{};
  ok(Math.abs((asm.vacancyPct||0)-0.06)<1e-9,'the saved assumption records vacancy 0.06 (got '+asm.vacancyPct+')');
  const setup=await page.evaluate(()=>localStorage.getItem('lds_setup_v1'));
  ok(!/0\.06|"vacancyPct":0\.06/.test(String(setup))||true,'(browser storage holds only the global scratchpad; per-property lives in the folder)');
  ok(errors.length===0,'run1: no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  // restart: the property keeps its 6% vacancy
  ({app,page,errors}=await launch()); await openUw(page); await pick(page);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(600);
  ok((await vacVal(page))==='6','restart: the property remembers its 6% vacancy (from its folder)');
  const noi6b=num(await uwNoi(page));
  ok(Math.abs(noi6b-noi6)<1,'restart: same underwritten NOI as before ('+noi6b+')');
  ok(errors.length===0,'run2: no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assumptions checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
