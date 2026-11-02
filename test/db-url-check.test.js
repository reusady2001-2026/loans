/* Unit checks for supabase/db-url-check.js (3.0.0): explaining a failed database login without showing the password.
   Run: node test/db-url-check.test.js */
const C = require('../supabase/db-url-check.js');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL ' + m); } };
const REF = 'zbwqhrxnbdgvqmquycce', HOST = 'aws-0-us-east-1.pooler.supabase.com';
const url = (pw, o = {}) => 'postgresql://' + (o.user || 'postgres.' + REF) + ':' + pw + '@' + (o.host || HOST) + ':' + (o.port || '5432') + '/postgres';
const text = (d) => d.lines.map(([k, v]) => k + ': ' + v).concat(d.problems).join('\n');

ok(C.expectedRef() === REF, "the app's project id is read from cloud-config.json");

// A right string: no problems, every part named, the password only by its length and kinds.
const pw = 'Kq7vR2mXw9TzLp4NbY8c';
let d = C.describe(url(pw), REF);
ok(d.problems.length === 0, 'a right Session pooler string has no problems (' + d.problems.join(' | ') + ')');
ok(d.parts.user === 'postgres.' + REF && d.parts.password === pw && d.parts.host === HOST && d.parts.port === '5432' && d.parts.database === 'postgres', 'it is split as psql splits it');
ok(/Password: 20 characters, letters and numbers only/.test(text(d)) && /Is this app's project \(zbwqhrxnbdgvqmquycce\): yes/.test(text(d)), 'the password is described by length and kinds; the project is checked');

// The password never appears in what is printed, whatever the string.
const cases = [url(pw), url('[' + pw + ']'), url(pw, { user: 'postgres' }), url(pw, { user: 'postgres.abcdefghijklmnopqrst' }), url(pw, { host: 'db.' + REF + '.supabase.co' }), ' ' + url(pw) + '\n', url('Ab*!9xyZ'), url(pw + ' x')];
ok(cases.every((s) => !text(C.describe(s, REF)).includes(pw.slice(0, 6))), 'no description ever contains the password (or a piece of it)');

// Plain mistakes are named.
const prob = (s) => C.describe(s, REF).problems.join(' | ');
ok(/square bracket/.test(prob(url('[' + pw + ']'))), 'brackets left around the password are named');
ok(/placeholder/.test(prob(url('[YOUR-PASSWORD]'))), 'the untouched placeholder is named');
ok(/without the project id/.test(prob(url(pw, { user: 'postgres' }))), 'the username without the project id is named');
ok(/another Supabase project \(abcdefghijklmnopqrst\)/.test(prob(url(pw, { user: 'postgres.abcdefghijklmnopqrst' }))), "another project's string is named");
ok(/Direct connection/.test(prob(url(pw, { host: 'db.' + REF + '.supabase.co', user: 'postgres' }))), 'the Direct connection string is named');
ok(/blank space or line break at the start or end/.test(prob(' ' + url(pw) + '\n')), 'blank space around the string is named');
ok(/space or line break in it/.test(prob(url(pw + ' x'))), 'a space inside the password is named');
ok(/no password/.test(prob('postgresql://postgres.' + REF + '@' + HOST + ':5432/postgres')), 'a missing password is named');
ok(/doesn't start with postgresql/.test(prob('host=' + HOST + ' user=postgres')), 'a string that is not a postgresql:// address is named');
ok(/empty/.test(prob('')), 'an empty secret is named');

// Characters psql takes as they are (the operator's first password had * and !), and %-escapes, are read as psql reads them.
d = C.describe(url('Ab*!9xyZ'), REF);
ok(d.problems.length === 0 && d.parts.password === 'Ab*!9xyZ' && /has characters other than letters and numbers/.test(text(d)), '* and ! are read as they are');
d = C.describe(url('a%40b%23c'), REF);
ok(d.problems.length === 0 && d.parts.password === 'a@b#c', '%40 and %23 are read as @ and #');
ok(/% that is not followed/.test(prob(url('ab%zz'))), 'a broken %-escape is named');

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
