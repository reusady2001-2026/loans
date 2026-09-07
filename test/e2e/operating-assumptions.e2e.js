// Playwright-Electron e2e for the P6 assumptions panel (OPERATING-CONTRACT §7 / §9).
// Runs AFTER the orchestrator wires `#opPropPick` (property <select>, option value =
// propKey) and `#opAssumpMount` into the Underwriting tab:
//   GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/operating-assumptions.e2e.js
// Scenario: seed two properties through the UI (Add Loan form) → open Underwriting →
// pick Alpha → cap rate "inherited" → change it to 6.25 → badge "override" → Beta
// still "inherited" → back to Alpha, override persisted → Reset → "inherited" again,
// and still inherited after leaving and returning. Nothing touches localStorage
// directly; every bit of state flows through the app's own UI.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { _electron: electron } = require((process.env.GN || "/opt/node22/lib/node_modules") + "/playwright");
const APP = path.resolve(__dirname, "..", "..");
const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), "lds-e2e-assump-"));

const results = [];
let failed = 0;
function check(cond, msg, extra){
  if (cond) results.push("  ok   " + msg);
  else { failed++; results.push("  FAIL " + msg + (extra === undefined ? "" : "  — got " + JSON.stringify(extra))); }
}
function finish(code){
  console.log(results.join("\n"));
  console.log((results.length - failed) + " passed, " + failed + " failed");
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}
// Poll fn(arg) in the page until truthy (returns it) or time out (throws naming `what`).
async function until(page, fn, arg, what, timeout){
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < (timeout || 8000)){
    last = await page.evaluate(fn, arg);
    if (last) return last;
    await page.waitForTimeout(100);
  }
  throw new Error("timed out waiting for " + what + " (last value: " + JSON.stringify(last) + ")");
}
const PANEL = "#opAssumpMount [data-op-assump-panel]";
const badgeSel = (p) => '#opAssumpMount [data-op-badge="' + p + '"]';
const inputSel = (p) => '#opAssumpMount [data-op-assump="' + p + '"]';
const badge = async (page, p) => (await page.textContent(badgeSel(p))).trim();
const value = async (page, p) => page.inputValue(inputSel(p));
// Wait (quietly) for a badge to reach a state; the caller then asserts the real value.
async function settleBadge(page, p, state){
  await until(page, ([sel, st]) => { const b = document.querySelector(sel); return !!b && b.textContent.trim() === st; },
    [badgeSel(p), state], "badge " + p + " = " + state).catch(() => {});
}

// Add a loan through the real form — the minimal set validateLoan accepts for a new
// Fixed loan (the index defaults to SOFR; the spread prices it, no rate needed).
async function seedLoan(page, name){
  await page.click("#addBtn");
  await page.waitForSelector("#formView:not([hidden])", { timeout: 10000 });
  await page.waitForSelector("#f_propertyName", { timeout: 10000 });
  await page.fill("#f_propertyName", name);
  await page.fill("#f_originalAmount", "10000000");
  await page.fill("#f_spread", "2.5");
  await page.fill("#f_originationDate", "2024-01-01");
  await page.fill("#f_firstPaymentDate", "2024-02-01");
  await page.fill("#f_loanTermMonths", "120");
  await page.fill("#f_amortizationMonths", "360");
  await page.click("#saveBtn");
  const outcome = await until(page, () => {
    const err = document.getElementById("formError"), fv = document.getElementById("formView");
    if (err && !err.classList.contains("hidden") && err.textContent.trim()) return { error: err.textContent.trim() };
    if (fv && fv.hidden) return { saved: true };
    return null;
  }, undefined, "the Add Loan form to close for " + name);
  if (outcome.error) throw new Error("Add Loan rejected " + name + ": " + outcome.error);
}

