/* ============================================================================
   AI bridge (main process). Connects the app to Claude two ways:
     1. The Claude Code CLI  — uses the operator's Claude subscription (no API
        key, no per-token billing). Primary path. We shell out to `claude -p`
        in headless mode with --json-schema for validated structured output.
     2. The Anthropic API    — fallback for machines without the CLI. The
        operator pastes an API key; we POST to /v1/messages with a forced
        tool call to get structured output. Raw HTTPS, so the offline app
        carries no SDK dependency.
   The renderer supplies the instruction + JSON schema + document text; this
   module runs whichever path is configured and returns the validated object.
   The API key lives only here (userData/ai-config.json, 0600) — never in the
   renderer or localStorage; the renderer only ever learns whether one is set.
   ========================================================================== */
const { spawn } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');

let _app = null;
function init(app){ _app = app; }

const API_MODEL = 'claude-opus-5';        // fallback-path model (see claude-api guidance)
// Resolve the Claude Code binary. Prefer the copy BUNDLED inside the app (so the
// user never installs Claude Code separately — it ships in the platform optional
// dependency @anthropic-ai/claude-code-<os>-<arch>); fall back to a globally
// installed `claude` on PATH; honor LDS_CLAUDE_BIN as a test override.
function bundledClaudePath(){
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const osKey = process.platform === 'win32' ? 'win32' : (process.platform === 'darwin' ? 'darwin' : 'linux');
  const subBin = process.platform === 'win32' ? 'claude.exe' : 'claude';
  // Candidate relative paths, MOST-RELIABLE FIRST:
  //  1. the wrapper package's bin/claude.exe — claude-code's postinstall copies the
  //     native binary here on EVERY platform (the file is literally named claude.exe
  //     everywhere), and the wrapper is a direct dependency, so it's always packaged.
  //  2. the platform sub-package's own binary — a fallback. electron-builder can prune
  //     cross-platform optional deps, so this may be ABSENT even when (1) is present
  //     (that pruning is exactly why looking only here used to resolve to nothing → the
  //     app fell back to a bare `claude` that isn't on PATH).
  const rels = [
    path.join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    path.join('node_modules', '@anthropic-ai', 'claude-code-' + osKey + '-' + arch, subBin),
  ];
  const roots = [];
  try { if (_app && _app.isPackaged && process.resourcesPath) roots.push(path.join(process.resourcesPath, 'app.asar.unpacked')); } catch (e) {}
  roots.push(__dirname);                       // dev / unpacked: alongside this file (app root)
  try { roots.push(process.cwd()); } catch (e) {}
  for (const r of roots){ for (const rel of rels){ const c = path.join(r, rel); try { if (fs.existsSync(c)) return c; } catch (e) {} } }
  return null;
}
function cliBin(){
  if (process.env.LDS_CLAUDE_BIN) return process.env.LDS_CLAUDE_BIN;   // test override
  return bundledClaudePath() || 'claude';                              // bundled copy, else a global install
}

function cfgPath(){ return path.join(_app.getPath('userData'), 'ai-config.json'); }
function readCfg(){ try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) || {}; } catch (e) { return {}; } }
function writeCfg(c){ try { fs.writeFileSync(cfgPath(), JSON.stringify(c), { mode: 0o600 }); } catch (e) {} }

// Is the Claude Code CLI installed and runnable? (`claude --version` exits 0)
function detectCli(){
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => finish({ available: false }), 6000);
    let p;
    try { p = spawn(cliBin(),['--version'], { stdio: ['ignore', 'pipe', 'ignore'], env: cliEnv() }); }
    catch (e) { return finish({ available: false }); }
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => finish({ available: false }));
    p.on('close', (code) => finish({ available: code === 0, version: out.trim() }));
  });
}

async function status(){
  const cli = await detectCli();
  const cfg = readCfg();
  // Only probe subscription sign-in when the CLI is actually runnable — `auth status`
  // otherwise just adds latency and can't be true anyway.
  const connected = cli.available ? await subscriptionConnected() : false;
  return { cli, apiKey: { configured: !!cfg.apiKey }, oauth: { configured: !!cfg.oauthToken }, subscription: { connected }, mode: cfg.mode || 'auto' };
}
function setKey(key){ const c = readCfg(); const k = (key == null ? '' : String(key)).trim(); if (k) c.apiKey = k; else delete c.apiKey; writeCfg(c); return { configured: !!c.apiKey }; }
function setMode(mode){ const c = readCfg(); c.mode = (['auto','cli','api'].indexOf(mode) >= 0) ? mode : 'auto'; writeCfg(c); return { mode: c.mode }; }

