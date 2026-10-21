/* Guide chapter: Refinance — should you refinance a loan, how much the property supports, a new loan or an extension
   with today's lender, lender presets, and several properties under one new loan.
   The pictures use the app's built-in sample loans. A refinance is sized on the property's T12 (or the underwriting
   approved from it — 2026-10-21), and the sample loans have none, so each property refinanced here gets a MADE-UP T12:
   Villages of Whitewater the made-up "Sample Gardens" T12 (test/fixtures/proforma-t12.js), its underwriting approved
   and Claude's (made-up) "what to push"; Queens Gate, The Mews, The Mint and Avalon White Plains a made-up T12 whose
   NOI is the figure the sample loan already carries (so the examples' verdicts stay what the words say). */
"use strict";
const path = require("path");
const GRID = require(path.join(__dirname, "..", "..", "test", "fixtures", "proforma-t12.js")).grid();
// a made-up 12-month T12 whose NOI is `noi` to the cent: every month the same (the last takes the cents left over),
// every total row the exact sum of its lines
const MONTHS = ["Jul 2025","Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"];
const madeUpT12 = (name, noi) => {
  const n = Math.round(noi * 100), inc = Math.round(n / 0.55), exp = inc - n, g = [];
  const parts = (tot, sh) => { let left = tot; return sh.map((x, i) => { if (i === sh.length - 1) return left; const v = Math.round(tot * x); left -= v; return v; }); };
  const split = (tot) => { const m = Math.trunc(tot / 12), a = Array(12).fill(m); a[11] = tot - m * 11; return a; };
  const row = (label, cents) => { g.push([label].concat(cents.map(c => c / 100), [cents.reduce((a, b) => a + b, 0) / 100])); return cents; };
  const add = (...rs) => rs[0].map((_, i) => rs.reduce((a, r) => a + r[i], 0));
  const [rent, vac, oth] = parts(inc, [1.04, -0.06, 0.02]), [tax, ins, rm, pay, mg] = parts(exp, [0.30, 0.10, 0.20, 0.32, 0.08]);
  g.push([name + " (made-up figures)"]); g.push(["Cash Flow (12 months)"]); g.push(["Period = Jul 2025-Jun 2026"]); g.push([]);
  g.push([null].concat(MONTHS, ["Total"]));
  g.push(["INCOME"]); g.push(["RENTAL INCOME"]);
  const r1 = row("Residential Rent", split(rent)), r2 = row("Vacancy Loss", split(vac)); const tr = row("TOTAL RENTAL INCOME", add(r1, r2)); g.push([]);
  g.push(["OTHER INCOME"]); const o1 = row("Utility Reimbursements", split(oth)); const to = row("TOTAL OTHER INCOME", o1); g.push([]);
  const ti = row("TOTAL INCOME", add(tr, to)); g.push([]);
  g.push(["EXPENSES"]); g.push(["TAXES AND INSURANCE"]);
  const e1 = row("Real Estate Taxes", split(tax)), e2 = row("Property Insurance", split(ins)); const te1 = row("TOTAL TAXES AND INSURANCE", add(e1, e2));
  g.push(["REPAIRS & MAINTENANCE"]); const e3 = row("Plumbing Repairs", split(rm)); const te2 = row("TOTAL REPAIRS & MAINTENANCE", e3);
  g.push(["PAYROLL"]); const e4 = row("Manager Salary", split(pay)); const te3 = row("TOTAL PAYROLL", e4);
  g.push(["MANAGEMENT FEES"]); const e5 = row("Management Fee", split(mg)); const te4 = row("TOTAL MANAGEMENT FEES", e5); g.push([]);
  const te = row("TOTAL EXPENSES", add(te1, te2, te3, te4)); g.push([]);
  row("NET OPERATING INCOME", ti.map((x, i) => x - te[i]));
  return g;
};
// drop a made-up T12 on a property in Underwriting and wait until it is read (the underwriting draft shows)
const uwT12 = async (h, name, grid, file) => {
  const key = await h.js((n) => { const p = window.opProperties().find(x => x.name === n); return p ? p.key : null; }, name);
  if (!key) throw new Error("no property " + name);
  await h.uwProperty(key);
  const f = await h.xlsx(grid, file);
  await h.page.setInputFiles("#uwFile", f);
  await h.page.waitForFunction(() => !!document.querySelector("[data-pfline]"), null, { timeout: 40000 });
  await h.page.waitForFunction((k) => { const g = window.LDS_gdNOICache()[k]; return !!(g && g.inPlace != null); }, key, { timeout: 30000 });
  await h.wait(1500); await h.calm();
  return key;
};

const RV = "#refiView ";
const card = (h3) => RV + '.boxline:has(h3:has-text("' + h3 + '"))';
const VERDICT = RV + "[data-refiverdict]";
const XVERDICT = RV + '[data-refiverdict^="extend"]';
const BASIS = RV + "[data-refibasis]";
const UNSIZED = RV + '.boxline:has(> p:has-text("judge this yet"))';
const confirmBox = "#confirmModal > div";
const PRICE = RV + "#refiPricing [data-rtype] >> xpath=../../..";
// the parts every sized verdict box has: the four figures, the rate, the amount and "How supports $X is worked out"
const verdictParts = () => [
  { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "What a new loan has to pay off." },
  { sel: VERDICT + " >> text=/Property supports/", label: "Property supports", text: "The biggest loan the property supports at the proposed rate and the lender’s limits." },
  { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "The rate today’s loan charges now." },
  { sel: VERDICT + " >> text=Proposed loan rate", label: "Proposed loan rate", text: "The new loan’s rate, from the rate boxes below." },
  { sel: PRICE, label: "Proposed rate", text: "The new loan’s rate type, index and spread — see “The proposed rate and amount”." },
  { sel: "#o1_amount", label: "Proposed loan amount", text: "Type a smaller amount to test it. The line under it shows that loan’s coverage, LTV and debt yield." },
  { sel: BASIS, label: "How “supports $X” is worked out", text: "The NOI, rate, payment and value behind the figure, and the lender’s four limits — see “How much the property supports”." }
];

// a verdict's own marks in reading order: the answer, the figures, rate and amount, "Can you?", how it is worked out, the rest
const inOrder = (own) => { const parts = verdictParts(), basis = parts.pop(), ci = own.findIndex(m => /^Can you/.test(m.label));
  return [own[0]].concat(parts, own.slice(1, ci + 1), [basis], own.slice(ci + 1)); };

