# Spec — v2.3.0: Per-Property Operating Model (editable underwriting inputs)

**Status:** draft for review · **Target version:** 2.3.0 · **Held (not shipped)**

## 1. Summary

Turn the single-property underwriting *scratchpad* into a **persistent, per-property operating model**. Every operating income and expense line becomes an explicit, editable input on the property — populated by **uploading** a T12/budget or edited **by hand** — and kept current over time. Once every property carries its own live NOI, the app can (phase 2) scan the whole portfolio and tell you **what needs to be pushed right now**.

Same financial engine we already have — but persisted for every property, and updatable two ways.

---

## 2. Current architecture (what we're changing)

Grounded in the code as it stands:

- **One global scratchpad.** `uwState` is a single object persisted under `UW_KEY` (`index.html`). You drop one property's T12, it builds one Setup and one NOI/Debt-Sizing; loading the next property **overwrites** it. Nothing is stored per property.
- **Global assumptions.** `uwDefaults()` returns `bench`:
  - `vacancyPct: 0.05`, `mgmtPct: 0.025`, `reservePerUnit: 200`, `budget: {}` (per-category $/unit for the underwritten column)
  - `sizing: { capRate: 0.055, ltvMax: 0.75, dscrMin: 1.20, dyMin: 0.07, intRate: 0.055, amortYears: 30 }`

  These are one shared set of defaults, not values on each property.
- **The engine (reused, unchanged):**
  - `t12-parse.js` — parse a T12 workbook/paste into rows + printed totals.
  - `t12-classify.js` — rule-based classifier. **Expense taxonomy already defined:** `RET` (taxes), `INS` (insurance), `UTIL`, `PAY` (payroll), `GA`, `MKT` (marketing), `RM` (repairs), `CS` (contract services), `MGMT` (management), `TRSH`, `CAB`, `PLL`. Income codes: `GPR`, `VAC`, `CONC`, `BD`, `RUBS`, `OTH`, …
  - `setup-builder.js` — builds `{ inPlaceNOI (from printed footing), underwritten (EGI − opex using bench), sizing }`.
  - `underwriting.js` — NOI → DSCR / debt-yield / loan sizing math.

**The gap:** the app can underwrite *one property at a moment*. We need it to hold *every property's operating numbers at once, kept current.*

---

## 3. Target data model

A **per-property operating record, keyed by loan id**, all persisted together in a new store.

**Storage key:** `ldsHub.operating.v1` → `{ [loanId]: OperatingRecord }` (separate store, not nested on the loan, so it versions independently and never risks the loan/amortization data).

```
OperatingRecord = {
  loanId,                     // FK to the loan record
  units,                      // unit count (defaults from the loan/property)
  period,                     // e.g. "T12 ending 2025-06-30" — what the numbers represent
  lines: {                    // one entry per taxonomy code that's present
    <code>: {                 // e.g. RET, INS, UTIL, PAY, RM, CS, MGMT, GA, MKT, TRSH, GPR, VAC, OTH…
      annual,                 // canonical stored value = ANNUAL dollars (display can toggle monthly)
      controllable,           // bool; default from CONTROLLABLE map (RET/INS = false)
      source,                 // 't12' | 'manual' | 'budget'
      updatedAt,              // ISO date of the last change to THIS line
      note                    // optional
    }
  },
  assumptions: {              // per-property, seeded from bench defaults, individually overridable
    vacancyPct, mgmtPct, reservePerUnit,
    sizing: { capRate, ltvMax, dscrMin, dyMin, intRate, amortYears }
  },
  meta: { lastUpdated, sourceFile }
}
```

Derived (never stored, always computed): `EGI`, `opex`, `inPlaceNOI`, `underwrittenNOI`, `DSCR`, `debtYield`.

---

## 4. Fixed taxonomy (the rows of the sheet)

