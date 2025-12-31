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
import { JsonHighlightConfigStore } from "../server/stores/json-highlight-config-store.js";
import { createServer } from "../server/app.js";
import { buildRuntimeConfig } from "../server/config/runtime-config.js";
import { SessionStore } from "../server/sessions/session-store.js";
import { sanitizeQuickSnippetGroups } from "../public/js/utils/snippet-storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function createTempStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "nextplanner-api-"));
  const storageFile = path.join(dir, "plans.json");
  const snippetFile = path.join(dir, "snippets.json");
  const templateFile = path.join(dir, "templates.json");
  const highlightFile = path.join(dir, "highlight.json");
  const store = new JsonPlanStore({ storageFile });
  const snippetStore = new JsonSnippetStore({ storageFile: snippetFile });
  const templateStore = new JsonTemplateStore({ storageFile: templateFile });
  const highlightStore = new JsonHighlightConfigStore({ storageFile: highlightFile });
  return { dir, store, snippetStore, templateStore, highlightStore };
}

describe("Plan API", () => {
  let tempDir;
  let store;
  let snippetStore;
  let server;
  let baseUrl;
  let templateStore;
  let highlightStore;
  let sessionStore;
  let authCookie;
  const adminCredentials = { username: "test-admin", password: "Passw0rd!1", isAdmin: true };

  function authHeaders(headers = {}) {
    if (!authCookie) {
      return headers;
    }
    return { ...headers, Cookie: authCookie };
  }

  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: adminCredentials.username,
        password: adminCredentials.password,
      }),
    });
    const cookie = response.headers.get("set-cookie");
    authCookie = cookie ?? "";
    return response;
  }

  function authFetch(url, options = {}) {
    const headers = authHeaders(options.headers ?? {});
    return fetch(url, { ...options, headers });
  }

  before(async () => {
    const temp = createTempStore();
    tempDir = temp.dir;
    store = temp.store;
    snippetStore = temp.snippetStore;
    templateStore = temp.templateStore;
    highlightStore = temp.highlightStore;
    sessionStore = new SessionStore({ storageFile: path.join(tempDir, "sessions.json") });
    server = createServer({
      store,
      templateStore,
      snippetStore,
      highlightConfigStore: highlightStore,
      publicDir: path.join(repoRoot, "public"),
      users: [adminCredentials],
      sessionStore,
    });
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    const loginResponse = await login();
    assert.equal(loginResponse.status, 200);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store?.close();
    await snippetStore?.close();
    await templateStore?.close();
    await highlightStore?.close();
    await sessionStore?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("verweigert API-Aufrufe ohne Sitzung", async () => {
    const response = await fetch(`${baseUrl}/api/plans`);
    assert.equal(response.status, 401);
  });

  it("liefert 404 und JSON für unbekannte API-Pfade", async () => {
    const response = await authFetch(`${baseUrl}/api/unknown/route`);
    assert.equal(response.status, 404);
    const contentType = response.headers.get("content-type") ?? "";
    assert.ok(contentType.includes("application/json"));
    const payload = await response.json();
    assert.equal(payload?.error?.code, "http-404");
  });

  it("ermöglicht Logout und erneutes Login", async () => {
    const logoutResponse = await authFetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(logoutResponse.status, 204);
    authCookie = "";

    const afterLogout = await fetch(`${baseUrl}/api/plans`);
    assert.equal(afterLogout.status, 401);

    const loginResponse = await login();
    assert.equal(loginResponse.status, 200);
  });

  it("legt neue Pläne an und listet sie", async () => {
    const payload = {
      title: "Testplan",
      content: "Aufwärmen\n200m",
      planDate: "2024-06-01",
      focus: "AR",
      metadata: { coach: "Kim" },
    };

    const response = await authFetch(`${baseUrl}/api/plans`, {
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

    const listResponse = await authFetch(`${baseUrl}/api/plans`);
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.headers.get("cache-control"), "no-store");
    const plans = await listResponse.json();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].id, created.id);

    const stored = await store.getPlan(created.id);
    assert.equal(stored.metadata.coach, "Kim");
  });

  it("setzt Audit-Felder bei authentifizierten Requests und liefert Benutzerinfos", async () => {
    const payload = {
      title: "Audit-Plan",
      content: "Aufwärmen",
      planDate: "2024-07-01",
      focus: "AR",
    };

    const createResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": "coach-1",
        "X-User-Name": "Coach Kim",
      },
      body: JSON.stringify(payload),
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.createdByUserId, "coach-1");
    assert.equal(created.updatedByUserId, "coach-1");

    const updatePayload = {
      ...created,
      focus: "TE",
      metadata: created.metadata ?? {},
    };

    const updateResponse = await fetch(`${baseUrl}/api/plans/${created.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": createResponse.headers.get("etag"),
        "X-User-Id": "coach-2",
        "X-User-Name": "Coach Sam",
      },
      body: JSON.stringify(updatePayload),
    });

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.createdByUserId, "coach-1");
    assert.equal(updated.updatedByUserId, "coach-2");
    assert.notEqual(updated.updatedAt, created.updatedAt);

    const authMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        "X-User-Id": "coach-2",
        "X-User-Name": "Coach Sam",
      },
    });
    assert.equal(authMe.status, 200);
    const profile = await authMe.json();
    assert.equal(profile.id, "coach-2");
    assert.equal(profile.name, "Coach Sam");

    const usersResponse = await fetch(`${baseUrl}/api/users`, {
      headers: {
        "X-User-Id": "admin-1",
        "X-User-Role": "admin",
        "X-User-Name": "Admin User",
      },
    });
    assert.equal(usersResponse.status, 200);
    const users = await usersResponse.json();
    const userIds = users.map((user) => user.id);
    assert.ok(userIds.includes("coach-1"));
    assert.ok(userIds.includes("coach-2"));
    assert.ok(userIds.includes("admin-1"));
  });

  it("aktualisiert und löscht Pläne", async () => {
    const created = await store.createPlan({
      title: "Sprint",
      content: "6x50",
      planDate: "2024-06-02",
      focus: "SP",
    });

    const initialResponse = await authFetch(`${baseUrl}/api/plans/${created.id}`);
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

    const updateResponse = await authFetch(`${baseUrl}/api/plans/${created.id}`, {
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

    const deleteResponse = await authFetch(`${baseUrl}/api/plans/${created.id}`, {
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
    const badContentType = await authFetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "title=foo",
    });
    assert.equal(badContentType.status, 415);

    const missingFields = await authFetch(`${baseUrl}/api/plans`, {
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

    const initial = await authFetch(`${baseUrl}/api/plans/${plan.id}`);
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
    const firstUpdate = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
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
    const conflict = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
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

    const deleteConflict = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": initialEtag,
      },
    });
    assert.equal(deleteConflict.status, 412);
    assert.equal(deleteConflict.headers.get("etag"), freshEtag);
    const deleteBody = await deleteConflict.json();
    assert.equal(deleteBody.error.details?.currentPlan?.focus, "TE");

    const cleanup = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": freshEtag,
      },
    });
    assert.equal(cleanup.status, 204);
  });

  it("verwaltet Vorlagen über die API", async () => {
    const createPayload = {
      type: "Block",
      title: "Sprintblock",
      notes: "3×",
      content: "## Sprint\n4×50m All-Out",
      tags: ["Sprint", "Kurz"],
    };

    const createResponse = await authFetch(`${baseUrl}/api/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    });

    assert.equal(createResponse.status, 201);
    const createEtag = createResponse.headers.get("etag");
    const created = await createResponse.json();
    assert.ok(typeof created.id === "string" && created.id.length > 0);
    assert.equal(created.type, "Block");
    assert.equal(createResponse.headers.get("cache-control"), "no-store");

    const listResponse = await authFetch(`${baseUrl}/api/templates`);
    assert.equal(listResponse.status, 200);
    const templates = await listResponse.json();
    assert.equal(templates.length, 1);
    assert.equal(templates[0].title, "Sprintblock");

    const updatePayload = { ...createPayload, title: "Sprintblock #1" };
    const updateResponse = await authFetch(`${baseUrl}/api/templates/${encodeURIComponent(created.id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": createEtag,
      },
      body: JSON.stringify(updatePayload),
    });

    assert.equal(updateResponse.status, 200);
    const updateEtag = updateResponse.headers.get("etag");
    const updated = await updateResponse.json();
    assert.equal(updated.title, "Sprintblock #1");

    const deleteResponse = await authFetch(`${baseUrl}/api/templates/${encodeURIComponent(created.id)}`, {
      method: "DELETE",
      headers: {
        "If-Match": updateEtag,
      },
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

    const backupResponse = await authFetch(`${baseUrl}/api/backups`);
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

    const restoreResponse = await authFetch(`${baseUrl}/api/backups`, {
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

    const invalidRestore = await authFetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(invalidRestore.status, 400);
  });

  it("unterstützt HEAD und OPTIONS mit CORS-Headern", async () => {
    const optionsResponse = await authFetch(`${baseUrl}/api/plans`, {
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

    const headResponse = await authFetch(`${baseUrl}/api/plans/${created.id}`, {
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

    const first = await authFetch(`${baseUrl}/api/plans/${plan.id}`);
    assert.equal(first.status, 200);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const conditional = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get("etag"), etag);
    assert.equal(await conditional.text(), "");

    const headConditional = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "HEAD",
      headers: { "If-None-Match": etag },
    });
    assert.equal(headConditional.status, 304);
    assert.equal(headConditional.headers.get("etag"), etag);
    assert.equal(await headConditional.text(), "");

    const cleanup = await authFetch(`${baseUrl}/api/plans/${plan.id}`, {
      method: "DELETE",
      headers: { "If-Match": etag },
    });
    assert.equal(cleanup.status, 204);
  });

  it("verwaltet die Highlight-Konfiguration über die API", async () => {
    const initialResponse = await authFetch(`${baseUrl}/api/highlight-config`);
    assert.equal(initialResponse.status, 200);
    const initialEtag = initialResponse.headers.get("etag");
    const initial = await initialResponse.json();
    assert.ok(Array.isArray(initial.intensities));
    assert.ok(initial.intensities.length > 0);
    assert.ok(Array.isArray(initial.equipment));

    const updateResponse = await authFetch(`${baseUrl}/api/highlight-config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": initialEtag,
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

    const reloadResponse = await authFetch(`${baseUrl}/api/highlight-config`);
    assert.equal(reloadResponse.status, 200);
    const reloaded = await reloadResponse.json();
    assert.deepEqual(reloaded.intensities, ["en1", "Sprint"]);
    assert.deepEqual(reloaded.equipment, ["Brett", "Paddles"]);
  });

  it("leitet HTML-Seiten ohne Sitzung auf die Login-Seite um", async () => {
    authCookie = "";
    const response = await fetch(`${baseUrl}/planner.html`, { redirect: "manual" });
    assert.equal(response.status, 302);
    const location = response.headers.get("location");
    assert.ok(location?.startsWith("/login.html"));
    const url = new URL(location, baseUrl);
    assert.equal(url.pathname, "/login.html");
    assert.equal(url.searchParams.get("reason"), "login-required");
    assert.equal(url.searchParams.get("next"), "/planner.html");

    const relogin = await login();
    assert.equal(relogin.status, 200);
  });

  it("liefert statische Dateien gestreamt mit Cache-Headern", async () => {
    const response = await authFetch(`${baseUrl}/index.html`);
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
    const initial = await authFetch(`${baseUrl}/index.html`);
    assert.equal(initial.status, 200);
    const etag = initial.headers.get("etag");
    const lastModified = initial.headers.get("last-modified");

    if (etag) {
      const conditional = await authFetch(`${baseUrl}/index.html`, {
        headers: { "If-None-Match": etag },
      });
      assert.equal(conditional.status, 304);
      assert.equal(conditional.headers.get("etag"), etag);
      assert.equal(await conditional.text(), "");

      const headConditional = await authFetch(`${baseUrl}/index.html`, {
        method: "HEAD",
        headers: { "If-None-Match": etag },
      });
      assert.equal(headConditional.status, 304);
      assert.equal(headConditional.headers.get("etag"), etag);
      assert.equal(await headConditional.text(), "");
    }

    if (lastModified) {
      const conditionalSince = await authFetch(`${baseUrl}/index.html`, {
        headers: { "If-Modified-Since": lastModified },
      });
      assert.equal(conditionalSince.status, 304);
      assert.equal(await conditionalSince.text(), "");
    }
  });

  it("schließt den Store beim Server-Shutdown", async () => {
    const temp = createTempStore();
    const localStore = temp.store;
    const localSessionStore = new SessionStore({ storageFile: path.join(temp.dir, "sessions.json") });
    const closeMock = mock.method(localStore, "close", async () => {});
    const localServer = createServer({
      store: localStore,
      publicDir: path.join(repoRoot, "public"),
      gracefulShutdownSignals: [],
      sessionStore: localSessionStore,
    });
    localServer.listen(0);
    await once(localServer, "listening");

    await new Promise((resolve) => localServer.close(resolve));

    assert.equal(closeMock.mock.calls.length, 1);

    closeMock.mock.restore();
    await localStore.close();
    await localSessionStore.close();
    rmSync(temp.dir, { recursive: true, force: true });
  });

  it("liefert und ersetzt Team-Snippets", async () => {
    const initial = await authFetch(`${baseUrl}/api/snippets`);
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

    const putResponse = await authFetch(`${baseUrl}/api/snippets`, {
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
    const invalid = await authFetch(`${baseUrl}/api/snippets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: { broken: true } }),
    });

    assert.equal(invalid.status, 400);
    const body = await invalid.json();
    assert.equal(body.error.code, "invalid-snippet-payload");
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

  it("blockiert wiederholte Login-Fehlversuche", async () => {
    authCookie = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminCredentials.username,
          password: "wrong-password",
        }),
      });
      if (attempt < 5) {
        assert.equal(response.status, 401);
      }
      lastStatus = response.status;
    }
    assert.equal(lastStatus, 429);
  });
});

describe("Dev Auth API", () => {
  let server;
  let baseUrl;
  let tempDir;
  let planStore;
  let templateStore;
  let snippetStore;
  let highlightStore;
  let sessionStore;

  before(async () => {
    const temp = createTempStore();
    tempDir = temp.dir;
    planStore = temp.store;
    snippetStore = temp.snippetStore;
    templateStore = temp.templateStore;
    highlightStore = temp.highlightStore;
    sessionStore = new SessionStore({ storageFile: path.join(tempDir, "sessions.json") });

    const config = buildRuntimeConfig({
      NODE_ENV: "development",
      NEXTPLANNER_ENV: "dev",
      NEXTPLANNER_DATA_DIR: tempDir,
    });
    server = createServer({
      config,
      store: planStore,
      templateStore,
      snippetStore,
      highlightConfigStore: highlightStore,
      publicDir: path.join(repoRoot, "public"),
      sessionStore,
      users: [],
    });
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await planStore?.close();
    await snippetStore?.close();
    await templateStore?.close();
    await highlightStore?.close();
    await sessionStore?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("liefert Dev-Auth-Metadaten ohne Sitzung", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.authenticated, false);
    assert.equal(payload.devAuth?.enabled, true);
    assert.ok(Array.isArray(payload.devAuth?.users));
    assert.ok(payload.devAuth.users.some((user) => user.username === "admin"));
  });

  it("erstellt Sessions über den Dev-Login-Endpunkt", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "coach", password: "DevPass123!" }),
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie");
    assert.ok(cookie?.includes("nextplanner_session"));

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie ?? "" } });
    assert.equal(meResponse.status, 200);
    const profile = await meResponse.json();
    assert.equal(profile.authenticated, true);
    assert.equal(profile.username, "coach");
    assert.equal(profile.devAuth?.enabled, true);
  });

  it("liefert HTML-Seiten ohne Weiterleitung im DEV-Profil", async () => {
    const response = await fetch(`${baseUrl}/planner.html`, { redirect: "manual" });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes("<!DOCTYPE html>"));
  });
});
