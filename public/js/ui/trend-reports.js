import { ApiError, apiRequest, canUseApi, describeApiError } from "../utils/api-client.js";
import { parsePlan } from "../parser/plan-parser.js";
import { formatDistance } from "../utils/distance.js";
import { formatPace } from "../utils/time.js";
import { triggerDownload } from "../utils/download.js";

const weekRangeFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
});

const fullDateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const percentFormatter = new Intl.NumberFormat("de-DE", {
  style: "percent",
  maximumFractionDigits: 0,
});

const distanceDiffFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const paceDiffFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function setStatus(element, message, type = "info") {
  if (!element) {
    return;
  }
  element.textContent = message;
  if (message) {
    element.dataset.statusType = type;
  } else {
    delete element.dataset.statusType;
  }
}

function parsePlanDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = value > 0 && value < 10_000_000_000 ? value * 1000 : value;
    const fromTimestamp = new Date(fromNumber);
    return Number.isNaN(fromTimestamp.getTime()) ? null : fromTimestamp;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfIsoWeek(date) {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay() || 7; // Sonntag = 7
  copy.setDate(copy.getDate() + 1 - day);
  return copy;
}

function endOfIsoWeek(date) {
  const start = startOfIsoWeek(date);
  const end = new Date(start.getTime());
  end.setDate(start.getDate() + 6);
  return end;
}

function getIsoWeekKey(date) {
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  const day = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - day);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const diff = Math.round((temp - yearStart) / 86400000);
  const week = Math.floor(diff / 7) + 1;
  return `${temp.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatWeekLabel(date) {
  const start = startOfIsoWeek(date);
  const end = endOfIsoWeek(date);
  return `${weekRangeFormatter.format(start)} – ${weekRangeFormatter.format(end)}`;
}

function formatDistanceChange(deltaMeters) {
  if (!Number.isFinite(deltaMeters) || Math.abs(deltaMeters) < 1) {
    return "±0 km";
  }
  const kilometers = Math.abs(deltaMeters) / 1000;
  const formatted = distanceDiffFormatter.format(kilometers);
  return `${deltaMeters > 0 ? "+" : "−"}${formatted} km`;
}

function formatPaceChange(deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || Math.abs(deltaSeconds) < 0.05) {
    return "±0 s/100m";
  }
  const formatted = paceDiffFormatter.format(Math.abs(deltaSeconds));
  return `${deltaSeconds > 0 ? "+" : "−"}${formatted} s/100m`;
}

function createFallbackMessage(list, message) {
  if (!list) {
    return;
  }
  list.innerHTML = "";
  const item = document.createElement("li");
  item.className = "trend-empty";
  item.textContent = message;
  list.appendChild(item);
}

function buildTrendReportMarkdown(summary) {
  if (!summary) {
    return null;
  }

  const now = new Date();
  const lines = [];
  lines.push(`# Trendbericht`, "");
  lines.push(`Erstellt am ${fullDateFormatter.format(now)} um ${now.toLocaleTimeString("de-DE")}.`, "");
  lines.push(`Ausgewertete Einheiten: ${summary.totalSessions}`);
  if (summary.firstDate && summary.lastDate) {
    lines.push(
      `Zeitraum: ${fullDateFormatter.format(summary.firstDate)} bis ${fullDateFormatter.format(summary.lastDate)}`,
    );
  }
  lines.push("");

  lines.push("## Wochenumfang", "");
  if (summary.weekly.length === 0) {
    lines.push("Keine Wochenhistorie verfügbar.");
  } else {
    for (const item of summary.weekly) {
      const change = Number.isFinite(item.change) ? ` (${formatDistanceChange(item.change)})` : "";
      lines.push(
        `- KW ${item.week} (${item.year}) – ${item.range}: ${formatDistance(item.distance)}${change}`,
      );
    }
  }
  lines.push("");

  lines.push("## Intensitätsverteilung (letzte 10 Einheiten)", "");
  if (summary.intensities.length === 0) {
    lines.push("Keine Intensitäten ermittelt.");
  } else {
    for (const intensity of summary.intensities) {
      const percentage = percentFormatter.format(intensity.share);
      lines.push(`- ${intensity.label}: ${percentage} (${formatDistance(intensity.distance)})`);
    }
  }
  lines.push("");

  lines.push("## Pace-Entwicklung (letzte 5 Einheiten)", "");
  if (summary.pace.length === 0) {
    lines.push("Keine Pace-Daten vorhanden.");
  } else {
    for (const pace of summary.pace) {
      const change = pace.change ? ` (${formatPaceChange(pace.change)})` : "";
      lines.push(
        `- ${fullDateFormatter.format(pace.date)} – ${formatPace(pace.pace)}${change}${pace.title ? ` – ${pace.title}` : ""}`,
      );
    }
  }

  lines.push("");
  lines.push("Export aus NextPlanner – automatische Trendanalyse.");
  return lines.join("\n");
}

