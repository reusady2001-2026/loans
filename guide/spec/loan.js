/* Guide chapter: Loans — open, add, edit, flag and remove a loan, a senior + mezzanine stack, a pooled loan and its
   releases, and At the Reset; and the reference pages for a loan’s page and the loan form.
   Looking only: the app’s built-in sample loans (Queens Gate, M Lofts, Avalon White Plains, Living Lofts). Everything
   that is added, changed or removed is MADE-UP: “Maple Court (example)”, “Hawthorn Place (example)”, “Aspen Yard
   (example)”, “Birch Commons (example)”, “Cedar Point (example)” and “Juniper Flats (example)”. The reference page for
   the form fills one in for “Rowan Terrace (example)” and never saves it. */
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
const COMBINED = '#profileBody section:has(h3:has-text("Combined position"))';
const ROWS = card("#portfolioView tr[data-goto]");
const ROW = (name) => '#portfolioView tr[data-goto]:has-text("' + name + '")';

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
// the Portfolio page's Portfolio detail, with Avalon White Plains' two loans showing
const detail = async (h) => {
  await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(600);
  await h.js(() => { const t = [...document.querySelectorAll("#portfolioView tr[data-proptoggle]")].find(r => /Avalon White Plains/.test(r.innerText)); if (t && !t.classList.contains("prop-open")) t.click(); }); await h.wait(400);
};
// a property's page with its profile folded (it opens by itself on a property with no loan)
const noProfile = async (h) => { await h.js(() => { const d = document.querySelector("#propProfilePanel details"); if (d) d.open = false; }); await h.wait(300); };
const addForm = async (h) => { await h.openLoan(/Queens Gate/); await h.click("#addBtn", { wait: 900 }); await h.calm(); await h.top(); };
const editForm = async (h, name) => { await pick(h, name); await h.click("#loanRecEdit", { wait: 900 }); await h.calm(); };
// made-up terms: a new 10-year fixed loan, rate = the 10-year Treasury + the spread
const fixedTerms = async (h) => {
  await fill(h, "originalAmount", "12000000"); await pickSel(h, "rateType", "Fixed"); await pickSel(h, "lienPosition", "Senior");
  await fill(h, "originationDate", "2024-03-15"); await fill(h, "firstPaymentDate", "2024-05-01"); await fill(h, "maturityDate", "2034-04-01");
  await fill(h, "loanTermMonths", "120"); await fill(h, "amortizationMonths", "360"); await pickSel(h, "amortMethod", "Actual/360");
  await pickSel(h, "amortType", "Level"); await fill(h, "ioMonths", "24"); await pickSel(h, "index", "ust10y"); await fill(h, "spread", "1.85");
};
// made-up terms: a hybrid ARM with a set payment (Fixed P&I), fixed 5 years, then the 5-year Treasury + 1.25%
const hybridTerms = async (h) => {
  await fill(h, "originalAmount", "9000000"); await pickSel(h, "rateType", "Hybrid ARM"); await fill(h, "annualRate", "4.25");
  await fill(h, "originationDate", "2021-06-15"); await fill(h, "firstPaymentDate", "2021-08-01"); await fill(h, "maturityDate", "2031-07-01");
  await fill(h, "loanTermMonths", "120"); await fill(h, "amortizationMonths", "360"); await pickSel(h, "amortType", "Fixed P&I");
  await fill(h, "fixedAmortAmount", "44275"); await pickSel(h, "armResetPayment", "Keep the stated payment"); await fill(h, "ioMonths", "0");
  await pickSel(h, "index", "ust5y"); await fill(h, "spread", "1.25"); await fill(h, "armInitialFixedMonths", "60"); await fill(h, "armAdjustFreqMonths", "60");
};

