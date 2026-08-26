# Invoice Reconciliation — Azriel's servicer billing statements vs the app's computed payments

**Method.** 37 scanned billing statements (due dates June–Sept 2026) were each read by an independent
extractor sub-agent, then **each was re-read and reconciled by a separate adversarial critic sub-agent**
(74 agents total). Every invoice's interest was checked against `balance × rate × days/360` (Actual/360)
or `balance × rate ÷ 12` (30/360), and the invoice's P&I was compared to the app's computed row for the
**same month**. **Zero critic/extractor disagreements** — every printed number was confirmed on the
independent re-read.

**Headline: the math works.** Of 37 invoices across 18 loans —
- **20 tie to the cent** (10 fixed/agency loans),
- **5 are floating loans that reconcile at the invoice's real rate** (the app's offline rate is only a placeholder),
- **8 flag 3 real modeling issues** (Mint, Mews, Living Lofts),
- **4 are 2 loans outside the app** (Pepper — modeled as already matured; Creekside — genuinely absent).

Escrow (taxes/insurance/reserves) and one-off fees on the statements are **not** part of this check — the
app models P&I only. Every "tie" below is P&I vs P&I.

---

## A. Tie to the cent — the app is exactly right (10 loans / 20 invoices)

| Loan | Servicer | Rate | App = Invoice (P&I) | Notes |
|---|---|---|---|---|
| Woodmont Forge at Hopewell | Nuveen/TIAA | 5.75% fixed IO | **$357,937.50** (Jul, Aug) | 30/360; exact |
| 36 Washington Ave (Carteret) | Customers | 5.94% IO | **$316,800.00** (30d) / **$327,360.00** (31d) | Actual/360; both months exact |
| 1222 Commerce St (Manor) | Customers | 6.10% IO | **$123,016.67** (30d) / **$127,117.22** (31d) | Actual/360; both months exact |
| Heritage Key Villas | Valley National | 5.70% IO | **$299,408.33** (Aug, Sep) | Actual/360; **note: invoice pays on the 1st, app renders on the 28th** (cosmetic date only) |
| Avalon Norwalk | Forethought (SitusAMC) | 3.55% fixed IO | **$243,210.50** (Aug, Sep) | Actual/360; exact |
| Queens Gate Apartments | NYCB (Flagstar) | 3.00% amort | **$202,369.94** (Jul, Aug) | Constant P&I exact; int/prin split shifts by month |
| 28-58 JFK Blvd (Bayonne) | Signature (Rialto/Quantum) | 3.40% amort | **$96,235.43** (Jul, Aug) | Constant P&I exact |
| The Crest at Princeton Meadows | Berkadia | 3.35% amort | **$520,041.97** (Aug, Sep) | Constant P&I exact |
| Villages of Independence | PGIM (Prudential) | 5.23% amort | **$78,099.37** (Jun, Jul) | Constant P&I exact |
| Villages of Whitewater I | Bellwether | 4.70% amort | **$59,083.22** (Jun, Jul) | Constant P&I exact |

These confirm the engine's rate, Actual/360 vs 30/360 day-count, IO-vs-amortizing behavior, and the
constant-payment amortization — all correct to the penny.

---

## B. Floating loans — reconcile at the invoice's REAL rate (3 loans / 5 invoices)

The app prices floating loans off an **offline SOFR fallback (~3.63% base)**, so its rate is a placeholder;
in production with live SOFR it tracks the real rate. The invoices give us the actual current rates:

| Loan | App (offline) | **Invoice real rate** | Reconciliation |
|---|---|---|---|
| Avalon White Plains (senior) | 5.38% | **5.372%** (Jul) → **5.421%** (Aug) | Interest ties exactly at the real rate; app proxy within ~0.04% |
| Reatta Ranch | 6.13% | **6.1875%** | Ties at the real rate; app proxy within ~0.06% |
| Legacy at Kissimmee | 7.63% on $41M | **~7.646%** on **$37,688,268 drawn** | See finding #4 — construction draw balance |

The engine math is correct; only the index level differs (expected). **Action: none required** — but the
real rates are now on record, and in the live app they'll match closely.

---

## C. Findings to act on

**1. Pepper Building — STILL OUTSTANDING (answers open question Q4).**
The app models Pepper as matured 8/9/2024 (no 2026 schedule). The invoice (Trimont, loan 300572249, due
**8/9/2026**) shows it **live at $44,000,000 @ 6.36448%** (real Term SOFR + 3.15%), Actual/360, interest
$241,143.08. So it did **not** pay off in 2024 — it ran to its final extended maturity (8/9/2026).
*The statement also carries a past-due late charge of $16,213.81 and a misc fee — worth raising with Azriel.*
→ **Un-mature Pepper: current balance $44M (down from the $53.16M commitment), rate ~6.36%, active to 8/9/2026.**

**2. The Mint (Rahway) — the app says interest-only, but it's AMORTIZING.**
Invoice (BHI 507135) bills **principal** ($23,428.39 in Aug, $65,439.49 in Sep), balance amortized to
**$57,847,614** (app carries the full $58M), rate **6.517%** (app 6.52%), constant total **$369,005.22**.
The app's "IO 36-month" model is wrong — this loan is already amortizing. → **Needs the loan doc to re-model
(amortization term / IO length). The Mint was never validated against an executed document.**

**3. The Mews at Princeton — rate is 6.801%, app has 6.80%.**
Invoice (BHI 507743) confirms Actual/360 IO on the full $107,100,000, but at **6.801000%** (app 6.80%) —
a $89/month difference on a 30-day cycle. BHI also bills irregular cycles (a 33-day August stub vs the
app's calendar month), a servicer-cycle nuance, not a convention error (both Actual/360). → **Fix rate to 6.801%.**

**4. Legacy at Kissimmee — actual drawn balance $37,688,268 (answers open question Q7).**
Construction loan modeled at the full **$41M commitment**; the invoice bills the **drawn balance
$37,688,268** at the real rate (~7.646%). Both Actual/360, both IO — the difference is the draw-down, which
the app doesn't track. → **Note the current drawn balance; it will keep rising as the project draws.**

**5. Living Lofts (Middlesex) — the app's ARM reset is wrong for the current period.**
Two issues: (a) pre-reset, the invoice P&I is **$151,604.11** vs the app's **$150,722.27** (~$882/mo);
(b) more seriously, the app **resets this ARM to 6.79% in Aug 2026** (payment jumps to $223,530), but the
invoice shows it **still at ~3.1–3.3%** ($151,604.11 in both July and August). The app's reset timing and/or
rate does not match reality. → **Needs the loan doc / actual reset terms — this is the most material modeling gap.**

---

## D. Billed loans that are NOT in the app

| Loan | Servicer | Amount | Rate | Structure |
|---|---|---|---|---|
| **Creekside at Grand Prairie** (South Central Development LLC) | Arbor Multifamily Lending | **$50,000,000** | **6.97867%** | Interest-only, Actual/360 (int $290,777.92 / $300,470.51) |

Genuinely absent from the app (distinct from the two Arbor/Fannie loans we do hold). → **Add it if it belongs
in the portfolio — we'd need its loan agreement.**

*(Pepper also appeared as "not in app" to the critics only because its modeled schedule ends in 2024 — it
IS in the app, just mis-modeled as matured; see finding #1.)*

---

*Reconciliation held locally with the loan validation work. No app data changed by this pass — findings
above are proposed corrections pending your direction / the underlying documents.*
