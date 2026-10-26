/* Guide chapter: Properties — add a property (and the checks that stop a duplicate), fill in its profile, import its
   rent roll, rename it, archive or delete it, and the reference page for the property page.
   Looking only: the app’s built-in sample properties (Queens Gate, Avalon White Plains). Everything that is added,
   changed, archived or deleted is MADE-UP: “Birch Commons (example)”, “Old Mill (example)” and a made-up 12-unit
   rent roll written by this file.
   The pages run in the order listed and build on each other: Birch Commons is added, filled in and given its rent
   roll by the first three how-tos; the reference page comes next in this file (it is in the guide’s “Reference”
   group, so where it sits here doesn’t change the menu) and shows Birch Commons as it is then; the last two how-tos
   rename it, then archive and delete it. */
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
const closeTabs = async (h) => { await h.js(() => { for (let i = 0; i < 6; i++){ const b = document.querySelector("[data-tabclose]"); if (!b) break; b.click(); } }); await h.wait(500); };
// a made-up rent roll: 12 units, two of them vacant (a Yardi-style export, as CSV); `newer` fills unit 103
const rentRollCsv = (newer) => {
  const units = [["101", "1BR", 720, 1450, 1425], ["102", "1BR", 720, 1450, 1450], ["103", "1BR", 720, 1450, newer ? 1440 : 0], ["104", "2BR", 960, 1825, 1790],
    ["105", "2BR", 960, 1825, 1825], ["106", "2BR", 960, 1825, 1760], ["201", "1BR", 720, 1475, 1475], ["202", "1BR", 720, 1475, 1440],
    ["203", "2BR", 960, 1850, 0], ["204", "2BR", 960, 1850, 1850], ["205", "3BR", 1180, 2150, 2095], ["206", "3BR", 1180, 2150, 2150]];
  const lines = ["Rent Roll", "Unit,Unit Type,Unit,Resident,Name,Market,Actual", ",,Sq Ft,,,Rent,Rent", "Current/Notice/Vacant Residents"];
  let m = 0, a = 0;
  units.forEach((u, i) => { const vac = u[4] === 0; lines.push([u[0], u[1], u[2], vac ? "VACANT" : "t" + (1001 + i), vac ? "VACANT" : "Resident " + String.fromCharCode(65 + i), u[3], u[4]].join(",")); m += u[3]; a += u[4]; });
  lines.push(",,,Total," + NAME + "," + m + "," + a);
  return lines.join("\n") + "\n";
};
// the rent roll importer, opened from Birch Commons’ page with a made-up file
const openImport = async (h, file, newer) => {
  await pick(h, NAME);
  const f = path.join(h.ctx.UDATA, file); fs.writeFileSync(f, rentRollCsv(newer));
  const k = await keyOf(h, NAME);
  await h.js((key) => window.LDS_rrImportFor(key), k);
  await h.page.setInputFiles("#rrImportFile", f);
  await h.page.waitForSelector("#rrImportBody [data-partsel]", { timeout: 15000 });
  await h.js((key) => { const s = document.querySelector('#rrImportBody [data-partsel="1"]'); if (s && !s.value){ s.value = key; s.dispatchEvent(new Event("change", { bubbles: true })); } }, k);
  await h.wait(400);
};
const cancelConfirm = async (h) => { await h.click("#confirmCancel", { wait: 300 }); };

