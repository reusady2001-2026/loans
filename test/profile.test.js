/* Property Profile module - node test (plain node, no framework).
   run:  /opt/node22/bin/node test/profile.test.js
   Covers the schema, per-field provenance + history, completeness and the
   mismatch rule. Pure module, no I/O. */
"use strict";
const path = require("path");
const P = require(path.join(__dirname, "..", "profile.js"));

let fails = 0, count = 0;
function ok(cond, msg) { count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; }
function section(name, fn) { console.log("\n" + name); try { fn(); } catch (e) { ok(false, "threw: " + (e && e.stack || e)); } }

section("schema + fields", () => {
  const e = P.emptyProfile("name:test");
  ok(e.schema === P.SCHEMA && e.propKey === "name:test" && e.archived === false, "emptyProfile has schema, propKey, archived=false");
  ok(e.fields && Object.keys(e.fields).length === 0, "emptyProfile has no fields yet");
  const keys = P.FIELDS.map(f => f.key);
  ["propertyName", "residentialUnits", "commercialUnits", "acquisitionDate", "manager", "yardiCode", "notes"].forEach(k =>
    ok(keys.indexOf(k) >= 0, "FIELDS includes " + k));
  ok(P.COMPLETENESS.every(k => keys.indexOf(k) >= 0), "every COMPLETENESS key is a real field");
  ok(keys.indexOf("status") < 0, "there is no manual status field");
  ok(P.COMPLETENESS.indexOf("status") < 0, "status is not a completeness field");
});

section("coerce", () => {
  const c = P.coerce(null, "name:x");
  ok(c.schema === P.SCHEMA && c.propKey === "name:x" && c.archived === false && Object.keys(c.fields).length === 0, "coerce(null) → well-formed empty profile");
  const c2 = P.coerce({ fields: { manager: { value: "Living" } }, archived: true }, "name:y");
  ok(c2.archived === true && c2.fields.manager.value === "Living", "coerce keeps fields + archived");
});

section("setField + provenance", () => {
  const p = P.emptyProfile("name:crest");
  P.setField(p, "residentialUnits", 704, { changedBy: "yuval@bsi.co.il", source: { kind: "agreement", file: "note.pdf", page: 3, quote: "704 units" }, changedAt: "2026-09-14T00:00:00Z" });
  const f = P.getField(p, "residentialUnits");
  ok(f.value === 704, "value stored (704)");
  ok(f.source.kind === "agreement" && f.source.page === 3 && f.source.quote === "704 units", "source (file/page/quote) stored");
  ok(f.changedBy === "yuval@bsi.co.il" && f.changedAt === "2026-09-14T00:00:00Z", "changedBy / changedAt stored");
  ok(p.updatedAt === "2026-09-14T00:00:00Z" && p.createdAt === "2026-09-14T00:00:00Z", "profile createdAt/updatedAt stamped");
  ok(P.getValue(p, "residentialUnits") === 704 && P.value(p, "residentialUnits") === 704, "getValue / value read it back");
  ok(f.history.length === 0, "no history on the first set");

  // default source is manual
  const q = P.emptyProfile("k"); P.setField(q, "manager", "Living");
  ok(P.getField(q, "manager").source.kind === "manual", "default source is manual");
});

section("history on change", () => {
  const p = P.emptyProfile("k");
  P.setField(p, "residentialUnits", 328, { changedBy: "ai", changedAt: "2026-09-01T00:00:00Z" });
  P.setField(p, "residentialUnits", 704, { changedBy: "yuval", reason: "agreement covers phase 1 only; property is 704", changedAt: "2026-09-14T00:00:00Z" });
  const f = P.getField(p, "residentialUnits");
  ok(f.value === 704, "current value is 704");
  ok(f.history.length === 1 && f.history[0].value === 328, "prior value 328 pushed onto history");
  ok(f.history[0].reason === "agreement covers phase 1 only; property is 704", "the resolution reason is stored in history");
  ok(f.history[0].changedBy === "ai" && f.history[0].changedAt === "2026-09-01T00:00:00Z", "history keeps who/when of the prior value");

  // setting the SAME value with no reason does not grow history
  P.setField(p, "residentialUnits", 704, { changedBy: "yuval", changedAt: "2026-09-15T00:00:00Z" });
  ok(P.getField(p, "residentialUnits").history.length === 1, "re-setting the same value (no reason) does not add history");

  // history cap
  const c = P.emptyProfile("k");
  for (let i = 0; i < 30; i++) P.setField(c, "notes", "v" + i, { changedAt: "2026-09-" + (i < 9 ? "0" + (i + 1) : (i + 1)) + "T00:00:00Z" });
  ok(P.getField(c, "notes").history.length === 20, "history is capped at 20 (got " + P.getField(c, "notes").history.length + ")");
});

section("value() treats blanks as unset", () => {
  const p = P.emptyProfile("k");
  ok(P.value(p, "residentialUnits") === undefined, "unset field → value() undefined");
  P.setField(p, "residentialUnits", "");
  ok(P.value(p, "residentialUnits") === undefined, "empty string → value() undefined (not 0)");
  P.setField(p, "residentialUnits", 0);
  ok(P.value(p, "residentialUnits") === 0, "an explicit 0 is a real value");
});

section("completeness", () => {
  const p = P.emptyProfile("k");
  let c = P.completeness(p);
  ok(!c.complete && c.missing.length === 4, "empty profile → incomplete, all 4 missing");
  P.setField(p, "propertyName", "The Crest");
  P.setField(p, "residentialUnits", 704);
  P.setField(p, "acquisitionDate", "2021-06-01");
  c = P.completeness(p);
  ok(!c.complete && c.missing.length === 1 && c.missing[0] === "manager", "three of four filled → still incomplete, manager missing");
  P.setField(p, "manager", "Living");
  c = P.completeness(p);
  ok(c.complete && c.missing.length === 0, "all four → complete");
});

section("mismatch rule", () => {
  ok(P.isMismatch(704, "328") === true, "704 vs \"328\" → mismatch");
  ok(P.isMismatch(704, "704") === false, "704 vs \"704\" → no mismatch (numeric equality across types)");
  ok(P.isMismatch(704, "") === false, "704 vs blank → no mismatch (nothing to compare)");
  ok(P.isMismatch(undefined, 328) === false, "unset vs 328 → no mismatch");
  ok(P.isMismatch("The Crest", "the crest ") === false, "case/space-insensitive string compare → no mismatch");
  ok(P.isMismatch("2026-01-01", "2026-01-01T00:00:00Z") === false, "date day compare → no mismatch");
  ok(P.isMismatch("Living", "Third-party") === true, "Living vs Third-party → mismatch");
});

console.log("\n" + (fails ? fails + " FAILED" : "all " + count + " profile checks passed"));
process.exit(fails ? 1 : 0);
