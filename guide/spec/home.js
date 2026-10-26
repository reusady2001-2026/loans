/* Guide chapter: Portfolio — Needs Attention, coverage per property, the forecast and rate shock, finding a loan,
   bringing back removed loans and archived properties; and the reference page for the whole Portfolio page.
   The pictures use the app's built-in sample loans and one made-up property ("Sample Lofts (example)"); an NOI typed
   in a picture is a made-up figure and is never saved. Near the end the chapter removes one sample loan and archives
   one sample property, to show where they go. */
"use strict";
// to the top of the page at once (the page scrolls smoothly by itself, too slowly for a picture)
const top = async (h) => { await h.js(() => { window.scrollTo({ top: 0, behavior: "instant" }); document.querySelectorAll("main, [data-scrollroot]").forEach(e => { e.scrollTop = 0; }); }); await h.wait(200); };
const PV = "#portfolioView";
const KPI = PV + " > div:nth-child(2)", CHARTS = PV + " > div:nth-child(3)", COV = PV + " > div:nth-child(4)";
const FC = "#forecastWrap", SHOCK = PV + " > div:nth-child(6)", PROPS = PV + " > div:nth-child(8)";
const ARCH = PV + " > div:has([data-unarchive])";
const chart = (title) => 'h3:text-is("' + title + '") >> xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," boxline ")][1]';
const NEW = "Sample Lofts (example)";
const portfolio = async (h) => { await h.closeModals(); await h.home(); await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(600); await h.calm(); await top(h); };
// a view picture with an element near the top of the window (under the window bar)
const at = async (h, sel, off) => { await h.loc(sel).evaluate((e, o) => { window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - o, behavior: "instant" }); }, off == null ? 56 : off); await h.wait(300); };
const center = async (h, sel) => { await h.loc(sel).evaluate((e) => { e.scrollIntoView({ block: "center", behavior: "instant" }); }); await h.wait(300); };
// a long table pictured with only its first rows (the table itself lists every property)
const firstRows = async (h, sel, n) => { await h.js((a) => { let k = 0; document.querySelectorAll(a.sel + " tbody tr").forEach((r) => { if (r.hidden || r.style.display === "none") return; if (k++ >= a.n) r.style.display = "none"; }); }, { sel, n }); };
// the Needs Attention strip scrolled sideways: to its end, or to one card
const railTo = async (h, sel) => { await h.loc(sel).evaluate((c) => { const r = c.closest(".overflow-x-auto"); r.scrollLeft += c.getBoundingClientRect().left - r.getBoundingClientRect().left - 24; }); await h.wait(300); };
const railEnd = async (h) => { await h.js(() => { const r = document.querySelector("#alertsRail .overflow-x-auto"); if (r) r.scrollLeft = r.scrollWidth; }); await h.wait(300); };
const confirmBox = "#confirmModal > div";
// a sample loan removed (Loan Record → Remove) and a sample property archived (Specific Property → Remove), once
const removeSamples = async (h) => {
  await portfolio(h);
  const st = await h.js(() => ({
    loan: /Avalon WP \(Mezz\)/.test((document.getElementById("inactiveLoansStrip") || {}).innerText || ""),
    prop: [...document.querySelectorAll("[data-harddelete]")].some(b => /Weaver Mill/.test(b.getAttribute("data-name") || ""))
  }));
  if (!st.loan){ await h.openLoan(/Avalon WP \(Mezz\)/); await h.click("#loanRecRemove", { wait: 500 }); await h.click("#confirmOk", { wait: 1200 }); }
  if (!st.prop){ await h.openLoan(/Weaver Mill/); await h.click("#removeBtn", { wait: 500 }); await h.click("#confirmOk", { wait: 1500 }); }
  await portfolio(h);
};

