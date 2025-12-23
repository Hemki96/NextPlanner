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
import { buildRouters } from "../server/routes/index.js";
import { buildPlanEtag } from "../server/services/plan-service.js";

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

function buildServices(overrides = {}) {
  return {
    planService: overrides.planService ?? {
      listPlans: async () => [{ id: 1, title: "Test", content: "Plan", planDate: "2024-01-01", focus: "AR" }],
      getPlanWithEtag: async () => ({ plan: { id: 1, title: "Test", content: "Plan", planDate: "2024-01-01", focus: "AR" }, etag: '"abc"' }),
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
}

function buildCtx(overrides = {}) {
  const services = overrides.services ?? buildServices(overrides);
  const app = new HttpApplication({
    config: runtimeConfig,
    services,
    publicDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"),
  });
  const routers = buildRouters({ services, publicDir: app.publicDir });
  const ctx = {
    url: overrides.url ?? new URL("http://localhost/api/plans"),
    req: overrides.req ?? { method: "GET", headers: {} },
    res: overrides.res ?? createMockRes(),
    config: runtimeConfig,
    services,
    origin: "",
    authUser: overrides.authUser ?? null,
    cookies: [],
    withCookies: (extra = {}) => extra,
  };
  ctx.req.url = ctx.url.toString();
  ctx.router = routers.find((r) => r.name !== undefined) ?? routers[2];
  ctx.handleWith = async () => {
    for (const router of routers) {
      // eslint-disable-next-line no-await-in-loop
      const handled = await router(ctx);
      if (handled) return true;
    }
    return false;
  };
  return ctx;
}

describe("Router and service units", () => {
  it("verweigert Plan-Requests ohne Authentifizierung im Router", async () => {
    const ctx = buildCtx({ authUser: null });
    await assert.rejects(() => ctx.handleWith(), HttpError);
  });

  it("liefert Plan-Liste und setzt Cache-Header im Router", async () => {
    const ctx = buildCtx({
      authUser: { id: "user-1", roles: ["user"], role: "user" },
      req: { method: "HEAD", headers: {} },
      services: buildServices({
        planService: {
          async listPlans() {
            return [{ id: 5, title: "List", content: "Plan", planDate: "2024-01-02", focus: "AR" }];
          },
        },
      }),
    });
    await ctx.handleWith();
    assert.equal(ctx.res.statusCode, 200);
    assert.equal(ctx.res.body, "");
    assert.equal(ctx.res.headers["Cache-Control"] ?? ctx.res.headers["cache-control"], "no-store");
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
    const { plan: updatedPlan, etag: updatedEtag } = await service.updatePlan(
      plan.id,
      { ...plan, focus: "TE", metadata: plan.metadata ?? {} },
      { expectedEtag: etag },
    );
    assert.notEqual(updatedEtag, etag);
    await assert.rejects(
      () => service.updatePlan(plan.id, { ...plan, focus: "SP", metadata: plan.metadata ?? {} }, { expectedEtag: '"mismatch"' }),
      PlanConflictError,
    );
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
