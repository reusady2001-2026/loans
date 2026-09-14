/* e2e for v2.9.0: a T12 is content-hashed (sha1) on save, so uploading the SAME file twice does not
   create a second, phantom "newer" statement — the duplicate is recognized and the folder keeps one
   copy. Uploading a genuinely DIFFERENT T12 still saves normally.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/t12-checksum.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs'),crypto=require('crypto');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const CREST=path.join(APP,'test','fixtures','crest-t12.xlsx');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-sha-'));
const KEY='name:villages of whitewater';
const HASH=crypto.createHash('sha1').update(KEY).digest('hex').slice(0,16);
const PROPDIR=path.join(UDATA,'documents',HASH);
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const t12Files=()=>{ try{ const idx=JSON.parse(fs.readFileSync(path.join(PROPDIR,'index.json'),'utf8')); return (idx.files||[]).filter(f=>f.role==='t12'); }catch(e){ return []; } };

// a second, DIFFERENT T12 (distinct bytes) so we can prove non-duplicates still save
function makeOther(){
  const XLSX=require(path.join(APP,'vendor','xlsx.full.min.js'));
  const M=["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026","Aug 2026","Sep 2026","Oct 2026","Nov 2026","Dec 2026"];
  const gpr=Array(12).fill(50000), tax=Array(12).fill(5000), noi=gpr.map((g,i)=>g-tax[i]), sum=a=>a.reduce((x,y)=>x+y,0);
  const aoa=[["Account",...M,"Total"],["Gross Potential Rent",...gpr,sum(gpr)],["TOTAL INCOME",...gpr,sum(gpr)],
    ["Real Estate Taxes",...tax,sum(tax)],["TOTAL EXPENSES",...tax,sum(tax)],["NET OPERATING INCOME",...noi,sum(noi)]];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Report1");
  const p=path.join(UDATA,'other-t12.xlsx'); fs.writeFileSync(p,XLSX.write(wb,{type:"buffer",bookType:"xlsx"})); return p;
}
const OTHER=makeOther();

async function openUw(page){
  await page.evaluate(()=>{const b=document.getElementById('tabNewBtn');if(b)b.click();const o=document.querySelector('[data-tabopen="underwriting"]');if(o)o.click();});
  await page.waitForFunction(()=>{const v=document.getElementById('uwView');return v&&!v.hidden&&document.getElementById('opPropPick');},null,{timeout:8000});
  await page.waitForTimeout(300);
}
const pick=(page)=>page.evaluate((k)=>{const s=document.getElementById('opPropPick');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},KEY);

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);
  await openUw(page); await pick(page); await page.waitForTimeout(400);

  // first upload → one t12, with a sha recorded
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForFunction(()=>/statement NOI/.test((document.getElementById('uwView')||{}).innerText||''),null,{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(600);
  let fs1=t12Files();
  ok(fs1.length===1,'after the first upload the folder holds exactly one T12');
  ok(fs1[0]&&/^[0-9a-f]{40}$/.test(fs1[0].sha||''),'the stored T12 carries a sha1 checksum');
  const sha1=fs1[0]&&fs1[0].sha;

  // upload the SAME file again → recognized as a duplicate, still exactly one T12
  await page.setInputFiles('#uwFile',CREST);
  await page.waitForTimeout(1200);
  let fs2=t12Files();
  ok(fs2.length===1,'uploading the identical T12 again does NOT add a second copy (checksum dedup) — got '+fs2.length);
  ok(fs2[0]&&fs2[0].sha===sha1,'the one stored T12 is unchanged (same sha)');

  // a genuinely different T12 DOES save (dedup is content-based, not a blanket block)
  await page.setInputFiles('#uwFile',OTHER);
  await page.waitForTimeout(1000);
  let fs3=t12Files();
  ok(fs3.length===2,'a different T12 (distinct bytes) is saved normally — now two on file ('+fs3.length+')');
  const shas=new Set(fs3.map(f=>f.sha));
  ok(shas.size===2,'the two stored T12s have distinct checksums');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all t12-checksum e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
