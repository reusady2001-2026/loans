# Operating Model — Interface Contract (all builders code against THIS)

Target: SPEC-v2.3.0 built to A — every property carries its own live operating model
(income/expense lines → NOI → DSCR/DY/LTV), filled by T12 upload OR by hand, per-property
assumptions, a portfolio roll-up, and a "what needs to be pushed right now" scan.

Decisions (locked by the operator):
- **One record per PROPERTY**, shared by all its loans (senior + mezz read the same NOI).
- Store **ANNUAL** dollars; UI offers a monthly *display* toggle (÷12 / ×12 on input).
- **Controllable** flag per line: `RET` (taxes) and `INS` (insurance) default **false**, every
  other expense defaults **true**; the user may flip any line's flag.
- Reserves handled **exactly as today**: `Underwriting.computeNOI` via `SetupBuilder.buildSetup`
  (a per-unit "reserves" line in the underwritten column; in-place side 0). No new convention.
- The critic + automated tests are the grade gate. Nothing is "A" on a builder's say-so.

## 0. Hard rules for every builder
- Create ONLY the files assigned to you. **Never edit `index.html`** (the orchestrator wires
  the UI glue). Never edit another builder's module.
- Modules are **UMD, dependency-free, browser + node**, exactly like `t12-parse.js`:
  `(function (root, factory) { var api = factory(deps…); if (module) module.exports = api; if (window) window.<Name> = api; })(...)`.
  Resolve deps with `require("./x.js")` in node, `root.X` in the browser.
- **No new npm dependencies.** Vanilla JS. Match the codebase's style (compact, commented on *why*).
- **Never read or write the loans store** (`localStorage["ldsHub.loans.v7"]`) or mutate any
  loan object. The operating model is a *separate*, isolated store.
- Every module ships a **node test** at `test/<module>.test.js` (plain `node`, no framework:
  print `  ok   …` / `  FAIL …`, `process.exit(1)` on any failure). UI modules ALSO ship a
  Playwright-Electron e2e at `test/e2e/<module>.e2e.js` (see §9) that runs after integration.
- Tests must be real: assert exact numbers (to the cent) against hand-computed expectations or
  the fixture's printed figures. A test that can't fail is a defect.

## 1. Property key — how loans map to a record
Use the app's existing key (index.html:5257):
```
propertyKey(loan) = "addr:" + lowercased trimmed loan.propertyAddress   // if present
                  else "name:" + lowercased trimmed (loan.propertyName || loan._id)
loansForProperty(loan) → all loans sharing that key, senior(s) first, mezz last
```
Modules receive `propKey` strings and hook functions; they never compute keys themselves.

## 2. Storage (P1 — `operating-store.js` → `OperatingStore`)
```
localStorage key: "ldsHub.operating.v1"
value: { version: 1, records: { [propKey]: OperatingRecord } }

OperatingRecord = {
  propKey: string,
  propertyName: string,            // display name
  units: number|null,
  period: string|null,             // e.g. "T12 ending 2025-06-30"
  lines: { [code]: Line },         // taxonomy codes, see §3
  assumptions: Assumptions|null,   // null = inherit the global defaults
  meta: { createdAt: ISO, lastUpdated: ISO, sourceFile: string|null }
}
Line = {
  annual: number,                  // ANNUAL dollars. Sign as on the statement: income +, the
                                   // rental deductions (VAC, CONC, BD, MOD, EMPL) NEGATIVE, expenses +.
  prevAnnual: number|null,         // the value before the last change (expense-shock detection)
  controllable: boolean,           // default per §3; user-toggleable
  source: "t12"|"manual"|"budget",
  updatedAt: ISO,
  note: string|null
}
Assumptions = { vacancyPct, mgmtPct, reservePerUnit,
                sizing: { capRate, ltvMax, dscrMin, dyMin, intRate, amortYears } }
```
API (all synchronous, all persist immediately via `save()` unless noted):
```
OperatingStore.init({ storage?, now? })  // storage = {getItem,setItem} (node tests inject a Map-backed fake); now = () => ISO
OperatingStore.load()                    // reads + migrates; returns state. Corrupt JSON → fresh empty state, never throws.
OperatingStore.all()                     // { [propKey]: record }  (fresh copy, callers can't mutate the store by reference)
OperatingStore.get(propKey)              // record | null
OperatingStore.ensure(propKey, { propertyName, units? })   // create-if-missing, returns record
OperatingStore.setLine(propKey, code, { annual, source, controllable?, note? })
                                         // sets prevAnnual = previous annual when it changes; stamps updatedAt + meta.lastUpdated
OperatingStore.setLines(propKey, { [code]: { annual, source, controllable?, note? } }, { sourceFile?, period? })   // bulk; one save
OperatingStore.removeLine(propKey, code)
OperatingStore.setControllable(propKey, code, bool)
OperatingStore.setAssumptions(propKey, patch | null)   // deep-merge patch; null clears → inherit
OperatingStore.setUnits(propKey, n)   OperatingStore.setPeriod(propKey, s)
OperatingStore.remove(propKey)
OperatingStore.save()
OperatingStore.KEY === "ldsHub.operating.v1"
```
Isolation is an acceptance test: after any sequence of writes, `storage["ldsHub.loans.v7"]` is
byte-identical and no loan object passed anywhere has changed.

