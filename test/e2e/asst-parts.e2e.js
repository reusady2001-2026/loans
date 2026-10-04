/* e2e for 2.9.7 (#250, choice 1a) — a file too long for one message is read in parts.
   "This file is long — Claude is reading it in N parts."; each part adds to the notes (exact figures, with pages);
   the answer comes from the notes; only the notes and the answer stay in the chat (not the file's text); a follow-up
   question reads it in parts again. The part size is shrunk for the test (lds.asstPartChars).
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-parts.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-parts-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const REPLIES=path.join(UDATA,'replies.json'), CALLS=path.join(UDATA,'chat-calls.jsonl');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const calls=()=>{ try{ return fs.readFileSync(CALLS,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch(e){ return []; } };
// a long agreement: 60 pages, the key figure on page 47
const pages=[]; for(let p=1;p<=60;p++){ pages.push('[page '+p+']\n'+(p===47?'Exhibit C — the balloon payment is $9,876,543.21 due 2031-04-01.\n':'')+('Boilerplate clause '+p+'. ').repeat(8)); }
const LONG=path.join(UDATA,'long-agreement.txt'); fs.writeFileSync(LONG,pages.join('\n'));
(async()=>{
  fs.writeFileSync(REPLIES,'[]');
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CHAT_FILE:REPLIES,LDS_FAKE_CHAT_LOG:CALLS})});
  let page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'});
  await page.evaluate(()=>localStorage.setItem('lds.asstPartChars','3000')); await page.reload(); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}); await page.waitForTimeout(800);
  const N=await page.evaluate((t)=>window.LDS_asstSplitCount(t), pages.join('\n'));
  ok(N>=3,'the long file splits into '+N+' parts');
  await page.evaluate(()=>document.getElementById('aiAsstFab').click());
  await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{});
  await page.setInputFiles('#aiAsstFile',LONG); await page.waitForTimeout(800);
  const replies=[]; for(let i=1;i<=N;i++) replies.push('NOTES after part '+i+(i>=Math.ceil(N*47/60)?': balloon payment $9,876,543.21 due 2031-04-01 (long-agreement.txt, page 47)':'')); replies.push('The balloon payment is $9,876,543.21, due April 1, 2031 (page 47).');
  fs.writeFileSync(REPLIES,JSON.stringify(replies));
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='What is the balloon payment?'; document.getElementById('aiAsstSend').click(); });
  await page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent)&&/balloon payment is \$9,876,543\.21/.test(document.getElementById('aiAsstLog').textContent),null,{timeout:60000}).catch(()=>{});
  const T=await page.evaluate(()=>document.getElementById('aiAsstLog').textContent);
  ok(new RegExp('This file is long — Claude is reading it in '+N+' parts').test(T),'"This file is long — Claude is reading it in '+N+' parts."');
  ok(/balloon payment is \$9,876,543\.21/.test(T),'the answer comes back');
  const C=calls();
  ok(C.length===N+1,'Claude was asked '+(N)+' times for the parts and once for the answer ('+C.length+' calls)');
  ok(/This is part 1 of /.test(C[0].prompt)&&/Notes so far:\n\(none yet\)/.test(C[0].prompt)&&/This is part 2 of /.test(C[1].prompt)&&/NOTES after part 1/.test(C[1].prompt),'each part carries the notes so far');
  const last=C[C.length-1].prompt;
  ok(/Notes taken while reading long-agreement\.txt in \d+ parts/.test(last)&&/page 47/.test(last)&&!/Boilerplate clause 12\./.test(last),'the answer is asked from the notes, not the file’s text');
  await page.waitForTimeout(600);
  const saved=await page.evaluate(async()=>{ const r=await window.ldsShell.chatList({scope:'portfolio'}); const c=(r.conversations||[])[0]; const full=await window.ldsShell.chatRead({scope:'portfolio',id:c.id}); return full.conversation.messages; });
  ok(saved.some(m=>m.role==='notes'&&/page 47/.test(m.text))&&!saved.some(m=>/Boilerplate clause 12\./.test(m.text)),'the chat keeps the notes and the answer — not the file’s text');
  // a follow-up reads it in parts again
  const before=calls().length; const again=[]; for(let i=1;i<=N;i++) again.push('NOTES (again) part '+i); again.push('Due April 1, 2031.');
  fs.writeFileSync(REPLIES,JSON.stringify(again));
  await page.evaluate(()=>{ document.getElementById('aiAsstInput').value='When is it due?'; document.getElementById('aiAsstSend').click(); });
  await page.waitForFunction(()=>/Due April 1, 2031/.test(document.getElementById('aiAsstLog').textContent),null,{timeout:60000}).catch(()=>{});
  ok(calls().length-before===N+1,'a follow-up question reads the file in parts again ('+(calls().length-before)+' calls)');
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all read-in-parts e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
