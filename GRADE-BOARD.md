# Grade Board — Operating Model build to A

Gate: an aspect is **A** only when its automated tests are green **and** its independent critic
signs off. Loop per aspect: build → test → critique → grade → (if < A) feed findings back to the
same builder → fix → re-test → re-critique.

| # | Aspect | Start | Now | Critic verdict | Tests |
|---|---|---|---|---|---|
| E1 | T12 parsing | A− | **B** (critic) → patching | B — acceptance holds, Crest Δ=0 vs released; NOI-stop mutant unpinned, mixed-case "Gross Rent" dropped, summary-first split lost — fed back | 370 ok; 10 pre-existing defects fixed |
| E2 | Classifier | A− | built | critic running (re-tag audit vs statement hierarchy) | 689 ok; Crest 610/610 classified, 0 residual, low-conf 9→4 (all $0) |
| E3 | In-place NOI tie | A | **B** (critic) → patching | B — strict tie holds; snap tolerance unpinned, dust on real gaps, $0 review noise — fed back; glue tie tolerance tightened to ½¢ | 370 ok; residuals now reported |
| E4 | Underwritten NOI | B+ | **A ✓ done** | A — re-checked A: bit-identical to released engine (200/200 random sweep, 0 diffs); Crest +4,738.85 reconciled to the cent as an E2 category move; one unreachable nit ("(1e5)" text) routed to builder | 207 ok; 6/6 mutants killed; DEFAULTS frozen (verified) |
| E5 | Single-property sizing | A− | **A ✓ done** | A — re-checked A; negative max-loan leak closed; glue blank sizing box now refilled from s.params (index.html:3374) | 207 ok; 987-entry regression byte-identical |
| P1 | Per-property store | F | **B** → patched, re-check running | all findings patched: name refresh + rename (glue hooks it on loan edits), proto-safety, source migration, taxonomy code validation; 4 surviving mutants now die | 281 ok; 24/24 mutants killed |
| P2 | Per-property NOI → ratios | C | **A ✓ done** | A — re-checked A; all findings closed; its glue DSCR-basis finding fixed | 182 ok; 9/9 mutants killed; independent hand-calc to the cent |
| P3 | Upload → property | D | **A ✓ done** | A — critic: "A the moment the test fix lands"; fix landed (code chosen dynamically), suite green, glue fixes verified | 402 ok; 7/7 mutants killed; Crest ties |
| P4 | Hand-edit sheet | F | **C** (critic) → patching | C — contract met (e2e PASSED live) but 2 product majors: sign slip inflates NOI; 27/32 lines not hand-enterable — fed back with fixes | 149 ok; 5/6 mutants killed |
| P5 | Controllable flags | F | **A ✓ done** | A — re-checked A; all findings and nits closed | 118 ok; 10/10 mutants killed |
| P6 | Per-property assumptions | D | **B** → patched, re-check running | B — patched: e2e on helpers (66/66 live), single-column layout measured, strict parsing, per-field ranges + "out of range" chip, DEFAULTS via OperatingCalc, no-op re-entry | 233 ok; e2e 66/66 |
| P7 | Portfolio roll-up | F | **B** → patched, re-check running | B — patched: totals DSCR/DY over NOI'd properties only with scope line; hasLines mirrors calc; record-less names; hooks.maturity; per-row error guard; orphan rows inert | 163 ok; e2e pass (totals = Avalon row) |
| P8 | "What to push" scan | F | **C** (critic) → patching | C — rules exact at node level (63/63 seeded) but e2e broken, expense rule backwards on negative lines, refi vs origination rate (currentRate hook added), past-maturity wording; found a glue re-entrancy error on every sheet edit (fixed) | 195 ok; 6/6 mutants killed |
