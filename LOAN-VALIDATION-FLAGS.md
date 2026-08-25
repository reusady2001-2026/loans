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
| 4 | **Replacement reserve** | *(blank)* | $6,458.33/mo | **§6.4.1 Replacement Funds** (**PDF p.79**): monthly *"one-twelfth of the product of (x) $250, multiplied by (y) the total number of units."* Units = 310 (Schedule 6, PDF p.136). 310 × $250 ÷ 12 = $6,458.33. | [ADDED] |

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

*Validation continues loan by loan. This file is updated as each agreement is reviewed.*
