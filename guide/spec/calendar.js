/* Guide chapter: Maturity & Reset Calendar — every balloon, ARM reset and interest-only step-up, as a list or month by
   month; the filters; the loans that need a maturity decision; and opening a loan from an event.
   The pictures use the app's built-in sample loans; two of them are given a made-up status in setup ("Extension
   undecided", "Matured") so the "Needs a maturity decision" box has something to show. */
"use strict";

// The calendar is a small page of its own inside the tab (an iframe), so a marker can't point into it directly: each
// thing a marker points at gets a see-through box laid over it in the app's own page, made fresh for each picture.
const PANEL = "#calendarPanel";
// fn(d, a) runs on the calendar's own page (d = its document)
const fjs = (h, fn, arg) => h.page.evaluate("(" + fn.toString() + ")(document.getElementById('calendarFrame').contentDocument, " + JSON.stringify(arg == null ? null : arg) + ")");
const fclick = async (h, sel, nth) => { await fjs(h, (d, a) => { const e = d.querySelectorAll(a.s)[a.n]; if (!e) throw new Error("not in the calendar: " + a.s); e.click(); }, { s: sel, n: nth || 0 }); await h.wait(450); };
// scroll the calendar so `sel` sits `gap` pixels below its top (no element = back to the top)
const fscroll = async (h, sel, gap, nth) => { await fjs(h, (d, a) => { const s = d.scrollingElement; if (!a.s){ s.scrollTop = 0; return; } const e = d.querySelectorAll(a.s)[a.n]; if (!e) throw new Error("not in the calendar: " + a.s); s.scrollTop = Math.max(0, s.scrollTop + e.getBoundingClientRect().top - a.g); }, { s: sel, g: gap == null ? 16 : gap, n: nth || 0 }); await h.wait(250); };
const overlay = async (h, marks) => {
  const list = marks.filter(m => m.in).map(m => ({ id: m.id, sel: m.in, nth: m.inNth || 0 }));
  await h.js((items) => {
    document.querySelectorAll("[data-gcal]").forEach(e => e.remove());
    const f = document.getElementById("calendarFrame"), d = f && f.contentDocument, host = document.getElementById("calendarPanel");
    if (!d || !host) return;
    host.style.position = "relative";
    const fr = f.getBoundingClientRect(), hr = host.getBoundingClientRect(), ox = fr.left - hr.left + f.clientLeft, oy = fr.top - hr.top + f.clientTop, W = f.clientWidth, H = f.clientHeight;
    items.forEach((it) => {
      const e = d.querySelectorAll(it.sel)[it.nth]; if (!e) return;
      const r = e.getBoundingClientRect(), x1 = Math.max(0, r.left), y1 = Math.max(0, r.top), x2 = Math.min(W, r.right), y2 = Math.min(H, r.bottom);
      if (x2 - x1 < 2 || y2 - y1 < 2) return;   // not in sight inside the calendar: no box, so the marker can't be placed
      const p = document.createElement("div"); p.setAttribute("data-gcal", it.id);
      p.style.cssText = "position:absolute;pointer-events:none;left:" + (ox + x1) + "px;top:" + (oy + y1) + "px;width:" + (x2 - x1) + "px;height:" + (y2 - y1) + "px";
      host.appendChild(p);
    });
  }, list);
};
// a marker on something inside the calendar: { in: selector inside it, inNth }
let seq = 0;
const cm = (inSel, label, text, o) => { o = o || {}; const id = "m" + (++seq); return Object.assign({ id: id, in: inSel, inNth: o.nth || 0, sel: '[data-gcal="' + id + '"]', label: label, text: text }, o.optional ? { optional: true } : {}); };
// a step whose markers point into the calendar: its boxes are laid after its own `go`
const cs = (st) => Object.assign({}, st, { go: async (h) => { if (st.go) await st.go(h); await h.calm(); await overlay(h, st.marks || []); } });
const openCal = async (h) => { await h.js(() => { const t = document.querySelector('[data-tabsel^="calendar"]'); if (t) t.click(); }); await h.wait(500); if (!(await h.js(() => { const p = document.getElementById("calendarPanel"); return !!p && !p.hidden; }))) await h.newTab("calendar"); await h.wait(600); await h.calm(); };
const reset = async (h) => { await openCal(h); await fjs(h, (d) => { d.querySelectorAll("details[open]").forEach(x => { x.open = false; }); const s = d.getElementById("sortSel"); s.size = 0; s.removeAttribute("style"); s.value = "date"; s.dispatchEvent(new Event("change", { bubbles: true })); d.getElementById("clearBtn").click(); d.querySelector('[data-view="list"]').click(); }); await h.wait(400); await fscroll(h, null); };
// set a sample loan's status by hand, the way the operator does: its row's edit button, Loan Status, Save
const setStatus = async (h, re, status) => {
  const id = await h.openLoan(re);
  await h.js((i) => { const b = document.querySelector('[data-loanedit="' + i + '"]'); if (b) b.click(); }, id); await h.wait(900);
  await h.select("#f_loanStatus", status); await h.click("#saveBtn", { wait: 1500 });
};

