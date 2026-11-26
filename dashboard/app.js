// Token Radar dashboard. No framework, no network: reads window.RADAR_DATA from data.js.
(function () {
  "use strict";
  var D = window.RADAR_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var state = { view: "board", slug: "", filter: "", q: "", cat: "", chain: "", sort: "rank", dir: 1, pre: false, wl: false };
  var DESC_FIRST = { value: true, tvl: true, ch7: true, months: true };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function usd(x) {
    if (x == null) return "—";
    var a = Math.abs(x);
    if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (x / 1e3).toFixed(0) + "k";
    return "$" + Math.round(x);
  }
  function full(x) { return "$" + Math.round(x).toLocaleString("en-US"); }
  function chg(x) {
    if (x == null) return '<span class="flat">—</span>';
    var cls = x > 0.05 ? "up" : x < -0.05 ? "down" : "flat";
    return '<span class="' + cls + '">' + (x > 0 ? "+" : "") + x.toFixed(1) + "%</span>";
  }
  function months(m) { return m == null ? "—" : m < 1 ? "<1 mo" : m < 24 ? Math.round(m) + " mo" : (m / 12).toFixed(1) + " yr"; }
  function longDate(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  function ready() {
    requestAnimationFrame(function () { requestAnimationFrame(function () { window.__shotReady = true; }); });
  }

  if (!D || !D.rows) {
    $("app").innerHTML = '<p class="empty">data.js was not found next to this page. Run main.ts to build it.</p>';
    ready();
    return;
  }

  var ROWS = D.rows;
  var MAXV = ROWS.reduce(function (m, r) { return Math.max(m, r.value); }, 1);
  var bySlug = {};
  ROWS.forEach(function (r) { bySlug[r.slug] = r; });
  var lc = function (s) { return String(s || "").toLowerCase(); };

  // ---------- header + KPIs ----------
  $("snap-date").textContent = longDate(D.snapshot_date);
  var S = D.stats;
  $("kpis").innerHTML = [
    ["Pre-token on board", S.pre_token, "of " + D.pre_token_in_snapshot + " that record no token in " + D.protocols_in_snapshot + " protocols", ""],
    ["Watchlist covered", S.watchlist_on_board + " / " + D.watchlist_size, "no token recorded, TVL ≥ $50M", "amber"],
    ["Pre-token implied value", usd(S.pre_token_value_usd), "sum of modelled FDV, pre-token rows", ""],
    ["Pre-token TVL", usd(S.pre_token_tvl_usd), S.traded + " trading rows kept for comparison", "amber"]
  ].map(function (k) {
    return '<div class="kpi ' + k[3] + '"><div class="k">' + esc(k[0]) + '</div><div class="v">' + esc(k[1]) + '</div><div class="h">' + esc(k[2]) + "</div></div>";
  }).join("");
  $("model-note").textContent = "Model: " + D.model.summary;

  // ---------- controls ----------
  function fillSelect(el, pairs) {
    el.insertAdjacentHTML("beforeend", pairs.map(function (p) {
      return '<option value="' + esc(p[0]) + '">' + esc(p[0]) + " (" + p[1] + ")</option>";
    }).join(""));
  }
  fillSelect($("cat"), D.categories);
  fillSelect($("chain"), D.chains);

  function matchName(list, text) {
    var t = lc(text);
    for (var i = 0; i < list.length; i++) if (lc(list[i][0]) === t) return list[i][0];
    return "";
  }

  // ?view=filtered&filter=<category | chain | text>
  function applyFilterParam(f) {
    state.cat = ""; state.chain = ""; state.q = "";
    if (!f) return;
    var c = matchName(D.categories, f);
    var ch = c ? "" : matchName(D.chains, f);
    if (c) state.cat = c; else if (ch) state.chain = ch; else state.q = f;
  }

  function readURL() {
    var p = new URLSearchParams(location.search);
    state.view = ["board", "detail", "filtered"].indexOf(p.get("view")) >= 0 ? p.get("view") : "board";
    state.slug = p.get("slug") || "";
    state.filter = p.get("filter") || "";
    if (state.view === "filtered") applyFilterParam(state.filter);
    if (p.get("sort")) { state.sort = p.get("sort"); state.dir = p.get("dir") === "desc" ? -1 : 1; }
    if (p.get("pre") === "1") state.pre = true;
  }

  function syncControls() {
    $("q").value = state.q; $("cat").value = state.cat; $("chain").value = state.chain;
    $("sort").value = state.sort; $("pre").checked = state.pre; $("wl").checked = state.wl;
    $("dir").textContent = state.dir === 1 ? "↑ Asc" : "↓ Desc";
  }

  function go(params, push) {
    if (params.view === "board") { state.q = ""; state.cat = ""; state.chain = ""; }
    var u = "?" + new URLSearchParams(params).toString();
    history[push ? "pushState" : "replaceState"](null, "", u);
    readURL(); render();
  }

  // ---------- board ----------
  function filtered() {
    var q = lc(state.q).trim();
    var out = ROWS.filter(function (r) {
      if (state.pre && r.tier !== "pre-token") return false;
      if (state.wl && !r.wl) return false;
      if (state.cat && r.cat !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (lc(r.name) + " " + lc(r.slug) + " " + lc(r.cat) + " " + lc(r.chains.join(" "))).indexOf(q) < 0) return false;
      return true;
    });
    var k = state.sort, dir = state.dir;
    out.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null && y == null) return a.rank - b.rank;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * dir || a.rank - b.rank;
    });
    return out;
  }

  function rowHTML(r) {
    var ch = r.chains.slice(0, 2).join(", ") + (r.chains.length > 2 ? " +" + (r.chains.length - 2) : "");
    var badges = (r.wl ? '<span class="badge wl">Watchlist</span>' : "") +
      (r.tier === "pre-token" ? '<span class="badge pre">No token</span>' : '<span class="badge tr">Trades' + (r.sym ? " · " + esc(r.sym) : "") + "</span>");
    return '<tr data-slug="' + esc(r.slug) + '" class="' + (r.tier === "pre-token" ? "" : "traded") + '" tabindex="0">' +
      '<td class="num rank' + (r.rank <= 3 ? " top" : "") + '">' + r.rank + "</td>" +
      '<td><span class="pname">' + esc(r.name) + "</span>" + badges + '<span class="slug">' + esc(r.slug) + "</span></td>" +
      '<td class="cat">' + esc(r.cat) + "</td>" +
      '<td class="chains">' + esc(ch || "—") + "</td>" +
      '<td class="num">' + usd(r.tvl) + "</td>" +
      '<td class="num">' + chg(r.ch7) + "</td>" +
      '<td class="num">' + months(r.months) + "</td>" +
      '<td class="num"><span class="val">' + usd(r.value) + '</span><span class="bar"><i style="width:' +
      Math.max(2, Math.sqrt(r.value / MAXV) * 100).toFixed(1) + '%"></i></span></td></tr>';
  }

  function renderBanner(list) {
    var b = $("filter-banner");
    if (state.view !== "filtered") { b.hidden = true; return; }
    var label = state.cat || state.chain || state.q;
    var kind = state.cat ? "category" : state.chain ? "chain" : state.q ? "search" : "";
    var pre = list.filter(function (r) { return r.tier === "pre-token"; });
    var sum = pre.reduce(function (s, r) { return s + r.value; }, 0);
    var tvl = pre.reduce(function (s, r) { return s + r.tvl; }, 0);
    var chip = function (name, n, key) {
      var on = (key === "cat" ? state.cat : state.chain) === name;
      return '<a class="chip' + (on ? " on" : "") + '" href="?view=filtered&filter=' + encodeURIComponent(name) + '">' + esc(name) + "<b>" + n + "</b></a>";
    };
    b.innerHTML = (label
      ? "<h2>Filter · " + esc(kind) + " <em>" + esc(label) + "</em></h2><p>" + list.length + " protocols, " + pre.length +
        " record no token · " + usd(sum) + " pre-token implied value on " + usd(tvl) + " TVL" +
        (pre[0] ? " · top: <a href=\"?view=detail&slug=" + encodeURIComponent(pre[0].slug) + "\">" + esc(pre[0].name) + "</a> " + usd(pre[0].value) : "") + "</p>"
      : "<h2>Filter the radar</h2><p>Pick a category or chain below, or use the controls above.</p>") +
      '<div class="chips">' + D.categories.slice(0, 10).map(function (c) { return chip(c[0], c[1], "cat"); }).join("") + "</div>" +
      '<div class="chips">' + D.chains.slice(0, 10).map(function (c) { return chip(c[0], c[1], "chain"); }).join("") + "</div>";
    b.hidden = false;
  }

  function renderBoard() {
    var list = filtered();
    $("rows").innerHTML = list.map(rowHTML).join("");
    $("empty").hidden = list.length > 0;
    $("count").textContent = "Showing " + list.length + " of " + ROWS.length + " rows · ranked by implied value; pre-token rows first, trading rows after.";
    document.querySelectorAll(".board th[data-sort]").forEach(function (th) {
      th.classList.toggle("sorted", th.getAttribute("data-sort") === state.sort);
    });
    renderBanner(list);
  }

  // ---------- detail ----------
  function renderDetail() {
    var r = bySlug[state.slug] || ROWS[0];
    var d = r.d;
    var tvlTxt = full(r.tvl);
    var wf = [
      ["TVL in snapshot", "starting figure", tvlTxt],
      ["× category multiple", d.multiple_source, d.multiple.toFixed(3) + "×"],
      ["× 7-day momentum", "exp(0.9 · clip(" + (r.ch7 == null ? "n/a" : r.ch7.toFixed(1) + "%") + ", −40%, +60%))", d.momentum.toFixed(3) + "×"],
      ["× launch pressure", r.months == null ? "no listing date: neutral 0.85" : months(r.months) + " listed with no token recorded", d.age_factor.toFixed(3) + "×"],
      ["× chain breadth", r.chains.length + " chain" + (r.chains.length === 1 ? "" : "s") + ": 1 + 0.05 per extra", d.chain_factor.toFixed(3) + "×"],
      ["= modelled FDV", "if a token launched at the snapshot", full(d.fdv_usd)]
    ];
    if (r.tier !== "pre-token") {
      wf.push(["× residual incentives", "token already trades: " + Math.round(D.model.traded_residual * 100) + "% of FDV left to farm", D.model.traded_residual + "×"]);
      wf.push(["× tier scale", "keeps trading rows under the pre-token floor", d.tier_scale + "×"]);
    }
    wf.push(["Implied value (rank " + r.rank + ")", d.formula, full(r.value)]);
    var figs = [
      ["TVL", usd(r.tvl)], ["7-day change", chg(r.ch7)], ["Listed", r.listed ? longDate(r.listed) : "—"],
      ["No token for", months(r.months)], ["Airdrop pool (model)", usd(d.airdrop_pool_usd)], ["Per $1k of TVL", "$" + d.per_1k_usd.toFixed(2)]
    ];
    if (r.tier !== "pre-token") figs.push(["Token", esc(r.sym || "listed")], ["Market cap", usd(r.mcap)]);
    $("view-detail").innerHTML =
      '<p class="crumb"><a href="?view=board" data-nav="board">← Back to the board</a> · <a href="?view=filtered&filter=' + encodeURIComponent(r.cat) + '">More ' + esc(r.cat) + "</a></p>" +
      '<div class="dhead"><div><h2>' + esc(r.name) +
      (r.wl ? '<span class="badge wl">Watchlist</span>' : "") +
      (r.tier === "pre-token" ? '<span class="badge pre">Records no token</span>' : '<span class="badge tr">Trades</span>') +
      '</h2><div class="meta">#' + r.rank + " of " + ROWS.length + " · " + esc(r.cat) + " · <span class=\"slug\" style=\"display:inline\">" + esc(r.slug) + "</span></div></div>" +
      '<div class="bigval"><div class="k">Implied value</div><div class="v">' + usd(r.value) + '</div><div class="h">' + full(r.value) + "</div></div></div>" +
      '<div class="grid2"><div><div class="card"><h3>Snapshot figures</h3><dl class="figs">' +
      figs.map(function (f) { return "<div><dt>" + esc(f[0]) + "</dt><dd>" + f[1] + "</dd></div>"; }).join("") +
      '</dl><div class="chain-list">' + r.chains.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div></div>" +
      '<div class="card mt"><h3>How the value was derived</h3><ol class="wf">' +
      wf.map(function (w, i) {
        return '<li class="' + (i === wf.length - 1 || w[0].indexOf("= ") === 0 ? "total" : "") + '"><span class="lab">' + esc(w[0]) + "<small>" + esc(w[1]) + '</small></span><span class="x">' + esc(w[2]) + "</span></li>";
      }).join("") + "</ol></div></div>" +
      '<div class="card"><h3>Farm plan · ' + r.steps.length + " steps</h3><ol class=\"steps\">" +
      r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></div></div>";
  }

  // ---------- views ----------
  function render() {
    syncControls();
    var detail = state.view === "detail";
    $("view-board").hidden = detail;
    $("view-detail").hidden = !detail;
    $("tab-detail").hidden = !detail;
    document.querySelectorAll(".tabs a").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("data-view") === state.view);
    });
    if (detail) renderDetail(); else renderBoard();
    document.title = (detail ? (bySlug[state.slug] || ROWS[0]).name + " · " : "") + "Token Radar · snapshot " + D.snapshot_date;
    window.scrollTo(0, 0);
    ready();
  }

  // ---------- events ----------
  function onControl() {
    state.q = $("q").value; state.cat = $("cat").value; state.chain = $("chain").value;
    state.pre = $("pre").checked; state.wl = $("wl").checked;
    var newSort = $("sort").value;
    if (newSort !== state.sort) { state.sort = newSort; state.dir = DESC_FIRST[newSort] ? -1 : 1; }
    renderBoard(); syncControls();
  }
  ["q", "cat", "chain", "sort", "pre", "wl"].forEach(function (id) {
    $(id).addEventListener(id === "q" ? "input" : "change", onControl);
  });
  $("dir").addEventListener("click", function () { state.dir = -state.dir; renderBoard(); syncControls(); });
  document.querySelectorAll(".board th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-sort");
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = DESC_FIRST[k] ? -1 : 1; }
      renderBoard(); syncControls();
    });
  });
  function openRow(tr) { if (tr) go({ view: "detail", slug: tr.getAttribute("data-slug") }, true); }
  $("rows").addEventListener("click", function (e) { openRow(e.target.closest("tr")); });
  $("rows").addEventListener("keydown", function (e) { if (e.key === "Enter") openRow(e.target.closest("tr")); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href^='?']");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    var p = new URLSearchParams(a.getAttribute("href").slice(1));
    var o = {}; p.forEach(function (v, k) { o[k] = v; });
    if (o.view === "detail" && !o.slug) o.slug = state.slug || ROWS[0].slug;
    go(o, true);
  });
  window.addEventListener("popstate", function () { readURL(); render(); });

  readURL();
  render();
})();