## 3. Taxonomy (P5 — `operating-taxonomy.js` → `OperatingTaxonomy`)
Fixed row order, identical for every property (drives the sheet and the roll-up):
```
income  : GPR, EMPL, MOD, VAC, CONC, BD                       // rental block (deductions negative)
other   : RUBS, "TRSH RUB", "TRSH COL", PARK, PET, MTM, LATE, APP, ADM, AMEN, COM, CAM, ANT, OTH
expense : RET, INS, UTIL, RM, CS, PAY, MGMT, GA, MKT, TRSH, CAB, PLL
```
```
OperatingTaxonomy.ORDER            // the array above, in order
OperatingTaxonomy.section(code)    // "rental" | "other" | "expense"
OperatingTaxonomy.role(code)       // "income" | "expense"   (must agree with T12Classify.roleOf)
OperatingTaxonomy.label(code)      // reuse SetupBuilder.LABEL; unknown code → the code itself
OperatingTaxonomy.defaultControllable(code)   // RET, INS → false; other expenses → true; income → true
OperatingTaxonomy.CONTROLLABLE_DEFAULT        // the map
```

## 4. Derived math (P2 — `operating-calc.js` → `OperatingCalc`)
Same engine as today — no new financial logic:
```
OperatingCalc.derive(record, globalDefaults)
  → { egi, opex, inPlaceNOI, underwrittenNOI, egiUW, opexUW, worksheet, sizing, assumptions }
  // categorySums = { code: line.annual } ; assumptions = deepMerge(globalDefaults, record.assumptions)
  // calls SetupBuilder.buildSetup({ categorySums, units: record.units, benchmarks: assumptions })
  // inPlaceNOI = result.inPlace.noi ; underwrittenNOI = result.underwritten.noi (reserves as today)
  // egi/opex = the in-place EGI / total opex from the same result
OperatingCalc.effectiveNOI(record)          // inPlaceNOI if the record has any lines, else null
OperatingCalc.perLoan(record, loans, hooks) // one row per loan on the property
  → [{ loanId, annualDS, balance, value, dscr, dy, ltv }]
  // hooks = { annualDebtService(loan), currentBalance(loan), capRate(loan) }
  // dscr = NOI / annualDS ; dy = NOI / balance ; value = NOI / capRate(senior) ; ltv = balance / value
  // any ratio is null when NOI <= 0 or its denominator <= 0 (mirrors loanDSCR/loanDebtYield/loanLTV)
OperatingCalc.stack(record, loans, hooks)   // the COMBINED position (all loans summed): { annualDS, balance, value, dscr, dy, ltv }
```
Bridge in index.html (orchestrator): `window.LDS_OPERATING_HOOKS = {
  annualDebtService: l => annualDebtService(compute(l).derived),
  currentBalance:    l => compute(l).derived.currentBalance,
  capRate:           l => loanCapRate(l),
  marketRate:        l => <the app's live market rate for that loan's product, or null>,
  propertyKey, loansForProperty, loans: () => loans, today: () => new Date(),
  globalDefaults:    () => uwState.input.bench }`

