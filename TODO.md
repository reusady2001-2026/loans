# TODO — Loan Debt Service Hub

Deferred / planned work.

_(No open items right now.)_

## Possible future refinement — re-amortize the stated payment at an ARM reset
The `amortType:"Fixed P&I"` loans that also have an ARM reset (Carteret, 1222 Commerce)
**hold** the stated payment across the reset — interest re-prices at the new rate, but the
payment stays put. Their notes technically **re-amortize** the balance over the remaining
term at the then-current reset rate (Carteret 26-yr from 1/1/2031; 1222 Commerce ¶2(D) 26-yr
from 5/1/2031). Because that reset rate is future-UST-dependent (unknowable today), holding is
a defensible approximation and is what both loans currently do; a future refinement could
re-amortize at the projected reset rate instead. The **fixed-period** payment ties to each
note to the cent either way.

## Done
- **Underwriting tab cleaned up + "what to push" made underwriting-aware (v2.7.2).** Five changes
  the operator asked for. (1) **Properties are keyed by NAME first**, address only as a tiebreaker when
  two share a name — a property's name never changes, and real estate can't be lifted off the ground to
  a new address, so the name is the stable identity; the address is normalized ("Rd" = "Road") so a
  cosmetic edit no longer splits a property in two. (2) **The duplicate editable "operating model" card
  and its controllable ("CTL") checkboxes are gone** — it was a second, hand-editable copy of the same
  T12 data the Setup already shows, and the checkboxes drove nothing after the covenant scan was cut.
  Its two view modules (`operating-sheet.js`, `operating-assumptions.js`) and their tests were removed.
  (3) **The underwriting assumptions are editable per property and stored in the property's folder**
  (`assumptions.json`, never in browser storage), shown once, driving the underwritten column live —
  raise the vacancy assumption 5%→6% and the underwritten NOI drops, and the property remembers its own
  assumptions across restarts. (4) **The tab reads top-to-bottom**: choose a property / drop its T12 →
  classified T12 lines + debt sizing + assumptions → portfolio roll-up → what to push. (5) **"What to
  push" is now ranked by each move's effect on the UNDERWRITTEN NOI** — the number the loan is sized on.
  The app's own engine computes, to the cent, how much each move adds by re-running the build with that
  one line perturbed. The key reframing: a move only counts if it BEATS what the underwriting already
  assumes — raising rents and cutting a controllable cost pass straight through; vacancy and the
  management fee are assumption-gated (closing a 6.11%→5% vacancy gap collects cash but the loan already
  credits it — only sub-5% raises the underwritten NOI). Every move shows its annual NOI gain (labeled,
  per property) and the investment/effort; Claude only annotates effort, investment and feasibility — it
  never invents a dollar. Full words throughout; NOI is the only abbreviation. Verified in the real
  Electron app (name-keying + layout + no duplicate card, editable assumptions that move the NOI and
  persist to the folder, engine-computed levers that render before any Claude call, the assumption-gating
  narrative, no covenant talk, and Claude's notes merging in).

- **T12 data lives in the property folder, not the browser (v2.7.1).** Fixes the reported bugs: a
  T12 uploaded for a property is now saved as the ORIGINAL file in that property's on-disk folder
  (`userData/documents/<hash(propKey)>/`, the same per-property store as other documents) and is
  never kept in browser storage. On open the app is a clean slate; selecting a property re-reads and
  re-parses its T12 from disk each time, so the statement NOI is recomputed from the file (Crest now
  reads its real $9,483,604.28, not the frozen below-the-line $5,210,718.69 that had been cached in
  `localStorage`). Old `localStorage` operating keys are purged on upgrade. Both upload paths — the
  underwriting drop and "Read T12 with Claude" — save Excel (.xlsx/.xls/.csv) to the property folder;
  the Claude T12 reader no longer takes only .md/.txt. **"What to push" is now the right question:**
  a per-property analysis by the embedded Claude of which operating levers to lean on (cut vacancy,
  raise rents, reduce a specific cost), grounded in that property's own T12 line items — replacing the
  mechanical DSCR/maturity/refi covenant scan. Verified in the real Electron app (upload→disk, restart
  re-reads from disk, nothing in browser storage; the property's real lines flow to Claude and ranked
  levers render). Removed the now-superseded operating features/tests: the ActionScan module and the
  four e2e suites (glue, operating-sheet, operating-assumptions, portfolio-rollup) that asserted the
  old browser-storage persistence; module unit tests and the new disk-model e2e (t12-disk, push) cover
  the current behaviour. Known limitation: renaming a property's address does not yet move its on-disk
  T12 folder — re-upload the T12 after such a rename.

- **Per-property operating model, portfolio roll-up & action scan (v2.7.0).** Delivers
  SPEC-v2.3.0: each property (a senior and its mezz share ONE record, keyed by the app's
  `propertyKey`) gets a saved operating model — a T12 upload or hand-typed lines, stored as
  YEARLY dollars with a monthly display toggle, driving that property's DSCR, debt yield and
  LTV across the whole app. Eleven dependency-free UMD modules coded to a written contract
  (`OPERATING-CONTRACT.md`): `operating-store` (localStorage `ldsHub.operating.v1`, taxonomy-
  validated codes), `operating-taxonomy` (33 codes incl. `BDX` bad-debt-expense after `GA`),
  `operating-calc` (in-place vs underwritten NOI, per-loan + combined stack), `t12-classify` /
  `t12-parse` / `setup-builder` (classify every line, foot to the printed NOI to the cent, and
  now surface a summary-vs-detail disagreement instead of a false "ties"), `operating-upload`
  (T12 → property), `operating-sheet` (hand-edit, deductions stored negative, all 33 rows with
  per-section fold), `operating-assumptions` (per-property benchmark overrides; taxes/insurance
  default non-controllable but flippable), `portfolio-rollup` (one row per property, DSCR/DY
  over the properties that actually carry the relevant debt), `action-scan` (what to push now:
  DSCR/DY breaches, maturities, refi opportunities on the loan's current rate, non-controllable
  expense shocks). Verified on the real Crest T12 to the cent (in-place NOI $9,483,604.28).
  ~4,000 unit assertions across 12 suites plus 5 Playwright-Electron e2e suites; every aspect
  built, tested, and signed off by an independent adversarial critic (mutation-tested).

- **T12 "statement NOI" read the wrong footing row — fixed (v2.6.5).** On a statement that
  prints BOTH a `NET OPERATING INCOME` row and a below-the-line `NET INCOME` row (after debt
  service / depreciation), the parser's NOI matcher also matched `NET INCOME` and "last wins,"
  so it stored the Net Income as the statement NOI. On the Crest T12 that showed **$5,210,718.69**
  (Net Income, after a $3.99M mortgage + depreciation) as the "statement NOI" instead of the real
  **$9,483,604.28** on row 672 — which mislabeled the caption and *suppressed* the green
  "✓ ties to statement NOI" under the (correct) In-place NOI card. Fix in `t12-parse.js`:
  `RE_NOI` no longer matches plain `NET INCOME` (only `NET OPERATING INCOME` / `NOI`), and the
  parse now **stops at the operating bottom line** so rows below it (mortgage, depreciation, net
  income) are never read as operating income/expense. That also fixed a related artifact — G&A
  showing negative from below-the-line pollution (Crest G&A **−$1,036,708.78 → +$1,015,471.92**).
  The In-place NOI card and loan sizing already used the correct EGI−OpEx figure, so nothing
  downstream changes. Verified on the real Crest T12 (ties to $9,483,604.28) and a synthetic
  statement that prints both a NOI and a Net Income row.
- **Model DROPDOWN discovered from the bundled CLI + relabeled effort (v2.6.4).** The model
  control is now a real **`<select>` dropdown** — no more typing a model name. Its options are
  DISCOVERED at runtime by scanning the exact Claude client the app bundles for the model ids it
  knows, so the list is the current, complete set the subscription's own client supports (it
  grows automatically when a build bundles a newer CLI), presented with friendly labels
  (Opus 5, Opus 4.8, …, Sonnet 5, Sonnet 4.6, Haiku 4.5, Fable 5.1), strongest-first, with
  "Automatic — subscription default" at the top. The extractor folds dated snapshots
  (…-20251101) and `-vN` tails into the marketing version and drops legacy 3.x families, x.0
  aliases, and redundant bare-majors — verified against the real 2.1.263 binary. A static
  fallback covers the rare case the file can't be read. **Effort** keeps the CLI's real,
  discovered levels but relabels them to match Claude Code's own UI: `xhigh` → **"Extra"**,
  `max` → **"Max"** (so the picker reads Low · Medium · High · Extra · Max). Both still go
  straight to the CLI as `--model` / `--effort`; blank model = subscription default (no --model).
  - *Note on "ultracode":* it is a **cloud-hosted multi-agent mode** (the CLI's `ultrareview` /
    ultracode subcommands), NOT an `--effort` value — the headless `claude -p` the assistant
    uses accepts only low/medium/high/xhigh/max (confirmed: `--effort extra` is rejected). So it
    is deliberately not offered as an effort level here; doing so would silently do nothing.