(async () => {
  const app = await electron.launch({ executablePath: require(path.join(APP, "node_modules", "electron")),
    args: [APP, "--user-data-dir=" + UDATA, "--no-sandbox"], cwd: APP });
  const page = await app.firstWindow();
  await page.route(/^https?:\/\//, (r) => r.abort());
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.waitForSelector("#addBtn", { timeout: 30000 });

  // ---- seed two properties through the UI ----------------------------------
  await seedLoan(page, "Alpha Tower");
  await seedLoan(page, "Beta Court");

  // ---- open the Underwriting tab ("+" → Underwriting & Sizing) ---------------
  await page.click("#tabNewBtn");
  await page.click('[data-tabopen="underwriting"]');
  await page.waitForSelector("#uwView:not([hidden])", { timeout: 10000 });
  await page.waitForSelector("#opPropPick", { timeout: 15000 })
    .catch(() => { throw new Error("#opPropPick not found — the orchestrator has not wired the property picker into the Underwriting tab yet"); });

  // Match options by value (propKey "name:alpha tower") or by label — whichever the orchestrator shows.
  const options = await until(page, () => {
    const s = document.getElementById("opPropPick"); if (!s) return null;
    const o = Array.from(s.options).map((x) => ({ value: x.value, text: x.textContent.trim() }));
    return o.length >= 2 ? o : null;
  }, undefined, "#opPropPick to list the two seeded properties (is it populated from the loans list?)", 15000);
  const find = (n) => options.find((o) => o.value.toLowerCase().indexOf(n) >= 0 || o.text.toLowerCase().indexOf(n) >= 0);
  const A = find("alpha"), B = find("beta");
  check(!!A && !!B, "both seeded properties appear in #opPropPick", options);
  if (!A || !B){ await app.close(); return finish(1); }

  // Select a property and wait for the panel to be REBUILT (render replaces the mount's
  // content, so a marker stamped on the old panel node vanishes when the new one lands).
  async function pick(opt){
    await page.evaluate((sel) => { const p = document.querySelector(sel); if (p) p.setAttribute("data-e2e-stale", "1"); }, PANEL);
    await page.selectOption("#opPropPick", opt.value);
    const fresh = await until(page, (sel) => { const p = document.querySelector(sel); return !!p && !p.hasAttribute("data-e2e-stale"); },
      PANEL, "the assumptions panel to render for " + opt.text).then(() => true, () => false);
    check(fresh, "assumptions panel rendered after picking " + opt.text);
    await page.waitForSelector(inputSel("sizing.capRate"), { timeout: 10000 });
  }

  // ---- Alpha: inherited → override ------------------------------------------
  await pick(A);
  check((await badge(page, "sizing.capRate")) === "inherited", "Alpha: cap rate badge starts 'inherited'", await badge(page, "sizing.capRate"));
  check((await value(page, "sizing.capRate")) === "5.5", "Alpha: cap rate shows the global default as a percent (5.5)", await value(page, "sizing.capRate"));
  check((await badge(page, "vacancyPct")) === "inherited", "Alpha: vacancy badge starts 'inherited'", await badge(page, "vacancyPct"));
  check(await page.$("#opAssumpReset") !== null, "#opAssumpReset is rendered");

  await page.fill(inputSel("sizing.capRate"), "6.25");
  await page.press(inputSel("sizing.capRate"), "Enter");
  await settleBadge(page, "sizing.capRate", "override");
  check((await badge(page, "sizing.capRate")) === "override", "Alpha: cap rate badge reads 'override' after the change", await badge(page, "sizing.capRate"));
  check((await value(page, "sizing.capRate")) === "6.25", "Alpha: cap rate input shows 6.25", await value(page, "sizing.capRate"));
  check((await badge(page, "vacancyPct")) === "inherited", "Alpha: vacancy still 'inherited' (the patch was minimal)", await badge(page, "vacancyPct"));
  check((await badge(page, "sizing.ltvMax")) === "inherited", "Alpha: max LTV still 'inherited'", await badge(page, "sizing.ltvMax"));

  // ---- Beta is untouched -----------------------------------------------------
  await pick(B);
  check((await badge(page, "sizing.capRate")) === "inherited", "Beta: cap rate badge is 'inherited' (overrides are per property)", await badge(page, "sizing.capRate"));
  check((await value(page, "sizing.capRate")) === "5.5", "Beta: cap rate shows the global 5.5", await value(page, "sizing.capRate"));

  // ---- back to Alpha: the override persisted through the store ---------------
  await pick(A);
  check((await badge(page, "sizing.capRate")) === "override", "Alpha again: override persisted", await badge(page, "sizing.capRate"));
  check((await value(page, "sizing.capRate")) === "6.25", "Alpha again: cap rate still 6.25", await value(page, "sizing.capRate"));

  // ---- Reset → inherit -------------------------------------------------------
  await page.click("#opAssumpReset");
  await settleBadge(page, "sizing.capRate", "inherited");
  check((await badge(page, "sizing.capRate")) === "inherited", "Alpha: cap rate badge 'inherited' after Reset", await badge(page, "sizing.capRate"));
  check((await value(page, "sizing.capRate")) === "5.5", "Alpha: cap rate back to the global 5.5 after Reset", await value(page, "sizing.capRate"));
  const states = await page.$$eval("#opAssumpMount [data-op-badge]", (els) => els.map((e) => e.textContent.trim()));
  check(states.length === 9 && states.every((s) => s === "inherited"), "Alpha: all nine badges 'inherited' after Reset", states);

  // Reset must stick: leave and come back.
  await pick(B);
  await pick(A);
  check((await badge(page, "sizing.capRate")) === "inherited", "Alpha after a round trip: still 'inherited' (reset persisted)", await badge(page, "sizing.capRate"));

  await app.close();
  finish(failed ? 1 : 0);
})().catch((e) => { console.error("E2E ERROR:", (e && e.stack) || e); finish(1); });
