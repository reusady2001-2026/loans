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
| P2 | Per-property NOI → ratios | C | **A** (critic) → patched, re-check running | A — nits patched (`dropped` codes surfaced); found a glue DSCR-basis defect (fixed) | 179 ok; 7/7 mutants killed; independent hand-calc to the cent |
| P3 | Upload → property | D | **A** (critic) → patched, re-check running | A — nits patched; its 2 major glue findings (basis-toggle rewrote records; misleading toast) fixed in glue | 398 ok; 7/7 mutants killed; Crest ties |
| P4 | Hand-edit sheet | F | built | critic running (incl. e2e; sign-coercion + hand-entry rulings) | 149 ok |
| P5 | Controllable flags | F | **A** (critic) → patched, re-check running | A — all 5 findings patched (store round-trip block proven to catch drift; API frozen) | 118 ok; 9/9 mutants killed |
| P6 | Per-property assumptions | D | built | critic running (incl. e2e) | 132 ok |
| P7 | Portfolio roll-up | F | built | critic running (incl. e2e) | 121 ok (real calc) |
| P8 | "What to push" scan | F | built | critic running (incl. e2e + rule semantics) | 195 ok (real calc) |
