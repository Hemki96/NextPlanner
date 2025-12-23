import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { HttpApplication } from "../server/app.js";
import { runtimeConfig } from "../server/config/runtime-config.js";
import { PlanService, PlanConflictError } from "../server/services/plan-service.js";
import { JsonPlanStore } from "../server/stores/json-plan-store.js";
import { HttpError } from "../server/http/http-error.js";
import { UserService } from "../server/services/user-service.js";

function createMockRes() {
  const res = {
    locals: {},
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = "") {
      if (typeof chunk === "string") {
        this.body += chunk;
      }
      this.ended = true;
    },
  };
  return res;
}

function buildApp(overrides = {}) {
  const services = {
    planService: overrides.planService ?? {
      listPlans: async () => [{ id: 1, title: "Test", content: "Plan", planDate: "2024-01-01", focus: "AR" }],
    },
    templateService: overrides.templateService ?? { listTemplates: async () => [] },
    snippetService: overrides.snippetService ?? { getLibrary: async () => ({ groups: [] }) },
    highlightConfigService: overrides.highlightConfigService ?? { getConfig: async () => ({ intensities: [], equipment: [] }) },
    authService: overrides.authService ?? { login: async () => ({ id: "demo", username: "demo", roles: [] }) },
    sessionStore: overrides.sessionStore ?? {
      async getSession() { return null; },
      async createSession() { return { token: "t", expiresAt: new Date().toISOString() }; },
      async deleteSession() {},
    },
    planStore: overrides.planStore ?? { checkHealth: async () => ({ ok: true }) },
    templateStore: overrides.templateStore ?? {},
    snippetStore: overrides.snippetStore ?? {},
    highlightConfigStore: overrides.highlightConfigStore ?? {},
    userService: overrides.userService ?? new UserService({ defaults: [] }),
  };

  return new HttpApplication({
    config: runtimeConfig,
    services,
    publicDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"),
  });
}

describe("Router and service units", () => {
  it("verweigert Plan-Requests ohne Authentifizierung im Router", async () => {
    const app = buildApp();
    const ctx = {
      authUser: null,
      url: new URL("http://localhost/api/plans"),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    };
    const req = { method: "GET", headers: {} };
    const res = createMockRes();
    await assert.rejects(
      () => app.handlePlanRoutes(req, res, ctx, { headers: () => ({}), origin: "", allowedOrigins: [] }),
      HttpError,
    );
  });

  it("liefert Plan-Liste und setzt Cache-Header im Router", async () => {
    const app = buildApp({
      planService: {
        async listPlans() {
          return [{ id: 5, title: "List", content: "Plan", planDate: "2024-01-02", focus: "AR" }];
        },
      },
    });
    const ctx = {
      authUser: { id: "user-1", roles: ["user"], role: "user" },
      url: new URL("http://localhost/api/plans"),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    };
    const req = { method: "HEAD", headers: {} };
    const res = createMockRes();
    await app.handlePlanRoutes(req, res, ctx, { headers: () => ({}), origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, "");
    assert.equal(res.headers["Cache-Control"] ?? res.headers["cache-control"], "no-store");
  });

  it("aktualisiert ETags über den Plan-Service", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-service-"));
    const store = new JsonPlanStore({ storageFile: path.join(dir, "plans.json") });
    const service = new PlanService({ store });
    const { plan, etag } = await service.createPlan({
      title: "ETag",
      content: "Plan",
      planDate: "2024-02-01",
      focus: "AR",
    });
    const update = await service.updatePlan(plan.id, { ...plan, focus: "TE", metadata: plan.metadata ?? {} }, { expectedEtag: etag });
    assert.notEqual(update.etag, etag);
    await assert.rejects(
      () => service.updatePlan(plan.id, { ...plan, focus: "SP", metadata: plan.metadata ?? {} }, { expectedEtag: '"mismatch"' }),
      PlanConflictError,
    );
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
