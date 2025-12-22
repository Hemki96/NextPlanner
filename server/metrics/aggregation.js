import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_WEEK_START = 1; // Monday
const SECONDS_PER_HOUR = 3600;

const DEFAULT_THRESHOLDS = Object.freeze({
  monotonyWarning: 1.5,
  monotonyCritical: 2.0,
  hardDayShare: 0.35,
  hardDaysPerWeek: 3,
  deloadDropMin: 0.2,
  deloadDropMax: 0.35,
  racePaceShareMin: 0.1,
});

function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date, weekStartsOn = DEFAULT_WEEK_START) {
  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = normalized.getUTCDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(normalized, -diff);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatWeekKey(date, weekStartsOn = DEFAULT_WEEK_START) {
  return toIsoDate(startOfWeek(date, weekStartsOn));
}

function formatMonthKey(date) {
  const start = startOfMonth(date);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value)
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeZoneMeters(zoneMeters = {}) {
  const normalized = {
    Z1: toNumber(zoneMeters.Z1, 0),
    Z2: toNumber(zoneMeters.Z2, 0),
    Z3: toNumber(zoneMeters.Z3, 0),
    Z4: toNumber(zoneMeters.Z4, 0),
    Z5: toNumber(zoneMeters.Z5, 0),
  };
  return normalized;
}

function sumZones(zoneMeters) {
  return zoneMeters.Z1 + zoneMeters.Z2 + zoneMeters.Z3 + zoneMeters.Z4 + zoneMeters.Z5;
}

function ensureKeySetMeters(zoneMeters, rawKeySetMeters) {
  const quality = zoneMeters.Z3 + zoneMeters.Z4 + zoneMeters.Z5;
  if (rawKeySetMeters === undefined || rawKeySetMeters === null) return quality;
  const keyed = toNumber(rawKeySetMeters, 0);
  if (Math.abs(keyed - quality) > 1e-6) {
    throw new Error(`Key-Set-Meter (${keyed}) müssen der Summe Z3–Z5 (${quality}) entsprechen.`);
  }
  return keyed;
}

function computeZoneShare(zoneMeters, distanceMeters) {
  if (!distanceMeters || distanceMeters <= 0) {
    return { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };
  }
  return {
    Z1: zoneMeters.Z1 / distanceMeters,
    Z2: zoneMeters.Z2 / distanceMeters,
    Z3: zoneMeters.Z3 / distanceMeters,
    Z4: zoneMeters.Z4 / distanceMeters,
    Z5: zoneMeters.Z5 / distanceMeters,
  };
}

function detectRacePace(session, targetEvent) {
  if (session.keySessionType === "race-pace") return true;
  if (session.tags.includes("race-pace")) return true;
  if (session.racePaceTargets?.event && targetEvent) {
    return String(session.racePaceTargets.event).toLowerCase() === String(targetEvent).toLowerCase();
  }
  return Boolean(session.racePaceTargets);
}

function normalizeSession(raw, defaults = {}) {
  const date = parseDateInput(raw.date ?? raw.sessionDate);
  if (!date) {
    throw new Error(`Ungültiges Datum für Einheit '${raw.title ?? raw.id}'.`);
  }
  const zoneMeters = normalizeZoneMeters(raw.zoneMeters ?? {
    Z1: raw.zoneZ1,
    Z2: raw.zoneZ2,
    Z3: raw.zoneZ3,
    Z4: raw.zoneZ4,
    Z5: raw.zoneZ5,
  });
  const computedDistance = sumZones(zoneMeters);
  const distanceMeters = toNumber(raw.distanceMeters, computedDistance);
  if (Math.abs(distanceMeters - computedDistance) > 1e-6) {
    throw new Error(
      `Distanz (${distanceMeters}) stimmt nicht mit Zonen-Summe (${computedDistance}) überein für Einheit '${raw.title ?? raw.id}'.`,
    );
  }
  const keySetMeters = ensureKeySetMeters(zoneMeters, raw.keySetMeters);
  const techniqueMeters = toNumber(raw.techniqueMeters, 0);
  if (techniqueMeters > distanceMeters) {
    throw new Error(`Technikmeter (${techniqueMeters}) überschreiten Gesamtdistanz (${distanceMeters}).`);
  }
  const longestBlockMeters = toNumber(raw.longestBlockMeters, 0);
  if (longestBlockMeters > distanceMeters) {
    throw new Error(`Längster Block (${longestBlockMeters}) überschreitet Gesamtdistanz (${distanceMeters}).`);
  }
  const plannedMinutes = toNumber(raw.plannedMinutes ?? raw.durationMinutes ?? raw.plannedDuration, 0);
  const tags = parseTags(raw.tags);
  const keySessionType = raw.keySessionType ?? "none";
  const mainGoalDay = raw.mainGoalDay ?? defaults.mainGoalDay;
  if (!mainGoalDay) {
    throw new Error(`Hauptziel-Tag (mainGoalDay) fehlt für Einheit '${raw.title ?? raw.id}'.`);
  }
  const normalized = {
    id: raw.id ?? raw.sessionId ?? raw.title ?? toIsoDate(date),
    title: raw.title ?? "Unbenannte Einheit",
    date,
    dateKey: toIsoDate(date),
    primaryStroke: raw.primaryStroke ?? "freestyle",
    distanceMeters,
    plannedMinutes,
    zoneMeters,
    zoneShare: raw.zoneShare ?? computeZoneShare(zoneMeters, distanceMeters),
    keySessionType,
    keySetMeters,
    qualityMeters: keySetMeters,
    techniqueMeters,
    longestBlockMeters,
    mainGoalDay,
    tags,
    racePaceTargets: raw.racePaceTargets,
  };
  normalized.isRacePace = detectRacePace(normalized, defaults.targetEvent ?? raw.targetEvent);
  return normalized;
}

export function normalizeSessions(rawSessions, defaults = {}) {
  if (!Array.isArray(rawSessions)) {
    throw new Error("Sessions müssen als Array übergeben werden.");
  }
  return rawSessions.map((session) => normalizeSession(session, defaults));
}

function computeDailyLoad(sessions) {
  const daily = new Map();
  for (const session of sessions) {
    const current = daily.get(session.dateKey) ?? { distance: 0, quality: 0, technique: 0 };
    current.distance += session.distanceMeters;
    current.quality += session.qualityMeters;
    current.technique += session.techniqueMeters;
    daily.set(session.dateKey, current);
  }
  return daily;
}

function computeMonotony(daily) {
  const loads = Array.from(daily.values()).map((entry) => entry.distance);
  if (loads.length === 0) {
    return { score: 0, warnings: [] };
  }
  const mean = loads.reduce((acc, value) => acc + value, 0) / loads.length;
  const variance =
    loads.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (loads.length === 1 ? 1 : loads.length - 1);
  const std = Math.sqrt(variance);
  const score = std === 0 ? mean === 0 ? 0 : Infinity : mean / std;
  return { score, mean, std, warnings: [] };
}

function detectHardDaySeries(daily, weekVolume, thresholds) {
  const threshold = (thresholds?.hardDayShare ?? DEFAULT_THRESHOLDS.hardDayShare) * weekVolume;
  const sortedDates = Array.from(daily.keys()).sort();
  let streak = 0;
  let maxStreak = 0;
  for (const dateKey of sortedDates) {
    const entry = daily.get(dateKey);
    const isHard = entry.distance >= threshold;
    streak = isHard ? streak + 1 : 0;
    if (streak > maxStreak) maxStreak = streak;
  }
  return { maxStreak, threshold };
}

function evaluateKeySpacing(sessions, thresholdHours = 48) {
  const sorted = [...sessions]
    .filter((session) => ["threshold", "vo2", "sprint", "race-pace"].includes(session.keySessionType))
    .sort((a, b) => a.date - b.date);
  const violations = [];
  let last = null;
  for (const session of sorted) {
    if (last) {
      const diffMs = session.date.getTime() - last.date.getTime();
      const diffHours = diffMs / (1000 * SECONDS_PER_HOUR);
      if (diffHours < thresholdHours) {
        violations.push({ current: session, previous: last, diffHours });
      }
    }
    last = session;
  }
  return { violations, compliant: violations.length === 0 };
}

function finalizeWeek(week) {
  const zoneTotals = week.zoneTotals;
  const distanceMeters = week.distanceMeters;
  const qualityMeters = week.qualityMeters;
  const techniqueMeters = week.techniqueMeters;
  const sessions = week.sessions.length;
  const zoneShare = computeZoneShare(zoneTotals, distanceMeters);
  const intensityDensityDistance = distanceMeters > 0 ? qualityMeters / distanceMeters : 0;
  const intensityDensitySessions = sessions > 0 ? qualityMeters / sessions : 0;
  const daily = computeDailyLoad(week.sessions);
  const monotony = computeMonotony(daily);
  const hardDaySeries = detectHardDaySeries(daily, distanceMeters, week.thresholds);
  const racePaceMeters = week.racePaceMeters ?? 0;
  const racePaceBlocks = week.racePaceBlocks ?? 0;
  const racePaceShare = distanceMeters > 0 ? racePaceMeters / distanceMeters : 0;
  return {
    weekKey: week.weekKey,
    startDate: week.startDate,
    endDate: week.endDate,
    distanceMeters,
    plannedMinutes: week.plannedMinutes,
    sessions,
    zoneTotals,
    zoneShare,
    qualityMeters,
    qualityPerSession: sessions > 0 ? qualityMeters / sessions : 0,
    techniqueMeters,
    techniqueShare: distanceMeters > 0 ? techniqueMeters / distanceMeters : 0,
    longestBlockMeters: week.longestBlockMeters,
    intensityDensityDistance,
    intensityDensitySessions,
    keySessionCounts: week.keySessionCounts,
    daily,
    monotony,
    hardDaySeries,
    racePaceMeters,
    racePaceBlocks,
    racePaceShare,
    warnings: [],
  };
}

function buildWeek(weekKey) {
  return {
    weekKey,
    startDate: weekKey,
    endDate: toIsoDate(addDays(new Date(`${weekKey}T00:00:00Z`), 6)),
    sessions: [],
    distanceMeters: 0,
    plannedMinutes: 0,
    zoneTotals: { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
    qualityMeters: 0,
    techniqueMeters: 0,
    longestBlockMeters: 0,
    keySessionCounts: { threshold: 0, vo2: 0, sprint: 0, "race-pace": 0, technique: 0 },
    racePaceMeters: 0,
    racePaceBlocks: 0,
  };
}

function aggregateWeekly(sessions, options = {}) {
  const buckets = new Map();
  const sorted = [...sessions].sort((a, b) => a.date - b.date);
  for (const session of sorted) {
    const weekKey = formatWeekKey(session.date, options.weekStartsOn ?? DEFAULT_WEEK_START);
    const bucket = buckets.get(weekKey) ?? buildWeek(weekKey);
    bucket.sessions.push(session);
    bucket.distanceMeters += session.distanceMeters;
    bucket.plannedMinutes += session.plannedMinutes;
    bucket.zoneTotals.Z1 += session.zoneMeters.Z1;
    bucket.zoneTotals.Z2 += session.zoneMeters.Z2;
    bucket.zoneTotals.Z3 += session.zoneMeters.Z3;
    bucket.zoneTotals.Z4 += session.zoneMeters.Z4;
    bucket.zoneTotals.Z5 += session.zoneMeters.Z5;
    bucket.qualityMeters += session.qualityMeters;
    bucket.techniqueMeters += session.techniqueMeters;
    bucket.longestBlockMeters = Math.max(bucket.longestBlockMeters, session.longestBlockMeters);
    const keyType = session.keySessionType;
    if (bucket.keySessionCounts[keyType] !== undefined) {
      bucket.keySessionCounts[keyType] += 1;
    }
    if (session.isRacePace) {
      bucket.racePaceMeters += session.distanceMeters;
      bucket.racePaceBlocks += session.longestBlockMeters;
    }
    buckets.set(weekKey, bucket);
  }
  return Array.from(buckets.values()).map((week) => finalizeWeek({ ...week, thresholds: options.thresholds }));
}

function aggregateMonthly(weeklyMetrics) {
  const buckets = new Map();
  for (const week of weeklyMetrics) {
    const monthKey = formatMonthKey(new Date(`${week.startDate}T00:00:00Z`));
    const bucket =
      buckets.get(monthKey) ?? {
        monthKey,
        weeks: 0,
        distanceMeters: 0,
        qualityMeters: 0,
        techniqueMeters: 0,
        sessions: 0,
      };
    bucket.weeks += 1;
    bucket.distanceMeters += week.distanceMeters;
    bucket.qualityMeters += week.qualityMeters;
    bucket.techniqueMeters += week.techniqueMeters;
    bucket.sessions += week.sessions;
    buckets.set(monthKey, bucket);
  }
  return Array.from(buckets.values()).map((month) => ({
    ...month,
    distanceKm: month.distanceMeters / 1000,
    qualityKm: month.qualityMeters / 1000,
    techniqueShare: month.distanceMeters > 0 ? month.techniqueMeters / month.distanceMeters : 0,
    avgSessionsPerWeek: month.weeks > 0 ? month.sessions / month.weeks : 0,
  }));
}

function computeRollingFourWeekAverage(weeklyMetrics) {
  const averages = [];
  for (let i = 0; i < weeklyMetrics.length; i += 1) {
    const slice = weeklyMetrics.slice(Math.max(0, i - 3), i + 1);
    const totalDistance = slice.reduce((acc, week) => acc + week.distanceMeters, 0);
    const totalQuality = slice.reduce((acc, week) => acc + week.qualityMeters, 0);
    averages.push({
      weekKey: weeklyMetrics[i].weekKey,
      distanceMeters: totalDistance / slice.length,
      qualityMeters: totalQuality / slice.length,
    });
  }
  return averages;
}

function detectDeloadWeeks(weeklyMetrics, thresholds = DEFAULT_THRESHOLDS) {
  const deloads = [];
  for (let i = 1; i < weeklyMetrics.length; i += 1) {
    const current = weeklyMetrics[i];
    const previous = weeklyMetrics[i - 1];
    if (!previous || previous.distanceMeters <= 0) continue;
    const drop = (previous.distanceMeters - current.distanceMeters) / previous.distanceMeters;
    const qualityDrop = previous.qualityMeters > 0 ? (previous.qualityMeters - current.qualityMeters) / previous.qualityMeters : 0;
    const matchesDistance = drop >= thresholds.deloadDropMin && drop <= thresholds.deloadDropMax;
    const matchesQuality = qualityDrop >= thresholds.deloadDropMin && qualityDrop <= thresholds.deloadDropMax;
    if (matchesDistance || matchesQuality) {
      deloads.push({ weekKey: current.weekKey, drop, qualityDrop });
    }
  }
  return deloads;
}

function evaluateAlerts(weeklyMetrics, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) };
  const alerts = [];
  const deloadWeeks = detectDeloadWeeks(weeklyMetrics, thresholds);
  const lastDeloadIndex = deloadWeeks.length > 0 ? weeklyMetrics.findIndex((week) => week.weekKey === deloadWeeks.at(-1).weekKey) : -1;
  for (let i = 0; i < weeklyMetrics.length; i += 1) {
    const week = weeklyMetrics[i];
    if (week.monotony.score > thresholds.monotonyCritical) {
      week.warnings.push({ type: "monotony-critical", message: `Monotonie ${week.monotony.score.toFixed(2)} > ${thresholds.monotonyCritical}` });
    } else if (week.monotony.score > thresholds.monotonyWarning) {
      week.warnings.push({ type: "monotony-warning", message: `Monotonie ${week.monotony.score.toFixed(2)} > ${thresholds.monotonyWarning}` });
    }
    if (week.hardDaySeries.maxStreak > thresholds.hardDaysPerWeek) {
      week.warnings.push({ type: "hard-day-streak", message: `Mehr als ${thresholds.hardDaysPerWeek} harte Tage in Serie.` });
    }
    if (week.racePaceShare < thresholds.racePaceShareMin && week.keySessionCounts["race-pace"] === 0) {
      week.warnings.push({ type: "race-pace-missing", message: "Race-Pace-Umfang < 10% und keine Race-Pace-Session." });
    }
    alerts.push(...week.warnings.map((warning) => ({ weekKey: week.weekKey, ...warning })));
  }
  if (lastDeloadIndex >= 0 && weeklyMetrics.length - 1 - lastDeloadIndex >= 4) {
    alerts.push({ type: "missing-deload", message: "Seit ≥4 Wochen kein Deload erkennbar." });
  }
  return { alerts, deloadWeeks };
}

