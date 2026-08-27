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
