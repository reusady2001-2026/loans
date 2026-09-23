/* paddle-engine.js — PaddleOCR (ONNX, in the renderer) as the SECOND OCR engine (2.9.6, H3).

   Registers itself with LDS_OCR (from ocr.js). It reconciles against tesseract to catch dropped
   lines. Design points that keep it safe:
     • Lazy — the ~10 MB SDK bundle is injected only the first time a scan actually needs OCR, so
       app startup pays nothing.
     • Fully offline — local models (vendor/paddleocr/models/*.tar) and local ONNX Runtime wasm
       (vendor/paddleocr/ort/), single-threaded (no SharedArrayBuffer / COOP-COEP requirement).
     • Fail-soft — ANY load or init error resolves to null, so OCR silently falls back to
       tesseract. This engine can never break the reader; at worst it's absent.

   Note: the packaged offline load (wasm paths, model tar parsing, SAB availability in Electron)
   can only be fully verified on a real build. Until then it degrades to tesseract-only. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.LDS_OCR || typeof window.LDS_OCR.registerEngine !== 'function') return;

  var BASE = './vendor/paddleocr/';
  var inst = null, busy = null, failed = false;

  function loadBundle() {
    if (window.PaddleOCRSDK) return Promise.resolve(window.PaddleOCRSDK);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BASE + 'paddleocr.iife.js';
      s.async = true;
      s.onload = function () { resolve(window.PaddleOCRSDK); };
      s.onerror = function () { reject(new Error('failed to load paddleocr bundle')); };
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (failed) return Promise.resolve(null);
    if (inst) return Promise.resolve(inst);
    if (busy) return busy;
    busy = (async function () {
      try {
        var SDK = await loadBundle();
        var PaddleOCR = SDK && (SDK.PaddleOCR || (SDK.default && SDK.default.PaddleOCR));
        if (!PaddleOCR) throw new Error('PaddleOCR SDK export not found');
        inst = await PaddleOCR.create({
          textDetectionModelName: 'PP-OCRv5_mobile_det',
          textDetectionModelAsset: { url: BASE + 'models/PP-OCRv5_mobile_det.tar' },
          textRecognitionModelName: 'PP-OCRv5_mobile_rec',
          textRecognitionModelAsset: { url: BASE + 'models/PP-OCRv5_mobile_rec.tar' },
          ortOptions: { backend: 'wasm', wasmPaths: BASE + 'ort/', numThreads: 1 }
        });
        return inst;
      } catch (e) {
        failed = true;
        try { console.warn('PaddleOCR engine unavailable — OCR will use tesseract only:', e && e.message ? e.message : e); } catch (_) {}
        return null;
      }
    })();
    return busy;
  }

  function toText(results) {
    try {
      var r = Array.isArray(results) ? results[0] : results;
      var items = (r && (r.items || r.recTexts || r.rec_texts)) || [];
      return items.map(function (it) {
        if (typeof it === 'string') return it;
        return (it && (it.text != null ? it.text : (it.rec_text != null ? it.rec_text : ''))) || '';
      }).filter(function (s) { return s && String(s).trim(); }).join('\n');
    } catch (e) { return ''; }
  }

  window.LDS_OCR.registerEngine({
    recognize: async function (canvas) {
      var p = await ensure();
      if (!p) return null;
      try {
        var blob = await new Promise(function (res) { try { if (canvas && canvas.toBlob) canvas.toBlob(res, 'image/png'); else res(null); } catch (e) { res(null); } });
        var out = await p.predict(blob || canvas);
        return toText(out);
      } catch (e) { return null; }
    }
  });
})();