// Environment for a `claude` spawn: inject the stored subscription OAuth token so
// the CLI runs on the user's Claude subscription (no API key, no per-use billing).
function cliEnv(){
  const c = readCfg(); const e = Object.assign({}, process.env);
  if (c.oauthToken) e.CLAUDE_CODE_OAUTH_TOKEN = c.oauthToken;
  try { if (_app) e.CLAUDE_CONFIG_DIR = path.join(_app.getPath('userData'), 'claude'); } catch (err) {}   // isolate creds from the user's global ~/.claude
  return e;
}

// Run a `claude` subcommand and parse its JSON stdout (or null on any failure).
function runClaudeJson(args, env){
  return new Promise((resolve) => {
    let out = '', p;
    try { p = spawn(cliBin(), args, { stdio: ['ignore', 'pipe', 'ignore'], env: env || cliEnv() }); }
    catch (e) { return resolve(null); }
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(/\"loggedIn\"\s*:\s*true/.test(out) ? { loggedIn: true } : null); } });
  });
}
// Is the subscription signed in? `claude auth status` reads the credentials stored
// (by the login below) under our isolated CLAUDE_CONFIG_DIR.
async function subscriptionConnected(){
  const j = await runClaudeJson(['auth', 'status'], cliEnv());
  return !!(j && j.loggedIn === true);
}

// Sign in to the Claude subscription. The CLI's login is INTERACTIVE (it needs a
// real terminal), so we open it in a visible console window; the browser opens
// from there, the user signs in, and the CLI stores credentials under our isolated
// CLAUDE_CONFIG_DIR. We then poll `auth status` until it reports logged-in — no
// token to capture, and subsequent `claude -p` calls use those stored credentials.
function login(){
  return new Promise((resolve) => {
    const bin = cliBin();
    // If we couldn't resolve the bundled binary we'd fall back to a bare `claude`
    // that isn't on the user's PATH — launching a console for that just shows a
    // confusing "'claude' is not recognized". Fail clearly instead.
    if (bin === 'claude' && !process.env.LDS_CLAUDE_BIN){
      return resolve({ ok:false, error:'The built-in Claude client wasn’t found in this install. Reinstalling the app usually fixes it — or use an Anthropic API key under Advanced.' });
    }
    const cfgDir = (_app && _app.getPath) ? path.join(_app.getPath('userData'), 'claude') : null;
    if (cfgDir) { try { fs.mkdirSync(cfgDir, { recursive: true }); } catch (e) {} }
    const env = Object.assign({}, process.env);
    if (cfgDir) env.CLAUDE_CONFIG_DIR = cfgDir;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    try {
      if (process.platform === 'win32'){
        // A .cmd launched in a new console window gives the CLI a real TTY. Keeping
        // the command in a file avoids fragile inline quoting.
        const tmp = (_app && _app.getPath) ? _app.getPath('temp') : os.tmpdir();
        const bat = path.join(tmp, 'lds-claude-signin.cmd');
        const lines = ['@echo off', 'title Connect to your Claude subscription'];
        if (cfgDir) lines.push('set "CLAUDE_CONFIG_DIR=' + cfgDir + '"');
        lines.push('echo Signing in to your Claude subscription...');
        lines.push('echo A browser window will open - complete the sign-in there.');
        lines.push('echo(');
        lines.push('"' + bin + '" auth login --claudeai');
        lines.push('echo(');
        lines.push('echo You can close this window.');
        lines.push('timeout /t 8 >nul');
        fs.writeFileSync(bat, lines.join('\r\n'), 'utf8');
        spawn('cmd.exe', ['/c', 'start', '""', bat], { windowsHide: false, detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin'){
        const inner = (cfgDir ? ('export CLAUDE_CONFIG_DIR=' + JSON.stringify(cfgDir) + '; ') : '') + JSON.stringify(bin) + ' auth login --claudeai';
        spawn('osascript', ['-e', 'tell application "Terminal" to do script ' + JSON.stringify(inner)], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn(bin, ['auth', 'login', '--claudeai'], { env: env, detached: true, stdio: 'ignore' }).unref();
      }
    } catch (e) { return resolve({ ok:false, error:'Could not open the sign-in window. ' + String((e&&e.message)||e).slice(0,160) }); }
    // Poll until the login completes (or a 5-minute timeout).
    let elapsed = 0; const step = 3000, max = 300000; let settled = false;
    const done = (v) => { if (!settled){ settled = true; resolve(v); } };
    const tick = async () => {
      if (settled) return;
      let ok = false; try { ok = await subscriptionConnected(); } catch (e) {}
      if (ok){ const c = readCfg(); c.mode = 'cli'; writeCfg(c); return done({ ok:true }); }
      elapsed += step;
      if (elapsed >= max) return done({ ok:false, error:'Sign-in wasn’t detected. Finish signing in in the window that opened, then reopen this dialog — or use an API key.' });
      setTimeout(tick, step);
    };
    setTimeout(tick, step);
  });
}
// Sign out: run `claude auth logout` (clears the stored subscription credentials)
// and WAIT for it, so a status refresh right after reflects the signed-out state
// instead of racing the process. Then clear our own config.
function logout(){
  return new Promise((resolve) => {
    const finish = () => { const c = readCfg(); delete c.oauthToken; c.mode = 'auto'; writeCfg(c); resolve({ ok: true }); };
    let p;
    try { p = spawn(cliBin(), ['auth', 'logout'], { stdio: 'ignore', env: cliEnv() }); }
    catch (e) { return finish(); }
    let done = false; const fin = () => { if (!done) { done = true; finish(); } };
    p.on('error', fin); p.on('close', fin);
    setTimeout(fin, 8000);   // never hang the UI if logout stalls
  });
}

// Run a structured extraction. opts: { instruction, schema, input, model?, timeoutMs? }
// Resolves { ok, data, via, cost?, error? }.
async function extract(opts){
  opts = opts || {};
  if (!opts.instruction || !opts.schema) return { ok: false, error: 'Missing instruction or schema.' };
  const cfg = readCfg();
  const mode = cfg.mode || 'auto';
  const cli = await detectCli();
  const useCli = (mode === 'cli') || (mode === 'auto' && cli.available);
  if (useCli){
    if (!cli.available) return { ok: false, error: 'CLI mode is selected but the Claude Code CLI was not found on this machine.' };
    return runCli(opts);
  }
  if (cfg.apiKey) return runApi(opts, cfg.apiKey);
  return { ok: false, error: cli.available
    ? 'No API key is configured. Switch to CLI mode to use your Claude subscription, or add an API key.'
    : 'Claude Code CLI not found and no API key configured. Install Claude Code (and run `claude` once to sign in) or add an Anthropic API key in Settings.' };
}

function runCli({ instruction, schema, input, model, timeoutMs }){
  return new Promise((resolve) => {
    const args = ['-p', instruction, '--output-format', 'json',
      '--json-schema', JSON.stringify(schema), '--allowed-tools', 'StructuredOutput'];
    if (model) args.push('--model', model);
    let out = '', err = '', done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => { try { p.kill(); } catch (e) {} finish({ ok: false, error: 'Timed out reading the document (over ' + Math.round((timeoutMs || 240000) / 1000) + 's).' }); }, timeoutMs || 240000);
    let p;
    try { p = spawn(cliBin(),args, { stdio: ['pipe', 'pipe', 'pipe'], env: cliEnv() }); }
    catch (e) { return finish({ ok: false, error: 'Could not start the Claude Code CLI.' }); }
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => finish({ ok: false, error: 'The Claude Code CLI failed to run.' }));
    p.on('close', () => {
      let j; try { j = JSON.parse(out); } catch (e) { return finish({ ok: false, error: 'Could not parse the CLI response. ' + (err || '').slice(0, 300) }); }
      if (j.is_error || j.subtype !== 'success') return finish({ ok: false, error: (typeof j.result === 'string' ? j.result : 'The CLI reported an error.') });
      let data = j.structured_output;
      if (data == null && typeof j.result === 'string') { try { data = JSON.parse(j.result); } catch (e) {} }
      if (data == null) return finish({ ok: false, error: 'The CLI returned no structured output.' });
      finish({ ok: true, data: data, via: 'cli', cost: j.total_cost_usd });
    });
    try { p.stdin.write(String(input || '')); p.stdin.end(); } catch (e) {}
  });
}

// Run a free-form chat (no structured output, no tools). opts:
// { system, prompt, model?, timeoutMs? }. Resolves { ok, text, via, cost?, error? }.
// Same auto/cli/api selection as extract(): the Claude Code subscription first,
// the Anthropic API key as a fallback.
async function chat(opts){
  opts = opts || {};
  if (!opts.prompt) return { ok: false, error: 'Missing prompt.' };
  const cfg = readCfg();
  const mode = cfg.mode || 'auto';
  const cli = await detectCli();
  const useCli = (mode === 'cli') || (mode === 'auto' && cli.available);
  if (useCli){
    if (!cli.available) return { ok: false, error: 'CLI mode is selected but the Claude Code CLI was not found on this machine.' };
    return runCliChat(opts);
  }
  if (cfg.apiKey) return runApiChat(opts, cfg.apiKey);
  return { ok: false, error: cli.available
    ? 'No API key is configured. Switch to CLI mode to use your Claude subscription, or add an API key.'
    : 'Claude Code CLI not found and no API key configured. Install Claude Code (and run `claude` once to sign in) or add an Anthropic API key in Settings.' };
}

// CLI chat: `claude -p <prompt> --output-format json` with the system prompt
// appended and NO tools enabled (an empty allowed-tools list — a plain Q&A needs
// none), then read `.result`. The prompt carries the question + portfolio JSON.
function runCliChat({ system, prompt, model, timeoutMs }){
  return new Promise((resolve) => {
    const args = ['-p', String(prompt), '--output-format', 'json', '--allowed-tools', ''];
    if (system) args.push('--append-system-prompt', String(system));
    if (model) args.push('--model', model);
    let out = '', err = '', done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => { try { p.kill(); } catch (e) {} finish({ ok: false, error: 'Timed out waiting for an answer (over ' + Math.round((timeoutMs || 120000) / 1000) + 's).' }); }, timeoutMs || 120000);
    let p;
    try { p = spawn(cliBin(),args, { stdio: ['ignore', 'pipe', 'pipe'], env: cliEnv() }); }
    catch (e) { return finish({ ok: false, error: 'Could not start the Claude Code CLI.' }); }
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => finish({ ok: false, error: 'The Claude Code CLI failed to run.' }));
    p.on('close', () => {
      let j; try { j = JSON.parse(out); } catch (e) { return finish({ ok: false, error: 'Could not parse the CLI response. ' + (err || '').slice(0, 300) }); }
      if (j.is_error || j.subtype !== 'success') return finish({ ok: false, error: (typeof j.result === 'string' ? j.result : 'The CLI reported an error.') });
      const text = (typeof j.result === 'string') ? j.result : '';
      if (!text) return finish({ ok: false, error: 'The CLI returned an empty answer.' });
      finish({ ok: true, text: text, via: 'cli', cost: j.total_cost_usd });
    });
  });
}

