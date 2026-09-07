// Playwright-Electron e2e for the P6 assumptions panel (OPERATING-CONTRACT §7 / §9).
//   cd /home/user/loans && GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/operating-assumptions.e2e.js
// Drives the app's own SEED portfolio through the shared helpers: pick "Avalon" (senior +
// mezz on one property) → cap rate "inherited" → 6.25 → "override" badge and the store
// holds the minimal patch → "Villages of Whitewater" still "inherited" → back to Avalon:
// persisted → Reset → "inherited" (store null) and still so after a round trip. Also the
// panel's guards (out of range, not a number, no-op re-entry, blank → inherit) and a
// real-DOM layout measurement at the real mount width (no overlapping rects). The store
// is read straight from localStorage["ldsHub.operating.v1"]; nothing writes it directly.
"use strict";
const fs = require("fs");
const { launchApp, openUnderwriting, pickProperty, ok } = require("./_helpers.js");
const fails = { n: 0 }, okf = ok(fails);
const check = (c, m, extra) => okf(c, m + (c || extra === undefined ? "" : "  — got " + JSON.stringify(extra)));
const info = (m) => console.log("  info " + m);
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : (v && typeof v === "object") ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {}) : v;
const SJ = (v) => JSON.stringify(sortKeys(v));
const NAME_A = "Avalon", NAME_B = "Villages of Whitewater";
const PANEL = "#opAssumpMount [data-op-assump-panel]";
const badgeSel = (p) => '#opAssumpMount [data-op-badge="' + p + '"]';
const inputSel = (p) => '#opAssumpMount [data-op-assump="' + p + '"]';
const warnSel = (p) => '#opAssumpMount [data-op-warn="' + p + '"]';
// Poll fn(arg) in the page until truthy (returns it) or time out (throws naming `what`).
async function until(page, fn, arg, what, timeout){
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < (timeout || 8000)){ last = await page.evaluate(fn, arg); if (last) return last; await page.waitForTimeout(100); }
  throw new Error("timed out waiting for " + what + " (last: " + JSON.stringify(last) + ")");
}

