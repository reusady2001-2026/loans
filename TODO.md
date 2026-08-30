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
