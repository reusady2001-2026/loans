/* Guide chapter: Settings, Data & backups — the Settings menu (app scale, portfolio targets, the properties list and
   duplicates, the Guide, the Claude connection), the Data menu (backups, restore, Excel export and import) and the
   version chip. The pictures use the app's built-in sample loans, two made-up properties ("Sample Court" and "Sample
   Court East") and a made-up Excel workbook built from an export of two sample loans plus two made-up loans. */
"use strict";
const path = require("path"), fs = require("fs");
// to the top of the page at once (the page scrolls smoothly by itself, too slowly for a picture)
const top = async (h) => { await h.js(() => { window.scrollTo({ top: 0, behavior: "instant" }); }); await h.wait(200); };
// the Settings menu is taller than a 900-pixel window (there it scrolls inside itself): to show it whole in one picture, a taller window
const tall = async (h) => { await h.ctx.setSize(h.ctx.W, 1320); await h.wait(500); await h.calm(); };
const normal = async (h) => { await h.ctx.setSize(h.ctx.W, h.ctx.H); await h.wait(400); };
const portfolio = async (h) => { await h.closeModals(); await h.home(); await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(600); await h.calm(); await top(h); };
const settings = async (h) => { await h.closeModals(); await h.click("#settingsDD > summary", { wait: 600 }); await h.js(() => { if (document.activeElement) document.activeElement.blur(); }); };
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
const MARKER = (h) => path.join(h.ctx.UDATA, "claude", "signed-in.marker");

