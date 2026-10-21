/* Guide chapter: A loan’s page — opening a loan, every part of its page, adding and editing a loan, out of date,
   statuses, a senior + mezz stack, a pooled loan and its Release…, At the Reset, and removing a loan.
   Looking only: the app’s built-in sample loans (Queens Gate, M Lofts, Avalon White Plains). Everything that is
   added, changed or removed is MADE-UP: “Maple Court (example)”, “Aspen Yard (example)”, “Birch Commons (example)”,
   “Cedar Point (example)” and “Juniper Flats (example)”. */
"use strict";
const card = (sel) => sel + " >> xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' boxline ')][1]";
const FS = (name) => '#loanForm fieldset:has(legend:has-text("' + name + '"))';
const FW = (key) => '#loanForm [data-fieldwrap="' + key + '"]';
const REC = (name) => '#profileBody section:has(h3:has-text("' + name + '"))';
const TILE = (i) => ({ sel: "#kpiGrid > div", nth: i });
const SCHED = card("#scheduleBody");
const TH = (n) => "#scheduleBody >> xpath=../thead/tr/th[" + n + "]";
const RESET_ROW = '#scheduleBody tr:has(span:has-text("Reset →"))';
const CONFIRM = "#confirmModal > div";
const POOLROW = (name) => 'tr[data-poolmember]:has-text("' + name + '")';

// the thin green bar that follows the page's scroll is not part of any screen
const quiet = async (h) => { await h.js(() => { if (!document.getElementById("guideLoanQuiet")){ const s = document.createElement("style"); s.id = "guideLoanQuiet"; s.textContent = "#scrollProgress{display:none!important}"; document.head.appendChild(s); } }); };
// Specific Property, then a property from its list (by the name the list shows)
const pick = async (h, name) => {
  await h.home();
  await h.js(() => { document.getElementById("scopeLoanBtn").click(); }); await h.wait(400);
  await h.js((nm) => { const s = document.getElementById("loanSelect"); const o = [...s.options].find(x => x.text.split("·")[0].trim() === nm); if (!o) throw new Error("no property " + nm); s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); }, name);
  await h.wait(1000); await h.calm(); await h.top();
};
const fill = (h, key, v) => h.fill("#f_" + key, v);
const pickSel = (h, key, v) => h.select("#f_" + key, v);
const saveLoan = async (h) => { await h.click("#saveBtn", { wait: 1200 }); await h.calm(); await h.top(); };
const keyOf = (h, name) => h.js((n) => window.propertyKey({ propertyName: n, propertyAddress: "" }), name);
// a schedule row in the middle of the schedule's own scroll box
const schedTo = async (h, sel) => { await h.loc(sel).evaluate((r) => { const c = r.closest(".overflow-auto"); c.scrollTop = Math.max(0, r.offsetTop - 150); }); await h.wait(300); };

