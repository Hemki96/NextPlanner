// Endpunkte für die Konfiguration der Text-Hervorhebung. Nutzt ETags und prüft
// Content-Types, um sicherzustellen, dass nur gültige JSON-Payloads geschrieben
// werden.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";
import { etagMatches } from "../http/utils.js";
import { buildHighlightConfigEtag } from "../services/highlight-config-service.js";

function requireJson(ctx) {
  const contentType = ctx.req.headers?.["content-type"] ?? "";
  if (!/^application\/json/i.test(contentType)) {
    throw new HttpError(415, "Content-Type muss application/json sein", {
      hint: "Setzen Sie den Header 'Content-Type' auf 'application/json', um JSON-Daten zu senden.",
    });
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

    if (method === "GET" || method === "HEAD") {
      const { config, etag } = await highlightConfigService.getConfigWithEtag();
      if (etagMatches(ctx.req.headers["if-none-match"], etag)) {
        sendApiEmpty(ctx.res, 304, { origin, allowedOrigins, headers: ctx.withCookies({ ETag: etag }) });
        return true;
      }
      sendApiJson(ctx.res, 200, config, {
        origin,
        allowedOrigins,
        headers: ctx.withCookies({ ETag: etag }),
        method,
      });
      return true;
    }

    if (method === "PUT") {
      requireJson(ctx);
      const { config: current, etag: currentEtag } = await highlightConfigService.getConfigWithEtag();
      const ifMatch = ctx.req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(412, "If-Match-Header wird benötigt.");
      }
      if (!etagMatches(ifMatch, currentEtag)) {
        throw new HttpError(412, "If-Match stimmt nicht mit aktueller Version überein.");
      }
      const { config: updated, etag } = await highlightConfigService.updateConfig(ctx.body ?? {});
      sendApiJson(ctx.res, 200, updated, {
        origin,
        allowedOrigins,
        headers: ctx.withCookies({ ETag: etag }),
      });
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createHighlightConfigRouter };
