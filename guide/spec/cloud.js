/* Guide chapter: the shared database — signing in, creating an account and asking to join, the cloud chip and its
   menu, the first upload, online / offline / view only, the "Not saved yet" bar and its reason, the admin's approvals,
   people asking to join, members and codes, the change history, the daily backups and the maintainer's groups.

   The pictures come from the app signed in to a LOCAL test server — a throwaway PostgreSQL with the app's own setup SQL
   behind the stand-in for Supabase's web API (test/cloud) — never a real shared database. The group's data is the
   app's built-in sample loans; every person, email address and group name is made up.

   How it runs: env() starts this same file as a small server process (`--serve`), which first opens the app once on
   its own (no shared database) so this computer has its data to upload, then starts the test server and makes the
   accounts. The steps send it a few commands (the server going offline, a member's request, the daily backups). It
   stops when the guide's capture ends. */
"use strict";
const path = require("path"), fs = require("fs"), cp = require("child_process");
const APP = path.resolve(__dirname, "..", "..");
const PW = "secret-pw-1";            // the made-up accounts' password
const GROUP = "Living Residential";

// ---- the server process, and talking to it ------------------------------------------------------------------------------
let SRV = null, seq = 0;
const waiting = new Map();
function srv(cmd, o){
  return new Promise((ok, bad) => {
    if (!SRV) return bad(new Error("the test server isn't running"));
    const id = ++seq; waiting.set(id, { ok, bad });
    SRV.stdin.write(JSON.stringify(Object.assign({ id, cmd }, o || {})) + "\n");
  });
}
function startServer(udata){
  const ready = path.join(udata, "cloud-ready.json");
  SRV = cp.spawn(process.execPath, [__filename, "--serve", udata], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
  let buf = "";
  SRV.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0){ const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch (e) { continue; }
    const w = waiting.get(m.id); if (!w) continue; waiting.delete(m.id); if (m.ok) w.ok(m); else w.bad(new Error("test server: " + m.error)); } });
  // the guide's run ends without waiting for it; it stops when its input closes
  SRV.unref(); SRV.stdin.unref && SRV.stdin.unref(); SRV.stdout.unref && SRV.stdout.unref();
  // env() is synchronous: wait here until the server says it is ready
  const nap = new Int32Array(new SharedArrayBuffer(4)), t0 = Date.now();
  while (!fs.existsSync(ready)){
    if (Date.now() - t0 > 240000) throw new Error("the shared-database test server didn't start in 4 minutes");
    Atomics.wait(nap, 0, 0, 250);
  }
  const r = JSON.parse(fs.readFileSync(ready, "utf8"));
  if (r.error) throw new Error("the shared-database test server: " + r.error);
  return r;
}

// ---- the app: waiting through page loads (signing in and out loads another page) -----------------------------------------
async function until(h, fn, arg, ms){
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 30000)){ try { if (await h.page.evaluate(fn, arg)) return true; } catch (e) {} await h.wait(250); }
  throw new Error("timed out waiting for: " + String(fn).slice(0, 140));
}
const card = "main > section.card:not(.hidden)";
const modal = (title) => 'div.fixed.inset-0 > div:has(> div > h3:text-is("' + title + '"))';
const btn = (title, label) => modal(title) + ' [data-cm-btns] button:text-is("' + label + '")';
async function signInPage(h){ await until(h, () => !!document.getElementById("siEmail") && !document.getElementById("vSignin").classList.contains("hidden")); await h.wait(300); await h.calm(); }
async function signIn(h, email, pw){
  await signInPage(h);
  await h.fill("#siEmail", email); await h.fill("#siPw", pw || PW);
  await h.js(() => document.getElementById("siGo").click());
}
// the app open on the group's data, done loading
async function waitApp(h){
  await until(h, () => typeof window.LDS_loans === "function" && !!document.getElementById("cloudDD") && !document.getElementById("cloudDD").classList.contains("hidden"), null, 60000);
  await until(h, () => !document.getElementById("portfolioLoading"), null, 60000).catch(() => {});
  await h.wait(1500); await h.calm();
}
async function signOut(h){
  await h.js(() => { const b = document.querySelector('#cloudMenu [data-cloud="signout"]'); if (b) b.click(); });
  await signInPage(h);
}
const closeModal = (h, title) => h.js((t) => { [...document.querySelectorAll("div.fixed.inset-0 h3")].filter(x => x.textContent === t).forEach(x => x.closest("div.fixed.inset-0").remove()); }, title);
const menu = async (h, item) => { await h.js(() => { document.getElementById("cloudDD").open = true; }); await h.wait(300); if (item){ await h.js((i) => document.querySelector('#cloudMenu [data-cloud="' + i + '"]').click(), item); await h.wait(1200); } };
// a person's own edit of a loan (the keyboard first, so it counts as theirs; then the app's own save)
const personEdit = (h, idx, field, value) => h.js(([i, f, v]) => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); return new Promise(r => setTimeout(() => r(window.LDS_cloudEditLoan(i, f, v)), 500)); }, [idx, field, value]);

