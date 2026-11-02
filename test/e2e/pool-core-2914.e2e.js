/* 2.9.14 — a pooled loan: ONE loan on 5 properties (Maple Court + 4 it also secures, each with its allocated amount)
   next to a control property. Home's debt, NOI, debt service and DSCR are each counted once; every property's page shows
   the pool; one maturity; Data Health clean; the roll-up; the assistant; one refinance for the pool; remove / restore;
   backup → restore; Excel export → import into another copy; rename a member; change the rate once.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/pool-core-2914.e2e.js */
const scenario = require('./pool/scenario'), report = require('./pool/report');
scenario.run(['E']).then(r => report('2.9.14 pooled-loan core', r)).catch(e => { console.error('E2E CRASH', e); process.exit(2); });
