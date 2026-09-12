const POSITIVE = "#22c55e";
const NEGATIVE = "#ef4444";
const GOLD = "#c9a84c";
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

let DATA = null;
let currentSite = "ALL";
let currentMode = "cumulative";
let chart = null;

function fmtMoney(value, { signed = false, compact = false } = {}) {
  const sign = value < 0 ? "-" : signed ? "+" : "";
  const abs = Math.abs(value);
  let body;
  if (compact && abs >= 1000) {
    body = (abs / 1000).toFixed(1) + "k";
  } else {
    body = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return `${sign}$${body}`;
}

function dayValue(day) {
  return currentSite === "ALL" ? day.total : day.sites[currentSite] || 0;
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Bumped by anything that writes the hero figure. A count-up whose token is stale
// stops on its next frame: without this, picking a site during the opening animation
// left that animation to finish and overwrite the site's total with the combined one.
let countUpToken = 0;

function cancelCountUp() {
  countUpToken += 1;
}

function animateCountUp(el, to, duration, formatFn) {
  const token = (countUpToken += 1);
  if (prefersReducedMotion) {
    el.textContent = formatFn(to);
    return;
  }
  const start = performance.now();
  function frame(now) {
    if (token !== countUpToken) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatFn(to * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function buildDayMap() {
  const map = new Map();
  for (const day of DATA.days) map.set(day.date, day);
  return map;
}

// Every calendar date in `year`, Jan 1 through Dec 31, as "YYYY-MM-DD" strings —
// used so the chart's x-axis always spans the full year, not just tracked days.
function fullYearLabels(year) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31);
  const count = Math.round((end - start) / 86400000) + 1;
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86400000).toISOString().slice(0, 10)
  );
}

// Bounds for a single site's cumulative axis. Chart.js fits one tight to the data,
// which parks the peak flat against the top of the plot. This rounds out to a "nice"
// step and then adds one more step of headroom, so the line always has room above it.
// Not used for All Sites — that axis is pinned to the $100K goal on purpose.
function paddedAxis(values) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = (hi - lo) || 1;
  const rough = span / 6;                       // aim for roughly six gridlines
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return {
    min: lo < 0 ? Math.floor(lo / step) * step : 0,
    max: Math.ceil(hi / step) * step + step,
  };
}

// Indices (into `labels`) that land on the 1st of a month — the only x-axis ticks we show.
function monthStartIndices(labels) {
  const set = new Set();
  labels.forEach((date, i) => {
    if (date.endsWith("-01")) set.add(i);
  });
  return set;
}

function makeTooltip(dateLabel) {
  const tip = document.createElement("div");
  tip.className = "cell-tooltip";
  const dateEl = document.createElement("div");
  dateEl.className = "tt-date";
  dateEl.textContent = dateLabel;
  tip.appendChild(dateEl);
  return tip;
}

function addTooltipLine(tip, label, value, isTotal) {
  const line = document.createElement("div");
  line.className = "tt-line" + (isTotal ? " tt-total" : "");
  line.appendChild(document.createTextNode(label));
  const val = document.createElement("span");
  val.className = value >= 0 ? "tt-positive" : "tt-negative";
  val.textContent = fmtMoney(value, { signed: true });
  line.appendChild(val);
  tip.appendChild(line);
}

function addTooltipNote(tip, text) {
  const line = document.createElement("div");
  line.className = "tt-line tt-muted";
  line.textContent = text;
  tip.appendChild(line);
}

// What's on the day page beyond the money — photos, clips, checklist — plus the hint
// that the cell is clickable at all. All three fields come from export_daily_pages.py.
function addDayExtras(tip, entry) {
  if (!entry.page) return;
  const bits = [];
  if (entry.photos) bits.push(`${entry.photos} photo${entry.photos === 1 ? "" : "s"}`);
  if (entry.clips) bits.push(`${entry.clips} clip${entry.clips === 1 ? "" : "s"}`);
  if (entry.habits && entry.habits[1]) bits.push(`${entry.habits[0]}/${entry.habits[1]} checklist`);
  if (bits.length) addTooltipNote(tip, bits.join(" · "));

  const cta = document.createElement("div");
  cta.className = "tt-line tt-cta";
  cta.textContent = "View day →";
  tip.appendChild(cta);
}

