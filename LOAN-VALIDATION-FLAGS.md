# Loan Record Validation — Flags for Azriel

Each loan currently in the app is being validated **one at a time** against its
**executed loan agreement**. Every change to a loan **term** is flagged below with:
the field, what the app had, what the document actually says, and **exactly where**
in the agreement the evidence is (page and section, with a quote).

- **[CORRECTION]** = the app had a wrong value.
- **[ADDED]** = the term was missing from the app record.
- **$MATERIAL** = the change moves a dollar figure (payment, balance, or balloon).

Page numbers are PDF pages of the executed agreement. Each corrected loan was then
re-verified against a schedule derived **only** from the note — every stated payment
and the full amortization schedule match the document **to the cent**.

---

## 1. Avalon Norwalk — Forethought Life Insurance Co. (KKR Loan No. 5300125), dated May 13, 2021

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Amortization structure** | Level annuity (~$359,484/mo P&I) | Interest **+ a fixed $361,684.80 principal** each month from 6/7/2029 | **PDF p.23**, definition of **"Required Amortization Payment"**: *"…commencing on June 7, 2029, and continuing through the Maturity Date, the monthly amount OF $361,684.80."* Supported by **"Monthly Debt Service Payment Amount"** (**PDF p.17**) = interest **+** Required Amortization Payment, and **§2.3 "Loan Payments"** (**PDF p.27**) — first payment 7/7/2021. | **$MATERIAL** |
| 2 | **Interest-only term** | 96 months | 95 months (first amortizing payment 6/7/2029) | Same as #1: amortization commences 6/7/2029 (PDF p.23); first payment 7/7/2021 (§2.3, PDF p.27) → 95 IO payments. | |
| 3 | **Prepayment** | *(blank)* | Yield Maintenance; YM Date 3/7/2031 | **PDF p.26**, definition *"'Yield Maintenance Date' shall mean March 7, 2031"*; **§2.4 Prepayments** (**PDF p.28**). | [ADDED] |
| 4 | **Replacement reserve** | *(blank)* | $6,479.17/mo | **§6.4.1 Replacement Funds** (**PDF p.79**): monthly *"one-twelfth of the product of (x) $250, multiplied by (y) the total number of units."* Units = **311** and the reserve = **$250/unit = $77,750/yr** per **Schedule 6, Initial Approved Annual Budget (PDF p.135, clean scan)**. 311 × $250 ÷ 12 = $6,479.17/mo. *(Corrected from an earlier $6,458.33 read off the OCR'd capex page, which showed 310 units; the clean Schedule 6 header states 311.)* | [ADDED] |

**Effect of #1:** balloon at 6/7/2031 corrected from **$76,682,634 → $70,879,564.80** (−$5.80M); 2029–2031 monthly debt service understated by ~$245k/mo before the fix.
**Noted (not app fields):** borrower = RK Norwalk LLC / Living Norwalk LLC; non-recourse with bad-boy guaranty (Stanley Rieder); cash-management sweep springs if DSCR < 1.10× (§ definition "Cash Management Sweep Period").

---

## 2. The Lofts at Lafayette Square — Fannie Mae Form 6001.NR / Arbor Commercial Funding I, LLC, dated May 10, 2019

*(Scanned document; the Summary of Loan Terms on PDF p.116 carries a real text layer — exact.)*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Interest rate** | 4.31% | **4.305%** | **Schedule 2 (Form 6102.FR), PDF p.115**: *"Fixed Rate 4.305%."* Confirmed by the note's stated payments, **PDF p.116** (exact text): IO $55,686.13 / $57,674.92 / $59,663.71 / $61,652.50 (28/29/30/31-day prior month) and **P&I $82,350.90** — these reproduce only at 4.305%. | **$MATERIAL** |
| 2 | **Prepayment** | *(blank)* | Yield Maintenance, ends 11/30/2030 | **PDF p.117, Section IV** "Yield Maintenance/Prepayment Premium Information": *"Yield Maintenance Period End Date: The last day of November, 2030"* (term 138 months). | [ADDED] |

**Noted (not changed):** loan number **"Fannie 892172"** does **not appear** in this agreement (its identifier here is Arbor **Matter No. 16102.445**). It is plausibly the Fannie-assigned number — consecutive with Forest Park's 892174, the sister Arbor loan closed the same day — so it was left as-is but **flagged as unverifiable from this document**. Replacement reserve $2,270.83/mo already matched the note (PDF p.117). 109 residential units; non-recourse.

---

## 3. Villages of Florence — Fannie Mae Form 6001.NR / Prudential Multifamily Mortgage, LLC, dated Nov 12, 2020

*(Scanned document; deal-terms pages 106–108 OCR'd on two passes and cross-checked.)*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Interest rate** | 3.12% | **3.115%** | **Schedule 2 (Form 6102.FR), PDF p.107**: *"Fixed Rate 3.115%"* (both OCR passes agree). Confirmed by stated payments, **PDF p.108**: IO $73,591.88 / $76,220.16 / $78,848.44 / $81,476.72 and **P&I $129,953.83** — reproduce only at 3.115%. | **$MATERIAL** |
| 2 | **Loan number** | "Fannie 891177 series" | **200393285** | Agreement's loan identifiers: **Loan #200393285** (also PMCC Tracking #82281, Property #81528). The prior value **"891177"** matches the executed number of **neither** this loan nor Villages of Burlington (whose real number, confirmed separately, is **200392849**) — it was a spurious identifier carried on the seed. | [CORRECTION] |
| 3 | **Prepayment** | *(blank)* | Yield Maintenance, ends 5/31/2030 (114 mo) | **PDF p.108, Section IV**: *"Yield Maintenance Period End Date: The last day of May, 2030"*; *"Yield Maintenance Period Term: One Hundred Fourteen (114) months."* | [ADDED] |
| 4 | **Replacement reserve** | *(blank)* | $2,783/mo | Summary of Loan Terms "Monthly Replacement Reserve Deposit" states a whole dollar (**$2,783**); $200/unit/yr × 167 units = $33,400/yr, entered by the lender as $2,783/mo. | [ADDED] |

---

## 4. Woodmont Forge at Hopewell — TIAA (Teachers Insurance and Annuity Association) / Nuveen, dated Feb 19, 2026

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Interest accrual basis** | Actual/360 (default) | **30/360** | **§2.2(b) (PDF p.6)**: *"Interest on the Principal shall accrue, for each Interest Period, based on a thirty (30) day month/360 day year."* Confirmed by the single fixed IO payment of $357,937.50 in **§2.2(a)(ii)**. | **$MATERIAL** (changes every payment) |
| 2 | **Loan term** | 85 months | 84 months | **§2.2(a) + Exhibit A**: first Payment Date **4/10/2026**; **Maturity Date 3/10/2033** (Recital B); payments on the 10th → 84 monthly payments. | [CORRECTION] |
| 3 | **Prepayment** | *(defaulted to YM)* | **flat 1% premium** (modeled as Step-down 1%) | **Exhibit A**: *"Prepayment premium: 1% of principal outstanding at prepayment."* **§2.3(a)**: no prepayment before 3/9/2028, then prepayable in full with the 1% premium. | [CORRECTION] |

**Note:** the note states the payments explicitly — IO **$357,937.50** through 3/10/2031 (§2.2(a)(ii)) and **P&I $435,928.92** from 4/10/2031 (§2.2(a)(iii)); both reproduce to the cent only at 30/360.

---

## 5. 40 N Euclid Ave ("The Euclid") — Fannie Mae Form 6001.NR (Green Rewards) / Greystone Servicing Company LLC, dated Dec 22, 2020

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Prepayment** | *(blank)* | Yield Maintenance, ends 6/30/2030 (114 mo) | **PDF p.120, Section IV** "Yield Maintenance/Prepayment Premium Information": *"Yield Maintenance Period End Date: The last day of June, 2030"*; term 114 months. | [ADDED] |

**Verified correct — no change needed:** loan amount $25,296,800; **rate 3.08%** (Actual/360) — the note's stated payments reproduce exactly at 3.08%: IO $60,599.89 / $62,764.17 / $64,928.45 / $67,092.74 (28/29/30/31-day) and **P&I $107,746.88** (Summary of Loan Terms, **PDF p.118–119**); 120-mo term; 48-mo partial IO (first P&I 2/1/2025, last IO 1/1/2025); 360-mo amortization; maturity 1/1/2031; effective 12/22/2020; **replacement reserve $1,417.67/mo** (Summary, **PDF p.120**). No loan number appears in the agreement (Fannie assigns post-closing) — the app's blank is correct. 85 units; borrower Living Euclid LLC / SR LIRH St. Louis LLC (tenants-in-common); guarantors Gershon Kassirer & Stanley Rieder; non-recourse.

*This was the first loan validated with no economic error — only the prepayment type was missing.*

---

## 6. Heritage Key Villas — Valley National Bank / Living Heritage LLC (+ HKMY entities), Promissory Note #95762090.2, made effective Jan 14, 2026

*(Note.pdf is a scan; page 1 carries a real text layer — exact — and pages 2–13 were read from the rendered images. The Commitment Letter is native text.)*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Prepayment** | *(blank)* | **Open / at par — prepayable in full or in part any time, no premium** | **Note §6 "Prepayment" (PDF p.2):** *"Borrower may prepay the Loan in part or in full prior to the Maturity Date."* Reinforced by the **Commitment Letter (p.1):** *"it is agreed that there will be no prepayment premium due if Borrower refinances the Loan at any time."* | [ADDED] |

**Verified correct — no economic change needed.** Every rate/term/date field already matched the executed Note:
- **Amount $61,000,000** — Note preamble (PDF p.1): *"the principal sum of up to SIXTY-ONE MILLION AND 00/100 ($61,000,000.00) DOLLARS."*
- **Rate 5.70% fixed, then +2.00% margin over the 5-yr UST** — **Note §1 (PDF p.1):** fixed **5.70%** through **2/28/2031**; on **3/1/2031** (the "Interest Rate Change Date") the rate becomes the **5-year U.S. Treasury CMT + 2.00% margin**. Modeled as Hybrid ARM, `index = ust5y`, `spread = 2.00%`, `armInitialFixedMonths = 60`.
- **12 months interest-only** — **Note §2(a)–(b) (PDF p.1):** interest-only monthly payments **3/1/2026 → 2/1/2027** (12 payments).
- **P&I on a 30-year amortization from 3/1/2027** — **Note §2 (PDF p.2):** *"…continuing…thereafter, Borrower shall make monthly installments of principal and interest…based upon…a thirty (30) year amortization schedule."*
- **Maturity 2/28/2036** — **Note §2(c) (PDF p.2):** *"the 'Maturity Date' shall mean February 28, 2036."*
- **Effective 1/14/2026** — Note preamble (PDF p.1).
- **Property address refined** to *"2089 Heritage Key Blvd, Kissimmee, FL 34744 (Osceola County)"* per the Commitment Letter (p.1); county confirmed by **Note §7 (PDF p.2)** ("City of Kissimmee and County of Osceola, State of Florida").

**Independent check:** a clean-room schedule built only from the Note terms reproduces the app's rendered schedule **to the cent on all 121 rows** — IO payments $270,433.33 / $289,750.00 / $299,408.33 (28/30/31-day, 5.70% Actual/360), first P&I **$354,044.26** (2/28/2027), the 3/1/2031 reset, and the balloon **$52,777,708.31 → $0.00** at 2/28/2036.

**Conventions noted for Azriel (not documented terms — modeling choices):**
- **Day-count:** the Note is **silent** on the interest-calculation basis (payments are *"calculated by Lender"*). The app uses **Actual/360** — the standard commercial-bank convention for a lender like Valley National — but this is **not stated in the Note**; if the bank's amortization schedule uses 30/360, every payment would differ slightly.
- **Rate floor:** the app carries a `rateFloor = 5.70%`, but the **Note states no floor and no cap** on the adjusted rate. It is a modeling guard only and **does not bind** (the projected reset rate is above it).
- **Reset projection:** offline, the app projects the 3/1/2031 reset at the 5-yr UST catalog fallback (**4.16%**) + 2.00% = **6.16%**; the balloon figure above assumes that projection. The actual reset rate will be the then-current 5-yr UST + 2.00%.
- **Not app fields:** borrower = Living Heritage LLC + HKMY/2HKMY/3HKMY/4HKMY LLC (joint & several); guarantor = ARBS Real Estate USA Holdings LLC, limited recourse to **25%** of the outstanding balance; DSCR covenant **1.25×** (§10(a)); manager = Living Residential Florida LLC (§10(g)); commitment fee 0.25% ($152,500).

---

## 7. Avalon White Plains — New York Life Insurance Company / Living White Plains LLC, Promissory Note #1628007744.8, dated Feb 10, 2026 (Loan No. 374-1613)

*Two documents: the **Loan Agreement** (native-text .md, reading copy) defers every rate/payment term to the **Promissory Note** (§2.2). The Note (native text) supplies them. The reserve came from the Loan Agreement.*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **First Payment Date** | 2029-02-10 (= maturity — impossible) | **March 10, 2026** | **Note, Definitions:** *"'First Payment Date' means March 10, 2026."* Payments are interest-only on the 10th of each month (Note §2(b)). *(Does not change the rendered schedule — the engine anchors off maturity − term — but the stored value was wrong.)* | [CORRECTION] |
| 2 | **Prepayment** | *(blank)* | **Closed-Period lockout (2/10/2026–2/10/2027), then a Minimum-Interest make-whole** | **Note §4 + Definitions:** *"'Closed Period' means the period commencing on the date hereof and ending on February 10, 2027"*; *"Borrower may not prepay the Loan during the Closed Period"* then may repay in full with a **Prepayment Fee** = the amount by which the **"Minimum Interest Amount … equal to $6,217,253"** exceeds interest actually paid (plus a Breakage Fee if off a Payment Date). Modeled as **Yield Maintenance** — the closest app category for a make-whole/minimum-interest prepayment. | [ADDED] |

**Verified correct — no economic change needed.** Every rate/term/date already matched the Note:
- **Amount $96,000,000** — Note preamble.
- **Floating; Interest Rate = greater of (Term SOFR + Spread) and the Floor** — Note Definitions: *"'Interest Rate' … the greater of (a) the sum of (i) the Benchmark …, (ii) the Spread … and (iii) the Benchmark Adjustment, and (b) the Floor Interest Rate."*
- **Spread 1.75%** — Note: *"'Spread' shall mean 1.75%."*
- **Rate floor 4.80%** — Note: *"'Floor Interest Rate' … equal to 4.80% plus the Benchmark Adjustment"* (Benchmark Adjustment for Term SOFR = 0%).
- **Index = 1-Month CME Term SOFR** — Note: *"The Benchmark on the date hereof is Term SOFR"* / *"'Term SOFR' … '1 Month CME Term SOFR'."*
- **Maturity 2/10/2029** — Note: *"'Maturity Date' shall mean the Payment Date in February, 2029"* (Payment Date = the 10th), with two 12-month extension options to 2/10/2031 (Schedule 1). App carries the initial maturity.
- **36-month term, fully interest-only** — Note §2(b): interest-only every Payment Date through the Maturity Date; §2(c): entire principal due at maturity.
- **Interest accrual Actual/360** — **Note §1 (explicit):** *"multiplying (a) the actual number of days elapsed … by (b) a daily rate equal to the Interest Rate … divided by three hundred sixty (360) by (c) the outstanding principal balance."* (App default Actual/360 — this time the Note states it outright.)
- **CapEx reserve $8,480/mo** — **Loan Agreement §3.3(a):** *"an amount equal to $8,480 (the 'CapEx Reserve Amount')."*

**Independent check:** a clean-room schedule from the Note reproduces the app's rendered **36 rows to the cent** — first interest-only payment **$401,706.67** (28 days, 3/10/2026) and the balloon **$96,444,746.67** (full $96,000,000 principal + final interest) at 2/10/2029. Floating rate is forward-unknowable; offline the app prices Term SOFR at its 3.63% catalog fallback → all-in **5.38%** (floor 4.80% doesn't bind), and the reference adopts that same rate.

**Conventions / context noted for Azriel (not app-field changes):**
- **Rate cap not added to the record.** The Loan Agreement (§9.1) requires Borrower to buy an interest-rate cap striking **Term SOFR at 4.00%** (all-in ≈ 5.75%), but that is a **separate hedge instrument**, not a cap on the Note's Interest Rate (which is uncapped). Left off the loan record deliberately; noted here.
- **Full recourse** — Loan Agreement §11.1 (*"Borrower shall be personally liable for the entire Indebtedness"*) — unusual for CRE, but not a tracked field.
- **Companion Mezzanine loan $24,000,000** (Loan No. 374-1614) confirmed — Loan Agreement §1.1 defines the $24,000,000 Mezzanine Note; validates the separate *Avalon WP (Mezz)* record's amount.
- `annualRate` 5.36% in the record is a stored snapshot; for a floating loan the app computes the live rate from SOFR + spread, so the field is not used by the schedule and was left as-is.

---

## 8. Avalon WP — Mezzanine — New York Life Insurance Company, Mezzanine Promissory Note #1628007744.9-equiv, dated Feb 10, 2026 (Loan No. 374-1614)

*The $24,000,000 mezzanine companion to loan #7. Its note mirrors the senior note; the only economic difference is the spread.*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **First Payment Date** | 2029-02-10 (= maturity) | **March 10, 2026** | **Mezz Note, Definitions:** *"'First Payment Date' means March 10, 2026."* | [CORRECTION] |
| 2 | **Prepayment** | *(blank)* | **Closed-Period lockout (to 2/10/2027), then a Minimum-Interest make-whole** | **Mezz Note §4 + Definitions:** *"'Closed Period' … ending on February 10, 2027"*; **Prepayment Fee** = shortfall of the **"Minimum Interest Amount … equal to $2,010,563"** vs interest paid. Modeled as **Yield Maintenance**. | [ADDED] |

**Verified correct — no economic change needed:** amount **$24,000,000**; floating, **Term SOFR + 3.25% Spread**, **4.80% Floor**; fully interest-only; **Actual/360**; maturity **2/10/2029**; lien position **Mezzanine**. Independent clean-room schedule reproduces the app's **36 rows to the cent** (offline all-in rate SOFR 3.63% + 3.25% = **6.88%**): first interest-only payment **$128,426.67**, balloon **$24,142,186.67** (full $24,000,000 principal + interest) at 2/10/2029.

---

## 9. Villages of Burlington — Prudential Multifamily Mortgage, LLC (Fannie Mae Form 6001.NR), dated Feb 22, 2019 (Loan No. 200392849)

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Interest rate** | 4.88% | **4.875%** | **Schedule 2 (Form 6102.FR), Summary of Loan Terms:** *"Fixed Rate 4.875%."* Confirmed by the document's stated **Monthly Debt Service Payment $85,334.83**, which reproduces to the cent only at 4.875%. | **$MATERIAL** |
| 2 | **Loan number** | "Fannie 891177" | **200392849** | Summary of Loan Terms footer: *"PMCC Tracking #75119, Property #75497, Loan #200392849."* The prior "891177" is not on the executed document (and, per loan #3 above, is not Florence's either). | [CORRECTION] |
| 3 | **Prepayment** | *(blank)* | Yield Maintenance, ends 8/31/2033 (174 mo) | **Summary of Loan Terms §IV:** *"Yield Maintenance Period End Date: The last day of August, 2033."* | [ADDED] |
| 4 | **Replacement reserve** | $1,917/mo | **$1,917/mo — confirmed** | Summary of Loan Terms "Monthly Replacement Reserve Deposit" states a whole dollar (**$1,917**); $200/unit/yr × 115 units = $23,000/yr, which the lender enters as $1,917/mo. Seed's $1,917 was correct — **no change.** | ✓ |

**Verified correct:** amount **$16,125,000**; Fixed; **Actual/360** (Summary of Loan Terms — Interest Accrual Method box marked Actual/360); **no interest-only** (Interest Only Term = 0 months); **360-mo amortization, 180-mo term**; first payment 4/1/2019; maturity 3/1/2034. Independent schedule reproduces the app's **180 rows to the cent** — level P&I **$85,334.83**, balloon **$11,150,842.27** at 3/1/2034. Borrower Gregel-GAM Burlington LLC; non-recourse; 115 residential units. This is the only portfolio loan with **no interest-only period** at all.

---

## 10. The Crest at Princeton Meadows — Berkadia Commercial Mortgage LLC (Fannie Mae Form 6001 / 6241 Green Rewards), dated Sep 10, 2019 (Loan No. 9999092121)

*Validated in an earlier round (app v1.8.8–1.8.9) before this evidence log existed; re-verified here in full and to the cent. Source is an OCR reconstruction of a 121-page scan (mean word confidence 93.9%); the Summary of Loan Terms (Form 6102.FR, pages 106–109) came through cleanly and its **stated** payment amounts reproduce the core terms exactly.*

**No record change needed — every field ties to the document:**
- **Amount $118,000,000 · rate 3.35% Fixed · Actual/360** — proven to the cent by the document's **stated interest-only payments** (Summary of Loan Terms, p.108): *"$307,455.56 … 28-day month; $318,436.11 … 29-day; $329,416.67 … 30-day; $340,397.22 … 31-day."* These reproduce only at $118,000,000 × days × 3.35% ÷ 360.
- **360-month amortization** — proven by the **stated level P&I $520,041.97** (p.108, *"for the First Principal and Interest Payment Date and each Payment Date thereafter"*), which is the 30/360 annuity of $118,000,000 at 3.35% over 360 months.
- **72 months interest-only** — p.107: First Payment Date **November 1, 2019**; Last Interest Only Payment Date **October 1, 2025**; First Principal and Interest Payment Date **November 1, 2025**.
- **144-month term; maturity October 1, 2031; effective September 10, 2019** — pp.106–107.
- **Interest Accrual Method Actual/360** — p.107 (box marked Actual/360).
- **Loan number 9999092121** — *"Collateral Reference Number: 9999092121."*
- **Prepayment: Yield Maintenance** — Schedule 4, *"Standard Yield Maintenance — Fixed Rate"*; Yield Maintenance Period End Date **the last day of March, 2031** (138-month term), p.108.
- **Replacement reserve $15,723.00/mo** — p.109 (Monthly Replacement Reserve Deposit; initial deposit $0).

**Independent check:** a clean-room schedule reproduces the app's **144 rows to the cent** — first IO $340,397.22 (11/1/2019), first P&I $520,041.97 (11/1/2025), balloon **$103,408,003.54** at 10/1/2031.

**Notes for Azriel (not app-field changes):**
- **First Payment Date** now correctly reads **2019-11-01** after the cross-cutting model fix below — it previously held the first *P&I* date (2025-11-01). The document's stated *"First Payment Date November 1, 2019"* confirms the fix exactly.
- The **borrower is two tenants-in-common** — Crest Owners LLC **and** Crest 4204 LLC; the app tracks it as a single record.
- The Crest is what originally surfaced the interest-only **amortization engine bug** (principal was amortized over 288 months instead of 360, oversizing the P&I to $599,844.85). That was fixed in v1.8.7; the app now produces the documented **$520,041.97**, and this validation confirms it to the cent.
- **Source caveat:** this is the only validated loan sourced from an **OCR** rather than a clean text layer or clean scan. The Summary-of-Loan-Terms pages reproduce to the cent, but for a closing-binder-grade record the original Schedule 2 scan (pp.106–108) is worth one eyeball.

---

## 11. 36 Washington Ave (Carteret) — Customers Bank / Living Carteret Urban Renewal LLC (et al.), First Mortgage Note, dated Nov 7, 2025 — **NEW LOAN (added to the app)**

*Not previously in the app. Added from the executed closing set; all terms read directly from the native-text Note (#8697173.4) and First Mortgage.*

**Terms (from the Note unless noted):**
- **Lender: Customers Bank.** Borrower: Living Carteret Urban Renewal LLC, RK Carteret, TL K/L/S, and Villa Carteret Urban Renewal LLC (jointly & severally). Guarantors: Gershon Kassirer + ARBS Real Estate USA Holdings LLC.
- **Amount $64,000,000** — *"'Principal Amount' shall mean SIXTY-FOUR MILLION AND 00/100 ($64,000,000.00) DOLLARS."*
- **5.94% fixed, reset 12/1/2030** — *"'Interest Rate' shall mean … 5.94% … per annum"*; *"'Reset Interest Period' … from December 1, 2030 through … the Maturity Date"*; *"'Reset Interest Rate' … the greater of (i) … 5.94% … or (ii) the U.S. Treasury Note Yield plus 250 basis points"*; *"'U.S. Treasury Note Yield' … the five (5) year United States Treasury constant maturity."* → **Hybrid ARM**, index 5-yr UST, spread 2.50%, floor 5.94%, 60-mo initial fixed.
- **12 months interest-only** — §2(B): interest-only monthly Jan 1, 2026 → Dec 1, 2026.
- **P&I from 1/1/2027 on a 30-yr amortization; reset re-amortized over 26 yr** — §2(C)–(D).
- **Maturity December 1, 2035** — *"'Maturity Date' shall mean December 1, 2035."* Balloon at maturity (§2(E)).
- **Actual/360** — §2(F): *"calculated … based upon the actual number of days elapsed over a 360-day year."*
- **Prepayment: step-down** — 4% before the 1st Anniversary (12/1/2026); 1% years 1–5; **4% year 5–6** (right after the reset); 1% years 6–maturity; **open** in the last 90 days of each interest period. Modeled as Step-down 1% (the predominant rate).
- **No replacement/capital reserve** — the closing set holds a Rental Reserve (Escrow Deposit Agreement) and a DSCR reserve (Reserve Account Pledge), both debt-service reserves, not a capital reserve.

**Added as:** Hybrid ARM (5+5), $64,000,000 @ 5.94%, 5-yr UST + 2.50% floored at 5.94%, 12-mo IO, 360-mo amort / 120-mo term, reset at month 60. The app's schedule is internally coherent and ties to the cent (12 IO; first P&I 1/1/2027; reset 1/1/2031; balloon 12/1/2035 → $0).

**⚠️ FLAG — payment to be set as written in the agreement (next version):** the Note states the fixed-period **P&I is $384,807.04/mo** (§2(C)), which Customers Bank sized on a **true Actual/360** basis. The app currently computes a 30/360 annuity = **$381,247.02** (~$3,560/mo lower). Per Yuval, the app will get a **"fixed payment" option** in the next version to lock each loan's P&I to the figure written in its agreement; when that ships, set Carteret's fixed-period payment to **$384,807.04** (the reset-period payment recalculates at the reset rate over a 26-yr amortization). Recorded in `TODO.md`. The same likely applies to **1222 Commerce St** (the other Customers Bank Actual/360 Hybrid ARM).

---

## 12. Reatta Ranch — FS CREIT Originator LLC (Rialto) / Living Reatta Ranch LLC, Loan Agreement (Floating Rate), dated Dec 10, 2025 (Loan ID 20251209)

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Property address** | *(blank)* | 810 Tally Blvd, Justin, TX 76247 (300 units) | Loan Agreement property description / header. | [ADDED] |
| 2 | **Prepayment** | *(blank)* | Minimum Interest Maintenance Premium + 0.25% Exit Fee | **§2.3 Prepayments + Definitions:** prepayment requires *"the applicable Minimum Interest Maintenance Premium, … the Exit Fee"* ("Exit Fee" = 0.25% of original principal). Modeled as Yield Maintenance (make-whole/minimum-interest). | [ADDED] |

**Verified correct — no economic change needed:** amount **$47,000,000**; floating, **Interest Rate = greater of (1-mo Term SOFR + 2.50% Spread) and the 5.75% Floor** (§ "Applicable Interest Rate": *"6.3125% … for the [initial] period … thereafter … the greater of (A) the … Benchmark … and … the Spread, and (B) the Floor Rate"*); index Term SOFR; **fully interest-only**; **Actual/360** (*"the actual number of days elapsed"*); payments on the **9th**; first payment **1/9/2026**; initial stated maturity **12/9/2028** (two 1-yr extension options to 12/9/2030). Independent schedule reproduces the app's **36 rows to the cent** (offline SOFR 3.63% + 2.50% = 6.13%): first IO $248,094.72 (1/9/2026), balloon **$47,240,091.67** (full $47,000,000 + interest) at 12/9/2028.

**Notes for Azriel (not app-field changes):** the opening **6.3125%** rate applied only closing→12/14/2025 (a stub), then floating. The Benchmark is *rounded up to the nearest 1/16%*, and a rate cap is required (Benchmark Cap Rate 5.00% on SOFR) — a separate hedge, left off the record. `annualRate` 6.11% is a floating snapshot (the app computes the live rate from SOFR + spread). Borrower Living Reatta Ranch LLC (managed by ARBS); property manager TLBP Management.

---

## 13. Villages of Whitewater — Bellwether Enterprise Mortgage Investments, LLC (Fannie Mae Form 6001.NR), dated July 31, 2017

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Prepayment** | *(blank)* | Yield Maintenance, ends 1/31/2032 (174 mo) | **Summary of Loan Terms §IV:** Yield Maintenance Period End Date *"the last day of January, 2032."* | [ADDED] |

**Verified correct — rate already matched:** amount **$11,392,000**; **Fixed 4.700%** (already in the app — no change); **Actual/360**; **no interest-only**; 360-mo amortization, 180-mo term; first payment 9/1/2017; maturity 8/1/2032; **replacement reserve $1,522/mo** — *"Monthly Replacement Reserve Deposit $1,522"* (Summary of Loan Terms, Form 6102.FR, p.6; the document states a whole dollar). The document's stated **Monthly Debt Service $59,083.22** reproduces only at 4.700%; the app's schedule ties to the cent on all **180 rows** (balloon $7,797,931.42 at 8/1/2032). Borrower Gregel-GAM Harrison I, LLC; non-recourse; 83 units. *(Every figure here was verified against Yuval's clean scan of the Summary of Loan Terms pp.111–116 — no OCR caveat remains.)*

---

## 14. Villages of Whitewater II — Bellwether Enterprise Mortgage Investments, LLC (Fannie Mae Form 6001.NR), dated Feb 13, 2020

*The supplemental sibling to §13 — adjacent property in Harrison OH, same lender/principals, coterminous maturity (8/1/2032). Tenant-in-common borrower.*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Prepayment** | *(blank)* | Yield Maintenance, ends 1/31/2032 (143 mo) | **Summary of Loan Terms §IV:** Yield Maintenance Period End Date *"the last day of January, 2032."* | [ADDED] |

**Verified correct — rate already matched:** amount **$10,695,000**; **Fixed 3.830%** (already in the app — no change); **Actual/360**; **no interest-only**; 360-mo amortization, **149-mo term** (coterminous with the senior at 8/1/2032); first payment 4/1/2020; maturity 8/1/2032. The document's stated **Monthly Debt Service $50,016.96** reproduces only at 3.830% (the annuity ties exactly); the app's schedule ties to the cent on all **149 rows** (balloon $7,780,529.53 at 8/1/2032). Borrower **Gregel-GAM Harrison II, LLC (91.836%) + Richmark Harrison Investors, LLC (8.164%), as tenants-in-common**; non-recourse; 76 units. No loan number in the agreement (Fannie assigns post-closing).

**Replacement reserve $1,267/mo — kept, with a source note:** the converter could not cleanly read the Monthly Replacement Reserve Deposit cell (76 units × $200/yr ÷ 12 = $1,266.67 → **$1,267**, with a partially-legible trailing 7). The seed's **$1,267** (whole dollar, consistent with the Fannie whole-dollar convention confirmed on the sister loan §13) is retained — **not** re-derived to cents. Worth one eyeball against the original scan to make fully airtight.

---

## 15. Weaver Mill (Villages of Florence at Weaver Mill) — Prudential Multifamily Mortgage, LLC (Fannie Mae Form 6001.NR), dated Nov 12, 2020

*Sister loan to §3 (Villages of Florence) — same lender, same closing date, coterminous maturity (12/1/2030); consecutive PMCC tracking #s (this one **#82280**, Florence #82281). Combined ~$38.7M / 220 units, all maturing 12/1/2030.*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Interest rate** | 3.12% | **3.115%** | **Schedule 2 (Form 6102.FR), Summary of Loan Terms, p.107:** *"Fixed Rate 3.115%."* Confirmed by the document's **stated payments** (p.108): IO $20,203.54 / $20,925.10 / $21,646.65 / $22,368.21 (28/29/30/31-day) and P&I **$35,676.87** — all reproduce only at 3.115%. | **$MATERIAL** |
| 2 | **Prepayment** | *(blank)* | Yield Maintenance, ends 5/31/2030 | **Summary of Loan Terms §IV:** Yield Maintenance Period End Date *"the last day of May, 2030."* | [ADDED] |

**Verified correct:** amount **$8,339,000**; **Actual/360**; **24 months interest-only** (first payment 1/1/2021, last IO 12/1/2022, first P&I 1/1/2023); 360-mo amortization, 120-mo term; maturity 12/1/2030; **replacement reserve $883.33/mo** — *"Monthly Replacement Reserve Deposit $883.33"* (p.109; the document states this **with cents**, so the seed's $883.33 is correct — **no change**). Independent schedule reproduces the app's **120 rows to the cent** — first P&I $35,676.87 (1/1/2023), balloon **$6,861,091.82** at 12/1/2030. Borrower Gregel-GAM Florence-Weaver, LLC; non-recourse; 53 units. No Fannie loan number in the agreement (only PMCC Tracking #82280).

**Effect of #1:** at 3.12% the payments/schedule were slightly off; at the executed **3.115%** every row ties to the document. *(One of the two "cents reserves to re-check" is now resolved — Weaver Mill's $883.33 is the document's stated figure. Forest Park's $2,395.83 remains to be checked against its document.)*

---

## 16. Villages of Independence — Prudential Multifamily Mortgage, LLC (Fannie Mae Form 6001.NR), dated Dec 20, 2018 (Loan No. 200392816)

*The oldest of the Prudential/Gregel-GAM loans (Dec 2018) — highest rate in the portfolio.*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Loan number** | *(blank)* | **200392816** | Loan identifiers: *"PMCC Tracking #74578 · Property #74960 · Loan #200392816."* | [ADDED] |
| 2 | **Prepayment** | *(blank)* | Yield Maintenance, ends 6/30/2033 (174 mo) | **Summary of Loan Terms §IV:** Yield Maintenance Period End Date *"the last day of June, 2033."* | [ADDED] |

**Verified correct — rate already matched:** amount **$14,175,000**; **Fixed 5.230%** (already in the app — no change); **Actual/360**; **no interest-only**; 360-mo amortization, 180-mo term; first payment 2/1/2019; maturity 1/1/2034; **replacement reserve $1,822/mo** (stated whole dollar; seed correct — no change). The document's stated **Monthly Debt Service $78,099.37** reproduces only at 5.230%; the app's schedule ties to the cent on all **180 rows** (balloon $9,978,263.92 at 1/1/2034). Borrower Gregel-GAM Independence LLC; non-recourse; 106 units.

---

## 17. The Residences at Forest Park — Arbor Commercial Funding I, LLC (Fannie Mae Form 6001.NR), dated May 10, 2019

*Sister loan to §2 (The Lofts at Lafayette Square) — same lender, same closing date, same maturity (6/1/2031), overlapping tenant-in-common borrower entities; combined ~$40.4M / 224 units.*

| # | Field | App had | Document says | Evidence | |
|---|---|---|---|---|---|
| 1 | **Interest rate** | 4.31% | **4.305%** | **Schedule 2 (Form 6102.FR), Summary of Loan Terms, p.115:** *"Fixed Rate 4.305%."* Confirmed by the document's **stated payments** (p.116): IO $79,650.15 / $82,494.80 / $85,339.45 / $88,184.10 (28/29/30/31-day) and P&I **$117,789.87** — all reproduce only at 4.305%. | **$MATERIAL** |
| 2 | **Prepayment** | *(blank)* | Yield Maintenance, ends 11/30/2030 | **Summary of Loan Terms §IV:** Yield Maintenance Period End Date *"the last day of November, 2030."* | [ADDED] |

**Verified correct:** amount **$23,788,000**; **Actual/360**; **84 months interest-only** (first payment 7/1/2019, first P&I 7/1/2026); 360-mo amortization, 144-mo term; maturity 6/1/2031. Independent schedule reproduces the app's **144 rows to the cent** — first P&I $117,789.87 (7/1/2026), balloon **$21,736,551.64** at 6/1/2031. Borrower is a four-entity **tenant-in-common** group (2709 Heath DE / HGWK Holdings DE / Deutsch 1124 DE / The Residences DE); non-recourse; 115 units.

**Replacement reserve $2,395.83 — kept, with a source caveat:** the annual is confirmed (**$28,750** = 115 units × $250/yr), but the Summary of Loan Terms was OCR-emptied, so the *monthly* figure ($28,750 ÷ 12 = **$2,395.83**) could not be cleanly read from the stated cell. Retained as-is (not re-derived away); worth one eyeball against the original scan. **Loan number "Fannie 892174"** is not stated in the agreement (which carries Arbor Matter No. 16102.446) — plausibly the Fannie-assigned number, consecutive with the sister Lofts' 892172, but unverified from this document (same caveat as §2).

**Effect of #1:** at 4.305% every row ties to the document; the 4.31% was a rounding. *(This resolves the second of the two "cents reserves to re-check" — Forest Park's annual is confirmed, monthly noted as OCR-uncertain.)*

---

## Cross-cutting model fix — "First Payment Date" now means the first payment of ANY kind

Per Yuval's direction: *"the first payment date is the date that we pay, no matter if it's principal or interest or both."* The field was previously modeled as **"First P&I Date"** — the first principal-and-interest payment *after* any interest-only period. For a fully interest-only loan that has no principal payment until the balloon, this wrongly recorded the **maturity date** as the "first payment" (what surfaced on Avalon White Plains).

**Fix (code):** the field is relabelled **"First Payment Date"**; its hint, the amortization-anchor fallback (`firstPaymentDate − 1` instead of `− (IO + 1)`), and the AI reading instruction now all treat an interest-only payment as a payment.

**Fix (data):** every interest-only loan's stored First Payment Date was moved from the first-P&I date to the **actual first scheduled payment** (the first interest-only payment) — 19 records. This is a display/definitional correction only: **no amortization schedule changed** (every schedule is anchored on maturity − term, not this field), re-confirmed by re-running the strict cent-level checks for Avalon White Plains, Heritage, and Euclid (all still match to the cent). Examples: Avalon WP Mezz 2029-02-10 → 2026-03-10; 40 N Euclid 2025-02-01 → 2021-02-01; Avalon Norwalk 2029-06-07 → 2021-07-07.

*(Observation for later, not changed here: a few loans whose payments fall on a day other than their maturity's day-of-month — e.g. Heritage Key Villas, maturity on the 28th but the note pays on the 1st — render their schedule dates on the maturity's day. That is a separate payment-day convention question, independent of this fix.)*

---

*Validation continues loan by loan. This file is updated as each agreement is reviewed.*
