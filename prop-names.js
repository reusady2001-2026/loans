/* ============================================================================
   Property names (2.9.9) - a property is often called something else in its
   files: "40 N Euclid Ave" is "The Euclid" in Yardi, and both its T12 sheet
   ("12 Month Statement-15169") and its rent-roll section ("The Euclid(15169)")
   carry the Yardi code 15169. Matching a file to a property by the app's name
   alone misses that, so every match uses ALL the names a property goes by:
   its name, its loans' property names, the "Other names in files" kept on its
   profile, and its Yardi code(s).

   Pure and dependency-free. Unit-testable on its own.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PropNames = api;
  if (typeof globalThis !== "undefined") globalThis.PropNames = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[\s–—\-_/()]+/g, " ").replace(/&/g, "and").trim(); }

  // A Yardi-style code at the END of a name: "The Euclid(15169)", "12 Month Statement-15169", "York House #1222".
  // 3–7 digits; a 4-digit year (1900–2099) is never a code.
  function codesIn(s) {
    var out = [], str = String(s == null ? "" : s).trim(), m;
    var re = /(?:\(\s*|[-–#]\s*)(\d{3,7})\s*\)?\s*$/;
    if ((m = str.match(re))) out.push(m[1]);
    out = out.filter(function (c) { return !(c.length === 4 && /^(19|20)\d\d$/.test(c)); });
    return out;
  }
  // The name without its trailing code: "The Euclid(15169)" → "The Euclid".
  function baseName(s) {
    var str = String(s == null ? "" : s).trim();
    var b = str.replace(/\s*(?:\(\s*\d{3,7}\s*\)|[-–#]\s*\d{3,7})\s*$/, "").trim();
    return b || str;
  }
  // "The Euclid, 15169; Euclid Lofts" → ["The Euclid", "15169", "Euclid Lofts"]
  function splitNames(str) {
    return String(str == null ? "" : str).split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  // Add a name to a comma-separated list (once, whatever its case or spacing).
  function addName(str, name) {
    var list = splitNames(str), n = String(name == null ? "" : name).trim();
    if (!n) return list.join(", ");
    if (!list.some(function (x) { return norm(x) === norm(n); })) list.push(n);
    return list.join(", ");
  }

  // How well two names agree: 1 exact, 0.85 one inside the other (4+ letters), 0.6 two shared words, 0.25 one.
  function score(a, b) {
    a = norm(a); b = norm(b); if (!a || !b) return 0;
    if (a === b) return 1;
    if (Math.min(a.length, b.length) >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return 0.85;
    var at = a.split(" ").filter(function (t) { return t.length > 2; }), bt = b.split(" ").filter(function (t) { return t.length > 2; });
    var common = at.filter(function (t) { return bt.indexOf(t) >= 0; }).length;
    return common >= 2 ? 0.6 : (common === 1 ? 0.25 : 0);
  }

  // How well a name found in a file fits a property that goes by `names` and `codes`.
  // The same code on both sides is a certain match (1); otherwise the best name score, with and without the code.
  function matchScore(fileName, names, codes) {
    var fc = codesIn(fileName), cs = (codes || []).map(function (c) { return String(c).replace(/\D+/g, ""); }).filter(Boolean);
    if (fc.length && fc.some(function (c) { return cs.indexOf(c) >= 0; })) return 1;
    var best = 0, fb = baseName(fileName);
    (names || []).forEach(function (n) {
      if (!n) return;
      var s = Math.max(score(fileName, n), score(fb, n), score(fileName, baseName(n)), score(fb, baseName(n)));
      if (s > best) best = s;
    });
    return best;
  }

  return { norm: norm, codesIn: codesIn, baseName: baseName, splitNames: splitNames, addName: addName, score: score, matchScore: matchScore };
});
