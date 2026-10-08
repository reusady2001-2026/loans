#!/usr/bin/env node
/* Runs every unit test (test/*.test.js) one after another and exits non-zero if any fails.
   `npm test` calls this; the Windows build runs it first and stops if anything fails. */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /\.test\.js$/.test(f)).sort();
let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', cwd: path.join(dir, '..') });
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  const ok = r.status === 0;
  console.log((ok ? 'PASS ' : 'FAIL ') + f + '  — ' + (out[out.length - 1] || '').trim());
  if (!ok) { failed.push(f); console.log(out.filter((l) => /FAIL|Error|✗/.test(l)).slice(0, 20).map((l) => '      ' + l).join('\n')); }
}
console.log('\n' + (files.length - failed.length) + ' of ' + files.length + ' unit test files passed' + (failed.length ? ' — FAILED: ' + failed.join(', ') : ''));
process.exit(failed.length ? 1 : 0);
