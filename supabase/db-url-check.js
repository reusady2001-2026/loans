#!/usr/bin/env node
/* 3.0.0 — explains a failed login of "Update the shared database" (.github/workflows/supabase-setup.yml) without
   ever showing the password. It reads the secret SUPABASE_DB_URL the way psql reads a connection string and prints
   its shape: the username, address, port and database, and for the password only its length and what kinds of
   characters it has. It names anything plainly wrong (square brackets left, the placeholder, another project, the
   Direct connection). With --login it then tries two logins: with the parts given separately, which tells a wrong
   password from a string psql reads differently; and straight to the database, past Supabase's pooler, which tells
   a wrong password from a pooler still holding an older one (that one needs IPv6, which GitHub's machines may lack).
   Run: SUPABASE_DB_URL=... node supabase/db-url-check.js [--login] */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

function pct(s) { try { return decodeURIComponent(s); } catch (e) { return null; } }

// Splits a postgresql:// string as libpq does: the user info runs to the first '@' before any '/', the user to its
// first ':'; then host[:port], then /database, then ?options. Returns null when it isn't a postgresql:// string.
function parse(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = /^postgres(?:ql)?:\/\//.exec(s);
  if (!m) return null;
  let rest = s.slice(m[0].length), user = null, password = null, badEscape = false;
  let i = 0;
  while (i < rest.length && rest[i] !== '@' && rest[i] !== '/') i++;
  if (rest[i] === '@') {
    const info = rest.slice(0, i), c = info.indexOf(':');
    const u = c < 0 ? info : info.slice(0, c), p = c < 0 ? null : info.slice(c + 1);
    user = pct(u); if (user == null) { badEscape = true; user = u; }
    if (p != null) { password = pct(p); if (password == null) { badEscape = true; password = p; } }
    rest = rest.slice(i + 1);
  }
  let host = '', port = '';
  if (rest[0] === '[') { const e = rest.indexOf(']'); host = rest.slice(1, e < 0 ? rest.length : e); rest = e < 0 ? '' : rest.slice(e + 1); }
  else { const e = rest.search(/[:/?,]/); host = e < 0 ? rest : rest.slice(0, e); rest = e < 0 ? '' : rest.slice(e); }
  const severalHosts = rest[0] === ',';
  if (rest[0] === ':') { const e = rest.search(/[/?,]/); port = e < 0 ? rest.slice(1) : rest.slice(1, e); rest = e < 0 ? '' : rest.slice(e); }
  let database = '';
  if (rest[0] === '/') { const e = rest.indexOf('?'); database = pct(e < 0 ? rest.slice(1) : rest.slice(1, e)) || ''; rest = e < 0 ? '' : rest.slice(e); }
  const options = rest[0] === '?' ? rest.slice(1).split('&').filter(Boolean).map((kv) => kv.split('=')[0]) : [];
  return { user, password, host: pct(host) || host, port, database, options, severalHosts, badEscape };
}

