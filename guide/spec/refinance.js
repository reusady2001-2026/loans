/* Guide chapter: Refinance — run a refinance, set the proposed loan, lender presets, what to push, an extension with
   today's lender, several loans together, saving the refinance as a loan, and the reference page for the refinance screen.
   The pictures use the app's built-in sample loans. A refinance is sized on the property's T12 (or the underwriting
   approved from it — 2026-10-21), and the sample loans have none, so each property refinanced here gets a MADE-UP T12:
   Villages of Whitewater the made-up "Sample Gardens" T12 (test/fixtures/proforma-t12.js), its underwriting approved
   and Claude's (made-up) "what to push"; Queens Gate, The Mews, The Mint and Avalon White Plains a made-up T12 whose
   NOI is the figure the sample loan already carries (so the examples' verdicts stay what the words say).
   Order of the pages in this file: the how-tos first, each putting back what it changed, then the reference page, then
   "Save the refinance as a loan", which really saves one (The Mews at Princeton) at the very end. */
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
const confirmBox = "#confirmModal > div";
const PRICE = RV + "#refiPricing [data-rtype] >> xpath=../../..";
const PUSHBOX = RV + "[data-refipushbox]";
const EXTCARD = RV + '[data-refiext="draft"]';
const REFIBTN_BOX = "#refiBtn >> xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' boxline ') or contains(@class,'rounded-2xl')][1]";
const EXITBOX = card("Coverage") + ' >> div:has(> div > h4:has-text("Exit cost"))';
// the parts every sized verdict box has: the four figures, the rate, the amount and "How supports $X is worked out"
const verdictParts = () => [
  { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "What a new loan has to pay off." },
  { sel: VERDICT + " >> text=/Property supports/", label: "Property supports", text: "The biggest loan the property supports at the proposed rate and the lender’s limits." },
  { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "The rate today’s loan charges now." },
  { sel: VERDICT + " >> text=Proposed loan rate", label: "Proposed loan rate", text: "The new loan’s rate, from the rate boxes below." },
  { sel: PRICE, label: "Proposed rate", text: "The new loan’s rate type, index and spread. See [Rate & amount](ref-refinance#rate-amount)." },
  { sel: "#o1_amount", label: "Proposed loan amount", text: "Type a smaller amount to test it. The line under it shows that loan’s coverage, LTV and debt yield." },
  { sel: BASIS, label: "How “supports $X” is worked out", text: "The NOI, rate, payment and value behind the figure, and the lender’s four limits. See [How much it supports](ref-refinance#how-much-it-supports)." }
];
// a verdict's own marks in reading order: the answer, the figures, rate and amount, "Can you?", how it is worked out, the rest
const inOrder = (own) => { const parts = verdictParts(), basis = parts.pop(), ci = own.findIndex(m => /^Can you/.test(m.label));
  return [own[0]].concat(parts, own.slice(1, ci + 1), [basis], own.slice(ci + 1)); };

