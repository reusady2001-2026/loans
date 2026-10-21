/* Guide chapter: Data Health — what the app knows about each property and what is missing or needs a look: T12s
   waiting for your review, files with several parts waiting for an answer, files without a property, possible
   duplicate properties, loans needing a maturity decision, and the table of every property.
   The pictures use the app's built-in sample loans plus made-up properties and files: "Sample Gardens (example)" with
   a made-up T12 the stand-in Claude disagrees with (LDS_FAKE_T12=disagree), "Sample Oaks (example)" with a made-up
   three-property workbook, a made-up "Queens Gate" entered twice, and a made-up folder left without a property. */
"use strict";
const path = require("path");
const GRID = require(path.join(__dirname, "..", "..", "test", "fixtures", "proforma-t12.js")).grid();
const GARDENS = "name:sample gardens (example)", OAKS = "name:sample oaks (example)", ORPHAN = "name:riverside lofts (made-up)";
const M = ["Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026"];
const rowOf = (l, v) => [l].concat(Array(12).fill(v), [v * 12]);
const t12 = (top, rent, tax) => [[top], ["12 Month Statement"], ["Account"].concat(M, ["Total"]), ["INCOME"], rowOf("Gross Potential Rent", rent), rowOf("TOTAL INCOME", rent), ["EXPENSES"], rowOf("Real Estate Taxes", tax), rowOf("TOTAL EXPENSES", tax), rowOf("NET OPERATING INCOME", rent - tax)];
const card = (sel) => sel + " >> xpath=ancestor-or-self::div[contains(@class,'rounded-2xl')][1]";
const kpi = (label) => '#healthView p:text-is("' + label + '") >> xpath=ancestor::div[contains(@class,\'rounded-2xl\')][1]';

// a property by name, through Add Property's own checks ("Similar to …" → Create anyway)
const addProp = async (h, name) => {
  await h.js((n) => window.LDS_addProperty(n), name); await h.wait(700);
  if (await h.js(() => { const m = document.getElementById("confirmModal"); const a = document.getElementById("confirmAlt"); return !!m && !m.classList.contains("hidden") && !!a && !a.hidden; })) await h.click("#confirmAlt", { wait: 900 });
  await h.closeModals();
};
// a sample loan's status set by hand: its row's edit button, Loan Status, Save
const setStatus = async (h, re, status) => {
  const id = await h.openLoan(re);
  await h.js((i) => { const b = document.querySelector('[data-loanedit="' + i + '"]'); if (b) b.click(); }, id); await h.wait(900);
  await h.select("#f_loanStatus", status); await h.click("#saveBtn", { wait: 1500 });
};
const until = async (h, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)){ if (await h.js(fn)) return true; await h.wait(300); } return false; };
const openHealth = async (h) => {
  await h.newTab("health");
  await until(h, () => !!document.querySelector("[data-health-recompute]") && !!document.querySelector("[data-health-parts]"), 40000);
  await h.wait(600); await h.calm();
};

