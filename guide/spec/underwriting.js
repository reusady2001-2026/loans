/* Guide chapter: Underwriting — upload a T12, draft the underwriting (Safe and Aggressive, account by account, each change
   with its story), Claude's stories and the assumptions' suggestions, the approval, What to push and debt sizing; and the
   reference pages for the Underwriting tab and the pro forma window. The pictures use a made-up property ("Sample Gardens
   (example)", 120 units) with a made-up T12 (test/fixtures/proforma-t12.js) and made-up Claude answers (guide/fixtures).
   The pages are captured in the order listed: each one leaves the property as the next one needs it (the snow-removal
   change, the revenue credit, the antenna lease, the pest-control story, then the approval). The two reference pages come
   last and leave nothing changed. */
"use strict";
const path = require("path");
const GRID = require(path.join(__dirname, "..", "..", "test", "fixtures", "proforma-t12.js")).grid();
const KEY = "name:sample gardens (example)";
const card = (sel) => sel + " >> xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' boxline ')][1]";
const around = (sel, inner) => sel + " >> xpath=ancestor::div[.//" + inner + "][1]";
const acct = async (h, name) => { await h.js((nm) => { const r = [...document.querySelectorAll("#pfModal [data-pfacct]")].find(x => x.querySelector("td").innerText.split("\n")[0] === nm); r.click(); }, name); await h.wait(400); };
const editorTop = async (h) => { await h.js(() => { const e = document.querySelector("#pfModal [data-pfeditor]"); if (e) e.scrollIntoView({ block: "start" }); const b = document.getElementById("pfBody"); if (b) b.scrollTop = Math.max(0, b.scrollTop - 110); }); await h.wait(250); };
// the editor's form at the top of the window (for a changed account, its changes are listed above the form)
const formTop = async (h) => { await h.js(() => { const e = document.querySelector("#pfModal [data-pfform]"); if (e) e.scrollIntoView({ block: "start" }); const b = document.getElementById("pfBody"); if (b) b.scrollTop = Math.max(0, b.scrollTop - 40); }); await h.wait(250); };
const bodyTop = async (h) => { await h.js(() => { const b = document.getElementById("pfBody"); if (b) b.scrollTop = 0; }); await h.wait(200); };
const line = async (h, key) => { await h.closeModals(); await h.jsClick('[data-pfline="' + key + '"]'); await h.wait(500); };
const fill = async (h, k, v) => { await h.fill('#pfModal [data-pfin="' + k + '"]', v, { change: false }); await h.js(([k2]) => { const e = document.querySelector('#pfModal [data-pfin="' + k2 + '"]'); e.dispatchEvent(new Event("input", { bubbles: true })); }, [k]); await h.wait(250); };
const kind = async (h, v) => { await h.select('#pfModal select[data-pfin="kind"]', v); };
const save = async (h) => { await h.click("#pfModal [data-pfsave]", { wait: 1200 }); };
const cancel = async (h) => { await h.click("#pfModal [data-pfcancel]", { wait: 300 }); };
const PANEL = "#pfBox";
// to the top of the page at once (the page scrolls smoothly by itself, too slowly for a picture)
const top = async (h) => { await h.js(() => { window.scrollTo({ top: 0, behavior: "instant" }); document.querySelectorAll("main, [data-scrollroot]").forEach(e => { e.scrollTop = 0; }); }); await h.wait(300); };
// the T12 drop: the draft starts by itself once the T12 is read — wait for its column
const upload = async (h, file) => { await h.page.setInputFiles("#uwFile", file); await h.page.waitForFunction(() => !!document.querySelector("[data-pfline]"), null, { timeout: 30000 }).catch(() => {}); await h.wait(1500); await h.calm(); };
const approve = async (h) => { await h.page.waitForFunction(() => { const b = document.querySelector("[data-uwapprove]"); return b && !b.disabled; }, null, { timeout: 15000 }); await h.jsClick("[data-uwapprove]"); await h.wait(2500); await h.calm(); };
const uwTop = async (h) => { await h.scroll("#uwSetupOut", 0, "start"); await h.js(() => window.scrollBy(0, -90)); await h.wait(200); };
const barTop = async (h) => { await h.closeModals(); await h.scroll("[data-pfbar]", 0, "center"); };
// Claude's stories (the made-up answers) and What to push — each waits for Claude's cards
const storiesReady = async (h) => { await h.page.waitForFunction(() => !!document.querySelector("#opStoriesMount [data-pfstory]"), null, { timeout: 60000 }); await h.wait(500); await h.calm(); };
const pushReady = async (h) => { await h.page.waitForFunction(() => !!document.querySelector("#opScanMount [data-pushimpacts]"), null, { timeout: 30000 }); await h.calm(); await h.scroll("#opScanMount", 0, "start"); await h.js(() => window.scrollBy(0, -60)); await h.wait(300); };
const ASSUME = around("#uwSaveBtn", "input[@data-uwbench='vacancyPct']");
const FIGS = around("#uwInPlaceNoi", "div[@data-uwvercard='aggressive']");
const GD = card('h3:has-text("General Data")');

