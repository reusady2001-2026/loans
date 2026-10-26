// @ts-nocheck
// =====================================================================================================================
// Loan Debt Service Hub 3.0.0 — "lds-join": joining a group, and the emails it takes (Supabase Edge Function).
//
// Deploy with "Verify JWT" OFF: a person asking to join has no account yet, and the admin's email buttons open a web
// page, not the app. Every request is checked here and in the database instead.
//
// Secrets (Edge Functions → Secrets):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN   the app's Gmail account (Gmail API, send only)
//   GMAIL_SENDER                                                that account's address
//   LDS_PAGES_URL (optional)   where decide.html / confirm.html are (default: the app's GitHub Pages site)
//   LDS_SERVICE_KEY (optional) only if the project's own secret key isn't given to functions
//
// POST {action:"join", group_id, name, email, password}   someone asks to join (they have no account yet)
// POST {action:"join", group_id, name}  + signed in        someone signed in, in no group, asks to join
// POST {action:"look", id, token}                         the admin's email link: who is asking
// POST {action:"decide", id, approve, token}              the admin decides from the email
// POST {action:"decide", id, approve}   + signed in        the admin decides in the app
// POST {action:"confirm", id, token}                      the person's link: their email is confirmed
// =====================================================================================================================

const APP = "Loan Debt Service Hub";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const EMAIL = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Fail extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status || 400; }
}