function expectedRef() {
  try { return (/^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloud-config.json'), 'utf8')).url) || [])[1] || null; }
  catch (e) { return null; }
}

// What the string looks like, and what is plainly wrong with it. Never puts the password (or any part of it) in
// the text: only its length and the kinds of characters in it.
function describe(raw, ref) {
  const lines = [], problems = [], s = String(raw == null ? '' : raw);
  if (!s.trim()) return { lines, problems: ['The secret is empty.'], parts: null };
  if (s !== s.trim()) problems.push('There is a blank space or line break at the start or end of the secret. Paste it again without it.');
  const p = parse(s);
  if (!p) { problems.push("It doesn't start with postgresql:// — copy the whole line from Supabase (Connect → Connection String → Session pooler)."); return { lines, problems, parts: null }; }
  lines.push(['Starts with postgresql://', 'yes']);
  lines.push(['Username', p.user == null ? '(none)' : p.user]);
  if (p.user == null) problems.push('There is no username (nothing before an @). Copy the whole line from Supabase again.');
  else {
    const mu = /^postgres\.([a-z0-9]+)$/.exec(p.user);
    if (mu && ref) {
      lines.push(["Is this app's project (" + ref + ')', mu[1] === ref ? 'yes' : 'NO']);
      if (mu[1] !== ref) problems.push('The username names another Supabase project (' + mu[1] + "), not this app's (" + ref + '). Copy the line from the project the app uses.');
    }
    if (p.user === 'postgres' && /\.pooler\.supabase\.com$/.test(p.host)) problems.push('The username is "postgres" without the project id. The pooler needs postgres.' + (ref || '<project id>') + '.');
  }
  lines.push(['Address', p.host || '(none)']);
  lines.push(['Port', p.port || '(none — 5432)']);
  lines.push(['Database', p.database || '(none)']);
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(p.host)) problems.push("This is the Direct connection, which GitHub's machines can't reach (it needs IPv6). Use Connect → Connection String → Method: Session pooler.");
  else if (!/\.pooler\.supabase\.com$/.test(p.host)) problems.push('The address is not a Supabase pooler address (…pooler.supabase.com).');
  if (p.port === '6543') lines.push(['Note', 'port 6543 is the Transaction pooler; the Session pooler (5432) is the one to use']);
  if (p.severalHosts) problems.push('There is more than one address (a comma after the address).');
  if (p.options.length) lines.push(['Settings after "?"', p.options.join(', ')]);
  const pw = p.password;
  if (pw == null || pw === '') { lines.push(['Password', '(none)']); problems.push('There is no password (nothing between "postgres.…:" and "@").'); }
  else {
    const kinds = /^[A-Za-z0-9]+$/.test(pw) ? 'letters and numbers only' : 'has characters other than letters and numbers';
    lines.push(['Password', pw.length + ' characters, ' + kinds + ' (the password itself is not shown)']);
    if (/YOUR-PASSWORD/i.test(pw)) problems.push('The password is still the placeholder [YOUR-PASSWORD]. Put the real password in its place.');
    else if (/[[\]]/.test(pw)) problems.push('The password still has a square bracket [ or ] in it. Remove the brackets that were around [YOUR-PASSWORD].');
    if (/\s/.test(pw)) problems.push('The password has a space or line break in it.');
  }
  if (p.badEscape) problems.push('There is a % that is not followed by two hex digits.');
  return { lines, problems, parts: p };
}

// One login attempt with psql; the password goes in through PGPASSWORD, never on the command line or in the output.
function tryLogin(conn, timeoutSec) {
  const env = Object.assign({}, process.env, { PGCONNECT_TIMEOUT: String(timeoutSec || 30) });
  delete env.SUPABASE_DB_URL; delete env.DATABASE_URL;
  Object.assign(env, { PGHOST: conn.host, PGPORT: conn.port || '5432', PGUSER: conn.user, PGPASSWORD: conn.password || '', PGDATABASE: conn.database || 'postgres' });
  const r = spawnSync('psql', ['-X', '-tA', '-c', 'select 1'], { env, encoding: 'utf8', timeout: (timeoutSec || 30) * 1000 + 5000 });
  if (r.status === 0) return { ok: true, text: 'it works' };
  let msg = ((r.stderr || '') + (r.stdout || '') || (r.error && r.error.message) || 'no answer').trim().split('\n')[0];
  if (conn.password && conn.password.length >= 6) msg = msg.split(conn.password).join("***");   // psql never prints it; just in case
  return { ok: false, text: msg, refused: /password authentication failed/.test(msg), unreachable: /Network is unreachable|could not translate host name|Cannot assign requested address|timeout expired|No route to host/i.test(msg) };
}

function main() {
  const raw = process.env.SUPABASE_DB_URL, ref = expectedRef(), out = [];
  const say = (t) => { console.log(t); out.push(t); };
  const d = describe(raw, ref);
  say('The secret SUPABASE_DB_URL, as psql reads it:');
  for (const [k, v] of d.lines) say('  ' + k + ': ' + v);
  for (const t of d.problems) { say('  PROBLEM: ' + t); console.log('::error::' + t); }
  let verdict = d.problems.length ? 'Fix the problem above in the secret (SUPABASE-SETUP.md, step 9), then re-run this run.' : '';
  if (!d.problems.length && process.argv.includes('--login')) {
    const viaPooler = tryLogin(d.parts);
    say('Logging in through the pooler with the parts given separately: ' + viaPooler.text);
    const m = /^postgres\.([a-z0-9]+)$/.exec(d.parts.user || '');
    let direct = null;
    if (m) {
      direct = tryLogin({ host: 'db.' + m[1] + '.supabase.co', port: '5432', user: 'postgres', password: d.parts.password, database: d.parts.database }, 15);
      say('Logging in straight to the database (past the pooler): ' + (direct.unreachable ? "this machine can't reach it (it needs IPv6), so this test can't tell" : direct.text));
    }
    if (viaPooler.ok) verdict = 'The login works with this secret. If the step above failed on the login, re-run this run; if it failed on an error inside setup.sql, that error is the one to fix.';
    else if (direct && direct.ok) verdict = "The password is right — the database itself accepts it — but Supabase's pooler still refuses it: the pooler is holding an older password. Wait a few minutes and re-run; if it still fails, this is for Supabase support.";
    else if (direct && direct.refused) verdict = 'The database itself refuses this password, so the password in the secret is not the database password. Reset it once more in Supabase and put the new one in the secret.';
    else if (viaPooler.refused) verdict = "The connection string looks right, so either the password in it isn't the database password, or Supabase's pooler is still holding an older one. This machine can't tell the two apart.";
    else verdict = 'The login failed for another reason: ' + viaPooler.text;
  }
  if (verdict) say(verdict);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Why the database login failed\n\n```\n' + out.join('\n') + '\n```\n'); } catch (e) {}
  }
  process.exit(d.problems.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { parse, describe, expectedRef, tryLogin };
