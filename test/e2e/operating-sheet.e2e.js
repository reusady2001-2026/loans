/* ============================================================================
   Playwright-Electron e2e for the operating sheet (P4) — contract §9.
   Runs only AFTER the orchestrator has wired `#opPropPick` + `#opSheetMount`
   into the Underwriting tab:
     GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/operating-sheet.e2e.js
   Uses a throw-away profile (the app's seed portfolio, an empty operating
   store) and drives the sheet through its UI only — never localStorage:
   seeds three lines, checks rows / badges / dates / subtotals, flips to the
   monthly basis (÷12 to the cent), edits in monthly mode, then re-reads the
   sheet in annual mode to prove the stored value is exactly ×12.
   ========================================================================== */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const GN = process.env.GN || "/opt/node22/lib/node_modules";
const { _electron: electron } = require(GN + "/playwright");
const APP = "/home/user/loans";
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), "lds-opsheet-"));
const ORDER = ["GPR","EMPL","MOD","VAC","CONC","BD",
  "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH",
  "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","MKT","TRSH","CAB","PLL"];

let fails = 0, passes = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (c) passes++; else fails++; };
const eq = (a, e, m) => ok(a === e, m + (a === e ? "" : "  — got " + JSON.stringify(a) + ", want " + JSON.stringify(e)));
const localToday = () => { const d = new Date(), p = n => (n < 10 ? "0" : "") + n; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };

(async () => {
  const app = await electron.launch({
    executablePath: require(APP + "/node_modules/electron"),
    args: [APP, "--user-data-dir=" + UDATA, "--no-sandbox"], cwd: APP
  });
  let page = null;
  try {
    page = await app.firstWindow();
    await page.route(/^https?:\/\//, r => r.abort());
    await page.waitForLoadState("domcontentloaded");
    // The intro splash overlays the whole app for ~6 s; nothing is clickable until it is gone.
    await page.waitForSelector("#ldshSplash", { state: "detached", timeout: 30000 });

    // Underwriting tab via the "+" menu (the app's own UI; openTab() is not a global).
    await page.click("#tabNewBtn");
    await page.click('[data-tabopen="underwriting"]');
    await page.waitForSelector("#uwView:not([hidden])", { timeout: 15000 });

    const pick = page.locator("#opPropPick");
    await pick.waitFor({ state: "visible", timeout: 30000 });
    // Prefer a seed property that carries no NOI fields (so its sheet starts empty); else the first real option.
    const keys = await pick.evaluate(sel => Array.from(sel.options).filter(o => o.value).map(o => ({ value: o.value, text: o.textContent || "" })));
    const first = keys.find(o => /villages of whitewater(?! ii)/i.test(o.text)) || keys[0];
    ok(!!first, "property picker lists the seed portfolio (" + keys.length + " options)");
    if (!first) throw new Error("#opPropPick has no selectable property");
    await pick.selectOption(first.value);

    const mount = page.locator("#opSheetMount");
    await mount.locator('tr[data-op-code="GPR"]').waitFor({ timeout: 15000 });
    const codes   = () => mount.locator("tr[data-op-code]").evaluateAll(trs => trs.map(t => t.getAttribute("data-op-code")));
    const input   = code => mount.locator('tr[data-op-code="' + code + '"] [data-op-input]');
    const inputVal = code => input(code).inputValue();
    const subText = key => mount.locator('tr[data-op-sub="' + key + '"] [data-op-value]').textContent().then(s => s.trim());
    const cell    = (code, attr) => mount.locator('tr[data-op-code="' + code + '"] [' + attr + ']').textContent().then(s => s.trim());
    const waitSub = async (key, text, m) => {
      try {
        await page.waitForFunction(([k, t]) => { const el = document.querySelector('#opSheetMount tr[data-op-sub="' + k + '"] [data-op-value]'); return !!el && el.textContent.trim() === t; }, [key, text], { timeout: 10000 });
        ok(true, m + " → " + key + " = " + text);
      } catch (e) { ok(false, m + " — " + key + " is " + JSON.stringify(await subText(key).catch(() => null)) + ", want " + text); }
    };
    const waitBasis = b => page.waitForSelector('#opBasisToggle[data-basis="' + b + '"]', { timeout: 10000 });
    const setLine = async (code, text) => { const i = input(code); await i.click(); await i.fill(text); await i.press("Enter"); };

    // ---- fresh property: always-rows, order, subtotals, basis --------------------
    const c0 = await codes();
    const inOrder = arr => arr.every((c, i) => ORDER.includes(c) && (i === 0 || ORDER.indexOf(arr[i - 1]) < ORDER.indexOf(c)));
    ok(inOrder(c0), "rows are in §3 order: " + c0.join(", "));
    ok(["GPR","VAC","RET","INS","MGMT"].every(c => c0.includes(c)), "GPR, VAC, RET, INS, MGMT are drawn on a fresh property");
    const subs = await mount.locator("tr[data-op-sub]").evaluateAll(trs => trs.map(t => t.getAttribute("data-op-sub")));
    eq(subs.join(","), "ERI,EGI,OPEX,NOI", "subtotal rows ERI, EGI, OPEX, NOI in order");
    eq(await page.getAttribute("#opBasisToggle", "data-basis"), "annual", "sheet opens in the annual basis");
    eq(await mount.locator('tr[data-op-code="GPR"] [data-op-ctl]').count(), 0, "income rows carry no controllable toggle");
    eq(await inputVal("GPR"), "", "GPR starts empty on a fresh property");

    // ---- seed three lines through the sheet UI ------------------------------------
    await setLine("GPR", "1,200,000");
    await waitSub("ERI", "1,200,000.00", "GPR edit redraws the sheet");
    await setLine("VAC", "-60000");
    await waitSub("ERI", "1,140,000.00", "VAC edit (stored negative)");
    await setLine("RET", "100000.00");
    await waitSub("OPEX", "100,000.00", "RET edit");
    eq(await inputVal("GPR"), "1,200,000.00", "GPR shows 1,200,000.00");
    eq(await inputVal("VAC"), "-60,000.00", "VAC shows -60,000.00");
    eq(await inputVal("RET"), "100,000.00", "RET shows 100,000.00");
    eq(await subText("EGI"), "1,140,000.00", "EGI = 1,140,000.00 (derived)");
    eq(await subText("NOI"), "1,040,000.00", "NOI = 1,140,000 − 100,000 = 1,040,000.00 (derived)");
    eq(await cell("GPR", "data-op-source"), "Manual", "hand-entered line carries the Manual badge");
    eq(await cell("GPR", "data-op-updated"), localToday(), "last-updated shows today");
    eq(await cell("INS", "data-op-source"), "not set", "untouched INS is marked not set");
    eq(await cell("INS", "data-op-updated"), "—", "untouched INS has no date");

    // a non-number is reverted, not written
    await setLine("MGMT", "abc");
    eq(await inputVal("MGMT"), "", "typing 'abc' reverts to empty (no write)");
    eq(await cell("MGMT", "data-op-source"), "not set", "MGMT stays not set after a rejected entry");

    // ---- monthly basis: ÷12 display, ×12 on edit ------------------------------------
    await page.click("#opBasisToggle");
    await waitBasis("monthly");
    eq(await inputVal("GPR"), "100,000.00", "monthly: GPR = 1,200,000 ÷ 12");
    eq(await inputVal("VAC"), "-5,000.00", "monthly: VAC = -60,000 ÷ 12");
    eq(await inputVal("RET"), "8,333.33", "monthly: RET = 100,000 ÷ 12 to the cent");
    eq(await subText("ERI"), "95,000.00", "monthly: ERI ÷ 12");
    eq(await subText("NOI"), "86,666.67", "monthly: NOI = 1,040,000 ÷ 12 to the cent");
    eq((await page.locator("#opSheetMount [data-op-basis-label]").textContent()).trim(), "Monthly $", "column header follows the basis");
    await setLine("INS", "1,000.50");
    await waitSub("OPEX", "9,333.83", "monthly INS = 1,000.50 → OPEX (100,000 + 12,006) ÷ 12");
    eq(await inputVal("INS"), "1,000.50", "monthly: INS keeps the typed 1,000.50");
    eq(await cell("INS", "data-op-source"), "Manual", "INS now carries the Manual badge");
    await page.click("#opBasisToggle");
    await waitBasis("annual");
    eq(await inputVal("INS"), "12,006.00", "annual: INS stored as exactly 1,000.50 × 12 = 12,006.00");
    eq(await subText("OPEX"), "112,006.00", "annual: OPEX = 100,000 + 12,006");
    eq(await subText("NOI"), "1,027,994.00", "annual: NOI = 1,140,000 − 112,006");
    eq(await inputVal("GPR"), "1,200,000.00", "annual: GPR unchanged by the basis round-trip");

    // ---- controllable toggle -----------------------------------------------------------
    const ret = mount.locator('tr[data-op-code="RET"] [data-op-ctl]');
    eq(await ret.isChecked(), false, "RET starts non-controllable (default)");
    eq(await mount.locator('tr[data-op-code="INS"] [data-op-ctl]').isChecked(), false, "INS starts non-controllable (default)");
    eq(await mount.locator('tr[data-op-code="MGMT"] [data-op-ctl]').isDisabled(), true, "toggle disabled on a line with no value yet (MGMT)");
    await ret.click();
    await page.click("#opBasisToggle"); await waitBasis("monthly");
    await page.click("#opBasisToggle"); await waitBasis("annual");
    eq(await ret.isChecked(), true, "RET flag survives a full redraw (persisted via onToggleControllable)");
    await ret.click();
    await page.click("#opBasisToggle"); await waitBasis("monthly");
    await page.click("#opBasisToggle"); await waitBasis("annual");
    eq(await ret.isChecked(), false, "RET flag flips back");

    // ---- idempotent redraw --------------------------------------------------------------
    eq(await mount.locator("table").count(), 1, "one table after many redraws");
    eq(await page.locator("#opBasisToggle").count(), 1, "one #opBasisToggle after many redraws");
    eq(await mount.locator('tr[data-op-code="GPR"]').count(), 1, "one GPR row after many redraws");

    // ---- per-property isolation through the picker --------------------------------------
    const second = keys.find(o => o.value !== first.value);
    if (second) {
      await pick.selectOption(second.value);
      await page.waitForFunction(() => { const i = document.querySelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]'); return !!i && i.value === ""; }, null, { timeout: 10000 })
        .then(() => ok(true, "another property opens an empty sheet")).catch(() => ok(false, "another property should open an empty sheet"));
      await pick.selectOption(first.value);
      await page.waitForFunction(() => { const i = document.querySelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]'); return !!i && i.value === "1,200,000.00"; }, null, { timeout: 10000 })
        .then(() => ok(true, "switching back restores the edited sheet")).catch(() => ok(false, "switching back should restore the edited sheet"));
    } else console.log("  skipped: only one property in the picker — isolation check not run");
  } catch (e) {
    ok(false, "unexpected error: " + ((e && e.stack) || e));
    try { if (page) await page.screenshot({ path: path.join(APP, "operating-sheet-e2e-failure.png") }); } catch (_) {}
  } finally {
    try { await app.close(); } catch (_) {}
    try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (_) {}
  }
  console.log("\n" + passes + " passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})();