export function aggregateTrainingData(rawSessions, options = {}) {
  const sessions = normalizeSessions(rawSessions, options.defaults ?? options);
  const weeklyMetrics = aggregateWeekly(sessions, { weekStartsOn: options.weekStartsOn, thresholds: options.thresholds });
  const keySpacing = evaluateKeySpacing(sessions, options.keySpacingHours ?? 48);
  const monthlyMetrics = aggregateMonthly(weeklyMetrics);
  const rollingFourWeek = computeRollingFourWeekAverage(weeklyMetrics);
  const alertSummary = evaluateAlerts(weeklyMetrics, { thresholds: options.thresholds });
  return {
    weeklyMetrics,
    monthlyMetrics,
    rollingFourWeek,
    keySpacing,
    ...alertSummary,
  };
}

export async function loadSessionsFromFile(filePath, defaults = {}) {
  const absolutePath = path.resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    const sessions = Array.isArray(parsed) ? parsed : parsed.sessions;
    if (!sessions) {
      throw new Error("JSON muss entweder ein Array oder ein Objekt mit 'sessions' enthalten.");
    }
    return normalizeSessions(sessions, { ...defaults, ...parsed.meta });
  }
  throw new Error(`Nicht unterstütztes Format: ${filePath}`);
}

export { DEFAULT_THRESHOLDS };

