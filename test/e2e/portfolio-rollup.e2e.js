/* Portfolio roll-up — Playwright-Electron e2e (contract §9).
   Runs AFTER the orchestrator wires the Underwriting tab (#opPropPick, #opSheetMount,
   #opRollupMount). A fresh --user-data-dir boots the app on its own seed portfolio
   (24 loans, incl. "Avalon White Plains" + "Avalon WP (Mezz)" sharing the address
   "White Plains, NY"), so nothing is seeded outside the UI.
   Asserts: one roll-up row per property (the oracle is #opPropPick, which the app
   builds from its loans with the §1 key, independently of this module); the Avalon
   senior + mezz collapse into ONE row (2 loans, named for the senior); clicking that
   row focuses the property; an NOI typed into the sheet shows up in the row, with
   the combined-stack debt yield exact: 1,200,000 / (96,000,000 + 24,000,000 — both
   loans are interest-only, so their balances are the original amounts) = 1.00%.
   run:  GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/portfolio-rollup.e2e.js
*/
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { _electron: electron } = require((process.env.GN || "/opt/node22/lib/node_modules") + "/playwright");
const APP = path.resolve(__dirname, "..", "..");
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), "lds-e2e-rollup-"));
const AVALON = "addr:white plains, ny";   // §1 key of both Avalon loans
// Column order of PortfolioRollup.render
const COL = { name: 0, units: 1, loans: 2, noi: 3, uwNoi: 4, balance: 5, annualDS: 6, dscr: 7, dy: 8, ltv: 9, maturity: 10 };
let fails = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };
const lower = (a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };

