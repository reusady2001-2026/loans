/* Unit checks for the in-app Guide's data (guide/guide.json, written by guide/capture.js) — the docs-style guide
   (2026-10-26): pages in groups, the Overview first; every page in the spec captured, with its sections, numbered
   steps and reference views; how-to steps with a picture only where needed and at most a few markers; reference
   views with a picture and every control named; every link, card and "Next steps" pointing at a real page (and
   section); every picture on disk, every marker inside its picture with an explanation; no picture left over; the
   app ships the guide. Run: node test/guide.test.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), G = path.join(ROOT, 'guide');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL ' + m); } };

const data = JSON.parse(fs.readFileSync(path.join(G, 'guide.json'), 'utf8'));
const spec = require(path.join(G, 'spec', 'index.js'));
const pages = data.pages || [], byId = {};
pages.forEach(p => { byId[p.id] = p; });
ok(data.version === 2 && Array.isArray(data.groups) && data.groups.length >= 5 && pages.length >= 40, 'guide.json is the docs-style guide: ' + (data.groups || []).length + ' groups, ' + pages.length + ' pages');
ok(/made-up/i.test(String(data.note || '')), 'it says the pictures use made-up files');
ok(pages[0] && pages[0].id === 'overview' && data.groups[0].pages[0] === 'overview', 'the Overview is the first page');
ok(JSON.stringify(data.groups.map(g => g.title)) === JSON.stringify(spec.groups.filter(t => data.groups.some(g => g.title === t))), 'the groups are in the spec’s order');
const listed = []; data.groups.forEach(g => g.pages.forEach(id => listed.push(id)));
ok(listed.length === pages.length && new Set(listed).size === listed.length && pages.every(p => listed.indexOf(p.id) >= 0), 'every page is listed once in the menu, and the menu lists nothing else');
ok(JSON.stringify(pages.map(p => p.id)) === JSON.stringify(listed), 'the pages are stored in the menu’s order (Previous / Next follow it)');
ok(new Set(pages.map(p => p.id)).size === pages.length, 'page ids are unique');
ok(data.groups.some(g => g.title === 'Reference' && g.pages.length >= 10) && pages.filter(p => p.kind === 'reference').every(p => p.group === 'Reference'), 'a Reference group holds the reference pages');

// every chapter in the spec captured, page by page, as its spec says
const missing = [], mismatch = [];
spec.chapters.forEach(c => (c.pages || []).forEach(sp => {
  const p = byId[sp.id]; if (!p){ missing.push(c.id + '/' + sp.id); return; }
  const same = (sp.sections || []).length === (p.sections || []).length && (sp.sections || []).every((s, i) => ['steps', 'views'].every(k => (s[k] || []).length === ((p.sections[i] || {})[k] || []).length));
  if (!same || p.title !== sp.title || p.kind !== (sp.kind || 'howto')) mismatch.push(c.id + '/' + sp.id);
}));
ok(!missing.length, 'every page in the spec has been captured' + (missing.length ? ' — missing: ' + missing.join(', ') : ''));
ok(!mismatch.length, 'every captured page matches its spec (retake it after changing the spec)' + (mismatch.length ? ': ' + mismatch.join(', ') : ''));

// the pages themselves
const bad = [], links = [], anchors = {};
pages.forEach(p => { anchors[p.id] = new Set((p.sections || []).map(s => s.id).concat(p.before && p.before.length ? ['before-you-start'] : [], p.next && p.next.length ? ['next-steps'] : [])); });
const linkRe = /\[([^\]]+)\]\(([^)#\s]+)(?:#([^)\s]+))?\)/g;
const texts = (p) => { const out = [p.description, p.intro].concat(p.before || [], (p.callouts || []).map(c => c.text));
  (p.sections || []).forEach(s => { out.push(s.text); (s.callouts || []).forEach(c => out.push(c.text)); ['steps', 'views'].forEach(k => (s[k] || []).forEach(x => { out.push(x.text); (x.callouts || []).forEach(c => out.push(c.text)); (x.marks || []).forEach(m => out.push(m.text)); })); });
  (p.next || []).forEach(x => out.push(x.text)); return out.filter(Boolean); };
let pics = 0, marks = 0, howtoMarks = 0;
pages.forEach(p => {
  const where = p.id;
  if (!p.title || !p.group || !p.description) bad.push(where + ': no title, group or description');
  if (/^how to\b/i.test(p.title)) bad.push(where + ': a how-to title reads after “How to”, so it doesn’t start with it');
  if (!(p.sections || []).length) bad.push(where + ': no sections');
  if (new Set((p.sections || []).map(s => s.id)).size !== (p.sections || []).length) bad.push(where + ': two sections with one id');
  (p.callouts || []).concat(...(p.sections || []).map(s => (s.callouts || []).concat(...['steps', 'views'].map(k => [].concat(...(s[k] || []).map(x => x.callouts || []))))))
    .forEach(c => { if (['note', 'tip', 'warning'].indexOf(c.kind) < 0 || !String(c.text || '').trim()) bad.push(where + ': a note / tip / warning without its kind or words'); });
  if (p.kind === 'howto'){
    if (!(p.sections || []).some(s => (s.steps || []).length)) bad.push(where + ': a how-to with no numbered steps');
    if (!(p.next || []).length) bad.push(where + ': a how-to with no Next steps');
  }
  (p.sections || []).forEach((s, si) => {
    if (!s.title) bad.push(where + ' section ' + (si + 1) + ': no title');
    (s.steps || []).forEach((x, i) => { if (!String(x.text || '').trim()) bad.push(where + '/' + s.id + ' step ' + (i + 1) + ': no words'); if ((x.marks || []).length > 5) bad.push(where + '/' + s.id + ' step ' + (i + 1) + ': ' + x.marks.length + ' markers — a how-to step points at a few things only'); howtoMarks += (x.marks || []).length; });
    if (p.kind === 'reference') (s.views || []).forEach((x, i) => { if (!x.img || !(x.marks || []).length) bad.push(where + '/' + s.id + ' view ' + (i + 1) + ': a reference view needs its picture and its controls named'); });
    ['steps', 'views'].forEach(k => (s[k] || []).forEach((x, i) => {
      const w = where + '/' + s.id + ' ' + k.slice(0, -1) + ' ' + (i + 1);
      if ((x.marks || []).length && !x.img) bad.push(w + ': markers without a picture');
      if (!x.img) return;
      pics++;
      if (!(x.w > 0 && x.h > 0)) bad.push(w + ': no size');
      const f = path.join(G, x.img);
      if (!fs.existsSync(f)) bad.push(w + ': its picture ' + x.img + ' is missing');
      else { const b = fs.readFileSync(f); if (!(b[0] === 0xFF && b[1] === 0xD8)) bad.push(w + ': its picture is not a JPEG'); if (b.length > 1.5 * 1024 * 1024) bad.push(w + ': its picture is over 1.5 MB'); }
      (x.marks || []).forEach((m, j) => {
        marks++;
        const inside = [m.x, m.y].every(v => typeof v === 'number' && v >= 0 && v <= 100) && m.w >= 0 && m.h >= 0 && m.x + m.w <= 100.2 && m.y + m.h <= 100.2;
        if (!inside) bad.push(w + ' marker ' + (j + 1) + ' is outside its picture');
        if (!String(m.text || '').trim()) bad.push(w + ' marker ' + (j + 1) + ' has no explanation');
      });
    }));
    (s.cards || []).forEach(c => links.push([where, c.page, c.anchor]));
    if (s.table) s.table.rows.forEach(r => links.push([where, r[1]]));
  });
  (p.next || []).forEach(x => links.push([where, x.page, x.anchor]));
  texts(p).forEach(t => { let m; linkRe.lastIndex = 0; while ((m = linkRe.exec(t))) links.push([where, m[2], m[3]]); });
});
ok(!bad.length, 'every page is whole: title, description, sections, numbered steps and Next steps on a how-to, a picture with its controls on a reference view, every picture on disk and every marker on it' + (bad.length ? ': ' + bad.slice(0, 8).join(' | ') + (bad.length > 8 ? ' …+' + (bad.length - 8) : '') : ''));
const broken = links.filter(l => !byId[l[1]] || (l[2] && !anchors[l[1]].has(l[2]))).map(l => l[0] + ' → ' + l[1] + (l[2] ? '#' + l[2] : ''));
ok(!broken.length, 'every link, card, table row and Next step opens a real page (and section): ' + links.length + ' links' + (broken.length ? ' — broken: ' + broken.slice(0, 8).join(', ') : ''));
ok(pics >= 80 && marks >= 400, 'a real guide: ' + pics + ' pictures, ' + marks + ' markers');
ok(howtoMarks < marks / 3, 'the markers sit mostly on the reference pages; the how-tos point at a few things (' + howtoMarks + ' of ' + marks + ')');
// the operator's rules (2026-10-26): Claude never asks for a tax bill, an assessment or who pays the utilities
const all = pages.map(p => texts(p).join(' ')).join(' ');
ok(!/tax bill|assessed value|assessment|utilitiesPaidBy|utility (bill|contract)/i.test(all), 'the guide never mentions a tax bill, an assessment or a utility bill — Claude works from the T12, the rent roll, the loan agreement and the property details');

// no picture left over from a step that no longer exists
const used = new Set(); pages.forEach(p => (p.sections || []).forEach(s => (s.steps || []).concat(s.views || []).forEach(x => { if (x.img) used.add(x.img); })));
const onDisk = []; if (fs.existsSync(path.join(G, 'img'))) fs.readdirSync(path.join(G, 'img')).forEach(d => { const q = path.join(G, 'img', d); if (fs.statSync(q).isDirectory()) fs.readdirSync(q).forEach(f => onDisk.push('img/' + d + '/' + f)); });
const orphans = onDisk.filter(f => !used.has(f));
ok(!orphans.length, 'no picture on disk that the guide doesn’t use' + (orphans.length ? ': ' + orphans.slice(0, 5).join(', ') + (orphans.length > 5 ? ' …+' + (orphans.length - 5) : '') : ''));
// the app ships the guide and loads its window
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok(['guide-viewer.js', 'guide/guide.json', 'guide/img/**/*'].every(f => pkg.build.files.indexOf(f) >= 0), 'package.json ships guide-viewer.js, guide/guide.json and the pictures');
ok(!pkg.build.files.some(f => /guide\/(spec|capture|helpers|fixtures|data)/.test(f)), 'the capture scripts and specs are not shipped');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/<script src="\.\/guide-viewer\.js"><\/script>/.test(html) && html.indexOf('id="settingsGuide"') > html.indexOf('id="settingsPortfolio"') && html.indexOf('id="settingsGuide"') < html.indexOf('id="settingsClaudeWrap"'),
   'index.html loads the guide, and Settings has it under the properties and above the Claude connection');

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' guide checks passed');
process.exit(fails ? 1 : 0);
