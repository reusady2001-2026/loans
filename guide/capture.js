#!/usr/bin/env node
/* ============================================================================
   Takes the Guide's pictures by driving the real app (Electron + Playwright) through every page written in
   guide/spec/*.js, and writes guide/data/<chapter>.json and guide/guide.json (every page, grouped as the guide's
   left menu lists them). The data is the app's built-in portfolio plus MADE-UP files (test/fixtures) — never anyone's
   real T12 or rent roll. Claude is the scripted stand-in (test/fixtures/fake-claude-push.js) with made-up answers.

   (2026-10-26, the operator) The guide is laid out like the Claude Code docs: pages in groups, each a how-to (one task:
   what it's for, what you need first, numbered steps, a picture only where the screen changes, numbered markers only
   where a step needs them, notes and tips, next steps) or a reference page (what every control on a screen does).

   A step whose screen or marker can't be found stops the run with its name: a guide that no longer matches the app
   fails here, instead of showing an old picture.

   Run (Linux):   xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js            (every chapter)
                  xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js underwriting  (one or more chapters)
                  node guide/capture.js --merge                                              (only rebuild guide.json)
   ========================================================================== */
"use strict";
const path = require("path"), os = require("os"), fs = require("fs");
const APP = path.resolve(__dirname, "..");
const GN = process.env.GN || "/opt/node22/lib/node_modules";
const SPEC = require("./spec/index.js");
const W = 1440, H = 900, QUALITY = 72;

function chapterSpec(id){ return SPEC.chapters.find(c => c.id === id) || null; }
const slug = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
const CALLOUTS = ["note", "tip", "warning"];
// the words of a page, a section or a step: its callouts kept as {kind, text}
function callouts(x){ const out = []; (x.callouts || []).forEach(c => out.push({ kind: c.kind, text: c.text })); CALLOUTS.forEach(k => { if (x[k]) out.push({ kind: k, text: x[k] }); }); return out; }

function merge(){
  const pages = SPEC.pages.map(p => Object.assign({ chapter: null }, p));   // the pages written by hand (the overview) lead their group
  SPEC.chapters.forEach(c => {
    const f = path.join(__dirname, "data", c.id + ".json");
    if (!fs.existsSync(f)) return;
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    (d.pages || []).forEach(p => pages.push(Object.assign({ chapter: c.id }, p)));
  });
  // the left menu: the groups in the spec's order, each page in the order its chapter lists it
  const groups = SPEC.groups.map(g => ({ title: g, pages: pages.filter(p => p.group === g).map(p => p.id) })).filter(g => g.pages.length);
  const order = []; groups.forEach(g => g.pages.forEach(id => order.push(id)));
  const out = { version: 2, builtAt: new Date().toISOString(), title: SPEC.title, note: SPEC.note, groups: groups, pages: order.map(id => pages.find(p => p.id === id)) };
  fs.writeFileSync(path.join(__dirname, "guide.json"), JSON.stringify(out, null, 1));
  let pics = 0; out.pages.forEach(p => (p.sections || []).forEach(s => (s.steps || []).concat(s.views || []).forEach(x => { if (x.img) pics++; })));
  console.log("guide.json: " + groups.length + " groups, " + out.pages.length + " pages, " + pics + " pictures");
}

