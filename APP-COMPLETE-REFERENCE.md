# Loan Debt Service Hub — Complete Reference

*Everything this app is, everything it does, how it was built, what stage 2.9.11 still needs checked on a real
Windows install, and what comes next.*

**Current version:** 2.9.11
**Owner:** BSI (`il.co.bsi.loandebtservice`)
**Runs on:** Windows desktop (offline). Used by Azriel's team in the US.
**Repo:** `reusady2001-2026/loans`
**Portfolio today:** 29 properties.

> This is the master overview. It sits alongside the other docs in the repo (`README.md`, `TODO.md`,
> `QUESTIONS-FOR-AZRIEL.md`, `SPEC-v2.3.0-operating-model.md`, `OPERATING-CONTRACT.md`,
> `LOAN-VALIDATION-FLAGS.md`, `DESKTOP.md`, `GRADE-BOARD.md`, `INVOICE-RECONCILIATION.md`) and is meant to be
> the one you read first. 2.9.7 corrected the places where the 2.9.6 version of this document no longer matched
> the app (marked "2.9.7" below); 2.9.8 is the fixes from testing the installed 2.9.7 (marked "2.9.8"); 2.9.9 the
> fixes from testing 2.9.8 (marked "2.9.9"); 2.9.10 the fixes from testing 2.9.9 (marked "2.9.10"); 2.9.11 the
> fixes from testing 2.9.10 (marked "2.9.11").

---

## 1. What this app is

A desktop tool for underwriting and managing a portfolio of commercial real-estate loans. You keep every property
and its loan(s) in one place, drop in the operating statements (T12) and rent rolls, and the app sizes loans,
checks debt coverage, runs refinance analysis, and lets a built-in Claude assistant read the documents and act on
your behalf. It runs **fully offline** — no server, no login, all data lives on the machine — and updates itself
from GitHub Releases.

Two ideas run through the whole app:

1. **The app owns the numbers; Claude owns the judgment.** Every dollar figure comes from one deterministic
   engine. Claude is never asked to invent a number — it reads, ranks, explains, and takes actions, but the math
   is the app's.
2. **One engine, one number.** There is a single metrics path and a version-stamped cache, so the same property
   shows the same number everywhere (the tab, the roll-up, the refinance, the assistant).

---

## 2. How it is built (architecture)

**Type:** Single-page Electron app. The whole UI is one big `index.html` (~12,700 lines, one strict-mode IIFE)
plus plain UMD JavaScript modules loaded with classic `<script>` tags. No bundler, no framework — vanilla JS +
Tailwind (vendored).

**The app's address (2.9.7).** The window loads the app from an internal address, **`lds://app/index.html`**,
served by the main process straight from the app's own files (nothing leaves the computer). Before 2.9.7 it
loaded from a file address, which the second OCR engine (PaddleOCR) could not run under. On the first start of
2.9.7 the settings saved at the old address are copied over once, automatically.

**Process model:**
- `main.js` — the Electron main process: the `lds://` address, window creation, pop-out windows, the
  auto-updater (electron-updater), and all disk/IPC handlers (`lds:*` channels).
- `preload.js` — the `ldsShell` bridge that safely exposes those IPC calls to the page.
- `index.html` — the entire renderer UI and logic.
- `legacy-storage.html` — an empty page used once, at the first 2.9.7 start, to copy the old settings.

**The JavaScript modules (each pure/UMD, unit-tested):**

| File | What it does |
|------|--------------|
| `underwriting.js` | The debt-sizing engine. `sizeLoan(noi, params)` → max loan and the three constraint metrics. |
| `setup-builder.js` | `buildSetup()` — turns a T12 + assumptions into the underwriting "setup" (NOI build-up, per-unit, line pins, benchmarks). |
| `t12-parse.js` | Reads a T12 workbook into structured lines, including per-line **monthly** values (calendar-keyed). |
| `t12-classify.js` | Classifies each account line into a category (income / expense buckets). |
| `t12-check.js` | 2.9.7 — compares the regular reading of a T12 with the AI's reading (the double reading, §4.6). |
| `operating-store.js` / `operating-taxonomy.js` / `operating-calc.js` / `operating-upload.js` | The per-property operating model. |
| `general-data.js` | Monthly series, merges and deltas; the T12 rule (`noiRule`). |
| `portfolio-rollup.js` | Rolls every property up into the portfolio view and totals. |
| `profile.js` | The per-property Profile schema + field history. |
| `rent-roll.js` | Reads a Yardi rent roll → units, occupancy, average rents, square footage. |
| `file-parts.js` | 2.9.9 — a workbook's parts (its sheets, or the properties' sections on a rent-roll sheet), numbered as in Excel, and the answer each property keeps (sheet number + name, section number + name). **2.9.11:** several parts per property (and one part for several properties), T12 sheets added together month by month, a PDF's page ranges. |
| `prop-names.js` | 2.9.9 — matching a name found in a file to a property (its names and Yardi code) — only to pre-fill the parts card. |
| `rate-history.js` | 2.9.7 — built-in rate history: 1-month LIBOR (monthly 1989–2024, daily Dec 2021–Jun 2023), 1-month Term SOFR and 30-day Average SOFR (daily). |
| `ocr.js` | Offline OCR: runs both engines on a page and reconciles them into one reading (pure `reconcile()`). |
| `ai.js` | The Claude connection (the bundled Claude Code CLI, or an Anthropic API key). |

