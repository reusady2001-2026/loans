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

## Refinance decision rebuild (in progress, 2.8.2 → 2.8.5)
Reworking the refinance calculator into a single, decision-first flow, one version at a time:
- **2.8.2 (done):** collapse the Regular/Advanced toggle into one analysis and the two loan options into one editable suggested loan.
- **2.8.3:** the two-stage verdict — "Can I refinance?" (max supportable loan, all three limits, ≥ payoff) then "Should I refinance?", hiding the proposed loan + schedule unless both are yes.
- **2.8.4:** a Save button that persists the editable underwriting inputs to general-data.json (one save point); Claude's "what to push" saved to the file with two impact figures per move (in-place + underwritten); regenerate on Save-of-changed-inputs / rethink / new T12; property address fed to Claude for location-aware prioritization.
- **2.8.5:** the push moves become checkboxes in the refi that raise both working NOIs and re-drive the two-stage decision live.

## Done
- **The refinance calculator is one analysis + one editable suggested loan (v2.8.2).** Removed the Regular/Advanced
  toggle and the whole "regular" (market-rate-only) path — the analysis that prices off DSCR, debt yield, value and
  leverage is now the only one, unlabeled. Collapsed the Option 1 / Option 2 selector into a single suggested loan,
  every box still editable. The verdict and the amortization schedule are unchanged; this is pure structural
  simplification ahead of the two-stage decision (2.8.3). Verified with a new e2e plus the refi-touching suites.

- **Underwriting input clean-up, folder-first NOI, and the lease-up rule (v2.8.1).** Three things.
  (1) The underwriting inputs stopped nagging and started explaining: the dead duplicate "Property" box is
  gone; the word "optional" is gone from the placeholders; "Rent-roll GPR / yr" is now plain "Gross potential
  rent — per year" with a one-line explainer, and Units carries one too; and a new "Average rent per unit —
  per month" box fills the yearly figure for you (average × units × 12), following the unit count and clearing
  itself if you type a yearly figure by hand. (2) Coverage, DSCR and debt yield now read each property's NOI
  **folder-first** — from general-data.json when it's there, falling back to the in-app value (the live T12
  read, then the hand-entered NOI) when it isn't. Nothing was deleted; the folder is simply preferred. (3) The
  **lease-up rule**: when a property's T12 shows no gross rent in the first OR second month (it was still
  leasing up), the plain 12-month sum understates the run-rate, so the in-place NOI becomes the **last 3 months
  × 4**; if gross rent is present in month 1 or 2 the 12-month sum stands, even if a later month is zero. The
  annualized figure is stored in general-data.json and — because coverage/DSCR/debt yield/refinance read
  folder-first — flows everywhere, with a lease-up banner in the Setup that shows both the annualized working
  NOI and the 12-month statement total. Pure lease-up/merge logic stays in general-data.js with its own unit
  suite; an Electron e2e proves the input clean-up, and a second proves the lease-up path end-to-end against a
  synthetic lease-up statement (statement 1,760,000 → annualized 2,760,000).

