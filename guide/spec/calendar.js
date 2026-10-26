/* Guide chapter: the Maturity & Reset Calendar — reading it (the decisions, the tiles, the wall, the events, month by
   month, opening a loan from an event), narrowing it down, and the reference page for the whole tab.
   The pictures use the app's built-in sample loans; two of them are given a made-up status in setup ("Extension
   undecided", "Matured") so the "Needs a maturity decision" box has something to show. */
"use strict";

// The calendar is a small page of its own inside the tab (an iframe), so a marker can't point into it directly: each
// thing a marker points at gets a see-through box laid over it in the app's own page, made fresh for each picture. A
// step's `crop` is laid the same way, and its picture is that box (a part of the calendar, not the whole tab).
const PANEL = "#calendarPanel";
// fn(d, a) runs on the calendar's own page (d = its document)
const fjs = (h, fn, arg) => h.page.evaluate("(" + fn.toString() + ")(document.getElementById('calendarFrame').contentDocument, " + JSON.stringify(arg == null ? null : arg) + ")");
const fclick = async (h, sel, nth) => { await fjs(h, (d, a) => { const e = d.querySelectorAll(a.s)[a.n]; if (!e) throw new Error("not in the calendar: " + a.s); e.click(); }, { s: sel, n: nth || 0 }); await h.wait(450); };
// scroll the calendar so `sel` sits `gap` pixels below its top (no element = back to the top)
const fscroll = async (h, sel, gap, nth) => { await fjs(h, (d, a) => { const s = d.scrollingElement; if (!a.s){ s.scrollTop = 0; return; } const e = d.querySelectorAll(a.s)[a.n]; if (!e) throw new Error("not in the calendar: " + a.s); s.scrollTop = Math.max(0, s.scrollTop + e.getBoundingClientRect().top - a.g); }, { s: sel, g: gap == null ? 16 : gap, n: nth || 0 }); await h.wait(250); };
const overlay = async (h, marks, crop) => {
  const list = marks.filter(m => m.in).map(m => ({ id: m.id, sel: m.in, nth: m.inNth || 0, pad: 0 }));
  if (crop) list.push({ id: "crop", sel: crop.in, nth: crop.nth || 0, to: crop.to || null, toNth: crop.toNth || 0, pad: crop.pad == null ? 10 : crop.pad });
  await h.js((items) => {
    document.querySelectorAll("[data-gcal]").forEach(e => e.remove());
    const f = document.getElementById("calendarFrame"), d = f && f.contentDocument, host = document.getElementById("calendarPanel");
    if (!d || !host) return;
    host.style.position = "relative";
    const fr = f.getBoundingClientRect(), hr = host.getBoundingClientRect(), ox = fr.left - hr.left + f.clientLeft, oy = fr.top - hr.top + f.clientTop, W = f.clientWidth, H = f.clientHeight;
    items.forEach((it) => {
      const e = d.querySelectorAll(it.sel)[it.nth]; if (!e) return;
      const a = e.getBoundingClientRect(); let r = { left: a.left, top: a.top, right: a.right, bottom: a.bottom };
      if (it.to){ const e2 = d.querySelectorAll(it.to)[it.toNth]; if (e2){ const q = e2.getBoundingClientRect(); r = { left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, q.bottom) }; } }
      const p = it.pad || 0, x1 = Math.max(0, r.left - p), y1 = Math.max(0, r.top - p), x2 = Math.min(W, r.right + p), y2 = Math.min(H, r.bottom + p);
      if (x2 - x1 < 2 || y2 - y1 < 2) return;   // not in sight inside the calendar: no box, so the marker can't be placed
      const b = document.createElement("div"); b.setAttribute("data-gcal", it.id);
      b.style.cssText = "position:absolute;pointer-events:none;left:" + (ox + x1) + "px;top:" + (oy + y1) + "px;width:" + (x2 - x1) + "px;height:" + (y2 - y1) + "px";
      host.appendChild(b);
    });
  }, list);
};
// a marker on something inside the calendar: { in: selector inside it, inNth }
let seq = 0;
const cm = (inSel, label, text, o) => { o = o || {}; const id = "m" + (++seq); return Object.assign({ id: id, in: inSel, inNth: o.nth || 0, sel: '[data-gcal="' + id + '"]', label: label, text: text }, o.optional ? { optional: true } : {}); };
// a step or view whose markers point into the calendar: its boxes are laid after its own `go`; with `crop`
// ({ in, nth, to, toNth, pad }) its picture is just that part of the calendar
const cs = (st) => {
  const o = Object.assign({}, st, { go: async (h) => { if (st.go) await st.go(h); await h.page.mouse.move(1, 450); await h.calm(); await overlay(h, st.marks || [], st.crop); } });
  if (st.crop){ o.shot = '[data-gcal="crop"]'; delete o.crop; }
  return o;
};
const openCal = async (h) => { await h.closeModals(); await h.js(() => { const t = document.querySelector('[data-tabsel^="calendar"]'); if (t) t.click(); }); await h.wait(500); if (!(await h.js(() => { const p = document.getElementById("calendarPanel"); return !!p && !p.hidden; }))) await h.newTab("calendar"); await h.wait(600); await h.calm(); await h.top(); };
// the List view, no filter, sorted by date, at the top
const reset = async (h) => { await openCal(h); await fjs(h, (d) => { d.querySelectorAll("details[open]").forEach(x => { x.open = false; }); const s = d.getElementById("sortSel"); s.size = 0; s.removeAttribute("style"); s.value = "date"; s.dispatchEvent(new Event("change", { bubbles: true })); d.getElementById("clearBtn").click(); d.querySelector('[data-view="list"]').click(); }); await h.wait(400); await fscroll(h, null); };
// set a sample loan's status by hand, the way the operator does: its row's edit button, Loan Status, Save
const setStatus = async (h, re, status) => {
  const id = await h.openLoan(re);
  await h.js((i) => { const b = document.querySelector('[data-loanedit="' + i + '"]'); if (b) b.click(); }, id); await h.wait(900);
  await h.select("#f_loanStatus", status); await h.click("#saveBtn", { wait: 1500 });
};
const closeLender = async (h) => { await fjs(h, (d) => { d.getElementById("fLender").open = false; }); await h.wait(200); };

