/* Guide chapter: Properties — the Specific Property view and its list, a property’s page, the Property Profile,
   Add Property and its checks, a property with no loan, the rent roll, renaming, and Archive / Un-archive / Delete.
   Looking only: the app’s built-in sample properties (Queens Gate, Avalon White Plains). Everything that is added,
   changed, archived or deleted is MADE-UP: “Birch Commons (example)”, “Old Mill (example)” and a made-up 12-unit
   rent roll written by this file. */
"use strict";
const path = require("path"), fs = require("fs");
const card = (sel) => sel + " >> xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' boxline ')][1]";
const PF = (k) => '[data-profilekey] label:has([data-pf="' + k + '"])';
const PFIN = (k) => '[data-profilekey] [data-pf="' + k + '"]';
const CONFIRM = "#confirmModal > div";
const ADDPROP = "#addPropModal > div";
const NAME = "Birch Commons (example)", NEWNAME = "Birch Commons East (example)";

const quiet = async (h) => { await h.js(() => { if (!document.getElementById("guidePropQuiet")){ const s = document.createElement("style"); s.id = "guidePropQuiet"; s.textContent = "#scrollProgress{display:none!important}"; document.head.appendChild(s); } }); };
const keyOf = (h, name) => h.js((n) => window.propertyKey({ propertyName: n, propertyAddress: "" }), name);
// Specific Property, then a property from its list (by the name the list shows)
const pick = async (h, name) => {
  await h.home();
  await h.js(() => { document.getElementById("scopeLoanBtn").click(); }); await h.wait(400);
  await h.js((nm) => { const s = document.getElementById("loanSelect"); const o = [...s.options].find(x => x.text.split("·")[0].trim() === nm); if (!o) throw new Error("no property " + nm); s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); }, name);
  await h.wait(1000); await h.calm(); await h.top();
};
const addProp = async (h, name) => {
  await h.home(); await h.js(() => { document.getElementById("scopeLoanBtn").click(); }); await h.wait(400);
  await h.click("#addPropBtn", { wait: 400 });
  await h.fill("#addPropName", name, { change: false });
  await h.click("#addPropCreate", { wait: 900 });
};
const pfSet = async (h, k, v) => { await h.fill(PFIN(k), v); await h.wait(500); };
// a made-up rent roll: 12 units, two of them vacant (a Yardi-style export, as CSV)
const rentRollCsv = () => {
  const units = [["101", "1BR", 720, 1450, 1425], ["102", "1BR", 720, 1450, 1450], ["103", "1BR", 720, 1450, 0], ["104", "2BR", 960, 1825, 1790],
    ["105", "2BR", 960, 1825, 1825], ["106", "2BR", 960, 1825, 1760], ["201", "1BR", 720, 1475, 1475], ["202", "1BR", 720, 1475, 1440],
    ["203", "2BR", 960, 1850, 0], ["204", "2BR", 960, 1850, 1850], ["205", "3BR", 1180, 2150, 2095], ["206", "3BR", 1180, 2150, 2150]];
  const lines = ["Rent Roll", "Unit,Unit Type,Unit,Resident,Name,Market,Actual", ",,Sq Ft,,,Rent,Rent", "Current/Notice/Vacant Residents"];
  let m = 0, a = 0;
  units.forEach((u, i) => { const vac = u[4] === 0; lines.push([u[0], u[1], u[2], vac ? "VACANT" : "t" + (1001 + i), vac ? "VACANT" : "Resident " + String.fromCharCode(65 + i), u[3], u[4]].join(",")); m += u[3]; a += u[4]; });
  lines.push(",,,Total," + NAME + "," + m + "," + a);
  return lines.join("\n") + "\n";
};

