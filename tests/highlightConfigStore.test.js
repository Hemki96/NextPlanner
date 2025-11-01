import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { JsonHighlightConfigStore } from "../server/stores/json-highlight-config-store.js";
import { defaultIntensityCodes, defaultEquipmentItems } from "../public/js/config/constants.js";

test("JsonHighlightConfigStore lädt Standardwerte und erzeugt Dateien", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "highlight-config-"));
  const storageFile = path.join(dir, "config.json");
  const store = new JsonHighlightConfigStore({ storageFile });
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const config = await store.getConfig();
  assert.deepEqual(config.intensities, Array.from(defaultIntensityCodes));
  assert.deepEqual(config.equipment, Array.from(defaultEquipmentItems));
  assert.ok(typeof config.updatedAt === "string" && config.updatedAt.length > 0);
});

test("JsonHighlightConfigStore normalisiert Aktualisierungen und persistiert sie", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "highlight-config-update-"));
  const storageFile = path.join(dir, "config.json");
  const store = new JsonHighlightConfigStore({ storageFile });
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const updated = await store.updateConfig({
    intensities: [" en1 ", "EN1", "SPRINT"],
    equipment: ["Pullbuoy", "", "  Boards  ", "Boards"],
  });
  assert.deepEqual(updated.intensities, ["en1", "SPRINT"]);
  assert.deepEqual(updated.equipment, ["Pullbuoy", "Boards"]);

  const cleared = await store.updateConfig({ intensities: [], equipment: [] });
  assert.deepEqual(cleared.intensities, []);
  assert.deepEqual(cleared.equipment, []);

  const reopened = new JsonHighlightConfigStore({ storageFile });
  const persisted = await reopened.getConfig();
  assert.deepEqual(persisted.intensities, []);
  assert.deepEqual(persisted.equipment, []);
  await reopened.close();
});
