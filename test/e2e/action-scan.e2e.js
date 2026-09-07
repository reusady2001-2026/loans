// ActionScan e2e (contract §9) — Playwright-Electron against the real app.
// Runs only AFTER the orchestrator has wired the Underwriting tab mounts
// (#opPropPick, #opSheetMount, #opScanMount); it was written, not run, by the P8 builder.
//   GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/action-scan.e2e.js
// Scenario: fresh profile (the app seeds its sample portfolio) → open Underwriting →
// pick a live property → type a tiny GPR into its sheet (NOI far below its debt
// service) → a "dscr" flag naming that property appears in #opScanMount; clicking
// it opens the property. Before the edit there is no dscr flag (the "not otherwise" half).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { _electron: electron } = require((process.env.GN || "/opt/node22/lib/node_modules") + "/playwright");
const APP = "/home/user/loans";
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), "lds-e2e-action-scan-"));   // fresh profile → seeded portfolio, empty operating store
let passed = 0, failed = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (c) passed++; else failed++; };
const cssStr = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

(async () => {
  const app = await electron.launch({ executablePath: require(APP + "/node_modules/electron"),
    args: [APP, "--user-data-dir=" + UDATA, "--no-sandbox"], cwd: APP });
  try {
    const page = await app.firstWindow();
    await page.route(/^https?:\/\//, r => r.abort());   // offline: live-rate fetches fall back to their defaults
    await page.waitForSelector("#loanSelect option", { timeout: 60000 });

    // Underwriting tab lives behind the tab strip's "+" menu.
    await page.click("#tabNewBtn");
    await page.click('[data-tabopen="underwriting"]');
    await page.waitForSelector("#uwView:not([hidden])", { timeout: 15000 });
    await page.waitForSelector("#opPropPick option", { timeout: 15000 });
    await page.waitForSelector("#opScanMount", { timeout: 15000 });

    // A live seeded property — prefer Villages of Whitewater (fixed 4.7%, matures 2032:
    // non-zero balance and debt service, so the DSCR ratio is defined).
    const opts = await page.$$eval("#opPropPick option", os => os.map(o => ({ value: o.value, label: (o.textContent || "").trim() })).filter(o => o.value));
    const pick = opts.find(o => /whitewater/i.test(o.label) && !/\bII\b/.test(o.label)) || opts[0];
    ok(!!pick, "a property is offered in #opPropPick" + (pick ? ": " + pick.label + " (" + pick.value + ")" : ""));
    if (!pick) throw new Error("no property to seed");
    const rowSel = '#opScanMount [data-op-flag="dscr"][data-op-prop=' + cssStr(pick.value) + ']';

    // Not otherwise: with no operating record there is no NOI, so no dscr flag yet.
    ok((await page.locator(rowSel).count()) === 0, "no dscr flag for the property before any NOI is entered");

    await page.selectOption("#opPropPick", pick.value);
    // Seed through the sheet UI: GPR = 12,000 and nothing else → NOI $12,000 on the annual
    // basis (or $144,000 if the sheet is on its monthly basis) — either is far under the
    // loan's six-figure debt service, so DSCR < dscrMin − 0.10 → severity 3.
    const gpr = page.locator('#opSheetMount [data-op-code="GPR"] [data-op-input]').first();
    await gpr.waitFor({ timeout: 15000 });
    await gpr.fill("12000");
    await gpr.dispatchEvent("change");
    await page.keyboard.press("Tab");

    let appeared = true;
    try { await page.locator(rowSel).first().waitFor({ timeout: 20000 }); } catch (e) { appeared = false; }
    ok(appeared, 'a "dscr" flag for the seeded property appears in #opScanMount');
    if (appeared) {
      const row = page.locator(rowSel).first();
      const name = ((await row.locator("[data-op-name]").first().textContent()) || "").trim();
      ok(name.length > 0 && (pick.label.includes(name) || name.includes(pick.label)), "the flag names the property: " + JSON.stringify(name));
      ok((await row.getAttribute("data-op-sev")) === "3", "severity 3 (NOI of $12k against six-figure debt service)");
      const text = ((await row.textContent()) || "").replace(/\s+/g, " ").trim();
      ok(/DSCR/.test(text) && /minimum/.test(text), "row reads DSCR vs its minimum: " + text.slice(0, 140));

      // click → onOpen(propKey): move to another property first so the navigation is observable.
      const other = opts.find(o => o.value !== pick.value);
      if (other) {
        await page.selectOption("#opPropPick", other.value);
        await page.locator(rowSel).first().click();
        let opened = true;
        try { await page.waitForFunction(v => document.querySelector("#opPropPick").value === v, pick.value, { timeout: 5000 }); } catch (e) { opened = false; }
        ok(opened, "clicking the flag opens the flagged property in #opPropPick");
      } else console.log("  skip only one property seeded — click→onOpen not exercised");
    }
    await page.screenshot({ path: path.join(UDATA, "action-scan.png"), fullPage: true }).catch(() => {});
  } catch (e) {
    ok(false, "e2e threw: " + ((e && e.stack) || e));
  } finally {
    await app.close().catch(() => {});
  }
  console.log("\n" + passed + " passed, " + failed + " failed   (profile + screenshot: " + UDATA + ")");
  process.exit(failed ? 1 : 0);
})();