const SPEC = {
  id: "property",
  setup: async (h) => {
    await quiet(h);
    // a made-up property, archived — for the “already exists (archived)” check and the Portfolio page’s Archived strip
    await h.js((n) => window.LDS_addProperty(n), "Old Mill (example)"); await h.wait(600);
    const k = await keyOf(h, "Old Mill (example)");
    await h.js((key) => window.LDS_archiveProperty(key, true), k); await h.wait(600);
    await h.closeModals(); await h.home();
  },
  pages: [
    // ==================================================================================================================
    { id: "add-a-property", kind: "howto", group: "Properties", title: "Add a property",
      description: "Add a property by its name, before it has a loan, a T12 or any files.",
      intro: "A property needs only a name to start. Its profile, rent roll, T12, documents and loans can all come later. Before it makes the property, the app checks that you don’t have it already.",
      sections: [
        { title: "Create the property",
          steps: [
            { text: "Click **Specific Property** under the tabs.",
              go: async (h) => { await pick(h, "Queens Gate Apartments"); } },
            { text: "Click **Add Property** in the bar. The **Add Property** window opens.",
              go: async (h) => { await h.click("#addPropBtn", { wait: 400 }); },
              shot: ADDPROP,
              marks: [
                { sel: "#addPropName", label: "Property name", text: "The property’s name: enough to start." },
                { sel: "#addPropCancel", label: "Cancel", text: "Closes the window; nothing is made." },
                { sel: "#addPropCreate", label: "Create", text: "Checks the name, then adds the property." }
              ] },
            { text: "Type the property’s name in **Property name**. Here it is the made-up “Birch Commons (example)”.",
              go: async (h) => { await h.fill("#addPropName", NAME, { change: false }); } },
            { text: "Click **Create**. The property joins the list in **Select a property**, marked “no loan yet”, and gets a folder of its own for its files.",
              go: async (h) => { await h.click("#addPropCreate", { wait: 900 }); await pick(h, NAME); },
              shot: "#loanToolbar",
              marks: [
                { sel: "#loanSelect", label: "In the list", text: "Birch Commons (example) · no loan yet. Its page opens below the bar." },
                { sel: "#editBtn", label: "Edit (greyed)", text: "**Edit**, **Remove** and **Refi Calculator** wait for a loan. The property’s page has its own **Archive**." }
              ] }
          ],
          note: "A name you already have, exactly, is refused with a short message." },
        { title: "If the app asks first",
          text: "Before it makes a property, the app compares the name with your properties and loans.",
          steps: [
            { text: "If the name looks like a property you have, click **Open it** when it is the same property, or **Create anyway** when it is a different one.",
              go: async (h) => { await addProp(h, "Birch Commons"); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "Looks like", text: "The property, or properties, the name looks like." },
                { sel: "#confirmOk", label: "Open it", text: "It is the same property: open the one you have." },
                { sel: "#confirmAlt", label: "Create anyway", text: "It is a different property: make it." }
              ],
              after: cancelConfirm },
            { text: "If you archived a property with that name, click **Restore it** to bring it back with all its data, or **Start fresh** to make a new, empty one.",
              warning: "**Start fresh** deletes the archived property’s data for good. The app asks again before it does." },
            { text: "If the name is one of your loans, or an address, click **Add a loan to it**. A new loan form opens on the property the name belongs to." }
          ] },
        { title: "Add its first loan",
          steps: [
            { text: "On the new property’s page, click **+ Add the first loan**. The loan form opens with the property’s name filled in.",
              go: async (h) => { await pick(h, NAME); },
              shot: "#propHeader > div",
              marks: [ { sel: "[data-propadd]", label: "+ Add the first loan", text: "Opens the loan form for this property." } ] },
            { text: "Fill in the loan and click **Save Loan**. See [Add a loan](add-a-loan)." }
          ] }
      ],
      next: [
        { page: "fill-in-the-profile", text: "Its units, its manager and its other facts." },
        { page: "import-a-rent-roll", text: "Its units, occupancy and rents, from its rent roll." },
        { page: "ref-property-page", text: "Every part of a property’s page, named." }
      ] },

    // ==================================================================================================================
    { id: "fill-in-the-profile", kind: "howto", group: "Properties", title: "Fill in a property’s profile",
      description: "Type in the property’s facts: its units, size, owner details, and an NOI to use before there is a T12.",
      intro: "The profile holds the property’s facts that don’t change often: its address, units, square feet, year built, acquisition date and manager. Claude’s stories and What to push use its units and address, with the T12, the rent roll and the loan agreement. Each field is saved as soon as you leave it.",
      sections: [
        { title: "Open the profile",
          steps: [
            { text: "Click **Specific Property** under the tabs, and pick the property in **Select a property**.",
              go: async (h) => { await pick(h, NAME); } },
            { text: "Find **Property profile** on its page. On a property with no loan it is open already. On a property with a loan, click **Edit** in the bar at the top, or click the profile’s title.",
              go: async (h) => { await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = true; }); await h.wait(300); },
              shot: "#propProfilePanel details",
              marks: [ { sel: "#propProfilePanel summary", label: "Property profile", text: "Click it to open or close the profile. Next to it: what is still missing." } ] }
          ] },
        { title: "Fill in the fields",
          steps: [
            { text: "Type a value in a field, then leave it: press Tab, or click elsewhere. It is saved at once, with who changed it and when." },
            { text: "Fill in **Residential units**, **Acquisition date** and **Manager**. With these and the name, the profile is complete.",
              go: async (h) => {
                await pfSet(h, "residentialUnits", "12"); await pfSet(h, "yearBuilt", "1988"); await pfSet(h, "acquisitionDate", "2019-05-01");
                await pfSet(h, "manager", "Living"); await h.select(PFIN("dataSource"), "Manual"); await h.wait(500);
                await pfSet(h, "address", "40 Birch Rd, Springfield");
              },
              shot: "#propProfilePanel details",
              marks: [
                { sel: "#propProfilePanel summary span.text-emerald-600", label: "Profile complete", text: "Every needed fact is in." },
                { sel: PF("residentialUnits"), label: "Residential units", text: "Typed: 12." },
                { sel: PF("residentialUnits") + " p", label: "Last changed", text: "Who changed it, and when." }
              ] }
          ],
          note: "Units, square feet and year built are checked first: a number that can’t be right isn’t saved. A faded value is read from the property’s loan until you type your own." },
        { title: "Enter an NOI before the T12",
          text: "A property with no T12 yet has no NOI. You can type one to use until its T12 is uploaded.",
          steps: [
            { text: "Type the yearly NOI in **NOI (annual, entered)**, and leave the field. The NOI box uses it at once, and says so.",
              go: async (h) => { await pfSet(h, "noi", "1150000"); await h.wait(500); },
              shot: "#propOpPanel > div",
              marks: [
                { sel: "#propOpPanel .grid > div", nth: 0, label: "Property NOI", text: "The NOI just typed." },
                { sel: "#propOpPanel [data-loanopsrc]", label: "Your entered NOI", text: "Says the NOI is the one typed in the profile, with no T12 yet." }
              ] }
          ],
          note: "Once a T12 is uploaded, its NOI is used instead. See [Upload a T12](upload-a-t12)." },
        { title: "Override the NOI",
          steps: [
            { text: "Type a yearly figure in **NOI override**, and leave the field. It replaces the T12’s NOI and the entered NOI on the property’s page, in the DSCR and the debt yield, and on the Portfolio page.",
              go: async (h) => { await pfSet(h, "noiOverride", "1200000"); await h.wait(500); },
              shot: "#propOpPanel > div",
              marks: [
                { sel: "#propOpPanel .grid > div", nth: 0, label: "Property NOI", text: "Now the override." },
                { sel: "#propOpPanel [data-loanopsrc]", label: "Your NOI override", text: "Says the override is in use." }
              ] },
            { text: "To go back to the T12’s NOI, clear the field." }
          ],
          note: "Only you can type an override. The refinance never uses a typed figure: it is sized on the T12, or on the underwriting approved from it." },
        { title: "See a field’s history",
          steps: [
            { text: "Click **history** next to a field’s name. The window lists every change: old and new value, who, when, and where it came from. Here **Residential units** was changed from 12 to 14.",
              go: async (h) => { await pfSet(h, "residentialUnits", "14"); await h.click('[data-pfhist="residentialUnits"]', { wait: 500 }); },
              shot: "#historyModal > div",
              marks: [
                { sel: "#historyBody th", nth: 1, label: "Old → new", text: "What it was and what it became." },
                { sel: "#historyBody th", nth: 2, label: "Who", text: "Who changed it." },
                { sel: "#historyBody th", nth: 3, label: "Where from", text: "Typed, a rent roll, the assistant, a loan agreement…" }
              ] },
            { text: "Click **Close**.",
              go: async (h) => { await h.closeModals(); } }
          ] }
      ],
      next: [
        { page: "import-a-rent-roll", text: "Bring in its units and rents." },
        { page: "rename-a-property", text: "Change its name everywhere." },
        { page: "ref-property-page", anchor: "the-profile", text: "Every field of the profile, named." }
      ] },

    // ==================================================================================================================
    { id: "import-a-rent-roll", kind: "howto", group: "Properties", title: "Import a rent roll",
      description: "Bring in a property’s rent roll to see its units, occupancy and rents.",
      intro: "Import the property’s rent roll to see its units, occupancy and average rents on its page. Underwriting fills in the units and the rent from it, and Claude’s stories and What to push use it with the T12.",
      before: [ "The rent roll as a file: a Yardi export, an Excel workbook or a CSV. These pictures use a made-up rent roll of 12 units." ],
      sections: [
        { title: "Import the file",
          steps: [
            { text: "On the property’s page, click **Import rent roll** in **Rent roll summary**.",
              go: async (h) => { await pick(h, NAME); },
              shot: "#propUnitStatsPanel > div",
              marks: [
                { sel: "#propUnitStatsPanel h2", label: "Rent roll summary", text: "Empty until a rent roll is imported." },
                { sel: "[data-rrimportfor]", label: "Import rent roll", text: "Opens your computer’s file window." }
              ] },
            { text: "Pick the rent roll in the window that opens. The app reads the file and lists its parts: one file can hold several properties.",
              go: async (h) => { await openImport(h, "Birch Commons rent roll (made-up).csv", false); } },
            { text: "Check the property set for each part. Opened from a property’s page, its part is set to that property.",
              shot: "#rrImportModal > div",
              marks: [
                { sel: '[data-partuse="1"]', label: "Use this part", text: "Ticked: this part is imported." },
                { sel: '[data-partsel="1"]', label: "Which property", text: "The property this part belongs to." },
                { sel: "#rrImportApply", label: "Import", text: "Saves the file to the property’s folder." }
              ] },
            { text: "Click **Import**. The summary fills in on the property’s page.",
              go: async (h) => { await h.click("#rrImportApply", { wait: 1500 }); await pick(h, NAME); await h.wait(800); },
              shot: "#propUnitStatsPanel > div",
              marks: [
                { sel: "#propUnitStatsPanel .grid > div", nth: 0, label: "Units", text: "Residential units in the rent roll." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 2, label: "Vacant", text: "Empty units." },
                { sel: "[data-rrimportfor]", label: "Update", text: "Brings in a newer rent roll." }
              ] }
          ],
          note: "Nothing is saved until you click **Import**. **Cancel** or **✕** closes the window without saving." },
        { title: "Bring in a newer rent roll",
          steps: [
            { text: "Click **Update** in **Rent roll summary**, and import the newer file the same way. It replaces the summary." }
          ] }
      ],
      next: [
        { page: "upload-a-t12", text: "Upload the property’s T12." },
        { page: "ref-property-page", anchor: "the-rent-roll", text: "Every figure of the summary and the import window." }
      ] },

    // ==================================================================================================================
    // (in the “Reference” group; captured here, while Birch Commons has its profile and rent roll and is not renamed yet)
    { id: "ref-property-page", kind: "reference", group: "Reference", title: "The property page",
      description: "Every part of a property’s page: the bar, the NOI box, the profile, the rent roll summary, and the Add Property window.",
      intro: "Click **Specific Property** under the tabs and pick a property: its page opens below the bar. Each picture names its controls. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "The property bar",
          text: "Under the tabs when **Specific Property** is on. The window bar and the tabs are on [The main screen](ref-main-screen).",
          views: [
            { title: "A property with a loan",
              go: async (h) => { await pick(h, "Queens Gate Apartments"); },
              shot: "view",
              marks: [
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the whole book." },
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "One property at a time (on now)." },
                { sel: "#loanSelect", label: "Select a property", text: "Pick a property; its page opens below. Next to a name: “senior + mezz” (two loans), “in a pooled loan” or “no loan yet”." },
                { sel: "#addBtn", label: "Add Loan", text: "A new loan on this property. See [Add a loan](add-a-loan)." },
                { sel: "#addPropBtn", label: "Add Property", text: "A new property, by its name. See [Add a property](add-a-property)." },
                { sel: "#editBtn", label: "Edit", text: "Opens this property’s profile." },
                { sel: "#removeBtn", label: "Remove", text: "Archives this property and all its loans; it asks first. Bring it back from the Portfolio page’s Archived strip." },
                { sel: "#refiBtn", label: "Refi Calculator", text: "The refinance for this property. See [Run a refinance](run-a-refinance)." },
                { sel: "#kpiGrid", label: "The property’s page", text: "Starts here, under the bar." }
              ] },
            { title: "A property with no loan",
              go: async (h) => { await pick(h, NAME); },
              shot: "#loanToolbar",
              marks: [
                { sel: "#loanSelect", label: "In the list", text: "“no loan yet” next to its name." },
                { sel: "#addBtn", label: "Add Loan", text: "Its first loan." },
                { sel: "#addPropBtn", label: "Add Property", text: "Another property." },
                { sel: "#editBtn", label: "Edit (greyed)", text: "**Edit**, **Remove** and **Refi Calculator** are for a property with a loan. Its page has its own profile and **Archive**." },
                { sel: "#removeBtn", label: "Remove (greyed)", text: "Use **Archive** on the page instead." },
                { sel: "#refiBtn", label: "Refi Calculator (greyed)", text: "No loan to refinance yet." }
              ] }
          ] },
        { title: "A property with a loan",
          views: [
            { text: "From the top: the loan’s tiles and rate notice, the NOI box, the profile, the rent roll summary and the documents. Further down are the Loan Record and the payment schedule: see [A loan’s page](ref-loan-page).",
              go: async (h) => { await pick(h, "Queens Gate Apartments"); await h.into(h.loc("#kpiGrid")); },
              shot: "view",
              marks: [
                { sel: "#kpiGrid", label: "Tiles", text: "The loan’s main figures." },
                { sel: "#floatBanner", label: "Rate notice", text: "How a floating or hybrid rate is set this month." },
                { sel: "#loanOpPanel > div", label: "NOI box", text: "The property’s NOI, DSCR, debt yield and LTV, and where the NOI comes from." },
                { sel: "#loanProfilePanel summary", label: "Property profile", text: "Click to open it: the property’s facts." },
                { sel: "#loanOpOpen", label: "Build operating model", text: "Opens the property in Underwriting." },
                { sel: "#loanUnitStatsPanel > div", label: "Rent roll summary", text: "Units, occupancy and rents from its rent roll." },
                { sel: "#loanUnitStatsPanel [data-rrimportfor]", label: "Import rent roll", text: "Brings in its rent roll. See [Import a rent roll](import-a-rent-roll)." },
                { sel: "#loanDocsPanel > div", label: "Documents", text: "The property’s saved files. See [Documents and the T12 check](ref-documents)." },
                { sel: "#loanDocsType", label: "What you are adding", text: "The kind of file, or **Detect automatically**." },
                { sel: "#loanDocsAdd", label: "Add files", text: "Saves files to the property’s folder." }
              ] }
          ] },
        { title: "A property with no loan",
          text: "A new property, or one whose loans were all removed, has a page of its own. Removed or paid-off loans, if any, are listed on it with **Restore**.",
          views: [
            { title: "The page",
              text: "The profile opens by itself on this page; here it is closed to show the whole page.",
              go: async (h) => { await pick(h, NAME); await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = false; }); await h.wait(300); },
              shot: "#propView",
              marks: [
                { sel: "#propHeader h2", label: "No loan yet", text: "Its name: the property has no active loan." },
                { sel: "[data-propadd]", label: "+ Add the first loan", text: "Opens a loan form with this property filled in." },
                { sel: "[data-proparchive]", label: "Archive", text: "Takes it out of the Portfolio page, the totals and the assistant. See [Archive or delete a property](archive-or-delete-a-property)." },
                { sel: "#propOpPanel > div", label: "NOI box", text: "Its NOI and value." },
                { sel: "#propProfilePanel summary", label: "Profile", text: "Its facts. Click to open or close." },
                { sel: "#propUnitStatsPanel > div", label: "Rent roll summary", text: "Units, occupancy and rents from its rent roll." },
                { sel: "#propUnitStatsPanel [data-rrimportfor]", label: "Import rent roll / Update", text: "Brings in its rent roll, or a newer one." },
                { sel: "#propDocsPanel > div", label: "Documents", text: "Its saved files. See [Documents and the T12 check](ref-documents)." },
                { sel: "#propDocsPanel select", label: "What you are adding", text: "The kind of file, or **Detect automatically**.", optional: true },
                { sel: '#propDocsPanel button:has-text("Add files")', label: "Add files", text: "Saves files to its folder.", optional: true }
              ] },
            { title: "Its NOI box",
              text: "With no loan there is no DSCR, debt yield or LTV, and the box says so.",
              go: async (h) => { await pick(h, NAME); },
              shot: "#propOpPanel > div",
              marks: [
                { sel: "#propOpPanel .grid > div", nth: 0, label: "Property NOI", text: "Its yearly NOI, once there is one." },
                { sel: "#propOpPanel .grid > div", nth: 1, label: "Value", text: "The NOI ÷ the cap rate." },
                { sel: "#propOpPanel .grid > div", nth: 2, label: "Cap rate", text: "The last loan’s cap rate, or the default." },
                { sel: "#propOpPanel .grid > div", nth: 3, label: "Debt", text: "None: no loan." },
                { sel: "#propOpOpen", label: "Open in Underwriting", text: "Opens this property in Underwriting, to upload its T12." },
                { sel: "#propOpPanel [data-loanopsrc]", label: "Where the NOI comes from", text: "From the T12; your entered NOI (no T12 yet); your NOI override (shown here); or “No NOI yet — upload its T12 or enter one in its profile”." }
              ] },
            { title: "+ Add the first loan",
              text: "The Add Loan form, with the property’s name filled in. Save the loan and the page becomes its loan page; **Cancel** comes back here.",
              go: async (h) => { await pick(h, NAME); await h.click("[data-propadd]", { wait: 900 }); await h.calm(); await h.top(); },
              shot: "#formView",
              marks: [
                { sel: "#formTitle", label: "Add Loan", text: "The loan form. Every field is on [The loan form](ref-loan-form)." },
                { sel: "#f_propertyName", label: "Property Name", text: "Already this property." },
                { sel: "#cancelBtn", label: "Cancel", text: "Back to the property’s page." },
                { sel: "#saveBtn", label: "Save Loan", text: "Saves the loan on this property." },
                { sel: '#loanForm fieldset:has(legend:has-text("Loan Terms")) legend', label: "Loan Terms", text: "The terms from the loan papers." },
                { sel: '#loanForm fieldset:has(legend:has-text("Escrows")) legend', label: "Escrows & Reserves", text: "Monthly escrows." },
                { sel: '#loanForm fieldset:has(legend:has-text("Additional Fees")) legend', label: "Additional Fees", text: "Monthly fees." }
              ],
              after: async (h) => { await h.click("#cancelBtn", { wait: 600 }); } },
            { title: "Open in Underwriting",
              text: "Opens Underwriting in a tab of its own, with this property chosen. See [Upload a T12](upload-a-t12).",
              go: async (h) => { await pick(h, NAME); await h.click("#propOpOpen", { wait: 1200 }); await h.calm(); await h.top(); },
              shot: card("#opPropPick"),
              marks: [
                { sel: "#opPropPick", label: "Property", text: "Already this property." },
                { sel: "#uwDrop", label: "The T12 box", text: "Drop its T12 here, or click “choose a file”." },
                { sel: '[data-uwf="units"]', label: "Units", text: "Its units: from the profile, or from the rent roll when the profile has none." },
                { sel: '[data-uwf="rrGPR"]', label: "Gross potential rent", text: "A whole year’s rent at market." },
                { sel: '[data-uwf="avgRentUnit"]', label: "Average rent", text: "Or the average monthly rent; the app works out the year.", optional: true }
              ],
              after: async (h) => { await h.home(); await closeTabs(h); } }
          ] },
        { title: "The profile",
          text: "The property’s facts that don’t change often. Each field is saved when you leave it, with who changed it and when.",
          views: [
            { title: "Every field",
              text: "On a sample property, opened with **Edit**. A faded value is read from the loan until you type your own.",
              go: async (h) => { await pick(h, "Queens Gate Apartments"); await h.click("#editBtn", { wait: 900 }); await h.calm(); },
              shot: "#loanProfilePanel details",
              marks: [
                { sel: "#loanProfilePanel summary", label: "Property profile", text: "Click to open or close it. Next to it: what is still missing, or “Profile complete”." },
                { sel: PF("propertyName"), label: "Property name", text: "Changing it renames the property everywhere. See [Rename a property](rename-a-property)." },
                { sel: '[data-pfhist="propertyName"]', label: "history", text: "This field’s changes (old → new, who, when).", optional: true },
                { sel: PF("address"), label: "Address / market", text: "Changes the address on all its loans." },
                { sel: PF("residentialUnits"), label: "Residential units", text: "A whole number." },
                { sel: PF("commercialUnits"), label: "Commercial units", text: "Shops or restaurants: counted in the NOI, kept out of the per-unit figures." },
                { sel: PF("rentableSqFt"), label: "Rentable sq ft", text: "A whole number." },
                { sel: PF("yearBuilt"), label: "Year built", text: "From 1800 to this year." },
                { sel: PF("acquisitionDate"), label: "Acquisition date", text: "When it was bought." },
                { sel: PF("manager"), label: "Manager", text: "Living, or the third-party manager." },
                { sel: PF("dataSource"), label: "Data source", text: "Living Yardi, Third-party or Manual." },
                { sel: PF("yardiCode"), label: "Yardi property code", text: "Its code in Yardi." },
                { sel: PF("noiOverride"), label: "NOI override", text: "Typed by you only. Replaces the T12’s NOI everywhere. Clear it to go back." },
                { sel: PF("notes"), label: "Notes", text: "Anything else." }
              ] },
            { title: "A filled-in profile",
              text: "The made-up property, after its fields were typed in. The name, units, acquisition date and manager make it complete.",
              go: async (h) => { await pick(h, NAME); await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = true; }); await h.wait(300); },
              shot: "#propProfilePanel details",
              marks: [
                { sel: "#propProfilePanel summary span.text-emerald-600", label: "Profile complete", text: "Every needed fact is in." },
                { sel: PF("address"), label: "Address / market", text: "A made-up address." },
                { sel: PF("residentialUnits"), label: "Residential units", text: "Typed by you." },
                { sel: PF("residentialUnits") + " p", label: "Last changed", text: "Who changed it, and when." },
                { sel: '[data-pfhist="residentialUnits"]', label: "history (N)", text: "Its changes so far; click to see them (next picture)." },
                { sel: PF("yearBuilt"), label: "Year built", text: "A year before 1800 or after this year is refused." },
                { sel: PF("acquisitionDate"), label: "Acquisition date", text: "Picked from the calendar." },
                { sel: PF("manager"), label: "Manager", text: "Typed: Living." },
                { sel: PF("dataSource"), label: "Data source", text: "Picked from its list." },
                { sel: PF("noi"), label: "NOI (annual, entered)", text: "Only on a property with no loan: an NOI to use until it has a T12." },
                { sel: PF("noiOverride"), label: "NOI override", text: "Replaces any other NOI: the T12’s and the entered one." }
              ] },
            { title: "A field’s history",
              text: "Opened by **history (N)** next to a field’s name.",
              go: async (h) => { await h.click('[data-pfhist="residentialUnits"]', { wait: 500 }); },
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
        { title: "The rent roll",
          views: [
            { title: "The summary",
              text: "On every property’s page, once a rent roll is imported. Underwriting fills its units and rent from it.",
              go: async (h) => { await pick(h, NAME); await h.wait(500); },
              shot: "#propUnitStatsPanel > div",
              marks: [
                { sel: "#propUnitStatsPanel p", nth: 0, label: "From", text: "The file it came from." },
                { sel: "[data-rrimportfor]", label: "Update", text: "Replaces it with a newer rent roll. Before the first import this reads **Import rent roll**." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 0, label: "Units", text: "Residential units in the rent roll." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 1, label: "Occupied", text: "Units with a resident." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 2, label: "Vacant", text: "Empty units." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 3, label: "Avg market", text: "The average market rent, a month." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 4, label: "Avg in-place", text: "The average rent actually charged, a month." },
                { sel: "#propUnitStatsPanel .grid > div", nth: 5, label: "Sq ft", text: "The units’ total square feet." },
                { sel: "#rrWarnToggle", label: "To check", text: "Rows worth a look; click to list them.", optional: true }
              ] },
            { title: "The import window",
              text: "Opened by **Import rent roll** or **Update**, once the file is picked. Here a newer made-up rent roll for the same property.",
              go: async (h) => { await openImport(h, "Birch Commons rent roll, newer (made-up).csv", true); },
              shot: "#rrImportModal > div",
              marks: [
                { sel: "#rrImportSub", label: "The file", text: "Its name and how many parts it has." },
                { sel: "#rrImportBody [data-partscard] > p", label: "What the app found", text: "Which part is set to which property." },
                { sel: "#rrImportX", label: "✕", text: "Closes the window; nothing is saved." },
                { sel: '[data-partuse="1"]', label: "Use this part", text: "Ticked: this part is imported." },
                { sel: '[data-partsel="1"]', label: "Which property", text: "The property this part belongs to, or “Add as a new property”." },
                { sel: '[data-partsadd="1"]', label: "+ another property", text: "The same part for one more property." },
                { sel: "#rrImportNote", label: "Note", text: "Nothing is saved until you click **Import**." },
                { sel: "#rrImportCancel", label: "Cancel", text: "Closes the window; nothing is saved." },
                { sel: "#rrImportApply", label: "Import", text: "Saves the file to the property’s folder and reads its summary." }
              ],
              after: async (h) => { await h.click("#rrImportCancel", { wait: 500 }); } }
          ] },
        { title: "The Add Property window and its questions",
          text: "Opened by **Add Property** in the bar. Before it makes a property, the app checks the name.",
          views: [
            { title: "Add Property",
              go: async (h) => { await pick(h, "Queens Gate Apartments"); await h.click("#addPropBtn", { wait: 400 }); },
              shot: ADDPROP,
              marks: [
                { sel: "#addPropName", label: "Property name", text: "The property’s name: enough to start." },
                { sel: "#addPropCancel", label: "Cancel", text: "Closes it; nothing is made." },
                { sel: "#addPropCreate", label: "Create", text: "Checks the name, then adds the property." }
              ] },
            { title: "No name",
              go: async (h) => { await h.click("#addPropCreate", { wait: 300 }); },
              shot: ADDPROP,
              marks: [ { sel: "#addPropErr", label: "Enter a property name", text: "**Create** with no name asks for one." } ],
              after: async (h) => { await h.click("#addPropCancel", { wait: 300 }); } },
            { title: "A similar name",
              text: "A name that looks like one you have (here “Birch Commons”).",
              go: async (h) => { await addProp(h, "Birch Commons"); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "Looks like", text: "The property, or properties, it looks like." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing is made." },
                { sel: "#confirmAlt", label: "Create anyway", text: "It is a different property: make it." },
                { sel: "#confirmOk", label: "Open it", text: "It is the same property: open the one you have." }
              ],
              after: cancelConfirm },
            { title: "An archived name",
              text: "A name you archived before (here the made-up “Old Mill (example)”).",
              go: async (h) => { await addProp(h, "Old Mill (example)"); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmTitle", label: "Already exists", text: "And when it was archived." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." },
                { sel: "#confirmAlt", label: "Start fresh", text: "Deletes the archived property’s data for good and makes a new, empty one. It asks again first." },
                { sel: "#confirmOk", label: "Restore it", text: "Un-archives the old one, with all its data." }
              ],
              after: cancelConfirm },
            { title: "A loan’s name",
              text: "A name that is one of your loans, or an address (here the sample “Avalon WP (Mezz)”), is not a new property.",
              go: async (h) => { await addProp(h, "Avalon WP (Mezz)"); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "Whose it is", text: "Which property the name belongs to." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing is made." },
                { sel: "#confirmOk", label: "Add a loan to it", text: "Opens a new loan form on that property." }
              ],
              after: cancelConfirm }
          ] },
        { title: "Archived properties",
          text: "**Archive** on the page of a property with no loan, or **Remove** in the bar for a property with loans, takes it out of the Portfolio page, the totals and the assistant, and keeps everything. An archived property’s page shows **Un-archive** and **Delete permanently**, and the Portfolio page lists it in its **Archived** strip near the bottom. See [Archive or delete a property](archive-or-delete-a-property) for the pictures." }
      ] },

    // ==================================================================================================================
    { id: "rename-a-property", kind: "howto", group: "Properties", title: "Rename a property",
      description: "Change a property’s name, on every loan, file and list at once.",
      intro: "A property has one name, used everywhere. Change it in the property’s profile and the page, the property list and the Portfolio page all use the new name at once.",
      sections: [
        { title: "Type the new name",
          steps: [
            { text: "Open the property’s profile: see [Fill in a property’s profile](fill-in-the-profile#open-the-profile).",
              go: async (h) => { await pick(h, NAME); } },
            { text: "Type the new name in **Property name**." },
            { text: "Leave the field: press Tab, or click elsewhere. The new name is saved, and the old one is kept in the field’s history.",
              go: async (h) => { await pfSet(h, "propertyName", NEWNAME); await h.wait(800); await pick(h, NEWNAME); },
              shot: '#propProfilePanel h4:has-text("Identity") >> xpath=..',
              marks: [
                { sel: PF("propertyName"), label: "Property name", text: "The new name, saved." },
                { sel: '[data-pfhist="propertyName"]', label: "history (2)", text: "The old name and the new one." },
                { sel: PF("address"), label: "Address / market", text: "Changing it changes the address on all its loans." }
              ] }
          ],
          note: "On a property with loans, the name changes on every loan (a mezzanine loan keeps “(Mezz)”), and its files and chats move with it. If the new name already has files of its own, the app asks first: put them together, or don’t rename." },
        { title: "Check the new name",
          steps: [
            { text: "Look at the top of the property’s page. The page, the property list and the Portfolio page all use the new name.",
              go: async (h) => { await pick(h, NEWNAME); },
              shot: "#propHeader > div",
              marks: [
                { sel: "#propHeader h2", label: "The new name", text: "On its page, and in the property list." },
                { sel: "[data-propadd]", label: "+ Add the first loan", text: "A loan on the renamed property." },
                { sel: "[data-proparchive]", label: "Archive", text: "See [Archive or delete a property](archive-or-delete-a-property)." }
              ] }
          ] }
      ],
      next: [
        { page: "archive-or-delete-a-property", text: "Take a property out of the book." },
        { page: "ref-property-page", anchor: "the-profile", text: "Every field of the profile." }
      ] },

    // ==================================================================================================================
    { id: "archive-or-delete-a-property", kind: "howto", group: "Properties", title: "Archive or delete a property",
      description: "Take a property out of the book and keep its data, bring it back, or delete it for good.",
      intro: "Archiving takes a property out of the Portfolio page, the totals and the assistant, and keeps all its data, ready to bring back. Deleting removes it for good. Only an archived property can be deleted.",
      sections: [
        { title: "Archive the property",
          steps: [
            { text: "Open the property’s page.",
              go: async (h) => { await pick(h, NEWNAME); } },
            { text: "Click **Archive** on its page. On a property with loans, click **Remove** in the bar at the top instead: it archives the property with all its loans. The app asks first.",
              go: async (h) => { await h.click("[data-proparchive]", { wait: 500 }); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "What happens", text: "It leaves the Portfolio page, the totals and the assistant." },
                { sel: "#confirmCancel", label: "Cancel", text: "Keeps it as it is." },
                { sel: "#confirmOk", label: "Archive", text: "Archives it." }
              ] },
            { text: "Click **Archive**. The page now says “archived”.",
              go: async (h) => { await h.click("#confirmOk", { wait: 900 }); await h.calm(); await h.top(); },
              shot: "#propHeader > div",
              marks: [
                { sel: "#propHeader h2 span", label: "archived", text: "Out of the Portfolio page, the totals and the assistant." },
                { sel: "[data-propunarchive]", label: "Un-archive", text: "Brings it back, with all its data." },
                { sel: "[data-propdelete]", label: "Delete permanently", text: "Removes it for good (it asks first)." }
              ] }
          ] },
        { title: "Bring it back",
          steps: [
            { text: "Click **Un-archive** on its page. It is back in the Portfolio page and the totals, with its profile, rent roll and files.",
              go: async (h) => { await h.click("[data-propunarchive]", { wait: 900 }); await h.calm(); await h.top(); },
              shot: "#propHeader > div",
              marks: [
                { sel: "#propHeader h2", label: "Back", text: "No longer archived." },
                { sel: "[data-proparchive]", label: "Archive", text: "Archives it again." }
              ] },
            { text: "Or, on the Portfolio page, click the property’s name in the **Archived** strip near the bottom. The strip lists every archived property; here the made-up “Old Mill (example)”.",
              go: async (h) => { await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(700); },
              shot: card("#portfolioView [data-unarchive]"),
              marks: [
                { sel: "#portfolioView [data-unarchive]", label: "Un-archive", text: "Click the name: it is back in the Portfolio page and the totals." },
                { sel: "#portfolioView [data-harddelete]", label: "Delete permanently", text: "The bin removes it and its files for good (it asks first)." }
              ] }
          ] },
        { title: "Delete it for good",
          steps: [
            { text: "Archive the property, as above. Only an archived property can be deleted.",
              go: async (h) => { await pick(h, NEWNAME); await h.click("[data-proparchive]", { wait: 500 }); await h.click("#confirmOk", { wait: 900 }); await h.calm(); await h.top(); } },
            { text: "Click **Delete permanently** on its page. The window lists exactly what goes: its loans, T12, documents, chats, profile and figures.",
              go: async (h) => { await h.click("[data-propdelete]", { wait: 900 }); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "What goes", text: "Everything about the property, listed." },
                { sel: "#confirmCancel", label: "Cancel", text: "Keeps it, archived." },
                { sel: "#confirmOk", label: "Delete permanently", text: "Deletes it for good." }
              ] },
            { text: "Click **Delete permanently**. The property is deleted, and you are back on the Portfolio page.",
              go: async (h) => { await h.click("#confirmOk", { wait: 1200 }); } }
          ],
          warning: "Deleting can’t be undone in the app. The automatic backups keep a copy: see [Back up and restore](back-up-and-restore). Portfolio conversations that mention the property are kept." }
      ],
      next: [
        { page: "bring-back-removed", text: "Bring back a removed loan or property from the Portfolio page." },
        { page: "add-a-property", text: "Add a property." }
      ] }
  ]
};
// keep the pointer off the picture: hover colours would show on whatever is under it
SPEC.pages.forEach(p => (p.sections || []).forEach(s => (s.steps || []).concat(s.views || []).forEach(st => { const go = st.go; st.go = async (h) => { if (go) await go(h); await h.page.mouse.move(1, 1).catch(() => {}); }; })));
module.exports = SPEC;
