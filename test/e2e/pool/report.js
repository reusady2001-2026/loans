// 2.9.14 — print pooled-loan results the way the other e2e tests do, then exit (0 = all passed).
module.exports = function report(title, results) {
  let n = 0;
  results.forEach(r => { const ok = r.pass === true; console.log((ok ? '  ok   ' : '  FAIL ') + r.id + ' — ' + r.detail); if (!ok) n++; });
  if (!results.length) { console.log('  FAIL nothing ran'); n++; }
  console.log(n ? n + ' FAILED' : 'all ' + title + ' e2e checks passed');
  process.exit(n ? 1 : 0);
};