(async () => {
  const { app, page, errors, udata } = await launchApp();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await openUnderwriting(page);
  const options = await page.$$eval("#opPropPick option", (els) => els.filter((o) => o.value).map((o) => ({ value: o.value, text: o.textContent.trim() })));
  check(options.length >= 2, "seed portfolio lists >= 2 properties in #opPropPick (" + options.length + ")");

  const badge = async (p) => (await page.textContent(badgeSel(p))).trim();
  const value = async (p) => page.inputValue(inputSel(p));
  const warn = async (p) => { const el = await page.$(warnSel(p)); return el ? (await el.textContent()).trim() : null; };
  const settle = (p, st) => until(page, ([sel, s]) => { const b = document.querySelector(sel); return !!b && b.textContent.trim() === s; }, [badgeSel(p), st], "badge " + p + " = " + st).catch(() => {});
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem("ldsHub.operating.v1") || "null"));
  const assumptionsOf = async (key) => { const s = await store(); const r = s && s.records && s.records[key]; return r ? r.assumptions : undefined; };
  // Select a property and wait for the panel to be REBUILT (render replaces the mount's
  // content, so a marker stamped on the old panel node vanishes when the new one lands).
  async function pick(name){
    await page.evaluate((sel) => { const p = document.querySelector(sel); if (p) p.setAttribute("data-e2e-stale", "1"); }, PANEL);
    const key = await pickProperty(page, name);
    check(!!key, "pickProperty('" + name + "') found the property in #opPropPick", options.map((o) => o.text));
    if (!key) throw new Error("property not in #opPropPick: " + name);
    const fresh = await until(page, (sel) => { const p = document.querySelector(sel); return !!p && !p.hasAttribute("data-e2e-stale"); }, PANEL, "panel render for " + name).then(() => true, () => false);
    check(fresh, "assumptions panel (re)rendered for " + name);
    return key;
  }

  // ---- A: starts inherited -------------------------------------------------
  const keyA = await pick(NAME_A);
  info("A = " + keyA);
  check((await badge("sizing.capRate")) === "inherited", "A: cap rate badge starts 'inherited'", await badge("sizing.capRate"));
  check((await value("sizing.capRate")) === "5.5", "A: cap rate shows the global 5.5 (percent number)", await value("sizing.capRate"));
  check((await value("sizing.ltvMax")) === "75" && (await value("sizing.dscrMin")) === "1.2" && (await value("sizing.amortYears")) === "30" && (await value("reservePerUnit")) === "200", "A: LTV 75 / DSCR 1.2 / 30 yrs / $200 shown plain");
  check((await page.$$eval("#opAssumpMount [data-op-assump]", (e) => e.length)) === 9, "A: nine data-op-assump inputs");
  check(await page.$("#opAssumpReset") !== null, "#opAssumpReset rendered");
  check((await assumptionsOf(keyA)) == null, "store: A carries no overrides yet", await assumptionsOf(keyA));

  // ---- layout at the real mount width ----------------------------------------
  const layout = await page.evaluate(() => {
    const mount = document.getElementById("opAssumpMount"), m = mount.getBoundingClientRect();
    const rows = Array.from(mount.querySelectorAll("[data-op-assump-row]")).map((r) => {
      const l = r.firstElementChild.getBoundingClientRect(), c = r.lastElementChild.getBoundingClientRect(), rr = r.getBoundingClientRect();
      return { path: r.getAttribute("data-op-assump-row"), top: Math.round(rr.top), bottom: Math.round(rr.bottom), labelLeft: Math.round(l.left), labelRight: Math.round(l.right),
               ctlLeft: Math.round(c.left), ctlRight: Math.round(c.right), overlap: l.right > c.left + 0.5, outside: c.right > m.right + 0.5 || l.left < m.left - 0.5 };
    });
    let vOverlap = 0; for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 0.5) vOverlap++;
    return { mountLeft: Math.round(m.left), mountRight: Math.round(m.right), mountWidth: Math.round(m.width), rows, vOverlap };
  });
  info("mount " + layout.mountLeft + "–" + layout.mountRight + " (" + layout.mountWidth + "px)");
  layout.rows.forEach((r) => info("  " + r.path.padEnd(18) + " label " + r.labelLeft + "–" + r.labelRight + "  control " + r.ctlLeft + "–" + r.ctlRight + "  y " + r.top + "–" + r.bottom + (r.overlap ? "  OVERLAP" : "") + (r.outside ? "  OUTSIDE" : "")));
  check(layout.mountWidth > 0 && layout.mountWidth < 600, "mount is the narrow third-of-a-card column (" + layout.mountWidth + "px)");
  check(layout.rows.length === 9 && layout.rows.every((r) => !r.overlap), "no row's label overlaps its control at " + layout.mountWidth + "px", layout.rows.filter((r) => r.overlap).map((r) => r.path));
  check(layout.rows.every((r) => !r.outside), "every control sits inside the mount", layout.rows.filter((r) => r.outside).map((r) => r.path));
  check(layout.vOverlap === 0, "rows stack without vertical overlap", layout.vOverlap);

  // ---- A: override the cap rate (Enter commits) ------------------------------
  await page.fill(inputSel("sizing.capRate"), "6.25");
  await page.press(inputSel("sizing.capRate"), "Enter");
  await settle("sizing.capRate", "override");
  check((await badge("sizing.capRate")) === "override", "A: cap rate badge reads 'override' after Enter", await badge("sizing.capRate"));
  check((await value("sizing.capRate")) === "6.25", "A: cap rate input shows 6.25", await value("sizing.capRate"));
  check((await badge("vacancyPct")) === "inherited" && (await badge("sizing.ltvMax")) === "inherited", "A: vacancy + max LTV still 'inherited' (the patch was minimal)");
  check(SJ(await assumptionsOf(keyA)) === SJ({ sizing: { capRate: 0.0625 } }), "localStorage ldsHub.operating.v1: A.assumptions === { sizing:{ capRate:0.0625 } }", await assumptionsOf(keyA));

  // ---- guards: out of range / not a number / no-op re-entry ------------------
  const before = SJ(await assumptionsOf(keyA));
  await page.fill(inputSel("sizing.ltvMax"), "120"); await page.press(inputSel("sizing.ltvMax"), "Enter");
  await page.waitForTimeout(250);
  check((await warn("sizing.ltvMax")) === "out of range", "Max LTV 120 → 'out of range' chip on that field", await warn("sizing.ltvMax"));
  check((await badge("sizing.ltvMax")) === "inherited", "Max LTV badge still 'inherited'", await badge("sizing.ltvMax"));
  check((await value("sizing.ltvMax")) === "75", "Max LTV box restored to 75", await value("sizing.ltvMax"));
  check(SJ(await assumptionsOf(keyA)) === before, "store unchanged by the refused entry", await assumptionsOf(keyA));
  await page.fill(inputSel("sizing.capRate"), "1e3"); await page.press(inputSel("sizing.capRate"), "Tab");
  await page.waitForTimeout(250);
  check((await warn("sizing.capRate")) === "not a number", "cap rate '1e3' → 'not a number' chip (Tab commits too)", await warn("sizing.capRate"));
  check((await value("sizing.capRate")) === "6.25" && (await badge("sizing.capRate")) === "override", "cap rate box restored to 6.25, badge still 'override'");
  check(SJ(await assumptionsOf(keyA)) === before, "store unchanged by the non-numeric entry", await assumptionsOf(keyA));
  // "75.0" differs textually from the box's restored "75", so the change event really fires and commit runs.
  await page.fill(inputSel("sizing.ltvMax"), "75.0"); await page.press(inputSel("sizing.ltvMax"), "Enter");
  await page.waitForTimeout(250);
  check((await badge("sizing.ltvMax")) === "inherited", "re-entering the inherited value (75.0) → still 'inherited' (no override created)", await badge("sizing.ltvMax"));
  check((await value("sizing.ltvMax")) === "75", "…box normalised to 75 (commit ran)", await value("sizing.ltvMax"));
  check((await warn("sizing.ltvMax")) === null, "…and the earlier 'out of range' chip is gone", await warn("sizing.ltvMax"));
  check(SJ(await assumptionsOf(keyA)) === before, "store unchanged by the no-op re-entry", await assumptionsOf(keyA));
  // vacancy → override via Tab, then blank it → back to inherited and the store drops the leaf
  await page.fill(inputSel("vacancyPct"), "8"); await page.press(inputSel("vacancyPct"), "Tab");
  await settle("vacancyPct", "override");
  check((await badge("vacancyPct")) === "override", "A: vacancy badge 'override' after Tab", await badge("vacancyPct"));
  check(SJ(await assumptionsOf(keyA)) === SJ({ sizing: { capRate: 0.0625 }, vacancyPct: 0.08 }), "store now { sizing:{capRate:0.0625}, vacancyPct:0.08 }", await assumptionsOf(keyA));
  await page.fill(inputSel("vacancyPct"), ""); await page.press(inputSel("vacancyPct"), "Tab");
  await settle("vacancyPct", "inherited");
  check((await badge("vacancyPct")) === "inherited", "A: blanking vacancy → 'inherited'", await badge("vacancyPct"));
  check((await value("vacancyPct")) === "5", "A: vacancy box shows the global 5", await value("vacancyPct"));
  check(SJ(await assumptionsOf(keyA)) === SJ({ sizing: { capRate: 0.0625 } }), "store dropped the vacancy leaf: { sizing:{ capRate:0.0625 } }", await assumptionsOf(keyA));

  // ---- B is untouched --------------------------------------------------------
  const keyB = await pick(NAME_B);
  info("B = " + keyB);
  check(keyB !== keyA, "B is a different property from A");
  check((await badge("sizing.capRate")) === "inherited", "B: cap rate badge 'inherited' (overrides are per property)", await badge("sizing.capRate"));
  check((await value("sizing.capRate")) === "5.5", "B: cap rate shows 5.5", await value("sizing.capRate"));
  check((await assumptionsOf(keyB)) == null, "store: B carries no overrides", await assumptionsOf(keyB));

  // ---- back to A: persisted --------------------------------------------------
  await pick(NAME_A);
  check((await badge("sizing.capRate")) === "override", "A again: override persisted", await badge("sizing.capRate"));
  check((await value("sizing.capRate")) === "6.25", "A again: cap rate still 6.25", await value("sizing.capRate"));

  // ---- Reset → inherit -------------------------------------------------------
  await page.click("#opAssumpReset");
  await settle("sizing.capRate", "inherited");
  check((await badge("sizing.capRate")) === "inherited", "A: cap rate badge 'inherited' after Reset", await badge("sizing.capRate"));
  check((await value("sizing.capRate")) === "5.5", "A: cap rate back to the global 5.5 after Reset", await value("sizing.capRate"));
  const states = await page.$$eval("#opAssumpMount [data-op-badge]", (els) => els.map((e) => e.textContent.trim()));
  check(states.length === 9 && states.every((s) => s === "inherited"), "A: all nine badges 'inherited' after Reset", states);
  check((await assumptionsOf(keyA)) == null, "store: A.assumptions null after Reset", await assumptionsOf(keyA));
  await pick(NAME_B); await pick(NAME_A);
  check((await badge("sizing.capRate")) === "inherited", "A after a round trip: still 'inherited' (reset persisted)", await badge("sizing.capRate"));
  check(errors.length === 0, "no page errors during the run", errors);

  console.log(fails.n ? fails.n + " FAILED" : "ALL PASSED");
  await app.close();
  try { fs.rmSync(udata, { recursive: true, force: true }); } catch (e) {}
  process.exit(fails.n ? 1 : 0);
})().catch((e) => { console.error("E2E ERROR:", (e && e.stack) || e); process.exit(1); });
