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
    assert.equal(response.headers.get("cache-control"), "no-store");
    const createdEtag = response.headers.get("etag");
    assert.ok(createdEtag);
    const created = await response.json();
    assert.ok(created.id > 0);
    assert.equal(created.title, "Testplan");

    const listResponse = await fetch(`${baseUrl}/api/plans`);
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.headers.get("cache-control"), "no-store");
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

    const initialResponse = await fetch(`${baseUrl}/api/plans/${created.id}`);
    assert.equal(initialResponse.status, 200);
    assert.equal(initialResponse.headers.get("cache-control"), "no-store");
    const initialEtag = initialResponse.headers.get("etag");
    assert.ok(initialEtag);

    const updateResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
      },
      body: JSON.stringify({ focus: "TE" }),
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.headers.get("cache-control"), "no-store");
    const updateEtag = updateResponse.headers.get("etag");
    assert.ok(updateEtag);
    assert.notEqual(updateEtag, initialEtag);
    const updated = await updateResponse.json();
    assert.equal(updated.focus, "TE");

    const deleteResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": updateEtag,
      },
    });
    assert.equal(deleteResponse.status, 204);
    assert.equal(deleteResponse.headers.get("cache-control"), "no-store");
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

  it("verhindert Änderungen mit veralteten ETags", async () => {
    const plan = await store.createPlan({
      title: "Double Update",
      content: "Plan",
      planDate: "2024-06-05",
      focus: "AR",
    });

    const initial = await fetch(`${baseUrl}/api/plans/${plan.id}`);
    const initialEtag = initial.headers.get("etag");
    assert.ok(initialEtag);

    const firstUpdate = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
      },
      body: JSON.stringify({ focus: "TE" }),
    });
    assert.equal(firstUpdate.status, 200);
    const freshEtag = firstUpdate.headers.get("etag");
    assert.ok(freshEtag);

    const conflict = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
      },
      body: JSON.stringify({ focus: "SP" }),
    });
    assert.equal(conflict.status, 412);
    assert.equal(conflict.headers.get("etag"), freshEtag);
    const conflictBody = await conflict.json();
    assert.equal(conflictBody.currentPlan.focus, "TE");

    const deleteConflict = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": initialEtag,
      },
    });
    assert.equal(deleteConflict.status, 412);
    assert.equal(deleteConflict.headers.get("etag"), freshEtag);
    const deleteBody = await deleteConflict.json();
    assert.equal(deleteBody.currentPlan.focus, "TE");

    const cleanup = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": freshEtag,
      },
    });
    assert.equal(cleanup.status, 204);
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

  it("liefert 304 für unveränderte Pläne", async () => {
    const plan = await store.createPlan({
      title: "Caching-Test",
      content: "Plan",
      planDate: "2024-06-06",
      focus: "AR",
    });

    const first = await fetch(`${baseUrl}/api/plans/${plan.id}`);
    assert.equal(first.status, 200);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const conditional = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get("etag"), etag);
    assert.equal(await conditional.text(), "");

    const headConditional = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "HEAD",
      headers: { "If-None-Match": etag },
    });
    assert.equal(headConditional.status, 304);
    assert.equal(headConditional.headers.get("etag"), etag);
    assert.equal(await headConditional.text(), "");

    const cleanup = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: { "If-Match": etag },
    });
    assert.equal(cleanup.status, 204);
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

  it("beantwortet konditionelle Anfragen mit 304, wenn Assets unverändert sind", async () => {
    const initial = await fetch(`${baseUrl}/index.html`);
    assert.equal(initial.status, 200);
    const etag = initial.headers.get("etag");
    const lastModified = initial.headers.get("last-modified");

    if (etag) {
      const conditional = await fetch(`${baseUrl}/index.html`, {
        headers: { "If-None-Match": etag },
      });
      assert.equal(conditional.status, 304);
      assert.equal(conditional.headers.get("etag"), etag);
      assert.equal(await conditional.text(), "");

      const headConditional = await fetch(`${baseUrl}/index.html`, {
        method: "HEAD",
        headers: { "If-None-Match": etag },
      });
      assert.equal(headConditional.status, 304);
      assert.equal(headConditional.headers.get("etag"), etag);
      assert.equal(await headConditional.text(), "");
    }

    if (lastModified) {
      const conditionalSince = await fetch(`${baseUrl}/index.html`, {
        headers: { "If-Modified-Since": lastModified },
      });
      assert.equal(conditionalSince.status, 304);
      assert.equal(await conditionalSince.text(), "");
    }
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
