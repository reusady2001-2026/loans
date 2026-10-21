# Next stage — the pro forma, lender scenarios and expense benchmarks: the plan

*Written 2026-10-14 from the recording of the meeting with Azriel on 2026-10-13 ("Follow up", 56 minutes), and
from a read of the app's code as it is after 3.0.0. Status: **F1 (2026-10-14) and F4 (2026-10-15) are built as a draft
on the development branch for the operator to see and test — not shipped, no version, no release** (what they do:
reference §9, "F1 — the pro forma" and "F4 — lender scenarios"). **F1 round 1 (2026-10-19)**, after the operator saw the
screens: every change is made to one account with its own story (no new total for a whole line), the panel is about
80% of the window with every account's 12 months, the management fee never follows the revenue credit by itself, the
underwriting assumptions give default stories and "What to push" suggests stories. Then (same day): no "Take it out" (a
new amount of $0 does it), "Annualize" an account from its last 3, 6 or 12 months (and a 12-month revenue credit), and
the in-app **Guide** (Settings → Guide; reference §4.16). **Round 2 (2026-10-21, built as a draft):** the underwriting
IS the approved pro forma (Safe and Aggressive, reserves a line in both); "What to push" runs on the approved
underwriting and only raises the NOI, never on a story's lever, with an effect on in-place, Safe and Aggressive; the
refinance is sized on In-place T12, Safe or Aggressive per property (no T12 → no refinance), with the pushes ticked per
property and the amount to cover (today · no penalty · at maturity); the Guide is one scroll page per chapter
(reference §9, "Round 2"). F2 is not built (it needs Azriel's benchmarks). The
lender presets ship empty until Azriel's numbers come. The version number of each part, and raising the shared
database's setup version for the presets rule (D13), are the operator's to choose (version rule, reference §8).*

Three features, in the order to build them: **F1 the pro forma**, **F4 lender scenarios**, **F2 expense
benchmarks**. (The names keep the first plan's numbers.)

---

## 0. What 3.0.0 already did from the same meeting

| Meeting | Asked | In 3.0.0 |
|---|---|---|
| 6:20 | Analyze Burlington, Florence, Independence, Whitewater I + II and Weaver Mill as one portfolio | Create a portfolio… |
| 6:33 | Call it "Create a portfolio" | Renamed |
| 7:17–9:37 | The portfolio's NOI came out wrong; properties without a T12 counted as $0 | Every property's NOI and its source; none counted as $0 |
| 10:36–10:40 | Which rate is it using? The market rate, not today's loans' | "Today's loan rate" vs "Proposed loan rate"; sized on the proposed rate only |
| 16:51–17:06 | 5.24% is too low, that's the 10-year Treasury | A starting spread, never 0 |
| 16:11 | How do I see the backup for "supports $202 million"? | How "supports $X" is worked out |
| 19:21–20:05, 31:59 | 1.25× is one lender; every lender is different; 1.11× amortizing / 1.35× interest-only | Limits per refinance, interest-only coverage |
| 11:52–12:33 | Check yield maintenance with Chatham | Checked on cf.com, 3 real loans (§8) |
| 15:05–15:21 | Terrazul Sweetwater was refinanced; new documents to come | "Out of date…" on a loan |

## 1. How the three fit together

```
T12 file ─► the reading (2.9.16/2.9.17): every account, its Underwriting line, 12 months
              │
              ├─► Underwriting:  In-place (T12)   Underwritten (assumptions)   ◄── F2 flags each expense line
              │                                                                     against the benchmark library
              └─► F1 Pro forma:  Pro forma   Aggressive  (each change: kind + story)
                                   │            │
                                   ▼            ▼
              Refinance NOI choice: In-place · Underwritten · Entered · Pro forma · Aggressive
                                   │
                                   ▼
              F4: appraised value · new loan or extension with today's lender · pay-down needed
                  · lender presets · the verdict for a loan that must be dealt with
```

F2's flags feed F1: "send this line to the pro forma". F1's NOI feeds F4.

---

## 2. F1 — The pro forma

### 2.1 What Azriel does by hand today (Queens Gate, 20:43–37:08)
- **Revenue:** the last 3 months annualized instead of the T12 ($5.0M → $5.3M), because occupancy is fixed (five months
  at 95%+).
- **Expenses, line by line, each with a reason for the lender:**
  - corporate items out (travel, software, shipping, office phones);
  - phones / internet / cable $32K → $10K (one fiber line for the four buildings, a planned CapEx);
  - legal / landlord-tenant lowered;
  - G&A $87K → $73K;
  - management fee stays 3% of revenue;
  - marketing $99K → $60K ($685/unit vs a norm of $300–400; a smaller listing package);
  - payroll and insurance kept;
  - taxes follow the PILOT formula on the new revenue;
  - electric and gas for vacant units out;
  - turnover lowered (no short-term tenants; renovations go on the balance sheet), $40K for 145 units;
  - a one-time landscaping project out;
  - dryer-vent cleaning (every 3 years) at 1/3;
  - snow $37K → $20K (a once-in-10-to-20-years winter);
  - repairs & maintenance kept;
  - bad debt at 1% (a multi-year COVID write-off was in the T12).
- **Two columns**, a careful one and "this more aggressive column here" (30:07).
- **Reconciliation:** what was taken out is listed at the bottom as "partnership expenses" or "non-recurring
  expenses", "to reconcile from the 3.34 to the 3.11 on the expense side" (his pro forma NOI is $3.34M).
- **Sent to the lender** as a simplified pro forma, with a story for each item (31:59).

### 2.2 What the app has today (from the code)
- **Underwriting lines:**
  - income: GPR, EMPL, MOD, VAC, CONC, BD, then RUBS … OTH;
  - expenses: RET, INS, UTIL, PAY, GA, BDX, MKT, RM, CS, TRSH, CAB, PLL, MGMT;
  - reserves, plus the operator's own categories (`setup-builder.js` 19-39).
- **Each line has two figures:** in-place (the T12) and underwritten. The underwritten one is the rent roll's GPR,
  vacancy = min(actual, 5%), management = min(actual %, 2.5%) of the underwritten EGI, reserves $200/unit, and
  everything else as in the T12 (`buildSetup`).
- **A pin** sets a line's underwritten total (`assumptions.json` → `lineOverrides.{CODE}:{value, by, at}`):
  - it has **no reason**; the history note is just "pinned";
  - only a whole line can be pinned.
- **The reading knows every account** (`parsed.rows`: name, side, Underwriting line, 12 monthly amounts, Excel row),
  but no function returns "the accounts under one line", and nothing can leave one account out without changing
  the T12 itself.
- **The T12 rule:** when a statement is short or in lease-up, every line is the last 3 months × 4
  (`GeneralData.noiRule` → `codeSums`). Otherwise it is the 12-month total.
- **The rent roll** gives today's occupancy only. There is no occupancy history; the T12's vacancy line by month is the
  only monthly signal.
- **No Underwriting export.** The one Excel export is the loan list (SheetJS 0.18.5, which can't style cells but can set
  number formats, widths and merges).
- **The refinance's NOI choices** are In-place / Underwritten / Entered, read from `general-data.json` `noi`.

### 2.3 What you will see
1. **One new column in Underwriting, "Pro forma", with a Safe / Aggressive switch** (D2, agreed): right of
   Underwritten, with its $/unit. Both versions are kept; the switch shows one at a time beside the T12, so the table
   stays narrow.
   - It appears after **"Start a pro forma"** (a property without one looks as it does today).
   - The NOI row shows the version on screen; the other version's NOI is named next to the switch.
   - A changed cell is marked and shows its kind on hover.
2. **Click any line in the Pro forma column → "Change this line" panel.** It shows:
   - the line, its T12 amount, the underwritten amount, $/unit;
   - **every account under the line** with its 12-month amount (on the same basis as the T12 rule), its row in the
     file and a small 12-month strip;
   - **How:**
     - **New total** — type it (e.g. marketing $60,000).
     - **Take out accounts** — tick accounts (e.g. "Electric — vacant units"); each needs a kind.
     - **Spread over years** — an account or the line at 1/N (vent cleaning: every 3 years → 1/3).
     - **% of revenue** — management fee, PILOT taxes, bad debt; worked out from the column's own revenue, so it moves
       when revenue moves.
     - **Per unit** — $/unit × units (e.g. turnover $275/unit).
   - **Kind (required):**
     - **Partnership / back-office** (not an asset expense);
     - **Non-recurring**;
     - **Spread over years**;
     - **Normalized** (snow);
     - **Operating change** (marketing package, the fiber line), optionally with its CapEx amount and month;
     - **Market norm** (bad debt 1%);
     - **Revenue credit**.
   - **Story (required)** — typed. **"Draft it"** asks Claude for a draft from the line's numbers, the kind and what you
     typed; you edit it and it's yours.
   - **Apply to:** Safe · Aggressive · both.
   - A change can be edited or removed; each edit keeps the old version in the history.
3. **Revenue — "Annualize recent months"** (on the revenue lines):
   - pick T3 (default) or T6;
   - the panel shows every revenue line month by month, the months used ("Jun → Aug 2026"), the T12 figure next to the
     annualized one, and today's occupancy from the rent roll;
   - kind "Revenue credit", story required.
4. **Reconciliation** under the table, one block per column:
   ```
   T12 NOI (the T12 rule)                                    $A
   + Revenue credit                                          +$B   story…
   + Partnership / back-office      (n items)                +$C   ▸ each item with its amount and story
   + Non-recurring                  (n items)                +$D
   + Spread over years / Normalized (n items)                +$E
   + Operating change               (n items)                +$F
   + Market norm                    (n items)                ±$G
   = Pro forma NOI                                           $A + … + $G   ✓ reconciles
   ```
   (The layout only; the app shows the property's real amounts.) It is always worked out from the same
   numbers; if it ever fails to add up to the dollar, the column says **"doesn't reconcile — $X"** and the refinance
   won't use it.
5. **"For the lender…"** builds the Excel file (2.6).
6. **Refinance:** the NOI choice gains **Pro forma** and **Aggressive** when the property has them. "How 'supports $X'
   is worked out" names it: "NOI $X — Pro forma (N changes; last by <who>, <date>)".

### 2.4 How it is worked out (a new engine module, `proforma.js`, pure and unit-tested like `underwriting.js`)
- **Starts from the T12 column** (decision **D8**), so the reconciliation is T12 → pro forma, as Azriel presents it.
  Reserves follow the Underwriting assumption on both sides and are shown as their own row.
- **Order:**
  1. revenue credit (each income line = Σ last N months × 12/N);
  2. account take-outs and spreads (subtract the account's amount, or (N−1)/N of it);
  3. line totals, normalizations and per-unit lines;
  4. % of revenue lines from the column's own revenue;
  5. NOI.
- **Account amounts use the same basis as the line.** If the T12 rule annualized the statement (T3 × 4), an account's
  amount is its own last 3 months × 4. The account then adds up to its line exactly as the line adds up to the NOI.
- **One whole-line change per line per column.** A new total, normalized amount, per-unit or % of revenue replaces the
  line, so account changes on that line are closed while it stands. Any number of account changes are allowed on
  different accounts.
- **Aggressive = Pro forma + its own changes.** A line changed in both uses the Aggressive change (decision **D2**).
- **Reconciliation:** each change's effect = column line − T12 line, signed by side, grouped by kind. Σ effects + T12
  NOI must equal the column's NOI; this is a check on every recompute.
- **Blank is blank:** a line the T12 doesn't have stays blank unless a change adds it (e.g. bad debt, when the T12 has
  none, added at 1%).

### 2.5 Where it is kept
- **In the property's `assumptions.json`** (the Underwriting record — already synced, field-level history on the
  server, nothing new for `setup.sql`):
  ```
  proForma: {
    started: {by, at},
    revenue: { base: {months: 3, story, kind:"revenue", by, at} | null, aggressive: … },
    changes: [ { id, column:"base"|"aggressive"|"both", line:"MKT",
                 how:"total"|"takeOut"|"spread"|"pctRevenue"|"perUnit",
                 value?, pct?, years?, perUnit?,
                 accounts?: [{name, sheet?, row}],      // for takeOut / spread
                 kind:"partnership"|"nonRecurring"|"spread"|"normalized"|"operating"|"marketNorm",
                 capex?: {amount, month}, story, by, at, from:"typed"|"assistant" } ]
  }
  ```
- **Every change has an `id`**, so two people changing different lines merge item by item; without ids the whole list
  would be one value (`cloud-merge.js`).
- **`opMergeBench` keeps object values**, so `proForma` survives loading. Its own loader still validates every item and
  drops nothing silently: a bad item is listed in Data Health.
- **History:** the `proForma` paths are added to `assumptionFlat` / `ASSUMPTION_META`. Each change logs, e.g.:
  "Pro forma · Marketing: $99,000 → $60,000 · Operating change · 'smaller listing package now occupancy is solid'".
- **Shared database:**
  - the story is the change's reason, and the "Not saved yet" bar starts with the stories typed (editable);
  - view-only and offline members see the columns and the panel read-only (`cloudCanWrite`);
  - the admin lock works per field, as today.
- **The two NOIs** are saved with the others in `general-data.json`
  `noi:{…, proForma, aggressive, proFormaReconciles}` for the refinance, the roll-up and the assistant.

### 2.6 The lender file (Excel)
**Sheet "Pro forma":**
- At the top: property, units, T12 period, prepared on, prepared by.
- Columns: Line | T12 | $/unit | Pro forma | $/unit | (Aggressive | $/unit) | Change | Kind | Story.
- Rows: income lines, EGI, expense lines, total expenses, NOI, reserves, NOI after reserves.
- Money in whole dollars, columns sized.

**Sheet "Reconciliation":** the block from 2.3 (4), item by item, with the stories.

**Sheet "Monthly":** the T12 by line and by month, with a column marking the months used for the revenue credit
(SheetJS here can't colour cells).

**Choices:** "Pro forma only" or "Pro forma and Aggressive". Saved through the app's Save dialog
(`ldsShell.saveBinary`): "<Property> — Pro forma — <date>.xlsx".

### 2.7 When things change underneath
- **A new T12 arrives:**
  - whole-line changes stay;
  - account changes are matched again by account name (and sheet, for a file in parts);
  - one whose account is gone is marked **"account not in the new T12"**, left out of the column, and listed in
    Underwriting and Data Health until you fix or remove it. It is never dropped silently.
  - The revenue credit uses the new statement's months and says so.
- **A T12 waiting for your review:** the pro forma waits too, like every other number.
- **No T12:** "Start a pro forma" is off ("needs a T12").
- **Units change:** per-unit lines and $/unit figures follow.
- **A statement in parts / combined:** accounts carry their sheet; the panel groups them by sheet.

### 2.8 Claude (the assistant)
- **New action `propose_pro_forma_change`** {property, column, line, how, value / pct / years / accounts, kind, story}.
  It shows an approval card: line, old → new, kind, story. Nothing is saved until you approve, as with every action.
- **`read_property`** returns the pro forma columns and the reconciliation.
- **"What to push"** gets the pro forma as context.
- **Rules in its instructions:** never invent a number; amounts come from the T12, the rent roll or what you said. It may
  draft stories and propose kinds.
- **"Draft it"** in the panel is a small call (the same `aiExtract` path as "what to push") returning a story and a
  suggested kind.

### 2.9 Tests
**Unit (`proforma.test.js`), each method on a fixture T12:**
- new total; take out one account; spread 1/3; normalized; per unit; % of revenue after a revenue credit;
- T3 and T6 credits;
- the T12-rule basis (a lease-up statement);
- Aggressive inheriting Pro forma;
- the one-whole-line-change rule;
- the reconciliation adding up to the dollar in every case;
- a change without a story or kind refused;
- an account missing after a new T12 → marked, left out, listed.

**A Queens-Gate-shaped fixture** (made up, built on the kinds of change Azriel described: a T3 revenue credit, items
taken out, a 1/3 spread, a normalized line, two operating changes, bad debt at 1%) must reconcile to the dollar.

**e2e (`proforma.e2e.js`):**
- start a pro forma; change lines through the panel (each how);
- story required; columns and $/unit; reconciliation shown;
- the Excel file read back (sheets, rows, stories);
- the refinance's "Pro forma" choice; history entries;
- the assistant's card with the fake Claude.

**Shared database (cloud test bed):** two computers change different lines and both are kept; a view-only member
can't change; the reason bar shows the stories.

**When Azriel sends his Queens Gate file:** run the real file locally (never committed) and compare with his $3.34M.

### 2.10 Build steps
1. **F1a** `proforma.js` + unit tests (the engine alone).
2. **F1b** accounts by line (a function over `parsed.rows` on the T12-rule basis) + tests.
3. **F1c** storage in `assumptions.json`, loader checks, history paths, sync merge by id + tests.
4. **F1d** the Pro forma column with its Safe / Aggressive switch, and the "Change this line" panel (every how, kind,
   story, apply to).
5. **F1e** revenue credit (T3/T6) with the monthly view.
6. **F1f** reconciliation block + the "doesn't reconcile" guard.
7. **F1g** the lender Excel file.
8. **F1h** refinance NOI choices Pro forma / Aggressive, the roll-up, Data Health entries.
9. **F1i** assistant action, "Draft it", `read_property`, push context.
10. **F1j** e2e + cloud tests, full suite, reference doc, check list part.

---

## 3. F4 — Lender scenarios in the refinance

### 3.1 What Azriel did on Queens Gate (17:28–20:43, 31:59)
- Fannie Mae would give $30M at 1.25× and "doesn't really do floaters".
- The current lender (Flagstar) is being asked for a **3-year interest-only extension** at 30-day SOFR + 200. The loan is
  paid down from $47M to about $42.25M, on an **appraisal of $65M**, at **1.11× amortizing / 1.35× interest-only**.
- "I know it says I shouldn't, but I have to — it's converting."

### 3.2 What the app has today (from the code)
- **Value = NOI ÷ cap rate**:
  - the cap rate is `loan.capRate` when typed, else the default for the loan's property type (Multifamily 5.5%);
  - it is not the Underwriting cap rate, and there is no appraised value.
- **The limits (3.0.0)** are saved per refinance in this computer's browser storage (`ldsHub.refiLimits.v1`, by
  `loan._id` / `combo:` / `multi:`). **They are not shared with the team.**
- **The proposed loan** is kept for the session only (`refiDrafts`).
- **Interest-only sizing:** `refiCanStage` never sizes interest-only. A loan that is interest-only for its whole term is
  sized on the amortizing payment; only the "debt coverage, interest-only" limit, once typed, looks at the
  interest-only payment.
- **The verdict:** rule (1) "can't support what you owe" stops before rule (2) "ends within 12 months". A maturing loan
  the property can't cover gets "Don't refinance".
- **Extensions:** loans have no extension fields, only the statuses "Extended" and "Extension undecided".
- **"Save as a loan"** replaces the old loans with a new one (blank lender, old ones Paid off (refinanced)).
- **Early-payoff penalty types:** Yield Maintenance, Step-down, Defeasance, Open / at par.

### 3.3 What you will see
1. **"What kind of deal?"** at the top of Proposed New Loan: **New loan** (as today) · **Extend with today's lender**.
2. **Appraised value** in "How 'supports $X' is worked out":
   - "Value: NOI ÷ cap rate 5.5% = $X" (as today), or a typed **Appraised value $65,000,000** with its date and a note;
   - the LTV limit and the line under the amount use it.
3. **Extend with today's lender:**
   - **Inputs:**
     - extension term (months, e.g. 36);
     - interest-only (the whole term / N months / none);
     - rate: today's index (shown) + the new spread (e.g. 30-day SOFR + 200);
     - **what this lender asks for the early-payoff penalty** (D7, agreed — every lender is different):
       **the full penalty** (as if paid off) · **on the pay-down only** · **a part** (a typed % of the full penalty, or a
       typed $ amount) · **none**. Until you pick, it uses the penalty on the pay-down, marked "assumed — confirm with the
       lender", like today's assumed prepayment type;
     - extension / modification fee (% or $);
     - the lender's limits (the 3.0.0 legs, with "debt coverage, interest-only").
   - **Shows:**
     - what you owe today;
     - what the lender's limits allow at the new rate;
     - **the pay-down needed** = what you owe − what they allow (or "none needed");
     - at the extended amount: debt coverage amortizing and interest-only, LTV on the appraisal, debt yield;
     - the penalty as this lender asks it (D7), with how it was worked out;
     - **cash needed** = pay-down + penalty + fee.
   - **Save the extension** (decision **D10**): today's loan stays the same record with:
     - a new maturity and the new rate terms from the extension date;
     - the pay-down recorded as a principal payment on that date;
     - status "Extended";
     - a history entry for every field ("Extended with Flagstar: 36 months IO at SOFR30 + 200; paid down $4,750,000").
4. **A loan that must be dealt with** (decision **D1**, agreed as revised). When the property can't support what you
   owe **and** today's loan matures **or its rate resets** within 12 months (Queens Gate: its 3.00% fixed period ends
   Dec 2026), the verdict box no longer says only "Don't refinance". It says:
   - **"Today's loan ends <date>"** or **"Today's rate resets <date>: 3.00% → <the rate after the reset>"**;
   - **"To refinance at these limits: pay down $X."**
   - **"To extend with today's lender: pay down $Y"** (when the extension limits are filled in).
   - The banner reads `data-refiverdict="paydown"`.
   - **Save** is allowed at an amount up to what the property supports; the gap is recorded as cash paid in.
   - Outside the 12 months it stays "Don't refinance", as today. The reset date and the rate after it are shown in any
     case next to "Today's loan rate" (today the refinance never mentions a coming reset).
5. **Lender presets:**
   - a list kept for the whole group: Fannie Mae, Freddie Mac, a local bank, today's lender's extension — **ships
     empty**, filled only from Azriel's numbers;
   - each preset has: name, limits (amortizing / interest-only coverage, LTV, debt yield), the rate types allowed,
     longest amortization, its usual early-payoff penalty choice on an extension (D7), notes, source;
   - **picking one fills the refinance's limits** (still editable), and the table says "Fannie Mae preset";
   - a rate type the preset doesn't allow is greyed with the reason ("Fannie Mae: no floating").
6. **Pro forma NOI** (F1): pick "Pro forma" or "Aggressive" as the NOI, named in the table.
7. **Interest-only sizing (D11):**
   - when the proposed loan or extension is interest-only for its whole term, the debt-coverage limit is measured on
     the interest-only payment if the preset or your typed limits say so;
   - otherwise on the amortizing payment, as today;
   - the table always shows both.

### 3.4 Where it is kept (decision **D9**)
- **Moved from this computer's browser into the property's `assumptions.json`**, under `refi` and keyed as today
  (loan / combo / multi), so the whole team sees the same refinance:
  - limits, appraised value (+ date, note);
  - deal kind, extension terms, fee;
  - preset picked.
  
  A "multi" portfolio is kept under its first property (sorted) with the full key. Old browser-stored limits are moved
  in once, with a history entry.
- **Presets:** a group-wide shared setting `lds.lenderPresets` (`SHARED_KEYS` + `CLOUD_SHARED_KEYS`), a list with ids,
  edited by the admin (decision **D13** on enforcing it on the server).
- **Loan record:** the extension writes only existing fields (maturity, rate terms, IO months, status) plus a
  `principalPayments` list ({id, date, amount, note}) that `compute()` applies to the schedule. This is a schedule
  change, tested on its own.

### 3.5 Claude
- `set_refi_terms` gains `deal:"new"|"extend"`, `appraisedValue`, `extensionMonths`, `ioMonths`, `fee`, `preset`.
- `refiSummaryText` includes the pay-down.
- `start_refinance`'s approval card covers "Save the extension".

### 3.6 Tests
- **Pay-down arithmetic:** a fixture loan owing $47M at 30-day SOFR + 200 interest-only, NOI $3.34M, appraisal $65M,
  limits 1.11× / 1.35× IO / 75% / 7%. The test works out the expected max loan and pay-down on its own and compares them
  with the screen (`LDS_refiVerdictWith`, `data-refileg`, the new `data-refipaydown`).
- **Verdict:** ends in 6 months and can't cover → "paydown"; ends in 30 months → "Don't refinance" (unchanged); the
  covered cases keep every 2.9.7 / 2.9.14 rule.
- **Appraised value** replaces NOI ÷ cap rate in LTV and in the line under the amount.
- **Extension save:**
  - maturity, rate, IO and status change;
  - the schedule shows the principal payment and the balance after it;
  - a history entry per field;
  - each of the four penalty choices (full, pay-down only, a part as % and as $, none) gives the expected amount, and
    "assumed" shows until one is picked.
- **Presets:**
  - picking one fills the limits;
  - a disallowed rate type is greyed;
  - an editor can't change the list, the admin can (cloud test bed).
- **Shared refinance inputs:** limits and appraisal typed on one computer appear on the other; old browser limits move
  in once.
- **The existing refinance e2e suite** (refi-*, pool-refi-2914) passes unchanged except where D1 changes the verdict.

### 3.7 Build steps
1. **F4a** refinance inputs moved to `assumptions.json` (with the one-time move) + tests.
2. **F4b** appraised value.
3. **F4c** interest-only sizing (D11).
4. **F4d** the "must be dealt with" verdict and pay-down (D1).
5. **F4e** extend with today's lender: inputs, numbers, save, `principalPayments` in `compute()`.
6. **F4f** lender presets (shared setting, admin screen, rate-type rules).
7. **F4g** Pro forma NOI choice (after F1).
8. **F4h** assistant actions.
9. **F4i** e2e + cloud tests, full suite, reference doc, check list part.

---

## 4. F2 — Expense benchmarks that find the anomalies

### 4.1 What Azriel asked (37:08–41:44, 55:21)
- **Flag expense lines much higher than the norm:** marketing $1,000/unit vs 300–350; the seller's leased Ferraris in
  the P&L.
- **The norm depends on:**
  - the **asset type**;
  - the **state** — NJ/NY pools need lifeguards; Florida pools are open all year, NJ about three months; no snow in
    Texas;
  - **building age** — 1950s–70s far higher repairs than 2021;
  - **what the property has** — a security service raises G&A, and that isn't an anomaly.
- He will send general benchmarks, divided by asset type.

### 4.2 What the app has today (from the code)
- **Two benchmarks per property:** Payroll $1,700/unit and Repairs & maintenance $600/unit.
  - They are stored in `assumptions.json` `benchmarks:{PAY,RM}`.
  - They are flagged at ±15% on the **underwritten** $/unit, with the dollar gap.
- **"What to push" mismatch:** it gets only those two targets. Its instructions mention contract services and turnover
  benchmarks that are never sent.
- **Property facts:**
  - the asset type is on the **loan** (Property Type: Multifamily / Office / Retail / Industrial / Mixed-Use / Other), not
    on the property;
  - `stateFromAddress` exists, but is fed the loan's address;
  - year built is on the property profile.

### 4.3 What you will see
1. **Settings → "Expense benchmarks"** (the admin edits; everyone else reads):
   - **Rows:** asset type · line (Underwriting line) · measure ($/unit, % of revenue, or $/sq ft) · norm · tolerance
     (default 15%) · source ("Azriel, Oct 2026") · note.
   - **Conditions** add to or replace a norm:
     - state(s);
     - built before / after a year;
     - features: pool (months open), security service, snow removal.
     
     E.g. "Multifamily · Contract services · pool in NJ or NY · + $X/unit (lifeguards)".
   - **Import from Excel:** Azriel's sheet → a preview with column matching → approve. Every change goes into the history.
   - **Ships empty.** No number is invented.
2. **The property gets the facts the norms need** (Property Profile):
   - asset type (filled once from the senior loan's Property Type, with a history entry);
   - pool (yes / no, months open), security service (yes / no), snow removal (yes / no);
   - state is read from the property's address, and shown;
   - year built (exists).
3. **Flags in Underwriting**, on every expense line that has a norm:
   - its $/unit in the T12, Underwritten and Pro forma columns against **the property's norm**;
   - the norm is explained: "G&A norm $Z/unit = $X (Multifamily) + $Y (security service)";
   - **above the tolerance:** amber, with the % and the dollar gap ("Marketing $685/unit vs $350 · +$48,575");
   - **below it:** grey "under the norm" (decision **D12**).
4. **On a flag:**
   - **Accept with a reason** ("security service — required in this area"): the flag turns grey with the reason, kept on
     the property with its history.
   - **Send to the pro forma:** opens F1's panel at the norm × units, kind "Market norm", with a drafted story.
5. **"What to push"** gets every line's norm and gap (fixing today's mismatch).
6. **A property being bought (the Ferrari case):** the same flags on the seller's T12 for a property with no loan.
   - In F1's panel Claude may point out accounts that don't look like asset expenses ("Auto lease"), as suggestions
     only; you decide.

### 4.4 How a norm is worked out (a new module, `benchmarks.js`, unit-tested)
- **Pick the norm:** the base row for (asset type, line) → each matching condition row in the library's order (add, or
  replace) → the property's own override, if any. Each step is kept for the explanation.