**Vendored, offline assets (`vendor/`):** Tailwind, SheetJS (`xlsx`), `pdf.js`, `mammoth` (Word), **tesseract**
(OCR engine A) and **paddleocr** (OCR engine B + PP-OCRv5 models + ONNX Runtime wasm). The
`@anthropic-ai/claude-code` CLI is bundled so the assistant has current models.

**Build & ship:** `package.json` `files` controls the bundle; electron-builder produces the NSIS installer
(`LoanDebtServiceHub-Setup-<version>.exe`); the GitHub Action builds on a Windows runner and publishes a GitHub
Release with the installer, `.blockmap` and `latest.yml` (what each machine's updater reads). Unsigned app →
Windows SmartScreen shows "More info → Run anyway" the first time.

**The workspace (navigation):** a tabbed workspace. Tabs can be dragged to reorder and popped out into their own
windows (and docked back). **2.9.8:** popping a tab out works like dragging a browser tab out — the tab leaves the
main window, and its window opens on what the tab showed (Underwriting's property, the Calendar's view and
filters); **Dock into main window** puts it back in the same place, showing what the window showed; "+" for a tool
that is out brings its window to the front; closing the window with its X closes the tab. The tab kinds:
- **Home** — the portfolio dashboard, every loan's and property's page, and the refinance screen.
- **Underwriting** — sizing, assumptions, T12, rent roll, "what to push".
- **Calendar** — the Maturity & Reset Calendar.
- **Data Health** — data-quality checks across the portfolio.

**Settings** is a menu (not a tab). **2.9.7 correction:** there is **no Export tab** — exporting is in the
**Data** menu: **"Export all loans to Excel…"** (by design, #87).

---

## 3. Where the data lives (on disk)

Everything is stored on disk under the app's user-data folder; the browser storage keeps only settings.

- **`loans.json`** (2.9.7) — every loan record (moved out of browser storage; copied over on the first 2.9.7 start).
- **One folder per property** (`documents/<sha1(key)[:16]>`), keyed by the property's name (address as
  tiebreaker). **2.9.8:** every property the app shows has one, even with no file, with `profile.json` and
  `general-data.json` ("no T12 yet" until one is added) — checked at every start and after an Excel import. A T12
  workbook's entry records which sheet is that property's. Holding:
  - `profile.json` — the property's details, each with who / when / where-from history;
  - `assumptions.json` — its Underwriting assumptions (and pinned lines);
  - `general-data.json` — the monthly operating series, both NOIs, the T12 double reading, "what to push". **2.9.10:**
    it keeps no copy of the property's name, address or units — those live in `profile.json` only (an old copy is
    dropped the next time the file is saved);
  - `history.json` (2.9.7) — the change history of its assumptions;
  - the T12 file(s), rent rolls and every other document, each with its extracted text and a type.
  - **2.9.10:** the four JSON files above are *the app's own records*. The assistant's file list names them apart
    from your documents, and Claude reads them when you ask it to read all of a property's files, or names one
    (`read_files` / `read_documents`); an ordinary question reads documents only.
- **`chats/`** — the assistant's saved conversations, one folder per property plus one for the portfolio.
- **`backups/`** — automatic snapshots (each says why it was taken) and full backups.
- **`ocr-cache/`** (2.9.7) — pages already read by OCR, by the file's checksum, so a reading continues where it
  stopped. **`reading-queue/`** (2.9.7) — a file added to Documents while it is being read.

A property's files and chats **move with it** when it is renamed or re-addressed; onto a name that already has
files, the app asks first ("Put them together").

---

## 4. Every feature, area by area

### 4.1 Portfolio / Home dashboard
- Lists every **active** loan with its key metrics. One rule decides what is active (2.9.7): archived and
  paid-off loans leave every total, tile and the calendar and are listed under **"Removed & paid-off loans"**
  with **Restore** and **Delete permanently**.
- **KPI tiles are clickable**; the DSCR tile shows its formula. Portfolio **targets** (DSCR 1.25×, LTV 75%, debt
  yield 8%) are set in Settings.