const SPEC = {
  id: "loan",
  title: "A loan’s page",
  intro: "Open a loan and read its page — the tiles, the rate notice, the NOI box, the Loan Record and the schedule — then add, edit, flag, pool, release and remove loans.",
  setup: async (h) => {
    await quiet(h);
    // made-up properties for the pooled loan (each with a made-up NOI typed on the property)
    for (const [name, noi] of [["Aspen Yard (example)", 1400000], ["Birch Commons (example)", 1150000]]){
      await h.js((n) => window.LDS_addProperty(n), name); await h.wait(600);
      const k = await keyOf(h, name);
      await h.js((a) => window.LDS_setProfileField(a[0], "noi", a[1]), [k, noi]); await h.wait(300);
    }
    await h.closeModals();
    await h.home();
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "open", title: "Open a loan", intro: "Two ways in: click a loan in Portfolio detail on Home, or pick its property under Specific Property.",
      steps: [
        { title: "From Home: Portfolio detail", text: "Scroll Home down to Portfolio detail. Every loan is a row; click a row and its page opens. A property with two or more loans is one row with a “2 loans” badge — click it to open it, then pick a loan.",
          go: async (h) => {
            await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(600);
            await h.js(() => { const t = [...document.querySelectorAll("#portfolioView tr[data-proptoggle]")].find(r => /Avalon White Plains/.test(r.innerText)); if (t && !t.classList.contains("prop-open")) t.click(); }); await h.wait(400);
          },
          shot: card("#portfolioView tr[data-goto]"),
          marks: [
            { sel: '#portfolioView tr[data-goto]:has-text("Queens Gate Apartments")', label: "A loan", text: "Click the row: the loan’s page opens (next step)." },
            { sel: '#portfolioView tr[data-goto]:has-text("Queens Gate Apartments") [data-loanstatus]', label: "Status", text: "The loan’s status: Active, Matured, Extended, Extension undecided (topic “Loan statuses”)." },
            { sel: '#portfolioView tr[data-proptoggle]:has-text("Avalon White Plains")', label: "A property with 2 loans", text: "Click to open or close it. Its row shows the two loans added together." },
            { sel: '#portfolioView tr[data-propmember]:has-text("Avalon WP (Mezz)")', label: "One of its loans", text: "Each loan of the property, marked senior or mezz. Click one to open its page." },
            { sel: '#portfolioView tr[data-openprop]:has-text("Aspen Yard (example)")', label: "No loan yet", text: "A property with no loan sits at the bottom. Clicking it opens it in Underwriting." },
            { sel: "#lenderConc", label: "Top lender", text: "The lender with the biggest share of the book.", optional: true },
            { sel: "#lenderDD > summary", label: "All lenders", text: "Show only the loans of the lenders you pick (see the Home chapter)." }
          ] },
        { title: "The loan’s page", text: "This is the loan’s page. The bar at the top is the same for every property: pick another property, add a loan or a property, edit or archive this property, or open the refinance.", cover: true,
          go: async (h) => { await h.openLoan(/Queens Gate/); await h.top(); },
          shot: "view",
          marks: [
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to Home’s overview of the whole book." },
            { sel: "#scopeLoanBtn", label: "Specific Property", text: "This view: one property and its loans." },
            { sel: "#loanSelect", label: "Select a property", text: "Every property, A to Z. Pick one and its page opens. A property with several loans says so (“senior + mezz”); one with no loan says “no loan yet”." },
            { sel: "#addBtn", label: "Add Loan", text: "Opens an empty loan form, with this property’s name filled in (topic “Add a loan”)." },
            { sel: "#addPropBtn", label: "Add Property", text: "Adds a property by its name (see the Properties chapter)." },
            { sel: "#editBtn", label: "Edit", text: "Opens this PROPERTY’s profile — its units, manager, NOI override. To change the loan itself, use Edit in the Loan Record." },
            { sel: "#removeBtn", label: "Remove", text: "Archives this PROPERTY with all its loans (it asks first). To remove only one loan, use Remove in the Loan Record." },
            { sel: "#refiBtn", label: "Refi Calculator", text: "Opens the refinance for this property (see the Refinance chapter)." },
            { sel: "#kpiGrid", label: "The tiles", text: "The loan’s main figures (next topic)." },
            { sel: "#floatBanner", label: "Rate notice", text: "How a floating or hybrid rate is set this month (topic “The floating-rate notice”)." },
            { sel: "#loanOpPanel > div", label: "NOI box", text: "The property’s NOI and coverage (topic “The NOI box”). Below it: the profile, rent roll, documents, the Loan Record and the schedule — scroll down." },
            { sel: '[data-tabsel="home"]', label: "Portfolio tab", text: "This tab. Tools like Underwriting open in tabs next to it, from the “+”." },
            { sel: "#tabNewBtn", label: "+", text: "Opens Underwriting, the Calendar or Data Health in a new tab." },
            { sel: "#dataDD > summary", label: "Data", text: "Back up, restore, and Excel export / import (see the Home chapter)." },
            { sel: "#fetchRateBtn", label: "Fetch live rate", text: "Gets today’s index values (SOFR, Treasuries, Prime)." },
            { sel: "#settingsDD > summary", label: "Settings", text: "Display size, the guide and more (see the Settings chapter)." },
            { sel: "#loanCountLabel", label: "Properties", text: "How many properties are in the book." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "tiles", title: "The tiles", intro: "Eight tiles at the top of the page. The app works them out from the loan’s terms — you never type them.",
      steps: [
        { title: "What each tile says", text: "Each tile is one figure, worked out for today from the Loan Record. Change a term in the Loan Record and the tiles follow at once.",
          go: async (h) => { await h.openLoan(/Queens Gate/); },
          shot: "#kpiGrid",
          marks: [
            Object.assign(TILE(0), { label: "Total Monthly Debt Service", text: "What goes out each month: principal and interest, plus the escrows and fees in the Loan Record." }),
            Object.assign(TILE(1), { label: "Monthly P&I", text: "This month’s principal + interest. Underneath: interest-only, the phase of a hybrid, or that it amortizes." }),
            Object.assign(TILE(2), { label: "Current Balance", text: "What is owed today, and how many payments have been made." }),
            Object.assign(TILE(3), { label: "Original Amount", text: "The loan amount on day one, and today’s rate." }),
            Object.assign(TILE(4), { label: "Amort / Loan Term", text: "Amortization years / loan years. “Balloon at mo 120” means the rest is due at month 120." }),
            Object.assign(TILE(5), { label: "Months to Maturity", text: "Months left, and the maturity date." }),
            Object.assign(TILE(6), { label: "Interest-Only", text: "The interest-only months at the start (or “None”), and what follows them." }),
            Object.assign(TILE(7), { label: "Rate Type", text: "Fixed, Floating or Hybrid ARM. A hybrid shows its first rate → its rate after the reset." })
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "float", title: "The floating-rate notice", intro: "A floating loan, or a hybrid ARM, has a blue notice under the tiles: how its rate is set this month.",
      steps: [
        { title: "A floating loan", text: "A floating loan re-prices on the 1st of each month: the index plus the spread (kept between the floor and the cap). Future months use today’s value — the projection holds it flat.",
          go: async (h) => { await h.openLoan(/^M Lofts/); },
          shot: "#floatBanner",
          marks: [
            { sel: "#floatBanner span.font-bold", label: "How it re-prices", text: "When the rate changes and which index it follows." },
            { sel: "#floatBanner span.font-semibold", label: "This month’s rate", text: "Index + spread = this month’s rate. The floor or cap shows when the loan has one." },
            { sel: "#floatBanner span.text-sky-600", label: "Captured", text: "When this month’s rate was taken. It is automatic — nothing to do." }
          ] },
        { title: "A hybrid ARM", text: "A hybrid ARM is fixed for its first years, then floats. The notice says how many fixed months are left — or, once it has reset, that it now floats and how often it resets.",
          go: async (h) => { await h.openLoan(/Queens Gate/); },
          shot: "#floatBanner",
          marks: [
            { sel: "#floatBanner span.font-bold", label: "Its phase", text: "Still fixed (with the months left), or now adjustable." },
            { sel: "#floatBanner span.font-semibold", label: "The floating rate", text: "What the index + margin is this month." },
            { sel: "#floatBanner span.text-sky-600", label: "Captured", text: "When the index value was taken (automatic)." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "noi", title: "The NOI box", intro: "Under the tiles: the property’s NOI and the coverage figures, and where that NOI came from.",
      steps: [
        { title: "NOI, DSCR, debt yield, LTV", text: "One NOI for the property — the same one Underwriting and Home use (the refinance uses only the T12 or the underwriting approved from it). The small line says where it came from, in this order: your NOI override (in the profile), else the T12, else the property’s operating lines, else an NOI typed on the loan. With none, it says “No NOI yet”.",
          go: async (h) => { await h.openLoan(/Queens Gate/); },
          shot: "#loanOpPanel > div",
          marks: [
            { sel: "#loanOpPanel .grid > div", nth: 0, label: "Property NOI", text: "The property’s yearly NOI." },
            { sel: "#loanOpPanel .grid > div", nth: 1, label: "DSCR (combined)", text: "NOI ÷ the yearly debt service of every loan on the property." },
            { sel: "#loanOpPanel .grid > div", nth: 2, label: "Debt yield", text: "NOI ÷ what is owed today." },
            { sel: "#loanOpPanel .grid > div", nth: 3, label: "LTV", text: "What is owed ÷ the property’s value (NOI ÷ cap rate)." },
            { sel: "#loanOpOpen", label: "Build operating model", text: "Opens this property in Underwriting, where its T12 goes (“Open operating model” once it has one)." },
            { sel: "[data-loanopsrc]", label: "Where the NOI came from", text: "Here: an NOI typed on the loan, no T12 yet. With two loans it adds “shared by 2 loans”." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "record", title: "The Loan Record", intro: "Every field of the loan in one place, and the buttons that change it.",
      steps: [
        { title: "Read the Loan Record", text: "Four parts you type (Loan Identification, Loan Terms, Escrows & Reserves, Additional Fees) and one the app works out (Debt Service). A “calc” tag means worked out by the app. A dash means empty.",
          go: async (h) => { await h.openLoan(/Queens Gate/); },
          shot: card("#profileBody"),
          marks: [
            { sel: "#loanRecEdit", label: "Edit", text: "Opens this loan’s form to change any field (topic “Edit a loan”)." },
            { sel: "#loanRecStale", label: "Out of date…", text: "Marks the terms as no longer right — e.g. refinanced, new papers not in yet (topic “Out of date”)." },
            { sel: "#loanRecRemove", label: "Remove", text: "Takes this one loan out of every total. It can be restored (topic “Remove a loan”)." },
            { sel: REC("Loan Identification"), label: "Loan Identification", text: "The property, the lender, the loan number — and for a pooled loan, its other properties and releases." },
            { sel: REC("Loan Terms"), label: "Loan Terms", text: "Amount, rate, dates, term, amortization, interest-only and the index. The schedule is built from these." },
            { sel: REC("Escrows & Reserves"), label: "Escrows & Reserves", text: "The monthly escrows paid with the loan." },
            { sel: REC("Additional Fees"), label: "Additional Fees", text: "Servicing, trustee and other monthly fees." },
            { sel: REC("Debt Service"), label: "Debt Service (computed)", text: "Balance today, P&I, total debt service, interest-only left, months to maturity, today’s rate — all worked out." },
            { sel: REC("Debt Service") + " dt span.rounded", label: "calc", text: "This figure is worked out by the app; it can’t be typed." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "schedule", title: "The payment schedule", intro: "At the bottom of the page: every month of the loan, from the first payment to the last.",
      steps: [
        { title: "The schedule", text: "One row per month. Yellow rows are interest-only, the blue row is today, the green row is the balloon (or the last payment).",
          go: async (h) => { await h.openLoan(/Queens Gate/); },
          shot: SCHED,
          marks: [
            { sel: "#scheduleMeta", label: "The loan in one line", text: "How many months, when interest starts and ends, and that each month is paid on the 1st of the next." },
            { sel: "[data-scheduljump]", nth: 0, label: "First interest payment", text: "Jumps to the first payment and flashes it." },
            { sel: "[data-scheduljump]", nth: 1, label: "First P&I payment", text: "Jumps to the first month with principal (after interest-only)." },
            { sel: SCHED + ' >> span.inline-flex:has-text("Interest-only")', label: "Colours", text: "What the row colours mean: interest-only, today, balloon / final." },
            { sel: "#exportCsvBtn", label: "Schedule CSV", text: "Saves the whole schedule as a file that opens in Excel." },
            { sel: TH(1), label: "#", text: "The payment number." },
            { sel: TH(2), label: "Accrual Month / Pays", text: "The month interest is counted for, and the day it is paid." },
            { sel: TH(4), label: "Days", text: "Days in the month — interest is counted on real days (Actual/360) unless the loan is 30/360." },
            { sel: TH(5), label: "Rate", text: "That month’s rate. A small tag says where it came from (fixed, the index on a date)." }
          ] },
        { title: "Interest-only, then principal", text: "“First P&I payment” jumps here: the last interest-only month (IO tag), then the first month that pays principal too. The payment goes up; the balance starts to go down.",
          go: async (h) => { await h.openLoan(/Queens Gate/); await h.click('[data-scheduljump]', { nth: 1, wait: 900 }); await h.calm(); },
          shot: SCHED,
          marks: [
            { sel: '#scheduleBody tr[data-schedrow="48"] span:has-text("IO")', label: "IO", text: "An interest-only month: the payment is interest only." },
            { sel: '#scheduleBody tr[data-schedrow="49"]', label: "First P&I month", text: "From here each payment also pays principal." },
            { sel: '#scheduleBody tr[data-schedrow="49"] [data-ratesrc]', label: "Rate tag", text: "Point at it to see where the rate came from." },
            { sel: TH(6), label: "Interest Charged", text: "Balance × rate × days ÷ 360." },
            { sel: TH(7), label: "Scheduled Payment", text: "What is due that month." },
            { sel: TH(8), label: "Principal Paid", text: "Payment − interest: what comes off the balance." },
            { sel: TH(9), label: "Ending Balance", text: "What is owed after that month." },
            { sel: '#scheduleBody tr span:has-text("Now")', label: "Now", text: "Today’s month (blue).", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "add", title: "Add a loan", intro: "Add Loan opens an empty form. Here we add a made-up loan on a made-up property, “Maple Court (example)”.",
      steps: [
        { title: "The form", text: "Click Add Loan. The form has four parts. Only what you type is kept — the balance, the payments, P&I and debt service are worked out from it. The property you were on is already filled in.",
          go: async (h) => { await h.openLoan(/Queens Gate/); await h.click("#addBtn", { wait: 900 }); await h.calm(); await h.top(); },
          shot: "#formView",
          marks: [
            { sel: "#formTitle", label: "Add Loan", text: "A new loan. (Editing a loan shows “Edit Loan”.)" },
            { sel: "#cancelBtn", label: "Cancel", text: "Closes the form. Nothing is saved." },
            { sel: "#saveBtn", label: "Save Loan", text: "Checks the form and saves the loan; its page opens." },
            { sel: "#f_propertyName", label: "Property Name", text: "Filled in with the property you were on. Type another name for another property — a new name makes a new property." },
            { sel: FS("Loan Identification") + " legend", label: "Loan Identification", text: "Who and what (a step below)." },
            { sel: FS("Loan Terms") + " legend", label: "Loan Terms", text: "The terms from the loan papers." },
            { sel: FS("Escrows & Reserves") + " legend", label: "Escrows & Reserves", text: "Monthly escrows." },
            { sel: FS("Additional Fees") + " legend", label: "Additional Fees", text: "Monthly fees." }
          ] },
        { title: "Something missing", text: "Save with a required field empty and a red line says what is missing. Nothing is saved until it is right. Required fields have a red *.",
          go: async (h) => { await h.click("#saveBtn", { wait: 500 }); await h.top(); },
          shot: "#formView",
          marks: [
            { sel: "#formError", label: "What is missing", text: "The first thing to fix. Fix it and click Save Loan again." },
            { sel: "#saveBtn", label: "Save Loan", text: "Try again once it’s fixed." }
          ] },
        { title: "Loan Identification", text: "Who and what: the property, its address and type, the lender and the loan number. Here: “Maple Court (example)” with a made-up lender.",
          go: async (h) => {
            await fill(h, "propertyName", "Maple Court (example)"); await fill(h, "propertyAddress", "12 Maple Ave, Springfield");
            await pickSel(h, "propertyType", "Multifamily"); await fill(h, "lenderName", "Example Bank"); await fill(h, "loanNumber", "EX-1001");
          },
          shot: FS("Loan Identification"),
          marks: [
            { sel: FW("propertyName"), label: "Property Name", text: "The property this loan is on. Start typing to pick one you already have." },
            { sel: FW("propertyAddress"), label: "Property Address", text: "Its address. Two loans with the same address are one property." },
            { sel: FW("propertyType"), label: "Property Type", text: "Office, Retail, Industrial, Multifamily, Mixed-Use or Other." },
            { sel: FW("lenderName"), label: "Lender Name", text: "Who lent the money." },
            { sel: FW("loanNumber"), label: "Loan Number", text: "The lender’s number for the loan." },
            { sel: FW("poolReleases"), label: "Pool releases", text: "For a pooled loan: properties released so far. Filled in by Release… on the loan’s page — not typed here." },
            { sel: "#poolFormPicker", label: "Also secures (pooled loan)", text: "Leave it empty for a loan on one property. Tick other properties to make one loan on several (topic “A pooled loan”)." }
          ] },
        { title: "Loan Terms", text: "The terms from the loan papers. A new fixed loan takes its rate from an index + your spread, and the green line shows the rate it will lock. For a loan that already exists, tick “historical loan” and type its rate instead.",
          go: async (h) => {
            await fill(h, "originalAmount", "12000000"); await pickSel(h, "rateType", "Fixed"); await pickSel(h, "lienPosition", "Senior");
            await fill(h, "originationDate", "2024-03-15"); await fill(h, "firstPaymentDate", "2024-05-01"); await fill(h, "maturityDate", "2034-04-01");
            await fill(h, "loanTermMonths", "120"); await fill(h, "amortizationMonths", "360"); await pickSel(h, "amortMethod", "Actual/360");
            await pickSel(h, "amortType", "Level"); await fill(h, "ioMonths", "24"); await pickSel(h, "index", "ust10y"); await fill(h, "spread", "1.85");
          },
          shot: FS("Loan Terms"),
          marks: [
            { sel: "#loanForm [data-histrow]", label: "Historical loan", text: "Tick it for a loan that already exists: you type its real locked rate. Leave it off for a new loan." },
            { sel: FW("originalAmount"), label: "Original Loan Amount", text: "The amount on day one. Required." },
            { sel: FW("rateType"), label: "Rate Type", text: "Fixed, Floating or Hybrid ARM. The fields below change to match." },
            { sel: FW("lienPosition"), label: "Lien Position", text: "Senior, or Mezzanine (paid after the senior)." },
            { sel: FW("loanStatus"), label: "Loan Status", text: "Leave blank: it reads Active, or Matured after the maturity date (topic “Loan statuses”)." },
            { sel: FW("originationDate"), label: "Origination Date", text: "When the loan closed. Required." },
            { sel: FW("firstPaymentDate"), label: "First Payment Date", text: "The first payment of any kind — an interest-only one counts. Required." },
            { sel: FW("maturityDate"), label: "Maturity Date", text: "From the papers. The schedule is anchored to it." },
            { sel: FW("loanTermMonths"), label: "Loan Term (Months)", text: "Months until the balloon. Required." },
            { sel: FW("amortizationMonths"), label: "Amortization Period", text: "Months the payment is worked out over, e.g. 360 for 30 years." },
            { sel: FW("amortMethod"), label: "Day-Count", text: "Actual/360 (interest on real days) or 30/360 (the same every month)." },
            { sel: FW("amortType"), label: "Amortization Type", text: "Level (normal), Fixed Principal, or Fixed P&I (a set payment from the papers)." },
            { sel: FW("ioMonths"), label: "Interest-Only Period", text: "Months of interest only at the start. 0 if none." },
            { sel: FW("index"), label: "Index", text: "The index the rate is built on (SOFR, Prime, a Treasury…)." },
            { sel: FW("spread"), label: "Spread", text: "Your margin over the index, in %." },
            { sel: "#f_ratePreview", label: "Locked rate", text: "Index today + spread = the rate this new loan locks." }
          ] },
        { title: "Escrows & Reserves", text: "Monthly amounts paid with the loan. Leave any you don’t have empty. They add to Total Monthly Debt Service.",
          go: async (h) => { await fill(h, "escrowTax", "8500"); await fill(h, "escrowInsurance", "2100"); await fill(h, "replacementReserve", "1500"); },
          shot: FS("Escrows & Reserves"),
          marks: [
            { sel: FW("escrowTax"), label: "Real Estate Tax Escrow", text: "Monthly tax escrow." },
            { sel: FW("escrowInsurance"), label: "Insurance Escrow", text: "Monthly insurance escrow." },
            { sel: FW("replacementReserve"), label: "Replacement Reserve", text: "Monthly reserve for replacements." },
            { sel: FW("tilcReserve"), label: "TI/LC Reserve", text: "Tenant improvements and leasing commissions reserve." },
            { sel: FW("groundLease"), label: "Ground Lease Payment", text: "Monthly ground rent, if any." },
            { sel: FW("otherEscrow1Desc"), label: "Other Escrow 1 — Description", text: "Name another escrow…" },
            { sel: FW("otherEscrow1Amt"), label: "Other Escrow 1 — Amount", text: "…and its monthly amount." },
            { sel: FW("otherEscrow2Desc"), label: "Other Escrow 2 — Description", text: "A second one." },
            { sel: FW("otherEscrow2Amt"), label: "Other Escrow 2 — Amount", text: "Its monthly amount." }
          ] },
        { title: "Additional Fees", text: "Monthly fees paid with the loan. They also add to Total Monthly Debt Service.",
          go: async (h) => { await fill(h, "servicingFee", "250"); },
          shot: FS("Additional Fees"),
          marks: [
            { sel: FW("servicingFee"), label: "Servicing Fee", text: "Monthly servicing fee." },
            { sel: FW("trusteeFee"), label: "Trustee Fee", text: "Monthly trustee fee." },
            { sel: FW("otherFee1Desc"), label: "Other Fee 1 — Description", text: "Name another fee…" },
            { sel: FW("otherFee1Amt"), label: "Other Fee 1 — Amount", text: "…and its monthly amount." },
            { sel: FW("otherFee2Desc"), label: "Other Fee 2 — Description", text: "A second one." },
            { sel: FW("otherFee2Amt"), label: "Other Fee 2 — Amount", text: "Its monthly amount." }
          ] },
        { title: "Saved", text: "Click Save Loan. The new loan’s page opens — “Maple Court (example)” is now in the property list — with its tiles worked out. A new property name made a new property, with its own folder for its files.",
          go: async (h) => { await saveLoan(h); },
          shot: "#kpiGrid",
          marks: [
            { sel: TILE(0).sel, nth: 0, label: "Total Monthly Debt Service", text: "P&I + the escrows + the fee typed in the form." },
            { sel: TILE(1).sel, nth: 1, label: "Monthly P&I", text: "Interest-only for the first 24 months, then the amortizing payment." },
            { sel: TILE(7).sel, nth: 7, label: "Rate Type", text: "Fixed at the locked rate." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "edit", title: "Edit a loan", intro: "Edit in the Loan Record opens the same form with the loan’s values. Every change is kept in the loan’s history.",
      steps: [
        { title: "Change a field", text: "Click Edit in the Loan Record, change what you need, and click Save Loan. Here the made-up lender name is changed.",
          go: async (h) => { await pick(h, "Maple Court (example)"); await h.click("#loanRecEdit", { wait: 900 }); await h.calm(); await fill(h, "lenderName", "Example Bank N.A."); },
          shot: FS("Loan Identification"),
          marks: [
            { sel: FW("lenderName"), label: "The changed field", text: "Type the new value." },
            { sel: FW("propertyName"), label: "Property Name", text: "A new name renames the property; its files and chats move with it. If that name already has files, the app asks first. For a property with several loans, rename it in its profile." }
          ] },
        { title: "History on a field", text: "After saving, a field that was changed shows “history (1)”, and the Loan Record shows “Change history” with every change to this loan.",
          go: async (h) => { await saveLoan(h); },
          shot: card("#profileBody"),
          marks: [
            { sel: '[data-loanhist="lenderName"]', label: "history (1)", text: "Click to see this field’s changes." },
            { sel: '#profileBody [data-loanhist=""]', label: "Change history", text: "Every change to this loan, newest first." },
            { sel: "#loanRecEdit", label: "Edit", text: "Open the form again." }
          ] },
        { title: "The history window", text: "Each change: when, old → new, who made it and where it came from (typed by hand, a rename, the assistant…).",
          go: async (h) => { await h.click('[data-loanhist="lenderName"]', { wait: 500 }); },
          shot: "#historyModal > div",
          marks: [
            { sel: "#historyTitle", label: "Which field", text: "The field and the loan." },
            { sel: "#historyBody th", nth: 0, label: "When", text: "The day and time of the change." },
            { sel: "#historyBody th", nth: 1, label: "Old → new", text: "What it was and what it became." },
            { sel: "#historyBody th", nth: 2, label: "Who", text: "Who made the change." },
            { sel: "#historyBody th", nth: 3, label: "Where from", text: "Typed by hand, or where else it came from." },
            { sel: "#historyClose", label: "Close", text: "Closes the window." }
          ],
          after: async (h) => { await h.closeModals(); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "stale", title: "Out of date", intro: "When a loan’s terms are no longer right — say it was refinanced and the new loan’s papers haven’t come — flag it. Its figures stay as they are, but every place that shows them warns you.",
      steps: [
        { title: "Mark it out of date", text: "Click “Out of date…” in the Loan Record. Say why, then click Mark out of date. Nothing in the loan is changed.",
          go: async (h) => { await pick(h, "Maple Court (example)"); await h.click("#loanRecStale", { wait: 500 }); },
          shot: "#staleModal > div",
          marks: [
            { sel: "#staleNote", label: "Why", text: "A short reason. It shows on the page, the refinance and Needs Attention." },
            { sel: "#staleCancel", label: "Cancel", text: "Closes it; nothing changes." },
            { sel: "#staleGo", label: "Mark out of date", text: "Flags the loan (next step)." }
          ] },
        { title: "The warning", text: "The loan’s page now has an amber warning under the tiles; so do its refinance and Home’s Needs Attention. When the new loan’s papers come, add the new loan and mark this one Paid off.",
          go: async (h) => { await h.click("#staleGo", { wait: 700 }); await h.calm(); await h.top(); },
          shot: "#staleBanner",
          marks: [
            { sel: "[data-stalebanner]", label: "Out of date", text: "Since when, and why. Don’t rely on its figures until the new loan is in." },
            { sel: "[data-stalefix]", label: "It’s up to date again", text: "Clears the flag (it asks first)." }
          ] },
        { title: "Clear it", text: "“It’s up to date again” (or “Up to date again” in the Loan Record) asks once, then clears the flag. The change is kept in the loan’s history.",
          go: async (h) => { await h.click("[data-stalefix]", { wait: 500 }); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmTitle", label: "The question", text: "Clear “out of date” on this loan?" },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps the flag." },
            { sel: "#confirmOk", label: "Clear", text: "Clears it: the warning goes away." }
          ],
          after: async (h) => { await h.click("#confirmOk", { wait: 600 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "status", title: "Loan statuses", intro: "A loan’s status says where it stands. It is a field in Loan Terms.",
      steps: [
        { title: "Set a status", text: "Edit the loan and pick its Loan Status. Blank reads Active (or Matured once the maturity date has passed). Active — running. Matured — past maturity. Extended — the lender extended it. Extension undecided — waiting on an answer. Paid off — it leaves every total and moves to “Removed & paid-off loans” on Home.",
          go: async (h) => { await pick(h, "Maple Court (example)"); await h.click("#loanRecEdit", { wait: 900 }); await h.calm(); await pickSel(h, "loanStatus", "Extension undecided"); },
          shot: FS("Loan Terms"),
          marks: [
            { sel: FW("loanStatus"), label: "Loan Status", text: "Here: Extension undecided." },
            { sel: FW("maturityDate"), label: "Maturity Date", text: "With no status set, a loan past this date reads Matured." }
          ] },
        { title: "Where it shows", text: "The status shows as a small tag on the loan’s row on Home. Matured and Extension undecided are also highlighted in the maturity calendar and the roll-up.",
          go: async (h) => { await saveLoan(h); await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(600); await h.scroll('#portfolioView tr[data-goto]:has-text("Maple Court (example)")', 0, "center"); },
          shot: card("#portfolioView tr[data-goto]"),
          marks: [
            { sel: '#portfolioView tr[data-goto]:has-text("Maple Court (example)") [data-loanstatus]', label: "Extension undecided", text: "The made-up loan’s new status." },
            { sel: '#portfolioView tr[data-goto]:has-text("Queens Gate Apartments") [data-loanstatus]', label: "Active", text: "A loan with no status set, before its maturity." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "stack", title: "A senior + mezz stack", intro: "A property with a senior loan and a mezzanine loan opens as one page that adds them together (the sample Avalon White Plains).",
      steps: [
        { title: "The tiles add the loans together", text: "In the property list it reads “Avalon White Plains · senior + mezz”. Its tiles add both loans: balance, P&I, debt service. Rate Type shows each loan’s type and the blended rate. The NOI box below says “shared by 2 loans”.",
          go: async (h) => { await pick(h, "Avalon White Plains"); },
          shot: "#kpiGrid",
          marks: [
            Object.assign(TILE(0), { label: "Total Monthly Debt Service", text: "Both loans together." }),
            Object.assign(TILE(2), { label: "Current Balance", text: "Both balances added." }),
            Object.assign(TILE(1), { label: "Monthly P&I", text: "Both P&I payments." }),
            Object.assign(TILE(7), { label: "Rate Type", text: "Each loan’s type and the blended rate." })
          ] },
        { title: "Combined position", text: "At the top of the Loan Record: each loan, and the stack together. To edit or remove one loan, use the pencil or the bin on its row.",
          go: async (h) => { await pick(h, "Avalon White Plains"); },
          shot: '#profileBody section:has(h3:has-text("Combined position"))',
          marks: [
            { sel: "[data-loanjump]", nth: 0, label: "The senior loan", text: "Click to open only this loan’s page." },
            { sel: "[data-loanjump]", nth: 1, label: "The mezz loan", text: "Click to open only the mezz." },
            { sel: "[data-loanedit]", nth: 0, label: "Edit this loan", text: "Opens this loan’s form." },
            { sel: "[data-loanremove]", nth: 0, label: "Remove this loan", text: "Removes only this loan (it asks first)." },
            { sel: '#profileBody dt:has-text("Combined balance")', label: "Combined balance", text: "Both balances." },
            { sel: '#profileBody dt:has-text("Blended rate")', label: "Blended rate", text: "The rate of the two together, weighted by balance." },
            { sel: '#profileBody dt:has-text("Combined monthly P")', label: "Combined monthly P&I", text: "Both P&I payments." },
            { sel: '#profileBody dt:has-text("Combined LTV")', label: "Combined LTV", text: "Both balances ÷ the value." },
            { sel: '#profileBody dt:has-text("senior only")', label: "DSCR — senior only", text: "Coverage of the senior loan alone." },
            { sel: '#profileBody dt:has-text("DSCR — combined")', label: "DSCR — combined", text: "Coverage of both loans." },
            { sel: '#profileBody dt:has-text("Debt yield")', label: "Debt yield — combined", text: "NOI ÷ both balances." },
            { sel: '#profileBody section:has(h3:has-text("Combined position")) p.text-amber-700', label: "No NOI yet", text: "Without an NOI the coverage figures stay empty.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "pool", title: "A pooled loan", intro: "One loan secured by several properties. Here a made-up loan on “Aspen Yard (example)” also secures “Birch Commons (example)” and a property not in the app yet, “Cedar Point (example)”.",
      steps: [
        { title: "Also secures", text: "Add the loan on its main property (here from “+ Add the first loan” on Aspen Yard’s page) and fill its terms. Under “Also secures”, tick the other properties. An allocated amount is optional. A property not in the app yet: type its name and click “Add to this loan”.",
          go: async (h) => {
            await pick(h, "Aspen Yard (example)"); await h.click("[data-propadd]", { wait: 900 }); await h.calm();
            await fill(h, "lenderName", "Example Life Co."); await fill(h, "loanNumber", "EX-POOL-7");
            await fill(h, "originalAmount", "20000000"); await pickSel(h, "rateType", "Fixed");
            await fill(h, "originationDate", "2025-06-01"); await fill(h, "firstPaymentDate", "2025-07-01"); await fill(h, "maturityDate", "2030-06-01");
            await fill(h, "loanTermMonths", "60"); await fill(h, "amortizationMonths", "360"); await fill(h, "ioMonths", "24");
            await pickSel(h, "index", "ust5y"); await fill(h, "spread", "2.10");
            await h.click('#poolFormPicker [data-poolname="Birch Commons (example)"]', { wait: 300 });
            await h.fill('#poolFormPicker [data-poolformrow="birch commons (example)"] [data-poolformamt]', "6000000");
            await h.fill("#poolFormNew", "Cedar Point (example)", { change: false }); await h.click("#poolFormAdd", { wait: 400 });
            await h.fill("#poolFormSearch", "example", { change: false }); await h.js(() => { document.getElementById("poolFormSearch").dispatchEvent(new Event("input", { bubbles: true })); }); await h.wait(300);
          },
          shot: FS("Loan Identification"),
          marks: [
            { sel: FW("propertyName"), label: "Its main property", text: "The loan is filed under this property." },
            { sel: "#poolFormCount", label: "How many", text: "How many other properties this loan secures." },
            { sel: "#poolFormSearch", label: "Find a property", text: "Type part of a name to shorten the list." },
            { sel: '#poolFormPicker [data-poolname="Birch Commons (example)"]', label: "Tick a property", text: "Ticked: this loan also secures it." },
            { sel: '#poolFormPicker [data-poolformrow="birch commons (example)"] [data-poolformamt]', label: "Allocated $", text: "Optional: the part of the loan the lender puts on this property. If no property has one, each share follows its NOI." },
            { sel: '#poolFormPicker [data-poolformrow="cedar point (example)"]', label: "New — added when you save", text: "A property not in the app yet. It is created when you save the loan." },
            { sel: '#poolFormPicker [data-poolformrow="maple court (example)"]', label: "Has its own loan", text: "A property can be in a pool and still have its own loan." },
            { sel: "#poolFormNew", label: "New property", text: "Type the name of a property that isn’t in the app yet…" },
            { sel: "#poolFormAdd", label: "Add to this loan", text: "…and click here to add it to the list, ticked." },
            { sel: "#poolFormAllocSum", label: "Allocated so far", text: "The allocated amounts added up, against the loan amount." }
          ] },
        { title: "The pool panel", text: "After Save Loan, the page shows the pool instead of the NOI box: one loan, one payment, and coverage read on the whole pool. Each property has a row (here with made-up NOIs).",
          go: async (h) => {
            await saveLoan(h);
            const k = await keyOf(h, "Cedar Point (example)");
            await h.js((a) => window.LDS_setProfileField(a, "noi", 750000), k); await h.wait(300);
            await pick(h, "Aspen Yard (example)");
          },
          shot: "[data-poolpanel]",
          marks: [
            { sel: "[data-poolpanel] h3", label: "Pooled loan", text: "How many properties secure the loan." },
            { sel: "[data-poolpanel] .grid > div", nth: 0, label: "Current balance", text: "What is owed on the one loan." },
            { sel: "[data-poolpanel] .grid > div", nth: 1, label: "Monthly P&I", text: "The one payment." },
            { sel: "[data-poolpanel] .grid > div", nth: 2, label: "Pool NOI", text: "Every property’s NOI added." },
            { sel: "[data-poolpanel] .grid > div", nth: 3, label: "DSCR (pool)", text: "Pool NOI ÷ the loan’s yearly debt service." },
            { sel: "[data-poolpanel] .grid > div", nth: 4, label: "Debt yield / LTV", text: "For the whole pool." },
            { sel: POOLROW("Aspen Yard (example)"), label: "This property", text: "The property whose page this is." },
            { sel: "[data-poolpanel] th", nth: 2, label: "Allocated", text: "Each property’s part of the loan: the amount typed, or an even split of what is left." },
            { sel: "[data-poolpanel] th", nth: 3, label: "Alloc. balance", text: "Its part of what is owed today." },
            { sel: "[data-poolpanel] th", nth: 4, label: "Alloc. DSCR", text: "Each property’s NOI ÷ its share of the debt service." },
            { sel: POOLROW("Cedar Point (example)") + " [data-poolrelease]", label: "Release…", text: "Takes this property out of the pool (next step). Released, the main property moves the loan to the property with the largest share." }
          ] },
        { title: "Release…", text: "When a property is sold or refinanced on its own, the lender releases it: its release price is paid down on the loan. It leaves the pool and keeps its NOI, with no loan.",
          go: async (h) => { await h.click(POOLROW("Cedar Point (example)") + " [data-poolrelease]", { wait: 500 }); },
          shot: "#poolRelModal > div",
          marks: [
            { sel: "#poolRelModal p", label: "Its share", text: "Its share of today’s balance — by its allocated amount, or by NOI. Lenders often ask 105–125% of it." },
            { sel: "#poolRelPrice", label: "Release price", text: "What is paid down on the loan." },
            { sel: "#poolRelDate", label: "Date", text: "The day of the paydown." },
            { sel: "#poolRelMode", label: "After the paydown", text: "Recalculate the payment over the amortization left, or keep the payment (the loan pays off faster)." },
            { sel: "#poolRelCancel", label: "Cancel", text: "Closes it; nothing changes." },
            { sel: "#poolRelGo", label: "Release", text: "Pays it down and takes the property out of the pool." }
          ] },
        { title: "Released", text: "The property is gone from the pool, and a line says what was paid down and when. The schedule shows the paydown in its month. Cedar Point stays in the app as a property with no loan.",
          go: async (h) => { await h.click("#poolRelGo", { wait: 900 }); await h.calm(); await pick(h, "Aspen Yard (example)"); },
          shot: "[data-poolpanel]",
          marks: [
            { sel: "[data-poolpanel] h3", label: "One fewer", text: "The pool now secures 2 properties." },
            { sel: "[data-poolreleases]", label: "Released", text: "Which property, when, how much was paid down, and whether the payment was recalculated." }
          ] },
        { title: "From a member property", text: "A property in the pool with no loan of its own opens with an “In a pooled loan” tag and the same pool panel.",
          go: async (h) => { await pick(h, "Birch Commons (example)"); await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = false; }); await h.wait(300); },
          shot: "#propView",
          marks: [
            { sel: "#propHeader span:has-text(\"In a pooled loan\")", label: "In a pooled loan", text: "This property secures a pooled loan." },
            { sel: "[data-propadd]", label: "+ Add the first loan", text: "It can still get a loan of its own." },
            { sel: "[data-proparchive]", label: "Archive", text: "Archives the property (see the Properties chapter)." },
            { sel: "[data-poolpanel]", label: "The pool", text: "The same panel as on the main property’s page; this property’s row is marked." },
            { sel: "#propProfilePanel summary", label: "Profile", text: "Its facts (see the Properties chapter)." },
            { sel: "#propUnitStatsPanel > div", label: "Rent roll", text: "Its rent roll summary." },
            { sel: "#propDocsPanel > div", label: "Documents", text: "Its saved files.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "reset", title: "At the Reset", intro: "A hybrid ARM with a set payment (Fixed P&I) needs one more answer: what the payment does when the rate resets. Shown on a made-up loan, “Juniper Flats (example)”.",
      before: async (h) => {
        await h.openLoan(/Queens Gate/); await h.click("#addBtn", { wait: 900 });
        await fill(h, "propertyName", "Juniper Flats (example)"); await fill(h, "lenderName", "Example Bank");
        await fill(h, "originalAmount", "9000000"); await pickSel(h, "rateType", "Hybrid ARM"); await fill(h, "annualRate", "4.25");
        await fill(h, "originationDate", "2021-06-15"); await fill(h, "firstPaymentDate", "2021-08-01"); await fill(h, "maturityDate", "2031-07-01");
        await fill(h, "loanTermMonths", "120"); await fill(h, "amortizationMonths", "360"); await pickSel(h, "amortType", "Fixed P&I");
        await fill(h, "fixedAmortAmount", "44275"); await pickSel(h, "armResetPayment", "Keep the stated payment"); await fill(h, "ioMonths", "0");
        await pickSel(h, "index", "ust5y"); await fill(h, "spread", "1.25"); await fill(h, "armInitialFixedMonths", "60"); await fill(h, "armAdjustFreqMonths", "60");
        await saveLoan(h);
      },
      steps: [
        { title: "The At the Reset field", text: "It shows when Rate Type is Hybrid ARM and Amortization Type is Fixed P&I. Pick what the note says: keep the stated payment across the reset, or set a new payment — what is owed then, over the amortization left, at the new rate.",
          go: async (h) => { await pick(h, "Juniper Flats (example)"); await h.click("#loanRecEdit", { wait: 900 }); await h.calm(); },
          shot: FS("Loan Terms"),
          marks: [
            { sel: FW("rateType"), label: "Hybrid ARM", text: "Fixed first, then it floats." },
            { sel: FW("annualRate"), label: "Annual Interest Rate", text: "The fixed rate of the first years." },
            { sel: FW("amortType"), label: "Fixed P&I", text: "A set monthly payment from the papers." },
            { sel: FW("fixedAmortAmount"), label: "Fixed Amortization Payment", text: "That set payment." },
            { sel: FW("armResetPayment"), label: "At the Reset", text: "Keep the stated payment, or recalculate over the remaining amortization." },
            { sel: FW("armInitialFixedMonths"), label: "Initial Fixed Period", text: "Months at the fixed rate (60 = 5 years)." },
            { sel: FW("armAdjustFreqMonths"), label: "Adjustment Frequency", text: "How often the rate resets after that." },
            { sel: FW("index"), label: "Index", text: "The index the rate follows after the fixed years." },
            { sel: FW("armAssumedIndex"), label: "Index Value", text: "Filled from the live index by itself; type a value only to override it. Offline it says it couldn’t fetch." },
            { sel: FW("spread"), label: "Spread", text: "The margin over the index after the reset." },
            { sel: FW("rateFloor"), label: "Floor", text: "The rate never goes below this." },
            { sel: FW("rateCap"), label: "Cap", text: "The rate never goes above this." },
            { sel: FW("liborUntil"), label: "On 1-Month LIBOR Until", text: "Only for a loan that started on LIBOR: the last day LIBOR set its rate." },
            { sel: FW("liborSpread"), label: "Spread Over LIBOR", text: "Blank = the same spread as above." }
          ],
          after: async (h) => { await h.click("#cancelBtn", { wait: 600 }); } },
        { title: "Keep the stated payment", text: "At the reset the rate goes to index + margin, but the payment stays the same. More of it goes to interest, so less principal is paid.",
          go: async (h) => { await pick(h, "Juniper Flats (example)"); await schedTo(h, RESET_ROW); },
          shot: SCHED,
          marks: [
            { sel: RESET_ROW + ' span:has-text("Reset →")', label: "Reset", text: "The first month at the new rate." },
            { sel: RESET_ROW + " >> xpath=preceding-sibling::tr[1]/td[7]", label: "Payment before", text: "The stated payment." },
            { sel: RESET_ROW + " td:nth-child(7)", label: "Payment after", text: "The same payment." },
            { sel: RESET_ROW + " td:nth-child(8)", label: "Principal paid", text: "Lower than before the reset — the higher rate takes more interest." }
          ] },
        { title: "A kept payment below the interest", text: "If the rate after the reset is high enough, the kept payment is less than the month’s interest. Then no principal is paid and the interest left unpaid is added to what is owed (negative amortization) — the balance grows, and is paid back at maturity. The schedule says so above the table. Living Lofts, a built-in loan, keeps its payment across its 2026 reset.",
          go: async (h) => { await pick(h, "Living Lofts (Middlesex)"); await schedTo(h, '#scheduleBody tr:has([data-schedunpaid])'); },
          shot: SCHED,
          marks: [
            { sel: "#scheduleKeyDates [data-schedunpaidnote]", label: "The payment is less than the interest", text: "From which month, the payment against the interest, and how much unpaid interest is added over how many months. Check the note: many loans require at least the interest — then pick Recalculate (next step)." },
            { sel: '#scheduleBody tr:has([data-schedunpaid]) td:nth-child(8)', label: "Principal paid: $0, + unpaid interest", text: "No principal — the payment doesn’t even cover the interest. Under it, this month’s interest the payment leaves unpaid." },
            { sel: '#scheduleBody tr:has([data-schedunpaid]) td:nth-child(9)', label: "Ending balance", text: "Higher than the starting balance: the unpaid interest is added to it." }
          ] },
        { title: "Recalculate", text: "Edit the loan and pick “Recalculate over the remaining amortization”. At the reset the payment is worked out again: what is owed then, over the months of amortization left, at the new rate.",
          go: async (h) => {
            await pick(h, "Juniper Flats (example)"); await h.click("#loanRecEdit", { wait: 900 });
            await pickSel(h, "armResetPayment", "Recalculate over the remaining amortization"); await saveLoan(h); await schedTo(h, RESET_ROW);
          },
          shot: SCHED,
          marks: [
            { sel: RESET_ROW + ' span:has-text("Reset →")', label: "Reset", text: "The first month at the new rate." },
            { sel: RESET_ROW + " >> xpath=preceding-sibling::tr[1]/td[7]", label: "Payment before", text: "The stated payment." },
            { sel: RESET_ROW + " td:nth-child(7)", label: "New payment", text: "Worked out again at the new rate." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "remove", title: "Remove a loan", intro: "Remove takes one loan out of every total, tile and the calendar. It is kept, and can be restored or deleted for good. (Shown on the made-up Maple Court loan.)",
      steps: [
        { title: "Remove", text: "Click Remove in the Loan Record. It asks first.",
          go: async (h) => { await pick(h, "Maple Court (example)"); await h.click("#loanRecRemove", { wait: 500 }); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmText", label: "What happens", text: "It leaves every total, tile and the calendar, and is listed on Home to restore." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps the loan." },
            { sel: "#confirmOk", label: "Remove", text: "Removes it." }
          ] },
        { title: "Removed & paid-off loans", text: "Home lists removed and paid-off loans near the bottom. Restore puts a loan back into every total; the bin deletes its record for good (it asks first).",
          go: async (h) => { await h.click("#confirmOk", { wait: 900 }); await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(600); },
          shot: "#inactiveLoansStrip",
          marks: [
            { sel: '#inactiveLoansStrip span.inline-flex:has-text("Maple Court")', label: "The removed loan", text: "Its name, “Removed” (or Paid off), and when." },
            { sel: "#inactiveLoansStrip [data-restoreloan]", label: "Restore", text: "Back into every total, tile and the calendar." },
            { sel: "#inactiveLoansStrip [data-deleteloan]", label: "Delete permanently", text: "Deletes the loan record for good." }
          ] },
        { title: "On the property’s page", text: "The property stays, now with no active loan. Its page lists its removed loans with the same Restore and delete.",
          go: async (h) => { await pick(h, "Maple Court (example)"); await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = false; }); await h.wait(300); },
          shot: "#propView",
          marks: [
            { sel: "#propHeader h2", label: "No loan yet", text: "The property, with no active loan." },
            { sel: "[data-propadd]", label: "+ Add the first loan", text: "Add a new loan to this property." },
            { sel: "[data-proparchive]", label: "Archive", text: "Archives the property (see the Properties chapter)." },
            { sel: "[data-propinactive] span.inline-flex", nth: 1, label: "The removed loan", text: "Its name, “Removed”, and when." },
            { sel: "[data-proprestoreloan]", label: "Restore", text: "Brings the loan back; the page becomes its loan page again." },
            { sel: "[data-propdeleteloan]", label: "Delete permanently", text: "Deletes the loan record for good (next step)." },
            { sel: "#propOpPanel > div", label: "NOI box", text: "The property keeps its NOI box (the cap rate now comes from the removed loan)." },
            { sel: "#propProfilePanel summary", label: "Profile", text: "Its profile stays (open by itself on this page; closed here)." },
            { sel: "#propUnitStatsPanel > div", label: "Rent roll", text: "Its rent roll stays." },
            { sel: "#propDocsPanel > div", label: "Documents", text: "Its files stay." }
          ] },
        { title: "Delete permanently", text: "Asks once more. The loan record is removed for good; the automatic backups keep a copy. The property and its files stay.",
          go: async (h) => { await h.click("[data-propdeleteloan]", { wait: 500 }); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmText", label: "What happens", text: "The record goes for good; only a backup can bring it back." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps it." },
            { sel: "#confirmOk", label: "Delete permanently", text: "Deletes the loan record." }
          ],
          after: async (h) => { await h.click("#confirmOk", { wait: 600 }); } }
      ] }
  ]
};
// keep the pointer off the picture: hover colours would show on whatever is under it
SPEC.topics.forEach(t => t.steps.forEach(st => { const go = st.go; st.go = async (h) => { if (go) await go(h); await h.page.mouse.move(1, 1).catch(() => {}); }; }));
module.exports = SPEC;
