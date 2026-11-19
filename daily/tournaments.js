// The day's tournaments on a day page (2026-11-16, by request).
//
// export_daily_pages.py writes an empty <section id="day-tournaments"
// data-day="YYYY-MM-DD" hidden> and loads this file. Past days come from the
// results log the site already publishes (../results/data/results.json). The
// day being played comes from the today-relay Worker instead, which
// StreamServer updates every 5 minutes with the ones still running too, and
// this re-reads it every minute while it's live.
//
// Hand-maintained in the site repo, like style.css. Its styles are injected
// below so a change here doesn't need CSS_VERSION bumped in the generator.
(function () {
  var box = document.getElementById("day-tournaments");
  if (!box) return;
  var day = box.getAttribute("data-day");
  var LIVE = "https://live.robpaaspoker.com/today.json";
  var LOG = "../results/data/results.json";
  var STALE_SECONDS = 20 * 60;
  // The rooms the bankroll keeps in USD (server.py USD_SITES).
  var USD_SITES = ["wpt gold", "coinpoker", "acr"];

  var css = document.createElement("style");
  css.textContent =
    ".trn-list{list-style:none;margin:0;padding:0}" +
    ".trn{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:12px 0;border-top:1px solid var(--hairline)}" +
    ".trn:first-child{border-top:0;padding-top:0}.trn:last-child{padding-bottom:0}" +
    ".trn-name{color:var(--ink);font-size:15px;line-height:1.35;overflow-wrap:anywhere}" +
    ".trn-meta,.trn-sub{margin-top:2px;font-size:13px;color:var(--ink-subtle)}" +
    ".trn-end{text-align:right;white-space:nowrap}" +
    ".trn-figure{font-family:var(--font-figure);font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}" +
    ".trn-stage{font-size:14px;font-weight:500;color:var(--ink-muted)}" +
    ".trn-when{margin:-6px 0 14px;font-size:13px;color:var(--ink-subtle)}";
  document.head.appendChild(css);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function money(n, usd, signed) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    var abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    var s = (usd ? "US$" : "$") + abs;
    if (v < 0) return "-" + s;
    return signed && v > 0 ? "+" + s : s;
  }

  function tone(n) { return n > 0 ? "positive" : n < 0 ? "negative" : "neutral"; }

  function row(t) {
    var li = el("li", "trn");
    var main = el("div");
    main.appendChild(el("div", "trn-name", t.name));
    var meta = [t.site, money(t.buyin, t.usd)];
    if (t.entries > 1) meta.push(t.entries + " entries");
    main.appendChild(el("div", "trn-meta", meta.filter(Boolean).join(" · ")));
    li.appendChild(main);
    var end = el("div", "trn-end");
    if (t.status === "running") {
      end.appendChild(el("div", "trn-stage", t.stage || "Running"));
      end.appendChild(el("div", "trn-sub", money(t.invested, t.usd) + " in"));
    } else {
      var profit = t.winnings - t.invested;
      end.appendChild(el("div", "trn-figure " + tone(profit), money(profit, t.usd, true)));
      end.appendChild(el("div", "trn-sub", t.winnings > 0
        ? (t.onlyBounty ? "Bounties " : "Cashed ") + money(t.winnings, t.usd)
        : "Busted"));
    }
    li.appendChild(end);
    return li;
  }

  // A cash is prize money: a tournament that won only bounties isn't one
  // (2026-11-16, by request). StreamServer's rows carry `cashed`; the log's
  // are worked out in fromLog.
  function isCash(r) {
    return r.cashed != null ? !!r.cashed : r.winnings > 0 && !r.onlyBounty;
  }

  function stat(label, value) {
    var s = el("div", "stat");
    s.appendChild(el("div", "stat-label", label));
    s.appendChild(el("div", "stat-value neutral", String(value)));
    return s;
  }

  // The counts head this card, above the list (2026-11-16, by request; they
  // were in the money card before).
  function render(rows, note) {
    box.textContent = "";
    if (!rows.length) { box.hidden = true; return; }
    // No "Tournaments" title (2026-11-19, by request): the count below says it.
    if (note) box.appendChild(el("div", "trn-when", note));
    var strip = el("div", "stat-row trn-stats");
    strip.appendChild(stat("Tournaments", rows.length));
    strip.appendChild(stat("Cashes", rows.filter(isCash).length));
    var running = rows.filter(function (r) { return r.status === "running"; }).length;
    if (running) strip.appendChild(stat("Still running", running));
    box.appendChild(strip);
    var ul = el("ul", "trn-list");
    rows.forEach(function (t) { ul.appendChild(row(t)); });
    box.appendChild(ul);
    box.hidden = false;
  }

  // The published log, shaped like the Worker's rows: biggest result first,
  // as the site breakdown above it runs.
  // A tournament logged once per entry (older rows) becomes one row with its
  // entries added up, as the live view shows re-entries.
  function fromLog(all) {
    var byKey = {};
    var rows = [];
    all.forEach(function (r) {
      if (r.date !== day) return;
      var rebuys = Number(r.rebuys) || 0;
      var buyin = Number(r.buyin) || 0;
      var key = (r.name || "").toLowerCase() + "\u0000" + (r.site || "").toLowerCase();
      var t = byKey[key];
      if (!t) {
        t = byKey[key] = {
          name: r.name || "", site: r.site || "", buyin: buyin, entries: 0,
          usd: USD_SITES.indexOf((r.site || "").trim().toLowerCase()) >= 0,
          invested: 0, winnings: 0, onlyBounty: true, cashed: false, status: "done"
        };
        rows.push(t);
      }
      var won = Number(r.winnings) || 0;
      t.entries += 1 + rebuys;
      t.invested += Number(r.totalInvested) || buyin * (1 + rebuys);
      t.winnings += won;
      t.onlyBounty = t.onlyBounty && !!r.onlyBounty;
      t.cashed = t.cashed || (won > 0 && !r.onlyBounty);
    });
    return rows.sort(function (a, b) { return (b.winnings - b.invested) - (a.winnings - a.invested); });
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  var logRows = null;
  var timer = null;

  function load() {
    var live = getJSON(LIVE).catch(function () { return null; });
    var log = logRows ? Promise.resolve(logRows)
      : getJSON(LOG).then(function (all) { return (logRows = fromLog(all)); }).catch(function () { return []; });
    Promise.all([live, log]).then(function (got) {
      var snap = got[0], logged = got[1];
      var mine = snap && snap.day === day && Array.isArray(snap.tournaments);
      var fresh = mine && Date.now() / 1000 - (snap.updated || 0) < STALE_SECONDS;
      // Live while the stream runs. Afterwards the published log wins (it
      // carries any fixes made in Study), unless it hasn't caught up yet.
      if (fresh || (mine && !logged.length)) {
        var at = new Date((snap.updated || 0) * 1000)
          .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        render(snap.tournaments, fresh ? "Live · updated " + at : "Last updated " + at);
      } else {
        render(logged);
      }
      if (fresh && !timer) timer = setInterval(load, 60 * 1000);
      if (!fresh && timer) { clearInterval(timer); timer = null; }
    });
  }

  load();
})();
