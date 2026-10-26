/* Guide chapter: the shared database — signing in or creating an account, the admin starting the group, saving a change
   with a reason, members and codes, the change history and the daily backups, and the reference page for every screen
   (the sign-in window, no group yet, the maintainer, people asking to join, the menu under your name, the "Not saved
   yet" bar, the admin's approvals, members and codes, the change history, the daily backups, offline, editor and view
   only).

   The pictures come from the app signed in to a LOCAL test server — a throwaway PostgreSQL with the app's own setup SQL
   behind the stand-in for Supabase's web API (test/cloud) — never a real shared database. The group's data is the
   app's built-in sample loans; every person, email address and group name is made up.

   How it runs: env() starts this same file as a small server process (`--serve`), which first opens the app once on
   its own (no shared database) so this computer has its data to upload, then starts the test server and makes the
   accounts. The steps send it a few commands (the server going offline, a member's request, the daily backups). It
   stops when the guide's capture ends.

   The pages are taken in the order they are listed, one story: Dana asks to join; the admin (Operator) signs in for
   the first time and uploads the starting data; approves Dana and sets the codes; saves a change; Eddie (an editor)
   needs the admin's approval; the admin approves Eddie's request; the history and the backups. The reference page comes
   last and takes every screen again from there (Noa, another made-up person, asks to join and is turned down). Only
   the empty group and its upload can't be taken again: they are on "Start the group" alone. */
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
// someone else signs in: sign out, sign in as them, wait for the group's data
const signInAs = async (h, email) => { await signOut(h); await signIn(h, email); await waitApp(h); };
const closeModal = (h, title) => h.js((t) => { [...document.querySelectorAll("div.fixed.inset-0 h3")].filter(x => x.textContent === t).forEach(x => x.closest("div.fixed.inset-0").remove()); }, title);
const menu = async (h, item) => { await h.js(() => { document.getElementById("cloudDD").open = true; }); await h.wait(300); if (item){ await h.js((i) => document.querySelector('#cloudMenu [data-cloud="' + i + '"]').click(), item); await h.wait(1200); } };
const menuClose = (h) => h.js(() => { document.getElementById("cloudDD").open = false; });
// a person's own edit of a loan (the keyboard first, so it counts as theirs; then the app's own save)
const personEdit = (h, idx, field, value) => h.js(([i, f, v]) => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); return new Promise(r => setTimeout(() => r(window.LDS_cloudEditLoan(i, f, v)), 500)); }, [idx, field, value]);
// a pop-up's own buttons
const joinModal = async (h) => { await until(h, () => !!document.querySelector("#cloudJoinModal [data-join]"), null, 30000); await h.wait(500); };
const joinClose = async (h) => { await h.js(() => { const b = document.querySelector("#cloudJoinModal [data-cm-btns] button"); if (b) b.click(); }); await h.wait(400); };
const reqModal = async (h) => { await until(h, () => !!document.querySelector("#cloudReqModal [data-req]"), null, 30000); await h.wait(500); };
const reqApprove = async (h) => { await h.js(() => document.querySelector("#cloudReqModal [data-apr]").click()); await until(h, () => /Approved\./.test(document.getElementById("cloudReqModal").textContent));
  await h.js(() => document.querySelector("#cloudReqModal [data-cm-btns] button").click()); await h.wait(400); };
const clickBtn = (h, label) => h.js((l) => { const b = [...document.querySelectorAll("div.fixed.inset-0 [data-cm-btns] button")].find(x => x.textContent === l); if (b) b.click(); }, label);
// an editor's change to what the admin changed: Save asks for the admin's approval
const editorSave = async (h) => {
  await personEdit(h, 0, "lenderName", "Harbor Point Capital LLC"); await until(h, () => !!document.getElementById("cloudBar"));
  await h.fill("#cloudReason", "Spelling of the lender's name", { change: false }); await h.js(() => document.getElementById("cloudSaveBtn").click());
  await until(h, () => !!document.getElementById("cloudApproveCode")); await h.wait(400);
};
const editorUndo = async (h) => { await clickBtn(h, "Undo my change"); await until(h, () => !document.getElementById("cloudBar")); };
const approval = modal("The admin's approval is needed");
const askBox = 'div.fixed.inset-0 > div:has(#cloudAskIn)';

