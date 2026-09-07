# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | A− | pending | — |
| E2 | Classifier | A− | A− | pending | — |
| E3 | In-place NOI tie | A | A | pending | — |
| E4 | Underwritten NOI | B+ | B+ | pending | — |
| E5 | Single-property sizing | A− | A− | pending | — |
| P1 | Per-property store | F | F | pending | — |
| P2 | Per-property NOI → ratios | C | C | pending | — |
| P3 | Upload → property | D | D | pending | — |
| P4 | Hand-edit sheet | F | F | pending | — |
| P5 | Controllable flags | F | built | critic running | 96 ok (mutation-proven) |
| P6 | Per-property assumptions | D | D | pending | — |
| P7 | Portfolio roll-up | F | F | pending | — |
| P8 | "What to push" scan | F | F | pending | — |
