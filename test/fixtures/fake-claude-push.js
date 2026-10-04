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
  // 2.9.7 (#108) — the T12 double reading: answer with the app's own classification of every detail line
  // ($LDS_FAKE_T12 = "agree"), or with two deliberate disagreements ("disagree": a reimbursement line read as a
  // utility expense, and one repairs month read $600 higher).
  if (/checking a property's trailing-twelve-month operating statement/i.test(a[1] || '')) { answerT12(raw); return; }
  let input = null; try { input = JSON.parse(raw); } catch (e) {}
  if (process.env.LDS_FAKE_INPUT_FILE) { try { fs.writeFileSync(process.env.LDS_FAKE_INPUT_FILE, JSON.stringify(input)); } catch (e) {} }
  if (process.env.LDS_FAKE_CALLS_FILE) { try { fs.appendFileSync(process.env.LDS_FAKE_CALLS_FILE, new Date().toISOString() + ' ' + ((input && input.property) || '?') + '\n'); } catch (e) {} }   // one line per call, so a test can count them
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

function answerT12(raw){
  if (process.env.LDS_FAKE_CALLS_FILE) { try { fs.appendFileSync(process.env.LDS_FAKE_CALLS_FILE, new Date().toISOString() + ' T12-CHECK\n'); } catch (e) {} }
  const K = require(path.join(__dirname, '..', '..', 't12-classify.js'));
  const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const rows = String(raw).split('\n').map((l) => { const m = l.match(/^Row (\d+): (.*)$/); return m ? { n: +m[1], cells: m[2].split(' | ') } : null; }).filter(Boolean);
  let monthCols = null, section = 'INCOME', done = false; const lines = [];
  const num = (c) => { const t = String(c || '').replace(/[$,\s]/g, ''); if (!/^\(?-?[\d.]+\)?$/.test(t)) return null; const v = parseFloat(t.replace(/[()]/g, '')); return /^\(.*\)$/.test(t) ? -v : v; };
  for (const r of rows){
    if (!monthCols){
      const cols = []; r.cells.forEach((c, i) => { const m = String(c).match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/); if (m && MON[m[1].toLowerCase()]) cols.push({ i, ym: m[2] + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') }); });
      if (cols.length) monthCols = cols;
      continue;
    }
    if (done) continue;
    const label = String(r.cells[0] || '').trim(), up = label.toUpperCase();
    if (/^NET OPERATING INCOME/.test(up)) { done = true; continue; }
    if (/^TOTAL INCOME/.test(up)) { section = 'EXPENSE'; continue; }
    if (/^TOTAL/.test(up)) continue;
    const nums = r.cells.slice(1).map(num);
    if (!nums.some((v) => v != null)) { if (/EXPENSE/.test(up)) section = 'EXPENSE'; continue; }
    const cc = K.classifyConfident(label, section, ''), code = (cc && cc.code) || (section === 'EXPENSE' ? 'GA' : 'OTH');
    const role = section === 'EXPENSE' ? 'expense' : 'income';
    const monthly = monthCols.map((mc) => ({ month: mc.ym, amount: num(r.cells[mc.i]) || 0 }));
    const annual = num(r.cells[r.cells.length - 1]) || 0;
    lines.push({ row: r.n, label, role, category: role === 'expense' ? (K.roleOf(code) === 'expense' ? code : 'GA') : (K.roleOf(code) === 'expense' ? 'OTH' : code), annual, monthly });
  }
  if ((process.env.LDS_FAKE_T12 || 'agree') === 'disagree'){
    const re = lines.find((l) => /reimburs/i.test(l.label)); if (re){ re.role = 'expense'; re.category = 'UTIL'; }
    const rm = lines.find((l) => /repair/i.test(l.label)); if (rm && rm.monthly[4]){ rm.monthly[4].amount += 600; rm.annual += 600; }
  }
  const data = { lines: lines, totals: {} };
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: data, result: JSON.stringify(data), total_cost_usd: 0 }));
}
