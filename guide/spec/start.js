/* Guide chapter: Getting around — the window bar, the tabs, the Whole Portfolio / Specific Property switch, the
   Assistant button and the app's size. The pictures use the app's built-in sample loans; the one "live" rate in the
   rates list is a made-up value (LDS_RATES_FAKE), the other rates are the app's built-in values. */
"use strict";
// to the top of the page at once (the page scrolls smoothly by itself, too slowly for a picture)
const top = async (h) => { await h.js(() => { window.scrollTo({ top: 0, behavior: "instant" }); document.querySelectorAll("main, [data-scrollroot]").forEach(e => { e.scrollTop = 0; }); }); await h.wait(200); };
const path = require("path"), fs = require("fs");
// the Settings menu is taller than a 900-pixel window (there it scrolls inside itself): to show it whole in one picture, a taller window
const tall = async (h) => { await h.ctx.setSize(h.ctx.W, 1180); await h.wait(500); await h.calm(); };
const normal = async (h) => { await h.ctx.setSize(h.ctx.W, h.ctx.H); await h.wait(400); };
const settings = async (h) => { await h.closeModals(); await h.click("#settingsDD > summary", { wait: 500 }); await h.js(() => { if (document.activeElement) document.activeElement.blur(); }); };
// the Assistant button is hidden in most pictures; this chapter shows it once
const fab = async (h, on) => { await h.js((v) => { window.__guideShowFab = v; const s = document.getElementById("guideCalm"); if (s) s.remove(); }, on); await h.calm(); };
const portfolio = async (h) => { await h.closeModals(); await h.home(); await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(500); await h.calm(); await top(h); };