/* ---------------- hero ---------------- */

// Every figure here follows the site filter, so it re-runs on each pill click. The
// count-up only plays on first load — re-animating on every click, with each click
// starting a fresh rAF loop writing to the same element, looked broken.
function renderHero({ animate = false } = {}) {
  const days = DATA.days;
  const isAll = currentSite === "ALL";
  const total = days.reduce((sum, d) => sum + dayValue(d), 0);

  const heroEl = document.getElementById("hero-total");
  heroEl.className = "hero-figure " + (total >= 0 ? "positive" : "negative");
  if (animate) {
    animateCountUp(heroEl, total, 1600, (v) => fmtMoney(v, { signed: true }));
  } else {
    cancelCountUp();
    heroEl.textContent = fmtMoney(total, { signed: true });
  }

  // Across every site, "played" means a day with logged session hours. For a single
  // site there are no per-site hours to filter on — one session covers every table on
  // every site at once — so a day counts for a site when that site produced a result.
  const activeDays = isAll
    ? days.filter((d) => (d.hours || 0) > 0)
    : days.filter((d) => Math.abs(dayValue(d)) > 0.005);
  const activeTotal = activeDays.reduce((sum, d) => sum + dayValue(d), 0);

  // Hours are only ever the session's total. Per site that's the hours logged on the
  // days that site was active, not hours spent on the site itself — the tile is
  // relabelled and given a title so it can't be read as the latter.
  const hours = (isAll ? days : activeDays)
    .reduce((sum, d) => sum + (d.hours || 0), 0);

  document.getElementById("label-days").textContent = isAll ? "Days played" : "Days active";
  document.getElementById("label-avg").textContent = isAll ? "Avg / day played" : "Avg / active day";
  document.getElementById("label-hours").textContent = isAll ? "Total hours" : "Hours those days";
  document.getElementById("label-hourly").textContent = "Hourly rate";

  const perSiteNote = isAll ? "" :
    "Session hours cover every site at once, so this is " +
    (DATA.site_names[currentSite] || currentSite) +
    "'s result over the hours played on the days it was active.";
  document.getElementById("stat-hourly-tile").title = perSiteNote;
  document.getElementById("stat-hours-tile").title = perSiteNote;

  document.getElementById("stat-days").textContent = activeDays.length.toLocaleString();

  const avg = activeDays.length ? activeTotal / activeDays.length : 0;
  const avgEl = document.getElementById("stat-avg");
  avgEl.textContent = fmtMoney(avg, { signed: true });
  avgEl.className = "stat-value " + (avg >= 0 ? "positive" : "negative");

  const bestEl = document.getElementById("stat-best");
  if (activeDays.length) {
    const best = Math.max(...activeDays.map(dayValue));
    bestEl.textContent = fmtMoney(best, { signed: true });
    // A site that only ever lost has a negative "best day" — don't paint it green.
    bestEl.className = "stat-value " + (best >= 0 ? "positive" : "negative");
  } else {
    bestEl.textContent = "—";
    bestEl.className = "stat-value";
  }

  const hourlyRate = hours > 0 ? total / hours : null;
  const hourlyEl = document.getElementById("stat-hourly");
  hourlyEl.textContent = hourlyRate === null ? "—" : fmtMoney(hourlyRate, { signed: true }) + "/hr";
  hourlyEl.className = "stat-value " + (hourlyRate !== null && hourlyRate < 0 ? "negative" : "positive");
  document.getElementById("stat-hours").textContent =
    hours.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/* ---------------- site filter ---------------- */

function renderFilter() {
  const row = document.getElementById("site-filter");
  row.textContent = "";

  const makePill = (key, label) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (key === currentSite ? " active" : "");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      currentSite = key;
      renderFilter();
      renderHero();
      renderCalendar();
      renderChart();
    });
    return btn;
  };

  row.appendChild(makePill("ALL", "All Sites"));
  for (const site of DATA.sites) {
    row.appendChild(makePill(site, DATA.site_names[site] || site));
  }
}

