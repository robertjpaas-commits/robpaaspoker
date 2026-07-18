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

function buildDayMap() {
  const map = new Map();
  for (const day of DATA.days) map.set(day.date, day);
  return map;
}

/* ---------------- hero ---------------- */

function renderHero() {
  const days = DATA.days;
  const total = days.reduce((sum, d) => sum + d.total, 0);
  const heroEl = document.getElementById("hero-total");
  heroEl.textContent = fmtMoney(total, { signed: true });
  heroEl.className = "hero-figure " + (total >= 0 ? "positive" : "negative");

  const pct = Math.max(0, Math.min(100, (total / DATA.goal) * 100));
  document.getElementById("meter-fill").style.width = pct.toFixed(1) + "%";
  document.getElementById("meter-caption").textContent =
    `${fmtMoney(total)} of ${fmtMoney(DATA.goal)} · ${pct.toFixed(1)}% to goal`;

  document.getElementById("stat-days").textContent = days.length.toLocaleString();
  const avg = days.length ? total / days.length : 0;
  const avgEl = document.getElementById("stat-avg");
  avgEl.textContent = fmtMoney(avg, { signed: true });
  avgEl.className = "stat-value " + (avg >= 0 ? "positive" : "negative");

  if (days.length) {
    const best = days.reduce((a, b) => (b.total > a.total ? b : a));
    const worst = days.reduce((a, b) => (b.total < a.total ? b : a));
    document.getElementById("stat-best").textContent = fmtMoney(best.total, { signed: true });
    document.getElementById("stat-worst").textContent = fmtMoney(worst.total, { signed: true });
  }

  const generated = new Date(DATA.generated_at);
  document.getElementById("updated-line").textContent =
    "Last updated " + generated.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
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

    const heading = document.createElement("h3");
    heading.textContent = `${MONTH_NAMES[month - 1]} ${DATA.year}`;
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

    const daysInMonth = new Date(Date.UTC(DATA.year, month, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${DATA.year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const entry = dayMap.get(dateStr);
      const cell = document.createElement("div");

      if (!entry) {
        cell.className = "day-cell no-session";
        cell.textContent = d;
        cell.dataset.tooltip = `${MONTH_NAMES[month - 1]} ${d}\nNo session`;
      } else {
        const value = dayValue(entry);
        const isWin = value > 0.005;
        const isLoss = value < -0.005;
        cell.className = "day-cell " + (isWin ? "win" : isLoss ? "loss" : "no-session");
        cell.textContent = Math.abs(value) < 0.005 ? d : fmtMoney(value, { signed: true, compact: true });

        if (isWin || isLoss) {
          const alpha = 0.28 + 0.62 * Math.min(1, Math.abs(value) / maxAbs);
          const rgb = isWin ? "34,197,94" : "239,68,68";
          cell.style.background = `rgba(${rgb},${alpha})`;
        }

        let tooltip = `${MONTH_NAMES[month - 1]} ${d}\n`;
        if (currentSite === "ALL") {
          const lines = DATA.sites
            .filter((s) => Math.abs(entry.sites[s]) > 0.005)
            .map((s) => `${DATA.site_names[s] || s}: ${fmtMoney(entry.sites[s], { signed: true })}`);
          tooltip += lines.length ? lines.join("\n") + `\nTotal: ${fmtMoney(entry.total, { signed: true })}` : "No activity";
        } else {
          tooltip += `${DATA.site_names[currentSite] || currentSite}: ${fmtMoney(value, { signed: true })}`;
        }
        cell.dataset.tooltip = tooltip;
      }

      daysRow.appendChild(cell);
    }

    card.appendChild(daysRow);
    grid.appendChild(card);
  }
}

/* ---------------- graph ---------------- */

function renderChart() {
  const ctx = document.getElementById("profit-chart");
  const labels = DATA.days.map((d) => d.date);
  const values = DATA.days.map(dayValue);

  if (chart) {
    chart.destroy();
  }

  const commonScales = {
    x: {
      ticks: { color: "#898781", maxTicksLimit: 12, autoSkip: true },
      grid: { display: false },
    },
    y: {
      ticks: {
        color: "#898781",
        callback: (v) => "$" + Number(v).toLocaleString("en-US"),
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
    let running = 0;
    const cumulative = values.map((v) => (running += v));
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
              label: (item) => "Cumulative: " + fmtMoney(item.parsed.y, { signed: true }),
            },
          },
        },
        scales: commonScales,
      },
    });
  } else {
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
          },
        },
        scales: commonScales,
      },
    });
  }
}

function renderGraphToggle() {
  const buttons = document.querySelectorAll("#graph-toggle .pill");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
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

  renderHero();
  renderFilter();
  renderCalendar();
  renderGraphToggle();
  renderChart();
}

init();
