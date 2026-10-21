#!/usr/bin/env node
/* ============================================================================
   Takes the Guide's pictures by driving the real app (Electron + Playwright) through every step written in
   guide/spec/*.js, and writes guide/data/<chapter>.json and guide/guide.json (all chapters, in the order of
   guide/spec/index.js). The data is the app's built-in portfolio plus MADE-UP files (test/fixtures) — never anyone's
   real T12 or rent roll. Claude is the scripted stand-in (test/fixtures/fake-claude-push.js) with made-up answers.

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

function merge(){
  const out = { version: 1, builtAt: new Date().toISOString(), intro: SPEC.intro, note: SPEC.note, chapters: [] };
  SPEC.chapters.forEach(c => {
    const f = path.join(__dirname, "data", c.id + ".json");
    if (!fs.existsSync(f)) return;
    out.chapters.push(JSON.parse(fs.readFileSync(f, "utf8")));
  });
  fs.writeFileSync(path.join(__dirname, "guide.json"), JSON.stringify(out, null, 1));
  let steps = 0; out.chapters.forEach(c => c.topics.forEach(t => { steps += t.steps.length; }));
  console.log("guide.json: " + out.chapters.length + " chapters, " + out.chapters.reduce((a, c) => a + c.topics.length, 0) + " topics, " + steps + " steps");
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
  const outCh = { id: spec.id, title: spec.title, intro: spec.intro || "", cover: null, topics: [] };
  for (const tp of spec.topics){
    const outT = { id: tp.id, title: tp.title, intro: tp.intro || "", steps: [] };
    if (tp.before) await tp.before(h);
    let n = 0;
    for (const st of tp.steps){
      n++;
      const where = spec.id + " › " + tp.id + " › step " + n + " (" + st.title + ")";
      try {
        if (st.go) await st.go(h);
        await h.calm();
        await page.waitForTimeout(st.wait != null ? st.wait : 250);
        const file = tp.id + "-" + String(n).padStart(2, "0") + ".jpg";
        const shot = await h.capture(st.shot || "view", st.marks || [], path.join(imgDir, file), QUALITY, st.pad);
        outT.steps.push({ title: st.title, text: st.text || "", img: "img/" + spec.id + "/" + file, w: shot.w, h: shot.h, marks: shot.marks });
        if (!outCh.cover && st.cover) outCh.cover = "img/" + spec.id + "/" + file;
        process.stdout.write(".");
        if (st.after) await st.after(h);
      } catch (e) {
        console.error("\nGUIDE STEP FAILED — " + where + ": " + String(e && e.message || e).split("\n")[0]);
        try { await page.screenshot({ path: path.join(os.tmpdir(), "guide-fail-" + spec.id + ".png") }); console.error("  (the screen at that moment: " + path.join(os.tmpdir(), "guide-fail-" + spec.id + ".png") + ")"); } catch (x) {}
        await app.close().catch(() => {}); throw e;
      }
    }
    outCh.topics.push(outT);
  }
  if (!outCh.cover && outCh.topics[0] && outCh.topics[0].steps[0]) outCh.cover = outCh.topics[0].steps[0].img;
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "data", spec.id + ".json"), JSON.stringify(outCh, null, 1));
  let steps = 0; outCh.topics.forEach(t => { steps += t.steps.length; });
  console.log("\n" + spec.id + ": " + outCh.topics.length + " topics, " + steps + " steps" + (errors.length ? " — page errors: " + errors.join(" | ") : ""));
  await app.close().catch(() => {});
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  if (errors.length && !process.env.GUIDE_ALLOW_ERRORS) throw new Error("page errors in " + spec.id + ": " + errors.join(" | "));
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes("--merge")){ merge(); return; }
  if (args.includes("--list")){ SPEC.chapters.forEach(c => console.log(c.id + " — " + c.title + " (" + c.topics.length + " topics)")); return; }
  const ids = args.filter(a => !a.startsWith("--"));
  const todo = ids.length ? ids.map(id => { const c = chapterSpec(id); if (!c) throw new Error("no chapter " + id); return c; }) : SPEC.chapters;
  for (const c of todo){ console.log("— " + c.id); await runChapter(c); }
  merge();
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
