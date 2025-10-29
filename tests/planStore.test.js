import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { describe, it, beforeEach, afterEach, mock } from "node:test";

import { JsonPlanStore, PlanValidationError, StorageIntegrityError } from "../js/storage/jsonPlanStore.js";

function createTempPath() {
  return mkdtempSync(join(tmpdir(), "nextplanner-store-"));
}

describe("JsonPlanStore", () => {
  let tempDir;
  let store;

  beforeEach(async () => {
    tempDir = createTempPath();
    const storageFile = join(tempDir, "plans.json");
    store = new JsonPlanStore({ storageFile });
    // Wait for the lazy initialization to finish to avoid race conditions in tests.
    await store.listPlans();
  });

  afterEach(async () => {
    await store?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("speichert und lädt Pläne mit Metadaten", async () => {
    const created = await store.createPlan({
      title: "Frühjahrszyklus",
      content: "Aufwärmen -> Technik -> Hauptsatz",
      planDate: "2024-05-01",
      focus: "AR",
      metadata: { duration: 90, coach: "Alex" },
    });

    assert.ok(created.id > 0);
    const loaded = await store.getPlan(created.id);
    assert.equal(loaded.title, "Frühjahrszyklus");
    assert.equal(loaded.focus, "AR");
    assert.equal(loaded.metadata.duration, 90);
    assert.equal(loaded.metadata.coach, "Alex");
  });

  it("filtert Pläne nach Datum und Fokus", async () => {
    await store.createPlan({
      title: "Grundlagenausdauer",
      content: "Lang ziehen",
      planDate: "2024-04-15",
      focus: "AR",
    });
    await store.createPlan({
      title: "Sprint",
      content: "Sprints",
      planDate: "2024-04-20",
      focus: "SP",
    });
    await store.createPlan({
      title: "Technik",
      content: "Drills",
      planDate: "2024-05-05",
      focus: "TE",
    });

    const aprilPlans = await store.listPlans({ from: "2024-04-01", to: "2024-04-30" });
    assert.equal(aprilPlans.length, 2);

    const focusPlans = await store.listPlans({ focus: "TE" });
    assert.equal(focusPlans.length, 1);
    assert.equal(focusPlans[0].title, "Technik");
  });

  it("aktualisiert bestehende Pläne", async () => {
    const plan = await store.createPlan({
      title: "Intervall",
      content: "4x100",
      planDate: "2024-03-01",
      focus: "AR",
    });

    const updated = await store.updatePlan(plan.id, {
      focus: "SP",
      metadata: { notes: "Vorbereitung Wettkampf" },
    });

    assert.equal(updated.focus, "SP");
    assert.equal(updated.metadata.notes, "Vorbereitung Wettkampf");
  });

  it("löscht Pläne", async () => {
    const plan = await store.createPlan({
      title: "Test",
      content: "Plan",
      planDate: "2024-02-01",
      focus: "AR",
    });

    const removed = await store.deletePlan(plan.id);
    assert.equal(removed, true);
    assert.equal(await store.getPlan(plan.id), null);
  });

  it("meldet Validierungsfehler mit eigener Fehlerklasse", async () => {
    await assert.rejects(
      store.createPlan({
        title: "",
        content: "",
        planDate: "2024-01-01",
        focus: "AR",
      }),
      PlanValidationError
    );
  });

  it("erstellt Sicherung bei korrupten Dateien und wirft Fehler", async () => {
    await store.close();
    const storageFile = join(tempDir, "plans.json");
    writeFileSync(storageFile, "{ this is invalid json", "utf8");

    store = new JsonPlanStore({ storageFile });

    await assert.rejects(store.listPlans(), StorageIntegrityError);

    const plans = await store.listPlans();
    assert.equal(plans.length, 0);
  });

  it("serialisiert gleichzeitige Schreibzugriffe", async () => {
    const operations = [];
    for (let index = 0; index < 10; index += 1) {
      operations.push(
        store.createPlan({
          title: `Plan ${index}`,
          content: "Training",
          planDate: "2024-01-01",
          focus: "AR",
        })
      );
    }

    await Promise.all(operations);
    const plans = await store.listPlans();
    assert.equal(plans.length, 10);
  });

  it("sichert Schreibvorgänge mit fsync für Datei und Verzeichnis ab", async () => {
    const syncCounts = { file: 0, dir: 0 };
    const originalOpen = fsPromises.open;
    const openMock = mock.method(fsPromises, "open", async (...args) => {
      const handle = await originalOpen(...args);
      const targetPath = String(args[0]);
      if (targetPath.endsWith(".tmp")) {
        const originalSync = handle.sync.bind(handle);
        handle.sync = async (...syncArgs) => {
          syncCounts.file += 1;
          return originalSync(...syncArgs);
        };
      } else if (targetPath === dirname(store.storageFile) && typeof handle.sync === "function") {
        const originalSync = handle.sync.bind(handle);
        handle.sync = async (...syncArgs) => {
          syncCounts.dir += 1;
          return originalSync(...syncArgs);
        };
      }
      return handle;
    });

    try {
      await store.createPlan({
        title: "Stabilitätstest",
        content: "Kraftzirkel",
        planDate: "2024-07-01",
        focus: "AR",
      });
    } finally {
      openMock.mock.restore();
    }

    assert.ok(syncCounts.file >= 1);
    assert.ok(syncCounts.dir >= 1);
  });
});
