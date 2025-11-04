import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after, mock } from "node:test";
import { fileURLToPath } from "node:url";

import { JsonPlanStore } from "../server/stores/json-plan-store.js";
import { JsonSnippetStore } from "../server/stores/json-snippet-store.js";
import { JsonTemplateStore } from "../server/stores/json-template-store.js";
import { JsonCycleStore } from "../server/stores/json-cycle-store.js";
import { JsonHighlightConfigStore } from "../server/stores/json-highlight-config-store.js";
import { createServer } from "../server/app.js";
import { sanitizeQuickSnippetGroups } from "../public/js/utils/snippet-storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function createTempStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "nextplanner-api-"));
  const storageFile = path.join(dir, "plans.json");
  const snippetFile = path.join(dir, "snippets.json");
  const templateFile = path.join(dir, "templates.json");
  const highlightFile = path.join(dir, "highlight.json");
  const cycleFile = path.join(dir, "cycles.json");
  const store = new JsonPlanStore({ storageFile });
  const snippetStore = new JsonSnippetStore({ storageFile: snippetFile });
  const templateStore = new JsonTemplateStore({ storageFile: templateFile });
  const highlightStore = new JsonHighlightConfigStore({ storageFile: highlightFile });
  const cycleStore = new JsonCycleStore({ storageFile: cycleFile });
  return { dir, store, snippetStore, templateStore, highlightStore, cycleStore };
}

