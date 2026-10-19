/* Guide chapter: Underwriting & Sizing — the T12, the table, the assumptions, debt sizing, what to push and the pro forma.
   The pictures use a made-up property ("Sample Gardens (example)", 120 units) with a made-up T12
   (test/fixtures/proforma-t12.js) and made-up Claude answers (guide/fixtures). */
"use strict";
const path = require("path");
const GRID = require(path.join(__dirname, "..", "..", "test", "fixtures", "proforma-t12.js")).grid();
const KEY = "name:sample gardens (example)";
const card = (sel) => sel + " >> xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' boxline ')][1]";
const around = (sel, inner) => sel + " >> xpath=ancestor::div[.//" + inner + "][1]";
const acct = async (h, name) => { await h.js((nm) => { const r = [...document.querySelectorAll("#pfModal [data-pfacct]")].find(x => x.querySelector("td").innerText.split("\n")[0] === nm); r.click(); }, name); await h.wait(400); };
const editorTop = async (h) => { await h.js(() => { const e = document.querySelector("#pfModal [data-pfeditor]"); if (e) e.scrollIntoView({ block: "start" }); const b = document.getElementById("pfBody"); if (b) b.scrollTop = Math.max(0, b.scrollTop - 110); }); await h.wait(250); };
const bodyTop = async (h) => { await h.js(() => { const b = document.getElementById("pfBody"); if (b) b.scrollTop = 0; }); await h.wait(200); };
const line = async (h, key) => { await h.closeModals(); await h.jsClick('[data-pfline="' + key + '"]'); await h.wait(500); };
const fill = async (h, k, v) => { await h.fill('#pfModal [data-pfin="' + k + '"]', v, { change: false }); await h.js(([k2]) => { const e = document.querySelector('#pfModal [data-pfin="' + k2 + '"]'); e.dispatchEvent(new Event("input", { bubbles: true })); }, [k]); await h.wait(250); };
const kind = async (h, v) => { await h.select('#pfModal select[data-pfin="kind"]', v); };
const save = async (h) => { await h.click("#pfModal [data-pfsave]", { wait: 1200 }); };
const PANEL = "#pfBox";