module.exports = {
  id: "calendar",
  title: "Maturity & Reset Calendar",
  intro: "Every balloon (maturity), ARM rate reset and interest-only step-up in the book — as a list or month by month — with the loans that need a maturity decision on top. Click any event to open its loan.",
  setup: async (h) => {
    await setStatus(h, /K2 Sweetwater \(FIU/, "Extension undecided");
    await setStatus(h, /^Avalon White Plains$/, "Matured");
    await h.home();
  },
  topics: [
    // ------------------------------------------------------------------------------------------------------------------
    { id: "open", title: "Open the calendar", intro: "The calendar opens in its own tab, from the “+” at the end of the tab strip.",
      steps: [
        { title: "The “+” menu", text: "Click the “+” at the end of the tab strip, then “Maturity & Reset Calendar”.",
          go: async (h) => { await h.home(); await h.top(); await h.click("#tabNewBtn", { wait: 400 }); },
          shot: "view",
          marks: [
            { sel: "#tabNewBtn", label: "+", text: "Opens this menu: a tool in a tab of its own." },
            { sel: '[data-tabopen="calendar"]', label: "Maturity & Reset Calendar", text: "Opens the calendar (this chapter). If it is already open, it takes you to its tab." }
          ] },
        cs({ title: "The Calendar tab", text: "The calendar is built from every active loan in the book (an archived property, a removed or paid-off loan is left out) and is redrawn whenever a loan changes. Your view and filters stay as you left them while the tab is open.", cover: true,
          go: async (h) => { await h.click('[data-tabopen="calendar"]', { wait: 1200 }); await h.calm(); await h.top(); await fscroll(h, null); },
          shot: "view",
          marks: [
            { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back to the portfolio. The calendar tab stays open." },
            { sel: '[data-tabsel^="calendar"]', label: "Calendar", text: "This tab." },
            { sel: '[data-tabpop^="calendar"]', label: "Pop out", text: "Opens the calendar in a window of its own — handy on a second screen. Clicking an event there still opens the loan here." },
            { sel: '[data-tabclose^="calendar"]', label: "Close tab", text: "Closes the calendar. Nothing is lost — it is rebuilt from the loans next time." },
            cm("header h1", "Maturity & Reset Calendar", "The title, and the day it was built (today)."),
            cm(".toolbar", "The tool bar", "List or Calendar, the filters, Sort, Clear and Print (the “Narrow it down” topic)."),
            cm(".decision", "Needs a maturity decision", "Loans that have matured or whose extension is undecided — always on top."),
            cm(".chips", "The four tiles", "The totals at a glance; each tile is also a filter."),
            cm(".wall", "Maturity wall", "How much debt comes due each year.")
          ] })
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "read", title: "What’s coming up", intro: "The List view, from the top: the decisions, the four tiles, the maturity wall and every event in date order.",
      before: reset,
      steps: [
        cs({ title: "Needs a maturity decision", text: "A red box on top lists every loan that needs a decision about its maturity: a loan whose status is “Matured” (set by hand, or by itself once the maturity date has passed) or “Extension undecided” (set by hand in the loan’s edit form, Loan Status). It stays here — even after the date has passed — until you change the status (Extended, Paid off…).",
          go: async (h) => { await fscroll(h, ".decision", 12); },
          shot: PANEL,
          marks: [
            cm(".dechead", "Needs a maturity decision (2)", "How many loans wait for a decision."),
            cm(".decrow .decbadge.undecided", "Extension undecided", "The loan’s status: an extension is being discussed and not yet settled."),
            cm(".decrow .decbadge:not(.undecided)", "Matured", "The loan has reached its maturity (or you marked it so) and is not extended or paid off yet."),
            cm(".decrow b", "The loan", "Click the row to open that loan’s page.", { nth: 0 }),
            cm(".decrow .decmeta", "Date · balloon", "Its maturity date and the balloon (what is left to pay then).")
          ] }),
        cs({ title: "The four tiles", text: "Four totals over the loans the filters let through. Click a tile and the list below shows exactly the loans it counts; click it again to show everything.",
          go: async (h) => { await fscroll(h, ".chips", 12); },
          shot: PANEL,
          marks: [
            cm('.chip[data-chip="maturing-all"]', "Debt maturing (shown)", "The balloons of every maturity in the calendar added up, and how many there are."),
            cm('.chip[data-chip="maturing-12"]', "Maturing (next 12 mo)", "Loans whose maturity falls within the next 12 months."),
            cm('.chip[data-chip="reset-12"]', "ARM resets (next 12 mo)", "Adjustable-rate loans whose rate (and payment) changes within 12 months."),
            cm('.chip[data-chip="io-12"]', "IO step-ups (next 12 mo)", "Loans whose interest-only period ends within 12 months — the payment steps up to principal and interest.")
          ] }),
        cs({ title: "Maturity wall", text: "Debt coming due by year: one bar per year, as long as that year’s balloons. This year’s and next year’s bars are red.",
          go: async (h) => { await fscroll(h, ".wall", 40); },
          shot: PANEL,
          marks: [
            cm(".wallrow .wallyear", "The year", "Each year with at least one maturity."),
            cm(".wallrow .wallbar", "A red bar", "Coming due this year or next — the closest refinancings."),
            cm(".wallrow .wallbar", "A green bar", "A later year. The longest bar is the year with the most debt maturing.", { nth: 1 }),
            cm(".wallrow .wallamt", "The amount", "The total of that year’s balloons.")
          ] }),
        cs({ title: "Upcoming events", text: "Every event in date order, grouped by year. A row within the next 12 months has a yellow background; a loan needing a maturity decision has a pink one. Click any row to open that loan.",
          go: async (h) => { await fscroll(h, "table.events", 12); },
          shot: PANEL,
          marks: [
            cm("table.events th", "Date", "The day of the event: the maturity date, the payment date the new rate starts, or the first full payment after interest-only.", { nth: 0 }),
            cm("table.events th", "Event", "Maturity (red), ARM reset (amber) or IO ends (green).", { nth: 1 }),
            cm("table.events th", "Loan", "The loan.", { nth: 2 }),
            cm("table.events th", "Amount", "The balloon for a maturity; the balance at that date for a reset or an IO step-up.", { nth: 3 }),
            cm("table.events th", "Detail", "In words: the balloon due, the new rate and payment, or the new P&I payment.", { nth: 4 }),
            cm("table.events tr.yearrow", "Year", "Where each year’s events start."),
            cm("table.events tr.soon", "Within 12 months", "A yellow row is less than a year away."),
            cm("table.events tr.soon .badge", "The kind of event", "Maturity, ARM reset or IO ends."),
            cm("table.events tr.flagged", "Needs a decision", "A pink row: the loan matured or its extension is undecided — its status is shown next to the event.")
          ] })
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "months", title: "Month by month", intro: "The Calendar view: one box per year; open a year to see its twelve months.",
      before: reset,
      steps: [
        cs({ title: "The Calendar view", text: "Click “Calendar” in the tool bar. The first year with events is open; the others are closed. Each event is a small card in its month, edged in its colour.",
          go: async (h) => { await fclick(h, '[data-view="calendar"]'); await fscroll(h, ".toolbar", 4); },
          shot: PANEL,
          marks: [
            cm('[data-view="list"]', "List", "Back to the list view."),
            cm('[data-view="calendar"]', "Calendar", "This view."),
            cm(".callegend", "The colours", "Red = maturity, amber = ARM reset, green = interest-only ends."),
            cm(".yrhead", "A year", "The year, how many events and how much matures. Click it to close or open its months.", { nth: 0 }),
            cm(".mbox.has", "A month", "The month’s events. An empty month says “—”."),
            cm(".mev", "An event", "The loan, the kind of event and the amount. Point at it to read the detail; click it to open the loan.")
          ] }),
        cs({ title: "Open another year", text: "Click a closed year’s line to open its twelve months; click an open one to close it. Several years can be open at once.",
          go: async (h) => { await fclick(h, ".yrhead", 0); await fclick(h, ".yrhead", 1); await fscroll(h, ".yrhead", 8, 0); },
          shot: PANEL,
          marks: [
            cm(".yrhead", "A closed year", "▸ = closed. Click to open it.", { nth: 0 }),
            cm(".yrhead", "An open year", "▾ = open: its twelve months are below.", { nth: 1 }),
            cm(".mev.flagged", "Needs a decision", "A loan that matured or whose extension is undecided is marked in red (or amber) with a warning line.", { optional: true }),
            cm(".mev", "An event", "Click it to open the loan.", { nth: 0 })
          ] })
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "filter", title: "Narrow it down", intro: "The tool bar’s filters work in both views and on the four tiles. They stay while the tab is open; Clear removes them all.",
      before: reset,
      steps: [
        cs({ title: "Lender", text: "Click “Lender” for the list of every lender in the book. Tick one or more: only their loans are shown, and the button says how many are ticked.",
          go: async (h) => { await fclick(h, "#fLender summary"); },
          shot: PANEL,
          marks: [
            cm("#fLender summary", "Lender", "Opens and closes this list."),
            cm("#fLender .menu", "Every lender", "Tick a lender to show only its loans; tick several to show all of theirs."),
            cm("#fLender .opt input", "A tick box", "On = this lender’s loans are shown.")
          ] }),
        cs({ title: "A lender ticked", text: "With one lender ticked, the tiles, the wall and the list count only that lender’s loans. Untick it (or click Clear) to see everything again.",
          go: async (h) => { await fclick(h, "#fLender .opt input", 0); await fjs(h, (d) => { d.getElementById("fLender").open = false; }); await fscroll(h, null); },
          shot: PANEL,
          marks: [
            cm("#fLender summary", "Lender (1)", "One lender is ticked."),
            cm(".chips", "The tiles", "Now only that lender’s loans."),
            cm(".wall", "The wall", "Only that lender’s maturities.")
          ] }),
        cs({ title: "Loans", text: "Click “Loans” to pick loans by name. Type in the search box to shorten the list, then tick the loans to show.",
          go: async (h) => { await fclick(h, "#clearBtn"); await fclick(h, "#fLoan summary"); await fjs(h, (d) => { const s = d.getElementById("loanSearch"); s.value = "avalon"; s.dispatchEvent(new Event("input", { bubbles: true })); }); await h.wait(300); },
          shot: PANEL,
          marks: [
            cm("#fLoan summary", "Loans", "Opens and closes this list."),
            cm("#loanSearch", "Search loans", "Type part of a name; only the loans that match stay in the list."),
            cm("#loanOpts", "The loans", "Tick a loan to show only it; tick several to show them together.")
          ] }),
        cs({ title: "Amount and Sort", text: "Amount keeps only events between a smallest and a largest amount — type 5m for 5 million or 750k for 750 thousand; leave a box blank for no limit. Sort orders the list by date (grouped by year), or by amount, smallest or largest first.",
          go: async (h) => { await fjs(h, (d) => { d.getElementById("fLoan").open = false; d.getElementById("clearBtn").click(); const m = d.getElementById("amtMin"); m.value = "50m"; m.dispatchEvent(new Event("input", { bubbles: true })); const s = d.getElementById("sortSel"); s.value = "amtDesc"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await h.wait(400); await fscroll(h, ".toolbar", 4); },
          shot: PANEL,
          marks: [
            cm("#amtMin", "Amount — min", "Smallest amount shown (here 50m = $50,000,000)."),
            cm("#amtMax", "Amount — max", "Largest amount shown. Blank = no limit."),
            cm("#sortSel", "Sort", "Date, Smallest amount or Largest amount."),
            cm(".chips", "Counted again", "The tiles, the wall and the list count only the events of $50,000,000 or more. Further down, the list is now largest first and not grouped by year.")
          ] }),
        cs({ title: "The Sort choices", text: "The three ways to order the list.",
          go: async (h) => { await fjs(h, (d) => { const s = d.getElementById("sortSel"); s.size = 3; s.style.cssText = "height:auto;font-size:13px;padding:4px 6px;min-width:170px"; }); await h.wait(200); await fscroll(h, null); },
          shot: PANEL,
          after: async (h) => { await fjs(h, (d) => { const s = d.getElementById("sortSel"); s.size = 0; s.removeAttribute("style"); }); },
          marks: [
            cm("#sortSel option", "Date", "By date, earliest first, grouped by year (the usual order).", { nth: 0 }),
            cm("#sortSel option", "Smallest amount", "Smallest amount first.", { nth: 1 }),
            cm("#sortSel option", "Largest amount", "Largest amount first.", { nth: 2 })
          ] }),
        cs({ title: "Clear and Print", text: "Clear removes every filter (lenders, loans, amounts, search and the tile you clicked); the view and the sort stay. Print opens your computer’s print window with the calendar as you see it now — the tool bar is left off the paper.",
          go: async (h) => { await fclick(h, "#clearBtn"); await fscroll(h, null); },
          shot: PANEL,
          marks: [
            cm("#clearBtn", "Clear", "Removes every filter."),
            cm(".printbtn", "Print", "Prints the calendar (or saves it as a PDF from the print window)."),
            cm("#amtMin", "Back to blank", "No filter is on after Clear."),
            cm("#sortSel", "Sort stays", "Clear doesn’t change the order — set Sort back to Date yourself.")
          ] }),
        cs({ title: "A tile as a filter", text: "Click a tile — here “Maturing (next 12 mo)”. The list switches to just the loans that tile counts, and a line under the tiles says what is shown. Click the tile again, or that line, to show everything.",
          go: async (h) => { await fclick(h, '.chip[data-chip="maturing-12"]'); await fscroll(h, ".chips", 12); },
          shot: PANEL,
          marks: [
            cm('.chip[data-chip="maturing-12"]', "The tile you clicked", "Outlined while it filters the list."),
            cm(".chiphint", "Showing …", "What the list shows now. Click here to show everything again."),
            cm("table.events tbody tr[data-loan]", "Only those loans", "The rows are exactly the ones the tile counts.")
          ] })
      ] },
    // ------------------------------------------------------------------------------------------------------------------
    { id: "goto", title: "Open a loan from an event", intro: "Every event — a row in the list, a card in a month, a line in the decision box — opens its loan.",
      before: reset,
      steps: [
        cs({ title: "Click an event", text: "Click any event.",
          go: async (h) => { await fscroll(h, "table.events", 12); },
          shot: PANEL,
          marks: [
            cm("table.events tr[data-loan]", "An event", "Click it: the app goes to Portfolio, opens this loan and jumps to that payment in its schedule.")
          ] }),
        { title: "The loan, at that payment", text: "The app switches to Portfolio, opens the loan and scrolls its amortization schedule to the payment of the event, lit up for a few seconds. The Calendar tab stays open in the tab strip at the top — click it to go back.",
          go: async (h) => { await fclick(h, "table.events tr[data-loan]"); await h.wait(1100); await h.calm(); },
          wait: 100,
          shot: "view",
          marks: [
            { sel: "text=Amortization Schedule", label: "Amortization Schedule", text: "The loan’s payment schedule, on the loan’s page under Portfolio." },
            { sel: "#scheduleBody tr.ring-2", label: "The payment", text: "The schedule row of the event’s date (“pays MM/DD/YYYY”), lit up for a few seconds — here the final payment, the balloon." }
          ] }
      ] }
  ]
};
