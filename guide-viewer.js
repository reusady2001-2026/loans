/* ============================================================================
   The in-app Guide (Settings → Guide → "Open the guide") — the operator, 2026-10-19: "a pop-up window … choose on
   what tab you need help, what screen, and in each screen what every single thing can do … like a walkthrough".
   Pick a tab (a chapter), then a topic; a topic is a walkthrough of steps. Each step is a picture of the real app with
   numbered markers on its buttons, and what each number does. Back / Next (or ← →) walk through it; Esc closes.
   The pictures and the text come from guide/guide.json, which `node guide/capture.js` writes by driving the app with
   made-up data (guide/spec/*.js) — so the guide is retaken, not edited by hand, whenever a screen changes.
   ========================================================================== */
(function () {
  "use strict";
  var data = null, loading = null, st = { ch: null, tp: null, step: 0, q: "" };
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
  function topic(c, id){ return c ? (c.topics || []).filter(function (t){ return t.id === id; })[0] || null : null; }

  function modal(){
    var m = el("guideModal"); if (m) return m;
    m = document.createElement("div"); m.id = "guideModal";
    m.className = "fixed inset-0 z-[90] hidden items-center justify-center bg-slate-900/50 p-4";
    m.innerHTML = '<div id="guideBox" class="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style="width:92vw;max-width:none;height:90vh">' +
      '<div class="flex items-center gap-3 border-b border-slate-200 px-5 py-3"><div class="min-w-0 flex-1"><div class="text-[10px] font-bold uppercase tracking-wider text-brand-700">Guide</div>' +
        '<div id="guideCrumb" class="truncate text-base font-bold text-slate-900">How to use the app</div></div>' +
        '<input id="guideSearch" type="search" placeholder="Search the guide…" class="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" aria-label="Search the guide">' +
        '<button type="button" data-guideclose class="grid h-8 w-8 place-items-center rounded-lg text-xl text-slate-400 hover:bg-slate-100" aria-label="Close">&times;</button></div>' +
      '<div class="flex min-h-0 flex-1"><nav id="guideNav" class="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/70 p-3" aria-label="Guide contents"></nav>' +
        '<main id="guideMain" class="min-w-0 flex-1 overflow-y-auto px-6 py-5"></main></div></div>' +
      '<div id="guideZoom" class="fixed inset-0 z-[95] hidden cursor-zoom-out overflow-auto bg-slate-900/80 p-6"><img alt="" class="mx-auto max-w-none rounded-lg bg-white shadow-2xl"></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e){
      var t = e.target;
      if (t === m || (t.closest && t.closest("[data-guideclose]"))){ close(); return; }
      var z = el("guideZoom"); if (t.closest && t.closest("#guideZoom")){ z.classList.add("hidden"); return; }
      var c = t.closest && t.closest("[data-guidech]"); if (c){ go(c.getAttribute("data-guidech"), null, 0); return; }
      var p = t.closest && t.closest("[data-guidetp]"); if (p){ var a = p.getAttribute("data-guidetp").split("/"); go(a[0], a[1], 0); return; }
      var s = t.closest && t.closest("[data-guidestep]"); if (s){ go(st.ch, st.tp, Number(s.getAttribute("data-guidestep"))); return; }
      if (t.closest && t.closest("[data-guidenext]")){ next(1); return; }
      if (t.closest && t.closest("[data-guideprev]")){ next(-1); return; }
      if (t.closest && t.closest("[data-guidehome]")){ go(null, null, 0); return; }
      var img = t.closest && t.closest("[data-guideimg]"); if (img){ z.querySelector("img").src = img.getAttribute("data-guideimg"); z.classList.remove("hidden"); return; }
    });
    m.addEventListener("mouseover", function (e){ var k = e.target.closest && e.target.closest("[data-guidemk]"); hilite(k ? k.getAttribute("data-guidemk") : null); });
    m.addEventListener("input", function (e){ if (e.target && e.target.id === "guideSearch"){ st.q = e.target.value; render(); } });
    document.addEventListener("keydown", function (e){
      var mm = el("guideModal"); if (!mm || mm.classList.contains("hidden")) return;
      if (e.key === "Escape"){ var z = el("guideZoom"); if (z && !z.classList.contains("hidden")) z.classList.add("hidden"); else close(); e.preventDefault(); return; }
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight"){ next(1); e.preventDefault(); } else if (e.key === "ArrowLeft"){ next(-1); e.preventDefault(); }
    });
    return m;
  }
  function hilite(n){ document.querySelectorAll("#guideMain [data-guidebox]").forEach(function (b){ var on = b.getAttribute("data-guidebox") === n; b.style.outline = on ? "3px solid #f59e0b" : ""; b.style.background = on ? "rgba(245,158,11,.18)" : ""; }); }
  function close(){ var m = el("guideModal"); if (m){ m.classList.add("hidden"); m.classList.remove("flex"); } }
  function next(d){
    var c = chapter(st.ch), t = topic(c, st.tp); if (!t) return;
    var n = st.step + d;
    if (n >= 0 && n < t.steps.length){ go(st.ch, st.tp, n); return; }
    // past the last step → the next topic (and back from the first step → the previous topic's last step)
    var all = []; (data.chapters || []).forEach(function (cc){ (cc.topics || []).forEach(function (tt){ all.push([cc.id, tt.id, tt.steps.length]); }); });
    var i = -1; all.forEach(function (x, k){ if (x[0] === st.ch && x[1] === st.tp) i = k; });
    var j = i + d; if (j < 0 || j >= all.length) return;
    go(all[j][0], all[j][1], d > 0 ? 0 : all[j][2] - 1);
  }
  function go(ch, tp, step){ st.ch = ch; st.tp = tp; st.step = step || 0; st.q = ""; var s = el("guideSearch"); if (s) s.value = ""; render(); var mn = el("guideMain"); if (mn) mn.scrollTop = 0; }

  function navHtml(){
    return (data.chapters || []).map(function (c){
      var on = c.id === st.ch;
      return '<div class="mb-1"><button type="button" data-guidech="' + esc(c.id) + '" class="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] font-bold ' + (on ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-white') + '">' + esc(c.title) + '</button>' +
        (on ? '<div class="mt-0.5 space-y-0.5 pl-2">' + (c.topics || []).map(function (t){ var a = t.id === st.tp;
          return '<button type="button" data-guidetp="' + esc(c.id + "/" + t.id) + '" class="block w-full rounded-md px-2 py-1 text-left text-[12px] ' + (a ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-slate-600 hover:bg-white') + '">' + esc(t.title) + '</button>'; }).join("") + '</div>' : '') + '</div>';
    }).join("");
  }
  function homeHtml(){
    return '<h2 class="text-xl font-bold text-slate-900">What do you need help with?</h2>' +
      '<p class="mt-1 max-w-3xl text-[13px] text-slate-600">' + esc(data.intro || "") + '</p>' +
      '<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">' + (data.chapters || []).map(function (c){
        var n = 0; (c.topics || []).forEach(function (t){ n += t.steps.length; });
        return '<button type="button" data-guidech="' + esc(c.id) + '" class="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-400 hover:shadow">' +
          (c.cover ? '<img src="./guide/' + esc(c.cover) + '" alt="" class="mb-3 h-28 w-full rounded-md border border-slate-100 object-cover object-top">' : '') +
          '<div class="text-[15px] font-bold text-slate-900">' + esc(c.title) + '</div><div class="mt-0.5 text-[12px] text-slate-600">' + esc(c.intro || "") + '</div>' +
          '<div class="mt-2 text-[11px] font-semibold text-brand-700">' + (c.topics || []).length + ' topics · ' + n + ' steps</div></button>'; }).join("") + '</div>' +
      (data.note ? '<p class="mt-5 text-[11px] text-slate-400">' + esc(data.note) + '</p>' : '');
  }
  function chapterHtml(c){
    return '<h2 class="text-xl font-bold text-slate-900">' + esc(c.title) + '</h2><p class="mt-1 max-w-3xl text-[13px] text-slate-600">' + esc(c.intro || "") + '</p>' +
      '<ol class="mt-4 space-y-2">' + (c.topics || []).map(function (t, i){
        return '<li><button type="button" data-guidetp="' + esc(c.id + "/" + t.id) + '" class="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-400 hover:shadow-sm">' +
          '<span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-800">' + (i + 1) + '</span>' +
          '<span class="min-w-0"><span class="block text-[14px] font-bold text-slate-900">' + esc(t.title) + '</span><span class="block text-[12px] text-slate-600">' + esc(t.intro || "") + '</span>' +
          '<span class="mt-0.5 block text-[11px] text-slate-400">' + t.steps.length + ' step' + (t.steps.length === 1 ? '' : 's') + '</span></span></button></li>'; }).join("") + '</ol>';
  }
  function stepHtml(c, t){
    var s = t.steps[st.step] || t.steps[0], n = t.steps.length;
    var img = './guide/' + s.img;
    var boxes = (s.marks || []).map(function (m, i){
      var k = String(i + 1);
      return '<div data-guidebox="' + k + '" class="pointer-events-none absolute rounded-md border-2 border-amber-500/80" style="left:' + m.x + '%;top:' + m.y + '%;width:' + m.w + '%;height:' + m.h + '%"></div>' +
        '<div data-guidemk="' + k + '" class="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-500 text-[11px] font-extrabold text-white shadow ring-2 ring-white" style="left:' + Math.max(1.2, m.x) + '%;top:' + Math.max(1.8, m.y) + '%">' + k + '</div>';
    }).join("");
    var dots = t.steps.map(function (x, i){ return '<button type="button" data-guidestep="' + i + '" title="' + esc(x.title) + '" class="h-2.5 w-2.5 rounded-full ' + (i === st.step ? 'bg-brand-600' : 'bg-slate-300 hover:bg-slate-400') + '"></button>'; }).join("");
    return '<div class="flex flex-wrap items-baseline justify-between gap-2"><div class="min-w-0"><div class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + esc(c.title) + ' › ' + esc(t.title) + '</div>' +
        '<h2 class="text-lg font-bold text-slate-900" data-guidesteptitle>' + esc(s.title) + '</h2></div>' +
        '<div class="flex items-center gap-2"><span class="text-[12px] font-semibold text-slate-500" data-guidecount>Step ' + (st.step + 1) + ' of ' + n + '</span>' +
        '<button type="button" data-guideprev class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">&larr; Back</button>' +
        '<button type="button" data-guidenext class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500">' + (st.step + 1 < n ? 'Next &rarr;' : 'Next topic &rarr;') + '</button></div></div>' +
      (s.text ? '<p class="mt-2 max-w-4xl text-[13px] leading-relaxed text-slate-700" data-guidetext>' + esc(s.text) + '</p>' : '') +
      '<div class="mt-3 flex flex-col gap-4 2xl:flex-row"><div class="min-w-0 2xl:flex-1"><div class="relative inline-block max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 shadow-sm" data-guideimg="' + esc(img) + '" title="Click to see it full size">' +
        '<img src="' + esc(img) + '" alt="' + esc(s.title) + '" width="' + (s.w || "") + '" height="' + (s.h || "") + '" class="block h-auto max-w-full" style="max-height:70vh;width:auto">' + boxes + '</div></div>' +
      ((s.marks || []).length ? '<ol class="space-y-1.5 2xl:w-96 2xl:shrink-0" data-guidemarks>' + s.marks.map(function (m, i){
          return '<li data-guidemk="' + (i + 1) + '" class="flex gap-2 rounded-lg px-2 py-1 text-[13px] leading-snug text-slate-700 hover:bg-amber-50"><span class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white">' + (i + 1) + '</span><span>' +
            (m.label ? '<b class="text-slate-900">' + esc(m.label) + '</b> &mdash; ' : '') + esc(m.text) + '</span></li>'; }).join("") + '</ol>' : '') + '</div>' +
      '<div class="mt-4 flex items-center gap-1.5">' + dots + '</div>';
  }
  function searchHtml(q){
    var w = q.toLowerCase().split(/\s+/).filter(Boolean), hits = [];
    (data.chapters || []).forEach(function (c){ (c.topics || []).forEach(function (t){ t.steps.forEach(function (s, i){
      var hay = [c.title, t.title, s.title, s.text].concat((s.marks || []).map(function (m){ return (m.label || "") + " " + m.text; })).join(" ").toLowerCase();
      if (w.every(function (x){ return hay.indexOf(x) >= 0; })) hits.push({ c: c, t: t, s: s, i: i });
    }); }); });
    return '<h2 class="text-lg font-bold text-slate-900">' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + esc(q) + '”</h2><div class="mt-3 space-y-1.5">' +
      hits.slice(0, 80).map(function (h){ return '<button type="button" data-guidetp="' + esc(h.c.id + "/" + h.t.id) + '" data-guidejump="' + h.i + '" class="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-brand-400">' +
        '<span class="block text-[11px] text-slate-400">' + esc(h.c.title) + ' › ' + esc(h.t.title) + '</span><span class="block text-[13px] font-semibold text-slate-800">' + esc(h.s.title) + '</span></button>'; }).join("") + '</div>';
  }
  function render(){
    var nav = el("guideNav"), main = el("guideMain"), crumb = el("guideCrumb"); if (!nav || !main || !data) return;
    nav.innerHTML = navHtml();
    var c = chapter(st.ch), t = topic(c, st.tp);
    crumb.textContent = t ? c.title + " › " + t.title : c ? c.title : "How to use the app";
    if (st.q && st.q.trim()) main.innerHTML = searchHtml(st.q.trim());
    else main.innerHTML = t ? stepHtml(c, t) : c ? chapterHtml(c) : homeHtml();
  }
  // a search result opens its topic at the step that matched
  document.addEventListener("click", function (e){ var j = e.target.closest && e.target.closest("[data-guidejump]"); if (!j) return; var a = j.getAttribute("data-guidetp").split("/"); setTimeout(function (){ go(a[0], a[1], Number(j.getAttribute("data-guidejump"))); }, 0); }, true);

  function open(ch, tp){
    var m = modal(); m.classList.remove("hidden"); m.classList.add("flex");
    var main = el("guideMain"); if (!data && main) main.innerHTML = '<p class="text-sm text-slate-500">Loading the guide…</p>';
    return load().then(function (){ go(ch || null, tp || null, 0); }).catch(function (e){ if (main) main.innerHTML = '<p class="text-sm text-rose-700">The guide could not be loaded (' + esc(e && e.message) + ').</p>'; });
  }
  window.LDS_Guide = { open: open, close: close, state: function (){ return { chapter: st.ch, topic: st.tp, step: st.step }; }, data: function (){ return data; } };
})();
