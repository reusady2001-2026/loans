/* Guide chapter: Documents — a property's Documents box (add files, their types, save a copy, remove), the T12 check
   every new T12 goes through (the review window: how each row was read, your changes with a note, where Claude reads
   it differently, "waiting for your review", a T12 that names no property, Claude not connected), files with several
   properties' parts (workbooks, and PDFs split by pages), scanned PDFs read by OCR, and the reference page.
   Made-up properties ("Sample Gardens / Oaks / Pines / Elms (example)") and made-up files only; the stand-in Claude
   reads T12s with two deliberate disagreements (LDS_FAKE_T12=disagree). The reference page comes last: it uses its
   own made-up property (Sample Elms), and signs Claude out for its last section. */
"use strict";
const path = require("path"), fs = require("fs");
const GRID = require(path.join(__dirname, "..", "..", "test", "fixtures", "proforma-t12.js")).grid();
const GRID_ELMS = [["Sample Elms (made-up figures)"]].concat(GRID.slice(1));   // the same made-up T12, for Sample Elms
const SCAN = path.join(__dirname, "..", "..", "test", "fixtures", "ocr", "mixed.pdf");   // a made-up two-page PDF: one text page, one scanned page
const GARDENS = "name:sample gardens (example)", OAKS = "name:sample oaks (example)", PINES = "name:sample pines (example)", ELMS = "name:sample elms (example)";
const DOCS = "#propDocsPanel > div";
const M = ["Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026"];
const rowOf = (l, v) => [l].concat(Array(12).fill(v), [v * 12]);
const t12 = (top, rent, tax) => [[top], ["12 Month Statement"], ["Account"].concat(M, ["Total"]), ["INCOME"], rowOf("Gross Potential Rent", rent), rowOf("TOTAL INCOME", rent), ["EXPENSES"], rowOf("Real Estate Taxes", tax), rowOf("TOTAL EXPENSES", tax), rowOf("NET OPERATING INCOME", rent - tax)];
const row = (name) => '[data-docrow]:has(div.truncate:has-text("' + name + '"))';   // a file's row, by its name
const RV = "[data-t12rv] > div";
const CONFIRM = "#confirmModal > div";

