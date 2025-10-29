import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after, mock } from "node:test";
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
    await store?.close();
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

    const stored = await store.getPlan(created.id);
    assert.equal(stored.metadata.coach, "Kim");
  });

  it("aktualisiert und löscht Pläne", async () => {
    const created = await store.createPlan({
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
    assert.equal(await store.getPlan(created.id), null);
  });

  it("validiert Content-Type und Nutzlast", async () => {
    const badContentType = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "title=foo",
    });
    assert.equal(badContentType.status, 415);

    const missingFields = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Plan" }),
    });
    assert.equal(missingFields.status, 400);
    const message = await missingFields.json();
    assert.match(message.error, /content ist erforderlich/);
  });

  it("unterstützt HEAD und OPTIONS mit CORS-Headern", async () => {
    const optionsResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "OPTIONS",
    });
    assert.equal(optionsResponse.status, 204);
    assert.equal(optionsResponse.headers.get("access-control-allow-origin"), "*");

    const created = await store.createPlan({
      title: "Technik",
      content: "Drills",
      planDate: "2024-06-03",
      focus: "TE",
    });

    const headResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "HEAD",
    });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headResponse.headers.get("access-control-allow-origin"), "*");
    const body = await headResponse.text();
    assert.equal(body, "");
  });

  it("liefert statische Dateien gestreamt mit Cache-Headern", async () => {
    const response = await fetch(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300");
    assert.ok(response.headers.get("etag"));
    const text = await response.text();
    assert.ok(text.includes("<!DOCTYPE html>"));

    const headResponse = await fetch(`${baseUrl}/styles.css`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.ok(Number.parseInt(headResponse.headers.get("content-length") ?? "0", 10) > 0);
    assert.equal(headResponse.headers.get("cache-control"), "public, max-age=300");
    assert.equal(await headResponse.text(), "");
  });

  it("schließt den Store beim Server-Shutdown", async () => {
    const temp = createTempStore();
    const localStore = temp.store;
    const closeMock = mock.method(localStore, "close", async () => {});
    const localServer = createServer({
      store: localStore,
      publicDir: repoRoot,
      gracefulShutdownSignals: [],
    });
    localServer.listen(0);
    await once(localServer, "listening");

    await new Promise((resolve) => localServer.close(resolve));

    assert.equal(closeMock.mock.calls.length, 1);

    closeMock.mock.restore();
    await localStore.close();
    rmSync(temp.dir, { recursive: true, force: true });
  });
});
