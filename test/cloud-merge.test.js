/* 3.0.0 — cloud-merge.js: field paths (the same as the server's), "only time stamps changed", and folding two saves
   together (the later save wins where both changed the same field).
   run:  node test/cloud-merge.test.js   (the comparison with the server's own paths runs where PostgreSQL is installed) */
"use strict";
const path = require("path");
const M = require(path.join(__dirname, "..", "cloud-merge.js"));
const PG = require("./cloud/_pg.js");

let fails = 0, count = 0;
function ok(cond, msg){ count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if(!cond) fails++; }
function section(name, fn){ console.log("\n" + name); try{ fn(); }catch(e){ ok(false, "threw: " + (e && e.stack || e)); } }
const J = v => JSON.stringify(v);

const LOANS = [{ _id: "ln_1", propertyName: "Alpha", annualRate: 5, _history: [{ at: "a" }] }, { _id: "ln_2", propertyName: "Beta", annualRate: 6 }];

section("field paths", () => {
  const f = [...M.leaves({ loans: LOANS }).keys()];
  ok(f.indexOf("loans[ln_1].annualRate") >= 0 && f.indexOf("loans[ln_2].propertyName") >= 0, "a loan's field is loans[<_id>].<field>");
  ok(f.indexOf("loans[ln_1]._history") >= 0, "a list without ids is one value");
  ok(J([...M.leaves([{ id: "a", x: 1 }]).keys()]) === J(["[a].id", "[a].x"]), "items with id at the top");
  ok(J([...M.leaves({ "a.b": { "c[d": 1 } }).keys()]) === J(["a\\.b.c\\[d"]), "dots and brackets in names are escaped");
  ok(J([...M.leaves({ e: {}, l: [] }).keys()]) === J(["e", "l"]), "empty objects and lists are values");
  ok(M.listKey([{ id: 1 }, { id: 1 }]) === null, "repeated ids: the list is one value");
});

section("diff", () => {
  const b = JSON.parse(J(LOANS)); b[0].annualRate = 5.25;
  const d = M.diff(LOANS, b);
  ok(d.length === 1 && d[0].field === "[ln_1].annualRate" && d[0].old === 5 && d[0].new === 5.25, "one field changed");
  ok(M.diff(null, { a: 1 }).length === 1 && M.diff({ a: 1 }, null)[0].new === null, "a new or removed record");
  ok(M.diff({ a: { y: 1, x: 2 } }, { a: { x: 2, y: 1 } }).length === 0, "key order is not a change");
});

section("time stamps", () => {
  ok(M.sameButStamps({ noi: { v: 1, computedAt: "a" }, updatedAt: "t1" }, { noi: { v: 1, computedAt: "b" }, updatedAt: "t2" }), "only stamps differ: the same");
  ok(!M.sameButStamps({ noi: { v: 1 }, updatedAt: "t1" }, { noi: { v: 2 }, updatedAt: "t1" }), "a real value differs: not the same");
  ok(!M.sameButStamps(null, { a: 1 }) && M.sameButStamps(null, undefined), "a record that's new is a change");
});

section("folding two saves together", () => {
  const base = { loans: LOANS };
  const mine = JSON.parse(J(base)); mine.loans[0].annualRate = 5.5;                 // I changed Alpha's rate
  const theirs = JSON.parse(J(base)); theirs.loans[1].annualRate = 6.5;            // they changed Beta's
  let m = M.merge3(base, mine, theirs);
  ok(m.loans[0].annualRate === 5.5 && m.loans[1].annualRate === 6.5, "different loans: both kept");
  const t2 = JSON.parse(J(base)); t2.loans[0].annualRate = 7;
  m = M.merge3(base, mine, t2);
  ok(m.loans[0].annualRate === 5.5, "the same field: the later save (mine) wins");
  const t3 = JSON.parse(J(base)); t3.loans.push({ _id: "ln_3", propertyName: "Gamma" });
  const m3 = JSON.parse(J(base)); m3.loans.unshift({ _id: "ln_0", propertyName: "Zero" });
  m = M.merge3(base, m3, t3);
  ok(J(m.loans.map(x => x._id)) === J(["ln_0", "ln_1", "ln_2", "ln_3"]), "both added a loan: both there, in place");
  const t4 = { loans: [LOANS[1]] }, m4 = JSON.parse(J(base)); m4.loans[1].annualRate = 9;
  m = M.merge3(base, m4, t4);
  ok(J(m.loans.map(x => x._id)) === J(["ln_2"]) && m.loans[0].annualRate === 9, "they removed one loan, I changed another: both");
  const m5 = { loans: [LOANS[0]] }, t5 = JSON.parse(J(base)); t5.loans[0].annualRate = 1;
  m = M.merge3(base, m5, t5);
  ok(J(m.loans.map(x => x._id)) === J(["ln_1"]) && m.loans[0].annualRate === 1, "I removed one, they changed the other: both");
  ok(J(M.merge3(null, { a: 1 }, { b: 2 })) === J({ b: 2, a: 1 }), "two new records: put together");
  ok(J(M.merge3({ a: 1, b: 1 }, { a: 1 }, { a: 2, b: 1 })) === J({ a: 2 }), "I removed a field, they changed another: both");
  ok(J(M.merge3({ h: [1] }, { h: [1, 2] }, { h: [1, 3] })) === J({ h: [1, 2] }), "a list without ids changed by both: mine");
});

(async () => {
  console.log("\nthe same paths as the server");
  if(!PG.findBin()){ console.log("  (skipped: PostgreSQL isn't installed here)"); }
  else{
    const db = await PG.start();
    try{
      const samples = [{ loans: LOANS }, LOANS, { a: { "b.c": [1, 2], d: {}, e: [] }, f: [{ id: 1, g: null }, { id: 2 }] }, { x: [{ _id: "q", id: "w", v: 1 }] }];
      for(const s of samples){
        const r = await db.admin.query("select field from app.leaves($1::jsonb) order by field", [J(s)]);
        const js = [...M.leaves(s).keys()].sort(), sq = r.rows.map(x => x.field);
        ok(J(js) === J(sq), "same paths: " + J(s).slice(0, 50));
      }
      const a = { loans: LOANS }, b = JSON.parse(J(a)); b.loans[1].annualRate = 1; delete b.loans[0]._history; b.loans.push({ _id: "n" });
      const r = await db.admin.query("select field from app.diff($1::jsonb, $2::jsonb) order by field", [J(a), J(b)]);
      ok(J(M.diff(a, b).map(x => x.field).sort()) === J(r.rows.map(x => x.field)), "same diff as the server");
    } finally { await db.stop(); }
  }
  console.log("\n" + (count - fails) + " of " + count + " checks passed");
  process.exit(fails ? 1 : 0);
})();