module.exports = {
  id: "underwriting",
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
  pages: [
    // ==================================================================================================================
    { id: "upload-a-t12", kind: "howto", group: "Underwriting", title: "Upload a T12",
      description: "Give a property its T12, so the app can read it and start the underwriting.",
      intro: "The T12 is where a property’s underwriting starts: every account, month by month, and the in-place NOI. Upload it in Underwriting: the app saves it in the property’s folder, reads and checks it, and starts the underwriting draft from it. Without a T12 there is no underwriting, and no refinance.",
      before: [ "The property in the app — see [Add a property](add-a-property).", "The property’s T12 as an Excel or CSV export." ],
      sections: [
        { title: "Open Underwriting",
          steps: [
            { text: "Click **+** at the end of the tab strip, then **Underwriting & Sizing**. Underwriting opens in a tab of its own.",
              go: async (h) => { await h.home(); await h.click("#tabNewBtn", { wait: 400 }); },
              shot: "view",
              marks: [
                { sel: "#tabNewBtn", label: "+", text: "Opens the menu of tools that open in a tab." },
                { sel: '[data-tabopen="underwriting"]', label: "Underwriting & Sizing", text: "Opens the Underwriting tab." }
              ],
              after: async (h) => { await h.click('[data-tabopen="underwriting"]', { wait: 1200 }); await h.calm(); await top(h); } },
            { text: "Pick the property in **Property**. A property that already has a T12 loads it, with its underwriting.",
              go: async (h) => { await h.uwProperty(KEY); await top(h); },
              shot: card("#uwDrop"),
              marks: [
                { sel: "#opPropPick", label: "Property", text: "The property the T12 belongs to." },
                { sel: "#uwDrop", label: "The T12 box", text: "Drop the file here." },
                { sel: "#uwFileBtn", label: "choose a file", text: "Or pick the file in your computer’s file window." }
              ] }
          ] },
        { title: "Upload the file",
          steps: [
            { text: "Drag the T12 file from its folder and let go over the box. Or click **choose a file**, pick the T12 and click **Open**.",
              go: async (h) => { const f = await h.xlsx(GRID, "Sample Gardens T12 (made-up).xlsx"); await upload(h, f); await top(h); } },
            { text: "Wait while the file is read. The app’s own reader and Claude each read it. When every check passes and both agree, the T12 is used at once, and the underwriting draft starts from it.",
              shot: card("#uwDrop"),
              marks: [
                { sel: "#t12Gate", label: "Checked by the reader and the AI", text: "Both readings agree: the figures are in use." },
                { sel: "#uwNoiUsed", label: "NOI used", text: "The in-place NOI from this T12, and the months it covers." },
                { sel: "[data-t12open]", label: "Review the reading", text: "How each row of the file was read." }
              ],
              note: "When a check fails, Claude reads the file differently, or Claude isn’t connected, a window asks you to decide. Until then the T12 waits, unused. See [Check a T12](check-a-t12)." }
          ] },
        { title: "Enter the units",
          steps: [
            { text: "Type the number of apartments in **Units**. When the app asks to update the property’s profile to match, click **OK**.",
              go: async (h) => { await h.fill('input[data-uwf="units"]', "120", { wait: 1500 }); await h.calm(); await top(h); },
              shot: card("#uwDrop"),
              marks: [
                { sel: 'input[data-uwf="units"]', label: "Units", text: "From the rent roll. Sets the replacement reserves and every per-unit figure." },
                { sel: 'input[data-uwf="rrGPR"]', label: "Gross potential rent — per year", text: "Optional: a year’s rent with every unit leased at market." },
                { sel: 'input[data-uwf="avgRentUnit"]', label: "Average rent per unit — per month", text: "Or the average monthly rent for one unit." }
              ] }
          ],
          note: "A gross potential rent above the T12’s comes into the draft as a suggestion, never by itself. Leave it blank to keep the statement’s rent." }
      ],
      next: [
        { page: "draft-the-underwriting", text: "Draft Safe and Aggressive from the T12." },
        { page: "check-a-t12", text: "See how each row of a T12 was read, and correct it." },
        { page: "ref-underwriting", text: "Every part of the Underwriting tab, named." }
      ] },

    // ==================================================================================================================
    { id: "draft-the-underwriting", kind: "howto", group: "Underwriting", title: "Draft the underwriting",
      description: "Turn the T12 into a Safe and an Aggressive underwriting, with a story for every change.",
      intro: "The underwriting is the NOI you ask a lender to accept: the T12, with the changes you can explain. It has two versions. Safe is what you would defend line by line; Aggressive is Safe plus the changes a cautious lender may not accept. Both start as the T12 less the replacement reserves, and stay a draft until you approve them.",
      before: [ "A T12 for the property — see [Upload a T12](upload-a-t12)." ],
      sections: [
        { title: "Set the assumptions",
          steps: [
            { text: "Scroll down to **Underwriting assumptions**, under the underwriting table." },
            { text: "Type the property’s **Vacancy**, **Management fee** and **Reserves / unit**, and your payroll and R&M benchmarks.",
              go: async (h) => { await h.scroll('[data-uwbench="vacancyPct"]', 0, "center"); },
              shot: ASSUME,
              marks: [
                { sel: '[data-uwbench="vacancyPct"]', label: "Vacancy", text: "A vacancy that runs above it gets a suggestion at it." },
                { sel: '[data-uwbench="mgmtPct"]', label: "Management fee", text: "The same, as a % of effective gross income." },
                { sel: '[data-uwbench="reservePerUnit"]', label: "Reserves / unit", text: "A year’s replacement reserves per unit, taken off Safe and Aggressive." },
                { sel: "#uwSaveBtn", label: "Save to property record", text: "Keeps them with the property, for every screen." }
              ] },
            { text: "Click **Save to property record**." }
          ],
          note: "The assumptions never change the underwriting by themselves. A line that runs worse than one gets a suggestion in the draft; one that would lower the NOI gets only a warning." },
        { title: "Read the starting figures",
          steps: [
            { text: "Scroll back up to the three figures under the T12: the in-place NOI, and the Safe and Aggressive underwriting NOI after the reserves.",
              go: async (h) => { await uwTop(h); },
              shot: FIGS,
              marks: [
                { sel: "#uwInPlaceNoi", label: "In-place NOI", text: "The T12’s own NOI." },
                { sel: "#uwSafeNoi", label: "Safe underwriting NOI", text: "The T12 with Safe’s changes, less the reserves." },
                { sel: "#uwAggrNoi", label: "Aggressive underwriting NOI", text: "Safe plus Aggressive’s own changes, less the reserves." },
                { sel: '[data-uwvercard="base"] >> text=not approved yet', label: "draft · not approved yet", text: "Nothing else uses it until you approve it." }
              ] }
          ] },
        { title: "Change the accounts",
          steps: [
            { text: "In the underwriting bar above the table, click **Safe** or **Aggressive**. The **Underwriting** column shows that version.",
              go: async (h) => { await h.scroll("[data-pfbar]", 0, "start"); },
              shot: "[data-pfbar]",
              marks: [
                { sel: '[data-pfshow="base"]', label: "Safe", text: "Shows the Safe version." },
                { sel: '[data-pfshow="aggressive"]', label: "Aggressive", text: "Shows the Aggressive version." },
                { sel: "[data-pfnois]", label: "The two NOIs", text: "The version shown first, then the other." }
              ] },
            { text: "Click a figure in the **Underwriting** column. A window opens with every account of that line: change them there, one by one, each with its story. See [Change an account](change-an-account).",
              go: async (h) => { await h.scroll("#uwSetupTable", 0, "start"); await h.js(() => window.scrollBy(0, -120)); await h.wait(200); },
              shot: "view",
              marks: [
                { sel: "[data-pfhead]", label: "Underwriting · Safe", text: "The version the switch shows, line by line." },
                { sel: '[data-pfline="CS"]', label: "A figure", text: "Click it to open the line’s accounts." }
              ] }
          ],
          note: "Aggressive starts as Safe and adds its own changes; on an account changed for both, Aggressive’s own change wins in Aggressive. Every change says where it applies: Safe, Aggressive or Both.",
          tip: "Money the T12 has no account for goes in with **+ Add an account** — see [Add an account](add-an-account). For the changes Claude finds for you, see [Use Claude’s stories and suggestions](use-claudes-stories)." },
        { title: "Check how it adds up",
          steps: [
            { text: "Scroll below the table. One box per version adds it up: the T12 NOI, each change grouped by its kind with its story, the replacement reserves and the underwriting NOI.",
              go: async (h) => { await h.scroll("[data-pfrecons]", 0, "center"); },
              shot: "[data-pfrecons]",
              marks: [
                { sel: '[data-pfrecon="base"]', label: "Safe — how it adds up", text: "T12 NOI + each change − reserves." },
                { sel: '[data-pfrecon="base"] [data-pfok]', label: "reconciles to the dollar", text: "The changes add up exactly." },
                { sel: '[data-pfuwnoi="base"]', label: "= Safe underwriting NOI", text: "The figure you approve." }
              ] },
            { text: "When both versions are what you would show, approve them — see [Approve the underwriting](approve-the-underwriting). Until then nothing else uses the draft: **What to push**, at the bottom of the tab, waits for the approval.",
              go: async (h) => { await h.scroll("#opScanMount", 0, "center"); },
              shot: card("#opScanMount"),
              marks: [ { sel: "#opScanMount [data-pushneedsapproval]", label: "Approve the underwriting first", text: "What to push works from the approved Safe and Aggressive." } ] }
          ] }
      ],
      next: [
        { page: "change-an-account", text: "Change an account, with its kind and story." },
        { page: "use-claudes-stories", text: "Let Claude find the changes a lender would accept." },
        { page: "approve-the-underwriting", text: "Make Safe and Aggressive the property’s underwriting." }
      ] },

    // ==================================================================================================================
    { id: "change-an-account", kind: "howto", group: "Underwriting", title: "Change an account",
      description: "Give one account a new figure in the underwriting, with its kind and the story the lender reads.",
      intro: "Every change in the underwriting is made on one account, with its kind (why it changes), the versions it applies to, and a story. Before you save, a preview shows the account’s 12 months before and after, the line and the NOI. Here, a heavy winter’s snow removal is brought to a normal year.",
      before: [ "A T12 for the property — see [Upload a T12](upload-a-t12)." ],
      sections: [
        { title: "Open the account",
          steps: [
            { text: "In the **Underwriting** column, click the figure of the account’s line. The pro forma window opens with every account of the line — a $0 one too — and its 12 months as the statement shows them.",
              go: async (h) => { await line(h, "CS"); },
              shot: PANEL,
              marks: [
                { sel: "[data-pffigs]", label: "The line", text: "In the T12, in Safe and in Aggressive." },
                { sel: "#pfModal [data-pfacct]", nth: 1, label: "An account", text: "Click it to change it." }
              ] },
            { text: "Click the account. The ways to change it open under it.",
              go: async (h) => { await acct(h, "Snow Removal"); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfhow="accountTotal"]', label: "New amount", text: "A new yearly figure; 0 takes the account out." },
                { sel: '#pfModal [data-pfhow="spread"]', label: "Spread over years", text: "For a cost paid once every few years." },
                { sel: '#pfModal [data-pfhow="annualize"]', label: "Annualize", text: "Its last 3, 6 or 12 months, made a year." },
                { sel: '#pfModal [data-pfhow="pctRevenue"]', label: "% of revenue", text: "A share of revenue." },
                { sel: '#pfModal [data-pfhow="perUnit"]', label: "Per unit", text: "Dollars per apartment a year." }
              ],
              tip: "These steps use **New amount**. For the other ways, see [The pro forma window](ref-pro-forma#ways-to-change-an-account)." }
          ] },
        { title: "Make the change",
          steps: [
            { text: "Click **New amount** and type the account’s yearly figure.",
              go: async (h) => { await h.click('#pfModal [data-pfhow="accountTotal"]', { wait: 300 }); await fill(h, "value", "9000"); } },
            { text: "Pick the **Kind**: why it changes. Here **Normalized**, an unusual year brought to a normal one.",
              go: async (h) => { await kind(h, "normalized"); } },
            { text: "Under **Apply to**, click **Safe**, **Aggressive** or **Both**." },
            { text: "Write the **Story**: the reason the lender reads. To start from a draft, click **Draft it with Claude**.",
              go: async (h) => { await fill(h, "story", "Snow removal ran $14,000 in a heavy winter (November to February); a normal winter at this property runs about $9,000."); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfin="value"]', label: "Its new amount", text: "The account’s yearly figure." },
                { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Why it changes." },
                { sel: '#pfModal [data-pfcol="both"]', label: "Apply to", text: "Safe, Aggressive or Both." },
                { sel: '#pfModal textarea[data-pfin="story"]', label: "Story", text: "Required." },
                { sel: "#pfPreview [data-pfmonths]", label: "Before → after", text: "The account’s 12 months in the T12 and after the change." }
              ] },
            { text: "Check the preview, then click **Save the change**. The window stays open on the line: the account shows its new figure, and a tag says where it applies and its kind.",
              go: async (h) => { await save(h); await bodyTop(h); },
              shot: PANEL,
              marks: [
                { sel: "#pfModal [data-pfacct] >> text=Snow Removal", label: "The changed account", text: "Now 9,000 in Safe and in Aggressive." },
                { sel: "#pfModal [data-pfacct] >> text=Both · Normalized", label: "The tag", text: "Where it applies and its kind. Hover it to read the story.", optional: true },
                { sel: "[data-pffigs]", label: "The line", text: "The line’s totals follow." }
              ] }
          ],
          tip: "One cause often moves several accounts. Pick a story you already wrote in **Same story as…** and it fills in; then adjust it." },
        { title: "Edit or remove a change",
          steps: [
            { text: "Click the changed account again. Its changes are listed on top: what changed, the kind, the story, who made it and when, and its effect on the NOI.",
              go: async (h) => { await acct(h, "Snow Removal"); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: "#pfModal [data-pfchange]", label: "The change", text: "With its story and its effect on the NOI." },
                { sel: "#pfModal [data-pfedit]", label: "Edit", text: "Opens it with its figures, to change." },
                { sel: "#pfModal [data-pfremove]", label: "Remove", text: "Takes it out (asks first)." }
              ] },
            { text: "Click **Edit** to change its figures or its story, then **Save the edit**. Or click **Remove** to take it out; the app asks first." }
          ],
          note: "The underwriting’s **History** keeps every change, edit and removal, with its story." },
        { title: "Credit all revenue at once",
          text: "When the property runs better now than the year shows — it filled up, or rents went up — annualize every revenue account at once from its last months.",
          steps: [
            { text: "Close the window and click **Revenue credit…** in the underwriting bar.",
              go: async (h) => { await h.closeModals(); await h.click("[data-pfrevenue]", { wait: 500 }); } },
            { text: "Click **T3 — last 3 months**, or T6, or T12. Each revenue account becomes its last 3 months × 4 (or 6 × 2).",
              go: async (h) => { await h.click('#pfModal [data-pfrevmo="3"]', { wait: 300 }); } },
            { text: "Write the story and click **Save the revenue credit**.",
              go: async (h) => { await h.fill("#pfModal [data-pfrevstory]", "Lease-up finished in the spring; the last three months show the rent after the renewals.", { change: false }); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfrevmo="3"]', label: "T3 / T6 / T12", text: "How many recent months." },
                { sel: "#pfModal th >> text=Annualized", label: "Annualized", text: "Each revenue line after the credit." },
                { sel: "#pfModal [data-pfrevstory]", label: "Story", text: "Required." },
                { sel: "#pfModal [data-pfrevsave]", label: "Save the revenue credit", text: "Saves it." }
              ],
              after: async (h) => { await h.click("#pfModal [data-pfrevsave]", { wait: 1200 }); } }
          ],
          note: "The management fee doesn’t follow the revenue credit. Aggressive uses Safe’s credit until you give it its own." }
      ],
      next: [
        { page: "add-an-account", text: "Add money the T12 has no account for." },
        { page: "use-claudes-stories", text: "Let Claude find the changes a lender would accept." },
        { page: "ref-pro-forma", text: "Every way to change an account, and each window, named." }
      ] },

    // ==================================================================================================================
    { id: "add-an-account", kind: "howto", group: "Underwriting", title: "Add an account",
      description: "Add income or a cost the T12 has no account for, with its amount and its story.",
      intro: "Some money isn’t in the T12 at all: an antenna lease signed after its year, a PILOT tax, bad debt at a market norm. Add it as an account of its own, under the line it belongs to, with its amount, its kind and its story.",
      before: [ "A T12 for the property — see [Upload a T12](upload-a-t12)." ],
      sections: [
        { title: "Pick the line",
          steps: [
            { text: "Click **+ Add an account** in the underwriting bar. A window lists every line by section: the ones in your T12 first, then the ones it doesn’t have.",
              go: async (h) => { await h.closeModals(); await h.click("[data-pfadd]", { wait: 500 }); },
              shot: PANEL,
              marks: [ { sel: '#pfModal [data-pfaddline="ANT"]', label: "A line the T12 doesn’t have", text: "Adding an account here adds the line to the underwriting." } ] },
            { text: "Click the line the money belongs to. Here **Antenna Income**.",
              go: async (h) => { await h.click('#pfModal [data-pfaddline="ANT"]', { wait: 500 }); } }
          ] },
        { title: "Fill it in",
          steps: [
            { text: "Type the **Account name**, as the lender will see it.",
              go: async (h) => { await fill(h, "newName", "Rooftop antenna lease"); } },
            { text: "Click **Its amount** and type a year’s figure. Or click **Per unit** for dollars per apartment a year (on an expense line, **% of revenue** is there too).",
              go: async (h) => { await h.click('#pfModal [data-pfhow="accountTotal"]', { wait: 300 }); await fill(h, "value", "6000"); } },
            { text: "Pick the **Kind**, choose where it applies under **Apply to**, and write the **Story**.",
              go: async (h) => { await kind(h, "operating"); await h.click('#pfModal [data-pfcol="aggressive"]', { wait: 300 }); await fill(h, "story", "A rooftop antenna lease was signed in September at $500 a month."); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfin="newName"]', label: "Account name", text: "What the lender will see." },
                { sel: '#pfModal [data-pfin="value"]', label: "Its amount", text: "A year’s figure." },
                { sel: '#pfModal [data-pfcol="aggressive"]', label: "Apply to", text: "Here only in Aggressive." },
                { sel: "#pfPreview", label: "Preview", text: "Nothing in Safe; $500 a month in Aggressive." }
              ] },
            { text: "Click **Save the change**.",
              go: async (h) => { await save(h); } }
          ] }
      ],
      next: [
        { page: "change-an-account", text: "Change an account the T12 already has." },
        { page: "approve-the-underwriting", text: "Approve Safe and Aggressive when they’re ready." }
      ] },

    // ==================================================================================================================
    { id: "use-claudes-stories", kind: "howto", group: "Underwriting", title: "Use Claude’s stories and suggestions",
      description: "Let Claude find the accounts a lender would accept changing, and put the ones you agree with into the draft.",
      intro: "Claude reads every account month by month and suggests changes a lender would accept, each with its story — only ones that raise the NOI, and only ones it confirmed. Your own assumptions suggest changes too, when a line runs worse than them. Nothing goes into the draft until you open the account, check it and save it.",
      before: [ "Claude connected — see [Connect Claude](connect-claude).", "A T12 for the property — see [Upload a T12](upload-a-t12)." ],
      callouts: [ { kind: "note", text: "Claude works from four sources, and only four: the T12 (the source of truth), the rent roll, the loan agreement and the property details (its units and address). It searches the web only for the surroundings, such as the weather around the property in a given month. Where it has to assume, it says so under **Checked**." } ],
      sections: [
        { title: "Get Claude’s stories",
          steps: [
            { text: "Click **Claude’s stories…** in the underwriting bar. The page scrolls to Claude’s stories under the table, and the first time, Claude starts reading. It can take a few minutes.",
              go: async (h) => { await barTop(h); await h.click("[data-pfstoriesopen]", { wait: 600 }); await storiesReady(h); } },
            { text: "Read the stories. Each card has the account and its change, the story, how Claude got the number, what to show the lender, and what Claude checked.",
              go: async (h) => { await h.scroll("#opStoriesMount", 0, "start"); },
              shot: "#opStoriesMount",
              marks: [
                { sel: "#opStoriesMount [data-pfstory]", nth: 1, label: "A story", text: "One account, its change and its story, and how much it raises the NOI." },
                { sel: "#opStoriesMount >> text=How Claude got the number", nth: 0, label: "How Claude got the number", text: "From the T12’s own figures." },
                { sel: "#opStoriesMount [data-aichecked]", nth: 0, label: "Checked", text: "What Claude checked before it suggested this." },
                { sel: "#opStoriesMount [data-aigaps]", label: "Claude didn’t have", text: "Shows only when one of the four sources is missing.", optional: true }
              ],
              note: "A story Claude couldn’t confirm is never shown, and one that would lower the NOI is listed as left out. When the “Claude didn’t have” note names a missing source, add it and click **Look again**." }
          ] },
        { title: "Put a story in the draft",
          steps: [
            { text: "On a story you agree with, click **Put it in the draft**. The account opens in the pro forma window, with the change and its story filled in.",
              go: async (h) => { await h.click('#opStoriesMount [data-pfstory]:has-text("Pest Control") [data-pfputsug]', { wait: 900 }); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfsug^="claude:"]', label: "Claude suggests", text: "The story as Claude wrote it." },
                { sel: '#pfModal [data-pfin="value"]', label: "Its new amount", text: "Filled in from the story." },
                { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Filled in from the story." },
                { sel: '#pfModal textarea[data-pfin="story"]', label: "Story", text: "Change it if you want." }
              ] },
            { text: "Check the figure, the kind and the story, and change what you want. Then click **Save the change**. The story’s card now reads **In the pro forma ✓**.",
              go: async (h) => { await save(h); } }
          ] },
        { title: "Use a suggestion from your assumptions",
          text: "When a line runs worse than your assumption, its biggest account gets a suggestion at the assumption, with a ready story. Here the management fee runs 3% of revenue against an assumption of 2.5%.",
          steps: [
            { text: "Click the yellow **suggestions** button in the underwriting bar. It lists every open suggestion, from your assumptions and from Claude.",
              go: async (h) => { await barTop(h); await h.click("[data-pfsuglist]", { wait: 500 }); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfsuglistrow="assume:MGMT"]', label: "A suggestion", text: "Where, what and its story." },
                { sel: '#pfModal [data-pfsuglistrow="assume:MGMT"] [data-pfusesug]', label: "Open the account", text: "Opens it with the suggestion filled in." }
              ] },
            { text: "Click **Open the account**. The account opens with the suggestion on top, and its change and story filled in.",
              go: async (h) => { await h.click('#pfModal [data-pfsuglistrow="assume:MGMT"] [data-pfusesug]', { wait: 900 }); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfsug="assume:MGMT"]', label: "The suggestion", text: "The change, its kind, its story and why." },
                { sel: '#pfModal [data-pfskip="assume:MGMT"]', label: "Not this one", text: "Sets it aside; you can bring it back." },
                { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Filled in from the suggestion, like the figure and the story." }
              ] },
            { text: "Click **Save the change** to use it. Or click **Not this one** to set it aside.",
              go: async (h) => { await cancel(h); await h.closeModals(); } }
          ],
          note: "A suggestion only ever raises the NOI. An assumption that would lower it shows as a warning in the underwriting bar instead, and the underwriting keeps the T12’s figure." }
      ],
      next: [
        { page: "approve-the-underwriting", text: "Approve Safe and Aggressive when they’re ready." },
        { page: "change-an-account", text: "Change an account yourself." },
        { page: "ref-underwriting", anchor: "claudes-stories", text: "Every part of a story card, named." }
      ] },

    // ==================================================================================================================
    { id: "approve-the-underwriting", kind: "howto", group: "Underwriting", title: "Approve the underwriting",
      description: "Make Safe and Aggressive the property’s underwriting, so the refinance, the roll-up and What to push use them.",
      intro: "Until you approve it, the underwriting is a draft that nothing else uses. Approving makes Safe and Aggressive the property’s underwriting: the refinance, the portfolio roll-up and What to push work from them. You can change the draft later and approve it again.",
      before: [ "A drafted underwriting — see [Draft the underwriting](draft-the-underwriting)." ],
      sections: [
        { title: "Check it first",
          steps: [
            { text: "Under the table, check that every change has its story and that Safe and Aggressive each reconcile to the dollar.",
              go: async (h) => { await h.closeModals(); await h.scroll("[data-pfrecons]", 0, "center"); },
              shot: "[data-pfrecons]",
              marks: [
                { sel: '[data-pfrecon="base"] [data-pfgroup="revenue"]', label: "Revenue credit", text: "The credit’s effect, with its story." },
                { sel: '[data-pfrecon="base"] [data-pfgroup="normalized"]', label: "Normalized", text: "The snow removal, with its story." },
                { sel: '[data-pfrecon="base"] [data-pfreserves]', label: "− Replacement reserves", text: "Taken off both versions." },
                { sel: '[data-pfuwnoi="base"]', label: "= Safe underwriting NOI", text: "What you approve." }
              ] }
          ] },
        { title: "Approve",
          steps: [
            { text: "Click **Approve the underwriting** at the end of the underwriting bar.",
              go: async (h) => { await barTop(h); },
              shot: "[data-pfbar]",
              marks: [
                { sel: '[data-uwstatus="draft"]', label: "draft", text: "Not approved yet." },
                { sel: "[data-uwapprove]", label: "Approve the underwriting", text: "Approves both versions as they are now." }
              ] },
            { text: "The chip now reads **approved**, and the line under the bar says who approved it, when, and the Safe and Aggressive NOI in use.",
              go: async (h) => { await approve(h); await h.scroll("[data-pfbar]", 0, "center"); },
              shot: "[data-pfbar]",
              marks: [
                { sel: '[data-uwstatus="approved"]', label: "approved", text: "This is the property’s underwriting." },
                { sel: "[data-uwapproved]", label: "Approved by …", text: "Who, when, and the figures in use." }
              ] }
          ],
          note: "The figures on top now read **approved** with the date, and What to push starts by itself — see [See what you can still push](use-what-to-push)." },
        { title: "Approve again after a change",
          steps: [
            { text: "Change anything that moves Safe or Aggressive: an account, the revenue credit, the reserves. Here the reserves go to $250 a unit, and the chip reads **changed since approved**.",
              go: async (h) => { await h.fill('[data-uwbench="reservePerUnit"]', "250", { wait: 1500 }); await h.calm(); await h.scroll("[data-pfbar]", 0, "center"); },
              shot: "[data-pfbar]",
              marks: [
                { sel: '[data-uwstatus="changed"]', label: "changed since approved", text: "The draft no longer matches what you approved." },
                { sel: "[data-uwapproved]", label: "What is still in use", text: "The approved figures." },
                { sel: "[data-uwapprove]", label: "Approve again", text: "Approves the draft as it is now." }
              ] },
            { text: "Click **Approve again**. Until you do, the refinance and What to push keep using the figures you approved.",
              go: async (h) => { await approve(h); } }
          ] },
        { title: "Give the lender the file",
          steps: [
            { text: "Click **For the lender…** in the underwriting bar.",
              go: async (h) => { await barTop(h); await h.click("[data-pflender]", { wait: 500 }); } },
            { text: "Pick **Safe only**, or **Safe and Aggressive** side by side.",
              shot: PANEL,
              marks: [
                { sel: '#pfModal input[name="pfLenderWhich"][value="base"]', label: "Safe only", text: "One version." },
                { sel: '#pfModal input[name="pfLenderWhich"][value="both"]', label: "Safe and Aggressive", text: "Both, side by side." },
                { sel: "#pfModal [data-pflenderbuild]", label: "Save the Excel file…", text: "Asks where to save it." }
              ] },
            { text: "Click **Save the Excel file…** and choose where to save it. It is named “<property> — Pro forma — <date>.xlsx”.",
              go: async (h) => { await h.closeModals(); } }
          ],
          note: "The file has four sheets: **Pro forma** (each line with its change, kind and story, and the reserves), **Changed accounts**, **Reconciliation** and **Monthly** (the months used for the revenue credit marked)." }
      ],
      next: [
        { page: "use-what-to-push", text: "See what you can still push from here." },
        { page: "size-the-debt", text: "See the largest loan each version supports." },
        { page: "run-a-refinance", text: "Refinance on the approved underwriting." }
      ] },

    // ==================================================================================================================
    { id: "use-what-to-push", kind: "howto", group: "Underwriting", title: "See what you can still push",
      description: "Read Claude’s list of what can still raise the NOI after the approved underwriting, measured on each version.",
      intro: "The approved underwriting holds what a lender accepts today. What to push is what you can still do from there to raise the NOI — raise rents at renewal, re-bid a contract, cut a cost that runs above its benchmark — measured on the in-place T12, on Safe and on Aggressive. It’s your plan, not the lender’s.",
      before: [ "The underwriting approved — see [Approve the underwriting](approve-the-underwriting).", "Claude connected — see [Connect Claude](connect-claude)." ],
      sections: [
        { title: "Read the pushes",
          steps: [
            { text: "Scroll to **What to push on this property**, at the bottom of the tab. Claude starts by itself once the underwriting is approved, and again each time you approve it. It can take a few minutes." },
            { text: "Read each push: what to do and why, its effect three ways, the lever it pulls, and what Claude checked.",
              go: pushReady,
              shot: card("#opScanMount"),
              marks: [
                { sel: "#opScanMount li", nth: 0, label: "A push", text: "What to do, and why, from this property’s own figures." },
                { sel: "#opScanMount [data-pushimpacts]", nth: 0, label: "Its effect, three ways", text: "On the in-place T12, on Safe and on Aggressive." },
                { sel: "#opScanMount >> text=lever:", nth: 0, label: "The lever", text: "What it pulls." },
                { sel: "#opScanMount [data-aichecked]", nth: 0, label: "Checked", text: "What Claude checked before it suggested this." }
              ],
              note: "The figures are Claude’s estimates: a starting point, not advice." },
            { text: "Click **Re-analyse** to ask Claude again — after you add the rent roll or the loan agreement, for example." },
            { text: "To see what loan the pushes would get you, tick them in the refinance. See [Plan what to push for a refinance](plan-what-to-push)." }
          ] },
        { title: "How Claude chooses",
          text: "Claude works from four sources, and only four: the T12 (the source of truth), the rent roll, the loan agreement and the property details (units, address). It searches the web for the surroundings: market rents and rent growth, or the weather or an event in a given month. Every push raises the NOI on every version, never pulls a lever a story in the underwriting already pulls, and lists what Claude checked; one it couldn’t confirm is never shown. The “Claude didn’t have” note shows only when one of the four sources is missing.",
          callouts: [
            { kind: "note", text: "Claude works out who pays the utilities from the T12 itself. A utilities line big enough for the whole property means the owner pays, in the rent, so Claude never suggests billing the residents for them. A line only big enough for the common areas means the residents pay their own." },
            { kind: "note", text: "Some vacancy is natural, so there is no push toward 100% occupancy. Rent growth at the market’s usual rate is measured on top of the rent the underwriting already counts." }
          ] }
      ],
      next: [
        { page: "plan-what-to-push", text: "Tick the pushes in the refinance." },
        { page: "size-the-debt", text: "See the largest loan each version supports." },
        { page: "ref-underwriting", anchor: "what-to-push", text: "Every part of a push, named." }
      ] },

    // ==================================================================================================================
    { id: "size-the-debt", kind: "howto", group: "Underwriting", title: "Size the debt",
      description: "See the largest loan Safe and Aggressive each support, at the limits you set for the property.",
      intro: "Debt sizing is a quick answer while you underwrite: the largest loan each version of the underwriting supports, at your cap rate, LTV, coverage and debt-yield limits. The refinance sizes the real loan with its lender’s own limits.",
      before: [ "A T12 for the property — see [Upload a T12](upload-a-t12)." ],
      sections: [
        { title: "Set the limits",
          steps: [
            { text: "Scroll to **Debt sizing**, under the underwriting table." },
            { text: "Type the property’s limits: **Cap rate**, **Max LTV**, **Min DSCR** and **Min debt yield**, and the **Interest rate** and **Amortization** the payment is worked out at.",
              go: async (h) => { await h.scroll('[data-uwsize="capRate"]', 0, "center"); },
              shot: card('[data-uwsize="capRate"]'),
              marks: [
                { sel: '[data-uwsize="capRate"]', label: "Cap rate", text: "Value = NOI ÷ cap rate." },
                { sel: '[data-uwsize="ltvMax"]', label: "Max LTV", text: "The loan as a share of that value." },
                { sel: '[data-uwsize="dscrMin"]', label: "Min DSCR", text: "NOI ÷ the yearly payment must be at least this." },
                { sel: '[data-uwsize="dyMin"]', label: "Min debt yield", text: "NOI ÷ the loan must be at least this." }
              ] }
          ] },
        { title: "Read the result",
          steps: [
            { text: "Read **Max supportable** for Safe and for Aggressive: the smallest of the loans the limits allow. **Binds on** names the limit that sets it.",
              shot: card('[data-uwsize="capRate"]'),
              marks: [
                { sel: "#uwSzSMax", label: "Max supportable — Safe", text: "On the Safe underwriting NOI." },
                { sel: "#uwSzAMax", label: "Max supportable — Aggressive", text: "On the Aggressive underwriting NOI." },
                { sel: "#uwSzSBind", label: "Binds on", text: "The limit that sets it." },
                { sel: "#uwSzSImp", label: "Implied", text: "The LTV, DSCR and debt yield at that loan." }
              ] }
          ],
          note: "Debt sizing works on the underwriting as it stands, draft or approved." }
      ],
      next: [
        { page: "run-a-refinance", text: "Size the real loan with a lender’s limits." },
        { page: "ref-underwriting", anchor: "debt-sizing", text: "Every figure in Debt sizing, named." }
      ] },

    // ==================================================================================================================
    { id: "ref-underwriting", kind: "reference", group: "Reference", title: "The Underwriting tab",
      description: "Every part of the Underwriting & Sizing tab, from the property’s T12 at the top to What to push at the bottom.",
      intro: "The tab works top to bottom: the property and its T12, the figures it gives, the underwriting table with its bar, Claude’s stories and your assumptions, debt sizing, the property’s operating history, the portfolio roll-up and What to push. The pictures show a made-up property with its underwriting approved. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "The top of the tab",
          views: [
            { text: "Opened from **+** at the end of the tab strip, **Underwriting & Sizing**. Pick the property at the top; everything below is that property’s.",
              go: async (h) => { await h.closeModals(); await top(h); },
              shot: "view",
              marks: [
                { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back to the Portfolio page." },
                { sel: '[data-tabsel^="underwriting"]', label: "Underwriting", text: "This tab." },
                { sel: '[data-tabpop^="underwriting"]', label: "Pop out", text: "Opens the tab in a window of its own, handy on a second screen." },
                { sel: '[data-tabclose^="underwriting"]', label: "Close tab", text: "Closes the tab. Nothing is lost: the T12, the underwriting and its approval are saved with the property." },
                { sel: "#uwResetBtn", label: "Clear", text: "Empties this screen. The property’s saved files and figures stay." },
                { sel: "#opPropPick", label: "Property", text: "The property to underwrite. One that already has a T12 loads it, with its underwriting." },
                { sel: "#uwDrop", label: "The T12 box", text: "Where the property’s T12 goes." }
              ] }
          ] },
        { title: "The T12 and the units",
          views: [
            { title: "The T12 box",
              text: "See [Upload a T12](upload-a-t12).",
              shot: card("#uwDrop"),
              marks: [
                { sel: "#opPropPick", label: "Property", text: "The property this T12 belongs to. The T12 is saved in its folder, and read from there from now on." },
                { sel: "#uwDrop", label: "Drag and drop", text: "Drag the T12 file from its folder and let go over this box. Excel and CSV exports are read; the T12 sheet is found by itself." },
                { sel: "#uwFileBtn", label: "choose a file", text: "Or click here: your computer’s file window opens. Pick the T12, then click Open." },
                { sel: card("#uwDrop") + " >> text=Setup built", label: "Setup built", text: "The file’s name, and that the table below was built from it." },
                { sel: "#uwFileVerified", label: "file verified", text: "The exact file saved in the property’s folder (its checksum is on record), so the same statement can’t be saved twice." },
                { sel: "#t12Gate", label: "Checked by the reader and the AI", text: "The app’s reader and Claude both read the file, and agree: its figures are in use. Otherwise it reads “Waiting for your review”, or “Read by the reader only” when Claude wasn’t connected." },
                { sel: "[data-t12open]", label: "Review the reading", text: "How each row of the file was read (below)." },
                { sel: "[data-t12again]", label: "Read again", text: "Reads the file again from the start." },
                { sel: "#uwNoiUsed", label: "NOI used", text: "The in-place NOI the app uses from this file, and the months it covers." }
              ] },
            { title: "Units and rent",
              text: "Without the units, the table below says **Units missing**, with a link to set them in the property’s profile instead.",
              shot: card("#uwDrop"),
              marks: [
                { sel: 'input[data-uwf="units"]', label: "Units", text: "How many apartments the property has, from the rent roll. Sets the replacement reserves and every per-unit figure. Typing it here asks to update the property’s profile to match." },
                { sel: 'input[data-uwf="rrGPR"]', label: "Gross potential rent — per year", text: "A year’s rent with every unit leased at market, before vacancy. Above the T12’s rent, the draft offers it as a suggestion, with its story — never applied by itself." },
                { sel: 'input[data-uwf="avgRentUnit"]', label: "Average rent per unit — per month", text: "Easier than the yearly figure: the average monthly rent for one unit. The app works out average × units × 12." }
              ] },
            { title: "The reading of the T12",
              text: "Opened by **Review the reading**: every row of the file as the reader read it. Change any row, with a note; nothing is saved until you click **Save this reading**. See [Check a T12](check-a-t12).",
              go: async (h) => { await h.click("[data-t12open]", { wait: 1500 }); },
              shot: "[data-t12rv] > div",
              marks: [
                { sel: "[data-t12rv] >> text=every check passes", label: "The verdict", text: "Whether every check passes and the AI agrees with the reader.", optional: true },
                { sel: "[data-t12rv] >> text=What the reader made of it", label: "What the reader made of it", text: "Account, category name, total, header… Change it when the reader got a row wrong." },
                { sel: "[data-t12rv] >> text=Underwriting line", label: "Underwriting line", text: "The line of the underwriting table this account adds to." },
                { sel: "[data-t12rv] >> text=Your note", label: "Your note", text: "Why you changed a row, kept with the reading." },
                { sel: "[data-t12rv-wait]", label: "Close without saving", text: "Closes the window and keeps the reading as it was." },
                { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves your changes; every figure from this T12 follows them." }
              ],
              after: async (h) => { await h.click("[data-t12rv-wait]", { wait: 600 }); } }
          ] },
        { title: "The figures on top",
          views: [
            { text: "Under the T12: the statement’s NOI and the two underwriting NOIs. Before the approval each version reads “draft · not approved yet”; after a change to an approved underwriting, “draft · approved:” with the approved figure.",
              go: async (h) => { await uwTop(h); },
              shot: FIGS,
              marks: [
                { sel: "#uwInPlaceNoi", label: "In-place NOI", text: "The T12’s own NOI: the 12-month total, or the last 3 months × 4 when the statement starts in a lease-up." },
                { sel: "#uwInPlaceMethod", label: "How it was worked out", text: "Which months it comes from." },
                { sel: "#uwNoiTie", label: "ties to statement NOI", text: "The lines add up to the NOI printed on the statement." },
                { sel: "#uwSafeNoi", label: "Safe underwriting NOI", text: "The T12 with the changes you can defend line by line, less the reserves." },
                { sel: "#uwAggrNoi", label: "Aggressive underwriting NOI", text: "Safe plus the changes a cautious lender may not accept, less the reserves." },
                { sel: '[data-uwvercard="base"] >> text=approved', label: "approved", text: "Approved, with the date." }
              ] }
          ] },
        { title: "The underwriting bar",
          views: [
            { text: "Above the table. The chip says where the underwriting stands: **draft**, **approved** or **changed since approved**. Before the approval, and after a change, **Approve the underwriting** (or **Approve again**) ends the row of tools — see [Approve the underwriting](approve-the-underwriting).",
              go: async (h) => { await barTop(h); },
              shot: "[data-pfbar]",
              marks: [
                { sel: "[data-uwstatus]", label: "approved", text: "Draft, approved, or changed since approved." },
                { sel: '[data-pfshow="base"]', label: "Safe", text: "The column shows the Safe version." },
                { sel: '[data-pfshow="aggressive"]', label: "Aggressive", text: "The column shows the Aggressive version." },
                { sel: "[data-pfnois]", label: "The two NOIs", text: "The version shown first, then the other, after the reserves." },
                { sel: "[data-pfsuglist]", label: "suggestions", text: "Every open suggestion, from your assumptions and from Claude, in one list.", optional: true },
                { sel: "[data-pfstoriesopen]", label: "Claude’s stories…", text: "Jumps to Claude’s stories under the table, and asks Claude for them the first time." },
                { sel: "[data-pfrevenue]", label: "Revenue credit…", text: "Annualizes every revenue account at once from its last months." },
                { sel: "[data-pfadd]", label: "+ Add an account", text: "An account the T12 doesn’t have." },
                { sel: "[data-pflender]", label: "For the lender…", text: "The Excel file for the lender." },
                { sel: "[data-pfhistory]", label: "History", text: "Every change with its story, and every approval." },
                { sel: "[data-pfclear]", label: "Start over", text: "Takes every change out and starts again from the T12 (asks first). The history keeps them, and the last approval stays in use until you approve again." },
                { sel: "[data-uwapproved]", label: "Approved by …", text: "Who approved it, when, and the Safe and Aggressive NOI the refinance, the roll-up and What to push use." }
              ] },
            { title: "A warning from an assumption",
              text: "An assumption that would lower the NOI is never a suggestion. Here the management fee assumption is set to 4%, but the T12 runs 3%: the bar warns you, for your information, and the underwriting keeps the T12’s figure. To underwrite 4% anyway, change the account yourself, with its story.",
              go: async (h) => { await h.fill('[data-uwbench="mgmtPct"]', "4", { wait: 1500 }); await h.calm(); await h.scroll("[data-pfassumewarn]", 0, "center"); },
              shot: "[data-pfbar]",
              marks: [
                { sel: '[data-pfassumewarnline="MGMT"]', label: "The warning", text: "Your assumption, what the T12 runs, and how much lower the NOI would be at your assumption." },
                { sel: "[data-pfnois]", label: "The NOIs", text: "Unchanged: an assumption never moves the underwriting by itself." }
              ],
              after: async (h) => { await h.fill('[data-uwbench="mgmtPct"]', "2.5", { wait: 1500 }); } },
            { title: "History",
              text: "Opened by **History**: every change, edit, removal and set-aside, newest first — which line and account, old → new, the kind and story, who and when. Each approval is kept here too.",
              go: async (h) => { await barTop(h); await h.click("[data-pfhistory]", { wait: 900 }); },
              shot: "#historyModal > div",
              marks: [
                { sel: "#historyBody tr", nth: 1, label: "An entry", text: "One change, with its story." },
                { sel: "#historyClose", label: "×", text: "Closes the history." }
              ],
              after: async (h) => { await h.closeModals(); } }
          ] },
        { title: "The underwriting table",
          views: [
            { title: "The columns",
              text: "Every line of the T12, classified. Two figures per line, each also per unit: the T12 and the underwriting.",
              go: async (h) => { await h.js(() => { if (document.activeElement) document.activeElement.blur(); }); await h.scroll("#uwSetupTable", 0, "start"); await h.js(() => window.scrollBy(0, -120)); await h.wait(200); },
              shot: "view",
              marks: [
                { sel: "#uwSetupTable th >> text=Line (auto-classified", label: "Line", text: "The underwriting line. A line far from its benchmark is flagged next to its name." },
                { sel: "#uwSetupTable th >> text=In-Place", label: "In-Place (T12)", text: "Each line as the statement shows it." },
                { sel: "#uwSetupTable th >> text=$/unit", nth: 0, label: "$/unit", text: "The figure ÷ the units." },
                { sel: "[data-pfhead]", label: "Underwriting · Safe", text: "The underwriting, line by line, in the version the switch shows." },
                { sel: '[data-pfline="CS"]', label: "A figure", text: "Click it: the line’s accounts open in the pro forma window. See [The pro forma window](ref-pro-forma)." },
                { sel: '[data-pfchanged="GPR"]', label: "Teal dot", text: "The line has changes (here the revenue credit). Hover its figure to see their kinds." },
                { sel: '[data-pfsugdot="GA"]', label: "Yellow dot", text: "Suggestions wait on this line.", optional: true }
              ] },
            { title: "The reserves and the NOI",
              text: "Subtotals for rental income, effective gross income and expenses, then the replacement reserves and the Net Operating Income, each in both columns and per unit.",
              go: async (h) => { await h.scroll("#uwNoiRow", 0, "center"); },
              shot: "view",
              marks: [
                { sel: "#uwSetupTable tr >> text=Effective Gross Income", label: "Effective Gross Income", text: "All income after vacancy and the other deductions." },
                { sel: "#uwSetupTable tr >> text=Total Operating Expenses", label: "Total Operating Expenses", text: "Every expense line added up." },
                { sel: "[data-pfreserve]", label: "Replacement reserves", text: "Your reserves per unit × the units: a line in Safe and Aggressive (the T12 has none)." },
                { sel: "#uwNoiRow", label: "Net Operating Income", text: "The in-place NOI and the underwriting NOI, each per unit." },
                { sel: "#uwNoiRowPf", label: "Underwriting NOI", text: "After the reserves, in the version the switch shows." }
              ] }
          ] },
        { title: "How it adds up",
          views: [
            { text: "Under the table, one box per version, checked to the dollar: the T12 NOI, every change grouped by its kind with its story, the NOI before reserves, the replacement reserves and the underwriting NOI.",
              go: async (h) => { await h.scroll("[data-pfrecons]", 0, "center"); },
              shot: "[data-pfrecons]",
              marks: [
                { sel: '[data-pfrecon="base"]', label: "Safe — how it adds up", text: "T12 NOI + each change − reserves = the Safe underwriting NOI." },
                { sel: '[data-pfrecon="aggressive"]', label: "Aggressive — how it adds up", text: "The same for Aggressive." },
                { sel: '[data-pfrecon="base"] [data-pfok]', label: "reconciles to the dollar", text: "The changes add up exactly (worked out twice)." },
                { sel: '[data-pfrecon="base"] [data-pfgroup="revenue"]', label: "Revenue credit", text: "A group: every change of one kind, each with its story." },
                { sel: '[data-pfrecon="base"] [data-pfreserves]', label: "− Replacement reserves", text: "Your reserves per unit × the units, taken off both versions." },
                { sel: '[data-pfuwnoi="base"]', label: "= Safe underwriting NOI", text: "The figure that is approved, sized and refinanced on." }
              ] }
          ] },
        { title: "Claude’s stories",
          text: "Under the table. Claude reads the T12 account by account, month by month, with the rent roll, the loan agreement and the property details, and searches the web around the property. It offers stories a lender would accept: only ones that raise the NOI, and only ones it confirmed. Nothing goes in until you open the account and save it. See [Use Claude’s stories and suggestions](use-claudes-stories).",
          views: [
            { go: async (h) => { await h.scroll("#opStoriesMount", 0, "start"); },
              shot: "#opStoriesMount",
              marks: [
                { sel: "#pfStoriesRun", label: "Look again", text: "Asks Claude again (**Find stories with Claude** the first time). Needs Claude connected." },
                { sel: "#opStoriesMount [data-pfstory]", nth: 1, label: "A story", text: "One account, one change, its kind and story, and how much it raises the NOI." },
                { sel: "#opStoriesMount >> text=How Claude got the number", nth: 0, label: "How Claude got the number", text: "From the statement’s own figures." },
                { sel: "#opStoriesMount >> text=To back it with the lender", nth: 0, label: "To back it with the lender", text: "What you show the lender to prove it." },
                { sel: "#opStoriesMount [data-aichecked]", nth: 0, label: "Checked", text: "What Claude checked before it suggested this: the T12’s months, the rent roll, the loan agreement, the property details, or a web page with its site and date. A story it couldn’t confirm is never shown." },
                { sel: "#opStoriesMount [data-aigaps]", label: "Claude didn’t have", text: "Shows only when one of Claude’s four sources is missing: the T12, the rent roll, the loan agreement or the property details (units, address). Claude worked from what it had; add the missing one and click **Look again**.", optional: true },
                { sel: "#opStoriesMount [data-aiweb]", label: "The web", text: "How many times Claude searched the web for this, and what it searched.", optional: true },
                { sel: "#opStoriesMount [data-pfputsug]", label: "Put it in the draft", text: "Opens the account with the story filled in, to check and save.", optional: true },
                { sel: "#opStoriesMount >> text=In the pro forma", label: "In the pro forma ✓", text: "Already in the draft.", optional: true },
                { sel: "#opStoriesMount [data-pfstoriesleft]", label: "Left out", text: "What Claude suggested that can’t go in: an account the T12 doesn’t have, or a change that would lower the NOI.", optional: true }
              ] }
          ] },
        { title: "Assumptions and benchmarks",
          views: [
            { text: "Under Claude’s stories, per property. They don’t change the underwriting by themselves: a line that runs worse than an assumption gets a suggestion in the draft (never one that lowers the NOI), and the reserves per unit are taken off Safe and Aggressive. Each change is kept in the property’s history.",
              go: async (h) => { await h.scroll('[data-uwbench="vacancyPct"]', 0, "center"); },
              shot: ASSUME,
              marks: [
                { sel: '[data-uwbench="vacancyPct"]', label: "Vacancy", text: "When the T12 runs above it, the vacancy account gets a suggestion at it; when the T12 already runs below it, a warning. Never applied by itself." },
                { sel: '[data-uwbench="mgmtPct"]', label: "Management fee", text: "As a % of effective gross income: a suggestion when the T12 runs above it, a warning when it would lower the NOI." },
                { sel: '[data-uwbench="reservePerUnit"]', label: "Reserves / unit", text: "Replacement reserves a year per unit, taken off Safe and Aggressive." },
                { sel: '[data-uwbenchmark="PAY"]', label: "Payroll / unit", text: "Your payroll benchmark for this property. A payroll line 15% off it is flagged." },
                { sel: '[data-uwbenchmark="RM"]', label: "R&M / unit", text: "Your repairs and maintenance benchmark." },
                { sel: "#uwSaveBtn", label: "Save to property record", text: "Saves the assumptions and benchmarks with the property, so every screen uses them." },
                { sel: "[data-uwhist]", label: "Change history", text: "Every change to these, old → new, who and when.", optional: true }
              ] }
          ] },
        { title: "Debt sizing",
          views: [
            { text: "The largest loan each version supports, side by side, at the limits you set for this property. Each limit gives a loan on each version’s NOI; the smallest is the maximum supportable loan. See [Size the debt](size-the-debt).",
              go: async (h) => { await h.scroll('[data-uwsize="capRate"]', 0, "center"); },
              shot: card('[data-uwsize="capRate"]'),
              marks: [
                { sel: '[data-uwsize="capRate"]', label: "Cap rate", text: "Value = NOI ÷ cap rate." },
                { sel: '[data-uwsize="ltvMax"]', label: "Max LTV", text: "The loan as a share of that value." },
                { sel: '[data-uwsize="dscrMin"]', label: "Min DSCR", text: "NOI ÷ the yearly payment must be at least this." },
                { sel: '[data-uwsize="dyMin"]', label: "Min debt yield", text: "NOI ÷ the loan must be at least this." },
                { sel: '[data-uwsize="intRate"]', label: "Interest rate", text: "The rate the payment is worked out at." },
                { sel: '[data-uwsize="amortYears"]', label: "Amortization", text: "The years the payment pays the loan down over." },
                { sel: '[data-uwsizing="base"]', label: "Safe", text: "Sized on the Safe underwriting NOI." },
                { sel: '[data-uwsizing="aggressive"]', label: "Aggressive", text: "Sized on the Aggressive underwriting NOI." },
                { sel: "#uwSzSValue", label: "Est. value", text: "NOI ÷ cap rate." },
                { sel: "#uwSzSLTV", label: "Loan @ LTV", text: "What the LTV limit allows." },
                { sel: "#uwSzSDSCR", label: "Loan @ DSCR", text: "What the coverage limit allows." },
                { sel: "#uwSzSDY", label: "Loan @ debt yield", text: "What the debt-yield limit allows." },
                { sel: "#uwSzSMax", label: "Max supportable — Safe", text: "The smallest of the three." },
                { sel: "#uwSzAMax", label: "Max supportable — Aggressive", text: "The same on Aggressive." },
                { sel: "#uwSzSBind", label: "Binds on", text: "The limit that sets it." },
                { sel: "#uwSzSImp", label: "Implied LTV · DSCR · debt yield", text: "The ratios at the maximum loan." }
              ] }
          ] },
        { title: "Operating history",
          // the property opened again (another one, then back): the General Data card and the roll-up are drawn when a property is opened
          prep: async (h) => { await h.uwProperty("name:villages of burlington"); await h.uwProperty(KEY); await h.wait(1500); await h.calm(); },
          views: [
            { text: "The General Data card. Every T12 you upload adds its months (up to 24 are kept). The card shows the in-place NOI and the approved underwriting (Safe · Aggressive); each line shows its trailing 12 months and the change against the 12 before. Click its title to fold it; the app remembers.",
              go: async (h) => { await h.scroll('h3:has-text("General Data")', 0, "start"); },
              shot: GD,
              marks: [
                { sel: GD + " >> text=In-place NOI", label: "In-place NOI", text: "The same NOI as everywhere in the app, and how it was worked out." },
                { sel: GD + " >> text=Underwriting NOI", label: "Underwriting NOI — Safe · Aggressive", text: "The approved underwriting, and when it was approved (“not approved yet” before)." },
                { sel: GD + " >> text=general-data.json", label: "Saved to the folder", text: "Kept in the property’s folder (general-data.json)." },
                { sel: GD + " >> text=Trailing", label: "Trailing 12-mo", text: "Each line’s last 12 months, and its change." },
                { sel: GD + " >> summary", label: "Fold", text: "Click the title to fold the card or open it again." }
              ] }
          ] },
        { title: "Portfolio roll-up",
          views: [
            { text: "Every property: units, loans, in-place NOI, the approved Safe and Aggressive underwriting NOI (blank until approved), balance, yearly debt service, DSCR, debt yield, LTV and maturity, with a total row.",
              go: async (h) => { await h.scroll("#opRollupMount", 0, "start"); },
              shot: card("#opRollupMount"),
              marks: [
                { sel: "#opRollupMount th >> text=In-place NOI", label: "In-place NOI", text: "Each property’s NOI." },
                { sel: "#opRollupMount th >> text=Safe UW NOI", label: "Safe UW NOI", text: "The approved Safe underwriting; blank until it is approved." },
                { sel: "#opRollupMount th >> text=Aggressive UW NOI", label: "Aggressive UW NOI", text: "The approved Aggressive underwriting, beside Safe." },
                { sel: "#opRollupMount th >> text=DSCR", label: "DSCR", text: "NOI ÷ its yearly debt service." },
                { sel: "#opRollupMount >> text=Sample Gardens (example)", label: "A property", text: "Click it to open it here." }
              ] }
          ] },
        { title: "What to push",
          text: "At the bottom of the tab. It runs by itself once the underwriting is approved, and again when you approve again; before that it reads “Approve the underwriting first”. Claude reads the same four sources as for the stories — the T12, the rent roll, the loan agreement and the property details — with the approved underwriting, and searches the web around the property. These pushes are your plan, not the lender’s. See [See what you can still push](use-what-to-push).",
          callouts: [
            { kind: "note", text: "Claude works out who pays the utilities from the T12: a utilities line big enough for the whole property means the owner pays, in the rent, so no billing them back; one only big enough for the common areas means the residents pay their own. There is no push toward 100% occupancy, and next year’s rent growth at the market’s usual rate is measured on top of the underwritten rent." }
          ],
          views: [
            { go: pushReady,
              shot: card("#opScanMount"),
              marks: [
                { sel: "#opPushRun", label: "Re-analyse", text: "Asks Claude again." },
                { sel: "#opScanMount li", nth: 0, label: "A push", text: "What to do, why (from this property’s own figures) and the effort." },
                { sel: "#opScanMount [data-pushimpacts]", nth: 0, label: "Its effect, three ways", text: "On the in-place T12, on Safe and on Aggressive, each net of what that version already counts. Claude’s estimates: a starting point, not advice." },
                { sel: "#opScanMount >> text=lever:", nth: 0, label: "The lever", text: "What it pulls: never one a story in the underwriting already pulls." },
                { sel: "#opScanMount >> text=beside the story", nth: 0, label: "Beside the story", text: "The underwriting story it sits next to: a different lever, so both count.", optional: true },
                { sel: "#opScanMount [data-aichecked]", nth: 0, label: "Checked", text: "What Claude checked before it suggested this push. One it couldn’t confirm is never shown." },
                { sel: "#opScanMount [data-aigaps]", label: "Claude didn’t have", text: "Shows only when one of the four sources is missing: the T12, the rent roll, the loan agreement or the property details. Claude worked from what it had; add the missing one and click **Re-analyse**.", optional: true },
                { sel: "#opScanMount [data-aiweb]", label: "The web", text: "How many times Claude searched the web for this, and what it searched.", optional: true },
                { sel: "#opScanMount [data-pushdropped]", label: "Left out", text: "A push that would lower the NOI on any version: never shown as one.", optional: true }
              ] }
          ] }
      ] },

    // ==================================================================================================================
    { id: "ref-pro-forma", kind: "reference", group: "Reference", title: "The pro forma window",
      description: "The window that opens over the Underwriting tab: a line’s accounts, every way to change one, the suggestions, and the windows for a new account, the revenue credit and the lender file.",
      intro: "Click a figure in the Underwriting column, or a tool in the underwriting bar, and this window opens over the tab, about 80% of the screen. Nothing in it is saved until you click its save button. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "A line’s accounts",
          views: [
            { text: "Opened by a figure in the **Underwriting** column. On top, the line in the T12, in Safe and in Aggressive. Below, every account of the line — none hidden, a $0 one too — with its 12 months as the statement shows them.",
              go: async (h) => { await line(h, "CS"); await bodyTop(h); },
              shot: PANEL,
              marks: [
                { sel: "[data-pffigs]", label: "The line", text: "The whole line in the T12, in Safe and in Aggressive, each per unit." },
                { sel: "#pfModal [data-pfacct]", nth: 1, label: "An account", text: "Its row in the file, its 12 months, its T12, Safe and Aggressive. Click it to change it." },
                { sel: "#pfModal [data-pfacctwrap] th >> text=T12", label: "T12", text: "The account’s year in the statement." },
                { sel: "#pfModal [data-pfacctwrap] th >> text=Safe", label: "Safe / Aggressive", text: "The account in each version; a changed one in bold." },
                { sel: "#pfModal [data-pfacct] >> text=Both · Normalized", label: "A change’s tag", text: "Where the change applies and its kind. Hover it to read the story.", optional: true },
                { sel: "#pfModal [data-pfacct] >> text=Pool Service", label: "A $0 account", text: "Shown with its twelve zeros: nothing is hidden." },
                { sel: "#pfModal [data-pfacctwrap] tr >> text=the line", label: "The line", text: "Each month and each column added up." },
                { sel: "#pfModal [data-pfnewacct]", label: "+ Add an account the T12 doesn’t have", text: "For money the statement has no account for." },
                { sel: "#pfModal [data-pfclose]", label: "×", text: "Closes the window." }
              ] }
          ] },
        { title: "Ways to change an account",
          text: "Click an account and its choices open right under it. Each change has a kind, the versions it applies to and a story. See [Change an account](change-an-account).",
          views: [
            { title: "The choices",
              text: "Which ways show depends on the account: **% of revenue**, for one, only on an expense or a rent deduction.",
              go: async (h) => { await acct(h, "Landscaping"); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfhow="accountTotal"]', label: "New amount", text: "Type the account’s new yearly figure. Type 0 to take it out: the lender’s file then reads “Took out”." },
                { sel: '#pfModal [data-pfhow="spread"]', label: "Spread over years", text: "A cost paid once every few years counts only its share for one year." },
                { sel: '#pfModal [data-pfhow="annualize"]', label: "Annualize", text: "The account becomes its last 3, 6 or 12 months × 12 ÷ the months." },
                { sel: '#pfModal [data-pfhow="pctRevenue"]', label: "% of revenue", text: "The account as a % of revenue (expenses and rental deductions)." },
                { sel: '#pfModal [data-pfhow="perUnit"]', label: "Per unit", text: "A dollar figure per apartment a year × the units." }
              ] },
            { title: "New amount, kind and story",
              text: "Here the snow-removal change, opened again with **Edit**. The preview shows the account’s 12 months before and after, the line and the NOI.",
              go: async (h) => { await acct(h, "Snow Removal"); await h.click("#pfModal [data-pfedit]", { wait: 600 }); await formTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfin="value"]', label: "Its new amount", text: "The yearly figure for this account." },
                { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Why it changes: non-recurring, spread over years, normalized, operating change, market norm or partnership/back-office (and revenue credit when you annualize income)." },
                { sel: '#pfModal [data-pfcol="both"]', label: "Apply to", text: "Safe, Aggressive or Both." },
                { sel: "#pfModal [data-pfsamestory]", label: "Same story as…", text: "The stories already in this underwriting, with their account. Pick one and it fills in." },
                { sel: '#pfModal textarea[data-pfin="story"]', label: "Story", text: "The reason the lender reads. Required." },
                { sel: "#pfModal [data-pfdraft]", label: "Draft it with Claude", text: "Claude writes a first draft from the account’s months; you edit it.", optional: true },
                { sel: "#pfPreview [data-pfmonths]", label: "Before → after", text: "The account’s 12 months in the T12 and after the change (each month in proportion)." },
                { sel: "#pfPreview [data-pfready]", label: "ready to save", text: "Or what is still missing." },
                { sel: "#pfModal [data-pfsave]", label: "Save", text: "**Save the change**, or **Save the edit** for one you opened with Edit. The window stays open on the line." },
                { sel: "#pfModal [data-pfcancel]", label: "Cancel", text: "Closes the choices without saving." }
              ],
              after: cancel },
            { title: "Spread over years",
              text: "For a cost paid once every few years that landed in this T12. Exterior painting cost $14,400 in May and is done every 5 years: the underwriting counts $14,400 ÷ 5 = $2,880 a year. It divides the whole account; for an account that mixes normal monthly costs with one big bill, use **New amount** instead.",
              go: async (h) => { await line(h, "RM"); await acct(h, "Exterior Painting"); await h.click('#pfModal [data-pfhow="spread"]', { wait: 300 }); await fill(h, "years", "5"); await fill(h, "story", "The exterior is painted every five years; this year's $14,400 counts as $2,880 a year."); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfin="years"]', label: "Paid every … years", text: "How often it is paid; it counts one share a year." },
                { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Set to “Spread over years” by itself." },
                { sel: "#pfPreview [data-pfmonths]", label: "Before → after", text: "$14,400 in May becomes $2,880 for the year." }
              ],
              after: cancel },
            { title: "Annualize",
              text: "When an account runs differently in its recent months — a new contract, a rent increase — it becomes its last 3, 6 or 12 months × 12 ÷ the months. Each choice shows what it gives. On a normal 12-month T12 the last 12 months are the T12 itself, so that choice is greyed (“same as the T12”).",
              go: async (h) => { await line(h, "UTIL"); await acct(h, "Electric"); await h.click('#pfModal [data-pfhow="annualize"]', { wait: 300 }); await h.click('#pfModal [data-pfmo="3"]', { wait: 300 }); await fill(h, "story", "A new electricity contract since April; the last three months are the run-rate."); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfmo="3"]', label: "Last 3 months", text: "× 4: here $28,400 a year." },
                { sel: '#pfModal [data-pfmo="6"]', label: "Last 6 months", text: "× 2: $29,400." },
                { sel: '#pfModal [data-pfmo="12"]', label: "Last 12 months", text: "Only different from the T12 when the file has more than 12 months, or the T12 rule used the last 3 months × 4." },
                { sel: "#pfModal >> text=Months used", label: "Months used", text: "The months it comes from." },
                { sel: '#pfModal select[data-pfin="kind"]', label: "Kind", text: "Operating change for an expense; Revenue credit for an income account." }
              ],
              after: cancel },
            { title: "% of revenue",
              text: "An expense as a % of that version’s effective gross income, or a rent deduction (vacancy, bad debt) as a % of gross potential rent. Because you chose it, it moves when that version’s revenue moves. The management fee never moves by itself.",
              go: async (h) => { await line(h, "MGMT"); await acct(h, "Management Fee"); await h.click('#pfModal [data-pfhow="pctRevenue"]', { wait: 300 }); await fill(h, "pct", "3"); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfin="pct"]', label: "%", text: "The percentage." },
                { sel: "#pfModal >> text=you chose it", label: "It follows revenue", text: "Only because you picked % of revenue." },
                { sel: "#pfModal >> text=The management fee stays at the T12 figure", label: "The management fee", text: "Stays at the T12 unless you change its account." }
              ],
              after: cancel },
            { title: "Per unit",
              text: "A dollar figure per apartment a year, times the units (120 here): for a cost quoted per unit, such as a maintenance role or turnover.",
              go: async (h) => { await line(h, "PAY"); await acct(h, "Maintenance Salary"); await h.click('#pfModal [data-pfhow="perUnit"]', { wait: 300 }); await fill(h, "perUnit", "300"); await h.click('#pfModal [data-pfcol="aggressive"]', { wait: 300 }); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfin="perUnit"]', label: "$ per unit a year", text: "× the property’s units." },
                { sel: '#pfModal [data-pfcol="aggressive"]', label: "Aggressive", text: "Here only in the Aggressive version." },
                { sel: "#pfPreview", label: "Preview", text: "Safe unchanged; Aggressive $300 × 120 = $36,000." }
              ],
              after: cancel }
          ] },
        { title: "Suggestions",
          views: [
            { title: "A suggestion on an account",
              text: "When a line runs worse than your assumption, its biggest account gets a suggestion at the assumption, with a ready story, and a **Suggested** chip in its row (**Claude suggests** for one of Claude’s stories). Here the management fee runs 3% of revenue against an assumption of 2.5%. A suggestion only ever raises the NOI, and nothing is applied by itself.",
              go: async (h) => { await line(h, "MGMT"); await acct(h, "Management Fee"); await editorTop(h); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfsugchip="assume:MGMT"]', label: "Suggested", text: "A suggestion waits on this account." },
                { sel: '#pfModal [data-pfsug="assume:MGMT"]', label: "The suggestion", text: "The change, its kind, the ready story and why." },
                { sel: '#pfModal [data-pfusesug="assume:MGMT"]', label: "Use this", text: "Fills the change and its story in; you can still edit them before you save." },
                { sel: '#pfModal [data-pfskip="assume:MGMT"]', label: "Not this one", text: "Sets it aside (**Bring it back** undoes it)." }
              ] },
            { title: "Every suggestion in one list",
              text: "Opened by the yellow **suggestions** button in the underwriting bar: every open suggestion, from your assumptions and from Claude.",
              go: async (h) => { await barTop(h); await h.click("[data-pfsuglist]", { wait: 500 }); },
              shot: PANEL,
              marks: [
                { sel: "#pfModal [data-pfsuglistrow]", label: "A suggestion", text: "Where, what and its story." },
                { sel: "#pfModal [data-pfsuglistrow] [data-pfusesug]", label: "Open the account", text: "Opens the line with the suggestion filled in." }
              ] }
          ] },
        { title: "A new account",
          views: [
            { text: "Opened by **+ Add an account** in the underwriting bar: every line by section — rental income and deductions, other income, expenses — the ones in your T12 first. Pick the line, then name the account and fill it in like any other change. See [Add an account](add-an-account).",
              go: async (h) => { await barTop(h); await h.click("[data-pfadd]", { wait: 500 }); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfaddline="CS"]', label: "A line in the underwriting", text: "The new account goes under it." },
                { sel: '#pfModal [data-pfaddline="AMEN"]', label: "A line the T12 doesn’t have", text: "Marked “(not in the T12)”: an account here adds the line to the underwriting." }
              ] }
          ] },
        { title: "The revenue credit",
          views: [
            { text: "Opened by **Revenue credit…** in the underwriting bar: every revenue account annualized at once from its last months, for when the property runs better now than the year shows. The table shows each revenue line month by month, the months used highlighted, the T12 and the annualized figure; with a rent roll, today’s occupancy too. A story is required. The management fee doesn’t follow it.",
              go: async (h) => { await barTop(h); await h.click("[data-pfrevenue]", { wait: 500 }); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal [data-pfrevver="base"]', label: "Safe / Aggressive (its own)", text: "Aggressive can have its own; until then it uses Safe’s." },
                { sel: '#pfModal [data-pfrevmo="3"]', label: "T3 / T6 / T12", text: "How many recent months. T12 changes nothing on a normal 12-month file." },
                { sel: "#pfModal >> text=Months used", label: "Months used", text: "Which months." },
                { sel: "#pfModal th >> text=Annualized", label: "Annualized", text: "Each line after the credit." },
                { sel: "#pfModal [data-pfrevstory]", label: "Story", text: "The reason the lender reads." },
                { sel: "#pfModal [data-pfrevsave]", label: "Save the revenue credit", text: "Saves it." }
              ],
              after: async (h) => { await h.closeModals(); } }
          ] },
        { title: "The lender file",
          views: [
            { text: "Opened by **For the lender…** in the underwriting bar: an Excel file with four sheets — **Pro forma** (each line with its change, kind and story, and the reserves), **Changed accounts**, **Reconciliation** and **Monthly** (the months used for the revenue credit marked). See [Approve the underwriting](approve-the-underwriting#give-the-lender-the-file).",
              go: async (h) => { await barTop(h); await h.click("[data-pflender]", { wait: 500 }); },
              shot: PANEL,
              marks: [
                { sel: '#pfModal input[name="pfLenderWhich"][value="base"]', label: "Safe only", text: "One version." },
                { sel: '#pfModal input[name="pfLenderWhich"][value="both"]', label: "Safe and Aggressive", text: "Both, side by side." },
                { sel: "#pfModal [data-pflenderbuild]", label: "Save the Excel file…", text: "Asks where to save “<property> — Pro forma — <date>.xlsx”." }
              ],
              after: async (h) => { await h.closeModals(); } }
          ] }
      ] }
  ]
};