module.exports = {
  id: "settings",
  title: "Settings, Data & backups",
  intro: "The Settings menu (app size, portfolio targets, your properties, this guide, the Claude connection), the Data menu (backups, restore, Excel export and import) and the version chip.",
  setup: async (h) => {
    await portfolio(h);
    await addProperty(h, "Sample Court");
    await addProperty(h, "Sample Court East");
    await portfolio(h);
    await h.wait(6000);   // the automatic backup after a change (taken a few seconds after it)
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "menu", title: "The Settings menu", intro: "Settings is at the top right of the window, on every tab.",
      before: async (h) => { await tall(h); },
      steps: [
        { title: "Open Settings", cover: true,
          text: "Click Settings in the window bar. The menu has five parts, top to bottom: Display (App scale), Portfolio targets, Portfolio (your properties), Guide and Cloud (the Claude connection). Click outside the menu or press Esc to close it.",
          go: async (h) => { await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#settingsDD > summary", label: "Settings", text: "Opens and closes this menu." },
            { sel: "#scaleRange", label: "App scale", text: "Makes the whole app bigger or smaller (next step)." },
            { sel: "#settingsTargets", label: "Portfolio targets", text: "The DSCR, LTV and debt-yield targets the Portfolio page measures against." },
            { sel: "#settingsPortfolio", label: "Portfolio", text: "How many properties there are, each one by name, and any that look like duplicates." },
            { sel: "#settingsGuide", label: "Guide", text: "Opens this guide." },
            { sel: "#settingsClaudeWrap", label: "Cloud", text: "The Claude connection for the AI features." }
          ] },
        { title: "App scale",
          text: "Drag the slider or click a size: everything below the window bar grows or shrinks at once, like zoom in a web browser. The window bar stays the same size so Settings is always easy to reach. Reset to 100% puts it back; the app also starts at 100% each time you open it.",
          go: async (h) => { await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#scaleReadout", label: "Size now", text: "The size the app is at." },
            { sel: "#scaleRange", label: "Slider", text: "50% to 200%, in steps of 5%." },
            { sel: '#scalePresets [data-scale="50"]', label: "50%", text: "Half size — the most fits on the screen." },
            { sel: '#scalePresets [data-scale="100"]', label: "100%", text: "Normal size (highlighted when it is the size now)." },
            { sel: '#scalePresets [data-scale="200"]', label: "200%", text: "Double size. 75%, 125% and 150% are in between." },
            { sel: "#scaleReset", label: "Reset to 100%", text: "Back to the normal size." }
          ] },
        { title: "Portfolio targets",
          text: "The three targets the Portfolio page measures against: the tiles, the Coverage vs targets chart and the coverage table (clears / off target). Type a new figure and click away (or press Tab) — the Portfolio page updates at once. They are saved for next time. They are not the refinance’s lending limits, and Underwriting sets its own sizing limits per property.",
          go: async (h) => { await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#tgtDscr", label: "Minimum DSCR", text: "NOI ÷ yearly loan payments should be at least this (1.25× to start)." },
            { sel: "#tgtLtv", label: "Maximum LTV", text: "Balance ÷ value should be at most this (75% to start)." },
            { sel: "#tgtDy", label: "Minimum debt yield", text: "NOI ÷ balance should be at least this (8% to start)." },
            { sel: "#settingsTargets p", label: "Where they are used", text: "A reminder of what these targets are for." }
          ] },
        { title: "Your properties and duplicates",
          text: "How many properties the app counts, with every one listed by name (and the start of its address) so you can check the count against your own list. Scroll the list to see them all. Below it, the app names any two properties that may be one building: the same street address, or similar names where one has no address. Here two made-up properties, “Sample Court” and “Sample Court East”, are flagged.",
          go: async (h) => { await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#settingsPortfolio >> text=Properties", label: "Properties", text: "How many properties there are; under it, how many loans they hold." },
            { sel: "#settingsPortfolio .overflow-y-auto", label: "Every property", text: "Numbered, with the start of each one’s address. Scroll it." },
            { sel: "#settingsPortfolio [data-duprow] >> nth=0", label: "Possible duplicate", text: "The two names, and why they were flagged." },
            { sel: "#settingsPortfolio [data-notdup] >> nth=0", label: "Not a duplicate", text: "They really are two buildings: the pair isn’t flagged again (next step)." },
            { sel: "#settingsPortfolio [data-duprow] >> xpath=following-sibling::div[1]", label: "If they are one building", text: "Rename one to match the other (on its property page) and they become one property." }
          ] },
        { title: "Not a duplicate",
          text: "After Not a duplicate the app remembers the pair and says no duplicates are left. Data Health shows the same check.",
          go: async (h) => { await portfolio(h); await settings(h); await h.click("#settingsPortfolio [data-notdup] >> nth=0", { wait: 600 }); },
          shot: "view",
          marks: [
            { sel: "#settingsPortfolio >> text=No duplicate properties detected", label: "No duplicates", text: "Nothing left to look at." }
          ] },
        { title: "The Guide",
          text: "Open the guide opens this guide in a window over the app.",
          go: async (h) => { await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#settingsGuideBtn", label: "Open the guide", text: "Opens the guide (next steps)." }
          ],
          after: async (h) => { await h.closeModals(); await normal(h); } },
        { title: "The guide window",
          text: "The guide opens on its contents: one card per chapter — a tab or screen of the app (the pictures in this chapter are taken on a wide window). Click a card, or a chapter on the left, to open it. Type in the search box to find a button or a word anywhere in the guide. Esc or × closes it.",
          go: async (h) => { await h.ctx.setSize(1920, 1000); await h.wait(500); await portfolio(h); await settings(h); await h.click("#settingsGuideBtn", { wait: 400 }); await h.page.waitForSelector("#guideMain [data-guidech]", { timeout: 15000 }); await h.wait(800); },
          shot: "view",
          marks: [
            { sel: "#guideCrumb", label: "Where you are", text: "The chapter and the topic you are reading." },
            { sel: "#guideSearch", label: "Search", text: "Finds every step that mentions what you type." },
            { sel: "[data-guideclose]", label: "Close", text: "Closes the guide (so does Esc)." },
            { sel: "#guideNav [data-guidech] >> nth=0", label: "Chapters", text: "Every chapter; the open one lists its topics under it." },
            { sel: "#guideMain [data-guidech] >> nth=0", label: "A chapter", text: "Click to open it: the whole chapter on one page." }
          ] },
        { title: "A chapter — one page you scroll",
          text: "A chapter opens as one long page: every topic is a heading, and every step follows under it — its words, then a picture of the app with numbered markers, and beside the picture what each number is and does (under it on a narrow window). Scroll down to read on; there is no Back or Next. Pictures load as they come into view.",
          go: async (h) => { await h.click("#guideMain [data-guidech] >> nth=0", { wait: 600 }); await h.page.waitForSelector("#guideMain [data-guidestep]", { timeout: 15000 }); await h.page.waitForFunction(() => { const i = document.querySelector("#guideMain [data-guideimg] img"); return !!(i && i.complete && i.naturalWidth); }, null, { timeout: 15000 }).catch(() => {}); await h.wait(600); },
          shot: "view",
          marks: [
            { sel: "#guideMain h2", label: "The chapter", text: "Its name, what it covers, and how many topics and steps it has." },
            { sel: "#guideMain [data-guidehome]", label: "All chapters", text: "Back to the contents." },
            { sel: "#guideMain h3[data-guidetp] >> nth=0", label: "A topic", text: "Each topic is a heading on the page, numbered." },
            { sel: "#guideMain [data-guidestep] h4 >> nth=0", label: "A step", text: "What this step shows, in words." },
            { sel: "#guideMain [data-guideimg] >> nth=0", label: "The picture", text: "The real app, with a numbered marker on every button and box. Click it to see it full size." },
            { sel: "#guideMain [data-guidemarks] >> nth=0", label: "What each number does", text: "Beside the picture: the same numbers, in words." },
            { sel: "#guideNav button[data-guidetp] >> nth=0", label: "The topics", text: "The chapter's topics. The one you are reading is lit, and it follows you as you scroll." }
          ] },
        { title: "Jump to a topic",
          text: "Click a topic on the left and the page scrolls to it; the topic stays lit, and “Where you are” at the top says it too.",
          go: async (h) => { await h.click("#guideNav button[data-guidetp] >> nth=2", { wait: 800 }); await h.page.waitForFunction(() => { const i = [...document.querySelectorAll("#guideMain [data-guideimg] img")].find(x => { const r = x.getBoundingClientRect(); return r.top > 0 && r.top < window.innerHeight; }); return !i || (i.complete && i.naturalWidth); }, null, { timeout: 15000 }).catch(() => {}); await h.wait(600); },
          shot: "view",
          marks: [
            { sel: '#guideNav button[data-guidetp][data-on="1"]', label: "The topic picked", text: "Lit while you read it." },
            { sel: "#guideCrumb", label: "Where you are", text: "The chapter › the topic." },
            { sel: "#guideMain h3[data-guidetp] >> nth=2", label: "Its heading", text: "The page has scrolled to the topic." }
          ] },
        { title: "Point at a number",
          text: "Point at a number — on the picture or in the list beside it — and both light up, with the part of the screen it marks.",
          go: async (h) => {
            await h.js(() => { const mn = document.getElementById("guideMain"); const st = [...mn.querySelectorAll("[data-guidestep]")].find(x => { const r = x.getBoundingClientRect(), m = mn.getBoundingClientRect(); return r.top >= m.top - 2 && x.querySelector("[data-guidemarks] li"); });
              if (st){ st.setAttribute("data-guideshot", "1"); mn.scrollTop += st.getBoundingClientRect().top - mn.getBoundingClientRect().top - 8; } });
            await h.page.waitForFunction(() => { const i = document.querySelector("#guideMain [data-guideshot] [data-guideimg] img"); return !i || (i.complete && i.naturalWidth); }, null, { timeout: 15000 }).catch(() => {});
            await h.hover('#guideMain [data-guideshot] [data-guidemarks] li[data-guidemk="1"]'); await h.wait(400);
          },
          after: async (h) => { await h.page.mouse.move(5, 5); await h.wait(200); },
          shot: "view",
          marks: [
            { sel: '#guideMain [data-guideshot] [data-guidemarks] li[data-guidemk="1"]', label: "A number in the list", text: "Pointed at: it lights up…" },
            { sel: '#guideMain [data-guideshot] [data-guidebox="1"]', label: "…and its box", text: "…and so does the part of the picture it marks." }
          ] },
        { title: "Full size",
          text: "Click a picture to see it full size over the guide. Click it again, or press Esc, to go back.",
          go: async (h) => { await h.js(() => { const i = document.querySelector("#guideMain [data-guideshot] [data-guideimg]") || [...document.querySelectorAll("#guideMain [data-guideimg]")].find(x => { const r = x.getBoundingClientRect(); return r.top > 0 && r.top < window.innerHeight; }); if (i) i.click(); }); await h.page.waitForFunction(() => { const i = document.querySelector("#guideZoom img"); return !!(i && i.complete && i.naturalWidth); }, null, { timeout: 15000 }).catch(() => {}); await h.wait(400); },
          after: async (h) => { await h.js(() => { const z = document.getElementById("guideZoom"); if (z) z.classList.add("hidden"); document.querySelectorAll("[data-guideshot]").forEach(x => x.removeAttribute("data-guideshot")); }); await h.wait(300); },
          shot: "view",
          marks: [
            { sel: "#guideZoom img", label: "Full size", text: "The picture at its own size; scroll to see all of it. Click or Esc to close." }
          ] },
        { title: "Search the guide",
          text: "Type in the search box: every step that mentions all the words you typed is listed, with its chapter and topic. Click one to jump to it.",
          go: async (h) => { await h.js(() => { document.getElementById("guideMain").scrollTop = 0; }); await h.fill("#guideSearch", "backup", { change: false }); await h.js(() => { const s = document.getElementById("guideSearch"); s.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("guideMain").scrollTop = 0; }); await h.wait(500); },
          shot: "view",
          marks: [
            { sel: "#guideSearch", label: "Search", text: "What you typed." },
            { sel: "#guideMain h2", label: "Results", text: "How many steps match." },
            { sel: "#guideMain [data-guidejump] >> nth=0", label: "A result", text: "Its chapter and topic, and the step. Click to jump to it." }
          ] },
        { title: "A search result",
          text: "Its chapter opens as its page, scrolled to that step, which lights up for a moment. Read on from there, or scroll back up.",
          go: async (h) => {
            const key = await h.js(() => { const b = document.querySelector("#guideMain [data-guidejump]"); return b ? b.getAttribute("data-guidejump") : null; });
            await h.click("#guideMain [data-guidejump] >> nth=0", { wait: 800 });
            await h.js((k) => { const x = document.querySelector('#guideMain [data-guidestep="' + k + '"]'); if (x) x.setAttribute("data-guideshot", "1"); }, key);
            await h.page.waitForFunction(() => { const i = document.querySelector("#guideMain [data-guideshot] [data-guideimg] img"); return !i || (i.complete && i.naturalWidth); }, null, { timeout: 15000 }).catch(() => {}); await h.wait(500);
          },
          shot: "view",
          marks: [
            { sel: "#guideMain [data-guideshot] h4", label: "The step found", text: "The page is scrolled to it." },
            { sel: "#guideCrumb", label: "Where you are", text: "Its chapter and topic." },
            { sel: '#guideNav button[data-guidetp][data-on="1"]', label: "Its topic", text: "Lit on the left." }
          ],
          after: async (h) => { await h.js(() => { document.querySelectorAll("[data-guideshot]").forEach(x => x.removeAttribute("data-guideshot")); }); await h.closeModals(); await normal(h); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "claude", title: "Claude connection", intro: "Connect Claude for the AI features: the assistant, the second reading of each T12, and the stories in What to push.",
      before: async (h) => { await tall(h); },
      steps: [
        { title: "Open Claude connection",
          text: "At the bottom of Settings is Claude connection, with its state beside it (Connected, or what is missing). Click it to open the connection window.",
          go: async (h) => { await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#settingsClaudeBtn", label: "Claude connection", text: "Opens the connection window (next step)." },
            { sel: "#settingsClaudeState", label: "State", text: "Connected — or not." }
          ] },
        { title: "Connected",
          text: "The top line says whether the app can reach Claude and how. Here it is signed in with a Claude subscription — no API key and nothing per use. Sign out disconnects the subscription. Advanced lets you use an Anthropic API key instead (next step). Close with × or by clicking outside the window.",
          go: async (h) => { await h.jsClick("#settingsClaudeBtn"); await h.page.waitForSelector("#claudeSignOut, #claudeSignIn", { timeout: 15000 }); await h.wait(400); },
          shot: "#claudeConnModal > div",
          marks: [
            { sel: "#claudeConnModal h3", label: "Claude connection", text: "Your Claude subscription or an API key." },
            { sel: "#claudeConnClose", label: "Close", text: "Closes the window." },
            { sel: "#claudeConnRow", label: "State", text: "Green: connected, and how. Amber: not connected, and what to do." },
            { sel: "#claudeSignOut", label: "Sign out", text: "Disconnects your Claude subscription on this computer (last step shows the result)." },
            { sel: "#claudeConnPanel summary", label: "Advanced", text: "Use an Anthropic API key instead (next step)." }
          ] },
        { title: "Advanced — an API key",
          text: "Open Advanced to use an Anthropic API key instead of a subscription: paste the key (it starts sk-ant-) and click Save. You then pay as you go at console.anthropic.com. The key is kept only on this computer. Once a key is saved, a Clear button removes it.",
          go: async (h) => { await h.js(() => { const d = document.querySelector("#claudeConnPanel details"); if (d) d.open = true; }); await h.wait(300); },
          shot: "#claudeConnModal > div",
          marks: [
            { sel: "#claudeConnPanel summary", label: "Advanced", text: "Opens and closes this part." },
            { sel: "#claudeKeyInput", label: "Anthropic API key", text: "Paste the key here. It is hidden as you type." },
            { sel: "#claudeKeySave", label: "Save", text: "Saves the key and uses it." },
            { sel: "#claudeConnPanel details p", label: "Where it is kept", text: "Only on this computer." }
          ] },
        { title: "Not connected",
          text: "After Sign out (or before you have connected) the window offers Connect with your Claude subscription: a small sign-in window opens and takes you to your browser to sign in to your Claude Pro or Max subscription. Close it once it says you are signed in — the window here then turns green.",
          go: async (h) => { try { fs.unlinkSync(MARKER(h)); } catch (e) {} await h.click("#claudeSignOut", { wait: 600 }); await h.page.waitForSelector("#claudeSignIn", { timeout: 15000 }); await h.wait(400); },
          shot: "#claudeConnModal > div",
          marks: [
            { sel: "#claudeConnRow", label: "Not connected", text: "Says what is missing." },
            { sel: "#claudeSignIn", label: "Connect with your Claude subscription", text: "Opens the sign-in window." },
            { sel: "#claudeSignIn >> xpath=following-sibling::p[1]", label: "How it works", text: "What happens when you click Connect." }
          ],
          after: async (h) => { try { fs.writeFileSync(MARKER(h), "ok"); } catch (e) {} await h.click("#claudeConnClose", { wait: 300 }).catch(() => {}); await h.closeModals(); await normal(h); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "data", title: "The Data menu: backups and Excel", intro: "The Data button under the tabs: back up and restore everything, and move loans in and out of Excel.",
      steps: [
        { title: "The Data menu",
          text: "Click Data. Back up to a file opens your computer’s Save window: the file holds everything — every loan, every property’s folder (profile, assumptions, T12s, documents), every chat and your settings. Restore from a file opens your computer’s Open window: pick a backup and the app says what is in it and asks before replacing anything (what you have now is saved first). The app also keeps copies by itself — Recent automatic backups — after changes, and before an Excel import or a restore.",
          go: async (h) => { await portfolio(h); await dataMenu(h); },
          shot: "view",
          marks: [
            { sel: "#dataDD > summary", label: "Data", text: "Opens and closes this menu." },
            { sel: '[data-data="backup"]', label: "Back up to a file…", text: "Saves everything to one file you choose (your computer’s Save window opens)." },
            { sel: '[data-data="restore"]', label: "Restore from a file…", text: "Replaces everything with a backup file you pick — it asks first, and keeps what you have as an automatic backup." },
            { sel: '[data-data="excel-export"]', label: "Export all loans to Excel…", text: "A workbook of every active loan (a later step)." },
            { sel: '[data-data="excel-import"]', label: "Import loans from Excel…", text: "Adds or updates loans from a workbook (later steps)." },
            { sel: "#dataRecent [data-recent] >> nth=0", label: "An automatic backup", text: "Why it was taken (for example “After: Added property …”, “After a change” or “Before Excel import”), when, and what it holds. Click to restore it (next step)." },
            { sel: '[data-data="folder"]', label: "Open folder", text: "Opens the folder with the automatic backups on your computer." }
          ] },
        { title: "Restore an automatic backup",
          text: "Click an automatic backup: the app says exactly what it holds and what will be replaced. Restore replaces your loans, property folders and chats with it — your current data is saved first as another automatic backup — and the app reloads with the restored data. Cancel changes nothing.",
          go: async (h) => { await h.click("#dataRecent [data-recent] >> nth=0", { wait: 800 }); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Restore …?", text: "What the backup holds." },
            { sel: "#confirmText", label: "What happens", text: "What is replaced, and that your current data is saved first." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." },
            { sel: "#confirmOk", label: "Restore", text: "Restores the backup." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); await h.closeModals(); } },
        { title: "Export all loans to Excel",
          text: "Export shows exactly what the workbook will hold: one column per active loan, one row per field, in sections. Untick a loan to leave it out (Select all ticks them all again). The values can’t be edited here — change a loan in the app. Export opens your computer’s Save window for the .xlsx file. Removed, paid-off and archived loans are not exported.",
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
          after: async (h) => { await h.click("#exportCancelBtn", { wait: 300 }); } },
        { title: "Import from Excel — the checklist",
          text: "Import first lists the details every loan in your sheet needs. Loans can be in rows or in columns, and small differences in the headers are fine — an export from the app always works. Tick the box to say you checked, then Choose file… opens your computer’s Open window to pick the workbook.",
          go: async (h) => { await portfolio(h); await dataMenu(h); await h.click('[data-data="excel-import"]', { wait: 600 }); await h.click("#importCheckAgree", { wait: 300 }); },
          shot: "#importChecklist > div",
          marks: [
            { sel: "#importChecklist h3", label: "Before you import", text: "What your sheet needs." },
            { sel: "#importChecklistFields", label: "The details", text: "Every detail a loan needs." },
            { sel: "#importCheckAgree", label: "I’ve checked", text: "Tick it to turn on Choose file…" },
            { sel: "#importCheckCancel", label: "Cancel", text: "Closes without importing." },
            { sel: "#importCheckOk", label: "Choose file…", text: "Opens your computer’s Open window to pick the workbook." }
          ] },
        { title: "Review the import",
          text: "Nothing is changed yet. Every loan in the workbook is a row with its status: new (it will be added), update (it matches a loan you have and something differs), unchanged (it matches and nothing differs), or missing data (amber cells — a required detail the sheet didn’t have; type it in the cell or remove the row). You can edit any cell. The counts at the top add up the rows. This made-up workbook holds an export of two sample loans (one with a changed insurance escrow) and two made-up loans, one of them incomplete.",
          go: async (h) => { await h.click("#importCheckCancel", { wait: 300 }); const f = await workbook(h); await h.page.setInputFiles("#importFileInput", f); await h.page.waitForSelector("#importPreview:not(.hidden)", { timeout: 15000 }); await h.wait(800); },
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
            { sel: "#importApplyBtn", label: "Resolve 1 to import", text: "Turns into Apply once nothing needs attention." }
          ] },
        { title: "Remove a row, then Apply",
          text: "At the end of each row (scroll the table to the right) a × removes it from the import. With the incomplete made-up loan removed, the counts say ready and the button reads Apply import (2). Apply first saves an automatic backup, then adds the new loan and writes the changes to the updated one; unchanged loans stay exactly as they are.",
          go: async (h) => { await h.jsClick('[data-del="3"]'); await h.wait(500); await h.js(() => { const b = document.getElementById("importPreviewBody"); if (b) b.scrollLeft = b.scrollWidth; }); await h.wait(300); },
          shot: "#importPreview > div",
          marks: [
            { sel: "#importSummary", label: "Ready", text: "1 new, 1 updated, 1 unchanged — nothing needs attention." },
            { sel: '#importPreviewBody [data-del] >> nth=0', label: "×", text: "Removes that row from the import." },
            { sel: "#importApplyBtn", label: "Apply import (2)", text: "Imports the new and the updated loans." }
          ] },
        { title: "After the import",
          text: "Apply closes the window and the Portfolio page counts the new loan. In the Data menu the automatic backup taken just before the import is listed in amber as “Before Excel import” — click it to undo the import by restoring what you had.",
          go: async (h) => { await h.click("#importApplyBtn", { wait: 1500 }); await h.wait(6000); await portfolio(h); await dataMenu(h); },
          shot: "view",
          marks: [
            { sel: "#dataRecent [data-recent]:has(.text-amber-700) >> nth=0", label: "Before Excel import", text: "Taken just before the import — restore it to undo the import." },
            { sel: "#dataRecent [data-recent]:not(:has(.text-amber-700)) >> nth=0", label: "After …", text: "Taken by itself a few seconds after a change, naming what changed — here the import." }
          ],
          after: async (h) => { await h.closeModals(); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "version", title: "The version and updates", intro: "The chip at the right of the header shows your version and any update.",
      steps: [
        { title: "The version chip",
          text: "The chip shows the version you have (here v3.0.0). Click it to check for a new version: it reads “Checking for updates…”; if there is one, “Update available…” and “Downloading update… 40%” while it downloads by itself. When it is ready the chip turns green — “Update ready — Restart” — click it to restart into the new version. If you are up to date the app says so. Updates never touch your loans, files, chats or backups.",
          go: async (h) => { await portfolio(h); },
          shot: "view",
          marks: [
            { sel: "#updateChip", label: "Version", text: "Your version. Click to check for an update; green “Update ready — Restart” means one is downloaded." },
            { sel: "#loanCountLabel", label: "Property count", text: "How many properties are in the portfolio." }
          ] }
      ] }
  ]
};
