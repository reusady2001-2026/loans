/* Unit checks for rate-history.js (2.9.7 — #255, #256): the rate tables built into the app.
   Run: node test/rate-history.test.js */
const R = require('../rate-history.js');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL ' + m); } };
const keys = (o) => Object.keys(o).sort();
const ym = (y, m) => y + '-' + String(m).padStart(2, '0');

// Monthly 1-month LIBOR: every month Sep 1989 → Sep 2024, plausible values.
const mk = keys(R.LIBOR1M_MONTHLY);
ok(mk[0] === '1989-09' && mk[mk.length - 1] === '2024-09', 'monthly LIBOR runs Sep 1989 – Sep 2024 (' + mk[0] + ' – ' + mk[mk.length - 1] + ')');
let gaps = 0; for (let y = 1989, m = 9; y < 2024 || (y === 2024 && m <= 9); m === 12 ? (y++, m = 1) : m++) if (R.LIBOR1M_MONTHLY[ym(y, m)] == null) gaps++;
ok(gaps === 0, 'no month is missing (' + gaps + ' gaps)');
ok(Object.values(R.LIBOR1M_MONTHLY).every(v => v > 0 && v < 12), 'every monthly figure is a plausible percent');
ok(R.LIBOR1M_MONTHLY['1989-09'] === 9.063 && R.LIBOR1M_MONTHLY['2022-01'] === 0.10617 && R.LIBOR1M_MONTHLY['2023-06'] === 5.18125, 'spot values match the source (Sep 1989 9.063, Jan 2022 0.10617, Jun 2023 5.18125)');

// Daily 1-month LIBOR: Dec 1 2021 → Jun 30 2023 (K2's period).
const dk = keys(R.LIBOR1M_DAILY);
ok(dk[0] === '2021-12-01' && dk[dk.length - 1] === '2023-06-30', 'daily LIBOR runs Dec 1 2021 – Jun 30 2023 (' + dk[0] + ' – ' + dk[dk.length - 1] + ')');
ok(R.LIBOR1M_DAILY['2021-12-29'] === 0.10425, 'Dec 29 2021 (the reset day for Jan 2022) is 0.10425');
ok(Math.abs(R.LIBOR1M_DAILY['2023-06-01'] - R.LIBOR1M_MONTHLY['2023-06']) < 0.2, 'daily and monthly agree within 0.2 pts in Jun 2023');

// 1-month Term SOFR daily since Dec 2021; 30-day Average SOFR since Mar 2020.
const tk = keys(R.TERMSOFR1M_DAILY), sk = keys(R.SOFR30_DAILY);
ok(tk[0] === '2021-12-01' && tk[tk.length - 1] >= '2026-10-01', 'Term SOFR runs Dec 2021 → the build (' + tk[tk.length - 1] + ')');
ok(R.TERMSOFR1M_DAILY['2026-09-24'] === 3.90031, 'Term SOFR on Sep 24 2026 is 3.90031 (the 3.900% you quoted)');
ok(sk[0] === '2020-03-02' && R.SOFR30_DAILY['2026-09-24'] === 3.69764, '30-day Average SOFR starts Mar 2 2020 and reads 3.69764 on Sep 24 2026');
ok(Object.values(R.TERMSOFR1M_DAILY).every(v => v >= 0 && v < 10) && Object.values(R.SOFR30_DAILY).every(v => v >= 0 && v < 10), 'every daily figure is a plausible percent');
ok(R.BUILT === '2026-10-04' && R.SOURCES && /fedprimerate/.test(R.SOURCES.libor1mMonthly) && /New York/.test(R.SOURCES.sofr30), 'the sources and build date are named');

console.log(fails ? fails + ' of ' + n + ' rate-history checks FAILED' : 'all ' + n + ' rate-history checks passed');
process.exit(fails ? 1 : 0);