const SPEC = {
  id: "home",
  setup: async (h) => { await portfolio(h); },
  pages: [
    // ==================================================================================================================
    { id: "check-what-needs-attention", kind: "howto", group: "Portfolio", title: "Check what needs attention",
      description: "Read the Needs Attention strip and go straight to the loan behind a card.",
      intro: "**Needs Attention**, at the top of the Portfolio page, lists what is coming up in your loans and which loans look worth refinancing. Check it when you open the app: each card takes you to the loan, or the refinance, behind it.",
      prep: portfolio,
      sections: [
        { title: "Read the cards",
          text: "Soonest first, the strip lists balloons due in the next 24 months (Maturity), interest-only periods ending in the next 12 months (IO step-up), rate resets in the next 12 months (ARM reset) and loans you marked out of date (Out of date). Green Refi cards come last.",
          steps: [
            { text: "On the **Portfolio** tab, look at **Needs Attention**, under the tabs. Each card names the loan, what happens and when.",
              go: portfolio,
              shot: "#alertsRail",
              marks: [
                { sel: "#alertsRail >> text=Needs Attention", label: "Needs Attention", text: "The red number is how many cards there are." },
                { sel: "#alertsRail [data-alert-goto] >> nth=0", label: "ARM reset (amber)", text: "A rate resets soon: the new rate and the date." },
                { sel: "#alertsRail [data-alert-goto] >> nth=1", label: "Maturity (red)", text: "A loan comes due: the balloon to pay off and the date." }
              ] },
            { text: "Scroll the strip sideways to see the other cards. The green **Refi** cards at the end are loans priced more than 0.25% above what the same loan would cost today, the biggest gap first.",
              go: async (h) => { await railTo(h, "#alertsRail [data-alert-refi] >> nth=0"); },
              shot: "#alertsRail",
              marks: [
                { sel: "#alertsRail [data-alert-refi] >> nth=0", label: "Refi (green)", text: "Priced above today’s market, and by how much." },
                { sel: "#alertsRail [data-alert-refi] >> nth=1", label: "Another Refi card", text: "Sorted by how far above market, the biggest gap first." }
              ] }
          ],
          note: "A card with a pink outline is three months away or less." },
        { title: "Open the loan behind a card",
          steps: [
            { text: "Click a **Maturity**, **IO step-up** or **ARM reset** card. The loan opens, and its payment schedule scrolls to the month of the event, lit up for a few seconds.",
              go: async (h) => { await portfolio(h); await h.click("#alertsRail [data-alert-goto] >> nth=1", { wait: 900 }); await center(h, "#scheduleBody tr.ring-2"); await h.calm(); },
              shot: "view",
              marks: [
                { sel: "#scheduleBody tr.ring-2", label: "That month", text: "The payment where the event happens; here the final payment, with the balloon." },
                { sel: "#scheduleBody tr.ring-2 >> text=pays", label: "Pays on", text: "The day the payment is due: the date on the card." }
              ] },
            { text: "Scroll up and click **Whole Portfolio** to go back.",
              go: portfolio }
          ] },
        { title: "Open the refinance behind a Refi card",
          steps: [
            { text: "Click a **Refi** card. The refinance for that loan opens.",
              go: async (h) => { await railEnd(h); await h.click("#alertsRail [data-alert-refi] >> nth=0", { wait: 1500 }); await h.calm(); await top(h); },
              shot: "view",
              marks: [
                { sel: "#refiView h2", label: "Refinance Analysis", text: "The refinance for the loan on the card." },
                { sel: "#refiView [data-refinot12]", label: "No T12 yet", text: "This sample property has no T12, so nothing is sized yet. Its button opens Underwriting for it." },
                { sel: "#refiCloseBtn", label: "Close", text: "Back to where you were." }
              ] },
            { text: "Click **Close** to go back.",
              go: async (h) => { await h.click("#refiCloseBtn", { wait: 600 }).catch(() => {}); await portfolio(h); } }
          ],
          note: "A refinance is sized on the property’s T12 and the underwriting approved from it, never on a typed NOI. See [Upload a T12](upload-a-t12)." }
      ],
      next: [
        { page: "run-a-refinance", text: "Decide on a refinance." },
        { page: "read-the-calendar", text: "Every maturity and reset, month by month." },
        { page: "ref-portfolio", text: "Every part of the Portfolio page, named." }
      ] },

    // ==================================================================================================================
    { id: "check-coverage", kind: "howto", group: "Portfolio", title: "Check each property’s coverage",
      description: "See which properties clear your DSCR, debt-yield and LTV targets, and add the NOI of the ones without one.",
      intro: "The Portfolio page measures the whole book, and every property in it, against your targets: a minimum DSCR, a minimum debt yield and a maximum LTV. Check it to find the properties that miss a target, the ones with no NOI yet, and the ones paying well above today’s market rate.",
      callouts: [ { kind: "note", text: "The targets (1.25×, 8% …) are set in Settings. See [Set the portfolio targets](set-portfolio-targets)." } ],
      sections: [
        { title: "Read the whole book",
          steps: [
            { text: "On the **Portfolio** tab, read **Portfolio DSCR** and **Portfolio Debt Yield**, under the heading. Each says how the whole book stands against your target.",
              go: portfolio,
              shot: KPI,
              marks: [
                { sel: KPI + " > div:nth-child(3)", label: "Portfolio DSCR", text: "Total NOI ÷ total yearly loan payments, against your minimum DSCR." },
                { sel: KPI + " > div:nth-child(4)", label: "Portfolio Debt Yield", text: "Total NOI ÷ total balance, against your minimum debt yield." }
              ] },
            { text: "Look at **Coverage vs targets**, under the tiles. Each bar is the portfolio’s figure and the thin dark line is your target: green clears it, amber is close, red is off. Under the bars, every property that is off a target is named.",
              shot: chart("Coverage vs targets"),
              marks: [
                { sel: chart("Coverage vs targets") + " >> text=Portfolio DSCR", label: "Portfolio DSCR", text: "Against your minimum DSCR." },
                { sel: "#gaugeLtv", label: "Portfolio LTV", text: "Against your maximum LTV: lower is better here." },
                { sel: chart("Coverage vs targets") + " >> text=Off a target", label: "Off a target", text: "Every property that misses a target or has no NOI yet." }
              ] }
          ],
          note: "A property with no NOI yet counts as $0 NOI, so its debt pulls the portfolio’s DSCR and debt yield down. The tiles say how many such properties there are." },
        { title: "Check each property",
          steps: [
            { text: "Scroll down to **Coverage**. Each row is one property, worst DSCR first; a senior loan and its mezzanine count as one. Properties with no NOI yet are at the bottom.",
              go: async (h) => { await portfolio(h); await firstRows(h, COV, 7); },
              shot: COV,
              marks: [
                { sel: COV + " thead th >> nth=2", label: "DSCR", text: "NOI ÷ yearly loan payments. Green clears the target, amber is close, red is off." },
                { sel: COV + " thead th >> nth=7", label: "Gap", text: "The property’s rate today minus the market’s. Green: more than 0.25% above market." },
                { sel: COV + " tbody >> text=off target >> nth=0", label: "Off target", text: "Misses at least one target." },
                { sel: COV + " tbody >> text=needs T12/NOI >> nth=0", label: "Needs T12/NOI", text: "No NOI yet." }
              ] },
            { text: "Read the tag at the end of each row: **clears** meets all three targets, **off target** misses at least one, and **needs T12/NOI** has no NOI yet." },
            { text: "Compare **Current** with **Market**: the rate the property pays now against what the same loan would cost today. A green **Gap** is worth a look at a refinance." }
          ],
          note: "The picture shows the first rows; the table lists every property." },
        { title: "Add a missing NOI",
          steps: [
            { text: "Click **Add NOI** on a property marked needs T12/NOI." },
            { text: "Type the property’s yearly NOI in **Property annual NOI**, from its operating statement. Change **Cap rate** only if you have a better figure than the default for its type; it gives the value, and so the LTV.",
              go: async (h) => { await portfolio(h); await h.click(COV + " [data-covnoi] >> nth=0", { wait: 500 }); await h.fill("#noiField", "9,850,000", { change: false }); },
              shot: "#noiModal > div",
              marks: [
                { sel: "#noiField", label: "Property annual NOI", text: "The yearly NOI, in dollars. It must be more than $0." },
                { sel: "#capField", label: "Cap rate", text: "Filled in by property type. Value = NOI ÷ cap rate." },
                { sel: "#noiSave", label: "Continue", text: "Saves the NOI and the cap rate." }
              ],
              after: async (h) => { await h.click("#noiCancel", { wait: 400 }); } },
            { text: "Click **Continue**. The row shows its DSCR, debt yield and LTV, and every total on the page counts it." }
          ],
          tip: "The property’s T12 gives a better NOI, and it is the only one a refinance uses. See [Upload a T12](upload-a-t12). (The NOI in the picture is made up and was not saved.)" },
        { title: "Open a property’s refinance",
          steps: [
            { text: "Click **Refi path** on the property’s row. The refinance opens for that property, all its loans together.",
              go: async (h) => { await portfolio(h); await h.click(COV + " [data-covpath] >> nth=0", { wait: 1500 }); await h.calm(); await top(h); },
              shot: "view",
              marks: [
                { sel: "#refiView h2", label: "Refinance Analysis", text: "The refinance for that property. Without a T12 it says “No T12 yet”." },
                { sel: "#refiCloseBtn", label: "Close", text: "Back to the Portfolio page." }
              ] },
            { text: "Click **Close** to come back.",
              go: async (h) => { await h.click("#refiCloseBtn", { wait: 600 }).catch(() => {}); await portfolio(h); } }
          ],
          tip: "To put several properties under one new loan, click **Create a portfolio…** above the Coverage table. See [Refinance several loans together](refinance-together)." }
      ],
      next: [
        { page: "upload-a-t12", text: "Give a property its NOI from its T12." },
        { page: "run-a-refinance", text: "Decide on a refinance." },
        { page: "ref-portfolio", anchor: "coverage", text: "Every column of the Coverage table." }
      ] },

    // ==================================================================================================================
    { id: "see-the-forecast", kind: "howto", group: "Portfolio", title: "See the forecast and a rate shock",
      description: "See what the book will cost to carry in the years ahead, and what a move in rates would do.",
      intro: "The **Debt-Service Forecast** shows each year’s debt service ahead, with the balloons coming due if you want them. **Rate Shock**, under it, shows what rates 1% lower, or 1% or 2% higher, would do to your payments.",
      sections: [
        { title: "Read the forecast",
          steps: [
            { text: "On the **Portfolio** tab, scroll down to **Debt-Service Forecast**. Each bar is a year’s debt service (principal and interest plus escrows and fees), from this year on. Point at a bar to see its amount.",
              go: portfolio,
              shot: FC,
              marks: [
                { sel: FC + " .group >> nth=0", label: "This year", text: "Darker, with its label in bold." },
                { sel: FC + ' [data-fcy="1"]', label: "1yr", text: "One bar per year (shown)." },
                { sel: FC + ' [data-fc="0"]', label: "Recurring", text: "Regular payments only (shown)." }
              ] },
            { text: "Click **3yr** or **5yr** to group the years into longer bars. **1yr** goes back." },
            { text: "Click **+ Payoffs** to stack the balloons coming due on top of each bar. **Recurring** shows only the regular payments again.",
              go: async (h) => { await h.click(FC + ' [data-fcy="3"]', { wait: 500 }); await h.click(FC + ' [data-fc="1"]', { wait: 500 }); },
              shot: FC,
              marks: [
                { sel: FC + ' [data-fcy="3"]', label: "3yr", text: "On: three-year bars." },
                { sel: FC + ' [data-fc="1"]', label: "+ Payoffs", text: "On: balloons stacked on top." },
                { sel: FC + " .group >> nth=1", label: "A three-year bar", text: "Green: debt service. Dark: balloons due." },
                { sel: FC + " div.mt-3", label: "Key", text: "Which color is which." }
              ],
              after: async (h) => { await h.click(FC + ' [data-fcy="1"]', { wait: 300 }); await h.click(FC + ' [data-fc="0"]', { wait: 300 }); } }
          ] },
        { title: "Check a rate shock",
          text: "Fixed loans don’t move. Floating loans move at once. Hybrid ARMs move only when they reset.",
          steps: [
            { text: "Scroll down to **Rate Shock**. The bar at the top splits the book into fixed, ARM and floating." },
            { text: "Read the table: for rates 1% lower (−100 bps), today’s, and 1% or 2% higher, the blended rate, the monthly debt service, and the interest per year more (red) or less (green) than today.",
              go: portfolio,
              shot: SHOCK,
              marks: [
                { sel: SHOCK + " .rounded-full.overflow-hidden", label: "Fixed / ARM / Floating", text: "Green fixed, amber ARM, red floating." },
                { sel: SHOCK + " table", label: "Scenarios", text: "−100 bps, Today, +100 bps, +200 bps (100 bps = 1%)." },
                { sel: SHOCK + " >> text=Every", label: "In plain words", text: "What each +1% costs per year, and its share of your yearly debt service." },
                { sel: SHOCK + " >> text=Most exposed", label: "Most exposed", text: "The largest floating and ARM loans." }
              ] }
          ] }
      ],
      next: [
        { page: "read-the-calendar", text: "When each balloon and reset falls." },
        { page: "check-market-rates", text: "Fetch today’s rates." },
        { page: "ref-portfolio", anchor: "rate-shock", text: "Every part of the forecast and Rate Shock." }
      ] },

    // ==================================================================================================================
    { id: "find-a-loan", kind: "howto", group: "Portfolio", title: "Find a loan in the portfolio",
      description: "Find a loan in Portfolio detail, by property or by lender, and open it.",
      intro: "**Portfolio detail**, near the bottom of the Portfolio page, lists every loan grouped by property, largest balance first. Find the loan there and click it to open its page.",
      sections: [
        { title: "Find it by property",
          steps: [
            { text: "On the **Portfolio** tab, scroll down to **Portfolio detail**. A property with one loan is one row.",
              go: async (h) => { await portfolio(h); await firstRows(h, PROPS, 9); await at(h, PV + " > div:nth-child(7)", 50); },
              shot: "view",
              marks: [
                { sel: PROPS + " tbody tr[data-goto]:not([data-propmember]) >> nth=0", label: "A one-loan property", text: "Click to open its loan." },
                { sel: PROPS + " tr[data-proptoggle] >> nth=0", label: "A property with 2 loans", text: "One bold row with the number of loans." }
              ] },
            { text: "For a property with a senior and a mezzanine loan, click its bold row. Its loans show under it, marked Senior or Mezz. Click the row again to hide them.",
              go: async (h) => { await portfolio(h); await h.click(PROPS + " tr[data-proptoggle] >> nth=0", { wait: 400 }); await firstRows(h, PROPS, 11); await at(h, PROPS, 50); },
              shot: "view",
              marks: [
                { sel: PROPS + " tr[data-proptoggle] >> nth=0", label: "Open property", text: "Click again to hide its loans." },
                { sel: PROPS + ' tr[data-propmember="0"] >> nth=0', label: "Senior loan", text: "The first-lien loan." },
                { sel: PROPS + ' tr[data-propmember="0"] >> nth=1', label: "Mezz loan", text: "The mezzanine loan behind it." }
              ] },
            { text: "Click the loan. Its page opens on the **Specific Property** side.",
              go: async (h) => { await h.click(PROPS + ' tr[data-propmember="0"] >> nth=0', { wait: 1200 }); await h.calm(); await top(h); },
              shot: "view",
              marks: [
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "Now showing one property." },
                { sel: "#loanSelect", label: "The property", text: "The one you clicked; pick another here." },
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the Portfolio page." }
              ] },
            { text: "Click **Whole Portfolio** to come back.",
              go: portfolio }
          ] },
        { title: "Find it by lender",
          steps: [
            { text: "Click **All lenders**, above the table. Every lender is listed with what is owed to it." },
            { text: "Tick one or more lenders. The table keeps only their properties; a property with two loans opens to show the matching one.",
              go: async (h) => { await portfolio(h); await at(h, PROPS, 50); await h.click("#lenderDD > summary", { wait: 400 }); await h.click('[data-lenderopt="Bank Hapoalim B.M."]', { wait: 500 }); },
              shot: "view",
              marks: [
                { sel: '[data-lenderopt="Bank Hapoalim B.M."]', label: "Ticked", text: "Only this lender’s loans are shown." },
                { sel: "#lenderSum", label: "1 lender", text: "How many lenders are picked." },
                { sel: "#lenderConc", label: "Share", text: "Their share of the whole book." },
                { sel: "#lenderClear", label: "Clear", text: "Shows every lender again." }
              ],
              after: async (h) => { await h.click("#lenderClear", { wait: 300 }).catch(() => {}); await h.closeModals(); } },
            { text: "Click **Clear** to show every lender again." }
          ] }
      ],
      next: [
        { page: "open-a-loan", text: "Open a loan from the property list instead." },
        { page: "ref-loan-page", text: "Every part of a loan’s page." },
        { page: "ref-portfolio", anchor: "portfolio-detail", text: "Every column of Portfolio detail." }
      ] },

    // ==================================================================================================================
    { id: "ref-portfolio", kind: "reference", group: "Reference", title: "The Portfolio page",
      description: "Every part of the Portfolio page, from Needs Attention at the top to the removed and archived items at the bottom.",
      intro: "The **Portfolio** tab with **Whole Portfolio** picked: the whole book on one page. Every active loan counts in it; removed, paid-off and archived ones don’t. Each picture names its controls.",
      sections: [
        { title: "Needs Attention",
          text: "Soonest first: balloons due in the next 24 months, interest-only periods ending in the next 12 months, rate resets in the next 12 months and loans flagged out of date; then the Refi cards. A card with a pink outline is three months away or less. Scroll the strip sideways to see every card. See [Check what needs attention](check-what-needs-attention).",
          views: [
            { title: "The date cards",
              text: "Click one: the loan opens, with its schedule at the month of the event.",
              go: portfolio,
              shot: "#alertsRail",
              marks: [
                { sel: "#alertsRail >> text=Needs Attention", label: "Needs Attention", text: "The strip’s title; the red number is how many cards there are." },
                { sel: "#alertsRail [data-alert-goto] >> nth=0", label: "ARM reset (amber)", text: "An adjustable rate resets soon: the new rate and the date." },
                { sel: "#alertsRail [data-alert-goto] >> nth=1", label: "Maturity (red)", text: "A loan comes due: the balloon to pay off and the date." }
              ] },
            { title: "Further along the strip",
              text: "Scroll sideways for the rest of the date cards.",
              go: async (h) => { await railTo(h, "#alertsRail [data-alert-goto] >> nth=3"); },
              shot: "#alertsRail",
              marks: [
                { sel: "#alertsRail [data-alert-goto] >> nth=3", label: "IO step-up (orange)", text: "An interest-only period ends: the new monthly payment and the date it starts." }
              ] },
            { title: "The Refi cards",
              text: "At the end of the strip: loans whose rate is more than 0.25% above what the same loan would cost today. Click one to open its refinance.",
              go: async (h) => { await railTo(h, "#alertsRail [data-alert-refi] >> nth=0"); },
              shot: "#alertsRail",
              marks: [
                { sel: "#alertsRail [data-alert-refi] >> nth=0", label: "Refi (green)", text: "Priced above today’s market, and by how much." },
                { sel: "#alertsRail [data-alert-refi] >> nth=1", label: "Another Refi card", text: "Sorted by how far above market, the biggest gap first." }
              ] }
          ] },
        { title: "The totals",
          views: [
            { text: "Four figures to read, not buttons. Portfolio DSCR = the total NOI of every property ÷ the total yearly principal-and-interest payments of every loan (during an interest-only period, the full amortizing payment is used). A property with no NOI yet counts as $0 NOI, and the tile says how many there are.",
              go: async (h) => { await portfolio(h); await at(h, PV + " > div:nth-child(1)", 60); },
              shot: "view",
              marks: [
                { sel: PV + " > div:nth-child(1) p", label: "Loan count", text: "How many active loans the page covers." },
                { sel: PV + " > div:nth-child(1) >> text=priced above market", label: "Priced above market", text: "How many properties pay more than 0.25% above today’s market rate (the Refi cards)." },
                { sel: KPI + " > div:nth-child(1)", label: "Total Debt Outstanding", text: "What is owed today on every loan; under it, the number of loans and what they were when first made." },
                { sel: KPI + " > div:nth-child(2)", label: "Weighted-Avg Rate", text: "The average interest rate, weighted by balance; under it, the total monthly debt service (payments plus escrows and fees)." },
                { sel: KPI + " > div:nth-child(3)", label: "Portfolio DSCR", text: "Total NOI ÷ total yearly loan payments, against your minimum DSCR target." },
                { sel: KPI + " > div:nth-child(4)", label: "Portfolio Debt Yield", text: "Total NOI ÷ total balance, against your minimum debt-yield target." }
              ] }
          ] },
        { title: "The charts",
          views: [
            { text: "What kind of debt you have, when it comes due, and how the book stands against its targets. Point at a bar in “Debt maturing by year” to see its amount.",
              go: portfolio,
              shot: CHARTS,
              marks: [
                { sel: chart("Debt by rate type") + " >> svg", label: "Debt by rate type", text: "Today’s balance split into fixed, hybrid ARM and floating; the total in the middle." },
                { sel: chart("Debt by rate type") + " >> text=Floating", label: "Legend", text: "Each type’s color and its balance." },
                { sel: chart("Debt maturing by year") + " >> .group >> nth=0", label: "A year’s maturities", text: "What comes due that year. Amber = in the next two years, green = later." },
                { sel: chart("Coverage vs targets") + " >> text=Portfolio DSCR", label: "Portfolio DSCR", text: "The bar is the portfolio’s figure, the thin dark line your minimum DSCR. Green clears it, amber is close, red is off." },
                { sel: "#gaugeLtv", label: "Portfolio LTV", text: "Balance ÷ value (value = NOI ÷ cap rate), against your maximum LTV: lower is better here." },
                { sel: chart("Coverage vs targets") + " >> text=Portfolio Debt Yield", label: "Portfolio Debt Yield", text: "Against your minimum debt yield." },
                { sel: chart("Coverage vs targets") + " >> text=Off a target", label: "Off a target", text: "Every property that misses a target; “no NOI” means its T12 or NOI isn’t in yet." }
              ] }
          ] },
        { title: "Coverage",
          text: "See [Check each property’s coverage](check-coverage).",
          views: [
            { title: "The Coverage table",
              text: "One row per property (a senior loan and its mezzanine count as one), worst DSCR first; properties with no NOI yet at the bottom. The picture shows the first rows.",
              go: async (h) => { await portfolio(h); await firstRows(h, COV, 7); },
              shot: COV,
              marks: [
                { sel: COV + " h3", label: "Coverage", text: "DSCR, debt yield and LTV per property, against your targets." },
                { sel: "#poolRefiBtn", label: "Create a portfolio…", text: "Puts several properties under one new loan (below)." },
                { sel: COV + " thead th >> nth=1", label: "NOI", text: "The property’s yearly net operating income." },
                { sel: COV + " thead th >> nth=2", label: "DSCR", text: "NOI ÷ yearly loan payments. Green clears the target, amber is close, red is off." },
                { sel: COV + " thead th >> nth=3", label: "Debt Yield", text: "NOI ÷ balance." },
                { sel: COV + " thead th >> nth=4", label: "LTV", text: "Balance ÷ value (value = NOI ÷ cap rate)." },
                { sel: COV + " thead th >> nth=5", label: "Current", text: "The rate the property pays now (blended across its loans)." },
                { sel: COV + " thead th >> nth=6", label: "Market", text: "What the same loan would cost today, from today’s rates." },
                { sel: COV + " thead th >> nth=7", label: "Gap", text: "Current minus Market. Green (more than 0.25%): worth looking at a refinance." },
                { sel: COV + " tbody >> text=clears >> nth=0", label: "Clears", text: "Meets all three targets." },
                { sel: COV + " tbody >> text=off target >> nth=0", label: "Off target", text: "Misses at least one target." },
                { sel: COV + " tbody >> text=needs T12/NOI >> nth=0", label: "Needs T12/NOI", text: "No NOI yet: add the T12 in Underwriting, or type the NOI (Add NOI)." },
                { sel: COV + " [data-covpath] >> nth=0", label: "Refi path", text: "Opens the refinance for this property, all its loans together." },
                { sel: COV + " [data-covnoi] >> nth=0", label: "Add NOI", text: "Type the property’s NOI (below)." }
              ] },
            { title: "Add NOI",
              text: "For a property with no NOI yet. The figure in the picture is made up and was not saved.",
              go: async (h) => { await portfolio(h); await h.click(COV + " [data-covnoi] >> nth=0", { wait: 500 }); await h.fill("#noiField", "9,850,000", { change: false }); },
              shot: "#noiModal > div",
              marks: [
                { sel: "#noiTitle", label: "Annual NOI", text: "This window asks for one property’s NOI." },
                { sel: "#noiField", label: "Property annual NOI", text: "The yearly NOI in dollars, from the property’s operating statement. It must be more than $0." },
                { sel: "#capField", label: "Cap rate", text: "Used to estimate the value (NOI ÷ cap rate), and so the LTV. Filled in by property type; change it if you have a better figure." },
                { sel: "#noiCancel", label: "Cancel", text: "Closes without saving." },
                { sel: "#noiSave", label: "Continue", text: "Saves the NOI and cap rate; the table and the totals update." }
              ],
              after: async (h) => { await h.click("#noiCancel", { wait: 400 }); } },
            { title: "Create a portfolio…",
              text: "Puts several properties under one new loan. **Create the portfolio** opens the refinance of them together; nothing changes until you save the new loan there. See [Refinance several loans together](refinance-together).",
              go: async (h) => { await portfolio(h); await h.click("#poolRefiBtn", { wait: 600 }); },
              shot: "#poolPicker > div",
              marks: [
                { sel: "#poolPicker h3", label: "Create a portfolio", text: "One new loan on several properties." },
                { sel: "#poolPickSearch", label: "Find a property", text: "Type part of a name to shorten the list." },
                { sel: "#poolPicker [data-poolpick] >> nth=0", label: "Tick", text: "Tick each property the new loan will cover." },
                { sel: "#poolPicker [data-poolpickrow] >> nth=0 >> .text-right", label: "Owes / NOI", text: "What is owed on the property today (or “no loan yet”), and the NOI the refinance would use: its T12’s or its approved underwriting’s, or “no T12”." },
                { sel: "#poolPickNote", label: "Totals", text: "How many are ticked, the loans that would be paid off and what they owe, and the NOI together; or which ones have no T12 yet." },
                { sel: "#poolPickCancel", label: "Cancel", text: "Closes the list." },
                { sel: "#poolPickGo", label: "Create the portfolio", text: "Opens the refinance of the ticked properties." }
              ],
              after: async (h) => { await h.click("#poolPickCancel", { wait: 300 }).catch(() => {}); } }
          ] },
        { title: "Debt-Service Forecast",
          views: [
            { text: "Each bar is a year’s debt service (principal and interest plus escrows and fees), from this year on. Point at a bar to see its amount. See [See the forecast and a rate shock](see-the-forecast).",
              go: portfolio,
              shot: FC,
              marks: [
                { sel: FC + " h3", label: "Debt-Service Forecast", text: "Yearly debt service ahead." },
                { sel: FC + ' [data-fcy="1"]', label: "1yr", text: "One bar per year (shown)." },
                { sel: FC + ' [data-fcy="3"]', label: "3yr", text: "One bar per three years." },
                { sel: FC + ' [data-fcy="5"]', label: "5yr", text: "One bar per five years." },
                { sel: FC + ' [data-fc="0"]', label: "Recurring", text: "Regular payments only (shown)." },
                { sel: FC + ' [data-fc="1"]', label: "+ Payoffs", text: "Stacks the balloons due on top of each bar, with a key under the chart." },
                { sel: FC + " .group >> nth=0", label: "This year", text: "This year’s debt service: darker, with its label in bold." }
              ] }
          ] },
        { title: "Rate Shock",
          views: [
            { text: "What happens to your payments if rates move. Fixed loans don’t move; floating loans move at once; hybrid ARMs move only when they reset.",
              go: portfolio,
              shot: SHOCK,
              marks: [
                { sel: SHOCK + " h3", label: "Rate Shock", text: "How much of the book is floating or ARM, and what share that is." },
                { sel: SHOCK + " .rounded-full.overflow-hidden", label: "Fixed / ARM / Floating", text: "The book split by rate type: green fixed, amber ARM, red floating." },
                { sel: SHOCK + " table", label: "Scenarios", text: "−100 bps, Today, +100 bps, +200 bps (100 bps = 1%): blended rate, monthly debt service, and interest per year more (red) or less (green) than today." },
                { sel: SHOCK + " >> text=Every", label: "In plain words", text: "What each +1% costs per year, and its share of your yearly debt service." },
                { sel: SHOCK + " >> text=floats now", label: "Now or at reset", text: "How much moves at once (floating) and how much only when the ARMs reset." },
                { sel: SHOCK + " >> text=Most exposed", label: "Most exposed", text: "The largest floating and ARM loans." }
              ] }
          ] },
        { title: "Portfolio detail",
          text: "Every loan, grouped by property, largest balance first. See [Find a loan in the portfolio](find-a-loan).",
          views: [
            { title: "The Properties table",
              text: "A property with one loan is one row; click it to open the loan. A property with a senior and a mezzanine loan is one bold row: click it to show its loans. Properties with no loan yet are at the bottom. The picture shows the first rows.",
              go: async (h) => { await portfolio(h); await firstRows(h, PROPS, 9); await at(h, PV + " > div:nth-child(7)", 50); },
              shot: "view",
              marks: [
                { sel: PV + " > div:nth-child(7) h2", label: "Portfolio detail", text: "Every loan, grouped by property." },
                { sel: PROPS + " h3", label: "Properties", text: "The table." },
                { sel: "#lenderConc", label: "Top lender", text: "Which lender holds the most of your debt, and its share." },
                { sel: "#lenderDD > summary", label: "All lenders", text: "Filters the table by lender (below)." },
                { sel: PROPS + " tr[data-proptoggle] >> nth=0", label: "A property with 2 loans", text: "Click to show (or hide) its loans. Its row shows the combined balance, blended rate and total monthly P&I." },
                { sel: PROPS + " tbody tr[data-goto]:not([data-propmember]) >> nth=0", label: "A one-loan property", text: "Click to open its loan." },
                { sel: PROPS + " tbody tr[data-goto]:not([data-propmember]) >> nth=0 >> span.uppercase", label: "Status", text: "The loan’s status (Active, or a flag such as Out of date).", optional: true }
              ] },
            { title: "Filter by lender",
              text: "Tick one or more lenders and the table keeps only their properties.",
              go: async (h) => { await portfolio(h); await at(h, PROPS, 50); await h.click("#lenderDD > summary", { wait: 400 }); await h.click('[data-lenderopt="Bank Hapoalim B.M."]', { wait: 500 }); },
              shot: "view",
              marks: [
                { sel: "#lenderDD >> text=Filter by lender", label: "Filter by lender", text: "Every lender in the book." },
                { sel: '[data-lenderopt="Bank Hapoalim B.M."]', label: "Ticked", text: "Only this lender’s loans are shown." },
                { sel: "#lenderDD label >> nth=1 >> span.tabular-nums", label: "Balance", text: "What is owed to that lender." },
                { sel: "#lenderClear", label: "Clear", text: "Shows every lender again." },
                { sel: "#lenderSum", label: "1 lender", text: "How many lenders are picked." },
                { sel: "#lenderConc", label: "Share", text: "Their share of the whole book." }
              ],
              after: async (h) => { await h.click("#lenderClear", { wait: 300 }).catch(() => {}); await h.closeModals(); } }
          ] },
        { title: "Removed, paid-off and archived",
          text: "At the bottom of the page: what was taken out of the totals. See [Bring back a removed loan or property](bring-back-removed). Here a sample loan was removed and a sample property archived.",
          prep: removeSamples,
          views: [
            { text: "A loan you remove (in its Loan Record) or mark as paid off is listed in the grey strip. A property you archive (**Remove** under Specific Property) leaves the lists, the totals and the count with all its loans, and is listed in the amber strip; its files stay.",
              go: async (h) => { await portfolio(h); await at(h, "#inactiveLoansStrip", 300); },
              shot: "view",
              marks: [
                { sel: "#inactiveLoansStrip >> text=Removed & paid-off loans", label: "Removed & paid-off loans", text: "How many loans are out of the totals." },
                { sel: "#inactiveLoansStrip [data-restoreloan] >> xpath=preceding-sibling::span[1]", label: "The loan", text: "Its name, its status (Removed or Paid off) and the date." },
                { sel: "#inactiveLoansStrip [data-restoreloan]", label: "Restore", text: "Puts it back in every total, tile and the calendar." },
                { sel: "#inactiveLoansStrip [data-deleteloan]", label: "Delete permanently", text: "The bin: deletes the loan record (it asks first)." },
                { sel: ARCH + " span.uppercase", label: "Archived", text: "How many properties are archived." },
                { sel: ARCH + " [data-unarchive] >> nth=0", label: "Un-archive", text: "Click the name: the property and its loans come back to the lists, the totals and the count." },
                { sel: ARCH + " [data-harddelete] >> nth=0", label: "Delete permanently", text: "The bin: deletes the property and its files (it asks first)." }
              ] }
          ] },
        { title: "Adding a property",
          text: "**Add Property** is on the **Specific Property** side of the switch under the tabs. A new property joins this page at once. See [Add a property](add-a-property).",
          views: [
            { title: "The Add Property window",
              text: "A name is enough: its loans, T12, rent roll and documents can come later.",
              go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 800 }); await h.click("#addPropBtn", { wait: 500 }); await h.fill("#addPropName", NEW, { change: false }); },
              shot: "#addPropModal > div",
              marks: [
                { sel: "#addPropModal h3", label: "Add a property", text: "Adds a property to the portfolio." },
                { sel: "#addPropName", label: "Property name", text: "The name only (a made-up one here). Empty, the window asks for one." },
                { sel: "#addPropCancel", label: "Cancel", text: "Closes without adding anything." },
                { sel: "#addPropCreate", label: "Create", text: "Adds the property." }
              ] },
            { title: "A new property on this page",
              text: "It sits at the bottom of the Properties table, marked No loan yet. It also counts in the property count, and in coverage once it has an NOI.",
              go: async (h) => { await h.click("#addPropCreate", { wait: 1500 }); await portfolio(h); await center(h, PROPS + " tr[data-openprop]"); },
              shot: "view",
              marks: [
                { sel: PROPS + " tr[data-openprop]", label: "The new property", text: "Click to open it in Underwriting, where its T12 goes and its loan can be added." },
                { sel: PROPS + " tr[data-openprop] >> text=No loan yet", label: "No loan yet", text: "It has no loan yet." }
              ] },
            { title: "A name like one you have",
              text: "A name like a property you already have asks first. (The exact name of a property you have isn’t added twice; the name of one of your loans offers to add a loan to that property instead.)",
              go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 800 }); await h.click("#addPropBtn", { wait: 500 }); await h.fill("#addPropName", "Mews at Princeton", { change: false }); await h.click("#addPropCreate", { wait: 800 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Similar to …", text: "The property it looks like." },
                { sel: "#confirmText", label: "Which one", text: "The name you typed and the one you already have." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing is added." },
                { sel: "#confirmAlt", label: "Create anyway", text: "Adds the new property: they are different buildings." },
                { sel: "#confirmOk", label: "Open it", text: "Opens the property you already have." }
              ],
              after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); await portfolio(h); } }
          ] }
      ] },

    // ==================================================================================================================
    { id: "bring-back-removed", kind: "howto", group: "Portfolio", title: "Bring back a removed loan or property",
      description: "Restore a removed or paid-off loan, or un-archive a property, from the bottom of the Portfolio page.",
      intro: "A loan you remove or mark as paid off, and a property you archive, leave every total but are kept. The bottom of the Portfolio page lists them: bring one back exactly as it was, or delete it for good.",
      prep: removeSamples,
      sections: [
        { title: "Find what was removed",
          steps: [
            { text: "On the **Portfolio** tab, scroll to the bottom. Removed and paid-off loans are in the grey strip; archived properties are in the amber strip.",
              go: async (h) => { await portfolio(h); await at(h, "#inactiveLoansStrip", 300); },
              shot: "view",
              marks: [
                { sel: "#inactiveLoansStrip [data-restoreloan] >> xpath=preceding-sibling::span[1]", label: "A removed loan", text: "Its name, Removed or Paid off, and the date." },
                { sel: "#inactiveLoansStrip [data-restoreloan]", label: "Restore", text: "Brings the loan back." },
                { sel: ARCH + " [data-unarchive] >> nth=0", label: "An archived property", text: "Click its name to bring it back." }
              ] }
          ] },
        { title: "Bring it back",
          steps: [
            { text: "For a loan, click **Restore**. It goes back into every total, tile and the calendar, exactly as it was." },
            { text: "For a property, click its name in the **Archived** strip. The property and its loans come back to the lists, the totals and the property count, with its files." }
          ] },
        { title: "Delete one for good",
          steps: [
            { text: "Click the bin next to the loan. It asks first.",
              go: async (h) => { await h.click("#inactiveLoansStrip [data-deleteloan]", { wait: 500 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Delete permanently?", text: "The loan it is about." },
                { sel: "#confirmText", label: "What happens", text: "Gone for good; the automatic backups keep a copy. The property stays, with its files." },
                { sel: "#confirmCancel", label: "Cancel", text: "Keeps the loan in the list." },
                { sel: "#confirmOk", label: "Delete permanently", text: "Deletes the record." }
              ],
              after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } },
            { text: "For an archived property, click the bin next to its name. The window lists what will be deleted with it.",
              go: async (h) => { await portfolio(h); await h.click(ARCH + " [data-harddelete] >> nth=0", { wait: 800 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Delete permanently?", text: "Here, an archived property." },
                { sel: "#confirmText", label: "What is deleted", text: "The property with its loans and its files. Portfolio chats that mention it are kept." },
                { sel: "#confirmCancel", label: "Cancel", text: "Keeps it archived." },
                { sel: "#confirmOk", label: "Delete permanently", text: "Deletes it for good." }
              ],
              after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } },
            { text: "Click **Delete permanently**, or **Cancel** to keep it." }
          ],
          warning: "Delete permanently can’t be undone in the app. Only a backup brings it back: the automatic backups keep a copy. See [Back up and restore](back-up-and-restore)." }
      ],
      next: [
        { page: "remove-a-loan", text: "Remove a loan from its Loan Record." },
        { page: "archive-or-delete-a-property", text: "Archive a property." },
        { page: "back-up-and-restore", text: "Bring back something deleted, from a backup." }
      ] }
  ]
};
// keep the pointer off the picture: hover colors would show on whatever is under it
SPEC.pages.forEach(p => (p.sections || []).forEach(s => (s.steps || []).concat(s.views || []).forEach(x => { const go = x.go; x.go = async (h) => { if (go) await go(h); await h.page.mouse.move(1, 1).catch(() => {}); }; })));
module.exports = SPEC;
