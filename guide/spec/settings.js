/* Guide chapter: Settings & data — connecting Claude, the portfolio targets, backups and restores, Excel export and
   import, updating the app, and the reference page for the Settings menu (with the guide window and the Claude
   connection), the Data menu and the version chip.
   The pictures use the app's built-in sample loans, two made-up properties ("Sample Court" and "Sample Court East") and
   a made-up Excel workbook built from an export of two sample loans plus two made-up loans. The API key typed in one
   picture is a made-up one; the update shown downloading is a stand-in message to the app (no real update).
   The reference page is taken first: it shows the import's review before the how-to applies it, and the two made-up
   properties before "Not a duplicate". */
"use strict";
const path = require("path"), fs = require("fs");
// to the top of the page at once (the page scrolls smoothly by itself, too slowly for a picture)
const top = async (h) => { await h.js(() => { window.scrollTo({ top: 0, behavior: "instant" }); }); await h.wait(200); };
// the Settings menu is taller than a 900-pixel window (there it scrolls inside itself): to show it whole in one picture, a taller window
const tall = async (h) => { await h.ctx.setSize(h.ctx.W, 1320); await h.wait(500); await h.calm(); };
const normal = async (h) => { await h.ctx.setSize(h.ctx.W, h.ctx.H); await h.wait(400); };
const portfolio = async (h) => { await h.closeModals(); await h.home(); await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(600); await h.calm(); await top(h); };
const settings = async (h) => { await h.closeModals(); await h.click("#settingsDD > summary", { wait: 600 }); await h.js(() => { if (document.activeElement) document.activeElement.blur(); }); };
// the Settings menu scrolled to its foot (the Guide and the Claude connection), in a 900-pixel window
const settingsFoot = async (h) => { await settings(h); await h.js(() => { const p = document.querySelector("#settingsDD > div"); if (p) p.scrollTop = p.scrollHeight; }); await h.wait(300); };
const dataMenu = async (h) => { await h.closeModals(); await h.click("#dataDD > summary", { wait: 400 }); await h.page.waitForSelector("#dataRecent [data-recent]", { timeout: 10000 }).catch(() => {}); await h.wait(300); };
const confirmBox = "#confirmModal > div";
const addProperty = async (h, name) => {
  await h.click("#scopeLoanBtn", { wait: 700 }); await h.click("#addPropBtn", { wait: 400 });
  await h.fill("#addPropName", name, { change: false }); await h.click("#addPropCreate", { wait: 1200 });
  // a name like one you have asks first — "Create anyway"
  if (await h.loc("#confirmAlt").isVisible().catch(() => false)) await h.click("#confirmAlt", { wait: 1200 });
};
// a made-up workbook: an export of two sample loans, the second one's insurance escrow changed, plus a made-up loan
// (a copy of the first under a made-up name, lender and number) and a made-up loan missing its amount and rate
const workbook = async (h) => {
  const ids = [await h.loanId(/Weaver Mill/), await h.loanId(/Villages of Florence/)];
  const b64 = await h.js((ids) => {
    const wb = XLSX.read(window.LDS_exportXlsxB64(ids), { type: "base64" });
    const ws = wb.Sheets[wb.SheetNames[0]], R = XLSX.utils.decode_range(ws["!ref"]), at = (r, c) => XLSX.utils.encode_cell({ r, c });
    const rowOf = (lab) => { for (let r = R.s.r; r <= R.e.r; r++){ const c = ws[at(r, 1)]; if (c && String(c.v).trim() === lab) return r; } return -1; };
    const set = (r, c, v) => { ws[at(r, c)] = typeof v === "number" ? { t: "n", v } : { t: "s", v: String(v) }; };
    for (let r = R.s.r; r <= R.e.r; r++){ const src = ws[at(r, 2)]; if (src) ws[at(r, 4)] = Object.assign({}, src); }
    [[4, "Sample Commons (example)"], [5, "Sample Annex (example)"]].forEach(([c, nm]) => { set(2, c, nm); set(rowOf("Property Name"), c, nm); set(rowOf("Lender Name"), c, "Example Bank (made-up)"); });
    set(rowOf("Property Address"), 4, "1 Example Way, Sampletown, NJ"); set(rowOf("Loan Number"), 4, "EX-1001"); delete ws[at(rowOf("Loan ID"), 4)];
    set(rowOf("Rate Type"), 5, "Fixed");
    const ins = at(rowOf("Insurance Escrow ($/mo)"), 3), old = ws[ins] ? Number(String(ws[ins].v).replace(/[^0-9.\-]/g, "")) || 0 : 0; ws[ins] = { t: "n", v: old + 500 };
    ws["!ref"] = XLSX.utils.encode_range({ s: R.s, e: { r: R.e.r, c: 5 } });
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  }, ids);
  const f = path.join(h.ctx.UDATA, "Sample loans (made-up).xlsx"); fs.writeFileSync(f, Buffer.from(b64, "base64")); return f;
};
// the import's review, from the made-up workbook
const review = async (h) => { const f = await workbook(h); await h.js(() => { const i = document.getElementById("importFileInput"); if (i) i.value = ""; }); await h.page.setInputFiles("#importFileInput", f); await h.page.waitForSelector("#importPreview:not(.hidden)", { timeout: 15000 }); await h.wait(800); };
// the stand-in Claude is signed in while this file exists
const MARKER = (h) => path.join(h.ctx.UDATA, "claude", "signed-in.marker");
const signedIn = (h, on) => { try { if (on) fs.writeFileSync(MARKER(h), "ok"); else fs.unlinkSync(MARKER(h)); } catch (e) {} };
// the Claude connection window, opened from Settings (it checks the connection each time it opens)
const conn = async (h, want) => { await h.jsClick("#settingsClaudeBtn"); await h.page.waitForSelector(want || "#claudeSignOut, #claudeSignIn", { timeout: 15000 }); await h.wait(400); };
const connClose = async (h) => { await h.js(() => { const c = document.getElementById("claudeConnClose"); if (c) c.click(); }); await h.wait(300); };
const advanced = async (h) => { await h.js(() => { const d = document.querySelector("#claudeConnPanel details"); if (d) d.open = true; }); await h.wait(300); };
// the guide window: wait until the pictures in view have loaded
const guidePics = (h) => h.page.waitForFunction(() => [...document.querySelectorAll("#guideMain [data-guideimg] img")].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }).every(i => i.complete && i.naturalWidth), null, { timeout: 15000 }).catch(() => {});
// a stand-in message from the updater, as the app's main process sends it (no real update is fetched)
const update = (h, p) => h.app.evaluate(({ BrowserWindow }, msg) => { BrowserWindow.getAllWindows().forEach(w => { try { w.webContents.send("lds:update-status", msg); } catch (e) {} }); }, p).then(() => h.wait(400));
const chipArea = "#updateChip >> xpath=..";
// A picture of one part of the Settings menu: the window bar (which holds the menu) is made "static" for such pictures,
// and the page would then paint over the menu. Keep it in place while the picture is taken.
const pin = (h, on) => h.js((v) => { const w = document.getElementById("winbar"); if (!w) return; if (v) w.style.setProperty("position", "sticky", "important"); else w.style.removeProperty("position"); }, on !== false);