One canonical row order, same for every property (so they're comparable), driven off the existing classifier codes:

**Income:** Gross Potential Rent (`GPR`) → less Vacancy (`VAC`) / Concessions / Bad debt → **plus** Other income (`OTH`, `RUBS`, …) → **= EGI**.

**Expenses (one row each):**
| Row | Code | Controllable (default) |
|---|---|---|
| Real-estate taxes | `RET` | **No** |
| Insurance | `INS` | **No** |
| Utilities | `UTIL` | Yes |
| Repairs & maintenance | `RM` | Yes |
| Contract services | `CS` | Yes |
| Payroll | `PAY` | Yes |
| Management | `MGMT` | Yes |
| General & administrative | `GA` | Yes |
| Marketing | `MKT` | Yes |
| Trash | `TRSH` | Yes |
| (other codes present) | … | Yes |

**= Total opex → NOI = EGI − opex.** Replacement reserve is applied as an underwriting adjustment *below* NOI (consistent with today's model), not as an opex row.

`CONTROLLABLE` default map lives next to the taxonomy; the flag is per-line editable (Azriel's controllable/non-controllable point — taxes & insurance default to non-controllable).

---

## 5. Update path A — Upload

Reuse the existing pipeline; only the destination changes.

1. On a property, "Upload T12 / budget" → `uwHandleFile` → `T12Parse.parseGrid` → classify → `setup-builder` classification (all unchanged).
2. Instead of writing to the global `uwState`, **write the classified category sums into `operating[loanId].lines`** (income + expense codes), stamping `source:'t12'`, `updatedAt`, `period`, `sourceFile`.
3. Show the existing **reconcile/preview** first (which lines filled, classifier confidence, printed-footing NOI vs built-up sum) → user confirms → commit to the record.
4. Re-upload later just refreshes the lines and their `updatedAt`.

## 6. Update path B — Interface

An **editable operating sheet** per property:

- One row per line item (income + each expense code), in the fixed taxonomy order.
- Each expense row: editable value, a monthly/annual display toggle, a **controllable** toggle, a `source` badge (T12 / manual / budget), and the line's **last-updated** date.
- Editing a value writes to `lines[code]` with `source:'manual'`, `updatedAt: today` → **NOI/DSCR recompute live**.
- Assumptions (vacancy, mgmt, reserve, sizing) editable in a small panel, per property, seeded from the global defaults.

Both paths write to the **same** stored record — upload pre-fills, hand-editing tunes.

---

## 7. NOI & underwriting, per property

For each property, computed from its own record:
- **In-place NOI** = EGI − opex (its stored lines). Ties to the T12 printed footing when sourced from one.
- **Underwritten NOI** = applies that property's assumptions (vacancy floor, management %, reserve/unit) — same `setup-builder`/`underwriting.js` math, fed per-property inputs.
- **DSCR** = NOI ÷ annual debt service (from the loan's amortization schedule — already computed).
- **Debt yield** = NOI ÷ current balance.

These now exist for **every** property simultaneously.

---

## 8. UI / placement

- **Underwriting tab becomes per-property:** select a property → its operating sheet + DSCR/debt-yield/sizing. Plus a **portfolio roll-up** table (every property's NOI / DSCR / DY / maturity at a glance).
- **Entry from the loan view:** an "Operating / Underwriting" action opens that property's sheet.
- The old single-scratchpad "quick underwrite" either becomes the per-property sheet or is retired.

---

## 9. Phase 2 — "What needs to be pushed right now" (the payoff)

Once every property has a live NOI, add a **portfolio scan** that flags, per property, a prioritized action list:
- DSCR below `dscrMin` or trending down; debt yield below `dyMin`.
- Maturity within N months (refi runway).
- Refinance opportunity — today's market rate below the note rate (reuse the existing refi-market logic).
- Expense shock — a non-controllable line (taxes/insurance) jumped materially since last period.

Output: a ranked "act now" list. **Specced here, built after phase 1 lands.**

---

## 10. Reuse vs. build-new

**Reuse (no new financial logic):** the taxonomy (`t12-classify`), the T12 parser, the `setup-builder` classification + NOI, the `underwriting.js` DSCR/sizing math.

**Build new:**
1. The per-property store + schema (`ldsHub.operating.v1`) with load/save/migrate.
2. The editable operating-sheet UI (rows, toggles, live recompute).
3. Upload → write-into-property wiring (redirect the existing pipeline's output).
4. Per-property assumptions (replace the single global `bench` with per-property values seeded from defaults).
5. Portfolio roll-up view.
6. (Phase 2) the action-list scan.

---

## 11. Phasing

- **Phase 1 — the operating model:** per-property store + editable sheet + upload-into-property + per-property NOI/DSCR + portfolio roll-up. *This is v2.3.0.*
- **Phase 2 — the action list:** the "what needs to be pushed" scan. *Can be v2.3.x / 2.4.0.*

---

## 12. Open decisions (need your call)

1. **Stored basis:** annual vs monthly. *Rec: store annual, display toggle.*
2. **History:** keep a trend per line (see how taxes moved) or current-value-only for now? *Rec: current value + `updatedAt` now; add history later.*
3. **Store location:** separate `ldsHub.operating.v1` keyed by loanId (rec) vs nested on each loan record.
4. **Controllable flag:** fixed defaults only, or user-editable per line? *Rec: defaults, editable.*
5. **Reserve:** below-NOI adjustment (rec, matches today) vs an opex row.
6. **Mixed-use / multi-loan properties:** one operating sheet per loan, or per physical property when several loans share it (e.g. senior + mezz on Avalon WP)? *Rec: per property, shared across its loans.*

---

## 13. Verification (when built)

- **Round-trip:** upload a known T12 → sheet fills → in-place NOI matches the printed footing to the dollar (existing reconcile harness).
- **Live edit:** change one expense line → NOI, DSCR, debt yield recompute correctly.
- **Isolation:** editing one property never touches another's record; loan/amortization data untouched.
- **Portfolio roll-up:** every property shows a NOI/DSCR; the scan (phase 2) flags the known cases.

---

## 14. Non-goals (for v2.3.0)

- No change to loan records, the amortization engine, or any validated loan data.
- No automatic data feeds — updates are upload or manual only (per the brief: some numbers aren't controllable and are entered as they change).
- Phase-2 action list is specced, not built, in this version.
