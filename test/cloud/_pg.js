// 3.0.0 — a throwaway local PostgreSQL for the shared-database tests.
// Starts a fresh cluster in a temp folder, loads the Supabase stand-in (auth schema + roles) and the app's SQL,
// and stops it again. If PostgreSQL isn't installed, start() returns null and the caller skips.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");

function findBin(){
  if(process.env.LDS_PG_BIN && fs.existsSync(path.join(process.env.LDS_PG_BIN, "pg_ctl"))) return process.env.LDS_PG_BIN;
  const base = "/usr/lib/postgresql";
  try{
    const vers = fs.readdirSync(base).filter(v => /^\d+$/.test(v)).sort((a, b) => b - a);
    for(const v of vers){ const b = path.join(base, v, "bin"); if(fs.existsSync(path.join(b, "pg_ctl"))) return b; }
  }catch(e){}
  try{ const p = cp.execSync("command -v pg_ctl", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); if(p) return path.dirname(p); }catch(e){}
  return null;
}

const isRoot = () => typeof process.getuid === "function" && process.getuid() === 0;
function run(bin, args){
  // PostgreSQL refuses to run as root; the tests run as root in the build container, so hand it to "postgres"
  const r = isRoot() ? cp.spawnSync("runuser", ["-u", "postgres", "--", bin].concat(args), { encoding: "utf8" })
                     : cp.spawnSync(bin, args, { encoding: "utf8" });
  if(r.status !== 0) throw new Error(path.basename(bin) + " failed: " + (r.stderr || r.stdout || r.error));
  return r.stdout;
}

const ROOT = path.join(__dirname, "..", "..");
const SQL_FILES = [path.join(__dirname, "supabase-standin.sql"), path.join(ROOT, "supabase", "setup.sql")];

async function start(opts){
  opts = opts || {};
  const bin = findBin(); if(!bin) return null;
  const { Client } = require("pg");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lds-pg-"));
  if(isRoot()) cp.spawnSync("chown", ["postgres", dir]);
  const port = 20000 + Math.floor(Math.random() * 20000);
  run(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"]);
  run(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", "-p " + port + " -k " + dir + " -c listen_addresses=''", "-l", path.join(dir, "log"), "-w", "start"]);
  const conn = { host: dir, port, user: "postgres", database: "postgres" };
  const admin = new Client(conn);
  async function stop(){
    try{ await admin.end(); }catch(e){}
    try{ run(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"]); }catch(e){}
    try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){}
  }
  try{
    await admin.connect();
    for(const f of (opts.sqlFiles || SQL_FILES)) await admin.query(fs.readFileSync(f, "utf8"));
  }catch(e){ await stop(); throw e; }
  return { conn, admin, stop, Client };
}

module.exports = { start, findBin };
