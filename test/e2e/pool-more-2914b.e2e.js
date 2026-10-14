/* 2.9.14 — pooled loans, part 2: rename the lead through an Excel import; the import warns about a name that isn't a
   property; names as you wrote them; the assistant makes a pool, releases a property and opens one refinance for 5;
   no limit (one loan on 40 properties); a senior + mezz page shows the real balance and payment.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/pool-more-2914b.e2e.js */
const checks = require('./pool/checks15'), report = require('./pool/report');
checks.run(['N8', 'N9', 'N10', 'N11', 'N12', 'N13', 'N14', 'N15']).then(r => report('2.9.14 pooled-loan (part 2)', r)).catch(e => { console.error('E2E CRASH', e); process.exit(2); });