/* ---------------- calendar ---------------- */

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.textContent = "";
  const dayMap = buildDayMap();

  const visibleValues = DATA.days
    .map(dayValue)
    .filter((v) => Math.abs(v) > 0.005);
  const maxAbs = visibleValues.length ? Math.max(...visibleValues.map(Math.abs)) : 1;

  for (let month = 1; month <= 12; month++) {
    const card = document.createElement("div");
    card.className = "month-card";

    const daysInMonthCount = new Date(Date.UTC(DATA.year, month, 0)).getUTCDate();
    let monthTotal = 0;
    let monthHasData = false;
    for (let d = 1; d <= daysInMonthCount; d++) {
      const dateStr = `${DATA.year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const entry = dayMap.get(dateStr);
      if (entry) {
        monthTotal += dayValue(entry);
        monthHasData = true;
      }
    }

    const heading = document.createElement("h3");
    heading.className = "month-heading";
    const nameEl = document.createElement("span");
    nameEl.textContent = `${MONTH_NAMES[month - 1]} ${DATA.year}`;
    heading.appendChild(nameEl);
    if (monthHasData) {
      const totalEl = document.createElement("span");
      totalEl.className = "month-total " + (monthTotal >= 0.005 ? "positive" : monthTotal <= -0.005 ? "negative" : "neutral");
      totalEl.textContent = fmtMoney(monthTotal, { signed: true, compact: true });
      heading.appendChild(totalEl);
    }
    card.appendChild(heading);

    const weekdayRow = document.createElement("div");
    weekdayRow.className = "month-weekdays";
    for (const w of WEEKDAYS) {
      const cell = document.createElement("div");
      cell.textContent = w;
      weekdayRow.appendChild(cell);
    }
    card.appendChild(weekdayRow);

    const daysRow = document.createElement("div");
    daysRow.className = "month-days";

    const firstOfMonth = new Date(Date.UTC(DATA.year, month - 1, 1));
    const leadingBlanks = firstOfMonth.getUTCDay(); // 0 = Sunday
    for (let i = 0; i < leadingBlanks; i++) {
      const blank = document.createElement("div");
      blank.className = "day-cell empty";
      daysRow.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonthCount; d++) {
      const dateStr = `${DATA.year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const entry = dayMap.get(dateStr);
      // `page` is set by export_daily_pages.py for every date it actually generated a
      // file for, so a cell only ever links to a page that exists.
      const hasPage = Boolean(entry && entry.page);
      const cell = document.createElement(hasPage ? "a" : "div");
      if (hasPage) {
        cell.href = `../daily/${dateStr}.html`;
      }

      const dateLabel = `${MONTH_NAMES[month - 1]} ${d}`;

      if (!entry) {
        cell.className = "day-cell no-session";
        cell.textContent = d;
        const tip = makeTooltip(dateLabel);
        addTooltipNote(tip, "No session");
        cell.appendChild(tip);
      } else {
        const value = dayValue(entry);
        const played = (entry.hours || 0) > 0;
        const isWin = value > 0.005;
        const isLoss = value < -0.005;
        cell.className = "day-cell " + (isWin ? "win" : isLoss ? "loss" : "no-session");
        cell.textContent = isWin || isLoss
          ? (Math.abs(value) < 0.005 ? "$0" : fmtMoney(value, { signed: true, compact: true }))
          : d;

        if (isWin || isLoss) {
          const alpha = 0.28 + 0.62 * Math.min(1, Math.abs(value) / maxAbs);
          const rgb = isWin ? "34,197,94" : "239,68,68";
          cell.style.background = `rgba(${rgb},${alpha})`;
        }

        const tip = makeTooltip(dateLabel);
        if (currentSite === "ALL") {
          const activeSites = DATA.sites.filter((s) => Math.abs(entry.sites[s]) > 0.005);
          if (activeSites.length) {
            for (const s of activeSites) {
              addTooltipLine(tip, `${DATA.site_names[s] || s}: `, entry.sites[s], false);
            }
            addTooltipLine(tip, "Total: ", entry.total, true);
          } else {
            addTooltipNote(tip, played ? "Played — broke even" : "No activity");
          }
        } else {
          addTooltipLine(tip, `${DATA.site_names[currentSite] || currentSite}: `, value, false);
        }
        addDayExtras(tip, entry);
        cell.appendChild(tip);
      }

      if (hasPage) {
        cell.classList.add("has-page");
        // A marker dot, not a count: the cell is 9px of text already and the tooltip
        // carries the actual numbers.
        if (entry.photos || entry.clips) {
          const dot = document.createElement("span");
          dot.className = "day-dot";
          cell.appendChild(dot);
        }
      }

      daysRow.appendChild(cell);
    }

    card.appendChild(daysRow);
    grid.appendChild(card);
  }
}

