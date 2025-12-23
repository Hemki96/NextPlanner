import { buildApiHeaders, sendEmpty, sendJson } from "../http/responses.js";

const HEALTH_ENDPOINTS = Object.freeze({
  readiness: "/readyz",
  liveness: "/livez",
  health: "/healthz",
});

function createHealthRouter({ services }) {
  return async function healthRouter(ctx) {
    const { pathname } = ctx.url;
    if (!Object.values(HEALTH_ENDPOINTS).includes(pathname)) {
      return false;
    }

    const method = (ctx.req.method ?? "GET").toUpperCase();
    if (method === "OPTIONS") {
      sendEmpty(ctx.res, 204, { headers: buildApiHeaders({ Allow: "GET,HEAD,OPTIONS" }) });
      return true;
    }
    if (method !== "GET" && method !== "HEAD") {
      sendEmpty(ctx.res, 405, { headers: buildApiHeaders({ Allow: "GET,HEAD,OPTIONS" }) });
      return true;
    }

    if (pathname === HEALTH_ENDPOINTS.liveness) {
      sendJson(
        ctx.res,
        200,
        { status: "ok", timestamp: new Date().toISOString() },
        { method },
      );
      return true;
    }

    const checks = [];
    for (const [name, store] of [
      ["planStore", services.planStore],
      ["templateStore", services.templateStore],
      ["snippetStore", services.snippetStore],
      ["highlightConfigStore", services.highlightConfigStore],
      ["userStore", services.userService?.store],
    ]) {
      if (!store || typeof store.checkHealth !== "function") {
        checks.push({ name, status: "unknown" });
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const details = await store.checkHealth();
        checks.push({ name, status: "ok", details });
      } catch (error) {
        checks.push({
          name,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const hasError = checks.some((entry) => entry.status === "error");
    const payload = {
      status: hasError ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      checks: checks.reduce((acc, entry) => {
        acc[entry.name] = { status: entry.status, ...(entry.details ? { details: entry.details } : {}) };
        if (entry.error) acc[entry.name].error = entry.error;
        return acc;
      }, {}),
      degraded: hasError,
    };
    const statusCode = payload.degraded ? 503 : 200;
    sendJson(ctx.res, statusCode, payload, { method, headers: buildApiHeaders() });
    return true;
  };
}

export { createHealthRouter, HEALTH_ENDPOINTS };
