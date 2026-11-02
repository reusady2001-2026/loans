/* 3.0.0 — cloud-backup.js: the first upload from a backup file. A full backup (Data → Back up to a file…) is read as a
   stream and unpacked into a folder laid out like the app's data; its settings come back as they were.
   run:  node test/cloud-backup.test.js */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const { stageBackup } = require(path.join(__dirname, "..", "cloud-backup.js"));

let fails = 0, count = 0;
function ok(cond, msg){ count++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if(!cond) fails++; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lds-backup-"));
const sha1 = b => crypto.createHash("sha1").update(b).digest("hex");

// the same layout main.js writes (writeFullBackupFile): the envelope, then "files":[…] one by one
function writeBackup(dest, env, files){
  const head = JSON.stringify(Object.assign({}, env, { format: 2, kind: "full", fileCount: files.length, propertyFolders: 1, chatCount: 1 }));
  const fd = fs.openSync(dest, "w");
  fs.writeSync(fd, head.slice(0, -1) + ',"files":[');
  files.forEach((f, i) => fs.writeSync(fd, (i ? "," : "") + JSON.stringify({ path: f.path, size: f.data.length, sha1: sha1(f.data), base64: f.data.toString("base64") })));
  fs.writeSync(fd, "]}"); fs.closeSync(fd);
}

(async () => {
  const big = crypto.randomBytes(9 * 1024 * 1024 + 123);   // bigger than one read (4 MB): split across reads
  const loans = [{ _id: "ln_1", propertyName: "Café Tower — “quoted” \"files\":[ name", files: [{ a: 1 }] }, { _id: "ln_2", propertyName: "Beta" }];
  const settings = { "lds.customCategories": JSON.stringify({ "Utilities": "expense" }), "ldsHub.rateHist.v2": JSON.stringify({ sofr30: { "2026-10-05": 4.31 } }) };
  const files = [
    { path: "documents/abc0123456789def/index.json", data: Buffer.from(JSON.stringify({ propKey: "name:cafe", files: [{ id: "d1", stored: "d1.pdf", name: "Big.pdf" }] })) },
    { path: "documents/abc0123456789def/d1.pdf", data: big },
    { path: "documents/abc0123456789def/d1.txt", data: Buffer.from("the text, with ünïcödé") },
    { path: "chats/0000111122223333/c1.json", data: Buffer.from(JSON.stringify({ id: "c1", messages: [] })) }];
  const f1 = path.join(tmp, "full.json");
  writeBackup(f1, { app: "LDS Hub", schema: 7, exportedAt: "2026-10-14T10:02:00.000Z", loanCount: 2, loans, settings }, files);

  console.log("\na full backup");
  const out = path.join(tmp, "stage");
  let seen = 0;
  const r = await stageBackup(f1, out, (done, total) => { seen = done / total; });
  ok(r.loans === 2 && r.files === 4 && r.bytes === files.reduce((n, f) => n + f.data.length, 0), "the loans and every file (" + JSON.stringify({ loans: r.loans, files: r.files }) + ")");
  ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(out, "loans.json"), "utf8"))) === JSON.stringify(loans), "the loans as they were (names with quotes and \"files\":[ inside them too)");
  ok(Buffer.compare(fs.readFileSync(path.join(out, "documents/abc0123456789def/d1.pdf")), big) === 0, "a 9 MB file, byte for byte");
  ok(fs.readFileSync(path.join(out, "documents/abc0123456789def/d1.txt"), "utf8") === "the text, with ünïcödé", "text with accents");
  ok(fs.existsSync(path.join(out, "chats/0000111122223333/c1.json")), "the chats");
  ok(r.settings["lds.customCategories"] === settings["lds.customCategories"] && r.settings["ldsHub.rateHist.v2"] === settings["ldsHub.rateHist.v2"], "the settings: custom categories and saved rates");
  ok(r.exportedAt === "2026-10-14T10:02:00.000Z" && seen === 1, "when it was made; progress reaches the end");

  console.log("\nwhat is refused");
  const f2 = path.join(tmp, "damaged.json");
  const bad = files.map(f => ({ path: f.path, data: f.data }));
  writeBackup(f2, { app: "LDS Hub", loans, settings }, bad);
  // flip one byte of the big file's base64 (stays valid base64, so only the fingerprint shows it)
  const raw = fs.readFileSync(f2); const at = raw.indexOf(Buffer.from(big.slice(0, 30).toString("base64").slice(0, 16)));
  raw[at + 5] = raw[at + 5] === 0x41 ? 0x42 : 0x41; fs.writeFileSync(f2, raw);
  let err = null; try{ await stageBackup(f2, path.join(tmp, "s2")); }catch(e){ err = e; }
  ok(err && /doesn't match its fingerprint/.test(err.message), "a damaged file is caught (" + (err && err.message) + ")");
  const f3 = path.join(tmp, "outside.json");
  writeBackup(f3, { app: "LDS Hub", loans, settings }, [{ path: "documents/../../evil.txt", data: Buffer.from("x") }]);
  err = null; try{ await stageBackup(f3, path.join(tmp, "s3")); }catch(e){ err = e; }
  ok(err && /outside the app's folders/.test(err.message) && !fs.existsSync(path.join(tmp, "evil.txt")), "a path outside the app's folders is refused");
  const f4 = path.join(tmp, "snapshot.json");
  fs.writeFileSync(f4, JSON.stringify({ app: "LDS Hub", loans, settings, format: 2, kind: "snapshot", files: [{ path: "documents/abc0123456789def/d1.pdf", size: 3, sha1: "x" }] }));
  err = null; try{ await stageBackup(f4, path.join(tmp, "s4")); }catch(e){ err = e; }
  ok(err && /automatic snapshot/.test(err.message), "an automatic snapshot (no file contents) is refused with what to do");
  const f5 = path.join(tmp, "cut.json");
  fs.writeFileSync(f5, fs.readFileSync(f1).slice(0, 6 * 1024 * 1024));
  err = null; try{ await stageBackup(f5, path.join(tmp, "s5")); }catch(e){ err = e; }
  ok(err && /cut off/.test(err.message), "a backup cut off in the middle is refused");
  const f6 = path.join(tmp, "notjson.json"); fs.writeFileSync(f6, "hello");
  err = null; try{ await stageBackup(f6, path.join(tmp, "s6")); }catch(e){ err = e; }
  ok(err && /isn't a backup/.test(err.message), "a file that isn't a backup is refused");

  console.log("\nan older backup (the loans only)");
  const f7 = path.join(tmp, "old.json"); fs.writeFileSync(f7, JSON.stringify(loans));
  const r7 = await stageBackup(f7, path.join(tmp, "s7"));
  ok(r7.loans === 2 && r7.files === 0 && JSON.parse(fs.readFileSync(path.join(tmp, "s7", "loans.json"), "utf8")).length === 2, "its loans are used, with no files");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("\n" + (count - fails) + " of " + count + " checks passed" + (fails ? " — " + fails + " FAILED" : ""));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