- **Measure:**
  - $/unit = line ÷ residential units;
  - % of revenue = line ÷ the column's EGI;
  - $/sq ft = line ÷ rentable sq ft (blank when sq ft is blank — never 0).
- **Flag:** above when > norm × (1 + tolerance); under when < norm × (1 − tolerance). The dollar gap is
  (actual − norm) × units, or × EGI / sq ft for the other measures.
- **Today's two per-property benchmarks (Payroll, R&M)** become that property's own overrides of the library
  (decision **D5**). They are moved once, with a history entry, so no property's flags change by surprise.

### 4.5 Where it is kept
- **Library:** a group-wide shared setting `lds.expenseBenchmarks`, a list with ids, so admin edits merge row by row.
  The same key works alone on one computer without the shared database.
- **Property facts:** new keys inside `profile.json` `fields` (they survive `Profile.coerce` and get its per-field
  history).
- **Accepted flags and the property's own norms:** `assumptions.json` `benchmarkNotes:{CODE:{reason, by, at}}` and
  `benchmarks` (as today).
- **Admin-only:** checked on screen (`cloudUI.st.role`). The server doesn't check roles for shared settings today —
  decision **D13**.

### 4.6 Tests
**Unit (`benchmarks.test.js`):**
- base norm; condition add / replace by state, year built and features;
- the property's override;
- each measure; tolerance; blank sq ft;
- the explanation text;
- the PAY/RM move.

