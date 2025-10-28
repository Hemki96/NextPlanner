import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach, afterEach } from "node:test";

import { JsonPlanStore } from "../js/storage/jsonPlanStore.js";

function createTempPath() {
  return mkdtempSync(join(tmpdir(), "nextplanner-store-"));
}

describe("JsonPlanStore", () => {
  let tempDir;
  let store;

  beforeEach(() => {
    tempDir = createTempPath();
    const storageFile = join(tempDir, "plans.json");
    store = new JsonPlanStore({ storageFile });
  });

  afterEach(() => {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("speichert und lädt Pläne mit Metadaten", () => {
    const created = store.createPlan({
      title: "Frühjahrszyklus",
      content: "Aufwärmen -> Technik -> Hauptsatz",
      planDate: "2024-05-01",
      focus: "AR",
      metadata: { duration: 90, coach: "Alex" },
    });

    assert.ok(created.id > 0);
    const loaded = store.getPlan(created.id);
    assert.equal(loaded.title, "Frühjahrszyklus");
    assert.equal(loaded.focus, "AR");
    assert.equal(loaded.metadata.duration, 90);
    assert.equal(loaded.metadata.coach, "Alex");
  });

  it("filtert Pläne nach Datum und Fokus", () => {
    store.createPlan({
      title: "Grundlagenausdauer",
      content: "Lang ziehen",
      planDate: "2024-04-15",
      focus: "AR",
    });
    store.createPlan({
      title: "Sprint",
      content: "Sprints",
      planDate: "2024-04-20",
      focus: "SP",
    });
    store.createPlan({
      title: "Technik",
      content: "Drills",
      planDate: "2024-05-05",
      focus: "TE",
    });

    const aprilPlans = store.listPlans({ from: "2024-04-01", to: "2024-04-30" });
    assert.equal(aprilPlans.length, 2);

    const focusPlans = store.listPlans({ focus: "TE" });
    assert.equal(focusPlans.length, 1);
    assert.equal(focusPlans[0].title, "Technik");
  });

  it("aktualisiert bestehende Pläne", () => {
    const plan = store.createPlan({
      title: "Intervall",
      content: "4x100",
      planDate: "2024-03-01",
      focus: "AR",
    });

    const updated = store.updatePlan(plan.id, {
      focus: "SP",
      metadata: { notes: "Vorbereitung Wettkampf" },
    });

    assert.equal(updated.focus, "SP");
    assert.equal(updated.metadata.notes, "Vorbereitung Wettkampf");
  });

  it("löscht Pläne", () => {
    const plan = store.createPlan({
      title: "Test",
      content: "Plan",
      planDate: "2024-02-01",
      focus: "AR",
    });

    const removed = store.deletePlan(plan.id);
    assert.equal(removed, true);
    assert.equal(store.getPlan(plan.id), null);
  });
});
