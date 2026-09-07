/* ============================================================================
   Playwright-Electron e2e for the operating sheet (P4) — contract §9.
   Runs against the wired app (Underwriting tab: #opPropPick + #opSheetMount):
     cd /home/user/loans && GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/operating-sheet.e2e.js
   Throw-away profile (the seed portfolio, an empty operating store); everything
   flows through the sheet's own UI. Seeds lines by hand and checks: all 32 rows
   in §3 order; badges / dates / subtotals; the deduction sign rule (typed 60000
   → stored −60,000, NOI unchanged); a line the T12 never had (UTIL) entered by
   hand; the same-value guard (no write); Enter moving down a line; a pending
   edit committed by one click on the basis toggle; monthly ÷12 / ×12 to the
   cent; the controllable toggle; redraw idempotency; per-property isolation and
   the per-section fold — and it ends with zero page errors.
   ========================================================================== */
"use strict";
const path = require("path"), fs = require("fs");
const { launchApp, openUnderwriting, pickProperty, ok: mkOk, APP } = require("./_helpers.js");
const fails = { n: 0 }, okRaw = mkOk(fails);
let passes = 0;
const check = (c, m) => { okRaw(c, m); if (c) passes++; };
const eq = (a, e, m) => check(a === e, m + (a === e ? "" : "  — got " + JSON.stringify(a) + ", want " + JSON.stringify(e)));
const localToday = () => { const d = new Date(), p = n => (n < 10 ? "0" : "") + n; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
const ORDER = ["GPR","EMPL","MOD","VAC","CONC","BD",
  "RUBS","TRSH RUB","TRSH COL","PARK","PET","MTM","LATE","APP","ADM","AMEN","COM","CAM","ANT","OTH",
  "RET","INS","UTIL","RM","CS","PAY","MGMT","GA","BDX","MKT","TRSH","CAB","PLL"];

(async () => {
  const { app, page, errors, udata } = await launchApp();
  try {
    await openUnderwriting(page);
    const key = await pickProperty(page, "Villages of Whitewater");     // sorted first, ahead of "… II"; carries no NOI fields
    check(!!key, "picked Villages of Whitewater (" + key + ")");
    if (!key) throw new Error("#opPropPick has no 'Villages of Whitewater' option");
    await page.waitForSelector('#opSheetMount tr[data-op-code="GPR"]', { timeout: 15000 });

    const q = sel => "#opSheetMount " + sel;
    const inputSel = code => q('tr[data-op-code="' + code + '"] [data-op-input]');
    const inputVal = code => page.inputValue(inputSel(code));
    const cellText = (code, attr) => page.textContent(q('tr[data-op-code="' + code + '"] [' + attr + ']')).then(s => s.trim());
    const subText = k => page.textContent(q('tr[data-op-sub="' + k + '"] [data-op-value]')).then(s => s.trim());
    const countOf = sel => page.$$eval(sel, els => els.length);
    const waitSub = async (k, text, m) => {
      try {
        await page.waitForFunction(([kk, t]) => { const el = document.querySelector('#opSheetMount tr[data-op-sub="' + kk + '"] [data-op-value]'); return !!el && el.textContent.trim() === t; }, [k, text], { timeout: 10000 });
        check(true, m + " → " + k + " = " + text);
      } catch (e) { check(false, m + " — " + k + " is " + JSON.stringify(await subText(k).catch(() => null)) + ", want " + text); }
    };
    const waitBasis = b => page.waitForSelector('#opBasisToggle[data-basis="' + b + '"]', { timeout: 10000 });
    const setLine = async (code, text) => { await page.click(inputSel(code)); await page.fill(inputSel(code), text); await page.press(inputSel(code), "Enter"); };
    // the operating store (its own module API; never the loans store)
    const stored = code => page.evaluate(([k, c]) => { const r = window.OperatingStore ? OperatingStore.get(k) : null; return r && r.lines && r.lines[c] ? r.lines[c].annual : null; }, [key, code]);
    const focusedCode = () => page.evaluate(() => { const a = document.activeElement, tr = a && a.closest && a.closest("tr[data-op-code]"); return tr ? tr.getAttribute("data-op-code") + ":" + (a.hasAttribute("data-op-input") ? "input" : "other") : String(a && a.tagName); });

    // ---- fresh property: every §3 row, order, subtotals, defaults ----------------
    const c0 = await page.$$eval(q("tr[data-op-code]"), trs => trs.map(t => t.getAttribute("data-op-code")));
    eq(c0.join(","), ORDER.join(","), "a fresh property draws all 33 §3 rows in order (BDX after GA)");
    eq((await page.$$eval(q("tr[data-op-sub]"), trs => trs.map(t => t.getAttribute("data-op-sub")))).join(","), "ERI,EGI,OPEX,NOI", "subtotal rows ERI, EGI, OPEX, NOI in order");
    eq(await page.getAttribute("#opBasisToggle", "data-basis"), "annual", "sheet opens in the annual basis");
    eq(await countOf(q('tr[data-op-code="GPR"] [data-op-ctl]')), 0, "income rows carry no controllable toggle");
    eq(await countOf(q("tr[data-op-code][hidden]")), 0, "fresh property: nothing folded — all 33 rows visible");
    eq(await countOf(q('[data-op-more][aria-expanded="true"]')), 3, "three section toggles, all expanded");
    eq(await inputVal("GPR"), "", "GPR starts empty");
    eq(await inputVal("UTIL"), "", "UTIL has a row and starts empty");

    // ---- seed lines by hand; a deduction typed as a positive number -----------------
    await setLine("GPR", "1,300,000");
    await waitSub("ERI", "1,300,000.00", "GPR edit redraws the sheet");
    await setLine("VAC", "60000");
    await waitSub("ERI", "1,240,000.00", "VAC typed 60000 (positive) is stored as a deduction");
    eq(await stored("VAC"), -60000, "store holds VAC.annual = −60,000 after typing the positive number");
    eq(await inputVal("VAC"), "60,000.00", "VAC input shows the magnitude 60,000.00");
    await setLine("RET", "100000.00");
    await waitSub("OPEX", "100,000.00", "RET edit");
    eq(await subText("EGI"), "1,240,000.00", "EGI = 1,240,000.00 (derived)");
    eq(await subText("NOI"), "1,140,000.00", "NOI = 1,240,000 − 100,000 = 1,140,000.00 — vacancy deducted, never added");
    await setLine("VAC", "-70,000");
    await waitSub("ERI", "1,230,000.00", "VAC typed -70,000 stores −70,000");
    eq(await stored("VAC"), -70000, "store holds −70,000");
    await setLine("VAC", "70000"); await page.waitForTimeout(400);
    eq(await stored("VAC"), -70000, "retyping 70000 over −70,000 is not a write (still −70,000)");
    await setLine("VAC", "60000");
    await waitSub("ERI", "1,240,000.00", "back to −60,000 via the positive spelling");
    eq(await stored("VAC"), -60000, "store holds −60,000 again");
    eq(await subText("NOI"), "1,140,000.00", "NOI back to 1,140,000.00");
    eq(await cellText("GPR", "data-op-source"), "Manual", "hand-entered line shows the Manual badge");
    eq(await cellText("GPR", "data-op-updated"), localToday(), "last-updated shows today");
    eq(await cellText("INS", "data-op-source"), "not set", "untouched INS is not set");
    eq(await cellText("INS", "data-op-updated"), "—", "untouched INS has no date");

    // ---- a line the T12 never had, entered by hand ----------------------------------
    await setLine("UTIL", "24,000");
    await waitSub("OPEX", "124,000.00", "UTIL entered by hand → OPEX 100,000 + 24,000");
    eq(await subText("NOI"), "1,116,000.00", "NOI = 1,240,000 − 124,000");
    eq(await stored("UTIL"), 24000, "store holds UTIL = 24,000");
    eq(await countOf(q("tr[data-op-code][hidden]")), 0, "sections stay open after the first edits (fold state carried across redraws)");

    // a non-number is reverted, not written
    await setLine("MGMT", "abc"); await page.waitForTimeout(300);
    eq(await inputVal("MGMT"), "", "typing 'abc' reverts to empty (no write)");
    eq(await cellText("MGMT", "data-op-source"), "not set", "MGMT stays not set after a rejected entry");

    // ---- same number, different spelling: no write -----------------------------------
    const stampBefore = await page.getAttribute(q('tr[data-op-code="GPR"] [data-op-updated]'), "title");
    await page.evaluate(() => { const o = OperatingStore.setLine; window.__opSetLineCalls = 0; OperatingStore.setLine = function () { window.__opSetLineCalls++; return o.apply(this, arguments); }; });
    await setLine("GPR", "$1300000"); await page.waitForTimeout(400);
    eq(await page.evaluate(() => window.__opSetLineCalls), 0, "retyping $1300000 over 1,300,000.00 calls OperatingStore.setLine 0 times");
    eq(await page.getAttribute(q('tr[data-op-code="GPR"] [data-op-updated]'), "title"), stampBefore, "GPR updatedAt is unchanged");
    eq(await inputVal("GPR"), "1,300,000.00", "the text is re-normalised");
    await setLine("GPR", "1,300,000.50");
    await waitSub("ERI", "1,240,000.50", "a real change still writes");
    eq(await page.evaluate(() => window.__opSetLineCalls), 1, "…with exactly one setLine call");
    await setLine("GPR", "1,300,000");
    await waitSub("ERI", "1,240,000.00", "GPR restored");

    // ---- Enter commits and moves down a line ------------------------------------------
    await page.click(inputSel("RM")); await page.fill(inputSel("RM"), "6,000"); await page.press(inputSel("RM"), "Enter");
    await waitSub("OPEX", "130,000.00", "RM = 6,000 committed with Enter");
    await page.waitForFunction(() => { const a = document.activeElement, tr = a && a.closest && a.closest("tr[data-op-code]"); return !!tr && tr.getAttribute("data-op-code") === "CS" && a.hasAttribute("data-op-input"); }, null, { timeout: 5000 })
      .then(() => check(true, "after Enter the caret is on the next line (CS), across the host's redraw"))
      .catch(async () => check(false, "after Enter the caret should be on CS — it is on " + (await focusedCode())));
    await page.keyboard.press("Escape");

    // ---- a pending edit is committed by ONE click on the basis toggle ------------------
    await page.click(inputSel("GA")); await page.fill(inputSel("GA"), "3,000");
    await page.click("#opBasisToggle");
    await waitBasis("monthly").then(() => check(true, "one click on the toggle switched to monthly with an edit pending")).catch(() => check(false, "the toggle did not switch to monthly with an edit pending"));
    await waitSub("OPEX", "11,083.33", "…and the pending GA = 3,000 was committed (OPEX = (130,000 + 3,000) ÷ 12)");
    eq(await stored("GA"), 3000, "store holds GA = 3,000");
    eq(await inputVal("GA"), "250.00", "GA reads 250.00 in the monthly basis");

    // ---- monthly basis: ÷12 display, ×12 on edit, deductions as magnitudes -------------
    eq(await inputVal("GPR"), "108,333.33", "monthly: GPR = 1,300,000 ÷ 12 to the cent");
    eq(await inputVal("VAC"), "5,000.00", "monthly: VAC = 60,000 ÷ 12 (magnitude)");
    eq(await inputVal("RET"), "8,333.33", "monthly: RET = 100,000 ÷ 12");
    eq(await subText("ERI"), "103,333.33", "monthly: ERI = 1,240,000 ÷ 12");
    eq(await subText("NOI"), "92,250.00", "monthly: NOI = (1,240,000 − 133,000) ÷ 12 = 92,250.00");
    eq((await page.textContent(q("[data-op-basis-label]"))).trim(), "Monthly $", "column header follows the basis");
    await setLine("INS", "1,000.50");
    await waitSub("OPEX", "12,083.83", "monthly INS = 1,000.50 → OPEX (133,000 + 12,006) ÷ 12");
    eq(await inputVal("INS"), "1,000.50", "monthly: INS keeps the typed 1,000.50");
    eq(await stored("INS"), 12006, "store holds INS = 12,006 exactly (1,000.50 × 12)");
    await setLine("CONC", "500");
    await waitSub("ERI", "102,833.33", "monthly CONC typed 500 → −6,000 annual; ERI (1,240,000 − 6,000) ÷ 12");
    eq(await stored("CONC"), -6000, "store holds CONC = −6,000 (monthly magnitude ×12, sign forced)");
    eq(await inputVal("CONC"), "500.00", "CONC reads 500.00 monthly");
    await page.click("#opBasisToggle"); await waitBasis("annual");
    eq(await inputVal("INS"), "12,006.00", "annual: INS stored as exactly 1,000.50 × 12 = 12,006.00");
    eq(await inputVal("CONC"), "6,000.00", "annual: CONC reads 6,000.00 (stored −6,000)");
    eq(await subText("OPEX"), "145,006.00", "annual: OPEX = 133,000 + 12,006");
    eq(await subText("NOI"), "1,088,994.00", "annual: NOI = 1,234,000 − 145,006");
    eq(await inputVal("GPR"), "1,300,000.00", "annual: GPR unchanged by the basis round-trip");

    // ---- controllable toggle ------------------------------------------------------------
    const retCtl = q('tr[data-op-code="RET"] [data-op-ctl]');
    const retChecked = want => page.waitForFunction((w) => { const c = document.querySelector('#opSheetMount tr[data-op-code="RET"] [data-op-ctl]'); return !!c && c.checked === w; }, want, { timeout: 5000 }).catch(() => {});
    eq(await page.isChecked(retCtl), false, "RET starts non-controllable (default)");
    eq(await page.isChecked(q('tr[data-op-code="INS"] [data-op-ctl]')), false, "INS starts non-controllable (default)");
    eq(await page.isDisabled(q('tr[data-op-code="MGMT"] [data-op-ctl]')), true, "toggle disabled on a line with no value yet (MGMT)");
    eq(await page.isChecked(q('tr[data-op-code="UTIL"] [data-op-ctl]')), true, "UTIL entered by hand defaults to controllable");
    await page.click(retCtl); await retChecked(true);
    await page.click("#opBasisToggle"); await waitBasis("monthly");
    await page.click("#opBasisToggle"); await waitBasis("annual");
    eq(await page.isChecked(retCtl), true, "RET flag survives a full redraw (persisted via onToggleControllable)");
    await page.click(retCtl); await retChecked(false);
    await page.click("#opBasisToggle"); await waitBasis("monthly");
    await page.click("#opBasisToggle"); await waitBasis("annual");
    eq(await page.isChecked(retCtl), false, "RET flag flips back");

    // ---- idempotent redraw ----------------------------------------------------------------
    eq(await countOf(q("table")), 1, "one table after many redraws");
    eq(await countOf("#opBasisToggle"), 1, "one #opBasisToggle after many redraws");
    eq(await countOf(q('tr[data-op-code="GPR"]')), 1, "one GPR row after many redraws");
    eq(await countOf(q("tr[data-op-code]")), 33, "still exactly 33 line rows");

    // ---- per-property isolation, and the fold on a property that has lines --------------
    const key2 = await pickProperty(page, "Villages of Independence");
    check(!!key2 && key2 !== key, "picked a second property (" + key2 + ")");
    await page.waitForFunction(() => { const i = document.querySelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]'); return !!i && i.value === ""; }, null, { timeout: 10000 })
      .then(() => check(true, "another property opens an empty sheet")).catch(() => check(false, "another property should open an empty sheet"));
    eq(await countOf(q("tr[data-op-code][hidden]")), 0, "fresh second property: all rows visible");
    await pickProperty(page, "Villages of Whitewater");
    await page.waitForFunction(() => { const i = document.querySelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]'); return !!i && i.value === "1,300,000.00"; }, null, { timeout: 10000 })
      .then(() => check(true, "switching back restores the edited sheet")).catch(() => check(false, "switching back should restore the edited sheet"));
    eq(await countOf(q('tr[data-op-code="PAY"][hidden]')), 1, "PAY (unused) is folded away on a property with lines");
    eq(await countOf(q("tr[data-op-code][hidden]")), 24, "24 unused rows folded (rental 3 + other 14 + expense 7)");
    eq(await countOf(q('tr[data-op-code="MGMT"][hidden]')), 0, "MGMT (skeleton row) stays visible while unused");
    eq((await page.textContent(q('[data-op-more="expense"]'))).trim(), "Show 7 more lines", "expense fold reads Show 7 more lines (CS, PAY, BDX, MKT, TRSH, CAB, PLL)");
    eq((await page.textContent(q('[data-op-more="rental"]'))).trim(), "Show 3 more lines", "rental fold reads Show 3 more lines (EMPL, MOD, BD)");
    await page.click(q('[data-op-more="expense"]'));
    await page.waitForFunction(() => !document.querySelector('#opSheetMount tr[data-op-code="PAY"][hidden]'), null, { timeout: 5000 })
      .then(() => check(true, "Show more reveals the expense rows")).catch(() => check(false, "Show more should reveal PAY"));
    eq((await page.textContent(q('[data-op-more="expense"]'))).trim(), "Hide 7 unused lines", "the toggle label flips to Hide 7 unused lines");
    await setLine("PAY", "9,000");
    await waitSub("OPEX", "154,006.00", "PAY entered after unfolding → OPEX 145,006 + 9,000");
    eq(await countOf(q('tr[data-op-code="CS"][hidden]')), 0, "the expense section stays open across the redraw");
    eq(await countOf(q('tr[data-op-code="EMPL"][hidden]')), 1, "the rental section stays folded");

    eq(errors.length, 0, "zero page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  } catch (e) {
    check(false, "unexpected error: " + ((e && e.stack) || e));
    try { await page.screenshot({ path: path.join(APP, "operating-sheet-e2e-failure.png") }); } catch (_) {}
  } finally {
    try { await app.close(); } catch (_) {}
    try { fs.rmSync(udata, { recursive: true, force: true }); } catch (_) {}
  }
  console.log("\n" + passes + " passed, " + fails.n + " failed");
  process.exit(fails.n ? 1 : 0);
})();