async function runChapter(spec){
  const { _electron: electron } = require(GN + "/playwright");
  const UDATA = fs.mkdtempSync(path.join(os.tmpdir(), "lds-guide-" + spec.id + "-"));
  fs.mkdirSync(path.join(UDATA, "claude"), { recursive: true }); fs.writeFileSync(path.join(UDATA, "claude", "signed-in.marker"), "ok");
  const env = Object.assign({}, process.env, {
    LDS_CLAUDE_BIN: path.join(APP, "test", "fixtures", "fake-claude-push.js"), CLAUDE_CONFIG_DIR: path.join(UDATA, "claude"),
    LDS_FAKE_STORIES_FILE: path.join(__dirname, "fixtures", "stories.json"), LDS_FAKE_PUSH_FILE: path.join(__dirname, "fixtures", "push.json"),
    LDS_RATES_OFFLINE: "1", LDS_CLOUD_OFF: "1"
  }, spec.env ? spec.env(UDATA) : {});
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  const app = await electron.launch({ executablePath: require(path.join(APP, "node_modules", "electron")), args: [APP, "--user-data-dir=" + UDATA, "--no-sandbox"].concat(spec.args || []), cwd: APP, env });
  const page = await app.firstWindow();
  const errors = []; page.on("pageerror", e => errors.push(String(e).slice(0, 300)));
  page.on("dialog", d => { const m = d.message(); const ok = (h.acceptDialogs || []).some(re => re.test(m)); if (ok) d.accept(); else d.dismiss(); });
  await page.route(/^https?:\/\//, r => r.abort());
  const win = await app.browserWindow(page);
  const setSize = (w, hh) => win.evaluate((bw, a) => { bw.setSize(a.w, a.h); }, { w: w, h: hh });
  await setSize(W, H);
  const h = require("./helpers.js")(page, app, { UDATA, APP, setSize, W, H });
  if (spec.waitHome !== false) { await page.waitForSelector("tr[data-goto]", { timeout: 30000, state: "attached" }).catch(() => {}); }
  await h.calm();
  await page.waitForTimeout(800);
  if (spec.setup) await spec.setup(h);

  const imgDir = path.join(__dirname, "img", spec.id);
  fs.rmSync(imgDir, { recursive: true, force: true }); fs.mkdirSync(imgDir, { recursive: true });
  const outCh = { id: spec.id, pages: [] };
  // one step (numbered, in a how-to) or one view (a picture of a screen, in a reference page): run its way to the
  // screen, then take its picture when it has one
  const shoot = async (x, where, file) => {
    try {
      if (x.go) await x.go(h);
      let out = { text: x.text || "" };
      if (x.title) out = Object.assign({ title: x.title }, out);
      if (x.shot){
        await h.calm();
        await page.waitForTimeout(x.wait != null ? x.wait : 250);
        const shot = await h.capture(x.shot, x.marks || [], path.join(imgDir, file), QUALITY, x.pad);
        Object.assign(out, { img: "img/" + spec.id + "/" + file, w: shot.w, h: shot.h, marks: shot.marks });
      } else if (x.marks && x.marks.length) throw new Error("markers without a picture");
      const co = callouts(x); if (co.length) out.callouts = co;
      if (x.after) await x.after(h);
      process.stdout.write(x.shot ? "." : "-");
      return out;
    } catch (e) {
      console.error("\nGUIDE STEP FAILED — " + where + ": " + String(e && e.message || e).split("\n")[0]);
      try { await page.screenshot({ path: path.join(os.tmpdir(), "guide-fail-" + spec.id + ".png") }); console.error("  (the screen at that moment: " + path.join(os.tmpdir(), "guide-fail-" + spec.id + ".png") + ")"); } catch (z) {}
      await app.close().catch(() => {}); throw e;
    }
  };
  for (const pg of spec.pages){
    const outP = { id: pg.id, kind: pg.kind || "howto", group: pg.group, title: pg.title, description: pg.description || "", intro: pg.intro || "" };
    const co = callouts(pg); if (co.length) outP.callouts = co;
    if (pg.before && pg.before.length) outP.before = pg.before.slice();
    outP.sections = [];
    if (pg.prep) await pg.prep(h);
    let pic = 0;
    const ids = {};
    for (const sc of (pg.sections || [])){
      let sid = sc.id || slug(sc.title); while (ids[sid]) sid += "-2"; ids[sid] = 1;
      const outS = { id: sid, title: sc.title };
      if (sc.text) outS.text = sc.text;
      if (sc.cards) outS.cards = sc.cards;   // [{title, text, page, anchor}]
      if (sc.table) outS.table = sc.table;   // {head: [..], rows: [[text, page], ..]}
      if (sc.prep) await sc.prep(h);
      for (const kind of ["steps", "views"]){
        if (!sc[kind]) continue;
        outS[kind] = [];
        let n = 0;
        for (const x of sc[kind]){
          n++;
          const where = spec.id + " › " + pg.id + " › " + sid + " › " + kind.slice(0, -1) + " " + n;
          outS[kind].push(await shoot(x, where, pg.id + "-" + String(x.shot ? ++pic : pic).padStart(2, "0") + ".jpg"));
        }
      }
      const sco = callouts(sc); if (sco.length) outS.callouts = sco;
      outP.sections.push(outS);
    }
    if (pg.next && pg.next.length) outP.next = pg.next.map(n => ({ page: n.page, anchor: n.anchor || "", text: n.text || "" }));
    outCh.pages.push(outP);
  }
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "data", spec.id + ".json"), JSON.stringify(outCh, null, 1));
  let pics = 0; outCh.pages.forEach(p => p.sections.forEach(s => (s.steps || []).concat(s.views || []).forEach(x => { if (x.img) pics++; })));
  console.log("\n" + spec.id + ": " + outCh.pages.length + " pages, " + pics + " pictures" + (errors.length ? " — page errors: " + errors.join(" | ") : ""));
  await app.close().catch(() => {});
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  if (errors.length && !process.env.GUIDE_ALLOW_ERRORS) throw new Error("page errors in " + spec.id + ": " + errors.join(" | "));
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes("--merge")){ merge(); return; }
  if (args.includes("--list")){ SPEC.chapters.forEach(c => console.log(c.id + " — " + c.pages.map(p => p.id).join(", "))); return; }
  const ids = args.filter(a => !a.startsWith("--"));
  const todo = ids.length ? ids.map(id => { const c = chapterSpec(id); if (!c) throw new Error("no chapter " + id); return c; }) : SPEC.chapters;
  for (const c of todo){ console.log("— " + c.id); await runChapter(c); }
  if (!args.includes("--no-merge")) merge();
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
