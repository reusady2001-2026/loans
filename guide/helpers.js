/* The Guide's capture helpers (guide/capture.js): what a chapter's steps use to drive the app and take a picture.
   A chapter that needs more keeps its own helpers in its own spec file. */
"use strict";
const path = require("path"), fs = require("fs");

module.exports = function (page, app, ctx) {
  const T = 10000;
  const h = {
    page, app, ctx, acceptDialogs: [],
    wait: (ms) => page.waitForTimeout(ms),
    js: (fn, arg) => page.evaluate(fn, arg),
    // no scroll-reveal animations, no splash, no toasts in a picture; the window bar stays where it is
    calm: async () => {
      await page.evaluate(() => {
        if (!document.getElementById("guideCalm")){
          const s = document.createElement("style"); s.id = "guideCalm";
          s.textContent = (window.__guideShowFab ? "" : "#aiAsstFab{visibility:hidden!important}") + "[data-reveal]{opacity:1!important;transform:none!important;transition:none!important}*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}#ldshSplash{display:none!important}html.guide-el #winbar{position:static!important}#toast,.toast{opacity:0!important}";
          document.head.appendChild(s);
        }
        const sp = document.getElementById("ldshSplash"); if (sp) sp.remove();
        document.querySelectorAll("[data-reveal]").forEach(e => e.classList.add("in"));
      }).catch(() => {});
    },
    loc: (sel, nth) => page.locator(sel).nth(nth || 0),
    click: async (sel, o) => { o = o || {}; const l = page.locator(sel).nth(o.nth || 0); await l.waitFor({ state: o.state || "visible", timeout: o.timeout || T }); if (o.js){ await l.evaluate(e => e.click()); } else { await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: o.timeout || T, force: !!o.force }); } await page.waitForTimeout(o.wait != null ? o.wait : 350); },
    jsClick: async (sel, nth) => { await page.locator(sel).nth(nth || 0).evaluate(e => e.click()); await page.waitForTimeout(350); },
    clickText: async (text, o) => { o = o || {}; const l = page.getByText(text, { exact: !!o.exact }).nth(o.nth || 0); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: T }); await page.waitForTimeout(o.wait != null ? o.wait : 350); },
    fill: async (sel, v, o) => { o = o || {}; const l = page.locator(sel).nth(o.nth || 0); await l.waitFor({ state: "visible", timeout: T }); await l.fill(String(v)); if (o.change !== false) await l.evaluate(e => { e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }); await page.waitForTimeout(o.wait != null ? o.wait : 250); },
    select: async (sel, v, o) => { o = o || {}; await page.locator(sel).nth(o.nth || 0).selectOption(v); await page.waitForTimeout(o.wait != null ? o.wait : 300); },
    hover: async (sel, nth) => { await page.locator(sel).nth(nth || 0).hover(); await page.waitForTimeout(300); },
    scroll: async (sel, nth, block) => { await page.locator(sel).nth(nth || 0).evaluate((e, b) => e.scrollIntoView({ block: b || "start" }), block || "start"); await page.waitForTimeout(250); },
    top: async () => { await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll("main, [data-scrollroot]").forEach(e => { e.scrollTop = 0; }); }); await page.waitForTimeout(200); },
    key: async (k) => { await page.keyboard.press(k); await page.waitForTimeout(250); },
    // the tab strip: Portfolio (home), and the "+" menu's Underwriting, Calendar and Data Health
    home: async () => { await page.evaluate(() => { const b = document.querySelector('[data-tabsel="home"]'); if (b) b.click(); }); await page.waitForTimeout(600); await h.calm(); },
    newTab: async (kind) => { await page.evaluate((k) => { const b = document.getElementById("tabNewBtn"); if (b) b.click(); const o = document.querySelector('[data-tabopen="' + k + '"]'); if (o) o.click(); }, kind); await page.waitForTimeout(900); await h.calm(); },
    // close whatever window is open over the app (the pro forma, the guide, a dialog) and any open menu
    closeModals: async () => {
      await page.evaluate(() => {
        document.querySelectorAll("details[open]").forEach(d => { d.open = false; });
        const pf = document.getElementById("pfModal"); if (pf && !pf.classList.contains("hidden")){ const c = pf.querySelector("[data-pfclose]"); if (c) c.click(); }
        const g = document.getElementById("guideModal"); if (g && !g.classList.contains("hidden")) window.LDS_Guide.close();
        const hm = document.getElementById("historyModal"); if (hm && !hm.classList.contains("hidden")){ const c = document.getElementById("historyClose"); if (c) c.click(); }
      });
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
    },
    loanId: (re) => page.evaluate((src) => { const r = new RegExp(src, "i"); const l = window.LDS_loans().find(x => r.test(x.propertyName || "") || r.test(x.loanName || "")); return l ? l._id : null; }, re.source || String(re)),
    openLoan: async (re) => { await h.home(); const id = await h.loanId(re); if (!id) throw new Error("no loan " + re); await page.evaluate((i) => { const tr = document.querySelector('tr[data-goto="' + i + '"]'); if (tr) tr.click(); }, id); await page.waitForTimeout(1200); await h.calm(); return id; },
    // a made-up T12 (a SheetJS grid) saved as an .xlsx and dropped on Underwriting's file box for a property
    uwProperty: async (key) => { await page.evaluate((k) => { const s = document.getElementById("opPropPick"); s.value = k; s.dispatchEvent(new Event("change", { bubbles: true })); }, key); await page.waitForTimeout(1200); await h.calm(); },
    xlsx: async (grid, name, sheet) => {
      const b64 = await page.evaluate((a) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.g), a.s || "T12"); return XLSX.write(wb, { type: "base64", bookType: "xlsx" }); }, { g: grid, s: sheet });
      const f = path.join(ctx.UDATA, name); fs.writeFileSync(f, Buffer.from(b64, "base64")); return f;
    },
    uwUpload: async (file) => { await page.setInputFiles("#uwFile", file); await page.waitForFunction(() => !!document.querySelector("input[data-uwline]"), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); await h.calm(); },

    // scroll an element to the top of the window, clear of the window's own title bar
    into: async (l) => { await l.evaluate(e => { e.scrollIntoView({ block: "start" }); const r = e.getBoundingClientRect(); if (r.top < 8) window.scrollBy(0, r.top - 8); }); await page.waitForTimeout(200); },
    // The picture. shot: "view" (the whole window), a selector, or {sel, nth, pad}. marks: [{sel, nth, label, text,
    // optional}] — each found on the screen and placed as a % of the picture; one that isn't there stops the run.
    capture: async (shot, marks, file, quality, pad) => {
      const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      let rect, grown = false;
      const sel = typeof shot === "string" ? shot : shot.sel, o = typeof shot === "string" ? {} : shot;
      await page.evaluate((v) => { document.documentElement.classList.toggle("guide-el", !v); }, sel === "view");
      if (sel === "view") rect = { x: 0, y: 0, width: vp.w, height: vp.h };
      else {
        const l = page.locator(sel).nth(o.nth || 0);
        await l.waitFor({ state: "visible", timeout: T });
        await h.into(l);
        let b = await l.boundingBox();
        if (b && b.height > vp.h - 8 && o.grow !== false){
          await ctx.setSize(ctx.W, Math.min(3400, Math.ceil(b.height) + 140)); grown = true; await page.waitForTimeout(500); await h.calm();
          await h.into(l); b = await l.boundingBox();
        }
        if (!b) throw new Error("the picture's area " + sel + " has no size");
        rect = { x: b.x, y: b.y, width: b.width, height: b.height, el: l };
      }
      // each marker as a % of the picture, measured against the picture's own box in the same instant (so a scroll
      // between measuring and taking the picture can't move it)
      const out = [], base = rect.el ? await rect.el.elementHandle() : null;
      for (const m of marks){
        const l = page.locator(m.sel).nth(m.nth || 0);
        let hd = null; try { if (await l.count()) hd = await l.elementHandle(); } catch (e) {}
        const r = hd ? await page.evaluate((a) => { const mr = a[0].getBoundingClientRect(); if (!(mr.width >= 1 && mr.height >= 1)) return null;
            const br = a[1] ? a[1].getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            return { x: mr.left - br.left, y: mr.top - br.top, w: mr.width, h: mr.height, W: br.width, H: br.height }; }, [hd, base]) : null;
        if (!r){ if (m.optional) continue; throw new Error("marker not on the screen: " + m.sel + (m.label ? " (" + m.label + ")" : "")); }
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        if (cx < 0 || cx > r.W || cy < 0 || cy > r.H){ if (m.optional) continue; throw new Error("marker outside the picture: " + m.sel + (m.label ? " (" + m.label + ")" : "")); }
        const r1 = (v) => Math.round(v * 10) / 10, x = Math.max(0, r.x), y = Math.max(0, r.y);
        out.push({ x: r1(x / r.W * 100), y: r1(y / r.H * 100), w: r1(Math.min(r.W - x, r.w) / r.W * 100), h: r1(Math.min(r.H - y, r.h) / r.H * 100), label: m.label || "", text: m.text });
      }
      if (rect.el) await rect.el.screenshot({ path: file, type: "jpeg", quality: quality || 72 });
      else await page.screenshot({ path: file, type: "jpeg", quality: quality || 72 });
      await page.evaluate(() => { document.documentElement.classList.remove("guide-el"); });
      if (grown){ await ctx.setSize(ctx.W, ctx.H); await page.waitForTimeout(400); }
      return { w: Math.round(rect.width), h: Math.round(rect.height), marks: out };
    }
  };
  return h;
};