function collectWeeklyVolumes(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!entry.date || !entry.metrics) {
      continue;
    }
    const key = getIsoWeekKey(entry.date);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        anchor: new Date(entry.date.getTime()),
        distance: 0,
        sessions: 0,
      });
    }
    const bucket = grouped.get(key);
    bucket.distance += entry.metrics.totalDistance ?? 0;
    bucket.sessions += 1;
    if (entry.date > bucket.anchor) {
      bucket.anchor = new Date(entry.date.getTime());
    }
  }

  const buckets = Array.from(grouped.values()).sort((a, b) => b.anchor - a.anchor);
  return buckets.map((bucket, index) => {
    const previous = buckets[index + 1] ?? null;
    const [yearPart, weekPart] = bucket.key.split("-W");
    return {
      weekKey: bucket.key,
      year: yearPart ?? String(bucket.anchor.getFullYear()),
      week: weekPart ?? bucket.key,
      range: formatWeekLabel(bucket.anchor),
      distance: bucket.distance,
      change: previous ? bucket.distance - previous.distance : null,
      sessions: bucket.sessions,
    };
  });
}

function collectIntensityDistribution(entries, limit = 10) {
  const relevant = entries.filter((entry) => entry.metrics).slice(0, limit);
  const totals = new Map();
  for (const entry of relevant) {
    const values = entry.metrics.intensities;
    if (!values || typeof values.values !== "function") {
      continue;
    }
    for (const intensity of values.values()) {
      const key = intensity.label?.toUpperCase?.() ?? "";
      if (!key) {
        continue;
      }
      const current = totals.get(key) ?? { label: intensity.label, distance: 0 };
      current.distance += intensity.distance ?? 0;
      totals.set(key, current);
    }
  }

  const totalDistance = Array.from(totals.values()).reduce((sum, item) => sum + item.distance, 0);
  if (totalDistance <= 0) {
    return [];
  }

  return Array.from(totals.values())
    .map((item) => ({
      label: item.label,
      distance: item.distance,
      share: item.distance / totalDistance,
    }))
    .sort((a, b) => b.distance - a.distance);
}

function collectPaceDevelopment(entries, limit = 5) {
  const paced = entries
    .filter((entry) => Number.isFinite(entry.metrics?.averagePaceSeconds) && entry.metrics.averagePaceSeconds > 0)
    .slice(0, limit);
  return paced.map((entry, index) => {
    const previous = paced[index + 1] ?? null;
    const change = previous ? entry.metrics.averagePaceSeconds - previous.metrics.averagePaceSeconds : null;
    return {
      date: entry.date,
      title: entry.title,
      pace: entry.metrics.averagePaceSeconds,
      change,
    };
  });
}

