/* Guide chapter: Portfolio (Home) — Needs Attention, the totals, the charts, coverage per property, the debt-service
   forecast, rate shock, every loan by property, removed and archived items, and Add Property. The pictures use the
   app's built-in sample loans and one made-up property ("Sample Lofts (example)"); an NOI typed in a picture is a
   made-up figure and is never saved. The last topic removes one sample loan and archives one sample property. */
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
const wide = async (h, on) => { await h.ctx.setSize(on ? 1920 : h.ctx.W, h.ctx.H); await h.wait(600); await h.calm(); };
const confirmBox = "#confirmModal > div";

module.exports = {
  id: "home",
  title: "Portfolio (Home)",
  intro: "The Portfolio tab: what needs attention, the totals, the charts, coverage per property, the debt-service forecast, rate shock, and every loan grouped by property.",
  setup: async (h) => { await portfolio(h); },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "attention", title: "Needs Attention", intro: "The strip at the top: what is coming up in your loans, and which loans look worth refinancing.",
      before: async (h) => { await wide(h, true); await portfolio(h); },
      steps: [
        { title: "The cards", cover: true,
          text: "Needs Attention lists, soonest first: balloons coming due in the next 24 months (Maturity), interest-only periods ending in the next 12 months (IO step-up), adjustable-rate resets in the next 12 months (ARM reset), and loans you flagged as out of date (Out of date). After those come the loans priced above today’s market (Refi). A card with a pink outline is three months away or less. Scroll the strip sideways to see every card. The picture is taken on a wide window so more cards show.",
          go: async (h) => { await portfolio(h); },
          shot: "view",
          marks: [
            { sel: "#alertsRail >> text=Needs Attention", label: "Needs Attention", text: "The strip’s title; the red number is how many cards there are." },
            { sel: "#alertsRail [data-alert-goto] >> nth=0", label: "ARM reset (amber)", text: "An adjustable rate resets soon: the new rate and the date." },
            { sel: "#alertsRail [data-alert-goto] >> nth=1", label: "Maturity (red)", text: "A loan comes due: the balloon to pay off and the date." },
            { sel: "#alertsRail [data-alert-goto] >> nth=3", label: "IO step-up (orange)", text: "An interest-only period ends: the new monthly payment and the date it starts." }
          ] },
        { title: "Refinance cards",
          text: "At the end of the strip are green Refi cards: loans whose rate is more than 0.25% above what the same loan would cost today. Each says by how much. Click one to open the refinance for that loan.",
          go: async (h) => { await h.js(() => { const r = document.querySelector("#alertsRail .overflow-x-auto"); if (r) r.scrollLeft = r.scrollWidth; }); await h.wait(300); },
          shot: "view",
          marks: [
            { sel: "#alertsRail [data-alert-refi] >> nth=0", label: "Refi (green)", text: "Priced above today’s market — click to open its refinance." },
            { sel: "#alertsRail [data-alert-refi] >> nth=1", label: "Another Refi card", text: "Sorted by how far above market, the biggest gap first." }
          ] },
        { title: "Click a date card",
          text: "Click a Maturity, IO step-up or ARM reset card: the app switches to Specific Property, opens that loan and brings its payment schedule to the month of the event, lit up for a few seconds. Scroll up and click Whole Portfolio to come back.",
          go: async (h) => { await portfolio(h); await h.click("#alertsRail [data-alert-goto] >> nth=1", { wait: 900 }); await center(h, "#scheduleBody tr.ring-2"); await h.calm(); },
          shot: "view",
          marks: [
            { sel: "#scheduleBody tr.ring-2", label: "That month", text: "The payment where the event happens (here the final payment with the balloon), lit up for a few seconds." },
            { sel: "#scheduleBody tr.ring-2 >> text=pays", label: "Pays on", text: "The date the payment is due — the date on the card." }
          ],
          after: async (h) => { await portfolio(h); } },
        { title: "Click a refinance card",
          text: "Click a Refi card and the refinance analysis opens for that loan: what it would cost today, and whether to refinance. The Refinance chapter explains that page. Close takes you back.",
          go: async (h) => { await h.js(() => { const r = document.querySelector("#alertsRail .overflow-x-auto"); if (r) r.scrollLeft = r.scrollWidth; }); await h.click("#alertsRail [data-alert-refi] >> nth=0", { wait: 1500 }); await h.calm(); await top(h); },
          shot: "view",
          marks: [
            { sel: "#refiView h2", label: "Refinance Analysis", text: "The refinance for the loan on the card (the Refinance chapter)." },
            { sel: "#refiCloseBtn", label: "Close", text: "Back to where you were." }
          ],
          after: async (h) => { await h.click("#refiCloseBtn", { wait: 600 }).catch(() => {}); await wide(h, false); await portfolio(h); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "totals", title: "The totals", intro: "The four tiles under the heading: the whole book in four numbers.",
      steps: [
        { title: "The four tiles",
          text: "The tiles are figures to read, not buttons. Every active loan counts; removed, paid-off and archived ones don’t. Portfolio DSCR = the total NOI of every property ÷ the total yearly principal-and-interest payments of every loan (during an interest-only period the full amortizing payment is used). Portfolio debt yield = total NOI ÷ total balance. A property with no NOI yet counts as $0 NOI — so its debt pulls both numbers down — and the tile says how many such properties there are. The targets (1.25×, 8% …) are set in Settings.",
          go: async (h) => { await portfolio(h); await at(h, PV + " > div:nth-child(1)", 60); },
          shot: "view",
          marks: [
            { sel: PV + " > div:nth-child(1) p", label: "29 loans", text: "How many active loans the page covers." },
            { sel: PV + " > div:nth-child(1) >> text=priced above market", label: "Priced above market", text: "How many properties pay more than 0.25% above today’s market rate (the Refi cards in Needs Attention)." },
            { sel: KPI + " > div:nth-child(1)", label: "Total Debt Outstanding", text: "What is owed today on every loan; under it, the number of loans and what they were when first made." },
            { sel: KPI + " > div:nth-child(2)", label: "Weighted-Avg Rate", text: "The average interest rate, weighted by balance; under it, the total monthly debt service (payments plus escrows and fees)." },
            { sel: KPI + " > div:nth-child(3)", label: "Portfolio DSCR", text: "Total NOI ÷ total yearly loan payments, against your minimum DSCR target." },
            { sel: KPI + " > div:nth-child(4)", label: "Portfolio Debt Yield", text: "Total NOI ÷ total balance, against your minimum debt-yield target." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "charts", title: "The charts", intro: "Three charts: what kind of debt you have, when it comes due, and how the portfolio stands against its targets.",
      steps: [
        { title: "Rate type, maturities and targets",
          text: "Point at a bar in “Debt maturing by year” to see its amount. In “Coverage vs targets” each bar is the portfolio’s figure and the thin dark line is your target: green clears it, amber is close, red is off. Under the bars, every property that is off a target is named — “no NOI” means its T12 or NOI hasn’t been added yet.",
          go: async (h) => { await portfolio(h); await at(h, CHARTS, 60); },
          shot: "view",
          marks: [
            { sel: chart("Debt by rate type") + " >> svg", label: "Debt by rate type", text: "Today’s balance split into fixed, hybrid ARM and floating; the total in the middle." },
            { sel: chart("Debt by rate type") + " >> text=Floating", label: "Legend", text: "Each type’s colour and its balance." },
            { sel: chart("Debt maturing by year") + " >> .group >> nth=0", label: "A year’s maturities", text: "What comes due that year. Amber = in the next two years, green = later." },
            { sel: chart("Coverage vs targets") + " >> text=Portfolio DSCR", label: "Portfolio DSCR", text: "Against your minimum DSCR." },
            { sel: "#gaugeLtv", label: "Portfolio LTV", text: "Balance ÷ value (value = NOI ÷ cap rate), against your maximum LTV — lower is better here." },
            { sel: chart("Coverage vs targets") + " >> text=Portfolio Debt Yield", label: "Portfolio Debt Yield", text: "Against your minimum debt yield." },
            { sel: chart("Coverage vs targets") + " >> text=Off a target", label: "Off a target", text: "Every property that misses a target or has no NOI yet." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "coverage", title: "Coverage per property", intro: "The table of every property against the three targets, with its rate against today’s market — and what to do next for each.",
      steps: [
        { title: "The coverage table",
          text: "One row per property (a senior loan and its mezzanine count as one), worst DSCR first; properties with no NOI yet are at the bottom. The picture shows the first rows — the table lists every property. Current is the property’s rate today, Market is what the same loan would cost now, and Gap is the difference (green when it is more than 0.25% above market).",
          go: async (h) => { await portfolio(h); await firstRows(h, COV, 7); },
          shot: COV,
          marks: [
            { sel: COV + " h3", label: "Coverage", text: "DSCR, debt yield and LTV per property, against your targets." },
            { sel: "#poolRefiBtn", label: "Create a portfolio…", text: "Put several properties under one new loan (last step of this topic)." },
            { sel: COV + " thead th >> nth=1", label: "NOI", text: "The property’s yearly net operating income." },
            { sel: COV + " thead th >> nth=2", label: "DSCR", text: "NOI ÷ yearly loan payments. Green clears the target, amber is close, red is off." },
            { sel: COV + " thead th >> nth=3", label: "Debt Yield", text: "NOI ÷ balance." },
            { sel: COV + " thead th >> nth=4", label: "LTV", text: "Balance ÷ value (value = NOI ÷ cap rate)." },
            { sel: COV + " thead th >> nth=5", label: "Current", text: "The rate the property pays now (blended across its loans)." },
            { sel: COV + " thead th >> nth=6", label: "Market", text: "What the same loan would cost today, from today’s rates." },
            { sel: COV + " thead th >> nth=7", label: "Gap", text: "Current minus Market. Green: worth looking at a refinance." },
            { sel: COV + " tbody >> text=clears >> nth=0", label: "Clears", text: "Meets all three targets." },
            { sel: COV + " tbody >> text=off target >> nth=0", label: "Off target", text: "Misses at least one target." },
            { sel: COV + " tbody >> text=needs T12/NOI >> nth=0", label: "Needs T12/NOI", text: "No NOI yet — add the T12 in Underwriting, or type the NOI (Add NOI)." },
            { sel: COV + " [data-covpath] >> nth=0", label: "Refi path", text: "Opens the refinance for this property." },
            { sel: COV + " [data-covnoi] >> nth=0", label: "Add NOI", text: "Type the property’s NOI (next step)." }
          ] },
        { title: "Add NOI",
          text: "Click Add NOI on a property with no NOI. Type its yearly NOI, and the cap rate if you have a better one than the default for its type (value = NOI ÷ cap rate, which gives the LTV). Continue saves both; the row then shows its DSCR, debt yield and LTV, and every total on the page counts it. Cancel closes without saving. (The figure in the picture is made up and was not saved.)",
          go: async (h) => { await portfolio(h); await h.click(COV + " [data-covnoi] >> nth=0", { wait: 500 }); await h.fill("#noiField", "9,850,000", { change: false }); },
          shot: "#noiModal > div",
          marks: [
            { sel: "#noiTitle", label: "Annual NOI", text: "This window asks for one property’s NOI." },
            { sel: "#noiField", label: "Property annual NOI", text: "The yearly NOI in dollars, from the property’s operating statement. It must be more than $0." },
            { sel: "#capField", label: "Cap rate", text: "Used to estimate the value (NOI ÷ cap rate) and so the LTV. Filled in by property type; change it if you have a better figure." },
            { sel: "#noiCancel", label: "Cancel", text: "Closes without saving." },
            { sel: "#noiSave", label: "Continue", text: "Saves the NOI and cap rate; the table and the totals update." }
          ],
          after: async (h) => { await h.click("#noiCancel", { wait: 400 }); } },
        { title: "Refi path",
          text: "Click Refi path on a property that has an NOI: the refinance analysis opens for that property (all its loans together when it has more than one). The Refinance chapter explains that page. Close brings you back.",
          go: async (h) => { await portfolio(h); await h.click(COV + " [data-covpath] >> nth=0", { wait: 1500 }); await h.calm(); await top(h); },
          shot: "view",
          marks: [
            { sel: "#refiView h2", label: "Refinance Analysis", text: "The refinance for that property." },
            { sel: "#refiCloseBtn", label: "Close", text: "Back to the Portfolio page." }
          ],
          after: async (h) => { await h.click("#refiCloseBtn", { wait: 600 }).catch(() => {}); await portfolio(h); } },
        { title: "Create a portfolio…",
          text: "“Create a portfolio…” is for putting several properties under one new loan. It opens this list: tick every property the new loan will cover (type in the box to find one). Under the list the app adds up what is owed on them and their NOI, and names any property with no NOI yet. Create the portfolio opens the refinance of them together — nothing changes until you save the new loan there (the Refinance chapter). Cancel closes the list.",
          go: async (h) => { await portfolio(h); await h.click("#poolRefiBtn", { wait: 600 }); },
          shot: "#poolPicker > div",
          marks: [
            { sel: "#poolPicker h3", label: "Create a portfolio", text: "One new loan on several properties." },
            { sel: "#poolPickSearch", label: "Find a property", text: "Type part of a name to shorten the list." },
            { sel: "#poolPicker [data-poolpick] >> nth=0", label: "Tick", text: "Tick each property the new loan will cover." },
            { sel: "#poolPicker [data-poolpickrow] >> nth=0 >> .text-right", label: "Owes / NOI", text: "What is owed on the property today, and its NOI (or “no NOI” when its T12 isn’t in yet)." },
            { sel: "#poolPickNote", label: "Totals", text: "How many are ticked, the loans that would be paid off and what they owe, and the NOI together." },
            { sel: "#poolPickCancel", label: "Cancel", text: "Closes the list." },
            { sel: "#poolPickGo", label: "Create the portfolio", text: "Opens the refinance of the ticked properties (tick at least two)." }
          ],
          after: async (h) => { await h.click("#poolPickCancel", { wait: 300 }).catch(() => {}); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "forecast", title: "Forecast and rate shock", intro: "What the book will cost to carry in the years ahead, and what a rise in rates would do.",
      steps: [
        { title: "Debt-Service Forecast",
          text: "Each bar is a year’s debt service (principal and interest plus escrows and fees), from this year on; this year’s bar is darker and its label bold. Point at a bar to see its amount. 1yr / 3yr / 5yr groups the years into one-, three- or five-year bars. Recurring shows only the regular payments; + Payoffs adds the balloons coming due on top of each bar.",
          go: async (h) => { await portfolio(h); },
          shot: FC,
          marks: [
            { sel: FC + " h3", label: "Debt-Service Forecast", text: "Yearly debt service ahead." },
            { sel: FC + ' [data-fcy="1"]', label: "1yr", text: "One bar per year (shown)." },
            { sel: FC + ' [data-fcy="3"]', label: "3yr", text: "One bar per three years." },
            { sel: FC + ' [data-fcy="5"]', label: "5yr", text: "One bar per five years." },
            { sel: FC + ' [data-fc="0"]', label: "Recurring", text: "Regular payments only (shown)." },
            { sel: FC + ' [data-fc="1"]', label: "+ Payoffs", text: "Adds the balloons due (next step)." },
            { sel: FC + " .group >> nth=0", label: "This year", text: "This year’s debt service." }
          ] },
        { title: "Three-year bars with payoffs",
          text: "Here 3yr and + Payoffs are on: each bar covers three years, and the dark part on top is the balloons that come due in those years. The key under the chart names the two colours.",
          go: async (h) => { await h.click(FC + ' [data-fcy="3"]', { wait: 500 }); await h.click(FC + ' [data-fc="1"]', { wait: 500 }); },
          shot: FC,
          marks: [
            { sel: FC + ' [data-fcy="3"]', label: "3yr", text: "On: three-year bars." },
            { sel: FC + ' [data-fc="1"]', label: "+ Payoffs", text: "On: balloons stacked on top." },
            { sel: FC + " .group >> nth=1", label: "A three-year bar", text: "Green: debt service. Dark: balloons due." },
            { sel: FC + " div.mt-3", label: "Key", text: "Which colour is which." }
          ],
          after: async (h) => { await h.click(FC + ' [data-fcy="1"]', { wait: 300 }); await h.click(FC + ' [data-fc="0"]', { wait: 300 }); } },
        { title: "Rate Shock",
          text: "What happens to your payments if rates move. Fixed loans don’t move; floating loans move at once; hybrid ARMs move only when they reset. The table shows the blended rate, the monthly debt service and the extra (or saved) interest per year if rates fall 1%, stay, or rise 1% or 2%.",
          go: async (h) => { await portfolio(h); },
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
    // ------------------------------------------------------------------------------------------------------------------
    { id: "detail", title: "Every loan, by property", intro: "Portfolio detail: one row per property, its loans under it, and a filter by lender.",
      steps: [
        { title: "The Properties table",
          text: "Every property, largest balance first. A property with one loan is one row; click it to open that loan. A property with a senior loan and a mezzanine shows one bold row with the number of loans — click it to show them. Properties with no loan yet are at the bottom. The picture shows the first rows.",
          go: async (h) => { await portfolio(h); await firstRows(h, PROPS, 9); await at(h, PV + " > div:nth-child(7)", 50); },
          shot: "view",
          marks: [
            { sel: PV + " > div:nth-child(7) h2", label: "Portfolio detail", text: "Every loan, grouped by property." },
            { sel: PROPS + " h3", label: "Properties", text: "The table." },
            { sel: "#lenderConc", label: "Top lender", text: "Which lender holds the most of your debt, and its share." },
            { sel: "#lenderDD > summary", label: "All lenders", text: "Filter the table by lender (a later step)." },
            { sel: PROPS + " tr[data-proptoggle] >> nth=0", label: "A property with 2 loans", text: "Click to show (or hide) its loans. Its row shows the combined balance, blended rate and total monthly P&I." },
            { sel: PROPS + " tbody tr[data-goto]:not([data-propmember]) >> nth=0", label: "A one-loan property", text: "Click to open its loan." },
            { sel: PROPS + " tbody tr[data-goto]:not([data-propmember]) >> nth=0 >> span.uppercase", label: "Status", text: "The loan’s status (Active, or a flag such as Out of date).", optional: true }
          ] },
        { title: "Show a property’s loans",
          text: "Clicking the bold row opens it: each loan is listed under it, marked Senior or Mezz, with its own lender, type, balance, rate, payment and maturity. Click the bold row again to close it. Click a loan to open it.",
          go: async (h) => { await portfolio(h); await h.click(PROPS + " tr[data-proptoggle] >> nth=0", { wait: 400 }); await firstRows(h, PROPS, 11); await at(h, PROPS, 50); },
          shot: "view",
          marks: [
            { sel: PROPS + " tr[data-proptoggle] >> nth=0", label: "Open property", text: "Click again to close it." },
            { sel: PROPS + ' tr[data-propmember="0"] >> nth=0', label: "Senior loan", text: "The first-lien loan. Click to open it." },
            { sel: PROPS + ' tr[data-propmember="0"] >> nth=1', label: "Mezz loan", text: "The mezzanine loan behind it. Click to open it." }
          ] },
        { title: "Open a loan",
          text: "Clicking a loan opens it on the Specific Property side: its figures, its payment schedule and the property’s profile (the property chapters explain that page). Click Whole Portfolio to come back.",
          go: async (h) => { await h.click(PROPS + ' tr[data-propmember="0"] >> nth=0', { wait: 1200 }); await h.calm(); await top(h); },
          shot: "view",
          marks: [
            { sel: "#scopeLoanBtn", label: "Specific Property", text: "Now showing one property." },
            { sel: "#loanSelect", label: "The loan", text: "The loan you clicked; pick another here." },
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the Portfolio page." }
          ],
          after: async (h) => { await portfolio(h); } },
        { title: "Filter by lender",
          text: "Click All lenders: every lender is listed with its total balance. Tick one or more and the table keeps only their properties (a property with two loans opens to show the matching one). The button and the line beside it say how many lenders are picked and their share of the book. Clear takes the filter off.",
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
    // ------------------------------------------------------------------------------------------------------------------
    { id: "addprop", title: "Add a property", intro: "Add a property from the Portfolio page — a name is enough to start.",
      steps: [
        { title: "Add Property",
          text: "Click Specific Property, then Add Property. Type the property’s name and click Create. That is all it needs: its loans, T12, rent roll and documents can come later. The property is added to the portfolio straight away.",
          go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 800 }); await h.click("#addPropBtn", { wait: 500 }); await h.fill("#addPropName", NEW, { change: false }); },
          shot: "#addPropModal > div",
          marks: [
            { sel: "#addPropModal h3", label: "Add a property", text: "Adds a property to the portfolio." },
            { sel: "#addPropName", label: "Property name", text: "The name only (a made-up one here)." },
            { sel: "#addPropCancel", label: "Cancel", text: "Closes without adding anything." },
            { sel: "#addPropCreate", label: "Create", text: "Adds the property." }
          ] },
        { title: "It joins the portfolio",
          text: "The new property is at the bottom of the Properties table, marked No loan yet. Click it to open it in Underwriting, where its T12 goes and its loan can be added. It also counts in the property count at the top, and in coverage, where its NOI will count once it has one.",
          go: async (h) => { await h.click("#addPropCreate", { wait: 1500 }); await portfolio(h); await center(h, PROPS + " tr[data-openprop]"); },
          shot: "view",
          marks: [
            { sel: PROPS + " tr[data-openprop]", label: "The new property", text: "Click to open it in Underwriting." },
            { sel: PROPS + " tr[data-openprop] >> text=No loan yet", label: "No loan yet", text: "It has no loan yet." }
          ] },
        { title: "A name it can’t take as is",
          text: "If the name is empty, the window asks for one. If the name is like a property you already have, the app asks first: Open it opens the one you have; Create anyway adds the new one; Cancel does nothing. (The exact name of a property you have isn’t added twice — the app says so. The name of one of your loans offers to add a loan to that property instead.)",
          go: async (h) => { await portfolio(h); await h.click("#scopeLoanBtn", { wait: 800 }); await h.click("#addPropBtn", { wait: 500 }); await h.fill("#addPropName", "Mews at Princeton", { change: false }); await h.click("#addPropCreate", { wait: 800 }); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Similar to …", text: "The property it looks like." },
            { sel: "#confirmText", label: "Which one", text: "The name you typed and the one you already have." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing is added." },
            { sel: "#confirmAlt", label: "Create anyway", text: "Adds the new property — they are different buildings." },
            { sel: "#confirmOk", label: "Open it", text: "Opens the property you already have." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); await portfolio(h); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "removed", title: "Removed, paid-off and archived", intro: "At the bottom of the page: loans and properties taken out of the totals, and how to bring them back.",
      before: async (h) => {
        // a built-in loan removed (Loan Record → Remove) and a built-in property archived (Specific Property → Remove)
        await h.openLoan(/Avalon WP \(Mezz\)/);
        await h.click("#loanRecRemove", { wait: 500 }); await h.click("#confirmOk", { wait: 1200 });
        await h.openLoan(/Weaver Mill/);
        await h.click("#removeBtn", { wait: 500 }); await h.click("#confirmOk", { wait: 1500 });
        await portfolio(h);
      },
      steps: [
        { title: "Removed loans and archived properties",
          text: "A loan you remove (on its Loan Record) or mark as paid off leaves every total, tile and the calendar, and is listed in the grey strip with its status and the date. Restore puts it back exactly as it was. A property you archive (Specific Property → Remove) leaves the lists, the totals and the count with all its loans, and is listed in the amber strip; its files stay. Click its name to bring it back. Each bin deletes for good — it asks first (next steps).",
          go: async (h) => { await portfolio(h); await at(h, "#inactiveLoansStrip", 300); },
          shot: "view",
          marks: [
            { sel: "#inactiveLoansStrip >> text=Removed & paid-off loans", label: "Removed & paid-off loans", text: "How many loans are out of the totals." },
            { sel: "#inactiveLoansStrip [data-restoreloan] >> xpath=preceding-sibling::span[1]", label: "The loan", text: "Its name, its status (Removed or Paid off) and the date." },
            { sel: "#inactiveLoansStrip [data-restoreloan]", label: "Restore", text: "Puts it back in every total, tile and the calendar." },
            { sel: "#inactiveLoansStrip [data-deleteloan]", label: "Delete permanently", text: "Deletes the loan record (asks first)." },
            { sel: ARCH + " span.uppercase", label: "Archived", text: "How many properties are archived." },
            { sel: ARCH + " [data-unarchive] >> nth=0", label: "Un-archive", text: "Click the name: the property and its loans come back to the lists, the totals and the count." },
            { sel: ARCH + " [data-harddelete] >> nth=0", label: "Delete permanently", text: "Deletes the property and its files (asks first)." }
          ] },
        { title: "Delete a loan permanently",
          text: "The bin asks first. Delete permanently removes the loan record for good — the app can’t undo it, but the automatic backups (Data menu) keep a copy. The property stays, with its files. Cancel leaves everything as it is.",
          go: async (h) => { await h.click("#inactiveLoansStrip [data-deleteloan]", { wait: 500 }); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Delete permanently?", text: "The loan it is about." },
            { sel: "#confirmText", label: "What happens", text: "Gone for good; the automatic backups keep a copy." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps the loan in the list." },
            { sel: "#confirmOk", label: "Delete permanently", text: "Deletes the record." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } },
        { title: "Delete an archived property",
          text: "The bin on an archived property lists what will be deleted — its loans and its files. It can’t be undone in the app; the automatic backups keep a copy, and portfolio chats that mention it are kept. Cancel leaves it archived.",
          go: async (h) => { await portfolio(h); await h.click(ARCH + " [data-harddelete] >> nth=0", { wait: 800 }); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Delete permanently?", text: "The property it is about." },
            { sel: "#confirmText", label: "What is deleted", text: "Everything that goes with it." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps it archived." },
            { sel: "#confirmOk", label: "Delete permanently", text: "Deletes it for good." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } }
      ] }
  ]
};
