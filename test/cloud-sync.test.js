/* 3.0.0 — cloud-sync.js: two computers (two copies of the sync engine, each with its own folder) on the test server.
   The starting upload, the picture, pending changes and their reason, two people at once, automatic work, view-only,
   offline (and the admin's offline code), a restart dropping what wasn't saved, the admin's lock and requests, chats.
   run:  node test/cloud-sync.test.js     (skipped where PostgreSQL isn't installed) */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const PG = require("./cloud/_pg.js");
const { startStandin } = require("./cloud/standin-server.js");
const { createClient } = require(path.join(__dirname, "..", "cloud-client.js"));
const Sync = require(path.join(__dirname, "..", "cloud-sync.js"));

let fails = 0, count = 0;
function ok(cond, msg){ count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if(!cond) fails++; }
async function section(name, fn){ console.log("\n" + name); try{ await fn(); }catch(e){ ok(false, "threw: " + (e && e.stack || e)); } }
const J = v => JSON.stringify(v);
const h16 = s => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 16);
const rd = f => JSON.parse(fs.readFileSync(f, "utf8"));
const wr = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PERSON = { id: 1 }, APPWIN = { id: 2 };

(async () => {
  if(!PG.findBin()){ console.log("skipped: PostgreSQL isn't installed here — 0 checks"); return; }
  process.env.LDS_CLOUD_POLL_MS = "100000";   // the tests pull by hand
  process.env.LDS_CLOUD_AUTO_MS = "50";
  const db = await PG.start(), si = await startStandin(db, { maxObjectBytes: 50000 });   // a small size limit, like the free plan's 50 MB
  process.env.LDS_CLOUD_PIECE_BYTES = "40000";   // and pieces under it
  process.env.LDS_CLOUD_URL = si.url; process.env.LDS_CLOUD_ANON_KEY = si.anonKey;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lds-sync-"));
  const engines = [], extra = [];
  function computer(name){ const ud = path.join(tmp, name); fs.mkdirSync(ud, { recursive: true }); const e = Sync.create({ userData: ud, appVersion: "3.0.0", chatMeta: c => ({ id: c.id, title: c.title || "", msgCount: (c.messages || []).length, scope: c.scope }) }); engines.push(e); return { e, ud }; }
  async function account(email){ const c = createClient({ url: si.url, anonKey: si.anonKey }); await c.signUp(email, "secret-pw-1"); await si.confirm(email); return c; }
  try{
    // the maintainer makes the group; the operator is its admin
    await si.sql("insert into app.maintainers(email) values ('maint@co.com')");
    const M = await account("maint@co.com"); await M.signIn("maint@co.com", "secret-pw-1");
    await account("op@co.com"); await account("ed@co.com"); await account("view@co.com");
    await M.rpc("lds_group_create", { name: "Company", admin_email: "op@co.com", admin_name: "Operator" });

    // the operator's PC holds today's local data (2.9.17 layout)
    const PC = computer("operator-pc"), local = PC.ud;
    const kA = "name:alpha tower", hA = h16(kA);
    wr(path.join(local, "loans.json"), [{ _id: "ln_1", propertyName: "Alpha Tower", annualRate: 5 }, { _id: "ln_2", propertyName: "Beta", annualRate: 6 }]);
    wr(path.join(local, "documents", hA, "index.json"), { propKey: kA, propName: "Alpha Tower", files: [
      { id: "dprof1", stored: "dprof1.json", name: "profile.json", role: "profile", savedAt: 5, type: "application/json" },
      { id: "dpdf1", stored: "dpdf1.pdf", name: "Loan Agreement.pdf", role: "agreement", savedAt: 6, type: "application/pdf", textLen: 11, sha: "x" }] });
    wr(path.join(local, "documents", hA, "dprof1.json"), { schema: "lds.profile.v1", propKey: kA, fields: { residentialUnits: { value: 120 } } });
    fs.writeFileSync(path.join(local, "documents", hA, "dpdf1.pdf"), Buffer.from("%PDF-1.4 the agreement"));
    fs.writeFileSync(path.join(local, "documents", hA, "dpdf1.txt"), "agreement text");
    wr(path.join(local, "chats", h16("portfolio"), "c1.json"), { id: "c1", scope: "portfolio", title: "Rates", messages: [{ role: "user", text: "hi" }] });
    const localBefore = fs.readFileSync(path.join(local, "loans.json"), "utf8");

    let A = PC.e, E, V, ED, VW;
    await section("no shared database set up: the app works as before", async () => {
      const save = process.env.LDS_CLOUD_URL; delete process.env.LDS_CLOUD_URL; process.env.LDS_CLOUD_OFF = "1";
      const x = computer("plain"); const r = await x.e.init();
      ok(r.mode === "local" && x.e.dataRoot() === x.ud && x.e.canWrite().ok, "local mode, today's folder, writable");
      process.env.LDS_CLOUD_URL = save; delete process.env.LDS_CLOUD_OFF;
    });

    await section("the operator signs in; the group is empty", async () => {
      const r0 = await A.init(); ok(r0.mode === "signin", "no saved sign-in: the sign-in screen");
      const r = await A.signIn("op@co.com", "secret-pw-1");
      ok(r.ok && r.member, "signed in to the group");
      ok(A.dataRoot() === path.join(local, "cloud", A.status().group ? rd(path.join(local, "cloud", "last.json")).group_id : "", "data"), "the picture is in the group's own folder");
      ok(J(rd(path.join(A.dataRoot(), "loans.json"))) === "[]", "an empty group: an empty loan list (never the built-in loans)");
      ok(A.groupIsEmpty() && A.status().role === "admin", "the admin sees an empty group");
    });

    await section("the first upload: this computer's data becomes the group's", async () => {
      const r = await A.uploadStart({ root: local, settings: { "lds.portfolioTargets": { dscrMin: 1.3 } } }, "Starting data from the operator's PC");
      ok(r.ok && r.files === 2 && r.chats === 1, "records, the stored files and the chat went up");
      ok(fs.readFileSync(path.join(local, "loans.json"), "utf8") === localBefore, "today's local files are untouched");
      ok(rd(path.join(A.dataRoot(), "loans.json")).length === 2, "the picture has the loans");
      const idx = rd(path.join(A.dataRoot(), "documents", hA, "index.json"));
      const prof = idx.files.find(f => f.role === "profile");
      ok(prof && rd(path.join(A.dataRoot(), "documents", hA, prof.stored)).fields.residentialUnits.value === 120, "…the property's profile");
      ok(fs.readFileSync(path.join(A.dataRoot(), "documents", hA, "dpdf1.pdf"), "utf8") === "%PDF-1.4 the agreement", "…and its stored file");
      ok(Number((await si.sql("select count(*) n from app.locks")).rows[0].n) === 0, "the starting data locks nothing");
      ok(A.settings()["lds.portfolioTargets"].dscrMin === 1.3, "the shared settings went up");
    });

    await section("the shared database's setup version (3.0.0)", async () => {
      await A.pullNow();
      ok(A.status().setupVersion === Sync.SETUP_NEEDED && A.status().setupOld === false, "the server has the setup this app needs (" + A.status().setupVersion + ")");
      await si.sql("create or replace function app.setup_version() returns int language sql immutable as $$ select 0 $$");
      await A.pullNow();
      ok(A.status().setupOld === true && A.status().setupVersion === 0 && A.status().setupNeeded === Sync.SETUP_NEEDED, "an older server is noticed, so the admin is told");
      await si.sql("create or replace function app.setup_version() returns int language sql immutable as $$ select " + Number(Sync.SETUP_NEEDED) + " $$");
      await A.pullNow();
      ok(A.status().setupOld === false, "…and no longer once it is up to date");
    });

    await section("people join (approved by the admin); an editor's computer gets the same picture", async () => {
      const gid = (await si.sql("select group_id from app.members where email = 'op@co.com'")).rows[0].group_id;
      await si.addMember("ed@co.com", gid, "Eddie", "editor"); await si.addMember("view@co.com", gid, "Vera", "editor");
      ok((await A.rpc("lds_member_set", { email: "view@co.com", name: null, role: "viewer" })).ok, "the admin makes Vera view only");
      ED = computer("editor-pc"); E = ED.e; await E.init();
      const r = await E.signIn("ed@co.com", "secret-pw-1");
      ok(r.ok && r.member && E.status().role === "editor", "the editor is in");
      ok(J(rd(path.join(E.dataRoot(), "loans.json"))) === J(rd(path.join(A.dataRoot(), "loans.json"))), "same loans as the admin");
      for(let i = 0; i < 40 && !fs.existsSync(path.join(E.dataRoot(), "documents", hA, "dpdf1.pdf")); i++) await sleep(50);
      ok(fs.existsSync(path.join(E.dataRoot(), "documents", hA, "dpdf1.pdf")) && fs.readFileSync(path.join(E.dataRoot(), "documents", hA, "dpdf1.txt"), "utf8") === "agreement text", "the stored file and its text came down");
      const ci = rd(path.join(E.dataRoot(), "chats", h16("portfolio"), "index.json"));
      ok(ci.conversations[0].ownerName === "Operator", "the chat shows who started it");
      ok(!E.chatMine("c1") && A.chatMine("c1"), "only its owner may continue it");
    });

    await section("a person's change waits for its reason", async () => {
      const f = path.join(E.dataRoot(), "loans.json"), L = rd(f); L[1].annualRate = 6.25; wr(f, L);
      E.markInput(PERSON); E.noteWrite(PERSON, { loans: true });
      ok(E.pending().length === 1 && E.pending()[0].what === "Loans", "pending: Loans");
      ok(!(await E.commit("   ")).ok, "no reason, not saved");
      const r = await E.commit("Beta's rate reset");
      ok(r.ok && E.pending().length === 0, "saved with the reason");
      await A.pullNow();
      ok(rd(path.join(A.dataRoot(), "loans.json"))[1].annualRate === 6.25, "the admin's picture has it after the next pull");
      const c = (await si.sql("select * from app.changes where reason = $1", ["Beta's rate reset"])).rows;
      ok(c.length === 1 && c[0].field === "[ln_2].annualRate" && c[0].by_name === "Eddie", "recorded field by field, with who");
    });

    await section("two people at once", async () => {
      const fa = path.join(A.dataRoot(), "loans.json"), La = rd(fa); La[0].annualRate = 5.5; wr(fa, La);
      A.markInput(PERSON); A.noteWrite(PERSON, { loans: true });              // the admin's change waits
      const fe = path.join(E.dataRoot(), "loans.json"), Le = rd(fe); Le[1].propertyName = "Beta Lofts"; wr(fe, Le);
      E.markInput(PERSON); E.noteWrite(PERSON, { loans: true });
      ok((await E.commit("New name")).ok, "the editor saves first");
      await A.pullNow();
      const mid = rd(fa);
      ok(mid[0].annualRate === 5.5 && mid[1].propertyName === "Beta Lofts", "the admin's picture keeps their unsaved change and shows the editor's");
      const r = await A.commit("Confirmed rate");
      ok(r.ok, "the admin saves");
      await E.pullNow();
      const end = rd(fe);
      ok(end[0].annualRate === 5.5 && end[1].propertyName === "Beta Lofts", "both changes are in, on both computers");
    });

    await section("the admin's lock: approval code, or a request", async () => {
      ok((await A.setCodes("open-sesame", "offline-123")).ok, "the admin sets the codes");
      const fe = path.join(E.dataRoot(), "loans.json"), Le = rd(fe); Le[0].annualRate = 9; wr(fe, Le);
      E.markInput(PERSON); E.noteWrite(PERSON, { loans: true });
      let r = await E.commit("Typo");
      ok(!r.ok && r.needsApproval && r.needsApproval[0].field === "[ln_1].annualRate", "the admin changed it last: approval needed");
      r = await E.commit("Typo", { approvalCode: "nope" });
      ok(!r.ok && r.wrongCode, "a wrong code is refused");
      r = await E.commit("Typo", { request: true });
      ok(r.ok && r.requested && rd(fe)[0].annualRate === 5.5, "sent as a request; the old value stays in use");
      await A.pullNow();
      const q = A.requests().requests.find(x => x.status === "waiting");
      ok(q && q.by_name === "Eddie", "the admin sees the request");
      r = await A.approve(q.id);
      ok(r.ok && rd(path.join(A.dataRoot(), "loans.json"))[0].annualRate === 9, "approved: it takes effect");
      await E.pullNow();
      ok(rd(fe)[0].annualRate === 9 && E.requests().requests.find(x => x.id === q.id).status === "approved", "the editor sees it applied and approved");
    });

    await section("automatic work goes up by itself", async () => {
      const gdf = path.join(E.dataRoot(), "documents", hA, "rec-general.json");
      const idxf = path.join(E.dataRoot(), "documents", hA, "index.json"), idx = rd(idxf);
      idx.files.push({ id: "rec-general", stored: "rec-general.json", name: "general-data.json", role: "general", savedAt: 9 }); wr(idxf, idx);
      wr(gdf, { noi: { inPlace: 100, computedAt: "x" }, updatedAt: "t" });
      E.autoBegin(APPWIN, "start-up check"); E.noteWrite(APPWIN, { folders: [hA] }); E.autoEnd(APPWIN);
      ok(E.pending().length === 0, "not shown as the person's change");
      for(let i = 0; i < 40; i++){ await sleep(50); if(Number((await si.sql("select count(*) n from app.records where path = $1", ["props/" + hA + "/general-data.json"])).rows[0].n)) break; }
      const c = (await si.sql("select kind, reason from app.changes where path = $1", ["props/" + hA + "/general-data.json"])).rows;
      ok(c.length > 0 && c[0].kind === "app" && /start-up check/.test(c[0].reason), "saved as the app's work, with what it was");
    });

    await section("view-only", async () => {
      VW = computer("viewer-pc"); V = VW.e; await V.init();
      await V.signIn("view@co.com", "secret-pw-1");
      ok(!V.canWrite().ok && V.canWrite().why === "view_only", "a viewer can't write");
      ok(rd(path.join(V.dataRoot(), "loans.json"))[0].annualRate === 9, "…but sees everything");
    });

    await section("offline", async () => {
      si.setDown(true);
      await E.pullNow(); await A.pullNow();
      ok(!E.status().online && !E.canWrite().ok && E.canWrite().why === "offline", "the server unreachable: offline, view-only");
      ok(rd(path.join(E.dataRoot(), "loans.json")).length === 2, "the last picture is still there");
      ok(!A.unlockOffline("wrong").ok && A.unlockOffline("offline-123").ok && A.canWrite().ok, "the admin's offline code lets the admin change data");
      const fa = path.join(A.dataRoot(), "loans.json"), La = rd(fa); La[1].annualRate = 7; wr(fa, La);
      A.markInput(PERSON); A.noteWrite(PERSON, { loans: true });
      const r = await A.commit("Changed on the plane");
      ok(r.ok && r.queued, "saved offline: it waits for the connection");
      si.setDown(false);
      await A.pullNow(); await sleep(200);
      await E.pullNow();
      ok(rd(path.join(E.dataRoot(), "loans.json"))[1].annualRate === 7, "back online: it went up and reached the editor");
      const c = (await si.sql("select kind from app.changes where reason = 'Changed on the plane'")).rows;
      ok(c.length === 1 && c[0].kind === "offline", "recorded as the admin's offline change");
    });

    await section("the admin's offline changes keep what others changed meanwhile", async () => {
      // the editor reaches the database another way while the admin's connection is down
      const si2 = await startStandin(db); extra.push(si2);
      const save = [process.env.LDS_CLOUD_URL, process.env.LDS_CLOUD_ANON_KEY];
      process.env.LDS_CLOUD_URL = si2.url; process.env.LDS_CLOUD_ANON_KEY = si2.anonKey;
      const X = computer("editor-pc-2"); await X.e.init(); await X.e.signIn("ed@co.com", "secret-pw-1");
      process.env.LDS_CLOUD_URL = save[0]; process.env.LDS_CLOUD_ANON_KEY = save[1];
      si.setDown(true); await A.pullNow();
      ok(!A.status().online && A.unlockOffline("offline-123").ok, "the admin is offline, with the offline code");
      const fa = path.join(A.dataRoot(), "loans.json"), La = rd(fa); La[1].annualRate = 8.5; La[0].lenderName = "Admin Bank"; wr(fa, La);
      A.markInput(PERSON); A.noteWrite(PERSON, { loans: true });
      ok((await A.commit("Rate from the lender's letter")).queued, "the admin's change waits for the connection");
      const fx = path.join(X.e.dataRoot(), "loans.json"), Lx = rd(fx); Lx[0].propertyName = "Alpha Tower East"; Lx[0].lenderName = "Editor Bank"; wr(fx, Lx);
      X.e.markInput(PERSON); X.e.noteWrite(PERSON, { loans: true });
      ok((await X.e.commit("The property's new name")).ok, "meanwhile an editor changes the same record");
      si.setDown(false); await A.pullNow(); await sleep(300); await A.pullNow();
      const row = (await si.sql("select content from app.records where path = 'loans.json'")).rows[0].content;
      ok(row[1].annualRate === 8.5 && row[0].propertyName === "Alpha Tower East", "back online: both are in — the admin's rate and the editor's name");
      ok(row[0].lenderName === "Admin Bank", "on the field both changed, the admin's wins");
      ok(A.status().queued === 0, "nothing left waiting");
    });

    await section("a restart drops what wasn't saved", async () => {
      const fe = path.join(E.dataRoot(), "loans.json"), Le = rd(fe); Le[1].annualRate = 99; wr(fe, Le);
      E.markInput(PERSON); E.noteWrite(PERSON, { loans: true });
      ok(E.pending().length === 1, "an unsaved change");
      E.close();
      const E2 = Sync.create({ userData: ED.ud, appVersion: "3.0.0" }); engines.push(E2);
      const r = await E2.init();
      ok(r.mode === "cloud" && E2.status().signedIn, "opens signed in");
      ok(rd(path.join(E2.dataRoot(), "loans.json"))[1].annualRate !== 99 && E2.pending().length === 0, "the unsaved change is gone");
      E = E2;
    });

    await section("a forgotten password", async () => {
      const X = computer("forgot-pc"); await X.e.init();
      ok((await X.e.forgotPassword("view@co.com")).ok, "asking for a code");
      const code = si.recoveryCode("view@co.com");
      ok(!(await X.e.resetPassword("view@co.com", "000000", "brand-new-pw")).ok || code === "000000", "a wrong code is refused");
      await X.e.forgotPassword("view@co.com");
      const r = await X.e.resetPassword("view@co.com", si.recoveryCode("view@co.com"), "brand-new-pw");
      ok(r.ok && r.member && X.e.status().role === "viewer", "the code and a new password: signed in, in the group");
      const c = createClient({ url: si.url, anonKey: si.anonKey });
      ok(!!(await c.signIn("view@co.com", "brand-new-pw")).access_token, "the new password works");
    });

    await section("chats", async () => {
      await E.chatSaved({ id: "c9", scope: kA, scopeName: "Alpha Tower", title: "Units", messages: [{ role: "user", text: "how many units?" }] });
      await A.pullNow();
      const ci = rd(path.join(A.dataRoot(), "chats", h16(kA), "index.json"));
      ok(ci.conversations.some(c => c.id === "c9" && c.ownerName === "Eddie"), "the admin sees the editor's chat, with who started it");
      ok(!A.chatMine("c9") && E.chatMine("c9"), "only the editor continues it");
    });

    await section("a file over the size limit: named, nothing saved; then it goes up in pieces", async () => {
      await account("op2@co.com"); await account("ed2@co.com");
      const g2 = (await M.rpc("lds_group_create", { name: "Second Co", admin_email: "op2@co.com", admin_name: "Op Two" })).id;
      await si.addMember("ed2@co.com", g2, "Ed Two", "editor");
      const P2 = computer("op2-pc"), l2 = P2.ud, k2 = "name:gamma", h2 = h16(k2);
      const big = crypto.randomBytes(130000);   // over the limit: 4 pieces of 40000
      wr(path.join(l2, "loans.json"), [{ _id: "ln_g", propertyName: "Gamma", annualRate: 4 }]);
      wr(path.join(l2, "documents", h2, "index.json"), { propKey: k2, propName: "Gamma", files: [
        { id: "dbig", stored: "dbig.pdf", name: "Big Scan.pdf", role: "agreement", savedAt: 7, type: "application/pdf", textLen: 5 },
        { id: "dsmall", stored: "dsmall.pdf", name: "Small.pdf", role: "other", savedAt: 8, type: "application/pdf" }] });
      fs.writeFileSync(path.join(l2, "documents", h2, "dbig.pdf"), big);
      fs.writeFileSync(path.join(l2, "documents", h2, "dbig.txt"), "scan!");
      fs.writeFileSync(path.join(l2, "documents", h2, "dsmall.pdf"), Buffer.from("%PDF small"));
      // an app without pieces (as before this change)
      process.env.LDS_CLOUD_PIECE_BYTES = "100000000";
      const O1 = P2.e; await O1.init(); await O1.signIn("op2@co.com", "secret-pw-1");
      const pv = O1.uploadPreview(l2);
      ok(pv.loans === 1 && pv.properties === 1 && pv.documents === 2 && pv.bytes === 130000 + 5 + 10 && pv.biggest === 130000, "before starting: what goes up and its size");
      const r1 = await O1.uploadStart({ root: l2, settings: {} }, "Starting data");
      ok(!r1.ok && r1.failed.length === 1 && r1.failed[0].name === "Big Scan.pdf" && r1.failed[0].property === "Gamma" && /maximum allowed size/.test(r1.failed[0].why), "the file over the limit is named, with its property");
      ok(/nothing was saved yet/.test(r1.error) && /Big Scan\.pdf/.test(r1.error), "and the message says nothing was saved yet");
      ok(Number((await si.sql("select count(*) n from app.records where group_id = $1", [g2])).rows[0].n) === 0, "the group is still empty");
      O1.close();
      // this version: pieces
      process.env.LDS_CLOUD_PIECE_BYTES = "40000";
      const P2b = computer("op2-pc-again"); const O2 = P2b.e; await O2.init(); await O2.signIn("op2@co.com", "secret-pw-1");
      const r2 = await O2.uploadStart({ root: l2, settings: {} }, "Starting data");
      ok(r2.ok && r2.files === 3, "uploaded: the big file went up in pieces (" + JSON.stringify(r2) + ")");
      const names = (await si.sql("select name from storage.objects where name like $1 order by name", [g2 + "/props/" + h2 + "/dbig.pdf%"])).rows.map(x => x.name.slice((g2 + "/props/" + h2 + "/").length));
      ok(J(names) === J(["dbig.pdf.lds-part-1", "dbig.pdf.lds-part-2", "dbig.pdf.lds-part-3", "dbig.pdf.lds-part-4", "dbig.pdf.lds-parts.json"]), "stored as 4 pieces and a note (" + names.join(", ") + ")");
      const sizes = (await si.sql("select (metadata->>'size')::int s from storage.objects where name like $1", [g2 + "/props/" + h2 + "/%"])).rows.map(x => x.s);
      ok(sizes.every(x => x <= 50000), "every stored object is under the limit");
      // another computer opens it
      const EC = computer("ed2-pc"); await EC.e.init(); const re = await EC.e.signIn("ed2@co.com", "secret-pw-1");
      ok(re.ok && re.member, "the editor of Second Co is in");
      const dst = path.join(EC.e.dataRoot(), "documents", h2, "dbig.pdf");
      for(let i = 0; i < 60 && !fs.existsSync(dst); i++){ await sleep(100); if(i % 10 === 9) await EC.e.pullNow(); }
      ok(fs.existsSync(dst) && Buffer.compare(fs.readFileSync(dst), big) === 0, "on another computer the big file is whole, byte for byte");
      ok(fs.readFileSync(path.join(EC.e.dataRoot(), "documents", h2, "dsmall.pdf"), "utf8") === "%PDF small", "and the small one too");
      // a damaged note is caught, not a broken file
      await si.sql("update storage.objects set name = name || '-gone' where name = $1", [g2 + "/props/" + h2 + "/dbig.pdf.lds-part-3"]);
      const C = createClient({ url: si.url, anonKey: si.anonKey }); await C.signIn("ed2@co.com", "secret-pw-1");
      let caught = null; try{ await C.download(g2 + "/props/" + h2 + "/dbig.pdf"); }catch(e){ caught = e; }
      ok(caught && caught.code === "storage", "a missing piece: an error, never a cut-off file");

      // the admin starts the group over, then uploads again with the saved market rates and custom categories
      await si.sql("update storage.objects set name = $1 where name = $2", [g2 + "/props/" + h2 + "/dbig.pdf.lds-part-3", g2 + "/props/" + h2 + "/dbig.pdf.lds-part-3-gone"]);
      const rs = await O2.rpc("lds_group_reset", { group_name: "Second Co" });
      ok(rs.ok, "the admin starts Second Co over");
      await O2.pullNow(); await EC.e.pullNow();
      ok(O2.groupIsEmpty() && EC.e.groupIsEmpty(), "both computers see an empty group");
      ok(J(rd(path.join(EC.e.dataRoot(), "loans.json"))) === "[]", "the editor's picture is empty (rebuilt from nothing)");
      const rates = { "ldsHub.rateHist.v2": { sofr30: { "2026-10-05": 4.31 }, meta: { sofr30: { value: 4.31, date: "2026-10-05", fetchedAt: "2026-10-05T09:00:00Z" } } },
                      "ldsHub.nyfedHist.v1": { effr: { "2026-09": 4.33 } }, "lds.customCategories": { "Parking": "income" } };
      const r3 = await O2.uploadStart({ root: l2, settings: rates }, "Starting data again");
      ok(r3.ok && r3.records === 3, "uploaded again: the records and the settings (" + JSON.stringify(r3) + ")");
      await EC.e.pullNow();
      const seenRates = EC.e.settings();
      ok(seenRates["ldsHub.rateHist.v2"].sofr30["2026-10-05"] === 4.31 && seenRates["ldsHub.nyfedHist.v1"].effr["2026-09"] === 4.33 && seenRates["lds.customCategories"].Parking === "income",
         "the editor's computer gets the same saved rates and custom categories");
      ok(fs.existsSync(path.join(EC.e.dataRoot(), "documents", h2, "dbig.pdf")), "and the documents again (the stored files were kept)");
      // a rate fetched later goes up as the app's own work: no reason asked
      const APP = { id: 77 };
      O2.autoBegin(APP, "saved market rates");
      const w = O2.setSetting(APP, "ldsHub.rateHist.v2", JSON.stringify({ sofr30: { "2026-10-05": 4.31, "2026-10-06": 4.30 }, meta: { sofr30: { value: 4.30, date: "2026-10-06", fetchedAt: "2026-10-06T09:00:00Z" } } }));
      O2.autoEnd(APP);
      ok(w.ok && O2.pending().length === 0, "a new rate isn't a person's change (nothing waits for a reason)");
      await O2.flushAuto(); await EC.e.pullNow();
      ok(EC.e.settings()["ldsHub.rateHist.v2"].sofr30["2026-10-06"] === 4.30, "and reaches the other computer");
      const ch = (await si.sql("select field, kind from app.changes where group_id = $1 and path = 'settings.json' and kind = 'app'", [g2])).rows;
      ok(ch.some(c => /sofr30\.2026-10-06$/.test(c.field)), "the change history keeps the new rate, marked as the app's");
    });
  } finally {
    engines.forEach(e => { try{ e.close(); }catch(x){} });
    for(const x of extra){ try{ await x.stop(); }catch(e){} }
    await si.stop(); await db.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("\n" + (count - fails) + " of " + count + " checks passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
