/* 2.9.14 — pooled loans, part 1: pick the pool's properties from a list on the loan form; three properties not in the app
   yet under one new loan; one refinance for 2 properties with loans + 1 new one; release a property (paydown, payment
   recalculated, Excel keeps it); release the lead; rename the lead on the loan form; rename a member through the assistant.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/pool-more-2914a.e2e.js */
const checks = require('./pool/checks15'), report = require('./pool/report');
checks.run(['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7']).then(r => report('2.9.14 pooled-loan (part 1)', r)).catch(e => { console.error('E2E CRASH', e); process.exit(2); });
