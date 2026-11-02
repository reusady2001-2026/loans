// Builds a single self-contained HTML file: inlines the vendored Tailwind and
// SheetJS scripts directly into index.html so the result is ONE file the user
// can double-click — no vendor/ folder, no server, no install, fully offline.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tailwind = fs.readFileSync(path.join(root, 'vendor', 'tailwindcss.js'), 'utf8');
const xlsx = fs.readFileSync(path.join(root, 'vendor', 'xlsx.full.min.js'), 'utf8');

// Use split().join() (NOT String.replace) so the minified library text — which
// contains `$` sequences — is inserted verbatim, with no special-pattern parsing.
function inline(source, tag, code) {
  if (source.indexOf(tag) === -1) {
    throw new Error('Tag not found in index.html: ' + tag);
  }
  // Strip the trailing source-map comment if present; it points at a file we
  // are not shipping and would just log a 404 attempt.
  const cleaned = code.replace(/\n\/\/[#@]\s*sourceMappingURL=.*$/m, '');
  return source.split(tag).join('<script>\n' + cleaned + '\n</script>');
}

let out = html;
out = inline(out, '<script src="./vendor/tailwindcss.js"></script>', tailwind);
out = inline(out, '<script src="./vendor/xlsx.full.min.js"></script>', xlsx);

if (out.indexOf('./vendor/') !== -1) {
  throw new Error('A vendor reference remained after inlining.');
}

const outName = 'Loan Debt Service Hub.html';
const outPath = path.join(root, outName);
fs.writeFileSync(outPath, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log('Wrote ' + outName + ' (' + kb + ' KB)');
