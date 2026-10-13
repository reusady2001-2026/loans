// 3.0.0 — a stand-in for the parts of Supabase's web API the app uses, over the real local PostgreSQL (_pg.js):
//   /auth/v1      sign up, sign in (password), refresh, sign out, who am I
//   /rest/v1/rpc  call an lds_* function as the signed-in person (the same claims + role PostgREST sets)
//   /storage/v1   upload / download / delete files, guarded by the storage rules in supabase/setup.sql
// Tests only. The rules themselves are the real SQL; this only carries requests to them the way Supabase does.
"use strict";
const http = require("http"), crypto = require("crypto"), fs = require("fs"), os = require("os"), path = require("path");

const b64u = b => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function sign(claims, secret){
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify(claims));
  return h + "." + p + "." + b64u(crypto.createHmac("sha256", secret).update(h + "." + p).digest());
}
function verify(tok, secret){
  const parts = String(tok || "").split("."); if(parts.length !== 3) return null;
  const want = b64u(crypto.createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest());
  if(want !== parts[2]) return null;
  try{ const c = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); return c; }catch(e){ return null; }
}

async function startStandin(db, opts){
  opts = opts || {};
  const secret = crypto.randomBytes(32).toString("hex");
  const anonKey = sign({ role: "anon", iss: "standin" }, secret);
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "lds-store-"));
  const refresh = new Map();     // refresh token -> user id
  const recovery = new Map();    // email -> the 6-digit code "emailed" for a forgotten password
  const ttl = opts.tokenSeconds || 3600;
  const stats = { rpc: {}, requests: 0 };
  let down = false;              // tests flip this to make the server unreachable (offline)

  const pool = [];
  async function client(){ const c = pool.pop(); if(c) return c; const n = new db.Client(db.conn); await n.connect(); return n; }
  function release(c){ pool.push(c); }

  function session(u){
    const now = Math.floor(Date.now() / 1000);
    const access = sign({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + ttl, session_id: crypto.randomUUID() }, secret);
    const rt = crypto.randomBytes(24).toString("hex"); refresh.set(rt, u.id);
    return { access_token: access, token_type: "bearer", expires_in: ttl, expires_at: now + ttl, refresh_token: rt,
             user: { id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at } };
  }
  const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

  function send(res, status, body, headers){
    if(Buffer.isBuffer(body)){ res.writeHead(status, Object.assign({ "content-type": "application/octet-stream" }, headers || {})); return res.end(body); }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }
  function readBody(req){ return new Promise((ok, no) => { const ch = []; req.on("data", d => ch.push(d)); req.on("end", () => ok(Buffer.concat(ch))); req.on("error", no); }); }

  // run fn as the person the token names, in one transaction (what PostgREST does per request)
  async function asUser(claims, fn){
    const c = await client();
    try{
      await c.query("begin");
      await c.query("set local role " + (claims && claims.role === "authenticated" ? "authenticated" : "anon"));
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims || { role: "anon" })]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    }catch(e){ try{ await c.query("rollback"); }catch(x){} throw e; }
    finally{ release(c); }
  }
  async function admin(sql, args){ const c = await client(); try{ return await c.query(sql, args); } finally{ release(c); } }

  function who(req){
    const a = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const c = verify(a, secret);
    if(!c) return { bad: true };
    if(c.exp && c.exp < Math.floor(Date.now() / 1000)) return { expired: true };
    return { claims: c };
  }

  const server = http.createServer(async (req, res) => {
    stats.requests++;
    if(down){ req.socket.destroy(); return; }
    try{
      const u = new URL(req.url, "http://x");
      if(verify(req.headers.apikey, secret) === null) return send(res, 401, { message: "No API key found in request" });
      const body = await readBody(req);

      // ---- auth
      if(u.pathname === "/auth/v1/signup" && req.method === "POST"){
        const b = JSON.parse(body.toString() || "{}"); const email = String(b.email || "").toLowerCase().trim();
        if(!email || String(b.password || "").length < 6) return authErr(res, 422, "weak_password", "Password should be at least 6 characters.");
        const ex = await admin("select * from auth.users where email = $1", [email]);
        if(ex.rows[0] && ex.rows[0].email_confirmed_at) return send(res, 200, { id: ex.rows[0].id, email, identities: [] });
        const r = ex.rows[0] ? ex : await admin("insert into auth.users(email, encrypted_password, email_confirmed_at) values ($1, extensions.crypt($2, extensions.gen_salt('bf', 4)), $3) returning *",
                                                [email, String(b.password), opts.autoConfirm ? new Date() : null]);
        const user = r.rows[0];
        if(user.email_confirmed_at) return send(res, 200, session(user));
        return send(res, 200, { id: user.id, email, confirmation_sent_at: new Date().toISOString() });
      }
      if(u.pathname === "/auth/v1/token" && req.method === "POST"){
        const b = JSON.parse(body.toString() || "{}"), g = u.searchParams.get("grant_type");
        if(g === "password"){
          const r = await admin("select * from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)", [String(b.email || "").toLowerCase().trim(), String(b.password || "")]);
          if(!r.rows[0]) return authErr(res, 400, "invalid_credentials", "Invalid login credentials");
          if(!r.rows[0].email_confirmed_at) return authErr(res, 400, "email_not_confirmed", "Email not confirmed");
          return send(res, 200, session(r.rows[0]));
        }
        if(g === "refresh_token"){
          const id = refresh.get(String(b.refresh_token || "")); if(!id) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
          refresh.delete(String(b.refresh_token));
          const r = await admin("select * from auth.users where id = $1", [id]);
          return send(res, 200, session(r.rows[0]));
        }
        return authErr(res, 400, "unsupported_grant_type", "unsupported grant type");
      }
      if(u.pathname === "/auth/v1/logout" && req.method === "POST") return send(res, 204);
      // a forgotten password: the email carries a code (Supabase's template with {{ .Token }}); the code signs in once
      if(u.pathname === "/auth/v1/recover" && req.method === "POST"){
        const email = String((JSON.parse(body.toString() || "{}").email) || "").toLowerCase().trim();
        const ex = await admin("select id from auth.users where email = $1", [email]);
        if(ex.rows[0]) recovery.set(email, String(Math.floor(100000 + Math.random() * 900000)));
        return send(res, 200, {});
      }
      if(u.pathname === "/auth/v1/verify" && req.method === "POST"){
        const b = JSON.parse(body.toString() || "{}"), email = String(b.email || "").toLowerCase().trim();
        if(b.type !== "recovery" || !recovery.has(email) || recovery.get(email) !== String(b.token || "")) return authErr(res, 403, "otp_expired", "Token has expired or is invalid");
        recovery.delete(email);
        const r = await admin("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = $1 returning *", [email]);
        return send(res, 200, session(r.rows[0]));
      }
      if(u.pathname === "/auth/v1/user" && req.method === "PUT"){
        const w = who(req); if(!w.claims) return authErr(res, 401, "bad_jwt", "invalid JWT");
        const b = JSON.parse(body.toString() || "{}");
        if(String(b.password || "").length < 6) return authErr(res, 422, "weak_password", "Password should be at least 6 characters.");
        await admin("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 4)) where id = $1", [w.claims.sub, String(b.password)]);
        return send(res, 200, { id: w.claims.sub, email: w.claims.email });
      }
      if(u.pathname === "/auth/v1/user" && req.method === "GET"){
        const w = who(req); if(!w.claims) return authErr(res, 401, "bad_jwt", "invalid JWT");
        return send(res, 200, { id: w.claims.sub, email: w.claims.email });
      }

      // ---- functions
      const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)$/);
      if(rpc && req.method === "POST"){
        const w = who(req);
        if(w.expired) return send(res, 401, { code: "PGRST301", message: "JWT expired" });
        const claims = w.claims && w.claims.role === "authenticated" ? w.claims : { role: "anon" };
        const args = JSON.parse(body.toString() || "{}"), names = Object.keys(args);
        stats.rpc[rpc[1]] = (stats.rpc[rpc[1]] || 0) + 1;
        const sql = "select public." + rpc[1] + "(" + names.map((n, i) => n + " => $" + (i + 1)).join(", ") + ") as r";
        const vals = names.map(n => { const v = args[n]; return v === null || v === undefined ? null : (typeof v === "object" ? JSON.stringify(v) : v); });
        try{
          const r = await asUser(claims, c => c.query(sql, vals));
          return send(res, 200, r.rows[0].r);
        }catch(e){
          const status = e.code === "42501" ? (claims.role === "anon" ? 401 : 403) : e.code === "42883" ? 404 : 400;
          return send(res, status, { code: e.code, message: e.message, hint: e.hint || null, details: e.detail || null });
        }
      }

      // ---- storage
      const so = u.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)(?:\/(.+))?$/);
      if(so){
        const w = who(req);
        if(w.expired) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "\"exp\" claim timestamp check failed" });
        const claims = w.claims && w.claims.role === "authenticated" ? w.claims : { role: "anon" };
        const bucket = decodeURIComponent(so[1]), name = so[2] ? so[2].split("/").map(decodeURIComponent).join("/") : "";
        const file = path.join(store, bucket, name);
        if(req.method === "POST" || req.method === "PUT"){
          const upsert = req.method === "PUT" || String(req.headers["x-upsert"] || "") === "true";
          try{
            await asUser(claims, async c => {
              const sql = "insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3::uuid, $3::text, $4)" +
                          (upsert ? " on conflict (bucket_id, name) do update set updated_at = now(), metadata = excluded.metadata" : "");
              await c.query(sql, [bucket, name, claims.sub || null, JSON.stringify({ size: body.length, mimetype: req.headers["content-type"] || "" })]);
            });
          }catch(e){
            if(e.code === "23505") return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
            return send(res, 400, { statusCode: "403", error: "Unauthorized", message: /row-level security/.test(e.message) ? "new row violates row-level security policy" : e.message });
          }
          fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
          return send(res, 200, { Key: bucket + "/" + name });
        }
        if(req.method === "GET"){
          const r = await asUser(claims, c => c.query("select name from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
          if(!r.rows[0] || !fs.existsSync(file)) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
          return send(res, 200, fs.readFileSync(file));
        }
        if(req.method === "DELETE"){
          const names = (JSON.parse(body.toString() || "{}").prefixes || []).map(String);
          const r = await asUser(claims, c => c.query("delete from storage.objects where bucket_id = $1 and name = any($2) returning name", [bucket, names]));
          r.rows.forEach(x => { try{ fs.unlinkSync(path.join(store, bucket, x.name)); }catch(e){} });
          return send(res, 200, r.rows.map(x => ({ name: x.name })));
        }
      }
      send(res, 404, { message: "not found: " + req.method + " " + u.pathname });
    }catch(e){ send(res, 500, { message: String(e && e.message || e) }); }
  });
  await new Promise(ok => server.listen(opts.port || 0, "127.0.0.1", ok));
  const port = server.address().port;
  return {
    url: "http://127.0.0.1:" + port, anonKey, stats,
    recoveryCode(email){ return recovery.get(String(email).toLowerCase()) || null; },
    async confirm(email){ await admin("update auth.users set email_confirmed_at = now() where email = $1", [String(email).toLowerCase()]); },
    async sql(q, a){ return admin(q, a); },
    setDown(v){ down = !!v; },
    async stop(){
      await new Promise(ok => server.close(() => ok())); server.closeAllConnections && server.closeAllConnections();
      while(pool.length){ try{ await pool.pop().end(); }catch(e){} }
      try{ fs.rmSync(store, { recursive: true, force: true }); }catch(e){}
    }
  };
}

module.exports = { startStandin };
