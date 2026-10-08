/* e2e (2.9.5 Phase B): the Maturity & Reset Calendar summary chips are clickable tiles. Clicking a
   count tile (Maturing / ARM resets / IO step-ups, next 12 mo) filters the list below to EXACTLY the
   loans it counts — the number on the tile equals the rows shown — each row still opening its loan.
   Answers Azriel 49:42/50:01 ("IO step ups next 12 months 4… can I click on them?… nothing's clickable").
   Also validates the calendar-doc JS (CAL_JS, a template-literal string synchk can't see inside) parses.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/calendar-tiles.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-caltiles-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // open the Maturity & Reset Calendar tab (tab strip "+" menu → calendar)
  await page.click('#tabNewBtn');
  await page.click('[data-tabopen="calendar"]');
  await page.waitForFunction(()=>{ const p=document.getElementById('calendarPanel'); return p && !p.hidden; },null,{timeout:8000});
  await page.waitForTimeout(700);   // let the iframe srcdoc load

  const fh=await page.waitForSelector('#calendarFrame',{timeout:8000});
  const frame=await fh.contentFrame();
  ok(!!frame,'the calendar iframe is reachable');
  await frame.waitForSelector('.chips .chip',{timeout:8000});   // if CAL_JS failed to parse, nothing renders and this times out
  ok(true,'the calendar rendered — chips present (CAL_JS parses after the edits)');

  // the four chips exist and carry the new data-chip keys
  const chips=await frame.evaluate(()=>[...document.querySelectorAll('.chip')].map(c=>({
    key:c.getAttribute('data-chip'), val:(c.querySelector('.chipval').textContent||'').trim(),
    label:(c.querySelector('.chiplabel').textContent||'').trim() })));
  ok(chips.length===4,'four summary tiles render ('+chips.length+')');
  ok(chips.every(c=>c.key),'every tile is now a clickable target (has data-chip): '+chips.map(c=>c.key).join(', '));

  const total=await frame.evaluate(()=>document.querySelectorAll('table.events tbody tr[data-loan]').length);
  ok(total>0,'the unfiltered list shows event rows ('+total+')');

  // each COUNT tile filters the list to exactly its number, of the matching type
  const CASES=[{key:'maturing-12',type:/Maturity/i,name:'Maturing (next 12 mo)'},
               {key:'reset-12',type:/ARM reset/i,name:'ARM resets (next 12 mo)'},
               {key:'io-12',type:/IO ends/i,name:'IO step-ups (next 12 mo)'}];
  for(const c of CASES){
    const shown=Number((chips.find(x=>x.key===c.key)||{}).val);
    await frame.evaluate((k)=>document.querySelector('[data-chip="'+k+'"]').click(),c.key);
    await frame.waitForTimeout(120);
    const r=await frame.evaluate((k)=>{
      const rows=[...document.querySelectorAll('table.events tbody tr[data-loan]')];
      const badges=rows.map(tr=>{const b=tr.querySelector('.badge'); return b?(b.textContent||'').trim():'';});
      return { count:rows.length, badges, cur:!!document.querySelector('.chip.cur[data-chip="'+k+'"]'),
        hint:!!document.querySelector('.chiphint'), clickable: rows.every(tr=>tr.getAttribute('data-iso')) };
    },c.key);
    ok(r.count===shown,c.name+': list shows exactly the tile number ('+r.count+' rows = '+shown+' on the tile)');
    ok(r.cur,c.name+': the clicked tile is marked active');
    ok(r.hint,c.name+': a "click again to clear" hint shows');
    if(shown>0){ ok(r.badges.every(b=>c.type.test(b)),c.name+': every listed row is the matching event type');
                 ok(r.clickable,c.name+': every listed row still carries its loan link (data-iso) to jump to the loan'); }
    // click again → filter clears, full list returns
    await frame.evaluate((k)=>document.querySelector('[data-chip="'+k+'"]').click(),c.key);
    await frame.waitForTimeout(120);
    const back=await frame.evaluate(()=>document.querySelectorAll('table.events tbody tr[data-loan]').length);
    ok(back===total,c.name+': clicking the active tile again clears the filter (back to '+total+')');
  }

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all calendar-tiles e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
