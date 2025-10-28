import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after } from "node:test";
import { fileURLToPath } from "node:url";

import { JsonPlanStore } from "../js/storage/jsonPlanStore.js";
import { createServer } from "../server/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function createTempStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "nextplanner-api-"));
  const storageFile = path.join(dir, "plans.json");
  const store = new JsonPlanStore({ storageFile });
  return { dir, store };
}

describe("Plan API", () => {
  let tempDir;
  let store;
  let server;
  let baseUrl;

  before(async () => {
    const temp = createTempStore();
    tempDir = temp.dir;
    store = temp.store;
    server = createServer({ store, publicDir: repoRoot });
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("legt neue Pläne an und listet sie", async () => {
    const payload = {
      title: "Testplan",
      content: "Aufwärmen\n200m",
      planDate: "2024-06-01",
      focus: "AR",
      metadata: { coach: "Kim" },
    };

    const response = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 201);
    const created = await response.json();
    assert.ok(created.id > 0);
    assert.equal(created.title, "Testplan");

    const listResponse = await fetch(`${baseUrl}/api/plans`);
    assert.equal(listResponse.status, 200);
    const plans = await listResponse.json();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].id, created.id);

    const stored = store.getPlan(created.id);
    assert.equal(stored.metadata.coach, "Kim");
  });

  it("aktualisiert und löscht Pläne", async () => {
    const created = store.createPlan({
      title: "Sprint",
      content: "6x50",
      planDate: "2024-06-02",
      focus: "SP",
    });

    const updateResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus: "TE" }),
    });

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.focus, "TE");

    const deleteResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 204);
    assert.equal(store.getPlan(created.id), null);
  });
});