const SPEC = {
  id: "property",
  title: "Properties",
  intro: "Pick a property, read and fill in its profile, add a property (and the checks that stop a duplicate), import its rent roll, rename it, and archive or delete it.",
  setup: async (h) => {
    await quiet(h);
    // a made-up property, archived — for the “already exists (archived)” check and Home’s Archived strip
    await h.js((n) => window.LDS_addProperty(n), "Old Mill (example)"); await h.wait(600);
    const k = await keyOf(h, "Old Mill (example)");
    await h.js((key) => window.LDS_archiveProperty(key, true), k); await h.wait(600);
    await h.closeModals(); await h.home();
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "pick", title: "Specific Property", intro: "One property at a time: its loans, its NOI, its profile, its rent roll and its documents.",
      steps: [
        { title: "The property list", text: "Click Specific Property at the top of Home, then pick a property in the list. Next to a name the list says “senior + mezz” (two loans), “in a pooled loan” or “no loan yet”.", cover: true,
          go: async (h) => { await pick(h, "Queens Gate Apartments"); },
          shot: "view",
          marks: [
            { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the overview of the whole book." },
            { sel: "#scopeLoanBtn", label: "Specific Property", text: "This view." },
            { sel: "#loanSelect", label: "Select a property", text: "Click it and pick a property; its page opens below." },
            { sel: "#addBtn", label: "Add Loan", text: "A new loan on this property (see “A loan’s page”)." },
            { sel: "#addPropBtn", label: "Add Property", text: "A new property, by its name (topic “Add a property”)." },
            { sel: "#editBtn", label: "Edit", text: "Opens this property’s profile (topic “The profile”)." },
            { sel: "#removeBtn", label: "Remove", text: "Archives this property and all its loans — it asks first. Un-archive it from Home’s Archived strip." },
            { sel: "#refiBtn", label: "Refi Calculator", text: "The refinance for this property." },
            { sel: "#kpiGrid", label: "The property’s page", text: "Starts here, under the bar (next step)." },
            { sel: '[data-tabsel="home"]', label: "Portfolio tab", text: "This tab. Tools open in tabs next to it, from the “+”." },
            { sel: "#tabNewBtn", label: "+", text: "Opens Underwriting, the Calendar or Data Health in a new tab." },
            { sel: "#dataDD > summary", label: "Data", text: "Back up, restore, and Excel export / import (see the Home chapter)." },
            { sel: "#fetchRateBtn", label: "Fetch live rate", text: "Gets today’s index values." },
            { sel: "#settingsDD > summary", label: "Settings", text: "See the Settings chapter." },
            { sel: "#loanCountLabel", label: "Properties", text: "How many properties are in the book (archived ones don’t count)." }
          ] },
        { title: "A property’s page", text: "A property with a loan opens on this page. From the top: the loan’s tiles and rate notice, the NOI box, the profile, the rent roll and the documents. Further down: the Loan Record and the schedule (chapter “A loan’s page”).",
          go: async (h) => { await pick(h, "Queens Gate Apartments"); await h.into(h.loc("#kpiGrid")); },
          shot: "view",
          marks: [
            { sel: "#kpiGrid", label: "Tiles", text: "The loan’s main figures." },
            { sel: "#floatBanner", label: "Rate notice", text: "How a floating or hybrid rate is set this month." },
            { sel: "#loanOpPanel > div", label: "NOI box", text: "The property’s NOI, DSCR, debt yield and LTV, and where the NOI came from." },
            { sel: "#loanProfilePanel summary", label: "Property profile", text: "Click to open it: the property’s facts (topic “The profile”)." },
            { sel: "#loanOpOpen", label: "Build operating model", text: "Opens the property in Underwriting." },
            { sel: "#loanUnitStatsPanel > div", label: "Rent roll summary", text: "Units, occupancy and rents from its rent roll (topic “Rent roll”)." },
            { sel: "#loanUnitStatsPanel [data-rrimportfor]", label: "Import rent roll", text: "Brings in its rent roll (topic “Rent roll”)." },
            { sel: "#loanDocsPanel > div", label: "Documents", text: "The property’s saved files (see the Documents chapter)." },
            { sel: "#loanDocsType", label: "What you are adding", text: "The kind of file — or let the app detect it." },
            { sel: "#loanDocsAdd", label: "Add files", text: "Saves files to the property’s folder." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "add", title: "Add a property", intro: "Add Property needs only a name — its loans, T12 and documents come later. Before it makes one, it checks you don’t have it already.",
      steps: [
        { title: "The Add Property window", text: "Click Add Property, type the name and click Create.",
          go: async (h) => { await pick(h, "Queens Gate Apartments"); await h.click("#addPropBtn", { wait: 400 }); },
          shot: ADDPROP,
          marks: [
            { sel: "#addPropName", label: "Property name", text: "The property’s name — enough to start." },
            { sel: "#addPropCancel", label: "Cancel", text: "Closes it; nothing is made." },
            { sel: "#addPropCreate", label: "Create", text: "Checks the name, then adds the property." }
          ] },
        { title: "No name", text: "Create with no name and it asks for one.",
          go: async (h) => { await h.click("#addPropCreate", { wait: 300 }); },
          shot: ADDPROP,
          marks: [
            { sel: "#addPropErr", label: "Enter a property name", text: "Type a name, then Create." }
          ] },
        { title: "Created", text: "A made-up “Birch Commons (example)”. It joins the list at once, marked “no loan yet”, and gets its own folder for its files. (A name you already have is refused with a short message.)",
          go: async (h) => { await h.fill("#addPropName", NAME, { change: false }); await h.click("#addPropCreate", { wait: 900 }); await pick(h, NAME); },
          shot: "#loanToolbar",
          marks: [
            { sel: "#loanSelect", label: "In the list", text: "Birch Commons (example) · no loan yet. Its page opens below (topic “A property with no loan”)." },
            { sel: "#addBtn", label: "Add Loan", text: "Its first loan." },
            { sel: "#addPropBtn", label: "Add Property", text: "Another property." },
            { sel: "#editBtn", label: "Edit (greyed)", text: "Edit, Remove and Refi Calculator are for a property with a loan. This page has its own Archive." },
            { sel: "#removeBtn", label: "Remove (greyed)", text: "See Archive on the page instead." },
            { sel: "#refiBtn", label: "Refi Calculator (greyed)", text: "No loan to refinance yet." }
          ] },
        { title: "A similar name", text: "A name that looks like one you have (here “Birch Commons”) asks first: open the one you have, or make the new one anyway.",
          go: async (h) => { await addProp(h, "Birch Commons"); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmText", label: "Looks like", text: "The property (or properties) it looks like." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing is made." },
            { sel: "#confirmAlt", label: "Create anyway", text: "It is a different property: make it." },
            { sel: "#confirmOk", label: "Open it", text: "It is the same property: open the one you have." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } },
        { title: "An archived name", text: "A name you archived before (here the made-up “Old Mill (example)”) asks: bring the old one back with its data, or start fresh — which deletes the archived one’s data for good (it asks again).",
          go: async (h) => { await addProp(h, "Old Mill (example)"); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmTitle", label: "Already exists", text: "And when it was archived." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." },
            { sel: "#confirmAlt", label: "Start fresh", text: "Deletes the archived property’s data and makes a new, empty one." },
            { sel: "#confirmOk", label: "Restore it", text: "Un-archives the old one, with all its data." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } },
        { title: "A loan’s name", text: "A name that is one of your loans, or an address (here the sample “Avalon WP (Mezz)”), is not a new property: it offers to add a loan to that property instead.",
          go: async (h) => { await addProp(h, "Avalon WP (Mezz)"); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmText", label: "Whose it is", text: "Which property the name belongs to." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing is made." },
            { sel: "#confirmOk", label: "Add a loan to it", text: "Opens a new loan form on that property." }
          ],
          after: async (h) => { await h.click("#confirmCancel", { wait: 300 }); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "noloan", title: "A property with no loan", intro: "A new property, or one whose loans were all removed, has its own page: never blank.",
      steps: [
        { title: "The page", text: "Its name with “No loan yet”, its NOI box, its profile, its rent roll and its documents. Removed or paid-off loans, if any, are listed here with Restore. (The profile opens by itself on this page; here it is closed to show the whole page.)",
          go: async (h) => { await pick(h, NAME); await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = false; }); await h.wait(300); },
          shot: "#propView",
          marks: [
            { sel: "#propHeader h2", label: "No loan yet", text: "The property has no active loan." },
            { sel: "[data-propadd]", label: "+ Add the first loan", text: "Opens a loan form with this property filled in." },
            { sel: "[data-proparchive]", label: "Archive", text: "Takes it out of Home and the totals (topic “Archive and delete”)." },
            { sel: "#propOpPanel > div", label: "NOI box", text: "Its NOI and value (next step)." },
            { sel: "#propProfilePanel summary", label: "Profile", text: "Its facts — click to open or close (topic “The profile”)." },
            { sel: "#propUnitStatsPanel > div", label: "Rent roll summary", text: "Topic “Rent roll”." },
            { sel: "#propUnitStatsPanel [data-rrimportfor]", label: "Import rent roll", text: "Brings in its rent roll." },
            { sel: "#propDocsPanel > div", label: "Documents", text: "Its saved files (see the Documents chapter)." },
            { sel: "#propDocsPanel select", label: "What you are adding", text: "The kind of file — or let the app detect it.", optional: true },
            { sel: '#propDocsPanel button:has-text("Add files")', label: "Add files", text: "Saves files to its folder.", optional: true }
          ] },
        { title: "Its NOI box", text: "With no loan there is no DSCR, debt yield or LTV — the box says so. It shows the NOI and the value at a cap rate (the last loan’s, or the default).",
          go: async (h) => { await pick(h, NAME); },
          shot: "#propOpPanel > div",
          marks: [
            { sel: "#propOpPanel .grid > div", nth: 0, label: "Property NOI", text: "Its yearly NOI, once there is one." },
            { sel: "#propOpPanel .grid > div", nth: 1, label: "Value", text: "NOI ÷ cap rate." },
            { sel: "#propOpPanel .grid > div", nth: 2, label: "Cap rate", text: "The last loan’s cap rate, or the default." },
            { sel: "#propOpPanel .grid > div", nth: 3, label: "Debt", text: "None — no loan." },
            { sel: "#propOpOpen", label: "Open in Underwriting", text: "Opens this property in Underwriting, to upload its T12." },
            { sel: "#propOpPanel [data-loanopsrc]", label: "Where the NOI comes from", text: "Here: no NOI yet — upload its T12 or type one in its profile." }
          ] },
        { title: "+ Add the first loan", text: "Opens the Add Loan form with the property’s name filled in. Fill in the loan and save; the page becomes its loan page. Cancel comes back here.",
          go: async (h) => { await pick(h, NAME); await h.click("[data-propadd]", { wait: 900 }); await h.calm(); await h.top(); },
          shot: "#formView",
          marks: [
            { sel: "#formTitle", label: "Add Loan", text: "The loan form — every field is explained in “A loan’s page” › Add a loan." },
            { sel: "#f_propertyName", label: "Property Name", text: "Already this property." },
            { sel: "#cancelBtn", label: "Cancel", text: "Back to the property’s page." },
            { sel: "#saveBtn", label: "Save Loan", text: "Saves the loan on this property." },
            { sel: '#loanForm fieldset:has(legend:has-text("Loan Terms")) legend', label: "Loan Terms", text: "The terms from the loan papers." },
            { sel: '#loanForm fieldset:has(legend:has-text("Escrows")) legend', label: "Escrows & Reserves", text: "Monthly escrows." },
            { sel: '#loanForm fieldset:has(legend:has-text("Additional Fees")) legend', label: "Additional Fees", text: "Monthly fees." }
          ],
          after: async (h) => { await h.click("#cancelBtn", { wait: 600 }); } },
        { title: "Open in Underwriting", text: "Opens Underwriting in a tab of its own, with this property chosen — upload its T12 there (see the Underwriting chapter).",
          go: async (h) => { await pick(h, NAME); await h.click("#propOpOpen", { wait: 1200 }); await h.calm(); await h.top(); },
          shot: card("#opPropPick"),
          marks: [
            { sel: "#opPropPick", label: "Property", text: "Already this property." },
            { sel: "#uwDrop", label: "The T12 box", text: "Drop its T12 here, or click “choose a file”." },
            { sel: '[data-uwf="units"]', label: "Units", text: "Its units (filled from the rent roll once there is one)." },
            { sel: '[data-uwf="rrGPR"]', label: "Gross potential rent", text: "A whole year’s rent at market." },
            { sel: '[data-uwf="avgRentUnit"]', label: "Average rent", text: "Or the average monthly rent; the app works out the year.", optional: true }
          ],
          after: async (h) => { await h.home(); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "profile", title: "The profile", intro: "The property’s facts that don’t change often. Each field saves as soon as you leave it.",
      steps: [
        { title: "Every field", text: "Edit (in the bar at the top) opens the profile; on the page you can also click its title. Shown here on a sample property. A faded value is read from the loan until you type your own.",
          go: async (h) => { await pick(h, "Queens Gate Apartments"); await h.click("#editBtn", { wait: 900 }); await h.calm(); },
          shot: "#loanProfilePanel details",
          marks: [
            { sel: "#loanProfilePanel summary", label: "Property profile", text: "Click to open or close it. Next to it: what is still missing, or “Profile complete”." },
            { sel: PF("propertyName"), label: "Property name", text: "Changing it renames the property everywhere (topic “Rename”)." },
            { sel: '[data-pfhist="propertyName"]', label: "history", text: "This field’s changes (old → new, who, when).", optional: true },
            { sel: PF("address"), label: "Address / market", text: "Changes the address on all its loans." },
            { sel: PF("residentialUnits"), label: "Residential units", text: "Whole number." },
            { sel: PF("commercialUnits"), label: "Commercial units", text: "Shops or restaurants: in the NOI, not in per-unit figures." },
            { sel: PF("rentableSqFt"), label: "Rentable sq ft", text: "Whole number." },
            { sel: PF("yearBuilt"), label: "Year built", text: "1800 to this year." },
            { sel: PF("acquisitionDate"), label: "Acquisition date", text: "When it was bought." },
            { sel: PF("manager"), label: "Manager", text: "Living, or the third-party manager." },
            { sel: PF("dataSource"), label: "Data source", text: "Living Yardi, Third-party or Manual." },
            { sel: PF("yardiCode"), label: "Yardi property code", text: "Its code in Yardi." },
            { sel: PF("noiOverride"), label: "NOI override", text: "Typed by you only. Replaces the T12’s NOI everywhere. Clear it to go back." },
            { sel: PF("notes"), label: "Notes", text: "Anything else." }
          ] },
        { title: "Fill it in", text: "Type into a field and leave it (Tab or click away): it is saved, with who and when under it. Units, sq ft and year built are checked first — a wrong number is not saved. With the name, units, acquisition date and manager set, the profile is complete.",
          go: async (h) => {
            await pick(h, NAME);
            await pfSet(h, "residentialUnits", "12"); await pfSet(h, "yearBuilt", "1988"); await pfSet(h, "acquisitionDate", "2019-05-01");
            await pfSet(h, "manager", "Living"); await h.select(PFIN("dataSource"), "Manual"); await h.wait(500);
            await pfSet(h, "address", "40 Birch Rd, Springfield");
          },
          shot: "#propProfilePanel details",
          marks: [
            { sel: "#propProfilePanel summary span.text-emerald-600", label: "Profile complete", text: "Every needed fact is in." },
            { sel: PF("address"), label: "Address / market", text: "Typed: a made-up address." },
            { sel: PF("residentialUnits"), label: "Residential units", text: "Typed: 12." },
            { sel: PF("residentialUnits") + " p", label: "Last changed", text: "Who changed it, and when." },
            { sel: '[data-pfhist="residentialUnits"]', label: "history (1)", text: "Its changes so far (last step of this topic)." },
            { sel: PF("yearBuilt"), label: "Year built", text: "Typed: 1988. A year before 1800 or after this year is refused." },
            { sel: PF("acquisitionDate"), label: "Acquisition date", text: "Picked from the calendar." },
            { sel: PF("manager"), label: "Manager", text: "Typed: Living." },
            { sel: PF("dataSource"), label: "Data source", text: "Picked: Manual." },
            { sel: PF("noi"), label: "NOI (annual, entered)", text: "Only for a property with no loan: an NOI to use until it has a T12 (next step)." },
            { sel: PF("noiOverride"), label: "NOI override", text: "Replaces any other NOI (step after next)." }
          ] },
        { title: "An entered NOI", text: "With no T12 yet, type the NOI here. The NOI box uses it at once and says so. Once a T12 is uploaded, the T12’s NOI is used instead.",
          go: async (h) => { await pick(h, NAME); await pfSet(h, "noi", "1150000"); await h.wait(500); },
          shot: "#propOpPanel > div",
          marks: [
            { sel: "#propOpPanel .grid > div", nth: 0, label: "Property NOI", text: "The NOI just typed." },
            { sel: "#propOpPanel .grid > div", nth: 1, label: "Value", text: "That NOI ÷ the cap rate." },
            { sel: "#propOpPanel .grid > div", nth: 2, label: "Cap rate", text: "The default cap rate (no loan has given one)." },
            { sel: "#propOpPanel .grid > div", nth: 3, label: "Debt", text: "None." },
            { sel: "#propOpOpen", label: "Open in Underwriting", text: "Upload its T12 there." },
            { sel: "#propOpPanel [data-loanopsrc]", label: "Your entered NOI", text: "Says the NOI is the one typed in the profile — no T12 yet." }
          ] },
        { title: "The NOI override", text: "An override is typed by you only and wins over everything — the T12, the entered NOI. DSCR, debt yield, Home and the refinance all use it. Clear the field to go back.",
          go: async (h) => { await pick(h, NAME); await pfSet(h, "noiOverride", "1200000"); await h.wait(500); },
          shot: "#propOpPanel > div",
          marks: [
            { sel: "#propOpPanel .grid > div", nth: 0, label: "Property NOI", text: "Now the override." },
            { sel: "#propOpPanel .grid > div", nth: 1, label: "Value", text: "Worked out again from the override." },
            { sel: "#propOpPanel .grid > div", nth: 2, label: "Cap rate", text: "Unchanged." },
            { sel: "#propOpPanel .grid > div", nth: 3, label: "Debt", text: "None." },
            { sel: "#propOpOpen", label: "Open in Underwriting", text: "Upload its T12 there." },
            { sel: "#propOpPanel [data-loanopsrc]", label: "Your NOI override", text: "Says the override is in use." }
          ] },
        { title: "History on a field", text: "A field with changes on record has “history (N)” next to its name. Click it: every change, old → new, who, when and where from. Here Residential units was changed from 12 to 14.",
          go: async (h) => { await pick(h, NAME); await pfSet(h, "residentialUnits", "14"); await h.click('[data-pfhist="residentialUnits"]', { wait: 500 }); },
          shot: "#historyModal > div",
          marks: [
            { sel: "#historyTitle", label: "Which field", text: "The field and the property." },
            { sel: "#historyBody th", nth: 0, label: "When", text: "When it changed." },
            { sel: "#historyBody th", nth: 1, label: "Old → new", text: "What it was and what it became." },
            { sel: "#historyBody th", nth: 2, label: "Who", text: "Who changed it." },
            { sel: "#historyBody th", nth: 3, label: "Where from", text: "Typed, a rent roll, the assistant, a loan agreement…" },
            { sel: "#historyClose", label: "Close", text: "Closes the window." }
          ],
          after: async (h) => { await h.closeModals(); } }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "rentroll", title: "Rent roll", intro: "Import the property’s rent roll (a Yardi export, Excel or CSV) to see its units, occupancy and rents. Shown with a made-up 12-unit rent roll.",
      steps: [
        { title: "No rent roll yet", text: "The Rent roll summary is on every property’s page. Click Import rent roll and pick the file in the window that opens.",
          go: async (h) => { await pick(h, NAME); },
          shot: "#propUnitStatsPanel > div",
          marks: [
            { sel: "#propUnitStatsPanel h2", label: "Rent roll summary", text: "Empty until a rent roll is imported." },
            { sel: "[data-rrimportfor]", label: "Import rent roll", text: "Opens your computer’s file window: pick the rent roll." }
          ] },
        { title: "Which part is whose", text: "The app reads the file and lists its parts (a file can hold several properties). Opened from a property, its part is set to that property. Check it, then click Import.",
          go: async (h) => {
            await pick(h, NAME);
            const f = path.join(h.ctx.UDATA, "Birch Commons rent roll (made-up).csv"); fs.writeFileSync(f, rentRollCsv());
            const k = await keyOf(h, NAME);
            await h.js((key) => window.LDS_rrImportFor(key), k);
            await h.page.setInputFiles("#rrImportFile", f);
            await h.page.waitForSelector("#rrImportBody [data-partsel]", { timeout: 15000 });
            await h.js((key) => { const s = document.querySelector('#rrImportBody [data-partsel="1"]'); if (s && !s.value){ s.value = key; s.dispatchEvent(new Event("change", { bubbles: true })); } }, k);
            await h.wait(400);
          },
          shot: "#rrImportModal > div",
          marks: [
            { sel: "#rrImportSub", label: "The file", text: "Its name and how many parts it has." },
            { sel: "#rrImportBody [data-partscard] > p", label: "What the app found", text: "Which part is set to which property." },
            { sel: "#rrImportX", label: "✕", text: "Closes it; nothing is saved." },
            { sel: '[data-partuse="1"]', label: "Use this part", text: "Ticked: this part is imported." },
            { sel: '[data-partsel="1"]', label: "Which property", text: "The property this part belongs to — or “Add as a new property”." },
            { sel: '[data-partsadd="1"]', label: "+ another property", text: "The same part for one more property." },
            { sel: "#rrImportNote", label: "Note", text: "Nothing is saved until you click Import." },
            { sel: "#rrImportCancel", label: "Cancel", text: "Closes it; nothing is saved." },
            { sel: "#rrImportApply", label: "Import", text: "Saves the file to the property’s folder and reads its summary." }
          ] },
        { title: "The summary", text: "The summary: units, occupied, vacant, the average market and in-place rents, and the square feet. Update brings in a newer rent roll. Underwriting fills its units and rent from it.",
          go: async (h) => { await h.click("#rrImportApply", { wait: 1500 }); await pick(h, NAME); await h.wait(800); },
          shot: "#propUnitStatsPanel > div",
          marks: [
            { sel: "#propUnitStatsPanel p", nth: 0, label: "From", text: "The file it came from." },
            { sel: "[data-rrimportfor]", label: "Update", text: "Replace it with a newer rent roll." },
            { sel: "#propUnitStatsPanel .grid > div", nth: 0, label: "Units", text: "Residential units in the rent roll." },
            { sel: "#propUnitStatsPanel .grid > div", nth: 1, label: "Occupied", text: "Units with a resident." },
            { sel: "#propUnitStatsPanel .grid > div", nth: 2, label: "Vacant", text: "Empty units." },
            { sel: "#propUnitStatsPanel .grid > div", nth: 3, label: "Avg market", text: "Average market rent a month." },
            { sel: "#propUnitStatsPanel .grid > div", nth: 4, label: "Avg in-place", text: "Average rent actually charged a month." },
            { sel: "#propUnitStatsPanel .grid > div", nth: 5, label: "Sq ft", text: "Total square feet of the units." },
            { sel: "#rrWarnToggle", label: "To check", text: "Rows worth a look; click to list them.", optional: true }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "rename", title: "Rename a property", intro: "Change the name in its profile. One name, everywhere.",
      steps: [
        { title: "Type the new name", text: "Open the profile, type the new name in Property name and leave the field (Tab or click away). On a property with loans the name changes on every loan (a mezz keeps “(Mezz)”), and its files and chats move with it. If the new name already has files of its own, it asks first: put them together, or don’t rename.",
          go: async (h) => { await pick(h, NAME); await pfSet(h, "propertyName", NEWNAME); await h.wait(800); await pick(h, NEWNAME); },
          shot: '#propProfilePanel h4:has-text("Identity") >> xpath=..',
          marks: [
            { sel: PF("propertyName"), label: "Property name", text: "The new name, saved." },
            { sel: '[data-pfhist="propertyName"]', label: "history (2)", text: "The old name and the new one." },
            { sel: PF("address"), label: "Address / market", text: "Changing it changes the address on all its loans." }
          ] },
        { title: "Everywhere", text: "The page, the property list and Home all use the new name at once.",
          go: async (h) => { await pick(h, NEWNAME); },
          shot: "#propHeader > div",
          marks: [
            { sel: "#propHeader h2", label: "The new name", text: "On its page — and in the property list." },
            { sel: "[data-propadd]", label: "+ Add the first loan", text: "A loan on the renamed property." },
            { sel: "[data-proparchive]", label: "Archive", text: "Next topic." }
          ] }
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "archive", title: "Archive and delete", intro: "Archive takes a property out of Home, the totals and the assistant, and keeps everything. Delete permanently removes it for good — only an archived property can be deleted.",
      steps: [
        { title: "Archive", text: "On a property with no loan, click Archive on its page. (A property with loans: Remove in the bar at the top archives it with its loans.) It asks first.",
          go: async (h) => { await pick(h, NEWNAME); await h.click("[data-proparchive]", { wait: 500 }); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmText", label: "What happens", text: "It leaves Home, the totals and the assistant." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps it." },
            { sel: "#confirmOk", label: "Archive", text: "Archives it." }
          ] },
        { title: "An archived property", text: "Its page says “archived”. Un-archive brings it back as it was. Delete permanently removes it for good.",
          go: async (h) => { await h.click("#confirmOk", { wait: 900 }); await h.calm(); await h.top(); },
          shot: "#propHeader > div",
          marks: [
            { sel: "#propHeader h2 span", label: "archived", text: "Out of Home, the totals and the assistant." },
            { sel: "[data-propunarchive]", label: "Un-archive", text: "Back in Home and the totals, with all its data." },
            { sel: "[data-propdelete]", label: "Delete permanently", text: "Removes it for good (it asks first)." }
          ] },
        { title: "Un-archive", text: "Click Un-archive: it is back, with its profile, rent roll and files.",
          go: async (h) => { await h.click("[data-propunarchive]", { wait: 900 }); await h.calm(); await h.top(); },
          shot: "#propHeader > div",
          marks: [
            { sel: "#propHeader h2", label: "Back", text: "No longer archived." },
            { sel: "[data-proparchive]", label: "Archive", text: "Archive it again (needed before it can be deleted)." }
          ] },
        { title: "Delete permanently", text: "Archive it again, then click Delete permanently. The window lists exactly what goes — its loans, T12, documents, chats, profile and figures. The automatic backups keep a copy.",
          go: async (h) => { await h.click("[data-proparchive]", { wait: 500 }); await h.click("#confirmOk", { wait: 900 }); await h.click("[data-propdelete]", { wait: 900 }); },
          shot: CONFIRM,
          marks: [
            { sel: "#confirmText", label: "What goes", text: "Everything about the property, listed." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps it (archived)." },
            { sel: "#confirmOk", label: "Delete permanently", text: "Deletes it for good and goes back to Home." }
          ],
          after: async (h) => { await h.click("#confirmOk", { wait: 1200 }); } },
        { title: "Home’s Archived strip", text: "Every archived property is listed near the bottom of Home (here the made-up “Old Mill (example)”). Click its name to un-archive it, or the bin to delete it for good.",
          go: async (h) => { await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(700); },
          shot: card("#portfolioView [data-unarchive]"),
          marks: [
            { sel: '#portfolioView [data-unarchive]', label: "Un-archive", text: "Click the name: it is back in Home and the totals." },
            { sel: '#portfolioView [data-harddelete]', label: "Delete permanently", text: "Removes it and its files for good (it asks first)." }
          ] }
      ] }
  ]
};
// keep the pointer off the picture: hover colours would show on whatever is under it
SPEC.topics.forEach(t => t.steps.forEach(st => { const go = st.go; st.go = async (h) => { if (go) await go(h); await h.page.mouse.move(1, 1).catch(() => {}); }; }));
module.exports = SPEC;