module.exports = {
  id: "calendar",
  setup: async (h) => {
    await setStatus(h, /K2 Sweetwater \(FIU/, "Extension undecided");
    await setStatus(h, /^Avalon White Plains$/, "Matured");
    await h.home();
    // back to the whole portfolio (opening a loan switched to one property)
    await h.js(() => { const b = document.getElementById("scopePortfolioBtn"); if (b) b.click(); }); await h.wait(500); await h.calm();
  },
  pages: [
    // ==================================================================================================================
    { id: "read-the-calendar", kind: "howto", group: "Tools", title: "Read the maturity calendar",
      description: "See every maturity, rate reset and interest-only change coming up, and open a loan from its event.",
      intro: "The Maturity & Reset Calendar lists every balloon, ARM rate reset and interest-only step-up in the book, as a list or month by month. Use it to see what comes due next, and which loans need a decision about their maturity.",
      sections: [
        { title: "Open the calendar",
          steps: [
            { text: "Click **+** at the end of the tab strip, then **Maturity & Reset Calendar**.",
              go: async (h) => { await h.closeModals(); await h.home(); await h.top(); await h.click("#tabNewBtn", { wait: 400 }); },
              shot: "view",
              marks: [
                { sel: "#tabNewBtn", label: "+", text: "Opens the menu of tools that open in a tab." },
                { sel: '[data-tabopen="calendar"]', label: "Maturity & Reset Calendar", text: "Opens the calendar. If it is already open, it brings its tab forward." }
              ] },
            { text: "The calendar opens in a tab of its own, in the **List** view. It is built from every active loan in the book and redrawn whenever a loan changes.",
              go: async (h) => { await h.click('[data-tabopen="calendar"]', { wait: 1200 }); await reset(h); } }
          ],
          note: "An archived property, and a removed or paid-off loan, are left out of the calendar." },
        { title: "Check what needs a decision",
          steps: [
            cs({ text: "Look at the red **Needs a maturity decision** box at the top. It lists every loan that has matured or whose extension is undecided, with its maturity date and balloon.",
              go: async (h) => { await fscroll(h, ".decision", 12); },
              crop: { in: ".decision", pad: 4 },
              marks: [
                cm(".dechead", "Needs a maturity decision", "How many loans wait for a decision."),
                cm(".decrow", "A loan waiting", "Its status, its maturity date and its balloon. Click the row to open the loan.")
              ] }),
            { text: "Once the loan is settled, change its status in the loan’s edit form (**Extended**, **Paid off**…). The loan leaves the box. See [Mark a loan out of date or change its status](set-loan-status)." }
          ],
          note: "A loan stays in the box, even after its date has passed, until you change its status. **Matured** is set by hand, or by itself once the maturity date has passed; **Extension undecided** is set by hand." },
        { title: "See what comes due",
          steps: [
            cs({ text: "Read the four tiles and the **Maturity wall** under them. The tiles count what falls due in the next 12 months; the wall shows how much debt matures each year.",
              go: async (h) => { await fscroll(h, ".chips", 12); },
              crop: { in: ".chips", to: "#content > section", pad: 4 },
              marks: [
                cm('.chip[data-chip="maturing-12"]', "Maturing (next 12 mo)", "Loans whose maturity falls within the next 12 months."),
                cm('.chip[data-chip="reset-12"]', "ARM resets (next 12 mo)", "Loans whose rate, and payment, change within 12 months."),
                cm('.chip[data-chip="io-12"]', "IO step-ups (next 12 mo)", "Loans whose interest-only period ends within 12 months."),
                cm(".wallrow .wallbar", "A red bar", "Debt maturing this year or next: the closest refinancings.")
              ] }),
            cs({ text: "Scroll down to **Upcoming events**: every event in date order, grouped by year. A yellow row is within the next 12 months; a pink row is a loan that needs a maturity decision.",
              go: async (h) => { await fscroll(h, "table.events", 12); },
              shot: PANEL,
              marks: [
                cm("table.events tr.soon", "Within 12 months", "A yellow row is less than a year away."),
                cm("table.events tr.flagged", "Needs a decision", "A pink row: the loan matured or its extension is undecided.")
              ] })
          ] },
        { title: "See it month by month",
          steps: [
            cs({ text: "Click **Calendar** in the tool bar. Each year is a box; the first year with events is open, showing its twelve months.",
              go: async (h) => { await fclick(h, '[data-view="calendar"]'); await fscroll(h, ".toolbar", 4); },
              shot: PANEL,
              marks: [
                cm('[data-view="calendar"]', "Calendar", "The month-by-month view."),
                cm(".yrhead", "A year", "Click its line to open or close its twelve months.", { nth: 0 }),
                cm(".mev", "An event", "Edged in red for a maturity, amber for an ARM reset, green when interest-only ends.")
              ] }),
            { text: "Click a year’s line to open or close its months. Several years can be open at once." },
            { text: "Point at an event to read its detail. Click **List** to go back to the list." }
          ] },
        { title: "Open a loan from an event",
          steps: [
            { text: "Click any event: a row in the list, a card in a month, or a line in the decision box.",
              go: reset },
            { text: "The app goes to **Portfolio**, opens the loan, and lights up the event’s payment in its **Amortization Schedule** for a few seconds.",
              go: async (h) => { await fscroll(h, "table.events", 12); await fclick(h, "table.events tr[data-loan]"); await h.wait(1100); await h.calm(); },
              wait: 100,
              shot: "view",
              marks: [
                { sel: "text=Amortization Schedule", label: "Amortization Schedule", text: "The loan’s payment schedule, on the loan’s page under Portfolio." },
                { sel: "#scheduleBody tr.ring-2", label: "The payment", text: "The schedule row of the event’s date, lit up for a few seconds. Here an ARM reset: the first payment at the new rate." }
              ] },
            { text: "Click the **Calendar** tab at the top to go back. It stays open, as you left it." }
          ] }
      ],
      next: [
        { page: "filter-the-calendar", text: "Show only some lenders, loans or amounts." },
        { page: "set-loan-status", text: "Settle a loan that needs a maturity decision." },
        { page: "ref-calendar", text: "Every part of the calendar, named." }
      ] },

    // ==================================================================================================================
    { id: "filter-the-calendar", kind: "howto", group: "Tools", title: "Narrow the calendar down",
      description: "Show only some lenders, loans or amounts, sort the list, and print what you see.",
      intro: "The tool bar at the top of the calendar narrows it down. The filters work in both views and on the four tiles, and they stay while the tab is open.",
      prep: reset,
      sections: [
        { title: "Show one lender’s loans",
          steps: [
            { text: "Click **Lender** in the tool bar. It lists every lender in the book." },
            cs({ text: "Tick one or more lenders. Only their loans are shown, and the button says how many are ticked.",
              go: async (h) => { await fclick(h, "#fLender summary"); await fclick(h, "#fLender .opt input", 0); },
              shot: PANEL,
              marks: [
                cm("#fLender summary", "Lender (1)", "One lender is ticked."),
                cm("#fLender .opt input", "A tick box", "On: this lender’s loans are shown.")
              ] }),
            { text: "Click **Lender** again to close the list. The tiles, the wall and the list now count only those lenders’ loans.",
              go: closeLender }
          ] },
        { title: "Pick loans by name",
          prep: reset,
          steps: [
            { text: "Click **Loans** in the tool bar." },
            cs({ text: "Type part of a name in **Search loans**. Only the loans that match stay in the list.",
              go: async (h) => { await fclick(h, "#fLoan summary"); await fjs(h, (d) => { const s = d.getElementById("loanSearch"); s.value = "avalon"; s.dispatchEvent(new Event("input", { bubbles: true })); }); await h.wait(300); },
              shot: PANEL,
              marks: [
                cm("#loanSearch", "Search loans", "Type part of a name."),
                cm("#loanOpts", "The loans", "Tick one to show only it; tick several to show them together.")
              ] }),
            { text: "Tick the loans to show, then click **Loans** again to close the list." }
          ] },
        { title: "Keep only some amounts and sort them",
          prep: reset,
          steps: [
            { text: "Type the smallest amount in the first **Amount** box. Type 5m for 5 million, or 750k for 750 thousand." },
            { text: "Type the largest amount in the second box, or leave it blank for no limit." },
            cs({ text: "Pick an order in **Sort**: **Date** (grouped by year), **Smallest amount** or **Largest amount**.",
              go: async (h) => { await fjs(h, (d) => { const m = d.getElementById("amtMin"); m.value = "50m"; m.dispatchEvent(new Event("input", { bubbles: true })); const s = d.getElementById("sortSel"); s.value = "amtDesc"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await h.wait(400); await fscroll(h, ".toolbar", 4); },
              crop: { in: ".toolbar", to: ".chips", pad: 10 },
              marks: [
                cm("#amtMin", "Amount — min", "Here 50m: only events of $50,000,000 or more."),
                cm("#sortSel", "Sort", "Here **Largest amount**: the list is largest first, and no longer grouped by year."),
                cm(".chips", "Counted again", "The tiles, the wall and the list count only the events that pass.")
              ] })
          ] },
        { title: "Use a tile as a filter",
          prep: reset,
          steps: [
            cs({ text: "Click a tile, for example **Maturing (next 12 mo)**. The list shows only the loans that tile counts, and a line under the tiles says what is shown.",
              go: async (h) => { await fclick(h, '.chip[data-chip="maturing-12"]'); await fscroll(h, ".chips", 12); },
              crop: { in: ".chips", to: ".chiphint", pad: 4 },
              marks: [
                cm('.chip[data-chip="maturing-12"]', "The tile you clicked", "Outlined while it filters the list."),
                cm(".chiphint", "Showing …", "What the list shows now. Click here to show everything again.")
              ] }),
            { text: "Click the tile again, or the line under it, to show everything.",
              go: async (h) => { await fclick(h, ".chiphint"); } }
          ],
          note: "Clicking a tile switches to the **List** view." },
        { title: "Clear the filters and print",
          prep: reset,
          steps: [
            cs({ text: "Click **Clear** to remove every filter: the lenders, the loans, the amounts, the search and the tile you clicked.",
              go: async (h) => { await fscroll(h, null); },
              crop: { in: ".toolbar", pad: 8 },
              marks: [
                cm("#clearBtn", "Clear", "Removes every filter."),
                cm(".printbtn", "Print", "Prints the calendar as you see it now.")
              ] }),
            { text: "Click **Print** to print the calendar, or to save it as a PDF from the print window. The tool bar is left off the paper." }
          ],
          note: "**Clear** doesn’t change the view or the order. Set **Sort** back to **Date** yourself." }
      ],
      next: [
        { page: "read-the-calendar", text: "Read the decisions, the tiles, the wall and the events." },
        { page: "ref-calendar", text: "Every part of the calendar, named." }
      ] },

    // ==================================================================================================================
    { id: "ref-calendar", kind: "reference", group: "Reference", title: "The calendar",
      description: "Every part of the Maturity & Reset Calendar tab: the decision box, the tiles, the maturity wall, the events, the month view and the tool bar.",
      intro: "Each picture names its controls. Point at a number, on the picture or in the list, to find it.",
      prep: reset,
      sections: [
        { title: "The Calendar tab",
          views: [
            cs({ text: "The calendar is built from every active loan in the book (an archived property, a removed or paid-off loan is left out) and is redrawn whenever a loan changes. Your view and filters stay as you left them while the tab is open.",
              go: async (h) => { await reset(h); },
              shot: "view",
              marks: [
                { sel: '[data-tabsel="home"]', label: "Portfolio", text: "Back to the portfolio. The calendar tab stays open." },
                { sel: '[data-tabsel^="calendar"]', label: "Calendar", text: "This tab." },
                { sel: '[data-tabpop^="calendar"]', label: "Pop out", text: "Opens the calendar in a window of its own, handy on a second screen. Clicking an event there still opens the loan here." },
                { sel: '[data-tabclose^="calendar"]', label: "Close tab", text: "Closes the calendar. Nothing is lost: it is rebuilt from the loans next time." },
                cm("header h1", "Maturity & Reset Calendar", "The title, and the day it was built (today)."),
                cm(".toolbar", "The tool bar", "List or Calendar, the filters, Sort, Clear and Print."),
                cm(".decision", "Needs a maturity decision", "Loans that have matured or whose extension is undecided, always on top."),
                cm(".chips", "The four tiles", "The totals at a glance; each tile is also a filter."),
                cm(".wall", "Maturity wall", "How much debt comes due each year.")
              ] })
          ] },
        { title: "Needs a maturity decision",
          views: [
            cs({ text: "A red box on top lists every loan whose status is **Matured** (set by hand, or by itself once the maturity date has passed) or **Extension undecided** (set by hand in the loan’s edit form, **Loan Status**). It stays, even after the date has passed, until you change the status (**Extended**, **Paid off**…).",
              go: async (h) => { await reset(h); await fscroll(h, ".decision", 12); },
              crop: { in: ".decision", pad: 4 },
              marks: [
                cm(".dechead", "Needs a maturity decision (2)", "How many loans wait for a decision."),
                cm(".decrow .decbadge.undecided", "Extension undecided", "An extension is being discussed and not yet settled."),
                cm(".decrow .decbadge:not(.undecided)", "Matured", "The loan has reached its maturity (or you marked it so) and is not extended or paid off yet."),
                cm(".decrow b", "The loan", "Click the row to open that loan’s page.", { nth: 0 }),
                cm(".decrow .decmeta", "Date · balloon", "Its maturity date, and the balloon: what is left to pay then.")
              ] })
          ] },
        { title: "The tiles and the maturity wall",
          views: [
            cs({ title: "The four tiles",
              text: "Four totals over the loans the filters let through. Click a tile to list exactly the loans it counts; click it again to show everything.",
              go: async (h) => { await reset(h); await fscroll(h, ".chips", 12); },
              crop: { in: ".chips", pad: 4 },
              marks: [
                cm('.chip[data-chip="maturing-all"]', "Debt maturing (shown)", "The balloons of every maturity in the calendar added up, and how many there are."),
                cm('.chip[data-chip="maturing-12"]', "Maturing (next 12 mo)", "Loans whose maturity falls within the next 12 months."),
                cm('.chip[data-chip="reset-12"]', "ARM resets (next 12 mo)", "Adjustable-rate loans whose rate (and payment) changes within 12 months."),
                cm('.chip[data-chip="io-12"]', "IO step-ups (next 12 mo)", "Loans whose interest-only period ends within 12 months: the payment steps up to principal and interest.")
              ] }),
            cs({ title: "A tile as a filter",
              text: "A clicked tile filters the list (and switches to the List view).",
              go: async (h) => { await reset(h); await fclick(h, '.chip[data-chip="maturing-12"]'); await fscroll(h, ".chips", 12); },
              shot: PANEL,
              marks: [
                cm('.chip[data-chip="maturing-12"]', "The tile you clicked", "Outlined while it filters the list."),
                cm(".chiphint", "Showing …", "What the list shows now. Click here, or the tile again, to show everything."),
                cm("table.events tbody tr[data-loan]", "Only those loans", "The rows are exactly the ones the tile counts.")
              ] }),
            cs({ title: "Maturity wall",
              text: "Debt coming due by year: one bar per year, as long as that year’s balloons.",
              go: async (h) => { await reset(h); await fscroll(h, "#content > section", 12); },
              crop: { in: "#content > section", pad: 10 },
              marks: [
                cm(".wallrow .wallyear", "The year", "Each year with at least one maturity."),
                cm(".wallrow .wallbar", "A red bar", "Coming due this year or next: the closest refinancings."),
                cm(".wallrow .wallbar", "A green bar", "A later year. The longest bar is the year with the most debt maturing.", { nth: 1 }),
                cm(".wallrow .wallamt", "The amount", "The total of that year’s balloons.")
              ] })
          ] },
        { title: "Upcoming events",
          views: [
            cs({ text: "Every event in date order, grouped by year. Click any row to open that loan at the event’s payment.",
              go: async (h) => { await reset(h); await fscroll(h, "table.events", 12); },
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
                cm("table.events tr.flagged", "Needs a decision", "A pink row: the loan matured or its extension is undecided. Its status is shown next to the event."),
                cm("table.events tbody tr[data-loan]", "An event", "Click it: the app goes to Portfolio, opens this loan and jumps to that payment in its schedule.", { nth: 1 })
              ] })
          ] },
        { title: "The Calendar view",
          views: [
            cs({ text: "Click **Calendar** in the tool bar: one box per year, and the first year with events open. Each event is a small card in its month, edged in its color.",
              go: async (h) => { await reset(h); await fclick(h, '[data-view="calendar"]'); await fscroll(h, ".toolbar", 4); },
              shot: PANEL,
              marks: [
                cm('[data-view="list"]', "List", "Back to the list view."),
                cm('[data-view="calendar"]', "Calendar", "This view."),
                cm(".callegend", "The colors", "Red = maturity, amber = ARM reset, green = interest-only ends."),
                cm(".yrhead", "A year", "The year, how many events and how much matures. Click it to close or open its months.", { nth: 0 }),
                cm(".mbox.has", "A month", "The month’s events. An empty month shows “—”."),
                cm(".mev", "An event", "The loan, the kind of event and the amount. Point at it to read the detail; click it to open the loan.")
              ] }),
            cs({ title: "Open another year",
              text: "Click a closed year’s line to open its twelve months; click an open one to close it. Several years can be open at once.",
              go: async (h) => { await fclick(h, ".yrhead", 0); await fclick(h, ".yrhead", 1); await fscroll(h, ".yrhead", 8, 0); },
              shot: PANEL,
              marks: [
                cm(".yrhead", "A closed year", "▸ = closed. Click to open it.", { nth: 0 }),
                cm(".yrhead", "An open year", "▾ = open: its twelve months are below.", { nth: 1 }),
                cm(".mev.flagged", "Needs a decision", "A loan that matured, or whose extension is undecided, is edged in red (or amber) with a warning line.", { optional: true }),
                cm(".mev", "An event", "Click it to open the loan.", { nth: 0 })
              ] })
          ] },
        { title: "The tool bar",
          views: [
            cs({ title: "Lender",
              text: "Every lender in the book. Tick one or more to show only their loans.",
              go: async (h) => { await reset(h); await fclick(h, "#fLender summary"); },
              shot: PANEL,
              marks: [
                cm("#fLender summary", "Lender", "Opens and closes this list."),
                cm("#fLender .menu", "Every lender", "Tick a lender to show only its loans; tick several to show all of theirs."),
                cm("#fLender .opt input", "A tick box", "On = this lender’s loans are shown.")
              ] }),
            cs({ title: "A lender ticked",
              text: "The tiles, the wall and the list count only that lender’s loans. Untick it, or click **Clear**, to see everything again.",
              go: async (h) => { await fclick(h, "#fLender .opt input", 0); await closeLender(h); await fscroll(h, null); },
              shot: PANEL,
              marks: [
                cm("#fLender summary", "Lender (1)", "One lender is ticked."),
                cm(".chips", "The tiles", "Now only that lender’s loans."),
                cm(".wall", "The wall", "Only that lender’s maturities.")
              ] }),
            cs({ title: "Loans",
              text: "Pick loans by name. Type in the search box to shorten the list, then tick the loans to show.",
              go: async (h) => { await fclick(h, "#clearBtn"); await fclick(h, "#fLoan summary"); await fjs(h, (d) => { const s = d.getElementById("loanSearch"); s.value = "avalon"; s.dispatchEvent(new Event("input", { bubbles: true })); }); await h.wait(300); },
              shot: PANEL,
              marks: [
                cm("#fLoan summary", "Loans", "Opens and closes this list."),
                cm("#loanSearch", "Search loans", "Type part of a name; only the loans that match stay in the list."),
                cm("#loanOpts", "The loans", "Tick a loan to show only it; tick several to show them together.")
              ] }),
            cs({ title: "Amount and Sort",
              text: "**Amount** keeps only the events between a smallest and a largest amount: type 5m for 5 million or 750k for 750 thousand, and leave a box blank for no limit. **Sort** orders the list.",
              go: async (h) => { await fjs(h, (d) => { d.getElementById("fLoan").open = false; d.getElementById("clearBtn").click(); const m = d.getElementById("amtMin"); m.value = "50m"; m.dispatchEvent(new Event("input", { bubbles: true })); const s = d.getElementById("sortSel"); s.value = "amtDesc"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await h.wait(400); await fscroll(h, ".toolbar", 4); },
              shot: PANEL,
              marks: [
                cm("#amtMin", "Amount — min", "The smallest amount shown (here 50m = $50,000,000)."),
                cm("#amtMax", "Amount — max", "The largest amount shown. Blank = no limit."),
                cm("#sortSel", "Sort", "Date, Smallest amount or Largest amount."),
                cm(".chips", "Counted again", "The tiles, the wall and the list count only the events of $50,000,000 or more. Further down, the list is now largest first and not grouped by year.")
              ] }),
            cs({ title: "The Sort choices",
              go: async (h) => { await fjs(h, (d) => { const s = d.getElementById("sortSel"); s.size = 3; s.style.cssText = "height:auto;font-size:13px;padding:4px 6px;min-width:170px"; }); await h.wait(200); await fscroll(h, null); },
              shot: PANEL,
              marks: [
                cm("#sortSel option", "Date", "By date, earliest first, grouped by year (the usual order).", { nth: 0 }),
                cm("#sortSel option", "Smallest amount", "Smallest amount first.", { nth: 1 }),
                cm("#sortSel option", "Largest amount", "Largest amount first.", { nth: 2 })
              ],
              after: async (h) => { await fjs(h, (d) => { const s = d.getElementById("sortSel"); s.size = 0; s.removeAttribute("style"); }); } }),
            cs({ title: "Clear and Print",
              text: "**Clear** removes every filter (lenders, loans, amounts, the search and the tile you clicked); the view and the sort stay. **Print** opens your computer’s print window with the calendar as you see it now, without the tool bar.",
              go: async (h) => { await fclick(h, "#clearBtn"); await fscroll(h, null); },
              shot: PANEL,
              marks: [
                cm("#clearBtn", "Clear", "Removes every filter."),
                cm(".printbtn", "Print", "Prints the calendar, or saves it as a PDF from the print window."),
                cm("#amtMin", "Back to blank", "No filter is on after Clear."),
                cm("#sortSel", "Sort stays", "Clear doesn’t change the order. Set Sort back to Date yourself.")
              ],
              after: reset })
          ] }
      ] }
  ]
};
