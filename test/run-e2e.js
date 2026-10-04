#!/usr/bin/env node
/* Runs the end-to-end tests (test/e2e/*.e2e.js) one after another under a virtual display and reports
   which failed. Claude is switched off for every run (LDS_CLAUDE_BIN=/nonexistent) unless a test brings
   its own fake, so no test ever calls a real model. Usage: npm run test:e2e [-- name-filter]
   Needs Playwright (GN = folder holding the global node_modules) and xvfb-run on Linux. */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const dir = path.join(__dirname, 'e2e'), filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter((f) => /\.e2e\.js$/.test(f) && !/^zz-/.test(f) && f.indexOf(filter) >= 0).sort();
const env = Object.assign({}, process.env);
for (const k of Object.keys(env)) if (/^(CLAUDE|ANTHROPIC)/i.test(k) || k === 'CLAUDECODE') delete env[k];
if (!env.LDS_CLAUDE_BIN) env.LDS_CLAUDE_BIN = '/nonexistent';
const useXvfb = process.platform === 'linux' && !env.DISPLAY;
const failed = [];
for (const f of files) {
  const t0 = Date.now();
  const cmd = useXvfb ? 'xvfb-run' : process.execPath, args = useXvfb ? ['-a', process.execPath, path.join(dir, f)] : [path.join(dir, f)];
  const r = spawnSync(cmd, args, { encoding: 'utf8', env, cwd: path.join(__dirname, '..'), timeout: 10 * 60 * 1000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  const ok = r.status === 0;
  console.log((ok ? 'PASS ' : 'FAIL ') + f + ' (' + Math.round((Date.now() - t0) / 1000) + 's)  — ' + (out[out.length - 1] || '').trim().slice(0, 160));
  if (!ok) { failed.push(f); console.log(out.filter((l) => /FAIL|CRASH|Error/.test(l)).slice(0, 12).map((l) => '      ' + l.slice(0, 220)).join('\n')); }
}
console.log('\n' + (files.length - failed.length) + ' of ' + files.length + ' end-to-end tests passed' + (failed.length ? ' — FAILED: ' + failed.join(', ') : ''));
process.exit(failed.length ? 1 : 0);