module.exports = {
  id: "health",
  title: "Data Health",
  intro: "One page with what the app knows about every property — and what is missing or needs your look: T12s waiting for review, files waiting for an answer, files without a property, possible duplicates and loans needing a maturity decision.",
  env: () => ({ LDS_FAKE_T12: "disagree" }),
  setup: async (h) => {
    h.acceptDialogs = [];
    await setStatus(h, /K2 Sweetwater \(FIU/, "Extension undecided");
    await setStatus(h, /^Avalon White Plains$/, "Matured");
    await h.home();
    await addProp(h, "Sample Gardens (example)");
    await addProp(h, "Sample Oaks (example)");
    await addProp(h, "Queens Gate");
    // a made-up T12 the AI disagrees with, left waiting for review
    await h.home(); await h.js((k) => window.LDS_openProfile(k), GARDENS); await h.wait(1500);
    const f = await h.xlsx(GRID, "Sample Gardens T12 (made-up).xlsx");
    await h.page.setInputFiles("#loanDocsFile", f);
    await until(h, () => !!document.querySelector("[data-t12rv-wait]"), 60000);
    await h.click("[data-t12rv-wait]", { wait: 800 });
    // a made-up workbook with three properties' T12s, saved to Sample Oaks before anyone said which part is its own
    const b64 = await h.js((sheets) => { const wb = XLSX.utils.book_new(); sheets.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.g), s.n)); return XLSX.write(wb, { type: "base64", bookType: "xlsx" }); },
      [{ n: "Elm Court", g: t12("Elm Court (made-up)", 60000, 12000) }, { n: "Birch Row", g: t12("Birch Row (made-up)", 40000, 9000) }, { n: "Cedar Walk", g: t12("Cedar Walk (made-up)", 30000, 7000) }]);
    await h.js((a) => window.ldsShell.docSave({ propKey: a.k, propName: "Sample Oaks (example)", name: "Owner statements (made-up).xlsx", base64: a.b, text: "", type: "", role: "t12" }), { k: OAKS, b: b64 });
    // a made-up folder left behind by a rename: files that belong to no property
    await h.js((a) => window.ldsShell.docSave({ propKey: a.k, propName: "Riverside Lofts (made-up)", name: "Rent roll (made-up).csv", base64: a.b, text: "Unit,Rent\n101,1500\n102,1550\n", type: "text/csv", role: "other" }),
      { k: ORPHAN, b: Buffer.from("Unit,Rent\n101,1500\n102,1550\n").toString("base64") });
    await h.home();
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "open", title: "Open Data Health", intro: "Data Health opens in its own tab, from the “+” at the end of the tab strip.",
      steps: [
        { title: "The “+” menu", text: "Click the “+” at the end of the tab strip, then “Data Health”.",
          go: async (h) => { await h.home(); await h.top(); await h.click("#tabNewBtn", { wait: 400 }); },
          shot: "view",
          marks: [
            { sel: "#tabNewBtn", label: "+", text: "Opens this menu: a tool in a tab of its own." },
            { sel: '[data-tabopen="health"]', label: "Data Health", text: "Opens Data Health (this chapter). It reads every property’s files first — a moment with a big book." }
          ] },
        { title: "The Data Health tab", text: "On top, what needs you: the T12s waiting for review, files waiting for an answer and files without a property (each list only when it has something in it, or a green line when it is clear). Then four numbers, whether every property has its folder, possible duplicates, maturity decisions — and the table of every property at the bottom.", cover: true,
          go: async (h) => { await h.click('[data-tabopen="health"]', { wait: 400 }); await openHealth(h); await h.top(); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel^="health"]', label: "Data Health", text: "This tab. Pop it out or close it like any tab." },
            { sel: "#healthView h2", label: "Data Health", text: "The app version that is running is named under the title." },
            { sel: "[data-health-recompute]", label: "Recompute all figures", text: "Works out every property’s figures again from its files (topic “Recompute”)." },
            { sel: "#healthView >> text=/Last recompute|No recompute run yet/", label: "Last recompute", text: "When the figures were last worked out, for how many properties, and why (by hand, after an update…)." },
            { sel: "[data-health-t12]", label: "T12s that need your review", text: "T12s waiting for you before they are used (topic “T12s waiting for your review”)." },
            { sel: "[data-health-parts]", label: "Files with several parts", text: "Workbooks waiting for you to say which part is whose (topic “Files with several parts”)." },
            { sel: "[data-orphans]", label: "Files without a property", text: "Folders no property uses any more (topic “Files without a property”)." },
            { sel: kpi("Properties"), label: "Properties", text: "How many properties, and how many active loans." },
            { sel: kpi("With a T12"), label: "With a T12", text: "How many have a T12 in use; the rest are “missing”." },
            { sel: kpi("Units known"), label: "Units known", text: "How many have their number of units set in the profile; the rest are blank." },
            { sel: kpi("Need a maturity decision"), label: "Need a maturity decision", text: "Loans that matured or whose extension is undecided (topic “Maturity decisions”)." },
            { sel: "[data-health-folders]", label: "Properties without a folder", text: "Always 0: every property has its folder with its profile and general data. Anything else names the property the app couldn’t make a folder for." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "t12", title: "T12s waiting for your review", intro: "A T12 is read twice — by the app’s reader and by the AI — before it is used. When a check fails or the AI reads it differently, it waits here and nothing from it is used until you decide.",
      before: async (h) => { await openHealth(h); },
      steps: [
        { title: "The list", text: "Every T12 that waits for you, with the property, the file and why. Green and “0” when there is nothing to review. (A T12 read by an older version that passes every check but hasn’t been read by the AI yet is counted on a grey line under the list — it is checked as soon as Claude is connected.)",
          go: async (h) => { await h.scroll("[data-health-t12]"); },
          shot: "[data-health-t12]", pad: 8,
          marks: [
            { sel: "[data-health-t12] .font-semibold", label: "T12s that need your review", text: "How many wait for you." },
            { sel: "[data-health-t12row]", label: "A T12 waiting", text: "The property · the file — why it waits (here: the AI disagrees on 2 points). Its numbers are not used yet." },
            { sel: "[data-health-t12row] [data-t12open]", label: "Review", text: "Opens the reading, row by row, to decide (next step)." },
            { sel: "[data-health-t12recheck]", label: "Re-check every T12 now", text: "Reads every saved T12 again with the reader and the AI. It shows “Re-checking… 1 of 5” while it works; a T12 that now fails or disagrees is listed here." }
          ] },
        { title: "Review", text: "Review opens the T12 reading: every row of the file and what the reader made of it, the checks, and where the AI disagrees. Change what is wrong (with a note) and click “Save this reading”, or “Keep it waiting”. The Documents & files chapter shows this window in full.",
          go: async (h) => { await h.click("[data-health-t12row] [data-t12open]", { wait: 1500 }); await until(h, () => !!document.querySelector("[data-t12rv-save]")); },
          shot: "[data-t12rv] > div",
          marks: [
            { sel: "[data-t12rv-status]", label: "The verdict", text: "Whether every check passes, and whether the AI agrees with the reader." },
            { sel: "[data-t12rv-x]", label: "×", text: "Closes the window, like Keep it waiting." },
            { sel: "[data-t12rv-sum]", label: "Income, Expenses, NOI", text: "The accounts added up, against the totals the statement prints (✓ when they match)." },
            { sel: "[data-t12rv-issues]", label: "What to look at", text: "Each failed check and each point the AI reads differently, with its Excel row — click the row number to jump to it." },
            { sel: "[data-t12rv-scroll]", label: "The rows", text: "The file’s own rows, what the reader made of each, and the amounts; you can change any of them." },
            { sel: "[data-t12rv-wait]", label: "Keep it waiting", text: "Closes the window; the T12 stays on this list, unused." },
            { sel: "[data-t12rv-save]", label: "Save this reading", text: "Saves the reading as it is now; the T12 is used and leaves this list." }
          ],
          after: async (h) => { await h.click("[data-t12rv-wait]", { wait: 600 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "parts", title: "Files with several parts", intro: "A workbook can hold several properties’ statements (one per sheet, or one after another). The app never guesses which part is a property’s own: until you answer, that file’s numbers aren’t used for it.",
      before: async (h) => { await openHealth(h); },
      steps: [
        { title: "Waiting for your answer", text: "Every file with several parts whose part for a property isn’t answered yet. (A file filed before this was asked, matched by its name only, is listed under “Matched by name only — confirm once” with a Confirm button.)",
          go: async (h) => { await h.scroll("[data-health-parts]"); },
          shot: "[data-health-parts]",
          marks: [
            { sel: "[data-health-parts] .font-semibold", label: "Files with several parts waiting", text: "How many files wait for an answer." },
            { sel: "[data-health-partrow]", label: "A file waiting", text: "The property · the file (how many parts) — its numbers aren’t used until you say which part is its own." },
            { sel: "[data-health-partrow] [data-partsanswer]", label: "Answer", text: "Opens the question (next step)." }
          ] },
        { title: "Which part is whose?", text: "Each part of the file is a line: tick it and pick the property it belongs to. A part can go to any property, several parts to one property (they are added together), or one part to several. Nothing is saved until you approve.",
          go: async (h) => { await h.click("[data-health-partrow] [data-partsanswer]", { wait: 1000 }); await until(h, () => !!document.querySelector("[data-partsmodal]")); },
          shot: "[data-partscard]",
          marks: [
            { sel: "[data-partscard] h3", label: "Which part of this file belongs to which property?", text: "The file, how many parts and sheets — and the property it is asked for." },
            { sel: "[data-partrow] label", label: "A part", text: "Its sheet and name, what it is (T12, rent roll or sheet) and its NOI. Tick it to link it." },
            { sel: "[data-partuse]", label: "Tick box", text: "On = this part is linked to the property chosen below it." },
            { sel: "select[data-partsel]", label: "Property", text: "Don’t link, this property, any other property — or “Add as a new property” named after the part." },
            { sel: "[data-partsadd]", label: "+ another property", text: "Adds a second property list: the same part goes to both." },
            { sel: "[data-partscancel]", label: "Cancel", text: "Closes without saving; the file keeps waiting." },
            { sel: "[data-partsok]", label: "Approve", text: "Links each ticked part to its property. Each property reads only its own parts — never another’s numbers." }
          ] },
        { title: "A ticked part needs a property", text: "Tick a part without picking its property and click Approve: a red line says which part still needs one. Pick the property, or untick the part.",
          go: async (h) => { await h.js(() => { const c = document.querySelector('[data-partuse="1"]'); c.checked = true; const s = document.querySelector('select[data-partsel="1"]'); s.value = ""; }); await h.click("[data-partsok]", { wait: 500 }); },
          shot: "[data-partscard]",
          marks: [
            { sel: '[data-partuse="1"]', label: "Ticked", text: "This part is ticked…" },
            { sel: 'select[data-partsel="1"]', label: "…but no property", text: "…and its property is still “Don’t link”." },
            { sel: "[data-partserr]", label: "Pick a property for part 1 — or untick it.", text: "What is missing. Nothing was saved." }
          ] },
        { title: "Answered", text: "Here part 2 is Sample Oaks’ own: pick it for part 2, untick the others, and Approve. The file leaves the list, and its part goes through the T12 check like any new T12 (it may then wait under “T12s that need your review”).",
          go: async (h) => {
            await h.js(() => { document.querySelectorAll("[data-partuse]").forEach(c => { c.checked = false; }); document.querySelectorAll("select[data-partsel]").forEach(s => { s.value = ""; }); });
            await h.select('select[data-partsel="2"]', "name:sample oaks (example)"); await h.js(() => { document.querySelector('[data-partuse="2"]').checked = true; });
            await h.click("[data-partsok]", { wait: 2500 });
            if (await until(h, () => !!document.querySelector("[data-t12rv-wait]"), 30000)) await h.click("[data-t12rv-wait]", { wait: 600 });
            await openHealth(h); await h.js(() => { document.querySelector("[data-health-t12]").scrollIntoView({ block: "start" }); window.scrollBy(0, -56); }); await h.wait(250);
          },
          shot: "view",
          marks: [
            { sel: "[data-health-parts]", label: "Files with several parts waiting: 0", text: "Green: every file’s part is answered." },
            { sel: '[data-health-t12row]:has-text("Sample Oaks")', label: "Its part, read", text: "Sample Oaks’ part went through the T12 check; here the AI read it differently, so it waits for review like any T12.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "orphans", title: "Files without a property", intro: "A folder of files that no property uses any more (left behind by a rename in an older version). The list shows only when there is one.",
      before: async (h) => { await openHealth(h); },
      steps: [
        { title: "The list", text: "Each folder: the name it was saved under and its files. Attach them to the property they belong to, or delete them.",
          go: async (h) => { await h.scroll("[data-orphans]"); },
          shot: "[data-orphans]",
          marks: [
            { sel: "[data-orphans] h3", label: "Files without a property", text: "How many folders belong to no property." },
            { sel: "[data-orphan] .font-semibold", label: "The old name", text: "The property name the files were saved under." },
            { sel: "[data-orphan] .text-slate-500", label: "Its files", text: "How many, and the first few names." },
            { sel: "[data-orphanto]", label: "attach to", text: "The property to move them to." },
            { sel: "[data-orphanattach]", label: "Attach", text: "Moves the files into that property’s folder (asks first)." },
            { sel: "[data-orphandel]", label: "Delete", text: "Deletes the files (asks first)." }
          ] },
        { title: "Attach — the question", text: "Attach asks first. The files move into the chosen property’s folder; a file with the same name there is kept as a copy, never replaced.",
          go: async (h) => { await h.select("[data-orphanto]", "name:sample oaks (example)"); await h.click("[data-orphanattach]", { wait: 500 }); },
          shot: "#confirmModal > div",
          marks: [
            { sel: "#confirmTitle", label: "Attach these files to …?", text: "The property you picked." },
            { sel: "#confirmText", label: "What happens", text: "Where the files go." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing is moved." },
            { sel: "#confirmOk", label: "Attach", text: "Moves them; the list is drawn again without that folder." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 400 }); } },
        { title: "Delete — the question", text: "Delete asks first too. The files belong to no property, so deleting them changes no figure; the automatic backups still keep a copy.",
          go: async (h) => { await h.click("[data-orphandel]", { wait: 500 }); },
          shot: "#confirmModal > div",
          marks: [
            { sel: "#confirmTitle", label: "Delete the files of …?", text: "The old name." },
            { sel: "#confirmText", label: "What happens", text: "It can’t be undone here; the automatic backups keep a copy." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing is deleted." },
            { sel: "#confirmOk", label: "Delete", text: "Deletes the folder; the list is drawn again." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 400 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "duplicates", title: "Possible duplicate properties", intro: "Two properties that may be one building entered twice: the same street address and city — or, when one has no address, nearly the same name (ignoring capitals, punctuation and words like “The” or “Apartments”). They are never merged by themselves.",
      before: async (h) => { await openHealth(h); },
      steps: [
        { title: "The list", text: "Each pair and why it is listed. If two names are one building, rename one to match so they become one property; if not, click “Not a duplicate”.",
          go: async (h) => { await h.scroll(card("#healthView >> text=Possible duplicate properties")); },
          shot: card("#healthView >> text=Possible duplicate properties"),
          marks: [
            { sel: "#healthView >> text=Possible duplicate properties", label: "Possible duplicate properties", text: "How many pairs." },
            { sel: "[data-duprow] span", label: "The pair", text: "The two property names." },
            { sel: "[data-duprow] .text-amber-600", label: "Why", text: "Same street address and city, or similar names when one or both have no address." },
            { sel: "[data-notdup]", label: "Not a duplicate", text: "Remembers that these two are different buildings: the pair is not shown again (here or in Settings)." }
          ] },
        { title: "Not a duplicate", text: "After “Not a duplicate” the pair is gone. With no pair left, a green line says how many distinct properties and loans there are.",
          go: async (h) => { await h.click("[data-notdup]", { wait: 1500 }); await openHealth(h); await h.scroll("#healthView >> text=No duplicate properties detected", 0, "center"); },
          shot: "view",
          marks: [
            { sel: "#healthView >> text=No duplicate properties detected", label: "No duplicate properties detected", text: "Every property is distinct (the pairs you marked are left out)." },
            { sel: kpi("Properties"), label: "Properties", text: "Both stay as two properties — nothing was merged.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "decisions", title: "Maturity decisions", intro: "Loans that matured, or whose extension is undecided — set in the loan’s edit form (Loan Status), or “Matured” by itself once the maturity date has passed.",
      before: async (h) => { await openHealth(h); },
      steps: [
        { title: "Loans needing a maturity decision", text: "A red list of each such loan with its status. It goes when you change the loan’s status (Extended, Paid off…). The Maturity & Reset Calendar shows the same loans on top.",
          go: async (h) => { await h.scroll(card("#healthView >> text=Loans needing a maturity decision")); },
          shot: card("#healthView >> text=Loans needing a maturity decision"),
          marks: [
            { sel: "#healthView >> text=Loans needing a maturity decision", label: "Loans needing a maturity decision", text: "How many." },
            { sel: card("#healthView >> text=Loans needing a maturity decision") + " >> text=Extension undecided", label: "Extension undecided", text: "An extension is being discussed and not settled." },
            { sel: card("#healthView >> text=Loans needing a maturity decision") + " >> text=Matured", label: "Matured", text: "Past (or marked at) its maturity, not extended or paid off yet." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "table", title: "Every property", intro: "The table at the bottom: one row per property with its T12, units, NOI, when its figures were worked out and its warnings. Properties missing a T12 or units come first.",
      before: async (h) => { await openHealth(h); },
      steps: [
        { title: "The columns", text: "Read across a row to see what the app knows about that property.",
          go: async (h) => { await h.into(h.page.locator("#healthView >> text=Every property").first()); },
          shot: "view",
          marks: [
            { sel: "#healthView th >> text=Property", label: "Property", text: "Its name (how many loans if more than one) and whether its profile is complete — or what it still needs." },
            { sel: "#healthView th >> text=Status", label: "Status", text: "Worked out from its data: Stabilized, No T12 yet, No loan data yet or Third-party managed." },
            { sel: "#healthView th >> text=T12 / NOI basis", label: "T12 / NOI basis", text: "How the NOI is taken from the T12 (12-month total, last 3 months × 4…) and how many months of history." },
            { sel: "#healthView th >> text=Units", label: "Units", text: "From the property’s profile." },
            { sel: "#healthView th >> text=In-place NOI", label: "In-place NOI", text: "The NOI the app uses for it." },
            { sel: "#healthView th >> text=Computed", label: "Computed", text: "When its figures were last worked out, and by which app version (red when an older version)." },
            { sel: "#healthView th >> text=Warnings", label: "Warnings", text: "no T12, units unknown, NOI ≤ 0, loan matured, extension undecided, figures from an older version — or “ok”." },
            { sel: "[data-health-open]", label: "Open", text: "Opens Underwriting for that property." }
          ] },
        { title: "Warnings on a row", text: "A row with a maturity decision pending, another whose loan has matured, and a made-up property with no loan yet. A property whose figures were worked out by an older version of the app shows “figures from v…” and a red version under Computed — Recompute (last topic) fixes that.",
          go: async (h) => { await h.scroll('#healthView tr:has-text("K2 Sweetwater")', 0, "center"); },
          shot: "view",
          marks: [
            { sel: '#healthView tr:has-text("K2 Sweetwater") >> text="extension undecided"', label: "extension undecided", text: "One of its loans waits for a maturity decision." },
            { sel: '#healthView tr:has-text("K2 Sweetwater") >> text="no T12"', label: "no T12", text: "No T12 in use yet: add one in its Documents or in Underwriting." },
            { sel: '#healthView tr:has-text("K2 Sweetwater") >> text="units unknown"', label: "units unknown", text: "Its number of units isn’t set in its profile." },
            { sel: '#healthView tr:has-text("K2 Sweetwater") td:nth-child(5)', label: "In-place NOI —", text: "No NOI yet: it comes from the T12." },
            { sel: '#healthView tr:has-text("Avalon White Plains") >> text="loan matured"', label: "loan matured", text: "A loan of this property has matured.", optional: true },
            { sel: '#healthView tr:has-text("Queens Gate"):not(:has-text("Apartments")) >> text=/No loan data yet/i', label: "No loan data yet", text: "A property with no loan (here the made-up “Queens Gate”).", optional: true },
            { sel: '#healthView tr:has-text("K2 Sweetwater") >> text=/Profile (complete|incomplete)/', label: "Profile", text: "“Profile complete”, or what its profile still needs (address, units…).", optional: true },
            { sel: '#healthView tr:has-text("K2 Sweetwater") [data-health-open]', label: "Open", text: "Opens Underwriting for this property." }
          ] },
        { title: "Open", text: "Open takes you to Underwriting with that property picked, ready for its T12 and figures.",
          go: async (h) => { await h.click('#healthView tr:has-text("Sample Gardens") [data-health-open]', { wait: 2000 }); await h.calm(); await h.top(); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel^="underwriting"]', label: "Underwriting", text: "Opened (or brought forward) by Open." },
            { sel: "#opPropPick", label: "Property", text: "The property whose Open you clicked." },
            { sel: "[data-t12waiting]", label: "Waiting for your review", text: "Its T12 still waits — Review opens the same window as in Data Health.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "recompute", title: "Recompute", intro: "Every figure from a T12 is kept with the property and worked out again when the app is updated. Recompute does it now, by hand.",
      before: async (h) => { await openHealth(h); await h.top(); },
      steps: [
        { title: "Recompute all figures", text: "Click it: the button reads “Recomputing…” while every property’s figures are worked out again from its saved files, then the page is drawn again and the line under the button says when, how many and “manual”. Use it after changing files outside the app, or when the Computed column shows an older version.",
          go: async (h) => { await h.click("[data-health-recompute]", { wait: 600 }); await openHealth(h); await h.top(); },
          shot: "view",
          marks: [
            { sel: "[data-health-recompute]", label: "Recompute all figures", text: "Works everything out again." },
            { sel: "#healthView >> text=/Last recompute/", label: "Last recompute … · manual", text: "When, how many of the properties, and the reason (manual = this button)." }
          ] }
      ] }
  ]
};
