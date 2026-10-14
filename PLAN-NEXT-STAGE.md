# Next stage — the pro forma, expense benchmarks and lender scenarios: the plan

*Written 2026-10-14 from the recording of the meeting with Azriel on 2026-10-13 ("Follow up", 56 minutes).
Status: **plan only — nothing built.** The version number is the operator's to choose (version rule, reference §8).*

---

## 0. What the meeting asked for that 3.0.0 already does

These eight came from the same meeting and shipped in 3.0.0 (reference §4.8, §8). This plan doesn't repeat them.

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

## 1. What is left — four features

Everything below comes from Azriel walking through Queens Gate (20:43–37:08) and the benchmarks talk (37:08–43:14,
55:21). Times are the recording's.

### F1. The pro forma: an adjusted NOI with a story on every line

**What Azriel does today, by hand, in Excel (Queens Gate):**
- **Revenue:** credit for the last 3 months annualized instead of the T12, because occupancy is fixed (five months
  at 95%+) — "give me credit for $5.3 million in revenue" (22:22).
- **Expenses, line by line** (22:22–33:00), each with its reason to the lender:
  - back-office / corporate items taken out (travel, software, shipping, office phones);
  - phones / internet / cable $32K → $10K after one fiber line for the four buildings (a planned CapEx);
  - legal / landlord-tenant lowered;
  - G&A $87K → $73K;
  - management fee stays 3% of revenue;
  - marketing $99K → $60K (smaller listing package now that occupancy is solid; $685/unit vs a norm of $300–400);
  - payroll, taxes and insurance kept; taxes follow the PILOT formula on the new revenue;
  - electric and gas for vacant units taken out;
  - turnover lowered (no more short-term tenants; renovations go on the balance sheet);
  - a one-time landscaping project taken out;
  - dryer-vent cleaning (every 3 years) counted at 1/3;
  - snow $37K → $20K (a once-in-10-to-20-years winter);
  - bad debt at 1% (the market norm; an old COVID write-off was in the T12).
- **Two columns:** a careful one and "this more aggressive column here" (30:07).
- **Reconciliation at the bottom:** what was taken out is listed as "partnership expenses" or "non-recurring
  expenses", so the pro forma NOI ($3.34M) reconciles to the T12 NOI ($3.11M) (31:59).
- **Sent to the lender** as a simplified pro forma, "with a story as to each item" (31:59).

**What the app has today** (reference §4.5): one underwriting case. You can pin a line's total (kept with who and
when, no reason). Management 2.5% and vacancy 5% are editable per property. The T12 rule is fixed (T3 × 4 only for a
short or lease-up statement). Per-unit figures are shown.

**What to build — in Underwriting, beside the T12 column, never changing it:**
1. **A pro forma column (and a second, "aggressive" one — decision D2)** that starts as a copy of the underwritten
   column.
2. **Every change to a line needs a story** (typed; the assistant can draft it, you approve). Each change is filed
   as one of:
   - **taken out — partnership / back-office**;
   - **taken out — non-recurring**;
   - **spread over N years** (vent cleaning: 1/3);
   - **normalized** (snow);
   - **operating change** (marketing package, the fiber line — optionally tied to a CapEx amount);
   - **market norm** (bad debt 1%).
3. **Lines worked out from revenue:** management fee % (exists), **taxes as a PILOT % of revenue** (new), **bad debt %
   of revenue** (new — decision D4).
4. **Revenue from the last 3 months × 4** as a pro forma choice. The monthly series and the rent roll's occupancy are
   shown beside it, so the low months are visible. The T12 rule and the in-place NOI don't change (decision D3).
5. **Account-level changes inside a line:** take out "electric — vacant units" without touching the rest of Utilities.
   The 2.9.17 reading already knows every account under every line.
6. **The reconciliation table:** T12 NOI → revenue credit → each change, grouped (partnership / non-recurring /
   spread / normalized / operating / market) → pro forma NOI. It must add up to the dollar, or the column is marked
   "doesn't reconcile".
7. **"For the lender":** an Excel file with T12 | pro forma (| aggressive), $/unit, the story on every changed line
   and the reconciliation — Azriel's simplified pro forma. PDF as a decision (D6).
8. **The refinance can be sized on the pro forma NOI** (or the aggressive one), named as such in "how 'supports $X' is
   worked out".
9. **Shared database:** the pro forma, its stories and its history live with the property in the group's data, like
   the other underwriting choices. Every change carries the 3.0.0 typed reason; the story is that reason.

**Test:** Azriel's Queens Gate file (when he sends it). The app's pro forma, built from the same T12 with his changes,
must land on his $3.34M and reconcile to $3.11M.

### F2. Expense benchmarks that find the anomalies

**Azriel (37:08–41:44):** flag lines much higher than the norm ("marketing $1,000 a unit vs 300–350"; the seller's
leased Ferraris). The norm depends on:
- **state** — NJ/NY pools need lifeguards; Florida pools are open all year, NJ about three months; no snow in Texas;
- **building age** — 1950s–70s buildings have far higher repairs than a 2021 one;
- **what the property has** — a security service raises G&A, and that isn't an anomaly;
- **asset type** (55:22).

He will send general benchmarks, divided by asset type (55:21).

