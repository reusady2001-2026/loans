/* 3.0.0 — joining a group: a person picks their organization, types their name, email and password and asks; the
   group's admin approves or turns it down (in the app, or from the email); approved, the person confirms their email
   and signs in as an editor; turned down, they get an email saying so. On a real PostgreSQL with the real SQL and the
   real "lds-join" function (supabase/functions/lds-join), through the stand-in for Supabase's web API; the Gmail API
   is answered by the stand-in, which keeps every email.
   run:  node test/cloud-join.test.js        (skipped when PostgreSQL isn't installed, e.g. the Windows build) */
"use strict";
const path = require("path");
const PG = require("./cloud/_pg.js");
const { startStandin } = require("./cloud/standin-server.js");
const { createClient } = require(path.join(__dirname, "..", "cloud-client.js"));

let fails = 0, count = 0;
function ok(cond, msg){ count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if(!cond) fails++; }
async function section(name, fn){ console.log("\n" + name); try{ await fn(); }catch(e){ ok(false, "threw: " + (e && e.stack || e)); } }
async function fails_with(p, code){ try{ await p; return "no error"; }catch(e){ return e.code === code ? true : (e.code + ": " + e.message); } }

(async () => {
  if(!PG.findBin()){ console.log("skipped: PostgreSQL isn't installed here — 0 checks"); return; }
  const db = await PG.start();
  const si = await startStandin(db);
  const sql = (q, a) => si.sql(q, a);
  const client = () => createClient({ url: si.url, anonKey: si.anonKey });
  async function signedIn(email, pw){ const c = client(); await c.signIn(email, pw); return c; }
  const lastMail = to => si.mail.filter(m => m.to === to).slice(-1)[0] || null;
  const linkIn = (m, page) => { const l = m && m.links.find(x => x.indexOf("/" + page + "?") > 0); return l ? new URL(l) : null; };
  const params = u => ({ id: u.searchParams.get("r"), token: u.searchParams.get("t") });
  try{
    let M, A, g1, g2, joinId;

    await section("the maintainer makes the groups; finding a group by name", async () => {
      await sql("insert into app.maintainers(email) values ('maint@co.com')");
      const r = await (client()).signUp("maint@co.com", "maint-pw-123"); if(!r.signedIn){ await si.confirm("maint@co.com"); }
      M = await signedIn("maint@co.com", "maint-pw-123");
      g1 = (await M.rpc("lds_group_create", { name: "Terra Holdings", admin_email: "ann@terra.com", admin_name: "Ann Admin" })).id;
      g2 = (await M.rpc("lds_group_create", { name: "Blue Rock Capital", admin_email: "bob@blue.com", admin_name: "Bob" })).id;
      for(const n of ["Terrace One", "Terrace Two", "Terrace Three", "Terrace Four", "Terrace Five"]) await sql("select app.make_group($1, $2, 'x')", [n, n.replace(/ /g, "").toLowerCase() + "@t.com"]);
      ok(await fails_with(M.rpc("lds_group_create", { name: "terra holdings", admin_email: "z@z.com" }), "group_exists") === true, "two groups can't have the same name");
      const anon = client();
      ok((await anon.rpcAnon("lds_group_search", { q: "te" })).length === 0, "two letters: no suggestions yet");
      const s1 = await anon.rpcAnon("lds_group_search", { q: "TER" });
      ok(s1.length === 5 && s1.every(g => /^terra/i.test(g.name)), "after 3 letters: at most 5 names that start with them (any case)");
      const s2 = await anon.rpcAnon("lds_group_search", { q: "Terra H" });
      ok(s2.length === 1 && s2[0].id === g1 && s2[0].name === "Terra Holdings" && Object.keys(s2[0]).sort().join() === "id,name", "the group's name and id only");
      ok((await anon.rpcAnon("lds_group_search", { q: "%%%" })).length === 0 && (await anon.rpcAnon("lds_group_search", { q: "___" })).length === 0, "typed % or _ are letters, not wildcards");
      ok((await anon.rpcAnon("lds_group_search", { q: "Holdings" })).length === 0, "only the start of the name matches");
    });

    await section("only the joining function reaches the joining steps", async () => {
      const anon = client();
      ok(await fails_with(anon.rpcAnon("lds_svc_join_check", { gid: g1, mail: "x@y.com" }), "42501") === true, "not before signing in");
      ok(await fails_with(M.rpc("lds_svc_join_decide", { rid: g1, approve: true }), "42501") === true, "not signed in either (even the maintainer)");
      ok(await fails_with(anon.rpcAnon("lds_hello", {}), "42501") === true, "and nothing else is open before signing in");
    });

    await section("the group's first admin: on the list already, so only their email is confirmed", async () => {
      const r = await si.join({ action: "join", group_id: g1, name: "Ann Admin", email: "Ann@Terra.com", password: "ann-pw-1234" });
      ok(r.ok && r.status === "confirm" && r.group_name === "Terra Holdings" && r.mailed === true, "asked: no approval needed, an email to confirm");
      ok(await fails_with(signedIn("ann@terra.com", "ann-pw-1234"), "auth") === true, "can't sign in before confirming");
      const m = lastMail("ann@terra.com");
      ok(m && /^Confirm your email to join Terra Holdings$/.test(m.subject) && /You're on Terra Holdings's list/.test(m.text), "the email: confirm to join");
      const u = linkIn(m, "confirm.html");
      ok(u && u.origin + u.pathname === "https://pages.test/loans/confirm.html", "its link opens the confirmation page");
      const c = await si.join(Object.assign({ action: "confirm" }, params(u)));
      ok(c.ok && c.email === "ann@terra.com" && c.already === false && c.group_name === "Terra Holdings", "the page confirms the email");
      const c2 = await si.join(Object.assign({ action: "confirm" }, params(u)));
      ok(c2.ok && c2.already === true, "opening the link again still says confirmed (not an error)");
      A = await signedIn("ann@terra.com", "ann-pw-1234");
      const h = await A.rpc("lds_hello");
      ok(h.member && h.role === "admin" && h.group_id === g1, "Ann signs in: the group's admin");
      ok(si.mail.every(x => x.to !== "ann@terra.com" || !/asks to join/.test(x.subject)), "no approval email for the admin's own account");
    });

    await section("someone asks to join", async () => {
      const before = si.mail.length;
      const r = await si.join({ action: "join", group_id: g1, name: "  Dana   Cohen ", email: "dana@terra.com", password: "dana-pw-123" });
      ok(r.ok && r.status === "waiting" && r.admin_name === "Ann Admin" && r.mailed === true, "the request waits for the admin");
      ok(await fails_with(signedIn("dana@terra.com", "dana-pw-123"), "auth") === true, "Dana can't sign in yet");
      ok(si.mail.length === before + 1, "one email");
      const m = lastMail("ann@terra.com");
      ok(m && m.subject === "Dana Cohen asks to join Terra Holdings" && m.text.indexOf("Dana Cohen (dana@terra.com) asked to join Terra Holdings") === 0, "it goes to the admin: who asks, for which group");
      const ap = linkIn(m, "decide.html"), td = m.links.map(x => new URL(x)).find(x => x.searchParams.get("a") === "turn_down");
      ok(ap && ap.searchParams.get("a") === "approve" && td && td.searchParams.get("r") === ap.searchParams.get("r"), "with an Approve and a Turn down button");
      joinId = ap.searchParams.get("r");
      const look = await si.join(Object.assign({ action: "look" }, params(ap)));
      ok(look.ok && look.name === "Dana Cohen" && look.email === "dana@terra.com" && look.group_name === "Terra Holdings" && look.status === "waiting", "the button's page shows who asks (nothing decided by opening it)");
      ok((await sql("select status from app.join_requests where id = $1", [joinId])).rows[0].status === "waiting", "still waiting after the page was opened");
      const bad = await si.join({ action: "look", id: joinId, token: "0".repeat(48) });
      ok(!bad.ok && bad.error === "bad_link", "a made-up token shows nothing");
      const again = await si.join({ action: "join", group_id: g1, name: "Dana Cohen", email: "dana@terra.com", password: "dana-pw-123" });
      ok(!again.ok && again.error === "already_waiting", "asking twice: told it's already waiting (no second email to the admin)");
      const p = await A.rpc("lds_pull", { since: 0 });
      const w = p.joins.filter(j => j.status === "waiting");
      ok(w.length === 1 && w[0].id === joinId && w[0].name === "Dana Cohen" && w[0].email === "dana@terra.com", "the admin's app gets the request (for the pop-up)");
      ok(!("token" in w[0]) && !("decide_hash" in w[0]) && !("confirm_hash" in w[0]), "without the link's secret");
    });

    await section("the admin approves in the app", async () => {
      ok((await si.join({ action: "decide", id: joinId, approve: true })).error === "auth", "not signed in: refused");
      await si.addMember("ed@terra.com", g1, "Eddie", "editor");
      const e = await (client()).signUp("ed@terra.com", "eddie-pw-12"); if(!e.signedIn) await si.confirm("ed@terra.com");
      const E = await signedIn("ed@terra.com", "eddie-pw-12");
      await E.rpc("lds_hello");
      const byEd = await E.fn("lds-join", { action: "decide", id: joinId, approve: true });
      ok(!byEd.ok && byEd.error === "admin_only", "an editor can't approve");
      ok((await E.rpc("lds_pull", { since: 0 })).joins.length === 0, "an editor doesn't see the requests");
      const r = await A.fn("lds-join", { action: "decide", id: joinId, approve: true });
      ok(r.ok && r.status === "approved" && r.mailed === true, "the admin approves");
      const mem = (await sql("select role, name, user_id from app.members where email = 'dana@terra.com'")).rows[0];
      ok(mem && mem.role === "editor" && mem.name === "Dana Cohen" && mem.user_id === null, "Dana is on the list as an editor (linked once she signs in)");
      const m = lastMail("dana@terra.com");
      ok(m && m.subject === "Confirm your email to join Terra Holdings" && /Ann Admin approved your request to join Terra Holdings/.test(m.text), "Dana gets the email to confirm");
      ok(await fails_with(signedIn("dana@terra.com", "dana-pw-123"), "auth") === true, "not in before confirming");
      const twice = await si.join({ action: "decide", id: joinId, approve: false, token: "x" });
      ok(!twice.ok && twice.error === "bad_link", "the email link with a wrong token does nothing");
      const p = await A.rpc("lds_pull", { since: 0 });
      ok(p.joins.find(j => j.id === joinId).status === "approved", "the pop-up's list shows it decided");
      const c = await si.join(Object.assign({ action: "confirm" }, params(linkIn(m, "confirm.html"))));
      ok(c.ok, "Dana confirms");
      const D = await signedIn("dana@terra.com", "dana-pw-123");
      const h = await D.rpc("lds_hello");
      ok(h.member && h.role === "editor" && h.group_id === g1 && h.name === "Dana Cohen", "Dana signs in: an editor of Terra Holdings");
    });

    await section("approving from the email, and deciding twice", async () => {
      const r = await si.join({ action: "join", group_id: g1, name: "Gil Green", email: "gil@terra.com", password: "gil-pw-1234" });
      const u = linkIn(lastMail("ann@terra.com"), "decide.html");
      const d = await si.join(Object.assign({ action: "decide", approve: true }, params(u)));
      ok(r.ok && d.ok && d.status === "approved" && d.name === "Gil Green", "the admin approves from the email's page");
      const d2 = await si.join(Object.assign({ action: "decide", approve: false }, params(u)));
      ok(!d2.ok && d2.status === "approved" && d2.decided_by === "Ann Admin", "pressing again: already approved by Ann (nothing changes)");
      const inApp = await A.fn("lds-join", { action: "decide", id: params(u).id, approve: false });
      ok(!inApp.ok && inApp.status === "approved", "and the app says the same");
      await si.join(Object.assign({ action: "confirm" }, params(linkIn(lastMail("gil@terra.com"), "confirm.html"))));
      ok((await (await signedIn("gil@terra.com", "gil-pw-1234")).rpc("lds_hello")).role === "editor", "Gil is in");
    });

    await section("turning someone down", async () => {
      await si.join({ action: "join", group_id: g1, name: "Mallory", email: "mal@evil.com", password: "mal-pw-1234" });
      const u = linkIn(lastMail("ann@terra.com"), "decide.html");
      const usersBefore = Number((await sql("select count(*) n from auth.users")).rows[0].n);
      const d = await si.join(Object.assign({ action: "decide", approve: false }, params(u)));
      ok(d.ok && d.status === "turned_down" && d.mailed === true, "turned down from the email");
      const m = lastMail("mal@evil.com");
      ok(m && m.subject === "Your request to join Terra Holdings" && /turned down your request/.test(m.text) && m.links.length === 0, "Mallory gets an email saying so");
      ok(!(await sql("select 1 from app.members where email = 'mal@evil.com'")).rows[0], "not on the list");
      ok(Number((await sql("select count(*) n from auth.users")).rows[0].n) === usersBefore - 1, "the account made for the request is gone");
      ok(await fails_with(signedIn("mal@evil.com", "mal-pw-1234"), "auth") === true, "can't sign in");
      const again = await si.join({ action: "join", group_id: g1, name: "Mallory", email: "mal@evil.com", password: "mal-pw-1234" });
      ok(again.ok && again.status === "waiting", "may ask again later (the admin decides again)");
      const r2 = await A.fn("lds-join", { action: "decide", id: (await A.rpc("lds_pull", { since: 0 })).joins.filter(j => j.status === "waiting").pop().id, approve: false });
      ok(r2.ok && r2.status === "turned_down", "turned down in the app too");
    });

    await section("accounts that exist already", async () => {
      // an account that asked one group, then asks another: the password must be the account's
      await si.join({ action: "join", group_id: g1, name: "Sam", email: "sam@x.com", password: "sam-pw-1234" });
      const wrong = await si.join({ action: "join", group_id: g2, name: "Sam", email: "sam@x.com", password: "another-pw-1" });
      ok(!wrong.ok && wrong.error === "wrong_password", "another password: refused (asking never changes an account's password)");
      const right = await si.join({ action: "join", group_id: g2, name: "Sam", email: "sam@x.com", password: "sam-pw-1234" });
      ok(right.ok && right.status === "waiting" && lastMail("bob@blue.com").subject === "Sam asks to join Blue Rock Capital", "the right password: asks the other group");
      const rows = (await sql("select group_id, status from app.join_requests where email = 'sam@x.com' order by at")).rows;
      ok(rows.length === 2 && rows[0].status === "withdrawn" && rows[1].status === "waiting" && rows[1].group_id === g2, "the first request is replaced");
      const look = await si.join({ action: "decide", id: (await sql("select id from app.join_requests where email = 'sam@x.com' and status = 'withdrawn'")).rows[0].id, approve: true, token: "x" });
      ok(!look.ok, "the replaced one can't be approved");
      const inOther = await si.join({ action: "join", group_id: g2, name: "Dana", email: "dana@terra.com", password: "dana-pw-123" });
      ok(!inOther.ok && inOther.error === "in_another_group", "someone in a group can't ask another");
      const member = await si.join({ action: "join", group_id: g1, name: "Dana", email: "dana@terra.com", password: "dana-pw-123" });
      ok(!member.ok && member.error === "already_member", "someone already in: told to sign in");
      const weak = await si.join({ action: "join", group_id: g1, name: "Wes", email: "wes@x.com", password: "short" });
      ok(!weak.ok && weak.error === "weak_password", "a password under 8 characters is refused");
      ok(!(await si.join({ action: "join", group_id: g1, name: "W", email: "wes@x.com", password: "long-enough-1" })).ok, "a full name is needed");
      ok((await si.join({ action: "join", group_id: "not-a-group", name: "Wes", email: "wes@x.com", password: "long-enough-1" })).error === "no_group", "the group must be picked from the list");
      ok(!(await sql("select 1 from auth.users where email = 'wes@x.com'")).rows[0], "no account is made when the request is refused");
    });

    await section("signed in but in no group: asks from the app", async () => {
      // the maintainer (an account in no group) asks to join Blue Rock
      const r = await M.fn("lds-join", { action: "join", group_id: g2, name: "Max Maint" });
      ok(r.ok && r.status === "waiting", "asked with the account they're signed in with (no password typed)");
      const B = await (async () => { await si.join({ action: "join", group_id: g2, name: "Bob", email: "bob@blue.com", password: "bob-pw-1234" });
        await si.join(Object.assign({ action: "confirm" }, params(linkIn(lastMail("bob@blue.com"), "confirm.html")))); return signedIn("bob@blue.com", "bob-pw-1234"); })();
      await B.rpc("lds_hello");
      const j = (await B.rpc("lds_pull", { since: 0 })).joins.find(x => x.email === "maint@co.com");
      const d = await B.fn("lds-join", { action: "decide", id: j.id, approve: true });
      ok(d.ok && d.status === "approved", "Bob approves");
      const m = lastMail("maint@co.com");
      ok(m && m.subject === "You've joined Blue Rock Capital" && m.links.length === 0, "the email is already confirmed: told to sign in (no link)");
      const h = await M.rpc("lds_hello");
      ok(h.member && h.group_id === g2 && h.role === "editor" && h.maintainer === true, "in the group, and still the maintainer");
    });

    await section("names and emails can't bend the emails", async () => {
      const r = await si.join({ action: "join", group_id: g1, name: "Eve\r\nBcc: spy@evil.com", email: "eve@x.com", password: "eve-pw-1234" });
      const m = lastMail("ann@terra.com");
      ok(r.ok && !/^Bcc:/mi.test(m.raw.split("\r\n\r\n")[0]) && m.subject === "Eve Bcc: spy@evil.com asks to join Terra Holdings", "a line break in a name stays inside the subject");
      const x = await si.join({ action: "join", group_id: g1, name: "Zed", email: "zed@x.com>\r\nBcc: a@b.com", password: "zed-pw-1234" });
      ok(!x.ok && x.error === "bad_email", "an email with odd characters is refused");
      const h = await si.join({ action: "join", group_id: g1, name: "<b>Bold</b> & co", email: "bold@x.com", password: "bold-pw-123" });
      ok(h.ok && lastMail("ann@terra.com").html.indexOf("&lt;b&gt;Bold&lt;/b&gt; &amp; co") > 0 && lastMail("ann@terra.com").html.indexOf("<b>Bold") < 0, "a name is text in the email, never markup");
    });

    await section("when Gmail is down", async () => {
      si.setMailDown(true);
      const r = await si.join({ action: "join", group_id: g1, name: "Nina", email: "nina@terra.com", password: "nina-pw-123" });
      ok(r.ok && r.status === "waiting" && r.mailed === false, "the request still waits (told the email wasn't sent)");
      ok((await A.rpc("lds_pull", { since: 0 })).joins.some(j => j.email === "nina@terra.com" && j.status === "waiting"), "the admin still sees it in the app");
      const j = (await A.rpc("lds_pull", { since: 0 })).joins.find(x => x.email === "nina@terra.com");
      const d = await A.fn("lds-join", { action: "decide", id: j.id, approve: true });
      ok(d.ok && d.mailed === false, "approved; the confirmation email wasn't sent");
      si.setMailDown(false);
      const again = await si.join({ action: "join", group_id: g1, name: "Nina", email: "nina@terra.com", password: "nina-pw-123" });
      ok(again.ok && again.status === "confirm" && again.mailed === true, "asking again sends the confirmation (no second approval)");
      const c = await si.join(Object.assign({ action: "confirm" }, params(linkIn(lastMail("nina@terra.com"), "confirm.html"))));
      ok(c.ok && (await (await signedIn("nina@terra.com", "nina-pw-123")).rpc("lds_hello")).role === "editor", "Nina is in");
    });

    await section("the admin changes status and removes; nobody is added by typing an email", async () => {
      ok((await A.rpc("lds_member_set", { email: "dana@terra.com", name: null, role: "viewer" })).ok, "Dana: view only");
      const D = await signedIn("dana@terra.com", "dana-pw-123");
      ok((await D.rpc("lds_hello")).role === "viewer", "Dana sees she's view only");
      ok(await fails_with(A.rpc("lds_member_set", { email: "new@terra.com", name: "New", role: "editor" }), "not_in_group") === true, "an email not in the group can't be added");
      ok(await fails_with(A.rpc("lds_member_set", { email: "bob@blue.com", name: "B", role: "editor" }), "not_in_group") === true, "nor someone of another group");
      await A.rpc("lds_member_remove", { email: "gil@terra.com" });
      const G = await signedIn("gil@terra.com", "gil-pw-1234");
      ok((await G.rpc("lds_hello")).member === false, "Gil removed: in no group");
      const gilConfirm = (await sql("select id from app.join_requests where email = 'gil@terra.com' and status = 'approved'")).rows[0].id;
      ok((await sql("select confirm_hash from app.join_requests where id = $1", [gilConfirm])).rows[0].confirm_hash.length === 64, "only the link's hash is kept");
      const back = await G.fn("lds-join", { action: "join", group_id: g1, name: "Gil Green" });
      ok(back.ok && back.status === "waiting", "Gil can ask again; the admin decides again");
    });

    await section("the confirmation link after being removed", async () => {
      await si.join({ action: "join", group_id: g1, name: "Rita", email: "rita@terra.com", password: "rita-pw-123" });
      const j = (await A.rpc("lds_pull", { since: 0 })).joins.find(x => x.email === "rita@terra.com");
      await A.fn("lds-join", { action: "decide", id: j.id, approve: true });
      await A.rpc("lds_member_remove", { email: "rita@terra.com" });
      const c = await si.join(Object.assign({ action: "confirm" }, params(linkIn(lastMail("rita@terra.com"), "confirm.html"))));
      ok(!c.ok && c.error === "not_in_group", "removed before confirming: the link says so");
      ok(await fails_with(signedIn("rita@terra.com", "rita-pw-123"), "auth") === true, "and the email stays unconfirmed");
    });

    await section("too many waiting", async () => {
      for(let i = 0; i < 25; i++) await si.join({ action: "join", group_id: g2, name: "Bot " + i, email: "bot" + i + "@spam.com", password: "bot-pw-1234" });
      const n = Number((await sql("select count(*) n from app.join_requests where group_id = $1 and status = 'waiting'", [g2])).rows[0].n);
      ok(n === 20, "a group holds at most 20 waiting requests (" + n + ")");
      const r = await si.join({ action: "join", group_id: g2, name: "Late", email: "late@x.com", password: "late-pw-123" });
      ok(!r.ok && r.error === "too_many_waiting", "the next one is told to try later");
    });

    await section("the function's door", async () => {
      const opt = await fetch(si.url + "/functions/v1/lds-join", { method: "OPTIONS" });
      ok(opt.status === 200 && opt.headers.get("access-control-allow-origin") === "*", "the web pages may call it (CORS)");
      const g = await fetch(si.url + "/functions/v1/lds-join");
      ok(g.status === 405, "only POST");
      ok((await si.join({ action: "nothing" })).error === "bad_request", "an unknown action is refused");
    });
  } finally {
    await si.stop(); await db.stop();
  }
  console.log("\n" + (count - fails) + " of " + count + " checks passed" + (fails ? " — " + fails + " FAILED" : ""));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
