/* Guide chapter: Getting started — find your way around, the app's size, today's market rates, and the reference page
   for the main screen. The pictures use the app's built-in sample loans; the one "live" rate in the rates list is a
   made-up value (LDS_RATES_FAKE), the other rates are the app's built-in values. */
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
const closeTabs = async (h) => { await h.js(() => { for (let i = 0; i < 6; i++){ const b = document.querySelector("[data-tabclose]"); if (!b) break; b.click(); } }); await h.wait(500); };
const rates = async (h) => { await portfolio(h); await h.click("#fetchRateBtn", { wait: 300 }); await h.page.waitForSelector("[data-rateslist]", { timeout: 20000 }); await h.wait(500); };
const noRates = async (h) => { await h.js(() => { const m = document.querySelector("[data-rateslist]"); if (m) m.remove(); }); };

module.exports = {
  id: "start",
  env: (udata) => {
    const f = path.join(udata, "rates-made-up.json");
    fs.writeFileSync(f, JSON.stringify({ live: { value: 4.21, date: "2026-10-16" }, history: {} }));
    return { LDS_RATES_OFFLINE: null, LDS_RATES_FAKE: f };
  },
  setup: async (h) => { await portfolio(h); },
  pages: [
    // ==================================================================================================================
    { id: "get-around", kind: "howto", group: "Getting started", title: "Find your way around",
      description: "Open a tool in its own tab, look at one property, and find Settings and the Assistant.",
      intro: "Everything in the app starts from the top of the window: the tabs, the switch between the whole portfolio and one property, and Settings. Learn these once and every other page of this guide is easy to follow.",
      sections: [
        { title: "Open a tool in a tab",
          text: "The **Portfolio** tab is always first. Underwriting, the Calendar and Data Health each open in a tab of their own, next to it.",
          steps: [
            { text: "Click **+** at the end of the tab strip. A menu lists the tools that open in a tab.",
              go: async (h) => { await portfolio(h); await h.click("#tabNewBtn", { wait: 400 }); },
              shot: "view",
              marks: [
                { sel: "#tabNewBtn", label: "+", text: "Opens this menu." },
                { sel: '#tabNewMenu [data-tabopen="underwriting"]', label: "The tools", text: "Underwriting & Sizing, the Maturity & Reset Calendar and Data Health." }
              ] },
            { text: "Click a tool. It opens as a new tab and comes to the front. Here Underwriting, the Calendar and Data Health are all open, with Data Health in front.",
              go: async (h) => { await h.closeModals(); await h.newTab("underwriting"); await h.newTab("calendar"); await h.newTab("health"); await h.wait(800); await top(h); },
              shot: "view",
              marks: [
                { sel: '[data-tabsel^="health"]', label: "The tab in front", text: "White, and joined to the page below it." },
                { sel: '[data-tabclose^="health"]', label: "×", text: "Closes the tab." }
              ] },
            { text: "Click **Portfolio** to go back. Each tab keeps its place while you look at another, and choosing a tool again from **+** just brings its tab forward." },
            { text: "Click **×** on a tab to close it. Nothing is lost: your files and figures are saved with each property.",
              go: async (h) => { await h.click('[data-tabclose^="health"]', { wait: 800 }); await h.calm(); },
              after: closeTabs }
          ],
          tip: "Drag a tab left or right to change the order. The arrow on a tab (**Pop out**) opens it in a window of its own, handy on a second screen; **Dock into main window** in that window puts it back." },
        { title: "Look at one property",
          steps: [
            { text: "Under the tabs, click **Specific Property**, then pick the property in the list. Its loans, NOI, payment schedule and profile show below.",
              go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 900 }); await h.calm(); await top(h); },
              shot: "view",
              marks: [
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "One property at a time." },
                { sel: "#loanSelect", label: "The property", text: "Pick the property to show." }
              ] },
            { text: "Click **Whole Portfolio** to go back to the whole book.",
              go: async (h) => { await portfolio(h); } }
          ] },
        { title: "Find Settings and the Assistant",
          steps: [
            { text: "Click **Settings** at the top right of the window. Its menu has the app’s size, the portfolio targets, your properties, this guide and the Claude connection. Click outside the menu, or press Esc, to close it.",
              go: async (h) => { await tall(h); await portfolio(h); await settings(h); },
              shot: "view",
              marks: [
                { sel: "#settingsDD > summary", label: "Settings", text: "Opens and closes the menu." },
                { sel: "#settingsGuideBtn", label: "Open the guide", text: "Opens this guide." }
              ],
              after: async (h) => { await h.closeModals(); await normal(h); } },
            { text: "Click the green **Assistant** button at the bottom right, on any tab, to ask Claude about your portfolio or to have it do something in the app.",
              go: async (h) => { await portfolio(h); await fab(h, true); },
              shot: "view",
              marks: [ { sel: "#aiAsstFab", label: "Assistant", text: "Opens the assistant." } ],
              after: async (h) => { await fab(h, false); } }
          ],
          note: "The Assistant needs Claude to be connected. See [Connect Claude](connect-claude)." }
      ],
      next: [
        { page: "open-a-loan", text: "Open a loan and read its page." },
        { page: "ask-the-assistant", text: "Ask Claude about your book." },
        { page: "ref-main-screen", text: "Every control on the main screen, named." }
      ] },

    // ==================================================================================================================
    { id: "change-app-size", kind: "howto", group: "Getting started", title: "Make the app bigger or smaller",
      description: "Zoom the whole app, the way you zoom a web page.",
      intro: "App scale in Settings changes the size of everything at once. At 75% more of a page fits on the screen; at 150% everything is easier to read.",
      sections: [
        { title: "Change the size",
          steps: [
            { text: "Click **Settings** at the top right of the window." },
            { text: "Drag the **App scale** slider, or click one of the sizes under it. The whole app changes size at once.",
              go: async (h) => { await tall(h); await portfolio(h); await settings(h); },
              shot: "view",
              marks: [
                { sel: "#scaleRange", label: "App scale", text: "Drag it: from 50% to 200%, in steps of 5%." },
                { sel: '#scalePresets [data-scale="50"]', label: "Sizes", text: "One click to 50%, 75%, 100%, 125%, 150% or 200%." },
                { sel: "#scaleReset", label: "Reset to 100%", text: "Back to the normal size." }
              ],
              after: async (h) => { await h.closeModals(); await normal(h); } },
            { text: "To go back to the normal size, click **Reset to 100%**." }
          ],
          note: "The window bar at the top never changes size, so Settings is always easy to reach. The app opens at 100% each time you start it." }
      ],
      next: [
        { page: "get-around", text: "The tabs, the switch and Settings." },
        { page: "ref-settings", text: "Everything in the Settings and Data menus." }
      ] },

    // ==================================================================================================================
    { id: "check-market-rates", kind: "howto", group: "Getting started", title: "Check today’s market rates",
      description: "Fetch the live rates that the refinance and the Portfolio page use.",
      intro: "The app holds every rate a loan can float on: Prime, SOFR, Term SOFR, Fed Funds and the US Treasuries. **Fetch live rate** asks the US feeds for today’s values. The refinance, the rate columns on the Portfolio page and the loan form’s rate preview use the new values at once.",
      before: [ "An internet connection. Without one, the app keeps using the rates it already holds." ],
      sections: [
        { title: "Fetch the rates",
          steps: [
            { text: "Click **Fetch live rate** in the window bar at the top." },
            { text: "Read the list. Each row is one rate: its value today, where that value comes from, and which of your loans use it.",
              go: rates,
              shot: "[data-rateslist] > div",
              marks: [
                { sel: '[data-raterow="termsofr1m"] [data-ratevalue]', label: "Value", text: "The rate today, in percent." },
                { sel: '[data-raterow="termsofr1m"] [data-ratesrc]', label: "Where it comes from", text: "“live” with the date it was quoted, the last rate fetched, or the app’s built-in rate." },
                { sel: '[data-raterow="sofr"] [data-rateloans]', label: "Your loans on it", text: "Every loan that uses this rate, floating, hybrid or fixed." }
              ],
              after: noRates },
            { text: "Click **Close**, or anywhere outside the list. The rates stay updated." }
          ],
          note: "“Built-in rate — fetch to update” means the feeds didn’t return that rate this time, so the app uses its stored value. In this picture only one rate came back from the feeds." }
      ],
      next: [
        { page: "run-a-refinance", text: "Use today’s rate to decide on a refinance." },
        { page: "check-coverage", text: "Compare each property’s rate with the market’s." }
      ] },

    // ==================================================================================================================
    { id: "ref-main-screen", kind: "reference", group: "Reference", title: "The main screen",
      description: "Every part of the window you see on every tab: the window bar, the header, the tabs and the switch under them.",
      intro: "Each picture names its controls. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "The whole window",
          views: [
            { text: "The app opens on the Portfolio tab. From the top: the window bar, the header, the tabs, the switch and the Data menu, and the Needs Attention strip. The Portfolio page starts below them.",
              go: async (h) => { await portfolio(h); },
              shot: "view",
              marks: [
                { sel: "#winbar >> text=Living Residential — Loan Debt Service Hub", label: "Window bar", text: "The app’s own title bar. Drag it to move the window." },
                { sel: "#fetchRateBtn", label: "Fetch live rate", text: "Fetches today’s market rates and lists them. See [Check today’s market rates](check-market-rates)." },
                { sel: "#settingsDD > summary", label: "Settings", text: "The app’s size, the portfolio targets, your properties, this guide and the Claude connection." },
                { sel: "#winMin", label: "Minimize", text: "Hides the window to the taskbar." },
                { sel: "#winMax", label: "Maximize", text: "Fills the screen; click again to go back to the size it was." },
                { sel: "#winClose", label: "Close", text: "Closes the app." },
                { sel: "#brandLogo", label: "Living Residential", text: "The app’s name; nothing to click." },
                { sel: "#loanCountLabel", label: "Property count", text: "How many properties are in the portfolio. Archived properties aren’t counted." },
                { sel: "#updateChip", label: "Version", text: "The version you have. Click it to check for a new version." },
                { sel: '[data-tabsel="home"]', label: "Portfolio tab", text: "This page. It is always the first tab and can’t be closed." },
                { sel: "#tabNewBtn", label: "+", text: "Opens Underwriting, the Calendar or Data Health in a tab of its own." },
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "The whole book on one page (shown now)." },
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "One property at a time: its loans, payment schedule and profile." },
                { sel: "#dataDD > summary", label: "Data", text: "Back up, restore, and Excel export and import." },
                { sel: "#alertsRail", label: "Needs Attention", text: "Dates coming up and loans worth refinancing. Click a card to go there." },
                { sel: "#portfolioView h2 >> nth=0", label: "Portfolio", text: "The Portfolio page: totals, charts, coverage and every loan." }
              ] }
          ] },
        { title: "The window bar and the header",
          views: [
            { title: "The rates list",
              text: "Opened by **Fetch live rate**: every rate the app holds, its value, where the value comes from, and which of your loans use it.",
              go: rates,
              shot: "[data-rateslist] > div",
              marks: [
                { sel: "[data-rateslist] h3", label: "Market rates", text: "The list of every rate the app holds." },
                { sel: "[data-rateslist] h3 >> xpath=following-sibling::p[1]", label: "How many were refreshed", text: "How many rates came fresh from the US feeds just now, out of how many the app holds." },
                { sel: "[data-rateslistclose]", label: "Close", text: "Closes the list (so does clicking outside it). The rates stay updated." },
                { sel: '[data-raterow="prime"] td >> nth=0', label: "Rate", text: "The rate’s name: Prime, SOFR, Term SOFR, Fed Funds, the US Treasuries and “Other”." },
                { sel: '[data-raterow="termsofr1m"] [data-ratevalue]', label: "Value", text: "The rate today, in percent." },
                { sel: '[data-raterow="termsofr1m"] [data-ratesrc]', label: "Where it comes from", text: "“live” with the date it was quoted; “Built-in rate — fetch to update” is the app’s stored value; “Last saved rate” is the last value fetched." },
                { sel: '[data-raterow="sofr"] [data-rateloans]', label: "Your loans on it", text: "Every loan that uses this rate, and whether it is floating, hybrid or fixed (a fixed loan’s rate is locked and doesn’t move)." }
              ],
              after: noRates },
            { title: "The version and the window buttons",
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
        { title: "Tabs",
          views: [
            { title: "The “+” menu",
              go: async (h) => { await portfolio(h); await h.click("#tabNewBtn", { wait: 400 }); },
              shot: "view",
              marks: [
                { sel: '[data-tabsel="home"]', label: "Portfolio", text: "The Portfolio tab: always there, can’t be closed." },
                { sel: "#tabNewBtn", label: "+", text: "Opens this menu. Click it again to close the menu." },
                { sel: '#tabNewMenu [data-tabopen="underwriting"]', label: "Underwriting & Sizing", text: "A property’s T12, its underwriting (Safe and Aggressive, approved by you), loan sizing and what to push." },
                { sel: '#tabNewMenu [data-tabopen="calendar"]', label: "Maturity & Reset Calendar", text: "Every maturity, rate reset and interest-only change, month by month." },
                { sel: '#tabNewMenu [data-tabopen="health"]', label: "Data Health", text: "What is missing or needs a look, across every property." }
              ] },
            { title: "Several tabs open",
              go: async (h) => { await h.closeModals(); await h.newTab("underwriting"); await h.newTab("calendar"); await h.newTab("health"); await h.wait(800); await top(h); },
              shot: "view",
              marks: [
                { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back to the Portfolio page." },
                { sel: '[data-tabsel^="underwriting"]', label: "Underwriting", text: "An open tab. Click to bring it to the front." },
                { sel: '[data-tabsel^="calendar"]', label: "Calendar", text: "Another open tab." },
                { sel: '[data-tabsel^="health"]', label: "Data Health (in front)", text: "The tab showing now: white, and joined to the page below." },
                { sel: '[data-tabpop^="health"]', label: "Pop out", text: "Opens this tab in a window of its own. The tab leaves the strip while its window is open; in the window, “Dock into main window” puts it back here as it was, and closing the window closes the tool." },
                { sel: '[data-tabclose^="health"]', label: "Close tab", text: "Closes the tab. If it was in front, you land back on Portfolio." }
              ],
              after: closeTabs }
          ] },
        { title: "Whole Portfolio and Specific Property",
          views: [
            { title: "Whole Portfolio",
              text: "The whole book: Needs Attention, the totals, the charts, coverage per property, the forecast and every loan. See [The Portfolio page](ref-portfolio).",
              go: async (h) => { await portfolio(h); },
              shot: "view",
              marks: [
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Shows the whole book (green = the one showing)." },
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "Switches to one property." },
                { sel: "#dataDD > summary", label: "Data", text: "Backups and Excel: the same menu on both sides of the switch." },
                { sel: "#alertsRail", label: "Needs Attention", text: "Shown on the whole-portfolio side only." }
              ] },
            { title: "Specific Property",
              text: "One property at a time. See [The property page](ref-property-page).",
              go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 900 }); await h.calm(); await top(h); },
              shot: "view",
              marks: [
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "One property at a time (showing now)." },
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the whole book." },
                { sel: "#loanSelect", label: "Select a property", text: "The property to show. Pick another one here." },
                { sel: "#addBtn", label: "Add Loan", text: "Adds a loan, to this property or a new one." },
                { sel: "#addPropBtn", label: "Add Property", text: "Adds a property; a name is enough to start." },
                { sel: "#editBtn", label: "Edit", text: "Edits this property’s details." },
                { sel: "#removeBtn", label: "Remove", text: "Archives this property and its loans (they can be brought back from the Portfolio page)." },
                { sel: "#refiBtn", label: "Refi Calculator", text: "Opens the refinance for this property." }
              ],
              after: async (h) => { await portfolio(h); } }
          ] },
        { title: "The Assistant button",
          views: [
            { text: "At the bottom right of every tab. See [Ask the assistant](ask-the-assistant).",
              go: async (h) => { await portfolio(h); await fab(h, true); },
              shot: "view",
              marks: [ { sel: "#aiAsstFab", label: "Assistant", text: "Opens the assistant window, about 80% of the app’s size." } ],
              after: async (h) => { await fab(h, false); } }
          ] }
      ] }
  ]
};
