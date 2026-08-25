# TODO — Loan Debt Service Hub

Deferred / planned work.

## "Fixed payment" option — use the payment exactly as written in the agreement
Some lenders (e.g. Customers Bank) state a monthly P&I in the note that they sized
on a **true Actual/360** basis, which differs from the 30/360 annuity the app
computes. Add a per-loan option to **lock the P&I to the exact figure written in the
loan agreement** instead of computing it, so those loans tie to their notes to the cent.

**Data to apply when this ships (from validated agreements):**
- **36 Washington Ave (Carteret)** — Customers Bank, fixed-period P&I **$384,807.04/mo**
  (Note §2(C); the app currently computes $381,247.02, ~$3,560/mo lower). The
  reset-period payment (from 1/1/2031) recalculates at the reset rate over a
  **26-year** amortization — so a "fixed payment" must still re-amortize at the reset.
- **1222 Commerce St** — the other Customers Bank Actual/360 Hybrid ARM; likely has a
  stated payment differing from the computed one — verify against its note when available.
- The Fannie loans (Euclid, Florence, Burlington, Crest, Lofts) already tie to the cent
  (they use a 30/360 annuity), so they do not need this.

_Caveat:_ the current `amortType:"Fixed P&I"` mode disables ARM resets, so it can't be
used as-is for a reset loan like Carteret — the feature needs stated-payment + reset together.

## Done
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
