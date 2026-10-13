/* ============================================================================
   3.0.0 — the app's client for the shared database (Supabase).

   Supabase's own library needs Node 22; the app's Electron runs Node 20, so the
   app talks to the same web API directly (fetch):
     auth     POST /auth/v1/signup · /auth/v1/token?grant_type=password|refresh_token · /auth/v1/logout
     rpc      POST /rest/v1/rpc/<function>  (every read and write goes through the lds_* functions)
     storage  POST|GET|DELETE /storage/v1/object/<bucket>/<path>

   The session (access + refresh token) is kept by the caller (cloud-sync.js
   saves it to disk) so the app opens signed in, and offline.

   Errors are thrown as CloudError with a code:
     offline        the server can't be reached
     auth           not signed in / sign-in refused (message says why)
     <sql code>     a rule on the server said no: view_only, reason_required,
                    not_member, admin_only, not_your_chat, ... (hint = the words to show)
   ========================================================================== */
"use strict";

class CloudError extends Error {
  constructor(code, message, extra){ super(message || code); this.code = code; Object.assign(this, extra || {}); }
}

const BUCKET = "lds-files";

function createClient(cfg){
  const base = String(cfg.url || "").replace(/\/+$/, "");
  const key = String(cfg.anonKey || "");
  const fetchFn = cfg.fetch || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = cfg.timeoutMs || 20000;
  let session = cfg.session || null;          // { access_token, refresh_token, expires_at, user:{id,email} }
  let onSession = cfg.onSession || null;      // called whenever the session changes (to save it)
  let refreshing = null;

  function setSession(s){ session = s || null; try{ onSession && onSession(session); }catch(e){} }

  async function call(method, path, opts){
    opts = opts || {};
    const headers = Object.assign({ apikey: key }, opts.headers || {});
    if(opts.auth !== false){ const t = session && session.access_token; headers.Authorization = "Bearer " + (t || key); }
    let body = opts.body;
    if(opts.json !== undefined){ headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), opts.timeoutMs || timeoutMs);
    let res;
    try{ res = await fetchFn(base + path, { method, headers, body, signal: ac.signal }); }
    catch(e){ throw new CloudError("offline", "The shared database can't be reached.", { cause: String(e && (e.cause && e.cause.code || e.message) || e) }); }
    finally{ clearTimeout(timer); }
    if(opts.raw && res.ok){ const ab = await res.arrayBuffer(); return { status: res.status, buf: Buffer.from(ab) }; }
    const text = await res.text();
    let data = null; try{ data = text ? JSON.parse(text) : null; }catch(e){ data = text; }
    return { status: res.status, ok: res.ok, data };
  }

  function authMessage(d){ return (d && (d.msg || d.error_description || d.message || d.error)) || "Sign-in failed."; }

  async function refresh(){
    if(!session || !session.refresh_token) throw new CloudError("auth", "Please sign in.");
    if(refreshing) return refreshing;
    refreshing = (async () => {
      const r = await call("POST", "/auth/v1/token?grant_type=refresh_token", { auth: false, json: { refresh_token: session.refresh_token } });
      if(!r.ok){ setSession(null); throw new CloudError("auth", "Your sign-in has expired. Please sign in again."); }
      setSession(r.data); return r.data;
    })();
    try{ return await refreshing; } finally{ refreshing = null; }
  }

  // a fresh token before calling (refresh a minute before it runs out)
  async function ensureFresh(){
    if(!session) throw new CloudError("auth", "Please sign in.");
    const exp = Number(session.expires_at || 0);
    if(exp && exp - 60 < Math.floor(Date.now() / 1000)) await refresh();
  }

  async function authed(method, path, opts){
    await ensureFresh();
    let r = await call(method, path, opts);
    if(r.status === 401 || (r.data && /jwt expired|exp" claim/i.test(String(r.data.message || "")))){ await refresh(); r = await call(method, path, opts); }
    return r;
  }

  return {
    CloudError,
    get session(){ return session; },
    setSession,
    set onSession(fn){ onSession = fn; },
    get user(){ return session && session.user || null; },

    async signUp(email, password){
      const r = await call("POST", "/auth/v1/signup", { auth: false, json: { email, password } });
      if(!r.ok) throw new CloudError("auth", authMessage(r.data), { status: r.status, detail: r.data });
      if(r.data && r.data.access_token){ setSession(r.data); return { signedIn: true }; }
      return { signedIn: false, confirm: true };
    },
    async signIn(email, password){
      const r = await call("POST", "/auth/v1/token?grant_type=password", { auth: false, json: { email, password } });
      if(!r.ok){
        const d = r.data || {}, code = d.error_code || d.code || "";
        const msg = code === "email_not_confirmed" ? "Confirm your email first — open the link in the email you were sent."
                  : code === "invalid_credentials" || /invalid login/i.test(authMessage(d)) ? "Wrong email or password."
                  : authMessage(d);
        throw new CloudError("auth", msg, { status: r.status, detail: d });
      }
      setSession(r.data); return r.data;
    },
    async signOut(){
      try{ if(session) await call("POST", "/auth/v1/logout", {}); }catch(e){}
      setSession(null);
    },
    refresh,
    // a forgotten password: an email with a 6-digit code (Supabase's "Reset password" email shows {{ .Token }}); the
    // code signs the person in once, and they set a new password
    async recover(email){
      const r = await call("POST", "/auth/v1/recover", { auth: false, json: { email } });
      if(!r.ok) throw new CloudError("auth", authMessage(r.data), { status: r.status, detail: r.data });
      return true;
    },
    async verifyRecovery(email, code){
      const r = await call("POST", "/auth/v1/verify", { auth: false, json: { type: "recovery", email, token: String(code || "").trim() } });
      if(!r.ok) throw new CloudError("auth", "That code isn't right, or it has expired — ask for a new one.", { status: r.status, detail: r.data });
      setSession(r.data); return r.data;
    },
    async setPassword(password){
      const r = await authed("PUT", "/auth/v1/user", { json: { password } });
      if(!r.ok) throw new CloudError("auth", authMessage(r.data), { status: r.status, detail: r.data });
      return true;
    },

    async rpc(fn, args){
      const r = await authed("POST", "/rest/v1/rpc/" + fn, { json: args || {} });
      if(r.ok) return r.data;
      const d = r.data || {};
      if(r.status === 401) throw new CloudError("auth", "Please sign in.", { status: 401 });
      // a rule on the server: the exception's name is the code, its hint the words to show
      const code = (d.code === "P0001" && d.message) ? String(d.message) : (d.code || "error");
      throw new CloudError(code, d.hint || d.message || ("The shared database said no (" + r.status + ")."), { status: r.status, detail: d });
    },

    // files live at "<group id>/<path>"
    async upload(objectPath, buf, opts){
      const r = await authed("POST", "/storage/v1/object/" + BUCKET + "/" + encPath(objectPath),
                             { body: buf, headers: { "Content-Type": (opts && opts.type) || "application/octet-stream", "x-upsert": opts && opts.upsert ? "true" : "false" }, timeoutMs: 10 * 60 * 1000 });
      if(r.ok) return true;
      const d = r.data || {};
      if(String(d.statusCode) === "409" || /already exists|duplicate/i.test(String(d.message || d.error || ""))) return true;   // the same file is already there
      throw new CloudError("storage", "The file couldn't be stored: " + (d.message || d.error || r.status), { status: r.status, detail: d });
    },
    async download(objectPath){
      await ensureFresh();
      let r = await call("GET", "/storage/v1/object/authenticated/" + BUCKET + "/" + encPath(objectPath), { raw: true, timeoutMs: 10 * 60 * 1000 });
      if(r.buf) return r.buf;
      if(r.status === 401 || r.status === 400 && /exp/i.test(JSON.stringify(r.data || ""))){ await refresh(); r = await call("GET", "/storage/v1/object/authenticated/" + BUCKET + "/" + encPath(objectPath), { raw: true, timeoutMs: 10 * 60 * 1000 }); if(r.buf) return r.buf; }
      throw new CloudError("storage", "The file couldn't be fetched.", { status: r.status, detail: r.data });
    },
    async remove(objectPaths){
      const r = await authed("DELETE", "/storage/v1/object/" + BUCKET, { json: { prefixes: objectPaths } });
      if(!r.ok) throw new CloudError("storage", "The file couldn't be removed.", { status: r.status, detail: r.data });
      return r.data;
    }
  };
}

function encPath(p){ return String(p).split("/").map(encodeURIComponent).join("/"); }

module.exports = { createClient, CloudError, BUCKET };
