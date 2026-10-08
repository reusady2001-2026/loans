// Unit tests for the H3 OCR reconciliation (2.9.6). Pure logic — no engines needed.
const assert = require('assert');
const OCR = require('../ocr.js');
const r = OCR.reconcile;

// 1. Engines agree → text unchanged.
assert.strictEqual(r("alpha\nbeta\ngamma", "alpha\nbeta\ngamma"), "alpha\nbeta\ngamma");

// 2. Dropped-line protection: A missed a middle line that B read → it is recovered.
const a2 = "Borrower may repay upon:\nmore than one hundred (100) days notice";
const b2 = "Borrower may repay upon:\n(i) not less than thirty (30) days and not\nmore than one hundred (100) days notice";
const out2 = r(a2, b2);
assert(/thirty \(30\) days/.test(out2), "dropped line should be recovered — got:\n" + out2);
assert(/one hundred \(100\) days/.test(out2), "kept the agreed line");

// 3. The reverse: B missed a line A read → also recovered (symmetric).
assert(/thirty \(30\) days/.test(r(b2, a2)), "symmetric recovery");

// 4. One engine empty → the other's text is returned whole.
assert.strictEqual(r("only A here", "").trim(), "only A here");
assert.strictEqual(r("", "only B here").trim(), "only B here");

// 5. Numeric disagreement is flagged for the reader, not silently resolved.
const out5 = r("Interest rate is 4.50%", "Interest rate is 4.60%");
assert(/engines differ/.test(out5), "numeric mismatch should be flagged — got:\n" + out5);
assert(/4\.6/.test(out5), "the alternate numeric reading is surfaced");

// 6. A non-numeric divergence is NOT flagged (prefers the fuller reading, quietly).
const out6 = r("the quick brown fox", "the swift brown fox");
assert(!/engines differ/.test(out6), "non-numeric divergence stays quiet — got:\n" + out6);

console.log("ocr reconcile tests: PASS (6/6)");