// API chat: POST /v1/messages with system + a single user message, no tools;
// read the first text block from the response.
function runApiChat({ system, prompt, model, timeoutMs }, apiKey){
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: model || API_MODEL,
      max_tokens: 4096,
      system: system ? String(system) : undefined,
      messages: [{ role: 'user', content: String(prompt) }],
    });
    const req = https.request({
      host: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(body) },
      timeout: timeoutMs || 120000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j; try { j = JSON.parse(d); } catch (e) { return resolve({ ok: false, error: 'Could not parse the API response.' }); }
        if (j.type === 'error' || j.error) return resolve({ ok: false, error: (j.error && j.error.message) || 'API error.' });
        const tb = (j.content || []).find((c) => c.type === 'text');
        const text = tb && tb.text ? tb.text : '';
        if (!text) return resolve({ ok: false, error: 'The API returned an empty answer.' });
        resolve({ ok: true, text: text, via: 'api' });
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'Network error contacting the Anthropic API.' }));
    req.on('timeout', () => { try { req.destroy(); } catch (e) {} resolve({ ok: false, error: 'The API request timed out.' }); });
    req.write(body); req.end();
  });
}

function runApi({ instruction, schema, input, model, timeoutMs }, apiKey){
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: model || API_MODEL,
      max_tokens: 8192,
      tools: [{ name: 'record', description: 'Return the extracted fields.', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'record' },
      messages: [{ role: 'user', content: instruction + '\n\n<document>\n' + String(input || '') + '\n</document>' }],
    });
    const req = https.request({
      host: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(body) },
      timeout: timeoutMs || 240000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j; try { j = JSON.parse(d); } catch (e) { return resolve({ ok: false, error: 'Could not parse the API response.' }); }
        if (j.type === 'error' || j.error) return resolve({ ok: false, error: (j.error && j.error.message) || 'API error.' });
        const tu = (j.content || []).find((c) => c.type === 'tool_use');
        if (!tu) return resolve({ ok: false, error: 'The API returned no structured output.' });
        resolve({ ok: true, data: tu.input, via: 'api' });
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'Network error contacting the Anthropic API.' }));
    req.on('timeout', () => { try { req.destroy(); } catch (e) {} resolve({ ok: false, error: 'The API request timed out.' }); });
    req.write(body); req.end();
  });
}

module.exports = { init, status, setKey, setMode, extract, chat, login, logout, bundledClaudePath, cliBin };