(async () => {
  const app = await electron.launch({ executablePath: require(path.join(APP, "node_modules", "electron")),
    args: [APP, "--user-data-dir=" + UDATA, "--no-sandbox"], cwd: APP });
  const page = await app.firstWindow();
  const errors = []; page.on("pageerror", e => errors.push(String(e).slice(0, 300)));
  await page.route(/^https?:\/\//, r => r.abort());
  const rowSel = key => '#opRollupMount tr[data-op-prop="' + key + '"]';
  const rowKeys = () => page.$$eval("#opRollupMount tr[data-op-prop]", trs => trs.map(t => t.getAttribute("data-op-prop")));
  const rowCells = key => page.$$eval(rowSel(key) + " td", tds => tds.map(t => t.textContent.trim()));
  try {
    await page.waitForSelector("#tabNewBtn", { timeout: 30000 });
    // Open the Underwriting tab the way a user does: "+" → "Underwriting & Sizing".
    await page.click("#tabNewBtn");
    await page.click('#tabNewMenu [data-tabopen="underwriting"]');
    await page.waitForSelector("#uwView:not([hidden])", { timeout: 10000 });
    const mounted = await page.waitForSelector("#opRollupMount tr[data-op-prop]", { timeout: 15000 }).catch(() => null);
    if (!mounted) { ok(false, "#opRollupMount has no rows — is the roll-up wired into the Underwriting tab yet?"); throw new Error("not wired"); }

    // 1. One row per property.
    const pickKeys = await page.$$eval("#opPropPick option", os => os.map(o => o.value).filter(Boolean));
    const expected = Array.from(new Set(pickKeys)).sort();
    let keys = await rowKeys();
    ok(expected.length > 1, "seed portfolio: " + expected.length + " properties in #opPropPick");
    ok(keys.length === new Set(keys).size, "no duplicate rows (" + keys.length + " rows)");
    ok(keys.slice().sort().join("|") === expected.join("|"), "one row per property: row keys == #opPropPick keys (" + keys.length + " rows vs " + expected.length + " properties)");
    const names = await page.$$eval("#opRollupMount tr[data-op-prop] td:first-child", tds => tds.map(t => t.textContent.trim()));
    ok(names.slice().sort(lower).join("|") === names.join("|"), "rows are sorted by name");
    ok((await page.$$("#opRollupMount tr[data-op-total]")).length === 1, "one totals row");
    const cellsAll = await page.$$eval("#opRollupMount td", tds => tds.map(t => t.textContent));
    ok(!cellsAll.some(t => /NaN|undefined|null/.test(t)), "no NaN / undefined / null in any cell");

    // 2. Avalon White Plains: senior + mezz → exactly ONE row, 2 loans, named for the senior.
    ok(keys.filter(k => k === AVALON).length === 1, "Avalon senior + mezz collapse into exactly one row (" + keys.filter(k => k === AVALON).length + ")");
    const av = await rowCells(AVALON);
    ok(/Avalon White Plains/.test(av[COL.name] || "") && !/mezz/i.test(av[COL.name] || ""), "Avalon row is named for the senior (got " + JSON.stringify(av[COL.name]) + ")");
    ok(av[COL.loans] === "2", "Avalon row counts 2 loans (got " + JSON.stringify(av[COL.loans]) + ")");
    ok(av[COL.balance] === "$120,000,000.00", "Avalon combined balance = 96,000,000 + 24,000,000 IO = $120,000,000.00 (got " + JSON.stringify(av[COL.balance]) + ")");
    ok(av[COL.noi] === "—" && av[COL.dscr] === "—" && av[COL.dy] === "—", "Avalon NOI / DSCR / DY are — before anything is entered");
    ok(av[COL.maturity] === "02/10/2029", "Avalon earliest maturity 02/10/2029 (got " + JSON.stringify(av[COL.maturity]) + ")");
    ok(!names.some(n => /Avalon WP \(Mezz\)/.test(n)), "no separate \"Avalon WP (Mezz)\" row");

    // 2b. Clicking the row opens that property (data-op-prop → onOpen → #opPropPick).
    await page.click(rowSel(AVALON));
    await page.waitForFunction(k => { const s = document.getElementById("opPropPick"); return !!s && s.value === k; }, AVALON, { timeout: 8000 }).catch(() => {});
    ok((await page.$eval("#opPropPick", s => s.value)) === AVALON, "clicking the Avalon row focuses Avalon in #opPropPick");

    // 3. NOI entered in the sheet shows in the roll-up row: GPR = 1,200,000 (annual) as the only
    //    line → in-place NOI = 1,200,000.00 (no deductions, no expenses; reserves are 0 in-place).
    await page.selectOption("#opPropPick", AVALON);
    await page.waitForSelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]', { timeout: 10000 });
    if (await page.$('#opBasisToggle[data-basis="monthly"]')) {   // values are stored annually; make sure the sheet displays annual
      await page.click("#opBasisToggle");
      await page.waitForSelector('#opBasisToggle[data-basis="annual"]', { timeout: 5000 });
    }
    const gpr = await page.waitForSelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]', { timeout: 10000 });
    await gpr.fill("1200000"); await gpr.press("Enter");   // Enter commits (blur → change → onEdit)
    await page.waitForFunction(sel => { const tr = document.querySelector(sel); return !!tr && tr.textContent.indexOf("1,200,000.00") >= 0; },
      rowSel(AVALON), { timeout: 10000 }).catch(() => {});
    const after = await rowCells(AVALON);
    ok(after[COL.noi] === "$1,200,000.00", "roll-up NOI for Avalon = $1,200,000.00 after entering GPR in the sheet (got " + JSON.stringify(after[COL.noi]) + ")");
    ok(after[COL.dy] === "1.00%", "combined debt yield = 1,200,000 / 120,000,000 = 1.00% (got " + JSON.stringify(after[COL.dy]) + ")");
    ok(/^\d+\.\d\d×$/.test(after[COL.dscr] || "") && /^\d+\.\d\d%$/.test(after[COL.ltv] || ""), "DSCR / LTV now computed on the combined stack (got " + JSON.stringify(after[COL.dscr]) + " / " + JSON.stringify(after[COL.ltv]) + ")");
    ok(after[COL.loans] === "2" && after[COL.balance] === "$120,000,000.00", "row still carries both loans after the edit");
    keys = await rowKeys();
    ok(keys.filter(k => k === AVALON).length === 1 && keys.length === expected.length, "still one row per property after the edit (" + keys.length + ")");
    const totals = await page.$$eval("#opRollupMount tr[data-op-total] td", tds => tds.map(t => t.textContent.trim()));
    ok(totals[COL.noi] === "$1,200,000.00", "totals NOI = the one entered NOI (got " + JSON.stringify(totals[COL.noi]) + ")");
  } catch (e) {
    ok(false, "e2e aborted: " + (e && e.message));
    try { const shot = path.join(os.tmpdir(), "portfolio-rollup-e2e-fail.png"); await page.screenshot({ path: shot }); console.log("  screenshot: " + shot); } catch (_) {}
  }
  ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await app.close();
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (_) {}
  console.log("\n" + (fails ? fails + " e2e check(s) FAILED" : "all e2e checks passed"));
  process.exit(fails ? 1 : 0);
})();
