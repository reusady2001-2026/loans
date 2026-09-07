/* ActionScan e2e (contract §9) — Playwright-Electron on the shared helpers (test/e2e/_helpers.js).
   run:  cd /home/user/loans && GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/action-scan.e2e.js
   Fresh profile (the app's seed portfolio, an empty operating store) → Underwriting tab →
   no dscr flag anywhere before an NOI exists → type a tiny GPR on Villages of Whitewater
   through the sheet (NOI far below its debt service) → a [data-op-flag="dscr"] row naming
   it at severity 3 appears in #opScanMount → switching to another property and clicking
   the row re-focuses the flagged property. Ends by asserting zero page errors.
*/
"use strict";
const fs = require("fs"), path = require("path");
const { launchApp, openUnderwriting, pickProperty, ok: mkOk } = require("./_helpers.js");
const fails = { n: 0 }, ok = mkOk(fails), NAME = "Villages of Whitewater";
const cssStr = s => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

(async () => {
  const { app, page, errors, udata } = await launchApp();
  try {
    await openUnderwriting(page);
    await page.waitForSelector("#opScanMount", { state: "attached", timeout: 15000 });
    await page.waitForSelector("#opPropPick option", { state: "attached", timeout: 15000 });
    // The intro splash overlays the app for a few seconds; typing into the sheet needs it gone.
    await page.waitForSelector("#ldshSplash", { state: "detached", timeout: 30000 }).catch(() => {});
    const dscrRows = () => page.$$eval('#opScanMount [data-op-flag="dscr"]', els => els.map(e => e.getAttribute("data-op-prop")));

    // 1. Not otherwise: an empty operating store has no NOI anywhere → no dscr flag at all, and no scan errors.
    ok((await dscrRows()).length === 0, "no dscr flag on a fresh store (no NOI entered anywhere)");
    ok((await page.$$('#opScanMount [data-op-flag="error"]')).length === 0, "no scan-error rows on the seed portfolio");

    // 2. Seed a low NOI through the sheet UI on a live seeded property (fixed 4.7%, matures 2032:
    //    non-zero balance and debt service, so its DSCR is defined).
    const key = await pickProperty(page, NAME);
    const label = key ? (await page.$eval("#opPropPick", s => ((s.options[s.selectedIndex] || {}).textContent || "").trim())) : "";
    ok(!!key && /whitewater/i.test(label) && !/\bII\b/.test(label), "picked " + NAME + " in #opPropPick (" + key + ")");
    if (!key) throw new Error("property not found in #opPropPick");
    const rowSel = '#opScanMount [data-op-flag="dscr"][data-op-prop=' + cssStr(key) + ']';
    ok((await page.$$(rowSel)).length === 0, "no dscr flag for the property before its NOI is entered");
    const gpr = page.locator('#opSheetMount tr[data-op-code="GPR"] [data-op-input]').first();
    await gpr.waitFor({ timeout: 15000 });
    // GPR 12,000 and nothing else → NOI $12,000 a year against six-figure debt service: DSCR ≪ dscrMin − 0.10 → severity 3.
    await gpr.click(); await gpr.fill("12000"); await gpr.press("Enter");   // Enter commits (blur → change → onEdit)

    // 3. The flag appears, names the property, carries severity 3 and reads DSCR vs its minimum.
    let appeared = true;
    try { await page.waitForSelector(rowSel, { state: "attached", timeout: 20000 }); } catch (e) { appeared = false; }
    ok(appeared, 'a "dscr" flag for the seeded property appears in #opScanMount');
    if (appeared) {
      const row = page.locator(rowSel).first();
      const name = ((await row.locator("[data-op-name]").first().textContent()) || "").trim();
      ok(name.length > 0 && (label.includes(name) || name.includes(label)), "the flag names the property: " + JSON.stringify(name));
      ok((await row.getAttribute("data-op-sev")) === "3", "severity 3 (NOI $12k against six-figure debt service)");
      const text = ((await row.textContent()) || "").replace(/\s+/g, " ").trim();
      ok(/DSCR/.test(text) && /minimum/.test(text), "row reads DSCR vs its minimum: " + text.slice(0, 140));
      ok((await dscrRows()).filter(k => k === key).length === 1, "exactly one dscr row for the property");

      // 4. click → onOpen(propKey): move to another property first so the re-focus is observable.
      const other = await page.$eval("#opPropPick", (s, k) => { const o = [...s.options].find(x => x.value && x.value !== k); return o ? o.value : null; }, key);
      if (other) {
        await page.selectOption("#opPropPick", other);
        await page.waitForFunction(v => document.querySelector("#opPropPick").value === v, other, { timeout: 5000 }).catch(() => {});
        await page.click(rowSel);
        let opened = true;
        try { await page.waitForFunction(v => document.querySelector("#opPropPick").value === v, key, { timeout: 8000 }); } catch (e) { opened = false; }
        ok(opened, "clicking the flag re-focuses the flagged property in #opPropPick");
      } else console.log("  skip only one property seeded — click→onOpen not exercised");
    }
  } catch (e) {
    ok(false, "e2e aborted: " + ((e && e.stack) || e));
    try { const shot = path.join(udata, "action-scan-e2e-fail.png"); await page.screenshot({ path: shot }); console.log("  screenshot: " + shot); } catch (_) {}
  }
  ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await app.close().catch(() => {});
  try { if (!fails.n) fs.rmSync(udata, { recursive: true, force: true }); } catch (_) {}
  console.log("\n" + (fails.n ? fails.n + " e2e check(s) FAILED   (profile kept: " + udata + ")" : "all e2e checks passed"));
  process.exit(fails.n ? 1 : 0);
})();
