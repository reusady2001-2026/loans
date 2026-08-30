# Questions for Azriel — Loan Portfolio

These are the open items where the executed closing documents we have don't tell us the
**current** state of the loan, or where a document is missing. Each is a real question — not
a guess and not something already resolved. Grouped by loan.

*Prepared from the loan-by-loan validation and the reconciliation of the servicer billing
statements against the app's computed payments.*

---

## 1. K2 Sweetwater / FIU Residences — **two separate loans** (senior + mezzanine)

*Senior: AIG (National Union Fire Ins.), up to **$127,000,000**, LIBOR + 3.75% (floor 3.75%), interest-only.
Mezzanine: MSD Capital, up to **$20,000,000**, 13.50% fixed, interest-only. Both dated 12/20/2021.*

1. **Did construction reach substantial completion?** (targeted 5/31/2024.)
2. **What is the current maturity?** Both had an **initial maturity of 1/1/2026, which has passed**, with a
   one-year extension option to **1/1/2027** (0.25% fee). Was the extension exercised (→ 1/1/2027), or was
   the loan **refinanced / paid off** at the original 1/1/2026 date? Is each still outstanding today?
3. **Current funded/outstanding balance on each?** Both are modeled at their full commitments ($127M / $20M);
   a construction loan funds by draws, so the actual outstanding balance isn't in the closing documents.
