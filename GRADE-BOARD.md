# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | **B** → patched; BDX add-on pending, then re-check | B — patched: NOI-stop pinned, mixed-case "Gross Rent" restored, summary-first split, TOTAL EXPENSES ends detail from any phase, toNum currency/paren fix; twinBelow narrowing to be ruled on | 497 ok; mutants A/B die |
| E2 | Classifier | A− | **B** (critic) → patching | B — all 42 Crest re-tags confirmed, −97,207.19 base move ruled correct; 5 minors (roleOf proto lookup, flat "Pet Rent Income"→GPR, TRSH carve-outs lack repair exclusion, phone/DSL→CAB, plug rule pre-empted by headers) + BDX add-on — fed back | 689 ok; 6/6 mutants killed |
| E3 | In-place NOI tie | A | **B** → patched; BDX add-on pending, then re-check | B — patched: snap gone (cents rounding), 1¢ real gap kept, $0 review noise gone, TRSH COL caption distinct, expense-side bad debt split out of GA (worksheet BDX line) | 497 ok; Crest ties to the cent |
| E4 | Underwritten NOI | B+ | **A ✓ done** | A — re-checked A: bit-identical to released engine (200/200 random sweep, 0 diffs); Crest +4,738.85 reconciled to the cent as an E2 category move; one unreachable nit ("(1e5)" text) routed to builder | 207 ok; 6/6 mutants killed; DEFAULTS frozen (verified) |
| E5 | Single-property sizing | A− | **A ✓ done** | A — re-checked A; negative max-loan leak closed; glue blank sizing box now refilled from s.params (index.html:3374) | 207 ok; 987-entry regression byte-identical |
| P1 | Per-property store | F | **A ✓ done** | A — re-checked A; two test nits closed (296 tests, hostile seed ×3 reserved names, call-time taxonomy binding proven); BDX mirror pending | 296 ok; 25/25 mutants killed |
| P2 | Per-property NOI → ratios | C | **A ✓ done** | A — re-checked A; all findings closed; its glue DSCR-basis finding fixed | 182 ok; 9/9 mutants killed; independent hand-calc to the cent |
| P3 | Upload → property | D | **A ✓ done** | A — critic: "A the moment the test fix lands"; fix landed (code chosen dynamically), suite green, glue fixes verified | 402 ok; 7/7 mutants killed; Crest ties |
| P4 | Hand-edit sheet | F | **B** → patched; BDX row pending, then re-check | B — patched: deductions stored negative (typed as magnitude), all §3 rows drawn with per-section fold, same-value guard, toggle commits pending edit, proto-safe lookups, Enter/Shift+Enter navigation, re-entrancy latch | 250 ok; e2e 86/86 live |
| P5 | Controllable flags | F | **A ✓ done** | A — re-checked A; all findings and nits closed | 118 ok; 10/10 mutants killed |
| P6 | Per-property assumptions | D | **B** (critic) → patching | B — all 7 earlier findings closed and verified (53 e2e live, 12/12 mutants); 1 minor: focus lost to <body> after an accepted commit (rebuild) + 4 nits — fed back | 233 ok; e2e 53 ok |
| P7 | Portfolio roll-up | F | **B** (critic) → patching | B — all 8 earlier findings closed (hand-calc to the cent, 11/12 mutants); 2 minors: zero-balance NOI'd property inflates totals DY (per-ratio scope needed), failed-row nulling untested + 2 nits — fed back | 163 ok; e2e pass ×3 |
| P8 | "What to push" scan | F | **A ✓ done** (3 nits closing) | A — re-checked A: all 11 findings closed, live scan matches the app's own refi/maturity figures, 13/15 mutants killed (2 equivalent); contract §4/§8 amended to match | 259 ok; e2e 11/11 live |
| G | Glue (index.html wiring) | — | **built** → critic re-check running | rename outcomes voiced in the toast; manage row (move / delete a saved model); records-no-loan-uses list with Move / Delete; delete-loan notice; contract §4/§8 amended | glue e2e 42/42 live, zero page errors |