/* ---------------- graph ---------------- */

// Draws a gold spade at the last real (non-null) point of the cumulative line —
// a little flourish marking "you are here". No-op for the daily bar chart.
// Dashed line across the top of the cumulative chart at the $100K goal. Cumulative
// mode only — on the daily bars a $100K line would be meaningless.
const goalLinePlugin = {
  id: "goalLine",
  afterDatasetsDraw(chartInstance) {
    const yScale = chartInstance.scales.y;
    const y = yScale.getPixelForValue(DATA.goal);
    if (y < chartInstance.chartArea.top || y > chartInstance.chartArea.bottom) return;

    const { ctx, chartArea } = chartInstance;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#7a5e28";
    ctx.lineWidth = 1;
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.restore();
  },
};

const spadeEndpointPlugin = {
  id: "spadeEndpoint",
  afterDatasetsDraw(chartInstance) {
    const data = chartInstance.data.datasets[0].data;
    let lastIndex = -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i] !== null && data[i] !== undefined) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex === -1) return;
    const point = chartInstance.getDatasetMeta(0).data[lastIndex];
    if (!point) return;

    const { ctx } = chartInstance;
    ctx.save();
    ctx.font = "26px 'Segoe UI Symbol', sans-serif";
    ctx.fillStyle = GOLD;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♠", point.x, point.y);
    ctx.restore();
  },
};

