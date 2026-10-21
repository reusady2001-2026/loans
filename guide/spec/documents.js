/* Guide chapter: Documents & files — a property's Documents list (add, types, save a copy, remove), the T12 check every
   new T12 goes through (the review window: how each row was read, your changes with a note, where the AI disagrees,
   "waiting for your review"), files with several properties' parts, a workbook that names no property, scanned PDFs
   read by OCR, and what happens when Claude isn't connected.
   Made-up properties ("Sample Gardens / Oaks / Pines (example)") and made-up files only; the stand-in Claude reads T12s
   with two deliberate disagreements (LDS_FAKE_T12=disagree). */
"use strict";
const path = require("path"), fs = require("fs");
const GRID = require(path.join(__dirname, "..", "..", "test", "fixtures", "proforma-t12.js")).grid();
const SCAN = path.join(__dirname, "..", "..", "test", "fixtures", "ocr", "mixed.pdf");   // a made-up two-page PDF: one text page, one scanned page
const GARDENS = "name:sample gardens (example)", OAKS = "name:sample oaks (example)", PINES = "name:sample pines (example)";
const DOCS = "#propDocsPanel > div";
const M = ["Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026"];
const rowOf = (l, v) => [l].concat(Array(12).fill(v), [v * 12]);
const t12 = (top, rent, tax) => [[top], ["12 Month Statement"], ["Account"].concat(M, ["Total"]), ["INCOME"], rowOf("Gross Potential Rent", rent), rowOf("TOTAL INCOME", rent), ["EXPENSES"], rowOf("Real Estate Taxes", tax), rowOf("TOTAL EXPENSES", tax), rowOf("NET OPERATING INCOME", rent - tax)];
const row = (name) => '[data-docrow]:has(div.truncate:has-text("' + name + '"))';   // a file's row, by its name
const RV = "[data-t12rv] > div";

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
// a list (select) shown open: its choices drawn as a list box for the picture
const openList = (sel, n) => async (h) => { await h.page.locator(sel).first().evaluate((s, k) => { s.size = k; s.style.height = "auto"; }, n); await h.wait(250); };
const closeList = (sel) => async (h) => { const l = h.page.locator(sel).first(); if (await l.count()) await l.evaluate((s) => { s.size = 0; s.style.height = ""; }); };