- **Any model + CLI-discovered effort, always the latest CLI (v2.6.3).** (Superseded by v2.6.4's
  dropdown.) The model control was a FREEFORM field with a datalist of suggestions; effort was
  discovered from the bundled CLI's `--help`. Every build bundles the LATEST Claude Code CLI:
  package.json pins `latest` and CI force-installs `@anthropic-ai/claude-code@latest` before
  packaging — so new models/effort levels the subscription exposes arrive with each app release.
- **Model + effort pickers in the chat composer (v2.6.2).** Moved the model selector and effort
  control out of the Connection settings and into the assistant composer, right under the
  property picker — a simple Model dropdown and a compact Effort picker (⚡ Low … 🧠 Max), always
  visible, no settings dive. Still wired straight to the CLI (--model / --effort); the connection
  row is back to just the sign-in status.
- **Real model selector + effort slider (v2.6.1).** Replaced the simplified model radio group
  with a proper **Model dropdown** (Automatic / Fable 5.1 / Opus 5 / Sonnet 5 / Haiku 4.5 /
  Opus 4.8) and a **Faster ↔ Smarter effort slider** (low/medium/high/xhigh/max, default high),
  both passed straight to the bundled Claude client as `--model` and `--effort` — verified
  against the real CLI (each model id resolves; `--effort` accepts low..max). The connection row
  chip shows the active pair (e.g. "Opus 4.8 · max"). ai.js MODELS + EFFORTS + setEffort; the
  API fallback still takes the model (effort is a subscription-CLI feature).
