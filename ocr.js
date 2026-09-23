/* ocr.js — offline OCR for scanned / image-only PDF pages (2.9.6, H3).

   Two engines read each rendered page image; their outputs are reconciled into one reading so a
   line dropped by one engine is caught by the other. Engine A is tesseract.js (vendored under
   vendor/tesseract/). Engine B is registered separately (PaddleOCR); if it is unavailable the
   result degrades gracefully to engine A. Everything runs in the renderer, fully offline — no
   network, no API key. The reconcile() function is pure and unit-tested (test/ocr.test.js). */
(function (global) {
  'use strict';
  var VENDOR = './vendor/tesseract/';

  // ---------- reconciliation (pure) ----------
  function norm(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function toLines(s){ return String(s == null ? '' : s).split(/\r?\n/).map(function (x){ return x.replace(/\s+$/, ''); }).filter(function (x){ return x.trim() !== ''; }); }
  function sig(s){ return norm(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  var NUMISH = /[0-9$%]/;

  // Longest common subsequence over line signatures → the aligned backbone (lines both engines agree on).
  function lcs(a, b){
    var n = a.length, m = b.length, dp = [], i, j;
    for(i = 0; i <= n; i++){ dp.push(new Array(m + 1).fill(0)); }
    for(i = n - 1; i >= 0; i--) for(j = m - 1; j >= 0; j--) dp[i][j] = (a[i] === b[j]) ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
    var out = [], p = 0, q = 0;
    while(p < n && q < m){ if(a[p] === b[q]){ out.push([p, q]); p++; q++; } else if(dp[p+1][q] >= dp[p][q+1]) p++; else q++; }
    return out;
  }

  // Merge two OCR texts of the same page. Agreed lines are kept once; a run of lines present in
  // only ONE engine is kept (this is the dropped-line protection — it would take both engines to
  // drop the same line for it to vanish); a run where both diverge keeps the side with more
  // letters/digits, and if the two readings disagree on something numeric it is flagged inline so
  // a person sees it rather than silently trusting one engine.
  function reconcile(aText, bText){
    var A = toLines(aText), B = toLines(bText);
    if(!B.length) return A.join('\n');
    if(!A.length) return B.join('\n');
    var As = A.map(sig), Bs = B.map(sig);
    var anchors = lcs(As, Bs);
    var out = [], ai = 0, bi = 0;
    function flushRun(aRun, bRun){
      if(!aRun.length && !bRun.length) return;
      if(!aRun.length){ out.push.apply(out, bRun); return; }   // only B had these lines
      if(!bRun.length){ out.push.apply(out, aRun); return; }   // only A had these lines
      var aStr = aRun.join(' '), bStr = bRun.join(' ');
      var aC = aStr.replace(/[^a-z0-9]/gi, '').length, bC = bStr.replace(/[^a-z0-9]/gi, '').length;
      var chosen = aC >= bC ? aRun : bRun, chosenStr = aC >= bC ? aStr : bStr, otherStr = aC >= bC ? bStr : aStr;
      out.push.apply(out, chosen);
      if(NUMISH.test(chosenStr) && sig(chosenStr) !== sig(otherStr)) out.push('    [OCR: engines differ here — also read: "' + norm(otherStr).slice(0, 140) + '"]');
    }
    for(var t = 0; t < anchors.length; t++){
      var pa = anchors[t][0], pb = anchors[t][1];
      flushRun(A.slice(ai, pa), B.slice(bi, pb));
      out.push(A[pa]);
      ai = pa + 1; bi = pb + 1;
    }
    flushRun(A.slice(ai), B.slice(bi));
    return out.join('\n');
  }

  // ---------- tesseract engine (offline) ----------
  var tessWorker = null, tessBusy = null;
  async function tessEnsure(onProgress){
    if(tessWorker) return tessWorker;
    if(tessBusy) return tessBusy;
    tessBusy = (async function(){
      var T = global.Tesseract; if(!T) throw new Error('tesseract not loaded');
      var w = await T.createWorker('eng', 1, {
        workerPath: VENDOR + 'worker.min.js',
        corePath:   VENDOR + 'tesseract-core-simd-lstm.wasm.js',
        langPath:   VENDOR,
        gzip: false,
        logger: onProgress ? function (m){ try{ if(m && m.status === 'recognizing text') onProgress(m.progress); }catch(e){} } : undefined
      });
      await w.setParameters({ tessedit_pageseg_mode: '3', user_defined_dpi: '200' });
      tessWorker = w; return w;
    })();
    return tessBusy;
  }
  async function tessRecognize(image, onProgress){ var w = await tessEnsure(onProgress); var r = await w.recognize(image); return (r && r.data && r.data.text) || ''; }

  // ---------- second engine (registered externally, e.g. PaddleOCR) ----------
  // Shape: { recognize(image): Promise<string|null> }. recognize returns null when it can't run,
  // so a packaging/load failure of the heavier engine degrades to tesseract-only, never breaks OCR.
  var engineB = null;
  function registerEngine(e){ engineB = e; }
  function hasSecondEngine(){ return !!engineB; }
  async function engineBRecognize(image){ try{ if(!engineB) return null; return await engineB.recognize(image); }catch(e){ return null; } }

  // ---------- public ----------
  // Recognize one page image (a canvas or <img>) → merged text from whichever engines are available.
  async function recognizePage(image, opts){
    opts = opts || {};
    var a = '', b = null;
    try{ a = await tessRecognize(image, opts.onProgress); }catch(e){ a = ''; }
    try{ b = await engineBRecognize(image); }catch(e){ b = null; }
    if(b == null || !String(b).trim()) return a;
    if(!String(a).trim()) return b;
    return reconcile(a, b);
  }
  function available(){ return !!global.Tesseract; }

  var api = {
    recognizePage: recognizePage,
    reconcile: reconcile,
    tessEnsure: tessEnsure,
    registerEngine: registerEngine,
    hasSecondEngine: hasSecondEngine,
    available: available
  };
  global.LDS_OCR = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;   // node tests
})(typeof window !== 'undefined' ? window : this);
