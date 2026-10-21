/* e2e — the in-app Guide (Settings → Guide → "Open the guide"), on the real app — the scroll guide (2026-10-21).
   It sits under the properties and above the Claude connection; it opens a window that lists every chapter; a chapter
   opens as ONE long page — every topic a heading, every step under it (its picture with numbered markers, and beside
   it what each number does); no Back / Next. The menu on the left jumps to a topic and follows the scroll; pictures
   load as they come into view (every one loads); pointing at a number lights its box; the search jumps to a step;
   a picture opens full size; Esc closes it, then the guide.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r ./test/e2e/_t12auto.js test/e2e/guide.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-guide-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const DATA=JSON.parse(fs.readFileSync(path.join(APP,'guide','guide.json'),'utf8'));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

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
    p.scrollTop=g.offsetTop-p.clientHeight/2; const gb=g.getBoundingClientRect(); return { fits:pb<=innerHeight, scrolls:p.scrollHeight>p.clientHeight && getComputedStyle(p).overflowY==='auto', seen:gb.top>=0 && gb.bottom<=Math.min(innerHeight,pb) }; });
  ok(fit.fits && fit.seen, 'the Settings menu stays inside a 900-px window and scrolls to “Open the guide” ('+JSON.stringify(fit)+')');
  await page.click('#settingsGuideBtn'); await page.waitForTimeout(900);
  let s=await page.evaluate(()=>({ open:!document.getElementById('guideModal').classList.contains('hidden'), dd:document.getElementById('settingsDD').open, cards:[...document.querySelectorAll('#guideMain [data-guidech]')].map(b=>b.getAttribute('data-guidech')), nav:document.querySelectorAll('#guideNav [data-guidech]').length,
    w:document.getElementById('guideBox').getBoundingClientRect().width/innerWidth }));
  ok(s.open && !s.dd, 'clicking it closes the Settings menu and opens the guide’s window ('+Math.round(s.w*100)+'% wide)');
  ok(JSON.stringify(s.cards)===JSON.stringify(DATA.chapters.map(c=>c.id)) && s.nav===DATA.chapters.length, 'it opens on “What do you need help with?” with every chapter ('+s.cards.join(', ')+')');

  // a chapter → one long page: every topic a heading, every step under it, in order
  const ch=DATA.chapters.reduce((a,c)=>{ const n=c.topics.reduce((x,t)=>x+t.steps.length,0); return !a||n>a.n?{c,n}:a; },null).c;   // the longest chapter
  const want=[]; ch.topics.forEach(t=>t.steps.forEach((x,i)=>want.push(ch.id+'/'+t.id+'/'+i)));
  await page.click('#guideMain [data-guidech="'+ch.id+'"]'); await page.waitForTimeout(900);
  s=await page.evaluate(()=>{ const m=document.getElementById('guideMain'); return { st:window.LDS_Guide.state(), heads:[...m.querySelectorAll('h3[data-guidetp]')].map(h=>h.getAttribute('data-guidetp')), steps:[...m.querySelectorAll('[data-guidestep]')].map(x=>x.getAttribute('data-guidestep')),
    navTopics:document.querySelectorAll('#guideNav button[data-guidetp]').length, scroll:m.scrollHeight>m.clientHeight*5,
    arrows:document.querySelectorAll('#guideModal [data-guidenext],#guideModal [data-guideprev],#guideModal [data-guidecount]').length+(/Step \d+ of \d+/.test(m.innerText)?1:0) }; });
  ok(s.st.chapter===ch.id && JSON.stringify(s.heads)===JSON.stringify(ch.topics.map(t=>ch.id+'/'+t.id)) && s.navTopics===ch.topics.length, 'a chapter opens as one page with all its '+ch.topics.length+' topics as headings, and the menu lists them ('+ch.title+')');
  ok(JSON.stringify(s.steps)===JSON.stringify(want) && s.scroll, '…and every one of its '+want.length+' steps under them, in order, on one long scroll');
  ok(s.arrows===0, 'no Back / Next, no step dots, no “Step X of N”');
  const lazy0=await page.evaluate(()=>{ const im=[...document.querySelectorAll('#guideMain [data-guideimg] img')]; return { n:im.length, loaded:im.filter(i=>i.complete&&i.naturalWidth>0).length }; });   // just opened, at the top
  const per=await page.evaluate((ch)=>{ const bad=[]; ch.topics.forEach(t=>t.steps.forEach((x,i)=>{ const a=document.querySelector('#guideMain [data-guidestep="'+ch.id+'/'+t.id+'/'+i+'"]'); const n=(x.marks||[]).length;
      const img=a&&a.querySelector('[data-guideimg] img'), boxes=a?a.querySelectorAll('[data-guidebox]').length:-1, items=a?a.querySelectorAll('[data-guidemarks] li').length:-1;
      if(!a||!img||boxes!==n||items!==n||img.getAttribute('loading')!=='lazy'||!(Number(img.getAttribute('width'))>0)) bad.push(t.id+'/'+i+' boxes '+boxes+' items '+items+' / '+n); })); return bad; }, ch);
  ok(!per.length, 'every step has its picture (loaded lazily, its size set), as many numbered boxes as markers and as many explanations'+(per.length?': '+per.slice(0,4).join(' | '):''));
  // beside the picture on a wide window
  const side=await page.evaluate(()=>{ const a=document.querySelector('#guideMain [data-guidestep]'), p=a.querySelector('[data-guideimg]').getBoundingClientRect(), l=a.querySelector('[data-guidemarks]').getBoundingClientRect(); return { beside:l.left>=p.right-1 && l.top<p.bottom }; });
  ok(side.beside, 'on a wide window the explanations sit beside the picture');

  // the menu jumps to a topic; the scroll-spy follows
  const mid=ch.topics[Math.floor(ch.topics.length/2)];
  await page.click('#guideNav button[data-guidetp="'+ch.id+'/'+mid.id+'"]'); await page.waitForTimeout(1300);
  s=await page.evaluate((k)=>{ const m=document.getElementById('guideMain'), h=m.querySelector('h3[data-guidetp="'+k+'"]'), r=h.getBoundingClientRect(), mr=m.getBoundingClientRect(); return { st:window.LDS_Guide.state(), inView:r.top>=mr.top-2 && r.top<mr.top+m.clientHeight/2, lit:(document.querySelector('#guideNav button[data-guidetp="'+k+'"]')||{}).getAttribute('data-on'), crumb:document.getElementById('guideCrumb').textContent }; }, ch.id+'/'+mid.id);
  ok(s.inView && s.st.topic===mid.id && s.lit==='1' && s.crumb.indexOf(mid.title)>=0, 'clicking “'+mid.title+'” in the menu scrolls to it; the menu and the title follow');
  const later=ch.topics[ch.topics.length-2];
  await page.evaluate((k)=>{ const m=document.getElementById('guideMain'), h=m.querySelector('h3[data-guidetp="'+k+'"]'); m.dispatchEvent(new WheelEvent('wheel',{bubbles:true})); m.scrollTop+=h.getBoundingClientRect().top-m.getBoundingClientRect().top-20; }, ch.id+'/'+later.id);
  await page.waitForTimeout(600);
  s=await page.evaluate(()=>window.LDS_Guide.state());
  ok(s.topic===later.id, 'scrolling down to “'+later.title+'” lights it in the menu ('+s.topic+')');
  await page.evaluate(()=>{ const m=document.getElementById('guideMain'); m.dispatchEvent(new WheelEvent('wheel',{bubbles:true})); m.scrollTop=0; }); await page.waitForTimeout(500);
  ok((await page.evaluate(()=>window.LDS_Guide.state())).topic===ch.topics[0].id, '…and back at the top, the first topic');

  // pictures load as they come into view — and every one loads
  await page.evaluate(async()=>{ const m=document.getElementById('guideMain'); for(let y=0;y<=m.scrollHeight;y+=Math.round(m.clientHeight*0.8)){ m.scrollTop=y; await new Promise(r=>setTimeout(r,120)); } m.scrollTop=m.scrollHeight; });
  let lazy1=null; for(let i=0;i<40;i++){ lazy1=await page.evaluate(()=>{ const im=[...document.querySelectorAll('#guideMain [data-guideimg] img')]; return { n:im.length, loaded:im.filter(i=>i.complete&&i.naturalWidth>0).length, bad:im.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')) }; }); if(lazy1.loaded===lazy1.n) break; await sleep(250); }
  ok(lazy0.loaded<lazy0.n, 'pictures load as they come into view ('+lazy0.loaded+' of '+lazy0.n+' at the top)');
  ok(lazy1.loaded===lazy1.n && lazy1.n===want.length, 'scrolled to the end, every picture of the chapter has loaded ('+lazy1.loaded+' of '+lazy1.n+')'+(lazy1.bad.length?': '+lazy1.bad.slice(0,3).join(', '):''));
  ok((await page.evaluate(()=>window.LDS_Guide.state())).topic===ch.topics[ch.topics.length-1].id, 'at the very end, the last topic is lit');

  // pointing at an explanation lights its box (in that step only), and pointing at a box lights its explanation
  const hl=await page.evaluate(()=>{ const a=[...document.querySelectorAll('#guideMain [data-guidestep]')].find(x=>x.querySelectorAll('[data-guidemarks] li').length>=2); a.scrollIntoView();
    const li=a.querySelector('[data-guidemarks] li[data-guidemk="2"]'); li.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    const box=a.querySelector('[data-guidebox="2"]').style.outline, others=[...document.querySelectorAll('#guideMain [data-guidebox="2"]')].filter(b=>!a.contains(b)&&b.style.outline).length;
    a.querySelector('[data-guidebox="1"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    return { box, others, li1:a.querySelector('[data-guidemarks] li[data-guidemk="1"]').classList.contains('glit'), li2:li.classList.contains('glit') }; });
  ok(/solid/.test(hl.box) && hl.others===0, 'pointing at explanation 2 lights box 2 of that picture only');
  ok(hl.li1 && !hl.li2, 'pointing at box 1 on the picture lights explanation 1');

  // search → a step in another chapter, scrolled to and lit
  const other=DATA.chapters.find(c=>c.id!==ch.id&&c.topics.length>2), ot=other.topics[other.topics.length-1], os=ot.steps[ot.steps.length-1];
  const word=(os.title+' '+ot.title).split(/\s+/).map(w=>w.replace(/[^A-Za-z]/g,'')).sort((a,b)=>b.length-a.length)[0];
  await page.fill('#guideSearch',word); await page.waitForTimeout(400);
  s=await page.evaluate(()=>({ n:document.querySelectorAll('#guideMain [data-guidejump]').length, h:(document.querySelector('#guideMain h2')||{}).textContent||'' }));
  ok(s.n>=1 && /result/.test(s.h), 'the search finds steps (“'+word+'”: '+s.h+')');
  const key=other.id+'/'+ot.id+'/'+(ot.steps.length-1);
  const has=await page.evaluate((k)=>!!document.querySelector('#guideMain [data-guidejump="'+k+'"]'),key);
  await page.click(has?'#guideMain [data-guidejump="'+key+'"]':'#guideMain [data-guidejump] >> nth=0'); await page.waitForTimeout(700);
  s=await page.evaluate(()=>{ const m=document.getElementById('guideMain'), a=m.querySelector('[data-guidestep].gflash'), r=a&&a.getBoundingClientRect(), mr=m.getBoundingClientRect();
    return { st:window.LDS_Guide.state(), key:a?a.getAttribute('data-guidestep'):null, inView:!!r&&r.top>=mr.top-2&&r.top<mr.top+m.clientHeight/2, q:document.getElementById('guideSearch').value }; });
  ok(s.key && s.inView && s.st.chapter===s.key.split('/')[0] && s.st.topic===s.key.split('/')[1] && !s.q, 'a result opens its chapter scrolled to that step, lit for a moment ('+s.key+')');

  // full size, close
  await page.evaluate((k)=>{ const a=document.querySelector('#guideMain [data-guidestep="'+k+'"] [data-guideimg]'); (a||document.querySelector('#guideMain [data-guideimg]')).click(); }, s.key); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>!document.getElementById('guideZoom').classList.contains('hidden')&&!!document.querySelector('#guideZoom img').getAttribute('src')), 'clicking a picture shows it full size');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.evaluate(()=>document.getElementById('guideZoom').classList.contains('hidden')&&!document.getElementById('guideModal').classList.contains('hidden')), 'Esc closes the full-size picture (the guide stays open)');

  // a narrow window: the explanations go under the picture
  if(win){ await win.evaluate(w=>{ w.setSize(1000,860); }); await page.waitForTimeout(700);
    const nr=await page.evaluate(()=>{ const m=document.getElementById('guideMain'), a=m.querySelector('[data-guidestep]'); a.scrollIntoView(); const p=a.querySelector('[data-guideimg]').getBoundingClientRect(), l=a.querySelector('[data-guidemarks]').getBoundingClientRect(); return { w:m.clientWidth, under:l.top>=p.bottom-1 }; });
    ok(nr.under, 'on a narrow window the explanations go under the picture (the page '+nr.w+' px wide)');
    await win.evaluate(w=>{ w.setSize(1440,900); }); await page.waitForTimeout(500); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>document.getElementById('guideModal').classList.contains('hidden')), 'Esc again closes the guide');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all guide e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
