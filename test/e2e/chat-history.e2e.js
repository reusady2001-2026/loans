/* e2e (2.9.5 Phase C): the assistant persists conversations per scope (property + portfolio) so they
   survive restarts, can be reopened and continued (their full thread returns to context = "memory"),
   and are searchable, renamable, pinnable and deletable. Answers Yuval 38:19/38:45 ("save conversations
   so we can learn from them"). Exercises the chat store IPC round-trip and the History panel UI.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/chat-history.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-chat-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // ---- 1) storage round-trip through the bridge (main.js + preload) ------------------------------
  const rt=await page.evaluate(async()=>{
    const S=window.ldsShell; if(!S||!S.chatSave) return {skip:true};
    const scope='name:test property';
    const save=await S.chatSave({scope:scope, scopeName:'Test Property', messages:[
      {role:'user',text:'What is the payroll per unit on Test Property?'},
      {role:'assistant',text:'Underwritten payroll is $1,700 per unit on Test Property.'}]});
    const id=save.conversation.id;
    const read=await S.chatRead({scope:scope, id:id});
    const search=await S.chatSearch({query:'payroll', scopes:[scope]});
    await S.chatMeta({scope:scope, id:id, pinned:true});
    await S.chatMeta({scope:scope, id:id, title:'Payroll discussion'});
    const list=await S.chatList({scope:scope});
    const meta=(list.conversations||[]).find(c=>c.id===id)||{};
    const withFiles=await S.chatSave({scope:'portfolio', scopeName:'Portfolio', messages:[{role:'user',text:'see attached rent roll'}], files:[{name:'rentroll.xlsx'}]});
    const rf=await S.chatRead({scope:'portfolio', id:withFiles.conversation.id});
    return { titleAuto:save.conversation.title, readMsgs:(read.conversation.messages||[]).length,
      searchHit:(search.matches||[]).length>0, snippet:((search.matches||[])[0]||{}).snippet||'',
      pinned:!!meta.pinned, title:meta.title, files:(rf.conversation.files||[]).map(f=>f.name) };
  });
  ok(!rt.skip,'the chat bridge is present (chatSave/chatList/chatRead/chatSearch/chatMeta)');
  ok(rt.titleAuto && /payroll/i.test(rt.titleAuto),'a blank title auto-fills from the first user message: "'+rt.titleAuto+'"');
  ok(rt.readMsgs===2,'chat-read returns the full saved thread (2 messages)');
  ok(rt.searchHit,'chat-search finds a conversation by a word from the answer ("payroll")');
  ok(/payroll/i.test(rt.snippet),'…and returns a matching snippet: "'+String(rt.snippet).slice(0,60)+'"');
  ok(rt.pinned===true,'pin persists');
  ok(rt.title==='Payroll discussion','rename persists');
  ok(rt.files.indexOf('rentroll.xlsx')>=0,'a conversation records its attached files (linked to the property Documents)');

  // ---- 2) the History panel UI --------------------------------------------------------------------
  await page.evaluate(async()=>{ await window.ldsShell.chatSave({scope:'portfolio', scopeName:'Portfolio', messages:[
    {role:'user',text:'What is my total monthly debt service across the portfolio?'},
    {role:'assistant',text:'Your total monthly debt service is about 1.2 million dollars.'}]}); });
  await page.evaluate(()=>{ const f=document.getElementById('aiAsstFab'); if(f) f.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ const b=document.getElementById('aiAsstHistoryBtn'); if(b) b.click(); });
  await page.waitForSelector('#aiAsstHistoryPanel:not(.hidden)',{timeout:5000});
  await page.waitForTimeout(400);
  const listed=await page.evaluate(()=>{
    const panel=document.getElementById('aiAsstHistoryPanel');
    const items=[...panel.querySelectorAll('.aiAsstHistItem')];
    return { shown: panel && !panel.classList.contains('hidden'), titles: items.map(i=>{const t=i.querySelector('.httl'); return t?t.textContent:'';}) };
  });
  ok(listed.shown,'the History panel opens');
  ok(listed.titles.some(t=>/debt service/i.test(t)),'the saved portfolio conversation is listed by its title');

  // search in the panel
  await page.fill('#aiAsstHistSearch','debt');
  await page.waitForTimeout(500);
  const searched=await page.evaluate(()=>[...document.querySelectorAll('#aiAsstHistList .aiAsstHistItem')].length);
  ok(searched>=1,'typing in the search box filters the history to matches ('+searched+')');

  // open the conversation → it returns to the chat view and restores its messages (memory)
  await page.fill('#aiAsstHistSearch','');
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ const op=document.querySelector('#aiAsstHistList .aiAsstHistItem [data-hopen]'); if(op) op.click(); });
  await page.waitForTimeout(500);
  const opened=await page.evaluate(()=>{
    const log=document.getElementById('aiAsstLog'), panel=document.getElementById('aiAsstHistoryPanel');
    return { back: panel.classList.contains('hidden') && !log.classList.contains('hidden'), text: (log.innerText||'') };
  });
  ok(opened.back,'opening a conversation returns to the chat view');
  ok(/debt service/i.test(opened.text),'the reopened conversation restores its full exchange into the log (the assistant has its memory)');

  // 2.9.7 (#97) — ALL chats, grouped by property (the current one first, then the portfolio), with a "This property / All" filter
  const G=await page.evaluate(async()=>{ const ps=window.opProperties(); const A=ps[0], B=ps[1];
    await window.ldsShell.chatSave({scope:A.key, scopeName:A.name, title:'About A', messages:[{role:'user',text:'a question about A'}]});
    await window.ldsShell.chatSave({scope:B.key, scopeName:B.name, title:'About B', messages:[{role:'user',text:'a question about B'}]});
    return { a:A.key, an:A.name, b:B.key }; });
  await page.evaluate((a)=>{ const s=document.getElementById('aiAsstProp'); if(![...s.options].some(o=>o.value===a)){ const o=document.createElement('option'); o.value=a; o.textContent=a; s.appendChild(o); } s.value=a; s.dispatchEvent(new Event('change',{bubbles:true})); },G.a);
  await page.evaluate(()=>{ if(document.getElementById('aiAsstHistoryPanel').classList.contains('hidden')) document.getElementById('aiAsstHistoryBtn').click(); }); await page.waitForTimeout(700);
  const groups=await page.evaluate(()=>[...document.querySelectorAll('#aiAsstHistList [data-histgroup]')].map(g=>g.getAttribute('data-histgroup')));
  ok(groups[0]===G.a&&groups[1]==='portfolio'&&groups.includes(G.b),'the list shows every property’s chats, grouped — this property first, then the portfolio ('+groups.length+' groups)');
  await page.evaluate(()=>{ const b=document.querySelector('[data-histmode="this"]'); if(b) b.click(); }); await page.waitForTimeout(600);
  const only=await page.evaluate(()=>[...document.querySelectorAll('#aiAsstHistList [data-histgroup]')].map(g=>g.getAttribute('data-histgroup')));
  ok(only.length===1&&only[0]===G.a,'"This property" shows only this property’s chats');
  await page.fill('#aiAsstHistSearch','question about B'); await page.waitForTimeout(600);
  const sb=await page.evaluate(()=>[...document.querySelectorAll('#aiAsstHistList .httl')].map(t=>t.textContent));
  ok(sb.includes('About B'),'search covers everything (finds another property’s chat)');
  await page.evaluate(()=>{ const b=document.querySelector('[data-histmode="all"]'); if(b) b.click(); }); await page.waitForTimeout(300);

  // delete removes it
  const del=await page.evaluate(async()=>{ const S=window.ldsShell;
    const before=(await S.chatList({scope:'portfolio'})).conversations.length;
    const id=(await S.chatList({scope:'portfolio'})).conversations[0].id;
    await S.chatDelete({scope:'portfolio', id:id});
    const after=(await S.chatList({scope:'portfolio'})).conversations.length;
    return {before, after}; });
  ok(del.after===del.before-1,'chat-delete removes a conversation ('+del.before+'→'+del.after+')');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all chat-history e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