module.exports = {
  id: "cloud",
  title: "The shared database",
  intro: "With the shared database your team works on one copy of the loans, properties and files: you sign in, every change is saved with a reason, and the group’s admin decides who can change what.",
  waitHome: false,
  env: (udata) => {
    const r = startServer(udata);
    return { LDS_CLOUD_OFF: null, LDS_CLOUD_URL: r.url, LDS_CLOUD_ANON_KEY: r.anonKey, LDS_CLOUD_POLL_MS: "800", LDS_CLOUD_AUTO_MS: "300" };
  },
  setup: async (h) => { await signInPage(h); },
  topics: [
    { id: "signin", title: "Sign in, or create an account", intro: "With a shared database the app opens on its sign-in screen. Each person has their own account in their organization’s group.",
      steps: [
        { title: "The sign-in screen", text: "Type your email and password and click Sign in: the app opens on your group’s data.",
          go: async (h) => { await signInPage(h); },
          shot: "view",
          marks: [
            { sel: "#siEmail", label: "Email", text: "The email address of your account." },
            { sel: "#siPw", label: "Password", text: "Your password." },
            { sel: "#siGo", label: "Sign in", text: "Opens the app on your group’s loans, properties and files." },
            { sel: "#toSignup", label: "Create an account", text: "For someone new: asks to join your organization’s group." },
            { sel: "#toForgot", label: "Forgot your password?", text: "Emails you a code to set a new password." },
            { sel: "#wMin", label: "Minimize", text: "Hides the window to the taskbar." },
            { sel: "#wClose", label: "Close", text: "Closes the app." }
          ] },
        { title: "Forgot your password — the email", text: "Type your account’s email and click “Email me a code”. A 6-digit code is sent to that address.",
          go: async (h) => { await h.js(() => document.getElementById("toForgot").click()); await h.wait(300); await h.fill("#fgEmail", "op@co.com"); },
          shot: card,
          marks: [
            { sel: "#fgEmail", label: "Email", text: "The email of the account whose password you forgot." },
            { sel: "#fgSend", label: "Email me a code", text: "Sends the code. The screen then asks for it." },
            { sel: "#fgBack", label: "Back to sign in", text: "Returns to the sign-in screen." }
          ] },
        { title: "Forgot your password — the code", text: "Type the code from the email and a new password twice, then click “Set the password and sign in”.",
          go: async (h) => { await h.js(() => document.getElementById("fgSend").click()); await until(h, () => !document.getElementById("fReset").classList.contains("hidden")); await h.wait(300); },
          shot: card,
          marks: [
            { sel: "#fgMsg", label: "Sent", text: "Says the code is on its way (it only goes to an email that has an account)." },
            { sel: "#fgCode", label: "The code", text: "The 6 digits from the email." },
            { sel: "#fgPw", label: "New password", text: "At least 8 characters." },
            { sel: "#fgPw2", label: "Again", text: "The same new password, to be sure it’s typed right." },
            { sel: "#fgGo", label: "Set the password and sign in", text: "Saves the new password and opens your group’s data." }
          ],
          after: async (h) => { await h.js(() => document.getElementById("fgBack").click()); await h.wait(300); } },
        { title: "Create an account", text: "Click “Create an account”. Type the first 3 letters of your organization and pick it from the names that appear, then your name, email and a password. The group’s admin approves you.",
          go: async (h) => { await h.js(() => document.getElementById("toSignup").click()); await h.wait(300); await h.fill("#suOrg", "Liv");
            await until(h, () => document.querySelectorAll("#suSugg button").length >= 2); await h.wait(300); },
          shot: card,
          marks: [
            { sel: "#suOrg", label: "Organization", text: "Type the first 3 letters of its name." },
            { sel: "#suSugg", label: "Pick yours", text: "The groups whose name starts with those letters. Click yours; only these can be joined." },
            { sel: "#suName", label: "Full name", text: "Your name, as the admin and the change history will show it." },
            { sel: "#suEmail", label: "Email", text: "Your work email — the admin sees it, and the confirmation goes there." },
            { sel: "#suPw", label: "Password", text: "At least 8 characters." },
            { sel: "#suPw2", label: "Again", text: "The same password again." },
            { sel: "#suGo", label: "Sign up", text: "Sends your request to join to the group’s admin." },
            { sel: "#toSignin", label: "I have an account", text: "Back to the sign-in screen." }
          ] },
        { title: "Waiting for approval", text: "After Sign up the request goes to the group’s admin (in the app, and by email). When they approve it you get an email: confirm your address from it, then sign in.",
          go: async (h) => {
            await h.js(() => { const b = [...document.querySelectorAll("#suSugg button")].find(x => x.textContent === "Living Residential"); b.click(); });
            await h.fill("#suName", "Dana Cohen"); await h.fill("#suEmail", "dana@co.com"); await h.fill("#suPw", "dana-pw-123"); await h.fill("#suPw2", "dana-pw-123");
            await h.js(() => document.getElementById("suGo").click());
            await until(h, () => !document.getElementById("vWaiting").classList.contains("hidden")); await h.wait(300); },
          shot: card,
          marks: [
            { sel: "#wtTitle", label: "What happens now", text: "“Waiting for approval”. (Someone the admin already added is told to confirm their email instead.)" },
            { sel: "#wtText", label: "Who approves", text: "The group and its admin, and the next steps." },
            { sel: "#wtSignin", label: "Back to sign in", text: "The sign-in screen, with your email filled in." }
          ] },
        { title: "Signing in before approval", text: "Until the admin approves, the sign-in screen reminds you of your request, and signing in says the account isn’t ready yet.",
          go: async (h) => { await h.js(() => document.getElementById("wtSignin").click()); await h.wait(300); await h.fill("#siPw", "dana-pw-123"); await h.js(() => document.getElementById("siGo").click());
            await until(h, () => /isn't ready yet/.test(document.getElementById("siMsg").textContent)); await h.wait(300); },
          shot: card,
          marks: [
            { sel: "#siWaiting", label: "Your request", text: "Which group you asked to join, and what to do once approved." },
            { sel: "#siMsg", label: "Not ready yet", text: "Why signing in didn’t work yet." }
          ],
          after: async (h) => { await h.fill("#siEmail", ""); await h.fill("#siPw", ""); } },
        { title: "Signed in, but in no group", text: "An account that isn’t in a group yet (say, its admin removed it) can ask to join from here.",
          go: async (h) => { await signIn(h, "gil@co.com"); await until(h, () => !document.getElementById("vNoGroup").classList.contains("hidden")); await h.fill("#akOrg", "Living R");
            await until(h, () => document.querySelectorAll("#akSugg button").length === 1); await h.wait(300); },
          shot: card,
          marks: [
            { sel: "#ngTitle", label: "Not in a group", text: "You’re signed in, but no group has you yet." },
            { sel: "#ngText", label: "Signed in as", text: "The account you’re signed in with, and what to do." },
            { sel: "#akOrg", label: "Organization", text: "Type the first 3 letters of its name …" },
            { sel: "#akSugg", label: "Pick it", text: "… and click it." },
            { sel: "#akName", label: "Full name", text: "Your name for the admin." },
            { sel: "#akGo", label: "Ask to join", text: "Sends the request to the group’s admin." },
            { sel: "#ngRetry", label: "Check again", text: "Once the admin approves, this opens the group." },
            { sel: "#ngOut", label: "Sign out", text: "Back to the sign-in screen." }
          ],
          after: async (h) => { await h.js(() => document.getElementById("ngOut").click()); await signInPage(h); } },
        { title: "The maintainer", text: "The maintainer (who looks after the shared database for every company) signs in here too. Each company is a group with one admin; the maintainer makes the groups and names their admins.",
          go: async (h) => { await signIn(h, "maint@co.com"); await until(h, () => !document.getElementById("maint").classList.contains("hidden") && document.querySelectorAll("#gList tr").length >= 2); await h.wait(300); },
          shot: card,
          marks: [
            { sel: "#ngTitle", label: "The maintainer", text: "Signed in as the maintainer, in no group of their own." },
            { sel: "#akOrg", label: "Ask to join a group", text: "A maintainer can also ask to join a group, like anyone in no group." },
            { sel: "#gList tr", nth: 0, label: "A group", text: "Each group, its admin (“hasn’t signed in yet” until they do) and how many people it has." },
            { sel: "#gList [data-admin]", nth: 0, label: "New admin…", text: "Makes someone else the group’s admin. The old admin stays in the group as an editor." },
            { sel: "#gName", label: "New group", text: "The company’s name." },
            { sel: "#gAdmin", label: "Its admin’s email", text: "The person who will run the group." },
            { sel: "#gAdminName", label: "Admin’s name", text: "Their full name." },
            { sel: "#fGroup button", label: "Create", text: "Makes the group. Its admin then creates an account (Create an account → the group’s name) and needs no approval — only to confirm the email." },
            { sel: "#ngRetry", label: "Check again", text: "Opens the group, once the maintainer is in one." },
            { sel: "#ngOut", label: "Sign out", text: "Back to the sign-in screen." }
          ],
          after: async (h) => { await h.js(() => document.getElementById("ngOut").click()); await signInPage(h); } }
      ] },
    { id: "start", title: "The admin’s first sign-in", intro: "The group starts empty: its admin uploads the starting data from their own computer.",
      steps: [
        { title: "Someone asks to join", text: "When people are waiting to join, the admin’s app shows them as soon as it opens (they also got an email). Approve or turn down each one.",
          go: async (h) => { await signIn(h, "op@co.com"); await waitApp(h); await until(h, () => !!document.querySelector("#cloudJoinModal [data-join]")); await h.wait(500); },
          shot: "#cloudJoinModal > div",
          marks: [
            { sel: "#cloudJoinModal [data-join] .font-semibold", label: "Who asks", text: "Their name, email and when they asked." },
            { sel: "#cloudJoinModal [data-jno]", label: "Turn down", text: "They get an email saying so." },
            { sel: "#cloudJoinModal [data-jyes]", label: "Approve", text: "They get an email to confirm their address, then join as an editor. (Make them view only in Members and codes.)" },
            { sel: "#cloudJoinModal [data-cm-btns] button", label: "Close", text: "Decide later: the request waits (the menu’s “Asking to join” opens it again)." }
          ] },
        { title: "Approved", text: "Approved: the person confirms their email from the link they get, then signs in.",
          go: async (h) => { await h.js(() => document.querySelector("#cloudJoinModal [data-jyes]").click()); await until(h, () => /Approved\./.test(document.getElementById("cloudJoinModal").textContent)); await h.wait(300); },
          shot: "#cloudJoinModal > div",
          marks: [ { sel: "#cloudJoinModal [data-join] p", label: "Done", text: "What happens next for them." } ],
          after: async (h) => { await h.js(() => document.querySelector("#cloudJoinModal [data-cm-btns] button").click()); await h.wait(400); } },
        { title: "An empty group", text: "A new group has no data. The banner offers the upload; nothing on this computer is used until you do it.",
          go: async (h) => { await h.home(); await h.top(); },
          shot: "view",
          marks: [
            { sel: "#cloudBanner", label: "No data yet", text: "The group is empty (a member who isn’t the admin is told the admin brings the starting data)." },
            { sel: '#cloudBanner [data-cloud-banner="upload"]', label: "Upload this computer’s data", text: "Opens the upload." },
            { sel: "#cloudChip", label: "You", text: "Who is signed in, and their role. Click it for the menu." }
          ] },
        { title: "Upload this computer’s data", text: "The loans, properties, their documents and chats on this computer become the group’s starting data. Nothing on this computer changes.",
          go: async (h) => { await h.js(() => document.querySelector('#cloudBanner [data-cloud-banner="upload"]').click()); await until(h, () => /On this computer/.test((document.getElementById("cuSize") || {}).textContent || "")); await h.wait(300); },
          shot: modal("Upload this computer's data"),
          marks: [
            { sel: "#cuSize", label: "What goes up", text: "How many loans, properties and documents, and how big the files are." },
            { sel: "#cuFromBackup", label: "From a backup file", text: "Upload a backup file (Data → Back up to a file…, from any computer) instead." },
            { sel: "#cuWhy", label: "Why", text: "Kept in the change history." },
            { sel: btn("Upload this computer's data", "Not now"), label: "Not now", text: "Closes; the group stays empty." },
            { sel: "#cuGo", label: "Upload", text: "Sends it, file by file, then opens the group’s data." }
          ] },
        { title: "The group’s data", text: "Uploaded: the group has the data, and Home shows it at once. Everyone in the group sees the same, and changes reach every open app by themselves.",
          go: async (h) => { await h.js(() => document.getElementById("cuGo").click());
            await until(h, () => typeof window.LDS_loans === "function" && LDS_loans().length > 20 && !document.getElementById("cloudBanner"), null, 120000);
            // Home switches to the portfolio by itself once the loans arrive (no click on Whole Portfolio)
            await until(h, () => document.getElementById("emptyState").hidden && !document.getElementById("portfolioView").hidden, null, 30000);
            await h.wait(1500); await h.top(); await h.calm(); },
          shot: "view",
          marks: [
            { sel: "#cloudChip", label: "Online", text: "Green: online, live with the group. Blue: a change of yours isn’t saved yet. Amber: offline." },
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "The whole group’s portfolio." },
            { sel: "text=Total Debt Outstanding", label: "The group’s loans", text: "The same for everyone in the group." }
          ] }
      ] },
    { id: "chip", title: "The cloud chip and its menu", intro: "The chip in the title bar shows who is signed in; its menu has the group’s screens.",
      steps: [
        { title: "The menu (admin)", text: "Click the chip. An admin sees every screen; an editor or a viewer sees only the change history and Sign out.",
          go: async (h) => { await srv("backups"); await menu(h); },
          shot: "view", cover: true,
          marks: [
            { sel: "#cloudChip", label: "The chip", text: "Name · role; “offline”, how many changes wait for you and how many people ask to join, when there are." },
            { sel: "#cloudMenu > div", nth: 0, label: "The group", text: "The group, you, your role, and online (live) or offline (the last picture of the data)." },
            { sel: '#cloudMenu [data-cloud="requests"]', label: "Requests", text: "Changes members asked you to approve." },
            { sel: '#cloudMenu [data-cloud="joins"]', label: "Asking to join", text: "People who asked to join." },
            { sel: '#cloudMenu [data-cloud="members"]', label: "Members and codes", text: "Who is in the group and who can edit; your approval and offline codes." },
            { sel: '#cloudMenu [data-cloud="backups"]', label: "Daily backups", text: "Put the group’s data back as it was on a day." },
            { sel: '#cloudMenu [data-cloud="startover"]', label: "Start the group over…", text: "Removes all the group’s data, to upload the starting data again (asks you to type the group’s name). Before the first upload this is “Upload this computer’s data”." },
            { sel: '#cloudMenu [data-cloud="history"]', label: "Change history", text: "Every change: who, when, why." },
            { sel: '#cloudMenu [data-cloud="groups"]', label: "Groups", text: "Only the maintainer: every group and its admin." },
            { sel: '#cloudMenu [data-cloud="signout"]', label: "Sign out", text: "Back to the sign-in screen. Changes not saved yet are dropped (it asks first)." }
          ],
          after: async (h) => { await h.js(() => { document.getElementById("cloudDD").open = false; }); } }
      ] },
    { id: "save", title: "Saving a change, with a reason", intro: "Every change waits in a bar until you say why; then it is saved for everyone.",
      steps: [
        { title: "Not saved yet", text: "Change anything (here a loan’s lender): the bar at the bottom lists what isn’t saved yet. Type why, then click Save (or press Enter).",
          go: async (h) => { await personEdit(h, 0, "lenderName", "Harbor Point Capital"); await until(h, () => !!document.getElementById("cloudBar")); await h.fill("#cloudReason", "The loan was sold to Harbor Point Capital", { change: false }); await h.wait(300); },
          shot: "#cloudBar",
          marks: [
            { sel: "#cloudBar .text-amber-900", label: "Not saved yet", text: "Your change is only on this computer until you save it." },
            { sel: "#cloudBarWhat", label: "What changed", text: "The changes waiting (hover for the full list)." },
            { sel: "#cloudReason", label: "Why", text: "Required — kept in the change history with your name." },
            { sel: "#cloudSaveBtn", label: "Save", text: "Saves for everyone in the group." },
            { sel: "#cloudUndoBtn", label: "Undo", text: "Drops your changes; the data goes back to how it was." }
          ],
          after: async (h) => { await h.js(() => document.getElementById("cloudSaveBtn").click()); await until(h, () => !document.getElementById("cloudBar")); } },
        { title: "A member’s change waits for you", text: "A member who changes what the admin changed needs the admin’s approval: their request pops up in the admin’s app.",
          go: async (h) => { await srv("request", { index: 0, field: "lenderName", value: "Harbor Point Capital Partners", reason: "The full name on the assignment letter" });
            await until(h, () => !!document.querySelector("#cloudReqModal [data-req]"), null, 30000); await h.wait(500); },
          shot: "#cloudReqModal > div",
          marks: [
            { sel: "#cloudReqModal [data-req] b", label: "Who and when", text: "The member who asked, and when." },
            { sel: "#cloudReqModal [data-req] table", label: "The change", text: "What, now, and their change." },
            { sel: "#cloudReqModal [data-rej]", label: "Turn down", text: "Asks for an optional note for them; nothing changes." },
            { sel: "#cloudReqModal [data-apr]", label: "Approve", text: "Their change takes effect for everyone." },
            { sel: "#cloudReqModal [data-cm-btns] button", label: "Close", text: "Decide later (menu → Requests)." }
          ],
          after: async (h) => { await h.js(() => document.querySelector("#cloudReqModal [data-apr]").click()); await until(h, () => /Approved\./.test(document.getElementById("cloudReqModal").textContent));
            await h.js(() => document.querySelector("#cloudReqModal [data-cm-btns] button").click()); await h.wait(400); } }
      ] },
    { id: "members", title: "Members and codes (the admin)", intro: "Who is in the group and what they can do, and the admin’s two codes.",
      steps: [
        { title: "Members and codes", text: "Menu → Members and codes. People join by asking from the sign-in screen; here you set what each can do, or remove them.",
          go: async (h) => { await menu(h, "members"); await until(h, () => !!document.querySelector('[data-role="ed@co.com"]')); await h.wait(300); },
          shot: modal("Members and codes"),
          marks: [
            { sel: modal("Members and codes") + ' tr:has-text("op@co.com")', label: "The admin", text: "The group’s one admin." },
            { sel: '[data-role="ed@co.com"]', label: "Can", text: "Editor (can change data) or View only. It takes effect in their app at once." },
            { sel: '[data-rm="ed@co.com"]', label: "Remove", text: "Takes them out of the group (it asks first). Their app says so." },
            { sel: modal("Members and codes") + ' span:has-text("confirmed the email")', label: "Not signed in yet", text: "Approved, but hasn’t confirmed the email and signed in yet." },
            { sel: "#cmAppr", label: "Approval code", text: "Typed on a member’s screen to approve on the spot a change to what you changed." },
            { sel: "#cmOff", label: "Offline code", text: "Lets you keep changing data on your own computer with no connection." },
            { sel: "#cmCodes", label: "Save the codes", text: "At least 6 characters each; an empty box keeps that code as it is." },
            { sel: btn("Members and codes", "Close"), label: "Close", text: "Closes the screen." }
          ],
          after: async (h) => { await h.fill("#cmAppr", "approve-2026", { change: false }); await h.fill("#cmOff", "offline-2026", { change: false }); await h.js(() => document.getElementById("cmCodes").click()); await h.wait(1500); await closeModal(h, "Members and codes"); } }
      ] },
    { id: "history", title: "Change history", intro: "Every change to the group’s data: who made it, when, and why.",
      steps: [
        { title: "Change history", text: "Menu → Change history. Newest first; type in the box to find a name, a property or a reason.",
          go: async (h) => { await menu(h, "history"); await until(h, () => !!document.querySelector("#chList table")); await h.fill("#chFind", "Whitewater"); await h.wait(500); },
          shot: modal("Change history"),
          marks: [
            { sel: "#chFind", label: "Find", text: "Shows only the changes with these words." },
            { sel: "#chList th", nth: 0, label: "When", text: "Date and time of the change." },
            { sel: "#chList th", nth: 1, label: "Who", text: "Who made it — and who approved it, for a member’s change the admin approved. “The app” for the app’s own work." },
            { sel: "#chList td .text-slate-400", label: "Approved by", text: "A member’s change the admin approved names them both.", optional: true },
            { sel: "#chList th", nth: 2, label: "What", text: "The property or loan, and the field." },
            { sel: "#chList th", nth: 3, label: "Before", text: "The value before." },
            { sel: "#chList th", nth: 4, label: "After", text: "The value after." },
            { sel: "#chList th", nth: 5, label: "Why", text: "The reason typed when it was saved." },
            { sel: btn("Change history", "Older changes"), label: "Older changes", text: "Loads the next 200 older changes." },
            { sel: btn("Change history", "Close"), label: "Close", text: "Closes the screen." }
          ],
          after: async (h) => { await closeModal(h, "Change history"); } }
      ] },
    { id: "backups", title: "Daily backups (the admin)", intro: "A backup of the group’s data is taken every day and kept 30 days.",
      steps: [
        { title: "The backups", text: "Menu → Daily backups: one line per day.",
          go: async (h) => { await menu(h, "backups"); await until(h, () => document.querySelectorAll("[data-day]").length >= 1); await h.wait(300); },
          shot: modal("Daily backups"),
          marks: [
            { sel: "[data-day]", nth: 0, label: "Put this day back", text: "The group’s data goes back to how it was that day, for everyone (asks why first)." },
            { sel: modal("Daily backups") + ' span:has-text("empty")', label: "Empty", text: "Taken before the group had data — nothing to put back.", optional: true },
            { sel: btn("Daily backups", "Close"), label: "Close", text: "Closes the screen." }
          ] },
        { title: "Putting a day back", text: "Type why and click “Put it back”. Every change it makes is in the change history with your reason.",
          go: async (h) => { await h.js(() => document.querySelector("[data-day]").click()); await until(h, () => !!document.getElementById("cloudAskIn")); await h.wait(300); },
          shot: 'div.fixed.inset-0 > div:has(#cloudAskIn)',
          marks: [
            { sel: "#cloudAskIn", label: "Why", text: "Required; kept in the change history." },
            { sel: 'div.fixed.inset-0 > div:has(#cloudAskIn) [data-cm-btns] button:text-is("Cancel")', label: "Cancel", text: "Nothing changes." },
            { sel: 'div.fixed.inset-0 > div:has(#cloudAskIn) [data-cm-btns] button:text-is("Put it back")', label: "Put it back", text: "Puts the day back for everyone." }
          ],
          after: async (h) => { await h.js(() => { const b = [...document.querySelectorAll("div.fixed.inset-0 [data-cm-btns] button")].find(x => x.textContent === "Cancel"); if (b) b.click(); }); await h.wait(300); await closeModal(h, "Daily backups"); } }
      ] },
    { id: "groups", title: "Groups (the maintainer)", intro: "The maintainer sees every group from the menu too, when they are also in a group.",
      steps: [
        { title: "Groups", text: "Menu → Groups (only the maintainer has it): every group, its admin and how many people; and a new group.",
          go: async (h) => { await menu(h, "groups"); await until(h, () => !!document.getElementById("cgCreate")); await h.wait(300); },
          shot: modal("Groups"),
          marks: [
            { sel: modal("Groups") + ' tr:has-text("Living Residential")', label: "A group", text: "The group, its admin and how many people." },
            { sel: "[data-gadmin]", nth: 0, label: "New admin…", text: "Makes someone else its admin; the old admin stays as an editor." },
            { sel: "#cgName", label: "New group", text: "The company’s name." },
            { sel: "#cgAdmin", label: "Its admin’s email", text: "Who will run it." },
            { sel: "#cgAdminName", label: "Admin’s full name", text: "Their name." },
            { sel: "#cgCreate", label: "Create", text: "Makes the group; its admin then creates an account and only confirms the email." },
            { sel: btn("Groups", "Close"), label: "Close", text: "Closes the screen." }
          ],
          after: async (h) => { await closeModal(h, "Groups"); } }
      ] },
    { id: "offline", title: "Offline", intro: "With no connection the app keeps the last picture of the group’s data, view only.",
      steps: [
        { title: "Offline — view only", text: "When the shared database can’t be reached, a banner says so and the chip turns amber. You can look at everything; changes can’t be saved until the connection is back — it reconnects by itself.",
          go: async (h) => { await srv("down"); await until(h, () => /Offline/.test((document.getElementById("cloudBanner") || {}).textContent || ""), null, 30000); await h.wait(500); await h.top(); },
          shot: "view",
          marks: [
            { sel: "#cloudChip", label: "Offline", text: "The chip says “offline” (amber dot)." },
            { sel: "#cloudBanner", label: "The banner", text: "What offline means: the last picture of the data, view only." },
            { sel: '#cloudBanner [data-cloud-banner="offline"]', label: "Use my offline code", text: "Only the admin: keep changing data while offline." }
          ] },
        { title: "The offline code", text: "The admin types the offline code (set in Members and codes): changes are kept on this computer, each with its reason, and go up when the connection is back.",
          go: async (h) => { await h.js(() => document.querySelector('#cloudBanner [data-cloud-banner="offline"]').click()); await until(h, () => !!document.getElementById("coCode")); await h.wait(300); },
          shot: modal("Use my offline code"),
          marks: [
            { sel: "#coCode", label: "Offline code", text: "The code you set in Members and codes." },
            { sel: btn("Use my offline code", "Cancel"), label: "Cancel", text: "Stay view only." },
            { sel: btn("Use my offline code", "Unlock"), label: "Unlock", text: "You can change data offline; the banner says how many changes wait to go up." }
          ],
          after: async (h) => { await closeModal(h, "Use my offline code"); await srv("up"); await until(h, () => !document.getElementById("cloudBanner"), null, 30000); } }
      ] },
    { id: "members-view", title: "As an editor, and view only", intro: "What a member who isn’t the admin sees.",
      steps: [
        { title: "The admin’s approval is needed", text: "An editor (here Eddie) changes what the admin changed: Save asks for the admin’s approval. The admin can type the approval code right there, or Eddie sends it to them.",
          go: async (h) => { await signOut(h); await signIn(h, "ed@co.com"); await waitApp(h);
            await personEdit(h, 0, "lenderName", "Harbor Point Capital LLC"); await until(h, () => !!document.getElementById("cloudBar"));
            await h.fill("#cloudReason", "Spelling of the lender's name", { change: false }); await h.js(() => document.getElementById("cloudSaveBtn").click());
            await until(h, () => !!document.getElementById("cloudApproveCode")); await h.wait(400); },
          shot: modal("The admin's approval is needed"),
          marks: [
            { sel: modal("The admin's approval is needed") + " table", label: "The change", text: "What, its value now, and the change." },
            { sel: "#cloudApproveCode", label: "Approval code", text: "The admin types their code here (on Eddie’s screen) to approve it now." },
            { sel: btn("The admin's approval is needed", "Undo my change"), label: "Undo my change", text: "Drops it." },
            { sel: btn("The admin's approval is needed", "Send to Operator"), label: "Send to the admin", text: "It pops up in the admin’s app. The current value stays until they approve; you get a note when they decide." },
            { sel: btn("The admin's approval is needed", "Approve with the code"), label: "Approve with the code", text: "Saves at once with the admin’s code." }
          ],
          after: async (h) => { await h.js(() => { const b = [...document.querySelectorAll("div.fixed.inset-0 [data-cm-btns] button")].find(x => x.textContent === "Undo my change"); if (b) b.click(); }); await until(h, () => !document.getElementById("cloudBar")); } },
        { title: "The editor’s menu", text: "A member’s menu has the change history and Sign out.",
          go: async (h) => { await h.home(); await h.top(); await menu(h); },
          shot: "view",
          marks: [
            { sel: "#cloudChip", label: "Editor", text: "Eddie · Editor." },
            { sel: "#cloudMenu > div", nth: 0, label: "The group", text: "The group, who you are and your role, online or offline." },
            { sel: '#cloudMenu [data-cloud="history"]', label: "Change history", text: "Every change: who, when, why." },
            { sel: '#cloudMenu [data-cloud="signout"]', label: "Sign out", text: "Back to the sign-in screen." }
          ],
          after: async (h) => { await h.js(() => { document.getElementById("cloudDD").open = false; }); } },
        { title: "View only", text: "Someone the admin made view only sees everything in the group but can’t change it: a change they try is refused and the screen goes back.",
          go: async (h) => { await signOut(h); await signIn(h, "view@co.com"); await waitApp(h); await until(h, () => /View only/.test((document.getElementById("cloudBanner") || {}).textContent || "")); await h.home(); await h.top(); },
          shot: "view",
          marks: [
            { sel: "#cloudChip", label: "View only", text: "Vera · View only." },
            { sel: "#cloudBanner", label: "The banner", text: "View only — you can see everything in the group but not change it." }
          ] }
      ] }
  ]
};

// ---- the server process (node guide/spec/cloud.js --serve <the guide's user-data folder>) -------------------------------------
if (require.main === module && process.argv[2] === "--serve") (async () => {
  const udata = process.argv[3], ready = path.join(udata, "cloud-ready.json");
  const say = (o) => { try { process.stdout.write(JSON.stringify(o) + "\n"); } catch (e) {} };
  let db = null, si = null;
  const stop = async () => { try { if (si) await si.stop(); } catch (e) {} try { if (db) await db.stop(); } catch (e) {} process.exit(0); };
  try {
    const PG = require(path.join(APP, "test", "cloud", "_pg.js"));
    if (!PG.findBin()) throw new Error("PostgreSQL isn't installed here (the shared-database pictures need it, like test/e2e/cloud-3000.e2e.js)");
    // 1. this computer's own data: the app opened once with no shared database (its built-in sample loans and properties)
    {
      const GN = process.env.GN || "/opt/node22/lib/node_modules";
      const { _electron: electron } = require(GN + "/playwright");
      const env = Object.assign({}, process.env, { LDS_CLOUD_OFF: "1", LDS_RATES_OFFLINE: "1", CLAUDE_CONFIG_DIR: path.join(udata, "claude"),
        LDS_CLAUDE_BIN: path.join(APP, "test", "fixtures", "fake-claude-push.js") });
      const app = await electron.launch({ executablePath: require(path.join(APP, "node_modules", "electron")), args: [APP, "--user-data-dir=" + udata, "--no-sandbox"], cwd: APP, env });
      const page = await app.firstWindow();
      await page.route(/^https?:\/\//, r => r.abort());
      await page.waitForSelector("tr[data-goto]", { timeout: 60000, state: "attached" });
      const docs = path.join(udata, "documents"), t0 = Date.now();
      while (Date.now() - t0 < 30000 && !(fs.existsSync(path.join(udata, "loans.json")) && fs.existsSync(docs) && fs.readdirSync(docs).length >= 20)) await new Promise(r => setTimeout(r, 500));
      await new Promise(r => setTimeout(r, 2500));
      await app.close();
    }
    // 2. the test server: PostgreSQL with the app's setup SQL, behind the stand-in for Supabase's web API
    const { startStandin } = require(path.join(APP, "test", "cloud", "standin-server.js"));
    const { createClient } = require(path.join(APP, "cloud-client.js"));
    db = await PG.start(); si = await startStandin(db);
    const acct = async (email) => { const c = createClient({ url: si.url, anonKey: si.anonKey }); await c.signUp(email, PW); await si.confirm(email); await c.signIn(email, PW); return c; };
    await si.sql("insert into app.maintainers(email) values ('maint@co.com'), ('op@co.com')");
    await si.sql("select app.make_group($1, 'op@co.com', 'Operator')", [GROUP]);
    await si.sql("select app.make_group('Livermore Partners', 'lena@livermore.example', 'Lena Park')");
    await si.sql("select app.make_group('Harbor Point Holdings', 'sam@harborpoint.example', 'Sam Ortiz')");
    const GID = (await si.sql("select id from app.groups where name = $1", [GROUP])).rows[0].id;
    await acct("maint@co.com"); await acct("op@co.com"); await acct("gil@co.com");
    await si.addMember("ed@co.com", GID, "Eddie", "editor"); await si.addMember("view@co.com", GID, "Vera", "viewer");
    const ed = await acct("ed@co.com"), vw = await acct("view@co.com");
    await ed.rpc("lds_hello", {}); await vw.rpc("lds_hello", {});
    fs.writeFileSync(ready, JSON.stringify({ url: si.url, anonKey: si.anonKey }));

    // 3. the steps' commands, one JSON line each
    const loansNow = async () => (await si.sql("select content, version from app.records where group_id = $1 and path = 'loans.json'", [GID])).rows[0];
    const cmds = {
      down: async () => { si.setDown(true); },
      up: async () => { si.setDown(false); },
      // a member's change to what the admin changed, sent to the admin as a request
      request: async (o) => { const rec = await loansNow(); const L = rec.content; L[o.index][o.field] = o.value;
        const r = await ed.rpc("lds_request", { items: [{ path: "loans.json", content: L }], reason: o.reason });
        if (!r.ok) throw new Error(r.error || "the request was refused"); },
      // the daily backups: today's, yesterday's, and one from before the group had data
      backups: async () => {
        await si.sql("select app.daily_backup()");
        await si.sql("insert into app.backups(group_id, day, records, chats, taken_at) select group_id, day - 1, records, chats, taken_at - interval '1 day' from app.backups where day = current_date on conflict do nothing");
        await si.sql("insert into app.backups(group_id, day, records, chats, taken_at) select group_id, day - 2, '{}', '[]', taken_at - interval '2 days' from app.backups where day = current_date on conflict do nothing");
      }
    };
    let buf = "";
    process.stdin.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0){ const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m = null; try { m = JSON.parse(line); } catch (e) { continue; }
      Promise.resolve().then(() => cmds[m.cmd] ? cmds[m.cmd](m) : Promise.reject(new Error("no command " + m.cmd)))
        .then(() => say({ id: m.id, ok: true }), e => say({ id: m.id, ok: false, error: String(e && e.message || e) })); } });
    process.stdin.on("end", stop);
  } catch (e) {
    try { fs.writeFileSync(ready, JSON.stringify({ error: String(e && e.message || e) })); } catch (x) {}
    await stop();
  }
})();
