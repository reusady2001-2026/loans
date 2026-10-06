/* e2e for 2.9.9 (fixes 6, 9) — Claude understands the task first, reads only the files it needs, stops when it
   has the answer; and recalls only past chats that are about the question.
   A property with three saved files: a long loan agreement, a rent roll and a T12 (the part size is shrunk for the
   test, so they are "long").
   (6a) "How many units are occupied?" → only the rent roll is read; the agreement and the T12 are named as not read,
        and their text is not sent;
   (6b) "Yes, go ahead" (an instruction) → no file is read;
   (6c) "What is the prepayment penalty?" → only the agreement, in parts — the reading stops at the part that answers;
   (6d) "Read all the files of this property" → no planning step, every part of every file, no early stop;
   (9)  a long old chat that mentions "market" and "rate" far apart is NOT recalled for "every market rate the app
        holds"; a chat titled about rates is.
   Claude is a scripted stand-in (test/fixtures/fake-claude-push.js) — no real model.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/asst-reading.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-reading-'));
const FAKE=path.join(APP,'test','fixtures','fake-claude-push.js');
const REPLIES=path.join(UDATA,'replies.json'), CALLS=path.join(UDATA,'chat-calls.jsonl'), PLANS=path.join(UDATA,'plans.json'), PLANLOG=path.join(UDATA,'plans.jsonl');
fs.mkdirSync(path.join(UDATA,'claude'),{recursive:true}); fs.writeFileSync(path.join(UDATA,'claude','signed-in.marker'),'ok');
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};
const lines=(f)=>{ try{ return fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch(e){ return []; } };
const AGR=[]; for(let p=1;p<=24;p++) AGR.push('[page '+p+']\n'+(p===9?'Prepayment: yield maintenance until 2030-06-30, then 1% until 2030-09-30, then open.\n':'')+('Loan agreement clause '+p+' boilerplate. ').repeat(6));
const AGRT=AGR.join('\n'), RRT='RENT ROLL as of 09/10/2026\n'+Array.from({length:30},(_,i)=>'Unit '+(100+i)+' occupied rent 1,500').join('\n')+'\nTotal: 85 units, 83 occupied', T12T='T12 Aug 2025 – Jul 2026\nGross Potential Rent 2,978,717.35\nNet Operating Income 1,804,923.73\n'+'Line item 0.00\n'.repeat(20);
(async()=>{
  fs.writeFileSync(REPLIES,'[]'); fs.writeFileSync(PLANS,'[]');
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,
    env:Object.assign({},process.env,{LDS_CLAUDE_BIN:FAKE,LDS_FAKE_CHAT_FILE:REPLIES,LDS_FAKE_CHAT_LOG:CALLS,LDS_FAKE_PLAN_FILE:PLANS,LDS_FAKE_PLAN_LOG:PLANLOG})});
  let page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'});
  await page.evaluate(()=>localStorage.setItem('lds.asstPartChars','1500')); await page.reload(); await page.waitForSelector('tr[data-goto]',{timeout:30000,state:'attached'}); await page.waitForTimeout(1200);
  const Q=await page.evaluate(()=>{ const p=window.opProperties().find(x=>/queens gate/i.test(x.name)); return {key:p.key,name:p.name}; });
  await page.evaluate(async({k,a,r,t})=>{ const S=window.ldsShell, b=(s)=>btoa(unescape(encodeURIComponent(s)));
    await S.docSave({propKey:k,propName:'Queens Gate Apartments',name:'Loan Agreement.txt',base64:b(a),text:a,type:'text/plain',role:'agreement'});
    await S.docSave({propKey:k,propName:'Queens Gate Apartments',name:'RentRoll.txt',base64:b(r),text:r,type:'text/plain',role:'other'});
    await S.docSave({propKey:k,propName:'Queens Gate Apartments',name:'T12 summary.txt',base64:b(t),text:t,type:'text/plain',role:'other'}); },{k:Q.key,a:AGRT,r:RRT,t:T12T});
  await page.evaluate(()=>document.getElementById('aiAsstFab').click());
  await page.waitForFunction(()=>{ const b=document.getElementById('aiAsstSend'), r=document.getElementById('aiAsstConnRow'); return b&&!b.disabled&&r&&!/Checking/.test(r.textContent); },null,{timeout:20000}).catch(()=>{});
  await page.evaluate((k)=>{ const s=document.getElementById('aiAsstProp'); s.value=k; s.dispatchEvent(new Event('change',{bubbles:true})); },Q.key); await page.waitForTimeout(500);
  const idle=()=>page.waitForFunction(()=>/Send/.test(document.getElementById('aiAsstSend').textContent),null,{timeout:60000}).catch(()=>{});
  const send=async(q)=>{ await page.evaluate((q)=>{ document.getElementById('aiAsstInput').value=q; document.getElementById('aiAsstSend').click(); },q); await idle(); await page.waitForTimeout(600); };
  const lastBubbles=(n)=>page.evaluate((n)=>[...document.querySelectorAll('#aiAsstLog [data-readparts],#aiAsstLog [data-readstopped]')].slice(-n).map(e=>e.textContent),n);

  // ---- (6a) a rent-roll question reads only the rent roll ----
  fs.writeFileSync(PLANS,JSON.stringify([{read:['RentRoll.txt'],readAll:false,why:'occupancy is in the rent roll'}]));
  fs.writeFileSync(REPLIES,JSON.stringify(['83 of 85 units are occupied.']));
  let c0=lines(CALLS).length;
  await send('How many units are occupied?');
  const plan1=lines(PLANLOG).pop();
  ok(plan1&&/How many units are occupied\?/.test(plan1.prompt)&&/- "Loan Agreement\.txt"/.test(plan1.prompt)&&/- "RentRoll\.txt"/.test(plan1.prompt),'first, one small call decides which files the question needs (it sees the question and the file list)');
  ok(!/Loan agreement clause 5 boilerplate/.test(plan1.prompt),'…without the files’ text');
  const b1=(await lastBubbles(1))[0]||'';
  ok(/Reading only “RentRoll\.txt” — not needed for this: /.test(b1)&&/“Loan Agreement\.txt”/.test(b1)&&/“T12 summary\.txt”/.test(b1),'the chat says: Reading only “RentRoll.txt” — not needed: the agreement and the T12 ("'+b1+'")');
  const s1=lines(CALLS).slice(c0);
  ok(s1.length===1&&/Unit 101 occupied/.test(s1[0].prompt)&&!/Loan agreement clause/.test(s1[0].prompt)&&!/Net Operating Income 1,804,923\.73/.test(s1[0].prompt),'Claude got the rent roll only — not the agreement, not the T12 (one call)');
  ok(/Files NOT read for this message[^\n]*Loan Agreement\.txt/.test(s1[0].prompt)&&/Files NOT read for this message[^\n]*T12 summary\.txt[^\n]*read_files/.test(s1[0].prompt),'…and is told which files were not read, and how to read one if it must');

  // ---- (6b) an instruction reads nothing ----
  fs.writeFileSync(PLANS,JSON.stringify([{read:[],readAll:false,why:'an instruction — no figure from a file is needed'}]));
  fs.writeFileSync(REPLIES,JSON.stringify(['OK.']));
  c0=lines(CALLS).length;
  await send('Yes, go ahead');
  const b2=(await lastBubbles(1))[0]||'';
  ok(/Not reading any file for this/.test(b2),'"Yes, go ahead" reads no file ("'+b2.slice(0,90)+'…")');
  const s2=lines(CALLS).slice(c0);
  ok(s2.length===1&&!/Unit 101 occupied/.test(s2[0].prompt)&&!/Loan agreement clause/.test(s2[0].prompt),'…one call, no file text sent');

  // ---- (6c) a loan-terms question reads only the agreement, and stops at the answer ----
  const NP=await page.evaluate((t)=>window.LDS_asstSplitCount(t), '<file name="Loan Agreement.txt">\n'+AGRT+'\n</file>\n\n');
  fs.writeFileSync(PLANS,JSON.stringify([{read:['Loan Agreement.txt'],readAll:false,why:'prepayment terms are in the loan agreement'}]));
  const rep=[]; for(let i=1;i<=NP;i++){ const has=i*1500>=AGRT.indexOf('Prepayment:'); rep.push('NOTES part '+i+(has?': Prepayment — yield maintenance until 2030-06-30 (Loan Agreement.txt, page 9)\nANSWERED: yes':'\nANSWERED: no')); }
  const stopAt=rep.findIndex(r=>/ANSWERED: yes/.test(r))+1;
  rep.splice(stopAt,0,'Yield maintenance until June 30, 2030 (page 9).');
  fs.writeFileSync(REPLIES,JSON.stringify(rep));
  c0=lines(CALLS).length;
  await send('What is the prepayment penalty?');
  const b3=await lastBubbles(2);
  ok(/Reading only “Loan Agreement\.txt”/.test(b3[0]||'')&&/stops as soon as it has the answer/.test(b3[0]||''),'only the agreement is read, in parts ("'+(b3[0]||'').slice(0,120)+'")');
  ok(NP>2&&stopAt<NP&&new RegExp('Found the answer in part '+stopAt+' of '+NP+' — the rest wasn’t read').test(b3[1]||''),'"Found the answer in part '+stopAt+' of '+NP+' — the rest wasn’t read."');
  const s3=lines(CALLS).slice(c0);
  ok(s3.length===stopAt+1,'Claude read '+stopAt+' parts, not '+NP+', then answered ('+s3.length+' calls)');
  ok(/stopped once the answer was found/.test((s3[s3.length-1]||{}).prompt||''),'the answer call says the reading stopped once the answer was found');

  // ---- (6d) "read all the files" reads everything, with no early stop ----
  const all='<file name="Loan Agreement.txt">\n'+AGRT+'\n</file>\n\n<file name="RentRoll.txt">\n'+RRT+'\n</file>\n\n<file name="T12 summary.txt">\n'+T12T+'\n</file>\n\n';
  const NA=await page.evaluate(async(k)=>{ const dt=await window.ldsShell.docText(k); return window.LDS_asstSplitCount(dt.text); },Q.key);
  const rep4=[]; for(let i=1;i<=NA;i++) rep4.push('NOTES '+i+'\nANSWERED: yes'); rep4.push('Summary of all three files.');
  fs.writeFileSync(REPLIES,JSON.stringify(rep4));
  const p0=lines(PLANLOG).length; c0=lines(CALLS).length;
  await send('Read all the files of this property');
  ok(lines(PLANLOG).length===p0,'"Read all the files" skips the planning step');
  ok(lines(CALLS).slice(c0).length===NA+1,'…and reads every part of every file ('+NA+' parts) even though a part said ANSWERED: yes');

  // ---- (9) recall only related chats ----
  const filler=(w)=>Array.from({length:60},(_,i)=>'Line '+i+' of the T12 classification notes for the portfolio.').join(' ');
  await page.evaluate(async({k,f})=>{ const S=window.ldsShell;
    await S.chatSave({scope:k, scopeName:'Queens Gate Apartments', title:"please read this file of T12's and classify each T12", messages:[{role:'user',text:'please read this file of T12s and classify each one'},{role:'assistant',text:'The market for this submarket is strong. '+f+' The interest rate on the loan is 3.08%.'}]});
    await S.chatSave({scope:k, scopeName:'Queens Gate Apartments', title:'Market rates check', messages:[{role:'user',text:'What market rates does the app use?'},{role:'assistant',text:'The market rate for SOFR is 3.88% and the 10-year is 5.31%.'}]}); },{k:Q.key,f:filler()});
  const rc=await page.evaluate((k)=>window.LDS_asstRecall('Show me every market rate the app holds, with its value and where it comes from', k),Q.key);
  const titles=(rc.picks||[]).map(p=>p.title);
  ok(!titles.some(t=>/classify each T12/.test(t)),'a long chat that has "market" and "rate" far apart is NOT recalled (picks: '+JSON.stringify(titles)+')');
  ok(titles.includes('Market rates check'),'…a chat about market rates is');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all reading / recall (2.9.9) e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