- **Property documents + model picker (v2.6.0).**
  - **Property documents.** Files attached to the assistant used to be read into one message's
    context and thrown away. Now, when a property is focused, the ORIGINAL file is saved under
    that property on disk (`userData/documents/<hash>/`, beside the backups — survives restarts
    and updates), with its extracted text cached for the assistant. Added: a **property picker**
    in the assistant composer (optional — or name the property in chat); attachments are saved
    to the focused property; the assistant is handed that property's saved documents each turn
    (no re-uploading) plus a light index of which properties have files; and a **Documents panel**
    on each loan's detail view to see/open (Save copy)/remove files and add more. Storage IPC in
    main.js (doc-save/list/index/text/read/delete), bridge in preload.js.
  - **Model picker.** The chat now exposes a model choice (Automatic / Haiku / Sonnet / Opus) in
    the assistant settings, applied to the subscription CLI (`--model`) and the API, with the
    ACTIVE model shown as a chip on the connection row (previously you couldn't tell what was
    answering). ai.js MODELS catalog + setModel; status() reports model + models.
  - Also: Stop now cancels robustly even when it races the request's spawn (a pre-cancel set in
    ai.js), since the request now fires after a quick document lookup.
- **Entered NOI was invisible when non-positive (lease-up assets) — fixed.** An approved NOI
  DID persist, but the app conflated "an NOI was entered" with "NOI > 0": every read-site
  (`propertyNOI`, the coverage table's `has`, `openNoiFlow`) gated on `noi > 0`, so a property
  in lease-up with a negative trailing NOI (e.g. Legacy at Kissimmee, −$779,821.44 by the
  trailing-3×4 method) showed nothing and kept prompting "Add NOI" — looking as if the change
  never landed. Now a distinct `noiEntered()` (any sign) drives DISPLAY and prompting, while
  the DSCR/debt-yield/value/LTV math still requires `noi > 0`. Result: the coverage table shows
  the entered NOI (even negative) with a "NOI ≤ 0" flag and "Refi path" (not "Add NOI"), ratios
  read "—" (undefined on non-positive NOI), and the refi NOI pop-up offers keep/change instead
  of forcing re-entry. Also: the assistant snapshot now includes noi/egi/opex/capRate/dscr/
  debtYield, so the assistant can SEE and confirm what it changed (and verify from the snapshot
  rather than claiming blindness).
- **Assistant approve applied to the WRONG loan (or none) — fixed.** The approve handler
  re-resolved the loan by `_id` (`getLoan(l._id)`); in books with missing or duplicated ids
  (older/imported/restored portfolios) `find` returns a different record, so the card said
  "✓ Applied" while the reviewed loan never changed. Now: (1) `load()` heals ids on startup —
  any missing/duplicate `_id` is made unique once, up front (fixes `getLoan` everywhere, not
  just the assistant; a no-op for healthy books); (2) the approve handler mutates the EXACT
  reviewed loan object directly (never re-resolves by id); (3) it **verifies the change landed
  in memory and storage before** ever showing "Applied" — a failed write now says so instead
  of falsely confirming.
- **Assistant context controls — Stop, New chat, Compact.** The chat resends its whole
  running thread each turn, so after many file uploads a new request could exceed the
  120s CLI timeout ("can't digest the new file"). Added: a **Stop** button (the Send
  button becomes Stop mid-request; it truly terminates the CLI/API process via a cancel
  token, and drops the unanswered turn so it doesn't linger in context); **New chat**
  (clears the thread back to the welcome — loans untouched); and **Compact** (summarizes
  the thread into a compact brief and carries only that forward). Big-attachment turns
  also get a longer timeout (240s), with Stop always available to bail. Timeout errors now
  suggest New chat / Compact when the thread has grown long.
- **"Fixed payment" — use the exact P&I written in the note.** `amortType:"Fixed P&I"` +
  `fixedAmortAmount` locks the stated monthly P&I instead of computing a 30/360 annuity, and
  now composes with ARM resets (the reset re-prices interest and holds the stated payment).
  Applied to the two Customers Bank Actual/360 Hybrid ARMs:
  - **The Botanic (Carteret)** — $384,807.04/mo (Note §2(C)); ties to the cent (120 rows).
  - **1222 Commerce St (Manor House)** — $148,062.35/mo (Note ¶2(C)); ties to the cent,
    replacing the prior $146,650.74 30/360 annuity (~$1,411.61/mo low).
  The Fannie loans (Euclid, Florence, Burlington, Crest, Lofts) already tie via a 30/360 annuity.
- **Fixed-loan index cleanup.** The blank-form default (`emptyLoan` seeds `index:"sofr"`) left a
  cosmetic, unused index on Fixed-rate loans with no spread; `migrateLoan` now clears it on load
  (rate untouched — Fixed loans price off `annualRate`). Floating/Hybrid ARM `index+spread` are
  left alone.
- **Backup / Restore (whole portfolio)** — shipped in v1.5.0 (Data menu):
  export the whole portfolio to a single file (native Save), restore from one
  (native Open), for moving between machines, sharing, and archiving.
- **Excel import & export** — shipped in v1.7.0 (Data menu):
  - Export all loans to an Excel workbook (native Save on desktop).
  - Import loans from Excel with a three-gate flow — a field checklist, then an
    editable preview (per-loan add/edit/delete, NEW/UPDATE tags, missing-required
    cells flagged "couldn't find this data", unrecognized columns reported), then
    apply (with an automatic before-import snapshot). Auto-detects loans-as-rows
    vs loans-as-columns.
