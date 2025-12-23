#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { aggregateTrainingData, normalizeSessions, DEFAULT_THRESHOLDS } from "../metrics/aggregation.js";
import { RuntimeConfigError, buildRuntimeConfig } from "../config/runtime-config.js";

const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;

function printUsage() {
  console.log(`Verwendung: node server/cli/training-session-cli.js <befehl> --input <datei> [optionen]

Befehle:
  validate                Validiert die Einheiten-Datei (JSON/CSV).
  import --output <datei> Validiert und schreibt normalisierte JSON-Datei.
  report [--format=table|json]
                         Aggregiert die Metriken und gibt sie aus.

Optionen:
  --input=pfad            Pfad zu JSON- oder CSV-Datei (sessions-Array oder CSV-Header).
  --output=pfad           Zielpfad für normalisierte Sessions (nur bei import).
  --target-event=800m     Zielstrecke zur Race-Pace-Erkennung.
  --main-goal-day=YYYY-MM-DD
                         Fallback für mainGoalDay, falls in Sessions fehlt.
  --format=table|json     Ausgabeformat für report (Standard: table).
  --help                  Zeigt diese Hilfe an.
`);
}

function toCamel(flag) {
  return flag.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current.startsWith("--")) {
      const [rawFlag, ...rest] = current.slice(2).split("=");
      const flag = toCamel(rawFlag);
      if (rest.length > 0) {
        options[flag] = rest.join("=");
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options[flag] = next;
        i += 1;
      } else {
        options[flag] = true;
      }
    } else {
      positionals.push(current);
    }
  }
  return { command: positionals[0], options };
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = (cells[idx] ?? "").trim();
    });
    return record;
  });
}

function csvRowToSession(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    primaryStroke: row.primaryStroke,
    distanceMeters: row.distanceMeters,
    plannedMinutes: row.plannedMinutes,
    zoneMeters: {
      Z1: row.zoneZ1,
      Z2: row.zoneZ2,
      Z3: row.zoneZ3,
      Z4: row.zoneZ4,
      Z5: row.zoneZ5,
    },
    keySessionType: row.keySessionType,
    keySetMeters: row.keySetMeters,
    techniqueMeters: row.techniqueMeters,
    longestBlockMeters: row.longestBlockMeters,
    mainGoalDay: row.mainGoalDay,
    tags: row.tags?.split(/;|,/).map((tag) => tag.trim()).filter(Boolean),
    racePaceTargets:
      row.raceEvent || row.raceRepDistance || row.raceRestSeconds
        ? { event: row.raceEvent, repDistance: Number(row.raceRepDistance), restSeconds: Number(row.raceRestSeconds) }
        : undefined,
  };
}

async function loadInputFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const content = await readFile(absolutePath, "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(content);
    return {
      meta: parsed.meta ?? {},
      sessions: Array.isArray(parsed) ? parsed : parsed.sessions,
    };
  }
  if (filePath.endsWith(".csv")) {
    const rows = parseCsv(content);
    return { meta: {}, sessions: rows.map(csvRowToSession) };
  }
  throw new Error("Nur .json oder .csv werden unterstützt.");
}

function formatWeekRow(week) {
  const distanceKm = (week.distanceMeters / 1000).toFixed(1);
  const qualityKm = (week.qualityMeters / 1000).toFixed(1);
  const techShare = (week.techniqueShare * 100).toFixed(1);
  const monotony = Number.isFinite(week.monotony.score) ? week.monotony.score.toFixed(2) : "∞";
  const warnings = week.warnings.map((w) => w.type).join(", ") || "-";
  return `${week.weekKey} | ${distanceKm} km | Q: ${qualityKm} km | Technik: ${techShare}% | Mon: ${monotony} | Key ${JSON.stringify(week.keySessionCounts)} | Warnungen: ${warnings}`;
}

function printReport(report, format = "table") {
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("Wochenreport:");
  report.weeklyMetrics.forEach((week) => console.log(formatWeekRow(week)));
  console.log("");
  console.log("Monatsübersicht:");
  report.monthlyMetrics.forEach((month) => {
    console.log(
      `${month.monthKey}: ${(month.distanceKm).toFixed(1)} km, Qualität ${(month.qualityKm).toFixed(1)} km, Sessions/Woche ${month.avgSessionsPerWeek.toFixed(1)}`,
    );
  });
  console.log("");
  console.log("4-Wochen-Schnitt (Distanz km / Qualität km):");
  report.rollingFourWeek.forEach((entry) => {
    console.log(`${entry.weekKey}: ${(entry.distanceMeters / 1000).toFixed(1)} / ${(entry.qualityMeters / 1000).toFixed(1)}`);
  });
  console.log("");
  console.log(`48h-Regel: ${report.keySpacing.compliant ? "ok" : "Verstöße"} (${report.keySpacing.violations.length} Treffer)`);
  if (report.alerts.length > 0) {
    console.log("Alerts:");
    report.alerts.forEach((alert) => console.log(`- ${alert.weekKey ?? "global"}: ${alert.type} – ${alert.message}`));
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || options.help) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }
  try {
    buildRuntimeConfig();
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      console.error(error.message);
      process.exit(EXIT_ERROR);
    }
    throw error;
  }
  if (!options.input) {
    console.error("--input ist erforderlich.");
    process.exit(EXIT_ERROR);
  }
  try {
    const { meta, sessions } = await loadInputFile(options.input);
    const defaults = {
      targetEvent: options.targetEvent ?? meta.targetEvent,
      mainGoalDay: options.mainGoalDay ?? meta.targetRaceDay ?? meta.mainGoalDay,
    };
    if (command === "validate") {
      normalizeSessions(sessions, defaults);
      console.log(`✓ ${sessions.length} Einheiten valide.`);
      process.exit(EXIT_SUCCESS);
    }
    if (command === "import") {
      if (!options.output) {
        throw new Error("Für 'import' wird --output benötigt.");
      }
      const normalized = normalizeSessions(sessions, defaults);
      const payload = { meta: { ...meta, ...defaults }, sessions: normalized.map((session) => ({ ...session, date: session.dateKey })) };
      await writeFile(path.resolve(options.output), JSON.stringify(payload, null, 2));
      console.log(`✓ ${normalized.length} Einheiten validiert und nach ${options.output} geschrieben.`);
      process.exit(EXIT_SUCCESS);
    }
    if (command === "report") {
      const normalized = normalizeSessions(sessions, defaults);
      const report = aggregateTrainingData(normalized, { thresholds: DEFAULT_THRESHOLDS, weekStartsOn: 1, defaults });
      printReport(report, options.format ?? "table");
      process.exit(EXIT_SUCCESS);
    }
    throw new Error(`Unbekannter Befehl: ${command}`);
  } catch (error) {
    console.error(`✗ Fehler: ${error.message}`);
    process.exit(EXIT_ERROR);
  }
}

main();
