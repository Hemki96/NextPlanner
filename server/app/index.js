// Kernstück der HTTP-Anwendung: Hier werden eingehende Requests vorbereitet
// und an die Router-Pipeline weitergegeben.
// Die Kommentare erklären alle Zwischenschritte, damit auch Personen mit wenig
// Erfahrung den Ablauf nachvollziehen können.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runtimeConfig } from "../config/runtime-config.js";
import { HttpError } from "../http/http-error.js";
import { handleApiError, sendEmpty } from "../http/responses.js";
import { createRequestLogger } from "../logger.js";
import { extractRequestUser } from "./auth/request-user.js";
import { parseApiJsonBody } from "./middleware/body-parser.js";
import { createRequestContext } from "./request-context.js";
import { createRouterPipeline } from "./router/index.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.join(CURRENT_DIR, "..", "public");

function attachHeaderUserFallback(ctx) {
  // Fallback für automatisierte Tests oder interne Aufrufe: Der Benutzer kann
  // per Custom-Header übergeben werden.
  if (ctx.authUser) return;
  const headerUser = extractRequestUser(ctx.req);
  if (headerUser) {
    ctx.authUser = headerUser;
    ctx.services.userService.remember?.(headerUser);
    if (ctx.baseLogger?.child) {
      ctx.logger = ctx.baseLogger.child({
        user: ctx.authUser.username ?? ctx.authUser.id,
        roles: (ctx.authUser.roles ?? []).join(",") || undefined,
      });
    }
  }
}

function createApp({
  config = runtimeConfig,
  services,
  publicDir = DEFAULT_PUBLIC_DIR,
  routerFactory = createRouterPipeline,
} = {}) {
  // Übergibt Services, Config und Middleware-Fabriken. Fehlende Abhängigkeiten
  // werden bewusst früh erkannt, um Startfehler klar zu kommunizieren.
  if (!services) {
    throw new Error("services are required to create the application");
  }

  const routeRequest = routerFactory({ services, publicDir });

  async function handle(req, res) {
    // Herzstück der Request-Verarbeitung: baut Kontext, führt Middleware aus
    // und übergibt den Request an die Router-Logik. Jede Phase ist mit einem
    // try/catch umschlossen, um Fehlermeldungen kontrolliert zu versenden.
    res.locals = { jsonSpacing: config.server.jsonSpacing };
    const requestId = req.headers?.["x-request-id"] ?? randomUUID();
    const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "/";
    const requestLogger = createRequestLogger({
      method: req.method,
      path: pathname,
      reqId: requestId,
      remote: req.socket?.remoteAddress,
    });
    res.setHeader("x-request-id", requestId);
    const startedAt = Date.now();
    const ctx = createRequestContext({
      req,
      res,
      config,
      services,
      logger: requestLogger,
      requestId,
    });

    try {
      attachHeaderUserFallback(ctx);
      await parseApiJsonBody(ctx);
      const handled = await routeRequest(ctx);
      if (!handled) {
        // Erreicht, wenn kein Router den Pfad bedienen konnte.
        throw new HttpError(404, "Endpoint nicht gefunden");
      }
    } catch (error) {
      const isHttpError = error instanceof HttpError;
      if (!isHttpError) {
        ctx.logger?.error(
          "Unerwarteter Fehler: %s",
          error instanceof Error ? error.stack ?? error.message : String(error),
        );
      }
      if (ctx.url.pathname.startsWith("/api/")) {
        handleApiError(res, error, {
          origin: ctx.origin,
          allowedOrigins: config.server.allowedOrigins,
          cookies: ctx.cookies,
        });
      } else {
        const status = isHttpError ? error.status : 500;
        sendEmpty(res, status);
      }
    } finally {
      // Einfache Metrik: Wie lange hat der Request gedauert?
      const durationMs = Date.now() - startedAt;
      requestLogger.info("Request beendet mit Status %s nach %dms", res.statusCode ?? "-", durationMs);
    }
  }

  return { handle };
}

export { createApp, DEFAULT_PUBLIC_DIR };