- **Portfolio coverage (2.9.8):** every property that isn't archived counts its NOI — with or without a loan.
  Portfolio DSCR = all NOI ÷ all yearly loan payments; debt yield = all NOI ÷ all debt; LTV = all debt ÷ all
  property values. A property with no loan stays in the Coverage table with its NOI and "no loan". Total debt and
  the weighted-average rate cover loans only. Underwriting's Portfolio roll-up uses the same rule. A sold property
  must be **archived** (not just its loan removed), or its NOI keeps counting.
- **Properties with no loan** are listed with a **"No loan yet"** badge; choosing one opens **its own page**
  (profile, documents, Add the first loan, Open in Underwriting, Archive / Un-archive / Delete permanently).
- Every add, archive, un-archive, delete or rename redraws everything at once (counter, dropdown, Home, the
  open tab).

### 4.2 Property & loan management
- **Add a property** — the same checks for the form and the assistant (2.9.7): an archived property of that name
  → **Restore it** (with its data) or **Start fresh** (the old data deleted for good); a name similar to one you
  have → **Open it** or **Create anyway**; a name that is one of your loans' names → add a loan to that property.
- **Add a loan** — the property name field has a dropdown and pre-fills from context; a loan that is
  interest-only for its whole term may leave amortization blank.
- **Senior + mezz grouped as one property**; the dropdown names the stack from its real loans ("senior + mezz");
  the combined view's Rate Type comes from the real loans.
- **One name, one address per property** (2.9.7): changing them in the profile changes them on all its loans;
  a new address on the senior asks whether the mezz moves too.
- **Remove a loan = archive it** (recoverable). **2.9.8:** the property stays — its NOI still counts in the
  portfolio (with no debt), so removing a loan raises Portfolio DSCR and debt yield and lowers LTV. A loan record is deleted only from "Removed & paid-off loans",
  behind **Delete permanently**.
- **Archive / un-archive** a property. **Delete permanently** only an **archived** property, behind a confirm
  that lists exactly what goes; its files are deleted first, and if one can't be (open in Excel) nothing else is.
- **Duplicates** (Data Health): the full street address + city must match; names are compared only when a
  property has no address; each warning has **"Not a duplicate"**.
- **Loan statuses:** Active, Matured, Extended, Extension undecided, Paid off.

### 4.3 The Property Profile
- The property's own facts: name, address, residential / commercial units, rentable sq ft, year built,
  acquisition date ("When Living acquired it"), manager, data source, Yardi code, notes.
- **NOI (2.9.7, your NOI rule):** **NOI override** — typed by you only; it replaces the T12's NOI everywhere
  (DSCR, debt yield, the roll-up and the refinance); clear it to go back to the T12. For a property with **no
  loan**, **NOI (annual, entered)** — used while there is no T12 (negative allowed).
- Checks: units and sq ft whole numbers ≥ 0, year built 1800 – this year; anything else isn't saved.
- **History (N)** on every field: old → new, when, who ("You" / "Assistant, approved by You") and where from
  (typed, the assistant, a document and page).