module.exports = {
  id: "cloud",
  waitHome: false,
  env: (udata) => {
    const r = startServer(udata);
    return { LDS_CLOUD_OFF: null, LDS_CLOUD_URL: r.url, LDS_CLOUD_ANON_KEY: r.anonKey, LDS_CLOUD_POLL_MS: "800", LDS_CLOUD_AUTO_MS: "300" };
  },
  setup: async (h) => { await signInPage(h); },
  pages: [
    // ==================================================================================================================
    { id: "sign-in", kind: "howto", group: "Shared database", title: "Sign in or create an account",
      description: "Open your group’s data with your account, ask to join as someone new, or set a new password.",
      intro: "With a shared database, your team works on one copy of the loans, properties and files, and the app opens on its sign-in window. Each person has their own account in their company’s group. The group’s admin approves everyone who asks to join.",
      sections: [
        { title: "Sign in",
          steps: [
            { text: "Type your **Email** and **Password**.",
              go: async (h) => { await signInPage(h); },
              shot: card,
              marks: [
                { sel: "#siEmail", label: "Email", text: "The email address of your account." },
                { sel: "#siPw", label: "Password", text: "Your password." },
                { sel: "#siGo", label: "Sign in", text: "Opens the app on your group’s data." }
              ] },
            { text: "Click **Sign in**. The app opens on your group’s loans, properties and files." }
          ],
          note: "Signed in, but in no group yet? The window lets you ask to join from there. See [In no group yet](ref-shared-database#in-no-group-yet)." },
        { title: "Set a new password",
          text: "If you forgot your password, the app emails you a code to set a new one.",
          steps: [
            { text: "Click **Forgot your password?**.",
              go: async (h) => { await h.js(() => document.getElementById("toForgot").click()); await h.wait(300); } },
            { text: "Type your account’s email and click **Email me a code**. A 6-digit code is sent to that address.",
              go: async (h) => { await h.fill("#fgEmail", "op@co.com"); },
              shot: card,
              marks: [
                { sel: "#fgEmail", label: "Email", text: "The email of your account." },
                { sel: "#fgSend", label: "Email me a code", text: "Sends the code." }
              ] },
            { text: "Type the code from the email, then your new password twice (at least 8 characters).",
              go: async (h) => { await h.js(() => document.getElementById("fgSend").click()); await until(h, () => !document.getElementById("fReset").classList.contains("hidden")); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#fgCode", label: "The code", text: "The 6 digits from the email." },
                { sel: "#fgPw", label: "New password", text: "At least 8 characters." },
                { sel: "#fgPw2", label: "Again", text: "The same new password." }
              ] },
            { text: "Click **Set the password and sign in**. The app opens on your group’s data.",
              after: async (h) => { await h.js(() => document.getElementById("fgBack").click()); await h.wait(300); } }
          ] },
        { title: "Create an account",
          text: "For someone new: you ask to join your organization’s group, and its admin approves you.",
          steps: [
            { text: "On the sign-in window, click **Create an account**.",
              go: async (h) => { await h.js(() => document.getElementById("toSignup").click()); await h.wait(300); } },
            { text: "Type the first 3 letters of your organization in **Organization**, then click its name in the list.",
              go: async (h) => { await h.fill("#suOrg", "Liv"); await until(h, () => document.querySelectorAll("#suSugg button").length >= 2); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#suOrg", label: "Organization", text: "The first 3 letters of its name." },
                { sel: "#suSugg", label: "Pick yours", text: "The groups whose name starts with them. Only these can be joined." }
              ] },
            { text: "Type your **Full name** and **Email**, and a password (at least 8 characters) twice." },
            { text: "Click **Sign up**. Your request goes to the group’s admin, in the app and by email.",
              go: async (h) => {
                await h.js(() => { const b = [...document.querySelectorAll("#suSugg button")].find(x => x.textContent === "Living Residential"); b.click(); });
                await h.fill("#suName", "Dana Cohen"); await h.fill("#suEmail", "dana@co.com"); await h.fill("#suPw", "dana-pw-123"); await h.fill("#suPw2", "dana-pw-123");
                await h.js(() => document.getElementById("suGo").click());
                await until(h, () => !document.getElementById("vWaiting").classList.contains("hidden")); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#wtTitle", label: "Waiting for approval", text: "Your request is with the admin." },
                { sel: "#wtText", label: "What happens next", text: "The group, its admin, and what to do once you are approved." }
              ],
              after: async (h) => { await h.js(() => document.getElementById("wtSignin").click()); await h.wait(300); await h.fill("#siEmail", ""); await h.fill("#siPw", ""); } },
            { text: "When the admin approves you, an email asks you to confirm your address. Confirm it, then sign in." }
          ],
          note: "Until the admin approves you, the sign-in window reminds you of your request, and signing in says the account isn’t ready yet." }
      ],
      next: [
        { page: "start-the-group", text: "The admin’s first sign-in: bring the starting data." },
        { page: "save-a-change", text: "Save a change for everyone in the group." },
        { page: "ref-shared-database", anchor: "signing-in", text: "Every control on the sign-in window." }
      ] },

    // ==================================================================================================================
    { id: "start-the-group", kind: "howto", group: "Shared database", title: "Start the group (admin)",
      description: "Bring the group’s starting data, the first time its admin signs in.",
      intro: "A new group has no data. Its admin uploads the starting data once: the loans, properties, documents and chats on their own computer, or a backup file. From then on, everyone in the group works on that one copy.",
      before: [
        "The group, made by the maintainer with your email as its admin. See [The maintainer](ref-shared-database#the-maintainer).",
        "Your account: **Create an account**, then the group’s name. As its admin you need no approval, only to confirm your email."
      ],
      sections: [
        { title: "Upload the starting data",
          steps: [
            { text: "Sign in. A banner under the window bar says the group has no data yet.",
              go: async (h) => { await signIn(h, "op@co.com"); await waitApp(h); await joinModal(h); await joinClose(h); await h.home(); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#cloudBanner", label: "No data yet", text: "The group is empty. A member who isn’t the admin is told the admin brings the starting data." },
                { sel: '#cloudBanner [data-cloud-banner="upload"]', label: "Upload this computer’s data", text: "Opens the upload." },
                { sel: "#cloudChip", label: "You", text: "Who is signed in, and their role. Click it for the menu." }
              ] },
            { text: "Click **Upload this computer’s data** on the banner. The window says what goes up.",
              go: async (h) => { await h.js(() => document.querySelector('#cloudBanner [data-cloud-banner="upload"]').click()); await until(h, () => /On this computer/.test((document.getElementById("cuSize") || {}).textContent || "")); await h.wait(300); },
              shot: modal("Upload this computer's data"),
              marks: [
                { sel: "#cuSize", label: "What goes up", text: "How many loans, properties and documents, and how big the files are." },
                { sel: "#cuFromBackup", label: "From a backup file", text: "Upload a backup file instead (**Data** › **Back up to a file…**, from any computer)." },
                { sel: "#cuWhy", label: "Why", text: "Kept in the change history." },
                { sel: btn("Upload this computer's data", "Not now"), label: "Not now", text: "Closes; the group stays empty." },
                { sel: "#cuGo", label: "Upload", text: "Sends it, file by file." }
              ] },
            { text: "Check the reason in **Why**, or type your own." },
            { text: "Click **Upload**. The files go up one by one, then the app opens on the group’s data. Everyone in the group sees the same, and changes reach every open app by themselves.",
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
          ],
          note: "Nothing on this computer changes. If people have asked to join already, their requests open as you sign in: click **Close** to decide later. See [Manage members and codes](manage-members)." }
      ],
      next: [
        { page: "manage-members", text: "Let people in, and choose what each can do." },
        { page: "save-a-change", text: "Save a change for everyone in the group." }
      ] },

    // ==================================================================================================================
    { id: "manage-members", kind: "howto", group: "Shared database", title: "Manage members and codes",
      description: "Let people into the group, choose what each one can do, and set your approval and offline codes.",
      intro: "The group’s admin decides who is in the group and what each person can do: **Editor** (can change data) or **View only**. The admin also sets two codes: one to approve a member’s change on the spot, and one to keep working offline.",
      before: [ "You are the group’s admin." ],
      sections: [
        { title: "Let someone join",
          steps: [
            { text: "Click your name in the window bar. Its menu has the group’s screens.",
              go: async (h) => { await srv("backups"); await menu(h); },
              shot: "view",
              marks: [
                { sel: "#cloudChip", label: "Your name", text: "With your role, and how many people ask to join." },
                { sel: '#cloudMenu [data-cloud="joins"]', label: "Asking to join", text: "People who asked to join." },
                { sel: '#cloudMenu [data-cloud="members"]', label: "Members and codes", text: "Who is in the group, and your codes." }
              ] },
            { text: "Click **Asking to join**. Each person shows with their email and when they asked.",
              go: async (h) => { await menu(h, "joins"); await joinModal(h); },
              shot: "#cloudJoinModal > div",
              marks: [
                { sel: "#cloudJoinModal [data-join] .font-semibold", label: "Who asks", text: "Their name, email and when they asked." },
                { sel: "#cloudJoinModal [data-jno]", label: "Turn down", text: "They get an email saying so." },
                { sel: "#cloudJoinModal [data-jyes]", label: "Approve", text: "They join as an editor." },
                { sel: "#cloudJoinModal [data-cm-btns] button", label: "Close", text: "Decide later: the request waits." }
              ] },
            { text: "Click **Approve**. They get an email to confirm their address, then join as an editor.",
              go: async (h) => { await h.js(() => document.querySelector("#cloudJoinModal [data-jyes]").click()); await until(h, () => /Approved\./.test(document.getElementById("cloudJoinModal").textContent)); await h.wait(300); },
              shot: "#cloudJoinModal > div",
              marks: [ { sel: "#cloudJoinModal [data-join] p", label: "Approved", text: "What happens next for them." } ],
              after: async (h) => { await joinClose(h); } }
          ],
          note: "Requests also reach you by email. Deciding in either place decides it." },
        { title: "Choose what each person can do",
          steps: [
            { text: "In the menu under your name, click **Members and codes**.",
              go: async (h) => { await menu(h, "members"); await until(h, () => !!document.querySelector('[data-role="ed@co.com"]')); await h.wait(300); },
              shot: modal("Members and codes"),
              marks: [
                { sel: '[data-role="ed@co.com"]', label: "Can", text: "Editor or View only." },
                { sel: '[data-rm="ed@co.com"]', label: "Remove", text: "Takes them out of the group." },
                { sel: modal("Members and codes") + ' span:has-text("confirmed the email")', label: "Not signed in yet", text: "Approved, but hasn’t confirmed the email and signed in yet." }
              ] },
            { text: "Under **Can**, pick **Editor** or **View only**. It takes effect in their app at once." },
            { text: "To take someone out of the group, click **Remove** and confirm. Their app says so." }
          ] },
        { title: "Set your codes",
          steps: [
            { text: "Under **Your codes**, type an **Approval code** and an **Offline code**, at least 6 characters each.",
              go: async (h) => { await h.fill("#cmAppr", "approve-2026", { change: false }); await h.fill("#cmOff", "offline-2026", { change: false }); },
              shot: modal("Members and codes") + " div.mt-5:has(#cmCodes)",
              marks: [
                { sel: "#cmAppr", label: "Approval code", text: "To approve a member’s change on their screen." },
                { sel: "#cmOff", label: "Offline code", text: "To keep changing data with no connection." },
                { sel: "#cmCodes", label: "Save the codes", text: "Saves both." }
              ] },
            { text: "Click **Save the codes**. A box left empty keeps that code as it is.",
              go: async (h) => { await h.js(() => document.getElementById("cmCodes").click()); await h.wait(1500); },
              after: async (h) => { await closeModal(h, "Members and codes"); } }
          ],
          note: "The **approval code** is what you type on a member’s screen to approve, on the spot, a change to something you changed. The **offline code** lets you keep changing data on your own computer when the shared database can’t be reached." }
      ],
      next: [
        { page: "save-a-change", text: "What a member sees when your approval is needed." },
        { page: "see-history-and-backups", text: "Who changed what, and the daily backups." },
        { page: "ref-shared-database", anchor: "members-and-codes", text: "Every control on Members and codes." }
      ] },

    // ==================================================================================================================
    { id: "save-a-change", kind: "howto", group: "Shared database", title: "Save a change",
      description: "Save what you changed for everyone in the group, with the reason why.",
      intro: "In the shared database, a change is first only on your computer. You say why, then save it for everyone in the group. The reason is kept in the change history, with your name.",
      sections: [
        { title: "Save with a reason",
          steps: [
            { text: "Change anything: a loan’s terms, a property’s profile, a document. A bar at the bottom of the window lists what isn’t saved yet.",
              go: async (h) => { await personEdit(h, 0, "lenderName", "Harbor Point Capital"); await until(h, () => !!document.getElementById("cloudBar")); } },
            { text: "Type why in the bar. Here, a loan’s lender changed.",
              go: async (h) => { await h.fill("#cloudReason", "The loan was sold to Harbor Point Capital", { change: false }); await h.wait(300); },
              shot: "#cloudBar",
              marks: [
                { sel: "#cloudBarWhat", label: "What changed", text: "Point at it for the full list." },
                { sel: "#cloudReason", label: "Why", text: "Required. Kept in the change history with your name." },
                { sel: "#cloudSaveBtn", label: "Save", text: "Saves for everyone in the group." }
              ] },
            { text: "Click **Save**, or press Enter. The change is saved for everyone and reaches every open app by itself.",
              go: async (h) => { await h.js(() => document.getElementById("cloudSaveBtn").click()); await until(h, () => !document.getElementById("cloudBar")); } }
          ],
          note: "**Undo** in the bar drops your changes: the data goes back to how it was." },
        { title: "When the admin’s approval is needed",
          text: "A member who changes something the admin changed needs the admin’s approval. Here Eddie, an editor, changes the lender the admin just changed.",
          steps: [
            { text: "Make your change, type why, and click **Save**. A window says the admin’s approval is needed.",
              go: async (h) => { await signInAs(h, "ed@co.com"); await editorSave(h); },
              shot: approval,
              marks: [
                { sel: approval + " table", label: "The change", text: "What, its value now, and your change." },
                { sel: "#cloudApproveCode", label: "Approval code", text: "Where the admin types their code." },
                { sel: btn("The admin's approval is needed", "Approve with the code"), label: "Approve with the code", text: "Saves at once with the admin’s code." },
                { sel: btn("The admin's approval is needed", "Send to Operator"), label: "Send to the admin", text: "Sends it to the admin’s app." },
                { sel: btn("The admin's approval is needed", "Undo my change"), label: "Undo my change", text: "Drops it." }
              ] },
            { text: "If the admin is with you, they type their code in **Approval code** and click **Approve with the code**. The change is saved at once." },
            { text: "If not, click **Send to** and the admin’s name (here **Send to Operator**). It pops up in their app. The current value stays until they approve, and you get a note when they decide.",
              after: async (h) => { await editorUndo(h); await signInAs(h, "op@co.com"); } }
          ] },
        { title: "Approve a member’s change (admin)",
          steps: [
            { text: "When a member sends you a change, it pops up in your app: who asked and when, why, and the change.",
              go: async (h) => { await srv("request", { index: 0, field: "lenderName", value: "Harbor Point Capital Partners", reason: "The full name on the assignment letter" }); await reqModal(h); },
              shot: "#cloudReqModal > div",
              marks: [
                { sel: "#cloudReqModal [data-req] b", label: "Who and when", text: "The member who asked, and when." },
                { sel: "#cloudReqModal [data-req] table", label: "The change", text: "What, its value now, and their change." },
                { sel: "#cloudReqModal [data-rej]", label: "Turn down", text: "Nothing changes." },
                { sel: "#cloudReqModal [data-apr]", label: "Approve", text: "Their change takes effect for everyone." }
              ] },
            { text: "Click **Approve**. Their change takes effect for everyone.",
              go: reqApprove },
            { text: "Or click **Turn down**, and add a note for them if you like. Nothing changes." }
          ],
          tip: "Click **Close** to decide later. The change waits under **Requests** in the menu under your name." }
      ],
      next: [
        { page: "see-history-and-backups", text: "Find who changed what, when and why." },
        { page: "manage-members", text: "Set the approval code." },
        { page: "ref-shared-database", anchor: "saving-a-change", text: "Every control on the bar and the approvals." }
      ] },

    // ==================================================================================================================
    { id: "see-history-and-backups", kind: "howto", group: "Shared database", title: "See the change history and backups",
      description: "Find who changed what, when and why, and put the group’s data back as it was on a day.",
      intro: "Every change to the group’s data is kept: who made it, when, and why. The admin can also put the whole group’s data back as it was on any of the last 30 days.",
      sections: [
        { title: "Find a change",
          steps: [
            { text: "Click your name in the window bar, then **Change history**. The newest changes come first.",
              go: async (h) => { await menu(h, "history"); await until(h, () => !!document.querySelector("#chList table")); } },
            { text: "Type a name, a property or a reason in the box. Only the changes with those words stay.",
              go: async (h) => { await h.fill("#chFind", "Whitewater"); await h.wait(500); },
              shot: modal("Change history"),
              marks: [
                { sel: "#chFind", label: "Find", text: "Here, a property’s name." },
                { sel: "#chList th", nth: 1, label: "Who", text: "Who made the change, and who approved it." },
                { sel: "#chList th", nth: 5, label: "Why", text: "The reason typed when it was saved." }
              ] },
            { text: "Click **Older changes** to load the next 200.",
              after: async (h) => { await closeModal(h, "Change history"); } }
          ] },
        { title: "Put a day back (admin)",
          text: "A backup of the group’s data is taken every day and kept 30 days.",
          steps: [
            { text: "In the menu under your name, click **Daily backups**. There is one line for each day.",
              go: async (h) => { await menu(h, "backups"); await until(h, () => document.querySelectorAll("[data-day]").length >= 1); await h.wait(300); },
              shot: modal("Daily backups"),
              marks: [
                { sel: "[data-day]", nth: 0, label: "Put this day back", text: "For the day on its line." },
                { sel: modal("Daily backups") + ' span:has-text("empty")', label: "Empty", text: "Taken before the group had data: nothing to put back.", optional: true }
              ] },
            { text: "Click **Put this day back** on the day you want.",
              go: async (h) => { await h.js(() => document.querySelector("[data-day]").click()); await until(h, () => !!document.getElementById("cloudAskIn")); await h.wait(300); },
              shot: askBox,
              marks: [
                { sel: "#cloudAskIn", label: "Why", text: "Required. Kept in the change history." },
                { sel: askBox + ' [data-cm-btns] button:text-is("Put it back")', label: "Put it back", text: "Puts the day back for everyone." }
              ] },
            { text: "Type why and click **Put it back**. The group’s data goes back to how it was that day.",
              after: async (h) => { await clickBtn(h, "Cancel"); await h.wait(300); await closeModal(h, "Daily backups"); } }
          ],
          warning: "Putting a day back changes the group’s data for everyone in the group. Every change it makes is in the change history, with your reason." }
      ],
      next: [
        { page: "save-a-change", text: "Every change is saved with a reason." },
        { page: "ref-shared-database", anchor: "change-history", text: "Every column of the change history." }
      ] },

    // ==================================================================================================================
    { id: "ref-shared-database", kind: "reference", group: "Reference", title: "The shared database screens",
      description: "The sign-in window, the menu under your name, the bar for unsaved changes, the admin’s and the maintainer’s screens, offline and view only.",
      intro: "With the shared database your team works on one copy of the loans, properties and files: you sign in, every change is saved with a reason, and the group’s admin decides who can change what. Each picture names its controls. Every person, email address and group in the pictures is made up.",
      sections: [
        { title: "Signing in",
          text: "With a shared database, the app opens on its sign-in window. See [Sign in or create an account](sign-in).",
          views: [
            { title: "The sign-in window",
              go: async (h) => { await signOut(h); },
              shot: "view",
              marks: [
                { sel: "#siEmail", label: "Email", text: "The email address of your account." },
                { sel: "#siPw", label: "Password", text: "Your password." },
                { sel: "#siGo", label: "Sign in", text: "Opens the app on your group’s loans, properties and files." },
                { sel: "#toSignup", label: "Create an account", text: "For someone new: asks to join your company’s group." },
                { sel: "#toForgot", label: "Forgot your password?", text: "Emails you a code to set a new password." },
                { sel: "#wMin", label: "Minimize", text: "Hides the window to the taskbar." },
                { sel: "#wClose", label: "Close", text: "Closes the app." }
              ] },
            { title: "A new password: the email",
              go: async (h) => { await h.js(() => document.getElementById("toForgot").click()); await h.wait(300); await h.fill("#fgEmail", "op@co.com"); },
              shot: card,
              marks: [
                { sel: "#fgEmail", label: "Email", text: "The email of the account whose password you forgot." },
                { sel: "#fgSend", label: "Email me a code", text: "Sends a 6-digit code. The window then asks for it." },
                { sel: "#fgBack", label: "Back to sign in", text: "Returns to the sign-in window." }
              ] },
            { title: "A new password: the code",
              go: async (h) => { await h.js(() => document.getElementById("fgSend").click()); await until(h, () => !document.getElementById("fReset").classList.contains("hidden")); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#fgMsg", label: "Sent", text: "The code is on its way (it only goes to an email that has an account)." },
                { sel: "#fgCode", label: "The code", text: "The 6 digits from the email." },
                { sel: "#fgPw", label: "New password", text: "At least 8 characters." },
                { sel: "#fgPw2", label: "Again", text: "The same new password, to be sure it’s typed right." },
                { sel: "#fgGo", label: "Set the password and sign in", text: "Saves the new password and opens your group’s data." }
              ],
              after: async (h) => { await h.js(() => document.getElementById("fgBack").click()); await h.wait(300); } },
            { title: "Create an account",
              go: async (h) => { await h.js(() => document.getElementById("toSignup").click()); await h.wait(300); await h.fill("#suOrg", "Liv");
                await until(h, () => document.querySelectorAll("#suSugg button").length >= 2); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#suOrg", label: "Organization", text: "Type the first 3 letters of its name." },
                { sel: "#suSugg", label: "Pick yours", text: "The groups whose name starts with those letters. Click yours; only these can be joined." },
                { sel: "#suName", label: "Full name", text: "Your name, as the admin and the change history will show it." },
                { sel: "#suEmail", label: "Email", text: "Your work email. The admin sees it, and the confirmation goes there." },
                { sel: "#suPw", label: "Password", text: "At least 8 characters." },
                { sel: "#suPw2", label: "Again", text: "The same password again." },
                { sel: "#suGo", label: "Sign up", text: "Sends your request to join to the group’s admin." },
                { sel: "#toSignin", label: "I have an account", text: "Back to the sign-in window." }
              ] },
            { title: "Waiting for approval",
              text: "After **Sign up** the request goes to the group’s admin, in the app and by email. When they approve it, you get an email: confirm your address from it, then sign in.",
              go: async (h) => {
                await h.js(() => { const b = [...document.querySelectorAll("#suSugg button")].find(x => x.textContent === "Living Residential"); b.click(); });
                await h.fill("#suName", "Noa Levi"); await h.fill("#suEmail", "noa@co.com"); await h.fill("#suPw", "noa-pw-123"); await h.fill("#suPw2", "noa-pw-123");
                await h.js(() => document.getElementById("suGo").click());
                await until(h, () => !document.getElementById("vWaiting").classList.contains("hidden")); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#wtTitle", label: "What happens now", text: "“Waiting for approval”. (Someone the admin already added is told to confirm their email instead.)" },
                { sel: "#wtText", label: "Who approves", text: "The group and its admin, and the next steps." },
                { sel: "#wtSignin", label: "Back to sign in", text: "The sign-in window, with your email filled in." }
              ] },
            { title: "Signing in before approval",
              text: "Until the admin approves, the sign-in window reminds you of your request, and signing in says the account isn’t ready yet.",
              go: async (h) => { await h.js(() => document.getElementById("wtSignin").click()); await h.wait(300); await h.fill("#siPw", "noa-pw-123"); await h.js(() => document.getElementById("siGo").click());
                await until(h, () => /isn't ready yet/.test(document.getElementById("siMsg").textContent)); await h.wait(300); },
              shot: card,
              marks: [
                { sel: "#siWaiting", label: "Your request", text: "Which group you asked to join, and what to do once approved." },
                { sel: "#siMsg", label: "Not ready yet", text: "Why signing in didn’t work yet." }
              ],
              after: async (h) => { await h.fill("#siEmail", ""); await h.fill("#siPw", ""); } }
          ] },
        { title: "In no group yet",
          views: [
            { text: "An account that isn’t in a group yet (say, its admin removed it) can ask to join from here.",
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
                { sel: "#ngOut", label: "Sign out", text: "Back to the sign-in window." }
              ],
              after: async (h) => { await h.js(() => document.getElementById("ngOut").click()); await signInPage(h); } }
          ] },
        { title: "The maintainer",
          text: "The maintainer looks after the shared database for every company. Each company is a group with one admin; the maintainer makes the groups and names their admins.",
          views: [
            { title: "On the sign-in window",
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
                { sel: "#fGroup button", label: "Create", text: "Makes the group. Its admin then creates an account (**Create an account**, then the group’s name) and needs no approval, only to confirm the email." },
                { sel: "#ngRetry", label: "Check again", text: "Opens the group, once the maintainer is in one." },
                { sel: "#ngOut", label: "Sign out", text: "Back to the sign-in window." }
              ],
              after: async (h) => { await h.js(() => document.getElementById("ngOut").click()); await signInPage(h); } },
            { title: "Groups, from the menu",
              text: "A maintainer who is also in a group has **Groups** in the menu under their name.",
              go: async (h) => { await signIn(h, "op@co.com"); await waitApp(h); await joinModal(h); await joinClose(h); await menu(h, "groups"); await until(h, () => !!document.getElementById("cgCreate")); await h.wait(300); },
              shot: modal("Groups"),
              marks: [
                { sel: modal("Groups") + ' tr:has-text("Living Residential")', label: "A group", text: "The group, its admin and how many people." },
                { sel: "[data-gadmin]", nth: 0, label: "New admin…", text: "Makes someone else its admin; the old admin stays as an editor." },
                { sel: "#cgName", label: "New group", text: "The company’s name." },
                { sel: "#cgAdmin", label: "Its admin’s email", text: "Who will run it." },
                { sel: "#cgAdminName", label: "Admin’s full name", text: "Their name." },
                { sel: "#cgCreate", label: "Create", text: "Makes the group. Its admin then creates an account and only confirms the email." },
                { sel: btn("Groups", "Close"), label: "Close", text: "Closes the screen." }
              ],
              after: async (h) => { await closeModal(h, "Groups"); } }
          ] },
        { title: "People asking to join",
          views: [
            { text: "The admin’s app shows people waiting to join as soon as it opens (they also got an email). **Asking to join** in the menu opens it again.",
              go: async (h) => { await menu(h, "joins"); await joinModal(h); },
              shot: "#cloudJoinModal > div",
              marks: [
                { sel: "#cloudJoinModal [data-join] .font-semibold", label: "Who asks", text: "Their name, email and when they asked." },
                { sel: "#cloudJoinModal [data-jno]", label: "Turn down", text: "They get an email saying so." },
                { sel: "#cloudJoinModal [data-jyes]", label: "Approve", text: "They get an email to confirm their address, then join as an editor. (Make them view only in Members and codes.)" },
                { sel: "#cloudJoinModal [data-cm-btns] button", label: "Close", text: "Decide later: the request waits." }
              ],
              after: async (h) => { await h.js(() => document.querySelector("#cloudJoinModal [data-jno]").click()); await until(h, () => /Turned down\./.test(document.getElementById("cloudJoinModal").textContent)); await joinClose(h); } }
          ] },
        { title: "The menu under your name",
          views: [
            { text: "Click your name in the window bar. An admin sees every screen; an editor or a viewer sees only the change history and **Sign out**.",
              go: async (h) => { await h.home(); await h.top(); await menu(h); },
              shot: "view",
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
                { sel: '#cloudMenu [data-cloud="signout"]', label: "Sign out", text: "Back to the sign-in window. Changes not saved yet are dropped (it asks first)." }
              ],
              after: menuClose }
          ] },
        { title: "Saving a change",
          text: "See [Save a change](save-a-change).",
          views: [
            { title: "Not saved yet",
              text: "**Not saved yet**: any change you make is only on this computer, in this bar, until you say why and save it.",
              go: async (h) => { await personEdit(h, 0, "lenderName", "Harbor Point Capital Group"); await until(h, () => !!document.getElementById("cloudBar")); await h.fill("#cloudReason", "Checking the lender's name", { change: false }); await h.wait(300); },
              shot: "#cloudBar",
              marks: [
                { sel: "#cloudBarWhat", label: "What changed", text: "The changes waiting (point at it for the full list)." },
                { sel: "#cloudReason", label: "Why", text: "Required. Kept in the change history with your name." },
                { sel: "#cloudSaveBtn", label: "Save", text: "Saves for everyone in the group (so does Enter)." },
                { sel: "#cloudUndoBtn", label: "Undo", text: "Drops your changes; the data goes back to how it was." }
              ],
              after: async (h) => { await h.js(() => document.getElementById("cloudUndoBtn").click()); await until(h, () => !document.getElementById("cloudBar")); } },
            { title: "A member’s change waits for the admin",
              text: "A member who changes what the admin changed needs the admin’s approval. Their request pops up in the admin’s app.",
              go: async (h) => { await srv("request", { index: 0, field: "lenderName", value: "Harbor Point Capital Partners LP", reason: "The name on the new assignment letter" }); await reqModal(h); },
              shot: "#cloudReqModal > div",
              marks: [
                { sel: "#cloudReqModal [data-req] b", label: "Who and when", text: "The member who asked, and when." },
                { sel: "#cloudReqModal [data-req] table", label: "The change", text: "What, its value now, and their change." },
                { sel: "#cloudReqModal [data-rej]", label: "Turn down", text: "Asks for an optional note for them; nothing changes." },
                { sel: "#cloudReqModal [data-apr]", label: "Approve", text: "Their change takes effect for everyone." },
                { sel: "#cloudReqModal [data-cm-btns] button", label: "Close", text: "Decide later (menu › **Requests**)." }
              ],
              after: reqApprove }
          ] },
        { title: "Members and codes",
          views: [
            { text: "The admin’s screen: who is in the group and what each person can do. People join by asking from the sign-in window. See [Manage members and codes](manage-members).",
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
              after: async (h) => { await closeModal(h, "Members and codes"); } }
          ] },
        { title: "Change history",
          views: [
            { text: "Every change to the group’s data, newest first. Type in the box to find a name, a property or a reason.",
              go: async (h) => { await menu(h, "history"); await until(h, () => !!document.querySelector("#chList table")); await h.fill("#chFind", "Whitewater"); await h.wait(500); },
              shot: modal("Change history"),
              marks: [
                { sel: "#chFind", label: "Find", text: "Shows only the changes with these words." },
                { sel: "#chList th", nth: 0, label: "When", text: "Date and time of the change." },
                { sel: "#chList th", nth: 1, label: "Who", text: "Who made it, and who approved it for a member’s change the admin approved. “The app” for the app’s own work." },
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
        { title: "Daily backups",
          text: "The admin’s screen. A backup of the group’s data is taken every day and kept 30 days.",
          views: [
            { title: "The backups",
              go: async (h) => { await menu(h, "backups"); await until(h, () => document.querySelectorAll("[data-day]").length >= 1); await h.wait(300); },
              shot: modal("Daily backups"),
              marks: [
                { sel: "[data-day]", nth: 0, label: "Put this day back", text: "The group’s data goes back to how it was that day, for everyone (it asks why first)." },
                { sel: modal("Daily backups") + ' span:has-text("empty")', label: "Empty", text: "Taken before the group had data: nothing to put back.", optional: true },
                { sel: btn("Daily backups", "Close"), label: "Close", text: "Closes the screen." }
              ] },
            { title: "Putting a day back",
              text: "Every change it makes is in the change history, with your reason.",
              go: async (h) => { await h.js(() => document.querySelector("[data-day]").click()); await until(h, () => !!document.getElementById("cloudAskIn")); await h.wait(300); },
              shot: askBox,
              marks: [
                { sel: "#cloudAskIn", label: "Why", text: "Required; kept in the change history." },
                { sel: askBox + ' [data-cm-btns] button:text-is("Cancel")', label: "Cancel", text: "Nothing changes." },
                { sel: askBox + ' [data-cm-btns] button:text-is("Put it back")', label: "Put it back", text: "Puts the day back for everyone." }
              ],
              after: async (h) => { await clickBtn(h, "Cancel"); await h.wait(300); await closeModal(h, "Daily backups"); } }
          ] },
        { title: "Offline",
          text: "With no connection, the app keeps the last picture of the group’s data, view only. It reconnects by itself.",
          views: [
            { title: "Offline: view only",
              text: "A banner says so and the chip turns amber. You can look at everything; changes can’t be saved until the connection is back.",
              go: async (h) => { await srv("down"); await until(h, () => /Offline/.test((document.getElementById("cloudBanner") || {}).textContent || ""), null, 30000); await h.wait(500); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#cloudChip", label: "Offline", text: "The chip says “offline” (amber dot)." },
                { sel: "#cloudBanner", label: "The banner", text: "What offline means: the last picture of the data, view only." },
                { sel: '#cloudBanner [data-cloud-banner="offline"]', label: "Use my offline code", text: "Only the admin: keep changing data while offline." }
              ] },
            { title: "The offline code",
              text: "The admin types the offline code (set in Members and codes). Changes are kept on this computer, each with its reason, and go up when the connection is back.",
              go: async (h) => { await h.js(() => document.querySelector('#cloudBanner [data-cloud-banner="offline"]').click()); await until(h, () => !!document.getElementById("coCode")); await h.wait(300); },
              shot: modal("Use my offline code"),
              marks: [
                { sel: "#coCode", label: "Offline code", text: "The code you set in Members and codes." },
                { sel: btn("Use my offline code", "Cancel"), label: "Cancel", text: "Stay view only." },
                { sel: btn("Use my offline code", "Unlock"), label: "Unlock", text: "You can change data offline; the banner says how many changes wait to go up." }
              ],
              after: async (h) => { await closeModal(h, "Use my offline code"); await srv("up"); await until(h, () => !document.getElementById("cloudBanner"), null, 30000); } }
          ] },
        { title: "As an editor",
          text: "What a member who isn’t the admin sees. Here Eddie is an editor.",
          views: [
            { title: "The admin’s approval is needed",
              text: "An editor changes what the admin changed: **Save** asks for the admin’s approval. The admin can type the approval code right there, or the editor sends it to them.",
              go: async (h) => { await signInAs(h, "ed@co.com"); await editorSave(h); },
              shot: approval,
              marks: [
                { sel: approval + " table", label: "The change", text: "What, its value now, and the change." },
                { sel: "#cloudApproveCode", label: "Approval code", text: "The admin types their code here (on the editor’s screen) to approve it now." },
                { sel: btn("The admin's approval is needed", "Undo my change"), label: "Undo my change", text: "Drops it." },
                { sel: btn("The admin's approval is needed", "Send to Operator"), label: "Send to the admin", text: "It pops up in the admin’s app. The current value stays until they approve; you get a note when they decide." },
                { sel: btn("The admin's approval is needed", "Approve with the code"), label: "Approve with the code", text: "Saves at once with the admin’s code." }
              ],
              after: editorUndo },
            { title: "The editor’s menu",
              text: "A member’s menu has the change history and **Sign out**.",
              go: async (h) => { await h.home(); await h.top(); await menu(h); },
              shot: "view",
              marks: [
                { sel: "#cloudChip", label: "Editor", text: "Eddie · Editor." },
                { sel: "#cloudMenu > div", nth: 0, label: "The group", text: "The group, who you are and your role, online or offline." },
                { sel: '#cloudMenu [data-cloud="history"]', label: "Change history", text: "Every change: who, when, why." },
                { sel: '#cloudMenu [data-cloud="signout"]', label: "Sign out", text: "Back to the sign-in window." }
              ],
              after: menuClose }
          ] },
        { title: "View only",
          views: [
            { text: "Someone the admin made view only sees everything in the group but can’t change it: a change they try is refused, and the screen goes back.",
              go: async (h) => { await signInAs(h, "view@co.com"); await until(h, () => /View only/.test((document.getElementById("cloudBanner") || {}).textContent || "")); await h.home(); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#cloudChip", label: "View only", text: "Vera · View only." },
                { sel: "#cloudBanner", label: "The banner", text: "View only: you can see everything in the group but not change it." }
              ] }
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
