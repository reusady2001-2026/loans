# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | built | critic running (Crest regression gate) | 368 ok; 10 pre-existing defects fixed |
| E2 | Classifier | A− | building | — | — |
| E3 | In-place NOI tie | A | built | critic running (Crest regression gate) | 368 ok; residuals now reported |
| E4 | Underwritten NOI | B+ | **A** (critic) → patching minors | A — bit-identical to released engine on all valid inputs; hand-calc to the cent | 174 ok; 6/6 mutants killed |
| E5 | Single-property sizing | A− | **A** (critic) → patching minors | A — fixed negative max-loan leak; DEFAULTS to be frozen; glue blank-box display fixed | 174 ok; 200/200 random + Crest regression identical |
| P1 | Per-property store | F | **B** (critic) → patching | B — 1 major (name write-once / address edit orphans record → ensure refresh + rename), 3 minor, 4 surviving mutants — fed back | 202 ok; 20/24 mutants killed |
| P2 | Per-property NOI → ratios | C | **A** (final, re-checked) | A — re-check A; 1 nit (synthetic `reserves` key) being patched; its glue DSCR-basis finding fixed | 179 ok; 9/9 mutants killed; independent hand-calc to the cent |
| P3 | Upload → property | D | **A** (critic) → patched, re-check running | A — nits patched; its 2 major glue findings (basis-toggle rewrote records; misleading toast) fixed in glue | 398 ok; 7/7 mutants killed; Crest ties |
| P4 | Hand-edit sheet | F | built | critic running (incl. e2e; sign-coercion + hand-entry rulings) | 149 ok |
| P5 | Controllable flags | F | **A** (final, re-checked) | A — re-check A; 2 comment nits being fixed | 118 ok; 10/10 mutants killed |
| P6 | Per-property assumptions | D | **B** (critic) → patching | B — module correct (overrides verified live to the cent); e2e broken (hidden #addBtn), panel overlaps at mount width, no range sanity — fed back | 132 ok; 6/6 mutants killed |
| P7 | Portfolio roll-up | F | **B** (critic) → patching | B — rows/collapse/ratios exact, e2e PASSED live; totals DSCR/DY misleading (mixes non-NOI'd properties) → redefine over NOI'd properties with scope; maturity hook added in glue | 121 ok; 5/5 mutants killed; e2e pass ×2 |
| P8 | "What to push" scan | F | built | critic running (incl. e2e + rule semantics) | 195 ok (real calc) |