const until = async (h, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)){ if (await h.js(fn)) return true; await h.wait(300); } return false; };
const addProp = async (h, name) => {
  await h.js((n) => window.LDS_addProperty(n), name); await h.wait(700);
  if (await h.js(() => { const m = document.getElementById("confirmModal"); const a = document.getElementById("confirmAlt"); return !!m && !m.classList.contains("hidden") && !!a && !a.hidden; })) await h.click("#confirmAlt", { wait: 900 });
  await h.closeModals();
};
const page = async (h, key) => { await h.home(); await h.js((k) => window.LDS_openProfile(k), key); await h.wait(1500); await h.calm(); await until(h, () => !!document.getElementById("loanDocsAdd")); };
const workbook = async (h, name, sheets) => {
  const b64 = await h.js((a) => { const wb = XLSX.utils.book_new(); a.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.g), s.n)); return XLSX.write(wb, { type: "base64", bookType: "xlsx" }); }, sheets);
  const f = path.join(h.ctx.UDATA, name); fs.writeFileSync(f, Buffer.from(b64, "base64")); return { file: f, b64: b64 };
};
// type into a box of the review window and leave it, as a person does (the window redraws on the box's own change)
const type = async (h, sel, v) => { await h.fill(sel, v, { change: false }); await h.page.locator(sel).first().evaluate((e) => e.blur()); await h.wait(500); };
const add = async (h, file) => { await h.page.setInputFiles("#loanDocsFile", file); await h.wait(1200); };
// close every review window the T12 check opens (one per T12 read), keeping each one waiting
const keepWaiting = async (h, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)){ if (await h.js(() => !!document.querySelector("[data-t12rv-wait]"))){ await h.click("[data-t12rv-wait]", { wait: 900 }); continue; } await h.wait(500); if (!(await h.js(() => !!document.querySelector("[data-t12rv-wait]")))) { await h.wait(2500); if (!(await h.js(() => !!document.querySelector("[data-t12rv-wait]")))) return; } } };
// a list (select) shown open: its choices drawn as a list box for the picture, each row tall enough for its marker
const openList = (sel, n) => async (h) => { await h.page.locator(sel).first().evaluate((s, k) => { s.size = k; s.style.height = "auto"; s.querySelectorAll("option").forEach(o => { o.style.padding = "7px 8px"; }); }, n); await h.wait(250); };
const closeList = (sel) => async (h) => { const l = h.page.locator(sel).first(); if (await l.count()) await l.evaluate((s) => { s.size = 0; s.style.height = ""; s.querySelectorAll("option").forEach(o => { o.style.padding = ""; }); }); };
const scrollToRow = (n) => async (h) => { await h.js((k) => { document.querySelector('[data-t12rv-row="' + k + '"]').scrollIntoView({ block: "center" }); }, n); await h.wait(200); };
// a made-up three-sheet workbook: a part for the property it is added on, one for Sample Oaks, one for no property
const ownerStatements = (first, firstName) => [{ n: first, g: t12(firstName, 60000, 12000) }, { n: "Oaks", g: t12("Sample Oaks (example)", 40000, 9000) }, { n: "Maple", g: t12("Maple Court (made-up)", 30000, 7000) }];
// the review window's first look (9 markers), for the reference page
const RV_MARKS = [
  { sel: "[data-t12rv] h3 + p", label: "The file and sheet", text: "Under the title, which names the property. Rows and columns are numbered as Excel numbers them, so you can find each one in the file." },
  { sel: "[data-t12rv-status] > span:last-child", label: "The verdict", text: "How many of the reader’s checks fail (or “every check passes”), then whether the AI agrees." },
  { sel: "[data-t12rv-x]", label: "×", text: "Closes the window without saving, like **Keep it waiting**." },
  { sel: "[data-t12rv-sum]", label: "Income · Expenses · NOI", text: "The accounts added up, against the totals the statement prints: ✓ when they match, ✗ in red when they don’t." },
  { sel: "[data-t12rv-issues]", label: "What to look at", text: "Every failed check (red) and every point where the AI reads it differently (amber), with its row. Click a row number to jump to it." },
  { sel: "[data-t12rv-scroll]", label: "The rows", text: "Every row of the file and what the reader made of it (next picture)." },
  { sel: "[data-t12rv-wait]", label: "Keep it waiting", text: "Closes the window. The T12 waits, unused, in Documents, Underwriting and Data Health." },
  { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves the reading with your changes; its figures are used everywhere." }
];

module.exports = {
  id: "documents",
  env: () => ({ LDS_FAKE_T12: "disagree" }),
  setup: async (h) => {
    h.acceptDialogs = [];
    // no scroll-progress bar in the pictures
    await h.js(() => { if (!document.getElementById("guideDocsQuiet")){ const s = document.createElement("style"); s.id = "guideDocsQuiet"; s.textContent = "#scrollProgress{display:none!important}"; document.head.appendChild(s); } });
    await h.home();
    await addProp(h, "Sample Gardens (example)");
    await addProp(h, "Sample Oaks (example)");
    await addProp(h, "Sample Pines (example)");
    // a made-up workbook saved to Sample Pines before anyone said which of its parts is Pines’ own
    const wb = await workbook(h, "Owner statements 2 (made-up).xlsx", [{ n: "Elm Court", g: t12("Elm Court (made-up)", 60000, 12000) }, { n: "Birch Row", g: t12("Birch Row (made-up)", 40000, 9000) }, { n: "Cedar Walk", g: t12("Cedar Walk (made-up)", 30000, 7000) }]);
    await h.js((a) => window.ldsShell.docSave({ propKey: a.k, propName: "Sample Pines (example)", name: "Owner statements 2 (made-up).xlsx", base64: a.b, text: "", type: "", role: "t12" }), { k: PINES, b: wb.b64 });
    fs.writeFileSync(path.join(h.ctx.UDATA, "Loan agreement (made-up).txt"), "LOAN AGREEMENT — a made-up example\nBorrower: Sample Gardens Owner LLC (made-up)\nLender: Example Bank (made-up)\nLoan amount: $10,000,000\nMaturity date: 01/01/2031\n");
    fs.copyFileSync(SCAN, path.join(h.ctx.UDATA, "Inspection report (made-up scan).pdf"));
    // the same made-up pages with a different file ending: the app keeps what OCR read by the file's content, so an exact
    // copy would be read from that store at once, and the scanned PDF's reading card (read-a-scanned-pdf) would never show
    fs.writeFileSync(path.join(h.ctx.UDATA, "Agreements, two properties (made-up scan).pdf"), Buffer.concat([fs.readFileSync(SCAN), Buffer.from("\n% made-up copy for the guide\n")]));
  },
  pages: [
    // ==================================================================================================================
    { id: "add-a-document", kind: "howto", group: "Documents", title: "Add a document",
      description: "Save a T12, a rent roll, a loan agreement or any other file to a property.",
      intro: "Every property keeps its files in its own folder. Add them on the property’s page: they stay with the property, and the assistant reads them when you talk about it, so you never upload a file twice.",
      prep: async (h) => { await page(h, GARDENS); },
      sections: [
        { title: "Add files",
          steps: [
            { text: "Open the property’s page: click **Specific Property** under the tabs and pick the property. **Documents** is near the bottom of the page.",
              go: async (h) => { await h.scroll(DOCS); } },
            { text: "Pick what you are adding in **What you are adding**, or leave **Detect automatically** to let the app look at what is in the file.",
              go: openList("#loanDocsType", 6),
              after: closeList("#loanDocsType"),
              shot: DOCS,
              marks: [
                { sel: "#loanDocsType option >> nth=0", label: "Detect automatically", text: "The app reads the file and decides what it is." },
                { sel: "#loanDocsType option >> nth=2", label: "T12", text: "Goes through [the T12 check](check-a-t12) before it is used." },
                { sel: "#loanDocsType option >> nth=5", label: "Other", text: "Anything else: kept, and used for no figure." }
              ] },
            { text: "Click **Add files**, pick one or more files in the window that opens, and click **Open**. Each file is saved to the property’s folder and listed. Here a made-up loan agreement, added as **Loan agreement**.",
              go: async (h) => { await h.select("#loanDocsType", "agreement"); await add(h, path.join(h.ctx.UDATA, "Loan agreement (made-up).txt")); await until(h, () => !!document.querySelector("[data-docrow]")); await h.wait(600); },
              shot: DOCS,
              marks: [
                { sel: row("Loan agreement") + " .font-semibold", label: "The file", text: "Its name as you saved it; under it, its size, the day it was saved, and how much text the app read from it." },
                { sel: row("Loan agreement") + " [data-doctype]", label: "Type", text: "What the file is. See [Change or remove a file](change-or-remove-a-file)." }
              ] }
          ],
          tip: "You can also drag files from a folder onto the **Documents** box.",
          note: "A file with the same name but different content is kept as a copy (“… (2)”), never replaced. The same file twice says “Already on file”. With **Detect automatically**, a rent roll or an agreement that names another of your properties is filed there instead." }
      ],
      next: [
        { page: "check-a-t12", text: "What happens when the file is a T12." },
        { page: "change-or-remove-a-file", text: "Change a file’s type, save a copy or remove it." },
        { page: "ref-documents", anchor: "the-documents-box", text: "Every part of the Documents box." }
      ] },

    // ==================================================================================================================
    { id: "check-a-t12", kind: "howto", group: "Documents", title: "Check a T12",
      description: "Look over how a new T12 was read, change what is wrong, and save the reading so its figures are used.",
      intro: "Every new T12 is read twice, by the app’s own reader and by Claude (“the AI” in the app’s words), before anything from it is used. When every check of the reader passes and Claude agrees, it is used at once. Otherwise the review window opens, and you decide.",
      before: [ "Claude connected, for the second reading: see [Connect Claude](connect-claude). Without it, see [When Claude isn’t connected](check-a-t12#when-claude-isnt-connected)." ],
      prep: async (h) => { await page(h, GARDENS); },
      sections: [
        { title: "Add the T12",
          steps: [
            { text: "On the property’s page, in **Documents**, leave **Detect automatically** in **What you are adding**, or pick **T12**." },
            { text: "Click **Add files** and pick the T12. Here every check of the reader passes on a made-up T12, but Claude reads two rows differently, so the review window opens.",
              go: async (h) => { await add(h, await h.xlsx(GRID, "Sample Gardens T12 (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-t12rv-save]"), 60000); await h.wait(500); },
              shot: RV,
              marks: [
                { sel: "[data-t12rv-status]", label: "The verdict", text: "How many of the reader’s checks fail, and whether Claude agrees." },
                { sel: "[data-t12rv-issues]", label: "What to look at", text: "Every failed check (red) and every row Claude reads differently (amber)." },
                { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves it; its figures are then used everywhere." }
              ] }
          ],
          note: "Nothing from the T12 is saved or used until you click **Save this reading**." },
        { title: "Look at a row Claude reads differently",
          steps: [
            { text: "In **What to look at**, click a row number. The table jumps to that row, lit up. Here Claude puts Utility Reimbursements on the expense side; the reader has it as income.",
              go: async (h) => { await h.click('[data-t12rv-issues] [data-t12rv-go="17"]', { wait: 300 }); },
              wait: 100,
              shot: RV,
              marks: [
                { sel: '[data-t12rv-issues] [data-t12rv-go="17"]', label: "Row 17", text: "Jumps to the row." },
                { sel: '[data-t12rv-row="17"]', label: "The row", text: "Amber: Claude reads it differently." },
                { sel: '[data-t12rv-row="17"] select[data-t12rv-side]', label: "Side", text: "Income here; Claude says Expense." },
                { sel: '[data-t12rv-row="17"] >> text=/^AI:/', label: "AI: …", text: "What Claude read." }
              ] },
            { text: "Decide from the file which reading is right. To change the row, pick another value in one of its lists. Here Utility Reimbursements moves to its own underwriting line, Utility Reimbursements (RUBS).",
              go: async (h) => { await h.select('select[data-t12rv-cat="17"]', "RUBS"); await h.wait(400); await scrollToRow(17)(h); },
              shot: RV,
              marks: [
                { sel: '[data-t12rv-row="17"] select[data-t12rv-cat]', label: "Underwriting line", text: "Changed by you, so the row is marked “yours”." },
                { sel: "[data-t12rv-clear]", label: "1 change of yours · clear my changes", text: "How many changes you made; the link undoes them all." }
              ] }
          ],
          note: "The window works out every check again as soon as you change a row." },
        { title: "Use a different amount",
          steps: [
            { text: "Type the amount in the row’s **Amount used** box, and click elsewhere. Here it is Claude’s reading of Plumbing Repairs. The box turns green, and the note box red.",
              go: async (h) => { await h.click("[data-t12rv-clear]", { wait: 300 }); await type(h, 'input[data-t12rv-amt="38"]', "19150"); await scrollToRow(38)(h); },
              shot: RV,
              marks: [
                { sel: 'input[data-t12rv-amt="38"]', label: "Amount used", text: "Your amount (green)." },
                { sel: 'input[data-t12rv-note="38"]', label: "why (needed)", text: "Red until you write why." },
                { sel: '[data-t12rv-row="38"] >> text=/^AI:/', label: "AI: …", text: "Claude’s reading of this row: the total, and the month it reads differently." },
                { sel: "[data-t12rv-issues] li.text-rose-700", label: "A failed check", text: "With your amount, the expenses no longer add up to the total the statement prints." }
              ] },
            { text: "Write why in the note box, and click elsewhere. The note is kept with the reading and in the property’s change history.",
              go: async (h) => { await type(h, 'input[data-t12rv-note="38"]', "Invoice checked: May was $600 higher (made-up)"); } }
          ],
          note: "An amount that differs from the file can’t be saved without a note. **Save this reading** says which row still needs one." },
        { title: "Save the reading",
          steps: [
            { text: "Click **Save this reading**. If a check still fails, the app asks first.",
              go: async (h) => { await h.click("[data-t12rv-save]", { wait: 600 }); await until(h, () => { const m = document.getElementById("confirmModal"); return !!m && !m.classList.contains("hidden"); }, 5000); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmTitle", label: "Some checks still fail", text: "How many checks fail." },
                { sel: "#confirmText", label: "What is used", text: "Which figures are used if you save anyway." },
                { sel: "#confirmCancel", label: "Cancel", text: "Back to the window, to fix the rows." },
                { sel: "#confirmOk", label: "Save anyway", text: "Saves the reading as it is." }
              ] },
            { text: "Click **Save anyway** to use the T12 as it is, or **Cancel** to go back and fix the rows. Once saved, its figures are used everywhere.",
              go: async (h) => { await h.click("#confirmCancel", { wait: 400 }); await h.click("[data-t12rv-clear]", { wait: 400 }); } }
          ],
          note: "Saved with a check still failing, your accounts are used as you set them. If you changed no figure, the statement’s printed totals are used, and Underwriting shows the difference." },
        { title: "Review it later",
          steps: [
            { text: "Click **Keep it waiting** to close the window without saving. The T12 is kept, but nothing from it is used yet. Its row in **Documents** says so.",
              go: async (h) => { await h.click("[data-t12rv-wait]", { wait: 900 }); await page(h, GARDENS); await until(h, () => !!document.querySelector("[data-doct12]")); },
              shot: DOCS,
              marks: [
                { sel: row("T12 (made-up)") + " [data-doct12]", label: "T12: Waiting for your review", text: "Saved in the folder, but not used yet." },
                { sel: row("T12 (made-up)") + " [data-doct12] [data-t12open]", label: "Review", text: "Opens the review window again." },
                { sel: row("T12 (made-up)") + " [data-doctype]", label: "Type: T12", text: "Detected as a T12." }
              ] },
            { text: "To review it from Underwriting instead, pick the property there. The T12 waits above the property’s figures, with **Review**.",
              go: async (h) => { await h.newTab("underwriting"); await h.uwProperty(GARDENS); await h.top(); },
              shot: "#uwDrop >> xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' boxline ')][1]",
              marks: [
                { sel: "#opPropPick", label: "Property", text: "The property." },
                { sel: "[data-t12waiting]", label: "… is waiting for your review", text: "The file, why it waits, and that nothing from it is used yet." },
                { sel: "[data-t12waiting] [data-t12open]", label: "Review", text: "Opens the review window." }
              ] },
            { text: "Click **Review**, look over the rows, and click **Save this reading**. The T12 is used at once: its NOI reaches the property’s page, the Portfolio page, the debt sizing and the refinance.",
              go: async (h) => { await page(h, GARDENS); await h.click(row("T12 (made-up)") + " [data-t12open]", { wait: 1500 }); await until(h, () => !!document.querySelector("[data-t12rv-save]")); await h.click("[data-t12rv-save]", { wait: 2500 }); await h.closeModals(); await page(h, GARDENS); await until(h, () => { const e = document.querySelector("[data-doct12]"); return !!e && e.getAttribute("data-doct12") !== "waiting"; }, 20000); },
              shot: DOCS,
              marks: [
                { sel: row("T12 (made-up)") + " [data-doct12]", label: "T12: Reviewed by you", text: "In use. Other words you may see: “Checked by the reader and the AI” (both agreed), “Read by the reader only (Claude wasn’t connected)”, “Being read by the reader and the AI”." }
              ] }
          ],
          note: "Data Health lists every T12 still waiting, under “T12s that need your review”. See [Fix what Data Health finds](fix-data-health)." },
        { title: "If the T12 names no property",
          text: "When you add a T12 on a property’s page and its sheet doesn’t name that property, the app asks which sheet is the property’s T12.",
          steps: [
            { text: "Pick the sheet that is the property’s T12, or **None — keep it as a document**.",
              go: async (h) => { await page(h, PINES); await add(h, await h.xlsx(t12("Made-up Statement Co.", 45000, 9000), "Statement (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-whichsheet]")); await openList("[data-sheetsel]", 2)(h); },
              shot: "[data-whichsheet] > div",
              marks: [
                { sel: "[data-sheetsel] option >> nth=0", label: "A sheet", text: "Use this sheet as the property’s T12." },
                { sel: "[data-sheetsel] option >> nth=1", label: "None — keep it as a document", text: "Saved as an “Other” document; no figure is taken from it." },
                { sel: "[data-sheetok]", label: "Save it", text: "Saves the file with your answer." }
              ] },
            { text: "Click **Save it**. A sheet you picked then goes through the T12 check, as above.",
              go: async (h) => { await closeList("[data-sheetsel]")(h); await h.select("[data-sheetsel]", ""); await h.click("[data-sheetok]", { wait: 1500 }); } }
          ] },
        { title: "When Claude isn’t connected",
          text: "Without Claude, the T12 can’t be checked against a second reading. The app says so and asks what to do; nothing from the T12 is used yet. The window is pictured in [Documents and the T12 check](ref-documents#when-claude-isnt-connected).",
          steps: [
            { text: "Click **Use the reader’s reading** to use the T12 as the app’s reader read it. The button is there only when every check of the reader passes. The T12’s row then says “Read by the reader only (Claude wasn’t connected)”." },
            { text: "Or click **Review it myself** to open the review window, or **Keep it waiting** to decide later." }
          ],
          tip: "Once Claude is connected, **Read again** in Underwriting reads the T12 with Claude too, and checks it." }
      ],
      next: [
        { page: "draft-the-underwriting", text: "Underwrite the property from its T12." },
        { page: "ref-documents", anchor: "the-t12-review-window", text: "Every part of the review window." }
      ] },

    // ==================================================================================================================
    { id: "change-or-remove-a-file", kind: "howto", group: "Documents", title: "Change or remove a file",
      description: "Change what a saved file is, save a copy of it on your computer, or remove it from the property.",
      intro: "Every file in a property’s **Documents** has a type, which you can change at any time, and every file can be removed. Removing always asks first.",
      prep: async (h) => { await page(h, GARDENS); },
      sections: [
        { title: "Change a file’s type",
          steps: [
            { text: "On the property’s page, find the file in **Documents**." },
            { text: "Pick the new type in the list on the file’s row. It is saved at once.",
              go: openList(row("Loan agreement") + " [data-doctype]", 5),
              after: closeList(row("Loan agreement") + " [data-doctype]"),
              shot: DOCS,
              marks: [
                { sel: row("Loan agreement") + " [data-doctype] option >> nth=1", label: "T12", text: "Read and checked as a T12. (The lit type, Loan agreement, is the one it has now.)" },
                { sel: row("Loan agreement") + " [data-doctype] option >> nth=4", label: "Other", text: "Kept, used for no figure." }
              ] }
          ],
          note: "Making a file a T12 sends it through [the T12 check](check-a-t12). Taking the T12 type away from the T12 in use rebuilds the property’s numbers from any other T12 on file." },
        { title: "Save a copy on your computer",
          steps: [
            { text: "Click **Save copy** on the file’s row, and pick where to save it in the window that opens." }
          ] },
        { title: "Remove a file",
          steps: [
            { text: "Click **Remove** on the file’s row. The app asks first, and says what goes with the file. Here it is the T12 in use.",
              go: async (h) => { await h.click(row("T12 (made-up)") + " [data-docdel]", { wait: 700 }); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmTitle", label: "Remove “…”?", text: "The file." },
                { sel: "#confirmText", label: "What goes with it", text: "Deleted from the property’s folder; for the T12 in use, its NOI too." },
                { sel: "#confirmCancel", label: "Cancel", text: "Keeps the file." },
                { sel: "#confirmOk", label: "Remove", text: "Deletes it, and rebuilds the property’s numbers." }
              ] },
            { text: "Click **Remove**. The file is deleted from the property’s folder.",
              go: async (h) => { await h.click("#confirmCancel", { wait: 400 }); } }
          ],
          warning: "Removing the T12 in use takes its NOI off the Portfolio page, the DSCR and the refinance. The numbers are rebuilt from any other T12 on file; otherwise the property has no NOI yet. The automatic backups keep a copy of every removed file: see [Back up and restore](back-up-and-restore)." }
      ],
      next: [
        { page: "add-a-document", text: "Add another file." },
        { page: "ref-documents", anchor: "the-documents-box", text: "Every part of a file’s row." }
      ] },

    // ==================================================================================================================
    { id: "split-a-multi-property-file", kind: "howto", group: "Documents", title: "Split a file that covers several properties",
      description: "Say which part of a workbook or a PDF belongs to which property.",
      intro: "A workbook can hold several properties’ statements, one per sheet or one after another, and one PDF can hold several agreements. Such a file never goes anywhere by itself: you say which part is whose, and each property reads only its own part.",
      prep: async (h) => { await page(h, GARDENS); },
      sections: [
        { title: "Say which part is whose",
          steps: [
            { text: "On one of the properties’ pages, click **Add files** and pick the file. The app lists its parts, and sets each part whose name matches one of your properties to that property. Here a made-up workbook with three sheets, added on Sample Gardens’ page.",
              go: async (h) => { const wb = await workbook(h, "Owner statements (made-up).xlsx", ownerStatements("Gardens", "Sample Gardens (example)")); await add(h, wb.file); await until(h, () => !!document.querySelector("[data-partsmodal]")); },
              shot: "[data-partscard]",
              marks: [
                { sel: 'select[data-partsel="1"]', label: "This property", text: "Part 1 names Sample Gardens: set to it." },
                { sel: 'select[data-partsel="2"]', label: "Another property", text: "Part 2 names Sample Oaks: it goes to Sample Oaks’ folder." },
                { sel: '[data-partrow="3"]', label: "Not linked", text: "Maple Court is no property in the app: not ticked, “Don’t link”." }
              ] },
            { text: "Check each part’s property, and change any that is wrong. Tick a part to link it; a part that is none of your properties stays on **Don’t link**." },
            { text: "To give one part to a second property too, click **+ another property** under it. To make a new property from a part, pick **Add as a new property** in its list.",
              go: async (h) => { await h.click('[data-partsadd="2"]', { wait: 300 }); await h.select('[data-partrow="3"] select[data-partsel]', "__new__"); },
              shot: "[data-partscard]",
              marks: [
                { sel: '[data-partkeys="2"] select >> nth=1', label: "A second property", text: "Added by **+ another property**: pick the second property, or leave it empty." },
                { sel: '[data-partrow="3"] select[data-partsel]', label: "➕ Add as a new property “Maple Court (made-up)”", text: "Creates that property and links this part to it." },
                { sel: '[data-partuse="3"]', label: "Ticked by itself", text: "Picking a property ticks the part." }
              ] },
            { text: "Click **Approve**. Each property gets the file with its own part, and each T12 part goes through [the T12 check](check-a-t12) for its property. The file’s row says which part is this property’s, and the T12 line under it where its part stands in the check. Here part 3 was set back to “Don’t link” first.",
              go: async (h) => {
                await h.select('[data-partrow="3"] select[data-partsel]', ""); await h.js(() => { document.querySelector('[data-partuse="3"]').checked = false; const s = document.querySelectorAll('[data-partkeys="2"] select')[1]; if (s) s.value = ""; });
                await h.click("[data-partsok]", { wait: 1500 }); await keepWaiting(h, 40000);
                await page(h, GARDENS); await until(h, () => { const e = document.querySelector("[data-docpart]"); return !!e && /part/i.test(e.textContent); }, 15000);
              },
              shot: DOCS,
              marks: [
                { sel: row("Owner statements") + " [data-docpart]", label: "This property’s part: …", text: "Which sheet of the file is Sample Gardens’: only its numbers are read for it." },
                { sel: row("Owner statements") + " [data-partsanswer]", label: "Change", text: "Asks the question again, to give another answer." }
              ] }
          ],
          note: "Two parts given to one property are added together." },
        { title: "Answer a file that waits",
          text: "A file saved before anyone said which part is whose (by the assistant, say) waits for an answer: none of its numbers are used for the property until you give one.",
          steps: [
            { text: "On the property’s page, find the file’s row in **Documents**: it asks which part is this property’s. Click **Answer**.",
              go: async (h) => { await page(h, PINES); await until(h, () => /which one/.test((document.querySelector("[data-docpart]") || {}).textContent || ""), 15000); },
              shot: DOCS,
              marks: [
                { sel: row("Owner statements 2") + " [data-docpart]", label: "It has 3 parts — which one is this property’s?", text: "Its numbers aren’t used until you say." },
                { sel: row("Owner statements 2") + " [data-partsanswer]", label: "Answer", text: "Opens the question." }
              ] },
            { text: "Tick the property’s part, and pick the property in its list. When no part names the property, nothing is set for you.",
              go: async (h) => { await h.click(row("Owner statements 2") + " [data-partsanswer]", { wait: 900 }); await until(h, () => !!document.querySelector("[data-partsmodal]")); },
              shot: "[data-partscard]",
              marks: [
                { sel: "[data-partscard] h3 + p b", label: "Which part is Sample Pines (example)’s?", text: "Pick it below: nothing is set for you." },
                { sel: 'select[data-partsel="1"]', label: "Property", text: "Pick “Sample Pines (example) (this property)” on the right part." },
                { sel: "[data-partscancel]", label: "Cancel", text: "The file keeps waiting." },
                { sel: "[data-partsok]", label: "Approve", text: "Links the part; its numbers are used from now on." }
              ] },
            { text: "Click **Approve**. The part’s numbers are used from now on.",
              go: async (h) => { await h.click("[data-partscancel]", { wait: 400 }); } }
          ],
          note: "Data Health lists every file that waits for an answer. See [Fix what Data Health finds](fix-data-health)." },
        { title: "Split a PDF by pages",
          text: "One PDF can hold several agreements (split it into parts by pages), or one agreement can cover several properties (give the part to each).",
          steps: [
            { text: "On the PDF’s row in **Documents**, click **Pages & properties**. Here a made-up two-page PDF on Sample Gardens’ page.",
              go: async (h) => {
                await page(h, GARDENS); await h.select("#loanDocsType", "agreement"); await add(h, path.join(h.ctx.UDATA, "Agreements, two properties (made-up scan).pdf"));
                await until(h, () => !document.querySelector("[data-readrow]") && [...document.querySelectorAll("[data-docrow]")].some(r => /two properties/.test(r.textContent) && r.querySelector("[data-pdfparts]")), 120000);
                await page(h, GARDENS); await h.click(row("two properties") + " [data-pdfparts]", { wait: 1200 }); await until(h, () => !!document.querySelector("[data-pdfmodal]"));
              },
              shot: "[data-pdfmodal] > div",
              marks: [
                { sel: '[data-pdffrom="1"]', label: "Pages … to …", text: "The part’s first and last page." },
                { sel: '[data-pdfrow="1"] select[data-partsel]', label: "Property", text: "The property this part belongs to." },
                { sel: "[data-pdfadd]", label: "+ Add a part (pages)", text: "Another page range, for another property." }
              ] },
            { text: "For each part, type its first and last page, and pick its property. Click **+ Add a part (pages)** for the next part, or **+ another property** to give the same pages to a second property too." },
            { text: "Click **Approve**. The file is copied to each property named, and each property reads only its own pages.",
              go: async (h) => { await h.click("[data-pdfcancel]", { wait: 400 }); } }
          ] }
      ],
      next: [
        { page: "check-a-t12", text: "What happens to each T12 part." },
        { page: "ref-documents", anchor: "files-with-several-parts", text: "Every control of the parts and pages windows." }
      ] },

    // ==================================================================================================================
    { id: "read-a-scanned-pdf", kind: "howto", group: "Documents", title: "Read a scanned PDF",
      description: "Add a PDF whose pages are scans, and see which pages were read by OCR.",
      intro: "A PDF is read page by page. A page that is a picture, such as a scan, is read by OCR: the computer reads the letters in the picture. OCR can make mistakes, so the app always says which pages it read that way.",
      prep: async (h) => { await page(h, PINES); },
      sections: [
        { title: "Add the PDF",
          steps: [
            { text: "On the property’s page, click **Add files** in **Documents**, and pick the PDF.",
              go: async (h) => { await h.page.setInputFiles("#loanDocsFile", path.join(h.ctx.UDATA, "Inspection report (made-up scan).pdf")); } },
            { text: "Watch the card at the bottom left: it shows each page as it is read. You can keep working meanwhile.",
              go: async (h) => { await until(h, () => /scanned page/.test((document.querySelector("[data-readnote]") || {}).textContent || ""), 20000); },
              wait: 50,
              shot: "view",
              marks: [
                { sel: "[data-readrow]", label: "The reading card", text: "One card per file being read: its name, and the page it is on (“reading scanned page 2 of 2”: “scanned page” means it is read by OCR)." },
                { sel: "[data-readstop]", label: "Stop", text: "Stops after this page." }
              ] }
          ],
          note: "**Stop** saves nothing: add the file again to go on where it stopped (the pages already read are kept). If the app is closed halfway, it goes on reading at the next start." },
        { title: "See how it was read",
          steps: [
            { text: "When the card goes away, find the file in **Documents**. Its row says how it was read, with the pages read by OCR in amber.",
              go: async (h) => { await until(h, () => !document.querySelector("[data-readrow]"), 60000); await page(h, PINES); await until(h, () => !!document.querySelector("[data-docread]")); },
              shot: DOCS,
              marks: [
                { sel: row("Inspection report") + " [data-docread]", label: "2 pages · page 2 read by OCR — may contain errors", text: "The pages read by OCR (amber), and any page that couldn’t be read." },
                { sel: row("Inspection report") + " [data-pdfparts]", label: "Pages & properties", text: "Split the PDF by pages, or give it to several properties. See [Split a file that covers several properties](split-a-multi-property-file#split-a-pdf-by-pages)." }
              ] }
          ],
          note: "A file with no readable text at all says “no readable text” on its row." }
      ],
      next: [
        { page: "split-a-multi-property-file", anchor: "split-a-pdf-by-pages", text: "Split the PDF by pages." },
        { page: "ref-documents", text: "Every part of the Documents box." }
      ] },

    // ==================================================================================================================
    { id: "ref-documents", kind: "reference", group: "Reference", title: "Documents and the T12 check",
      description: "Every part of a property’s Documents box, the T12 review window, and the windows that ask which part of a file is whose.",
      intro: "The pictures use made-up properties and made-up files. Point at a number, on the picture or in the list, to find it.",
      prep: async (h) => { await addProp(h, "Sample Elms (example)"); await page(h, ELMS); },
      sections: [
        { title: "The Documents box",
          text: "On every property’s page, with or without a loan: the files saved in the property’s folder.",
          views: [
            { title: "No files yet",
              go: async (h) => { await h.scroll(DOCS); },
              shot: DOCS,
              marks: [
                { sel: "#propDocsPanel h2", label: "Documents", text: "The files saved in this property’s folder." },
                { sel: "#propDocsPanel h2 + p", label: "Saved for …", text: "Which property. The assistant reads these when you talk about it." },
                { sel: "#loanDocsType", label: "What you are adding", text: "The type of the next files you add (next picture)." },
                { sel: "#loanDocsAdd", label: "Add files", text: "Opens your computer’s file window: pick one or more files and click Open. Dropping files on this box does the same." },
                { sel: "#propDocsPanel >> text=No documents saved", label: "Nothing yet", text: "Shown until the first file is added." }
              ] },
            { title: "What you are adding",
              text: "The same types are in the list on each file’s row, where you can change them later.",
              go: openList("#loanDocsType", 6),
              after: closeList("#loanDocsType"),
              shot: DOCS,
              marks: [
                { sel: "#loanDocsType option >> nth=0", label: "Detect automatically", text: "The app reads the file and decides: a T12, a rent roll, an agreement… A rent roll or an agreement that names another property is filed there instead." },
                { sel: "#loanDocsType option >> nth=1", label: "Loan agreement", text: "The loan agreement. It is read when you ask to fill in the loan from it, and it is one of Claude’s sources for its stories and What to push." },
                { sel: "#loanDocsType option >> nth=2", label: "T12", text: "The operating statement. It goes through the T12 check before it is used." },
                { sel: "#loanDocsType option >> nth=3", label: "Rent roll", text: "The rent roll: units, occupancy and rents." },
                { sel: "#loanDocsType option >> nth=4", label: "Unit Statistics", text: "A unit statistics report." },
                { sel: "#loanDocsType option >> nth=5", label: "Other", text: "Anything else: kept, and used for no figure." }
              ] },
            { title: "A file in the list",
              text: "Each file is a row: its name, size and the day it was saved, how it was read, its type, and two buttons.",
              go: async (h) => { await h.select("#loanDocsType", "agreement"); await add(h, path.join(h.ctx.UDATA, "Loan agreement (made-up).txt")); await until(h, () => !!document.querySelector("[data-docrow]")); await h.wait(600); },
              shot: DOCS,
              marks: [
                { sel: row("Loan agreement") + " .font-semibold", label: "The file", text: "Its name as you saved it. Under it: its size and the day it was saved, or “no readable text” when the app can’t read any." },
                { sel: row("Loan agreement") + " [data-docread]", label: "How it was read", text: "How much text was read from it; for a PDF, its pages and which were read by OCR." },
                { sel: row("Loan agreement") + " [data-doctype]", label: "Type", text: "What the file is. Change it here at any time." },
                { sel: row("Loan agreement") + " [data-docsave]", label: "Save copy", text: "Saves a copy wherever you choose on your computer." },
                { sel: row("Loan agreement") + " [data-docdel]", label: "Remove", text: "Deletes it from the property’s folder; it asks first." },
                { sel: "#loanDocsFolder", label: "Folder", text: "Opens the documents folder on your computer." }
              ] }
          ] },
        { title: "The T12 review window",
          text: "Opens when a new T12 fails a check of the app’s reader, or Claude reads it differently. Nothing from the T12 is used until you save. A T12’s row in **Documents** says where it stands: “Being read by the reader and the AI”, “Waiting for your review” (with **Review**), “Checked by the reader and the AI”, “Reviewed by you”, or “Read by the reader only (Claude wasn’t connected)”. For the steps, see [Check a T12](check-a-t12).",
          views: [
            { title: "The window",
              go: async (h) => { await add(h, await h.xlsx(GRID_ELMS, "Sample Elms T12 (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-t12rv-save]"), 60000); await h.wait(500); },
              shot: RV,
              marks: RV_MARKS },
            { title: "How each row was read",
              text: "One line per row of the file. The file’s own name column comes first, then what the reader made of the row. The months and the total, as in the file, are further right: scroll the table sideways.",
              go: async (h) => { await h.js(() => { const sc = document.querySelector("[data-t12rv-scroll]"); const r = sc.querySelector('[data-t12rv-row="8"]'); sc.scrollTop = r.offsetTop - 40; }); await h.wait(300); },
              shot: "[data-t12rv-scroll]",
              marks: [
                { sel: "[data-t12rv-scroll] th >> nth=0", label: "Row", text: "The row number in Excel." },
                { sel: '[data-t12rv-row="8"] select[data-t12rv-role]', label: "What the reader made of it", text: "Account, Category name, Total, Income total, Expense total, Net Operating Income, Not operating, or Above the header, Header row, Empty." },
                { sel: '[data-t12rv-row="8"] select[data-t12rv-side]', label: "Side", text: "Income or Expense (accounts only)." },
                { sel: '[data-t12rv-row="8"] td:nth-child(5)', label: "Category (in the file)", text: "The category the account sits under in the file itself." },
                { sel: '[data-t12rv-row="8"] select[data-t12rv-cat]', label: "Underwriting line", text: "The line of the Underwriting table it adds to, with the item it is (e.g. “the vacancy”) under it." },
                { sel: '[data-t12rv-row="8"] input[data-t12rv-amt]', label: "Amount used", text: "The amount the reader takes (grey). Type another to use yours; it then needs a note." },
                { sel: '[data-t12rv-row="8"] input[data-t12rv-note]', label: "Your note", text: "Why you changed this row. Kept with the reading and in the property’s change history." },
                { sel: '[data-t12rv-row="8"] >> text=its months', label: "Check", text: "✓ = its months add up to its total. A failed check is in red; a row the AI reads differently, in amber, with “AI: …”." }
              ],
              after: async (h) => { await h.click("[data-t12rv-wait]", { wait: 900 }); await keepWaiting(h, 4000); } }
          ] },
        { title: "Files with several parts",
          text: "A workbook with several properties’ statements asks which part is whose before it is saved. Afterwards the file’s row says “This property’s part: …” with **Change**, or, for a file still waiting, “It has N parts — which one is this property’s?” with **Answer**. See [Split a file that covers several properties](split-a-multi-property-file).",
          views: [
            { title: "Which part is whose?",
              text: "A made-up workbook with three sheets, added on Sample Elms’ page.",
              go: async (h) => { await page(h, ELMS); const wb = await workbook(h, "Owner statements 3 (made-up).xlsx", ownerStatements("Elms", "Sample Elms (example)")); await add(h, wb.file); await until(h, () => !!document.querySelector("[data-partsmodal]")); },
              shot: "[data-partscard]",
              marks: [
                { sel: "[data-partscard] h3 + p", label: "The file", text: "How many parts and sheets, and which parts are already set to this property." },
                { sel: '[data-partrow="1"] label > span > span:last-child', label: "Part 1", text: "Sheet 1 of 3 · its sheet name · the property name in it; under it, what it is (T12) and its NOI." },
                { sel: '[data-partuse="1"]', label: "Ticked", text: "This part will be linked." },
                { sel: 'select[data-partsel="1"]', label: "This property", text: "Set to Sample Elms: its name matches. Each list offers Don’t link, this property, every other property, and “Add as a new property” named after the part." },
                { sel: 'select[data-partsel="2"]', label: "Another property", text: "Part 2 names Sample Oaks: it goes to Sample Oaks’ folder." },
                { sel: '[data-partrow="3"]', label: "Not linked", text: "Maple Court is no property in the app: not ticked, “Don’t link”." },
                { sel: "[data-partscancel]", label: "Cancel", text: "Nothing is saved." },
                { sel: "[data-partsok]", label: "Approve", text: "Saves the file to each property, with its own part." }
              ],
              after: async (h) => { await h.click("[data-partscancel]", { wait: 600 }); } }
          ] },
        { title: "A T12 that names no property",
          views: [
            { text: "A T12 added on a property’s page whose sheet doesn’t name that property.",
              go: async (h) => { await page(h, ELMS); await add(h, await h.xlsx(t12("Made-up Statement Co.", 45000, 9000), "Statement 2 (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-whichsheet]")); await openList("[data-sheetsel]", 2)(h); },
              shot: "[data-whichsheet] > div",
              marks: [
                { sel: "[data-whichsheet] h3", label: "Which sheet is …’s T12?", text: "The property you are on." },
                { sel: "[data-whichsheet] p", label: "Why it asks", text: "The file doesn’t name this property." },
                { sel: "[data-sheetsel] option >> nth=0", label: "A sheet", text: "Use this sheet as the property’s T12; it then goes through the T12 check." },
                { sel: "[data-sheetsel] option >> nth=1", label: "None — keep it as a document", text: "Saved as an “Other” document; no figure is taken from it." },
                { sel: "[data-sheetok]", label: "Save it", text: "Saves the file with your answer." }
              ],
              after: async (h) => { await closeList("[data-sheetsel]")(h); await h.select("[data-sheetsel]", ""); await h.click("[data-sheetok]", { wait: 1500 }); } }
          ] },
        { title: "Pages & properties",
          views: [
            { text: "Opened by **Pages & properties** on a PDF’s row. Split the PDF into parts by pages, or give a part to several properties: each property reads only its own pages.",
              go: async (h) => { await page(h, PINES); await h.click(row("Inspection report") + " [data-pdfparts]", { wait: 1200 }); await until(h, () => !!document.querySelector("[data-pdfmodal]")); },
              shot: "[data-pdfmodal] > div",
              marks: [
                { sel: "[data-pdfmodal] h3", label: "Which pages belong to which property?", text: "The file and how many pages it has." },
                { sel: '[data-pdffrom="1"]', label: "Pages … to …", text: "The part’s first and last page." },
                { sel: '[data-pdftitle="1"]', label: "What it is", text: "An optional name for the part (e.g. Loan agreement, Phase 1)." },
                { sel: '[data-pdfdel="1"]', label: "✕", text: "Removes the part." },
                { sel: '[data-pdfrow="1"] select[data-partsel]', label: "Property", text: "The property this part belongs to." },
                { sel: '[data-pdfrow="1"] [data-partsadd]', label: "+ another property", text: "The same pages go to a second property too." },
                { sel: "[data-pdfadd]", label: "+ Add a part (pages)", text: "Another page range, for another property." },
                { sel: "[data-pdfcancel]", label: "Cancel", text: "Nothing changes." },
                { sel: "[data-pdfok]", label: "Approve", text: "Saves the parts; the file is copied to each property named." }
              ],
              after: async (h) => { await h.click("[data-pdfcancel]", { wait: 400 }); } }
          ] },
        { title: "When Claude isn’t connected",
          text: "Without Claude, a new T12 can’t be checked against a second reading, so the app asks what to do. Here a made-up T12 added while Claude is signed out.",
          prep: async (h) => {
            // Claude signed out (the stand-in's sign-in mark taken away); the app looks again after a minute
            try { fs.unlinkSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker")); } catch (e) {}
            await h.wait(62000);
            await page(h, PINES);
          },
          views: [
            { title: "Claude isn’t connected",
              go: async (h) => { await add(h, await h.xlsx(t12("Sample Pines (example)", 45000, 9000), "Sample Pines T12 (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-t12nc]"), 40000); },
              shot: "[data-t12nc] > div",
              marks: [
                { sel: "[data-t12nc] h3", label: "Claude isn’t connected", text: "“The AI couldn’t read this T12” when Claude is connected but its reading failed." },
                { sel: "[data-t12nc] p >> nth=0", label: "The file", text: "Which property and file, and that it hasn’t been checked. Nothing from it is used yet." },
                { sel: "[data-t12nc] p >> nth=1", label: "The reader’s checks", text: "Whether the app’s own reader passes every check." },
                { sel: "[data-t12nc-wait]", label: "Keep it waiting", text: "Kept, unused, until you review it, or Claude is back and you read it again." },
                { sel: "[data-t12nc-use]", label: "Use the reader’s reading", text: "Shown only when every check passes: the T12 is used as the reader read it." },
                { sel: "[data-t12nc-review]", label: "Review it myself", text: "Opens the review window." }
              ] },
            { title: "Used as the reader read it",
              go: async (h) => { await h.click("[data-t12nc-use]", { wait: 2500 }); await keepWaiting(h, 4000); await page(h, PINES); await until(h, () => [...document.querySelectorAll("[data-docrow]")].some(r => /Sample Pines T12/.test(r.textContent) && r.querySelector("[data-doct12]")), 15000); },
              shot: DOCS,
              marks: [
                { sel: row("Sample Pines T12") + " [data-doct12]", label: "T12: Read by the reader only (Claude wasn’t connected)", text: "In use without Claude’s check. Once Claude is connected, **Read again** in Underwriting checks it with Claude." }
              ],
              after: async (h) => { try { fs.writeFileSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker"), "ok"); } catch (e) {} } }
          ] }
      ] }
  ]
};
