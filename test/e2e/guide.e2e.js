/* e2e — the in-app Guide (Settings → Guide → "Open the guide"), on the real app.
   It sits under the properties and above the Claude connection; it opens a window that lists every chapter; a
   chapter lists its topics; a topic walks through its steps (a picture of the app with numbered markers and what each
   one does); Back / Next and the ← → keys move through it, past the last step into the next topic; the search finds a
   step; Esc closes it. Every picture it shows loads.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node -r ./test/e2e/_t12auto.js test/e2e/guide.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-guide-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const DATA=JSON.parse(fs.readFileSync(path.join(APP,'guide','guide.json'),'utf8'));

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  try{ const win=await app.browserWindow(page); await win.evaluate(w=>{w.setSize(1440,900);}); }catch(e){}
  await page.waitForSelector('tr[data-goto]',{timeout:25000,state:'attached'}); await page.waitForTimeout(800);

  // where it is
  const pos=await page.evaluate(()=>{ const ids=[...document.querySelectorAll('#settingsDD [id]')].map(e=>e.id); return { p:ids.indexOf('settingsPortfolio'), g:ids.indexOf('settingsGuide'), c:ids.indexOf('settingsClaudeWrap'), btn:(document.getElementById('settingsGuideBtn')||{}).textContent||'' }; });
  ok(pos.g>pos.p && pos.g<pos.c && /Open the guide/.test(pos.btn), 'Settings has “Guide → Open the guide” under the properties and above the Claude connection');
  await page.evaluate(()=>{ document.getElementById('settingsDD').open=true; }); await page.waitForTimeout(200);
  await page.click('#settingsGuideBtn'); await page.waitForTimeout(900);
  let s=await page.evaluate(()=>({ open:!document.getElementById('guideModal').classList.contains('hidden'), dd:document.getElementById('settingsDD').open, cards:[...document.querySelectorAll('#guideMain [data-guidech]')].map(b=>b.getAttribute('data-guidech')), nav:document.querySelectorAll('#guideNav [data-guidech]').length,
    w:document.getElementById('guideBox').getBoundingClientRect().width/innerWidth }));
  ok(s.open && !s.dd, 'clicking it closes the Settings menu and opens the guide’s window ('+Math.round(s.w*100)+'% wide)');
  ok(JSON.stringify(s.cards)===JSON.stringify(DATA.chapters.map(c=>c.id)) && s.nav===DATA.chapters.length, 'it opens on “What do you need help with?” with every chapter ('+s.cards.join(', ')+')');

  // a chapter → its topics
  const ch=DATA.chapters.find(c=>c.id==='underwriting')||DATA.chapters[0];
  await page.click('#guideMain [data-guidech="'+ch.id+'"]'); await page.waitForTimeout(300);
  s=await page.evaluate(()=>({ topics:[...document.querySelectorAll('#guideMain [data-guidetp]')].map(b=>b.getAttribute('data-guidetp')), crumb:document.getElementById('guideCrumb').textContent }));
  ok(s.topics.length===ch.topics.length && s.crumb===ch.title, 'a chapter lists its '+ch.topics.length+' topics ('+ch.title+')');

  // a topic → its steps
  const tp=ch.topics.find(t=>t.steps.length>=2)||ch.topics[0];
  await page.click('#guideMain [data-guidetp="'+ch.id+'/'+tp.id+'"]'); await page.waitForTimeout(700);
  const step=()=>page.evaluate(()=>{ const img=document.querySelector('#guideMain img'); return { st:window.LDS_Guide.state(), title:(document.querySelector('[data-guidesteptitle]')||{}).textContent||'', count:(document.querySelector('[data-guidecount]')||{}).textContent||'',
    marks:document.querySelectorAll('#guideMain [data-guidebox]').length, items:document.querySelectorAll('#guideMain [data-guidemarks] li').length, loaded:!!(img&&img.complete&&img.naturalWidth>0), src:img?img.getAttribute('src'):'' }; });
  s=await step();
  ok(s.title===tp.steps[0].title && s.count==='Step 1 of '+tp.steps.length, 'a topic opens on its first step: “'+s.title+'” ('+s.count+')');
  ok(s.loaded && s.marks===(tp.steps[0].marks||[]).length && s.items===s.marks, 'the picture loads, with '+s.marks+' numbered markers and as many explanations');
  await page.click('[data-guidenext]'); await page.waitForTimeout(500); s=await step();
  ok(s.st.step===1 && s.title===tp.steps[1].title && s.loaded, 'Next → step 2 (“'+s.title+'”)');
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400); s=await step();
  ok(s.st.step===0, '← goes back a step');
  // past the last step → the next topic
  for(let i=0;i<tp.steps.length;i++){ await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); }
  s=await step();
  const ti=ch.topics.indexOf(tp), nextT=ch.topics[ti+1];
  if(nextT) ok(s.st.topic===nextT.id && s.st.step===0, 'past the last step, Next opens the next topic (“'+nextT.title+'”)');
  // hover a number → its box lights up
  const hl=await page.evaluate(()=>{ const li=document.querySelector('#guideMain [data-guidemarks] li'); if(!li) return null; li.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); const b=document.querySelector('#guideMain [data-guidebox="1"]'); return b?b.style.outline:''; });
  ok(hl===null || /solid/.test(hl), 'pointing at an explanation lights up its box on the picture');
  // every picture of the chapter loads
  const bad=await page.evaluate(async(imgs)=>{ const out=[]; for(const s of imgs){ const ok=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i.naturalWidth>0); i.onerror=()=>r(false); i.src='./guide/'+s; }); if(!ok) out.push(s); } return out; }, ch.topics.flatMap(t=>t.steps.map(x=>x.img)));
  ok(!bad.length, 'every picture of the chapter loads in the app ('+ch.topics.reduce((a,t)=>a+t.steps.length,0)+')'+(bad.length?': '+bad.slice(0,4).join(', '):''));
  // search
  const word=(tp.steps[0].title+' '+tp.title).split(/\s+/).map(w=>w.replace(/[^A-Za-z]/g,'')).sort((a,b)=>b.length-a.length)[0];
  await page.fill('#guideSearch',word); await page.waitForTimeout(400);
  s=await page.evaluate(()=>({ n:document.querySelectorAll('#guideMain [data-guidejump]').length, h:(document.querySelector('#guideMain h2')||{}).textContent||'' }));
  ok(s.n>=1 && /result/.test(s.h), 'the search finds steps (“'+word+'”: '+s.h+')');
  await page.click('#guideMain [data-guidejump]'); await page.waitForTimeout(500); s=await step();
  ok(!!s.title && s.loaded, 'a result opens its step ('+s.title+')');
  // zoom, close
  await page.click('#guideMain [data-guideimg]'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>!document.getElementById('guideZoom').classList.contains('hidden')), 'clicking the picture shows it full size');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.evaluate(()=>document.getElementById('guideModal').classList.contains('hidden')), 'Esc closes the full-size picture, then the guide');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all guide e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
