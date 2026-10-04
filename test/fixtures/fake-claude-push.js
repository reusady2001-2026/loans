#!/usr/bin/env node
/* Stand-in for the Claude Code CLI in test/e2e/push.e2e.js — never a real model.
   --version / --help / auth status answer like a signed-in CLI (signed in = a "signed-in.marker"
   file in CLAUDE_CONFIG_DIR). A `-p … --json-schema …` call reads the "what to push" input from stdin,
   records it to $LDS_FAKE_INPUT_FILE, and answers with fixed FAKE-* moves. The summary reasons from the
   statement's own vacancy against the vacancy assumption it was sent, so the test can check that the
   assumptions really reach Claude. */
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
const signedIn = () => { try { return fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR || '', 'signed-in.marker')); } catch (e) { return false; } };
if (a[0] === '--version') { console.log('0.0.0 (fake Claude Code for tests)'); process.exit(0); }
if (a[0] === '--help') { console.log('  --effort <level>  Effort level (low, medium, high)'); process.exit(0); }
if (a[0] === 'auth' && a[1] === 'status') { console.log(JSON.stringify({ loggedIn: signedIn() })); process.exit(0); }
if (a[0] !== '-p') process.exit(0);
let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  let input = null; try { input = JSON.parse(raw); } catch (e) {}
  if (process.env.LDS_FAKE_INPUT_FILE) { try { fs.writeFileSync(process.env.LDS_FAKE_INPUT_FILE, JSON.stringify(input)); } catch (e) {} }
  const t12 = (input && input.t12) || { income: [], expense: [] };
  const find = (re) => (t12.income || []).find((r) => re.test(r.line || ''));
  const gpr = find(/gross potential rent/i), vac = find(/vacancy/i);
  // The same base the app uses for vacancy: gross potential rent net of employee and model units.
  const base = gpr ? gpr.annual + (t12.income || []).filter((r) => /employee|model/i.test(r.line || '')).reduce((a, r) => a + (r.annual || 0), 0) : 0;
  const actual = (gpr && vac && base) ? Math.abs(vac.annual) / base : null;
  const assumed = input && input.underwritingAssumptions ? input.underwritingAssumptions.vacancy : null;
  const pct = (v) => (v * 100).toFixed(2) + '%';
  const summary = (actual != null && assumed != null && assumed > actual)
    ? 'FAKE-SUMMARY: the underwriting already credits the proven ' + pct(actual) + ' vacancy, so there is nothing to gain there.'
    : 'FAKE-SUMMARY: the statement shows ' + (actual != null ? pct(actual) : 'an unknown') + ' vacancy against a ' + (assumed != null ? pct(assumed) : 'missing') + ' underwriting assumption.';
  const data = { summary: summary, overlaps: [], moves: [
    { title: 'FAKE-MOVE trim utilities', rank: 1, impact: 'FAKE-IMPACT about $40,000 a year', impactInPlace: 40000, impactUnderwritten: 38000, effort: 'light', rationale: 'FAKE-RATIONALE utilities run above the benchmark.' } ] };
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: data, result: JSON.stringify(data), total_cost_usd: 0 }));
});