module.exports = {
  id: "start",
  title: "Getting around",
  intro: "The window bar at the top, the tabs, the switch between the whole portfolio and one property, the Assistant button and making the app bigger or smaller — where everything is.",
  env: (udata) => {
    const f = path.join(udata, "rates-made-up.json");
    fs.writeFileSync(f, JSON.stringify({ live: { value: 4.21, date: "2026-10-16" }, history: {} }));
    return { LDS_RATES_OFFLINE: null, LDS_RATES_FAKE: f };
  },
  setup: async (h) => { await portfolio(h); },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "screen", title: "The main screen", intro: "What you see when the app opens, from the top down.",
      steps: [
        { title: "The whole window", cover: true,
          text: "The app opens on the Portfolio tab. At the very top is the window bar (live rates, Settings and the window buttons). Under it: the app’s name, the property count and the version; then the tabs; then the switch between the whole portfolio and one property, the Data menu and the Needs Attention strip. The portfolio page itself starts below them.",
          go: async (h) => { await portfolio(h); },
          shot: "view",
          marks: [
            { sel: "#winbar >> text=Living Residential — Loan Debt Service Hub", label: "Window bar", text: "The app’s own title bar. Drag it to move the window." },
            { sel: "#fetchRateBtn", label: "Fetch live rate", text: "Fetches today’s market rates and shows them in a list (next topic)." },
            { sel: "#settingsDD > summary", label: "Settings", text: "App size, the portfolio targets, the list of properties, this guide and the Claude connection (the Settings chapter)." },
            { sel: "#winMin", label: "Minimize", text: "Hides the window to the taskbar." },
            { sel: "#winMax", label: "Maximize", text: "Fills the screen; click again to go back to the size it was." },
            { sel: "#winClose", label: "Close", text: "Closes the app." },
            { sel: "#brandLogo", label: "Living Residential", text: "The app’s name — nothing to click." },
            { sel: "#loanCountLabel", label: "Property count", text: "How many properties are in the portfolio. Archived properties aren’t counted. Settings lists every one by name." },
            { sel: "#updateChip", label: "Version", text: "The version you have. Click it to check for a new version (the Settings chapter shows what it can say)." },
            { sel: '[data-tabsel="home"]', label: "Portfolio tab", text: "This page. It is always the first tab and can’t be closed." },
            { sel: "#tabNewBtn", label: "+", text: "Opens Underwriting, the Calendar or Data Health in a tab of its own." },
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "The whole book on one page (shown now)." },
            { sel: "#scopeLoanBtn", label: "Specific Property", text: "One property at a time: its loans, payment schedule and profile." },
            { sel: "#dataDD > summary", label: "Data", text: "Back up, restore, and Excel export and import (the Settings, Data & backups chapter)." },
            { sel: "#alertsRail", label: "Needs Attention", text: "Dates coming up and loans worth refinancing — click a card to go there (the Portfolio chapter)." },
            { sel: "#portfolioView h2 >> nth=0", label: "Portfolio", text: "The portfolio page: totals, charts, coverage and every loan (the Portfolio chapter)." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "windowbar", title: "The window bar", intro: "The strip across the top of the window. It stays the same on every tab.",
      steps: [
        { title: "Fetch live rate — the rates list",
          text: "Click Fetch live rate. The app asks the US feeds for today’s rates (the Treasury curve, SOFR and the others) and opens this list: every rate the app holds, its value, where the value comes from, and which of your loans use it. The new values are used at once by the refinance (today’s market rate), the Current / Market / Gap columns on the Portfolio page and the rate preview on the loan form. In this picture only one rate came back from the feeds; the others show the app’s built-in values. With no internet the list says so and the last saved values stay.",
          go: async (h) => { await portfolio(h); await h.click("#fetchRateBtn", { wait: 300 }); await h.page.waitForSelector("[data-rateslist]", { timeout: 20000 }); await h.wait(500); },
          shot: "[data-rateslist] > div",
          marks: [
            { sel: "[data-rateslist] h3", label: "Market rates", text: "The list of every rate the app holds." },
            { sel: "[data-rateslist] h3 >> xpath=following-sibling::p[1]", label: "How many were refreshed", text: "How many rates came fresh from the US feeds just now, and how many rates the app holds." },
            { sel: "[data-rateslistclose]", label: "Close", text: "Closes the list (so does clicking outside it). The rates stay updated." },
            { sel: '[data-raterow="prime"] td >> nth=0', label: "Rate", text: "The rate’s name — Prime, SOFR, Term SOFR, Fed Funds, the US Treasuries and “Other”." },
            { sel: '[data-raterow="termsofr1m"] [data-ratevalue]', label: "Value", text: "The rate today, in percent." },
            { sel: '[data-raterow="termsofr1m"] [data-ratesrc]', label: "Where it comes from", text: "“live” with the date it was quoted; “Built-in rate — fetch to update” is the app’s stored value; “Last saved rate” is the last value fetched." },
            { sel: '[data-raterow="sofr"] [data-rateloans]', label: "Your loans on it", text: "Every loan of yours that uses this rate, and whether it is floating, hybrid or fixed (a fixed loan’s rate is locked and doesn’t move)." }
          ],
          after: async (h) => { await h.js(() => { const m = document.querySelector("[data-rateslist]"); if (m) m.remove(); }); } },
        { title: "Settings",
          text: "Click Settings to open its menu. From the top: the app’s size (App scale), the portfolio targets the Portfolio page measures against, the list of every property with any possible duplicates, this guide, and the Claude connection. Each part is explained in the Settings, Data & backups chapter. Click anywhere outside the menu (or press Esc) to close it.",
          go: async (h) => { await tall(h); await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#settingsDD > summary", label: "Settings", text: "Opens and closes this menu." },
            { sel: "#scaleRange", label: "App scale", text: "Makes everything bigger or smaller (last topic)." },
            { sel: "#settingsTargets", label: "Portfolio targets", text: "The DSCR, LTV and debt-yield targets the Portfolio page measures against." },
            { sel: "#settingsPortfolio", label: "Properties", text: "How many properties there are, every one by name, and any that look like duplicates." },
            { sel: "#settingsGuideBtn", label: "Open the guide", text: "Opens this guide." },
            { sel: "#settingsClaudeBtn", label: "Claude connection", text: "Connects Claude for the AI features — your Claude subscription or an API key." }
          ],
          after: async (h) => { await h.closeModals(); await normal(h); } },
        { title: "The version and the window buttons",
          text: "On the right of the header is the version you have. Click it and the app checks for a new version; while a new version downloads it shows its progress, and once it is ready it turns green — “Update ready — Restart”: click it to restart into the new version. Your data and backups are not touched by an update. The three buttons at the top right minimize, maximize and close the window.",
          go: async (h) => { await portfolio(h); },
          shot: "view",
          marks: [
            { sel: "#loanCountLabel", label: "Property count", text: "How many properties are in the portfolio (archived ones aren’t counted)." },
            { sel: "#updateChip", label: "Version", text: "Your version. Click to check for an update; it then reads “Checking for updates…”, “Downloading update… %”, and finally “Update ready — Restart”." },
            { sel: "#winMin", label: "Minimize", text: "Hides the window to the taskbar." },
            { sel: "#winMax", label: "Maximize / Restore", text: "Fills the screen, or puts the window back to its size." },
            { sel: "#winClose", label: "Close", text: "Closes the app." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "tabs", title: "Tabs", intro: "Portfolio is always the first tab. Underwriting, the Calendar and Data Health open in tabs of their own, next to it.",
      steps: [
        { title: "The “+” menu",
          text: "Click the “+” after the last tab. A small menu lists the tools that open in a tab. Click one: it opens as a new tab and comes to the front.",
          go: async (h) => { await portfolio(h); await h.click("#tabNewBtn", { wait: 400 }); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel="home"]', label: "Portfolio", text: "The Portfolio tab — always there, can’t be closed." },
            { sel: "#tabNewBtn", label: "+", text: "Opens this menu. Click it again to close the menu." },
            { sel: '#tabNewMenu [data-tabopen="underwriting"]', label: "Underwriting & Sizing", text: "A property’s T12, its underwriting (Safe and Aggressive, approved by you), loan sizing and what to push." },
            { sel: '#tabNewMenu [data-tabopen="calendar"]', label: "Maturity & Reset Calendar", text: "Every maturity, rate reset and interest-only change, month by month." },
            { sel: '#tabNewMenu [data-tabopen="health"]', label: "Data Health", text: "What is missing or needs a look, across every property." }
          ] },
        { title: "Several tabs open",
          text: "Here Underwriting, the Calendar and Data Health are all open. Click a tab to bring it to the front — each keeps its place while you look at another. Each tool opens once: choosing it again from “+” just brings its tab forward. Drag a tab left or right to change the order (Portfolio stays first).",
          go: async (h) => { await h.closeModals(); await h.newTab("underwriting"); await h.newTab("calendar"); await h.newTab("health"); await h.wait(800); await top(h); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back to the Portfolio page." },
            { sel: '[data-tabsel^="underwriting"]', label: "Underwriting", text: "An open tab. Click to bring it to the front." },
            { sel: '[data-tabsel^="calendar"]', label: "Calendar", text: "Another open tab." },
            { sel: '[data-tabsel^="health"]', label: "Data Health (in front)", text: "The tab showing now — it is white and joined to the page below." },
            { sel: '[data-tabpop^="health"]', label: "Pop out", text: "Opens this tab in a window of its own — handy on a second screen. The tab leaves the strip while its window is open (choosing the tool from “+” brings that window to the front). In the window, “Dock into main window” puts it back here as a tab, as it was; closing the window closes the tool." },
            { sel: '[data-tabclose^="health"]', label: "Close tab", text: "Closes the tab (next step)." }
          ] },
        { title: "Close a tab",
          text: "Click the × on a tab to close it. If it was the tab in front, you land back on Portfolio. Nothing is lost — your files and figures are saved with each property; open the tool again from “+” whenever you like.",
          go: async (h) => { await h.click('[data-tabclose^="health"]', { wait: 800 }); await h.calm(); await top(h); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back in front after the Data Health tab was closed." },
            { sel: '[data-tabsel^="underwriting"]', label: "Underwriting", text: "Still open." },
            { sel: '[data-tabsel^="calendar"]', label: "Calendar", text: "Still open." },
            { sel: "#tabNewBtn", label: "+", text: "Opens a closed tool again." }
          ],
          after: async (h) => { await h.js(() => { for (let i = 0; i < 6; i++){ const b = document.querySelector("[data-tabclose]"); if (!b) break; b.click(); } }); await h.wait(500); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "scope", title: "Whole Portfolio or one property", intro: "The switch under the tabs: the whole book on one page, or one property at a time.",
      steps: [
        { title: "Whole Portfolio",
          text: "Whole Portfolio shows the whole book: Needs Attention, the totals, the charts, coverage per property, the forecast and every loan. Everything on it is explained in the Portfolio (Home) chapter.",
          go: async (h) => { await portfolio(h); },
          shot: "view",
          marks: [
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Shows the whole book (green = the one showing)." },
            { sel: "#scopeLoanBtn", label: "Specific Property", text: "Switches to one property (next step)." },
            { sel: "#dataDD > summary", label: "Data", text: "Backups and Excel — the same menu on both sides of the switch." },
            { sel: "#alertsRail", label: "Needs Attention", text: "Shown on the whole-portfolio side only." }
          ] },
        { title: "Specific Property",
          text: "Specific Property shows one property at a time: pick it in the list, and its loans, payment schedule and profile show below. The buttons beside the list add a loan or a property, edit or archive the property, and open the refinance. The property chapters explain this page. Click Whole Portfolio to go back.",
          go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 900 }); await h.calm(); await top(h); },
          shot: "view",
          marks: [
            { sel: "#scopeLoanBtn", label: "Specific Property", text: "One property at a time (showing now)." },
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the whole book." },
            { sel: "#loanSelect", label: "Select a property", text: "The property to show. Pick another one here." },
            { sel: "#addBtn", label: "Add Loan", text: "Adds a loan — to this property or a new one." },
            { sel: "#addPropBtn", label: "Add Property", text: "Adds a property — a name is enough to start." },
            { sel: "#editBtn", label: "Edit", text: "Edits this property’s details." },
            { sel: "#removeBtn", label: "Remove", text: "Archives this property and its loans (they can be brought back from the Portfolio page)." },
            { sel: "#refiBtn", label: "Refi Calculator", text: "Opens the refinance for this property." }
          ],
          after: async (h) => { await portfolio(h); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "assistant", title: "The Assistant button", intro: "The green button at the bottom right, on every tab.",
      steps: [
        { title: "Ask the assistant",
          text: "The Assistant button sits at the bottom right of the window on every tab. Click it to ask Claude about your portfolio, or to ask it to do something in the app for you. The Assistant chapter shows it in full. Claude must be connected for it to answer (Settings → Claude connection).",
          go: async (h) => { await portfolio(h); await fab(h, true); },
          shot: "view",
          marks: [
            { sel: "#aiAsstFab", label: "Assistant", text: "Opens the assistant window." }
          ],
          after: async (h) => { await fab(h, false); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "scale", title: "Make everything bigger or smaller", intro: "App scale in Settings zooms the whole app, like zoom in a web browser.",
      steps: [
        { title: "App scale",
          text: "Open Settings. Drag the App scale slider, or click one of the sizes under it: the whole app grows or shrinks at once, like zoom in a web browser — at 75% more of the page fits on the screen, at 150% everything is easier to read. The window bar at the top always stays the same size, so Settings is always easy to reach. Reset to 100% puts it back; the app also goes back to 100% each time you open it.",
          go: async (h) => { await tall(h); await portfolio(h); await settings(h); },
          shot: "view",
          marks: [
            { sel: "#settingsDD > summary", label: "Settings", text: "Opens this menu. The window bar it sits in never zooms." },
            { sel: "#scaleReadout", label: "Size now", text: "The size the app is at." },
            { sel: "#scaleRange", label: "Slider", text: "Drag it: 50% (small) to 200% (big), in steps of 5%." },
            { sel: '#scalePresets [data-scale="50"]', label: "Sizes", text: "One click to 50%, 75%, 100%, 125%, 150% or 200%." },
            { sel: "#scaleReset", label: "Reset to 100%", text: "Back to the normal size." }
          ],
          after: async (h) => { await h.closeModals(); await normal(h); } }
      ] }
  ]
};
