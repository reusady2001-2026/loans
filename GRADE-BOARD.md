# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | built | critic running (Crest regression gate) | 370 ok; 10 pre-existing defects fixed |
| E2 | Classifier | A− | building | — | — |
| E3 | In-place NOI tie | A | built | critic running (Crest regression gate) | 370 ok; residuals now reported |
| E4 | Underwritten NOI | B+ | **A** (critic) → patching minors | A — bit-identical to released engine on all valid inputs; hand-calc to the cent | 174 ok; 6/6 mutants killed |
| E5 | Single-property sizing | A− | **A** (critic) → patching minors | A — fixed negative max-loan leak; DEFAULTS to be frozen; glue blank-box display fixed | 174 ok; 200/200 random + Crest regression identical |
| P1 | Per-property store | F | **B** → patched, re-check running | all findings patched: name refresh + rename (glue hooks it on loan edits), proto-safety, source migration, taxonomy code validation; 4 surviving mutants now die | 281 ok; 24/24 mutants killed |
| P2 | Per-property NOI → ratios | C | **A ✓ done** | A — re-checked A; all findings closed; its glue DSCR-basis finding fixed | 182 ok; 9/9 mutants killed; independent hand-calc to the cent |
| P3 | Upload → property | D | **A ✓ done** | A — critic: "A the moment the test fix lands"; fix landed (code chosen dynamically), suite green, glue fixes verified | 402 ok; 7/7 mutants killed; Crest ties |
| P4 | Hand-edit sheet | F | **C** (critic) → patching | C — contract met (e2e PASSED live) but 2 product majors: sign slip inflates NOI; 27/32 lines not hand-enterable — fed back with fixes | 149 ok; 5/6 mutants killed |
| P5 | Controllable flags | F | **A ✓ done** | A — re-checked A; all findings and nits closed | 118 ok; 10/10 mutants killed |
| P6 | Per-property assumptions | D | **B** (critic) → patching | B — module correct (overrides verified live to the cent); e2e broken (hidden #addBtn), panel overlaps at mount width, no range sanity — fed back | 132 ok; 6/6 mutants killed |
| P7 | Portfolio roll-up | F | **B** (critic) → patching | B — rows/collapse/ratios exact, e2e PASSED live; totals DSCR/DY misleading (mixes non-NOI'd properties) → redefine over NOI'd properties with scope; maturity hook added in glue | 121 ok; 5/5 mutants killed; e2e pass ×2 |
| P8 | "What to push" scan | F | **C** (critic) → patching | C — rules exact at node level (63/63 seeded) but e2e broken, expense rule backwards on negative lines, refi vs origination rate (currentRate hook added), past-maturity wording; found a glue re-entrancy error on every sheet edit (fixed) | 195 ok; 6/6 mutants killed |
