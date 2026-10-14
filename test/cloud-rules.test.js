/* 3.0.0 — the shared database's rules, on a real PostgreSQL through the app's own client (cloud-client.js) and a
   stand-in for Supabase's web API (test/cloud/standin-server.js).
   run:  node test/cloud-rules.test.js        (skipped when PostgreSQL isn't installed, e.g. the Windows build) */
"use strict";
const path = require("path");
const PG = require("./cloud/_pg.js");
const { startStandin } = require("./cloud/standin-server.js");
const { createClient } = require(path.join(__dirname, "..", "cloud-client.js"));
const { offlineHash, checkOfflineCode } = require(path.join(__dirname, "..", "cloud-sync.js"));

let fails = 0, count = 0;
function ok(cond, msg){ count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if(!cond) fails++; }
async function section(name, fn){ console.log("\n" + name); try{ await fn(); }catch(e){ ok(false, "threw: " + (e && e.stack || e)); } }
async function fails_with(p, code){ try{ await p; return "no error"; }catch(e){ return e.code === code ? true : (e.code + ": " + e.message); } }

(async () => {
  if(!PG.findBin()){ console.log("skipped: PostgreSQL isn't installed here — 0 checks"); return; }
  const db = await PG.start();
  const si = await startStandin(db);
  const sql = (q, a) => si.sql(q, a);
  async function person(email, pw){
    const c = createClient({ url: si.url, anonKey: si.anonKey });
    const r = await c.signUp(email, pw || "secret-pw-1");
    if(!r.signedIn){ await si.confirm(email); await c.signIn(email, pw || "secret-pw-1"); }
    return c;
  }
  const L = (rate, mat, extra) => Object.assign({ _id: "ln_1", propertyName: "Alpha", annualRate: rate, maturityDate: mat }, extra || {});
  try{
    let M, A, E, E2, V, X, g1, g2, ver = {};

    await section("signing in", async () => {
      const anon = createClient({ url: si.url, anonKey: si.anonKey });
      ok(await fails_with(anon.rpc("lds_hello"), "auth") === true, "not signed in: the functions are closed");
      const c = createClient({ url: si.url, anonKey: si.anonKey });
      await c.signUp("nobody@x.com", "secret-pw-1");
      ok(await fails_with(c.signIn("nobody@x.com", "secret-pw-1"), "auth") === true, "an email not confirmed can't sign in");
      await si.confirm("nobody@x.com"); await c.signIn("nobody@x.com", "secret-pw-1");
      ok(await fails_with(c.signIn("nobody@x.com", "wrong-pw"), "auth") === true, "a wrong password is refused");
      const h = await c.rpc("lds_hello");
      ok(h.member === false && h.maintainer === false, "signed in but in no group: told so");
    });

    await section("the maintainer makes groups and names their admin", async () => {
      await sql("insert into app.maintainers(email) values ('maint@co.com')");
      M = await person("maint@co.com");
      A = await person("admin@g1.com"); E = await person("ed@g1.com"); E2 = await person("ed2@g1.com"); V = await person("view@g1.com"); X = await person("admin@g2.com");
      ok(await fails_with(A.rpc("lds_group_create", { name: "G1", admin_email: "admin@g1.com" }), "maintainer_only") === true, "only the maintainer creates a group");
      g1 = (await M.rpc("lds_group_create", { name: "Group One", admin_email: "Admin@G1.com", admin_name: "Ann Admin" })).id;
      g2 = (await M.rpc("lds_group_create", { name: "Group Two", admin_email: "admin@g2.com", admin_name: "Xavier" })).id;
      ok(!!g1 && !!g2 && g1 !== g2, "two groups made");
      ok(await fails_with(M.rpc("lds_group_create", { name: "G3", admin_email: "admin@g1.com" }), "in_another_group") === true, "an email already in a group can't be another group's admin");
      const gs = await M.rpc("lds_groups");
      ok(gs.length === 2 && gs[0].admin.email === "admin@g1.com", "the maintainer lists the groups and their admins");
      const h = await A.rpc("lds_hello");
      ok(h.member && h.role === "admin" && h.group_id === g1 && h.name === "Ann Admin", "the admin signs in and is the group's admin");
    });

    await section("people in the group (joining itself: cloud-join.test.js)", async () => {
      // the admin approved them (what an approved request does)
      await si.addMember("ed@g1.com", g1, "Eddie", "editor"); await si.addMember("ed2@g1.com", g1, "Edna", "editor"); await si.addMember("view@g1.com", g1, "Vera", "editor");
      ok((await A.rpc("lds_member_set", { email: "view@g1.com", name: null, role: "viewer" })).ok, "the admin makes Vera view only");
      ok(await fails_with(A.rpc("lds_member_set", { email: "admin@g2.com", name: "X", role: "editor" }), "not_in_group") === true, "someone in another group can't be changed");
      ok(await fails_with(A.rpc("lds_member_set", { email: "z@g1.com", name: "Z", role: "editor" }), "not_in_group") === true, "nobody is added by typing an email");
      ok(await fails_with(A.rpc("lds_member_set", { email: "ed@g1.com", name: "Z", role: "admin" }), "bad_role") === true, "the admin can't make a second admin");
      ok(await fails_with(E.rpc("lds_member_set", { email: "ed2@g1.com", name: "Z", role: "viewer" }), "admin_only") === true, "an editor can't change people");
      const he = await E.rpc("lds_hello"), hv = await V.rpc("lds_hello");
      ok(he.role === "editor" && hv.role === "viewer" && he.group_id === g1, "the editor and the viewer are in the group with their roles");
      ok(he.offline_hash == null, "a member's app never gets the admin's offline code");
    });

    await section("starting data, and groups kept apart", async () => {
      const r = await A.rpc("lds_save", { items: [
        { path: "loans.json", base_version: 0, content: { loans: [L(5, "2030-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6 }] } },
        { path: "props/h1/profile.json", base_version: 0, content: { fields: { units: { value: 100 } } } }], reason: "Starting data from the operator's PC", kind: "start" });
      ok(r.ok && r.results.length === 2, "the admin uploads the starting data");
      r.results.forEach(x => ver[x.path] = x.version);
      ok(Number((await sql("select count(*) n from app.locks")).rows[0].n) === 0, "the starting data locks nothing");
      ok(await fails_with(E.rpc("lds_save", { items: [{ path: "x.json", base_version: 0, content: {} }], reason: "r", kind: "start" }), "admin_only") === true, "only the admin uploads starting data");
      const pe = await E.rpc("lds_pull", { since: 0 });
      ok(pe.records.length === 2 && pe.records.some(x => x.path === "loans.json"), "an editor of the group sees the records");
      const px = await X.rpc("lds_pull", { since: 0 });
      ok(px.records.length === 0, "the other group's admin sees none of them");
      const pv = await V.rpc("lds_pull", { since: 0 });
      ok(pv.records.length === 2 && pv.members.length === 4 && pv.members.every(m => m.email == null), "the viewer sees everything, members by name only");
      const pa = await A.rpc("lds_pull", { since: 0 });
      ok(pa.members.every(m => !!m.email), "the admin sees the members' emails");
    });

    await section("view-only and reasons", async () => {
      ok(await fails_with(V.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [] } }], reason: "x" }), "view_only") === true, "a view-only member can't change anything");
      ok(await fails_with(E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [] } }], reason: "   " }), "reason_required") === true, "no reason, no save");
      const r = await E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [L(5.25, "2030-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6 }] } }], reason: "Rate reset per the lender's notice" });
      ok(r.ok, "an editor saves with a reason"); ver["loans.json"] = r.results[0].version;
      const ch = (await sql("select * from app.changes where kind = 'person' order by id")).rows;
      ok(ch.length === 1 && ch[0].field === "loans[ln_1].annualRate" && Number(ch[0].old) === 5 && Number(ch[0].new) === 5.25, "the change record names the one field, old and new");
      ok(ch[0].by_name === "Eddie" && ch[0].reason === "Rate reset per the lender's notice", "…who made it and why");
    });

    await section("two people at once", async () => {
      const stale = ver["loans.json"] - 1, n0 = Number((await sql("select count(*) n from app.changes")).rows[0].n);
      const r = await E2.rpc("lds_save", { items: [{ path: "loans.json", base_version: stale, content: { loans: [] } }], reason: "x" });
      ok(r.ok === false && r.conflicts.length === 1 && r.conflicts[0].by === "Eddie" && r.conflicts[0].content.loans.length === 2, "a save from an old copy is turned back with the newer one, to fold in");
      const n = Number((await sql("select count(*) n from app.changes")).rows[0].n);
      ok(n === n0, "nothing was written");
    });

    await section("the admin's lock", async () => {
      let r = await A.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [L(5.5, "2030-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6 }] } }], reason: "Confirmed with the bank" });
      ok(r.ok, "the admin changes ln_1's rate"); ver["loans.json"] = r.results[0].version;
      const lk = (await sql("select * from app.locks")).rows;
      ok(lk.length === 1 && lk[0].field === "loans[ln_1].annualRate" && lk[0].admin_name === "Ann Admin", "that one field is now the admin's");
      r = await E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [L(6, "2030-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6 }] } }], reason: "Typo" });
      ok(r.ok === false && r.needs_approval.length === 1 && r.needs_approval[0].admin === "Ann Admin" && !r.wrong_code, "a member changing it needs the admin's approval");
      r = await E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [L(5.5, "2031-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6.1 }] } }], reason: "Extension signed" });
      ok(r.ok, "other fields (the maturity, another loan) are free"); ver["loans.json"] = r.results[0].version;
      await A.rpc("lds_admin_codes", { approval_code: "open-sesame", offline_hash: offlineHash("offline-123") });
      ok(await fails_with(A.rpc("lds_admin_codes", { offline_hash: "plain-text" }), "bad_offline_hash") === true, "the offline code is never stored as typed");
      r = await E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [L(6, "2031-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6.1 }] } }], reason: "Typo", approval_code: "nope" });
      ok(r.ok === false && r.wrong_code === true, "a wrong approval code is refused");
      r = await E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [L(6, "2031-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6.1 }] } }], reason: "Typo", approval_code: "open-sesame" });
      ok(r.ok && r.approved_by === "Ann Admin", "the approval code typed on the spot lets it through"); ver["loans.json"] = r.results[0].version;
      const c = (await sql("select * from app.changes where reason = 'Typo'")).rows;
      ok(c.length === 1 && c[0].by_name === "Eddie" && c[0].approved_by === "Ann Admin", "recorded as made by the member, approved by the admin");
      const ho = await A.rpc("lds_hello");
      ok(typeof ho.offline_hash === "string" && ho.offline_hash.indexOf("offline-123") < 0 && checkOfflineCode("offline-123", ho.offline_hash) && !checkOfflineCode("offline-124", ho.offline_hash), "the admin's app gets the offline code's hash, and checks the code with it");
    });

    await section("asking the admin", async () => {
      const want = { loans: [L(7, "2031-01-01"), { _id: "ln_2", propertyName: "Beta", annualRate: 6.1 }] };
      const q = await E.rpc("lds_request", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: want }], reason: "Lender raised it" });
      ok(q.ok && q.fields.length === 1 && q.fields[0].field === "loans[ln_1].annualRate", "the member sends a request; it lists what it changes");
      ok(await fails_with(V.rpc("lds_request", { items: [{ path: "loans.json", base_version: 1, content: want }], reason: "x" }), "editor_only") === true, "a view-only member can't send one");
      const pa = await A.rpc("lds_pull", { since: 0 }), pe = await E.rpc("lds_pull", { since: 0 }), pe2 = await E2.rpc("lds_pull", { since: 0 });
      ok(pa.requests.length === 1 && pa.requests[0].status === "waiting" && pa.requests[0].by_name === "Eddie", "the admin sees it waiting");
      ok(pe.requests.length === 1 && pe2.requests.length === 0, "the member sees their own; another member doesn't");
      ok(await fails_with(E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: want }], reason: "x", kind: "approved", request_id: q.id }), "admin_only") === true, "only the admin approves");
      const r = await A.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: want }], reason: "approve", kind: "approved", request_id: q.id });
      ok(r.ok, "the admin approves"); ver["loans.json"] = r.results[0].version;
      const c = (await sql("select * from app.changes where request_id = $1", [q.id])).rows;
      ok(c.length === 1 && c[0].by_name === "Eddie" && c[0].approved_by === "Ann Admin" && c[0].reason === "Lender raised it", "recorded as the member's change, with the member's reason, approved by the admin");
      const pe3 = await E.rpc("lds_pull", { since: 0 });
      ok(pe3.requests[0].status === "approved", "the member sees the answer");
      ok(await fails_with(A.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: want }], reason: "again", kind: "approved", request_id: q.id }), "request_not_waiting") === true, "a request is approved once");
      const q2 = await E.rpc("lds_request", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: { loans: [] } }], reason: "Clear all" });
      await A.rpc("lds_reject", { request_id: q2.id, note: "No" });
      const pe4 = await E.rpc("lds_pull", { since: 0 });
      ok(pe4.requests.find(x => x.id === q2.id).status === "rejected" && pe4.requests.find(x => x.id === q2.id).note === "No", "a request turned down says so, with the admin's note");
    });

    await section("automatic work", async () => {
      let r = await E.rpc("lds_save", { items: [{ path: "props/h1/general-data.json", base_version: 0, content: { noi: { value: 1, computedAt: "a" }, updatedAt: "t1" } }], reason: "App: general data rebuilt", kind: "app", app_version: "3.0.2" });
      ok(r.ok, "the app's own work goes up with the app's reason"); ver.gd = r.results[0].version;
      r = await E.rpc("lds_save", { items: [{ path: "props/h1/general-data.json", base_version: ver.gd, content: { noi: { value: 1, computedAt: "b" }, updatedAt: "t2" } }], reason: "App: general data rebuilt", kind: "app", app_version: "3.0.2" });
      ok(r.ok && r.results[0].unchanged === true && r.results[0].version === ver.gd, "a save that differs only in time stamps is no change");
      r = await E2.rpc("lds_save", { items: [{ path: "props/h1/general-data.json", base_version: ver.gd, content: { noi: { value: 2 } } }], reason: "App: recomputed", kind: "app", app_version: "3.0.1" });
      ok(r.ok === false && r.old_app === true && r.newest === "3.0.2", "an older app's automatic work isn't taken");
      r = await A.rpc("lds_save", { items: [{ path: "props/h1/profile.json", base_version: ver["props/h1/profile.json"], content: { fields: { units: { value: 120 } } } }], reason: "Recount", kind: "app", app_version: "3.0.2" });
      ok(r.ok && Number((await sql("select count(*) n from app.locks where path = 'props/h1/profile.json'")).rows[0].n) === 0, "the admin's automatic work locks nothing");
      ver["props/h1/profile.json"] = r.results[0].version;
    });

    await section("chats", async () => {
      await E.rpc("lds_chat_save", { id: "c1", scope: "name:alpha", title: "Rates", content: { messages: [{ role: "user", text: "hi" }] } });
      const pv = await V.rpc("lds_pull", { since: 0 });
      const c = pv.chats.find(x => x.id === "c1");
      ok(c && c.owner_name === "Eddie" && c.content.messages.length === 1, "everyone reads the chat, with who started it");
      ok(await fails_with(V.rpc("lds_chat_save", { id: "c1", scope: "name:alpha", title: "x", content: {} }), "not_your_chat") === true, "only its owner continues it");
      await V.rpc("lds_chat_save", { id: "c2", scope: "portfolio", title: "Q", content: { messages: [] } });
      ok(true, "a view-only member can talk to the assistant (their own chat)");
      ok(await fails_with(E2.rpc("lds_chat_delete", { id: "c2" }), "not_your_chat") === true, "another member can't delete it");
      await A.rpc("lds_chat_delete", { id: "c2" });
      const pa = await A.rpc("lds_pull", { since: 0 });
      ok(pa.chats.find(x => x.id === "c2").deleted === true, "the admin can delete it");
      const mv = await E2.rpc("lds_chat_move", { from_scope: "name:alpha", to_scope: "name:alpha2" });
      ok(mv.moved === 1, "a renamed property's chats follow it");
    });

    await section("files", async () => {
      const f = g1 + "/props/h1/d1.pdf", buf = Buffer.from("%PDF-1.4 test");
      ok(await E.upload(f, buf, { type: "application/pdf" }) === true, "an editor stores a file in the group's folder");
      ok((await V.download(f)).equals(buf), "a view-only member downloads it");
      ok(await fails_with(V.upload(g1 + "/props/h1/d2.pdf", buf), "storage") === true, "a view-only member can't store files");
      ok(await fails_with(X.download(f), "storage") === true, "another group can't read it");
      ok(await fails_with(E.upload(g2 + "/props/h1/d3.pdf", buf), "storage") === true, "nobody stores into another group's folder");
      const del = await E.remove([f]);
      ok(Array.isArray(del) && del.length === 0 && (await A.download(f)).equals(buf), "an editor can't delete a stored file");
      const del2 = await A.remove([f]);
      ok(del2.length === 1, "the admin can");
    });

    await section("the change history", async () => {
      const h = await V.rpc("lds_history", { path_prefix: "loans.json" });
      ok(h.length >= 5 && h[0].id > h[h.length - 1].id, "newest first");
      ok(h.every(x => x.reason && x.by_name), "every change has a reason and who made it");
    });

    await section("the daily backup", async () => {
      await sql("select app.daily_backup()");
      const b = await A.rpc("lds_backups");
      ok(b.length === 1 && Number(b[0].records) >= 3, "taken for the group");
      ok(await fails_with(E.rpc("lds_backups"), "admin_only") === true, "only the admin sees backups");
      const before = (await A.rpc("lds_pull", { since: 0 })).records.find(x => x.path === "loans.json").content;
      const oops = JSON.parse(JSON.stringify(before)); oops.loans[1].annualRate = 0;
      const ro = await E.rpc("lds_save", { items: [{ path: "loans.json", base_version: ver["loans.json"], content: oops }], reason: "Oops" });
      ok(ro.ok, "an editor makes a mistake");
      const r = await A.rpc("lds_backup_restore", { day: b[0].day, reason: "Undo Eddie's mistake" });
      const after = (await A.rpc("lds_pull", { since: 0 })).records.find(x => x.path === "loans.json");
      ok(r.ok && JSON.stringify(after.content) === JSON.stringify(before), "putting a backup back restores the records");
      const c = (await sql("select * from app.changes where kind = 'restore'")).rows;
      ok(c.length > 0 && /Undo Eddie/.test(c[0].reason), "…recorded as changes with the admin's reason");
      ver["loans.json"] = after.version;
    });

    await section("live: everything new since the last answer", async () => {
      const p0 = await E.rpc("lds_pull", { since: 0 });
      const p1 = await E.rpc("lds_pull", { since: p0.seq });
      ok(p1.records.length === 0 && p1.chats.length === 0 && p1.seq === p0.seq, "nothing new: an empty answer");
      await A.rpc("lds_save", { items: [{ path: "settings.json", base_version: 0, content: { targets: { dscrMin: 1.3 } } }], reason: "New target" });
      const p2 = await E.rpc("lds_pull", { since: p0.seq });
      ok(p2.records.length === 1 && p2.records[0].path === "settings.json", "a change shows up in the next answer");
      let since = 0, got = [], more = true, rounds = 0;
      while(more && rounds++ < 20){ const p = await E.rpc("lds_pull", { since, max_rows: 1 }); got = got.concat(p.records.map(x => x.path)); since = p.seq; more = p.more; }
      ok(new Set(got).size === 4 && rounds <= 6, "a big group comes in pages");
    });

    await section("the maintainer replaces an admin; the admin removes a member", async () => {
      await M.rpc("lds_group_admin", { group_id: g1, admin_email: "ed@g1.com" });
      const ha = await A.rpc("lds_hello"), he = await E.rpc("lds_hello");
      ok(he.role === "admin" && ha.role === "editor", "the new admin is in; the old one stays as an editor");
      ok(Number((await sql("select count(*) n from app.members where group_id = $1 and role = 'admin'", [g1])).rows[0].n) === 1, "still one admin");
      await E.rpc("lds_member_remove", { email: "view@g1.com" });
      const hv = await V.rpc("lds_hello");
      ok(hv.member === false, "a removed member is out");
      ok(await fails_with(V.rpc("lds_pull", { since: 0 }), "not_member") === true, "…and reads nothing");
    });

    await section("offline and an expired sign-in", async () => {
      const c = createClient({ url: si.url, anonKey: si.anonKey, session: Object.assign({}, E2.session, { expires_at: 1 }) });
      const h = await c.rpc("lds_hello");
      ok(h.member && c.session.access_token !== E2.session.access_token, "an expired sign-in is renewed by itself");
      si.setDown(true);
      ok(await fails_with(c.rpc("lds_hello"), "offline") === true, "the server down: the client says offline");
      si.setDown(false);
    });

    await section("starting the group over (E is the admin now)", async () => {
      const before = await E.rpc("lds_pull", { since: 0 });
      ok(typeof before.epoch === "number" && before.records.length > 0, "the group has data, at epoch " + before.epoch);
      ok(await fails_with(A.rpc("lds_group_reset", { group_name: "Group One" }), "admin_only") === true, "an editor can't start the group over");
      ok(await fails_with(E.rpc("lds_group_reset", { group_name: "Group 1" }), "name_mismatch") === true, "the group's name must be typed exactly");
      const r = await E.rpc("lds_group_reset", { group_name: "  group one " });
      ok(r.ok && r.epoch === before.epoch + 1, "the admin starts it over (the name in any case)");
      const after = await E.rpc("lds_pull", { since: 0 });
      ok(after.epoch === before.epoch + 1 && after.records.length === 0 && after.chats.length === 0, "nothing left: no records, no chats; a new epoch");
      ok(Number((await sql("select count(*) n from app.locks where group_id = $1", [g1])).rows[0].n) === 0, "no locks left");
      const h = await E.rpc("lds_history", {});
      ok(h.length === 1 && /Started the group over/.test(h[0].reason), "the history keeps one line: who started it over, and when");
      ok((await A.rpc("lds_hello")).member === true && (await E.rpc("lds_hello")).role === "admin", "the members stay, with their roles");
      const g2pull = await X.rpc("lds_pull", { since: 0 });
      ok(g2pull.epoch === 0, "another group is untouched");
    });
  } finally {
    await si.stop(); await db.stop();
  }
  console.log("\n" + (count - fails) + " of " + count + " checks passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