function renderChart() {
  const ctx = document.getElementById("profit-chart");
  const labels = fullYearLabels(DATA.year);
  const dayMap = buildDayMap();
  const monthStarts = monthStartIndices(labels);
  const lastRecordedDate = DATA.days.length ? DATA.days[DATA.days.length - 1].date : null;

  if (chart) {
    chart.destroy();
  }

  const commonScales = {
    x: {
      ticks: {
        color: "#898781",
        autoSkip: false,
        callback: (value, index, ticks) => {
          const date = labels[ticks[index].value];
          return MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3);
        },
      },
      afterBuildTicks: (axis) => {
        axis.ticks = axis.ticks.filter((t) => monthStarts.has(t.value));
      },
      grid: { display: false },
    },
    y: {
      ticks: {
        color: "#898781",
        // Sign outside the dollar sign: "$-20,000" reads as a typo.
        callback: (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US"),
      },
      grid: { color: "#2c2c2a" },
    },
  };

  const tooltipBase = {
    displayColors: false,
    backgroundColor: "#050505",
    borderColor: "#2a2a2a",
    borderWidth: 1,
    titleColor: "#c3c2b7",
    bodyColor: "#e8e2d6",
    bodyFont: { weight: "600" },
    callbacks: {
      title: (items) => {
        const d = new Date(items[0].label + "T00:00:00");
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      },
    },
  };

  if (currentMode === "cumulative") {
    // Real tracked days accumulate; untracked gap days within the tracked range
    // carry the running total flat (nothing happened); days beyond the last
    // recorded date are null so the line simply stops there.
    let running = 0;
    const cumulative = labels.map((date) => {
      const entry = dayMap.get(date);
      if (entry) {
        running += dayValue(entry);
        return running;
      }
      if (lastRecordedDate && date <= lastRecordedDate) return running;
      return null;
    });
    const realCumulative = cumulative.filter((v) => v !== null);
    const isAll = currentSite === "ALL";
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: cumulative,
          borderColor: GOLD,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: GOLD,
          pointHoverBorderColor: "#0d0d0d",
          pointHoverBorderWidth: 2,
          fill: true,
          backgroundColor: "rgba(201,168,76,0.10)",
          tension: 0.15,
          spanGaps: false,
        }],
      },
      // The goal line is meaningless on one site's own curve.
      plugins: isAll ? [goalLinePlugin, spadeEndpointPlugin] : [spadeEndpointPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipBase,
            callbacks: {
              ...tooltipBase.callbacks,
              label: (item) => "Cumulative: " + fmtMoney(item.parsed.y, { signed: true }),
            },
            filter: (item) => item.parsed.y !== null,
          },
        },
        scales: {
          ...commonScales,
          // Combined: pin the axis so the $100K goal line is always the ceiling.
          // Asking Chart.js for that ceiling instead made it step ticks by 20K and
          // open a dead -$20,000 band under a curve that barely dips below zero.
          // Single site: let Chart.js fit the site's own range, or a site that made
          // $2,000 would be a flat line along the bottom of a $100,000 axis.
          y: isAll
            ? {
                ...commonScales.y,
                min: Math.min(0, Math.floor(Math.min(...realCumulative) / 5000) * 5000),
                max: Math.max(DATA.goal, ...realCumulative),
              }
            : { ...commonScales.y, ...paddedAxis(realCumulative) },
        },
      },
    });
  } else if (currentMode === "daily") {
    const values = labels.map((date) => {
      const entry = dayMap.get(date);
      return entry ? dayValue(entry) : null;
    });
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: values.map((v) => (v >= 0 ? POSITIVE : NEGATIVE)),
          borderRadius: 2,
          maxBarThickness: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipBase,
            callbacks: {
              ...tooltipBase.callbacks,
              label: (item) => "Profit: " + fmtMoney(item.parsed.y, { signed: true }),
            },
            filter: (item) => item.parsed.y !== null,
          },
        },
        scales: commonScales,
      },
    });
  } else {
    // Monthly: one bar per month, that month's net for the selected site. A month
    // with no tracked day at all stays null — no bar — so the months after the latest
    // session read as not-yet-played rather than as break-even.
    const monthly = Array(12).fill(null);
    for (const day of DATA.days) {
      const m = Number(day.date.slice(5, 7)) - 1;
      monthly[m] = (monthly[m] || 0) + dayValue(day);
    }
    const realMonthly = monthly.filter((v) => v !== null);
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: MONTH_NAMES.map((name) => name.slice(0, 3)),
        datasets: [{
          data: monthly,
          backgroundColor: monthly.map((v) => (v >= 0 ? POSITIVE : NEGATIVE)),
          borderRadius: 3,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipBase,
            callbacks: {
              // The shared title callback parses its label as a date; "Jan" isn't one.
              title: (items) => `${MONTH_NAMES[items[0].dataIndex]} ${DATA.year}`,
              label: (item) => "Profit: " + fmtMoney(item.parsed.y, { signed: true }),
            },
            filter: (item) => item.parsed.y !== null,
          },
        },
        scales: {
          // Twelve real categories, so none of the daily axis's tick filtering applies.
          x: { ticks: { color: "#898781" }, grid: { display: false } },
          y: { ...commonScales.y, ...paddedAxis(realMonthly) },
        },
      },
    });
  }
}

function renderGraphToggle() {
  document.querySelectorAll("#graph-toggle .pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
  });
}

// Bound once, at boot. This used to live inside renderGraphToggle(), which each click
// re-ran — so every click stacked another listener, and after a few toggles a single
// click redrew the chart once per accumulated listener.
function bindGraphToggle() {
  document.querySelectorAll("#graph-toggle .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMode = btn.dataset.mode;
      renderGraphToggle();
      renderChart();
    });
  });
}

/* ---------------- boot ---------------- */

async function init() {
  const res = await fetch("data/2026.json", { cache: "no-store" });
  DATA = await res.json();

  renderHero({ animate: true });
  renderFilter();
  renderCalendar();
  bindGraphToggle();
  renderGraphToggle();
  renderChart();
}

init();