const SPEC = {
  id: "loan",
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
  pages: [
    // ==================================================================================================================
    { id: "open-a-loan", kind: "howto", group: "Loans", title: "Open a loan",
      description: "Open a loan’s page from the Portfolio page or from the property list.",
      intro: "A loan’s page shows one loan in full: its main figures, its coverage, its terms and every payment. Open it from its row on the Portfolio page, or pick its property under **Specific Property**.",
      sections: [
        { title: "From the Portfolio page",
          steps: [
            { text: "On the **Portfolio** tab, scroll down to **Portfolio detail**. Every loan has a row there, grouped by property." },
            { text: "Click the loan’s row. A property with two loans is one bold row: click it to show its loans, then click the one you want.",
              go: detail,
              shot: ROWS,
              marks: [
                { sel: ROW("Queens Gate Apartments"), label: "A loan", text: "Click the row to open the loan’s page." },
                { sel: '#portfolioView tr[data-proptoggle]:has-text("Avalon White Plains")', label: "A property with 2 loans", text: "Click to show or hide its loans. Its row adds the two together." },
                { sel: '#portfolioView tr[data-propmember]:has-text("Avalon WP (Mezz)")', label: "One of its loans", text: "Marked senior or mezz. Click it to open that loan." },
                { sel: '#portfolioView tr[data-openprop]:has-text("Aspen Yard (example)")', label: "No loan yet", text: "A property with no loan sits at the bottom. Clicking it opens it in Underwriting." }
              ] },
            { text: "The loan’s page opens on the **Specific Property** side. Scroll down for the Loan Record and the payment schedule.",
              go: async (h) => { await h.openLoan(/Queens Gate/); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#loanSelect", label: "Select a property", text: "The property showing. Pick another one here." },
                { sel: "#kpiGrid", label: "The tiles", text: "The loan’s main figures, worked out for today." },
                { sel: "#loanOpPanel > div", label: "NOI box", text: "The property’s NOI and coverage." },
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the Portfolio page." }
              ] }
          ] },
        { title: "From the property list",
          steps: [
            { text: "Under the tabs, click **Specific Property**." },
            { text: "Pick the property in **Select a property**. Its page opens. Next to a name the list says “senior + mezz” (two loans), “in a pooled loan” or “no loan yet”." }
          ] }
      ],
      next: [
        { page: "ref-loan-page", text: "Every part of a loan’s page, named." },
        { page: "edit-a-loan", text: "Change a loan’s terms." },
        { page: "find-a-loan", text: "Find a loan by property or by lender." }
      ] },

    // ==================================================================================================================
    { id: "add-a-loan", kind: "howto", group: "Loans", title: "Add a loan",
      description: "Put a loan in the book from its terms. The app works out the rest.",
      intro: "**Add Loan** opens an empty loan form. You type the terms from the loan papers; the app works out the balance, the payments, the debt service and the whole schedule from them. A new property name makes a new property, so a loan and its property can be added in one go.",
      before: [ "The loan’s terms, from its papers: the amount, the dates, the term, the amortization and the rate." ],
      sections: [
        { title: "Open the form",
          steps: [
            { text: "Click **Specific Property** and pick the property the loan is on. For a property that isn’t in the app yet, any property will do." },
            { text: "Click **Add Loan**. An empty loan form opens, with the property’s name already in **Property Name**.",
              go: addForm,
              shot: "view",
              marks: [
                { sel: "#formTitle", label: "Add Loan", text: "A new loan. (Editing a loan says “Edit Loan”.)" },
                { sel: "#f_propertyName", label: "Property Name", text: "The property you were on." },
                { sel: "#saveBtn", label: "Save Loan", text: "Saves the loan once the form is filled in." }
              ] }
          ] },
        { title: "Fill in the loan",
          text: "Fields with a red * are required. Leave out what you don’t have.",
          steps: [
            { text: "In **Loan Identification**, check **Property Name**. To put the loan on another property, type its name; a name the app doesn’t know makes a new property." },
            { text: "Type the **Property Address**, the **Lender Name** and the **Loan Number**, and pick the **Property Type**.",
              go: async (h) => {
                await fill(h, "propertyName", "Maple Court (example)"); await fill(h, "propertyAddress", "12 Maple Ave, Springfield");
                await pickSel(h, "propertyType", "Multifamily"); await fill(h, "lenderName", "Example Bank"); await fill(h, "loanNumber", "EX-1001");
              },
              shot: FS("Loan Identification"),
              marks: [
                { sel: FW("propertyName"), label: "Property Name", text: "Here a made-up new property, “Maple Court (example)”." },
                { sel: FW("propertyAddress"), label: "Property Address", text: "Two loans at the same address are one property." }
              ],
              note: "Leave **Also secures** empty for a loan on one property. For one loan on several, see [Add a loan on several properties](add-a-pooled-loan)." },
            { text: "In **Loan Terms**, type the amount, pick the **Rate Type**, and type the dates, the term, the amortization and any interest-only months." },
            { text: "Set the rate. For a new fixed loan, pick the **Index** and type your **Spread**: the green line shows the rate the loan will lock. For a loan that already exists, tick **This is a historical loan** and type its rate.",
              go: fixedTerms,
              shot: FS("Loan Terms"),
              marks: [
                { sel: "#loanForm [data-histrow]", label: "Historical loan", text: "Tick it for a loan that already exists, and type its locked rate." },
                { sel: FW("index"), label: "Index", text: "The index the rate is built on." },
                { sel: FW("spread"), label: "Spread", text: "Your margin over the index, in %." },
                { sel: "#f_ratePreview", label: "Locked rate", text: "Today’s index + your spread: the rate this new loan locks." }
              ] },
            { text: "Under **Escrows & Reserves** and **Additional Fees**, type the monthly amounts paid with the loan. They add to the loan’s total monthly debt service.",
              go: async (h) => { await fill(h, "escrowTax", "8500"); await fill(h, "escrowInsurance", "2100"); await fill(h, "replacementReserve", "1500"); await fill(h, "servicingFee", "250"); } }
          ] },
        { title: "Save the loan",
          steps: [
            { text: "Click **Save Loan** at the top of the form. The new loan’s page opens, with its figures worked out.",
              go: async (h) => { await saveLoan(h); },
              shot: "#kpiGrid",
              marks: [
                { sel: TILE(0).sel, nth: 0, label: "Total Monthly Debt Service", text: "P&I, plus the escrows and the fee typed in the form." },
                { sel: TILE(1).sel, nth: 1, label: "Monthly P&I", text: "Interest-only for the first 24 months, then the amortizing payment." },
                { sel: TILE(7).sel, nth: 7, label: "Rate Type", text: "Fixed, at the rate it locked." }
              ] }
          ],
          note: "If a required field is empty, nothing is saved: a red line at the top of the form says what is missing. Fix it and click **Save Loan** again." }
      ],
      next: [
        { page: "edit-a-loan", text: "Change a term later." },
        { page: "add-a-loan-stack", text: "Add a mezzanine loan behind it." },
        { page: "ref-loan-form", text: "Every field of the form, explained." }
      ] },

    // ==================================================================================================================
    { id: "edit-a-loan", kind: "howto", group: "Loans", title: "Edit a loan",
      description: "Change any of a loan’s terms. Every change is kept in the loan’s history.",
      intro: "**Edit** in the Loan Record opens the loan form with the loan’s values. Change what you need and save: the tiles and the schedule follow at once, and the change is kept in the loan’s history.",
      sections: [
        { title: "Change a field",
          steps: [
            { text: "Open the loan and scroll down to the **Loan Record**." },
            { text: "Click **Edit** in the Loan Record. The form opens with the loan’s values." },
            { text: "Change the field. Here the lender’s name is changed.",
              go: async (h) => { await editForm(h, "Maple Court (example)"); await fill(h, "lenderName", "Example Bank N.A."); },
              shot: FS("Loan Identification"),
              marks: [
                { sel: FW("lenderName"), label: "The changed field", text: "Type the new value." },
                { sel: FW("propertyName"), label: "Property Name", text: "A new name here renames the property (see the note below)." }
              ] },
            { text: "Click **Save Loan**.",
              go: async (h) => { await saveLoan(h); } }
          ],
          note: "A new **Property Name** renames the property: its files and chats move with it, and if that name already has files the app asks first. For a property with several loans, rename it in its profile. **Edit** at the top of the page opens the property’s profile, not the loan." },
        { title: "See what changed",
          steps: [
            { text: "Look at the Loan Record. A changed field shows **history (1)**, and **Change history** lists every change to this loan.",
              go: async (h) => { await h.top(); },
              shot: card("#profileBody"),
              marks: [
                { sel: '[data-loanhist="lenderName"]', label: "history (1)", text: "This field’s changes." },
                { sel: '#profileBody [data-loanhist=""]', label: "Change history", text: "Every change to this loan, newest first." }
              ] },
            { text: "Click **history (1)**. Each change shows when it was made, the old and new values, who made it and where it came from.",
              go: async (h) => { await h.click('[data-loanhist="lenderName"]', { wait: 500 }); },
              shot: "#historyModal > div",
              marks: [
                { sel: "#historyBody th", nth: 0, label: "When", text: "The day and time of the change." },
                { sel: "#historyBody th", nth: 1, label: "Old → new", text: "What it was and what it became." },
                { sel: "#historyBody th", nth: 2, label: "Who", text: "Who made the change." },
                { sel: "#historyBody th", nth: 3, label: "Where from", text: "Typed by hand, the assistant, an Excel import, a refinance…" }
              ],
              after: async (h) => { await h.closeModals(); } }
          ] }
      ],
      next: [
        { page: "set-loan-status", text: "Flag a loan out of date, or change its status." },
        { page: "ref-loan-form", text: "What each field of the form means." },
        { page: "ref-loan-page", anchor: "the-loan-record", text: "The Loan Record and its buttons." }
      ] },

    // ==================================================================================================================
    { id: "set-loan-status", kind: "howto", group: "Loans", title: "Mark a loan out of date or change its status",
      description: "Flag a loan whose terms are no longer right, and say where a loan stands.",
      intro: "When a loan’s terms are no longer right — say it was refinanced and the new loan’s papers haven’t come — mark it out of date. Its figures stay as they are, but every place that shows them warns you. A loan’s status says where it stands: Active, Matured, Extended, Extension undecided or Paid off.",
      sections: [
        { title: "Mark a loan out of date",
          steps: [
            { text: "Open the loan and click **Out of date…** in the Loan Record.",
              go: async (h) => { await pick(h, "Maple Court (example)"); await h.click("#loanRecStale", { wait: 500 }); },
              shot: "#staleModal > div",
              marks: [
                { sel: "#staleNote", label: "Why", text: "A short reason. It shows on the loan’s page, its refinance and Needs Attention." },
                { sel: "#staleGo", label: "Mark out of date", text: "Flags the loan. Nothing in it is changed." }
              ] },
            { text: "Under **Why**, say why in a few words. The box starts with “Refinanced — waiting for the new loan’s documents”." },
            { text: "Click **Mark out of date**. An amber warning shows under the tiles; the loan’s refinance and **Needs Attention** on the Portfolio page say so too.",
              go: async (h) => { await h.click("#staleGo", { wait: 700 }); await h.calm(); await h.top(); },
              shot: "#staleBanner",
              marks: [
                { sel: "[data-stalebanner]", label: "Out of date", text: "Since when, and why. Don’t rely on its figures until the new loan is in." },
                { sel: "[data-stalefix]", label: "It’s up to date again", text: "Clears the flag (it asks first)." }
              ] }
          ],
          tip: "When the new loan’s papers come, add the new loan and set this one’s status to **Paid off**." },
        { title: "Clear the flag",
          steps: [
            { text: "Click **It’s up to date again** on the warning, or **Up to date again** in the Loan Record. It asks once.",
              go: async (h) => { await h.click("[data-stalefix]", { wait: 500 }); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmTitle", label: "The question", text: "Clear “out of date” on this loan?" },
                { sel: "#confirmOk", label: "Clear", text: "Clears the flag; the warning goes away." }
              ] },
            { text: "Click **Clear**. The change is kept in the loan’s history.",
              go: async (h) => { await h.click("#confirmOk", { wait: 600 }); } }
          ] },
        { title: "Change the status",
          steps: [
            { text: "Click **Edit** in the Loan Record." },
            { text: "Pick the status in **Loan Status**, under Loan Terms.",
              go: async (h) => { await editForm(h, "Maple Court (example)"); await pickSel(h, "loanStatus", "Extension undecided"); },
              shot: FS("Loan Terms"),
              marks: [
                { sel: FW("loanStatus"), label: "Loan Status", text: "Here: Extension undecided." },
                { sel: FW("maturityDate"), label: "Maturity Date", text: "With no status set, a loan past this date reads Matured." }
              ] },
            { text: "Click **Save Loan**. The status shows as a tag on the loan’s row on the Portfolio page.",
              go: async (h) => { await saveLoan(h); await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(600); await h.scroll(ROW("Maple Court (example)"), 0, "center"); },
              shot: ROWS,
              marks: [
                { sel: ROW("Maple Court (example)") + " [data-loanstatus]", label: "Extension undecided", text: "The made-up loan’s new status." },
                { sel: ROW("Queens Gate Apartments") + " [data-loanstatus]", label: "Active", text: "A loan with no status set, before its maturity." }
              ] }
          ],
          note: "Left blank, the status reads **Active**, or **Matured** once the maturity date has passed. **Extended**: the lender extended the loan. **Extension undecided**: waiting on an answer. Matured and Extension undecided are also highlighted in the maturity calendar and the roll-up. **Paid off** takes the loan out of every total and lists it under **Removed & paid-off loans** on the Portfolio page." }
      ],
      next: [
        { page: "check-what-needs-attention", text: "See the flag in Needs Attention." },
        { page: "remove-a-loan", text: "Take a loan out of the totals." },
        { page: "read-the-calendar", text: "Matured loans in the maturity calendar." }
      ] },

    // ==================================================================================================================
    { id: "add-a-loan-stack", kind: "howto", group: "Loans", title: "Add a senior and a mezzanine loan",
      description: "Add a mezzanine loan behind a property’s senior loan, and read the two together.",
      intro: "A property with a senior loan and a mezzanine loan behind it is one property with two loans. Its page adds them together, and the Loan Record shows each loan and the two combined. Here a made-up mezzanine loan is added to “Hawthorn Place (example)”, whose senior loan is already in the app.",
      before: [ "The senior loan in the app. See [Add a loan](add-a-loan)." ],
      prep: async (h) => {
        // the made-up senior loan
        await addForm(h);
        await fill(h, "propertyName", "Hawthorn Place (example)"); await fill(h, "propertyAddress", "40 Hawthorn St, Springfield");
        await pickSel(h, "propertyType", "Multifamily"); await fill(h, "lenderName", "Example Bank"); await fill(h, "loanNumber", "EX-2001");
        await fill(h, "originalAmount", "30000000"); await pickSel(h, "rateType", "Fixed"); await pickSel(h, "lienPosition", "Senior");
        await fill(h, "originationDate", "2025-01-15"); await fill(h, "firstPaymentDate", "2025-03-01"); await fill(h, "maturityDate", "2035-02-01");
        await fill(h, "loanTermMonths", "120"); await fill(h, "amortizationMonths", "360"); await fill(h, "ioMonths", "36");
        await pickSel(h, "index", "ust10y"); await fill(h, "spread", "1.70");
        await saveLoan(h);
      },
      sections: [
        { title: "Add the mezzanine loan",
          steps: [
            { text: "Open the property’s page: click **Specific Property** and pick it in the list.",
              go: async (h) => { await pick(h, "Hawthorn Place (example)"); } },
            { text: "Click **Add Loan**. **Property Name** is already the property’s name.",
              go: async (h) => { await h.click("#addBtn", { wait: 900 }); await h.calm(); } },
            { text: "Type the same **Property Address** as the senior loan’s. Two loans at the same address are one property.",
              go: async (h) => { await fill(h, "propertyAddress", "40 Hawthorn St, Springfield"); await fill(h, "lenderName", "Example Mezz Fund"); await fill(h, "loanNumber", "EX-2002"); } },
            { text: "In **Loan Terms**, pick **Mezzanine** in **Lien Position**, and fill in the mezzanine loan’s terms.",
              go: async (h) => {
                await fill(h, "originalAmount", "6000000"); await pickSel(h, "rateType", "Fixed"); await pickSel(h, "lienPosition", "Mezzanine");
                await fill(h, "originationDate", "2025-01-15"); await fill(h, "firstPaymentDate", "2025-03-01"); await fill(h, "maturityDate", "2035-02-01");
                await fill(h, "loanTermMonths", "120"); await fill(h, "ioMonths", "120"); await pickSel(h, "index", "ust10y"); await fill(h, "spread", "5.25");
              },
              shot: FS("Loan Terms"),
              marks: [
                { sel: FW("lienPosition"), label: "Lien Position", text: "Mezzanine: paid after the senior loan." },
                { sel: FW("ioMonths"), label: "Interest-Only Period", text: "Here interest-only for the whole term, so no amortization is needed." }
              ] },
            { text: "Click **Save Loan**.",
              go: async (h) => { await saveLoan(h); } }
          ] },
        { title: "Read the two loans together",
          steps: [
            { text: "Open the property again. In the property list it now reads “senior + mezz”. Its tiles add the two loans: the balance, the P&I and the debt service.",
              go: async (h) => { await pick(h, "Hawthorn Place (example)"); },
              shot: "#kpiGrid",
              marks: [
                Object.assign(TILE(0), { label: "Total Monthly Debt Service", text: "Both loans together." }),
                Object.assign(TILE(1), { label: "Monthly P&I", text: "Both P&I payments." }),
                Object.assign(TILE(2), { label: "Current Balance", text: "Both balances added." }),
                Object.assign(TILE(7), { label: "Rate Type", text: "Each loan’s type, and the blended rate." })
              ] },
            { text: "Scroll down to **Combined position**, at the top of the Loan Record: each loan, and the two together.",
              shot: COMBINED,
              marks: [
                { sel: "[data-loanjump]", nth: 0, label: "The senior loan", text: "Click to open only this loan’s page." },
                { sel: "[data-loanjump]", nth: 1, label: "The mezz loan", text: "Click to open only the mezz." },
                { sel: "[data-loanedit]", nth: 1, label: "Edit this loan", text: "Opens this one loan’s form." },
                { sel: "[data-loanremove]", nth: 1, label: "Remove this loan", text: "Removes only this loan (it asks first)." }
              ] }
          ],
          note: "On a property with two loans, the pencil and the bin on each loan’s row edit and remove that one loan. The coverage figures (DSCR, debt yield) stay empty until the property has an NOI." }
      ],
      next: [
        { page: "ref-loan-page", anchor: "two-loans-on-one-property", text: "Every figure in Combined position." },
        { page: "add-a-pooled-loan", text: "One loan on several properties instead." },
        { page: "upload-a-t12", text: "Give the property an NOI from its T12." }
      ] },

    // ==================================================================================================================
    { id: "add-a-pooled-loan", kind: "howto", group: "Loans", title: "Add a loan on several properties",
      description: "Add one loan secured by several properties, and release a property from it later.",
      intro: "A pooled loan is one loan secured by several properties: one payment, with coverage read on the whole pool. You add it like any loan, on its main property, and tick the other properties it secures. Here a made-up loan on “Aspen Yard (example)” also secures “Birch Commons (example)” and a property not in the app yet, “Cedar Point (example)”.",
      sections: [
        { title: "Add the loan",
          steps: [
            { text: "Open the main property’s page and click **Add Loan**. On a property with no loan yet, the button is **+ Add the first loan**.",
              go: async (h) => { await pick(h, "Aspen Yard (example)"); await h.click("[data-propadd]", { wait: 900 }); await h.calm(); } },
            { text: "Fill in the loan’s terms as for any loan. See [Add a loan](add-a-loan).",
              go: async (h) => {
                await fill(h, "lenderName", "Example Life Co."); await fill(h, "loanNumber", "EX-POOL-7");
                await fill(h, "originalAmount", "20000000"); await pickSel(h, "rateType", "Fixed");
                await fill(h, "originationDate", "2025-06-01"); await fill(h, "firstPaymentDate", "2025-07-01"); await fill(h, "maturityDate", "2030-06-01");
                await fill(h, "loanTermMonths", "60"); await fill(h, "amortizationMonths", "360"); await fill(h, "ioMonths", "24");
                await pickSel(h, "index", "ust5y"); await fill(h, "spread", "2.10");
              } },
            { text: "Under **Also secures**, in Loan Identification, tick each other property the loan secures. Type part of a name in **Find a property** to shorten the list." },
            { text: "If the lender puts a set part of the loan on a property, type it in that property’s **allocated $** box. Without amounts, each property’s share follows its NOI." },
            { text: "For a property that isn’t in the app yet, type its name under the list and click **Add to this loan**.",
              go: async (h) => {
                await h.click('#poolFormPicker [data-poolname="Birch Commons (example)"]', { wait: 300 });
                await h.fill('#poolFormPicker [data-poolformrow="birch commons (example)"] [data-poolformamt]', "6000000");
                await h.fill("#poolFormNew", "Cedar Point (example)", { change: false }); await h.click("#poolFormAdd", { wait: 400 });
                await h.fill("#poolFormSearch", "example", { change: false }); await h.js(() => { document.getElementById("poolFormSearch").dispatchEvent(new Event("input", { bubbles: true })); }); await h.wait(300);
              },
              shot: FS("Loan Identification"),
              marks: [
                { sel: '#poolFormPicker [data-poolname="Birch Commons (example)"]', label: "Ticked", text: "This loan also secures it." },
                { sel: '#poolFormPicker [data-poolformrow="birch commons (example)"] [data-poolformamt]', label: "Allocated $", text: "Optional: the lender’s part of the loan on this property." },
                { sel: '#poolFormPicker [data-poolformrow="cedar point (example)"]', label: "New — added when you save", text: "Not in the app yet: it is created when you save the loan." },
                { sel: "#poolFormAdd", label: "Add to this loan", text: "Adds the name typed beside it, ticked." }
              ] },
            { text: "Click **Save Loan**. The page shows the pool in place of the NOI box: each property’s row, and coverage read on the whole pool.",
              go: async (h) => {
                await saveLoan(h);
                const k = await keyOf(h, "Cedar Point (example)");
                await h.js((a) => window.LDS_setProfileField(a, "noi", 750000), k); await h.wait(300);
                await pick(h, "Aspen Yard (example)");
              },
              shot: "[data-poolpanel]",
              marks: [
                { sel: "[data-poolpanel] h3", label: "Pooled loan", text: "How many properties secure the loan." },
                { sel: "[data-poolpanel] .grid > div", nth: 3, label: "DSCR (pool)", text: "Every property’s NOI ÷ the loan’s yearly debt service." },
                { sel: "[data-poolpanel] th", nth: 4, label: "Alloc. DSCR", text: "Each property’s NOI ÷ its share of the debt service." }
              ] }
          ],
          note: "Each property in the pool shows the same pool panel on its own page, with an **In a pooled loan** tag. The NOIs in these pictures are made up." },
        { title: "Release a property",
          text: "When a property is sold or refinanced on its own, the lender releases it from the pool: its release price is paid down on the loan.",
          steps: [
            { text: "Click **Release…** on the property’s row in the pool panel.",
              go: async (h) => { await h.click(POOLROW("Cedar Point (example)") + " [data-poolrelease]", { wait: 500 }); },
              shot: "#poolRelModal > div",
              marks: [
                { sel: "#poolRelModal p", label: "Its share", text: "Its share of today’s balance, by its allocated amount or by NOI." },
                { sel: "#poolRelPrice", label: "Release price ($)", text: "What is paid down on the loan." },
                { sel: "#poolRelDate", label: "Date", text: "The day of the paydown." },
                { sel: "#poolRelMode", label: "After the paydown", text: "Recalculate the payment, or keep it." }
              ] },
            { text: "Check the **Release price ($)**. It starts at the property’s share of today’s balance; lenders often ask for 105–125% of it." },
            { text: "Check the **Date**, and pick what happens **After the paydown**: recalculate the payment over the remaining amortization, or keep the payment so the loan pays down faster." },
            { text: "Click **Release**. The property leaves the pool and keeps its NOI, with no loan. A line under the pool says what was paid down and when.",
              go: async (h) => { await h.click("#poolRelGo", { wait: 900 }); await h.calm(); await pick(h, "Aspen Yard (example)"); },
              shot: "[data-poolpanel]",
              marks: [
                { sel: "[data-poolpanel] h3", label: "One fewer", text: "The pool now secures 2 properties." },
                { sel: "[data-poolreleases]", label: "Released", text: "Which property, when, how much was paid down, and whether the payment was recalculated." }
              ] }
          ],
          note: "The schedule shows the paydown in its month. If you release the main property, the loan moves to the property with the largest share." }
      ],
      next: [
        { page: "ref-loan-page", anchor: "a-pooled-loan", text: "Every figure in the pool panel." },
        { page: "refinance-together", text: "Refinance several properties under one new loan." }
      ] },

    // ==================================================================================================================
    { id: "set-the-reset", kind: "howto", group: "Loans", title: "Set what the payment does at the reset",
      description: "Tell the app whether a hybrid ARM’s set payment stays the same at the rate reset, or is worked out again.",
      intro: "A hybrid ARM with a set monthly payment needs one more answer: what the payment does when the rate resets. The loan’s note says which. The schedule follows your choice from the reset on. Shown on a made-up loan, “Juniper Flats (example)”.",
      before: [ "A loan whose **Rate Type** is Hybrid ARM and whose **Amortization Type** is Fixed P&I (a set payment from the papers)." ],
      prep: async (h) => {
        await addForm(h);
        await fill(h, "propertyName", "Juniper Flats (example)"); await fill(h, "lenderName", "Example Bank");
        await hybridTerms(h);
        await saveLoan(h);
      },
      sections: [
        { title: "Choose what happens at the reset",
          steps: [
            { text: "Open the loan and click **Edit** in the Loan Record." },
            { text: "In **Loan Terms**, find **At the Reset**. It shows only when Rate Type is Hybrid ARM and Amortization Type is Fixed P&I.",
              go: async (h) => { await editForm(h, "Juniper Flats (example)"); },
              shot: FS("Loan Terms"),
              marks: [
                { sel: FW("rateType"), label: "Hybrid ARM", text: "Fixed first, then it floats." },
                { sel: FW("amortType"), label: "Fixed P&I", text: "A set monthly payment from the papers." },
                { sel: FW("fixedAmortAmount"), label: "Fixed Amortization Payment", text: "That set payment." },
                { sel: FW("armResetPayment"), label: "At the Reset", text: "What the payment does when the rate resets." }
              ],
              after: async (h) => { await h.click("#cancelBtn", { wait: 600 }); } },
            { text: "Pick what the note says. **Keep the stated payment**: the payment stays the same across the reset. **Recalculate over the remaining amortization**: a new payment is worked out at the reset, from what is owed then, over the amortization left, at the new rate." },
            { text: "Click **Save Loan**." }
          ] },
        { title: "Check the schedule at the reset",
          steps: [
            { text: "Scroll down to the payment schedule and find the row marked **Reset →**. With **Keep the stated payment**, the payment stays the same; more of it goes to interest, so less principal is paid.",
              go: async (h) => { await pick(h, "Juniper Flats (example)"); await schedTo(h, RESET_ROW); },
              shot: SCHED,
              marks: [
                { sel: RESET_ROW + ' span:has-text("Reset →")', label: "Reset", text: "The first month at the new rate." },
                { sel: RESET_ROW + " >> xpath=preceding-sibling::tr[1]/td[7]", label: "Payment before", text: "The stated payment." },
                { sel: RESET_ROW + " td:nth-child(7)", label: "Payment after", text: "The same payment." },
                { sel: RESET_ROW + " td:nth-child(8)", label: "Principal paid", text: "Lower than before the reset: the higher rate takes more interest." }
              ] },
            { text: "With **Recalculate over the remaining amortization**, the payment changes at the reset.",
              go: async (h) => {
                await editForm(h, "Juniper Flats (example)");
                await pickSel(h, "armResetPayment", "Recalculate over the remaining amortization"); await saveLoan(h); await schedTo(h, RESET_ROW);
              },
              shot: SCHED,
              marks: [
                { sel: RESET_ROW + ' span:has-text("Reset →")', label: "Reset", text: "The first month at the new rate." },
                { sel: RESET_ROW + " >> xpath=preceding-sibling::tr[1]/td[7]", label: "Payment before", text: "The stated payment." },
                { sel: RESET_ROW + " td:nth-child(7)", label: "New payment", text: "Worked out again at the new rate." }
              ] }
          ] },
        { title: "When the kept payment is less than the interest",
          text: "If the rate after the reset is high enough, a kept payment can be less than the month’s interest. Then no principal is paid, and the unpaid interest is added to what is owed (negative amortization): the balance grows, and is paid back at maturity. Living Lofts, a built-in loan, keeps its payment across its 2026 reset.",
          steps: [
            { text: "Read the note above the schedule. It says from which month the payment is less than the interest, and how much unpaid interest is added.",
              go: async (h) => { await pick(h, "Living Lofts (Middlesex)"); await schedTo(h, "#scheduleBody tr:has([data-schedunpaid])"); },
              shot: SCHED,
              marks: [
                { sel: "#scheduleKeyDates [data-schedunpaidnote]", label: "The payment is less than the interest", text: "From which month, the payment against the interest, and the unpaid interest added over how many months." },
                { sel: "#scheduleBody tr:has([data-schedunpaid]) td:nth-child(8)", label: "Principal paid: $0", text: "Under it, the month’s interest the payment leaves unpaid." },
                { sel: "#scheduleBody tr:has([data-schedunpaid]) td:nth-child(9)", label: "Ending balance", text: "Higher than the starting balance: the unpaid interest is added." }
              ] }
          ],
          warning: "Check the note: many loans require a payment of at least the interest. If yours does, pick **Recalculate over the remaining amortization**." }
      ],
      next: [
        { page: "read-the-calendar", text: "See every rate reset coming up." },
        { page: "ref-loan-form", anchor: "loan-terms", text: "Every Loan Terms field of a hybrid ARM." },
        { page: "ref-loan-page", anchor: "the-payment-schedule", text: "How to read the schedule." }
      ] },

    // ==================================================================================================================
    { id: "remove-a-loan", kind: "howto", group: "Loans", title: "Remove a loan",
      description: "Take one loan out of every total, then restore it or delete it for good.",
      intro: "**Remove** in the Loan Record takes one loan out of every total, tile and the calendar. The loan is kept, so you can restore it as it was, or delete its record for good. The property stays, with its files.",
      sections: [
        { title: "Remove the loan",
          steps: [
            { text: "Open the loan and scroll down to the **Loan Record**." },
            { text: "Click **Remove** in the Loan Record. It asks first.",
              go: async (h) => { await pick(h, "Maple Court (example)"); await h.click("#loanRecRemove", { wait: 500 }); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "What happens", text: "It leaves every total, tile and the calendar, and is listed on the Portfolio page to restore." },
                { sel: "#confirmOk", label: "Remove", text: "Removes the loan." }
              ] },
            { text: "Click **Remove**.",
              go: async (h) => { await h.click("#confirmOk", { wait: 900 }); } }
          ],
          note: "**Remove** at the top of the page is different: it archives the whole property with all its loans." },
        { title: "Bring it back",
          steps: [
            { text: "On the **Portfolio** tab, scroll down to **Removed & paid-off loans**, near the bottom.",
              go: async (h) => { await h.home(); await h.js(() => { document.getElementById("scopePortfolioBtn").click(); }); await h.wait(600); },
              shot: "#inactiveLoansStrip",
              marks: [
                { sel: '#inactiveLoansStrip span.inline-flex:has-text("Maple Court")', label: "The removed loan", text: "Its name, “Removed” (or Paid off), and when." },
                { sel: "#inactiveLoansStrip [data-restoreloan]", label: "Restore", text: "Back into every total, tile and the calendar." }
              ] },
            { text: "Click **Restore**. The loan is back, exactly as it was." }
          ],
          tip: "A loan that was paid off can get the status **Paid off** instead of being removed: it leaves the totals and is listed here the same way. See [Mark a loan out of date or change its status](set-loan-status#change-the-status)." },
        { title: "Delete it for good",
          steps: [
            { text: "Open the property’s page. With no active loan, it lists the removed loan, with **Restore** and a bin.",
              go: async (h) => { await pick(h, "Maple Court (example)"); await noProfile(h); },
              shot: "#propView",
              marks: [
                { sel: "[data-propinactive] span.inline-flex", nth: 1, label: "The removed loan", text: "Its name, “Removed”, and when." },
                { sel: "[data-proprestoreloan]", label: "Restore", text: "Brings the loan back; the page becomes its loan page again." },
                { sel: "[data-propdeleteloan]", label: "Delete permanently", text: "The bin: deletes the loan record." },
                { sel: "[data-propadd]", label: "+ Add the first loan", text: "Adds a new loan to this property." }
              ] },
            { text: "Click the bin. It asks once more.",
              go: async (h) => { await h.click("[data-propdeleteloan]", { wait: 500 }); },
              shot: CONFIRM,
              marks: [
                { sel: "#confirmText", label: "What happens", text: "The record goes for good; only a backup can bring it back." },
                { sel: "#confirmOk", label: "Delete permanently", text: "Deletes the loan record." }
              ],
              after: async (h) => { await h.click("#confirmCancel", { wait: 500 }); } },
            { text: "Click **Delete permanently**. The property and its files stay." }
          ],
          warning: "Delete permanently can’t be undone in the app. The automatic backups keep a copy; see [Back up and restore](back-up-and-restore)." }
      ],
      next: [
        { page: "bring-back-removed", text: "Everything removed or archived, on the Portfolio page." },
        { page: "archive-or-delete-a-property", text: "Archive a whole property instead." }
      ] },

    // ==================================================================================================================
    { id: "ref-loan-page", kind: "reference", group: "Reference", title: "A loan’s page",
      description: "Every part of a loan’s page: the bar at the top, the tiles, the rate notice, the NOI box, the Loan Record and the payment schedule.",
      intro: "Open a loan (see [Open a loan](open-a-loan)) and its page shows, from the top: the tiles, the rate notice, the NOI box, the property’s profile, rent roll and documents, the Loan Record and the payment schedule. Each picture names its controls.",
      sections: [
        { title: "The top of the page",
          views: [
            { text: "The bar under the tabs is the same for every property. **Edit** and **Remove** there work on the property; the Loan Record has its own for the loan.",
              go: async (h) => { await h.openLoan(/Queens Gate/); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#scopePortfolioBtn", label: "Whole Portfolio", text: "Back to the Portfolio page." },
                { sel: "#scopeLoanBtn", label: "Specific Property", text: "This view: one property and its loans." },
                { sel: "#loanSelect", label: "Select a property", text: "Every property, A to Z. Pick one to open its page. The list marks “senior + mezz”, “in a pooled loan” and “no loan yet”." },
                { sel: "#addBtn", label: "Add Loan", text: "An empty loan form, with this property’s name filled in. See [Add a loan](add-a-loan)." },
                { sel: "#addPropBtn", label: "Add Property", text: "Adds a property by its name. See [Add a property](add-a-property)." },
                { sel: "#editBtn", label: "Edit", text: "Opens this property’s profile: its units, manager, NOI override. To change the loan, use **Edit** in the Loan Record." },
                { sel: "#removeBtn", label: "Remove", text: "Archives this property with all its loans (it asks first). To remove one loan, use **Remove** in the Loan Record." },
                { sel: "#refiBtn", label: "Refi Calculator", text: "Opens the refinance for this property. See [Run a refinance](run-a-refinance)." },
                { sel: "#kpiGrid", label: "The tiles", text: "The loan’s main figures (below)." },
                { sel: "#floatBanner", label: "Rate notice", text: "How a floating or hybrid rate is set this month (below)." },
                { sel: "#loanOpPanel > div", label: "NOI box", text: "The property’s NOI and coverage (below). Further down: the profile, rent roll, documents, the Loan Record and the schedule." },
                { sel: '[data-tabsel="home"]', label: "Portfolio tab", text: "This tab. Tools like Underwriting open in tabs next to it." },
                { sel: "#tabNewBtn", label: "+", text: "Opens Underwriting, the Calendar or Data Health in a new tab." },
                { sel: "#dataDD > summary", label: "Data", text: "Back up, restore, and Excel export and import." },
                { sel: "#fetchRateBtn", label: "Fetch live rate", text: "Gets today’s index values (SOFR, Treasuries, Prime)." },
                { sel: "#settingsDD > summary", label: "Settings", text: "The app’s size, the portfolio targets, this guide and more." },
                { sel: "#loanCountLabel", label: "Properties", text: "How many properties are in the book." }
              ] }
          ] },
        { title: "The tiles",
          views: [
            { text: "Eight figures, worked out for today from the Loan Record; you never type them. Change a term and the tiles follow at once.",
              go: async (h) => { await h.openLoan(/Queens Gate/); },
              shot: "#kpiGrid",
              marks: [
                Object.assign(TILE(0), { label: "Total Monthly Debt Service", text: "What goes out each month: principal and interest, plus the escrows and fees in the Loan Record." }),
                Object.assign(TILE(1), { label: "Monthly P&I", text: "This month’s principal + interest. Under it: interest-only, the phase of a hybrid, or that it amortizes." }),
                Object.assign(TILE(2), { label: "Current Balance", text: "What is owed today, and how many payments have been made." }),
                Object.assign(TILE(3), { label: "Original Amount", text: "The loan amount on day one, and today’s rate." }),
                Object.assign(TILE(4), { label: "Amort / Loan Term", text: "Amortization years / loan years. “Balloon at mo 120” means the rest is due at month 120." }),
                Object.assign(TILE(5), { label: "Months to Maturity", text: "Months left, and the maturity date." }),
                Object.assign(TILE(6), { label: "Interest-Only", text: "The interest-only months at the start (or “None”), and what follows them." }),
                Object.assign(TILE(7), { label: "Rate Type", text: "Fixed, Floating or Hybrid ARM. A hybrid shows its first rate → its rate after the reset." })
              ] }
          ] },
        { title: "The rate notice",
          text: "A floating loan or a hybrid ARM has a blue notice under the tiles: how its rate is set this month. The rate is captured automatically; there is nothing to do.",
          views: [
            { title: "A floating loan",
              text: "It re-prices on the 1st of each month: the index plus the spread, kept between the floor and the cap. Future months use today’s value; the projection holds it flat.",
              go: async (h) => { await h.openLoan(/^M Lofts/); },
              shot: "#floatBanner",
              marks: [
                { sel: "#floatBanner span.font-bold", label: "How it re-prices", text: "When the rate changes and which index it follows." },
                { sel: "#floatBanner span.font-semibold", label: "This month’s rate", text: "Index + spread = this month’s rate. The floor or cap shows when the loan has one." },
                { sel: "#floatBanner span.text-sky-600", label: "Captured", text: "When this month’s rate was taken." }
              ] },
            { title: "A hybrid ARM",
              text: "Fixed for its first years, then it floats. The notice says how many fixed months are left, or, once it has reset, that it now floats and how often it resets.",
              go: async (h) => { await h.openLoan(/Queens Gate/); },
              shot: "#floatBanner",
              marks: [
                { sel: "#floatBanner span.font-bold", label: "Its phase", text: "Still fixed (with the months left), or now adjustable." },
                { sel: "#floatBanner span.font-semibold", label: "The floating rate", text: "What the index + margin is this month." },
                { sel: "#floatBanner span.text-sky-600", label: "Captured", text: "When the index value was taken." }
              ] }
          ] },
        { title: "The NOI box",
          views: [
            { text: "One NOI for the property, the same one Underwriting and the Portfolio page use. (A refinance uses only the T12 or the underwriting approved from it.) It comes from, in this order: your NOI override in the profile, else the T12, else the property’s operating lines, else an NOI typed on the loan. With none, it says “No NOI yet”.",
              go: async (h) => { await h.openLoan(/Queens Gate/); },
              shot: "#loanOpPanel > div",
              marks: [
                { sel: "#loanOpPanel .grid > div", nth: 0, label: "Property NOI", text: "The property’s yearly NOI." },
                { sel: "#loanOpPanel .grid > div", nth: 1, label: "DSCR (combined)", text: "NOI ÷ the yearly debt service of every loan on the property." },
                { sel: "#loanOpPanel .grid > div", nth: 2, label: "Debt yield", text: "NOI ÷ what is owed today." },
                { sel: "#loanOpPanel .grid > div", nth: 3, label: "LTV", text: "What is owed ÷ the property’s value (NOI ÷ cap rate)." },
                { sel: "#loanOpOpen", label: "Build operating model", text: "Opens this property in Underwriting, where its T12 goes (“Open operating model” once it has one)." },
                { sel: "[data-loanopsrc]", label: "Where the NOI came from", text: "Here an NOI typed on the loan, no T12 yet. With two loans it adds “shared by 2 loans”." }
              ] }
          ] },
        { title: "The Loan Record",
          views: [
            { text: "Every field of the loan in one place. Four parts you type, and one the app works out. A dash means empty.",
              go: async (h) => { await h.openLoan(/Queens Gate/); },
              shot: card("#profileBody"),
              marks: [
                { sel: "#loanRecEdit", label: "Edit", text: "Opens this loan’s form. See [Edit a loan](edit-a-loan)." },
                { sel: "#loanRecStale", label: "Out of date…", text: "Flags the terms as no longer right (“Up to date again” clears it). See [Mark a loan out of date](set-loan-status)." },
                { sel: "#loanRecRemove", label: "Remove", text: "Takes this one loan out of every total; it can be restored. See [Remove a loan](remove-a-loan)." },
                { sel: REC("Loan Identification"), label: "Loan Identification", text: "The property, the lender, the loan number; for a pooled loan, its other properties and releases." },
                { sel: REC("Loan Terms"), label: "Loan Terms", text: "Amount, rate, dates, term, amortization, interest-only and the index. The schedule is built from these." },
                { sel: REC("Escrows & Reserves"), label: "Escrows & Reserves", text: "The monthly escrows paid with the loan." },
                { sel: REC("Additional Fees"), label: "Additional Fees", text: "Servicing, trustee and other monthly fees." },
                { sel: REC("Debt Service"), label: "Debt Service (computed)", text: "Balance today, P&I, total debt service, interest-only left, months to maturity, today’s rate." },
                { sel: REC("Debt Service") + " dt span.rounded", label: "calc", text: "Worked out by the app; it can’t be typed." }
              ] },
            { title: "The change history",
              text: "A field that was changed has **history (N)** next to its name; **Change history** at the top of the record lists every change to the loan. Here the made-up Juniper Flats loan’s At the Reset was changed.",
              go: async (h) => { await pick(h, "Juniper Flats (example)"); await h.click('[data-loanhist="armResetPayment"]', { wait: 500 }); },
              shot: "#historyModal > div",
              marks: [
                { sel: "#historyTitle", label: "Which field", text: "The field and the loan." },
                { sel: "#historyBody th", nth: 0, label: "When", text: "The day and time of the change." },
                { sel: "#historyBody th", nth: 1, label: "Old → new", text: "What it was and what it became." },
                { sel: "#historyBody th", nth: 2, label: "Who", text: "Who made the change." },
                { sel: "#historyBody th", nth: 3, label: "Where from", text: "Typed by hand, or where else it came from: the assistant, an Excel import, a refinance…" },
                { sel: "#historyClose", label: "Close", text: "Closes the window." }
              ],
              after: async (h) => { await h.closeModals(); } }
          ] },
        { title: "The payment schedule",
          text: "At the bottom of the page: every month of the loan, from the first payment to the last. Yellow rows are interest-only, the blue row is today, the green row is the balloon (or the last payment).",
          views: [
            { title: "The schedule",
              go: async (h) => { await h.openLoan(/Queens Gate/); },
              shot: SCHED,
              marks: [
                { sel: "#scheduleMeta", label: "The loan in one line", text: "How many months, when interest starts and ends, and that each month is paid on the 1st of the next." },
                { sel: "[data-scheduljump]", nth: 0, label: "First interest payment", text: "Jumps to the first payment and flashes it." },
                { sel: "[data-scheduljump]", nth: 1, label: "First P&I payment", text: "Jumps to the first month with principal (after interest-only)." },
                { sel: SCHED + ' >> span.inline-flex:has-text("Interest-only")', label: "Colors", text: "What the row colors mean: interest-only, today, balloon / final." },
                { sel: "#exportCsvBtn", label: "Schedule CSV", text: "Saves the whole schedule as a file that opens in Excel." },
                { sel: TH(1), label: "#", text: "The payment number." },
                { sel: TH(2), label: "Accrual Month / Pays", text: "The month interest is counted for, and the day it is paid." },
                { sel: TH(4), label: "Days", text: "Days in the month: interest is counted on real days (Actual/360) unless the loan is 30/360." },
                { sel: TH(5), label: "Rate", text: "That month’s rate. A small tag says where it came from (fixed, the index on a date)." }
              ] },
            { title: "Interest-only, then principal",
              text: "**First P&I payment** jumps here: the last interest-only month (IO tag), then the first month that pays principal too. The payment goes up and the balance starts to go down.",
              go: async (h) => { await h.openLoan(/Queens Gate/); await h.click("[data-scheduljump]", { nth: 1, wait: 900 }); await h.calm(); },
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
        { title: "Two loans on one property",
          text: "A property with a senior and a mezzanine loan opens as one page that adds them together (here the sample Avalon White Plains). See [Add a senior and a mezzanine loan](add-a-loan-stack).",
          views: [
            { title: "Combined position",
              text: "At the top of the Loan Record: each loan, and the stack together.",
              go: async (h) => { await pick(h, "Avalon White Plains"); },
              shot: COMBINED,
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
                { sel: COMBINED + " p.text-amber-700", label: "No NOI yet", text: "Without an NOI the coverage figures stay empty.", optional: true }
              ] }
          ] },
        { title: "A pooled loan",
          text: "One loan secured by several properties shows a pool panel in place of the NOI box: one loan, one payment, coverage read on the whole pool. See [Add a loan on several properties](add-a-pooled-loan). The NOIs here are made up.",
          views: [
            { title: "The pool panel",
              go: async (h) => { await pick(h, "Aspen Yard (example)"); },
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
                { sel: POOLROW("Birch Commons (example)") + " [data-poolrelease]", label: "Release…", text: "Takes this property out of the pool (below). If the main property is released, the loan moves to the property with the largest share." },
                { sel: "[data-poolreleases]", label: "Released", text: "Each property released so far: when, how much was paid down, and whether the payment was recalculated." }
              ] },
            { title: "The Release window",
              go: async (h) => { await h.click(POOLROW("Birch Commons (example)") + " [data-poolrelease]", { wait: 500 }); },
              shot: "#poolRelModal > div",
              marks: [
                { sel: "#poolRelModal p", label: "Its share", text: "Its share of today’s balance, by its allocated amount or by NOI. Lenders often ask 105–125% of it." },
                { sel: "#poolRelPrice", label: "Release price ($)", text: "What is paid down on the loan." },
                { sel: "#poolRelDate", label: "Date", text: "The day of the paydown." },
                { sel: "#poolRelMode", label: "After the paydown", text: "Recalculate the payment over the amortization left, or keep the payment (the loan pays down faster)." },
                { sel: "#poolRelCancel", label: "Cancel", text: "Closes it; nothing changes." },
                { sel: "#poolRelGo", label: "Release", text: "Pays it down and takes the property out of the pool." }
              ],
              after: async (h) => { await h.click("#poolRelCancel", { wait: 400 }); } },
            { title: "A property in the pool",
              text: "A property in the pool with no loan of its own opens with an “In a pooled loan” tag and the same pool panel.",
              go: async (h) => { await pick(h, "Birch Commons (example)"); await noProfile(h); },
              shot: "#propView",
              marks: [
                { sel: '#propHeader span:has-text("In a pooled loan")', label: "In a pooled loan", text: "This property secures a pooled loan." },
                { sel: "[data-propadd]", label: "+ Add the first loan", text: "It can still get a loan of its own." },
                { sel: "[data-proparchive]", label: "Archive", text: "Archives the property. See [Archive or delete a property](archive-or-delete-a-property)." },
                { sel: "[data-poolpanel]", label: "The pool", text: "The same panel as on the main property’s page; this property’s row is marked." },
                { sel: "#propProfilePanel summary", label: "Profile", text: "Its facts. See [Fill in a property’s profile](fill-in-the-profile)." },
                { sel: "#propUnitStatsPanel > div", label: "Rent roll", text: "Its rent roll summary." },
                { sel: "#propDocsPanel > div", label: "Documents", text: "Its saved files.", optional: true }
              ] }
          ] },
        { title: "A property with no active loan",
          views: [
            { text: "When every loan of a property is removed or paid off, the property stays. Its page lists the removed loans, with **Restore** and a bin. (The profile opens by itself on this page; here it is folded.)",
              go: async (h) => { await pick(h, "Maple Court (example)"); await noProfile(h); },
              shot: "#propView",
              marks: [
                { sel: "#propHeader h2", label: "No loan yet", text: "The property, with no active loan." },
                { sel: "[data-propadd]", label: "+ Add the first loan", text: "Adds a new loan to this property." },
                { sel: "[data-proparchive]", label: "Archive", text: "Archives the property. See [Archive or delete a property](archive-or-delete-a-property)." },
                { sel: "[data-propinactive] span.inline-flex", nth: 1, label: "The removed loan", text: "Its name, “Removed”, and when." },
                { sel: "[data-proprestoreloan]", label: "Restore", text: "Brings the loan back; the page becomes its loan page again." },
                { sel: "[data-propdeleteloan]", label: "Delete permanently", text: "Deletes the loan record for good (it asks first)." },
                { sel: "#propOpPanel > div", label: "NOI box", text: "The property keeps its NOI box (the cap rate now comes from the removed loan)." },
                { sel: "#propProfilePanel summary", label: "Profile", text: "Its profile stays." },
                { sel: "#propUnitStatsPanel > div", label: "Rent roll", text: "Its rent roll stays." },
                { sel: "#propDocsPanel > div", label: "Documents", text: "Its files stay." }
              ] }
          ] }
      ] },

    // ==================================================================================================================
    { id: "ref-loan-form", kind: "reference", group: "Reference", title: "The loan form",
      description: "Every field of the form that adds or edits a loan.",
      intro: "**Add Loan** (at the top of a property’s page) and **Edit** (in the Loan Record) open this form. Only what you type is kept: the balance, the payments, the P&I and the debt service are worked out from it. The pictures fill in a made-up loan that is never saved.",
      sections: [
        { title: "The form",
          views: [
            { text: "Four parts, from the loan papers. Required fields have a red *.",
              go: addForm,
              shot: "#formView",
              marks: [
                { sel: "#formTitle", label: "Add Loan", text: "A new loan. Editing a loan says “Edit Loan”." },
                { sel: "#cancelBtn", label: "Cancel", text: "Closes the form. Nothing is saved." },
                { sel: "#saveBtn", label: "Save Loan", text: "Checks the form and saves the loan; its page opens." },
                { sel: "#f_propertyName", label: "Property Name", text: "Filled in with the property you were on. A new name makes a new property." },
                { sel: FS("Loan Identification") + " legend", label: "Loan Identification", text: "Who and what (below)." },
                { sel: FS("Loan Terms") + " legend", label: "Loan Terms", text: "The terms from the loan papers (below)." },
                { sel: FS("Escrows & Reserves") + " legend", label: "Escrows & Reserves", text: "Monthly escrows (below)." },
                { sel: FS("Additional Fees") + " legend", label: "Additional Fees", text: "Monthly fees (below)." }
              ] }
          ] },
        { title: "When something is missing",
          views: [
            { text: "**Save Loan** with a required field empty: a red line says what is missing, and nothing is saved until it is right.",
              go: async (h) => { await h.click("#saveBtn", { wait: 500 }); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#formError", label: "What is missing", text: "The first thing to fix. Fix it and click **Save Loan** again." },
                { sel: "#saveBtn", label: "Save Loan", text: "Try again once it’s fixed." }
              ] }
          ] },
        { title: "Loan Identification",
          views: [
            { text: "Who and what: the property, its address and type, the lender and the loan number.",
              go: async (h) => {
                await fill(h, "propertyName", "Rowan Terrace (example)"); await fill(h, "propertyAddress", "8 Rowan Rd, Springfield");
                await pickSel(h, "propertyType", "Multifamily"); await fill(h, "lenderName", "Example Bank"); await fill(h, "loanNumber", "EX-3001");
              },
              shot: FS("Loan Identification"),
              marks: [
                { sel: FW("propertyName"), label: "Property Name", text: "The property this loan is on. Start typing to pick one you already have." },
                { sel: FW("propertyAddress"), label: "Property Address", text: "Its address. Two loans at the same address are one property." },
                { sel: FW("propertyType"), label: "Property Type", text: "Office, Retail, Industrial, Multifamily, Mixed-Use or Other." },
                { sel: FW("lenderName"), label: "Lender Name", text: "Who lent the money." },
                { sel: FW("loanNumber"), label: "Loan Number", text: "The lender’s number for the loan." },
                { sel: FW("poolReleases"), label: "Pool releases", text: "For a pooled loan: properties released so far. Filled in by **Release…** on the loan’s page, not typed here." },
                { sel: "#poolFormPicker", label: "Also secures", text: "Empty for a loan on one property. Tick other properties to make one loan on several (below)." }
              ] },
            { title: "Also secures (a pooled loan)",
              text: "Tick each other property the loan secures. A property not in the app yet can be added by name.",
              go: async (h) => {
                await fill(h, "originalAmount", "12000000");
                await h.click('#poolFormPicker [data-poolname="Cedar Point (example)"]', { wait: 300 });
                await h.fill('#poolFormPicker [data-poolformrow="cedar point (example)"] [data-poolformamt]', "4000000");
                await h.fill("#poolFormNew", "Spruce Hill (example)", { change: false }); await h.click("#poolFormAdd", { wait: 400 });
                await h.fill("#poolFormSearch", "example", { change: false }); await h.js(() => { document.getElementById("poolFormSearch").dispatchEvent(new Event("input", { bubbles: true })); }); await h.wait(300);
                // the list scrolls inside its box: to its end, where the new property is
                await h.js(() => { const l = document.getElementById("poolFormList"); if (l) l.scrollTop = l.scrollHeight; }); await h.wait(200);
              },
              shot: FS("Loan Identification"),
              marks: [
                { sel: FW("propertyName"), label: "Its main property", text: "The loan is filed under this property." },
                { sel: "#poolFormCount", label: "How many", text: "How many other properties this loan secures." },
                { sel: "#poolFormSearch", label: "Find a property", text: "Type part of a name to shorten the list." },
                { sel: '#poolFormPicker [data-poolname="Cedar Point (example)"]', label: "Tick a property", text: "Ticked: this loan also secures it." },
                { sel: '#poolFormPicker [data-poolformrow="cedar point (example)"] [data-poolformamt]', label: "allocated $", text: "Optional: the part of the loan the lender puts on this property. If no property has one, each share follows its NOI." },
                { sel: '#poolFormPicker [data-poolformrow="spruce hill (example)"]', label: "New — added when you save", text: "A property not in the app yet. It is created when you save the loan." },
                { sel: '#poolFormPicker [data-poolformrow="juniper flats (example)"]', label: "Has its own loan", text: "A property can be in a pool and still have its own loan." },
                { sel: "#poolFormNew", label: "New property", text: "Type the name of a property that isn’t in the app yet…" },
                { sel: "#poolFormAdd", label: "Add to this loan", text: "…and click here to add it to the list, ticked." },
                { sel: "#poolFormAllocSum", label: "Allocated so far", text: "The allocated amounts added up, against the loan amount." }
              ] }
          ] },
        { title: "Loan Terms",
          text: "The terms from the loan papers. The fields change with the **Rate Type**.",
          views: [
            { title: "A new fixed loan",
              text: "A new fixed loan takes its rate from an index + your spread, and the green line shows the rate it will lock. For a loan that already exists, tick **This is a historical loan** and type its rate instead.",
              go: fixedTerms,
              shot: FS("Loan Terms"),
              marks: [
                { sel: "#loanForm [data-histrow]", label: "Historical loan", text: "Tick it for a loan that already exists: you type its real locked rate. Leave it off for a new loan. (Fixed loans only.)" },
                { sel: FW("originalAmount"), label: "Original Loan Amount", text: "The amount on day one. Required." },
                { sel: FW("rateType"), label: "Rate Type", text: "Fixed, Floating or Hybrid ARM. The fields below change to match." },
                { sel: FW("lienPosition"), label: "Lien Position", text: "Senior, or Mezzanine (paid after the senior)." },
                { sel: FW("loanStatus"), label: "Loan Status", text: "Leave blank: it reads Active, or Matured after the maturity date. See [change its status](set-loan-status#change-the-status)." },
                { sel: FW("originationDate"), label: "Origination Date", text: "When the loan closed. Required." },
                { sel: FW("firstPaymentDate"), label: "First Payment Date", text: "The first payment of any kind; an interest-only one counts. Required." },
                { sel: FW("maturityDate"), label: "Maturity Date", text: "From the papers. The schedule is anchored to it." },
                { sel: FW("loanTermMonths"), label: "Loan Term (Months)", text: "Months until the balloon. Required." },
                { sel: FW("amortizationMonths"), label: "Amortization Period", text: "Months the payment is worked out over, e.g. 360 for 30 years. Not needed for a loan that is interest-only for its whole term." },
                { sel: FW("amortMethod"), label: "Day-Count", text: "Actual/360 (interest on real days) or 30/360 (the same every month)." },
                { sel: FW("amortType"), label: "Amortization Type", text: "Level (normal), Fixed Principal, or Fixed P&I (a set payment from the papers)." },
                { sel: FW("ioMonths"), label: "Interest-Only Period", text: "Months of interest only at the start. 0 if none." },
                { sel: FW("index"), label: "Index", text: "The index the rate is built on (SOFR, Prime, a Treasury…)." },
                { sel: FW("spread"), label: "Spread", text: "Your margin over the index, in %." },
                { sel: "#f_ratePreview", label: "Locked rate", text: "Index today + spread = the rate this new loan locks." }
              ] },
            { title: "A hybrid ARM",
              text: "Fixed for its first years, then it floats. With **Fixed P&I** it also asks what the payment does at the reset; see [Set what the payment does at the reset](set-the-reset).",
              go: hybridTerms,
              shot: FS("Loan Terms"),
              marks: [
                { sel: FW("rateType"), label: "Hybrid ARM", text: "Fixed first, then it floats." },
                { sel: FW("annualRate"), label: "Annual Interest Rate", text: "The fixed rate of the first years." },
                { sel: FW("amortType"), label: "Fixed P&I", text: "A set monthly payment from the papers." },
                { sel: FW("fixedAmortAmount"), label: "Fixed Amortization Payment", text: "That set payment." },
                { sel: FW("armResetPayment"), label: "At the Reset", text: "Keep the stated payment, or recalculate it over the remaining amortization." },
                { sel: FW("armInitialFixedMonths"), label: "Initial Fixed Period", text: "Months at the fixed rate (60 = 5 years)." },
                { sel: FW("armAdjustFreqMonths"), label: "Adjustment Frequency", text: "How often the rate resets after that." },
                { sel: FW("index"), label: "Index", text: "The index the rate follows after the fixed years." },
                { sel: FW("armAssumedIndex"), label: "Index Value", text: "Filled from the live index by itself; type a value only to override it. Offline it says it couldn’t fetch." },
                { sel: FW("spread"), label: "Spread", text: "The margin over the index after the reset." },
                { sel: FW("rateFloor"), label: "Floor", text: "The rate never goes below this." },
                { sel: FW("rateCap"), label: "Cap", text: "The rate never goes above this." },
                { sel: FW("liborUntil"), label: "On 1-Month LIBOR Until", text: "Only for a loan that started on LIBOR: the last day LIBOR set its rate." },
                { sel: FW("liborSpread"), label: "Spread Over LIBOR", text: "Blank = the same spread as above." }
              ] }
          ] },
        { title: "Escrows & Reserves",
          views: [
            { text: "Monthly amounts paid with the loan. Leave any you don’t have empty. They add to Total Monthly Debt Service.",
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
              ] }
          ] },
        { title: "Additional Fees",
          views: [
            { text: "Monthly fees paid with the loan. They also add to Total Monthly Debt Service.",
              go: async (h) => { await fill(h, "servicingFee", "250"); },
              shot: FS("Additional Fees"),
              marks: [
                { sel: FW("servicingFee"), label: "Servicing Fee", text: "Monthly servicing fee." },
                { sel: FW("trusteeFee"), label: "Trustee Fee", text: "Monthly trustee fee." },
                { sel: FW("otherFee1Desc"), label: "Other Fee 1 — Description", text: "Name another fee…" },
                { sel: FW("otherFee1Amt"), label: "Other Fee 1 — Amount", text: "…and its monthly amount." },
                { sel: FW("otherFee2Desc"), label: "Other Fee 2 — Description", text: "A second one." },
                { sel: FW("otherFee2Amt"), label: "Other Fee 2 — Amount", text: "Its monthly amount." }
              ],
              // the made-up loan is never saved
              after: async (h) => { await h.click("#cancelBtn", { wait: 600 }); } }
          ] }
      ] }
  ]
};
// keep the pointer off the picture: hover colors would show on whatever is under it
SPEC.pages.forEach(p => (p.sections || []).forEach(s => (s.steps || []).concat(s.views || []).forEach(x => { const go = x.go; x.go = async (h) => { if (go) await go(h); await h.page.mouse.move(1, 1).catch(() => {}); }; })));
module.exports = SPEC;