**Today** (reference §4.5): only Payroll $1,700/unit and Repairs & maintenance $600/unit, per property, flagged at
±15% with the dollar gap. The contract-services and turnover benchmarks were **removed on purpose** in 2.9.3 (#107) —
decision D5.

**What to build:**
1. **One benchmark library for the group** (in the shared database; the admin edits it): $/unit (or % of revenue)
   per expense line, by asset type. Optional adjustments by state, age band and features. **Filled only from Azriel's
   list — no number is invented.**
2. **Property facts the library needs:**
   - **asset type** on the property (today it is on the loan, as Property Type);
   - **year built** (exists);
   - **state** (from the address);
   - **features**: pool (open how many months), security service, snow removal — only those Azriel named; more
     when he names more.
3. **Flags in Underwriting:** each line's $/unit against its benchmark, the % and the dollar gap. A flagged line can
   be:
   - **accepted with a reason** ("security service"; kept on the property, with its history);
   - **sent to the pro forma** as a change with a drafted story (F1).
   Flagged lines also go to "what to push", as today.
4. **The Ferrari case (buying a property):** the same flags on a seller's T12 for a property with no loan. Its
   take-outs file as "not an asset-level expense".

### F3. Benchmarks learned from documents (later — needs the documents)

**Azriel (41:44–43:14):** every appraisal, broker OM and pro forma he has — "have this tool figure out based on the
age, the location, the asset type". Yuval: AI agents read them in parallel, the cheap model for reading and the
stronger one for the analysis (43:24–45:45). Daniel is starting a database of all their deals — "your two systems
could merge" (42:29).

**Plan:**
- A reader that takes such a document and pulls out each expense line, units, year built, state, asset type and
  features, with the page each came from.
- Rows from many documents feed the F2 library as **suggested benchmarks**, each showing its sources and how many
  deals it rests on. The admin accepts them; nothing changes the library by itself.
- Talking with Daniel comes first — decision D8. Until then this stays a plan.

### F4. Lender scenarios in the refinance

**Azriel on Queens Gate (18:59–20:43, 31:59):**
- Fannie Mae would give $30M at 1.25× and doesn't really do floaters.
- The current lender (Flagstar) is being asked for a 3-year interest-only extension at SOFR + 200. Pay down from $47M
  to about $42.25M, on an appraisal of $65M; that covers 1.11× amortizing and 1.35× interest-only.
- "I know it says I shouldn't [refinance], but I have to — it's converting."

**What to build:**
1. **Appraised value typed** (else NOI ÷ cap rate, as today); the LTV uses it.
2. **"Keep today's lender — extension":**
   - new term, interest-only months, the new spread;
   - the **pay-down needed** for the limits you typed (what you owe − what the property supports);
   - no early-payoff penalty on an extension with the same lender (decision D7).
3. **When the property can't support what you owe and the loan ends soon,** the verdict says how much to pay down to
   refinance or extend, not only "Don't refinance". This changes the operator's stage-2 rule order — decision D1.
4. **Lender types as presets:** Fannie / Freddie, a local bank, today's lender. Each sets the limits and the rate types
   allowed (Fannie: no floating). **Values only from Azriel.** The per-refinance limits from 3.0.0 stay, so you can
   still type any number.
5. Sized on the pro forma NOI when you pick it (F1, 8).

## 2. Order

1. **F1** (pro forma, stories, reconciliation, export). Needs Azriel's Queens Gate file as the test.
2. **F4** (appraisal, extension, pay-down, presets). Uses F1's NOI; the presets need Azriel's numbers.
3. **F2** (benchmark library and flags). Needs Azriel's benchmarks.
4. **F3** (benchmarks from documents). Needs the documents and the talk with Daniel.

Each part gets unit tests and an end-to-end test, the full suite, the reference doc and a check-list part, as before.
No version number is set until the operator says which.

## 3. Decisions for the operator (my recommendation first)

- **D1 — the stage-2 rule when the loan must be dealt with.** Recommend: if the property can't support what you owe
  **and** the loan ends within 12 months, show "pay down $X to refinance / extend" instead of "Don't refinance". Today
  rule (1) comes before rule (2).
- **D2 — one pro forma or two.** Recommend two fixed columns, "Pro forma" and "Aggressive", as Azriel works. Not
  unlimited named scenarios.
- **D3 — revenue from the last 3 months.** Recommend allowing it **only inside the pro forma**, with its story. The
  T12 rule (#109, "no manual override") stays as it is for the in-place NOI.
- **D4 — bad debt % of revenue.** It was removed from the assumptions in 2.9.3 (#104). Recommend bringing it back
  **only as a pro forma line** (Azriel's 1%), not as a general assumption.
- **D5 — benchmarks for every expense line.** Contract services and turnover were removed in 2.9.3 (#107). Recommend
  one library covering every line Azriel gives numbers for, replacing the two per-property benchmarks. The
  per-property edit stays as the "accepted with a reason" exception.
- **D6 — the lender file.** Recommend Excel first (Azriel works in Excel); a PDF later if asked.
- **D7 — extension with today's lender.** Recommend no yield maintenance on an extension, with a box to type a
  modification fee if the lender asks one.
- **D8 — F3 and Daniel's deals database.** Recommend a call with Daniel before anything is built for F3.

## 4. What is needed from Azriel

1. The general benchmarks, by asset type ($/unit or % of revenue per expense line), and how state, building age and
   features (pool, security, snow) change them.
2. The Queens Gate pro forma file he showed (the test for F1 and F4).
3. The limits each lender type uses (Fannie / Freddie, local bank, an existing lender's extension) and which rate
   types each allows.
4. Later, for F3: appraisals, broker OMs and pro formas.

## 5. Not in this stage

- Yardi ingestion (reference §9).
- Pooled-loan internals beyond what 3.0.0 does.
- Anything Azriel hasn't asked for.