- **Reading an agreement** is the assistant's job (the "Read agreement" button stays removed): it proposes the
  loan terms and the property's details in one reply, each line with where it came from (file · page · quote) and
  a tick box, so you approve some lines and reject others (2.9.7, #111).

### 4.4 Underwriting & debt sizing (the engine)
`underwriting.sizeLoan(noi, params)` returns the max supportable loan and all three constraints (DSCR, LTV, debt
yield) with the binding one named; each leg of a senior + mezz shows its own implied DSCR / LTV / debt yield.
**Three sets of limits** (2.9.7): the refinance's "Can you?" is fixed at **1.25× / 75% / 7%**; Underwriting sizing
starts at the same 1.25× / 75% / 7% and can be changed per property; Home's targets are set in Settings.

### 4.5 The operating model & assumptions (2.9.7 corrections)
- **One underwriting case.** *(The Borrower / Lender switch was removed on purpose in 2.9.3 — #103.)*
- **Three assumptions**, each editable per property: **vacancy 5%**, **management 2.5%**, **reserves $200/unit**.
  *(The 1% "bad debt & concessions" assumption was removed on purpose in 2.9.3 — #104.)*
- **Per-unit figures** are shown on residential units; units come from **one number per property** — the
  profile's residential units. *(The per-unit columns on/off toggle was removed on purpose in 2.9.3 — #105.)*
- **Pin a line:** type an underwritten **total** for any line; it is kept with who / when, tagged "edited", with
  a reset back to the computed value. *(Pinning by $/unit was removed on purpose in 2.9.3 — #106.)*
- **Benchmarks are per property**, in Underwriting: **Payroll $1,700/unit** and **Repairs & maintenance
  $600/unit**, each editable for the property. A line more than **±15%** away from its benchmark is flagged with
  the **dollar gap**, and the gaps go to Claude for "what to push". *(The payroll bands with the 200-unit
  threshold, and the contract-services and turnover benchmarks, were removed on purpose in 2.9.3 — #107; the
  benchmarks editor moved from Settings to each property — #112.)*
- **Commercial income** is its own line: NOI is shown in three rows — apartments (all shared expenses, ÷
  apartment units), commercial (commercial rent, no shared expenses, ÷ commercial units) and total.
- *(The GL-mapping editor was removed on purpose in 2.9.3 — #113; there is no re-mapping screen.)*
- Every change to an assumption is kept in its history (old → new, when, who, where from).

### 4.6 T12 (operating statement) handling
- **Drop a T12** in Underwriting (or give it to the assistant) — it is saved to the property folder and read
  from there.
- **The T12 rule (one rule, no manual override — #109):** you upload only T12 files (12 months or more). NOI =
  the last 3 months × 4 when the statement covers fewer than 12 months, or when its first two months have NOI of
  $0 or less (lease-up). A file with more than 12 months uses only its last 12. Otherwise NOI = the 12-month
  total. The same NOI everywhere. *(The annualization override was removed — your rule is fixed.)*
- **The double reading (2.9.7):** every T12 is read by the regular reader and by the AI, automatically; lines
  where they disagree go to **"Needs review"** for you. The AI checks; it never sets a number. **2.9.8:** each
  card starts with the **real Excel row** and the sheet ("Excel row 147 · sheet “T12”"), and the review lists every
  row to check; the Category list has **"+ New category…"** — a name you type becomes your own income or expense
  category for every property and every later review (the AI is told about it too); in Underwriting it is its own
  line at its T12 amount. One you added can be removed while no line uses it.
- **The grey line under the T12 drop (2.9.8)** shows the **NOI used** and how it was worked out ("T3 × 4 · …"),
  not the statement's own 12-month line.
- **A file with several parts (2.9.9)** — a workbook with several sheets (a T12 per property), or a rent roll with
  several properties' sections on one sheet; any Excel file. It never goes anywhere by itself: **one card lists
  every part** ("Sheet 3 of 6 · 12 Month Statement-15169 · The Euclid", "Section 3 of 6 on sheet 1 · The
  Euclid(15169)") with a property list per part — your properties, and **"Add as a new property" last, never set
  for you**. The property you're on is set on its part when the app can tell (your earlier answer for this file or
  last month's, a name or a Yardi code, or the file's only data part); otherwise nothing is set and the card asks.
  Nothing is saved until you approve; then the file goes to each property you picked, and **each property keeps
  its answer in its `general-data.json`** (`fileParts`: the file, its sheets, sheet number X and its name — section
  Y for a rent roll). From then on the app reads **only that part** for that property: its T12, its rent roll, and
  the text Claude gets. A file with several parts and no answer is **never guessed** — the property waits ("Which
  part is this property's? **Answer**" in Documents, Underwriting, the rent-roll summary and Data Health), and its
  numbers aren't used meanwhile. A file saved before 2.9.9 whose part names the property is used and listed to
  confirm once. A file you keep "as a document" is never read as the T12.
  **2.9.11 — full freedom:** any part can go to any property. **Several parts can go to one property** (a property in
  phases — "Heritage Key Villas Phase 1 … 4") and they are **combined**: a rent roll unit by unit (units, occupied,
  average rents, rent a year and sq ft are the whole property's — the file's own totals), T12 sheets line by line,
  month by month (Underwriting says "… (combined) — added together"; sheets covering different months are flagged).
  **One part can go to several properties** ("+ another property" on its row). Picking a property on one row no
  longer clears the others; parts whose names start with the property's name are all set to it; each property records
  every part (`fileParts[].items`), and next month's file comes back with all of them set. **PDFs too:** Documents →
  **"Pages & properties"** splits a PDF by page ranges (several loan agreements in one file) or links one range to
  several properties (one agreement over several properties); Claude can propose the ranges (`split_document`) on the
  same card. Each property then reads only its own pages. *(One loan secured by several properties — a pooled loan —
  is its own later stage.)*
  **Results tied to the exact parts (2.9.11):** the T12 AI check (and your decisions on it) and "what to push" count
  only for the same file **and the same part(s)** they were made on. One made on another property's sheet of the
  same workbook (40 N Euclid's check was made on Forest Park's sheet in 2.9.8) is dropped and redone; a combined
  statement's review cards show no Excel row (the lines are added from several sheets).
- A **tie check** badge shows whether the statement's own totals tie to its lines; an older-year T12 goes to the
  history instead of replacing the current one.

### 4.7 General data / history
- Monthly series per line, merged across statements, with how each line moved (vs the prior year).

### 4.8 Refinance analysis
- **A refinance is always of the property** — all its loans together (senior + mezz), against their combined
  payoff (2.9.7).
- **Can you?** — the property must support a new loan at least as big as what you owe (1.25× / 75% / 7%).
- **Should you? (your stage-2 rule, 2.9.7)** — checked in order: (1) can't support what you owe → Don't
  refinance; (2) today's loan ends within 12 months → Refinance; (3) the lower rate pays for the early-payoff
  penalty → Refinance; (4) lower rate but it doesn't pay the penalty, and the extra cash is more than 20% of what
  you owe → **your decision** ("Refinance now — with $X cash" or "Wait until [maturity]"); (5) anything else →
  Don't refinance. In the decision case the amount can't be lowered below that 20%.
- The proposed rate: Fixed / Floating / **Hybrid** — a hybrid shows both periods (the fixed period over the
  matching Treasury, then today's index + margin "if the index stays at today's level"); spreads start at 0.
- The NOI the refinance is sized on: **In-place T12 NOI**, **Underwritten NOI**, or the **entered** NOI (your
  override, when you set one).
- **Save as a loan** replaces all the property's loans: the old ones become **Paid off (refinanced)**, dated, in
  their history.

### 4.9 "What to push" — Claude's operational analysis
Claude reads the T12 and ranks what to push, framed as gain vs investment, over the app's numbers. It runs only
when the T12 or the assumptions changed, or when you click **Re-analyse**; otherwise the last result, saved
with the property, is shown.

### 4.10 Rent roll & unit statistics
- Read a **Yardi rent roll** → each property's units, occupancy, average market / in-place rent, square footage.
- **Gross potential rent fills in automatically** (2.9.4; formula 2.9.7, #17): the average market rent of the
  **occupied** units × **all** units × 12. *(There is no "Use these" button — #110.)* **2.9.8:** the average rent
  and gross potential rent belong to **each property** — opening another property in Underwriting shows its own
  (a rent you typed for it, else its own rent roll, else empty), never the last property's; its saved underwritten
  NOI uses its own rent whether it is open or not. The first start of 2.9.8 recomputes every property's figures,
  which repairs any saved with another property's rent.
- Content-based file routing: a dropped file goes to the property (or properties) its content names; a name
  that fits two properties is asked about, never guessed.

### 4.11 Maturity & Reset Calendar
- Maturities and rate resets; tiles are clickable and highlight matured / extension-undecided loans.
- **Rates (2.9.7):** each month's rate says where it comes from. Live rates show their fetch time; offline the
  app shows the **last saved** rate with its date; built-in rates are used only if it has never fetched any.
  Indexes include **30-day Average SOFR** and **1-month Term SOFR**, set **2 business days before the 1st**.
  A loan that started on LIBOR (K2) uses the built-in LIBOR history up to its switch date (field "On 1-Month LIBOR
  Until").
- **2.9.9:** **Fetch live rate** (title bar) also opens a list of every rate the app holds — its value, where it
  comes from, and which of your loans use it ("Other / Custom" reads "each loan's own value"). Refinance's Index
  list has **SOFR 30-day Average** and **1-month Term SOFR** next to overnight SOFR, each priced from its own rate.
- **2.9.11 — "What to push" uses the app's own NOI:** it is given the app's in-place and underwritten NOI (and each
  line's two amounts) and measures every move from them — one underwritten NOI everywhere, never a second one worked
  out by Claude (the operator's decision; still no ready-made list of moves). It keeps no copy of the address.
- **2.9.10:** both of Refinance's Index lists (Floating, and Hybrid's "matches the fixed period") hold **every rate
  the app fetches** — US Prime Rate, Fed Funds (EFFR), the three SOFRs and the 1- to 20-year Treasuries (12) — taken
  from the app's own list of rates, so a rate added later shows there by itself. "Other / Custom" isn't a fetched
  rate and stays out.

### 4.12 Data Health page
Properties, T12s, units known, loans needing a maturity decision; duplicates (by address); folders with no
property (attach or delete); **Recompute all figures**; **Check all T12s with AI**. **2.9.8:** "Properties
without a folder" — must always read 0.

### 4.13 Documents
- Add files from a property's page (**Add files**, or drop them on the Documents panel) — any size, no limit
  (2.9.7). A type is detected or chosen (T12, rent roll, loan agreement, …) and can be changed; the app's own
  records are not listed; every removal asks first.
- **Where a file goes (2.9.8):** by its content, to every property it names; **the property you dropped it on (or
  the chat's property) always gets it too**. **2.9.9:** a file with several parts goes through the parts card
  (§4.6) — in Documents, Underwriting, the rent-roll importer and the assistant. The same file already in another folder never blocks a save. A loan
  agreement is recognised from its words ("Loan agreement", not "Other"); a type you pick still wins. Each file
  shows how it was read under its name ("40 pages · read by OCR — may contain errors").
- **Reading a file (2.9.7):** a small panel shows the progress ("reading scanned page 3 of 40") with **Stop**;
  the message afterwards says what was read ("40 pages · read by OCR — may contain errors · 2 pages couldn't be
  read (pages 7, 12)"). A file being read when the app closes is finished at the next start.

### 4.14 The AI assistant (Claude, in the app)
**Your rules:** the assistant does everything a user can do; every change it makes is approved by you inside the
chat; it works in the background and opens a screen only when you ask; it reads everything and checks its own
work, and it treats old chat memory as something to weigh, not trust.

**How it works (2.9.7):**
- A reply may hold several actions; they run in order, each change waits for its **Approve card**, and the result
  of every action (approved and done / cancelled / failed) goes back to Claude, which keeps going until the
  request is finished (at most 8 steps) and then reports what it did. When a request isn't one action, Claude does
  it as a combination of actions; if no combination does exactly what was asked, it says so before doing anything
  and offers the closest option.
- An action that doesn't exist says "Nothing was done — the assistant can't …"; Claude's own "Done" next to it
  gets a grey **"(this did not happen)"**.
- Cards: before → after, a tick box on each line, where each figure came from; **Stop** cancels a card still
  waiting. Every card and its outcome are saved in the chat; a reopened chat shows them read-only.
- **Your NOI rule:** an NOI from a T12 (or your own override) is never changed by the assistant, in any route.
- Loan changes use the loan form's checks; profile changes the profile's checks; an unusual cap rate (outside
  3–12%) is flagged.

**Files with several parts in a chat (2.9.9):** attaching one, importing a rent roll (`import_rent_roll`, which
can name this property's section), saving, copying or moving one goes through the parts card in the chat; in a
property chat **only that property's part is ticked** — other parts are linked only if you tick them. Before Claude
reads a saved file with no answer, the card comes first. Results say exactly what happened ("Created a new
property: …").
**Reading only what's needed (2.9.9):** when a message's files are long, one quick call decides which of them it
needs (none for an instruction, or when the chat's notes already answer); only those are read, in parts, and the
reading **stops at the part that answers it** — unless you ask to read all the files. The chat says which files
were read and which weren't; Claude can read a skipped one (`read_files`). **2.9.10:** "read all the files" also
reads the property's own records (profile, general data, assumptions, history). **2.9.11:** a file you **name**
("What does profile.json say?") is always read before Claude answers — once, from what it says now, never from old
notes or a recalled chat; profile.json comes with **what the Profile tab shows** (a field the file leaves empty is
filled from the senior loan's record, with where each value comes from). New actions: `check_t12` (re-run the AI
check of a property's own sheets) and `split_document` (propose a PDF's page ranges); `import_rent_roll` takes
`sections` (several). **Memory recall** brings in a past chat
only when its title shares a word with the question, or one of its messages has two of the question's words close
together.
**The property selector (2.9.8):** a chat belongs to one property or is a general chat, for good. Picking another
property in a chat that has started opens a new chat (the old one stays saved under its property); naming a
property in a general chat doesn't change the selector or where the chat is saved (Claude still gets that
property's data); closing and reopening brings back the same chat with the same selector; the page on screen only
picks the property of a brand-new chat. The list follows every add, rename, archive or delete at once; the
assistant can't move the selector itself.

**Reading actions** (no card): `list_properties`, `read_property`, `read_rates`, `read_documents` (a long document
part by part), `read_data_health`, `read_settings`, `list_backups`.

**Screens** (only when you ask; each brings its tab to the front): `open_loan`, `open_property`,
`show_portfolio`, `open_calendar`, `open_underwriting`, `open_data_health`, `open_settings`, `open_export`,
`open_documents_folder`.

**Changes** (each behind an Approve card): `propose_loan_change`, `propose_new_loan` (missing required fields are
asked for first; the form opens only on request), `propose_profile_change`, `set_property_noi`,
`edit_assumptions` (incl. cap rate and sizing limits), `pin_underwriting_line`, `set_average_rent`,
`save_property_record`, `create_property`, `archive_property`, `unarchive_property`,
`delete_property_permanently`, `remove_loan` (archives), `restore_loan`, `delete_loan_permanently`,
`set_loan_status`, `remove_document`, `set_document_type`, `import_rent_roll`, `import_excel` ("N new, M
updated"), `start_refinance` (and save it), `set_refi_noi_basis`, `add_refi_lever`, `toggle_refi_move`,
`set_refi_terms` (amount, term, amortization, IO, rate type, index, spread), `recompute_all`, `backup_now`,
`restore_backup` (says plainly what is replaced for good); **2.9.8:** `save_attachment` (a file attached in the chat,
to the properties named — or every property its content names), `copy_document`, `move_document` (a saved
document between properties; a T12 workbook goes with each property's own sheet). Other: `run_push` (needs a T12), `fetch_live_rate`,
`export_schedule_csv`.

**Files in the chat:** PDF, Word, Excel, text and pictures (JPG / PNG). A file attached once is sent with every
later message of that chat. When everything is more than Claude can read in one message, **Claude reads it in
parts** — "This file is long — Claude is reading it in N parts." — keeping notes with exact figures and their
pages, then answers from the notes; only the notes and the answer stay in the chat, and a follow-up question
reads the file in parts again.

**Chats:** saved per property and for the portfolio; the History list shows **all** chats grouped by property
(this property first) with a "This property / All" filter; search covers everything; rename / pin / delete. The
title is the question as typed. **Compact** shrinks only what is sent — the saved chat keeps everything, with a
"— compacted here —" marker. **Memory recall** matches whole words, needs at least 2 words in common, and says who
said it. Errors are in plain words with the next step; when the Claude sign-in has expired and an API key is
saved, the key is used.

### 4.15 Reading scanned documents (OCR)
- **Per page:** a page with real text keeps its line breaks; a page that is mostly a picture is read by OCR — even
  when it carries a short real line (an e-signature stamp, a fax header), and both are kept (2.9.7).
- **Both engines run** (2.9.7): **tesseract.js** and **PaddleOCR** (PP-OCRv5) read each scanned page; their
  readings are reconciled — lines both agree on kept once, a line only one caught kept, and where they disagree on
  a number it is flagged inline (`[OCR: engines differ here — also read: "…"]`). If PaddleOCR can't start on a
  machine, OCR continues on tesseract alone.
- **Marking (2.9.7):** every page is marked; a scanned one "[page 3 · read by OCR — may contain errors]"; a page
  that couldn't be read is said. The file's label says it too ("40 pages · read by OCR — may contain errors",
  "pages 4–9 read by OCR", "2 pages couldn't be read (pages 7, 12)"). Claude adds "(from page 3, read from a scan
  — may contain errors; please check against the original)" to anything it takes from a scanned page, and never
  answers as if it read a missing page.
- **When OCR starts**, the assistant says: *"Reading the file now — it's a scanned document, so I'm running OCR.
  This will take a couple of minutes; please wait."* (your wording, kept — #99).
- **Pictures:** JPG / PNG files are read by OCR, and so are the pictures inside a Word file (in their place).
- **In the background (2.9.8):** reading goes on while the app is behind another window (pages are drawn without
  waiting for the screen, and Windows can't slow the app down while it's hidden).
- **Progress, Stop, resume:** page-by-page progress on the file; **Stop** stops between pages; pages already read
  are kept, so reading the same file again continues where it stopped.
- **Read once:** a file read in the chat is not read again when it is saved to the property.
- **No size limit, nothing cut** (2.9.7): any file size; a big file is copied straight from disk; nothing is cut
  at 400,000 or 300,000 characters (long material is read in parts, §4.14).

### 4.16 Settings, Data menu & backups
- **Settings (menu):** the app scale, the Claude connection, the property count + every property name, and the
  portfolio targets (Home). *(No benchmarks editor — benchmarks are per property in Underwriting, #112; no GL-mapping editor,
  #113.)*
- **Data menu:** **Back up to a file…** (one file holds the loans, every property folder, every chat and the
  settings), **Restore from a file…**, the recent automatic backups (each says why it was taken — **2.9.8:** a routine one says *what* changed, e.g.
"After: Queens Gate Apartments: Loan Status Active → Extended"), **Export all
  loans to Excel…**, **Import loans from Excel…** (matched by the app's own Loan ID, then loan number, then name + address; "N
  new, M updated, U unchanged").
- A restore replaces everything, after saving a safety snapshot of the current data first.

---

## 5. Conventions & guardrails

- **Offline only** — no server, no login (today), all data on the machine.
- **No fabricated numbers** — Claude never invents a figure; the engine is the only source.
- **Single metrics path + version-stamped cache** — one number everywhere.
- **Every change has a history** — old → new, when, who, where from; nothing is dropped (reasons wait for the
  shared-database audit trail).
- **A feature that follows your rule is not a failure**, even if another approach looks better.

## 6. Testing

- **19 unit-test files** (pure modules) — `npm test`.
- **73 end-to-end tests** (Electron under a virtual display — real page, real flows; Claude is a scripted
  stand-in, never a real model) — `npm run test:e2e`.
- CI runs the unit tests before every build.

---

## 7. How the app was built — stage by stage

- **2.7.1 – 2.7.3** — T12s per property on disk; per-property assumptions; folder follows a renamed loan.
- **2.8.0 – 2.8.8** — monthly T12 values and General Data; refinance NOI basis; one refinance analysis with one
  editable loan; honest proposed rate; combined senior + mezz; two-stage verdict; saved "what to push".
- **2.9.0 / 2.9.0.1** — single metrics path + version-stamped cache; Data Health; statuses; 27 properties.
- **2.9.1** — the Property Profile; archive; typed documents.
- **2.9.2 / 2.9.3** — per-unit underwriting; rent roll & unit statistics; content-based routing; 2.9.3 removed the
  Borrower/Lender switch, bad debt & concessions, the per-unit toggle, $/unit pins, payroll bands and the
  GL-mapping editor (see §4.5).
- **2.9.4** — an AI assistant that acts (the action registry); automatic rent fill.
- **2.9.5** — chat persistence + history; memory recall.
- **2.9.6** — acceptance fixes; the OCR reader.
- **2.9.7** — every decision from the 2.9.6 audit.
- **2.9.8** — the fixes from testing the installed 2.9.7.
- **2.9.9** — the fixes from testing the installed 2.9.8.
- **2.9.10** — the fixes from testing the installed 2.9.9.
- **2.9.11** — *(this stage)* the fixes from testing the installed 2.9.10 (see §8).

---

## 8. Stage 2.9.11 — what shipped, and what still needs checking

**What shipped** — from testing the installed 2.9.10 (check list Part 4) and the Heritage Key Villas rent roll:
1. **Full freedom over a file's parts** — any part (a sheet, a rent-roll section, a PDF's page range) can go to any
   property; several parts to one property are combined (a rent roll unit by unit — Heritage Key Villas' four
   phases are one property of 521 units, 491 occupied; T12 sheets line by line, month by month); one part can go to
   several properties. For the user (Documents, Underwriting, the rent-roll importer, Data Health) and the assistant.
2. **PDFs** — a PDF split by page ranges (several agreements in one file) or linked to several properties (one
   agreement over several properties); each property reads only its pages. The pooled loan itself is a later stage.
3. **Results tied to the exact parts** — the T12 AI check, its decisions and "what to push" count only for the same
   file and the same parts; 40 N Euclid's (made on Forest Park's sheet in 2.9.8) are dropped and redone. New
   assistant action `check_t12`.
4. **The assistant and the records** — a file you name is read before the answer; profile.json comes with what the
   Profile tab shows; "what to push" keeps no address copy.
5. **One underwritten NOI** — "what to push" measures every move from the app's own NOI.

The 2.9.10 stage is in the git history and its pull request.

**Check on the real installed 2.9.11 (Windows)** — Part 5 of the check list.

**Open question (for Azriel):** **K2's LIBOR switch date** — the day its loan moved from 1-month LIBOR to its
current index. The field exists ("On 1-Month LIBOR Until"); K2's past months need that date.

---

## 9. What's next (planned stages)

### 2.9.12 — One shared database (+ the pooled loan, moved here from 2.9.7)
- **One shared database** so the team works off the same data: sign-in and users, per-group data separation,
  a daily backup, every edit stamped (who / when) as an audit trail — with reasons —, the last-opened state saved,
  and the user's local files untouched. Open decision (Azriel): managed hosting vs self-hosted, and where it is
  hosted (see `QUESTIONS-FOR-AZRIEL.md`).
- **Pooled / cross-collateralized loans** — one loan secured by several properties (one balance, one payment),
  analyzed as one credit position: combined coverage, combined sizing, release / substitution across the pool. Its
  documents can already be linked to all its properties (2.9.11); the loan itself is this stage.

### 2.9.13 — Automated Yardi ingestion
Pull operating data and rent rolls from Yardi directly instead of manual file drops.

---

## 10. Known caveats

- **PaddleOCR on Windows** — both engines run in the build environment under the new `lds://app/` address; the
  installed Windows app is the final check. If it can't start there, OCR runs on tesseract alone and nothing
  breaks.
- **Installer size** — ~260 MB because of the two vendored OCR engines and their models; auto-update downloads
  mostly the changed blocks.
- **No signing** — Windows SmartScreen shows a one-time "More info → Run anyway".
- **Single-user, offline today** — multi-user, groups and the audit trail are the shared-database stage.

---

*Last updated for version 2.9.11.*
