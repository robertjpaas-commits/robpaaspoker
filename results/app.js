// RobPaasPoker — public Tournament Results page (view-only).
// Ported from the private HTML Files/RobPaasPoker_Results.html tool:
// all add/edit/delete/import controls are stripped since this is a static
// site with nowhere to save them. Data comes from data/results.json, a
// point-in-time export (see export_results.py / publish_results.bat).

var allResults = [];
var filtered   = [];
var sortKey    = 'date';
var sortDir    = -1;
var PAGE_SIZE  = 10;
var trnShowAll     = false;
var resultsShowAll = false;
var trnSortKey     = 'profit';
var trnSortDir     = -1;

// USD-denominated sites get converted to a CAD estimate for every aggregate
// total/stat below; individual row Buy-in/Winnings columns stay raw as entered.
var USD_SITES = { 'wpt gold': true, 'coinpoker': true, 'acr': true };
var USD_RATE  = 1.35;
// Live events are logged with site "Live". They get their own Online vs Live
// table and filter rather than sitting among the online rooms.
function isLive(r) { return (r.site || '').toLowerCase() === 'live'; }

function siteRate(site) { return USD_SITES[(site || '').toLowerCase()] ? USD_RATE : 1; }

// Display money with thousands separators ("$111,079.35"). The CSV export keeps plain
// toFixed(2) so spreadsheets read the numbers as numbers.
function money(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
// Whole dollars for the summary tiles, where cents on a six-figure total are just noise.
function dollars(n) { return Math.round(n).toLocaleString('en-US'); }

function getInvested(r) { return r.totalInvested != null ? r.totalInvested : (r.buyin || 0); }
function fmtProfit(n) {
  if (n > 0)  return '<span class="positive">+$' + money(n) + '</span>';
  if (n < 0)  return '<span class="negative">-$' + money(Math.abs(n)) + '</span>';
  return '<span class="neutral">$0.00</span>';
}
function fmtRoi(roi) {
  if (roi > 0)  return '<span class="positive">+' + roi + '%</span>';
  if (roi < 0)  return '<span class="negative">'  + roi + '%</span>';
  return '<span class="neutral">0%</span>';
}
function escH(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return escH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function isItm(r) {
  if ((r.winnings || 0) <= 0) return false;
  if (r.onlyBounty) return false;
  return true;
}

function getBullets(r) { return 1 + (r.rebuys || 0); }

function calcStats(rows) {
  var inv = 0, baseInv = 0, win = 0, cashes = 0, best = 0, bullets = 0;
  rows.forEach(function(r) {
    var rate = siteRate(r.site);
    var rWin = (r.winnings || 0) * rate;
    inv     += getInvested(r) * rate;
    baseInv += (r.buyin || 0) * rate;
    win     += rWin;
    bullets += getBullets(r);
    if (isItm(r)) { cashes++; if (rWin > best) best = rWin; }
  });
  inv     = Math.round(inv * 100) / 100;
  baseInv = Math.round(baseInv * 100) / 100;
  win     = Math.round(win * 100) / 100;
  var profit = Math.round((win - inv) * 100) / 100;
  var roi    = inv > 0 ? Math.round(profit / inv * 1000) / 10 : 0;
  var itm    = bullets > 0 ? Math.round(cashes / bullets * 1000) / 10 : 0;
  return { count: rows.length, invested: inv, baseInvested: baseInv, winnings: win, profit: profit, roi: roi, itm: itm, cashes: cashes, best: best, bullets: bullets };
}

function stakeTier(buyin) {
  if (!buyin || buyin <= 0) return 'No buy-in';
  if (buyin <= 25)  return '≤ $25';
  if (buyin <= 55)  return '$26 – $55';
  if (buyin <= 110) return '$56 – $110';
  return '$111+';
}
var STAKE_ORDER = ['≤ $25', '$26 – $55', '$56 – $110', '$111+', 'No buy-in'];

function monthLabel(dateStr) {
  if (!dateStr) return 'Unknown';
  var parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
}

// ── Multi-day events ─────────────────────────────
// The log writes a multi-day tournament the way the money moved: each Day 1
// flight on its own date with its buy-in, then the Day 2 later at a $0 buy-in
// with the whole payout. Read row by row, a Day 2 looks like a free tournament
// that ran deep. So each Day 2 is folded together with the Day 1 flights
// behind it (same site and name, up to LINK_DAYS before, never past an earlier
// Day 2 of the same event) into one row dated on the Day 2. Busted flights
// count: another flight is another bullet, like a rebuy. Mirrors
// link_days() in StreamScripts\poker_results.py - change both together.
var DAY_PART  = /[\s\-–:\[(]*\b(?:day\s*(\d+)\s*[a-z]?|final\s+day)\b.*$/i;
var LINK_DAYS = 14;

function dayPart(name) {
  name = name || '';
  var m = DAY_PART.exec(name);
  if (!m) return { base: name, day: null };
  return { base: name.slice(0, m.index).trim(), day: m[1] ? parseInt(m[1], 10) : 2 };
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function shortDate(d) { return (d || '').slice(5); }

// A Day 1 is the first day of a real tournament, never a satellite, though
// some are logged as one - take its format from the name instead.
function dayOneType(r) {
  if (r.type !== 'Satellite') return r.type;
  var low = (r.name || '').toLowerCase();
  return low.indexOf('mystery') >= 0 ? 'Mystery'
       : (low.indexOf('bounty') >= 0 || low.indexOf('pko') >= 0) ? 'PKO' : 'Standard';
}

function linkDays(rows) {
  rows.forEach(function(r, i) {
    var p = dayPart(r.name);
    r._i = i; r._base = p.base; r._day = p.day; r._key = (r.site || '') + '|' + p.base.toLowerCase();
  });
  var taken = {}, lastDay2 = {}, events = [];
  rows.forEach(function(r) {
    if (!r._day || r._day < 2) return;
    var prev = lastDay2[r._key];
    var flights = rows.filter(function(f) {
      if (f._day !== 1 || taken[f._i] || f._key !== r._key) return false;
      var gap = daysBetween(f.date, r.date);
      if (gap < 0 || gap > LINK_DAYS) return false;
      if (prev && f.date <= prev) return false;
      return f.date < r.date || f._i < r._i;
    });
    lastDay2[r._key] = r.date;
    if (!flights.length) return;  // no Day 1 logged: leave the Day 2 as it is
    flights.forEach(function(f) { taken[f._i] = true; });
    taken[r._i] = true;
    var parts = flights.concat([r]);
    var bullets = 0, inv = 0, win = 0;
    parts.forEach(function(p) {
      if (p._day === 1 || (p.buyin || 0) > 0) bullets += getBullets(p);
      inv += getInvested(p); win += p.winnings || 0;
    });
    var type = r.type === 'Satellite' ? dayOneType(flights[0]) : r.type;
    events.push({
      date: r.date, name: r._base, site: r.site, type: type,
      buyin: Math.max.apply(null, flights.map(function(f) { return f.buyin || 0; })),
      rebuys: Math.max(bullets - 1, 0),
      totalInvested: Math.round(inv * 100) / 100,
      winnings: Math.round(win * 100) / 100,
      profit: Math.round((win - inv) * 100) / 100,
      onlyBounty: r.onlyBounty,
      days: 'Day 1 ' + flights.map(function(f) { return shortDate(f.date); }).join(', ') +
            ' · Day 2 ' + shortDate(r.date)
    });
  });
  var out = rows.filter(function(r) { return !taken[r._i]; }).map(function(r) {
    // A Day 1 nothing claimed: a bust, or a Day 2 not played yet. It keeps
    // its own row but groups under the event's name.
    if (r._day === 1) { r.days = 'Day 1 ' + shortDate(r.date); r.name = r._base; r.type = dayOneType(r); }
    return r;
  });
  return out.concat(events).sort(function(a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

// ── Load ─────────────────────────────────────────
function load() {
  fetch('data/results.json', { cache: 'no-store' })
    .then(function(r) { if (!r.ok) throw r.status; return r.json(); })
    .then(function(data) {
      allResults = linkDays(data || []).map(function(r) {
        if (r.profit == null) r.profit = Math.round(((r.winnings || 0) - getInvested(r)) * 100) / 100;
        return r;
      });
      populateSiteFilter();
      applyFilters();
    })
    .catch(function(err) {
      allResults = [];
      var msg = typeof err === 'number' ? 'HTTP ' + err : (err && err.message ? err.message : 'network error');
      document.getElementById('results-body').innerHTML =
        '<tr><td colspan="9" class="load-err">Could not load results: ' + msg + '</td></tr>';
      renderAll([]);
    });
}

function populateSiteFilter() {
  var sites = {};
  allResults.forEach(function(r) { if (r.site && !isLive(r)) sites[r.site] = true; });
  var sel = document.getElementById('f-site');
  var prev = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  Object.keys(sites).sort().forEach(function(s) {
    var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

// ── Filters ───────────────────────────────────────
function applyFilters() {
  var fName   = (document.getElementById('f-name').value || '').toLowerCase();
  var fSite   = document.getElementById('f-site').value;
  var fVenue  = document.getElementById('f-venue').value;
  var fType   = document.getElementById('f-type').value;
  var fFrom   = document.getElementById('f-date-from').value;
  var fTo     = document.getElementById('f-date-to').value;
  var fBuyMin = parseFloat(document.getElementById('f-buyin-min').value) || 0;
  var fBuyMax = parseFloat(document.getElementById('f-buyin-max').value) || Infinity;
  var fResult  = document.getElementById('f-result').value;
  var fEntries = document.getElementById('f-entries').value;

  filtered = allResults.filter(function(r) {
    if (fName && (r.name || '').toLowerCase().indexOf(fName) === -1) return false;
    if (fSite && r.site !== fSite) return false;
    if (fVenue === 'live'   && !isLive(r)) return false;
    if (fVenue === 'online' &&  isLive(r)) return false;
    if (fType && r.type !== fType) return false;
    if (fFrom && r.date < fFrom) return false;
    if (fTo   && r.date > fTo)   return false;
    if ((r.buyin || 0) < fBuyMin || (r.buyin || 0) > fBuyMax) return false;
    if (fResult === 'cash'   && !((r.winnings || 0) > 0))                 return false;
    if (fResult === 'bust'   && (r.winnings || 0) > 0)                    return false;
    if (fResult === 'profit' && !((r.winnings || 0) > getInvested(r)))    return false;
    if (fEntries === 'original' && (r.rebuys || 0) > 0)  return false;
    if (fEntries === 'rebuy'    && !((r.rebuys || 0) > 0)) return false;
    return true;
  });

  var hasFilter = fName || fSite || fVenue || fType || fFrom || fTo || fBuyMin || fBuyMax < Infinity || fResult || fEntries;
  document.getElementById('result-count').textContent = filtered.length + ' of ' + allResults.length + ' entries';
  document.getElementById('summary-scope').textContent = hasFilter ? '(filtered)' : '(all time)';

  sortFiltered();
  renderAll(filtered);
}

function resetFilters() {
  ['f-name','f-date-from','f-date-to','f-buyin-min','f-buyin-max'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('f-site').value    = '';
  document.getElementById('f-venue').value   = '';
  document.getElementById('f-type').value    = '';
  document.getElementById('f-result').value  = '';
  document.getElementById('f-entries').value = '';
  applyFilters();
}

function filterByName(name) {
  document.getElementById('f-name').value = name;
  applyFilters();
  document.getElementById('f-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Render All ────────────────────────────────────
function renderAll(rows) {
  renderSummary(rows);
  renderTop5Bottom5(rows);
  renderEntryTypeBreakdown(rows);
  renderStakeBreakdown(rows);
  renderVenueBreakdown(rows);
  renderSiteBreakdown(rows);
  renderTournamentBreakdown(rows);
  renderMonthlyTrend(rows);
  renderDayOfWeek(rows);
  renderResultsTable(rows);
}

// ── Summary ───────────────────────────────────────
function renderSummary(rows) {
  var s = calcStats(rows);
  document.getElementById('s-count').textContent    = s.count;
  document.getElementById('s-bullets').textContent  = s.bullets;
  document.getElementById('s-invested').textContent = '$' + dollars(s.invested);
  document.getElementById('s-winnings').textContent = '$' + dollars(s.winnings);
  document.getElementById('s-avg-buyin').textContent    = s.count > 0 ? '$' + money((s.baseInvested / s.count)) : '—';
  document.getElementById('s-avg-bullets').textContent  = s.count > 0 ? (s.bullets / s.count).toFixed(2) : '—';

  var profEl = document.getElementById('s-profit');
  profEl.textContent = (s.profit >= 0 ? '+$' : '-$') + dollars(Math.abs(s.profit));
  profEl.className = 'stat-value ' + (s.profit > 0 ? 'positive' : s.profit < 0 ? 'negative' : 'neutral');

  var roiEl = document.getElementById('s-roi');
  roiEl.textContent = (s.roi >= 0 ? '+' : '') + s.roi + '%';
  roiEl.className = 'stat-value ' + (s.roi > 0 ? 'positive' : s.roi < 0 ? 'negative' : 'neutral');

  document.getElementById('s-itm').textContent = s.itm + '%';
}

// ── Top 5 / Bottom 5 ─────────────────────────────
function renderTop5Bottom5(rows) {
  var groups = groupByName(rows);
  var sorted = groups.slice().sort(function(a, b) { return b.profit - a.profit; });
  document.getElementById('top5-body').innerHTML    = renderRankList(sorted.slice(0, 5), true);
  document.getElementById('bottom5-body').innerHTML = renderRankList(sorted.slice(-5).reverse(), false);
}

function groupByName(rows) {
  var map = {};
  rows.forEach(function(r) {
    var k = r.name || 'Unknown';
    if (!map[k]) map[k] = { name: k, site: r.site || '', type: r.type || '', rows: [] };
    map[k].rows.push(r);
    if (!map[k].site && r.site) map[k].site = r.site;
    if (!map[k].type && r.type) map[k].type = r.type;
  });
  return Object.keys(map).map(function(k) {
    var s = calcStats(map[k].rows);
    var avgBullets = s.count > 0 ? Math.round(s.bullets / s.count * 100) / 100 : 0;
    return { name: k, site: map[k].site, type: map[k].type, played: s.count, rebuys: s.bullets - s.count, itm: s.itm, avgBullets: avgBullets, invested: s.invested, winnings: s.winnings, profit: s.profit, roi: s.roi };
  });
}

function renderRankList(items) {
  if (!items.length) return '<div class="empty-msg">No data</div>';
  return '<table class="top5-table">' + items.map(function(item, i) {
    return '<tr><td style="width:28px;"><span class="rank-num">' + (i+1) + '</span></td>' +
      '<td><div class="top5-name" onclick="filterByName(' + escAttr(JSON.stringify(item.name)) + ')">' + escH(item.name) + '</div>' +
      '<div class="top5-meta">' + (item.site ? escH(item.site) + ' · ' : '') + item.played + ' played' + (item.rebuys > 0 ? ' + ' + item.rebuys + ' rebuy' + (item.rebuys === 1 ? '' : 's') : '') + ' · ' + item.itm + '% ITM</div></td>' +
      '<td style="text-align:right; white-space:nowrap;">' + fmtProfit(item.profit) + '<br><span style="font-size:11px;color:var(--text-muted);">' + (item.roi >= 0 ? '+' : '') + item.roi + '% ROI</span></td>' +
      '</tr>';
  }).join('') + '</table>';
}

// ── Original vs Rebuy Breakdown ───────────────────
// If a rebuy happened, the original stack already busted, so any winnings
// can only have come from the rebuy stack — attribute the whole win there,
// not split proportionally by dollars invested.
function renderEntryTypeBreakdown(rows) {
  var orig   = { count: 0, cashes: 0, invested: 0, winnings: 0 };
  var rebuy  = { count: 0, cashes: 0, invested: 0, winnings: 0 };
  rows.forEach(function(r) {
    var rate     = siteRate(r.site);
    var buyin    = (r.buyin || 0) * rate;
    var totalInv = getInvested(r) * rate;
    var rebuyInv = Math.max(0, totalInv - buyin);
    var win      = (r.winnings || 0) * rate;
    var cashed   = isItm(r) ? 1 : 0;
    var hasRebuy = rebuyInv > 0;

    orig.count++;
    orig.invested += buyin;
    if (!hasRebuy) { orig.cashes += cashed; orig.winnings += win; }

    if (hasRebuy) {
      rebuy.count += r.rebuys || 0;
      rebuy.cashes += cashed;
      rebuy.invested += rebuyInv;
      rebuy.winnings += win;
    }
  });

  function toRow(g) {
    var invested = Math.round(g.invested * 100) / 100;
    var winnings = Math.round(g.winnings * 100) / 100;
    var profit   = Math.round((winnings - invested) * 100) / 100;
    var roi      = invested > 0 ? Math.round(profit / invested * 1000) / 10 : 0;
    var itm      = g.count > 0 ? Math.round(g.cashes / g.count * 1000) / 10 : 0;
    return { count: g.count, itm: itm, invested: invested, winnings: winnings, profit: profit, roi: roi };
  }

  var groups = { 'Original buy-in': toRow(orig), 'Rebuy $ only': toRow(rebuy) };
  var tbody = document.getElementById('entrytype-body');
  var keys = ['Original buy-in', 'Rebuy $ only'].filter(function(k) { return groups[k].count; });
  if (!keys.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No data</td></tr>'; return; }
  tbody.innerHTML = keys.map(function(k) {
    var s = groups[k];
    return '<tr>' +
      '<td><b>' + k + '</b></td>' +
      '<td>' + s.count + '</td>' +
      '<td>' + s.itm + '%</td>' +
      '<td>$' + money(s.invested) + '</td>' +
      '<td>' + (s.winnings > 0 ? '$' + money(s.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(s.profit) + '</td>' +
      '<td>' + fmtRoi(s.roi) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Stake Breakdown ───────────────────────────────
function renderStakeBreakdown(rows) {
  var map = {};
  rows.forEach(function(r) {
    var k = stakeTier(r.buyin);
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  var tbody = document.getElementById('stake-body');
  var tiers = STAKE_ORDER.filter(function(k) { return map[k]; });
  if (!tiers.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No data</td></tr>'; return; }
  tbody.innerHTML = tiers.map(function(tier) {
    var s = calcStats(map[tier]);
    return '<tr>' +
      '<td><b>' + tier + '</b></td>' +
      '<td>' + s.count + '</td>' +
      '<td>' + s.itm + '%</td>' +
      '<td>$' + money(s.invested) + '</td>' +
      '<td>' + (s.winnings > 0 ? '$' + money(s.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(s.profit) + '</td>' +
      '<td>' + fmtRoi(s.roi) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Online vs Live ────────────────────────────────
function renderVenueBreakdown(rows) {
  var groups = [
    { label: 'Online', rows: rows.filter(function(r) { return !isLive(r); }) },
    { label: 'Live',   rows: rows.filter(isLive) }
  ].filter(function(g) { return g.rows.length; });
  var tbody = document.getElementById('venue-body');
  if (!groups.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No data</td></tr>'; return; }
  tbody.innerHTML = groups.map(function(g) {
    var s = calcStats(g.rows);
    return '<tr>' +
      '<td><b>' + g.label + '</b></td>' +
      '<td>' + s.count + '</td>' +
      '<td>' + s.itm + '%</td>' +
      '<td>$' + money(s.invested) + '</td>' +
      '<td>' + (s.winnings > 0 ? '$' + money(s.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(s.profit) + '</td>' +
      '<td>' + fmtRoi(s.roi) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Site Breakdown ────────────────────────────────
function renderSiteBreakdown(rows) {
  var map = {};
  rows.forEach(function(r) {
    if (isLive(r)) return;
    var k = r.site || '(no site)';
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  var tbody = document.getElementById('site-body');
  var sites = Object.keys(map).sort(function(a, b) {
    return calcStats(map[b]).profit - calcStats(map[a]).profit;
  });
  if (!sites.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No data</td></tr>'; return; }
  tbody.innerHTML = sites.map(function(site) {
    var s = calcStats(map[site]);
    return '<tr>' +
      '<td><b>' + escH(site) + '</b></td>' +
      '<td>' + s.count + '</td>' +
      '<td>' + s.itm + '%</td>' +
      '<td>$' + money(s.invested) + '</td>' +
      '<td>' + (s.winnings > 0 ? '$' + money(s.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(s.profit) + '</td>' +
      '<td>' + fmtRoi(s.roi) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Tournament Breakdown ──────────────────────────
function sortTrnGroups(groups) {
  groups.sort(function(a, b) {
    var av = a[trnSortKey], bv = b[trnSortKey];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av == null) av = -Infinity;
    if (bv == null) bv = -Infinity;
    return av < bv ? -trnSortDir : av > bv ? trnSortDir : 0;
  });
  return groups;
}

function sortTrnBy(key) {
  trnSortDir = trnSortKey === key ? -trnSortDir : -1;
  trnSortKey = key;
  var ths = document.querySelectorAll('#trn-breakdown-table th');
  ths.forEach(function(th) { th.classList.remove('sorted-asc','sorted-desc'); });
  var cols = ['name','type','site','played','itm','avgBullets','invested','winnings','profit','roi'];
  var idx  = cols.indexOf(key);
  if (idx >= 0) ths[idx].classList.add(trnSortDir === 1 ? 'sorted-asc' : 'sorted-desc');
  renderTournamentBreakdown(filtered);
}

function renderTournamentBreakdown(rows) {
  var groups = sortTrnGroups(groupByName(rows));
  var tbody = document.getElementById('trn-breakdown-body');
  if (!groups.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty-msg">No data</td></tr>'; return; }
  var shown = trnShowAll ? groups : groups.slice(0, PAGE_SIZE);
  var html = shown.map(function(g) {
    return '<tr>' +
      '<td><span class="name-link" onclick="filterByName(' + escAttr(JSON.stringify(g.name)) + ')">' + escH(g.name) + '</span></td>' +
      '<td style="font-size:11px; color:#4a7fc1; text-transform:uppercase; letter-spacing:0.05em;">' + escH(g.type || '—') + '</td>' +
      '<td style="font-size:11px; color:var(--gold-dim);">' + escH(g.site || '—') + '</td>' +
      '<td>' + g.played + '</td>' +
      '<td>' + g.itm + '%</td>' +
      '<td>' + g.avgBullets.toFixed(2) + '</td>' +
      '<td>$' + money(g.invested) + '</td>' +
      '<td>' + (g.winnings > 0 ? '$' + money(g.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(g.profit) + '</td>' +
      '<td>' + fmtRoi(g.roi) + '</td>' +
      '</tr>';
  }).join('');
  if (groups.length > PAGE_SIZE) {
    html += '<tr><td colspan="10" style="text-align:center; padding:12px;">' +
      (trnShowAll
        ? '<button class="btn-sm btn-showmore" onclick="trnShowAll=false; renderTournamentBreakdown(filtered);">Show Less</button>'
        : '<button class="btn-sm btn-showmore" onclick="trnShowAll=true; renderTournamentBreakdown(filtered);">Show More (' + (groups.length - PAGE_SIZE) + ' more)</button>') +
      '</td></tr>';
  }
  tbody.innerHTML = html;
}

// ── Monthly Trend ─────────────────────────────────
function renderMonthlyTrend(rows) {
  var map = {};
  var order = [];
  rows.forEach(function(r) {
    var k = (r.date || 'unknown').slice(0, 7);
    if (!map[k]) { map[k] = []; order.push(k); }
    map[k].push(r);
  });
  order.sort();
  var tbody = document.getElementById('monthly-body');
  if (!order.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No data</td></tr>'; return; }
  var running = 0;
  tbody.innerHTML = order.map(function(mo) {
    var s = calcStats(map[mo]);
    running = Math.round((running + s.profit) * 100) / 100;
    var runCls = running > 0 ? 'running-total-pos' : running < 0 ? 'running-total-neg' : '';
    return '<tr>' +
      '<td><b>' + monthLabel(mo + '-01') + '</b></td>' +
      '<td>' + s.count + '</td>' +
      '<td>' + s.itm + '%</td>' +
      '<td>$' + money(s.invested) + '</td>' +
      '<td>' + (s.winnings > 0 ? '$' + money(s.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(s.profit) + '</td>' +
      '<td class="' + runCls + '">' + (running >= 0 ? '+$' : '-$') + money(Math.abs(running)) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Day of Week ───────────────────────────────────
var DOW_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function getDow(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + 'T12:00:00');
  return DOW_ORDER[((d.getDay() + 6) % 7)]; // shift so Mon=0
}

function renderDayOfWeek(rows) {
  var map = {};
  rows.forEach(function(r) {
    var k = getDow(r.date);
    if (!k) return;
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  var tbody = document.getElementById('dow-body');
  var days = DOW_ORDER.filter(function(d) { return map[d]; });
  if (!days.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No data</td></tr>'; return; }
  tbody.innerHTML = DOW_ORDER.map(function(day) {
    if (!map[day]) return '<tr style="opacity:0.3;"><td>' + day + '</td><td colspan="6" style="color:var(--text-muted);font-size:12px;">no data</td></tr>';
    var s = calcStats(map[day]);
    return '<tr>' +
      '<td><b>' + day + '</b></td>' +
      '<td>' + s.count + '</td>' +
      '<td>' + s.itm + '%</td>' +
      '<td>$' + money(s.invested) + '</td>' +
      '<td>' + (s.winnings > 0 ? '$' + money(s.winnings) : '—') + '</td>' +
      '<td>' + fmtProfit(s.profit) + '</td>' +
      '<td>' + fmtRoi(s.roi) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Individual Results Table ──────────────────────
function sortFiltered() {
  filtered.sort(function(a, b) {
    var av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'totalInvested') { av = getInvested(a); bv = getInvested(b); }
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av == null) av = -Infinity;
    if (bv == null) bv = -Infinity;
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

function sortBy(key) {
  sortDir = sortKey === key ? -sortDir : -1;
  sortKey = key;
  document.querySelectorAll('table.results th').forEach(function(th) { th.classList.remove('sorted-asc','sorted-desc'); });
  var cols = ['date','name','type','site','buyin','rebuys','totalInvested','winnings','profit'];
  var idx  = cols.indexOf(key);
  if (idx >= 0) document.querySelectorAll('table.results th')[idx].classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
  sortFiltered();
  renderResultsTable(filtered);
}

function renderResultsTable(rows) {
  var tbody = document.getElementById('results-body');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-msg">No results match the current filters.</td></tr>'; return; }
  var shown = resultsShowAll ? rows : rows.slice(0, PAGE_SIZE);
  var html = shown.map(function(r) {
    var win      = r.winnings || 0;
    var inv      = getInvested(r);
    var prof     = r.profit != null ? r.profit : Math.round((win - inv) * 100) / 100;
    var invCell  = '-$' + money(inv);
    var entriesCell = r.rebuys > 0
      ? '<span class="rebuy-badge">+' + r.rebuys + ' rebuy' + (r.rebuys > 1 ? 's' : '') + '</span>'
      : '<span style="color:var(--text-muted);">Original</span>';
    return '<tr>' +
      '<td class="col-date">' + (r.date || '—') + '</td>' +
      '<td><span class="name-link" onclick="filterByName(' + escAttr(JSON.stringify(r.name || '')) + ')">' + escH(r.name) + '</span>' +
        (r.days ? '<div class="days-note">' + escH(r.days) + '</div>' : '') + '</td>' +
      '<td style="font-size:11px;color:#4a7fc1;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">' + escH(r.type || '—') + '</td>' +
      '<td class="col-site">' + escH(r.site || '—') + '</td>' +
      '<td class="col-num" style="color:var(--negative);">-$' + money((r.buyin || 0)) + '</td>' +
      '<td class="col-num">' + entriesCell + '</td>' +
      '<td class="col-num">' + invCell + '</td>' +
      '<td class="col-num">' + (win > 0 ? '<span style="color:var(--positive);">+$' + money(win) + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
      '<td class="col-num">' + fmtProfit(prof) + '</td>' +
      '</tr>';
  }).join('');
  if (rows.length > PAGE_SIZE) {
    html += '<tr><td colspan="9" style="text-align:center; padding:12px;">' +
      (resultsShowAll
        ? '<button class="btn-sm btn-showmore" onclick="resultsShowAll=false; renderResultsTable(filtered);">Show Less</button>'
        : '<button class="btn-sm btn-showmore" onclick="resultsShowAll=true; renderResultsTable(filtered);">Show More (' + (rows.length - PAGE_SIZE) + ' more)</button>') +
      '</td></tr>';
  }
  tbody.innerHTML = html;
}

// ── Export CSV ─────────────────────────────────────
function exportCSV() {
  var rows = [['Date','Tournament','Site','Buy-in','Rebuys','Total Invested','Winnings','Profit']];
  filtered.forEach(function(r) {
    var win  = r.winnings || 0;
    var inv  = getInvested(r);
    var prof = r.profit != null ? r.profit : Math.round((win - inv) * 100) / 100;
    rows.push([r.date || '', '"' + (r.name || '').replace(/"/g,'""') + '"', r.site || '',
      (r.buyin || 0).toFixed(2), (r.rebuys || 0), inv.toFixed(2), win.toFixed(2), prof.toFixed(2)]);
  });
  var csv = rows.map(function(r) { return r.join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'robpaaspoker-tournament-results-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

// ── Init ──────────────────────────────────────────
document.querySelectorAll('table.results th')[0].classList.add('sorted-desc');
load();
