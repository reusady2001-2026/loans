/* Portfolio roll-up — Playwright-Electron e2e (contract §9).
   Runs AFTER the orchestrator wires the Underwriting tab (#opPropPick,
   #opSheetMount, #opRollupMount). A fresh --user-data-dir boots the app on its
   own seed portfolio (24 loans, incl. "Avalon White Plains" + "Avalon WP (Mezz)"
   sharing the address "White Plains, NY"), so nothing is seeded outside the UI.
   Asserts: one roll-up row per property; the Avalon senior + mezz collapse into
   ONE row (2 loans, named for the senior); an NOI entered in the sheet shows up
   in that property's roll-up row.
   run:  GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/portfolio-rollup.e2e.js
*/
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { _electron: electron } = require((process.env.GN || "/opt/node22/lib/node_modules") + "/playwright");
const APP = "/home/user/loans";
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), "lds-e2e-rollup-"));
const AVALON = "addr:white plains, ny";   // §1 key of both Avalon loans
// Column order of PortfolioRollup.render: Property, Units, Loans, In-place NOI, UW NOI, Balance, Annual DS, DSCR, DY, LTV, Maturity
const COL = { name: 0, units: 1, loans: 2, noi: 3 };
let fails = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };

(async () => {
  const app = await electron.launch({ executablePath: require(APP + "/node_modules/electron"),
    args: [APP, "--user-data-dir=" + UDATA, "--no-sandbox"], cwd: APP });
  const page = await app.firstWindow();
  await page.route(/^https?:\/\//, r => r.abort());
  const rowKeys = () => page.$$eval("#opRollupMount tr[data-op-prop]", trs => trs.map(t => t.getAttribute("data-op-prop")));
  const rowCells = key => page.$$eval('#opRollupMount tr[data-op-prop="' + key + '"] td', tds => tds.map(t => t.textContent.trim()));
  try {
    await page.waitForSelector("#tabNewBtn", { timeout: 30000 });
    // Open the Underwriting tab the way a user does: "+" → "Underwriting & Sizing".
    await page.click("#tabNewBtn");
    await page.click('#tabNewMenu [data-tabopen="underwriting"]');
    await page.waitForSelector("#uwView:not([hidden])", { timeout: 10000 });
    const mounted = await page.waitForSelector("#opRollupMount tr[data-op-prop]", { timeout: 15000 }).catch(() => null);
    if (!mounted) { ok(false, "#opRollupMount has no rows — is the roll-up wired into the Underwriting tab yet?"); throw new Error("not wired"); }

    // 1. One row per property. Expected keys come from the app's own bridge
    //    (hooks.loans() through hooks.propertyKey); the picker is a cross-check.
    let expected = await page.evaluate(() => { const h = window.LDS_OPERATING_HOOKS; if (!h || !h.loans || !h.propertyKey) return null;
      return Array.from(new Set(h.loans().map(l => h.propertyKey(l)))).sort(); });
    const pickKeys = await page.$$eval("#opPropPick option", os => os.map(o => o.value).filter(Boolean));
    if (!expected) { console.log("  note: window.LDS_OPERATING_HOOKS not exposed — using #opPropPick options as the expected property set"); expected = Array.from(new Set(pickKeys)).sort(); }
    let keys = await rowKeys();
    ok(expected.length > 1, "seed portfolio has " + expected.length + " properties");
    ok(keys.length === new Set(keys).size, "no duplicate rows (" + keys.length + " rows)");
    ok(keys.slice().sort().join("|") === expected.join("|"), "one row per property: row keys == the app's property keys" +
      (keys.slice().sort().join("|") === expected.join("|") ? "" : " (rows: " + keys.length + ", expected: " + expected.length + ")"));
    ok(pickKeys.length > 0 && pickKeys.every(k => keys.indexOf(k) >= 0), "every #opPropPick option (" + pickKeys.length + ") has a roll-up row");

    // 2. Avalon White Plains: senior + mezz → exactly ONE row, 2 loans, named for the senior.
    ok(keys.filter(k => k === AVALON).length === 1, "Avalon senior + mezz collapse into exactly one row (" + keys.filter(k => k === AVALON).length + ")");
    const av = await rowCells(AVALON);
    ok(/Avalon White Plains/.test(av[COL.name] || "") && !/mezz/i.test(av[COL.name] || ""), "Avalon row is named for the senior (got " + JSON.stringify(av[COL.name]) + ")");
    ok(av[COL.loans] === "2", "Avalon row counts 2 loans (got " + JSON.stringify(av[COL.loans]) + ")");
    const names = await page.$$eval("#opRollupMount tr[data-op-prop] td:first-child", tds => tds.map(t => t.textContent));
    ok(!names.some(n => /Avalon WP \(Mezz\)/.test(n)), "no separate \"Avalon WP (Mezz)\" row");

    // 3. NOI entered in the sheet shows in the roll-up row: pick Avalon, type GPR = 1,200,000 (annual).
    //    With GPR as the only line, in-place NOI = 1,200,000.00 (no deductions, no expenses, reserves are 0 in-place).
    const noiBefore = av[COL.noi];
    await page.selectOption("#opPropPick", AVALON);
    const gpr = await page.waitForSelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]', { timeout: 10000 });
    const basis = await page.$("#opBasisToggle");   // stored dollars are annual; make sure the sheet is not in monthly display
    if (basis && (await basis.evaluate(e => e.tagName)) === "SELECT") await basis.selectOption("annual").catch(() => {});
    await gpr.fill("1200000"); await gpr.press("Enter"); await gpr.press("Tab");
    await page.waitForFunction(k => { const tr = document.querySelector('#opRollupMount tr[data-op-prop="' + k + '"]'); return !!tr && tr.textContent.indexOf("1,200,000.00") >= 0; },
      AVALON, { timeout: 10000 }).catch(() => {});
    const after = await rowCells(AVALON);
    ok(after[COL.noi] === "$1,200,000.00", "roll-up NOI for Avalon = $1,200,000.00 after entering GPR in the sheet (before: " + JSON.stringify(noiBefore) + ", after: " + JSON.stringify(after[COL.noi]) + ")");
    keys = await rowKeys();
    ok(keys.filter(k => k === AVALON).length === 1 && keys.length === expected.length, "still one row per property after the edit (" + keys.length + ")");
  } catch (e) {
    ok(false, "e2e aborted: " + (e && e.message));
    try { const shot = path.join(os.tmpdir(), "portfolio-rollup-e2e-fail.png"); await page.screenshot({ path: shot }); console.log("  screenshot: " + shot); } catch (_) {}
  }
  await app.close();
  console.log("\n" + (fails ? fails + " e2e check(s) FAILED" : "all e2e checks passed"));
  process.exit(fails ? 1 : 0);
})();
