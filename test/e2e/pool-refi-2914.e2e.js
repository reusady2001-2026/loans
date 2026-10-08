/* 2.9.14 — 5 properties on 6 loans of their own (Cedar Point with a senior + a mezz) refinanced together into ONE loan
   through the refinance screen and Save; a pool of 12; and stacked loans over a pool (a pooled mezz on top, a member's
   own mezz): each property's NOI once, every payment counted, one Home row for the whole stack.
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/pool-refi-2914.e2e.js */
const scenario = require('./pool/scenario'), stacks = require('./pool/stacks'), report = require('./pool/report');
(async () => { const a = await scenario.run(['R', 'S']); const b = await stacks.run(); report('2.9.14 pooled-loan refinance + stacks', a.concat(b)); })()
  .catch(e => { console.error('E2E CRASH', e); process.exit(2); });