module.exports = {
  id: "settings",
  setup: async (h) => {
    await portfolio(h);
    await addProperty(h, "Sample Court");
    await addProperty(h, "Sample Court East");
    await portfolio(h);
    await h.wait(6000);   // the automatic backup after a change (taken a few seconds after it)
  },
  pages: [
    // ==================================================================================================================
    // the reference page first (see the top of the file); it is listed under Reference all the same
    { id: "ref-settings", kind: "reference", group: "Reference", title: "The Settings and Data menus",
      description: "Every control in Settings and in the Data menu, the guide window, the Claude connection and the version chip.",
      intro: "Settings is in the window bar at the top right, on every tab. The Data menu is under the tabs, on the right. Each picture names its controls. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "The Settings menu",
          views: [
            { text: "Five parts, top to bottom. Click outside the menu, or press Esc, to close it.",
              go: async (h) => { await tall(h); await portfolio(h); await settings(h); },
              shot: "view",
              marks: [
                { sel: "#settingsDD > summary", label: "Settings", text: "Opens and closes this menu." },
                { sel: "#scaleRange", label: "Display", text: "App scale: makes the whole app bigger or smaller." },
                { sel: "#settingsTargets", label: "Portfolio targets", text: "The DSCR, LTV and debt-yield targets the Portfolio page measures against." },
                { sel: "#settingsPortfolio", label: "Portfolio", text: "How many properties there are, each one by name, and any that look like duplicates." },
                { sel: "#settingsGuideBtn", label: "Open the guide", text: "Opens this guide (see below)." },
                { sel: "#settingsClaudeWrap", label: "Cloud", text: "The Claude connection for the AI features." }
              ] },
            { title: "App scale",
              text: "Everything below the window bar grows or shrinks at once, like zoom in a web browser. The window bar keeps its size, so Settings is always easy to reach. The app starts at 100% each time you open it.",
              go: async (h) => { await normal(h); await portfolio(h); await settings(h); },
              shot: "view",
              marks: [
                { sel: "#scaleReadout", label: "Size now", text: "The size the app is at." },
                { sel: "#scaleRange", label: "Slider", text: "From 50% to 200%, in steps of 5%." },
                { sel: '#scalePresets [data-scale="50"]', label: "50%", text: "Half size: the most fits on the screen." },
                { sel: '#scalePresets [data-scale="100"]', label: "100%", text: "Normal size (lit when it is the size now)." },
                { sel: '#scalePresets [data-scale="200"]', label: "200%", text: "Double size. 75%, 125% and 150% are in between." },
                { sel: "#scaleReset", label: "Reset to 100%", text: "Back to the normal size." }
              ] },
            { title: "Portfolio targets",
              text: "What the Portfolio page measures against: its tiles, the Coverage vs targets chart and the coverage table (clears / off target). Type a figure and click away, or press Tab. See [Set the portfolio targets](set-portfolio-targets).",
              go: async (h) => { await portfolio(h); await settings(h); await pin(h); },
              shot: "#settingsTargets",
              marks: [
                { sel: "#tgtDscr", label: "Minimum DSCR", text: "NOI ÷ yearly loan payments should be at least this (1.25× to start)." },
                { sel: "#tgtLtv", label: "Maximum LTV", text: "Balance ÷ value should be at most this (75% to start)." },
                { sel: "#tgtDy", label: "Minimum debt yield", text: "NOI ÷ balance should be at least this (8% to start)." },
                { sel: "#settingsTargets p", label: "Where they are used", text: "Only on the Portfolio page. The refinance’s “Can you?” limits are fixed; Underwriting sets its sizing limits for each property." }
              ] },
            { title: "Your properties",
              text: "How many properties the app counts, each one listed by name, so you can check the count against your own list. Below the list, any two properties that may be one building: the same street address, or similar names where one has no address. Here two made-up properties, “Sample Court” and “Sample Court East”, are flagged.",
              shot: "#settingsPortfolio",
              marks: [
                { sel: "#settingsPortfolio >> text=Properties", label: "Properties", text: "How many properties there are; under it, how many loans they hold." },
                { sel: "#settingsPortfolio .overflow-y-auto", label: "Every property", text: "Numbered, with the start of each one’s address. Scroll it to see them all." },
                { sel: "#settingsPortfolio [data-duprow] >> nth=0", label: "Possible duplicate", text: "The two names, and why they were flagged." },
                { sel: "#settingsPortfolio [data-notdup] >> nth=0", label: "Not a duplicate", text: "They really are two buildings: the pair isn’t flagged again." },
                { sel: "#settingsPortfolio [data-duprow] >> xpath=following-sibling::div[1]", label: "If they are one building", text: "Rename one to match the other (on its property page) and they become one property." }
              ] },
            { title: "After “Not a duplicate”",
              text: "The app remembers the pair. Data Health shows the same check.",
              go: async (h) => { await portfolio(h); await settings(h); await pin(h); await h.click("#settingsPortfolio [data-notdup] >> nth=0", { wait: 600 }); },
              shot: "#settingsPortfolio",
              marks: [ { sel: "#settingsPortfolio >> text=No duplicate properties detected", label: "No duplicates", text: "Nothing left to look at." } ],
              after: async (h) => { await pin(h, false); await h.closeModals(); } }
          ] },
        { title: "The guide",
          text: "**Open the guide** in Settings opens this guide in a window over the app, on its Overview. Esc or **×** closes it.",
          views: [
            { title: "A page",
              text: "The pages are on the left, in groups. A how-to page gets one task done, step by step; a reference page names every control on a screen.",
              go: async (h) => { await normal(h); await portfolio(h); await settingsFoot(h); await h.click("#settingsGuideBtn", { wait: 400 });
                await h.page.waitForSelector('#guideNav [data-guidepage="get-around"]', { timeout: 15000 });
                await h.click('#guideNav [data-guidepage="get-around"]', { wait: 600 }); await h.page.waitForSelector("#guideMain [data-guidetitle]", { timeout: 15000 }); await guidePics(h); await h.wait(400); },
              shot: "view",
              marks: [
                { sel: '#guideBox [data-guidepage="overview"] >> nth=0', label: "Guide", text: "Back to the Overview." },
                { sel: "#guideSearch", label: "Search the guide", text: "Finds every page, section and step with all the words you type. Ctrl K jumps here." },
                { sel: "[data-guideclose]", label: "Close", text: "Closes the guide (so does Esc)." },
                { sel: '#guideNav [data-guidepage="get-around"]', label: "The pages", text: "Every page, in its group. The page you are reading is lit." },
                { sel: "#guideMain [data-guidetitle]", label: "The page", text: "Its title, what it gets done, and what you need first." },
                { sel: "#guideToc > div", label: "On this page", text: "The page’s sections. Click one to jump to it; the one you are reading is lit." }
              ] },
            { title: "Steps and pictures",
              text: "Each step is one action. A picture shows the app where the screen changes, with numbers on what the step points at. At the foot of each page, **Next steps** and **Previous** / **Next** lead on.",
              go: async (h) => { await h.js(() => { const mn = document.getElementById("guideMain"), st = [...mn.querySelectorAll("[data-guidestep]")].find(x => x.querySelector("[data-guideimg]") && x.querySelector("[data-guidemarks]"));
                  if (st) mn.scrollTop += st.getBoundingClientRect().top - mn.getBoundingClientRect().top - 12; }); await h.wait(400); await guidePics(h); await h.wait(300); },
              shot: "view",
              marks: [
                { sel: "#guideMain [data-guidestep] [data-guidetext] >> nth=0", label: "A step", text: "What to do, and what happens then." },
                { sel: "#guideMain [data-guideimg] >> nth=0", label: "The picture", text: "The app itself. Click it to see it full size; click again, or press Esc, to go back." },
                { sel: '#guideMain [data-guideimg] [data-guidemk="1"] >> nth=0', label: "A number", text: "Point at it, or at its line in the list, and both light up with the part of the screen it marks." },
                { sel: "#guideMain [data-guidemarks] >> nth=0", label: "What each number is", text: "The same numbers, in words. With more than three, the list sits beside the picture on a wide window." }
              ] },
            { title: "Search",
              text: "Every page, section and step that has all the words you typed, with where it is. Click one to go there; Enter opens the first.",
              go: async (h) => { await h.fill("#guideSearch", "settings", { change: false }); await h.js(() => { const s = document.getElementById("guideSearch"); s.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("guideMain").scrollTop = 0; }); await h.wait(500); },
              shot: "view",
              marks: [
                { sel: "#guideSearch", label: "Search", text: "What you typed." },
                { sel: "#guideMain h1", label: "Results", text: "How many places match." },
                { sel: "#guideMain [data-guidejump] >> nth=0", label: "A result", text: "Its group, page and section, and its first words. Click to go there." }
              ],
              after: async (h) => { await h.closeModals(); } }
          ] },
        { title: "Claude connection",
          text: "Opened by **Claude connection** at the foot of Settings. See [Connect Claude](connect-claude).",
          views: [
            { title: "Connected",
              text: "The top line says whether the app can reach Claude, and how. Here it is signed in with a Claude subscription. Close the window with **×** or by clicking outside it.",
              go: async (h) => { await portfolio(h); await conn(h); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnModal h3", label: "Claude connection", text: "Your Claude subscription or an API key." },
                { sel: "#claudeConnClose", label: "Close", text: "Closes the window." },
                { sel: "#claudeConnRow", label: "State", text: "Green: connected, and how. Amber: not connected, and what to do." },
                { sel: "#claudeSignOut", label: "Sign out", text: "Disconnects your Claude subscription on this computer." },
                { sel: "#claudeConnPanel summary", label: "Advanced", text: "Use an Anthropic API key instead." }
              ] },
            { title: "Advanced — an API key",
              text: "For pay-as-you-go use at console.anthropic.com instead of a subscription. Once a key is saved, **Clear** appears beside **Save** and removes it.",
              go: advanced,
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnPanel summary", label: "Advanced", text: "Opens and closes this part." },
                { sel: "#claudeKeyInput", label: "Anthropic API key", text: "Paste the key here (it starts sk-ant-). It is hidden as you type." },
                { sel: "#claudeKeySave", label: "Save", text: "Saves the key and switches the app to use it." },
                { sel: "#claudeConnPanel details p", label: "Where it is kept", text: "Only on this computer." }
              ] },
            { title: "Not connected",
              text: "Before you connect, or after **Sign out**. The line at the top turns amber and says what is missing.",
              go: async (h) => { signedIn(h, false); await h.click("#claudeSignOut", { wait: 600 }); await h.page.waitForSelector("#claudeSignIn", { timeout: 15000 }); await h.wait(400); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnRow", label: "Not connected", text: "Says what is missing." },
                { sel: "#claudeSignIn", label: "Connect with your Claude subscription", text: "Opens a small sign-in window that takes you to your browser." },
                { sel: "#claudeSignIn >> xpath=following-sibling::p[1]", label: "How it works", text: "What happens when you click it." }
              ],
              after: async (h) => { signedIn(h, true); await connClose(h); await h.closeModals(); } }
          ] },
        { title: "The Data menu",
          text: "The **Data** button is under the tabs, on the right, on both sides of the **Whole Portfolio** / **Specific Property** switch.",
          views: [
            { text: "Backups of everything, and loans in and out of Excel. Below them, the backups the app takes by itself.",
              go: async (h) => { await portfolio(h); await dataMenu(h); },
              shot: "view",
              marks: [
                { sel: "#dataDD > summary", label: "Data", text: "Opens and closes this menu." },
                { sel: '[data-data="backup"]', label: "Back up to a file…", text: "Saves everything to one file you choose: every loan, every property’s folder (profile, assumptions, T12s, documents), every chat and your settings." },
                { sel: '[data-data="restore"]', label: "Restore from a file…", text: "Replaces everything with a backup file you pick. It asks first, and saves what you have as an automatic backup." },
                { sel: '[data-data="excel-export"]', label: "Export all loans to Excel…", text: "A workbook of every active loan." },
                { sel: '[data-data="excel-import"]', label: "Import loans from Excel…", text: "Adds or updates loans from a workbook." },
                { sel: "#dataRecent [data-recent] >> nth=0", label: "An automatic backup", text: "Why it was taken (“After: Added property …”, “After a change”, “Before Excel import”, “Before a restore”), when, and what it holds. Click to restore it." },
                { sel: '[data-data="folder"]', label: "Open folder", text: "Opens the folder with the automatic backups on your computer." }
              ] },
            { title: "Restoring a backup",
              text: "Before a restore, the app says exactly what the backup holds and what it replaces. **Restore** replaces your loans, property folders and chats, then the app reloads with the restored data.",
              go: async (h) => { await h.click("#dataRecent [data-recent] >> nth=0", { wait: 800 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Restore …?", text: "What the backup holds." },
                { sel: "#confirmText", label: "What happens", text: "What is replaced, and that your current data is saved first, as a “Before a restore” backup." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." },
                { sel: "#confirmOk", label: "Restore", text: "Restores the backup." }
              ],
              after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); await h.closeModals(); } }
          ] },
        { title: "Export to Excel",
          views: [
            { text: "Exactly what the workbook will hold: one column per active loan, one row per field, in sections. The values can’t be edited here. Removed, paid-off and archived loans aren’t exported.",
              go: async (h) => { await portfolio(h); await dataMenu(h); await h.click('[data-data="excel-export"]', { wait: 800 }); },
              shot: "#exportPreview > div",
              marks: [
                { sel: "#exportPreview h3", label: "Export to Excel", text: "A preview of the workbook." },
                { sel: "#exportSummary", label: "How many", text: "How many loans will be exported." },
                { sel: "#exportPreviewBody thead th >> nth=0", label: "Field", text: "Each row is one field of a loan, grouped in sections (the green bands)." },
                { sel: "#exportPreviewBody [data-exloan] >> nth=0", label: "A loan", text: "Untick to leave this loan out." },
                { sel: "#exportAll", label: "Select all", text: "Ticks or unticks every loan." },
                { sel: "#exportCancelBtn", label: "Cancel", text: "Closes without exporting." },
                { sel: "#exportOkBtn", label: "Export", text: "Saves the workbook (your computer’s Save window opens)." }
              ],
              after: async (h) => { await h.click("#exportCancelBtn", { wait: 300 }); } }
          ] },
        { title: "Import from Excel",
          views: [
            { title: "Before you import",
              text: "The details every loan in your sheet needs. Loans can be in rows or in columns, and small differences in the headers are fine; an export from the app always works.",
              go: async (h) => { await portfolio(h); await dataMenu(h); await h.click('[data-data="excel-import"]', { wait: 600 }); await h.click("#importCheckAgree", { wait: 300 }); },
              shot: "#importChecklist > div",
              marks: [
                { sel: "#importChecklist h3", label: "Before you import", text: "What your sheet needs." },
                { sel: "#importChecklistFields", label: "The details", text: "Every detail a loan needs." },
                { sel: "#importCheckAgree", label: "I’ve checked", text: "Tick it to turn on Choose file…" },
                { sel: "#importCheckCancel", label: "Cancel", text: "Closes without importing." },
                { sel: "#importCheckOk", label: "Choose file…", text: "Opens your computer’s Open window to pick the workbook." }
              ] },
            { title: "Review import",
              text: "Nothing has changed yet. Each loan in the workbook is a row with its status, and you can edit any cell. This made-up workbook holds an export of two sample loans (one with a changed insurance escrow) and two made-up loans, one of them incomplete.",
              go: async (h) => { await h.click("#importCheckCancel", { wait: 300 }); await review(h); },
              shot: "#importPreview > div",
              marks: [
                { sel: "#importPreview h3", label: "Review import", text: "What the workbook would do." },
                { sel: "#importSummary", label: "Counts", text: "New, updated, unchanged, and how many need attention." },
                { sel: '[data-status="0"]', label: "unchanged", text: "Matches a loan you have; nothing differs." },
                { sel: '[data-status="1"]', label: "update", text: "Matches a loan you have; the changed details will be written to it (only the details the sheet has)." },
                { sel: '[data-status="2"]', label: "new", text: "No match: it will be added." },
                { sel: '[data-status="3"]', label: "missing data", text: "Needs a detail the sheet didn’t have." },
                { sel: "#importPreviewBody td.im-flag >> nth=0", label: "Amber cell", text: "Type the missing detail here.", optional: true },
                { sel: "#importAddBtn", label: "+ Add loan", text: "Adds an empty row to fill in." },
                { sel: "#importCancelBtn", label: "Cancel", text: "Closes; nothing is imported." },
                { sel: "#importApplyBtn", label: "Resolve 1 to import", text: "Turns into **Apply import** once nothing needs attention. Apply saves an automatic backup first." }
              ],
              after: async (h) => { await h.click("#importCancelBtn", { wait: 400 }); await h.closeModals(); } }
          ] },
        { title: "The version chip",
          views: [
            { text: "At the right of the header, under the window bar. See [Update the app](update-the-app).",
              go: async (h) => { await portfolio(h); },
              shot: "view",
              marks: [
                { sel: "#loanCountLabel", label: "Property count", text: "How many properties are in the portfolio." },
                { sel: "#updateChip", label: "Version", text: "Your version. Click to check for an update: “Checking for updates…”, then “Update available…” and “Downloading update… %”. Green “Update ready — Restart” means one is downloaded; click it to restart into it." }
              ] }
          ] }
      ] },

    // ==================================================================================================================
    { id: "connect-claude", kind: "howto", group: "Settings & data", title: "Connect Claude",
      description: "Turn on the AI features with your Claude subscription, or with an Anthropic API key.",
      intro: "Claude reads each T12 a second time, writes the stories and What to push, and answers in the assistant. Connect it once on this computer. Your Claude subscription is the recommended way: nothing to install and nothing billed per use. An Anthropic API key is the other way, paid as you go.",
      before: [ "A Claude Pro or Max subscription, or an Anthropic API key from console.anthropic.com." ],
      sections: [
        { title: "Connect your Claude subscription",
          steps: [
            { text: "Click **Settings** at the top right of the window. At the foot of the menu, **Claude connection** says **Connected** or **Not set**.",
              go: async (h) => { signedIn(h, false); await portfolio(h); await conn(h, "#claudeSignIn"); await connClose(h); await portfolio(h); await settingsFoot(h); },
              shot: "view",
              marks: [
                { sel: "#settingsDD > summary", label: "Settings", text: "Opens the menu." },
                { sel: "#settingsClaudeBtn", label: "Claude connection", text: "Opens the connection window." },
                { sel: "#settingsClaudeState", label: "Not set", text: "Claude isn’t connected yet." }
              ] },
            { text: "Click **Claude connection**. Its window says what is missing.",
              go: async (h) => { await conn(h, "#claudeSignIn"); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnRow", label: "Not connected", text: "Amber, with what is missing." },
                { sel: "#claudeSignIn", label: "Connect with your Claude subscription", text: "Click it next." }
              ] },
            { text: "Click **Connect with your Claude subscription**. A small sign-in window opens and takes you to your browser." },
            { text: "Sign in to your Claude subscription in the browser. Close the small window once it says you are signed in." },
            { text: "Back in **Claude connection**, the line at the top turns green: **Connected · signed in to your Claude subscription**.",
              go: async (h) => { signedIn(h, true); await connClose(h); await conn(h, "#claudeSignOut"); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnRow", label: "Connected", text: "The AI features are on." },
                { sel: "#claudeSignOut", label: "Sign out", text: "Disconnects the subscription on this computer." }
              ] }
          ],
          note: "The assistant has the same choices under **Connection settings**, and shows them by itself when Claude isn’t connected." },
        { title: "Use an API key instead",
          text: "Without a subscription, use a key from console.anthropic.com and pay as you go.",
          steps: [
            { text: "In **Claude connection**, click **Advanced — use an Anthropic API key instead**.",
              go: advanced },
            { text: "Paste your key in **Anthropic API key**. It starts with sk-ant- and is hidden as you type.",
              go: async (h) => { await h.fill("#claudeKeyInput", "sk-ant-made-up-example-key", { change: false }); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeKeyInput", label: "Anthropic API key", text: "Your key, hidden." },
                { sel: "#claudeKeySave", label: "Save", text: "Saves it and switches the app to it." }
              ] },
            { text: "Click **Save**. The key is kept only on this computer, and the top line reads **Connected · using your Anthropic API key**.",
              go: async (h) => { await h.click("#claudeKeySave", { wait: 600 }); await h.page.waitForFunction(() => /API key/.test((document.getElementById("claudeConnRow") || {}).textContent || "") && !!document.getElementById("claudeKeyClear"), null, { timeout: 15000 }); await advanced(h); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnRow", label: "Connected", text: "Through your API key." },
                { sel: "#claudeKeyClear", label: "Clear", text: "Removes the key from this computer. The app goes back to your subscription when it is signed in." }
              ],
              after: async (h) => { await h.js(() => window.ldsShell.aiSetKey("").then(() => window.ldsShell.aiSetMode("auto"))); await connClose(h); await h.closeModals(); } }
          ],
          note: "A saved key is used for every AI feature, even with a subscription signed in. To go back to the subscription, click **Clear**, or pick **Automatic (recommended)** or **Claude subscription** in the assistant’s **Connection settings**." }
      ],
      next: [
        { page: "ask-the-assistant", text: "Ask Claude about your book." },
        { page: "use-claudes-stories", text: "Use Claude’s stories and suggestions." },
        { page: "ref-settings", anchor: "claude-connection", text: "Every control in the connection window." }
      ] },

    // ==================================================================================================================
    { id: "set-portfolio-targets", kind: "howto", group: "Settings & data", title: "Set the portfolio targets",
      description: "Choose the DSCR, LTV and debt yield the Portfolio page measures every property against.",
      intro: "The Portfolio page holds each property to three targets: a minimum DSCR, a maximum LTV and a minimum debt yield. Its tiles, the Coverage vs targets chart and the coverage table all follow them. Set them to your own standard.",
      sections: [
        { title: "Change a target",
          steps: [
            { text: "Click **Settings** at the top right of the window." },
            { text: "Under **Portfolio targets (Home)**, type a new figure in **Minimum DSCR (target)**, **Maximum LTV (target)** or **Minimum debt yield (target)**.",
              go: async (h) => { await normal(h); await portfolio(h); await settings(h); await pin(h); },
              shot: "#settingsTargets",
              marks: [
                { sel: "#tgtDscr", label: "Minimum DSCR", text: "1.25× to start." },
                { sel: "#tgtLtv", label: "Maximum LTV", text: "75% to start." },
                { sel: "#tgtDy", label: "Minimum debt yield", text: "8% to start." }
              ],
              after: async (h) => { await pin(h, false); await h.closeModals(); } },
            { text: "Click away, or press Tab. The Portfolio page measures every property against the new figure at once, and the targets are kept for next time." }
          ],
          note: "These targets are only for the Portfolio page. The refinance’s “Can you?” limits are fixed, and Underwriting sets its own sizing limits for each property." }
      ],
      next: [
        { page: "check-coverage", text: "See each property against the targets." },
        { page: "size-the-debt", text: "Underwriting’s own limits, property by property." }
      ] },

    // ==================================================================================================================
    { id: "back-up-and-restore", kind: "howto", group: "Settings & data", title: "Back up and restore",
      description: "Save everything to one file, and put it back from a file or from an automatic backup.",
      intro: "A backup is one file with everything: every loan, every property’s folder (profile, assumptions, T12s, documents), every chat and your settings. Restore it on this computer or another one. The app also keeps backups by itself, a few seconds after a change and before an Excel import or a restore.",
      sections: [
        { title: "Back up to a file",
          steps: [
            { text: "Click **Data**, under the tabs on the right.",
              go: async (h) => { await portfolio(h); await dataMenu(h); },
              shot: "view",
              marks: [
                { sel: "#dataDD > summary", label: "Data", text: "Opens the menu." },
                { sel: '[data-data="backup"]', label: "Back up to a file…", text: "Saves everything to one file." },
                { sel: '[data-data="restore"]', label: "Restore from a file…", text: "Puts a backup file back." }
              ],
              after: async (h) => { await h.closeModals(); } },
            { text: "Click **Back up to a file…**. Your computer’s Save window opens." },
            { text: "Pick a folder and click **Save**. The app says what it backed up." }
          ] },
        { title: "Restore from a file",
          steps: [
            { text: "Click **Data**, then **Restore from a file…**. Your computer’s Open window opens." },
            { text: "Pick the backup file. The app says what is in it and what it will replace." },
            { text: "Click **Restore**. The app reloads with the restored data." }
          ] },
        { title: "Restore an automatic backup",
          steps: [
            { text: "Click **Data**. Under **Recent automatic backups**, each line says why it was taken, when, and what it holds.",
              go: async (h) => { await portfolio(h); await dataMenu(h); },
              shot: "#dataDD > div",
              marks: [
                { sel: "#dataRecent [data-recent] >> nth=0", label: "An automatic backup", text: "Why it was taken, when, and what it holds. The newest is first." },
                { sel: '[data-data="folder"]', label: "Open folder", text: "The folder that holds them on your computer." }
              ] },
            { text: "Click the backup you want. The app says what it holds and what it will replace.",
              go: async (h) => { await h.click("#dataRecent [data-recent] >> nth=0", { wait: 800 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmText", label: "What happens", text: "What is replaced, and that your data now is saved first." },
                { sel: "#confirmOk", label: "Restore", text: "Restores the backup." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." }
              ],
              after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); await h.closeModals(); } },
            { text: "Click **Restore**. The app reloads with the restored data." }
          ] }
      ],
      callouts: [ { kind: "note", text: "A restore replaces your loans, every property folder and every chat. What you have just before it is saved first, as a **Before a restore** backup, so you can switch back." } ],
      next: [
        { page: "move-loans-with-excel", text: "Move loans in and out of Excel." },
        { page: "start-the-group", text: "Upload a backup file as a shared group’s starting data." },
        { page: "ref-settings", anchor: "the-data-menu", text: "Everything in the Data menu." }
      ] },

    // ==================================================================================================================
    { id: "move-loans-with-excel", kind: "howto", group: "Settings & data", title: "Move loans in and out of Excel",
      description: "Export your loans to a workbook, or add and update loans from one.",
      intro: "Export puts every active loan in an Excel workbook, one column per loan. Import reads a workbook and adds the new loans and updates the ones you already have. Nothing changes until you have reviewed the import and applied it.",
      sections: [
        { title: "Export to Excel",
          steps: [
            { text: "Click **Data**, then **Export all loans to Excel…**. A preview shows exactly what the workbook will hold.",
              go: async (h) => { await portfolio(h); await dataMenu(h); await h.click('[data-data="excel-export"]', { wait: 800 }); },
              shot: "#exportPreview > div",
              marks: [
                { sel: "#exportPreviewBody [data-exloan] >> nth=0", label: "A loan", text: "One column per loan. Untick to leave it out." },
                { sel: "#exportAll", label: "Select all", text: "Ticks or unticks every loan." },
                { sel: "#exportOkBtn", label: "Export", text: "Saves the workbook." }
              ],
              after: async (h) => { await h.click("#exportCancelBtn", { wait: 300 }); } },
            { text: "Untick any loan you want to leave out." },
            { text: "Click **Export**, then save the .xlsx file in your computer’s Save window." }
          ],
          note: "Removed, paid-off and archived loans aren’t exported. The preview can’t be edited: change a loan in the app." },
        { title: "Import from Excel",
          steps: [
            { text: "Click **Data**, then **Import loans from Excel…**. A list names the details each loan in your sheet needs.",
              go: async (h) => { await portfolio(h); await dataMenu(h); await h.click('[data-data="excel-import"]', { wait: 600 }); await h.click("#importCheckAgree", { wait: 300 }); },
              shot: "#importChecklist > div",
              marks: [
                { sel: "#importChecklistFields", label: "The details", text: "What each loan needs." },
                { sel: "#importCheckAgree", label: "I’ve checked", text: "Tick it to turn on Choose file…" },
                { sel: "#importCheckOk", label: "Choose file…", text: "Opens your computer’s Open window." }
              ] },
            { text: "Tick **I’ve checked my sheet includes these details**, then click **Choose file…** and pick the workbook." },
            { text: "Check each row’s status: **new** (it will be added), **update** (it matches a loan you have, and something differs), **unchanged**, or **missing data**. Nothing has changed yet.",
              go: async (h) => { await h.click("#importCheckCancel", { wait: 300 }); await review(h); },
              shot: "#importPreview > div",
              marks: [
                { sel: "#importSummary", label: "Counts", text: "How many of each, and how many need attention." },
                { sel: '[data-status="3"]', label: "missing data", text: "A required detail the sheet didn’t have." },
                { sel: "#importPreviewBody td.im-flag >> nth=0", label: "Amber cell", text: "Type the missing detail here.", optional: true }
              ] },
            { text: "Type the missing detail in each amber cell, or click **✕** at the end of its row to leave that loan out. Here the incomplete made-up loan is removed.",
              go: async (h) => { await h.jsClick('[data-del="3"]'); await h.wait(500); await h.js(() => { const b = document.getElementById("importPreviewBody"); if (b) b.scrollLeft = b.scrollWidth; }); await h.wait(300); },
              shot: "#importPreview > div",
              marks: [
                { sel: "#importSummary", label: "Ready", text: "1 new, 1 updated, 1 unchanged: nothing needs attention." },
                { sel: "#importPreviewBody [data-del] >> nth=0", label: "✕", text: "Removes that row from the import." },
                { sel: "#importApplyBtn", label: "Apply import (2)", text: "Imports the new and the updated loans." }
              ] },
            { text: "Click **Apply import**. The app saves an automatic backup, adds the new loans and writes the changes to the updated ones. Unchanged loans stay exactly as they are.",
              go: async (h) => { await h.click("#importApplyBtn", { wait: 1500 }); await h.wait(6000); } }
          ],
          tip: "An export from the app always imports. Loans can be in rows or in columns, and small differences in the headers are fine." },
        { title: "Undo an import",
          steps: [
            { text: "Click **Data**. The backup taken just before the import is listed in amber as **Before Excel import**.",
              go: async (h) => { await portfolio(h); await dataMenu(h); },
              shot: "#dataDD > div",
              marks: [
                { sel: "#dataRecent [data-recent]:has(.text-amber-700) >> nth=0", label: "Before Excel import", text: "Taken just before the import." },
                { sel: "#dataRecent [data-recent]:not(:has(.text-amber-700)) >> nth=0", label: "After …", text: "Taken a few seconds after a change, naming it: here the import." }
              ],
              after: async (h) => { await h.closeModals(); } },
            { text: "Click **Before Excel import**, then **Restore**. Everything goes back to how it was just before the import." }
          ] }
      ],
      next: [
        { page: "back-up-and-restore", text: "Back up everything, and restore it." },
        { page: "edit-a-loan", text: "Change a loan in the app." },
        { page: "ref-settings", anchor: "import-from-excel", text: "Every control in the export and the import." }
      ] },

    // ==================================================================================================================
    { id: "update-the-app", kind: "howto", group: "Settings & data", title: "Update the app",
      description: "Check for a new version, and restart into it.",
      intro: "The chip at the right of the header shows the version you have. Click it to check for a new one: the app downloads it by itself, then asks you to restart.",
      sections: [
        { title: "Check and update",
          steps: [
            { text: "Click the version chip at the right of the header (here **v3.0.0**). It reads **Checking for updates…**.",
              go: async (h) => { await normal(h); await portfolio(h); },
              shot: "view",
              marks: [ { sel: "#updateChip", label: "Version", text: "The version you have. Click it to check." } ] },
            { text: "If there is a new version, the chip reads **Update available…**, then **Downloading update…** with how far it is. If you are up to date, the app says so." },
            { text: "When the chip turns green and reads **Update ready — Restart**, click it. The app restarts into the new version.",
              go: async (h) => { await update(h, { state: "ready", version: "3.0.1" }); await h.calm(); },
              shot: chipArea,
              after: async (h) => { await update(h, { state: "current", version: "3.0.0" }); } }
          ],
          note: "Updates never touch your loans, files, chats or backups." }
      ],
      next: [
        { page: "back-up-and-restore", text: "Keep a backup of everything." },
        { page: "ref-settings", anchor: "the-version-chip", text: "The version chip and the header." }
      ] }
  ]
};
