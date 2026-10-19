/* Unit checks for the in-app Guide's data (guide/guide.json, written by guide/capture.js): every chapter in the spec's
   order, every topic with steps, every step's picture on disk with its size, every marker inside its picture with a
   name or an explanation, and the app ships the guide (package.json build.files).  Run: node test/guide.test.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), G = path.join(ROOT, 'guide');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL ' + m); } };

const data = JSON.parse(fs.readFileSync(path.join(G, 'guide.json'), 'utf8'));
const spec = require(path.join(G, 'spec', 'index.js'));
ok(Array.isArray(data.chapters) && data.chapters.length >= 1, 'guide.json has chapters (' + (data.chapters || []).length + ')');
ok(String(data.intro || '').length > 20 && /made-up/i.test(String(data.note || '')), 'it has an intro and says the pictures use made-up files');
ok(JSON.stringify(data.chapters.map(c => c.id)) === JSON.stringify(spec.chapters.map(c => c.id).filter(id => data.chapters.some(c => c.id === id))), 'chapters in the spec’s order');
ok(spec.chapters.every(c => data.chapters.some(d => d.id === c.id)), 'every chapter in the spec has been captured (' + spec.chapters.filter(c => !data.chapters.some(d => d.id === c.id)).map(c => c.id).join(', ') + ')');
const ids = {}; let steps = 0, marks = 0, bad = [];
data.chapters.forEach(c => {
  ok(c.id && c.title && Array.isArray(c.topics) && c.topics.length, 'chapter ' + c.id + ' has a title and topics');
  ok(!ids[c.id], 'chapter ids are unique (' + c.id + ')'); ids[c.id] = 1;
  const sp = spec.chapters.find(x => x.id === c.id);
  if (sp) ok(sp.topics.length === c.topics.length && sp.topics.every((t, i) => t.steps.length === c.topics[i].steps.length), c.id + ': the captured topics and steps match its spec (retake it after changing the spec)');
  if (c.cover) ok(fs.existsSync(path.join(G, c.cover)), c.id + ': its cover picture exists');
  const tids = {};
  c.topics.forEach(t => {
    ok(t.id && t.title && t.steps.length, c.id + '/' + t.id + ' has a title and steps');
    ok(!tids[t.id], c.id + ': topic ids are unique (' + t.id + ')'); tids[t.id] = 1;
    t.steps.forEach((s, i) => {
      steps++;
      const where = c.id + '/' + t.id + ' step ' + (i + 1);
      if (!s.title || !s.img || !(s.w > 0 && s.h > 0)) bad.push(where + ': no title, picture or size');
      const f = path.join(G, s.img);
      if (!fs.existsSync(f)) bad.push(where + ': its picture ' + s.img + ' is missing');
      else {
        const b = fs.readFileSync(f);
        if (!(b[0] === 0xFF && b[1] === 0xD8)) bad.push(where + ': its picture is not a JPEG');
        if (b.length > 1.5 * 1024 * 1024) bad.push(where + ': its picture is over 1.5 MB');
      }
      (s.marks || []).forEach((m, k) => {
        marks++;
        const inside = [m.x, m.y].every(v => typeof v === 'number' && v >= 0 && v <= 100) && m.w >= 0 && m.h >= 0 && m.x + m.w <= 100.2 && m.y + m.h <= 100.2;
        if (!inside) bad.push(where + ' marker ' + (k + 1) + ' is outside its picture');
        if (!String(m.text || '').trim()) bad.push(where + ' marker ' + (k + 1) + ' has no explanation');
      });
    });
  });
});
ok(!bad.length, 'every step has its picture, and every marker sits on it with an explanation' + (bad.length ? ': ' + bad.slice(0, 8).join(' | ') + (bad.length > 8 ? ' …+' + (bad.length - 8) : '') : ''));
ok(steps >= 30 && marks >= 100, 'a real walkthrough: ' + steps + ' steps, ' + marks + ' markers');
// no picture left over from a step that no longer exists
const used = new Set(); data.chapters.forEach(c => c.topics.forEach(t => t.steps.forEach(s => used.add(s.img))));
const onDisk = []; if (fs.existsSync(path.join(G, 'img'))) fs.readdirSync(path.join(G, 'img')).forEach(d => { const p = path.join(G, 'img', d); if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach(f => onDisk.push('img/' + d + '/' + f)); });
const orphans = onDisk.filter(f => !used.has(f));
ok(!orphans.length, 'no picture on disk that the guide doesn’t use' + (orphans.length ? ': ' + orphans.slice(0, 5).join(', ') : ''));
// the app ships the guide and loads its window
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok(['guide-viewer.js', 'guide/guide.json', 'guide/img/**/*'].every(f => pkg.build.files.indexOf(f) >= 0), 'package.json ships guide-viewer.js, guide/guide.json and the pictures');
ok(!pkg.build.files.some(f => /guide\/(spec|capture|helpers|fixtures|data)/.test(f)), 'the capture scripts and specs are not shipped');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/<script src="\.\/guide-viewer\.js"><\/script>/.test(html) && html.indexOf('id="settingsGuide"') > html.indexOf('id="settingsPortfolio"') && html.indexOf('id="settingsGuide"') < html.indexOf('id="settingsClaudeWrap"'),
   'index.html loads the guide, and Settings has it under the properties and above the Claude connection');

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' guide checks passed');
process.exit(fails ? 1 : 0);
