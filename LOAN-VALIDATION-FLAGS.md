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
| 2 | **Loan number** | "Fannie 891177 series" | **200393285** | Agreement's loan identifiers: **Loan #200393285** (also PMCC Tracking #82281, Property #81528). The prior value **"891177" is Villages of Burlington's** loan number — a mislabel. | [CORRECTION] |
| 3 | **Prepayment** | *(blank)* | Yield Maintenance, ends 5/31/2030 (114 mo) | **PDF p.108, Section IV**: *"Yield Maintenance Period End Date: The last day of May, 2030"*; *"Yield Maintenance Period Term: One Hundred Fourteen (114) months."* | [ADDED] |
| 4 | **Replacement reserve** | *(blank)* | $2,783.33/mo | **Schedule 5 (Required Replacement Schedule), PDF p.114**: $200/unit/yr × 167 units = $33,400/yr ÷ 12 = $2,783.33/mo. (Spreadsheet not machine-readable; read off the scan by hand.) | [ADDED] |

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

*Validation continues loan by loan. This file is updated as each agreement is reviewed.*