// open a loan's refinance from its page
const openRefi = async (h, re) => {
  await h.closeModals();
  await h.js(() => { const b = document.getElementById("refiCloseBtn"); if (b && b.offsetParent) b.click(); });
  await h.wait(300);
  await h.openLoan(re);
  await h.page.waitForFunction(() => { const b = document.getElementById("refiBtn"); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
  await h.click("#refiBtn", { wait: 600 });
  await h.page.waitForFunction(() => document.querySelectorAll("#refiView [data-refiverdict], #refiView #refiPricing, #refiView [data-refinot12]").length > 0, null, { timeout: 15000 }).catch(() => {});
  await h.wait(1500); await h.calm();
};
const setVal = async (h, sel, v) => { await h.js((a) => { const i = document.querySelector(a.s); i.value = String(a.v); i.dispatchEvent(new Event("change", { bubbles: true })); }, { s: sel, v: v }); await h.wait(1200); await h.calm(); };
const pickVal = async (h, sel, v) => { await h.page.selectOption(sel, String(v)); await h.js((s) => { document.querySelector(s).dispatchEvent(new Event("change", { bubbles: true })); }, sel); await h.wait(1200); await h.calm(); };
const tick = async (h, sel, on) => { await h.js((a) => { const c = document.querySelector(a.s); if (c.checked !== a.on){ c.checked = a.on; c.dispatchEvent(new Event("change", { bubbles: true })); } }, { s: sel, on: on }); await h.wait(1200); await h.calm(); };
const confirmYes = async (h) => { await h.click("#confirmOk", { wait: 1500 }); await h.calm(); };
const confirmNo = async (h) => { await h.click("#confirmCancel", { wait: 500 }); };
// pick "New loan" / "Extend with today's lender" and wait until the screen shows that deal
const pickDeal = async (h, deal) => {
  const isOn = () => h.js((d) => { const r = document.querySelector("#refiView [data-refidealrow]");
    return !!r && (d === "extend" ? /below are the extension/.test(r.innerText) : /below are a new loan/.test(r.innerText)); }, deal);
  for (let k = 0; k < 3 && !(await isOn()); k++){
    await h.click(RV + '[data-refideal="' + deal + '"]', { wait: 1500 }); await h.calm();
    // the property's record may have been re-read just as the click was saved, leaving the screen on the old choice
    // while the record already has the new one: reopening the refinance shows what the record holds
    if (!(await isOn())){ await h.click("#refiCloseBtn", { wait: 600 }); await h.click("#refiBtn", { wait: 2000 }); await h.calm(); }
  }
  if (!(await isOn())) throw new Error("the deal didn’t switch to " + deal);
};
const pickPool = async (h, names) => {
  await h.js((ns) => { document.querySelectorAll("#poolPicker [data-poolpick]").forEach(c => { c.checked = false; });
    ns.forEach(n => { const r = document.querySelector('#poolPicker [data-poolpickrow="' + n + '"] [data-poolpick]'); if (r){ r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); } });
    const first = document.querySelector('#poolPicker [data-poolpickrow="' + ns[0] + '"]'), list = document.getElementById("poolPickList");
    if (first && list) list.scrollTop = Math.max(0, first.offsetTop - list.offsetTop - 60); }, names);
  await h.wait(500);
};
const PUSHBOX = RV + "[data-refipushbox]";
const hideHistory = async (h) => { await h.js(() => { const m = document.getElementById("historyModal"); if (m){ m.classList.add("hidden"); m.classList.remove("flex"); } }); await h.wait(200); };

module.exports = {
  id: "refinance",
  title: "Refinance",
  intro: "Should you refinance a loan? How much the property supports, the rate, the lender’s limits, a new loan or an extension with today’s lender — and several properties under one new loan.",
  setup: async (h) => {
    h.acceptDialogs = [/residential units/i];
    await h.newTab("underwriting");
    // Villages of Whitewater: the made-up "Sample Gardens" T12, two changes with their stories, the underwriting approved,
    // then Claude's (made-up) "what to push"
    const vk = await uwT12(h, "Villages of Whitewater", GRID, "Sample Gardens T12 (made-up).xlsx");
    await h.fill('input[data-uwf="units"]', "120"); await h.wait(1500);
    const at = new Date().toISOString();
    await h.js((t) => {
      window.LDS_pfAddRaw({ id: "g1", column: "both", line: "CS", how: "accountTotal", value: 9000, accounts: [{ name: "Snow Removal" }], kind: "normalized", story: "A heavy winter; a normal one runs about $9,000 (made-up example).", by: "You", at: t });
      window.LDS_pfAddRaw({ id: "g2", column: "aggressive", line: "GA", how: "accountTotal", value: 0, accounts: [{ name: "Bank Charges" }], kind: "partnership", story: "On the partnership’s account (made-up example).", by: "You", at: t });
    }, at);
    await h.wait(2500);
    await h.page.waitForFunction(() => { const b = document.querySelector("[data-uwapprove]"); return b && !b.disabled; }, null, { timeout: 20000 });
    await h.jsClick("[data-uwapprove]");
    await h.page.waitForFunction((k) => { const g = window.LDS_gdNOICache()[k]; return !!(g && g.underwritten != null); }, vk, { timeout: 20000 });
    await h.page.waitForFunction((k) => { const c = window.LDS_getPush && window.LDS_getPush(k); return !!(c && Array.isArray(c.moves) && c.moves.length); }, vk, { timeout: 40000 }).catch(() => {});
    await h.wait(1500);
    // the other properties refinanced here: a made-up T12 with the NOI each sample loan already carries
    for (const [nm, noi] of [["Queens Gate Apartments", 2810007], ["The Mews at Princeton", 10570636], ["The Mint (Rahway)", 5017563], ["Avalon White Plains", 9000000]])
      await uwT12(h, nm, madeUpT12(nm, noi), nm + " T12 (made-up).xlsx");
    await h.home();
  },
  topics: [
    { id: "open", title: "Open a refinance", intro: "A refinance starts from a loan’s page: pick the property, then “Refi Calculator”.",
      steps: [
        { title: "Refi Calculator on the loan’s page", text: "Open a loan (click its property on the Portfolio tab, or pick it under Specific Property). Its page has a row of buttons at the top; “Refi Calculator” opens the refinance analysis for that loan.",
          go: async (h) => { await h.openLoan(/queens gate/); await h.top(); },
          shot: { sel: "#refiBtn >> xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' boxline ') or contains(@class,'rounded-2xl')][1]" },
          marks: [
            { sel: "#refiBtn", label: "Refi Calculator", text: "Opens the refinance analysis for the loan on this page. Nothing changes until you save something there." }
          ], cover: false },
        { title: "The refinance screen", text: "The refinance opens in place of the loan’s page. Everything on it is worked out live: change any box and the answers update at once. Your choices for this refinance (the lender’s limits, an appraisal, the kind of deal) are kept with the property for the whole team.",
          go: async (h) => { await openRefi(h, /queens gate/); await h.top(); },
          shot: "view", cover: true,
          marks: [
            { sel: "#refiView h2", label: "Refinance Analysis", text: "The loan being looked at, and the question: should you refinance?" },
            { sel: "#refiCloseBtn", label: "Close", text: "Back to the loan’s page. Nothing is saved by closing (your limits and appraisal stay)." },
            { sel: "#refiSaveBtn", label: "Save as a loan", text: "Shown when there is a loan to propose. Saves the proposed loan as a new loan and marks today’s loan paid off (refinanced) — it asks first. Here it also says the cash you would pay in." },
            { sel: "#refiBtn", label: "Refi Calculator (greyed)", text: "Greyed while the refinance is open. Close takes you back to the loan’s page.", optional: true },
            { sel: RV + "[data-refidealrow]", label: "What kind of deal?", text: "A new loan, or an extension with today’s lender — see the next topics." }
          ] }
      ] },
    { id: "current", title: "Today’s loan and the kind of deal", intro: "What you owe today, and whether you are looking at a new loan or an extension with today’s lender.",
      steps: [
        { title: "Current Loan", text: "The facts of today’s loan, from its record.",
          shot: card("Current Loan"),
          marks: [
            { sel: card("Current Loan") + " >> text=Payoff balance", label: "Payoff balance", text: "What you owe today — the amount a new loan has to pay off." },
            { sel: card("Current Loan") + " >> text=Current rate", label: "Current rate", text: "Today’s interest rate on the loan." },
            { sel: card("Current Loan") + " >> text=Monthly P&I", label: "Monthly P&I", text: "Today’s monthly principal and interest payment." },
            { sel: card("Current Loan") + " >> text=Remaining", label: "Remaining", text: "Months until today’s loan ends." },
            { sel: card("Current Loan") + " >> text=Matures", label: "Matures", text: "The date today’s loan is due." },
            { sel: card("Current Loan") + " >> text=/Rate resets to/", label: "Rate reset", text: "For a hybrid loan: when the fixed rate ends, what it resets to and the new payment." }
          ] },
        { title: "What kind of deal?", text: "Pick this first — everything below it follows your choice. A new loan pays off today’s loan with a new one; an extension keeps today’s lender on new terms. Each keeps its own limits, so switching back and forth loses nothing.",
          shot: RV + "[data-refidealrow]",
          marks: [
            { sel: RV + '[data-refideal="new"]', label: "New loan", text: "The verdict, the lender’s limits and the payment schedule below are a new loan’s — it replaces today’s loan(s)." },
            { sel: RV + '[data-refideal="extend"]', label: "Extend with today’s lender", text: "Judge an extension instead: today’s lender keeps the loan on new terms, perhaps after a pay-down (the topic “Extend with today’s lender”)." }
          ] }
      ] },
    { id: "coverage", title: "Coverage & value today", intro: "How today’s loan stands: the NOI it is measured on, coverage, value, the credit tier, the cost to pay it off early, and the capital stack.",
      steps: [
        { title: "Coverage & value — today’s loan", text: "Today’s loan measured on the property’s NOI. These are the figures a lender looks at first.",
          shot: card("Coverage"),
          marks: [
            { sel: RV + '[data-noibasis="inplace"]', label: "NOI basis", text: "Which NOI the refinance is sized on. Here In-place T12 — the property’s T12 (made-up). Safe and Aggressive are greyed until the property’s underwriting is approved (see “The NOI basis” below)." },
            { sel: card("Coverage") + " >> text=Annual NOI", label: "Annual NOI", text: "The yearly net operating income this analysis uses — from the T12, or the approved underwriting. A typed NOI never sizes a refinance." },
            { sel: card("Coverage") + " >> text=Cap rate", label: "Cap rate", text: "Used to estimate the value: value = NOI ÷ cap rate." },
            { sel: card("Coverage") + " >> text=Est. value", label: "Est. value", text: "The estimated value of the property (an appraisal you type replaces it — see “How much the property supports”)." },
            { sel: card("Coverage") + " >> text=LTV today", label: "LTV today", text: "Loan-to-value: what you owe ÷ the value." },
            { sel: card("Coverage") + " >> text=Debt service today", label: "Debt service today", text: "A year of today’s payments." },
            { sel: card("Coverage") + " >> text=DSCR today", label: "DSCR today", text: "Debt coverage: NOI ÷ a year of payments. Lenders usually want 1.25× or more." },
            { sel: card("Coverage") + " >> text=Interest-only DSCR today", label: "Interest-only DSCR", text: "Coverage on an interest-only payment — what some lenders size on." },
            { sel: card("Coverage") + " >> text=Debt yield today", label: "Debt yield today", text: "NOI ÷ what you owe — what insurance companies and CMBS lenders look at." },
            { sel: card("Coverage") + " >> text=Coverage today", label: "Coverage today", text: "Whether today’s coverage clears your DSCR floor." },
            { sel: "#refiNoiEdit", label: "Cap rate", text: "Opens a small window to change the cap rate (next step)." },
            { sel: card("Coverage") + " >> text=/financeable|tier|Tier/ >> nth=0", label: "Credit tier", text: "How a lender would grade today’s numbers. Below the floor, the line under it says which test fails; a strong tier takes basis points off the proposed spread.", optional: true },
            { sel: card("Coverage") + " >> text=/^Not financeable as sized/", label: "Why it is below the floor", text: "Each test that fails, against your floor or ceiling: DSCR, LTV, debt yield. Shown only when a test fails.", optional: true },
            { sel: "#refiPrepayType", label: "Exit cost — penalty type", text: "How the early-payoff penalty is worked out — explained in the next steps." },
            { sel: card("Coverage") + " >> text=/^Exit cost$/", label: "Exit cost", text: "The early-payoff penalty in dollars today (and as a % of the balance)." },
            { sel: "#refiStackWith", label: "Capital stack", text: "Link a mezz or senior loan on the same property — explained below." },
            { sel: card("Coverage") + " >> text=/^DSCR = NOI/", label: "How these are worked out", text: "The formulas behind the figures above. They are screening estimates — confirm with the loan documents and a rate sheet." }
          ] },
        { title: "Cap rate", text: "“Cap rate” changes the cap rate that values the property (value = NOI ÷ cap rate). The NOI itself comes from the property’s T12 or its approved underwriting — pick it with the NOI basis; it is never typed here.",
          go: async (h) => { await h.click("#refiNoiEdit", { wait: 500 }); },
          after: async (h) => { await h.click("#noiCancel", { wait: 400 }); },
          shot: "#noiModal > div",
          marks: [
            { sel: "#noiTitle", label: "Refinance — cap rate", text: "This window changes the cap rate only." },
            { sel: "#noiText", label: "Where the NOI comes from", text: "The T12, or the approved underwriting — the NOI basis on the Coverage card." },
            { sel: "#capField", label: "Cap rate (%)", text: "Value = NOI ÷ cap rate; it sets the loan-to-value." },
            { sel: "#noiSave", label: "Continue", text: "Saves the cap rate and updates the whole analysis." },
            { sel: "#noiCancel", label: "Cancel", text: "Closes without changing anything." }
          ] },
        { title: "Exit cost — the early-payoff penalty", text: "Paying today’s loan off early usually costs a penalty. The app estimates it from the type of penalty in the loan; “assumed” means nobody has confirmed the type yet.",
          shot: card("Coverage") + ' >> div:has(> div > h4:has-text("Exit cost"))',
          marks: [
            { sel: "#refiPrepayType", label: "Penalty type", text: "Yield Maintenance (the default), Step-down (a % of the balance that falls each year), Defeasance (a quoted figure), or Open / at par (no penalty). Picking one confirms it and saves it on the loan." },
            { sel: card("Coverage") + " >> text=ASSUMED >> nth=0", label: "Assumed", text: "Shown until you pick the type: the estimate uses yield maintenance.", optional: true },
            { sel: card("Coverage") + " >> text=Prepay basis", label: "Prepay basis", text: "How the estimate was worked out (for yield maintenance: today’s Treasury, the months left, the 1% floor)." },
            { sel: card("Coverage") + " >> text=Exit cost >> nth=1", label: "Exit cost", text: "The estimated penalty in dollars — confirm the real figure from the loan documents." },
            { sel: card("Coverage") + " >> text=As % of balance", label: "As % of balance", text: "The same penalty as a share of what you owe." }
          ] },
        { title: "Step-down and defeasance", text: "A step-down penalty asks for this year’s % of the balance; a defeasance takes the figure you were quoted (until you type one, a yield-maintenance estimate stands in).",
          go: async (h) => { await pickVal(h, "#refiPrepayType", "Step-down"); },
          shot: card("Coverage") + ' >> div:has(> div > h4:has-text("Exit cost"))',
          marks: [
            { sel: "#refiPrepayType", label: "Step-down", text: "Picked here." },
            { sel: "#refiStepPct", label: "This year’s step-down", text: "Type this year’s % (for example 3 in year 1 of a 3-2-1 schedule). The exit cost follows." }
          ] },
        { title: "Defeasance — the quoted figure", text: "Type the defeasance figure from the lender or the consultant; the box shows the yield-maintenance estimate until you do.",
          go: async (h) => { await pickVal(h, "#refiPrepayType", "Defeasance"); },
          after: async (h) => { await pickVal(h, "#refiPrepayType", "Yield Maintenance"); },
          shot: card("Coverage") + ' >> div:has(> div > h4:has-text("Exit cost"))',
          marks: [
            { sel: "#refiPrepayType", label: "Defeasance", text: "Picked here." },
            { sel: "#refiDefeasance", label: "Quoted figure", text: "The defeasance cost you were quoted, in dollars." }
          ] },
        { title: "Capital stack", text: "When the property also has a mezzanine (or senior) loan, link it here: leverage and coverage are then read on the combined debt.",
          shot: card("Coverage") + ' >> div:has(> div > h4:has-text("Capital stack"))',
          marks: [
            { sel: "#refiStackWith", label: "Link a loan", text: "Pick the other loan on the same property (None = this loan alone). Agency senior loans don’t allow subordinate debt." }
          ] },
        { title: "The NOI basis — which NOI the refinance uses", text: "Villages of Whitewater has a made-up T12 and an APPROVED underwriting (Underwriting → Approve the underwriting), so its refinance can be sized on three NOIs: the in-place T12, the Safe underwriting or the Aggressive one. Pick one — everything below follows. Your pick is kept with this refinance for the whole team.",
          go: async (h) => { await openRefi(h, /villages of whitewater$/); await h.top(); },
          shot: card("Coverage") + " >> div:has(> div > div:has-text('NOI basis for this analysis')) >> nth=0",
          marks: [
            { sel: RV + '[data-noibasis="inplace"]', label: "In-place T12", text: "The NOI as the property runs today, from its T12 (by the T12 rule)." },
            { sel: RV + '[data-noibasis="underwritten"]', label: "Safe underwriting", text: "The approved Safe underwriting: the T12 with the changes and stories you approved, after replacement reserves. The starting choice once it is approved." },
            { sel: RV + '[data-noibasis="aggressive"]', label: "Aggressive underwriting", text: "The approved Aggressive version, after reserves." },
            { sel: card("Coverage") + " >> text=/^12-mo|^T12|^Last 3/ >> nth=0", label: "Which months", text: "How the T12’s NOI was worked out.", optional: true },
            { sel: card("Coverage") + " >> text=/^Sizing on the/", label: "What it is sized on", text: "Which NOI the whole analysis now uses, and who approved the underwriting and when. A property whose underwriting isn’t approved has In-place T12 only." }
          ] }
      ] },
    { id: "push", title: "What to push — what it would get you", intro: "Your planning tool, not the lender’s: tick what you would push, set the amount you need to cover, and see what loan it gets you.",
      steps: [
        { title: "Claude’s pushes, measured on each basis", text: "The pushes from “What to push” in Underwriting (Claude reads the T12 and the approved underwriting) appear here as tick boxes. Each has three effects — on the in-place T12, on Safe and on Aggressive — net of what each already counts; ticking one adds its effect on the NOI basis picked above. Your ticks are kept with this refinance.",
          go: async (h) => { await h.scroll(PUSHBOX); },
          shot: { sel: PUSHBOX, grow: true },
          marks: [
            { sel: PUSHBOX + " h3", label: "What to push — what it would get you", text: "Your plan: the coverage, the verdict and the proposed loan above and below follow what you tick." },
            { sel: RV + "[data-refitargetbox]", label: "The amount to cover", text: "What you need the loan to cover, and the NOI that covers it (next steps)." },
            { sel: RV + "[data-refimove] >> nth=0", label: "A push", text: "Tick to add it to the NOI used here; untick to take it out." },
            { sel: RV + "[data-refimove] >> nth=0 >> xpath=following-sibling::span[1]/span[2]", label: "Its effects", text: "First what it adds on the basis picked (here the Safe underwriting), then on each basis: in-place, Safe, Aggressive. The same push is worth less on an underwriting that already counts part of it." },
            { sel: "#refiManualLabel", label: "Your own lever — name", text: "A name for something you expect to add (for example paid parking)." },
            { sel: "#refiManualAmt", label: "Your own lever — dollars a year", text: "The yearly amount it adds; it counts the same on any basis (a negative amount takes NOI away)." },
            { sel: "#refiManualAdd", label: "Add", text: "Adds your lever to the list, ticked." }
          ] },
        { title: "The amount to cover", text: "Pick what the new loan has to cover: today’s payoff (with the early-payoff penalty), the balance once there is no penalty (the last 12 months before maturity), or the balance at maturity. The line under it says the NOI that covers it at the proposed rate and the lender’s limits, and how far today’s NOI is from it.",
          go: async (h) => { await h.scroll(RV + "[data-refitargetbox]"); },
          shot: RV + "[data-refitargetbox]",
          marks: [
            { sel: RV + '[data-reficover="today"]', label: "Today’s payoff", text: "What you owe today plus the early-payoff penalty. The starting choice." },
            { sel: RV + '[data-reficover="open"]', label: "No penalty — the last 12 months", text: "What you will owe 12 months before maturity, when the loan can be paid off without a penalty (today’s payoff if it matures within 12 months)." },
            { sel: RV + '[data-reficover="maturity"]', label: "At maturity", text: "What you will owe when the loan matures, before its final payment." },
            { sel: RV + "[data-refitargetbox] > p >> nth=0", label: "What it is", text: "What the amount picked is made of." },
            { sel: RV + "[data-refitarget]", label: "The NOI you need", text: "The NOI that covers the amount on the basis picked, and how much more that is than today’s." }
          ] },
        { title: "At maturity", text: "Picked “At maturity”: a smaller amount to cover, so a smaller NOI. Your pick is kept with this refinance.",
          go: async (h) => { await h.click(RV + '[data-reficover="maturity"]', { wait: 1200 }); await h.calm(); await h.scroll(RV + "[data-refitargetbox]"); },
          shot: RV + "[data-refitargetbox]",
          marks: [
            { sel: RV + '[data-reficover="maturity"]', label: "At maturity", text: "Picked." },
            { sel: RV + "[data-refitarget]", label: "The NOI you need", text: "Worked out again for this amount." }
          ] },
        { title: "Ticked — what it gets you", text: "A push ticked and a lever of your own added: the card says how much is added to the NOI, and the line under the amount says whether that covers it — or how much NOI is still missing.",
          go: async (h) => { await tick(h, RV + "[data-refimove]", true); await h.js(() => { document.getElementById("refiManualLabel").value = "Paid parking (made-up)"; document.getElementById("refiManualAmt").value = "12000"; document.getElementById("refiManualAdd").click(); }); await h.wait(1200); await h.calm(); await h.scroll(PUSHBOX); },
          shot: { sel: PUSHBOX, grow: true },
          marks: [
            { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "What the ticked pushes and your levers add on this basis." },
            { sel: RV + "[data-refitarget]", label: "Covered — or still missing", text: "Whether the NOI now covers the amount, with what is to spare or what is still missing." },
            { sel: RV + "[data-refimove] >> nth=0", label: "Ticked push", text: "Counted now." },
            { sel: RV + "[data-refimanual] >> nth=0", label: "Your lever", text: "Marked “yours”; tick or untick it like Claude’s." },
            { sel: RV + "[data-refimanualdel] >> nth=0", label: "×", text: "Removes your lever." }
          ] },
        { title: "The same push on another basis", text: "Switched to In-place T12: the ticked push now counts its in-place effect (here a little more than on Safe, which already counts part of the lower vacancy).",
          go: async (h) => { await h.click(RV + '[data-noibasis="inplace"]', { wait: 1200 }); await h.calm(); await h.scroll(PUSHBOX); },
          after: async (h) => { await h.click(RV + '[data-noibasis="underwritten"]', { wait: 1200 }); await h.calm(); },
          shot: { sel: PUSHBOX, grow: true },
          marks: [
            { sel: RV + "[data-refimove] >> nth=0 >> xpath=following-sibling::span[1]/span[2]", label: "On the In-place T12", text: "The effect counted now." },
            { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "Follows the basis." }
          ] }
      ] },
    { id: "verdict", title: "The verdict — can you, should you?", intro: "The coloured box answers two questions in order: can the property support a loan the size of what you owe, and is it worth doing.",
      steps: [
        { title: "Act before … — pay down", text: "Queens Gate’s rate resets within 12 months and the property can’t support what you owe. The box says so first, with the date, and what it takes: the pay-down to refinance at these limits, or an extension with today’s lender.",
          go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(VERDICT); },
          shot: { sel: VERDICT + " >> xpath=./div[1]/..", grow: true },
          marks: [
            { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "Act before the reset — pay down $X. (Other answers: Refinance, Your decision, Don’t refinance.)" },
            { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "What a new loan has to pay off." },
            { sel: VERDICT + " >> text=/Property supports/", label: "Property supports", text: "The biggest loan the property supports at the proposed rate and the lender’s limits." },
            { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "With the reset ahead (what it resets to, and when)." },
            { sel: VERDICT + " >> text=Proposed loan rate", label: "Proposed loan rate", text: "The new loan’s rate, from the rate boxes below." },
            { sel: RV + "[data-refimustwhen]", label: "When", text: "What is ending: the rate reset (with the new payment) or the maturity." },
            { sel: RV + '[data-refipaydown="refi"]', label: "To refinance", text: "The pay-down a new loan needs: what you owe less what the property supports." },
            { sel: RV + '[data-refipaydown^="extend"]', label: "To extend", text: "The pay-down today’s lender would need — pick “Extend with today’s lender” to work it out." },
            { sel: PRICE, label: "Proposed rate", text: "The new loan’s rate type, index and spread — see “The proposed rate and amount”." },
            { sel: "#o1_amount", label: "Proposed loan amount", text: "Starts at what the property supports; type a smaller amount to test it. The line under it shows that loan’s coverage, LTV and debt yield." },
            { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "Stage one: can the property support a loan the size of what you owe? Here no — and why." },
            { sel: BASIS, label: "How “supports $X” is worked out", text: "The NOI, rate, payment and value behind the figure, and the lender’s four limits — see “How much the property supports”." },
            { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do, in one line." }
          ] },
        { title: "Refinance", text: "The Mews at Princeton, with the lender’s spread typed as 0 for the example: the property supports more than you owe, and the lower rate saves more interest than the early-payoff penalty — so: Refinance.",
          go: async (h) => { await openRefi(h, /mews at princeton/); const s = await h.js(() => document.getElementById("o1_fxspread") ? "#o1_fxspread" : "#o1_spread"); await setVal(h, s, 0); await h.scroll(VERDICT); },
          shot: { sel: VERDICT, grow: true },
          marks: inOrder([
            { sel: VERDICT + " >> p >> nth=0", label: "Refinance", text: "Both answers are yes." },
            { sel: VERDICT + " >> text=/^Can you\\? Yes/", label: "Can you? Yes", text: "The property supports at least what you owe." },
            { sel: VERDICT + " >> text=/^Should you\\? Yes/", label: "Should you? Yes", text: "Your rule: the new rate saves more interest (until today’s loan ends) than the penalty — or today’s loan ends within 12 months anyway. When the saving doesn’t cover the penalty but the property can refinance, the box turns amber: “Your decision”." },
            { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Refinance.", text: "The proposed loan appears below, with “Save as a loan” at the top." }
          ]) },
        { title: "Your decision", text: "Still The Mews at Princeton, now with a 20 bps spread and a bigger loan of $135,000,000 (made-up figures). The lower rate no longer saves as much as the early-payoff penalty — but the new loan pays out more than 20% of what you owe in cash, even after the penalty. So the app doesn’t decide for you: it shows both choices. (With the same rate and a loan only the size of what you owe, the answer is Don’t refinance.)",
          go: async (h) => { await openRefi(h, /mews at princeton/); const s = await h.js(() => document.getElementById("o1_fxspread") ? "#o1_fxspread" : "#o1_spread"); await setVal(h, s, 20); await setVal(h, "#o1_amount", 135000000); await h.scroll(VERDICT); },
          shot: { sel: VERDICT, grow: true },
          marks: inOrder([
            { sel: VERDICT + " >> p >> nth=0", label: "Your decision", text: "The property can refinance, and it is worth it only for the cash." },
            { sel: VERDICT + " >> text=/^Can you\\? Yes/", label: "Can you? Yes", text: "The property supports at least what you owe." },
            { sel: VERDICT + " >> text=/^Should you\\? Your decision/", label: "Should you? Your decision", text: "The interest saved is less than the penalty, but the cash out is more than 20% of what you owe." },
            { sel: RV + "[data-refidecision] > div >> nth=0", label: "Refinance now — with $X cash", text: "The cash left after paying off what you owe and the penalty. To take it, save the proposed loan (“Save as a loan — Refinance now” at the top)." },
            { sel: RV + "[data-refidecision] > div >> nth=1", label: "Wait until …", text: "Or keep today’s loan until it ends — nothing changes." },
            { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Your decision.", text: "The choice is yours. Lowering the amount so far that the cash no longer covers the penalty is refused with “You can’t do that”." }
          ]) },
        { title: "Don’t refinance", text: "The Mint: the property supports less than you owe, and its loan doesn’t end or reset within 12 months — so there is nothing to do yet.",
          go: async (h) => { await openRefi(h, /the mint/); await h.scroll(VERDICT); },
          shot: { sel: VERDICT, grow: true },
          marks: inOrder([
            { sel: VERDICT + " >> p >> nth=0", label: "Don’t refinance", text: "The answer." },
            { sel: VERDICT + " >> text=/^Can you\\? No/", label: "Can you? No", text: "What caps it, and what would change it: NOI rising, the rate falling, or a pay-down." },
            { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "Don’t refinance — the property can’t support a loan the size of the payoff yet." }
          ]) },
        { title: "No T12 yet", text: "Avalon Norwalk has no T12. A refinance is sized on the property’s T12 and the underwriting made from it — never on a typed NOI — so nothing is sized: the screen says so and takes you to Underwriting to upload it.",
          go: async (h) => { await openRefi(h, /avalon norwalk/); await h.page.waitForSelector(RV + "[data-refinot12]", { timeout: 15000 }); await h.top(); },
          shot: "view",
          marks: [
            { sel: RV + "[data-refinot12] h3", label: "No T12 yet", text: "This property has no T12 uploaded." },
            { sel: RV + "[data-refinot12] p", label: "Why nothing is sized", text: "A refinance is sized on the T12 and on the underwriting made from it." },
            { sel: RV + "[data-refiuploadt12] >> nth=0", label: "Upload its T12 in Underwriting", text: "Closes the refinance and opens Underwriting on this property, ready for its T12." },
            { sel: "#refiCloseBtn", label: "Close", text: "Back to the loan’s page." }
          ] }
      ] },
    { id: "rate", title: "The proposed rate and amount", intro: "Inside the verdict box: the new loan’s rate type, its index and spread, and the amount.",
      steps: [
        { title: "Hybrid — a fixed period, then adjustable", text: "The proposed loan starts from today’s loan’s type and a typical spread. Type your lender’s quote in the spread boxes; everything above and below updates at once.",
          go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(RV + "#refiPricing"); },
          shot: RV + "#refiPricing",
          marks: [
            { sel: RV + '[data-rtype="Fixed"]', label: "Fixed", text: "One rate for the whole term: a Treasury matched to the term + the lender’s spread." },
            { sel: RV + '[data-rtype="Floating"]', label: "Floating", text: "An index (SOFR, Prime …) + a margin, changing as the index moves." },
            { sel: RV + '[data-rtype="Hybrid ARM"]', label: "Hybrid", text: "Fixed for the first years, then adjustable." },
            { sel: "#o1_fxindex", label: "Index (fixed period)", text: "The Treasury the fixed period is priced on. The list holds every rate the app has; “Fetch live rate” at the top refreshes them." },
            { sel: "#o1_fxspread", label: "Spread (bps)", text: "Type the lender’s quote in basis points (100 bps = 1%)." },
            { sel: "#o1_index", label: "Index (adjustable)", text: "What the rate follows after the fixed period." },
            { sel: "#o1_spread", label: "Margin (bps)", text: "The lender’s margin over that index." },
            { sel: "#o1_amount", label: "Proposed loan amount", text: "Up to what the property supports; lowering it shows the cash you’d pay in." },
            { sel: RV + "#refiPricing [data-refirate] >> xpath=.. >> nth=0", label: "Rate (fixed period)", text: "The rate worked out: the index today + the spread. “Built-in rate — fetch to update” means the index is the app’s own figure until you press “Fetch live rate”. The yellow “starting spread” tag says where the starting spread came from (your recent loans of this kind); it goes once you type the lender’s quote." },
            { sel: RV + "#refiPricing >> text=/the verdict uses this rate/", label: "Monthly payment (fixed period)", text: "The payment in the fixed years — the verdict and the limits use this rate." },
            { sel: RV + "#refiPricing >> text=/shown for information/", label: "Monthly payment (after)", text: "The payment after the fixed period if the index stays where it is today — for information only." },
            { sel: RV + "[data-refiatloan]", label: "At this amount", text: "The proposed loan’s own coverage, interest-only coverage, LTV and debt yield at the amount typed." }
          ] },
        { title: "Floating", text: "Floating: pick the index and type the lender’s margin. The rate shown is today’s index + the margin.",
          go: async (h) => { await h.jsClick(RV + '#refiPricing [data-rtype="Floating"]'); await h.wait(1000); await h.calm(); await h.scroll(RV + "#refiPricing"); },
          shot: RV + "#refiPricing",
          marks: [
            { sel: RV + '[data-rtype="Floating"]', label: "Floating", text: "Picked." },
            { sel: "#o1_index", label: "Index", text: "SOFR (overnight or 30-day average), Prime, or a Treasury — every rate the app has." },
            { sel: "#o1_spread", label: "Spread (bps)", text: "The lender’s margin over the index, in basis points." },
            { sel: "#o1_floor", label: "Rate floor (%)", text: "The lowest the rate can go, whatever the index does. Empty = no floor." },
            { sel: "#o1_cap", label: "Rate cap (%)", text: "The highest the rate can go. Empty = no cap." },
            { sel: "#o1_capcost", label: "Cap cost (bps/yr)", text: "The yearly cost of buying an interest-rate cap, which floating lenders often require. It starts at 0 — a cap costs nothing here until you buy one." },
            { sel: RV + "#refiPricing [data-refirate] >> xpath=..", label: "Rate", text: "Today’s index (and the day it was set) + the spread." },
            { sel: "#o1_amount", label: "Proposed loan amount", text: "The amount of the new loan; switching the rate type works out what the property supports again." }
          ] },
        { title: "Fixed", text: "Fixed: the Treasury that matches the term, plus the lender’s spread.",
          go: async (h) => { await h.jsClick(RV + '#refiPricing [data-rtype="Fixed"]'); await h.wait(1000); await h.calm(); await h.scroll(RV + "#refiPricing"); },
          shot: RV + "#refiPricing",
          marks: [
            { sel: RV + '[data-rtype="Fixed"]', label: "Fixed", text: "Picked." },
            { sel: "#o1_index", label: "Index", text: "The Treasury matched to the loan’s term (change it if the lender prices on another)." },
            { sel: "#o1_spread", label: "Spread (bps)", text: "The lender’s spread." },
            { sel: RV + "#refiPricing [data-refirate] >> xpath=..", label: "Rate", text: "The Treasury today + the spread — one rate for the whole term." },
            { sel: "#o1_amount", label: "Proposed loan amount", text: "The amount of the new loan." },
            { sel: RV + "[data-refiatloan]", label: "At this amount", text: "That loan’s coverage, LTV and debt yield." }
          ] }
      ] },
    { id: "limits", title: "How much the property supports", intro: "How “supports $X” is worked out: the NOI, the rate, the payment, the value — and the four limits a lender sizes a loan on.",
      steps: [
        { title: "How “supports $X” is worked out", text: "Four limits each allow a loan; the smallest of the ones your lender uses is what the property supports. Type your lender’s own figures — they are kept with this refinance for the whole team.",
          go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(BASIS); },
          shot: { sel: BASIS, grow: true },
          marks: [
            { sel: BASIS + " >> text=NOI >> nth=0", label: "NOI", text: "The NOI used, and where it comes from." },
            { sel: BASIS + " >> text=Rate >> nth=0", label: "Rate", text: "The proposed loan’s rate (index + spread)." },
            { sel: BASIS + " >> text=Payment >> nth=0", label: "Payment", text: "How the payment is figured (amortizing, interest-only months)." },
            { sel: BASIS + " >> text=Value >> nth=0", label: "Value", text: "NOI ÷ cap rate — or the appraisal, once you type one. The loan-to-value limit works on this." },
            { sel: RV + '[data-refiappr="value"]', label: "Appraised value", text: "Type an appraisal to use it instead of NOI ÷ cap rate." },
            { sel: RV + '[data-refiappr="date"]', label: "Dated", text: "The appraisal’s date (kept with it)." },
            { sel: RV + '[data-refiappr="note"]', label: "Note", text: "Who appraised it, or any note." },
            { sel: RV + "[data-refipresetrow]", label: "Lender preset", text: "Pick a lender’s saved limits (the topic “Lender presets”)." },
            { sel: RV + '[data-refiuse="DSCR"]', label: "Lender uses", text: "Tick the limits this lender actually uses; an unticked one is greyed and doesn’t count." },
            { sel: RV + '[data-refileg="DSCR"] td >> nth=1', label: "Lender limit", text: "The limit’s name, how its loan is worked out, and (grey) that loan’s coverage, LTV and debt yield." },
            { sel: RV + '[data-refilim="dscr"]', label: "Debt coverage, amortizing", text: "NOI ÷ (this × the loan constant). Lenders often ask 1.20–1.35×." },
            { sel: RV + '[data-refilim="dscrIO"]', label: "Debt coverage, interest-only", text: "Leave blank (not used) unless the lender sizes on the interest-only payment." },
            { sel: RV + '[data-refilim="ltv"]', label: "Loan-to-value", text: "The most it lends as a % of the value." },
            { sel: RV + '[data-refilim="dy"]', label: "Debt yield", text: "The least NOI ÷ loan it accepts." },
            { sel: RV + "[data-refilegamt] >> nth=0", label: "Loan it allows", text: "The biggest loan each limit allows on its own." },
            { sel: BASIS + " >> text=BINDS >> nth=0", label: "Binds", text: "The limit that sets the amount — the smallest one used.", optional: true },
            { sel: RV + "[data-refismallest]", label: "The smallest", text: "The smallest loan of the limits used: what the property supports." },
            { sel: BASIS + " >> text=/of headroom before/", label: "Headroom", text: "How much room is left before the next limit would bind instead.", optional: true },
            { sel: RV + "[data-refihist]", label: "Change history", text: "Every change to this refinance’s limits, appraisal and deal: when, who, old → new." }
          ] },
        { title: "An appraisal and the lender’s own limits", text: "Typed: an appraised value (a made-up $65,000,000), and Debt yield unticked because this lender doesn’t use it. The loan-to-value now works on the appraisal, and the unticked line is greyed.",
          go: async (h) => { await setVal(h, RV + '[data-refiappr="value"]', 65000000); await setVal(h, RV + '[data-refiappr="note"]', "Example appraiser (made-up)"); await tick(h, RV + '[data-refiuse="Debt Yield"]', false); await h.scroll(BASIS); },
          shot: { sel: BASIS, grow: true },
          marks: [
            { sel: RV + "[data-refivalue]", label: "Value", text: "Now the appraisal, with its note.", optional: true },
            { sel: RV + "[data-refiapprclear]", label: "Use NOI ÷ cap rate instead", text: "Drops the appraisal and goes back to the value from NOI ÷ cap rate.", optional: true },
            { sel: RV + '[data-refiappr="value"]', label: "Appraised value", text: "Clear the box to go back to NOI ÷ cap rate." },
            { sel: RV + '[data-refiappr="note"]', label: "Note", text: "Here “Example appraiser (made-up)”." },
            { sel: RV + '[data-refileg="LTV"]', label: "Loan-to-value", text: "75% of the appraisal." },
            { sel: RV + '[data-refileg="Debt Yield"]', label: "Not used by this lender", text: "Greyed; it no longer counts. Tick it to use it again. (At least one limit must stay ticked.)" },
            { sel: RV + "[data-refismallest]", label: "The smallest of the limits this lender uses", text: "Now only the ticked limits count." },
            { sel: RV + "[data-refilimreset]", label: "Back to the start", text: "Puts the limits back to 1.25× / 75% / 7%, all used. Shown once you have changed them.", optional: true },
            { sel: RV + "[data-refihist]", label: "Change history", text: "The changes just made are listed here (next step)." }
          ] },
        { title: "Change history", text: "Every change to this refinance — limits, appraisal, kind of deal, extension terms — with who made it and when.",
          go: async (h) => { await h.click(RV + "[data-refihist]", { wait: 1200 }); },
          after: async (h) => { await hideHistory(h); await h.click(RV + "[data-refilimreset]", { wait: 1200 }); await setVal(h, RV + '[data-refiappr="value"]', ""); await setVal(h, RV + '[data-refiappr="note"]', ""); },
          shot: "#historyModal > div",
          marks: [
            { sel: "#historyTitle", label: "Refinance — change history", text: "This refinance’s own list." },
            { sel: "#historyBody tbody tr >> nth=0", label: "A change", text: "When, what (for example Refinance · appraised value), old → new, who, and where it came from." },
            { sel: "#historyClose", label: "×", text: "Closes the list." }
          ] }
      ] },
    { id: "presets", title: "Lender presets", intro: "A list of lenders’ limits kept for the whole group, so you pick a lender instead of typing its numbers. Only the group’s admin edits the list.",
      steps: [
        { title: "Add a preset", text: "The list starts empty. Next to “Lender preset”, the admin sees “Add a preset” (later “Manage presets”).",
          go: async (h) => { await h.scroll(BASIS); },
          shot: { sel: BASIS, grow: true },
          marks: [
            { sel: RV + "[data-refipresetrow] >> text=none yet", label: "none yet", text: "No presets in the group’s list yet." },
            { sel: RV + "[data-refipresetrow] [data-presetmanage]", label: "Add a preset", text: "Opens the group’s list of lender presets. Only the group’s admin can change it — anyone else gets “Only the group’s admin changes the lender presets”." },
            { sel: RV + '[data-refilim="dscr"]', label: "The limits", text: "Without a preset you type the lender’s limits here yourself." }
          ] },
        { title: "The presets window", text: "Each preset is one lender: its limits and which it uses, how it sizes an all-interest-only loan, the rate types it allows, its longest amortization, its usual penalty on an extension, notes and the source. Nothing is saved until “Save the list”.",
          go: async (h) => {
            await h.click(RV + "[data-refipresetrow] [data-presetmanage]", { wait: 500 }); await h.click("#presetModal [data-presetadd]", { wait: 400 });
            const pf = async (f, v) => { await h.js((a) => { const i = document.querySelector('#presetModal [data-pi="0"][data-pf="' + a.f + '"]'); i.value = String(a.v); i.dispatchEvent(new Event("change", { bubbles: true })); }, { f: f, v: v }); await h.wait(150); };
            await pf("name", "Example Agency (made-up)"); await pf("dscr", 1.3); await pf("ltv", 70); await pf("dy", 8); await pf("maxAmortYears", 30); await pf("source", "made-up example");
            await h.js(() => { const c = document.querySelector('#presetModal [data-pi="0"][data-pf="type:Floating"]'); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); }); await h.wait(300);
            await h.page.selectOption('#presetModal [data-pi="0"][data-pf="penHow"]', "pct"); await h.js(() => document.querySelector('#presetModal [data-pi="0"][data-pf="penHow"]').dispatchEvent(new Event("change", { bubbles: true }))); await h.wait(400);
            await pf("penPct", 50);
          },
          shot: "#presetModal > div",
          marks: [
            { sel: '#presetModal [data-pi="0"][data-pf="name"]', label: "Name", text: "The lender, for example Fannie Mae. A preset without a name is dropped when you save." },
            { sel: '#presetModal [data-pi="0"][data-pf="dscr"]', label: "DSCR", text: "Its debt coverage on the amortizing payment." },
            { sel: '#presetModal [data-pi="0"][data-pf="dscrIO"]', label: "IO", text: "Its coverage on an interest-only payment (blank if it doesn’t use one)." },
            { sel: '#presetModal [data-pi="0"][data-pf="ltv"]', label: "LTV", text: "Its most loan-to-value, in %." },
            { sel: '#presetModal [data-pi="0"][data-pf="dy"]', label: "DY", text: "Its least debt yield, in %." },
            { sel: '#presetModal [data-presetdel="0"]', label: "Remove", text: "Takes this preset off the list." },
            { sel: '#presetModal [data-pi="0"][data-pf="use:DSCR"]', label: "Uses", text: "Tick the limits this lender uses." },
            { sel: '#presetModal [data-pi="0"][data-pf="ioSizing"]', label: "Interest-only sizing", text: "Tick if it sizes a loan that is interest-only for its whole term on the interest-only payment." },
            { sel: '#presetModal [data-pi="0"][data-pf="type:Floating"]', label: "Rate types", text: "The rate types it lends at; an unticked one is greyed in the refinance." },
            { sel: '#presetModal [data-pi="0"][data-pf="maxAmortYears"]', label: "Longest amortization", text: "In years." },
            { sel: '#presetModal [data-pi="0"][data-pf="penHow"]', label: "Penalty on an extension", text: "What this lender usually asks when it extends a loan: the full penalty, on the pay-down only, a part (% or $), or none." },
            { sel: '#presetModal [data-pi="0"][data-pf="penPct"]', label: "Part (%)", text: "For “a part (%)”: the share of the full penalty (here 50%). “A part ($)” asks for a dollar amount instead." },
            { sel: '#presetModal [data-pi="0"][data-pf="notes"]', label: "Notes", text: "Anything else worth remembering about this lender." },
            { sel: '#presetModal [data-pi="0"][data-pf="source"]', label: "Source", text: "Where the numbers came from, and when." },
            { sel: "#presetModal [data-presetadd]", label: "Add a preset", text: "Adds another lender." },
            { sel: "#presetModal [data-presetsave]", label: "Save the list", text: "Saves the list for the whole group and closes the window." },
            { sel: "#presetModal [data-presetclose]", label: "Close", text: "Closes without saving — the changes are dropped." }
          ] },
        { title: "Picking a preset", text: "Saved, then picked for this refinance: the limits fill in from the preset, the table says which preset it is, and a rate type the lender doesn’t allow is greyed.",
          go: async (h) => {
            await h.click("#presetModal [data-presetsave]", { wait: 1200 });
            const id = await h.js(() => (window.LDS_lenderPresets()[0] || {}).id);
            await pickVal(h, RV + "[data-refipreset]", id); await h.scroll(BASIS);
          },
          shot: { sel: BASIS, grow: true },
          marks: [
            { sel: RV + "[data-refipreset]", label: "Lender preset", text: "Pick a lender (or “None — type the limits”)." },
            { sel: RV + "[data-refipresetchip]", label: "Its name", text: "The preset in use — “(changed here)” once you change a limit by hand. Also the rate types it allows and its longest amortization." },
            { sel: RV + "[data-refipresetrow] [data-presetmanage]", label: "Manage presets", text: "Edit the group’s list (admin only)." },
            { sel: RV + "[data-refipresetrow] >> text=/^allows /", label: "What it allows", text: "The rate types this lender lends at, and its longest amortization." },
            { sel: RV + '[data-refilim="dscr"]', label: "The limits", text: "Filled from the preset (here 1.30× / 70% / 8%). Type over one and the chip says “changed here”." },
            { sel: RV + "[data-refismallest]", label: "What the property supports", text: "Worked out again on the preset’s limits." }
          ] },
        { title: "A rate type the lender doesn’t allow", text: "The preset doesn’t allow floating, so “Floating” is greyed in the rate boxes; clicking it says why instead of switching.",
          go: async (h) => { await h.scroll(RV + "#refiPricing"); },
          after: async (h) => { await pickVal(h, RV + "[data-refipreset]", ""); await h.js(() => { const b = document.querySelector("#refiView [data-refilimreset]"); if (b) b.click(); }); await h.wait(1200); await h.calm(); },
          shot: RV + "#refiPricing",
          marks: [
            { sel: RV + '[data-rtype="Floating"]', label: "Floating (greyed)", text: "Not allowed by this lender’s preset. Clicking it shows “Example Agency (made-up): no floating” and nothing changes." },
            { sel: RV + '[data-rtype="Fixed"]', label: "Fixed", text: "Allowed." },
            { sel: RV + '[data-rtype="Hybrid ARM"]', label: "Hybrid", text: "Allowed." }
          ] }
      ] },
    { id: "proposal", title: "The proposed new loan", intro: "When the answer is Refinance (or your decision, or a pay-down), the proposed loan appears with its terms and its payment schedule.",
      steps: [
        { title: "Proposed New Loan", text: "The proposed loan matches today’s term and interest-only period, priced at today’s rate. Every box is editable; the verdict above updates as you type.",
          go: async (h) => { await openRefi(h, /mews at princeton/); const s = await h.js(() => document.getElementById("o1_fxspread") ? "#o1_fxspread" : "#o1_spread"); await setVal(h, s, 0); await h.scroll(card("Proposed New Loan")); },
          shot: { sel: card("Proposed New Loan"), grow: true },
          marks: [
            { sel: card("Proposed New Loan") + " >> text=Loan amount >> nth=0", label: "Loan amount", text: "Set in the verdict box above." },
            { sel: "#o1_termYrs", label: "Term (yrs)", text: "Years until the new loan is due." },
            { sel: "#o1_amortYrs", label: "Amortization (yrs)", text: "Years the payment is figured over." },
            { sel: "#o1_io", label: "Interest-only (mo)", text: "Months of interest-only payments first." },
            { sel: "#o1_closing", label: "Closing (% of loan)", text: "Closing costs, as a % of the loan." },
            { sel: card("Proposed New Loan") + " >> text=/New monthly payment/", label: "New monthly payment", text: "The first payment, and how it compares with today’s." },
            { sel: card("Proposed New Loan") + " >> text=/^vs your current/", label: "vs your current", text: "Today’s monthly payment, and how much the new one saves (or costs) each month." },
            { sel: card("Proposed New Loan") + " >> summary >> nth=0", label: "Escrows & reserves", text: "Click to open: tax and insurance escrows, replacement and TI/LC reserves, ground lease, other escrows." },
            { sel: card("Proposed New Loan") + " >> summary >> nth=1", label: "Additional fees", text: "Click to open: servicing, trustee and other fees." },
            { sel: card("Proposed New Loan") + " >> table >> xpath=..", label: "Amortization schedule", text: "Every payment of the new loan, month by month: rate, interest, payment, principal and balance; interest-only months are marked IO. Scroll inside the box for the rest." }
          ] },
        { title: "Escrows, reserves and fees", text: "Opened: the monthly escrows and reserves, and the fees, that come with the new loan’s payment.",
          go: async (h) => { await h.js(() => { document.querySelectorAll("#refiView details").forEach(d => { d.open = true; }); }); await h.wait(400); await h.scroll(card("Proposed New Loan")); },
          shot: { sel: card("Proposed New Loan") + " >> details >> nth=0 >> xpath=..", grow: true },
          marks: [
            { sel: "#o1_escrowTax", label: "Tax escrow", text: "Monthly real-estate-tax escrow, in dollars a month. Every box here is added to the new loan’s monthly payment." },
            { sel: "#o1_escrowInsurance", label: "Insurance escrow", text: "Monthly insurance escrow." },
            { sel: "#o1_replacementReserve", label: "Replacement reserve", text: "Monthly replacement reserve." },
            { sel: "#o1_tilcReserve", label: "TI/LC reserve", text: "Tenant improvements and leasing commissions (commercial)." },
            { sel: "#o1_groundLease", label: "Ground lease", text: "A ground-lease payment, if any." },
            { sel: "#o1_servicingFee", label: "Servicing fee", text: "The servicer’s monthly fee." },
            { sel: "#o1_otherEscrow1Amt", label: "Other escrow 1", text: "Any other monthly escrow." },
            { sel: "#o1_otherEscrow2Amt", label: "Other escrow 2", text: "A second one." },
            { sel: "#o1_trusteeFee", label: "Trustee fee", text: "The trustee’s monthly fee." },
            { sel: "#o1_otherFee1Amt", label: "Other fee 1", text: "Any other monthly fee." },
            { sel: "#o1_otherFee2Amt", label: "Other fee 2", text: "A second one." }
          ] }
      ] },
    { id: "save", title: "Save as a loan", intro: "Saving the refinance makes the proposed loan a real loan and marks today’s loan paid off.",
      steps: [
        { title: "It asks first", text: "“Save as a loan” shows what will happen before anything changes. Today’s loan becomes Paid off (refinanced) and leaves the totals; the new loan is added with today’s date. A pay-down is recorded on the new loan.",
          go: async (h) => { await h.top(); await h.click("#refiSaveBtn", { wait: 600 }); },
          after: async (h) => { await confirmNo(h); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Save the refinance?", text: "The question.", optional: true },
            { sel: "#confirmText", label: "What happens", text: "The new loan, the old loan(s) paid off, and any cash paid in." },
            { sel: "#confirmOk", label: "Save the refinance", text: "Does it. (Today’s loan can be restored from “Removed & paid-off loans” on the Portfolio tab.)" },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." }
          ] }
      ] },
    { id: "extend", title: "Extend with today’s lender", intro: "Instead of a new loan: today’s lender keeps the loan on new terms — usually after a pay-down so it fits the lender’s limits.",
      steps: [
        { title: "Pick “Extend with today’s lender”", text: "Everything below now judges the extension: its own verdict, its rate, its limits and its terms. “Save the extension” appears at the top when the answer is Extend.",
          go: async (h) => { await openRefi(h, /queens gate/); await pickDeal(h, "extend"); await h.top(); },
          shot: "view",
          marks: [
            { sel: RV + '[data-refideal="extend"]', label: "Extend with today’s lender", text: "Picked." },
            { sel: "#refiExtSaveBtn", label: "Save the extension", text: "Saves the extension on today’s loan (it asks first) — with the pay-down it needs." }
          ] },
        { title: "The extension’s verdict", text: "The same rule as a new loan, applied to the extension: the pay-down it needs to fit today’s lender’s limits, and whether it is worth doing.",
          go: async (h) => { await h.scroll(VERDICT); },
          shot: { sel: VERDICT, grow: true },
          marks: [
            { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "Extend — pay down $X (or Not yet, or Don’t extend now)." },
            { sel: VERDICT + " >> text=/^You.ll owe on/", label: "You’ll owe on …", text: "What you will owe on the day today’s terms end." },
            { sel: VERDICT + " >> text=Today’s lender allows", label: "Today’s lender allows", text: "The biggest loan today’s lender’s limits allow at the extension’s rate." },
            { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "With the reset ahead." },
            { sel: VERDICT + " >> text=Extension rate", label: "Extension rate", text: "The index + today’s lender’s spread." },
            { sel: RV + '[data-refiextf="index"]', label: "Index", text: "What the extension’s rate floats on — every rate the app has." },
            { sel: RV + '[data-refiextf="spreadBps"]', label: "Spread (bps)", text: "Today’s lender’s quote over the index." },
            { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "Yes — with or without a pay-down." },
            { sel: RV + '[data-refipaydown="extend"]', label: "The pay-down", text: "What you will owe less what the lender’s limits allow, and which limit sets it.", optional: true },
            { sel: RV + "[data-refibasisext]", label: "Today’s lender’s limits", text: "The limits table for the extension — kept apart from a new loan’s (next step)." },
            { sel: VERDICT + " >> text=/^Should you\\?/", label: "Should you?", text: "Yes when today’s loan ends or resets within 12 months; “Not yet” when nothing ends or resets within 12 months; otherwise yes only when the lower rate saves more than the penalty." },
            { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do, with the cash it takes: pay-down + penalty + fee." }
          ] },
        { title: "Today’s lender’s limits", text: "Type today’s lender’s own limits for the extension (here 1.11× amortizing and 1.35× interest-only, made-up). They are kept with the property, separately from a new loan’s.",
          go: async (h) => { await setVal(h, RV + '[data-refiextlim="dscr"]', 1.11); await setVal(h, RV + '[data-refiextlim="dscrIO"]', 1.35); await setVal(h, RV + '[data-refiappr="value"]', 65000000); await h.scroll(RV + "[data-refibasisext]"); },
          shot: { sel: RV + "[data-refibasisext]", grow: true },
          marks: [
            { sel: RV + '[data-refiextlim="dscr"]', label: "Amortizing coverage", text: "Today’s lender’s DSCR." },
            { sel: RV + '[data-refiextlim="dscrIO"]', label: "Interest-only coverage", text: "Its coverage on the interest-only payment." },
            { sel: RV + '[data-refiextlim="ltv"]', label: "Loan-to-value", text: "Today’s lender’s most loan-to-value — here on the appraisal typed above." },
            { sel: RV + '[data-refiextlim="dy"]', label: "Debt yield", text: "Its least debt yield." },
            { sel: RV + '[data-refiextuse="DSCR"]', label: "Lender uses", text: "Untick a limit today’s lender doesn’t use." },
            { sel: RV + "[data-refiextpresetrow]", label: "Lender preset", text: "Pick today’s lender’s preset, if the group has one (“Manage presets” edits the list — admin only)." },
            { sel: RV + '[data-refibasisext] [data-refiappr="value"]', label: "Appraised value", text: "Shared with the new loan’s: one appraisal for the property (here a made-up $65,000,000)." },
            { sel: RV + "[data-refibasisext] [data-refismallest]", label: "What today’s lender allows", text: "The smallest of the limits it uses; the binding one is marked BINDS." },
            { sel: RV + "[data-refiiohint]", label: "Interest-only hint", text: "The extension is interest-only for its whole term: untick the amortizing line if the lender sizes on the interest-only payment.", optional: true },
            { sel: RV + "[data-refiextlimreset]", label: "Back to the new loan’s limits", text: "Drops today’s lender’s own limits and uses the new loan’s again.", optional: true },
            { sel: RV + "[data-refibasisext] [data-refihist]", label: "Change history", text: "Every change to the refinance, these limits included." }
          ] },
        { title: "The extension’s terms", text: "When today’s terms end, how long the new terms run, interest-only, the amortization after it, the lender’s penalty and the fee — and what it all adds up to.",
          go: async (h) => { await h.scroll(RV + '[data-refiext="draft"]'); },
          shot: { sel: RV + '[data-refiext="draft"]', grow: true },
          marks: [
            { sel: RV + '[data-refiextf="date"]', label: "Today’s terms end on", text: "Starts at the payment before the rate resets (or the maturity)." },
            { sel: RV + '[data-refiextf="months"]', label: "Months on the new terms", text: "How long the extension runs." },
            { sel: RV + '[data-refiextf="io"]', label: "Interest-only", text: "The whole term, the first N months, or none." },
            { sel: RV + '[data-refiextf="amortMonths"]', label: "Amortization", text: "Months the payment is figured over after interest-only." },
            { sel: RV + '[data-refiextf="penaltyHow"]', label: "Early-payoff penalty", text: "What this lender asks: the full penalty, on the pay-down only, a part, or none. Until you pick, it assumes “on the pay-down”." },
            { sel: RV + '[data-refiextf="feeKind"]', label: "Extension fee in", text: "% of the extended amount, or dollars." },
            { sel: RV + '[data-refiextf="feeValue"]', label: "Extension fee", text: "The fee." },
            { sel: RV + '[data-refipaydown="extend-card"]', label: "Pay-down needed", text: "What you pay down so the loan fits the lender’s limits." },
            { sel: RV + '[data-refiext="draft"] dt:text-is("Extended amount")', label: "Extended amount", text: "What you owe after the pay-down." },
            { sel: RV + '[data-refiext="draft"] dl > div >> nth=2 >> dt', label: "At this amount", text: "The extended loan’s coverage, interest-only coverage, LTV and debt yield." },
            { sel: RV + '[data-refiext="draft"] dt:text-is("Early-payoff penalty")', label: "Penalty", text: "In dollars, how it was worked out, and the full penalty today." },
            { sel: RV + "[data-refiextassumed]", label: "Assumed", text: "Until you pick what this lender asks, the penalty is assumed to be on the pay-down only — confirm it with the lender.", optional: true },
            { sel: RV + '[data-refiext="draft"] dt:text-is("Extension fee")', label: "Extension fee", text: "The fee in dollars." },
            { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Pay-down + penalty + fee." },
            { sel: RV + '[data-refiext="draft"] dt:text-is("First payment on the new terms")', label: "First payment", text: "The date and amount of the first payment on the new terms." },
            { sel: RV + '[data-refiext="draft"] dt:text-is("New maturity")', label: "New maturity", text: "When the extended loan is due." },
            { sel: RV + "[data-refiextearlier]", label: "Earlier than today’s", text: "A warning: these terms would end before today’s loan does. Type more months if that isn’t what you mean.", optional: true }
          ] },
        { title: "Penalty: a part of it", text: "Picking “a part (%)” asks what share of the full penalty the lender wants; “a part ($)” asks for the dollar figure. “The first N months” of interest-only asks how many months.",
          go: async (h) => { await pickVal(h, RV + '[data-refiextf="penaltyHow"]', "pct"); await setVal(h, RV + '[data-refiextf="penaltyPct"]', 40); await pickVal(h, RV + '[data-refiextf="io"]', "n"); await h.scroll(RV + '[data-refiext="draft"]'); },
          shot: { sel: RV + '[data-refiext="draft"]', grow: true },
          marks: [
            { sel: RV + '[data-refiextf="penaltyPct"]', label: "Part of the full penalty (%)", text: "Here 40% of today’s full penalty." },
            { sel: RV + '[data-refiextf="ioMonths"]', label: "Interest-only months", text: "How many months are interest-only (it appears when you pick “The first N months”)." },
            { sel: RV + '[data-refiext="draft"] dt:text-is("Early-payoff penalty")', label: "Penalty", text: "Now 40% of the full penalty — no longer “assumed”." },
            { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Follows at once." }
          ] },
        { title: "Penalty and fee in dollars", text: "“A part — a dollar amount” asks for the penalty the lender quotes, in dollars; the fee can be dollars too. Here a made-up $100,000 penalty and a $25,000 fee.",
          go: async (h) => { await pickVal(h, RV + '[data-refiextf="penaltyHow"]', "amt"); await setVal(h, RV + '[data-refiextf="penaltyAmt"]', 100000); await pickVal(h, RV + '[data-refiextf="feeKind"]', "amt"); await setVal(h, RV + '[data-refiextf="feeValue"]', 25000); await h.scroll(RV + '[data-refiext="draft"]'); },
          after: async (h) => { await pickVal(h, RV + '[data-refiextf="io"]', "whole"); await pickVal(h, RV + '[data-refiextf="penaltyHow"]', "paydown"); await pickVal(h, RV + '[data-refiextf="feeKind"]', "pct"); await setVal(h, RV + '[data-refiextf="feeValue"]', 0); },
          shot: { sel: RV + '[data-refiext="draft"]', grow: true },
          marks: [
            { sel: RV + '[data-refiextf="penaltyHow"]', label: "A part — a dollar amount", text: "The other choices: the full penalty, on the pay-down only, a part (%), none." },
            { sel: RV + '[data-refiextf="penaltyAmt"]', label: "Penalty the lender asks ($)", text: "The lender’s figure." },
            { sel: RV + '[data-refiextf="feeKind"]', label: "Extension fee in dollars", text: "Or % of the extended amount." },
            { sel: RV + '[data-refiextf="feeValue"]', label: "Extension fee", text: "Here $25,000." },
            { sel: RV + '[data-refiext="draft"] dt:text-is("Extension fee")', label: "Fee", text: "Counted in the cash needed." },
            { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Pay-down + $100,000 + $25,000." }
          ] },
        { title: "The payment schedule with the extension", text: "From today to the new maturity: the pay-down on the date today’s terms end, where the extension starts, and its months shaded.",
          go: async (h) => { await h.scroll(RV + "[data-refiextsched]"); },
          shot: { sel: RV + "[data-refiextsched]", grow: true },
          marks: [
            { sel: RV + "[data-refiextsched] h3", label: "From today to …", text: "The whole schedule with the extension in place." },
            { sel: RV + "[data-schedpaid]", label: "Paid down", text: "The pay-down, as a principal payment." },
            { sel: RV + "[data-schedext]", label: "Extension starts", text: "The first payment on the new terms." },
            { sel: RV + "[data-schedext-row] >> nth=1", label: "Extension months", text: "Shaded: the new rate and terms." }
          ] },
        { title: "Save the extension", text: "It asks first. Today’s loan stays the same record: from the date its terms end, the new rate and term; the pay-down becomes a principal payment; the status becomes Extended. Every changed field goes into the loan’s history.",
          go: async (h) => { await h.top(); await h.click("#refiExtSaveBtn", { wait: 600 }); },
          after: async (h) => { await confirmYes(h); await h.wait(800); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Save the extension?", text: "The question." },
            { sel: "#confirmText", label: "What happens", text: "The new terms, the pay-down, the penalty, the new maturity, the status and the cash needed." },
            { sel: "#confirmOk", label: "Save the extension", text: "Saves it." },
            { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." }
          ] },
        { title: "Saved — with Undo", text: "The refinance now shows the saved extension. “Undo the extension” puts today’s loan back exactly as it was (it asks first); “Change history” lists what changed.",
          go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(RV + '[data-refiext="saved"]'); },
          shot: { sel: RV + '[data-refiext="saved"]', grow: true },
          marks: [
            { sel: RV + '[data-refiext="saved"] p >> nth=0', label: "Extended with today’s lender", text: "The extension is saved on today’s loan." },
            { sel: RV + '[data-refiext="saved"] p >> nth=1', label: "Saved", text: "When, and by whom. The loan’s schedule (on its own page too) now has the extension." },
            { sel: RV + '[data-refiext="saved"] p >> nth=2', label: "What was saved", text: "The new terms, the pay-down, the new maturity and the cash it took." },
            { sel: RV + "[data-refiextundo]", label: "Undo the extension", text: "Restores today’s loan exactly as before the extension (it asks first)." },
            { sel: RV + '[data-refiext="saved"] [data-refihist]', label: "Change history", text: "The refinance’s history — the extension and every change before it." }
          ] },
        { title: "Undo", text: "Undo asks first, then puts back the rate, the maturity, the status and the schedule. The undo is in the history too.",
          go: async (h) => { await h.click(RV + "[data-refiextundo]", { wait: 600 }); },
          after: async (h) => { await confirmYes(h); },
          shot: confirmBox,
          marks: [
            { sel: "#confirmTitle", label: "Undo the extension?", text: "The question." },
            { sel: "#confirmText", label: "What happens", text: "The loan goes back to its terms before the extension; the pay-down comes off the schedule; the history keeps both." },
            { sel: "#confirmOk", label: "Undo", text: "Does it." },
            { sel: "#confirmCancel", label: "Cancel", text: "Keeps the extension." }
          ] },
        { title: "Not yet", text: "The Mews at Princeton: today’s lender’s limits cover what you’ll owe, but nothing ends or resets within 12 months — so “Not yet”, and there is no “Save the extension” button. (When a lower rate doesn’t pay for the penalty, the answer is “Don’t extend now”.)",
          go: async (h) => { await openRefi(h, /mews at princeton/); await pickDeal(h, "extend"); await h.scroll(XVERDICT); },
          after: async (h) => { await pickDeal(h, "new"); },
          shot: { sel: XVERDICT, grow: true },
          marks: [
            { sel: XVERDICT + " >> p >> nth=0", label: "Not yet", text: "Today’s terms end more than 12 months from now." },
            { sel: XVERDICT + " >> text=/^Can you\\?/", label: "Can you? Yes", text: "Today’s lender’s limits allow more than you’ll owe — no pay-down needed." },
            { sel: XVERDICT + " >> text=/^Should you\\?/", label: "Should you? Not yet", text: "When today’s terms end, and that nothing ends or resets within 12 months." },
            { sel: XVERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "Not yet — decide closer to the date." }
          ] }
      ] },
    { id: "together", title: "Several loans or properties together", intro: "A property with a senior and a mezzanine loan refinances as one package; “Create a portfolio…” puts several properties under one new loan.",
      steps: [
        { title: "Senior + mezz — the whole property", text: "Pick the property’s combined entry (“2 loans”) under Specific Property, then Refi Calculator: both loans are paid off by one new loan. Here Avalon White Plains, with a made-up T12.",
          go: async (h) => {
            await h.closeModals(); await h.js(() => { const b = document.getElementById("refiCloseBtn"); if (b && b.offsetParent) b.click(); }); await h.home();
            await h.js(() => { const b = document.getElementById("scopeLoanBtn"); if (b) b.click(); }); await h.wait(500);
            await h.js(() => { const p = window.opProperties().find(x => x.name === "Avalon White Plains"); const s = document.getElementById("loanSelect"); s.value = "combo:" + p.key; s.dispatchEvent(new Event("change", { bubbles: true })); });
            await h.wait(800); await h.click("#refiBtn", { wait: 1500 }); await h.calm(); await h.top();
          },
          shot: { sel: card("Current debt"), grow: true },
          marks: [
            { sel: card("Current debt") + " >> text=/loans on this property/", label: "The loans", text: "Every loan on the property, refinanced together (they depend on one another)." },
            { sel: card("Current debt") + " >> text=Payoff balance", label: "Payoff balance", text: "Each loan at its own balance, added up." },
            { sel: card("Current debt") + " >> text=Monthly payments", label: "Monthly payments", text: "Today’s payments on all of them." },
            { sel: card("Current debt") + " >> text=Current rate", label: "Current rate", text: "The loans’ rate together, weighted by what is owed on each." },
            { sel: card("Current debt") + " >> text=Remaining", label: "Remaining", text: "Months until the first of them ends." },
            { sel: card("Current debt") + " >> text=Matures", label: "Matures", text: "When the first of them is due." }
          ] },
        { title: "Create a portfolio…", text: "On the Portfolio tab, above the Coverage table: “Create a portfolio…”. Tick every property the one new loan will secure; each row shows what is owed and the NOI its refinance would use, and the line under the list adds them up. Nothing changes until you save the new loan on the next screen.",
          go: async (h) => {
            await h.js(() => { const b = document.getElementById("refiCloseBtn"); if (b && b.offsetParent) b.click(); }); await h.home();
            await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(500);
            await h.jsClick("#poolRefiBtn"); await h.wait(1200);
            await pickPool(h, ["queens gate apartments", "the mews at princeton", "villages of whitewater"]);
          },
          shot: "#poolPicker > div",
          marks: [
            { sel: "#poolPickSearch", label: "Find a property", text: "Type to narrow the list." },
            { sel: '#poolPicker [data-poolpickrow="queens gate apartments"] [data-poolpick]', label: "Tick a property", text: "Tick each property the new loan will secure." },
            { sel: '#poolPicker [data-poolpickrow="queens gate apartments"] [data-poolpicknoi]', label: "Owes · NOI", text: "What is owed on the property, and the NOI its refinance would use: its T12 (In-place T12), or its Safe underwriting once approved." },
            { sel: '#poolPicker [data-poolpickrow="villages of whitewater"] [data-poolpicknoi]', label: "Safe underwriting", text: "Villages of Whitewater’s underwriting is approved, so its Safe figure is used (you can pick another basis on the next screen).", optional: true },
            { sel: '#poolPicker [data-poolpicknoi="none"] >> nth=0', label: "no T12", text: "A property with no T12. You can tick it, but nothing is sized until its T12 is uploaded — a typed NOI doesn’t count for a refinance.", optional: true },
            { sel: "#poolPickNote", label: "The package", text: "How many are ticked, the loans to pay off and what is owed, and the NOI together (or which ticked property has no T12)." },
            { sel: "#poolPickCancel", label: "Cancel", text: "Closes the list." },
            { sel: "#poolPickGo", label: "Create the portfolio", text: "Opens the refinance of the ticked properties together. It needs at least two, and at least one loan to pay off." }
          ] },
        { title: "NOI by property — each with its own basis", text: "The same refinance screen, for the whole package. Each property has its own row and its own NOI basis: In-place T12, or Safe or Aggressive once its underwriting is approved. The package is sized on the total.",
          go: async (h) => { await h.click("#poolPickGo", { wait: 2500 }); await h.calm(); await h.page.waitForSelector(RV + "[data-refipoolnoitable]", { timeout: 15000 }); await h.scroll(RV + "[data-refipoolnoitable]"); },
          shot: { sel: RV + "[data-refipoolnoitable]", grow: true },
          marks: [
            { sel: RV + "[data-refipoolnoi] >> nth=0", label: "A property", text: "One row per property in the package." },
            { sel: RV + "[data-refikeybasis] >> nth=0", label: "Its basis", text: "Pick the NOI this property counts with. Safe and Aggressive are greyed (“approve it first”) until its underwriting is approved." },
            { sel: RV + "[data-refipoolnoi] td >> nth=2", label: "NOI", text: "Its NOI on the basis picked." },
            { sel: RV + "[data-refipoolnoi] td >> nth=3", label: "+ ticked pushes", text: "What its ticked pushes add (below)." },
            { sel: RV + "[data-refipoolnoi] td >> nth=4", label: "From", text: "Where the figure comes from: the T12 and its months, or the approved underwriting and when it was approved." },
            { sel: RV + "[data-refipooltotal]", label: "Total", text: "The NOI the package is sized on: every property’s NOI, its pushes and your levers." }
          ] },
        { title: "Pick each property’s basis", text: "Villages of Whitewater switched to its Aggressive underwriting; Queens Gate and The Mews stay on their in-place T12. The total and everything below follow; each pick is kept with this refinance.",
          go: async (h) => { await h.select(RV + '[data-refipoolnoi]:has-text("Villages of Whitewater") [data-refikeybasis]', "aggressive", { wait: 1500 }); await h.calm(); await h.scroll(RV + "[data-refipoolnoitable]"); },
          shot: { sel: RV + "[data-refipoolnoitable]", grow: true },
          marks: [
            { sel: RV + '[data-refipoolnoi]:has-text("Villages of Whitewater") [data-refikeybasis]', label: "Aggressive underwriting", text: "Picked for this property only." },
            { sel: RV + '[data-refipoolnoi]:has-text("Villages of Whitewater") td >> nth=2', label: "Its NOI", text: "Now its approved Aggressive figure." },
            { sel: RV + "[data-refipooltotal]", label: "Total", text: "Worked out again." }
          ] },
        { title: "Each property’s pushes", text: "What to push lists each property’s pushes under its name, ticked one by one; a push counts its effect on the basis picked for its property. A property whose underwriting isn’t approved has none yet.",
          go: async (h) => { await tick(h, RV + '[data-refipoolnoi] ~ * [data-refimove], ' + RV + "[data-refimove]", true); await h.scroll(PUSHBOX); },
          shot: { sel: PUSHBOX, grow: true },
          marks: [
            { sel: PUSHBOX + ' div.uppercase:has-text("Villages of Whitewater")', label: "Villages of Whitewater · on the Aggressive underwriting", text: "Its pushes, counted on the basis picked for it." },
            { sel: RV + "[data-refimove] >> nth=0", label: "A push ticked", text: "Its effect on Aggressive is added to the package’s NOI." },
            { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "Everything ticked, every property together." },
            { sel: PUSHBOX + ' div.uppercase:has-text("Queens Gate")', label: "Queens Gate Apartments", text: "No pushes yet: approve its underwriting in Underwriting first, then What to push lists them." },
            { sel: RV + "[data-refitargetbox]", label: "The amount to cover", text: "For the whole package." }
          ] },
        { title: "The portfolio’s verdict", text: "“These 3 properties support …” — the verdict and everything after it work exactly as for one loan; “Save as a loan” puts one new loan on all of them and pays off every loan on them.",
          go: async (h) => { await h.scroll(VERDICT); },
          shot: { sel: VERDICT, grow: true },
          marks: [
            { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "For the whole package." },
            { sel: VERDICT + " >> p >> nth=1", label: "Which properties", text: "The properties and the number of loans paid off." },
            { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "Every loan on them, added up." },
            { sel: VERDICT + " >> text=/Properties support/", label: "Properties support", text: "The biggest single loan the properties support together." },
            { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "The loans’ rate together, weighted by what is owed." },
            { sel: VERDICT + " >> text=Proposed loan rate", label: "Proposed loan rate", text: "The one new loan’s rate." },
            { sel: RV + "[data-refimust]", label: "When, and the pay-down", text: "What ends first, and the pay-down a new loan needs. (An extension isn’t offered for a package — it is a single loan’s choice.)", optional: true },
            { sel: PRICE, label: "Proposed rate", text: "The one new loan’s rate type, index and spread." },
            { sel: "#o1_amount", label: "Proposed loan amount", text: "The one new loan." },
            { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "For all of them together." },
            { sel: BASIS, label: "How “supports $X” is worked out", text: "The package’s NOI (every property on its own basis, with its pushes), the rate, the payment, the value and the limits." },
            { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do for the package." }
          ] },
        { title: "A property with no T12", text: "Here Queens Gate Apartments and Avalon Norwalk, which has no T12. Counting it as $0 — or on a typed NOI — would misstate what the package supports, so nothing is sized until its T12 is uploaded.",
          go: async (h) => {
            await h.js(() => { const b = document.getElementById("refiCloseBtn"); if (b && b.offsetParent) b.click(); }); await h.home();
            await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(500);
            await h.jsClick("#poolRefiBtn"); await h.wait(1200);
            await pickPool(h, ["queens gate apartments", "avalon norwalk"]);
            await h.click("#poolPickGo", { wait: 2500 }); await h.calm(); await h.page.waitForSelector(RV + "[data-refinot12]", { timeout: 15000 }); await h.top();
          },
          shot: "view",
          marks: [
            { sel: RV + "[data-refinot12] h3", label: "No T12 yet", text: "The package can’t be sized yet." },
            { sel: RV + "[data-refinot12] p", label: "Which property", text: "The property with no T12 — the others are fine." },
            { sel: RV + "[data-refiuploadt12] >> nth=0", label: "Upload Avalon Norwalk’s T12 in Underwriting", text: "Opens Underwriting on that property, ready for its T12; come back to the package afterwards." },
            { sel: "#refiCloseBtn", label: "Close", text: "Back to the Portfolio tab." }
          ] }
      ] }
  ]
};
