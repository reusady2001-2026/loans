# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | built | critic running (Crest regression gate) | 368 ok; 10 pre-existing defects fixed |
| E2 | Classifier | A− | building | — | — |
| E3 | In-place NOI tie | A | built | critic running (Crest regression gate) | 368 ok; residuals now reported |
| E4 | Underwritten NOI | B+ | built | critic running (regression vs released engine) | 174 ok (hand-derived) |
| E5 | Single-property sizing | A− | built | critic running (regression vs released engine) | 174 ok; fixed negative max-loan leak |
| P1 | Per-property store | F | **B** (critic) → patching | B — 1 major (name write-once / address edit orphans record → ensure refresh + rename), 3 minor, 4 surviving mutants — fed back | 202 ok; 20/24 mutants killed |
| P2 | Per-property NOI → ratios | C | **A** (critic) | A — nits fed back; found a glue DSCR-basis defect (fixed) | 167 ok; 7/7 mutants killed; independent hand-calc to the cent |
| P3 | Upload → property | D | **A** (critic) | A — nits fed back; found 2 major glue defects (basis-toggle rewrote records; misleading toast) — fixed | 396 ok; 7/7 mutants killed; Crest ties |
| P4 | Hand-edit sheet | F | built | critic running (incl. e2e; sign-coercion + hand-entry rulings) | 149 ok |
| P5 | Controllable flags | F | **A** (critic) → patched, re-check running | A — all 5 findings patched (store round-trip block proven to catch drift; API frozen) | 118 ok; 9/9 mutants killed |
| P6 | Per-property assumptions | D | built | critic running (incl. e2e) | 132 ok |
| P7 | Portfolio roll-up | F | built | critic running (incl. e2e) | 121 ok (real calc) |
| P8 | "What to push" scan | F | built | critic running (incl. e2e + rule semantics) | 195 ok (real calc) |
