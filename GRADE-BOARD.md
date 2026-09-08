# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | **A ✓ done** | A — re-checked A: summary-block handling (detail overrides, mismatch surfaced incl. derived-NOI), Gross-caption fix, BDX split; consumer chain verified end-to-end; Crest row-identical | 596 ok |
| E2 | Classifier | A− | **A ✓ done** (nit closures being confirmed) | A — re-checked A: all 7 items + BDX verified, 12/12 mutants killed, Crest diff exactly 8 rows; keyword nits closed (skips/evictions/doubtful, E&O, plug guard) | 836 ok |
| E3 | In-place NOI tie | A | **A ✓ done** | A — re-checked A: in-place NOI ties to the cent on Crest; reconcile.ties gated on summaryMismatch so a self-contradicting statement never reports a false tie | 596 ok |
| E4 | Underwritten NOI | B+ | **A ✓ done** | A — re-checked A: bit-identical to released engine (200/200 random sweep, 0 diffs); Crest +4,738.85 reconciled to the cent as an E2 category move; one unreachable nit ("(1e5)" text) routed to builder | 207 ok; 6/6 mutants killed; DEFAULTS frozen (verified) |
| E5 | Single-property sizing | A− | **A ✓ done** | A — re-checked A; negative max-loan leak closed; glue blank sizing box now refilled from s.params (index.html:3374) | 207 ok; 987-entry regression byte-identical |
| P1 | Per-property store | F | **A ✓ done** | A — re-checked A: encoding pure ASCII, removeLine/setControllable strict (knownCode), 25/26 mutants (1 equivalent) | 303 ok |
| P2 | Per-property NOI → ratios | C | **A ✓ done** | A — module unchanged; 38 BDX pass-through pins hand-verified; all three carried glue items re-verified CLOSED in the live app (DSCR one-basis, tile gating, store code validation) | 220 ok |
| P3 | Upload → property | D | **A ✓ done** → ties-gating add-on running | A on its own files; add-on: gate linesFromParsed/apply ties on summaryMismatch + surface it (critic-flagged, glue already reads parsed.summaryMismatch) | 418 ok |
| P4 | Hand-edit sheet | F | **A ✓ done** | A — re-checked A: all 8 findings fixed, deductions stored negative (both bases, −0 handled), all 33 rows hand-enterable, 13/13 unit mutants + Enter/same-value e2e mutants killed | 256 ok; e2e 86/86 |
| P5 | Controllable flags | F | **A ✓ done** | A — re-checked A after BDX: 15/15 mutants killed, every consumer mirror identical; comment/scaffold nits closed | 134 ok |
| P6 | Per-property assumptions | D | **A ✓ done** | A — re-checked A: focus survives rebuilds, strict commas, fallback from Underwriting.DEFAULTS; 16/17 mutants (1 equivalent) | 249 ok; e2e 62 ok |
| P7 | Portfolio roll-up | F | **A ✓ done** | A — re-checked A: per-ratio coverage scope hand-calc exact, 0/19 mutants survive; final nits closed (date-safe e2e, short() sign/T unit) | 185 ok; e2e pass |
| P8 | "What to push" scan | F | **A ✓ done** | A — re-checked A; nits closed (prologue isolation, maturity hook fallback) | 280 ok; e2e 11/11 |
| G | Glue (index.html wiring) | — | **A ✓ done** | A — re-checked A: naming by largest incumbent senior, same-key rename refresh, refusal toasts, focus kept across rebuilds; adversarial probe 41/41, ledger of records preserved through every rename/move/refusal | glue e2e 52/52 live |