const closeRefi = async (h) => { await h.js(() => { const b = document.getElementById("refiCloseBtn"); if (b && b.offsetParent) b.click(); }); await h.wait(300); };
// open a loan's refinance from its page
const openRefi = async (h, re) => {
  await h.closeModals();
  await closeRefi(h);
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
const spreadSel = (h) => h.js(() => document.getElementById("o1_fxspread") ? "#o1_fxspread" : "#o1_spread");
// The Mews at Princeton with the lender's spread typed as `bps` (0 makes the answer "Refinance")
const mewsAt = async (h, bps) => { await openRefi(h, /mews at princeton/); await setVal(h, await spreadSel(h), bps); };
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
// the lender's limits back to 1.25× / 75% / 7%, all used, and no appraisal
const resetLimits = async (h) => {
  await h.js(() => { const b = document.querySelector("#refiView [data-refilimreset]"); if (b) b.click(); }); await h.wait(1200); await h.calm();
  await setVal(h, RV + '[data-refiappr="value"]', ""); await setVal(h, RV + '[data-refiappr="note"]', "");
};
const pickPool = async (h, names) => {
  await h.js((ns) => { document.querySelectorAll("#poolPicker [data-poolpick]").forEach(c => { c.checked = false; });
    ns.forEach(n => { const r = document.querySelector('#poolPicker [data-poolpickrow="' + n + '"] [data-poolpick]'); if (r){ r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); } });
    const first = document.querySelector('#poolPicker [data-poolpickrow="' + ns[0] + '"]'), list = document.getElementById("poolPickList");
    if (first && list) list.scrollTop = Math.max(0, first.offsetTop - list.offsetTop - 60); }, names);
  await h.wait(500);
};
// the Portfolio tab, "Create a portfolio…", and these properties ticked
const openPicker = async (h, names) => {
  await h.closeModals(); await closeRefi(h); await h.home();
  await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(500);
  await h.jsClick("#poolRefiBtn"); await h.wait(1200);
  await pickPool(h, names);
};
const POOL3 = ["queens gate apartments", "the mews at princeton", "villages of whitewater"];
const openPool3 = async (h) => { await openPicker(h, POOL3); await h.click("#poolPickGo", { wait: 2500 }); await h.calm(); await h.page.waitForSelector(RV + "[data-refipoolnoitable]", { timeout: 15000 }); };
// Avalon White Plains' combined entry (senior + mezz) under Specific Property, then Refi Calculator
const openCombo = async (h) => {
  await h.closeModals(); await closeRefi(h); await h.home();
  await h.js(() => { const b = document.getElementById("scopeLoanBtn"); if (b) b.click(); }); await h.wait(500);
  await h.js(() => { const p = window.opProperties().find(x => x.name === "Avalon White Plains"); const s = document.getElementById("loanSelect"); s.value = "combo:" + p.key; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await h.wait(800); await h.click("#refiBtn", { wait: 1500 }); await h.calm(); await h.top();
};
const hideHistory = async (h) => { await h.js(() => { const m = document.getElementById("historyModal"); if (m){ m.classList.add("hidden"); m.classList.remove("flex"); } }); await h.wait(200); };
// the made-up lender preset: typed into the presets window's first row
const fillPreset = async (h) => {
  const pf = async (f, v) => { await h.js((a) => { const i = document.querySelector('#presetModal [data-pi="0"][data-pf="' + a.f + '"]'); i.value = String(a.v); i.dispatchEvent(new Event("change", { bubbles: true })); }, { f: f, v: v }); await h.wait(150); };
  await pf("name", "Example Agency (made-up)"); await pf("dscr", 1.3); await pf("ltv", 70); await pf("dy", 8); await pf("maxAmortYears", 30); await pf("source", "made-up example");
  await h.js(() => { const c = document.querySelector('#presetModal [data-pi="0"][data-pf="type:Floating"]'); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); }); await h.wait(300);
  await h.page.selectOption('#presetModal [data-pi="0"][data-pf="penHow"]', "pct"); await h.js(() => document.querySelector('#presetModal [data-pi="0"][data-pf="penHow"]').dispatchEvent(new Event("change", { bubbles: true }))); await h.wait(400);
  await pf("penPct", 50);
};
const pickPreset = async (h) => { const id = await h.js(() => (window.LDS_lenderPresets()[0] || {}).id); await pickVal(h, RV + "[data-refipreset]", id); };
// a thin, wide area (a strip across the whole page) shows at half size in the guide: taken with a narrower window (the
// app's narrowest, 1024 pixels) it wraps, and shows larger. A step or view with `thin: <width>` is taken at that window
// width, then the width goes back.
const setW = async (h, w) => { await h.ctx.setSize(w, h.ctx.H); await h.wait(700); await h.calm(); };
const thin = (x) => Object.assign({}, x, {
  go: async (h) => { if (x.go) await x.go(h); await setW(h, x.thin); },
  after: async (h) => { await setW(h, h.ctx.W); if (x.after) await x.after(h); } });
const withThin = (pages) => { pages.forEach(p => (p.sections || []).forEach(sc => ["steps", "views"].forEach(k => { if (sc[k]) sc[k] = sc[k].map(x => x.thin ? thin(x) : x); }))); return pages; };
const MEWS_DONE = '#inactiveLoansStrip span.inline-flex:has([data-restoreloan]):has-text("Mews")';

module.exports = {
  id: "refinance",
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
  pages: withThin([
    // ==================================================================================================================
    { id: "run-a-refinance", kind: "howto", group: "Refinance", title: "Run a refinance",
      description: "Open a loan’s refinance, check where today’s loan stands, and read the verdict: can you refinance, and should you?",
      intro: "The refinance answers two questions about a loan: can the property support a new loan the size of what you owe, and is it worth doing? It is worked out live from the property’s T12 (or its approved underwriting) and today’s rates. Nothing about the loan changes until you save something.",
      before: [ "The property’s T12, uploaded in Underwriting — see [Upload a T12](upload-a-t12). A refinance is never sized on a typed NOI." ],
      sections: [
        { title: "Open the refinance",
          steps: [
            { text: "Open the loan’s page: click its property on the **Portfolio** tab, or pick it under **Specific Property**. See [Open a loan](open-a-loan)." },
            { text: "Click **Refi Calculator** at the top of the loan’s page. The refinance opens in its place.",
              go: async (h) => { await h.openLoan(/queens gate/); await h.top(); },
              shot: { sel: REFIBTN_BOX },
              marks: [ { sel: "#refiBtn", label: "Refi Calculator", text: "Opens the refinance for the loan on this page." } ] },
            { text: "Read **Current Loan**: what you owe, the rate, the monthly payment and when the loan matures. A hybrid loan also says when its rate resets and what the payment becomes.",
              go: async (h) => { await openRefi(h, /queens gate/); await h.top(); },
              shot: "view",
              marks: [
                { sel: card("Current Loan"), label: "Current Loan", text: "Today’s loan, from its record." },
                { sel: card("Current Loan") + " >> text=/Rate resets to/", label: "Rate reset", text: "Here the rate resets within a month, and the payment jumps." },
                { sel: RV + "[data-refidealrow]", label: "What kind of deal?", text: "A new loan, or an extension with today’s lender." }
              ] },
            { text: "Leave **What kind of deal?** on **New loan**. To keep today’s lender on new terms instead, see [Extend with today’s lender](extend-with-your-lender)." }
          ],
          note: "A property with no T12 shows **No T12 yet** instead of a verdict, with a button that opens Underwriting on it." },
        { title: "Check today’s coverage",
          steps: [
            { text: "Scroll to **Coverage & value** and check the **NOI basis**: the NOI the whole refinance is sized on. It is **In-place T12** until the property’s underwriting is approved; then you can pick **Safe underwriting** or **Aggressive underwriting**.",
              shot: card("Coverage"),
              marks: [
                { sel: RV + '[data-noibasis="inplace"]', label: "NOI basis", text: "In-place T12 here. Safe and Aggressive are greyed until the underwriting is approved." },
                { sel: card("Coverage") + " >> text=DSCR today", label: "DSCR today", text: "The NOI ÷ a year of today’s payments." },
                { sel: card("Coverage") + " >> text=Coverage today", label: "Coverage today", text: "Whether today’s coverage clears your DSCR floor." }
              ] },
            { text: "Under **Exit cost (prepay penalty)**, pick the penalty type from the loan documents. Until you do, the cost is marked **assumed** and estimated as yield maintenance." }
          ],
          note: "These figures are screening estimates. Confirm them with the loan documents and a rate sheet before you act." },
        { title: "Read the verdict",
          steps: [
            { text: "Scroll to the colored box under **What to push**. Its first line is the answer; the line at the bottom says what to do.",
              go: async (h) => { await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: [
                { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "Here: act before the rate resets, and pay down the gap." },
                { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "What a new loan has to pay off." },
                { sel: VERDICT + " >> text=/Property supports/", label: "Property supports", text: "The biggest loan the property supports at the proposed rate and the lender’s limits." },
                { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "Whether that covers what you owe, and which limit caps it." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do, in one line." }
              ] },
            { text: "Read **Can you?**. When the answer is yes, **Should you?** under it says whether it is worth doing: the interest the new rate saves, against the early-payoff penalty." }
          ],
          note: "The answer is one of four: **Refinance**; **Your decision**, when only the cash out makes it worth it; **Don’t refinance**; or **Act before** a date **— pay down** an amount, when the rate resets or the loan ends within 12 months and the property can’t support what you owe. See [The verdict](ref-refinance#the-verdict)." },
        { title: "Act on the answer",
          steps: [
            { text: "To refinance, type your lender’s quote and check the proposed loan. See [Set the proposed loan’s rate and amount](set-the-proposed-loan)." },
            { text: "Click **Save as a loan** at the top to make the proposed loan a loan. See [Save the refinance as a loan](save-the-refinance)." },
            { text: "Or click **Close** to go back to the loan’s page." }
          ],
          note: "Closing loses nothing. The lender’s limits, an appraisal and the kind of deal you picked are kept with the property for the whole team." }
      ],
      next: [
        { page: "set-the-proposed-loan", text: "Type your lender’s quote and its limits." },
        { page: "plan-what-to-push", text: "See what pushing the NOI would get you." },
        { page: "ref-refinance", text: "Every figure and control on the refinance, named." }
      ] },

    // ==================================================================================================================
    { id: "set-the-proposed-loan", kind: "howto", group: "Refinance", title: "Set the proposed loan’s rate and amount",
      description: "Type your lender’s quote, test a smaller loan, set the lender’s limits and check the new loan’s terms.",
      intro: "The proposed loan starts from today’s loan’s rate type, a usual spread, and the biggest amount the property supports at the usual limits. Put in your lender’s own quote and limits to see the verdict for the loan you can really get.",
      before: [ "Your lender’s quote: the rate type, the index and the spread, and the limits it sizes a loan on." ],
      sections: [
        { title: "Set the rate",
          steps: [
            { text: "Open the loan’s refinance and scroll to **Proposed rate**, inside the colored verdict box. See [Run a refinance](run-a-refinance).",
              go: async (h) => { await openRefi(h, /queens gate/); } },
            { text: "Click the rate type your lender quotes: **Fixed**, **Floating** or **Hybrid**.",
              go: async (h) => { await h.scroll(RV + "#refiPricing"); },
              shot: RV + "#refiPricing",
              marks: [
                { sel: RV + '#refiPricing [data-rtype="Fixed"] >> xpath=..', label: "Rate type", text: "It starts as today’s loan’s type: here Hybrid, fixed for the first years." },
                { sel: "#o1_fxindex", label: "Index", text: "What the rate is priced on." },
                { sel: "#o1_fxspread", label: "Spread (bps)", text: "The lender’s quote over the index." },
                { sel: RV + "#refiPricing [data-refirate] >> xpath=.. >> nth=0", label: "Rate", text: "The index today + the spread." }
              ] },
            { text: "Pick the **Index** your lender prices on, and type its quote in **Spread (bps)** (100 bps = 1%). For **Hybrid**, set the index and the margin for the years after the fixed period too. The verdict and the proposed loan update at once." },
            { text: "For **Floating**, also fill in **Rate floor (%)**, **Rate cap (%)** and **Cap cost (bps/yr)** if your lender asks for them." }
          ],
          tip: "A yellow **starting spread** tag means the spread is still the app’s starting figure, taken from your recent loans of this kind. It goes once you type the lender’s quote." },
        { title: "Test a smaller loan",
          steps: [
            { text: "Type an amount in **Proposed loan amount**. It starts at what the property supports; a smaller loan means more cash to pay in. The line under it shows that loan’s coverage, LTV and debt yield.",
              go: async (h) => { await setVal(h, "#o1_amount", 25000000); },
              shot: RV + "#refiPricing",
              marks: [
                { sel: "#o1_amount", label: "Proposed loan amount", text: "Here a made-up $25,000,000." },
                { sel: RV + "[data-refiatloan]", label: "At this amount", text: "Its coverage (amortizing and interest-only), LTV and debt yield." }
              ] }
          ] },
        { title: "Set the lender’s limits",
          text: "The property supports the smallest loan that your lender’s limits allow. They start at 1.25× / 75% / 7%, all used.",
          steps: [
            { text: "Scroll to **How “supports $X” is worked out**, under **Can you?**." },
            { text: "Type your lender’s figures in the boxes on the right: debt coverage on the amortizing payment, debt coverage on the interest-only payment (leave it blank unless the lender uses it), loan-to-value and debt yield." },
            { text: "Untick **Lender uses** on any limit your lender doesn’t use. It turns grey and no longer counts." },
            { text: "If you have an appraisal, type it in **Appraised value**, with its date and a note. The loan-to-value then works on it instead of NOI ÷ cap rate.",
              go: async (h) => { await setVal(h, RV + '[data-refiappr="value"]', 65000000); await setVal(h, RV + '[data-refiappr="note"]', "Example appraiser (made-up)"); await tick(h, RV + '[data-refiuse="Debt Yield"]', false); },
              shot: { sel: BASIS, grow: true },
              marks: [
                { sel: RV + '[data-refilim="dscr"]', label: "Your lender’s", text: "Type each limit here." },
                { sel: RV + '[data-refiuse="Debt Yield"]', label: "Lender uses", text: "Unticked here: this lender doesn’t use debt yield." },
                { sel: RV + '[data-refiappr="value"]', label: "Appraised value", text: "A made-up $65,000,000." },
                { sel: RV + "[data-refismallest]", label: "The smallest", text: "What the property supports now." }
              ],
              after: resetLimits }
          ],
          tip: "If the group has your lender’s limits saved, pick it in **Lender preset** instead of typing. See [Use a lender preset](use-a-lender-preset).",
          note: "The limits and the appraisal are kept with this refinance for the whole team. **Back to the start** puts the limits back, and **Change history** lists every change." },
        { title: "Check the new loan’s terms",
          steps: [
            { text: "Scroll to **Proposed New Loan** and change **Term (yrs)**, **Amortization (yrs)**, **Interest-only (mo)** or **Closing (% of loan)** to your lender’s terms.",
              go: async (h) => { await h.scroll(card("Proposed New Loan")); },
              shot: { sel: card("Proposed New Loan"), grow: true },
              marks: [
                { sel: "#o1_termYrs", label: "Term (yrs)", text: "Years until the new loan is due." },
                { sel: "#o1_amortYrs", label: "Amortization (yrs)", text: "Years the payment is figured over." },
                { sel: "#o1_io", label: "Interest-only (mo)", text: "Months of interest-only payments first." },
                { sel: "#o1_closing", label: "Closing (% of loan)", text: "Closing costs." },
                { sel: card("Proposed New Loan") + " >> text=/New monthly payment/", label: "New monthly payment", text: "Compared with today’s." }
              ] },
            { text: "Open **Escrows & reserves** and **Additional fees** to add what the lender collects each month with the payment." }
          ],
          note: "**Proposed New Loan** appears when the answer is **Refinance**, **Your decision** or a pay-down." }
      ],
      next: [
        { page: "save-the-refinance", text: "Make the proposed loan a loan." },
        { page: "use-a-lender-preset", text: "Pick a lender’s saved limits instead of typing them." },
        { page: "ref-refinance", anchor: "rate-amount", text: "Every rate box, named." }
      ] },

    // ==================================================================================================================
    { id: "use-a-lender-preset", kind: "howto", group: "Refinance", title: "Use a lender preset",
      description: "Save a lender’s limits once, for the whole group, and pick them in any refinance.",
      intro: "A lender preset holds one lender’s numbers: its limits and which of them it uses, the rate types it lends at, its longest amortization and the penalty it usually asks on an extension. Pick it in a refinance instead of typing the numbers each time.",
      callouts: [ { kind: "note", text: "In the shared database, only the group’s admin adds or changes presets; anyone else gets “Only the group’s admin changes the lender presets”. Anyone can pick one." } ],
      sections: [
        { title: "Add a preset",
          steps: [
            { text: "Open a refinance and scroll to **How “supports $X” is worked out**, in the colored verdict box. See [Run a refinance](run-a-refinance).",
              go: async (h) => { await openRefi(h, /queens gate/); } },
            { text: "Click **Add a preset** next to **Lender preset**. Once the list has a preset, the link reads **Manage presets**.",
              go: async (h) => { await h.scroll(BASIS); },
              shot: { sel: BASIS, grow: true },
              marks: [
                { sel: RV + "[data-refipresetrow] >> text=none yet", label: "none yet", text: "No presets in the group’s list yet." },
                { sel: RV + "[data-refipresetrow] [data-presetmanage]", label: "Add a preset", text: "Opens the group’s list of lender presets." },
                { sel: RV + '[data-refilim="dscr"]', label: "The limits", text: "Without a preset you type them here yourself." }
              ] },
            { text: "In the window, click **Add a preset**. An empty preset appears.",
              go: async (h) => { await h.click(RV + "[data-refipresetrow] [data-presetmanage]", { wait: 500 }); await h.click("#presetModal [data-presetadd]", { wait: 400 }); } },
            { text: "Type the lender’s name and its limits (**DSCR**, **IO**, **LTV**, **DY**), and tick the limits it uses." },
            { text: "Untick any rate type it doesn’t lend at, and fill in its longest amortization, its usual penalty on an extension, notes and the source.",
              go: fillPreset,
              shot: "#presetModal > div",
              marks: [
                { sel: '#presetModal [data-pi="0"][data-pf="name"]', label: "Name", text: "The lender (made-up here). A preset without a name is dropped when you save." },
                { sel: '#presetModal [data-pi="0"][data-pf="dscr"]', label: "Limits", text: "DSCR, IO, LTV and DY: here 1.30× / 70% / 8%." },
                { sel: '#presetModal [data-pi="0"][data-pf="use:DSCR"]', label: "Uses", text: "The limits this lender uses." },
                { sel: '#presetModal [data-pi="0"][data-pf="type:Floating"]', label: "Rate types", text: "Floating unticked: this lender doesn’t lend floating." },
                { sel: "#presetModal [data-presetsave]", label: "Save the list", text: "Saves it for the whole group." }
              ] },
            { text: "Click **Save the list**. **Close** instead drops your changes.",
              go: async (h) => { await h.click("#presetModal [data-presetsave]", { wait: 1200 }); } }
          ] },
        { title: "Pick it in a refinance",
          steps: [
            { text: "Pick the preset in **Lender preset**. The limits fill in from it, and what the property supports is worked out again.",
              go: async (h) => { await pickPreset(h); await h.scroll(BASIS); },
              shot: { sel: BASIS, grow: true },
              marks: [
                { sel: RV + "[data-refipreset]", label: "Lender preset", text: "Pick a lender, or “None — type the limits”." },
                { sel: RV + "[data-refipresetchip]", label: "Its name", text: "The preset in use." },
                { sel: RV + '[data-refilim="dscr"]', label: "The limits", text: "Filled from the preset." },
                { sel: RV + "[data-refismallest]", label: "What the property supports", text: "On the preset’s limits." }
              ] },
            { text: "Check **Proposed rate** above it. A rate type the lender doesn’t allow is greyed, and clicking it says why instead of switching.",
              go: async (h) => { await h.scroll(RV + "#refiPricing"); },
              shot: RV + "#refiPricing",
              marks: [
                { sel: RV + '[data-rtype="Fixed"]', label: "Fixed", text: "Allowed." },
                { sel: RV + '[data-rtype="Floating"]', label: "Floating (greyed)", text: "Not allowed by this preset. Clicking it shows “Example Agency (made-up): no floating”." },
                { sel: RV + '[data-rtype="Hybrid ARM"]', label: "Hybrid", text: "Allowed." }
              ],
              after: async (h) => { await pickVal(h, RV + "[data-refipreset]", ""); await resetLimits(h); } }
          ],
          tip: "Type over a limit to change it for this deal only. The preset’s name then says “(changed here)”.",
          note: "For an extension, pick today’s lender’s preset in the extension’s own limits. It also fills in the penalty that lender usually asks. See [Extend with today’s lender](extend-with-your-lender)." }
      ],
      next: [
        { page: "set-the-proposed-loan", text: "Type the rest of the lender’s quote." },
        { page: "ref-refinance", anchor: "lender-presets", text: "Every box in the presets window." }
      ] },

    // ==================================================================================================================
    { id: "plan-what-to-push", kind: "howto", group: "Refinance", title: "Plan what to push for a refinance",
      description: "Pick the amount the new loan must cover, tick what you would push, and see whether the NOI gets there.",
      intro: "**What to push — what it would get you** is your plan, not the lender’s. Pick the amount the new loan has to cover, tick Claude’s pushes and your own levers, and see whether the NOI they add covers it. The coverage, the verdict and the proposed loan follow what you tick.",
      before: [ "The property’s underwriting approved, with Claude’s **What to push** — see [See what you can still push](use-what-to-push). Your own levers work without it." ],
      sections: [
        { title: "Pick the amount to cover",
          steps: [
            { text: "Open the property’s refinance and pick the **NOI basis** in **Coverage & value**. Each push counts on that basis. See [Run a refinance](run-a-refinance).",
              go: async (h) => { await openRefi(h, /villages of whitewater$/); } },
            { text: "Scroll to **What to push — what it would get you**. Under **The amount to cover**, click what the new loan has to cover.", thin: 1024,
              go: async (h) => { await h.click(RV + '[data-reficover="maturity"]', { wait: 1200 }); await h.calm(); },
              shot: RV + "[data-refitargetbox]",
              marks: [
                { sel: RV + '[data-reficover="today"]', label: "Today’s payoff", text: "What you owe today plus the early-payoff penalty. The starting choice." },
                { sel: RV + '[data-reficover="open"]', label: "No penalty — the last 12 months", text: "What you will owe 12 months before maturity, when there is no penalty." },
                { sel: RV + '[data-reficover="maturity"]', label: "At maturity", text: "What you will owe when the loan matures. Picked here." },
                { sel: RV + "[data-refitarget]", label: "The NOI you need", text: "The NOI that covers that amount, and how much more it is than today’s." }
              ] },
            { text: "Read the line under the buttons: the NOI that covers that amount at the proposed rate and the lender’s limits, and how far today’s NOI is from it." }
          ] },
        { title: "Tick what you would push",
          steps: [
            { text: "Tick a push in the list. What it adds on your basis goes into the NOI." },
            { text: "To count something of your own, type its name and the dollars it adds a year under **Add your own lever**, then click **Add**. It is added ticked.",
              go: async (h) => { await tick(h, RV + "[data-refimove]", true); await h.js(() => { document.getElementById("refiManualLabel").value = "Paid parking (made-up)"; document.getElementById("refiManualAmt").value = "12000"; document.getElementById("refiManualAdd").click(); }); await h.wait(1200); await h.calm(); },
              shot: { sel: PUSHBOX, grow: true },
              marks: [
                { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "Everything ticked, on this basis." },
                { sel: RV + "[data-refitarget]", label: "Covered — or still missing", text: "Whether the NOI now covers the amount." },
                { sel: RV + "[data-refimove] >> nth=0", label: "A push, ticked", text: "Claude’s, from What to push in Underwriting." },
                { sel: RV + "[data-refimanual] >> nth=0", label: "Your lever", text: "Marked “yours”; × removes it." }
              ] },
            { text: "Read the line under the amount again: **covered**, with what is to spare, or how much NOI is **still missing**." }
          ],
          note: "Your ticks, your levers and the amount to cover are kept with this refinance for the whole team." },
        { title: "Compare the bases",
          steps: [
            { text: "Click another **NOI basis** in **Coverage & value**. The same push counts its effect on that basis: it is worth less on an underwriting that already counts part of it.",
              go: async (h) => { await h.click(RV + '[data-noibasis="inplace"]', { wait: 1200 }); await h.calm(); },
              shot: { sel: PUSHBOX, grow: true },
              marks: [
                { sel: RV + "[data-refimove] >> nth=0 >> xpath=following-sibling::span[1]/span[2]", label: "Its effect on each basis", text: "First on the basis picked (now In-place T12), then in-place, Safe and Aggressive." },
                { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "Follows the basis." }
              ],
              // put back what this page changed: the basis, the tick, the lever and the amount to cover
              after: async (h) => {
                await h.click(RV + '[data-noibasis="underwritten"]', { wait: 1200 }); await h.calm();
                await tick(h, RV + "[data-refimove]", false);
                await h.click(RV + "[data-refimanualdel] >> nth=0", { wait: 1200 }); await h.calm();
                await h.click(RV + '[data-reficover="today"]', { wait: 1200 }); await h.calm();
              } }
          ] }
      ],
      next: [
        { page: "use-what-to-push", text: "Where the pushes come from, and what Claude checked." },
        { page: "set-the-proposed-loan", text: "Set the rate and the lender’s limits the NOI is measured at." },
        { page: "ref-refinance", anchor: "what-to-push", text: "Every part of What to push, named." }
      ] },

    // ==================================================================================================================
    { id: "extend-with-your-lender", kind: "howto", group: "Refinance", title: "Extend with today’s lender",
      description: "Judge an extension with today’s lender, set its terms, and save it on today’s loan.",
      intro: "Instead of a new loan, today’s lender may keep the loan on new terms, usually after a pay-down so it fits the lender’s limits. The refinance judges the extension by the same rule as a new loan: can you, and should you? Saving it changes today’s loan, and you can undo it.",
      before: [ "Today’s lender’s quote: the rate, its limits, the penalty and the fee it asks." ],
      callouts: [ { kind: "note", text: "An extension is with one lender, one loan at a time. For a package of several loans, **Extend with today’s lender** is greyed." } ],
      sections: [
        { title: "Pick the extension",
          steps: [
            { text: "Open the loan’s refinance. See [Run a refinance](run-a-refinance).",
              go: async (h) => { await openRefi(h, /queens gate/); } },
            { text: "Under **What kind of deal?**, click **Extend with today’s lender**. The verdict, the limits and the schedule below now judge the extension. **New loan** switches back, and each keeps its own figures.",
              go: async (h) => { await pickDeal(h, "extend"); } }
          ] },
        { title: "Enter today’s lender’s quote",
          steps: [
            { text: "In the verdict box, under **The extension’s rate**, pick the **Index** and type today’s lender’s **Spread (bps)**." },
            { text: "In the limits table under it, type today’s lender’s own limits, and untick **Lender uses** on any it doesn’t use. Here 1.11× amortizing and 1.35× interest-only (made-up).",
              go: async (h) => { await setVal(h, RV + '[data-refiextlim="dscr"]', 1.11); await setVal(h, RV + '[data-refiextlim="dscrIO"]', 1.35); },
              shot: { sel: RV + "[data-refibasisext]", grow: true },
              marks: [
                { sel: RV + '[data-refiextlim="dscr"]', label: "Amortizing coverage", text: "Today’s lender’s DSCR." },
                { sel: RV + '[data-refiextlim="dscrIO"]', label: "Interest-only coverage", text: "Its coverage on the interest-only payment." },
                { sel: RV + '[data-refiextuse="DSCR"]', label: "Lender uses", text: "Untick a limit it doesn’t use." },
                { sel: RV + "[data-refibasisext] [data-refismallest]", label: "What today’s lender allows", text: "The smallest of the limits it uses." }
              ] }
          ],
          tip: "If the group has today’s lender’s preset, pick it in **Lender preset** there instead. It fills in the limits and the penalty that lender usually asks." },
        { title: "Set the terms",
          steps: [
            { text: "Scroll to **The extension’s terms**. Set **Today’s terms end on**, **Months on the new terms**, **Interest-only** and the amortization after it." },
            { text: "Pick what this lender asks in **Early-payoff penalty — this lender asks**, and set the **Extension fee**. Until you pick, the penalty is assumed to be on the pay-down only.",
              go: async (h) => { await h.scroll(EXTCARD); },
              shot: { sel: EXTCARD, grow: true },
              marks: [
                { sel: RV + '[data-refiextf="penaltyHow"]', label: "Early-payoff penalty", text: "The full penalty, on the pay-down only, a part, or none." },
                { sel: RV + '[data-refiextf="feeValue"]', label: "Extension fee", text: "In % of the extended amount, or dollars." },
                { sel: RV + '[data-refipaydown="extend-card"]', label: "Pay-down needed", text: "So the loan fits the lender’s limits." },
                { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Pay-down + penalty + fee." },
                { sel: RV + "[data-refiextassumed]", label: "Assumed", text: "Confirm the penalty with the lender.", optional: true }
              ] }
          ] },
        { title: "Read the verdict and save",
          steps: [
            { text: "Scroll back up to the verdict box. **Can you?** gives the pay-down the extension needs, and the last line says what to do and the cash it takes.",
              go: async (h) => { await h.scroll(XVERDICT); },
              shot: { sel: XVERDICT, grow: true },
              marks: [
                { sel: XVERDICT + " >> p >> nth=0", label: "The answer", text: "Here: Extend, with a pay-down." },
                { sel: RV + '[data-refipaydown="extend"]', label: "The pay-down", text: "What you will owe less what the lender’s limits allow.", optional: true },
                { sel: XVERDICT + " >> text=/^Should you\\?/", label: "Should you?", text: "Yes here: the rate resets within 12 months." },
                { sel: XVERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do, with the cash it takes." }
              ] },
            { text: "Click **Save the extension** at the top. A box lists what will change.",
              go: async (h) => { await h.top(); await h.click("#refiExtSaveBtn", { wait: 600 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Save the extension?", text: "It asks first." },
                { sel: "#confirmText", label: "What happens", text: "The new terms, the pay-down, the penalty, the new maturity, the status and the cash needed." },
                { sel: "#confirmOk", label: "Save the extension", text: "Saves it." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." }
              ] },
            { text: "Click **Save the extension** in the box. Today’s loan stays the same record: from the date its terms end it has the new rate and term, the pay-down becomes a principal payment, and its status becomes Extended. Every changed field goes into the loan’s history.",
              go: async (h) => { await confirmYes(h); await h.wait(800); } }
          ],
          note: "**Save the extension** shows only when the answer is to extend. **Not yet** means nothing ends or resets within 12 months, so you decide closer to the date. **Don’t extend now** means the lower rate doesn’t pay for the penalty." },
        { title: "Undo an extension",
          steps: [
            { text: "Open the loan’s refinance again. It shows the saved extension.", thin: 1024,
              go: async (h) => { await openRefi(h, /queens gate/); },
              shot: { sel: RV + '[data-refiext="saved"]', grow: true },
              marks: [
                { sel: RV + '[data-refiext="saved"] p >> nth=0', label: "Extended with today’s lender", text: "The extension is saved on today’s loan." },
                { sel: RV + '[data-refiext="saved"] p >> nth=1', label: "Saved", text: "When, and by whom. The loan’s own page has the extension too." },
                { sel: RV + '[data-refiext="saved"] p >> nth=2', label: "What was saved", text: "The new terms, the pay-down, the new maturity and the cash it took." },
                { sel: RV + "[data-refiextundo]", label: "Undo the extension", text: "Puts today’s loan back as it was before." },
                { sel: RV + '[data-refiext="saved"] [data-refihist]', label: "Change history", text: "The extension and every change before it." }
              ] },
            { text: "Click **Undo the extension**.",
              go: async (h) => { await h.click(RV + "[data-refiextundo]", { wait: 600 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Undo the extension?", text: "It asks first." },
                { sel: "#confirmText", label: "What happens", text: "The loan goes back to its terms before the extension; the pay-down comes off the schedule; the history keeps both." },
                { sel: "#confirmOk", label: "Undo the extension", text: "Does it." },
                { sel: "#confirmCancel", label: "Cancel", text: "Keeps the extension." }
              ] },
            { text: "Click **Undo the extension** in the box. The rate, the maturity, the status and the schedule are put back, and the undo is in the history too.",
              go: async (h) => { await confirmYes(h); },
              // put back what this page changed: today's lender's own limits, and the kind of deal
              after: async (h) => { await h.js(() => { const b = document.querySelector("#refiView [data-refiextlimreset]"); if (b) b.click(); }); await h.wait(1200); await h.calm(); await pickDeal(h, "new"); } }
          ] }
      ],
      next: [
        { page: "ref-refinance", anchor: "the-extension", text: "Every box of the extension, named." },
        { page: "set-the-reset", text: "Set what the payment does at the reset." }
      ] },

    // ==================================================================================================================
    { id: "refinance-together", kind: "howto", group: "Refinance", title: "Refinance several loans together",
      description: "Refinance a senior and a mezzanine loan as one package, or put several properties under one new loan.",
      intro: "Loans that depend on one another are refinanced together: a property’s senior and mezzanine loans, or several properties under one new loan. The refinance works the same way, on the package’s total NOI and everything it owes.",
      before: [ "A T12 for every property in the package — see [Upload a T12](upload-a-t12). Nothing is sized until each one has its T12." ],
      sections: [
        { title: "A senior and a mezzanine loan",
          steps: [
            { text: "Click **Specific Property** and pick the property’s combined entry: its name followed by **senior + mezz**." },
            { text: "Click **Refi Calculator**. **Current debt** lists every loan on the property; one new loan pays them all off.", thin: 1024,
              go: openCombo,
              shot: { sel: card("Current debt"), grow: true },
              marks: [
                { sel: card("Current debt") + " >> text=/loans on this property/", label: "The loans", text: "Here a senior and a mezzanine loan." },
                { sel: card("Current debt") + " >> text=Payoff balance", label: "Payoff balance", text: "Each loan at its own balance, added up." },
                { sel: card("Current debt") + " >> text=Current rate", label: "Current rate", text: "Weighted by what is owed on each." }
              ] }
          ] },
        { title: "Several properties under one new loan",
          steps: [
            { text: "On the **Portfolio** tab, click **Create a portfolio…** above the Coverage table." },
            { text: "Tick each property the new loan will secure. Each row shows what is owed and the NOI its refinance would use; the line under the list adds them up.",
              go: async (h) => { await openPicker(h, POOL3); },
              shot: "#poolPicker > div",
              marks: [
                { sel: '#poolPicker [data-poolpickrow="queens gate apartments"] [data-poolpick]', label: "Tick a property", text: "Each one the new loan will secure." },
                { sel: '#poolPicker [data-poolpickrow="queens gate apartments"] [data-poolpicknoi]', label: "Owes · NOI", text: "What is owed, and the NOI its refinance would use." },
                { sel: "#poolPickNote", label: "The package", text: "The loans to pay off, what is owed and the NOI, together." },
                { sel: "#poolPickGo", label: "Create the portfolio", text: "Needs at least two properties and one loan to pay off." }
              ] },
            { text: "Click **Create the portfolio**. The refinance opens for the whole package; nothing changes until you save." },
            { thin: 1024, text: "In **NOI by property**, pick each property’s basis: **In-place T12**, or **Safe** or **Aggressive** once its underwriting is approved. The total, and everything below it, follows.",
              go: async (h) => { await h.click("#poolPickGo", { wait: 2500 }); await h.calm(); await h.page.waitForSelector(RV + "[data-refipoolnoitable]", { timeout: 15000 }); },
              shot: { sel: RV + "[data-refipoolnoitable]", grow: true },
              marks: [
                { sel: RV + "[data-refikeybasis] >> nth=0", label: "Its basis", text: "The NOI this property counts with." },
                { sel: RV + "[data-refipoolnoi] td >> nth=2", label: "NOI", text: "Its NOI on that basis." },
                { sel: RV + "[data-refipooltotal]", label: "Total", text: "What the package is sized on." }
              ] },
            { text: "Read the verdict for the whole package. **Save as a loan** puts one new loan on all of the properties and pays off every loan on them. See [Save the refinance as a loan](save-the-refinance)." }
          ],
          tip: "**What to push** lists each property’s pushes under its name; tick them to see what the package could carry. See [Plan what to push for a refinance](plan-what-to-push).",
          note: "A ticked property with no T12 stops the package: the screen says **No T12 yet** and offers to upload it in Underwriting. A typed NOI never counts for a refinance." }
      ],
      next: [
        { page: "add-a-pooled-loan", text: "Add a loan that already covers several properties." },
        { page: "ref-refinance", anchor: "several-loans-together", text: "Every part of a package refinance, named." }
      ] },

    // ==================================================================================================================
    { id: "ref-refinance", kind: "reference", group: "Reference", title: "The refinance page",
      description: "Every figure and control on a loan’s refinance: today’s loan, coverage, what to push, the verdict, the rate and limits, presets, the proposed loan, the extension and packages.",
      intro: "The refinance opens from a loan’s page with **Refi Calculator** and takes its place. From the top: today’s loan and the kind of deal, coverage and value, what to push, the verdict with the proposed rate and the lender’s limits, then the proposed loan or the extension. The pictures use the app’s sample loans with made-up T12s. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "Today’s loan",
          text: "The top of the refinance: the buttons, what you owe today, and the kind of deal.",
          views: [
            { title: "The refinance screen",
              text: "Everything is worked out live: change a box and the answers update at once. Your choices (the lender’s limits, an appraisal, the kind of deal) are kept with the property for the whole team.",
              go: async (h) => { await openRefi(h, /queens gate/); await h.top(); },
              shot: "view",
              marks: [
                { sel: "#refiView h2", label: "Refinance Analysis", text: "The loan, and the question: should you refinance?" },
                { sel: "#refiCloseBtn", label: "Close", text: "Back to the loan’s page. Closing saves nothing and loses nothing." },
                { sel: "#refiSaveBtn", label: "Save as a loan", text: "Shown when there is a loan to propose. Saves it as a new loan and marks today’s loan Paid off (refinanced); it asks first. With a pay-down it says the cash you pay in. See [Save the refinance as a loan](save-the-refinance)." },
                { sel: "#refiBtn", label: "Refi Calculator (greyed)", text: "Greyed while the refinance is open.", optional: true },
                { sel: RV + "[data-refidealrow]", label: "What kind of deal?", text: "A new loan, or an extension with today’s lender." }
              ] },
            { title: "Current Loan",
              thin: 1024,
              text: "The facts of today’s loan, from its record.",
              shot: card("Current Loan"),
              marks: [
                { sel: card("Current Loan") + " >> text=Payoff balance", label: "Payoff balance", text: "What you owe today: what a new loan has to pay off." },
                { sel: card("Current Loan") + " >> text=Current rate", label: "Current rate", text: "Today’s interest rate." },
                { sel: card("Current Loan") + " >> text=Monthly P&I", label: "Monthly P&I", text: "Today’s monthly principal and interest." },
                { sel: card("Current Loan") + " >> text=Remaining", label: "Remaining", text: "Months until today’s loan ends." },
                { sel: card("Current Loan") + " >> text=Matures", label: "Matures", text: "The date today’s loan is due." },
                { sel: card("Current Loan") + " >> text=/Rate resets to/", label: "Rate reset", text: "For a hybrid loan: when the fixed rate ends, what it resets to and the new payment." }
              ] },
            { title: "What kind of deal?",
              thin: 1024,
              text: "Pick this first: everything below follows it. Each kind keeps its own limits, so switching back and forth loses nothing.",
              shot: RV + "[data-refidealrow]",
              marks: [
                { sel: RV + '[data-refideal="new"]', label: "New loan", text: "The verdict, the limits and the schedule below are a new loan’s, which replaces today’s loan(s)." },
                { sel: RV + '[data-refideal="extend"]', label: "Extend with today’s lender", text: "Judge an extension instead: today’s lender keeps the loan on new terms, perhaps after a pay-down. See [The extension](ref-refinance#the-extension)." }
              ] }
          ] },
        { title: "Coverage & value",
          text: "Today’s loan measured on the property’s NOI: the figures a lender looks at first. They are screening estimates; confirm them with the loan documents and a rate sheet.",
          views: [
            { title: "Coverage & value — today’s loan",
              shot: card("Coverage"),
              marks: [
                { sel: RV + '[data-noibasis="inplace"]', label: "NOI basis", text: "Which NOI the refinance is sized on: here In-place T12, from the property’s T12 (made-up). Safe and Aggressive are greyed until the underwriting is approved." },
                { sel: card("Coverage") + " >> text=Annual NOI", label: "Annual NOI", text: "The yearly NOI used: from the T12, or the approved underwriting. A typed NOI never sizes a refinance." },
                { sel: card("Coverage") + " >> text=Cap rate", label: "Cap rate", text: "Values the property: value = NOI ÷ cap rate." },
                { sel: card("Coverage") + " >> text=Est. value", label: "Est. value", text: "The estimated value. An appraisal you type replaces it." },
                { sel: card("Coverage") + " >> text=LTV today", label: "LTV today", text: "Loan-to-value: what you owe ÷ the value." },
                { sel: card("Coverage") + " >> text=Debt service today", label: "Debt service today", text: "A year of today’s payments." },
                { sel: card("Coverage") + " >> text=DSCR today", label: "DSCR today", text: "Debt coverage: NOI ÷ a year of payments. Lenders usually want 1.25× or more." },
                { sel: card("Coverage") + " >> text=Interest-only DSCR today", label: "Interest-only DSCR", text: "Coverage on an interest-only payment, which some lenders size on." },
                { sel: card("Coverage") + " >> text=Debt yield today", label: "Debt yield today", text: "NOI ÷ what you owe, which insurance companies and CMBS lenders look at." },
                { sel: card("Coverage") + " >> text=Coverage today", label: "Coverage today", text: "Whether today’s coverage clears your DSCR floor." },
                { sel: "#refiNoiEdit", label: "Cap rate", text: "Opens a small window to change the cap rate." },
                { sel: card("Coverage") + " >> text=/financeable|tier|Tier/ >> nth=0", label: "Credit tier", text: "How a lender would grade today’s numbers. Below the floor, the line under it says which test fails; a strong tier takes basis points off the proposed spread.", optional: true },
                { sel: card("Coverage") + " >> text=/^Not financeable as sized/", label: "Why it is below the floor", text: "Each test that fails against your floor or ceiling: DSCR, LTV, debt yield. Shown only when one fails.", optional: true },
                { sel: "#refiPrepayType", label: "Exit cost — penalty type", text: "How the early-payoff penalty is worked out. See Exit cost below." },
                { sel: card("Coverage") + " >> text=/^Exit cost$/", label: "Exit cost", text: "The early-payoff penalty in dollars today (and as a % of the balance)." },
                { sel: "#refiStackWith", label: "Capital stack", text: "Links a mezzanine or senior loan on the same property. See Capital stack below." },
                { sel: card("Coverage") + " >> text=/^DSCR = NOI/", label: "How these are worked out", text: "The formulas behind the figures above." }
              ] },
            { title: "Cap rate",
              text: "**Cap rate** changes only the cap rate that values the property. The NOI comes from the T12 or the approved underwriting, picked with the NOI basis; it is never typed here.",
              go: async (h) => { await h.click("#refiNoiEdit", { wait: 500 }); },
              after: async (h) => { await h.click("#noiCancel", { wait: 400 }); },
              shot: "#noiModal > div",
              marks: [
                { sel: "#noiTitle", label: "Refinance — cap rate", text: "This window changes the cap rate only." },
                { sel: "#noiText", label: "Where the NOI comes from", text: "The T12, or the approved underwriting: the NOI basis on the Coverage card." },
                { sel: "#capField", label: "Cap rate (%)", text: "Value = NOI ÷ cap rate; it sets the loan-to-value." },
                { sel: "#noiSave", label: "Continue", text: "Saves the cap rate and updates the whole analysis." },
                { sel: "#noiCancel", label: "Cancel", text: "Closes without changing anything." }
              ] },
            { title: "Exit cost",
              thin: 1024,
              text: "Paying today’s loan off early usually costs a penalty. The app estimates it from the type of penalty in the loan; **assumed** means nobody has confirmed the type yet.",
              shot: EXITBOX,
              marks: [
                { sel: "#refiPrepayType", label: "Penalty type", text: "Yield Maintenance (the default), Step-down (a % of the balance that falls each year), Defeasance (a quoted figure), or Open / at par (no penalty). Picking one confirms it and saves it on the loan." },
                { sel: card("Coverage") + " >> text=ASSUMED >> nth=0", label: "Assumed", text: "Shown until you pick the type: the estimate uses yield maintenance.", optional: true },
                { sel: card("Coverage") + " >> text=Prepay basis", label: "Prepay basis", text: "How the estimate was worked out; for yield maintenance, today’s Treasury, the months left and the 1% floor." },
                { sel: card("Coverage") + " >> text=Exit cost >> nth=1", label: "Exit cost", text: "The estimated penalty in dollars. Confirm the real figure from the loan documents." },
                { sel: card("Coverage") + " >> text=As % of balance", label: "As % of balance", text: "The same penalty as a share of what you owe." }
              ] },
            { title: "Step-down",
              thin: 1024,
              text: "A step-down penalty asks for this year’s % of the balance.",
              go: async (h) => { await pickVal(h, "#refiPrepayType", "Step-down"); },
              shot: EXITBOX,
              marks: [
                { sel: "#refiPrepayType", label: "Step-down", text: "Picked here." },
                { sel: "#refiStepPct", label: "This year’s step-down", text: "This year’s %, for example 3 in year 1 of a 3-2-1 schedule. The exit cost follows." }
              ] },
            { title: "Defeasance",
              thin: 1024,
              text: "A defeasance takes the figure you were quoted by the lender or the consultant. Until you type one, a yield-maintenance estimate stands in.",
              go: async (h) => { await pickVal(h, "#refiPrepayType", "Defeasance"); },
              after: async (h) => { await pickVal(h, "#refiPrepayType", "Yield Maintenance"); },
              shot: EXITBOX,
              marks: [
                { sel: "#refiPrepayType", label: "Defeasance", text: "Picked here." },
                { sel: "#refiDefeasance", label: "Quoted figure", text: "The defeasance cost you were quoted, in dollars." }
              ] },
            { title: "Capital stack",
              thin: 1024,
              text: "When the property also has a mezzanine (or senior) loan, link it here: leverage and coverage are then read on the combined debt.",
              shot: card("Coverage") + ' >> div:has(> div > h4:has-text("Capital stack"))',
              marks: [
                { sel: "#refiStackWith", label: "Link a loan", text: "The other loan on the same property (None = this loan alone). Agency senior loans don’t allow subordinate debt." }
              ] },
            { title: "The NOI basis",
              thin: 1024,
              text: "Villages of Whitewater has a made-up T12 and an approved underwriting, so its refinance can be sized on three NOIs. Pick one; everything below follows, and the pick is kept with this refinance for the whole team.",
              go: async (h) => { await openRefi(h, /villages of whitewater$/); await h.top(); },
              shot: card("Coverage") + " >> div:has(> div > div:has-text('NOI basis for this analysis')) >> nth=0",
              marks: [
                { sel: RV + '[data-noibasis="inplace"]', label: "In-place T12", text: "The NOI as the property runs today, from its T12." },
                { sel: RV + '[data-noibasis="underwritten"]', label: "Safe underwriting", text: "The approved Safe underwriting: the T12 with the changes and stories you approved, after replacement reserves. The starting choice once it is approved." },
                { sel: RV + '[data-noibasis="aggressive"]', label: "Aggressive underwriting", text: "The approved Aggressive version, after reserves." },
                { sel: card("Coverage") + " >> text=/^12-mo|^T12|^Last 3/ >> nth=0", label: "Which months", text: "How the T12’s NOI was worked out.", optional: true },
                { sel: card("Coverage") + " >> text=/^Sizing on the/", label: "What it is sized on", text: "Which NOI the analysis uses, and who approved the underwriting and when. Without an approved underwriting, only In-place T12 is offered." }
              ] }
          ] },
        { title: "What to push",
          text: "Your planning tool, not the lender’s: tick what you would push, pick the amount you need to cover, and see what loan it gets you. The pushes are Claude’s, from **What to push** in Underwriting. See [Plan what to push for a refinance](plan-what-to-push).",
          views: [
            { title: "What to push — what it would get you",
              text: "Each push has three effects (on the in-place T12, on Safe and on Aggressive), net of what each already counts. Ticking one adds its effect on the NOI basis picked above.",
              go: async (h) => { await h.scroll(PUSHBOX); },
              shot: { sel: PUSHBOX, grow: true },
              marks: [
                { sel: PUSHBOX + " h3", label: "What to push — what it would get you", text: "Your plan: the coverage, the verdict and the proposed loan follow what you tick." },
                { sel: RV + "[data-refitargetbox]", label: "The amount to cover", text: "What the loan has to cover, and the NOI that covers it. See the next picture." },
                { sel: RV + "[data-refimove] >> nth=0", label: "A push", text: "Tick to add it to the NOI used here; untick to take it out." },
                { sel: RV + "[data-refimove] >> nth=0 >> xpath=following-sibling::span[1]/span[2]", label: "Its effects", text: "First what it adds on the basis picked (here Safe), then on each basis: in-place, Safe, Aggressive. The same push is worth less on an underwriting that already counts part of it." },
                { sel: "#refiManualLabel", label: "Your own lever — name", text: "Something you expect to add, for example paid parking." },
                { sel: "#refiManualAmt", label: "Your own lever — dollars a year", text: "What it adds a year. It counts the same on any basis; a negative amount takes NOI away." },
                { sel: "#refiManualAdd", label: "Add", text: "Adds your lever to the list, ticked." }
              ] },
            { title: "The amount to cover",
              thin: 1024,
              text: "What the new loan has to cover. The line under it says the NOI that covers it at the proposed rate and the lender’s limits, and how far today’s NOI is from it.",
              go: async (h) => { await h.scroll(RV + "[data-refitargetbox]"); },
              shot: RV + "[data-refitargetbox]",
              marks: [
                { sel: RV + '[data-reficover="today"]', label: "Today’s payoff", text: "What you owe today plus the early-payoff penalty. The starting choice." },
                { sel: RV + '[data-reficover="open"]', label: "No penalty — the last 12 months", text: "What you will owe 12 months before maturity, when the loan can be paid off without a penalty (today’s payoff if it matures within 12 months)." },
                { sel: RV + '[data-reficover="maturity"]', label: "At maturity", text: "What you will owe when the loan matures, before its final payment." },
                { sel: RV + "[data-refitargetbox] > p >> nth=0", label: "What it is", text: "What the amount picked is made of." },
                { sel: RV + "[data-refitarget]", label: "The NOI you need", text: "The NOI that covers the amount on the basis picked, and how much more that is than today’s." }
              ] },
            { title: "Ticked",
              text: "A push ticked and a lever of your own added (made-up): the card says what they add to the NOI, and the line under the amount whether that covers it.",
              go: async (h) => { await tick(h, RV + "[data-refimove]", true); await h.js(() => { document.getElementById("refiManualLabel").value = "Paid parking (made-up)"; document.getElementById("refiManualAmt").value = "12000"; document.getElementById("refiManualAdd").click(); }); await h.wait(1200); await h.calm(); await h.scroll(PUSHBOX); },
              shot: { sel: PUSHBOX, grow: true },
              marks: [
                { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "What the ticked pushes and your levers add on this basis." },
                { sel: RV + "[data-refitarget]", label: "Covered — or still missing", text: "Whether the NOI now covers the amount, with what is to spare or what is still missing." },
                { sel: RV + "[data-refimove] >> nth=0", label: "Ticked push", text: "Counted now." },
                { sel: RV + "[data-refimanual] >> nth=0", label: "Your lever", text: "Marked “yours”; tick or untick it like Claude’s." },
                { sel: RV + "[data-refimanualdel] >> nth=0", label: "×", text: "Removes your lever." }
              ] }
          ] },
        { title: "The verdict",
          text: "The colored box answers two questions in order: can the property support a loan the size of what you owe, and is it worth doing? The proposed rate and amount, and how the answer is worked out, are inside it.",
          views: [
            { title: "Act before … — pay down",
              text: "Queens Gate’s rate resets within 12 months and the property can’t support what you owe. The box says so first, with the date, and what it takes: the pay-down to refinance at these limits, or an extension with today’s lender.",
              go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: [
                { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "Act before the reset — pay down $X. The other answers: Refinance, Your decision, Don’t refinance." },
                { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "What a new loan has to pay off." },
                { sel: VERDICT + " >> text=/Property supports/", label: "Property supports", text: "The biggest loan the property supports at the proposed rate and the lender’s limits." },
                { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "With the reset ahead: what it resets to, and when." },
                { sel: VERDICT + " >> text=Proposed loan rate", label: "Proposed loan rate", text: "The new loan’s rate, from the rate boxes below." },
                { sel: RV + "[data-refimustwhen]", label: "When", text: "What is ending: the rate reset (with the new payment) or the maturity." },
                { sel: RV + '[data-refipaydown="refi"]', label: "To refinance", text: "The pay-down a new loan needs: what you owe less what the property supports." },
                { sel: RV + '[data-refipaydown^="extend"]', label: "To extend", text: "The pay-down today’s lender would need at its limits, and the cash it takes. Pick **Extend with today’s lender** to see it or to fill in its terms." },
                { sel: PRICE, label: "Proposed rate", text: "The new loan’s rate type, index and spread. See [Rate & amount](ref-refinance#rate-amount)." },
                { sel: "#o1_amount", label: "Proposed loan amount", text: "Starts at what the property supports; type a smaller amount to test it. The line under it shows that loan’s coverage, LTV and debt yield." },
                { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "Stage one: can the property support a loan the size of what you owe? Here no, and why." },
                { sel: BASIS, label: "How “supports $X” is worked out", text: "The NOI, rate, payment and value behind the figure, and the lender’s four limits. See [How much it supports](ref-refinance#how-much-it-supports)." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do, in one line." }
              ] },
            { title: "Refinance",
              text: "The Mews at Princeton, with the lender’s spread typed as 0 for the example: the property supports more than you owe, and the lower rate saves more interest than the early-payoff penalty.",
              go: async (h) => { await mewsAt(h, 0); await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: inOrder([
                { sel: VERDICT + " >> p >> nth=0", label: "Refinance", text: "Both answers are yes." },
                { sel: VERDICT + " >> text=/^Can you\\? Yes/", label: "Can you? Yes", text: "The property supports at least what you owe." },
                { sel: VERDICT + " >> text=/^Should you\\? Yes/", label: "Should you? Yes", text: "Your rule: the new rate saves more interest (until today’s loan ends) than the penalty, or today’s loan ends within 12 months anyway. When the saving doesn’t cover the penalty but the property can refinance, the box turns amber: Your decision." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Refinance.", text: "The proposed loan appears below, with **Save as a loan** at the top." }
              ]) },
            { title: "Your decision",
              text: "The Mews at Princeton with a 20 bps spread and a bigger loan of $135,000,000 (made-up). The lower rate no longer saves as much as the penalty, but the new loan pays out more than 20% of what you owe in cash, even after the penalty. So the app shows both choices. With the same rate and a loan only the size of what you owe, the answer is Don’t refinance.",
              go: async (h) => { await mewsAt(h, 20); await setVal(h, "#o1_amount", 135000000); await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: inOrder([
                { sel: VERDICT + " >> p >> nth=0", label: "Your decision", text: "The property can refinance, and it is worth it only for the cash." },
                { sel: VERDICT + " >> text=/^Can you\\? Yes/", label: "Can you? Yes", text: "The property supports at least what you owe." },
                { sel: VERDICT + " >> text=/^Should you\\? Your decision/", label: "Should you? Your decision", text: "The interest saved is less than the penalty, but the cash out is more than 20% of what you owe." },
                { sel: RV + "[data-refidecision] > div >> nth=0", label: "Refinance now — with $X cash", text: "The cash left after paying off what you owe and the penalty. To take it, click **Save as a loan — Refinance now** at the top." },
                { sel: RV + "[data-refidecision] > div >> nth=1", label: "Wait until …", text: "Or keep today’s loan until it ends; nothing changes." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Your decision.", text: "The choice is yours. Lowering the amount so far that the cash no longer covers the penalty is refused with “You can’t do that”." }
              ]) },
            { title: "Don’t refinance",
              text: "The Mint: the property supports less than you owe, and its loan doesn’t end or reset within 12 months, so there is nothing to do yet.",
              go: async (h) => { await openRefi(h, /the mint/); await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: inOrder([
                { sel: VERDICT + " >> p >> nth=0", label: "Don’t refinance", text: "The answer." },
                { sel: VERDICT + " >> text=/^Can you\\? No/", label: "Can you? No", text: "What caps it, and what would change it: NOI rising, the rate falling, or a pay-down." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "Don’t refinance: the property can’t support a loan the size of the payoff yet." }
              ]) },
            { title: "No T12 yet",
              text: "Avalon Norwalk has no T12. A refinance is sized on the T12 and the underwriting made from it, never on a typed NOI, so nothing is sized.",
              go: async (h) => { await openRefi(h, /avalon norwalk/); await h.page.waitForSelector(RV + "[data-refinot12]", { timeout: 15000 }); await h.top(); },
              shot: "view",
              marks: [
                { sel: RV + "[data-refinot12] h3", label: "No T12 yet", text: "This property has no T12 uploaded." },
                { sel: RV + "[data-refinot12] p", label: "Why nothing is sized", text: "A refinance is sized on the T12 and the underwriting made from it." },
                { sel: RV + "[data-refiuploadt12] >> nth=0", label: "Upload its T12 in Underwriting", text: "Closes the refinance and opens Underwriting on this property, ready for its T12." },
                { sel: "#refiCloseBtn", label: "Close", text: "Back to the loan’s page." }
              ] }
          ] },
        { title: "Rate & amount",
          text: "Inside the verdict box: the new loan’s rate type, index and spread, and its amount. It starts from today’s loan’s type and a usual spread; type your lender’s quote and everything above and below updates at once.",
          views: [
            { title: "Hybrid",
              text: "A fixed period, then adjustable.",
              go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(RV + "#refiPricing"); },
              shot: RV + "#refiPricing",
              marks: [
                { sel: RV + '[data-rtype="Fixed"]', label: "Fixed", text: "One rate for the whole term: a Treasury matched to the term + the lender’s spread." },
                { sel: RV + '[data-rtype="Floating"]', label: "Floating", text: "An index (SOFR, Prime …) + a margin, changing as the index moves." },
                { sel: RV + '[data-rtype="Hybrid ARM"]', label: "Hybrid", text: "Fixed for the first years, then adjustable." },
                { sel: "#o1_fxindex", label: "Index (fixed period)", text: "The Treasury the fixed period is priced on. The list holds every rate the app has; **Fetch live rate** at the top refreshes them." },
                { sel: "#o1_fxspread", label: "Spread (bps)", text: "The lender’s quote in basis points (100 bps = 1%)." },
                { sel: "#o1_index", label: "Index (adjustable)", text: "What the rate follows after the fixed period." },
                { sel: "#o1_spread", label: "Margin (bps)", text: "The lender’s margin over that index." },
                { sel: "#o1_amount", label: "Proposed loan amount", text: "Up to what the property supports; lowering it shows the cash you’d pay in." },
                { sel: RV + "#refiPricing [data-refirate] >> xpath=.. >> nth=0", label: "Rate (fixed period)", text: "The index today + the spread. “Built-in rate — fetch to update” means the index is the app’s own figure until you click **Fetch live rate**. The yellow “starting spread” tag says where the starting spread came from (your recent loans of this kind); it goes once you type the lender’s quote." },
                { sel: RV + "#refiPricing >> text=/the verdict uses this rate/", label: "Monthly payment (fixed period)", text: "The payment in the fixed years. The verdict and the limits use this rate." },
                { sel: RV + "#refiPricing >> text=/shown for information/", label: "Monthly payment (after)", text: "The payment after the fixed period if the index stays where it is today, for information only." },
                { sel: RV + "[data-refiatloan]", label: "At this amount", text: "The proposed loan’s coverage, interest-only coverage, LTV and debt yield at the amount typed." }
              ] },
            { title: "Floating",
              text: "Pick the index and type the lender’s margin. The rate is today’s index + the margin.",
              go: async (h) => { await h.jsClick(RV + '#refiPricing [data-rtype="Floating"]'); await h.wait(1000); await h.calm(); await h.scroll(RV + "#refiPricing"); },
              shot: RV + "#refiPricing",
              marks: [
                { sel: RV + '[data-rtype="Floating"]', label: "Floating", text: "Picked." },
                { sel: "#o1_index", label: "Index", text: "SOFR (overnight or 30-day average), Prime, or a Treasury: every rate the app has." },
                { sel: "#o1_spread", label: "Spread (bps)", text: "The lender’s margin over the index, in basis points." },
                { sel: "#o1_floor", label: "Rate floor (%)", text: "The lowest the rate can go, whatever the index does. Empty = no floor." },
                { sel: "#o1_cap", label: "Rate cap (%)", text: "The highest the rate can go. Empty = no cap." },
                { sel: "#o1_capcost", label: "Cap cost (bps/yr)", text: "The yearly cost of an interest-rate cap, which floating lenders often require. It starts at 0 until you buy one." },
                { sel: RV + "#refiPricing [data-refirate] >> xpath=..", label: "Rate", text: "Today’s index (and the day it was set) + the spread." },
                { sel: "#o1_amount", label: "Proposed loan amount", text: "The new loan’s amount. Switching the rate type works out what the property supports again." }
              ] },
            { title: "Fixed",
              text: "The Treasury that matches the term, plus the lender’s spread.",
              go: async (h) => { await h.jsClick(RV + '#refiPricing [data-rtype="Fixed"]'); await h.wait(1000); await h.calm(); await h.scroll(RV + "#refiPricing"); },
              shot: RV + "#refiPricing",
              marks: [
                { sel: RV + '[data-rtype="Fixed"]', label: "Fixed", text: "Picked." },
                { sel: "#o1_index", label: "Index", text: "The Treasury matched to the loan’s term. Change it if the lender prices on another." },
                { sel: "#o1_spread", label: "Spread (bps)", text: "The lender’s spread." },
                { sel: RV + "#refiPricing [data-refirate] >> xpath=..", label: "Rate", text: "The Treasury today + the spread: one rate for the whole term." },
                { sel: "#o1_amount", label: "Proposed loan amount", text: "The new loan’s amount." },
                { sel: RV + "[data-refiatloan]", label: "At this amount", text: "That loan’s coverage, LTV and debt yield." }
              ] }
          ] },
        { title: "How much it supports",
          text: "How “supports $X” is worked out, under **Can you?**: the NOI, the rate, the payment and the value, and the four limits a lender sizes a loan on. Each limit allows a loan; the smallest of the ones your lender uses is what the property supports. Your figures are kept with this refinance for the whole team.",
          views: [
            { title: "The lender’s limits",
              go: async (h) => { await openRefi(h, /queens gate/); await h.scroll(BASIS); },
              shot: { sel: BASIS, grow: true },
              marks: [
                { sel: BASIS + " >> text=NOI >> nth=0", label: "NOI", text: "The NOI used, and where it comes from." },
                { sel: BASIS + " >> text=Rate >> nth=0", label: "Rate", text: "The proposed loan’s rate (index + spread)." },
                { sel: BASIS + " >> text=Payment >> nth=0", label: "Payment", text: "How the payment is figured: amortizing, interest-only months." },
                { sel: BASIS + " >> text=Value >> nth=0", label: "Value", text: "NOI ÷ cap rate, or the appraisal once you type one. The loan-to-value limit works on this." },
                { sel: RV + '[data-refiappr="value"]', label: "Appraised value", text: "Type an appraisal to use it instead of NOI ÷ cap rate." },
                { sel: RV + '[data-refiappr="date"]', label: "Dated", text: "The appraisal’s date, kept with it." },
                { sel: RV + '[data-refiappr="note"]', label: "Note", text: "Who appraised it, or any note." },
                { sel: RV + "[data-refipresetrow]", label: "Lender preset", text: "A lender’s saved limits. See [Lender presets](ref-refinance#lender-presets)." },
                { sel: RV + '[data-refiuse="DSCR"]', label: "Lender uses", text: "Tick the limits this lender uses; an unticked one is greyed and doesn’t count." },
                { sel: RV + '[data-refileg="DSCR"] td >> nth=1', label: "Lender limit", text: "The limit’s name, how its loan is worked out, and (grey) that loan’s coverage, LTV and debt yield." },
                { sel: RV + '[data-refilim="dscr"]', label: "Debt coverage, amortizing", text: "NOI ÷ (this × the loan constant). Lenders often ask 1.20–1.35×." },
                { sel: RV + '[data-refilim="dscrIO"]', label: "Debt coverage, interest-only", text: "Leave blank (not used) unless the lender sizes on the interest-only payment." },
                { sel: RV + '[data-refilim="ltv"]', label: "Loan-to-value", text: "The most it lends, as a % of the value." },
                { sel: RV + '[data-refilim="dy"]', label: "Debt yield", text: "The least NOI ÷ loan it accepts." },
                { sel: RV + "[data-refilegamt] >> nth=0", label: "Loan it allows", text: "The biggest loan each limit allows on its own." },
                { sel: BASIS + " >> text=BINDS >> nth=0", label: "Binds", text: "The limit that sets the amount: the smallest one used.", optional: true },
                { sel: RV + "[data-refismallest]", label: "The smallest", text: "The smallest loan of the limits used: what the property supports." },
                { sel: BASIS + " >> text=/of headroom before/", label: "Headroom", text: "How much room is left before the next limit would bind instead.", optional: true },
                { sel: RV + "[data-refihist]", label: "Change history", text: "Every change to this refinance’s limits, appraisal and deal: when, who, old → new." }
              ] },
            { title: "An appraisal and the lender’s own limits",
              text: "Typed: an appraised value (a made-up $65,000,000), and Debt yield unticked because this lender doesn’t use it. The loan-to-value now works on the appraisal, and the unticked line is greyed.",
              go: async (h) => { await setVal(h, RV + '[data-refiappr="value"]', 65000000); await setVal(h, RV + '[data-refiappr="note"]', "Example appraiser (made-up)"); await tick(h, RV + '[data-refiuse="Debt Yield"]', false); await h.scroll(BASIS); },
              shot: { sel: BASIS, grow: true },
              marks: [
                { sel: RV + "[data-refivalue]", label: "Value", text: "Now the appraisal, with its note.", optional: true },
                { sel: RV + "[data-refiapprclear]", label: "Use NOI ÷ cap rate instead", text: "Drops the appraisal and goes back to NOI ÷ cap rate.", optional: true },
                { sel: RV + '[data-refiappr="value"]', label: "Appraised value", text: "Clear the box to go back to NOI ÷ cap rate." },
                { sel: RV + '[data-refiappr="note"]', label: "Note", text: "Here “Example appraiser (made-up)”." },
                { sel: RV + '[data-refileg="LTV"]', label: "Loan-to-value", text: "75% of the appraisal." },
                { sel: RV + '[data-refileg="Debt Yield"]', label: "Not used by this lender", text: "Greyed; it no longer counts. Tick it to use it again. At least one limit must stay ticked." },
                { sel: RV + "[data-refismallest]", label: "The smallest of the limits this lender uses", text: "Only the ticked limits count." },
                { sel: RV + "[data-refilimreset]", label: "Back to the start", text: "Puts the limits back to 1.25× / 75% / 7%, all used. Shown once you have changed them.", optional: true },
                { sel: RV + "[data-refihist]", label: "Change history", text: "Lists the changes just made." }
              ] },
            { title: "Change history",
              text: "Every change to this refinance (limits, appraisal, kind of deal, extension terms) with who made it and when.",
              go: async (h) => { await h.click(RV + "[data-refihist]", { wait: 1200 }); },
              after: async (h) => { await hideHistory(h); await resetLimits(h); },
              shot: "#historyModal > div",
              marks: [
                { sel: "#historyTitle", label: "Refinance — change history", text: "This refinance’s own list." },
                { sel: "#historyBody tbody tr >> nth=0", label: "A change", text: "When, what (for example Refinance · appraised value), old → new, who, and where it came from." },
                { sel: "#historyClose", label: "×", text: "Closes the list." }
              ] }
          ] },
        { title: "Lender presets",
          text: "A list of lenders’ limits kept for the whole group, so you pick a lender instead of typing its numbers. The list starts empty; next to **Lender preset**, the admin sees **Add a preset**, later **Manage presets**. Only the group’s admin edits the list (anyone else gets “Only the group’s admin changes the lender presets”); anyone can pick a preset. See [Use a lender preset](use-a-lender-preset).",
          views: [
            { title: "The presets window",
              text: "Each preset is one lender. Nothing is saved until **Save the list**.",
              go: async (h) => { await h.scroll(BASIS); await h.click(RV + "[data-refipresetrow] [data-presetmanage]", { wait: 600 }); },
              after: async (h) => { await h.click("#presetModal [data-presetclose]", { wait: 500 }); },
              shot: "#presetModal > div",
              marks: [
                { sel: '#presetModal [data-pi="0"][data-pf="name"]', label: "Name", text: "The lender, for example Fannie Mae. A preset without a name is dropped when you save." },
                { sel: '#presetModal [data-pi="0"][data-pf="dscr"]', label: "DSCR", text: "Its debt coverage on the amortizing payment." },
                { sel: '#presetModal [data-pi="0"][data-pf="dscrIO"]', label: "IO", text: "Its coverage on an interest-only payment (blank if it doesn’t use one)." },
                { sel: '#presetModal [data-pi="0"][data-pf="ltv"]', label: "LTV", text: "Its most loan-to-value, in %." },
                { sel: '#presetModal [data-pi="0"][data-pf="dy"]', label: "DY", text: "Its least debt yield, in %." },
                { sel: '#presetModal [data-presetdel="0"]', label: "Remove", text: "Takes this preset off the list." },
                { sel: '#presetModal [data-pi="0"][data-pf="use:DSCR"]', label: "Uses", text: "The limits this lender uses." },
                { sel: '#presetModal [data-pi="0"][data-pf="ioSizing"]', label: "Interest-only sizing", text: "Tick if it sizes a loan that is interest-only for its whole term on the interest-only payment." },
                { sel: '#presetModal [data-pi="0"][data-pf="type:Floating"]', label: "Rate types", text: "The rate types it lends at; an unticked one is greyed in the refinance." },
                { sel: '#presetModal [data-pi="0"][data-pf="maxAmortYears"]', label: "Longest amortization", text: "In years." },
                { sel: '#presetModal [data-pi="0"][data-pf="penHow"]', label: "Penalty on an extension", text: "What this lender usually asks when it extends a loan: the full penalty, on the pay-down only, a part (% or $), or none." },
                { sel: '#presetModal [data-pi="0"][data-pf="penPct"]', label: "Part (%)", text: "For a part (%): the share of the full penalty (here 50%). A part ($) asks for a dollar amount instead." },
                { sel: '#presetModal [data-pi="0"][data-pf="notes"]', label: "Notes", text: "Anything else worth remembering about this lender." },
                { sel: '#presetModal [data-pi="0"][data-pf="source"]', label: "Source", text: "Where the numbers came from, and when." },
                { sel: "#presetModal [data-presetadd]", label: "Add a preset", text: "Adds another lender." },
                { sel: "#presetModal [data-presetsave]", label: "Save the list", text: "Saves the list for the whole group and closes the window." },
                { sel: "#presetModal [data-presetclose]", label: "Close", text: "Closes without saving; the changes are dropped." }
              ] },
            { title: "A preset picked",
              text: "Picked for this refinance: the limits fill in from the preset, the table names it, and a rate type the lender doesn’t allow is greyed in the rate boxes (clicking it says why).",
              go: async (h) => { await pickPreset(h); await h.scroll(BASIS); },
              after: async (h) => { await pickVal(h, RV + "[data-refipreset]", ""); await resetLimits(h); },
              shot: { sel: BASIS, grow: true },
              marks: [
                { sel: RV + "[data-refipreset]", label: "Lender preset", text: "Pick a lender, or “None — type the limits”." },
                { sel: RV + "[data-refipresetchip]", label: "Its name", text: "The preset in use; “(changed here)” once you change a limit by hand." },
                { sel: RV + "[data-refipresetrow] [data-presetmanage]", label: "Manage presets", text: "Edit the group’s list (admin only)." },
                { sel: RV + "[data-refipresetrow] >> text=/^allows /", label: "What it allows", text: "The rate types this lender lends at, and its longest amortization." },
                { sel: RV + '[data-refilim="dscr"]', label: "The limits", text: "Filled from the preset (here 1.30× / 70% / 8%). Type over one and its name says “changed here”." },
                { sel: RV + "[data-refismallest]", label: "What the property supports", text: "Worked out again on the preset’s limits." }
              ] }
          ] },
        { title: "The proposed loan",
          text: "Shown when the answer is **Refinance**, **Your decision** or a pay-down: the new loan’s terms and its payment schedule. It matches today’s term and interest-only period, priced at today’s rate; every box is editable and the verdict updates as you type. **Save as a loan** at the top saves it; see [Save the refinance as a loan](save-the-refinance).",
          views: [
            { title: "Proposed New Loan",
              go: async (h) => { await mewsAt(h, 0); await h.scroll(card("Proposed New Loan")); },
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
                { sel: card("Proposed New Loan") + " >> table >> xpath=..", label: "Amortization schedule", text: "Every payment of the new loan: rate, interest, payment, principal and balance; interest-only months are marked IO. Scroll inside the box for the rest." }
              ] },
            { title: "Escrows, reserves and fees",
              text: "Opened: the monthly escrows, reserves and fees that come with the new loan’s payment. Every box here is added to the monthly payment.",
              go: async (h) => { await h.js(() => { document.querySelectorAll("#refiView details").forEach(d => { d.open = true; }); }); await h.wait(400); await h.scroll(card("Proposed New Loan")); },
              shot: { sel: card("Proposed New Loan") + " >> details >> nth=0 >> xpath=..", grow: true },
              marks: [
                { sel: "#o1_escrowTax", label: "Tax escrow", text: "Monthly real-estate-tax escrow, in dollars a month." },
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
        { title: "The extension",
          text: "With **Extend with today’s lender** picked, everything below judges the extension instead of a new loan: its own verdict, rate, limits, terms and schedule. Saving it, and undoing it, are shown in [Extend with today’s lender](extend-with-your-lender).",
          views: [
            { title: "Extend with today’s lender picked",
              go: async (h) => { await openRefi(h, /queens gate/); await pickDeal(h, "extend"); await h.top(); },
              shot: "view",
              marks: [
                { sel: RV + '[data-refideal="extend"]', label: "Extend with today’s lender", text: "Picked." },
                { sel: "#refiExtSaveBtn", label: "Save the extension", text: "Shown when the answer is to extend. Saves the extension on today’s loan, with the pay-down it needs; it asks first." }
              ] },
            { title: "The extension’s verdict",
              text: "The same rule as a new loan, applied to the extension: the pay-down it needs to fit today’s lender’s limits, and whether it is worth doing.",
              go: async (h) => { await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: [
                { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "Extend — pay down $X, or Not yet, or Don’t extend now." },
                { sel: VERDICT + " >> text=/^You.ll owe on/", label: "You’ll owe on …", text: "What you will owe on the day today’s terms end." },
                { sel: VERDICT + " >> text=Today’s lender allows", label: "Today’s lender allows", text: "The biggest loan today’s lender’s limits allow at the extension’s rate." },
                { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "With the reset ahead." },
                { sel: VERDICT + " >> text=Extension rate", label: "Extension rate", text: "The index + today’s lender’s spread." },
                { sel: RV + '[data-refiextf="index"]', label: "Index", text: "What the extension’s rate floats on: every rate the app has." },
                { sel: RV + '[data-refiextf="spreadBps"]', label: "Spread (bps)", text: "Today’s lender’s quote over the index." },
                { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "Yes, with or without a pay-down." },
                { sel: RV + '[data-refipaydown="extend"]', label: "The pay-down", text: "What you will owe less what the lender’s limits allow, and which limit sets it.", optional: true },
                { sel: RV + "[data-refibasisext]", label: "Today’s lender’s limits", text: "The limits table for the extension, kept apart from a new loan’s. See the next picture." },
                { sel: VERDICT + " >> text=/^Should you\\?/", label: "Should you?", text: "Yes when today’s loan ends or resets within 12 months; Not yet when nothing ends or resets within 12 months; otherwise yes only when the lower rate saves more than the penalty." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do, with the cash it takes: pay-down + penalty + fee." }
              ] },
            { title: "Today’s lender’s limits",
              text: "Today’s lender’s own limits for the extension (here 1.11× amortizing and 1.35× interest-only, made-up), kept with the property apart from a new loan’s.",
              go: async (h) => { await setVal(h, RV + '[data-refiextlim="dscr"]', 1.11); await setVal(h, RV + '[data-refiextlim="dscrIO"]', 1.35); await setVal(h, RV + '[data-refiappr="value"]', 65000000); await h.scroll(RV + "[data-refibasisext]"); },
              shot: { sel: RV + "[data-refibasisext]", grow: true },
              marks: [
                { sel: RV + '[data-refiextlim="dscr"]', label: "Amortizing coverage", text: "Today’s lender’s DSCR." },
                { sel: RV + '[data-refiextlim="dscrIO"]', label: "Interest-only coverage", text: "Its coverage on the interest-only payment." },
                { sel: RV + '[data-refiextlim="ltv"]', label: "Loan-to-value", text: "Today’s lender’s most loan-to-value, here on the appraisal." },
                { sel: RV + '[data-refiextlim="dy"]', label: "Debt yield", text: "Its least debt yield." },
                { sel: RV + '[data-refiextuse="DSCR"]', label: "Lender uses", text: "Untick a limit today’s lender doesn’t use." },
                { sel: RV + "[data-refiextpresetrow]", label: "Lender preset", text: "Today’s lender’s preset, if the group has one. It also fills in the penalty that lender usually asks. **Manage presets** edits the list (admin only)." },
                { sel: RV + '[data-refibasisext] [data-refiappr="value"]', label: "Appraised value", text: "Shared with the new loan’s: one appraisal for the property (here a made-up $65,000,000)." },
                { sel: RV + "[data-refibasisext] [data-refismallest]", label: "What today’s lender allows", text: "The smallest of the limits it uses; the binding one is marked BINDS." },
                { sel: RV + "[data-refiiohint]", label: "Interest-only hint", text: "The extension is interest-only for its whole term: untick the amortizing line if the lender sizes on the interest-only payment.", optional: true },
                { sel: RV + "[data-refiextlimreset]", label: "Back to the new loan’s limits", text: "Drops today’s lender’s own limits and uses the new loan’s again.", optional: true },
                { sel: RV + "[data-refibasisext] [data-refihist]", label: "Change history", text: "Every change to the refinance, these limits included." }
              ] },
            { title: "The extension’s terms",
              text: "When today’s terms end, how long the new terms run, interest-only, the amortization after it, the lender’s penalty and the fee, and what it all adds up to.",
              go: async (h) => { await h.scroll(EXTCARD); },
              shot: { sel: EXTCARD, grow: true },
              marks: [
                { sel: RV + '[data-refiextf="date"]', label: "Today’s terms end on", text: "Starts at the payment before the rate resets (or the maturity)." },
                { sel: RV + '[data-refiextf="months"]', label: "Months on the new terms", text: "How long the extension runs." },
                { sel: RV + '[data-refiextf="io"]', label: "Interest-only", text: "The whole term, the first N months, or none." },
                { sel: RV + '[data-refiextf="amortMonths"]', label: "Amortization", text: "Months the payment is figured over after interest-only." },
                { sel: RV + '[data-refiextf="penaltyHow"]', label: "Early-payoff penalty", text: "What this lender asks: the full penalty, on the pay-down only, a part, or none. Until you pick, it assumes on the pay-down." },
                { sel: RV + '[data-refiextf="feeKind"]', label: "Extension fee in", text: "% of the extended amount, or dollars." },
                { sel: RV + '[data-refiextf="feeValue"]', label: "Extension fee", text: "The fee." },
                { sel: RV + '[data-refipaydown="extend-card"]', label: "Pay-down needed", text: "What you pay down so the loan fits the lender’s limits." },
                { sel: EXTCARD + ' dt:text-is("Extended amount")', label: "Extended amount", text: "What you owe after the pay-down." },
                { sel: EXTCARD + " dl > div >> nth=2 >> dt", label: "At this amount", text: "The extended loan’s coverage, interest-only coverage, LTV and debt yield." },
                { sel: EXTCARD + ' dt:text-is("Early-payoff penalty")', label: "Penalty", text: "In dollars, how it was worked out, and the full penalty today." },
                { sel: RV + "[data-refiextassumed]", label: "Assumed", text: "Until you pick what this lender asks, the penalty is assumed to be on the pay-down only. Confirm it with the lender.", optional: true },
                { sel: EXTCARD + ' dt:text-is("Extension fee")', label: "Extension fee", text: "The fee in dollars." },
                { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Pay-down + penalty + fee." },
                { sel: EXTCARD + ' dt:text-is("First payment on the new terms")', label: "First payment", text: "The date and amount of the first payment on the new terms." },
                { sel: EXTCARD + ' dt:text-is("New maturity")', label: "New maturity", text: "When the extended loan is due." },
                { sel: RV + "[data-refiextearlier]", label: "Earlier than today’s", text: "A warning: these terms would end before today’s loan does. Type more months if that isn’t what you mean.", optional: true }
              ] },
            { title: "Penalty: a part of it",
              text: "**A part (%)** asks what share of the full penalty the lender wants. **The first N months** of interest-only asks how many months.",
              go: async (h) => { await pickVal(h, RV + '[data-refiextf="penaltyHow"]', "pct"); await setVal(h, RV + '[data-refiextf="penaltyPct"]', 40); await pickVal(h, RV + '[data-refiextf="io"]', "n"); await h.scroll(EXTCARD); },
              shot: { sel: EXTCARD, grow: true },
              marks: [
                { sel: RV + '[data-refiextf="penaltyPct"]', label: "Part of the full penalty (%)", text: "Here 40% of today’s full penalty." },
                { sel: RV + '[data-refiextf="ioMonths"]', label: "Interest-only months", text: "How many months are interest-only (shown when you pick The first N months)." },
                { sel: EXTCARD + ' dt:text-is("Early-payoff penalty")', label: "Penalty", text: "Now 40% of the full penalty, no longer assumed." },
                { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Follows at once." }
              ] },
            { title: "Penalty and fee in dollars",
              text: "**A part ($)** asks for the penalty the lender quotes, in dollars; the fee can be in dollars too. Here a made-up $100,000 penalty and a $25,000 fee.",
              go: async (h) => { await pickVal(h, RV + '[data-refiextf="penaltyHow"]', "amt"); await setVal(h, RV + '[data-refiextf="penaltyAmt"]', 100000); await pickVal(h, RV + '[data-refiextf="feeKind"]', "amt"); await setVal(h, RV + '[data-refiextf="feeValue"]', 25000); await h.scroll(EXTCARD); },
              after: async (h) => { await pickVal(h, RV + '[data-refiextf="io"]', "whole"); await pickVal(h, RV + '[data-refiextf="penaltyHow"]', "paydown"); await pickVal(h, RV + '[data-refiextf="feeKind"]', "pct"); await setVal(h, RV + '[data-refiextf="feeValue"]', 0); },
              shot: { sel: EXTCARD, grow: true },
              marks: [
                { sel: RV + '[data-refiextf="penaltyHow"]', label: "A part — a dollar amount", text: "The other choices: the full penalty, on the pay-down only, a part (%), none." },
                { sel: RV + '[data-refiextf="penaltyAmt"]', label: "Penalty the lender asks ($)", text: "The lender’s figure." },
                { sel: RV + '[data-refiextf="feeKind"]', label: "Extension fee in dollars", text: "Or % of the extended amount." },
                { sel: RV + '[data-refiextf="feeValue"]', label: "Extension fee", text: "Here $25,000." },
                { sel: EXTCARD + ' dt:text-is("Extension fee")', label: "Fee", text: "Counted in the cash needed." },
                { sel: RV + "[data-refiextcash]", label: "Cash needed", text: "Pay-down + $100,000 + $25,000." }
              ] },
            { title: "The payment schedule with the extension",
              text: "From today to the new maturity: the pay-down on the date today’s terms end, where the extension starts, and its months shaded.",
              go: async (h) => { await h.scroll(RV + "[data-refiextsched]"); },
              shot: { sel: RV + "[data-refiextsched]", grow: true },
              marks: [
                { sel: RV + "[data-refiextsched] h3", label: "From today to …", text: "The whole schedule with the extension in place." },
                { sel: RV + "[data-schedpaid]", label: "Paid down", text: "The pay-down, as a principal payment." },
                { sel: RV + "[data-schedext]", label: "Extension starts", text: "The first payment on the new terms." },
                { sel: RV + "[data-schedext-row] >> nth=1", label: "Extension months", text: "Shaded: the new rate and terms." }
              ] },
            { title: "Not yet",
              text: "The Mews at Princeton: today’s lender’s limits cover what you’ll owe, but nothing ends or resets within 12 months, so the answer is Not yet and there is no **Save the extension**. When a lower rate doesn’t pay for the penalty, the answer is Don’t extend now.",
              go: async (h) => { await openRefi(h, /mews at princeton/); await pickDeal(h, "extend"); await h.scroll(XVERDICT); },
              after: async (h) => { await pickDeal(h, "new"); },
              shot: { sel: XVERDICT, grow: true },
              marks: [
                { sel: XVERDICT + " >> p >> nth=0", label: "Not yet", text: "Today’s terms end more than 12 months from now." },
                { sel: XVERDICT + " >> text=/^Can you\\?/", label: "Can you? Yes", text: "Today’s lender’s limits allow more than you’ll owe: no pay-down needed." },
                { sel: XVERDICT + " >> text=/^Should you\\?/", label: "Should you? Not yet", text: "When today’s terms end, and that nothing ends or resets within 12 months." },
                { sel: XVERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "Not yet: decide closer to the date." }
              ] }
          ] },
        { title: "Several loans together",
          text: "A property’s senior and mezzanine loans refinance as one package; **Create a portfolio…** puts several properties under one new loan. An extension isn’t offered for a package. See [Refinance several loans together](refinance-together).",
          views: [
            { title: "Senior + mezz: the whole property",
              thin: 1024,
              text: "The property’s combined entry under **Specific Property** (its name followed by **senior + mezz**), then **Refi Calculator**: one new loan pays off both. Here Avalon White Plains, with a made-up T12.",
              go: openCombo,
              shot: { sel: card("Current debt"), grow: true },
              marks: [
                { sel: card("Current debt") + " >> text=/loans on this property/", label: "The loans", text: "Every loan on the property, refinanced together (they depend on one another)." },
                { sel: card("Current debt") + " >> text=Payoff balance", label: "Payoff balance", text: "Each loan at its own balance, added up." },
                { sel: card("Current debt") + " >> text=Monthly payments", label: "Monthly payments", text: "Today’s payments on all of them." },
                { sel: card("Current debt") + " >> text=Current rate", label: "Current rate", text: "The loans’ rate together, weighted by what is owed on each." },
                { sel: card("Current debt") + " >> text=Remaining", label: "Remaining", text: "Months until the first of them ends." },
                { sel: card("Current debt") + " >> text=Matures", label: "Matures", text: "When the first of them is due." }
              ] },
            { title: "Create a portfolio…",
              text: "On the Portfolio tab, above the Coverage table. Tick every property the one new loan will secure. Nothing changes until you save the new loan on the next screen.",
              go: async (h) => { await openPicker(h, POOL3); },
              shot: "#poolPicker > div",
              marks: [
                { sel: "#poolPickSearch", label: "Find a property", text: "Type to narrow the list." },
                { sel: '#poolPicker [data-poolpickrow="queens gate apartments"] [data-poolpick]', label: "Tick a property", text: "Each property the new loan will secure." },
                { sel: '#poolPicker [data-poolpickrow="queens gate apartments"] [data-poolpicknoi]', label: "Owes · NOI", text: "What is owed on the property, and the NOI its refinance would use: its T12 (In-place T12), or its Safe underwriting once approved." },
                { sel: '#poolPicker [data-poolpickrow="villages of whitewater"] [data-poolpicknoi]', label: "Safe underwriting", text: "Villages of Whitewater’s underwriting is approved, so its Safe figure is used (you can pick another basis on the next screen).", optional: true },
                { sel: '#poolPicker [data-poolpicknoi="none"] >> nth=0', label: "no T12", text: "A property with no T12. You can tick it, but nothing is sized until its T12 is uploaded.", optional: true },
                { sel: "#poolPickNote", label: "The package", text: "How many are ticked, the loans to pay off and what is owed, and the NOI together (or which ticked property has no T12)." },
                { sel: "#poolPickCancel", label: "Cancel", text: "Closes the list." },
                { sel: "#poolPickGo", label: "Create the portfolio", text: "Opens the refinance of the ticked properties together. It needs at least two, and at least one loan to pay off." }
              ] },
            { title: "NOI by property",
              thin: 1024,
              text: "The same refinance screen, for the whole package. Each property has its own row and its own NOI basis; the package is sized on the total.",
              go: async (h) => { await h.click("#poolPickGo", { wait: 2500 }); await h.calm(); await h.page.waitForSelector(RV + "[data-refipoolnoitable]", { timeout: 15000 }); await h.scroll(RV + "[data-refipoolnoitable]"); },
              shot: { sel: RV + "[data-refipoolnoitable]", grow: true },
              marks: [
                { sel: RV + "[data-refipoolnoi] >> nth=0", label: "A property", text: "One row per property in the package." },
                { sel: RV + "[data-refikeybasis] >> nth=0", label: "Its basis", text: "The NOI this property counts with. Safe and Aggressive are greyed (“approve it first”) until its underwriting is approved." },
                { sel: RV + "[data-refipoolnoi] td >> nth=2", label: "NOI", text: "Its NOI on the basis picked." },
                { sel: RV + "[data-refipoolnoi] td >> nth=3", label: "+ ticked pushes", text: "What its ticked pushes add." },
                { sel: RV + "[data-refipoolnoi] td >> nth=4", label: "From", text: "Where the figure comes from: the T12 and its months, or the approved underwriting and when it was approved." },
                { sel: RV + "[data-refipooltotal]", label: "Total", text: "The NOI the package is sized on: every property’s NOI, its pushes and your levers." }
              ] },
            { title: "Each property’s basis",
              thin: 1024,
              text: "Villages of Whitewater switched to its Aggressive underwriting; Queens Gate and The Mews stay on their in-place T12. The total and everything below follow, and each pick is kept with this refinance.",
              go: async (h) => { await h.select(RV + '[data-refipoolnoi]:has-text("Villages of Whitewater") [data-refikeybasis]', "aggressive", { wait: 1500 }); await h.calm(); await h.scroll(RV + "[data-refipoolnoitable]"); },
              shot: { sel: RV + "[data-refipoolnoitable]", grow: true },
              marks: [
                { sel: RV + '[data-refipoolnoi]:has-text("Villages of Whitewater") [data-refikeybasis]', label: "Aggressive underwriting", text: "Picked for this property only." },
                { sel: RV + '[data-refipoolnoi]:has-text("Villages of Whitewater") td >> nth=2', label: "Its NOI", text: "Now its approved Aggressive figure." },
                { sel: RV + "[data-refipooltotal]", label: "Total", text: "Worked out again." }
              ] },
            { title: "Each property’s pushes",
              text: "What to push lists each property’s pushes under its name, ticked one by one; a push counts its effect on the basis picked for its property.",
              go: async (h) => { await tick(h, RV + "[data-refimove]", true); await h.scroll(PUSHBOX); },
              shot: { sel: PUSHBOX, grow: true },
              marks: [
                { sel: PUSHBOX + ' div.uppercase:has-text("Villages of Whitewater")', label: "Villages of Whitewater · on the Aggressive underwriting", text: "Its pushes, counted on the basis picked for it." },
                { sel: RV + "[data-refimove] >> nth=0", label: "A push ticked", text: "Its effect on Aggressive is added to the package’s NOI." },
                { sel: RV + "[data-refiboost]", label: "Added to the NOI", text: "Everything ticked, every property together." },
                { sel: PUSHBOX + ' div.uppercase:has-text("Queens Gate")', label: "Queens Gate Apartments", text: "No pushes yet: approve its underwriting in Underwriting first, then What to push lists them." },
                { sel: RV + "[data-refitargetbox]", label: "The amount to cover", text: "For the whole package." }
              ] },
            { title: "The package’s verdict",
              text: "“These 3 properties support …”: the verdict and everything after it work exactly as for one loan. **Save as a loan** puts one new loan on all of them and pays off every loan on them.",
              go: async (h) => { await h.scroll(VERDICT); },
              shot: { sel: VERDICT, grow: true },
              marks: [
                { sel: VERDICT + " >> p >> nth=0", label: "The answer", text: "For the whole package." },
                { sel: VERDICT + " >> p >> nth=1", label: "Which properties", text: "The properties and the number of loans paid off." },
                { sel: VERDICT + " >> text=You owe (payoff)", label: "You owe (payoff)", text: "Every loan on them, added up." },
                { sel: VERDICT + " >> text=/Properties support/", label: "Properties support", text: "The biggest single loan the properties support together." },
                { sel: VERDICT + " >> text=/Today.s loan rate/", label: "Today’s loan rate", text: "The loans’ rate together, weighted by what is owed." },
                { sel: VERDICT + " >> text=Proposed loan rate", label: "Proposed loan rate", text: "The one new loan’s rate." },
                { sel: RV + "[data-refimust]", label: "When, and the pay-down", text: "What ends first, and the pay-down a new loan needs.", optional: true },
                { sel: PRICE, label: "Proposed rate", text: "The one new loan’s rate type, index and spread." },
                { sel: "#o1_amount", label: "Proposed loan amount", text: "The one new loan." },
                { sel: VERDICT + " >> text=/^Can you\\?/", label: "Can you?", text: "For all of them together." },
                { sel: BASIS, label: "How “supports $X” is worked out", text: "The package’s NOI (every property on its own basis, with its pushes), the rate, the payment, the value and the limits." },
                { sel: VERDICT + " >> p.font-semibold.text-slate-900 >> nth=-1", label: "Bottom line", text: "What to do for the package." }
              ] },
            { title: "A property with no T12",
              text: "Here Queens Gate Apartments and Avalon Norwalk, which has no T12. Counting it as $0, or on a typed NOI, would misstate what the package supports, so nothing is sized until its T12 is uploaded.",
              go: async (h) => { await openPicker(h, ["queens gate apartments", "avalon norwalk"]); await h.click("#poolPickGo", { wait: 2500 }); await h.calm(); await h.page.waitForSelector(RV + "[data-refinot12]", { timeout: 15000 }); await h.top(); },
              shot: "view",
              marks: [
                { sel: RV + "[data-refinot12] h3", label: "No T12 yet", text: "The package can’t be sized yet." },
                { sel: RV + "[data-refinot12] p", label: "Which property", text: "The property with no T12; the others are fine." },
                { sel: RV + "[data-refiuploadt12] >> nth=0", label: "Upload Avalon Norwalk’s T12 in Underwriting", text: "Opens Underwriting on that property, ready for its T12. Come back to the package afterwards." },
                { sel: "#refiCloseBtn", label: "Close", text: "Back to the Portfolio tab." }
              ] }
          ] }
      ] },

    // ==================================================================================================================
    // Last in the file because it really saves: The Mews at Princeton's refinance becomes a loan.
    { id: "save-the-refinance", kind: "howto", group: "Refinance", title: "Save the refinance as a loan",
      description: "Make the proposed loan a loan in your book, and mark today’s loan paid off.",
      intro: "When the answer is **Refinance**, **Your decision** or a pay-down, and the proposed loan matches your lender’s terms, save it. The new loan joins your book, and today’s loan is marked Paid off (refinanced) and leaves every total.",
      before: [ "A proposed loan on the refinance — see [Set the proposed loan’s rate and amount](set-the-proposed-loan)." ],
      sections: [
        { title: "Save the new loan",
          steps: [
            { text: "Open the loan’s refinance and check the proposed loan: its rate, its amount and its terms. Here The Mews at Princeton, with the lender’s spread typed as 0 (made-up).",
              go: async (h) => { await mewsAt(h, 0); } },
            { text: "Click **Save as a loan** at the top. With a pay-down it reads **Save as a loan — pay in $X**; with **Your decision**, **Save as a loan — Refinance now**.",
              go: async (h) => { await h.top(); },
              shot: "view",
              marks: [ { sel: "#refiSaveBtn", label: "Save as a loan", text: "Shown only when there is a loan to propose." } ] },
            { text: "Read **Save the refinance?**: the new loan, the loan it pays off, and any cash you pay in.",
              go: async (h) => { await h.click("#refiSaveBtn", { wait: 600 }); },
              shot: confirmBox,
              marks: [
                { sel: "#confirmTitle", label: "Save the refinance?", text: "It asks first.", optional: true },
                { sel: "#confirmText", label: "What happens", text: "The new loan, the old loan(s) paid off, and any cash paid in." },
                { sel: "#confirmOk", label: "Save the refinance", text: "Does it." },
                { sel: "#confirmCancel", label: "Cancel", text: "Nothing changes." }
              ] },
            { text: "Click **Save the refinance**. The new loan is added with today’s date and opens on its own page. Today’s loan becomes Paid off (refinanced) and leaves every total; a pay-down is recorded on the new loan.",
              go: async (h) => { await confirmYes(h); await h.wait(800); } }
          ],
          note: "For a package, the one new loan secures every property in it, and every loan on them is paid off." },
        { title: "Find today’s loan afterward",
          steps: [
            { thin: 1024, text: "On the **Portfolio** tab, scroll down to **Removed & paid-off loans**. Today’s loan is listed there as **Paid off (refinanced)**.",
              go: async (h) => { await h.closeModals(); await h.home(); await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(800); await h.calm(); },
              shot: "#inactiveLoansStrip",
              marks: [
                { sel: "#inactiveLoansStrip >> text=Removed & paid-off loans", label: "Removed & paid-off loans", text: "Loans out of every total, tile and the calendar." },
                { sel: MEWS_DONE + " > span", label: "Today’s loan", text: "Paid off (refinanced), with the date." },
                { sel: MEWS_DONE + " > [data-restoreloan]", label: "Restore", text: "Brings it back into every total." }
              ] },
            { text: "To go back on the refinance, click **Restore** on today’s loan and remove the new loan. See [Bring back a removed loan or property](bring-back-removed) and [Remove a loan](remove-a-loan)." }
          ] }
      ],
      next: [
        { page: "open-a-loan", text: "Read the new loan’s page." },
        { page: "check-coverage", text: "See the property’s coverage with the new loan." }
      ] }
  ])
};
