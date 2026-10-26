/* ============================================================================
   The in-app Guide (Settings → Guide → "Open the guide").
   (2026-10-26, the operator) Laid out like the Claude Code docs: the pages in groups on the left, a search at the top,
   the page in the middle and "On this page" on the right. A page is a how-to (one task: what it's for, what you need
   first, numbered steps with a picture only where the screen changes and numbered markers only where a step needs
   them, notes and tips, next steps), a reference page (what every control on a screen does, picture by picture), or
   the Overview. Previous / Next at the foot of every page follow the menu's order; Esc closes.
   The pages come from guide/guide.json, which `node guide/capture.js` writes by driving the app with made-up data
   (guide/spec/*.js) — so the guide is retaken, not edited by hand, whenever a screen changes.
   ========================================================================== */
(function () {
  "use strict";
  var data = null, loading = null, st = { page: null, section: null, q: "" }, navTarget = null, spyRaf = 0, lit = null;
  // (2026-10-26, the operator: "the guide pictures look small" — they showed at 47–68% of their size) the pictures get
  // the room: the page's whole column, up to 85% of the window's height; the numbered list goes beside a picture only
  // when the column is wide enough to keep the picture big; "On this page" sits on the right only on a wide window,
  // and above the page otherwise
  var BESIDE = 1500;   // the page's column at least this wide: a picture's numbered list sits beside it; narrower: under it
  var TOC = 1300;      // the scrolling area at least this wide: "On this page" on the right; narrower: a row above the page
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(id){ return document.getElementById(id); }
  function sel(v){ return String(v).replace(/["\\]/g, "\\$&"); }
  function load(){
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    loading = fetch("./guide/guide.json", { cache: "no-store" }).then(function (r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j){ data = j; return j; }).catch(function (e){ loading = null; throw e; });
    return loading;
  }
  function pages(){ return (data && data.pages) || []; }
  function pageOf(id){ return pages().filter(function (p){ return p.id === id; })[0] || null; }
  function groupOf(id){ return ((data && data.groups) || []).filter(function (g){ return g.pages.indexOf(id) >= 0; })[0] || null; }
  // words: **bold**, [words](page) or [words](page#section) — escaped first, so nothing else in a text becomes markup
  function rich(s){
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
      .replace(/\[([^\]]+)\]\(([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/g, function (m, t, p, a){
        var ok = !!pageOf(p);
        return ok ? '<a href="#" data-guidelink="' + p + (a ? "#" + a : "") + '" class="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600">' + t + '</a>' : t; });
  }

  function css(){
    if (el("guideViewerCss")) return;
    var s = document.createElement("style"); s.id = "guideViewerCss";
    s.textContent =
      "#guideMain .gpic-row{display:flex;flex-direction:column;gap:14px;margin-top:12px}" +
      "#guideMain.gbeside .gpic-row.gmany{flex-direction:row;align-items:flex-start}" +
      "#guideMain.gbeside .gpic-row.gmany .gpic{flex:0 0 72%;max-width:72%}" +
      "#guideMain .gpic{min-width:0}" +
      "#guideMain .gpic-list{flex:1 1 auto;min-width:0}" +
      "#guideMain [data-guideimg]{position:relative;max-width:100%;cursor:zoom-in;overflow:hidden;border-radius:10px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.08);background:#f8fafc}" +
      "#guideMain [data-guideimg] img{display:block;width:100%;height:100%}" +
      "#guideMain [data-guidebox]{position:absolute;border:2px solid rgba(245,158,11,.85);border-radius:6px;transition:background .12s,outline-color .12s}" +
      "#guideMain [data-guidemarks] li{transition:background .12s}" +
      "#guideMain [data-guidemarks] li.glit{background:#fef3c7}" +
      "#guideMain .gflash{animation:gflash 1.8s ease-out}" +
      "@keyframes gflash{0%{background:rgba(245,158,11,.25)}100%{background:transparent}}" +
      "#guideMain ol.gsteps{counter-reset:gstep;list-style:none;margin:0;padding:0}" +
      "#guideMain ol.gsteps>li{position:relative;padding:0 0 22px 44px}" +
      "#guideMain ol.gsteps>li::before{counter-increment:gstep;content:counter(gstep);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:9999px;background:#f1f5f9;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;font-size:13px;display:grid;place-items:center}" +
      "#guideMain ol.gsteps>li::after{content:'';position:absolute;left:14px;top:32px;bottom:4px;width:1px;background:#e2e8f0}" +
      "#guideMain ol.gsteps>li:last-child::after{display:none}" +
      "#guideMain ol.gsteps>li:last-child{padding-bottom:4px}" +
      "#guideNav [data-guidepage][data-on='1']{color:#3f6212;font-weight:600;background:#f4fae8;border-left-color:#639420}" +
      "#guideToc [data-guidetoc][data-on='1']{color:#3f6212;font-weight:600;border-left-color:#639420}" +
      "#guideMain [data-guidetocrow] [data-guidetoc][data-on='1']{color:#3f6212;font-weight:600;background:#f4fae8}" +
      "#guideMain table.gtable td,#guideMain table.gtable th{border-bottom:1px solid #e2e8f0;padding:8px 12px;text-align:left;vertical-align:top}";
    document.head.appendChild(s);
  }
  var ICON = {
    note: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    tip: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>'
  };
  var TONE = { note: "border-sky-200 bg-sky-50 text-sky-900", tip: "border-brand-200 bg-brand-50 text-brand-900", warning: "border-amber-200 bg-amber-50 text-amber-900" };
  var WORD = { note: "Note", tip: "Tip", warning: "Warning" };
  function calloutsHtml(list){
    return (list || []).map(function (c){ var k = TONE[c.kind] ? c.kind : "note";
      return '<div data-guidecallout="' + k + '" class="mt-4 flex gap-3 rounded-xl border px-4 py-3 text-[14px] leading-relaxed ' + TONE[k] + '"><span class="mt-0.5 shrink-0">' + ICON[k] + '</span><div class="min-w-0"><span class="sr-only">' + WORD[k] + ': </span>' + rich(c.text) + '</div></div>'; }).join("");
  }

  function modal(){
    var m = el("guideModal"); if (m) return m;
    css();
    m = document.createElement("div"); m.id = "guideModal";
    m.className = "fixed inset-0 z-[90] hidden items-center justify-center bg-slate-900/50 p-4";
    m.innerHTML = '<div id="guideBox" class="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style="width:96vw;max-width:none;height:94vh">' +
      '<div class="flex items-center gap-4 border-b border-slate-200 px-5 py-3">' +
        '<button type="button" data-guidepage="overview" class="flex min-w-0 items-center gap-2 text-left"><span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-[13px] font-extrabold text-white">?</span><span class="min-w-0"><span class="block text-[10px] font-bold uppercase tracking-wider text-brand-700">Guide</span><span class="block truncate text-[14px] font-bold text-slate-900">Loan Debt Service Hub</span></span></button>' +
        '<div class="relative ml-auto w-full max-w-md"><svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input id="guideSearch" type="search" placeholder="Search the guide…" class="w-full rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-14 text-sm outline-none focus:border-brand-500 focus:bg-white" aria-label="Search the guide">' +
          '<kbd class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-400">Ctrl K</kbd></div>' +
        '<button type="button" data-guideclose class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xl text-slate-400 hover:bg-slate-100" aria-label="Close">&times;</button></div>' +
      '<div class="flex min-h-0 flex-1"><nav id="guideNav" class="shrink-0 overflow-y-auto border-r border-slate-200 px-3 py-4" style="width:clamp(11rem,16vw,15rem)" aria-label="Guide pages"></nav>' +
        '<main id="guideMain" tabindex="-1" class="min-w-0 flex-1 overflow-y-auto outline-none" style="position:relative"></main></div></div>' +
      '<div id="guideZoom" class="fixed inset-0 z-[95] hidden cursor-zoom-out overflow-auto bg-slate-900/80 p-6"><img alt="" class="mx-auto max-w-none rounded-lg bg-white shadow-2xl"></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e){
      var t = e.target, c = function (s){ return t.closest ? t.closest(s) : null; };
      if (t === m || c("[data-guideclose]")){ close(); return; }
      var z = el("guideZoom"); if (c("#guideZoom")){ z.classList.add("hidden"); return; }
      var j = c("[data-guidejump]"); if (j){ e.preventDefault(); jump(j.getAttribute("data-guidejump")); return; }
      var lk = c("[data-guidelink]"); if (lk){ e.preventDefault(); var a = lk.getAttribute("data-guidelink").split("#"); openPage(a[0], a[1] || null); return; }
      var tc = c("[data-guidetoc]"); if (tc){ toSection(tc.getAttribute("data-guidetoc"), true); return; }
      var pg = c("[data-guidepage]"); if (pg){ openPage(pg.getAttribute("data-guidepage")); return; }
      var img = c("[data-guideimg]"); if (img){ z.querySelector("img").src = img.getAttribute("data-guideimg"); z.classList.remove("hidden"); return; }
    });
    // point at a number (on the picture or in its list) or at a box: both light up, in that picture only
    m.addEventListener("mouseover", function (e){
      var k = e.target.closest && e.target.closest("[data-guidemk],[data-guidebox]");
      hilite(k ? k.closest("[data-guidestep]") : null, k ? (k.getAttribute("data-guidemk") || k.getAttribute("data-guidebox")) : null);
    });
    m.addEventListener("input", function (e){ if (e.target && e.target.id === "guideSearch"){ st.q = e.target.value; render(); } });
    m.addEventListener("keydown", function (e){
      if (e.target && e.target.id === "guideSearch" && e.key === "Enter"){ var f = el("guideMain").querySelector("[data-guidejump]"); if (f){ e.preventDefault(); jump(f.getAttribute("data-guidejump")); } }
    });
    var main = el("guideMain");
    main.addEventListener("scroll", function (){ if (!spyRaf) spyRaf = requestAnimationFrame(function (){ spyRaf = 0; spy(); }); }, { passive: true });
    // a scroll of your own (wheel, keys, touch) takes over from a jump made from "On this page"
    ["wheel", "touchmove", "keydown"].forEach(function (ev){ main.addEventListener(ev, function (){ navTarget = null; }, { passive: true }); });
    window.addEventListener("resize", fit);
    document.addEventListener("keydown", function (e){
      var mm = el("guideModal"); if (!mm || mm.classList.contains("hidden")) return;
      if (e.key === "Escape"){ var z = el("guideZoom"); if (z && !z.classList.contains("hidden")) z.classList.add("hidden"); else close(); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")){ var s = el("guideSearch"); if (s){ s.focus(); s.select(); } e.preventDefault(); }
    });
    return m;
  }
  function fit(){
    var mn = el("guideMain"); if (!mn) return;
    var wide = mn.clientWidth >= TOC, toc = el("guideToc"), row = mn.querySelector("[data-guidetocrow]");
    if (toc) toc.style.display = wide ? "" : "none";
    if (row) row.style.display = wide ? "none" : "";
    var col = mn.querySelector("[data-guidecol]"); mn.classList.toggle("gbeside", !!col && col.clientWidth >= BESIDE);
  }
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
  function scrollToEl(x, smooth){ var mn = el("guideMain"); if (!mn || !x) return; mn.scrollTo({ top: Math.max(0, topIn(mn, x) - 16), behavior: smooth ? "smooth" : "auto" }); }
  function toSection(id, smooth){
    var mn = el("guideMain"), h = mn && mn.querySelector('h2[data-guidesec="' + sel(id) + '"]'); if (!h) return;
    navTarget = id; setSection(id); scrollToEl(h, smooth);
  }
  // the section you are reading: the last heading above a third of the way down (at the very end, the last one in
  // view); one picked in "On this page" stays lit while its heading is in view, even when the page can't scroll it up
  function spy(){
    var mn = el("guideMain"); if (!mn || !st.page || st.q) return;
    var hs = mn.querySelectorAll("h2[data-guidesec]"); if (!hs.length) return;
    var top = mn.getBoundingClientRect().top, line = top + mn.clientHeight / 3, cur = null;
    if (navTarget){
      var t = mn.querySelector('h2[data-guidesec="' + sel(navTarget) + '"]'), r = t && t.getBoundingClientRect();
      if (r && r.top >= top - 4 && r.top < top + mn.clientHeight){ setSection(navTarget); return; }
      navTarget = null;
    }
    for (var i = 0; i < hs.length; i++){ if (hs[i].getBoundingClientRect().top <= line) cur = hs[i]; }
    if (mn.scrollTop + mn.clientHeight >= mn.scrollHeight - 2){
      for (var k = hs.length - 1; k >= 0; k--){ if (hs[k].getBoundingClientRect().top < top + mn.clientHeight){ cur = hs[k]; break; } }
    }
    setSection((cur || hs[0]).getAttribute("data-guidesec"));
  }
  function setSection(id){
    if (st.section === id) return;
    st.section = id;
    var mn = el("guideMain"); if (mn) mn.querySelectorAll("[data-guidetoc]").forEach(function (b){ b.setAttribute("data-on", b.getAttribute("data-guidetoc") === id ? "1" : "0"); });   // on the right, or in the row above the page
  }

  function navHtml(){
    return ((data && data.groups) || []).map(function (g){
      return '<div class="mb-5"><div class="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">' + esc(g.title) + '</div>' +
        g.pages.map(function (id){ var p = pageOf(id); if (!p) return "";
          return '<button type="button" data-guidepage="' + esc(id) + '" data-on="' + (id === st.page ? 1 : 0) + '" class="block w-full border-l-2 border-transparent px-3 py-1 text-left text-[13px] leading-snug text-slate-600 hover:text-slate-900">' + esc(p.title) + '</button>'; }).join("") + '</div>';
    }).join("");
  }
  // a picture of the app: numbered boxes on it when its step needs them, and what each number is under (or beside) it
  function picHtml(x, key){
    if (!x.img) return "";
    var img = './guide/' + x.img, w = x.w || 1200, h = x.h || 800, marks = x.marks || [];
    var boxes = marks.map(function (m, k){
      var n = String(k + 1);
      return '<div data-guidebox="' + n + '" style="left:' + m.x + '%;top:' + m.y + '%;width:' + m.w + '%;height:' + m.h + '%"></div>' +
        '<div data-guidemk="' + n + '" class="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-500 text-[11px] font-extrabold text-white shadow ring-2 ring-white" style="left:' + Math.max(1.2, m.x) + '%;top:' + Math.max(1.8, m.y) + '%">' + n + '</div>';
    }).join("");
    // the picture never grows past its own size, nor past three quarters of the window's height
    var size = 'width:min(100%, ' + w + 'px, calc(85vh * ' + (w / h).toFixed(4) + '));aspect-ratio:' + w + ' / ' + h;
    return '<div class="gpic-row' + (marks.length > 3 ? ' gmany' : '') + '"><div class="gpic"><div data-guideimg="' + esc(img) + '" title="Click to see it full size" style="' + size + '">' +
        '<img src="' + esc(img) + '" alt="' + esc(x.title || x.text || "") + '" width="' + w + '" height="' + h + '" loading="lazy" decoding="async">' + boxes + '</div></div>' +
      (marks.length ? '<ol class="gpic-list space-y-1" data-guidemarks>' + marks.map(function (m, k){
          return '<li data-guidemk="' + (k + 1) + '" class="flex gap-2 rounded-lg px-2 py-1 text-[13px] leading-snug text-slate-700 hover:bg-amber-50"><span class="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white">' + (k + 1) + '</span><span>' +
            (m.label ? '<b class="text-slate-900">' + esc(m.label) + '</b> — ' : '') + rich(m.text) + '</span></li>'; }).join("") + '</ol>' : '') + '</div>';
  }
  function sectionHtml(p, s, si){
    var out = '<section class="mt-10"><h2 data-guidesec="' + esc(s.id) + '" class="scroll-mt-4 text-[20px] font-bold tracking-tight text-slate-900">' + esc(s.title) + '</h2>';
    if (s.text) out += '<p class="mt-2 max-w-[46rem] text-[15px] leading-relaxed text-slate-700">' + rich(s.text) + '</p>';
    if (s.steps && s.steps.length) out += '<ol class="gsteps mt-5">' + s.steps.map(function (x, i){
        var key = p.id + "/" + si + "/s" + i;
        return '<li data-guidestep="' + esc(key) + '" class="rounded-lg"><div class="max-w-[46rem] pt-0.5 text-[15px] leading-relaxed text-slate-700" data-guidetext>' + rich(x.text) + '</div>' + picHtml(x, key) + calloutsHtml(x.callouts) + '</li>'; }).join("") + '</ol>';
    (s.views || []).forEach(function (x, i){
      var key = p.id + "/" + si + "/v" + i;
      out += '<div data-guidestep="' + esc(key) + '" class="mt-6 rounded-lg">' + (x.title ? '<h3 class="text-[16px] font-semibold text-slate-900">' + esc(x.title) + '</h3>' : '') +
        (x.text ? '<p class="mt-1.5 max-w-[46rem] text-[15px] leading-relaxed text-slate-700" data-guidetext>' + rich(x.text) + '</p>' : '') + picHtml(x, key) + calloutsHtml(x.callouts) + '</div>';
    });
    if (s.cards && s.cards.length) out += '<div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">' + s.cards.map(function (c){
        return '<button type="button" data-guidelink="' + esc(c.page + (c.anchor ? "#" + c.anchor : "")) + '" class="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-400 hover:shadow-sm">' +
          '<div class="text-[15px] font-semibold text-slate-900 group-hover:text-brand-800">' + esc(c.title) + '</div><div class="mt-1 text-[13px] leading-relaxed text-slate-600">' + esc(c.text) + '</div></button>'; }).join("") + '</div>';
    if (s.table) out += '<div class="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table class="gtable w-full text-[14px]"><thead class="bg-slate-50 text-[12px] uppercase tracking-wide text-slate-500"><tr>' + s.table.head.map(function (h){ return '<th class="font-semibold">' + esc(h) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        s.table.rows.map(function (r){ var t = pageOf(r[1]); return '<tr><td class="text-slate-800">' + esc(r[0]) + '</td><td>' + (t ? '<a href="#" data-guidelink="' + esc(r[1]) + '" class="font-medium text-brand-700 hover:underline">' + esc(t.title) + '</a>' : esc(r[1])) + '</td></tr>'; }).join("") + '</tbody></table></div>';
    out += calloutsHtml(s.callouts);
    return out + '</section>';
  }
  function pageHtml(p){
    var g = groupOf(p.id), order = []; ((data && data.groups) || []).forEach(function (x){ x.pages.forEach(function (id){ order.push(id); }); });
    var i = order.indexOf(p.id), prev = i > 0 ? pageOf(order[i - 1]) : null, next = i >= 0 && i < order.length - 1 ? pageOf(order[i + 1]) : null;
    var toc = [];
    if (p.before && p.before.length) toc.push({ id: "before-you-start", title: "Before you start" });
    (p.sections || []).forEach(function (s){ toc.push({ id: s.id, title: s.title }); });
    if (p.next && p.next.length) toc.push({ id: "next-steps", title: "Next steps" });
    var body = '<div class="text-[12px] font-semibold text-brand-700">' + esc(g ? g.title : "") + (p.kind === "reference" && !(g && /^reference$/i.test(g.title)) ? ' · Reference' : '') + '</div>' +
      '<h1 class="mt-1 text-[30px] font-bold leading-tight tracking-tight text-slate-900" data-guidetitle>' + esc(p.title) + '</h1>' +
      (p.description ? '<p class="mt-2 max-w-[46rem] text-[17px] leading-relaxed text-slate-500" data-guidedesc>' + rich(p.description) + '</p>' : '') +
      // "On this page" as a row above the page, when the window is too narrow for it on the right
      (toc.length > 1 ? '<div data-guidetocrow class="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1 border-y border-slate-200 py-2 text-[13px]"><span class="mr-2 font-semibold text-slate-900">On this page</span>' +
        toc.map(function (t){ return '<button type="button" data-guidetoc="' + esc(t.id) + '" class="rounded-md px-2 py-0.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">' + esc(t.title) + '</button>'; }).join("") + '</div>' : '') +
      (p.intro ? '<p class="mt-5 max-w-[46rem] text-[15px] leading-relaxed text-slate-700">' + rich(p.intro) + '</p>' : '') +
      calloutsHtml(p.callouts);
    if (p.before && p.before.length) body += '<section class="mt-10"><h2 data-guidesec="before-you-start" class="text-[20px] font-bold tracking-tight text-slate-900">Before you start</h2><ul class="mt-3 max-w-[46rem] list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700 marker:text-slate-400">' +
      p.before.map(function (b){ return '<li>' + rich(b) + '</li>'; }).join("") + '</ul></section>';
    (p.sections || []).forEach(function (s, si){ body += sectionHtml(p, s, si); });
    if (p.next && p.next.length) body += '<section class="mt-10"><h2 data-guidesec="next-steps" class="text-[20px] font-bold tracking-tight text-slate-900">Next steps</h2><div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">' +
      p.next.map(function (n){ var t = pageOf(n.page); if (!t) return "";
        return '<button type="button" data-guidelink="' + esc(n.page + (n.anchor ? "#" + n.anchor : "")) + '" class="group rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-400 hover:shadow-sm"><div class="text-[15px] font-semibold text-slate-900 group-hover:text-brand-800">' + esc(t.title) + ' →</div><div class="mt-1 text-[13px] leading-relaxed text-slate-600">' + rich(n.text || t.description || "") + '</div></button>'; }).join("") + '</div></section>';
    body += '<div class="mt-12 flex items-stretch justify-between gap-3 border-t border-slate-200 pt-5" data-guidepager>' +
      (prev ? '<button type="button" data-guidepage="' + esc(prev.id) + '" data-guideprev class="min-w-0 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-brand-400"><span class="block text-[11px] text-slate-400">← Previous</span><span class="block truncate text-[14px] font-semibold text-slate-800">' + esc(prev.title) + '</span></button>' : '<span></span>') +
      (next ? '<button type="button" data-guidepage="' + esc(next.id) + '" data-guidenext class="min-w-0 rounded-xl border border-slate-200 px-4 py-3 text-right hover:border-brand-400"><span class="block text-[11px] text-slate-400">Next →</span><span class="block truncate text-[14px] font-semibold text-slate-800">' + esc(next.title) + '</span></button>' : '<span></span>') + '</div>' +
      (data.note ? '<p class="mt-6 text-[11px] leading-relaxed text-slate-400">' + esc(data.note) + '</p>' : '');
    return '<div class="flex gap-8 px-6 py-6"><article data-guidecol class="min-w-0 flex-1">' + body + '</article>' +
      (toc.length > 1 ? '<aside id="guideToc" class="w-48 shrink-0"><div class="sticky top-0 pt-1"><div class="mb-2 text-[12px] font-semibold text-slate-900">On this page</div>' +
        toc.map(function (t){ return '<button type="button" data-guidetoc="' + esc(t.id) + '" data-on="0" class="block w-full border-l-2 border-slate-200 py-1 pl-3 text-left text-[13px] leading-snug text-slate-500 hover:text-slate-900">' + esc(t.title) + '</button>'; }).join("") + '</div></aside>' : '') + '</div>';
  }
  // every place a search can land: a page (its title and description), a section, a step or view (with its markers)
  function searchHtml(q){
    var w = q.toLowerCase().split(/\s+/).filter(Boolean), hits = [];
    var has = function (s){ s = String(s || "").toLowerCase(); return w.every(function (x){ return s.indexOf(x) >= 0; }); };
    var plain = function (s){ return String(s || "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); };
    pages().forEach(function (p){
      var head = [p.title, p.description, p.intro].concat(p.before || []).join(" ");
      if (has(plain(head))) hits.push({ rank: has(p.title) ? 0 : 1, p: p, key: p.id, where: "", text: p.description || p.intro });
      (p.sections || []).forEach(function (s, si){
        if (has(plain([s.title, s.text].join(" ")))) hits.push({ rank: 2, p: p, key: p.id + "#" + s.id, where: s.title, text: s.text || "" });
        ["steps", "views"].forEach(function (kind){ (s[kind] || []).forEach(function (x, i){
          var hay = [x.title, x.text].concat((x.marks || []).map(function (m){ return (m.label || "") + " " + m.text; })).concat((x.callouts || []).map(function (c){ return c.text; })).join(" ");
          if (has(plain(hay))) hits.push({ rank: 3, p: p, key: p.id + "/" + si + "/" + kind[0] + i, where: s.title + (x.title ? " › " + x.title : ""), text: x.text || "" });
        }); });
      });
    });
    hits.sort(function (a, b){ return a.rank - b.rank; });
    return '<div class="px-8 py-7"><h1 class="text-[22px] font-bold text-slate-900">' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + esc(q) + '”</h1><div class="mt-4 max-w-[52rem] space-y-2">' +
      hits.slice(0, 60).map(function (h){ return '<button type="button" data-guidejump="' + esc(h.key) + '" class="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand-400">' +
        '<span class="block text-[11px] text-slate-400">' + esc((groupOf(h.p.id) || {}).title || "") + ' › ' + esc(h.p.title) + (h.where ? ' › ' + esc(h.where) : '') + '</span>' +
        '<span class="mt-0.5 block text-[14px] font-semibold text-slate-800">' + esc(h.where ? h.where.split(" › ").pop() : h.p.title) + '</span>' +
        (h.text ? '<span class="mt-0.5 line-clamp-2 block text-[13px] text-slate-500">' + esc(plain(h.text)) + '</span>' : '') + '</button>'; }).join("") + '</div></div>';
  }
  function render(){
    var nav = el("guideNav"), main = el("guideMain"); if (!nav || !main || !data) return;
    lit = null;
    nav.innerHTML = navHtml();
    var p = st.page ? pageOf(st.page) : null;
    if (st.q && st.q.trim()){ main.innerHTML = searchHtml(st.q.trim()); main.scrollTop = 0; }
    else main.innerHTML = p ? pageHtml(p) : "";
    st.section = null; spy(); fit();
  }
  // a page, at its top (or at one of its sections)
  function openPage(id, anchor){
    st.page = id && pageOf(id) ? id : (pages()[0] ? pages()[0].id : null); st.section = null; st.q = ""; navTarget = null;
    var s = el("guideSearch"); if (s) s.value = "";
    render();
    var mn = el("guideMain"); if (!mn) return;
    mn.scrollTop = 0;
    var b = el("guideNav").querySelector('[data-guidepage="' + sel(st.page) + '"]'); if (b && b.scrollIntoView) try { b.scrollIntoView({ block: "nearest" }); } catch (e) {}
    try { mn.focus({ preventScroll: true }); } catch (e) {}
    if (anchor) toSection(anchor, false);
  }
  // a search result: its page, scrolled to the section or the step, which lights up for a moment
  function jump(key){
    var m = /^([^#/]+)(?:#(.+)|\/(\d+)\/([sv]\d+))?$/.exec(String(key)); if (!m) return;
    openPage(m[1]);
    var mn = el("guideMain"), x = null;
    if (m[2]) x = mn.querySelector('h2[data-guidesec="' + sel(m[2]) + '"]');
    else if (m[3] != null) x = mn.querySelector('[data-guidestep="' + sel(m[1] + "/" + m[3] + "/" + m[4]) + '"]');
    if (!x) return;
    scrollToEl(x, false);
    x.classList.remove("gflash"); void x.offsetWidth; x.classList.add("gflash");
    setTimeout(function (){ x.classList.remove("gflash"); }, 2000);
  }

  function open(id, anchor){
    var m = modal(); m.classList.remove("hidden"); m.classList.add("flex");
    var main = el("guideMain"); if (!data && main) main.innerHTML = '<p class="px-8 py-7 text-sm text-slate-500">Loading the guide…</p>';
    return load().then(function (){ openPage(id || null, anchor || null); }).catch(function (e){ if (main) main.innerHTML = '<p class="px-8 py-7 text-sm text-rose-700">The guide could not be loaded (' + esc(e && e.message) + ').</p>'; });
  }
  window.LDS_Guide = { open: open, close: close, state: function (){ return { page: st.page, section: st.section, search: st.q }; }, data: function (){ return data; } };
})();
