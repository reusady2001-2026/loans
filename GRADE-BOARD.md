# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | **A pending** → patched (513), critic re-check running | patched: NOI-stop pinned, snap gone (cents), $0 review noise gone, mixed-case Gross, summary-first split (twinBelow), TOTAL EXPENSES ends detail; BDX carried as its own pass-through line | 513 ok; upload 418/0 |
| E2 | Classifier | A− | **A ✓ done** (4 keyword nits closing) | A — re-checked A: all 7 items + BDX verified, 12/12 mutants killed, Crest diff exactly 8 rows (all $0 or the BDX split), 0 wrong-side rows | 806 ok |
| E3 | In-place NOI tie | A | **A pending** → patched (513), critic re-check running | patched with E1; Crest ties strict 9,483,604.28; GA 554,599.61 + BDX 388,184.69 = 942,784.30; underwritten @0 9,770,923.03 | 513 ok |
| E4 | Underwritten NOI | B+ | **A ✓ done** | A — re-checked A: bit-identical to released engine (200/200 random sweep, 0 diffs); Crest +4,738.85 reconciled to the cent as an E2 category move; one unreachable nit ("(1e5)" text) routed to builder | 207 ok; 6/6 mutants killed; DEFAULTS frozen (verified) |
| E5 | Single-property sizing | A− | **A ✓ done** | A — re-checked A; negative max-loan leak closed; glue blank sizing box now refilled from s.params (index.html:3374) | 207 ok; 987-entry regression byte-identical |
| P1 | Per-property store | F | **A ✓ done** | A — re-checked A; test nits closed (M36/M40/M41 die); BDX mirrored (33 codes) | 296 ok; 25/26 mutants (1 equivalent) |
| P2 | Per-property NOI → ratios | C | **A ✓ done** (BDX pins added, critic verifying) | A — module unchanged; 38 exact BDX pass-through pins (795,750 / 800,750 hand-derived) | 220 ok |
| P3 | Upload → property | D | **A ✓ done** (2 comment nits closing) | A — re-checked A after BDX: ORDER = taxonomy, Crest record GA 554,599.61 + BDX 388,184.69 hand-foots, 7/7 mutants | 418 ok |
| P4 | Hand-edit sheet | F | **A pending** → patched (256, e2e 86), critic re-check running | patched: deductions stored negative, all 33 rows with per-section fold, same-value guard, toggle commits pending edit, proto-safe, Enter navigation, re-entrancy latch | 256 ok; e2e 86/86 |
| P5 | Controllable flags | F | **A pending** → BDX + captions landed (133, strict), critic re-check running | 33 codes, BDX after GA, unique captions, TRANSITION empty | 133 ok |
| P6 | Per-property assumptions | D | **A ✓ done** | A — re-checked A: focus survives rebuilds, strict commas, fallback from Underwriting.DEFAULTS; 16/17 mutants (1 equivalent) | 249 ok; e2e 62 ok |
| P7 | Portfolio roll-up | F | **A ✓ done** | A — re-checked A: per-ratio coverage scope hand-calc exact, 0/19 mutants survive; final nits closed (date-safe e2e, short() sign/T unit) | 185 ok; e2e pass |
| P8 | "What to push" scan | F | **A ✓ done** | A — re-checked A; nits closed (prologue isolation, maturity hook fallback) | 280 ok; e2e 11/11 |
| G | Glue (index.html wiring) | — | **B** → patched, critic re-check running | B — two naming minors closed (largest senior names the property; same-key rename refreshes the record) + refusal toasts + focus kept across manage/orphan rebuilds | glue e2e 52/52 live |
