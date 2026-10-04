/* e2e for 2.9.7 — the assistant works in steps and is told what really happened.
   #49/#55 a reply with two actions runs them in order (the second waits for the first card's Approve) and the
           results go back to Claude, which keeps going until it reports
   #242    an action that isn't on the list says "Nothing was done — the assistant can't …" in plain words and
           Claude's own "Done" gets a grey "(this did not happen)" tag
   #243    a file attached once is sent again with every later message in that chat
   #245/#246 a failed call is said in plain words and saved in the chat ("✗ no answer")
   #58     the chat's title is the question as typed (no hidden tags)
   #98     reopening a chat shows its cards read-only with what happened, and the results
   #57     Delete in the chat history really deletes
   Stop    a card still waiting is cancelled, nothing more runs
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-loop.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-asstloop-'));
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
  await page.waitForSelector('tr[data-goto]',{timeout:20000,state:'attached'}); await page.waitForTimeout(800);
  await page.evaluate(()=>document.getElementById('aiAsstFab').click());
  await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{});
  const idle=()=>page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:20000}).catch(()=>{});
  const send=async(q)=>{ await page.evaluate((q)=>{ document.getElementById('aiAsstInput').value=q; document.getElementById('aiAsstSend').click(); },q); };
  const logText=()=>page.evaluate(()=>document.getElementById('aiAsstLog').textContent);
  const waitCards=(n)=>page.waitForFunction((n)=>document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)').length>=n,n,{timeout:15000}).catch(()=>{});
  const clickLast=(cls)=>page.evaluate((cls)=>{ const b=[...document.querySelectorAll('#aiAsstLog .'+cls+':not(:disabled)')].pop(); if(b) b.click(); return !!b; },cls);

  // ---- #49 / #55 / #242 combination: create a property, then set its units — two cards in order ----
  script([ 'I’ll create Loop Acres, then set its units.\n'+act({action:'create_property',args:{name:'Loop Acres'}})+'\n'+act({action:'propose_profile_change',args:{name:'Loop Acres',changes:{residentialUnits:24}}}),
           'Done — Loop Acres is set up with 24 units.' ]);
  await send('Set up Loop Acres with 24 units');
  await waitCards(1);
  ok(await page.evaluate(()=>document.querySelectorAll('#aiAsstLog .aiAsstEditApprove').length)===1,'only the first card shows — the second step waits for it');
  await clickLast('aiAsstEditApprove');
  await waitCards(1); await page.waitForTimeout(300);
  const second=await page.evaluate(()=>{ const c=[...document.querySelectorAll('#aiAsstLog [data-asstcard]')].pop(); return c?c.textContent:''; });
  ok(/Loop Acres/.test(second)&&/24/.test(second),'after Approve the second card (24 units on Loop Acres) appears: "'+second.replace(/\s+/g,' ').slice(0,90)+'"');
  await clickLast('aiAsstEditApprove'); await idle(); await page.waitForTimeout(400);
  const P=await page.evaluate(()=>{ const p=window.opProperties().find(x=>x.name==='Loop Acres'); return p?{ key:p.key, units:window.LDS_profileEffective(p.key,'residentialUnits') }:null; });
  ok(P&&String(P.units)==='24','the property exists with 24 units');
  let C=calls();
  ok(C.length===2,'Claude was asked twice: the request, then the results ('+C.length+' calls)');
  const p2=(C[1]||{}).prompt||'';
  ok(/App \(results of your actions/.test(p2)&&/✓ create_property: Approved and done/.test(p2)&&/✓ propose_profile_change: Approved and done/.test(p2),'the second call carries both results (approved and done)');
  ok(/Every property in the app/.test(p2)&&/Loop Acres \(no loan yet\)/.test(p2),'Claude sees every property, loan-less ones included');
  ok(/Done — Loop Acres is set up with 24 units/.test(await logText()),'Claude’s report closes the request');
  ok(await page.evaluate(()=>document.getElementById('loanSelect').value!=='prop:'+'x'&&document.getElementById('aiAsstModal').classList.contains('flex')),'the chat stayed open (no screen was switched)');

  // ---- #242: an action that isn't on the list ----
  script([ 'Done — I’ve deleted it.\n'+act({action:'delete_everything',args:{}}), 'Sorry — I can’t delete everything; I can archive a property instead.' ]);
  await send('Delete everything'); await idle(); await page.waitForTimeout(300);
  const T=await logText();
  ok(/Nothing was done — the assistant can’t delete everything/.test(T),'the unknown action is said in plain words');
  ok(await page.evaluate(()=>!!document.querySelector('#aiAsstLog [data-didnothappen]')),'Claude’s "Done" carries "(this did not happen)"');
  C=calls(); ok(/✗ delete_everything: Nothing was done/.test((C[3]||{}).prompt||''),'Claude is told it did not happen');

  // ---- #243: a file attached once is sent with every later message ----
  const F=path.join(UDATA,'note-243.txt'); fs.writeFileSync(F,'The lender is MAGENTA BANK.');
  await page.setInputFiles('#aiAsstFile',F); await page.waitForTimeout(800);
  script([ 'The note names Magenta Bank.', 'Still Magenta Bank.' ]);
  await send('Who is the lender in the note?'); await idle();
  await send('And again?'); await idle(); await page.waitForTimeout(300);
  C=calls(); const last=(C[C.length-1]||{}).prompt||'';
  ok(/<file name="note-243.txt">/.test(last)&&/MAGENTA BANK/.test(last),'the next message still sends the attached file');

  // ---- Stop with a card waiting ----
  const loan=await page.evaluate(()=>window.LDS_loans().find(l=>!l.archived&&l.propertyName).propertyName);
  script([ 'Setting it.\n'+act({action:'set_loan_status',args:{name:loan,status:'Extended'}})+'\n'+act({action:'set_loan_status',args:{name:loan,status:'Matured'}}) ]);
  const before=calls().length;
  await send('Mark it extended'); await waitCards(1);
  await page.evaluate(()=>document.getElementById('aiAsstSend').click()); await idle(); await page.waitForTimeout(500);
  const S=await page.evaluate(()=>({ live:document.querySelectorAll('#aiAsstLog .aiAsstEditApprove:not(:disabled)').length, txt:document.getElementById('aiAsstLog').textContent }));
  ok(S.live===0&&/Stopped — nothing was changed/.test(S.txt),'Stop cancels the waiting card');
  ok(calls().length===before+1,'nothing more is sent to Claude after Stop');

  // ---- #245 / #246: a failed call ----
  script([ {error:'Invalid API key · Please run /login'} ]);
  await send('What is the total debt?'); await idle(); await page.waitForTimeout(300);
  ok(/Your Claude sign-in has expired — click Connection settings → Sign in/.test(await logText()),'a signed-out error is said in plain words with the next step');
  await page.waitForTimeout(500);

  // ---- #58 / #98: the saved chat ----
  const saved=await page.evaluate(async()=>{ const r=await window.ldsShell.chatList({scope:'portfolio'}); const c=(r.conversations||[])[0]; const full=c?await window.ldsShell.chatRead({scope:'portfolio',id:c.id}):null; return { title:c&&c.title, id:c&&c.id, msgs:full&&full.conversation.messages }; });
  ok(saved.title==='Set up Loop Acres with 24 units','the title is the question as typed ("'+saved.title+'")');
  const roles=(saved.msgs||[]).map(m=>m.role);
  ok(roles.filter(r=>r==='card').length>=3&&roles.includes('result'),'the cards and the results are saved in the chat');
  ok((saved.msgs||[]).some(m=>m.failed&&/✗ no answer — Claude couldn't respond/.test(m.text)),'the failed answer is saved too');
  await page.evaluate(()=>document.getElementById('aiAsstNew').click()); await page.waitForTimeout(300);
  await page.evaluate(()=>document.getElementById('aiAsstHistoryBtn').click()); await page.waitForTimeout(800);
  await page.evaluate(()=>{ const b=document.querySelector('#aiAsstHistList [data-hopen]'); if(b) b.click(); }); await page.waitForTimeout(800);
  const R=await page.evaluate(()=>({ old:document.querySelectorAll('#aiAsstLog [data-asstcard-old]').length, live:document.querySelectorAll('#aiAsstLog .aiAsstEditApprove').length, txt:document.getElementById('aiAsstLog').textContent }));
  ok(R.old>=3&&R.live===0,'reopened: the cards show read-only ('+R.old+'), no live Approve buttons');
  ok(/Created/.test(R.txt)&&/Stopped — nothing was changed/.test(R.txt)&&/Nothing was done — the assistant can’t delete everything/.test(R.txt),'…with what happened on each, and the action results');

  // ---- #57: delete it from the history ----
  await page.evaluate(()=>document.getElementById('aiAsstHistoryBtn').click()); await page.waitForTimeout(800);
  await page.evaluate((id)=>{ const it=[...document.querySelectorAll('#aiAsstHistList [data-hdel]')][0]; if(it) it.click(); },saved.id); await page.waitForTimeout(300);
  await page.evaluate(()=>document.getElementById('confirmOk').click()); await page.waitForTimeout(800);
  const D=await page.evaluate(async(id)=>{ const r=await window.ldsShell.chatList({scope:'portfolio'}); return (r.conversations||[]).some(c=>c.id===id); },saved.id);
  ok(!D,'Delete removes the conversation');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close();
  try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all assistant-loop e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
