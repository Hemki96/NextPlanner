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
import { buildPlanEtag, buildTemplateEtag } from "../server/http/etag.js";

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

function getHeader(headers, name) {
  const lower = name.toLowerCase();
  if (Object.hasOwn(headers, name)) return headers[name];
  const byLower = Object.keys(headers).find((key) => key.toLowerCase() === lower);
  return byLower ? headers[byLower] : undefined;
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
    await app.handlePlanRoutes(req, res, ctx, { headers: (extra) => extra, origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, "");
    assert.equal(res.headers["Cache-Control"] ?? res.headers["cache-control"], "no-store");
  });

  it("liefert ETag bei HEAD-Abfrage eines Plans", async () => {
    const etagPlan = {
      id: 7,
      title: "Head Plan",
      content: "Content",
      planDate: "2024-03-01",
      focus: "AR",
      metadata: {},
      createdAt: "2024-03-01T00:00:00.000Z",
      updatedAt: "2024-03-01T00:00:00.000Z",
    };
    const app = buildApp({
      planService: {
        async getPlan(id) {
          return id === 7 ? etagPlan : null;
        },
      },
    });
    const ctx = {
      authUser: { id: "user-1", roles: ["user"], role: "user" },
      url: new URL("http://localhost/api/plans/7"),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    };
    const req = { method: "HEAD", headers: {} };
    const res = createMockRes();
    await app.handlePlanRoutes(req, res, ctx, { headers: (extra) => extra, origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, "");
    assert.equal(getHeader(res.headers, "etag"), buildPlanEtag(etagPlan));
  });

  it("verlangt If-Match Header für Plan-Änderungen", async () => {
    const app = buildApp({
      planService: {
        async getPlan() {
          return {
            id: 9,
            title: "Plan",
            content: "x",
            planDate: "2024-03-02",
            focus: "AR",
            metadata: {},
            createdAt: "2024-03-02T00:00:00.000Z",
            updatedAt: "2024-03-02T00:00:00.000Z",
          };
        },
      },
    });
    const ctx = {
      authUser: { id: "user-1", roles: ["user"], role: "user" },
      url: new URL("http://localhost/api/plans/9"),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    };
    const req = { method: "PUT", headers: {}, url: "/api/plans/9" };
    const res = createMockRes();
    await assert.rejects(
      () => app.handlePlanRoutes(req, res, ctx, { headers: () => ({}), origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins }),
      HttpError,
    );
  });

  it("meldet Precondition Failed bei falschem If-Match für Plan-Änderungen", async () => {
    const plan = {
      id: 10,
      title: "Plan",
      content: "x",
      planDate: "2024-03-03",
      focus: "AR",
      metadata: {},
      createdAt: "2024-03-03T00:00:00.000Z",
      updatedAt: "2024-03-03T00:00:00.000Z",
    };
    const app = buildApp({
      planService: {
        async getPlan() {
          return plan;
        },
        async updatePlan() {
          throw new Error("should not be called");
        },
      },
    });
    const ctx = {
      authUser: { id: "user-1", roles: ["user"], role: "user" },
      url: new URL("http://localhost/api/plans/10"),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    };
    const req = { method: "PUT", headers: { "if-match": '"wrong"' }, url: "/api/plans/10" };
    const res = createMockRes();
    await app.handlePlanRoutes(req, res, ctx, { headers: (h) => h, origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins });
    assert.equal(res.statusCode, 412);
    assert.equal(res.headers.ETag, buildPlanEtag(plan));
  });

  it("nutzt updatedAt statt ETag im Plan-Service für Konflikte", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-service-"));
    const store = new JsonPlanStore({ storageFile: path.join(dir, "plans.json") });
    const service = new PlanService({ store });
    const plan = await service.createPlan({
      title: "ETag",
      content: "Plan",
      planDate: "2024-02-01",
      focus: "AR",
    });
    const update = await service.updatePlan(plan.id, { ...plan, focus: "TE", metadata: plan.metadata ?? {} }, { expectedUpdatedAt: plan.updatedAt });
    assert.notEqual(update.updatedAt, plan.updatedAt);
    await assert.rejects(
      () => service.updatePlan(plan.id, { ...plan, focus: "SP", metadata: plan.metadata ?? {} }, { expectedUpdatedAt: "mismatch" }),
      PlanConflictError,
    );
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("liefert Vorlagen-ETag bei HEAD und setzt Precondition für Änderungen", async () => {
    const template = {
      id: "tpl-1",
      type: "Set",
      title: "Tpl",
      notes: "",
      content: "abc",
      tags: [],
      createdAt: "2024-03-04T00:00:00.000Z",
      updatedAt: "2024-03-04T00:00:00.000Z",
    };
    const app = buildApp({
      templateService: {
        async listTemplates() {
          return [];
        },
        async getTemplate(id) {
          return id === "tpl-1" ? template : null;
        },
        async updateTemplate() {
          throw new Error("should not update on mismatch");
        },
      },
    });
    const baseCtx = {
      authUser: { id: "user-1", roles: ["user"], role: "user" },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    };

    const headRes = createMockRes();
    await app.handleTemplateRoutes(
      { method: "HEAD", headers: {}, url: "/api/templates/tpl-1" },
      headRes,
      { ...baseCtx, url: new URL("http://localhost/api/templates/tpl-1") },
      { headers: (extra) => extra, origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins },
    );
    assert.equal(headRes.statusCode, 200);
    assert.equal(headRes.headers.ETag, buildTemplateEtag(template));
    assert.equal(headRes.body, "");

    const res = createMockRes();
    await app.handleTemplateRoutes(
      { method: "PUT", headers: { "if-match": '"mismatch"' }, url: "/api/templates/tpl-1" },
      res,
      { ...baseCtx, url: new URL("http://localhost/api/templates/tpl-1") },
      { headers: (h) => h, origin: "", allowedOrigins: runtimeConfig.server.allowedOrigins },
    );
    assert.equal(res.statusCode, 412);
    assert.equal(getHeader(res.headers, "etag"), buildTemplateEtag(template));
  });
});