## 5. Upload → property (P3 — `operating-upload.js` → `OperatingUpload`)
Reuse the existing pipeline; only the destination changes.
```
OperatingUpload.linesFromParsed(parsed)     // parsed = T12Parse.parseGrid output
  → { lines: { code: annual }, printedNOI, builtNOI, ties: boolean }
  // uses SetupBuilder.fromParse(parsed).sums  (the same reconcile-to-printed-totals as today)
OperatingUpload.preview(store, propKey, parsed)
  → [{ code, label, before: annual|null, after: annual, source_before }]   // the reconcile/preview list
OperatingUpload.apply(store, propKey, parsed, { fileName, period, propertyName, units? })
  → { record, written: [codes], overwroteManual: [codes], inPlaceNOI, printedNOI, ties }
  // lines present in the parse are written with source:"t12" (overwriting, incl. manual ones —
  // reported in overwroteManual); lines ABSENT from the parse are left untouched.
  // meta.sourceFile = fileName, period set, one save.
```

## 6. Editable sheet (P4 — `operating-sheet.js` → `OperatingSheet`)
Pure model + DOM render, no global state:
```
OperatingSheet.buildRows(record, derived, { basis: "annual"|"monthly" })
  → [{ code, label, section, role, value /*display basis*/, annual, controllable, source, updatedAt, editable:true }]
    + subtotal rows: ERI, EGI, OPEX, NOI (editable:false)  — order per §3
OperatingSheet.render(mountEl, { record, derived, basis,
    onEdit(code, annualValue), onToggleControllable(code, bool), onBasisChange(basis) })
```
- Inline number inputs per editable row; `data-op-code="<code>"` on each row, `data-op-input`
  on the input, `data-op-ctl` on the controllable toggle, `#opBasisToggle` for the basis switch.
- Monthly basis displays annual/12 and converts an edit back ×12 before `onEdit`.
- Shows each line's source badge (T12 / manual / budget) and last-updated date.

## 7. Assumptions panel (P6 — `operating-assumptions.js` → `OperatingAssumptions`)
```
OperatingAssumptions.resolve(record, globalDefaults)  → effective Assumptions (deep merge)
OperatingAssumptions.isOverridden(record, path)       // e.g. "vacancyPct", "sizing.capRate"
OperatingAssumptions.render(mountEl, { record, globalDefaults, onChange(patch), onReset() })
```
- Inputs with `data-op-assump="<path>"`; an "inherited"/"override" badge per field; `#opAssumpReset`.

## 8. Roll-up (P7 — `portfolio-rollup.js` → `PortfolioRollup`) and Scan (P8 — `action-scan.js` → `ActionScan`)
```
PortfolioRollup.buildRows(records, loans, hooks, globalDefaults)
  → { rows: [{ propKey, name, units, noi, uwNoi, dscr, dy, ltv, balance, maturity /*earliest*/, loans:n }], totals }
PortfolioRollup.render(mountEl, data, { onOpen(propKey) })   // `data-op-prop` on each row

ActionScan.scan(records, loans, hooks, globalDefaults, opts)
  → [{ propKey, name, kind: "dscr"|"dy"|"maturity"|"refi"|"expense", severity: 1..3,
       value, threshold, detail }]   // ranked: severity desc, then impact
  // dscr: stack dscr < dscrMin ; dy: stack dy < dyMin (per-property assumptions else global)
  // maturity: earliest loan maturity within opts.maturityMonths (default 18)
  // refi: hooks.marketRate(loan) != null && marketRate < loan.annualRate - opts.refiSpread (default 0.005)
  // expense: a NON-controllable line with prevAnnual != null and (annual - prevAnnual)/|prevAnnual| > opts.shockPct (default 0.15)
ActionScan.render(mountEl, flags, { onOpen(propKey) })     // `data-op-flag` rows
```