- **General Data — a per-property rolling 24-month operating history + a refi NOI-basis switch (v2.8.0).**
  Every property folder now carries a `general-data.json` beside its T12 (same on-disk pattern as
  `assumptions.json`), holding the property's identity, its two NOIs (the in-place T12 NOI and the calculated
  underwritten NOI), and a **rolling monthly history of every operating line**. The T12 parser was taught to
  read each statement's month columns (it already detected them; now it resolves each to a real calendar month
  and emits per-line monthly values), so every upload merges its months in — overlapping months take the newer
  statement, and the most recent **24 months** are kept. Three months after a 12-month T12 you carry 15 months;
  once two years build up you get a clean trailing-12-vs-prior-12 read of how each line moved. The underwriting
  tab shows a compact **General Data** card (both NOIs + each line's trailing-12 and its rise/fall — so "how
  much did taxes go up?" is answered at a glance). The refinance calculator gains a **NOI basis** toggle —
  *In-place T12* vs *Underwritten* — that re-drives DSCR, debt yield, value and leverage off the chosen figure
  (default underwritten, the number a lender sizes to). This is the "under 2.8 you can't refi, at 3.2 you can"
  question made concrete: switch the basis and the coverage moves with it, and the gap between the two is the
  story told to the lender. Pure history/merge logic lives in `general-data.js` with its own unit suite; the
  monthly parse has one too; and an Electron e2e proves the file is written (12 real months off the crest T12),
  the card renders, and the toggle flips the refinance between the in-place and underwritten NOI.

- **The underwriting uses the BETTER of the assumption and what the statement proves (v2.7.7).** For the two
  operating lines the underwritten column prices off an assumption — vacancy and the management fee — the
  engine now underwrites at `min(actual, assumption)` (lower is better for both). So a property running a
  tighter vacancy than assumed (e.g. it runs 1.7% while the assumption is 5%) is CREDITED its proven 1.7% in
  the underwritten NOI, not held to the 5%; a property running worse falls back to the assumption (the
  conservative floor); and a line the statement does not report keeps the assumption (never a phantom 0%).
  Because every underwritten-NOI view (the underwriting tab, the debt sizing, the portfolio roll-up, the
  coverage / debt-yield / loan-to-value figures) runs through the same `setup-builder`, they all pick up the
  rule together. The underwriting tab shows a green note when a figure was credited from the statement, and
  the Claude "what to push" prompt now knows the rule — so it no longer proposes "credit the proven occupancy"
  as a move (the engine already did it); the only vacancy upside it surfaces is pushing occupancy EVEN tighter,
  with the real operational moves in rents and costs. Verified in the real Electron app (raising the assumption
  above the actual plateaus the underwritten NOI at the proven figure; the tab shows the credit) plus the unit
  suites re-derived to the new math.

- **"What to push" is Claude reading the T12 itself — the app stopped pre-chewing the moves (v2.7.5–2.7.6).**
  The earlier design had the app build a hidden MENU of candidate moves (raise rents 2/3/5%, "improve
  occupancy to 4%/3%", cut each cost line 10/20%, …), each with an engine-computed dollar, and told Claude to
  pick and rank from that list. That is how a property running 1.76% vacancy got told to "improve occupancy to
  3%" with a nonsensical "-1.2 percentage point improvement": the APP put that option on the list. Now there is
  no menu — and the app hands Claude ONLY two things: the property's own classified trailing-twelve-month
  statement (income and expense lines with their actual annual dollars) and the underwriting assumptions
  (vacancy, management fee, reserves, cap rate). Nothing else is pre-computed — Claude works out the actual
  vacancy, the underwritten NOI and everything else from those itself. The assumptions are the user's own
  EDITABLE per-property variables (read live from the underwriting tab, never hardcoded): change them and
  re-analyse, and Claude works from the new numbers. The short prompt explains how the assumptions turn the
  statement into the underwritten NOI (the figure the loan is sized on) and asks Claude to find what raises
  that NOI the most — a move is weighed by how much underwritten NOI it adds, not by whether it "beats" an
  assumption — while forbidding moving a figure the wrong way (never "improve" to a worse vacancy than the
  statement already runs). The impact figures are Claude's own estimates, grounded in the statement and
  labelled as estimates. Verified in the real Electron app: the payload is exactly { property, units,
  underwritingAssumptions, t12 }; the assumptions flow through as editable variables; and raising the
  assumption flips Claude from improving occupancy to crediting the proven level.

- **Every loan against a property — senior AND mezzanine — groups into that one property (v2.7.4).** The
  name-first keying (v2.7.2) had a real bug: a property is one physical building, and its senior and mezzanine
  loans belong to it together, but a mezzanine loan carries a different NAME string from its senior on the
  same building ("Avalon WP (Mezz)" vs "Avalon White Plains"; "K2 Sweetwater (Mezz)" vs "K2 Sweetwater (FIU
  Residences)"). Keying purely by name split the mezzanine into its own row, so the underwriting selector
  listed loans rather than properties — and, worse, the senior's combined position, debt service coverage,
  loan-to-value, debt yield and refinance sizing were computed WITHOUT the mezzanine debt. `propertyKey` now
  anchors every loan to the SENIOR sharing its address and keys by that senior's name: the shared address
  proves two loans are the same building, while the name stays the human, stable identity. Senior and
  mezzanine group into one property (named by the senior); a single-loan property keeps its exact key, so no
  uploaded T12 folder is orphaned, and the per-property document folders (keyed the same way) are fixed by the
  same change. In the portfolio this drops two spurious rows — the selector lists 28 properties, "Avalon White
  Plains" and "K2 Sweetwater (FIU Residences)" each carry their 2 loans, and no "(Mezz)" row appears. Verified
  in the real Electron app (property-grouping e2e + the existing suites, all green).

- **"What to push" is Claude's analysis now, and the T12 follows a renamed property (v2.7.3).** Two fixes.
  (1) **The T12 folder follows the loan when its property key changes.** The durable T12 lives in the
  property's on-disk folder keyed by the property key; a name edit (or an address edit on a property with no
  name, or one sharing a name) re-keys the property, and now the whole folder moves with it (new IPC
  `lds:doc-move` + `opMoveDiskDocs`, wired into the loan-save flow). Guarded so nothing is ever lost: it is
  refused, not merged, if the new key already has its own documents, and it stays put when other loans still
  sit at the old key. (2) **"What to push" is produced by Claude, not the app.** The earlier version had the
  app build and rank the list and Claude only annotate — wrong division of labour. Now the app hands Claude a
  MENU of possible moves, each with its exact effect on the underwritten NOI (engine, to the cent) and, for
  assumption-gated moves, the real occupancy/fee swing needed from today's actual; **Claude** chooses which to
  push, picks the target size, and RANKS them by real value weighed against effort — then the app renders
  Claude's list with the engine's dollars. This fixes the vacancy weighting: instead of a flat "one point
  below the assumption = $175,533.63," Claude can pick the deeper target it judges worth pushing (e.g. to 3%
  vacancy, a ~3 percentage point occupancy improvement from the trailing 6.11%, ~$351,067 per year) and weigh
  it as the harder move it is. Claude's analysis runs automatically the moment a property with a T12 is
  focused (cached per session; a "Re-analyse" button refreshes it). Full words throughout; NOI is the only
  abbreviation; every dollar is the engine's, never invented. Verified in the real Electron app (folder-move
  + guards; Claude-first push that auto-runs, picks the deeper occupancy target with the real swing shown, and
  whose shown dollars equal the engine numbers sent).

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
