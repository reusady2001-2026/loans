/* ============================================================================
   The in-app Guide (Settings → Guide → "Open the guide") — the operator, 2026-10-19: "a pop-up window … choose on
   what tab you need help, what screen, and in each screen what every single thing can do"; 2026-10-21: "more like a
   scroll guide, not an arrow one" — one scroll per chapter, the explanations beside each picture.
   Pick a chapter: it opens as one long page — every topic a heading, every step under it (its title and words, the
   picture of the real app with numbered markers, and beside it what each number does). The menu on the left jumps to
   a topic and follows you as you scroll; pictures load as they come into view; search jumps to a step; Esc closes.
   The pictures and the text come from guide/guide.json, which `node guide/capture.js` writes by driving the app with
   made-up data (guide/spec/*.js) — so the guide is retaken, not edited by hand, whenever a screen changes.
   ========================================================================== */
(function () {
  "use strict";
  var data = null, loading = null, st = { ch: null, topic: null, q: "" }, navTarget = null, spyRaf = 0, lit = null;
  var WIDE = 820;   // #guideMain at least this wide: the explanations sit beside the picture; narrower: under it
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(id){ return document.getElementById(id); }
  function load(){
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    loading = fetch("./guide/guide.json", { cache: "no-store" }).then(function (r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j){ data = j; return j; }).catch(function (e){ loading = null; throw e; });
    return loading;
  }
  function chapter(id){ return (data.chapters || []).filter(function (c){ return c.id === id; })[0] || null; }
  function sel(v){ return String(v).replace(/["\\]/g, "\\$&"); }

  function css(){
    if (el("guideViewerCss")) return;
    var s = document.createElement("style"); s.id = "guideViewerCss";
    s.textContent =
      "#guideMain .gstep-row{display:flex;flex-direction:column;gap:16px;margin-top:12px}" +
      "#guideMain.gwide .gstep-row{flex-direction:row;align-items:flex-start}" +
      "#guideMain.gwide .gstep-pic{flex:0 0 63%;max-width:63%}" +
      "#guideMain .gstep-pic{min-width:0}" +
      "#guideMain .gstep-list{flex:1 1 auto;min-width:0}" +
      "#guideMain [data-guideimg]{position:relative;max-width:100%;cursor:zoom-in;overflow:hidden;border-radius:8px;border:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(15,23,42,.06);background:#f8fafc}" +
      "#guideMain [data-guideimg] img{display:block;width:100%;height:100%}" +
      "#guideMain [data-guidebox]{position:absolute;border:2px solid rgba(245,158,11,.8);border-radius:6px;transition:background .12s,outline-color .12s}" +
      "#guideMain [data-guidemarks] li{transition:background .12s}" +
      "#guideMain [data-guidemarks] li.glit{background:#fef3c7}" +
      "#guideMain [data-guidestep].gflash{animation:gflash 1.8s ease-out}" +
      "@keyframes gflash{0%{background:rgba(245,158,11,.28)}100%{background:transparent}}" +
      "#guideNav button[data-guidetp][data-on='1']{background:#fff;font-weight:600;color:#3f6212;box-shadow:0 1px 2px rgba(15,23,42,.08)}";
    document.head.appendChild(s);
  }
  function modal(){
    var m = el("guideModal"); if (m) return m;
    css();
    m = document.createElement("div"); m.id = "guideModal";
    m.className = "fixed inset-0 z-[90] hidden items-center justify-center bg-slate-900/50 p-4";
    m.innerHTML = '<div id="guideBox" class="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style="width:92vw;max-width:none;height:90vh">' +
      '<div class="flex items-center gap-3 border-b border-slate-200 px-5 py-3"><div class="min-w-0 flex-1"><div class="text-[10px] font-bold uppercase tracking-wider text-brand-700">Guide</div>' +
        '<div id="guideCrumb" class="truncate text-base font-bold text-slate-900">How to use the app</div></div>' +
        '<input id="guideSearch" type="search" placeholder="Search the guide…" class="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" aria-label="Search the guide">' +
        '<button type="button" data-guideclose class="grid h-8 w-8 place-items-center rounded-lg text-xl text-slate-400 hover:bg-slate-100" aria-label="Close">&times;</button></div>' +
      '<div class="flex min-h-0 flex-1"><nav id="guideNav" class="shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/70 p-3" style="width:clamp(11rem,22vw,18rem)" aria-label="Guide contents"></nav>' +
        '<main id="guideMain" tabindex="-1" class="min-w-0 flex-1 overflow-y-auto px-6 py-5 outline-none" style="position:relative"></main></div></div>' +
      '<div id="guideZoom" class="fixed inset-0 z-[95] hidden cursor-zoom-out overflow-auto bg-slate-900/80 p-6"><img alt="" class="mx-auto max-w-none rounded-lg bg-white shadow-2xl"></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e){
      var t = e.target, c = function (s){ return t.closest ? t.closest(s) : null; };
      if (t === m || c("[data-guideclose]")){ close(); return; }
      var z = el("guideZoom"); if (c("#guideZoom")){ z.classList.add("hidden"); return; }
      var j = c("[data-guidejump]"); if (j){ jump(j.getAttribute("data-guidejump")); return; }
      var ch = c("[data-guidech]"); if (ch){ openChapter(ch.getAttribute("data-guidech")); return; }
      var tp = c("button[data-guidetp]"); if (tp){ var a = tp.getAttribute("data-guidetp").split("/"); if (a[0] !== st.ch) openChapter(a[0], a[1]); else toTopic(a[1], true); return; }
      if (c("[data-guidehome]")){ openChapter(null); return; }
      var img = c("[data-guideimg]"); if (img){ z.querySelector("img").src = img.getAttribute("data-guideimg"); z.classList.remove("hidden"); return; }
    });
    // point at a number (on the picture or in the list) or at a box: both light up, in that step only
    m.addEventListener("mouseover", function (e){
      var k = e.target.closest && e.target.closest("[data-guidemk],[data-guidebox]");
      hilite(k ? k.closest("[data-guidestep]") : null, k ? (k.getAttribute("data-guidemk") || k.getAttribute("data-guidebox")) : null);
    });
    m.addEventListener("input", function (e){ if (e.target && e.target.id === "guideSearch"){ st.q = e.target.value; render(); } });
    var main = el("guideMain");
    main.addEventListener("scroll", function (){ if (!spyRaf) spyRaf = requestAnimationFrame(function (){ spyRaf = 0; spy(); }); }, { passive: true });
    // a scroll of your own (wheel, keys, touch) takes over from a jump made from the menu
    ["wheel", "touchmove", "keydown"].forEach(function (ev){ main.addEventListener(ev, function (){ navTarget = null; }, { passive: true }); });
    window.addEventListener("resize", fit);
    document.addEventListener("keydown", function (e){
      var mm = el("guideModal"); if (!mm || mm.classList.contains("hidden")) return;
      if (e.key === "Escape"){ var z = el("guideZoom"); if (z && !z.classList.contains("hidden")) z.classList.add("hidden"); else close(); e.preventDefault(); }
    });
    return m;
  }
  function fit(){ var mn = el("guideMain"); if (mn) mn.classList.toggle("gwide", mn.clientWidth >= WIDE); }
  function hilite(stepEl, n){
    if (lit && (lit.step !== stepEl || lit.n !== n)){
      lit.step.querySelectorAll("[data-guidebox]").forEach(function (b){ b.style.outline = ""; b.style.background = ""; });
      lit.step.querySelectorAll("[data-guidemarks] li").forEach(function (li){ li.classList.remove("glit"); });
      lit = null;
    }
    if (!stepEl || !n) return;
    stepEl.querySelectorAll('[data-guidebox="' + sel(n) + '"]').forEach(function (b){ b.style.outline = "3px solid #f59e0b"; b.style.background = "rgba(245,158,11,.18)"; });
    stepEl.querySelectorAll('[data-guidemarks] li[data-guidemk="' + sel(n) + '"]').forEach(function (li){ li.classList.add("glit"); });
    lit = { step: stepEl, n: n };
  }
  function close(){ var m = el("guideModal"); if (m){ m.classList.add("hidden"); m.classList.remove("flex"); } }

  // where an element sits inside the scrolling page
  function topIn(main, x){ return x.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop; }
  function scrollToEl(x, smooth){ var mn = el("guideMain"); if (!mn || !x) return; mn.scrollTo({ top: Math.max(0, topIn(mn, x) - 12), behavior: smooth ? "smooth" : "auto" }); }
  function toTopic(id, smooth){
    var mn = el("guideMain"), h = mn && mn.querySelector('h3[data-guidetp="' + sel(st.ch + "/" + id) + '"]'); if (!h) return;
    navTarget = id; setTopic(id); scrollToEl(h.closest("section") || h, smooth);
  }
  // the topic you are reading: the last heading above a third of the way down the page (at the very end, the last one
  // in view); a topic picked in the menu stays lit while its heading is in view, even when the page can't scroll it up
  function spy(){
    var mn = el("guideMain"); if (!mn || !st.ch || st.q) return;
    var hs = mn.querySelectorAll("h3[data-guidetp]"); if (!hs.length) return;
    var top = mn.getBoundingClientRect().top, line = top + mn.clientHeight / 3, cur = null;
    if (navTarget){
      var t = mn.querySelector('h3[data-guidetp="' + sel(st.ch + "/" + navTarget) + '"]'), r = t && t.getBoundingClientRect();
      if (r && r.top >= top - 4 && r.top < top + mn.clientHeight){ setTopic(navTarget); return; }
      navTarget = null;
    }
    for (var i = 0; i < hs.length; i++){ if (hs[i].getBoundingClientRect().top <= line) cur = hs[i]; }
    if (mn.scrollTop + mn.clientHeight >= mn.scrollHeight - 2){
      for (var k = hs.length - 1; k >= 0; k--){ if (hs[k].getBoundingClientRect().top < top + mn.clientHeight){ cur = hs[k]; break; } }
    }
    setTopic((cur || hs[0]).getAttribute("data-guidetp").split("/")[1]);
  }
  function setTopic(id){
    if (st.topic === id) return;
    st.topic = id;
    var nav = el("guideNav"); if (nav) nav.querySelectorAll("button[data-guidetp]").forEach(function (b){
      var on = b.getAttribute("data-guidetp") === st.ch + "/" + id; b.setAttribute("data-on", on ? "1" : "0");
      if (on && b.scrollIntoView){ var r = b.getBoundingClientRect(), nr = nav.getBoundingClientRect(); if (r.top < nr.top || r.bottom > nr.bottom) b.scrollIntoView({ block: "nearest" }); }
    });
    crumb();
  }
  function crumb(){
    var cr = el("guideCrumb"); if (!cr) return;
    var c = st.ch ? chapter(st.ch) : null, t = c && (c.topics || []).filter(function (x){ return x.id === st.topic; })[0];
    cr.textContent = st.q && st.q.trim() ? "Search" : t ? c.title + " › " + t.title : c ? c.title : "How to use the app";
  }

  function navHtml(){
    return (data.chapters || []).map(function (c){
      var on = c.id === st.ch;
      return '<div class="mb-1"><button type="button" data-guidech="' + esc(c.id) + '" class="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] font-bold ' + (on ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-white') + '">' + esc(c.title) + '</button>' +
        (on ? '<div class="mt-0.5 space-y-0.5 pl-2">' + (c.topics || []).map(function (t){
          return '<button type="button" data-guidetp="' + esc(c.id + "/" + t.id) + '" data-on="' + (t.id === st.topic ? 1 : 0) + '" class="block w-full rounded-md px-2 py-1 text-left text-[12px] text-slate-600 hover:bg-white">' + esc(t.title) + '</button>'; }).join("") + '</div>' : '') + '</div>';
    }).join("");
  }
  function homeHtml(){
    return '<h2 class="text-xl font-bold text-slate-900">What do you need help with?</h2>' +
      '<p class="mt-1 max-w-3xl text-[13px] text-slate-600">' + esc(data.intro || "") + '</p>' +
      '<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">' + (data.chapters || []).map(function (c){
        var n = 0; (c.topics || []).forEach(function (t){ n += t.steps.length; });
        return '<button type="button" data-guidech="' + esc(c.id) + '" class="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-400 hover:shadow">' +
          (c.cover ? '<img src="./guide/' + esc(c.cover) + '" alt="" loading="lazy" decoding="async" class="mb-3 h-28 w-full rounded-md border border-slate-100 object-cover object-top">' : '') +
          '<div class="text-[15px] font-bold text-slate-900">' + esc(c.title) + '</div><div class="mt-0.5 text-[12px] text-slate-600">' + esc(c.intro || "") + '</div>' +
          '<div class="mt-2 text-[11px] font-semibold text-brand-700">' + (c.topics || []).length + ' topics · ' + n + ' steps</div></button>'; }).join("") + '</div>' +
      (data.note ? '<p class="mt-5 text-[11px] text-slate-400">' + esc(data.note) + '</p>' : '');
  }
  function stepHtml(c, t, s, i){
    var img = './guide/' + s.img, w = s.w || 1200, h = s.h || 800, marks = s.marks || [];
    var boxes = marks.map(function (m, k){
      var n = String(k + 1);
      return '<div data-guidebox="' + n + '" style="left:' + m.x + '%;top:' + m.y + '%;width:' + m.w + '%;height:' + m.h + '%"></div>' +
        '<div data-guidemk="' + n + '" class="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-500 text-[11px] font-extrabold text-white shadow ring-2 ring-white" style="left:' + Math.max(1.2, m.x) + '%;top:' + Math.max(1.8, m.y) + '%">' + n + '</div>';
    }).join("");
    // the picture never grows past its own size, nor past three quarters of the window's height
    var size = 'width:min(100%, ' + w + 'px, calc(75vh * ' + (w / h).toFixed(4) + '));aspect-ratio:' + w + ' / ' + h;
    return '<article data-guidestep="' + esc(c.id + "/" + t.id + "/" + i) + '" class="rounded-xl px-1 py-4' + (i ? ' border-t border-slate-100' : '') + '">' +
      '<h4 class="text-[15px] font-bold text-slate-900">' + esc(s.title) + '</h4>' +
      (s.text ? '<p class="mt-1 max-w-4xl text-[13px] leading-relaxed text-slate-700" data-guidetext>' + esc(s.text) + '</p>' : '') +
      '<div class="gstep-row"><div class="gstep-pic"><div data-guideimg="' + esc(img) + '" title="Click to see it full size" style="' + size + '">' +
        '<img src="' + esc(img) + '" alt="' + esc(s.title) + '" width="' + w + '" height="' + h + '" loading="lazy" decoding="async">' + boxes + '</div></div>' +
      (marks.length ? '<ol class="gstep-list space-y-1.5" data-guidemarks>' + marks.map(function (m, k){
          return '<li data-guidemk="' + (k + 1) + '" class="flex gap-2 rounded-lg px-2 py-1 text-[13px] leading-snug text-slate-700 hover:bg-amber-50"><span class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white">' + (k + 1) + '</span><span>' +
            (m.label ? '<b class="text-slate-900">' + esc(m.label) + '</b> &mdash; ' : '') + esc(m.text) + '</span></li>'; }).join("") + '</ol>' : '<div class="gstep-list"></div>') +
      '</div></article>';
  }
  function chapterHtml(c){
    var n = 0; (c.topics || []).forEach(function (t){ n += t.steps.length; });
    return '<div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-xl font-bold text-slate-900">' + esc(c.title) + '</h2>' +
        '<button type="button" data-guidehome class="text-[12px] font-semibold text-brand-700 hover:underline">All chapters</button></div>' +
      '<p class="mt-1 max-w-3xl text-[13px] text-slate-600">' + esc(c.intro || "") + '</p>' +
      '<p class="mt-1 text-[11px] font-semibold text-slate-400">' + (c.topics || []).length + ' topics · ' + n + ' steps — scroll down, or pick a topic on the left</p>' +
      (c.topics || []).map(function (t, i){
        return '<section class="mt-6">' +
          '<div class="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">' +
            '<span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-[12px] font-bold text-white">' + (i + 1) + '</span>' +
            '<div class="min-w-0"><h3 data-guidetp="' + esc(c.id + "/" + t.id) + '" class="text-[17px] font-bold text-slate-900">' + esc(t.title) + '</h3>' +
            (t.intro ? '<p class="mt-0.5 text-[13px] text-slate-600">' + esc(t.intro) + '</p>' : '') + '</div></div>' +
          t.steps.map(function (s, k){ return stepHtml(c, t, s, k); }).join("") + '</section>';
      }).join("") +
      '<p class="mt-8 border-t border-slate-200 pt-4 text-center text-[12px] text-slate-400">End of “' + esc(c.title) + '”.</p>';
  }
  function searchHtml(q){
    var w = q.toLowerCase().split(/\s+/).filter(Boolean), hits = [];
    (data.chapters || []).forEach(function (c){ (c.topics || []).forEach(function (t){ t.steps.forEach(function (s, i){
      var hay = [c.title, t.title, s.title, s.text].concat((s.marks || []).map(function (m){ return (m.label || "") + " " + m.text; })).join(" ").toLowerCase();
      if (w.every(function (x){ return hay.indexOf(x) >= 0; })) hits.push({ c: c, t: t, s: s, i: i });
    }); }); });
    return '<h2 class="text-lg font-bold text-slate-900">' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + esc(q) + '”</h2><div class="mt-3 space-y-1.5">' +
      hits.slice(0, 80).map(function (h){ return '<button type="button" data-guidejump="' + esc(h.c.id + "/" + h.t.id + "/" + h.i) + '" class="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-brand-400">' +
        '<span class="block text-[11px] text-slate-400">' + esc(h.c.title) + ' › ' + esc(h.t.title) + '</span><span class="block text-[13px] font-semibold text-slate-800">' + esc(h.s.title) + '</span></button>'; }).join("") + '</div>';
  }
  function render(){
    var nav = el("guideNav"), main = el("guideMain"); if (!nav || !main || !data) return;
    lit = null;
    nav.innerHTML = navHtml();
    var c = st.ch ? chapter(st.ch) : null;
    if (st.q && st.q.trim()){ main.innerHTML = searchHtml(st.q.trim()); main.scrollTop = 0; }   // results open at their heading
    else main.innerHTML = c ? chapterHtml(c) : homeHtml();
    fit(); crumb();
  }
  // a chapter's page, at its top (or at one of its topics)
  function openChapter(ch, tp){
    st.ch = ch && chapter(ch) ? ch : null; st.topic = null; st.q = ""; navTarget = null;
    var s = el("guideSearch"); if (s) s.value = "";
    render();
    var mn = el("guideMain"); if (!mn) return;
    mn.scrollTop = 0;
    if (st.ch){ var c = chapter(st.ch); setTopic(c.topics && c.topics[0] ? c.topics[0].id : null); try { mn.focus({ preventScroll: true }); } catch (e) {} }
    if (st.ch && tp) toTopic(tp, false);
  }
  // a search result: its chapter's page, scrolled to the step, which lights up for a moment
  function jump(key){
    var a = String(key).split("/"); openChapter(a[0]);
    var mn = el("guideMain"), x = mn && mn.querySelector('[data-guidestep="' + sel(key) + '"]'); if (!x) return;
    navTarget = a[1]; setTopic(a[1]); scrollToEl(x, false);
    x.classList.remove("gflash"); void x.offsetWidth; x.classList.add("gflash");
    setTimeout(function (){ x.classList.remove("gflash"); }, 2000);
  }

  function open(ch, tp){
    var m = modal(); m.classList.remove("hidden"); m.classList.add("flex");
    var main = el("guideMain"); if (!data && main) main.innerHTML = '<p class="text-sm text-slate-500">Loading the guide…</p>';
    return load().then(function (){ openChapter(ch || null, tp || null); }).catch(function (e){ if (main) main.innerHTML = '<p class="text-sm text-rose-700">The guide could not be loaded (' + esc(e && e.message) + ').</p>'; });
  }
  window.LDS_Guide = { open: open, close: close, state: function (){ return { chapter: st.ch, topic: st.topic }; }, data: function (){ return data; } };
})();
