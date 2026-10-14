/* Reads values straight out of the app (index.html) so tests never keep their own copy of them —
   when the app's value changes, the tests follow it instead of passing on a stale copy (#251). */
const fs = require('fs'), path = require('path');
const HTML = path.join(__dirname, '..', 'index.html');
// The object literal that follows `marker` inside the function `fnName` in index.html.
function literalAfter(fnName, marker){
  const src = fs.readFileSync(HTML, 'utf8');
  const f = src.indexOf('function ' + fnName + '(');
  if (f < 0) throw new Error('app-values: function ' + fnName + ' not found in index.html');
  const m = src.indexOf(marker, f);
  if (m < 0) throw new Error('app-values: "' + marker + '" not found in ' + fnName);
  let i = src.indexOf('{', m), depth = 0, j = i;
  for (; j < src.length; j++){ const ch = src[j]; if (ch === '{') depth++; else if (ch === '}' && --depth === 0) break; }
  const text = src.slice(i, j + 1).replace(/\/\/[^\n]*/g, '');
  return new Function('return (' + text + ');')();
}
// The app's default underwriting assumptions: uwDefaults().bench in index.html.
function appBench(){ return literalAfter('uwDefaults', 'bench:'); }
function pick(o, keys){ const r = {}; keys.forEach((k) => { r[k] = o[k]; }); return r; }
module.exports = { literalAfter, appBench, pick };