module.exports = {
  id: "documents",
  title: "Documents & files",
  intro: "Every property keeps its files in its own folder — T12s, rent rolls, agreements, anything. Add them on the property’s page; a T12 is checked by the app’s reader and by the AI before it is used, and a file with several properties’ parts is never used until you say which part is whose.",
  env: () => ({ LDS_FAKE_T12: "disagree" }),
  setup: async (h) => {
    h.acceptDialogs = [];
    await h.home();
    await addProp(h, "Sample Gardens (example)");
    await addProp(h, "Sample Oaks (example)");
    await addProp(h, "Sample Pines (example)");
    // a made-up workbook saved to Sample Pines before anyone said which of its parts is Pines’ own
    const wb = await workbook(h, "Owner statements 2 (made-up).xlsx", [{ n: "Elm Court", g: t12("Elm Court (made-up)", 60000, 12000) }, { n: "Birch Row", g: t12("Birch Row (made-up)", 40000, 9000) }, { n: "Cedar Walk", g: t12("Cedar Walk (made-up)", 30000, 7000) }]);
    await h.js((a) => window.ldsShell.docSave({ propKey: a.k, propName: "Sample Pines (example)", name: "Owner statements 2 (made-up).xlsx", base64: a.b, text: "", type: "", role: "t12" }), { k: PINES, b: wb.b64 });
    fs.writeFileSync(path.join(h.ctx.UDATA, "Loan agreement (made-up).txt"), "LOAN AGREEMENT — a made-up example\nBorrower: Sample Gardens Owner LLC (made-up)\nLender: Example Bank (made-up)\nLoan amount: $10,000,000\nMaturity date: 01/01/2031\n");
    fs.copyFileSync(SCAN, path.join(h.ctx.UDATA, "Inspection report (made-up scan).pdf"));
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "list", title: "A property’s Documents", intro: "On every property’s page (with or without a loan): the files saved for that property. The assistant reads them when you talk about the property, so you never upload a file twice.",
      before: async (h) => { await page(h, GARDENS); },
      steps: [
        { title: "Documents", text: "A new property has no documents yet. Add files with the button, or drag them from your folder onto this box.",
          go: async (h) => { await h.scroll(DOCS); },
          shot: DOCS,
          marks: [
            { sel: "#propDocsPanel h2", label: "Documents", text: "The files saved in this property’s folder." },
            { sel: "#propDocsPanel h2 + p", label: "Saved for …", text: "Which property — the assistant reads these when you focus it." },
            { sel: "#loanDocsType", label: "What you are adding", text: "The type of the next files you add (next step). “Detect automatically” looks at what is in the file." },
            { sel: "#loanDocsAdd", label: "Add files", text: "Opens your computer’s file window: pick one or more files and click Open. Dropping files on this box does the same." },
            { sel: "#propDocsPanel >> text=No documents saved", label: "Nothing yet", text: "Shown until the first file is added." }
          ] },
        { title: "What you are adding", text: "Pick the type before you add a file when you know it; otherwise leave “Detect automatically”. A file added as a type is saved to this property as that type.",
          go: openList("#loanDocsType", 6),
          after: closeList("#loanDocsType"),
          shot: DOCS,
          marks: [
            { sel: "#loanDocsType option >> nth=0", label: "Detect automatically", text: "The app reads the file and decides: a T12, a rent roll, an agreement… A file that names another property is filed there instead." },
            { sel: "#loanDocsType option >> nth=1", label: "Loan agreement", text: "The loan agreement — read when you ask to fill in the loan from it." },
            { sel: "#loanDocsType option >> nth=2", label: "T12", text: "The operating statement. It goes through the T12 check before it is used (next topic)." },
            { sel: "#loanDocsType option >> nth=3", label: "Rent roll", text: "The rent roll: units, occupancy and rents." },
            { sel: "#loanDocsType option >> nth=4", label: "Unit Statistics", text: "A unit statistics report." },
            { sel: "#loanDocsType option >> nth=5", label: "Other", text: "Anything else — kept and read by the assistant, used for no figure." }
          ] },
        { title: "A file in the list", text: "Here a made-up loan agreement was added as “Loan agreement”. Each file is a row: its name, size and the day it was saved, its type, and two buttons. A file with the same name but different content is kept as a copy (“… (2)”), never replaced; the same file twice says “Already on file”.",
          go: async (h) => { await h.select("#loanDocsType", "agreement"); await add(h, path.join(h.ctx.UDATA, "Loan agreement (made-up).txt")); await until(h, () => !!document.querySelector("[data-docrow]")); await h.wait(600); },
          shot: DOCS,
          marks: [
            { sel: row("Loan agreement") + " .font-semibold", label: "The file", text: "Its name as you saved it." },
            { sel: row("Loan agreement") + " div.text-slate-400", label: "Size · saved", text: "Its size and the day it was saved (“no readable text” when the app can’t read any — a picture-only file is read by OCR, see “Scanned PDFs”)." },
            { sel: row("Loan agreement") + " [data-docread]", label: "How it was read", text: "How much text was read from it (or, for a PDF, its pages and which were read by OCR)." },
            { sel: row("Loan agreement") + " [data-doctype]", label: "Type", text: "What the file is. Change it here at any time (topic “Change or remove a file”)." },
            { sel: row("Loan agreement") + " [data-docsave]", label: "Save copy", text: "Saves a copy of the file wherever you choose on your computer (your computer’s save window opens)." },
            { sel: row("Loan agreement") + " [data-docdel]", label: "Remove", text: "Deletes it from the property’s folder — asks first." },
            { sel: "#loanDocsFolder", label: "Folder", text: "Opens the documents folder on your computer." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "check", title: "Add a T12: the check", intro: "A T12 is read twice — by the app’s own reader and by the AI (Claude) — before anything from it is used. When every check passes and the AI agrees, it is used at once. Otherwise this window opens and you decide.",
      before: async (h) => { await page(h, GARDENS); },
      steps: [
        { title: "The review window", text: "A made-up T12 added with “Detect automatically”. Every check of the reader passes, but the AI reads two rows differently — so it waits for you. Nothing is saved or used until you click Save.",
          go: async (h) => { await add(h, await h.xlsx(GRID, "Sample Gardens T12 (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-t12rv-save]"), 60000); await h.wait(500); },
          shot: RV,
          marks: [
            { sel: "[data-t12rv] h3", label: "Review the T12 reading — …", text: "The property it is for." },
            { sel: "[data-t12rv] h3 + p", label: "The file and sheet", text: "Rows and columns are numbered as Excel numbers them, so you can find each one in the file." },
            { sel: "[data-t12rv-status]", label: "The verdict", text: "How many of the reader’s checks fail (or “every check passes”), and whether the AI agrees." },
            { sel: "[data-t12rv-x]", label: "×", text: "Closes the window without saving — like Keep it waiting." },
            { sel: "[data-t12rv-sum]", label: "Income · Expenses · NOI", text: "The accounts added up, against the totals the statement prints: ✓ when they match, ✗ in red when they don’t." },
            { sel: "[data-t12rv-issues]", label: "What to look at", text: "Every failed check (red) and every point where the AI reads it differently (amber), with its row." },
            { sel: "[data-t12rv-scroll]", label: "The rows", text: "Every row of the file and what the reader made of it (next steps)." },
            { sel: "[data-t12rv-wait]", label: "Keep it waiting", text: "Closes the window. The T12 waits — unused — in Documents, Underwriting and Data Health." },
            { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves the reading with your changes; its figures are used everywhere." }
          ] },
        { title: "How each row was read", text: "One line per row of the file. The file’s own name column comes first, then what the reader made of the row; the months and the total, as in the file, are further right (scroll the table sideways).",
          go: async (h) => { await h.js(() => { const sc = document.querySelector("[data-t12rv-scroll]"); const r = sc.querySelector('[data-t12rv-row="8"]'); sc.scrollTop = r.offsetTop - 40; }); await h.wait(300); },
          shot: "[data-t12rv-scroll]",
          marks: [
            { sel: "[data-t12rv-scroll] th >> nth=0", label: "Row", text: "The row number in Excel." },
            { sel: '[data-t12rv-row="8"] select[data-t12rv-role]', label: "What the reader made of it", text: "Account, Category name, Total, Income total, Expense total, Net Operating Income, Not operating — or Above the header, Header row, Empty." },
            { sel: '[data-t12rv-row="8"] select[data-t12rv-side]', label: "Side", text: "Income or Expense (accounts only)." },
            { sel: '[data-t12rv-row="8"] td:nth-child(5)', label: "Category (in the file)", text: "The category the account sits under in the file itself." },
            { sel: '[data-t12rv-row="8"] select[data-t12rv-cat]', label: "Underwriting line", text: "The line of the Underwriting table it adds to (with the item it is, e.g. “the vacancy”, under it)." },
            { sel: '[data-t12rv-row="8"] input[data-t12rv-amt]', label: "Amount used", text: "The amount the reader takes (grey). Type another to use yours — it then needs a note." },
            { sel: '[data-t12rv-row="8"] input[data-t12rv-note]', label: "Your note", text: "Why you changed this row." },
            { sel: '[data-t12rv-row="8"] >> text=its months', label: "Check", text: "✓ = its months add up to its total. A failed check is in red; the AI’s point in amber." }
          ] },
        { title: "Where the AI disagrees", text: "Click a row number in the list on top: the table jumps to that row, lit up. Here the AI puts “Utility Reimbursements” on the expense side; the reader has it as income. Decide which is right from the file — change the row, or leave it.",
          go: async (h) => { await h.click('[data-t12rv-issues] [data-t12rv-go="17"]', { wait: 300 }); },
          wait: 100,
          shot: RV,
          marks: [
            { sel: '[data-t12rv-issues] [data-t12rv-go="17"]', label: "Row 17", text: "Jumps to the row." },
            { sel: '[data-t12rv-row="17"]', label: "The row", text: "Amber: the AI reads it differently." },
            { sel: '[data-t12rv-row="17"] select[data-t12rv-side]', label: "Side", text: "Income here; the AI says Expense. Change it if the AI is right." },
            { sel: '[data-t12rv-row="17"] >> text=/^AI:/', label: "AI: …", text: "What the AI read." }
          ] },
        { title: "Change a row", text: "Change any list on a row and the window works out the checks again at once. Here Utility Reimbursements is moved from Other Income to its own underwriting line, Utility Reimbursements (RUBS). A row you changed is marked “yours”, and the footer counts your changes (“clear my changes” undoes them all).",
          go: async (h) => { await h.select('select[data-t12rv-cat="17"]', "RUBS"); await h.wait(400); await h.js(() => { const r = document.querySelector('[data-t12rv-row="17"]'); r.scrollIntoView({ block: "center" }); }); await h.wait(200); },
          shot: RV,
          marks: [
            { sel: '[data-t12rv-row="17"] select[data-t12rv-cat]', label: "Underwriting line", text: "Changed by you…" },
            { sel: '[data-t12rv-row="17"] >> text=yours', label: "yours", text: "…so it is marked as your decision." },
            { sel: "[data-t12rv-clear]", label: "1 change of yours · clear my changes", text: "How many changes you made; the link undoes them all." },
            { sel: "[data-t12rv-status]", label: "The verdict", text: "Worked out again with your change." }
          ] },
        { title: "A different amount needs a note", text: "Type an amount on a row to use it instead of the file’s: here the AI’s reading of Plumbing Repairs. The box turns green and the note box red — an amount that differs from the file can’t be saved without a note saying why.",
          go: async (h) => { await h.click("[data-t12rv-clear]", { wait: 300 }); await type(h, 'input[data-t12rv-amt="38"]', "19150"); await h.js(() => { document.querySelector('[data-t12rv-row="38"]').scrollIntoView({ block: "center" }); }); await h.wait(200); },
          shot: RV,
          marks: [
            { sel: 'input[data-t12rv-amt="38"]', label: "Amount used", text: "Your amount (green)." },
            { sel: 'input[data-t12rv-note="38"]', label: "why (needed)", text: "Red until you write why. Save says which row still needs a note." },
            { sel: '[data-t12rv-row="38"] >> text=/^AI:/', label: "AI: …", text: "The AI’s reading of this row (the total, and the month it reads differently)." },
            { sel: "[data-t12rv-status]", label: "The verdict", text: "With your amount the expenses no longer add up to the totals the statement prints, so those checks now fail." },
            { sel: "[data-t12rv-issues] li.text-rose-700", label: "A failed check", text: "Red: a total the statement prints that its rows no longer add up to (and by how much)." }
          ] },
        { title: "The note", text: "Write why in the note box and click elsewhere. The note is kept with the reading and in the property’s change history.",
          go: async (h) => { await type(h, 'input[data-t12rv-note="38"]', "Invoice checked: May was $600 higher (made-up)"); await h.js(() => { document.querySelector('[data-t12rv-row="38"]').scrollIntoView({ block: "center" }); }); await h.wait(200); },
          shot: RV,
          marks: [
            { sel: 'input[data-t12rv-note="38"]', label: "Your note", text: "Why the amount differs." },
            { sel: "[data-t12rv-clear]", label: "1 change of yours", text: "Your change, ready to save." },
            { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves it (next step)." }
          ] },
        { title: "Some checks still fail", text: "Save while a check fails and the app asks first. Saved anyway, your accounts are used as you set them (or, if you changed no figure, the statement’s printed totals, with the difference shown in Underwriting).",
          go: async (h) => { await h.click("[data-t12rv-save]", { wait: 600 }); await until(h, () => { const m = document.getElementById("confirmModal"); return !!m && !m.classList.contains("hidden"); }, 5000); },
          shot: "#confirmModal > div",
          marks: [
            { sel: "#confirmTitle", label: "Some checks still fail", text: "How many checks fail." },
            { sel: "#confirmText", label: "What is used", text: "Which figures are used if you save anyway." },
            { sel: "#confirmCancel", label: "Cancel", text: "Back to the window to fix the rows." },
            { sel: "#confirmOk", label: "Save anyway", text: "Saves the reading as it is; it is used everywhere." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 400 }); await h.click("[data-t12rv-clear]", { wait: 400 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "waiting", title: "Waiting for your review", intro: "“Keep it waiting” closes the window: the T12 is kept, but nothing from it is used until you review it.",
      steps: [
        { title: "In Documents", text: "The T12’s row says it is waiting, with a Review button that opens the same window.",
          go: async (h) => { await h.click("[data-t12rv-wait]", { wait: 900 }); await page(h, GARDENS); await until(h, () => !!document.querySelector("[data-doct12]")); },
          shot: DOCS,
          marks: [
            { sel: row("T12 (made-up)") + " .font-semibold", label: "The T12", text: "Saved in the folder…" },
            { sel: row("T12 (made-up)") + " [data-doct12]", label: "T12: Waiting for your review", text: "…but not used yet." },
            { sel: row("T12 (made-up)") + " [data-doct12] [data-t12open]", label: "Review", text: "Opens the review window." },
            { sel: row("T12 (made-up)") + " [data-doctype]", label: "Type: T12", text: "Detected as a T12." }
          ] },
        { title: "In Underwriting", text: "Underwriting shows it too, above the property’s figures, and Data Health lists it under “T12s that need your review”.",
          go: async (h) => { await h.newTab("underwriting"); await h.uwProperty(GARDENS); await h.top(); },
          shot: "#uwDrop >> xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' boxline ')][1]",
          marks: [
            { sel: "#opPropPick", label: "Property", text: "The property." },
            { sel: "[data-t12waiting]", label: "… is waiting for your review", text: "The file, why it waits, and that nothing from it is used yet." },
            { sel: "[data-t12waiting] [data-t12open]", label: "Review", text: "Opens the review window." }
          ] },
        { title: "Reviewed", text: "Open Review, look at the rows and click “Save this reading” (no change was needed here). The T12 is used at once: its NOI reaches the property page, Home, the debt sizing and the refinance.",
          go: async (h) => { await page(h, GARDENS); await h.click(row("T12 (made-up)") + " [data-t12open]", { wait: 1500 }); await until(h, () => !!document.querySelector("[data-t12rv-save]")); await h.click("[data-t12rv-save]", { wait: 2500 }); await h.closeModals(); await page(h, GARDENS); await until(h, () => { const e = document.querySelector("[data-doct12]"); return !!e && e.getAttribute("data-doct12") !== "waiting"; }, 20000); },
          shot: DOCS,
          marks: [
            { sel: row("T12 (made-up)") + " [data-doct12]", label: "T12: Reviewed by you", text: "In use. Other words you may see: “Checked by the reader and the AI” (both agreed), “Read by the reader only (Claude wasn’t connected)”, “Being read…”." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "change", title: "Change or remove a file", intro: "Every file’s type can be changed, and every file can be removed — always with a question first.",
      before: async (h) => { await page(h, GARDENS); },
      steps: [
        { title: "Change its type", text: "Pick another type in the row’s list. Making a file a T12 sends it through the T12 check; taking the T12 type away from the T12 in use rebuilds the property’s numbers from any other T12 on file.",
          go: openList(row("Loan agreement") + " [data-doctype]", 5),
          after: closeList(row("Loan agreement") + " [data-doctype]"),
          shot: DOCS,
          marks: [
            { sel: row("Loan agreement") + " [data-doctype] option >> nth=0", label: "Loan agreement", text: "Its type now." },
            { sel: row("Loan agreement") + " [data-doctype] option >> nth=1", label: "T12", text: "Read and checked as a T12." },
            { sel: row("Loan agreement") + " [data-doctype] option >> nth=2", label: "Rent roll", text: "Read as the rent roll." },
            { sel: row("Loan agreement") + " [data-doctype] option >> nth=3", label: "Unit Statistics", text: "A unit statistics report." },
            { sel: row("Loan agreement") + " [data-doctype] option >> nth=4", label: "Other", text: "Kept, used for no figure." }
          ] },
        { title: "Remove — the question", text: "Remove always asks. Removing the T12 in use says what goes with it: its NOI leaves Home, the DSCR and the refinance, and the numbers are rebuilt from any other T12 on file (otherwise the property has no NOI yet). The automatic backups keep a copy of every removed file (Settings → Backups).",
          go: async (h) => { await h.click(row("T12 (made-up)") + " [data-docdel]", { wait: 700 }); },
          shot: "#confirmModal > div",
          marks: [
            { sel: "#confirmTitle", label: "Remove “…”?", text: "The file." },
            { sel: "#confirmText", label: "What goes with it", text: "Deleted from the property’s folder; for the T12 in use, its NOI too." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps the file." },
            { sel: "#confirmOk", label: "Remove", text: "Deletes it and rebuilds the property’s numbers." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 400 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "parts", title: "One file, several properties", intro: "A workbook can hold several properties’ statements — one per sheet, or one after another. Added anywhere, it never goes anywhere by itself: you say which part is whose.",
      before: async (h) => { await page(h, GARDENS); },
      steps: [
        { title: "Which part is whose?", text: "Added on Sample Gardens’ page, a made-up workbook with three sheets. The app suggests a property for each part whose name matches one; check them, change anything, then approve.",
          go: async (h) => {
            const wb = await workbook(h, "Owner statements (made-up).xlsx", [{ n: "Gardens", g: t12("Sample Gardens (example)", 60000, 12000) }, { n: "Oaks", g: t12("Sample Oaks (example)", 40000, 9000) }, { n: "Maple", g: t12("Maple Court (made-up)", 30000, 7000) }]);
            await add(h, wb.file); await until(h, () => !!document.querySelector("[data-partsmodal]"));
          },
          shot: "[data-partscard]",
          marks: [
            { sel: "[data-partscard] h3 + p", label: "The file", text: "How many parts and sheets, and which parts are already set to this property." },
            { sel: '[data-partrow="1"] label', label: "Part 1", text: "Sheet 1 of 3 · its sheet name · the property name in it; what it is (T12) and its NOI." },
            { sel: '[data-partuse="1"]', label: "Ticked", text: "This part will be linked." },
            { sel: 'select[data-partsel="1"]', label: "This property", text: "Set to Sample Gardens: its name matches." },
            { sel: 'select[data-partsel="2"]', label: "Another property", text: "Part 2 names Sample Oaks — it goes to Sample Oaks’ folder." },
            { sel: '[data-partrow="3"]', label: "Not linked", text: "Maple Court is no property in the app: not ticked, “Don’t link”." },
            { sel: "[data-partscancel]", label: "Cancel", text: "Nothing is saved." },
            { sel: "[data-partsok]", label: "Approve", text: "Saves the file to each property with its own part." }
          ] },
        { title: "More choices", text: "Each list offers Don’t link, this property, every other property, and “Add as a new property” named after the part. “+ another property” adds a second list: the same part then goes to both (one agreement over two properties, say). Two parts given to one property are added together.",
          go: async (h) => {
            await h.click('[data-partsadd="2"]', { wait: 300 });
            await h.select('[data-partrow="3"] select[data-partsel]', "__new__");
          },
          shot: "[data-partscard]",
          marks: [
            { sel: '[data-partkeys="2"] select >> nth=1', label: "A second property", text: "Added by “+ another property” — pick the second property, or leave it empty." },
            { sel: '[data-partrow="3"] select[data-partsel]', label: "➕ Add as a new property “Maple Court”", text: "Creates that property and links this part to it." },
            { sel: '[data-partuse="3"]', label: "Ticked by itself", text: "Picking a property ticks the part." }
          ] },
        { title: "Each property, its own part", text: "Here part 3 is set back to “Don’t link” and the extra list emptied, then Approve. Each T12 part goes through the T12 check for its property. The file’s row says which part is this property’s, with Change to answer again.",
          go: async (h) => {
            await h.select('[data-partrow="3"] select[data-partsel]', ""); await h.js(() => { document.querySelector('[data-partuse="3"]').checked = false; const s = document.querySelectorAll('[data-partkeys="2"] select')[1]; if (s) s.value = ""; });
            await h.click("[data-partsok]", { wait: 1500 }); await keepWaiting(h, 40000);
            await page(h, GARDENS); await until(h, () => { const e = document.querySelector('[data-docpart]'); return !!e && /part/i.test(e.textContent); }, 15000);
          },
          shot: DOCS,
          marks: [
            { sel: row("Owner statements") + " [data-docpart]", label: "This property’s part: …", text: "Which sheet of the file is Sample Gardens’ — only its numbers are read for it." },
            { sel: row("Owner statements") + " [data-partsanswer]", label: "Change", text: "Opens the question again to give another answer." },
            { sel: row("Owner statements") + " [data-doct12]", label: "T12: …", text: "Its part went through the T12 check (here it waits for review, like any T12).", optional: true }
          ] },
        { title: "Waiting for your answer", text: "A file saved before the question was asked (or by the assistant) waits for an answer: none of its numbers are used for this property until you say which part is its own. Data Health lists every such file.",
          go: async (h) => { await page(h, PINES); await until(h, () => /which one/.test((document.querySelector("[data-docpart]") || {}).textContent || ""), 15000); },
          shot: DOCS,
          marks: [
            { sel: row("Owner statements 2") + " [data-docpart]", label: "It has 3 parts — which one is this property’s?", text: "Its numbers aren’t used until you say." },
            { sel: row("Owner statements 2") + " [data-partsanswer]", label: "Answer", text: "Opens the question (next step)." }
          ] },
        { title: "Answer", text: "When no part names this property, nothing is set for you: tick its part and pick this property, then Approve — or Cancel and answer later.",
          go: async (h) => { await h.click(row("Owner statements 2") + " [data-partsanswer]", { wait: 900 }); await until(h, () => !!document.querySelector("[data-partsmodal]")); },
          shot: "[data-partscard]",
          marks: [
            { sel: "[data-partscard] h3 + p b", label: "Which part is Sample Pines (example)’s?", text: "Pick it below — nothing is set for you." },
            { sel: 'select[data-partsel="1"]', label: "Property", text: "Pick “Sample Pines (example) (this property)” on the right part." },
            { sel: "[data-partscancel]", label: "Cancel", text: "The file keeps waiting." },
            { sel: "[data-partsok]", label: "Approve", text: "Links the part; its numbers are used from now on." }
          ],
          after: async (h) => { await h.click("[data-partscancel]", { wait: 400 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "sheet", title: "A T12 that names no property", intro: "A T12 added on a property’s page whose sheet doesn’t name that property: the app asks which sheet is its T12, or keeps the file as a plain document.",
      before: async (h) => { await page(h, PINES); },
      steps: [
        { title: "Which sheet is its T12?", text: "Pick the sheet that is this property’s T12 and click “Save it” (it then goes through the T12 check) — or pick “None — keep it as a document”.",
          go: async (h) => { await add(h, await h.xlsx(t12("Made-up Statement Co.", 45000, 9000), "Statement (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-whichsheet]")); await openList("[data-sheetsel]", 2)(h); },
          shot: "[data-whichsheet] > div",
          marks: [
            { sel: "[data-whichsheet] h3", label: "Which sheet is … ’s T12?", text: "The property you are on." },
            { sel: "[data-whichsheet] p", label: "Why it asks", text: "The file doesn’t name this property." },
            { sel: "[data-sheetsel] option >> nth=0", label: "A sheet", text: "Use this sheet as the property’s T12." },
            { sel: "[data-sheetsel] option >> nth=1", label: "None — keep it as a document", text: "Saved as an “Other” document; no figure is taken from it." },
            { sel: "[data-sheetok]", label: "Save it", text: "Saves the file with your answer." }
          ],
          after: async (h) => { await closeList("[data-sheetsel]")(h); await h.select("[data-sheetsel]", ""); await h.click("[data-sheetok]", { wait: 1500 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "scan", title: "Scanned PDFs", intro: "A PDF is read page by page. A page that is a picture (a scan) is read by OCR — the computer reads the letters from the picture — which may make mistakes, so the app always says which pages were read that way.",
      before: async (h) => { await page(h, PINES); },
      steps: [
        { title: "Reading…", text: "While a file is read, a small card at the bottom left shows its progress page by page. You can keep working. If the app is closed halfway, it goes on reading at the next start.",
          go: async (h) => { await add(h, path.join(h.ctx.UDATA, "Inspection report (made-up scan).pdf")); await until(h, () => /scanned page/.test((document.querySelector("[data-readnote]") || {}).textContent || ""), 20000); },
          wait: 50,
          shot: "view",
          marks: [
            { sel: "[data-readrow]", label: "The reading card", text: "One card per file being read." },
            { sel: "[data-readrow] .font-semibold", label: "The file", text: "Its name." },
            { sel: "[data-readnote]", label: "reading scanned page 2 of 2", text: "Which page it is on; “scanned page” = read by OCR." },
            { sel: "[data-readstop]", label: "Stop", text: "Stops after this page. Nothing is saved; add the file again to go on where it stopped (pages already read are kept)." }
          ] },
        { title: "Read", text: "Once read, the file is saved and its row says how it was read. A PDF also gets “Pages & properties”.",
          go: async (h) => { await until(h, () => !document.querySelector("[data-readrow]"), 60000); await page(h, PINES); await until(h, () => !!document.querySelector("[data-docread]")); },
          shot: DOCS,
          marks: [
            { sel: row("Inspection report") + " [data-docread]", label: "2 pages · page 2 read by OCR — may contain errors", text: "How it was read: pages read by OCR (amber), and any page that couldn’t be read." },
            { sel: row("Inspection report") + " [data-pdfparts]", label: "Pages & properties", text: "Split the PDF by pages, or link it to several properties (next step)." }
          ] },
        { title: "Pages & properties", text: "One PDF can hold several agreements (split it into parts by pages), or one agreement can cover several properties (give the part to each). Each property reads only its own pages.",
          go: async (h) => { await h.click(row("Inspection report") + " [data-pdfparts]", { wait: 1200 }); await until(h, () => !!document.querySelector("[data-pdfmodal]")); },
          shot: "[data-pdfmodal] > div",
          marks: [
            { sel: "[data-pdfmodal] h3", label: "Which pages belong to which property?", text: "The file and how many pages." },
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
    // ------------------------------------------------------------------------------------------------------------------
    { id: "offline", title: "When Claude isn’t connected", intro: "Without Claude the AI can’t read the T12, so it can’t be checked against the reader. The app asks what to do.",
      before: async (h) => {
        // Claude signed out (the stand-in's sign-in mark taken away); the app looks again after a minute
        try { fs.unlinkSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker")); } catch (e) {}
        await h.wait(62000);
        await page(h, PINES);
      },
      steps: [
        { title: "Claude isn’t connected", text: "A made-up T12 added while Claude is signed out. Nothing from it is used yet.",
          go: async (h) => { await add(h, await h.xlsx(t12("Sample Pines (example)", 45000, 9000), "Sample Pines T12 (made-up).xlsx")); await until(h, () => !!document.querySelector("[data-t12nc]"), 40000); },
          shot: "[data-t12nc] > div",
          marks: [
            { sel: "[data-t12nc] h3", label: "Claude isn’t connected", text: "(“The AI couldn’t read this T12” when Claude is connected but its reading failed.)" },
            { sel: "[data-t12nc] p >> nth=0", label: "The file", text: "Which property and file, and that it hasn’t been checked." },
            { sel: "[data-t12nc] p >> nth=1", label: "The reader’s checks", text: "Whether the app’s own reader passes every check." },
            { sel: "[data-t12nc-wait]", label: "Keep it waiting", text: "Kept, unused, until you review it (or Claude is back and you read it again)." },
            { sel: "[data-t12nc-use]", label: "Use the reader’s reading", text: "Only when every check passes: used as the reader read it." },
            { sel: "[data-t12nc-review]", label: "Review it myself", text: "Opens the review window." }
          ] },
        { title: "Used as the reader read it", text: "After “Use the reader’s reading” the T12 is in use, and its row says it was read by the reader only.",
          go: async (h) => { await h.click("[data-t12nc-use]", { wait: 2500 }); await keepWaiting(h, 4000); await page(h, PINES); await until(h, () => [...document.querySelectorAll("[data-docrow]")].some(r => /Sample Pines T12/.test(r.textContent) && r.querySelector("[data-doct12]")), 15000); },
          shot: DOCS,
          marks: [
            { sel: row("Sample Pines T12") + " [data-doct12]", label: "T12: Read by the reader only (Claude wasn’t connected)", text: "In use without the AI’s check. Reading it again once Claude is connected (Underwriting → Read again) checks it with the AI." }
          ],
          after: async (h) => { try { fs.writeFileSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker"), "ok"); } catch (e) {} } }
      ] }
  ]
};
