/* e2e for 2.9.8 — the assistant's property selector and what a chat belongs to.
   Problem 9: one chat is one property, or a general chat. Naming a property in a general chat never makes it
              that property's chat (Claude still gets the property's data); closing and reopening brings back the
              same chat with the same selector (general stays general, even opened from a loan's page); picking
              another property in a chat that has started opens a new chat, and the old one stays saved under
              its own property; reopening a saved chat from History puts the selector on that chat's property.
   Problem 7: a property the assistant creates appears in the selector at once — without the selector moving.
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-scope.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asstscope-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const REPLIES=path.join(UDATA,'replies.json'), CALLS=path.join(UDATA,'chat-calls.jsonl');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const act=(o)=>'```action\n'+JSON.stringify(o)+'\n```';
const script=(list)=>fs.writeFileSync(REPLIES,JSON.stringify(list));
const calls=()=>{ try{ return fs.readFileSync(CALLS,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch(e){ return []; } };

(async()=>{
  script([]);
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),
    args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CHAT_FILE:REPLIES,LDS_FAKE_CHAT_LOG:CALLS})});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(1500);
  const openAsst=async()=>{ await page.evaluate(()=>document.getElementById('aiAsstFab').click()); await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{}); await page.waitForTimeout(300); };
  const closeAsst=async()=>{ await page.evaluate(()=>document.getElementById('aiAsstClose').click()); await page.waitForTimeout(300); };
  const idle=()=>page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:20000}).catch(()=>{});
  const send=async(q)=>{ await page.evaluate((q)=>{ document.getElementById('aiAsstInput').value=q; document.getElementById('aiAsstSend').click(); },q); await idle(); await page.waitForTimeout(700); };
  const sel=()=>page.evaluate(()=>document.getElementById('aiAsstProp').value);
  const pick=async(k)=>{ await page.evaluate((k)=>{ const s=document.getElementById('aiAsstProp'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },k); await page.waitForTimeout(500); };
  const logText=()=>page.evaluate(()=>document.getElementById('aiAsstLog').textContent);
  const chats=(scope)=>page.evaluate(async(scope)=>{ const r=await window.ldsShell.chatList({scope}); return (r.conversations||[]).map(c=>({id:c.id,title:c.title})); },scope);
  const QG=await page.evaluate(()=>{ const p=window.opProperties().find(x=>/queens gate/i.test(x.name)); return {key:p.key,name:p.name}; });
  const OTHER=await page.evaluate((k)=>{ const p=window.opProperties().find(x=>x.key!==k&&x.loans.length); return {key:p.key,name:p.name,loan:p.loans[0]._id}; },QG.key);

  // ---- a general chat that names a property stays general ----
  await openAsst();
  ok(await sel()==='','the assistant opens on Home as a general chat');
  script(['Queens Gate’s DSCR is 1.21×.']);
  await send('What is the DSCR of Queens Gate Apartments?');
  ok(await sel()==='','naming a property did not move the selector');
  const c1=calls().pop()||{};
  ok(/GENERAL chat/.test(c1.prompt||'')&&(c1.prompt||'').indexOf(QG.name)>=0,'Claude still got Queens Gate\'s data, told it is a general chat');
  ok((await chats('portfolio')).some(c=>/DSCR of Queens Gate/.test(c.title))&&!(await chats(QG.key)).some(c=>/DSCR of Queens Gate/.test(c.title)),'the chat is saved as a general chat, not under Queens Gate');
  ok(!/🏢/.test(await logText()),'the question carries no property tag');

  // ---- close and reopen: same chat, still general — even with a loan's page on screen ----
  await closeAsst();
  await page.evaluate((id)=>{ const s=document.getElementById('loanSelect'); s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); },OTHER.loan); await page.waitForTimeout(600);
  await openAsst();
  ok(await sel()===''&&/DSCR of Queens Gate/.test(await logText()),'reopened from a loan\'s page: the same general chat, selector still on general');

  // ---- picking a property in a chat that has started opens a NEW chat ----
  await pick(OTHER.key);
  ok(await sel()===OTHER.key&&!/DSCR of Queens Gate/.test(await logText()),'picking '+OTHER.name+' opened a new, empty chat for it');
  script(['Noted.']);
  await send('Tell me about this property');
  ok((await chats(OTHER.key)).some(c=>/Tell me about this property/.test(c.title)),'that chat is saved under '+OTHER.name);
  await pick('');
  ok(await sel()===''&&!/Tell me about this property/.test(await logText()),'switching back to general opens another new chat');
  ok((await chats(OTHER.key)).some(c=>/Tell me about this property/.test(c.title))&&!(await chats('portfolio')).some(c=>/Tell me about this property/.test(c.title)),'the property chat stayed under its property — it did not move');

  // ---- reopening from History puts the selector on that chat's property (or general) ----
  const reopen=async(scope,id)=>{ await page.evaluate(({scope,id})=>window.LDS_aiAsstOpenConv?window.LDS_aiAsstOpenConv(scope,id):null,{scope,id}); await page.waitForTimeout(800); };
  const pc=(await chats(OTHER.key))[0], gc=(await chats('portfolio')).find(c=>/DSCR of Queens Gate/.test(c.title));
  await reopen(OTHER.key,pc.id);
  ok(await sel()===OTHER.key,'reopening the '+OTHER.name+' chat puts the selector on it');
  await reopen('portfolio',gc.id);
  ok(await sel()==='','reopening the general chat puts the selector back on general');

  // ---- problem 7: a property the assistant creates shows in the selector at once ----
  script([ 'I’ll create Selector Acres.\n'+act({action:'create_property',args:{name:'Selector Acres'}}), 'Done — Selector Acres is created.' ]);
  await send('Create a property called Selector Acres');
  await page.waitForFunction(()=>document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)').length>=1,null,{timeout:15000}).catch(()=>{});
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)')].pop(); if(b) b.click(); }); await idle(); await page.waitForTimeout(800);
  const opt=await page.evaluate(()=>[...document.getElementById('aiAsstProp').options].map(o=>o.textContent));
  ok(opt.includes('Selector Acres'),'Selector Acres is in the selector without closing the assistant');
  ok(await sel()==='','…and the selector did not move to it by itself (this chat stays general)');
  ok(await page.evaluate(()=>/THE PROPERTY SELECTOR[^]*cannot change it/.test(window.LDS_aiAsstSystem())),'Claude is told it cannot change the selector');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assistant-scope e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
