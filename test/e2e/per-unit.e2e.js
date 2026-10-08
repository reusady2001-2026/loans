/* e2e (cleanup): the $/unit columns are ALWAYS on — there is no per-user toggle. Every NOI line shows
   in-place $ and $/unit, and underwritten $ (editable) with a DERIVED underwritten $/unit (total ÷ units).
   With no units, the $/unit view shows a "Units missing" state linking to the property profile. Driven
   through LDS_uwSetupHtml (build a Setup from category sums, render the same table the tab uses).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/per-unit.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-pu-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const SUMS={ GPR:1000000, VAC:-50000, PAY:200000, RET:50000 };

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- there is NO per-unit toggle anymore ----
  ok(await page.evaluate(()=>typeof window.LDS_perUnitOn==='undefined' && typeof window.LDS_perUnitSet==='undefined'),'the per-unit toggle diagnostics are gone (columns are always on)');

  // ---- always on: $/unit columns render with units, and tie to the totals (NOI $/unit × units ≈ NOI total) ----
  const on=await page.evaluate(([m,u])=>{
    var html=window.LDS_uwSetupHtml(m,u,{});
    var d=document.createElement('div'); d.innerHTML=html;
    var ths=Array.prototype.slice.call(d.querySelectorAll('table thead th'));
    var trs=Array.prototype.slice.call(d.querySelectorAll('table tbody tr'));
    var tr=trs.find(function(r){ return /net operating income/i.test((r.cells[0]||{}).innerText||''); });
    var money=function(s){ return Number(String(s||'').replace(/[^0-9.\-]/g,''))||0; };
    return { err: html.indexOf('ERR:')===0, cols: ths.length, hasPerHdr:/\$\/unit/i.test(html),
      noInput: !d.querySelector('input[data-uwlineper]'),
      uwTotal: tr?money(tr.cells[3].innerText):0, uwPer: tr?money(tr.cells[4].innerText):0 };
  },[SUMS,100]);
  ok(!on.err,'the setup renders');
  ok(on.cols===5,'the table always shows 5 columns: line + in-place $ + $/unit + underwritten $ + $/unit');
  ok(on.hasPerHdr,'the $/unit columns are present (no toggle needed)');
  ok(on.noInput,'the $/unit column is DERIVED — there is no $/unit input');
  ok(on.uwPer>0 && Math.abs(on.uwTotal/100 - on.uwPer) <= Math.max(1, on.uwPer*0.01),'the underwritten NOI $/unit ties to the total: '+on.uwPer+' ≈ '+on.uwTotal+' / 100');

  // ---- units missing: the $/unit cells fall back to a dash and the tab points to the property profile ----
  const missing=await page.evaluate((m)=>window.LDS_uwSetupHtml(m,null,{}),SUMS);
  ok(/units missing/i.test(missing),'with no units, the tab shows the "Units missing" state');
  ok(/units field above/i.test(missing),'…pointing to the Units field above (2.9.4: the profile link was removed — units auto-load from the rent roll / are set here)');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all per-unit e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
