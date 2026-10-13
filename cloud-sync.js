/* ============================================================================
   3.0.0 — the shared database on this computer (main process).

   The app keeps working on files laid out exactly as before (loans.json,
   documents/<h>/…, chats/<h>/…) — "the picture" — but in a folder of the
   group's own: userData/cloud/<group>/data. Today's local data is never touched.

     server/   the server's copy of every record: the base unsaved changes are
               measured from, and what the picture is rebuilt from on opening
               (so nothing unsaved survives a restart)
     data/     the picture the screens read and write
     state.json, offline-queue.json

   Records on the server ↔ files in the picture:
     loans.json                      ↔ data/loans.json
     settings.json                   ↔ data/settings.json (targets, custom categories, "not a duplicate")
     props/<h>/index.json            ↔ the documents in data/documents/<h>/index.json (the list; files in storage)
     props/<h>/profile.json …        ↔ the app's own records in data/documents/<h>/ (by what they are)
     stored files                    ↔ storage "<group>/props/<h>/<stored>" and "<id>.txt"
     chats                           ↔ data/chats/<h>/<id>.json + index.json

   A write by a person waits as "pending" until they type why (commit). Automatic
   work (start-up checks, recomputing) goes up by itself, stamped as the app. A
   view-only member, or anyone offline (except the admin with the offline code),
   can't write at all. Every few seconds the app asks the server for anything new.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { createClient, CloudError } = require("./cloud-client");
const M = require("./cloud-merge");

const APP_RECORDS = { "profile.json": "profile", "assumptions.json": "assumptions", "general-data.json": "general", "history.json": "history" };
const ROLE_FILE = { profile: "profile.json", assumptions: "assumptions.json", general: "general-data.json", history: "history.json" };
// the window's settings that are the team's data (kept in localStorage by the page)
const SHARED_KEYS = ["lds.portfolioTargets", "lds.customCategories", "lds.notDuplicate"];
const sha1 = s => crypto.createHash("sha1").update(String(s || "")).digest("hex");
const h16 = s => sha1(s).slice(0, 16);

function readJSON(f, dflt){ try{ return JSON.parse(fs.readFileSync(f, "utf8")); }catch(e){ return dflt; } }
function writeJSON(f, v){ fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + ".tmp"; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); }
function rm(f){ try{ fs.rmSync(f, { recursive: true, force: true }); }catch(e){} }

// The admin's offline code is checked on the admin's own computer with no connection, so the app hashes it itself
// (PBKDF2); the server only keeps the hash.
function offlineHash(code){
  const salt = crypto.randomBytes(16).toString("hex"), it = 200000;
  return "pbkdf2$sha256$" + it + "$" + salt + "$" + crypto.pbkdf2Sync(String(code), salt, it, 32, "sha256").toString("hex");
}
function checkOfflineCode(code, h){
  const p = String(h || "").split("$"); if(p.length !== 5 || p[0] !== "pbkdf2" || p[1] !== "sha256") return false;
  const want = Buffer.from(p[4], "hex"), got = crypto.pbkdf2Sync(String(code), p[3], Number(p[2]) || 1, want.length, "sha256");
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function create(opts){
  const userData = opts.userData, appVersion = opts.appVersion || "0.0.0";
  const log = opts.log || (() => {});
  const broadcast = opts.broadcast || (() => {});
  const chatMetaFn = opts.chatMeta || (c => ({ id: c.id, title: c.title || "" }));
  const pollMs = Number(process.env.LDS_CLOUD_POLL_MS || opts.pollMs || 5000);
  const autoDelayMs = Number(process.env.LDS_CLOUD_AUTO_MS || 1500);
  const safe = opts.safeStorage || null;
  const cloudDir = path.join(userData, "cloud");

  let cfg = null, client = null;
  let me = null;               // lds_hello's answer
  let groupDir = null;         // userData/cloud/<group>
  let st = null;               // { seq, versions:{path:version}, chats:{id:{owner_id,owner_name,scope}} }
  let online = false, offlineUnlocked = false, polling = null, pollBusy = false, closed = false;
  let members = [], requests = [];
  const dirty = new Map();     // path -> { kind: 'person'|'app', label, at }
  const winState = new Map();  // webContents id -> { auto: 0, label, input: 0 }
  let autoTimer = null, lastError = null, downloads = 0;

  // ---- configuration and the saved sign-in ------------------------------------------------------------------------------
  function loadConfig(){
    const env = process.env.LDS_CLOUD_URL ? { url: process.env.LDS_CLOUD_URL, anonKey: process.env.LDS_CLOUD_ANON_KEY || "" } : null;
    const user = readJSON(path.join(userData, "cloud-server.json"), null);
    const shipped = readJSON(opts.configFile || path.join(__dirname, "cloud-config.json"), null);
    const c = env || (user && user.url ? user : null) || (shipped && shipped.url ? shipped : null);
    return c && c.url && c.anonKey ? { url: String(c.url), anonKey: String(c.anonKey) } : null;
  }
  const sessionFile = () => path.join(cloudDir, "session.bin");
  function saveSession(s){
    try{
      fs.mkdirSync(cloudDir, { recursive: true });
      if(!s){ rm(sessionFile()); return; }
      const txt = JSON.stringify(s);
      const enc = safe && safe.isEncryptionAvailable && safe.isEncryptionAvailable() ? Buffer.concat([Buffer.from("E1"), safe.encryptString(txt)]) : Buffer.concat([Buffer.from("P1"), Buffer.from(txt)]);
      fs.writeFileSync(sessionFile(), enc);
    }catch(e){ log("cloud: session not saved: " + e.message); }
  }
  function loadSession(){
    try{
      const b = fs.readFileSync(sessionFile()), tag = b.slice(0, 2).toString(), rest = b.slice(2);
      if(tag === "E1" && safe) return JSON.parse(safe.decryptString(rest));
      if(tag === "P1") return JSON.parse(rest.toString());
    }catch(e){}
    return null;
  }

  // ---- paths --------------------------------------------------------------------------------------------------------------
  const dataDir = () => path.join(groupDir, "data");
  const serverDir = () => path.join(groupDir, "server");
  const stateFile = () => path.join(groupDir, "state.json");
  const queueFile = () => path.join(groupDir, "offline-queue.json");
  const saveState = () => { try{ writeJSON(stateFile(), st); }catch(e){} };
  const mirrorFile = p => path.join(serverDir(), "records", p);
  const mirrorChatFile = id => path.join(serverDir(), "chats", id + ".json");
  function mirror(p){ return readJSON(mirrorFile(p), null); }
  function setMirror(p, c){ if(c === null || c === undefined) rm(mirrorFile(p)); else writeJSON(mirrorFile(p), c); }
  const docDir = h => path.join(dataDir(), "documents", h);
  const objectPath = (h, name) => me.group_id + "/props/" + h + "/" + name;

  // ---- the picture: reading and writing one record -------------------------------------------------------------------------
  function readIndex(h){ return readJSON(path.join(docDir(h), "index.json"), null); }
  function pictureRecord(p){
    if(p === "loans.json") return readJSON(path.join(dataDir(), "loans.json"), null);
    if(p === "settings.json") return readJSON(path.join(dataDir(), "settings.json"), null);
    const m = p.match(/^props\/([0-9a-f]{16})\/(.+)$/); if(!m) return null;
    const idx = readIndex(m[1]); if(!idx) return null;
    const files = Array.isArray(idx.files) ? idx.files : [];
    if(m[2] === "index.json") return { propKey: idx.propKey || "", propName: idx.propName || "", files: files.filter(f => !APP_RECORDS[f.name] || !ROLE_FILE[f.role]) };
    const role = APP_RECORDS[m[2]]; if(!role) return null;
    const f = files.filter(x => x.role === role).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    return f ? readJSON(path.join(docDir(m[1]), f.stored), null) : null;
  }
  function writePictureRecord(p, c, meta){
    if(p === "loans.json"){ if(c === null) rm(path.join(dataDir(), "loans.json")); else writeJSON(path.join(dataDir(), "loans.json"), c); return; }
    if(p === "settings.json"){ if(c === null) rm(path.join(dataDir(), "settings.json")); else writeJSON(path.join(dataDir(), "settings.json"), c); return; }
    const m = p.match(/^props\/([0-9a-f]{16})\/(.+)$/); if(!m) return;
    const h = m[1], dir = docDir(h);
    const idx = readIndex(h) || { propKey: "", propName: "", files: [] };
    idx.files = Array.isArray(idx.files) ? idx.files : [];
    if(m[2] === "index.json"){
      const own = idx.files.filter(f => ROLE_FILE[f.role] && APP_RECORDS[f.name]);
      if(c === null){
        if(!own.length){ rm(dir); return; }
        idx.files = own;
      } else {
        idx.propKey = c.propKey || idx.propKey; idx.propName = c.propName || idx.propName;
        idx.files = own.concat(Array.isArray(c.files) ? c.files : []);
      }
      writeJSON(path.join(dir, "index.json"), idx);
      return;
    }
    const role = APP_RECORDS[m[2]]; if(!role) return;
    idx.files.filter(f => f.role === role).forEach(f => rm(path.join(dir, f.stored)));
    idx.files = idx.files.filter(f => f.role !== role);
    if(c !== null){
      const json = JSON.stringify(c), stored = "rec-" + role + ".json";
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, stored), json);
      idx.files.push({ id: "rec-" + role, stored, name: m[2], size: Buffer.byteLength(json), type: "application/json", role,
                       savedAt: (meta && meta.at) || Date.now(), textLen: 0, sha: sha1(json), readLabel: "" });
      if(!idx.propKey && meta && meta.propKey) idx.propKey = meta.propKey;
    }
    if(!idx.files.length && !idx.propKey){ rm(dir); return; }
    writeJSON(path.join(dir, "index.json"), idx);
  }
  // the records a property folder stands for
  const folderPaths = h => ["props/" + h + "/index.json"].concat(Object.keys(APP_RECORDS).map(n => "props/" + h + "/" + n));

  // ---- chats in the picture ---------------------------------------------------------------------------------------------------
  const chatDir = scope => path.join(dataDir(), "chats", h16(scope));
  function writePictureChat(row){
    const dir = chatDir(row.scope || "portfolio");
    const idx = readJSON(path.join(dir, "index.json"), null) || { scope: row.scope, scopeName: "", conversations: [] };
    idx.conversations = (idx.conversations || []).filter(c => c.id !== row.id);
    // a chat that moved to another property leaves its old folder
    try{ const all = fs.readdirSync(path.join(dataDir(), "chats")); all.forEach(d => { if(d === path.basename(dir)) return; const f = path.join(dataDir(), "chats", d, row.id + ".json"); if(fs.existsSync(f)){ rm(f); const oi = readJSON(path.join(dataDir(), "chats", d, "index.json"), null); if(oi){ oi.conversations = (oi.conversations || []).filter(c => c.id !== row.id); writeJSON(path.join(dataDir(), "chats", d, "index.json"), oi); } } }); }catch(e){}
    if(!row.deleted && row.content){
      const conv = Object.assign({}, row.content, { id: row.id, scope: row.scope, ownerId: row.owner_id, ownerName: row.owner_name });
      if(!idx.scopeName && conv.scopeName) idx.scopeName = conv.scopeName;
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, row.id + ".json"), JSON.stringify(conv));
      idx.conversations.push(Object.assign(chatMetaFn(conv), { ownerId: row.owner_id, ownerName: row.owner_name }));
    } else rm(path.join(dir, row.id + ".json"));
    idx.scope = row.scope;
    writeJSON(path.join(dir, "index.json"), idx);
  }

  // ---- rebuilding the picture from the server's copy -----------------------------------------------------------------------------
  function rebuildPicture(){
    rm(dataDir()); fs.mkdirSync(dataDir(), { recursive: true });
    const recRoot = path.join(serverDir(), "records");
    const walk = (d, pre) => { let out = []; try{ fs.readdirSync(d, { withFileTypes: true }).forEach(e => { if(e.isDirectory()) out = out.concat(walk(path.join(d, e.name), pre + e.name + "/")); else if(!e.name.endsWith(".tmp")) out.push(pre + e.name); }); }catch(e){} return out; };
    const paths = walk(recRoot, "");
    // the documents' lists first, so the app's own records land beside them
    paths.sort((a, b) => (b.endsWith("/index.json") ? 1 : 0) - (a.endsWith("/index.json") ? 1 : 0));
    paths.forEach(p => writePictureRecord(p, mirror(p)));
    if(!fs.existsSync(path.join(dataDir(), "loans.json"))) writeJSON(path.join(dataDir(), "loans.json"), []);
    // stored files already fetched stay in the server copy's file cache
    linkCachedFiles();
    try{ fs.readdirSync(path.join(serverDir(), "chats")).forEach(f => { const row = readJSON(path.join(serverDir(), "chats", f), null); if(row) writePictureChat(row); }); }catch(e){}
    // the admin's changes made offline and not sent yet are saved changes: they go back on
    readQueue().forEach(b => b.items.forEach(it => writePictureRecord(it.path, it.content)));
  }
  // stored files are kept once in server/files/<h>/<name> and copied into the picture
  const cacheFile = (h, name) => path.join(serverDir(), "files", h, name);
  function linkCachedFiles(){
    try{ fs.readdirSync(path.join(dataDir(), "documents")).forEach(h => {
      const idx = readIndex(h); (idx && idx.files || []).forEach(f => {
        if(ROLE_FILE[f.role] && APP_RECORDS[f.name]) return;
        [f.stored, f.id + ".txt"].forEach(n => { const src = cacheFile(h, n), dst = path.join(docDir(h), n); if(fs.existsSync(src) && !fs.existsSync(dst)){ try{ fs.copyFileSync(src, dst); }catch(e){} } });
      });
    }); }catch(e){}
  }

  // ---- the admin's offline changes ---------------------------------------------------------------------------------------------
  function readQueue(){ return groupDir ? (readJSON(queueFile(), []) || []) : []; }
  function writeQueue(q){ if(q.length) writeJSON(queueFile(), q); else rm(queueFile()); }

  // ---- status -----------------------------------------------------------------------------------------------------------------------
  function role(){ return me && me.role || null; }
  function status(){
    return {
      configured: !!cfg, signedIn: !!(client && client.session), member: !!(me && me.member), active: !!groupDir,
      email: me && me.email || (client && client.user && client.user.email) || "", name: me && me.name || "",
      role: role(), group: me && me.group_name || "", adminName: me && me.admin_name || "", maintainer: !!(me && me.maintainer),
      online, offlineUnlocked, canWrite: canWrite().ok, pending: pendingList(), queued: readQueue().length,
      requests: requests.filter(r => r.status === "waiting").length, lastError, downloads, appVersion,
      hasOfflineCode: !!(me && me.offline_hash)
    };
  }
  function tell(){ broadcast("lds:cloud-status", status()); }
  function canWrite(){
    if(!groupDir) return { ok: true };
    if(role() === "viewer") return { ok: false, why: "view_only", message: "You can only view this group's data." };
    if(!online && !(role() === "admin" && offlineUnlocked)) return { ok: false, why: "offline", message: "You're offline — the app is view-only until the connection is back." };
    return { ok: true };
  }
  function pendingList(){
    return [...dirty.entries()].filter(([, d]) => d.kind === "person").map(([p]) => describePath(p));
  }
  function describePath(p){
    const out = { path: p, what: p };
    if(p === "loans.json") out.what = "Loans";
    else if(p === "settings.json") out.what = "Settings";
    else{ const m = p.match(/^props\/([0-9a-f]{16})\/(.+)$/); if(m){ const idx = readIndex(m[1]) || mirror("props/" + m[1] + "/index.json") || {}; out.propKey = idx.propKey || ""; out.propName = idx.propName || idx.propKey || m[1];
      out.what = { "index.json": "documents", "profile.json": "profile", "assumptions.json": "assumptions", "general-data.json": "numbers (general data)", "history.json": "assumption history" }[m[2]] || m[2]; } }
    return out;
  }

  // ---- who is writing: a person, or the app by itself ----------------------------------------------------------------------------
  function ws(sender){ const id = sender && sender.id || 0; if(!winState.has(id)) winState.set(id, { auto: 0, label: "", input: 0 }); return winState.get(id); }
  function kindOf(sender){
    const w = ws(sender);
    // automatic only inside the app's own work, and not just after the person touched the keyboard or mouse
    return (w.auto > 0 && Date.now() - w.input > 2000) ? { kind: "app", label: w.label || "automatic update" } : { kind: "person" };
  }

  // ---- staging what changed -----------------------------------------------------------------------------------------------------------
  function stage(paths, sender){
    if(!groupDir) return;
    const k = kindOf(sender);
    let personChanged = false, autoQueued = false;
    paths.forEach(p => {
      const pic = pictureRecord(p), srv = mirror(p);
      if(M.sameButStamps(srv, pic)){ if(dirty.has(p) && dirty.get(p).kind !== "queued"){ dirty.delete(p); personChanged = true; } return; }
      const was = dirty.get(p);
      if(was && was.kind === "person") return;            // stays with the person's pending change
      if(k.kind === "person"){ dirty.set(p, { kind: "person", at: Date.now() }); personChanged = true; }
      else { dirty.set(p, { kind: "app", label: k.label, at: Date.now() }); autoQueued = true; }
    });
    if(personChanged) tell();
    if(autoQueued) scheduleAuto();
  }
  function noteWrite(sender, what){
    if(!groupDir) return;
    const paths = [];
    if(what.loans) paths.push("loans.json");
    if(what.settings) paths.push("settings.json");
    (what.folders || []).forEach(h => folderPaths(h).forEach(p => paths.push(p)));
    stage(paths, sender);
  }

  function scheduleAuto(){ clearTimeout(autoTimer); autoTimer = setTimeout(() => { flushAuto().catch(e => log("cloud: auto save failed: " + e.message)); }, autoDelayMs); }
  async function flushAuto(){
    const auto = [...dirty.entries()].filter(([, d]) => d.kind === "app");
    if(!auto.length || !online) return;
    const labels = [...new Set(auto.map(([, d]) => d.label))].slice(0, 3).join("; ");
    const r = await send(auto.map(([p]) => p), "App: " + labels, { kind: "app" });
    if(r && r.oldApp){ auto.forEach(([p]) => { writePictureRecord(p, mirror(p)); dirty.delete(p); }); broadcast("lds:cloud-changed", { reload: true, why: "old-app" }); }
  }

  // ---- sending: uploads first, then the records; a save from an old copy is folded in and sent again --------------------------------
  async function uploadNewFiles(items){
    for(const it of items){
      const m = it.path.match(/^props\/([0-9a-f]{16})\/index\.json$/); if(!m || !it.content) continue;
      const known = new Set(((mirror(it.path) || {}).files || []).map(f => f.id));
      for(const f of (it.content.files || [])){
        if(known.has(f.id)) continue;
        for(const n of [f.stored, f.id + ".txt"]){
          const src = path.join(docDir(m[1]), n);
          if(!fs.existsSync(src)) continue;
          await client.upload(objectPath(m[1], n), fs.readFileSync(src), { type: n === f.stored ? (f.type || "application/octet-stream") : "text/plain" });
          try{ fs.mkdirSync(path.dirname(cacheFile(m[1], n)), { recursive: true }); fs.copyFileSync(src, cacheFile(m[1], n)); }catch(e){}
        }
      }
    }
  }
  function buildItems(paths, fixed){
    return paths.map(p => ({ path: p, base_version: st.versions[p] || 0, content: fixed && Object.prototype.hasOwnProperty.call(fixed, p) ? fixed[p] : pictureRecord(p) }));
  }
  function applySaved(items, res){
    (res.results || []).forEach(r => {
      const it = items.find(x => x.path === r.path); if(!it) return;
      if(!r.unchanged) setMirror(r.path, it.content);
      st.versions[r.path] = r.version;
    });
    // a deleted record that was never on the server comes back with no result: nothing to keep
    items.forEach(it => { if(it.content === null && !(res.results || []).some(r => r.path === it.path)){ setMirror(it.path, null); delete st.versions[it.path]; } });
    saveState();
  }
  async function send(paths, reason, o){
    o = o || {};
    const fixed = o.contents ? Object.assign({}, o.contents) : null;
    let items = buildItems(paths, fixed);
    for(let round = 0; round < 4; round++){
      await uploadNewFiles(items);
      const res = await client.rpc("lds_save", { items, reason, kind: o.kind || "person", approval_code: o.approvalCode || null,
                                                 request_id: o.requestId || null, app_version: appVersion });
      if(res.ok){ applySaved(items, res); paths.forEach(p => dirty.delete(p)); tell(); return { ok: true, approvedBy: res.approved_by || null }; }
      if(res.old_app) return { ok: false, oldApp: true, newest: res.newest };
      if(res.needs_approval) return { ok: false, needsApproval: res.needs_approval, wrongCode: !!res.wrong_code };
      if(res.conflicts){
        // someone saved first: lay my changes over theirs (mine win where we both changed a field) and send again
        res.conflicts.forEach(c => {
          const base = mirror(c.path), mine = fixed && c.path in fixed ? fixed[c.path] : pictureRecord(c.path);
          setMirror(c.path, c.content); st.versions[c.path] = c.version || 0;
          const merged = M.merge3(base, mine, c.content);
          if(fixed && c.path in fixed) fixed[c.path] = merged;
          writePictureRecord(c.path, dirty.has(c.path) && !(fixed && c.path in fixed) ? merged : M.merge3(base, pictureRecord(c.path), merged));
        });
        saveState();
        items = buildItems(paths, fixed);
        broadcast("lds:cloud-changed", { paths: res.conflicts.map(c => c.path), merged: true });
        continue;
      }
      return { ok: false, error: "unexpected answer" };
    }
    return { ok: false, error: "Others kept saving the same records; try again." };
  }

  // ---- the person saves (with a reason) or drops their pending changes ------------------------------------------------------------------
  async function commit(reason, o){
    o = o || {};
    reason = String(reason || "").trim();
    if(!reason) return { ok: false, error: "Type why you made this change." };
    const cw = canWrite(); if(!cw.ok) return { ok: false, error: cw.message, why: cw.why };
    const paths = [...dirty.entries()].filter(([, d]) => d.kind === "person" || d.kind === "app").map(([p]) => p);
    if(!paths.length) return { ok: true, nothing: true };
    if(!online){
      // the admin, offline, with the offline code: the change is kept and goes up when the connection is back
      const q = readQueue(); q.push({ reason, at: new Date().toISOString(), items: buildItems(paths) }); writeQueue(q);
      paths.forEach(p => dirty.set(p, { kind: "queued" })); tell();
      return { ok: true, queued: true };
    }
    try{
      if(o.request){
        const items = buildItems(paths).map(it => Object.assign({}, it, { base: mirror(it.path) }));
        const r = await client.rpc("lds_request", { items, reason });
        discard();   // a change waiting for the admin doesn't take effect
        await pull().catch(() => {});
        return { ok: true, requested: true, id: r.id };
      }
      return await send(paths, reason, { kind: "person", approvalCode: o.approvalCode });
    }catch(e){ return errorResult(e); }
  }
  function discard(){
    [...dirty.entries()].forEach(([p, d]) => { if(d.kind === "queued") return; writePictureRecord(p, mirror(p)); dirty.delete(p); });
    linkCachedFiles();
    tell();
    broadcast("lds:cloud-changed", { reload: true, why: "discarded" });
    return { ok: true };
  }
  function errorResult(e){
    if(e instanceof CloudError && e.code === "offline"){ setOnline(false); return { ok: false, error: e.message, why: "offline" }; }
    return { ok: false, error: e && e.message || String(e), why: e && e.code };
  }

  // ---- live: anything new since the last answer ---------------------------------------------------------------------------------------
  async function pull(){
    if(!client || !groupDir) return;
    const changed = { loans: false, settings: false, props: new Set(), chats: false, requests: false };
    let more = true, rounds = 0;
    while(more && rounds++ < 200){
      const res = await client.rpc("lds_pull", { since: st.seq || 0, max_rows: 500 });
      members = res.members || members;
      if(res.role && me && me.role !== res.role){ me = Object.assign({}, me, { role: res.role }); if(st) st.me = me; setTimeout(tell, 0); }
      (res.records || []).forEach(rec => {
        const old = mirror(rec.path);
        const same = M.eq(old, rec.content);
        setMirror(rec.path, rec.content); st.versions[rec.path] = rec.version;
        if(same) return;
        const d = dirty.get(rec.path);
        if(d){ writePictureRecord(rec.path, M.merge3(old, pictureRecord(rec.path), rec.content)); }
        else writePictureRecord(rec.path, rec.content, { at: Date.parse(rec.updated_at) || Date.now() });
        if(rec.path === "loans.json") changed.loans = true;
        else if(rec.path === "settings.json") changed.settings = true;
        else{ const m = rec.path.match(/^props\/([0-9a-f]{16})\//); if(m){ const idx = readIndex(m[1]) || {}; changed.props.add(idx.propKey || m[1]); } }
      });
      (res.chats || []).forEach(row => {
        const old = readJSON(mirrorChatFile(row.id), null);
        writeJSON(mirrorChatFile(row.id), row);
        st.chats[row.id] = { owner_id: row.owner_id, owner_name: row.owner_name, scope: row.scope };
        if(old && old.seq === row.seq) return;
        writePictureChat(row); changed.chats = true;
      });
      (res.requests || []).forEach(q => { requests = requests.filter(x => x.id !== q.id).concat([q]); changed.requests = true; });
      st.seq = res.seq; more = !!res.more;
    }
    saveState();
    if(changed.loans || changed.settings || changed.props.size || changed.chats) broadcast("lds:cloud-changed", { loans: changed.loans, settings: changed.settings, props: [...changed.props], chats: changed.chats });
    if(changed.requests) broadcast("lds:cloud-requests", requestsFor());
    fetchMissingFiles().catch(e => log("cloud: file fetch: " + e.message));
  }
  function requestsFor(){ return { requests: requests.slice().sort((a, b) => (b.seq || 0) - (a.seq || 0)), role: role(), me: me && me.user_id }; }

  // download every stored file the picture lists but doesn't have (so it can be read offline)
  let fetching = false;
  async function fetchMissingFiles(){
    if(fetching || !online) return; fetching = true;
    try{
      let got = 0;
      const docs = path.join(dataDir(), "documents");
      for(const h of (fs.existsSync(docs) ? fs.readdirSync(docs) : [])){
        const idx = readIndex(h); if(!idx) continue;
        for(const f of (idx.files || [])){
          if(ROLE_FILE[f.role] && APP_RECORDS[f.name]) continue;
          for(const n of [f.stored, f.id + ".txt"]){
            const dst = path.join(docDir(h), n); if(fs.existsSync(dst)) continue;
            const cf = cacheFile(h, n);
            if(!fs.existsSync(cf)){
              if(n.endsWith(".txt") && !f.textLen) continue;
              downloads++; tell();
              try{ const buf = await client.download(objectPath(h, n)); fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, buf); }
              catch(e){ if(e.code === "offline") throw e; log("cloud: missing file " + h + "/" + n + ": " + e.message); continue; }
              finally{ downloads--; }
            }
            try{ fs.copyFileSync(cf, dst); got++; }catch(e){}
          }
        }
      }
      if(got){ broadcast("lds:cloud-changed", { files: true }); tell(); }
    } finally { fetching = false; }
  }

  function setOnline(v){
    if(online === v) return;
    online = v; if(!v) offlineUnlocked = offlineUnlocked && role() === "admin";
    tell();
    if(v) flushQueue().catch(e => log("cloud: offline changes not sent: " + e.message));
  }
  async function flushQueue(){
    const q = readQueue(); if(!q.length || !online) return;
    while(q.length){
      const b = q[0];
      const paths = b.items.map(it => it.path), contents = {};
      b.items.forEach(it => contents[it.path] = it.content);
      // each batch goes up as it was saved, with its own reason (later batches carry their own changes)
      const r = await send(paths, b.reason, { kind: "offline", contents });
      if(!r.ok) { lastError = r.error || "The changes made offline couldn't be sent."; tell(); return; }
      q.shift(); writeQueue(q);
    }
    [...dirty.entries()].forEach(([p, d]) => { if(d.kind === "queued") dirty.delete(p); });
    tell();
  }

  async function tick(){
    if(pollBusy || closed) return; pollBusy = true;
    try{ await pull(); lastError = null; setOnline(true); }
    catch(e){
      if(e instanceof CloudError && (e.code === "offline")) setOnline(false);
      else if(e instanceof CloudError && e.code === "not_member"){ me = Object.assign({}, me, { member: false }); lastError = e.message; tell(); broadcast("lds:cloud-removed", {}); }
      else if(e instanceof CloudError && e.code === "auth"){ lastError = e.message; tell(); broadcast("lds:cloud-signin", {}); }
      else { lastError = e && e.message || String(e); log("cloud: pull failed: " + lastError); }
    } finally { pollBusy = false; }
  }
  function startPolling(){ stopPolling(); polling = setInterval(tick, pollMs); }
  function stopPolling(){ if(polling) clearInterval(polling); polling = null; }

  // ---- opening a group --------------------------------------------------------------------------------------------------------------
  async function openGroup(hello){
    me = hello;
    groupDir = path.join(cloudDir, hello.group_id);
    fs.mkdirSync(groupDir, { recursive: true });
    st = Object.assign({ seq: 0, versions: {}, chats: {} }, readJSON(stateFile(), {}));
    st.me = hello; saveState();
    writeJSON(path.join(cloudDir, "last.json"), { group_id: hello.group_id, me: hello });
    dirty.clear();
    rebuildPicture();
    readQueue().forEach(b => b.items.forEach(it => dirty.set(it.path, { kind: "queued" })));
    if(online){ await pull(); }
    startPolling();
    tell();
  }

  return {
    SHARED_KEYS,
    // ---- start-up -----------------------------------------------------------------------------------------------------------------------
    async init(){
      cfg = loadConfig();
      if(!cfg) return { mode: "local" };
      client = createClient({ url: cfg.url, anonKey: cfg.anonKey, session: loadSession(), onSession: saveSession });
      if(!client.session) return { mode: "signin" };
      try{
        const h = await client.rpc("lds_hello"); online = true;
        if(!h.member) { me = h; return { mode: "signin", notMember: true }; }
        await openGroup(h); return { mode: "cloud" };
      }catch(e){
        if(e instanceof CloudError && e.code === "offline"){
          // offline: open the last picture of the last group, view-only
          const last = readJSON(path.join(cloudDir, "last.json"), null);
          if(last && last.group_id && fs.existsSync(path.join(cloudDir, last.group_id, "server"))){ online = false; await openGroup(last.me); return { mode: "cloud", offline: true }; }
          return { mode: "signin", offline: true };
        }
        return { mode: "signin", error: e.message };
      }
    },
    get active(){ return !!groupDir; },
    get configured(){ return !!cfg; },
    dataRoot(){ return groupDir ? dataDir() : userData; },
    status, canWrite,
    async signIn(email, password){
      if(!client) return { ok: false, error: "No shared database is set up for this app." };
      try{
        await client.signIn(String(email || "").trim(), String(password || ""));
        const h = await client.rpc("lds_hello"); online = true; me = h;
        if(!h.member) return { ok: true, member: false, maintainer: !!h.maintainer, email: h.email };
        await openGroup(h);
        return { ok: true, member: true };
      }catch(e){ return errorResult(e); }
    },
    async signUp(email, password){
      if(!client) return { ok: false, error: "No shared database is set up for this app." };
      try{ const r = await client.signUp(String(email || "").trim(), String(password || "")); return { ok: true, confirm: !r.signedIn }; }
      catch(e){ return errorResult(e); }
    },
    async signOut(){
      stopPolling();
      try{ await client.signOut(); }catch(e){}
      me = null; groupDir = null; st = null; dirty.clear(); requests = []; members = [];
      rm(path.join(cloudDir, "last.json"));
      return { ok: true };
    },
    async hello(){ try{ const h = await client.rpc("lds_hello"); online = true; return Object.assign({ ok: true }, h); }catch(e){ return errorResult(e); } },

    // ---- writes from the app ---------------------------------------------------------------------------------------------------------
    noteWrite,
    markInput(sender){ ws(sender).input = Date.now(); },
    autoBegin(sender, label){ const w = ws(sender); w.auto++; w.label = String(label || w.label || "automatic update").slice(0, 80); },
    autoEnd(sender){ const w = ws(sender); w.auto = Math.max(0, w.auto - 1); },
    commit, discard,
    async flushAuto(){ return flushAuto(); },
    async pullNow(){ await tick(); return status(); },
    pending: pendingList,

    // ---- the shared settings (targets, custom categories, "not a duplicate") ------------------------------------------------------------
    settings(){ return readJSON(path.join(dataDir(), "settings.json"), {}) || {}; },
    setSetting(sender, key, raw){
      if(SHARED_KEYS.indexOf(key) < 0) return { ok: false };
      const cw = canWrite(); if(!cw.ok) return { ok: false, error: cw.message, why: cw.why };
      const s = readJSON(path.join(dataDir(), "settings.json"), {}) || {};
      let v = null; try{ v = raw == null ? null : JSON.parse(raw); }catch(e){ v = raw; }
      if(v === null) delete s[key]; else s[key] = v;
      writeJSON(path.join(dataDir(), "settings.json"), s);
      noteWrite(sender, { settings: true });
      return { ok: true };
    },

    // ---- chats --------------------------------------------------------------------------------------------------------------------------
    chatOwner(id){ const c = st && st.chats[id]; return c ? { id: c.owner_id, name: c.owner_name } : null; },
    chatMine(id){ const c = st && st.chats[id]; return !c || !me || c.owner_id === me.user_id; },
    async chatSaved(conv){
      if(!groupDir || !conv) return;
      const content = Object.assign({}, conv); delete content.ownerId; delete content.ownerName;
      st.chats[conv.id] = { owner_id: me.user_id, owner_name: me.name, scope: conv.scope };
      try{
        await client.rpc("lds_chat_save", { id: conv.id, scope: conv.scope, title: conv.title || "", content });
        const row = { id: conv.id, scope: conv.scope, owner_id: me.user_id, owner_name: me.name, content, deleted: false, seq: -1 };
        writeJSON(mirrorChatFile(conv.id), row); writePictureChat(row); saveState();
      }catch(e){ log("cloud: chat not sent: " + e.message); lastError = e.message; tell(); }
    },
    async chatDeleted(id){ if(!groupDir) return; try{ await client.rpc("lds_chat_delete", { id }); rm(mirrorChatFile(id)); delete st.chats[id]; saveState(); }catch(e){ log("cloud: chat delete: " + e.message); } },
    async chatMoved(fromScope, toScope){ if(!groupDir) return; try{ await client.rpc("lds_chat_move", { from_scope: fromScope, to_scope: toScope }); }catch(e){ log("cloud: chat move: " + e.message); } },

    // ---- the admin and the requests ------------------------------------------------------------------------------------------------------
    requests: requestsFor,
    members(){ return members; },
    async rpc(fn, args){ try{ return { ok: true, data: await client.rpc(fn, args) }; }catch(e){ return errorResult(e); } },
    unlockOffline(code){
      if(role() !== "admin" || !me.offline_hash) return { ok: false, error: "Only the admin, with an offline code set, can change data offline." };
      if(!checkOfflineCode(String(code || ""), me.offline_hash)) return { ok: false, error: "Wrong offline code." };
      offlineUnlocked = true; tell(); return { ok: true };
    },
    async approve(id){
      const q = requests.find(r => r.id === id); if(!q) return { ok: false, error: "That request is gone." };
      try{
        await pull();
        const items = q.items.map(it => ({ path: it.path, base_version: st.versions[it.path] || 0, content: M.merge3(it.base === undefined ? null : it.base, it.content, mirror(it.path)) }));
        // the admin's own pending change to the same records rides along
        const res = await client.rpc("lds_save", { items, reason: "approve", kind: "approved", request_id: id, app_version: appVersion });
        if(!res.ok) return { ok: false, error: res.conflicts ? "The records changed meanwhile; try again." : "Not approved." };
        items.forEach(it => { setMirror(it.path, it.content); if(!dirty.has(it.path)) writePictureRecord(it.path, it.content); });
        (res.results || []).forEach(r => st.versions[r.path] = r.version); saveState();
        await pull().catch(() => {});
        broadcast("lds:cloud-changed", { reload: true, why: "approved" });
        return { ok: true };
      }catch(e){ return errorResult(e); }
    },
    async setCodes(approvalCode, offlineCode){
      if(role() !== "admin") return { ok: false, error: "Only the admin sets the codes." };
      const a = approvalCode ? String(approvalCode) : null, o = offlineCode ? String(offlineCode) : null;
      if((a && a.length < 6) || (o && o.length < 6)) return { ok: false, error: "A code needs at least 6 characters." };
      try{
        const r = await client.rpc("lds_admin_codes", { approval_code: a, offline_hash: o ? offlineHash(o) : null });
        if(r && r.offline_hash){ me = Object.assign({}, me, { offline_hash: r.offline_hash }); st.me = me; saveState(); writeJSON(path.join(cloudDir, "last.json"), { group_id: me.group_id, me }); }
        tell(); return { ok: true };
      }catch(e){ return errorResult(e); }
    },
    async reject(id, note){ try{ await client.rpc("lds_reject", { request_id: id, note: note || null }); await pull().catch(() => {}); return { ok: true }; }catch(e){ return errorResult(e); } },

    // ---- the first upload: this computer's own data becomes the group's starting copy (the local files are only read) ------------------
    async uploadStart(local, reason){
      if(role() !== "admin") return { ok: false, error: "Only the group's admin uploads the starting data." };
      if(!online) return { ok: false, error: "You're offline." };
      try{
        await pull();
        const items = [];
        const loansF = path.join(local.root, "loans.json");
        if(fs.existsSync(loansF)) items.push({ path: "loans.json", content: readJSON(loansF, []) });
        if(local.settings && Object.keys(local.settings).length) items.push({ path: "settings.json", content: local.settings });
        const docs = path.join(local.root, "documents"); let files = 0;
        for(const h of (fs.existsSync(docs) ? fs.readdirSync(docs) : [])){
          const idx = readJSON(path.join(docs, h, "index.json"), null); if(!idx || !Array.isArray(idx.files)) continue;
          const own = {}, list = [];
          idx.files.forEach(f => { if(ROLE_FILE[f.role] && APP_RECORDS[f.name]){ const cur = own[f.role]; if(!cur || (f.savedAt || 0) > (cur.savedAt || 0)) own[f.role] = f; } else list.push(f); });
          for(const f of list){
            for(const n of [f.stored, f.id + ".txt"]){ const src = path.join(docs, h, n); if(fs.existsSync(src)){ await client.upload(objectPath(h, n), fs.readFileSync(src), { type: n === f.stored ? (f.type || "application/octet-stream") : "text/plain" }); files++;
              try{ fs.mkdirSync(path.dirname(cacheFile(h, n)), { recursive: true }); fs.copyFileSync(src, cacheFile(h, n)); }catch(e){} } }
          }
          items.push({ path: "props/" + h + "/index.json", content: { propKey: idx.propKey || "", propName: idx.propName || "", files: list } });
          Object.keys(own).forEach(r => { const c = readJSON(path.join(docs, h, own[r].stored), null); if(c !== null) items.push({ path: "props/" + h + "/" + ROLE_FILE[r], content: c }); });
        }
        items.forEach(it => it.base_version = st.versions[it.path] || 0);
        // in batches, so a big book doesn't make one huge request
        for(let i = 0; i < items.length; i += 40){
          const part = items.slice(i, i + 40);
          const res = await client.rpc("lds_save", { items: part, reason, kind: "start", app_version: appVersion });
          if(!res.ok) return { ok: false, error: res.conflicts ? "The group's data changed meanwhile; try again." : "The upload was refused." };
          applySaved(part, res);
        }
        // the chats, each as the admin's
        let chats = 0;
        const cdir = path.join(local.root, "chats");
        for(const h of (fs.existsSync(cdir) ? fs.readdirSync(cdir) : [])){
          let names = []; try{ names = fs.readdirSync(path.join(cdir, h)).filter(n => n !== "index.json" && n.endsWith(".json")); }catch(e){}
          for(const n of names){ const conv = readJSON(path.join(cdir, h, n), null); if(!conv || !conv.id) continue;
            await client.rpc("lds_chat_save", { id: conv.id, scope: conv.scope || "portfolio", title: conv.title || "", content: conv }); chats++; }
        }
        rebuildPicture();
        await pull();
        rebuildPicture();
        broadcast("lds:cloud-changed", { reload: true, why: "start" });
        return { ok: true, records: items.length, files, chats };
      }catch(e){ return errorResult(e); }
    },
    groupIsEmpty(){ return !!groupDir && !fs.existsSync(path.join(serverDir(), "records", "loans.json")) && !fs.existsSync(path.join(serverDir(), "records", "props")); },

    close(){ closed = true; stopPolling(); clearTimeout(autoTimer); },
    // tests
    _debug(){ return { dirty: [...dirty.entries()], st, groupDir }; }
  };
}

module.exports = { create, SHARED_KEYS, APP_RECORDS, ROLE_FILE, offlineHash, checkOfflineCode };