const str = v => (v === null || v === undefined) ? "" : String(v);
const clean = v => str(v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const esc = s => str(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- an email (MIME, UTF-8, text + HTML) --------------------------------------------------------------------------------
const enc = new TextEncoder();
function b64(s) {
  const b = enc.encode(str(s)); let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64url = s => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const lines76 = s => s.replace(/.{1,76}/g, "$&\r\n");
const word = s => "=?UTF-8?B?" + b64(clean(s)) + "?=";      // a header value can't carry a line break this way
function mime(from, to, subject, text, html) {
  const cut = "lds-" + crypto.randomUUID();
  return [
    "From: " + word(APP) + " <" + from + ">",
    "To: <" + to + ">",
    "Subject: " + word(subject),
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="' + cut + '"',
    "",
    "--" + cut, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", lines76(b64(text)),
    "--" + cut, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", lines76(b64(html)),
    "--" + cut + "--", ""
  ].join("\r\n");
}

// one look for every email: paragraphs, then buttons
function letter(paras, buttons, foot) {
  const btn = b => '<a href="' + esc(b.href) + '" style="display:inline-block;margin:0 10px 10px 0;padding:12px 22px;border-radius:10px;' +
    'text-decoration:none;font-weight:600;' + (b.quiet ? "background:#ffffff;color:#1f231f;border:1px solid #c9cdc9" : "background:#4c721b;color:#ffffff") +
    '">' + esc(b.label) + "</a>";
  const html = '<!doctype html><html><body style="margin:0;background:#f6f8f2;font:15px/1.55 Segoe UI,Arial,sans-serif;color:#1f231f">' +
    '<div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#ffffff;border:1px solid #e6e8e6;border-radius:14px;padding:24px">' +
    '<div style="font-size:13px;color:#565d56;margin-bottom:14px">' + esc(APP) + "</div>" +
    paras.map(p => '<p style="margin:0 0 14px">' + esc(p) + "</p>").join("") +
    (buttons.length ? '<div style="margin:18px 0 8px">' + buttons.map(btn).join("") + "</div>" : "") +
    (foot ? '<p style="margin:14px 0 0;font-size:13px;color:#565d56">' + esc(foot) + "</p>" : "") +
    "</div></div></body></html>";
  const text = paras.join("\n\n") + (buttons.length ? "\n\n" + buttons.map(b => b.label + ": " + b.href).join("\n") : "") + (foot ? "\n\n" + foot : "") + "\n";
  return { text, html };
}

export function makeHandler(getEnv, fetchFn) {
  const env = k => str(getEnv(k)).trim();
  const keyOf = json => { try { const o = JSON.parse(json); return str(o.default || Object.values(o)[0]); } catch (e) { return ""; } };
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = keyOf(env("SUPABASE_SECRET_KEYS")) || env("SUPABASE_SERVICE_ROLE_KEY") || env("LDS_SERVICE_KEY");
  const anonKey = keyOf(env("SUPABASE_PUBLISHABLE_KEYS")) || env("SUPABASE_ANON_KEY") || serviceKey;
  const pages = (env("LDS_PAGES_URL") || "https://reusady2001-2026.github.io/loans").replace(/\/+$/, "");
  const sender = env("GMAIL_SENDER");
  let google = null;    // { token, until }

  // ---- the database and the accounts (as the service) -------------------------------------------------------------------
  async function call(method, path, body, headers) {
    const r = await fetchFn(base + path, { method, headers: Object.assign({ "Content-Type": "application/json" }, headers),
                                           body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let data = null;
    try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
    return { ok: r.ok, status: r.status, data };
  }
  // the new keys (sb_secret_…) go on the apikey header only; the old service_role key is a JWT and goes on both
  const service = () => serviceKey.indexOf("sb_") === 0 ? { apikey: serviceKey } : { apikey: serviceKey, Authorization: "Bearer " + serviceKey };
  async function rpc(fn, args) {
    const r = await call("POST", "/rest/v1/rpc/" + fn, args, service());
    if (r.ok) return r.data;
    const d = r.data || {};
    if (d.code === "P0001" && d.message) throw new Fail(d.message, d.hint || d.message);
    console.error("lds-join: " + fn + " failed (" + r.status + "): " + (d.message || JSON.stringify(d)));
    throw new Fail("server", "Something went wrong on the server. Try again in a minute.", 500);
  }
  async function createUser(email, password, name) {
    const r = await call("POST", "/auth/v1/admin/users", { email, password, email_confirm: false, user_metadata: { full_name: name } }, service());
    const id = r.data && (r.data.id || (r.data.user && r.data.user.id));
    if (r.ok && id) return id;
    const d = r.data || {}, m = str(d.msg || d.message || d.error_description || d.error);
    if (r.status === 422 && /password/i.test(m)) throw new Fail("weak_password", m);
    console.error("lds-join: the account wasn't made (" + r.status + "): " + m);
    throw new Fail("server", "The account couldn't be made. Try again in a minute.", 500);
  }
  async function confirmUser(id) {
    const r = await call("PUT", "/auth/v1/admin/users/" + encodeURIComponent(id), { email_confirm: true }, service());
    if (!r.ok) { console.error("lds-join: the email wasn't confirmed (" + r.status + ")"); throw new Fail("server", "Your email couldn't be confirmed. Try the link again in a minute.", 500); }
  }
  async function deleteUser(id) {
    const r = await call("DELETE", "/auth/v1/admin/users/" + encodeURIComponent(id), undefined, service());
    if (!r.ok && r.status !== 404) console.error("lds-join: the account wasn't removed (" + r.status + ")");
  }
  // is this the password of the account with this email? (an account not confirmed yet answers "not confirmed" only
  // when the password is right)
  async function passwordOk(email, password) {
    if (!password) return false;
    const r = await call("POST", "/auth/v1/token?grant_type=password", { email, password }, { apikey: anonKey });
    if (r.ok) {
      const t = r.data && r.data.access_token;
      if (t) await call("POST", "/auth/v1/logout", {}, { apikey: anonKey, Authorization: "Bearer " + t }).catch(() => {});
      return true;
    }
    const d = r.data || {};
    return d.error_code === "email_not_confirmed" || /not confirmed/i.test(str(d.msg || d.message || d.error_description));
  }
  // the person signed in to the app (their token), or nobody
  async function signedIn(bearer) {
    const parts = bearer.split(".");
    if (!bearer || bearer === anonKey || bearer === serviceKey || parts.length !== 3) return null;
    let claims = null;
    try { claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return null; }
    if (!claims || claims.role !== "authenticated") return null;
    const r = await call("GET", "/auth/v1/user", undefined, { apikey: anonKey, Authorization: "Bearer " + bearer });
    if (!r.ok || !r.data || !r.data.id) throw new Fail("auth", "Your sign-in has expired. Sign in again.", 401);
    return r.data;
  }

  // ---- Gmail ---------------------------------------------------------------------------------------------------------------
  async function googleToken() {
    if (google && google.until > Date.now() + 60000) return google.token;
    const form = new URLSearchParams({ client_id: env("GMAIL_CLIENT_ID"), client_secret: env("GMAIL_CLIENT_SECRET"),
                                       refresh_token: env("GMAIL_REFRESH_TOKEN"), grant_type: "refresh_token" });
    const r = await fetchFn("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error("Google refused the app's Gmail sign-in (" + (d.error || r.status) + ")");
    google = { token: d.access_token, until: Date.now() + (Number(d.expires_in) || 3000) * 1000 };
    return google.token;
  }
  async function mail(to, subject, body) {
    try {
      if (!EMAIL.test(str(to))) throw new Error("not an email address");
      if (!sender) throw new Error("GMAIL_SENDER isn't set");
      const token = await googleToken();
      const r = await fetchFn("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: b64url(mime(sender, to, subject, body.text, body.html)) })
      });
      if (!r.ok) { if (r.status === 401) google = null; throw new Error("Gmail answered " + r.status + " " + (await r.text().catch(() => "")).slice(0, 300)); }
      return true;
    } catch (e) {
      console.error("lds-join: an email wasn't sent: " + (e && e.message || e));
      return false;
    }
  }
  const link = (page, q) => pages + "/" + page + "?" + new URLSearchParams(q).toString();

  // ---- the emails ------------------------------------------------------------------------------------------------------------
  const toAdmin = (r, name, email) => [
    name + " asks to join " + r.group_name,
    letter([name + " (" + email + ") asked to join " + r.group_name + " in " + APP + ".",
            "Approve it to let them in as an editor, or turn it down. You can also do it in the app: it shows the request when you open it."],
           [{ label: "Approve", href: link("decide.html", { r: r.id, t: r.decide_token, a: "approve" }) },
            { label: "Turn down", href: link("decide.html", { r: r.id, t: r.decide_token, a: "turn_down" }), quiet: true }],
           "If you don't know this person, turn the request down.")];
  const toConfirm = (id, token, name, group, admin) => [
    "Confirm your email to join " + group,
    letter(["Hi " + name + ",",
            admin ? admin + " approved your request to join " + group + " in " + APP + "."
                  : "You're on " + group + "'s list in " + APP + ".",
            "Confirm your email address to finish. Then open the app and sign in with this email and the password you chose."],
           [{ label: "Confirm my email", href: link("confirm.html", { r: id, t: token }) }],
           "If you didn't ask to join " + group + ", ignore this email.")];
  const toJoined = (name, group, admin) => [
    "You've joined " + group,
    letter(["Hi " + name + ",", admin + " approved your request to join " + group + " in " + APP + ".",
            "Open the app and sign in with this email and your password."], [])];
  const toTurnedDown = (name, group) => [
    "Your request to join " + group,
    letter(["Hi " + name + ",", "The admin of " + group + " turned down your request to join it in " + APP + ".",
            "If you think this is a mistake, contact your group's admin."], [])];

  // ---- the actions -----------------------------------------------------------------------------------------------------------
  async function join(b, bearer) {
    const gid = str(b.group_id), name = clean(b.name);
    if (!UUID.test(gid)) throw new Fail("no_group", "Pick your organization from the list.");
    const user = await signedIn(bearer);
    const email = (user ? str(user.email) : str(b.email)).trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new Fail("bad_email", "Type a valid email address.");
    if (name.length < 2 || name.length > 80) throw new Fail("bad_name", "Type your full name.");
    const st = await rpc("lds_svc_join_check", { gid, mail: email });
    let uid = user ? user.id : st.user_id, made = false, madeNow = false;
    let confirmed = user ? !!user.email_confirmed_at : !!st.confirmed;
    if (!user) {
      const pw = str(b.password);
      if (st.user_id) {
        // this email has an account: asking to join never changes its password, so nobody takes over an account
        if (!(await passwordOk(email, pw))) {
          throw new Fail("wrong_password", "This email already has an account with another password. Type that password, or use “Forgot your password?” on the sign-in screen.");
        }
        made = !confirmed;
      } else {
        if (pw.length < 8) throw new Fail("weak_password", "The password needs at least 8 characters.");
        uid = await createUser(email, pw, name); made = true; madeNow = true; confirmed = false;
      }
    }
    let r;
    try { r = await rpc("lds_svc_join_open", { gid, mail: email, full_name: name, uid, made }); }
    catch (e) { if (madeNow) await deleteUser(uid); throw e; }
    if (r.status === "waiting") {
      const [subject, body] = toAdmin(r, name, email);
      const mailed = await mail(r.admin_email, subject, body);
      return { ok: true, status: "waiting", group_name: r.group_name, admin_name: r.admin_name, mailed };
    }
    // already on the group's list (named its admin, or approved before): no approval needed again
    if (confirmed) return { ok: true, status: "ready", group_name: r.group_name };
    const [subject, body] = toConfirm(r.id, r.confirm_token, name, r.group_name, null);
    return { ok: true, status: "confirm", group_name: r.group_name, mailed: await mail(email, subject, body) };
  }

  async function look(b) {
    if (!UUID.test(str(b.id))) throw new Fail("bad_link", "This link isn't right, or the request is gone.");
    return Object.assign({ ok: true }, await rpc("lds_svc_join_look", { rid: str(b.id), token: str(b.token) }));
  }

  async function decide(b, bearer) {
    if (!UUID.test(str(b.id))) throw new Fail("bad_link", "This request is gone.");
    const args = { rid: str(b.id), approve: b.approve === true || b.approve === "true" };
    if (b.token) args.token = str(b.token);
    else {
      const u = await signedIn(bearer);
      if (!u) throw new Fail("auth", "Sign in to the app as the group's admin.", 401);
      args.by_user = u.id;
    }
    const r = await rpc("lds_svc_join_decide", args);
    if (!r.ok) return r;    // decided already (in the app, or from the email)
    if (r.status === "approved") {
      const [subject, body] = r.confirmed ? toJoined(r.name, r.group_name, r.admin_name)
                                          : toConfirm(r.id, r.confirm_token, r.name, r.group_name, r.admin_name);
      return { ok: true, status: "approved", name: r.name, email: r.email, group_name: r.group_name, mailed: await mail(r.email, subject, body) };
    }
    if (r.remove_user && r.user_id) await deleteUser(r.user_id);
    const [subject, body] = toTurnedDown(r.name, r.group_name);
    return { ok: true, status: "turned_down", name: r.name, email: r.email, group_name: r.group_name, mailed: await mail(r.email, subject, body) };
  }

  async function confirm(b) {
    if (!UUID.test(str(b.id))) throw new Fail("bad_link", "This link isn't right. Ask your group's admin.");
    const r = await rpc("lds_svc_join_confirm", { rid: str(b.id), token: str(b.token) });
    if (r.user_id) await confirmUser(r.user_id);
    return { ok: true, group_name: r.group_name, email: r.email, already: !!r.already };
  }

  const out = (status, body) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });

  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return out(405, { ok: false, error: "post_only", message: "Use POST." });
    if (!base || !serviceKey) return out(500, { ok: false, error: "not_set_up", message: "The joining function isn't set up yet." });
    let b = null;
    try { b = await req.json(); } catch (e) {}
    if (!b || typeof b !== "object") return out(400, { ok: false, error: "bad_request", message: "Bad request." });
    const bearer = str(req.headers.get("authorization")).replace(/^Bearer\s+/i, "").trim();
    try {
      if (b.action === "join") return out(200, await join(b, bearer));
      if (b.action === "look") return out(200, await look(b));
      if (b.action === "decide") return out(200, await decide(b, bearer));
      if (b.action === "confirm") return out(200, await confirm(b));
      return out(400, { ok: false, error: "bad_request", message: "Bad request." });
    } catch (e) {
      if (e instanceof Fail) return out(e.status, { ok: false, error: e.code, message: e.message });
      console.error("lds-join: " + (e && e.stack || e));
      return out(500, { ok: false, error: "server", message: "Something went wrong. Try again in a minute." });
    }
  };
}

// on Supabase (Deno); the tests load makeHandler themselves
const D = globalThis.Deno;
if (D && typeof D.serve === "function") D.serve(makeHandler(k => D.env.get(k), fetch));