module.exports = {
  id: "underwriting",
  title: "Underwriting & Sizing",
  intro: "Upload a property’s T12, check how it was read, see the in-place and underwritten NOI, set the assumptions and benchmarks, size a loan, see what to push — and build the pro forma you show a lender.",
  setup: async (h) => {
    h.acceptDialogs = [/residential units/i, /^Remove/i];
    await h.home();
    await h.js(() => { const b = document.getElementById("scopeLoanBtn"); if (b) b.click(); }); await h.wait(400);
    await h.js(() => { const bs = [...document.querySelectorAll("[data-addprop]")]; const v = bs.find(b => b.offsetParent !== null) || bs[0]; if (v) v.click(); }); await h.wait(400);
    await h.fill("#addPropName", "Sample Gardens (example)", { change: false });
    await h.click("#addPropCreate", { wait: 1200 });
    await h.closeModals();
    await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(400);
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "open", title: "Open Underwriting", intro: "Underwriting opens in its own tab, from the “+” at the end of the tab strip.",
      steps: [
        { title: "The “+” menu", text: "Click the “+” at the end of the tab strip. It lists the tools that open in a tab of their own.",
          go: async (h) => { await h.home(); await h.click("#tabNewBtn", { wait: 400 }); },
          shot: "view",
          marks: [
            { sel: "#tabNewBtn", label: "+", text: "Opens this menu: a tool in a new tab." },
            { sel: '[data-tabopen="underwriting"]', label: "Underwriting & Sizing", text: "The T12, the underwritten NOI, debt sizing and the pro forma — this chapter." },
            { sel: '[data-tabopen="calendar"]', label: "Maturity & Reset Calendar", text: "Every maturity, rate reset and interest-only step-up, month by month." },
            { sel: '[data-tabopen="health"]', label: "Data Health", text: "What is missing or needs a look, across the whole book." }
          ] },
        { title: "The Underwriting tab", text: "Underwriting opens as a tab next to Portfolio. Keep several tools open and switch between them; each tab can also open in a window of its own.", cover: true,
          go: async (h) => { await h.click('[data-tabopen="underwriting"]', { wait: 1200 }); await h.calm(); await h.top(); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back to the portfolio (Home)." },
            { sel: '[data-tabsel^="underwriting"]', label: "Underwriting", text: "This tab." },
            { sel: '[data-tabpop^="underwriting"]', label: "Pop out", text: "Opens this tab in its own window — handy on a second screen." },
            { sel: '[data-tabclose^="underwriting"]', label: "Close tab", text: "Closes the tab. Nothing is lost: the property’s T12 and figures are saved with the property." },
            { sel: "#opPropPick", label: "Property", text: "The property to underwrite. A property that already has a T12 loads it." },
            { sel: "#uwDrop", label: "The T12 box", text: "Where the property’s T12 file goes (next topic)." },
            { sel: "#uwResetBtn", label: "Clear", text: "Empties this screen. The property’s saved files and figures stay." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "upload", title: "Upload a T12", intro: "Two ways: drag the file onto the box, or click “choose a file” and pick it from your computer. Excel and CSV exports are read; the T12 sheet is found by itself.",
      steps: [
        { title: "Pick the property first", text: "Choose the property in the Property list. The T12 you upload is saved in that property’s folder, and read from there from now on.",
          go: async (h) => { await h.uwProperty(KEY); await h.top(); },
          shot: card("#uwDrop"),
          marks: [
            { sel: "#opPropPick", label: "Property", text: "The property this T12 belongs to." },
            { sel: "#uwDrop", label: "Drag and drop", text: "Drag the T12 file from your folder (File Explorer) and let go over this box." },
            { sel: "#uwFileBtn", label: "choose a file", text: "Or click here: your computer’s file window opens — find the T12, click it, then Open." }
          ] },
        { title: "Read by the reader and the AI", text: "The file is saved to the property’s folder and read twice — by the app’s own reader and by Claude — before anything from it is used. When every check passes and both agree, it is used at once; otherwise a window shows you the rows and you decide (the Documents chapter shows that window in full).",
          go: async (h) => { const f = await h.xlsx(GRID, "Sample Gardens T12 (made-up).xlsx"); await h.uwUpload(f); await h.wait(2500); await h.top(); },
          shot: card("#uwDrop"),
          marks: [
            { sel: card("#uwDrop") + " >> text=Setup built", label: "Setup built", text: "The file’s name, and that the table below was built from it." },
            { sel: "#uwFileVerified", label: "file verified", text: "The file was read in full and its totals tie to the statement." },
            { sel: "#t12Gate", label: "Checked by the reader and the AI", text: "Both readings agree — the figures are in use." },
            { sel: "[data-t12open]", label: "Review the reading", text: "Opens how each row of the file was read (next step)." },
            { sel: "[data-t12again]", label: "Read again", text: "Reads the file again from the start." },
            { sel: "#uwNoiUsed", label: "NOI used", text: "The NOI the app uses from this file, and the months it covers." }
          ] },
        { title: "Review the reading", text: "Every row of the file as the reader read it: what it is (an account, a category, a total), income or expense, its category in the file, the underwriting line it lands on, the amount used, and a check against its months. You can change any of these, with a note; nothing is saved until you click Save.",
          go: async (h) => { await h.click("[data-t12open]", { wait: 1500 }); },
          shot: "[data-t12rv] > div",
          marks: [
            { sel: "[data-t12rv] >> text=every check passes", label: "The verdict", text: "Whether every check passes and the AI agrees with the reader.", optional: true },
            { sel: "[data-t12rv] >> text=What the reader made of it", label: "What the reader made of it", text: "Account, category name, total, header… change it when the reader got a row wrong." },
            { sel: "[data-t12rv] >> text=Underwriting line", label: "Underwriting line", text: "The line of the Underwriting table this account adds to." },
            { sel: "[data-t12rv] >> text=Your note", label: "Your note", text: "Why you changed a row — kept with the reading." },
            { sel: "[data-t12rv-wait]", label: "Close without saving", text: "Closes the window and keeps the reading as it was." },
            { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves your changes; every figure from this T12 follows them." }
          ],
          after: async (h) => { await h.click("[data-t12rv-wait]", { wait: 600 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "units", title: "Units and rent", intro: "Three boxes under the file: the units, and the gross potential rent (a year’s figure, or the average rent per unit).",
      steps: [
        { title: "Units, gross potential rent, average rent", text: "The units set the replacement reserve and every per-unit figure. The gross potential rent replaces the statement’s rent in the underwritten column; leave it blank to use the statement’s.",
          go: async (h) => { await h.fill('input[data-uwf="units"]', "120", { wait: 1500 }); await h.calm(); await h.top(); },
          shot: card("#uwDrop"),
          marks: [
            { sel: 'input[data-uwf="units"]', label: "Units", text: "How many apartments the property has (from the rent roll). Typing it here also asks to save it in the property’s profile." },
            { sel: 'input[data-uwf="rrGPR"]', label: "Gross potential rent — per year", text: "A year’s rent if every unit were leased at market, before vacancy. Blank = the statement’s rent." },
            { sel: 'input[data-uwf="avgRentUnit"]', label: "Average rent per unit — per month", text: "Easier than the yearly figure: the average monthly rent for one unit; the app works out average × units × 12." },
            { sel: "[data-uwopenprofile]", label: "or set it in the property profile", text: "Opens the property’s profile, where the units are kept for the whole app.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "table", title: "The underwriting table", intro: "Every line of the T12, classified: the statement’s figure (In-Place), the underwritten figure, and each per unit.",
      steps: [
        { title: "The three figures on top", text: "In-place NOI (the statement, by the T12 rule), the underwritten NOI (the statement re-priced by your assumptions — the figure a loan is sized on) and the largest loan it supports.",
          go: async (h) => { await h.top(); },
          shot: around("#uwInPlaceNoi", "div[@id='uwMaxLoanCard']"),
          marks: [
            { sel: "#uwInPlaceNoi", label: "In-place NOI", text: "The T12’s own NOI — the 12-month total, or the last 3 months × 4 when the statement starts in a lease-up." },
            { sel: "#uwInPlaceMethod", label: "How it was worked out", text: "Which months it comes from." },
            { sel: "#uwNoiTie", label: "ties to statement NOI", text: "The lines add up to the NOI printed on the statement." },
            { sel: "#uwUwNoi", label: "Underwritten NOI", text: "The statement with your vacancy, management fee and reserves — what a lender would size on." },
            { sel: "#uwMaxLoanCard", label: "Max supportable loan", text: "The largest loan that NOI supports at the debt-sizing limits (lower on the page)." }
          ] },
        { title: "The columns", text: "Every line of the T12, classified (the line names are the app’s; the Documents chapter shows how each account was placed). Two figures per line, each also per unit.",
          go: async (h) => { await h.scroll("#uwSetupTable", 0, "start"); await h.js(() => window.scrollBy(0, -120)); await h.wait(200); },
          shot: "view",
          marks: [
            { sel: "#uwSetupTable th >> text=Line (auto-classified", label: "Line", text: "The underwriting line; a line far from its benchmark is flagged next to its name." },
            { sel: "#uwSetupTable th >> text=In-Place", label: "In-Place (T12)", text: "Each line as the statement shows it." },
            { sel: "#uwSetupTable th >> text=Underwritten", label: "Underwritten", text: "Each line after your assumptions — type over it to pin a line (next step)." },
            { sel: "#uwSetupTable th >> text=$/unit", label: "$/unit", text: "The figure ÷ the units.", nth: 0 },
            { sel: "[data-pfstart]", label: "Start a pro forma", text: "Starts the pro forma column (see the pro forma topics)." }
          ] },
        { title: "Pin a line", text: "Type a figure in the Underwritten column to pin that line: the NOI and the sizing recompute from it, and the line is tagged “edited” with who and when. The × puts it back to the computed figure.",
          go: async (h) => { await h.fill('input[data-uwline="MKT"]', "8000", { wait: 1200 }); await h.calm(); await h.scroll('input[data-uwline="MKT"]', 0, "center"); },
          shot: "view",
          marks: [
            { sel: 'input[data-uwline="MKT"]', label: "Typed figure", text: "Your underwritten Marketing for the year." },
            { sel: '[data-uwedited="MKT"]', label: "edited", text: "Marks a pinned line; hover to see when." },
            { sel: '[data-uwlinereset="MKT"]', label: "×", text: "Back to the computed figure." },
            { sel: "#uwSetupTable td >> text=vs $1,700", label: "Benchmark flag", text: "A line more than 15% from its per-unit benchmark is flagged, with the dollar gap.", optional: true }
          ],
          after: async (h) => { await h.jsClick('[data-uwlinereset="MKT"]'); await h.wait(800); } },
        { title: "The NOI rows", text: "Subtotals for rental income, effective gross income and expenses, then the reserves and the Net Operating Income — each in both columns and per unit.",
          go: async (h) => { await h.scroll("#uwNoiRow", 0, "center"); },
          shot: "view",
          marks: [
            { sel: "#uwSetupTable tr >> text=Effective Gross Income", label: "Effective Gross Income", text: "All income after vacancy and other deductions." },
            { sel: "#uwSetupTable tr >> text=Total Operating Expenses", label: "Total Operating Expenses", text: "Every expense line added up." },
            { sel: "#uwSetupTable tr >> text=Replacement Reserves", label: "Replacement Reserves", text: "Your reserves per unit × units — underwritten only (the T12 has none)." },
            { sel: "#uwNoiRow", label: "Net Operating Income", text: "In-place and underwritten NOI, and per unit." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "assumptions", title: "Assumptions and benchmarks", intro: "The three assumptions that turn the statement into the underwritten NOI, and the per-unit benchmarks that flag a line — all per property.",
      steps: [
        { title: "Assumptions, benchmarks, save", text: "Change an assumption and every underwritten figure, the sizing and the pro forma suggestions follow. Each change is kept in the property’s history.",
          go: async (h) => { await h.scroll('[data-uwbench="vacancyPct"]', 0, "center"); },
          shot: around("#uwSaveBtn", "input[@data-uwbench='vacancyPct']"),
          marks: [
            { sel: '[data-uwbench="vacancyPct"]', label: "Vacancy", text: "The vacancy you underwrite (the better of this and what the statement really runs is used)." },
            { sel: '[data-uwbench="mgmtPct"]', label: "Management fee", text: "As a % of effective gross income (again the better of this and the statement’s)." },
            { sel: '[data-uwbench="reservePerUnit"]', label: "Reserves / unit", text: "Replacement reserves a year per unit." },
            { sel: '[data-uwbenchmark="PAY"]', label: "Payroll / unit", text: "Your payroll benchmark for this property; a payroll line 15% off it is flagged." },
            { sel: '[data-uwbenchmark="RM"]', label: "R&M / unit", text: "Your repairs & maintenance benchmark." },
            { sel: "#uwSaveBtn", label: "Save to property record", text: "Saves the assumptions and benchmarks with the property, so every screen uses them." },
            { sel: "[data-uwhist]", label: "Change history", text: "Every change to these, old → new, who and when.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "sizing", title: "Debt sizing", intro: "The largest loan the underwritten NOI supports, at the limits you set for this property.",
      steps: [
        { title: "Limits and results", text: "Each limit gives a loan amount; the smallest one is the maximum supportable loan, and the limit that sets it “binds”.",
          go: async (h) => { await h.scroll('[data-uwsize="capRate"]', 0, "center"); },
          shot: card('[data-uwsize="capRate"]'),
          marks: [
            { sel: '[data-uwsize="capRate"]', label: "Cap rate", text: "Value = NOI ÷ cap rate." },
            { sel: '[data-uwsize="ltvMax"]', label: "Max LTV", text: "The loan as a share of that value." },
            { sel: '[data-uwsize="dscrMin"]', label: "Min DSCR", text: "NOI ÷ the yearly payment must be at least this." },
            { sel: '[data-uwsize="dyMin"]', label: "Min debt yield", text: "NOI ÷ the loan must be at least this." },
            { sel: '[data-uwsize="intRate"]', label: "Interest rate", text: "The rate the payment is worked out at." },
            { sel: '[data-uwsize="amortYears"]', label: "Amortization", text: "Years the payment pays the loan down over." },
            { sel: "#uwSzValue", label: "Est. value", text: "NOI ÷ cap rate." },
            { sel: "#uwSzLTV", label: "Loan @ LTV", text: "What the LTV limit allows." },
            { sel: "#uwSzDSCR", label: "Loan @ DSCR", text: "What the coverage limit allows." },
            { sel: "#uwSzDY", label: "Loan @ debt yield", text: "What the debt-yield limit allows." },
            { sel: "#uwSzMax", label: "Max supportable", text: "The smallest of the three." },
            { sel: "#uwSzBind", label: "Binds on", text: "The limit that sets it." },
            { sel: "#uwSzImpLTV", label: "Implied ratios", text: "The LTV, DSCR and debt yield at the max loan." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "history", title: "Operating history and the roll-up", intro: "The property’s months kept from every T12, and the whole portfolio’s NOI and coverage in one table.",
      steps: [
        { title: "General Data — operating history", text: "Every T12 you upload adds its months (up to 24 are kept). Each line shows its trailing 12 months and the change against the 12 before.",
          go: async (h) => { await h.scroll('h3:has-text("General Data")', 0, "start"); },
          shot: card('h3:has-text("General Data")'),
          marks: [
            { sel: card('h3:has-text("General Data")') + " >> text=In-place NOI", label: "In-place NOI", text: "The same NOI as everywhere in the app, and how it was worked out." },
            { sel: card('h3:has-text("General Data")') + " >> text=Underwritten NOI", label: "Underwritten NOI", text: "With your assumptions." },
            { sel: card('h3:has-text("General Data")') + " >> text=general-data.json", label: "Saved to the folder", text: "Kept in the property’s folder (general-data.json)." },
            { sel: card('h3:has-text("General Data")') + " >> text=Trailing", label: "Trailing 12-mo", text: "Each line’s last 12 months, and its change." }
          ] },
        { title: "Portfolio roll-up", text: "Every property: units, loans, in-place and underwritten NOI, balance, yearly debt service, DSCR, debt yield, LTV and maturity — with the total row. Click a property to underwrite it.",
          go: async (h) => { await h.scroll("#opRollupMount", 0, "start"); },
          shot: card("#opRollupMount"),
          marks: [
            { sel: "#opRollupMount th >> text=In-place NOI", label: "In-place NOI", text: "Each property’s NOI." },
            { sel: "#opRollupMount th >> text=DSCR", label: "DSCR", text: "NOI ÷ its yearly debt service." },
            { sel: "#opRollupMount >> text=Sample Gardens (example)", label: "A property", text: "Click it to open it here." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "push", title: "What to push", intro: "Claude reads the T12 against your assumptions and benchmarks and ranks what to push to raise the NOI.",
      steps: [
        { title: "Claude’s ranked moves", text: "It runs by itself once a T12 is read (Claude must be connected), and again when the T12 or the assumptions change. Each move has an estimated NOI impact and an effort.",
          go: async (h) => { await h.scroll("#opScanMount", 0, "start"); await h.wait(1500); },
          shot: "#opScanMount",
          marks: [
            { sel: "#opPushRun", label: "Re-analyse", text: "Asks Claude again." },
            { sel: "#opScanMount li", label: "A move", text: "What to do, why (from this statement’s own figures) and the effort.", nth: 0 },
            { sel: "#opScanMount >> text=estimated NOI impact", label: "Estimated NOI impact", text: "Claude’s estimate, grounded in the statement — a starting point, not advice.", nth: 0 }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "pf-start", title: "Pro forma — start it", intro: "The pro forma is the NOI you show the lender: the T12 with your changes, each with its reason, adding up to the dollar. It is the draft of the underwriting.",
      steps: [
        { title: "Start a pro forma", text: "Nothing changes until you start it.",
          go: async (h) => { await h.scroll("[data-pfbar]", 0, "center"); },
          shot: "[data-pfbar]",
          marks: [ { sel: "[data-pfstart]", label: "Start a pro forma", text: "Adds the Pro forma column next to Underwritten. It starts equal to the T12 column." } ] },
        { title: "The Pro forma column and its bar", text: "A third column, Pro forma, with its $/unit. Lines with an amber dot have a suggestion from your assumptions; a teal dot marks a line you changed.",
          go: async (h) => { await h.click("[data-pfstart]", { wait: 1500 }); await h.calm(); await h.scroll("[data-pfbar]", 0, "start"); },
          shot: card("#uwSetupTable"),
          marks: [
            { sel: "[data-pfswitch]", label: "Safe / Aggressive", text: "Which version the column shows (next topic)." },
            { sel: "[data-pfnois]", label: "The two NOIs", text: "Safe and Aggressive pro forma NOI." },
            { sel: "[data-pfsuglist]", label: "Suggestions", text: "Every open suggestion in one list.", optional: true },
            { sel: "[data-pfrevenue]", label: "Revenue credit…", text: "Annualize all revenue accounts at once (its own topic)." },
            { sel: "[data-pfadd]", label: "+ Add an account", text: "An account the T12 doesn’t have (its own topic)." },
            { sel: "[data-pflender]", label: "For the lender…", text: "The Excel file for the lender." },
            { sel: "[data-pfhistory]", label: "History", text: "Every pro forma change, with its story." },
            { sel: "[data-pfclear]", label: "Remove", text: "Removes the pro forma (its history stays)." },
            { sel: "[data-pfhead]", label: "Pro forma · Safe", text: "The column. Click any figure in it to open that line’s accounts." },
            { sel: '[data-pfsugdot="MGMT"]', label: "Amber dot", text: "This line has a suggestion waiting.", optional: true }
          ] }
      ] },
    { id: "pf-versions", title: "Pro forma — Safe and Aggressive", intro: "Two versions. Safe: what you would defend line by line. Aggressive: Safe plus the changes a cautious lender may not accept.",
      steps: [
        { title: "Two versions", text: "Aggressive starts as Safe and adds its own changes; a change made for Aggressive on an account wins over Safe’s in Aggressive. Every change says where it applies: Safe, Aggressive or Both. Use the switch to see either one in the column.",
          go: async (h) => { await h.scroll("[data-pfbar]", 0, "start"); },
          shot: "[data-pfbar]",
          marks: [
            { sel: '[data-pfshow="base"]', label: "Safe", text: "The column shows the Safe version." },
            { sel: '[data-pfshow="aggressive"]', label: "Aggressive", text: "The column shows the Aggressive version." },
            { sel: "[data-pfnois]", label: "Both NOIs", text: "The one shown first, then the other." }
          ] },
        { title: "How each one adds up", text: "Under the table, one box per version: the T12 NOI, every change grouped by its kind with its story, and the pro forma NOI — checked to the dollar.",
          go: async (h) => { await h.scroll("[data-pfrecons]", 0, "center"); },
          shot: "[data-pfrecons]",
          marks: [
            { sel: '[data-pfrecon="base"]', label: "Safe — how it adds up", text: "T12 NOI + each change = the Safe pro forma NOI." },
            { sel: '[data-pfrecon="aggressive"]', label: "Aggressive — how it adds up", text: "The same for Aggressive." },
            { sel: '[data-pfrecon="base"] [data-pfok]', label: "reconciles to the dollar", text: "The changes add up exactly (worked out twice)." }
          ] }
      ] },
    { id: "pf-panel", title: "Pro forma — a line’s accounts", intro: "Click a figure in the Pro forma column: a window opens with every account of that line.",
      steps: [
        { title: "Every account, every month", text: "The window is about 80% of the screen. On top, the line in the T12, Underwritten, Safe and Aggressive. Below, every account of the line — none hidden, a $0 one too — with its 12 months as the statement shows them.",
          go: async (h) => { await line(h, "CS"); },
          shot: PANEL,
          marks: [
            { sel: "[data-pffigs]", label: "The line", text: "T12, Underwritten, Pro forma Safe and Aggressive for the whole line, each per unit." },
            { sel: '#pfModal [data-pfacct]', label: "An account", text: "Its row in the file, its 12 months, its T12, Safe and Aggressive. Click it to change it.", nth: 1 },
            { sel: '#pfModal [data-pfacctwrap] th >> text=T12', label: "T12", text: "The account’s year in the statement." },
            { sel: '#pfModal [data-pfacctwrap] th >> text=Safe', label: "Safe / Aggressive", text: "The account in each version." },
            { sel: '#pfModal [data-pfacct] >> text=Pool Service', label: "A $0 account", text: "Shown with its twelve zeros — nothing is hidden." },
            { sel: '#pfModal [data-pfacctwrap] tr >> text=the line', label: "The line", text: "Each month and each column added up." },
            { sel: "#pfModal [data-pfnewacct]", label: "+ Add an account the T12 doesn’t have", text: "For money the statement has no account for." },
            { sel: "#pfModal [data-pfclose]", label: "×", text: "Closes the window." }
          ] }
      ] },
    { id: "pf-change", title: "Pro forma — change an account", intro: "Click an account and its choices open right under it. Each change has a kind, the version it applies to and a story.",
      steps: [
        { title: "The choices", text: "New amount (0 takes the account out), Spread over years, Annualize, % of revenue and Per unit. The next topics show each one.",
          go: async (h) => { await acct(h, "Snow Removal"); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfhow="accountTotal"]', label: "New amount", text: "Type the account’s new yearly figure. Type 0 to take it out — it reads “Took out” for the lender." },
            { sel: '#pfModal [data-pfhow="spread"]', label: "Spread over years", text: "A cost paid once every few years counts only its share for one year." },
            { sel: '#pfModal [data-pfhow="annualize"]', label: "Annualize", text: "The account becomes its last 3, 6 or 12 months × 12 ÷ the months." },
            { sel: '#pfModal [data-pfhow="pctRevenue"]', label: "% of revenue", text: "The account set as a % of revenue (expenses and rental deductions)." },
            { sel: '#pfModal [data-pfhow="perUnit"]', label: "Per unit", text: "A dollar figure per apartment per year × the units." }
          ] },
        { title: "A new amount, its kind and its story", text: "Snow removal set to $9,000 for a normal winter. Pick the kind, where it applies, and write the story the lender reads — or pick one you already wrote. The preview shows the account’s 12 months before and after, the line and the NOI.",
          go: async (h) => { await h.click('#pfModal [data-pfhow="accountTotal"]', { wait: 300 }); await fill(h, "value", "9000"); await kind(h, "normalized"); await fill(h, "story", "Snow removal ran $14,000 in a heavy winter (November to February); a normal winter at this property runs about $9,000."); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfin="value"]', label: "Its new amount", text: "The yearly figure for this account." },
            { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Why it changes: non-recurring, spread, normalized, operating change, market norm, partnership/back-office (and revenue credit when annualizing income)." },
            { sel: '#pfModal [data-pfcol="both"]', label: "Apply to", text: "Safe, Aggressive or Both." },
            { sel: '#pfModal textarea[data-pfin="story"]', label: "Story", text: "The reason the lender reads. Required." },
            { sel: "#pfModal [data-pfdraft]", label: "Draft it with Claude", text: "Claude writes a first draft from the account’s months; you edit it.", optional: true },
            { sel: "#pfPreview [data-pfmonths]", label: "Before → after", text: "The account’s 12 months in the T12 and after the change (each month in proportion)." },
            { sel: "#pfPreview [data-pfready]", label: "ready to save", text: "Or what is still missing." },
            { sel: "#pfModal [data-pfsave]", label: "Save the change", text: "Saves it; the window stays open on this line." },
            { sel: "#pfModal [data-pfcancel]", label: "Cancel", text: "Closes the choices without saving." }
          ] },
        { title: "Saved", text: "The account shows its new figure in Safe and Aggressive, and a tag with where it applies and its kind. The line’s totals follow.",
          go: async (h) => { await save(h); await bodyTop(h); },
          shot: PANEL,
          marks: [
            { sel: "#pfModal [data-pfacct] >> text=Snow Removal", label: "The changed account", text: "Now 9,000 in Safe and Aggressive; at the right end of its row, a tag says where it applies and its kind (hover it for the story)." },
            { sel: "#pfModal [data-pfacct] >> text=Both · Normalized", label: "The tag", text: "Where it applies and its kind; hover for the story.", optional: true },
            { sel: "[data-pffigs]", label: "The line", text: "Now $27,500 in both versions." }
          ] },
        { title: "Edit or remove a change", text: "Click a changed account again: its changes are listed on top, each with Edit and Remove, who made it and when.",
          go: async (h) => { await acct(h, "Snow Removal"); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: "#pfModal [data-pfchange]", label: "The change", text: "What, kind, story, who and when, and its effect on the NOI." },
            { sel: "#pfModal [data-pfedit]", label: "Edit", text: "Opens it with its figures to change." },
            { sel: "#pfModal [data-pfremove]", label: "Remove", text: "Removes it (asks first); the history keeps it." }
          ] },
        { title: "Same story as…", text: "One cause often moves several accounts. Pick a story you already wrote and it fills in — then adjust it if you want.",
          go: async (h) => { await acct(h, "Pest Control"); await h.click('#pfModal [data-pfhow="accountTotal"]', { wait: 300 }); await editorTop(h); },
          shot: PANEL,
          marks: [ { sel: "#pfModal [data-pfsamestory]", label: "Same story as…", text: "The stories already in this pro forma, with their account." } ],
          after: async (h) => { await h.click("#pfModal [data-pfcancel]", { wait: 300 }); } }
      ] },
    { id: "pf-ways", title: "Pro forma — spread, annualize, % of revenue, per unit", intro: "The other ways to change an account.",
      steps: [
        { title: "Spread over years", text: "For a cost paid once every few years that landed in this T12. Exterior painting cost $14,400 in May and is done every 5 years: the pro forma counts $14,400 ÷ 5 = $2,880 a year. It divides the whole account — for an account that mixes normal monthly costs with one big bill, use New amount instead.",
          go: async (h) => { await line(h, "RM"); await acct(h, "Exterior Painting"); await h.click('#pfModal [data-pfhow="spread"]', { wait: 300 }); await fill(h, "years", "5"); await fill(h, "story", "The exterior is painted every five years; this year's $14,400 counts as $2,880 a year."); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfin="years"]', label: "Paid every … years", text: "How often it is paid; it counts one share a year." },
            { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Set to “Spread over years” by itself." },
            { sel: "#pfPreview [data-pfmonths]", label: "Before → after", text: "$14,400 in May becomes $2,880 for the year." }
          ],
          after: async (h) => { await save(h); } },
        { title: "Annualize", text: "When an account runs differently in its recent months — a new contract, a rent increase — it becomes its last 3, 6 or 12 months × 12 ÷ the months. Each choice shows what it gives; the last 12 months on a normal 12-month T12 is the T12 itself, so it is greyed (“same as the T12”).",
          go: async (h) => { await line(h, "UTIL"); await acct(h, "Electric"); await h.click('#pfModal [data-pfhow="annualize"]', { wait: 300 }); await h.click('#pfModal [data-pfmo="3"]', { wait: 300 }); await fill(h, "story", "A new electricity contract since April; the last three months are the run-rate."); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfmo="3"]', label: "Last 3 months", text: "× 4 — here $28,400 a year." },
            { sel: '#pfModal [data-pfmo="6"]', label: "Last 6 months", text: "× 2 — $29,400." },
            { sel: '#pfModal [data-pfmo="12"]', label: "Last 12 months", text: "Only different from the T12 when the file has more than 12 months, or the T12 rule used the last 3 months × 4." },
            { sel: "#pfModal >> text=Months used", label: "Months used", text: "The months it comes from." },
            { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Operating change for an expense; Revenue credit for an income account." }
          ],
          after: async (h) => { await save(h); } },
        { title: "% of revenue", text: "The account set as a % of revenue: an expense as a % of that version’s effective gross income, a rental deduction (vacancy, bad debt) as a % of gross potential rent. Because you chose it, it moves when that version’s revenue moves — the management fee never moves by itself.",
          go: async (h) => { await line(h, "MGMT"); await acct(h, "Management Fee"); await h.click('#pfModal [data-pfhow="pctRevenue"]', { wait: 300 }); await fill(h, "pct", "3"); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfin="pct"]', label: "%", text: "The percentage." },
            { sel: "#pfModal >> text=you chose it", label: "It follows revenue", text: "Only because you picked % of revenue." },
            { sel: "#pfModal >> text=The management fee stays at the T12 figure", label: "The management fee", text: "Stays at the T12 unless you change its account." }
          ],
          after: async (h) => { await h.click("#pfModal [data-pfcancel]", { wait: 300 }); } },
        { title: "Per unit", text: "A dollar figure per apartment per year, times the units (120 here) — for a cost quoted per unit, like a maintenance role or turnover.",
          go: async (h) => { await line(h, "PAY"); await acct(h, "Maintenance Salary"); await h.click('#pfModal [data-pfhow="perUnit"]', { wait: 300 }); await fill(h, "perUnit", "300"); await h.click('#pfModal [data-pfcol="aggressive"]', { wait: 300 }); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfin="perUnit"]', label: "$ per unit a year", text: "× the property’s units." },
            { sel: '#pfModal [data-pfcol="aggressive"]', label: "Aggressive", text: "Here only in the Aggressive version." },
            { sel: "#pfPreview", label: "Preview", text: "Safe unchanged; Aggressive $300 × 120 = $36,000." }
          ],
          after: async (h) => { await h.click("#pfModal [data-pfcancel]", { wait: 300 }); } }
      ] },
    { id: "pf-suggest", title: "Pro forma — suggestions from your assumptions", intro: "The pro forma is the draft of the underwriting: when a line runs above your assumption, its biggest account gets a suggestion with a ready story. Nothing is applied by itself.",
      steps: [
        { title: "A suggestion on the account", text: "The management fee runs 3% of revenue; your assumption is 2.5%. Its account carries a “Suggested” chip; open it to see the suggestion and why.",
          go: async (h) => { await line(h, "MGMT"); await acct(h, "Management Fee"); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfsugchip="assume:MGMT"]', label: "Suggested", text: "A suggestion is waiting on this account." },
            { sel: '#pfModal [data-pfsug="assume:MGMT"]', label: "The suggestion", text: "The change, its kind, the default story and why." },
            { sel: '#pfModal [data-pfusesug="assume:MGMT"]', label: "Use this", text: "Fills the change and its story in — you can still edit before saving." },
            { sel: '#pfModal [data-pfskip="assume:MGMT"]', label: "Not this one", text: "Sets it aside (you can bring it back)." }
          ] },
        { title: "Every suggestion in one list", text: "The “suggestions” button in the bar lists every open suggestion — from your assumptions and from Claude — each with “Open the account”.",
          go: async (h) => { await h.closeModals(); await h.click("[data-pfsuglist]", { wait: 500 }); },
          shot: "#pfBox",
          marks: [ { sel: "#pfModal [data-pfsuglistrow]", label: "A suggestion", text: "Where, what and its story." }, { sel: "#pfModal [data-pfusesug]", label: "Open the account", text: "Opens the line with the suggestion filled in." } ] }
      ] },
    { id: "pf-stories", title: "Pro forma — Claude’s stories", intro: "In What to push: Claude reads every account month by month and suggests changes a lender would accept.",
      steps: [
        { title: "Stories for the pro forma", text: "Each card: the line and the account, the change and its kind, the story, how Claude got the number and what you need to back it with the lender, and what it does to the NOI. Claude may not invent an event or a figure; where a story rests on a fact it can’t see, it says what you must confirm.",
          go: async (h) => { await h.closeModals(); await h.click("#pfStoriesRun", { wait: 4000 }); await h.scroll("#opStoriesMount", 0, "start"); },
          shot: "#opStoriesMount",
          marks: [
            { sel: "#pfStoriesRun", label: "Find stories / Look again", text: "Asks Claude (it needs Claude connected)." },
            { sel: "#opStoriesMount [data-pfstory]", label: "A story", text: "One account, one change, its story.", nth: 1 },
            { sel: "#opStoriesMount >> text=How Claude got the number", label: "How Claude got the number", text: "From the statement’s own figures.", nth: 0 },
            { sel: "#opStoriesMount >> text=To back it with the lender", label: "To back it", text: "What you need on hand to prove it.", nth: 0 },
            { sel: "#opStoriesMount [data-pfputsug]", label: "Put it in the pro forma draft", text: "Opens the account with it filled in, to check and save.", optional: true },
            { sel: "#opStoriesMount >> text=In the pro forma", label: "In the pro forma ✓", text: "Already in.", optional: true }
          ] }
      ] },
    { id: "pf-add", title: "Pro forma — add an account", intro: "For money the T12 has no account for — a PILOT tax, an antenna lease, bad debt at a market norm.",
      steps: [
        { title: "Pick the line", text: "“+ Add an account” in the bar lists every line — the ones in your T12 first, then the ones it doesn’t have.",
          go: async (h) => { await h.closeModals(); await h.click("[data-pfadd]", { wait: 500 }); },
          shot: "#pfBox",
          marks: [ { sel: '#pfModal [data-pfaddline="ANT"]', label: "A line the T12 doesn’t have", text: "Adding an account here adds the line to the pro forma." } ] },
        { title: "Name it, its amount, its story", text: "Name the account, give its amount (or % of revenue, or per unit), the kind, where it applies and the story.",
          go: async (h) => { await h.click('#pfModal [data-pfaddline="ANT"]', { wait: 500 }); await fill(h, "newName", "Rooftop antenna lease"); await h.click('#pfModal [data-pfhow="accountTotal"]', { wait: 300 }); await fill(h, "value", "6000"); await kind(h, "operating"); await h.click('#pfModal [data-pfcol="aggressive"]', { wait: 300 }); await fill(h, "story", "A rooftop antenna lease was signed in September at $500 a month."); await editorTop(h); },
          shot: PANEL,
          marks: [
            { sel: '#pfModal [data-pfin="newName"]', label: "Account name", text: "What the lender will see." },
            { sel: '#pfModal [data-pfin="value"]', label: "Its amount", text: "A year’s figure." },
            { sel: "#pfPreview", label: "Preview", text: "Nothing in Safe; $500 a month in Aggressive." }
          ],
          after: async (h) => { await save(h); } }
      ] },
    { id: "pf-revenue", title: "Pro forma — revenue credit", intro: "Every revenue account annualized at once from its last 3, 6 or 12 months — when the property runs better now than the year shows.",
      steps: [
        { title: "Revenue credit", text: "Each revenue account becomes its last 3 months × 4 (or 6 × 2). The table shows every revenue line month by month, the months used highlighted, the T12 and the annualized figure; today’s occupancy from the rent roll if there is one. A story is required. The management fee does not follow it.",
          go: async (h) => { await h.closeModals(); await h.click("[data-pfrevenue]", { wait: 500 }); await h.click('#pfModal [data-pfrevmo="3"]', { wait: 300 }); await h.fill("#pfModal [data-pfrevstory]", "Lease-up finished in the spring; the last three months show the rent after the renewals.", { change: false }); },
          shot: "#pfBox",
          marks: [
            { sel: '#pfModal [data-pfrevver="base"]', label: "Safe / Aggressive (its own)", text: "Aggressive can have its own; until then it uses Safe’s." },
            { sel: '#pfModal [data-pfrevmo="3"]', label: "T3 / T6 / T12", text: "How many recent months. T12 changes nothing on a normal 12-month file." },
            { sel: "#pfModal >> text=Months used", label: "Months used", text: "Which months." },
            { sel: "#pfModal th >> text=Annualized", label: "Annualized", text: "Each line after the credit." },
            { sel: "#pfModal [data-pfrevstory]", label: "Story", text: "The reason the lender reads." },
            { sel: "#pfModal [data-pfrevsave]", label: "Save the revenue credit", text: "Saves it." }
          ],
          after: async (h) => { await h.click("#pfModal [data-pfrevsave]", { wait: 1200 }); } }
      ] },
    { id: "pf-result", title: "Pro forma — the result, the lender file, history", intro: "The column and how it adds up after the changes; the Excel file for the lender; every change’s history.",
      steps: [
        { title: "The column after the changes", text: "Changed lines are outlined with a teal dot; hover one to see its kinds. The NOI rows follow.",
          go: async (h) => { await h.closeModals(); await h.scroll("[data-pfbar]", 0, "start"); },
          shot: card("#uwSetupTable"),
          marks: [ { sel: '[data-pfchanged="CS"]', label: "A changed line", text: "Teal dot: this line has changes." }, { sel: "#uwNoiRowPf", label: "Pro forma NOI", text: "In the NOI row.", optional: true } ] },
        { title: "How it adds up", text: "T12 NOI + the revenue credit + each account change, grouped by kind with its story = the pro forma NOI, for Safe and for Aggressive.",
          go: async (h) => { await h.scroll("[data-pfrecons]", 0, "center"); },
          shot: "[data-pfrecons]",
          marks: [ { sel: '[data-pfrecon="base"] [data-pfgroup="revenue"]', label: "Revenue credit", text: "The credit’s effect." }, { sel: '[data-pfrecon="base"] [data-pfgroup="normalized"]', label: "Normalized", text: "Snow removal, with its story." } ] },
        { title: "For the lender — the Excel file", text: "Safe only, or Safe and Aggressive. The file has four sheets: Pro forma (each line with its change, kind and story), Changed accounts, Reconciliation and Monthly (the months used for the revenue credit marked).",
          go: async (h) => { await h.click("[data-pflender]", { wait: 500 }); },
          shot: "#pfBox",
          marks: [
            { sel: '#pfModal input[name="pfLenderWhich"][value="base"]', label: "Safe only", text: "One version." },
            { sel: '#pfModal input[name="pfLenderWhich"][value="both"]', label: "Safe and Aggressive", text: "Both, side by side." },
            { sel: "#pfModal [data-pflenderbuild]", label: "Save the Excel file…", text: "Asks where to save “<property> — Pro forma — <date>.xlsx”." }
          ] },
        { title: "History", text: "Every pro forma change, edit, removal and set-aside, newest first: which line and account, old → new, the kind and story, who and when.",
          go: async (h) => { await h.closeModals(); await h.click("[data-pfhistory]", { wait: 900 }); },
          shot: "#historyModal > div",
          marks: [ { sel: "#historyBody tr", label: "An entry", text: "One change with its story.", nth: 1 }, { sel: "#historyClose", label: "×", text: "Closes it." } ] }
      ] }
  ]
};
