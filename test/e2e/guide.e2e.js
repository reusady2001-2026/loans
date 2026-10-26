/* e2e — the in-app Guide (Settings → Guide → "Open the guide"), on the real app — the docs-style guide (2026-10-26).
   It sits under the properties and above the Claude connection and opens a window on the Overview: the pages in groups
   on the left, a search at the top, the page in the middle and "On this page" on the right. A how-to page has its
   title and description, numbered steps, a picture only where a step has one, as many numbered boxes as markers and as
   many explanations; "On this page" jumps to a section and follows the scroll; Previous / Next follow the menu; a link
   in the words opens its page; the Overview's cards and table open pages; pointing at a number lights its box; the
   search (Ctrl K) jumps to a step; a picture opens full size; Esc closes it, then the guide.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r ./test/e2e/_t12auto.js test/e2e/guide.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-guide-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const DATA=JSON.parse(fs.readFileSync(path.join(APP,'guide','guide.json'),'utf8'));
const ORDER=[]; DATA.groups.forEach(g=>g.pages.forEach(id=>ORDER.push(id)));
const P=(id)=>DATA.pages.find(p=>p.id===id);
// "On this page": on the right on a wide window, a row above the page otherwise (2026-10-26)
const tocSel=(page)=>page.evaluate(()=>(document.getElementById('guideToc')&&document.getElementById('guideToc').offsetParent!==null?'#guideToc':'[data-guidetocrow]'));

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  let win=null; try{ win=await app.browserWindow(page); await win.evaluate(w=>{w.setSize(1440,900);}); }catch(e){}
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);

  // where it is
  const pos=await page.evaluate(()=>{ const ids=[...document.querySelectorAll('#settingsDD [id]')].map(e=>e.id); return { p:ids.indexOf('settingsPortfolio'), g:ids.indexOf('settingsGuide'), c:ids.indexOf('settingsClaudeWrap'), btn:(document.getElementById('settingsGuideBtn')||{}).textContent||'' }; });
  ok(pos.g>pos.p && pos.g<pos.c && /Open the guide/.test(pos.btn), 'Settings has “Guide → Open the guide” under the properties and above the Claude connection');
  await page.evaluate(()=>{ document.getElementById('settingsDD').open=true; }); await page.waitForTimeout(200);
  // a 900-px window can't show the whole menu: it scrolls inside itself, so the guide and the Claude connection are reachable
  const fit=await page.evaluate(()=>{ const p=document.querySelector('#settingsDD > div'), g=document.getElementById('settingsGuideBtn'); const pb=p.getBoundingClientRect().bottom;
    p.scrollTop=g.offsetTop-p.clientHeight/2; const gb=g.getBoundingClientRect(); return { fits:pb<=innerHeight, seen:gb.top>=0 && gb.bottom<=Math.min(innerHeight,pb) }; });
  ok(fit.fits && fit.seen, 'the Settings menu stays inside a 900-px window and scrolls to “Open the guide” ('+JSON.stringify(fit)+')');
  await page.click('#settingsGuideBtn'); await page.waitForTimeout(1200);

  // the Overview, with every group and page in the menu
  let s=await page.evaluate(()=>({ open:!document.getElementById('guideModal').classList.contains('hidden'), dd:document.getElementById('settingsDD').open, st:window.LDS_Guide.state(),
    h1:(document.querySelector('#guideMain h1')||{}).textContent||'', nav:[...document.querySelectorAll('#guideNav [data-guidepage]')].map(b=>b.getAttribute('data-guidepage')),
    lit:[...document.querySelectorAll('#guideNav [data-guidepage][data-on="1"]')].map(b=>b.getAttribute('data-guidepage')), w:document.getElementById('guideBox').getBoundingClientRect().width/innerWidth,
    cards:document.querySelectorAll('#guideMain section button[data-guidelink]').length, rows:document.querySelectorAll('#guideMain table.gtable tbody tr a[data-guidelink]').length }));
  ok(s.open && !s.dd, 'clicking it closes the Settings menu and opens the guide’s window ('+Math.round(s.w*100)+'% wide)');
  ok(s.st.page==='overview' && s.h1==='Overview' && JSON.stringify(s.lit)==='["overview"]', 'it opens on the Overview, lit in the menu');
  ok(JSON.stringify(s.nav)===JSON.stringify(ORDER), 'the menu lists every page, group by group ('+ORDER.length+' pages in '+DATA.groups.length+' groups)');
  const ov=P('overview'); const nCards=ov.sections.reduce((a,x)=>a+(x.cards||[]).length,0), nRows=ov.sections.reduce((a,x)=>a+(x.table?x.table.rows.length:0),0);
  ok(s.cards>=nCards && s.rows===nRows, 'the Overview shows its “What you can do” cards and its “What do you want to do?” table, each a link ('+nCards+' cards, '+nRows+' rows)');
  const row=ov.sections.find(x=>x.table).table.rows[1];
  await page.click('#guideMain table.gtable a[data-guidelink="'+row[1]+'"]'); await page.waitForTimeout(700);
  ok((await page.evaluate(()=>window.LDS_Guide.state())).page===row[1], 'a row of the table opens its page (“'+row[0]+'” → '+row[1]+')');

  // a how-to page: title, description, numbered steps, pictures only where a step has one, markers and their words
  const ht=DATA.pages.filter(p=>p.kind==='howto').reduce((a,p)=>{ const n=p.sections.reduce((x,q)=>x+(q.steps||[]).length,0); return !a||n>a.n?{p,n}:a; },null).p;
  await page.click('#guideNav [data-guidepage="'+ht.id+'"]'); await page.waitForTimeout(900);
  const want=[]; ht.sections.forEach((q,si)=>(q.steps||[]).forEach((x,i)=>want.push(ht.id+'/'+si+'/s'+i)));
  s=await page.evaluate(()=>{ const m=document.getElementById('guideMain'); return { st:window.LDS_Guide.state(), h1:(m.querySelector('h1')||{}).textContent, desc:(m.querySelector('[data-guidedesc]')||{}).textContent||'',
    steps:[...m.querySelectorAll('ol.gsteps > li[data-guidestep]')].map(x=>x.getAttribute('data-guidestep')), toc:[...document.querySelectorAll((document.getElementById('guideToc')&&document.getElementById('guideToc').offsetParent!==null?'#guideToc':'[data-guidetocrow]')+' [data-guidetoc]')].map(b=>b.getAttribute('data-guidetoc')),
    row:!!document.querySelector('[data-guidetocrow]')&&document.querySelector('[data-guidetocrow]').offsetParent!==null, right:!!document.getElementById('guideToc')&&document.getElementById('guideToc').offsetParent!==null,
    lit:(document.querySelector('#guideNav [data-guidepage][data-on="1"]')||{}).getAttribute&&document.querySelector('#guideNav [data-guidepage][data-on="1"]').getAttribute('data-guidepage') }; });
  const wantToc=(ht.before&&ht.before.length?['before-you-start']:[]).concat(ht.sections.map(q=>q.id), ht.next&&ht.next.length?['next-steps']:[]);
  ok(s.st.page===ht.id && s.h1===ht.title && s.desc && s.lit===ht.id, 'a how-to opens with its title, its description and its place lit in the menu ('+ht.title+')');
  ok(JSON.stringify(s.steps)===JSON.stringify(want), '…every one of its '+want.length+' steps numbered, in order');
  ok(JSON.stringify(s.toc)===JSON.stringify(wantToc), '…and “On this page” lists its sections ('+s.toc.join(', ')+')');
  ok(s.row && !s.right, '…on a 1,440-px window “On this page” is a row above the page, so the pictures get the width');
  // the pictures get the room (2026-10-26, the operator: "the guide pictures look small"): a whole-window picture shows at 70% or more on a 1,440 × 900 window
  const big=await page.evaluate(()=>{ const a=[...document.querySelectorAll('#guideMain [data-guideimg]')].map(d=>({w:+d.querySelector('img').getAttribute('width'),s:d.getBoundingClientRect().width})).filter(x=>x.w>=1400); return a.length?Math.min(...a.map(x=>x.s/x.w)):null; });
  ok(big==null || big>=0.7, 'a whole-window picture shows at '+(big==null?'—':Math.round(big*100)+'%')+' of its size (70% or more)');
  const per=await page.evaluate((ht)=>{ const bad=[]; ht.sections.forEach((q,si)=>(q.steps||[]).forEach((x,i)=>{ const a=document.querySelector('#guideMain [data-guidestep="'+ht.id+'/'+si+'/s'+i+'"]'), n=(x.marks||[]).length;
      const img=a&&a.querySelector('[data-guideimg] img'), boxes=a?a.querySelectorAll('[data-guidebox]').length:-1, items=a?a.querySelectorAll('[data-guidemarks] li').length:-1;
      if(!a||!!img!==!!x.img||boxes!==n||items!==n||(img&&(img.getAttribute('loading')!=='lazy'||!(Number(img.getAttribute('width'))>0)))) bad.push(si+'/'+i+' img '+!!img+'/'+!!x.img+' boxes '+boxes+' items '+items+' / '+n); })); return bad; }, ht);
  ok(!per.length, '…a picture only where its step has one (loaded lazily, its size set), as many numbered boxes as markers and as many explanations'+(per.length?': '+per.slice(0,4).join(' | '):''));

  // "On this page" jumps to a section, and follows the scroll
  const sec=ht.sections[Math.min(1,ht.sections.length-1)];
  await page.click((await tocSel(page))+' [data-guidetoc="'+sec.id+'"]'); await page.waitForTimeout(1200);
  s=await page.evaluate((id)=>{ const m=document.getElementById('guideMain'), h=m.querySelector('h2[data-guidesec="'+id+'"]'), r=h.getBoundingClientRect(), mr=m.getBoundingClientRect(); return { st:window.LDS_Guide.state(), inView:r.top>=mr.top-2&&r.top<mr.top+m.clientHeight/2, lit:document.querySelector('[data-guidetocrow] [data-guidetoc="'+id+'"]').getAttribute('data-on') }; }, sec.id);
  ok(s.inView && s.st.section===sec.id && s.lit==='1', 'clicking “'+sec.title+'” in “On this page” scrolls to it and lights it');
  await page.evaluate(()=>{ const m=document.getElementById('guideMain'); m.dispatchEvent(new WheelEvent('wheel',{bubbles:true})); m.scrollTop=m.scrollHeight; }); await page.waitForTimeout(500);
  s=await page.evaluate(()=>window.LDS_Guide.state());
  ok(s.section===wantToc[wantToc.length-1], 'at the very end, the last section is lit ('+s.section+')');
  await page.evaluate(()=>{ const m=document.getElementById('guideMain'); m.dispatchEvent(new WheelEvent('wheel',{bubbles:true})); m.scrollTop=0; }); await page.waitForTimeout(500);
  ok((await page.evaluate(()=>window.LDS_Guide.state())).section===wantToc[0], '…and back at the top, the first');

  // Previous / Next follow the menu
  const i=ORDER.indexOf(ht.id);
  await page.click('#guideMain [data-guidenext]'); await page.waitForTimeout(700);
  ok((await page.evaluate(()=>window.LDS_Guide.state())).page===ORDER[i+1], 'Next opens the next page in the menu ('+ORDER[i+1]+')');
  await page.click('#guideMain [data-guideprev]'); await page.waitForTimeout(700);
  ok((await page.evaluate(()=>window.LDS_Guide.state())).page===ht.id, '…and Previous comes back');
  // a link in the words opens its page
  const lk=await page.evaluate(()=>{ const a=document.querySelector('#guideMain [data-guidetext] a[data-guidelink], #guideMain p a[data-guidelink]'); return a?a.getAttribute('data-guidelink'):null; });
  if(lk){ await page.click('#guideMain a[data-guidelink="'+lk+'"] >> nth=0'); await page.waitForTimeout(700); ok((await page.evaluate(()=>window.LDS_Guide.state())).page===lk.split('#')[0], 'a link in the words opens its page ('+lk+')'); }
  // Next steps cards
  await page.evaluate((id)=>window.LDS_Guide.open(id),ht.id); await page.waitForTimeout(700);
  const nx=ht.next[0];
  await page.click('#guideMain section button[data-guidelink="'+nx.page+(nx.anchor?'#'+nx.anchor:'')+'"]'); await page.waitForTimeout(700);
  ok((await page.evaluate(()=>window.LDS_Guide.state())).page===nx.page, 'a “Next steps” card opens its page ('+nx.page+')');

  // a reference page: every view a picture with its controls named; pointing at a number lights its box
  const rf=DATA.pages.filter(p=>p.kind==='reference').reduce((a,p)=>{ const n=p.sections.reduce((x,q)=>x+(q.views||[]).reduce((y,v)=>y+(v.marks||[]).length,0),0); return !a||n>a.n?{p,n}:a; },null).p;
  await page.click('#guideNav [data-guidepage="'+rf.id+'"]'); await page.waitForTimeout(900);
  const rper=await page.evaluate((rf)=>{ const bad=[]; rf.sections.forEach((q,si)=>(q.views||[]).forEach((x,i)=>{ const a=document.querySelector('#guideMain [data-guidestep="'+rf.id+'/'+si+'/v'+i+'"]'), n=(x.marks||[]).length;
      if(!a||!a.querySelector('[data-guideimg] img')||a.querySelectorAll('[data-guidebox]').length!==n||a.querySelectorAll('[data-guidemarks] li').length!==n) bad.push(si+'/'+i); })); return bad; }, rf);
  ok(!rper.length, 'a reference page shows every view with its picture and every control named ('+rf.title+')'+(rper.length?': '+rper.join(', '):''));
  const hl=await page.evaluate(()=>{ const a=[...document.querySelectorAll('#guideMain [data-guidestep]')].find(x=>x.querySelectorAll('[data-guidemarks] li').length>=2); a.scrollIntoView();
    const li=a.querySelector('[data-guidemarks] li[data-guidemk="2"]'); li.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    const box=a.querySelector('[data-guidebox="2"]').style.outline, others=[...document.querySelectorAll('#guideMain [data-guidebox="2"]')].filter(b=>!a.contains(b)&&b.style.outline).length;
    a.querySelector('[data-guidebox="1"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    return { box, others, li1:a.querySelector('[data-guidemarks] li[data-guidemk="1"]').classList.contains('glit'), li2:li.classList.contains('glit') }; });
  ok(/solid/.test(hl.box) && !hl.others && hl.li1 && !hl.li2, 'pointing at number 2 in the list lights box 2 (in that picture only); pointing at box 1 lights number 1');

  // the search: Ctrl K, a word, Enter jumps to the first result; a result opens its page at the step, lit for a moment
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200);
  ok(await page.evaluate(()=>document.activeElement&&document.activeElement.id==='guideSearch'), 'Ctrl K puts the cursor in the search');
  const st0=DATA.pages.find(p=>p.kind==='howto'&&p.sections.some(q=>(q.steps||[]).some(x=>x.img)));
  const word=(st0.title.split(/\s+/).filter(x=>x.length>4)[0]||st0.title).toLowerCase();
  await page.keyboard.type(word); await page.waitForTimeout(500);
  s=await page.evaluate(()=>({ n:document.querySelectorAll('#guideMain [data-guidejump]').length, h:(document.querySelector('#guideMain h1')||{}).textContent||'' }));
  ok(s.n>0 && /result/.test(s.h), 'typing “'+word+'” lists the results ('+s.h+')');
  const stepKey=await page.evaluate(()=>{ const b=[...document.querySelectorAll('#guideMain [data-guidejump]')].find(x=>/\/\d+\/[sv]\d+$/.test(x.getAttribute('data-guidejump'))); return b?b.getAttribute('data-guidejump'):null; });
  if(stepKey){ await page.click('#guideMain [data-guidejump="'+stepKey+'"]'); await page.waitForTimeout(700);
    s=await page.evaluate((k)=>{ const m=document.getElementById('guideMain'), a=m.querySelector('[data-guidestep="'+k+'"]'), r=a&&a.getBoundingClientRect(), mr=m.getBoundingClientRect(); return { st:window.LDS_Guide.state(), lit:!!a&&a.classList.contains('gflash'), inView:!!r&&r.top>=mr.top-2&&r.top<mr.top+m.clientHeight/2, q:document.getElementById('guideSearch').value }; }, stepKey);
    ok(s.st.page===stepKey.split('/')[0] && s.lit && s.inView && !s.q, 'a result opens its page scrolled to that step, lit for a moment ('+stepKey+')'); }
  await page.fill('#guideSearch','zzqqxx'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>/^0 results/.test((document.querySelector('#guideMain h1')||{}).textContent||'')), 'a word the guide doesn’t have finds nothing (“0 results”)');
  await page.fill('#guideSearch',word); await page.waitForTimeout(300); await page.press('#guideSearch','Enter'); await page.waitForTimeout(700);
  ok(await page.evaluate(()=>!document.getElementById('guideSearch').value&&!!window.LDS_Guide.state().page), 'Enter opens the first result');

  // full size, close
  await page.evaluate((id)=>window.LDS_Guide.open(id),ht.id); await page.waitForTimeout(700);
  await page.evaluate(()=>{ const a=document.querySelector('#guideMain [data-guideimg]'); a.scrollIntoView(); a.click(); }); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>!document.getElementById('guideZoom').classList.contains('hidden')&&!!document.querySelector('#guideZoom img').getAttribute('src')), 'clicking a picture shows it full size');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.evaluate(()=>document.getElementById('guideZoom').classList.contains('hidden')&&!document.getElementById('guideModal').classList.contains('hidden')), 'Esc closes the full-size picture (the guide stays open)');

  // the window's width: a wide one shows "On this page" and a reference picture's list beside it; a narrow one neither
  if(win){
    await win.evaluate(w=>{ w.setSize(1920,1080); }); await page.waitForTimeout(700);
    await page.evaluate((id)=>window.LDS_Guide.open(id),rf.id); await page.waitForTimeout(800);
    const wr=await page.evaluate(()=>{ const a=[...document.querySelectorAll('#guideMain [data-guidestep]')].find(x=>x.querySelectorAll('[data-guidemarks] li').length>3&&+x.querySelector('[data-guideimg] img').getAttribute('width')>=1400); a.scrollIntoView(); const d=a.querySelector('[data-guideimg]'), p=d.getBoundingClientRect(), l=a.querySelector('[data-guidemarks]').getBoundingClientRect(); const t=document.getElementById('guideToc');
      return { scale:p.width/+d.querySelector('img').getAttribute('width'), under:l.top>=p.bottom-1, toc:!!t&&t.offsetParent!==null }; });
    ok(wr.toc && wr.under && wr.scale>=0.85, 'on a 1,920-px window “On this page” sits on the right, and a whole-window reference picture keeps the width ('+Math.round(wr.scale*100)+'% of its size, its list under it)');
    await win.evaluate(w=>{ w.setSize(1000,860); }); await page.waitForTimeout(700);
    const nr=await page.evaluate(()=>{ const m=document.getElementById('guideMain'), a=[...m.querySelectorAll('[data-guidestep]')].find(x=>x.querySelector('[data-guidemarks]')); a.scrollIntoView(); const p=a.querySelector('[data-guideimg]').getBoundingClientRect(), l=a.querySelector('[data-guidemarks]').getBoundingClientRect(); const t=document.getElementById('guideToc'); return { w:m.clientWidth, under:l.top>=p.bottom-1, toc:!!t&&t.offsetParent!==null, sideways:m.scrollWidth>m.clientWidth+1 }; });
    ok(nr.under && !nr.toc && !nr.sideways, 'on a narrow window the list goes under the picture, “On this page” hides and nothing scrolls sideways (the page '+nr.w+' px wide)');
    await win.evaluate(w=>{ w.setSize(1440,900); }); await page.waitForTimeout(500); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>document.getElementById('guideModal').classList.contains('hidden')), 'Esc closes the guide');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all guide e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
