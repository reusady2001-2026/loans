/* e2e (2.9.5 Phase D): memory recall. Before a turn the assistant searches the operator's OTHER saved
   conversations for relevant prior discussion and, on a strong match, pulls a short excerpt into context
   — so they don't re-explain last week. Answers Yuval's clarification: "look in his memory to see if I
   already talked about this before and if it's relevant." Deterministic, offline, property-scoped, capped.
   Drives the real recall pipeline via window.LDS_asstRecall (query build + scoped search + selection),
   no Claude call needed.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/chat-recall.e2e.js */
const path=require('path'),os=require('os'),fs=require('fs');
const APP=path.resolve(__dirname,'..','..');
const {_electron:electron}=require((process.env.GN||'/opt/node22/lib/node_modules')+'/playwright');
const UDATA=fs.mkdtempSync(path.join(os.tmpdir(),'lds-recall-'));
const fails={n:0}; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails.n++;};

(async()=>{
  const app=await electron.launch({executablePath:require(path.join(APP,'node_modules','electron')),args:[APP,'--user-data-dir='+UDATA,'--no-sandbox'],cwd:APP,env:Object.assign({},process.env)});
  const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.route(/^https?:\/\//,r=>r.abort()); await page.waitForSelector('tr[data-goto]',{timeout:15000}).catch(()=>{}); await page.waitForTimeout(500);

  // a real property (so the assistant can resolve its name for name-stripping)
  const prop=await page.evaluate(()=>{ const ps=window.opProperties(); const p=ps.find(x=>/crest|whitewater/i.test(x.name))||ps[0]; return {key:p.key, name:p.name}; });
  ok(!!(prop&&prop.key),'picked a real property to scope conversations to: '+(prop&&prop.name));

  // seed conversations: 3 about payroll on this property, 1 cap rate, 1 portfolio debt service
  await page.evaluate(async(p)=>{
    const S=window.ldsShell;
    await S.chatSave({scope:p.key, scopeName:p.name, title:'Payroll review', messages:[{role:'user',text:'How much is the payroll per unit here?'},{role:'assistant',text:'Underwritten payroll is 1,700 dollars per unit.'}]});
    await S.chatSave({scope:p.key, scopeName:p.name, title:'Payroll again', messages:[{role:'user',text:'Can we push payroll lower?'},{role:'assistant',text:'Payroll could go to 1,650 per unit with staffing efficiencies.'}]});
    await S.chatSave({scope:p.key, scopeName:p.name, title:'Payroll benchmark', messages:[{role:'user',text:'What is the payroll benchmark?'},{role:'assistant',text:'Benchmark payroll is about 1,500 per unit on a larger property.'}]});
    await S.chatSave({scope:p.key, scopeName:p.name, title:'Valuation', messages:[{role:'user',text:'What cap rate did we use?'},{role:'assistant',text:'We valued it at a 5.5 percent cap rate.'}]});
    await S.chatSave({scope:'portfolio', scopeName:'Portfolio', title:'Debt service', messages:[{role:'user',text:'What is our total monthly debt service across the whole book?'},{role:'assistant',text:'Total monthly debt service is about 1.2 million dollars.'}]});
  }, prop);
  await page.waitForTimeout(300);

  // 1) a payroll question recalls the payroll conversations (topical match)
  const r1=await page.evaluate(async(p)=>await window.LDS_asstRecall('Remind me the payroll figure we landed on', p.key), prop);
  ok(r1.picks.length>=1,'a payroll question recalls prior payroll discussion ('+r1.picks.length+' pick(s))');
  ok(r1.picks.every(x=>/payroll/i.test(x.title+' '+x.snippet)),'every recalled pick is actually about payroll');

  // 2) recall is capped (3 payroll convs exist, at most AI_RECALL_MAX=2 are pulled in)
  ok(r1.picks.length<=2,'recall is capped at 2 conversations even though 3 match (bounds token cost)');

  // 3) an unrelated question recalls nothing
  const r2=await page.evaluate(async(p)=>await window.LDS_asstRecall('What are the ARM reset dates?', p.key), prop);
  ok(r2.picks.length===0,'an unrelated question ("ARM reset dates") recalls nothing — no false memory');

  // 4) scoping: a portfolio question recalls the portfolio conversation, not the property's chats
  const r3=await page.evaluate(async()=>await window.LDS_asstRecall('what is our total debt service', ''), null);
  ok(r3.picks.some(x=>/debt service/i.test(x.title+' '+x.snippet)),'a portfolio question recalls the portfolio debt-service conversation');
  ok(r3.picks.every(x=>!/payroll/i.test(x.title+' '+x.snippet)),'…and does NOT drag in the property payroll chats');

  // 5) naming the property alone is not a topic — its own name is stripped from the recall query
  const r4=await page.evaluate(async(p)=>await window.LDS_asstRecall(p.name, p.key), prop);
  const nameWords=String(prop.name).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=3);
  const leaked=nameWords.filter(w=>(' '+(r4.query||'')+' ').indexOf(' '+w+' ')>=0);
  ok(leaked.length===0,'the focused property’s own name is stripped from the recall query (query="'+(r4.query||'')+'")');
  ok(r4.picks.length===0,'…so naming the property alone recalls nothing (recall is topical, not "every chat about this property")');

  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
  await app.close(); try{fs.rmSync(UDATA,{recursive:true,force:true});}catch(e){}
  console.log(fails.n?fails.n+' FAILED':'all chat-recall e2e checks passed');
  process.exit(fails.n?1:0);
})().catch(e=>{console.error('E2E CRASH',e);process.exit(2);});
