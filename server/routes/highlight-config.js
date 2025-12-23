import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";

function requireAuth(ctx) {
  if (!ctx.authUser) {
    throw new HttpError(401, "Authentifizierung erforderlich.");
  }
}

function createHighlightConfigRouter({ highlightConfigService }) {
  return async function highlightRouter(ctx) {
    if (ctx.url.pathname !== "/api/highlight-config") {
      return false;
    }
    const origin = ctx.origin;
    const allowedOrigins = ctx.config.server.allowedOrigins;
    const method = (ctx.req.method ?? "GET").toUpperCase();

    if (method === "OPTIONS") {
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    requireAuth(ctx);

    if (method === "GET" || method === "HEAD") {
      const config = await highlightConfigService.getConfig();
      sendApiJson(ctx.res, 200, config, { origin, allowedOrigins, headers: ctx.withCookies(), method });
      return true;
    }

    if (method === "PUT") {
      const updated = await highlightConfigService.updateConfig(ctx.body ?? {});
      sendApiJson(ctx.res, 200, updated, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createHighlightConfigRouter };
