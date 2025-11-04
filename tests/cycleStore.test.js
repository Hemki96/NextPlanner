import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after } from "node:test";

import { JsonCycleStore } from "../server/stores/json-cycle-store.js";

function createStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "nextplanner-cycle-store-"));
  const storageFile = path.join(dir, "cycles.json");
  const store = new JsonCycleStore({ storageFile });
  return { dir, store };
}

describe("JsonCycleStore", () => {
  let tempDir;
  let store;

  before(() => {
    const temp = createStore();
    tempDir = temp.dir;
    store = temp.store;
  });

  after(async () => {
    await store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("legt Trainingszyklen mit Wochen und Tagen an", async () => {
    const created = await store.createCycle({
      name: "Vorbereitung Sommer",
      cycleType: "volume",
      startDate: "2024-05-06",
      weeks: [{ weekNumber: 1, focusLabel: "Grundlagen", phase: "volume" }],
    });

    assert.equal(created.weeks.length, 1);
    const week = created.weeks[0];
    assert.equal(week.days.length, 7);
    const firstDay = week.days[0];
    assert.equal(firstDay.mainSetFocus, null);
    assert.equal(firstDay.planId, null);
    assert.ok(firstDay.date.startsWith("2024-05"));

    await store.updateDay(firstDay.id, { distance: 2400, volume: 2400, rpe: 5 });
    const refreshed = await store.getCycle(created.id);
    const refreshedWeek = refreshed.weeks[0];
    assert.equal(refreshedWeek.summary.totalDistance, 2400);
    assert.equal(refreshedWeek.summary.totalVolume, 2400);
    assert.equal(refreshedWeek.summary.averageRpe, 5);

    await store.updateDay(firstDay.id, { planId: 42 });
    const updatedDay = await store.getDay(firstDay.id);
    assert.equal(updatedDay.planId, 42);
  });

  it("aktualisiert Startdaten und hält Tagesdaten synchron", async () => {
    const cycle = await store.createCycle({
      name: "Intensitätsblock",
      cycleType: "intensity",
      startDate: "2024-06-03",
      weeks: [{ weekNumber: 1, focusLabel: "Speed", phase: "intensity" }],
    });

    const initialWeek = cycle.weeks[0];
    const originalFirstDay = initialWeek.days[0].date;
    await store.updateCycle(cycle.id, { startDate: "2024-06-10" });
    const updated = await store.getCycle(cycle.id);
    const updatedWeek = updated.weeks[0];
    const updatedFirstDay = updatedWeek.days[0].date;

    assert.notEqual(updatedFirstDay, originalFirstDay);
    assert.ok(updatedFirstDay.startsWith("2024-06-10"));
    assert.equal(updated.summary.weekCount, 1);
  });
});