describe("Plan API", () => {
  let tempDir;
  let store;
  let snippetStore;
  let server;
  let baseUrl;
  let templateStore;
  let highlightStore;
  let cycleStore;

  before(async () => {
    const temp = createTempStore();
    tempDir = temp.dir;
    store = temp.store;
    snippetStore = temp.snippetStore;
    templateStore = temp.templateStore;
    highlightStore = temp.highlightStore;
    cycleStore = temp.cycleStore;
    server = createServer({
      store,
      templateStore,
      snippetStore,
      highlightConfigStore: highlightStore,
      cycleStore,
      publicDir: path.join(repoRoot, "public"),
    });
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store?.close();
    await snippetStore?.close();
    await templateStore?.close();
    await highlightStore?.close();
    await cycleStore?.close();
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

    const originalPlan = await initialResponse.json();
    const updatePayload = {
      title: originalPlan.title,
      content: originalPlan.content,
      planDate: originalPlan.planDate,
      focus: "TE",
      metadata: originalPlan.metadata ?? {},
    };

    const updateResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
      },
      body: JSON.stringify(updatePayload),
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
    assert.match(message.error.message, /content ist erforderlich/);
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

    const initialBody = await initial.json();
    const firstPayload = {
      title: initialBody.title,
      content: initialBody.content,
      planDate: initialBody.planDate,
      focus: "TE",
      metadata: initialBody.metadata ?? {},
    };
    const firstUpdate = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
      },
      body: JSON.stringify(firstPayload),
    });
    assert.equal(firstUpdate.status, 200);
    const freshEtag = firstUpdate.headers.get("etag");
    assert.ok(freshEtag);

    const conflictPayload = { ...firstPayload, focus: "SP" };
    const conflict = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
      },
      body: JSON.stringify(conflictPayload),
    });
    assert.equal(conflict.status, 412);
    assert.equal(conflict.headers.get("etag"), freshEtag);
    const conflictBody = await conflict.json();
    assert.equal(conflictBody.error.details?.currentPlan?.focus, "TE");

    const deleteConflict = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": initialEtag,
      },
    });
    assert.equal(deleteConflict.status, 412);
    assert.equal(deleteConflict.headers.get("etag"), freshEtag);
    const deleteBody = await deleteConflict.json();
    assert.equal(deleteBody.error.details?.currentPlan?.focus, "TE");

    const cleanup = await fetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": freshEtag,
      },
    });
    assert.equal(cleanup.status, 204);
  });

  it("verknüpft Pläne mit Trainingszyklen", async () => {
    const cyclePayload = {
      name: "Vorbereitung Sommer",
      cycleType: "volume",
      startDate: "2024-07-01",
      weeks: [
        {
          weekNumber: 1,
          focusLabel: "Sprinttechnik",
          phase: "volume",
        },
      ],
    };

    const cycleResponse = await fetch(`${baseUrl}/api/cycles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cyclePayload),
    });

    assert.equal(cycleResponse.status, 201);
    const cycle = await cycleResponse.json();
    const createdWeek = cycle.weeks[0];
    const createdDay = createdWeek.days[0];

    const dayUpdate = await fetch(`${baseUrl}/api/days/${createdDay.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mainSetFocus: "Sprint Starts",
        skillFocus1: "Unterwasserphase",
        skillFocus2: "Atmung",
      }),
    });
    assert.equal(dayUpdate.status, 200);

    const planPayload = {
      title: "Freitagsplan",
      content: "## Einschwimmen\n200m locker",
      planDate: "2024-07-02",
      focus: "Placeholder",
      metadata: {
        weeklyCycle: {
          cycleId: cycle.id,
          weekId: createdWeek.id,
          dayId: createdDay.id,
        },
      },
    };

    const planResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(planPayload),
    });

    assert.equal(planResponse.status, 201);
    const planEtag = planResponse.headers.get("etag");
    assert.ok(planEtag);
    const createdPlan = await planResponse.json();

    assert.notEqual(createdPlan.title, planPayload.title);
    assert.match(createdPlan.title, /Vorbereitung Sommer/);
    assert.match(createdPlan.title, /Sprint Starts/);
    assert.equal(createdPlan.focus, "Sprint Starts");

    const link = createdPlan.metadata?.weeklyCycle;
    assert.ok(link);
    assert.equal(link.cycleId, cycle.id);
    assert.equal(link.weekId, createdWeek.id);
    assert.equal(link.dayId, createdDay.id);
    assert.equal(link.planId, createdPlan.id);
    assert.equal(link.mainSetFocus, "Sprint Starts");
    assert.equal(link.skillFocus1, "Unterwasserphase");
    assert.equal(link.skillFocus2, "Atmung");

    const dayResponse = await fetch(`${baseUrl}/api/days/${createdDay.id}`);
    assert.equal(dayResponse.status, 200);
    const linkedDay = await dayResponse.json();
    assert.equal(linkedDay.planId, createdPlan.id);
    const expectedFirstDate = new Date(linkedDay.date).toISOString().slice(0, 10);
    assert.equal(new Date(createdPlan.planDate).toISOString().slice(0, 10), expectedFirstDate);

    const secondPlanResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Ersatzplan",
        content: "## Technik\n4x50m",
        planDate: "2024-07-03",
        focus: "Other",
        metadata: {
          weeklyCycle: {
            cycleId: cycle.id,
            weekId: createdWeek.id,
            dayId: createdDay.id,
          },
        },
      }),
    });

    assert.equal(secondPlanResponse.status, 201);
    assert.ok(secondPlanResponse.headers.get("etag"));
    const secondPlan = await secondPlanResponse.json();
    assert.equal(secondPlan.metadata?.weeklyCycle?.planId, secondPlan.id);
    assert.equal(secondPlan.focus, "Sprint Starts");

    const refreshedDay = await fetch(`${baseUrl}/api/days/${createdDay.id}`);
    assert.equal(refreshedDay.status, 200);
    const refreshedDayPayload = await refreshedDay.json();
    assert.equal(refreshedDayPayload.planId, secondPlan.id);
    const expectedSecondDate = new Date(refreshedDayPayload.date).toISOString().slice(0, 10);
    assert.equal(new Date(secondPlan.planDate).toISOString().slice(0, 10), expectedSecondDate);

    const originalStored = await store.getPlan(createdPlan.id);
    assert.ok(originalStored);
    assert.equal(originalStored.metadata?.weeklyCycle, undefined);
  });

  it("verwaltet Vorlagen über die API", async () => {
    const createPayload = {
      type: "Block",
      title: "Sprintblock",
      notes: "3×",
      content: "## Sprint\n4×50m All-Out",
      tags: ["Sprint", "Kurz"],
    };

    const createResponse = await fetch(`${baseUrl}/api/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.ok(typeof created.id === "string" && created.id.length > 0);
    assert.equal(created.type, "Block");
    assert.equal(createResponse.headers.get("cache-control"), "no-store");

    const listResponse = await fetch(`${baseUrl}/api/templates`);
    assert.equal(listResponse.status, 200);
    const templates = await listResponse.json();
    assert.equal(templates.length, 1);
    assert.equal(templates[0].title, "Sprintblock");

    const updatePayload = { ...createPayload, title: "Sprintblock #1" };
    const updateResponse = await fetch(`${baseUrl}/api/templates/${encodeURIComponent(created.id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatePayload),
    });

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.title, "Sprintblock #1");

    const deleteResponse = await fetch(`${baseUrl}/api/templates/${encodeURIComponent(created.id)}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 204);

    const remaining = await templateStore.listTemplates();
    assert.equal(remaining.length, 0);
  });

  it("exportiert und stellt Sicherungen über die API bereit", async () => {
    await store.importBackup({
      format: "nextplanner/plan-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { nextId: 1, plans: [] },
    });

    const basePlan = await store.createPlan({
      title: "Backup-Test",
      content: "Plan",
      planDate: "2024-06-15",
      focus: "AR",
    });

    const backupResponse = await fetch(`${baseUrl}/api/backups`);
    assert.equal(backupResponse.status, 200);
    assert.equal(backupResponse.headers.get("cache-control"), "no-store");
    const backup = await backupResponse.json();
    assert.equal(backup.format, "nextplanner/plan-backup");
    assert.equal(backup.planCount, 1);

    await store.createPlan({
      title: "Zwischenstand",
      content: "Plan", 
      planDate: "2024-06-16",
      focus: "SP",
    });
    const interimPlans = await store.listPlans();
    assert.equal(interimPlans.length, 2);

    const restoreResponse = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backup),
    });
    assert.equal(restoreResponse.status, 200);
    assert.equal(restoreResponse.headers.get("cache-control"), "no-store");
    const restorePayload = await restoreResponse.json();
    assert.equal(restorePayload.success, true);
    assert.equal(restorePayload.planCount, 1);

    const restoredPlans = await store.listPlans();
    assert.equal(restoredPlans.length, 1);
    assert.equal(restoredPlans[0].title, basePlan.title);

    const invalidRestore = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(invalidRestore.status, 400);
  });

  it("unterstützt HEAD und OPTIONS mit CORS-Headern", async () => {
    const optionsResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "OPTIONS",
    });
    assert.equal(optionsResponse.status, 204);
    assert.equal(
      optionsResponse.headers.get("access-control-allow-origin"),
      "http://localhost:3000",
    );

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
    assert.equal(
      headResponse.headers.get("access-control-allow-origin"),
      "http://localhost:3000",
    );
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

  it("verwaltet die Highlight-Konfiguration über die API", async () => {
    const initialResponse = await fetch(`${baseUrl}/api/highlight-config`);
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json();
    assert.ok(Array.isArray(initial.intensities));
    assert.ok(initial.intensities.length > 0);
    assert.ok(Array.isArray(initial.equipment));

    const updateResponse = await fetch(`${baseUrl}/api/highlight-config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intensities: [" en1 ", "EN1", "Sprint"],
        equipment: ["Brett", "Paddles", "Brett"],
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.deepEqual(updated.intensities, ["en1", "Sprint"]);
    assert.deepEqual(updated.equipment, ["Brett", "Paddles"]);

    const reloadResponse = await fetch(`${baseUrl}/api/highlight-config`);
    assert.equal(reloadResponse.status, 200);
    const reloaded = await reloadResponse.json();
    assert.deepEqual(reloaded.intensities, ["en1", "Sprint"]);
    assert.deepEqual(reloaded.equipment, ["Brett", "Paddles"]);
  });

  it("liefert statische Dateien gestreamt mit Cache-Headern", async () => {
    const response = await fetch(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.ok(response.headers.get("etag"));
    const text = await response.text();
    assert.ok(text.includes("<!DOCTYPE html>"));

    const headResponse = await fetch(`${baseUrl}/css/main.css`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.ok(Number.parseInt(headResponse.headers.get("content-length") ?? "0", 10) > 0);
    assert.equal(headResponse.headers.get("cache-control"), "public, max-age=3600");
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
      publicDir: path.join(repoRoot, "public"),
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

  it("liefert und ersetzt Team-Snippets", async () => {
    const initial = await fetch(`${baseUrl}/api/snippets`);
    assert.equal(initial.status, 200);
    const initialBody = await initial.json();
    assert.ok(Array.isArray(initialBody.groups));
    assert.ok(initialBody.updatedAt);

    const newGroups = [
      {
        title: "Warm-up",
        description: "",
        items: [
          { label: "Lockeres Einschwimmen", snippet: "## Warm-up", ensureLineBreakBefore: true },
        ],
      },
    ];

    const putResponse = await fetch(`${baseUrl}/api/snippets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: newGroups }),
    });

    assert.equal(putResponse.status, 200);
    const payload = await putResponse.json();
    assert.ok(payload.updatedAt);
    assert.notEqual(payload.updatedAt, initialBody.updatedAt);
    assert.deepEqual(payload.groups, sanitizeQuickSnippetGroups(newGroups));

    const stored = await snippetStore.getLibrary();
    assert.deepEqual(stored.groups, sanitizeQuickSnippetGroups(newGroups));
  });

  it("validiert Snippet-Payloads", async () => {
    const invalid = await fetch(`${baseUrl}/api/snippets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: { broken: true } }),
    });

    assert.equal(invalid.status, 400);
    const body = await invalid.json();
    assert.equal(body.error.code, "invalid-snippet-payload");
  });

  it("legt Wochenzyklen an und aktualisiert Tageswerte", async () => {
    const initialCycles = await cycleStore.listCycles();
    const payload = {
      name: "Sommerblock",
      cycleType: "volume",
      startDate: "2024-07-01",
      weeks: [
        {
          weekNumber: 1,
          focusLabel: "Grundlagen",
          phase: "volume",
        },
      ],
    };

    const createResponse = await fetch(`${baseUrl}/api/cycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.ok(created.id > 0);
    assert.equal(created.weeks.length, 1);

    const listResponse = await fetch(`${baseUrl}/api/cycles`);
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.equal(list.length, initialCycles.length + 1);

    const dayId = created.weeks[0].days[0].id;
    const dayResponse = await fetch(`${baseUrl}/api/days/${dayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distance: 1500, volume: 1500, rpe: 4 }),
    });
    assert.equal(dayResponse.status, 200);

    const detailResponse = await fetch(`${baseUrl}/api/cycles/${created.id}`);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.weeks[0].summary.totalDistance, 1500);
    assert.equal(detail.weeks[0].summary.averageRpe, 4);
  });

  it("aktualisiert Wochenfokus und Reihenfolge", async () => {
    const payload = {
      name: "Herbstblock",
      cycleType: "intensity",
      startDate: "2024-09-02",
    };
    const createResponse = await fetch(`${baseUrl}/api/cycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.ok(created.weeks.length >= 1);
    const targetWeek = created.weeks[0];

    const updateResponse = await fetch(`${baseUrl}/api/weeks/${targetWeek.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focusLabel: "Tempo", phase: "intensity", weekNumber: 3 }),
    });
    assert.equal(updateResponse.status, 200);
    const updatedWeek = await updateResponse.json();
    assert.equal(updatedWeek.focusLabel, "Tempo");
    assert.equal(updatedWeek.phase, "intensity");
    assert.equal(updatedWeek.weekNumber, 3);

    const detailResponse = await fetch(`${baseUrl}/api/cycles/${created.id}`);
    const detail = await detailResponse.json();
    const persisted = detail.weeks.find((week) => week.id === targetWeek.id);
    assert.equal(persisted.focusLabel, "Tempo");
    assert.equal(persisted.weekNumber, 3);
  });

  it("liefert Health-Checks", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.ok(payload.checks.planStore);
    assert.equal(payload.checks.planStore.status, "ok");

    const headResponse = await fetch(`${baseUrl}/readyz`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("cache-control"), "no-store");
  });
});
