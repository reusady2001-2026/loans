/* ============================================================================
   3.0.0 — the first upload from a backup file ("Data → Back up to a file…").

   A full backup is one JSON file: the loans, the window's settings (with the
   saved market rates and custom categories), and every file of the property
   folders and chats, each as base64. It can be far bigger than one string may
   be, so it is read as a stream: the part before "files" is parsed whole, then
   each file is written out one by one into a folder laid out like the app's own
   data (loans.json, documents/<h>/…, chats/<h>/…). The first upload then reads
   that folder exactly as it reads this computer's data.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

// a backup's file path must stay inside documents/ or chats/ (the same rule as restoring a backup)
function safePath(p){ return typeof p === "string" && /^(documents|chats)\/[A-Za-z0-9._\- \/]+$/.test(p) && p.split("/").indexOf("..") < 0; }

const Q = 0x22, BS = 0x5c, LB = 0x7b, RB = 0x7d, LS = 0x5b, RS = 0x5d, COLON = 0x3a, COMMA = 0x2c;
const isWs = c => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;

// end of the string that starts at i (the byte after its opening quote): the index of its closing quote, or -1
function stringEnd(buf, i){
  for(;;){
    const q = buf.indexOf(Q, i); if(q < 0) return -1;
    let b = 0; for(let k = q - 1; k >= 0 && buf[k] === BS; k--) b++;
    if(b % 2 === 0) return q;
    i = q + 1;
  }
}

async function stageBackup(file, destDir, onProgress){
  const total = fs.statSync(file).size;
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  let head = null, files = 0, bytes = 0, read = 0;
  let carry = Buffer.alloc(0);       // bytes not handled yet
  let phase = "head";                // head -> files -> done
  // head scanning state
  let depth = 0, keyStart = -1, lastKey = "", afterKey = false, cutAt = -1;

  function writeFileEntry(raw){
    let e; try{ e = JSON.parse(raw.toString("utf8")); }catch(x){ throw new Error("The backup file is damaged (a file entry can't be read)."); }
    if(!safePath(e && e.path)) throw new Error("This backup has a file outside the app's folders (" + String(e && e.path).slice(0, 80) + ").");
    if(typeof e.base64 !== "string") throw new Error("This is an automatic snapshot, not a backup file — make one with Data → Back up to a file.");
    const data = Buffer.from(e.base64, "base64");
    if(e.size != null && data.length !== e.size) throw new Error("The backup file is damaged (" + e.path + " has the wrong size).");
    if(e.sha1 && crypto.createHash("sha1").update(data).digest("hex") !== e.sha1) throw new Error("The backup file is damaged (" + e.path + " doesn't match its fingerprint).");
    const dst = path.join(destDir, e.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, data);
    files++; bytes += data.length;
  }

  // the head: find the top-level key "files" and its "[" (strings are skipped whole)
  function scanHead(buf){
    let i = 0;
    while(i < buf.length){
      const c = buf[i];
      if(c === Q){
        const end = stringEnd(buf, i + 1); if(end < 0) return false;   // need more bytes
        if(depth === 1 && !afterKey){ keyStart = i; lastKey = buf.slice(i + 1, end).toString("utf8"); afterKey = true; }
        else afterKey = false;
        i = end + 1; continue;
      }
      if(c === COLON){ i++; continue; }
      if(isWs(c)){ i++; continue; }
      if(c === LS && depth === 1 && afterKey && lastKey === "files"){ cutAt = keyStart; carry = buf.slice(i + 1); return true; }
      if(c === LB || c === LS) depth++;
      else if(c === RB || c === RS) depth--;
      if(c === COMMA || c === LB || c === LS || c === RB || c === RS) afterKey = false;
      i++;
    }
    return false;
  }
  // the files: flat objects one after another, until "]"
  function scanFiles(buf){
    let i = 0;
    while(i < buf.length){
      const c = buf[i];
      if(isWs(c) || c === COMMA){ i++; continue; }
      if(c === RS){ phase = "done"; return buf.slice(0, 0); }
      if(c !== LB) throw new Error("The backup file is damaged (unexpected content among the files).");
      // one entry: up to its closing brace, skipping strings whole
      let j = i + 1, inner = 1;
      while(j < buf.length && inner > 0){
        const d = buf[j];
        if(d === Q){ const end = stringEnd(buf, j + 1); if(end < 0){ j = buf.length; break; } j = end + 1; continue; }
        if(d === LB) inner++; else if(d === RB) inner--;
        j++;
      }
      if(inner > 0) return buf.slice(i);   // the entry continues in the next chunk
      writeFileEntry(buf.slice(i, j));
      i = j;
    }
    return buf.slice(i);
  }

  const headBytes = [];
  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    rs.on("data", chunk => {
      try{
        read += chunk.length;
        if(phase === "head"){
          headBytes.push(chunk);
          const all = Buffer.concat(headBytes);
          // rescan from the start of what's held (the head is small: loans and settings)
          depth = 0; keyStart = -1; lastKey = ""; afterKey = false;
          if(scanHead(all)){
            let h = all.slice(0, cutAt).toString("utf8").replace(/,\s*$/, "") + "}";
            try{ head = JSON.parse(h); }catch(x){ throw new Error("The backup file is damaged (its loans or settings can't be read)."); }
            phase = "files";
            carry = scanFiles(carry);
          }
        } else if(phase === "files"){
          carry = scanFiles(carry.length ? Buffer.concat([carry, chunk]) : chunk);
        }
        if(onProgress) try{ onProgress(read, total); }catch(e){}
      }catch(e){ rs.destroy(); reject(e); }
    });
    rs.on("end", resolve);
    rs.on("error", reject);
  });

  if(phase === "head"){
    // an older backup (before 2.9.7): the whole file is the loans (and settings), no files
    let obj; try{ obj = JSON.parse(Buffer.concat(headBytes).toString("utf8")); }catch(x){ throw new Error("That file isn't a backup of this app."); }
    head = Array.isArray(obj) ? { loans: obj } : obj;
  } else if(phase !== "done") throw new Error("The backup file is cut off — make the backup again.");
  if(!head || !Array.isArray(head.loans)) throw new Error("That file isn't a backup of this app (no loans in it).");
  fs.writeFileSync(path.join(destDir, "loans.json"), JSON.stringify(head.loans));
  return { loans: head.loans.length, settings: head.settings && typeof head.settings === "object" ? head.settings : {},
           exportedAt: head.exportedAt || null, files, bytes };
}

module.exports = { stageBackup, safePath };