function renderWeeklyList(list, weekly) {
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (weekly.length === 0) {
    createFallbackMessage(list, "Noch keine Wochenhistorie verfügbar.");
    return;
  }

  const maxDistance = weekly.reduce((max, item) => Math.max(max, item.distance), 0) || 0;

  for (const item of weekly.slice(0, 6)) {
    const li = document.createElement("li");
    li.className = "trend-volume-item";

    const row = document.createElement("div");
    row.className = "trend-volume-row";

    const title = document.createElement("div");
    title.className = "trend-volume-title";

    const weekLabel = document.createElement("strong");
    weekLabel.textContent = `KW ${item.week}`;
    title.appendChild(weekLabel);

    const range = document.createElement("span");
    range.textContent = `${item.year} · ${item.range}`;
    title.appendChild(range);

    row.appendChild(title);

    const value = document.createElement("div");
    value.className = "trend-volume-value";
    value.textContent = formatDistance(item.distance);
    row.appendChild(value);

    li.appendChild(row);

    const bar = document.createElement("span");
    bar.className = "trend-bar";
    const ratio = maxDistance > 0 ? Math.max(0, Math.min(1, item.distance / maxDistance)) : 0;
    bar.style.setProperty("--trend-percent", `${Math.round(ratio * 100)}%`);
    li.appendChild(bar);

    const change = document.createElement("span");
    change.className = "trend-volume-change";
    change.textContent = Number.isFinite(item.change) ? formatDistanceChange(item.change) : "–";
    li.appendChild(change);

    list.appendChild(li);
  }
}

function renderIntensityList(list, intensities) {
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (intensities.length === 0) {
    createFallbackMessage(list, "Keine Intensitätsdaten gefunden.");
    return;
  }

  for (const item of intensities.slice(0, 8)) {
    const li = document.createElement("li");
    li.className = "trend-intensity-item";

    const header = document.createElement("div");
    header.className = "trend-intensity-row";

    const label = document.createElement("span");
    label.className = "trend-intensity-label";
    label.textContent = item.label;
    header.appendChild(label);

    const share = document.createElement("span");
    share.className = "trend-intensity-share";
    share.textContent = percentFormatter.format(item.share);
    header.appendChild(share);
    li.appendChild(header);

    const bar = document.createElement("span");
    bar.className = "trend-bar";
    bar.style.setProperty("--trend-percent", `${Math.round(item.share * 100)}%`);
    li.appendChild(bar);

    const distance = document.createElement("span");
    distance.className = "trend-intensity-distance";
    distance.textContent = formatDistance(item.distance);
    li.appendChild(distance);

    list.appendChild(li);
  }
}

function renderPaceList(list, paces) {
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (paces.length === 0) {
    createFallbackMessage(list, "Noch keine Pace-Daten vorhanden.");
    return;
  }

  for (const item of paces) {
    const li = document.createElement("li");
    li.className = "trend-pace-item";

    const header = document.createElement("div");
    header.className = "trend-pace-row";

    const date = document.createElement("span");
    date.className = "trend-pace-date";
    date.textContent = fullDateFormatter.format(item.date);
    header.appendChild(date);

    if (item.title) {
      const title = document.createElement("span");
      title.className = "trend-pace-title";
      title.textContent = item.title;
      header.appendChild(title);
    }

    const paceValue = document.createElement("strong");
    paceValue.className = "trend-pace-value";
    paceValue.textContent = formatPace(item.pace);
    header.appendChild(paceValue);

    li.appendChild(header);

    const change = document.createElement("span");
    change.className = "trend-pace-change";
    change.textContent = Number.isFinite(item.change) ? formatPaceChange(item.change) : "–";
    li.appendChild(change);

    list.appendChild(li);
  }
}