**e2e:**
- import a library from an Excel fixture;
- a property with a pool in NJ and a security service;
- flags with explanations; accept with a reason; send to the pro forma;
- "what to push" input has every gap.

**Cloud test bed:**
- the admin edits the library and the editor sees it but can't edit;
- two admins' edits to different rows both kept.

### 4.7 Build steps
1. **F2a** `benchmarks.js` + unit tests.
2. **F2b** library as a shared setting + Settings screen + Excel import.
3. **F2c** property facts on the profile (asset type move, features, state).
4. **F2d** flags in Underwriting with explanations, accept with a reason, send to the pro forma.
5. **F2e** PAY/RM move; "what to push" gets every gap.
6. **F2f** the seller-T12 suggestions.
7. **F2g** e2e + cloud tests, full suite, reference doc, check list part.

---

## 5. Order and shipping
- **F1 first** (needs nothing from anyone; Azriel's Queens Gate file is wanted for the final check).
- **F4 next** (uses F1's NOI; presets wait for Azriel's numbers and ship empty).
- **F2 last** (the library needs Azriel's benchmarks).
- Each can ship on its own; the operator chooses each version number.
- Each ships with its unit tests, e2e and cloud tests, the full suite, the reference doc and a check list part. Any
  `setup.sql` change (only D13 would need one) raises the setup version, which now updates the database by itself on
  release.

## 6. Decisions for the operator (my recommendation first)

**The operator's answers (2026-10-14, in the "Next Stage Plan" doc):** D3, D4, D5, D6, D8, D9, D10, D11, D12 and D13
agreed as recommended. **D1 agreed as revised**, **D2: option 2** (one Pro forma column with a Safe / Aggressive
switch), **D7: every lender's way** (full penalty, on the pay-down only, a part, or none — the lender's choice, picked
per extension). All 13 decisions are settled.

**D1 as revised and agreed (2026-10-14).** Checked in the app on Queens Gate (built-in data): it says "Don't
refinance" — you owe $47,098,514.48, at 30-day SOFR + 200 it supports $32,139,344.24 — and already names the
$14,959,170.25 shortfall under "Can you? No". But Queens Gate doesn't mature until 1 Nov 2031: what is ending is its
3.00% fixed period (Dec 2026), and the refinance never mentions the reset. So the "must act" verdict fires when the
loan **matures or its rate resets** within 12 months; it shows today's rate, the rate after the reset, and "pay down
$X to refinance" (and "$Y to extend" once extension limits are typed).
1. **D1 — a loan that must be dealt with.** *Agreed as revised:* can't cover what you owe **and** it matures **or its
   rate resets** within 12 months → the pay-down verdict instead of "Don't refinance".
2. **D2 — the columns.** *Agreed: one Pro forma column with a Safe / Aggressive switch* (both versions kept; Aggressive
   = Safe + its own changes). (First recommended: two columns side by side — too wide.)
3. **D3 — revenue from recent months.** Recommend allowing it only inside the pro forma (T3 / T6, with a story). The
   T12 rule (#109) stays as it is for the in-place NOI.
4. **D4 — bad debt % of revenue.** Removed from the assumptions in 2.9.3 (#104). Recommend it only as a pro forma line
   (% of revenue), not as a general assumption.
5. **D5 — one benchmark library.** Contract services and turnover were removed in 2.9.3 (#107). Recommend one library
   for every line Azriel gives a number for; today's Payroll / R&M become the property's own overrides.
6. **D6 — the lender file.** Recommend Excel first; PDF only if asked.
7. **D7 — extension with today's lender.** *Agreed (the operator): the app supports every lender's way* — the full
   penalty, the penalty on the pay-down only, a part of it (% or $), or none — picked per extension, plus a fee (% or $).
   A lender preset can carry its usual choice. (First recommended: no penalty at all.)
8. **D8 — where the pro forma starts.** Recommend the **T12** column (as Azriel presents it). The other choice is the
   Underwritten column, which would add "assumptions" as a reconciliation step.
9. **D9 — refinance inputs.** Recommend moving limits, appraisal and deal terms from each computer's browser into the
   shared property record, so the team sees one refinance.
10. **D10 — saving an extension.** Recommend updating today's loan (new maturity, rate terms, IO, status "Extended",
    the pay-down as a principal payment) rather than replacing it with a new loan.
11. **D11 — interest-only sizing.** Recommend: for a loan interest-only for its whole term, coverage on the
    interest-only payment when the preset or your limits say so; otherwise on the amortizing payment; always show both.
12. **D12 — under-the-norm lines.** Recommend a grey "under the norm" note (could be deferred maintenance), not an amber
    flag.
13. **D13 — admin-only lists on the server.** Recommend yes: the server refuses non-admin edits to the benchmark
    library and the lender presets (a `setup.sql` change; the database updates itself on release).

## 7. Needed from Azriel
1. The general benchmarks by asset type ($/unit or % of revenue per expense line), and how state, building age and
   features (pool and months open, security, snow) change them.
2. The Queens Gate pro forma file he showed (the final check for F1 and F4).
3. The limits each lender type uses (Fannie, Freddie, a local bank, an existing lender's extension), the rate types each
   allows, and a typical extension fee.
4. How the PILOT tax is worked out on his properties (a % of gross revenue, or another formula).

## 8. Not in this stage
- Yardi ingestion (reference §9).
- Pooled-loan internals beyond what 3.0.0 does.
- Anything Azriel hasn't asked for.
