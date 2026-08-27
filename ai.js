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

let _app = null;
function init(app){ _app = app; }

const API_MODEL = 'claude-opus-5';        // fallback-path model (see claude-api guidance)
const CLI_BIN = process.env.LDS_CLAUDE_BIN || 'claude';

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
    try { p = spawn(CLI_BIN, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] }); }
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
  return { cli, apiKey: { configured: !!cfg.apiKey }, mode: cfg.mode || 'auto' };
}
function setKey(key){ const c = readCfg(); const k = (key == null ? '' : String(key)).trim(); if (k) c.apiKey = k; else delete c.apiKey; writeCfg(c); return { configured: !!c.apiKey }; }
function setMode(mode){ const c = readCfg(); c.mode = (['auto','cli','api'].indexOf(mode) >= 0) ? mode : 'auto'; writeCfg(c); return { mode: c.mode }; }

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
    try { p = spawn(CLI_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] }); }
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
    try { p = spawn(CLI_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
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

module.exports = { init, status, setKey, setMode, extract, chat };