4. **Prepayment / exit terms on each?** These weren't stated in what we have.
5. **Historical rate on the senior (LIBOR).** The senior was a LIBOR loan and LIBOR no longer publishes, so we
   can't reconstruct its past rates from a live feed. Do you have its **actual historical rates / statements**,
   or should we approximate with SOFR + the old spread? *(The mezz is fixed 13.50%, so this doesn't affect it.)*

---

## 2. The Pepper Building — 1830 Lombard St, Philadelphia

*FS CREIT / Rialto, up to **$53,160,000**, LIBOR + 3.15% (floor 3.30%), interest-only, dated 8/9/2021.*

1. **We need the current loan documents (modification / extension).** A Trimont billing statement (due
   **8/9/2026**) shows the loan **still outstanding at $44,000,000 @ 6.36448%** — it did **not** pay off in 2024.
   The original agreement can't explain the current state: **how did the balance go from the $53.16M commitment
   to $44M** (a principal paydown, or was it never fully drawn)? **What is the current maturity and rate?**
   We've deliberately left the app's Pepper record unchanged until we have these.
2. **Past-due late charge.** That same statement carries a **past-due late charge of $16,213.81** — is that expected?
3. **Historical rate (LIBOR).** Same as the K2 senior — Pepper was a LIBOR loan; do we have its actual historical
   rates, or approximate with SOFR?

---

## 3. Albany — 1415 & 1395 Washington (student housing)

*Valley National Bank, split into a Building Loan (hard costs) + Project Loan (soft costs) under NY Lien Law.
1415: building **$40,199,260** + project **$16,998,373** (dated 11/21/2022).
1395: building **$4,434,670** + project **$6,943,894** (dated 2/28/2024). All Term SOFR + 4.25%, floor 5.00%, IO.*

> **⚠ Pulled from the app for now (v2.4.1).** These were added as **two loans per property** (a Building Loan + a
> Project Loan each, four records total). That split may not be how you want them tracked — two separate loans per
> property may be incorrect. **We've removed all four from the app pending your answer** and won't re-add them until
> you confirm the right structure.

0. **How should each property be tracked — one loan or two?** Under NY Lien Law the building and project loans are
   documented separately, but they're co-terminous and cross-collateralized. Do you want them as **one combined loan
   per property** (1415, 1395) or **two records each** (building + project)? Once you confirm, we'll re-add them.

1. **Are they still outstanding, and at what maturity?** All four notes carry an **Initial Maturity of 5/21/2026
   that has passed**, each with one 12-month extension to **5/21/2027** (conditioned on completion, ≥95% leased,
   DSCR ≥ 1.25). For **each** project: was the extension exercised (→ 5/21/2027), or was it **refinanced / paid
   off**? Is it still outstanding, and what is the **current balance on each note**?
2. **(Minor) The 1395 Building Loan Note.** We have the 1395 *Project* Loan Note but not the *Building* Loan Note —
   we inferred the building terms from the co-terminous project note (they were identical on the sister 1415 deal,
   and the $4,434,670 equals the agreement's total hard costs). If the actual 1395 Building Note is handy, please
   confirm its terms match.

---

## 4. Legacy at Kissimmee — 1225 Utica Dr, Kissimmee, FL

*Bank Hapoalim, **$41,000,000** construction loan, Term SOFR + 4.0% (floor 6.85%), IO, dated 11/26/2024.*

1. **Budget contingency.** The attached Budget shows a **hard-cost contingency of ~3.0%** ($1,400,000 on
   $45,984,399) and a **soft-cost contingency of ~7.3%** ($775,515 on $10,632,200), but the agreement's Budget
   definition requires **"at least ten percent (10%)."** Was that intentional (e.g., the clause read per-line-item),
   or is it an OCR artifact of the scanned budget page? *(The current drawn balance — **$37,688,268** — was
   answered by the BHI statement, so that piece is closed.)*

---

## 5. Living Lofts (Middlesex) — 150 Lincoln Blvd, Middlesex, NJ

*Investors Bank (now serviced by Citizens), **$35,296,600**, 5-year / 5-year hybrid ARM, fixed monthly payment
$151,604.11, maturity 7/1/2031.*

1. **We'd like the ARM rider to confirm:** the exact **reset index, margin, and any periodic or lifetime rate cap**,
   and **whether the loan negative-amortizes** if the interest ever exceeds the fixed $151,604.11 payment. *(We've
   modeled the reset off the historical 5-year Treasury, which lands at ~5.30% and matches the statements — but
   these specific terms aren't confirmed from a document. Today the app floors principal at $0 and holds the
   balance flat after the reset, which is correct only while the payment still covers the interest.)*

---

## 6. Files we still need from Azriel

These aren't questions — they're **documents to send us** so we can finish validating the book two ways
(loan agreement ↔ app, and servicer statement ↔ app). Two categories:

### A. Loans with NO billing statement (invoice) — 16
These are **in the app and validated against their loan agreements**, but no servicer invoice was sent, so we
couldn't do the second (billing-vs-app) cross-check. Please send a recent statement for each:

- K2 Sweetwater (FIU Residences) — Senior
- K2 Sweetwater — Mezzanine
- Avalon White Plains — Mezzanine
- Villages of Florence
- **Village at Bridgewater** †
- 40 N Euclid Ave (The Euclid)
- The Residences at Forest Park
- The Lofts at Lafayette Square
- Villages of Burlington
- Villages of Whitewater II
- Weaver Mill (Villages of Florence at Weaver Mill)
- **M Lofts** †
- 1415 Washington — Building Loan
- 1415 Washington — Project Loan
- 1395 Washington — Building Loan
- 1395 Washington — Project Loan

### B. Loans with NO loan agreement / note — 7
These are **in the app but we never received an executed loan document** — they were carried over from the
original data and modeled from other sources (a servicer statement, the app's prior data, or a description).
We need the actual **agreement / promissory note** to validate them properly:

- The Mews at Princeton *(only the BHI statement — rate fixed from it, but no note)*
- The Mint (Rahway) *(only the BHI statements — amortization modeled from them)*
- Queens Gate Apartments
- Living Lofts (Middlesex) *(also need the ARM rider — see §5)*
- **Village at Bridgewater** †
- 28-58 JFK Blvd (Bayonne)
- **M Lofts** †

Plus two **partial** items: the **1395 Washington Building Loan Note** (we have the Project note; the Building
terms are inferred from it — §3) and **The Pepper Building** current modification/extension documents (§2).

> **† Highest priority — no invoice AND no document.** **Village at Bridgewater** and **M Lofts** appear in
> *both* lists, so they're currently modeled with **no independent verification at all**. Please get these two first.

---

*Everything we DO have reconciles: the validated loan records tie to their executed agreements, and every
servicer statement we've checked ties to the app's computed payments — fixed and agency loans to the cent,
floating loans to their real historical rates.*
