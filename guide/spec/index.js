/* The Guide (2026-10-26, the operator: "like Anthropic built their docs"): pages in groups on the left, each page a
   how-to (one task — what it's for, what you need first, numbered steps, a picture only where the screen changes,
   numbered markers only where a step needs them, notes and tips, next steps) or a reference page (what every control on
   a screen does). The chapter files (one per area of the app) drive the app and take the pictures; `node
   guide/capture.js` writes guide/guide.json from them. The Overview is written here, with no pictures.

   Words in a text: **bold** for a button or a field's name, [words](page-id) or [words](page-id#section-id) for a link
   to another page. */
"use strict";
const fs = require("fs"), path = require("path");
const ORDER = ["start", "home", "loan", "property", "underwriting", "refinance", "documents", "calendar", "health", "assistant", "settings", "cloud"];
const GROUPS = ["Getting started", "Portfolio", "Loans", "Properties", "Underwriting", "Refinance", "Documents", "Tools", "Assistant", "Settings & data", "Shared database", "Reference"];

const overview = {
  id: "overview", kind: "overview", group: "Getting started", title: "Overview",
  description: "What the app does, and where to start.",
  intro: "Loan Debt Service Hub keeps your whole loan book in one place: every loan with its payment schedule, every property with its T12, rent roll and documents, the underwriting you approve, and the refinance it supports. Your data is saved on this computer, or in the shared database for your whole team. With Claude connected, the app reads each T12 a second time, writes the stories behind the numbers, suggests what to push, and answers your questions.",
  sections: [
    { id: "get-started", title: "Get started",
      steps: [
        { text: "**Look over the portfolio.** The app opens on the **Portfolio** tab: what needs your attention, the totals and every loan. See [Find your way around](get-around)." },
        { text: "**Open a loan** to see its terms, its coverage and every payment. See [Open a loan](open-a-loan)." },
        { text: "**Connect Claude** for the AI features: your Claude subscription, or an API key. See [Connect Claude](connect-claude)." },
        { text: "**Underwrite a property** from its T12, then approve it. See [Upload a T12](upload-a-t12)." }
      ] },
    { id: "what-you-can-do", title: "What you can do",
      cards: [
        { title: "Track every loan", text: "Terms, rate resets, maturities and the full payment schedule, all worked out from the loan’s terms.", page: "open-a-loan" },
        { title: "Underwrite a property", text: "Read its T12, draft a Safe and an Aggressive version account by account, and approve one underwriting.", page: "draft-the-underwriting" },
        { title: "Decide on a refinance", text: "See how much the property supports, at what rate, and whether to refinance or extend with today’s lender.", page: "run-a-refinance" },
        { title: "See what’s coming due", text: "Every maturity, rate reset and interest-only change, as a list or month by month.", page: "read-the-calendar" },
        { title: "Keep each property’s files", text: "T12s, rent rolls and agreements in the property’s own folder. A T12 is checked before anything uses it.", page: "add-a-document" },
        { title: "Ask Claude", text: "Ask about your book, or ask it to do something in the app. Nothing is saved without your approval.", page: "ask-the-assistant" },
        { title: "Work as a team", text: "One shared copy of the data. Every change is saved with who made it, when, and why.", page: "sign-in" },
        { title: "Find what a button does", text: "The reference pages name every control on every screen, with a picture.", page: "ref-main-screen" }
      ] },
    { id: "where-to-go", title: "What do you want to do?",
      table: { head: ["What I want to do", "Go to"], rows: [
        ["See what needs my attention", "check-what-needs-attention"],
        ["Add a loan", "add-a-loan"],
        ["Change a loan’s terms", "edit-a-loan"],
        ["Add a property", "add-a-property"],
        ["Fill in a property’s details", "fill-in-the-profile"],
        ["Underwrite a property from its T12", "upload-a-t12"],
        ["Approve the underwriting", "approve-the-underwriting"],
        ["See how large a loan a property supports", "size-the-debt"],
        ["Decide whether to refinance", "run-a-refinance"],
        ["Extend with today’s lender", "extend-with-your-lender"],
        ["See every maturity and reset", "read-the-calendar"],
        ["Find what’s missing across the book", "fix-data-health"],
        ["Back up or restore everything", "back-up-and-restore"],
        ["Move loans in or out of Excel", "move-loans-with-excel"]
      ] } }
  ],
  next: [
    { page: "get-around", text: "The tabs, the window bar and the switch between the whole portfolio and one property." },
    { page: "add-a-loan", text: "Put a loan in the book, from its terms." },
    { page: "connect-claude", text: "Turn on the AI features." }
  ]
};

module.exports = {
  title: "Loan Debt Service Hub — Guide",
  note: "The pictures come from the app itself, taken with the app’s own sample loans and made-up files (a made-up T12, rent roll and agreement), never your real tenants. Claude’s answers in the pictures are made-up examples.",
  groups: GROUPS,
  pages: [overview],
  chapters: ORDER.filter(id => fs.existsSync(path.join(__dirname, id + ".js"))).map(id => require("./" + id + ".js"))
};