export function initTrendReports({
  container,
  statusElement,
  weeklyList,
  intensityList,
  paceList,
  exportButton,
}) {
  if (!container || !statusElement || !weeklyList || !intensityList || !paceList) {
    return {
      refresh() {},
    };
  }

  if (!canUseApi()) {
    setStatus(
      statusElement,
      "Trendberichte benötigen den laufenden lokalen Server (npm start).",
      "warning",
    );
    if (exportButton) {
      exportButton.disabled = true;
    }
    return {
      refresh() {},
    };
  }

  let entries = [];
  let summary = null;
  let loadingPromise = null;

  function updateSummary() {
    if (entries.length === 0) {
      summary = null;
      setStatus(statusElement, "Noch keine gespeicherten Einheiten verfügbar.", "info");
      createFallbackMessage(weeklyList, "Noch keine Wochenhistorie verfügbar.");
      createFallbackMessage(intensityList, "Keine Intensitätsdaten gefunden.");
      createFallbackMessage(paceList, "Noch keine Pace-Daten vorhanden.");
      if (exportButton) {
        exportButton.disabled = true;
      }
      return;
    }

    summary = {
      totalSessions: entries.length,
      firstDate: entries[entries.length - 1]?.date ?? null,
      lastDate: entries[0]?.date ?? null,
      weekly: collectWeeklyVolumes(entries),
      intensities: collectIntensityDistribution(entries),
      pace: collectPaceDevelopment(entries),
    };

    renderWeeklyList(weeklyList, summary.weekly);
    renderIntensityList(intensityList, summary.intensities);
    renderPaceList(paceList, summary.pace);

    const sinceLabel = summary.firstDate ? fullDateFormatter.format(summary.firstDate) : null;
    const untilLabel = summary.lastDate ? fullDateFormatter.format(summary.lastDate) : null;
    const rangeLabel = sinceLabel && untilLabel ? `${sinceLabel} – ${untilLabel}` : null;
    const suffix = rangeLabel ? ` (Zeitraum: ${rangeLabel})` : "";
    setStatus(statusElement, `Auswertung basiert auf ${summary.totalSessions} gespeicherten Einheiten${suffix}.`, "success");

    if (exportButton) {
      exportButton.disabled = false;
    }
  }

  async function loadHistory() {
    if (loadingPromise) {
      return loadingPromise;
    }

    loadingPromise = (async () => {
      setStatus(statusElement, "Trendberichte werden geladen …", "info");
      try {
        const { data } = await apiRequest("/api/plans");
        const records = Array.isArray(data) ? data : [];
        entries = records
          .map((record) => {
            const planDate = parsePlanDate(record.planDate);
            if (!planDate) {
              return null;
            }
            const metrics = parsePlan(record.content ?? "");
            return {
              id: record.id,
              title: record.title ?? "",
              focus: record.focus ?? "",
              date: planDate,
              metrics,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.date - a.date);
        updateSummary();
      } catch (error) {
        const message = describeApiError(error);
        const type = error instanceof ApiError ? (error.offline ? "warning" : "error") : "error";
        setStatus(statusElement, message, type);
        entries = [];
        summary = null;
        createFallbackMessage(weeklyList, "Keine Daten verfügbar.");
        createFallbackMessage(intensityList, "Keine Daten verfügbar.");
        createFallbackMessage(paceList, "Keine Daten verfügbar.");
        if (exportButton) {
          exportButton.disabled = true;
        }
      } finally {
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  }

  if (exportButton) {
    exportButton.addEventListener("click", () => {
      if (!summary) {
        return;
      }
      const markdown = buildTrendReportMarkdown(summary);
      if (!markdown) {
        return;
      }
      const timestamp = new Date();
      const filename = `trendbericht-${timestamp.toISOString().slice(0, 10)}.md`;
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      triggerDownload(filename, blob);
    });
  }

  document.addEventListener("nextplanner:plan-saved", () => {
    loadHistory().catch((error) => {
      console.error("Trendberichte konnten nach dem Speichern nicht aktualisiert werden", error);
    });
  });

  loadHistory().catch((error) => {
    console.error("Trendberichte konnten nicht geladen werden", error);
  });

  return {
    refresh() {
      return loadHistory();
    },
  };
}