## 9. Testing
- Node: `node test/<name>.test.js`. Deterministic; inject `storage`/`now`.
- Fixture: `test/fixtures/crest-t12.xlsx` (real Crest T12; **present locally, git-ignored**).
  Its printed figures: TOTAL INCOME 18,323,614.31 · TOTAL EXPENSES 8,840,010.03 ·
  NET OPERATING INCOME 9,483,604.28 (row 672; a below-the-line NET INCOME 5,210,718.69 must be
  ignored). Read it with `require("./vendor/xlsx.full.min.js")` → `XLSX.read(buffer,{type:"buffer"})`
  → `sheet_to_json(ws,{header:1,raw:true})`. Tests must ALSO include synthetic grids so they
  run without the fixture (skip the Crest block with a clear "skipped: fixture missing" line).
- e2e (Playwright-Electron, run after the orchestrator wires the UI):
  ```
  const { _electron: electron } = require(process.env.GN + '/playwright');
  const app = await electron.launch({ executablePath: require('/home/user/loans/node_modules/electron'),
    args: ['/home/user/loans', '--user-data-dir=' + UDATA, '--no-sandbox'], cwd: '/home/user/loans' });
  const page = await app.firstWindow();  await page.route(/^https?:\/\//, r => r.abort());
  // run:  GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/x.e2e.js
  ```
  Mount hooks the orchestrator will provide in the Underwriting tab: `#opPropPick` (property
  `<select>`, option value = propKey), `#opSheetMount`, `#opAssumpMount`, `#opRollupMount`,
  `#opScanMount`; the T12 drop input stays `#uwFile`. Seed data through `window.ldsShell`/UI only.
  **Opening the tab:** it is NOT open by default. Use `test/e2e/_helpers.js` →
  `const { launchApp, openUnderwriting, pickProperty, ok } = require('./_helpers.js')`:
  `launchApp()` (fresh user-data dir, network blocked) → `openUnderwriting(page)` (clicks the
  "+" `#tabNewBtn`, then `[data-tabopen="underwriting"]` in the body-level menu, waits for
  `#uwView`/`#uwDrop`) → `pickProperty(page, "Avalon")` (selects by visible name, fires change).

## 10. Acceptance (what the critic grades against)
| # | Aspect | "A" = |
|---|---|---|
| E1 | T12 parsing (`t12-parse.js`) | Crest + synthetic: columns/footing auto-found; NOI = NET OPERATING INCOME; totals tie to printed footing to the cent; below-the-line rows ignored; malformed/empty grids never throw |
| E2 | Classifier (`t12-classify.js`) | On Crest, classified sums reconcile to each printed section total to the cent via fromParse; low-confidence lines surfaced; deterministic |
| E3 | In-place NOI tie (`setup-builder.js`) | `result.inPlace.noi === totals.noi` to the cent on every fixture; `inPlaceNOIReported` carried |
| E4 | Underwritten NOI (`underwriting.js`) | vacancy floor / mgmt % / reserve-per-unit match hand-calc with units set; pass-through lines unchanged |
| E5 | Sizing (`underwriting.js`) | value, loan@LTV/DSCR/DY, binding, implied LTV/DSCR/DY all match hand-calc to the cent |
| P1 | Store | schema §2; persists across reload; migrate; corrupt JSON safe; **byte-identical loans store** after any writes |
| P2 | Calc | derive/perLoan/stack match hand-calc to the cent; nulls on non-positive NOI; assumptions merge |
| P3 | Upload | Crest → record lines; inPlaceNOI ties 9,483,604.28; re-upload refreshes; untouched lines survive; preview correct |
| P4 | Sheet | rows in §3 order; edit → onEdit(annual) exact; monthly toggle ÷12/×12 exact; badges/dates shown |
| P5 | Taxonomy | order, role, label, controllable defaults (RET/INS false) exact; flips persist via store |
| P6 | Assumptions | resolve/isOverridden exact; reset clears to inherit; underwritten NOI uses overrides |
| P7 | Roll-up | one row per property (senior+mezz collapse to one), NOI/DSCR/DY/LTV/maturity exact vs calc; totals exact |
| P8 | Scan | each rule fires exactly on seeded cases and not otherwise; ranking correct; thresholds per-property |
