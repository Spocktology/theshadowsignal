/* The Shadow Signal - client-side episode search.
   No framework, no dependencies. Index is fetched once and cached.
   Progressive enhancement: the page works (and is crawlable) without JS. */
(function () {
  "use strict";
  var form = document.getElementById("search-form");
  if (!form) return;
  var input = document.getElementById("q");
  var out = document.getElementById("results");
  var status = document.getElementById("search-status");
  var data = null, loading = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function load() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    status.textContent = "Loading search index\u2026";
    loading = fetch("/search-index.json", { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        data = j;
        status.textContent = "";
        return j;
      })
      .catch(function (e) {
        status.textContent =
          "Search index could not be loaded. Try the " +
          "episode list instead.";
        throw e;
      });
    return loading;
  }

  function tokens(q) {
    return q.toLowerCase().split(/[^a-z0-9']+/i).filter(function (t) { return t.length > 1; });
  }

  // Field-weighted scoring: a title hit outranks a passing mention in notes.
  function score(ep, toks) {
    var title = ep.t.toLowerCase(), body = ep.b.toLowerCase(),
        keys = ep.k.join(" ").toLowerCase(), meta = ep.m.toLowerCase(), sc = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], hit = false;
      if (title.indexOf(t) !== -1) { sc += 12; hit = true; }
      if (keys.indexOf(t) !== -1) { sc += 8; hit = true; }
      if (meta.indexOf(t) !== -1) { sc += 4; hit = true; }
      var n = body.split(t).length - 1;
      if (n) { sc += Math.min(n, 6); hit = true; }
      if (!hit) return 0;            // every token must appear somewhere
    }
    if (title.indexOf(toks.join(" ")) !== -1) sc += 20;   // exact phrase in title
    return sc;
  }

  function hl(text, toks) {
    var out = esc(text);
    toks.forEach(function (t) {
      out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "gi"),
                        "<mark>$1</mark>");
    });
    return out;
  }

  function snippet(ep, toks) {
    var body = ep.b.replace(/\s+/g, " "), low = body.toLowerCase(), at = -1;
    for (var i = 0; i < toks.length && at < 0; i++) at = low.indexOf(toks[i]);
    if (at < 0) return esc(ep.m);
    var start = Math.max(0, at - 70);
    if (start > 0) {                         // don't begin mid-word
      var sp = body.indexOf(" ", start);
      if (sp > -1 && sp - start < 25) start = sp + 1;
    }
    var txt = body.slice(start, start + 230);
    var lastSp = txt.lastIndexOf(" ");
    if (lastSp > 150) txt = txt.slice(0, lastSp);   // don't end mid-word
    return (start > 0 ? "\u2026" : "") + hl(txt, toks) + "\u2026";
  }

  function render(q) {
    var toks = tokens(q);
    if (!toks.length) { out.innerHTML = ""; status.textContent = ""; return; }
    var hits = [];
    for (var i = 0; i < data.length; i++) {
      var sc = score(data[i], toks);
      if (sc > 0) hits.push([sc, data[i]]);
    }
    hits.sort(function (a, b) { return b[0] - a[0] || (a[1].d < b[1].d ? 1 : -1); });
    status.textContent = hits.length
      ? hits.length + (hits.length === 1 ? " episode" : " episodes") + " matching \u201c" + q + "\u201d"
      : "No episodes match \u201c" + q + "\u201d. Try a broader term, a guest name or a topic.";
    out.innerHTML = hits.slice(0, 50).map(function (h) {
      var ep = h[1];
      return '<li class="ep-card"><h3><a href="/episodes/' + encodeURIComponent(ep.s) + '/">' +
        hl(ep.t, toks) + "</a></h3>" +
        '<div class="ep-meta">' + (ep.n ? '<span class="badge">' + esc(ep.n) + "</span>" : "") +
        "<span>" + esc(ep.d) + '</span><span class="dot">&middot;</span><span>' +
        esc(ep.l) + "</span></div><p>" + snippet(ep, toks) + "</p></li>";
    }).join("");
  }

  var timer = null;
  function onInput() {
    var q = input.value.trim();
    if (!q) { out.innerHTML = ""; status.textContent = ""; return; }
    clearTimeout(timer);
    timer = setTimeout(function () {
      load().then(function () { render(q); }).catch(function () {});
    }, 140);
  }

  input.addEventListener("input", onInput);
  form.addEventListener("submit", function (e) { e.preventDefault(); onInput(); });
  // Deep link support: /search/?q=mothman
  var pre = new URLSearchParams(location.search).get("q");
  if (pre) { input.value = pre; onInput(); }
  input.focus();
})();
