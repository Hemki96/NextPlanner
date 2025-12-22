import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregateTrainingData, normalizeSessions } from "../server/metrics/aggregation.js";

async function loadSessions(fileName) {
  const fullPath = path.join(process.cwd(), "data", "training-sessions", fileName);
  const raw = JSON.parse(await readFile(fullPath, "utf8"));
  return { meta: raw.meta ?? {}, sessions: raw.sessions };
}

test("normalizes sessions and enforces key-set meters", async () => {
  const { meta, sessions } = await loadSessions("build-week.json");
  const normalized = normalizeSessions(sessions, { targetEvent: meta.targetEvent, mainGoalDay: meta.targetRaceDay });
  assert.equal(normalized.length, sessions.length);
  assert.ok(normalized.every((session) => session.qualityMeters === session.zoneMeters.Z3 + session.zoneMeters.Z4 + session.zoneMeters.Z5));
});

test("aggregates weekly metrics for build week", async () => {
  const { meta, sessions } = await loadSessions("build-week.json");
  const normalized = normalizeSessions(sessions, { targetEvent: meta.targetEvent, mainGoalDay: meta.targetRaceDay });
  const report = aggregateTrainingData(normalized, { weekStartsOn: 1 });
  const week = report.weeklyMetrics.find((entry) => entry.weekKey === "2024-06-10");
  assert.ok(week, "Week starting 2024-06-10 should exist");
  assert.equal(week.distanceMeters, 29300);
  assert.equal(week.qualityMeters, 11400);
  assert.equal(week.longestBlockMeters, 1800);
  assert.equal(week.keySessionCounts["race-pace"], 1);
  assert.ok(week.racePaceShare > 0.3);
});

test("detects deload week drop and 48h spacing issues", async () => {
  const build = await loadSessions("build-week.json");
  const deload = await loadSessions("deload-week.json");
  const combined = [...build.sessions, ...deload.sessions];
  const normalized = normalizeSessions(combined, { targetEvent: build.meta.targetEvent, mainGoalDay: build.meta.targetRaceDay });
  const report = aggregateTrainingData(normalized, { weekStartsOn: 1 });
  assert.ok(report.deloadWeeks.length >= 1, "Should flag at least one deload week");
  assert.ok(report.keySpacing.violations.length >= 1, "Should flag 48h spacing issues");
});
