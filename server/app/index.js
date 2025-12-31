// Kernstück der HTTP-Anwendung: Hier werden eingehende Requests vorbereitet,
// mit Session-Informationen versehen und an die Router-Pipeline weitergegeben.
// Die Kommentare erklären alle Zwischenschritte, damit auch Personen mit wenig
// Erfahrung den Ablauf nachvollziehen können.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runtimeConfig } from "../config/runtime-config.js";
import { HttpError } from "../http/http-error.js";
import { handleApiError, sendEmpty } from "../http/responses.js";
import { createRequestLogger } from "../logger.js";
import { createHttpSessionMiddleware } from "../sessions/http-session-middleware.js";
import { extractRequestUser } from "./auth/request-user.js";
import { parseApiJsonBody } from "./middleware/body-parser.js";
import { createRequestContext } from "./request-context.js";
import { createRouterPipeline } from "./router/index.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.join(CURRENT_DIR, "..", "public");

function resolveSecureCookieFlag(config, req) {
  // Bestimmt, ob Cookies als "secure" markiert werden sollen. Wird kein
  // expliziter Wert gesetzt, orientiert sich die Entscheidung am eingehenden
  // Protokoll (http vs. https).
  const flag = config.security.session.secureCookies;
  if (flag === true) return true;
  if (flag === false) return false;
  const forwardedProto = (req.headers?.["x-forwarded-proto"] ?? "").toString().toLowerCase();
  if (forwardedProto === "https") return true;
  return Boolean(req.socket?.encrypted);
}

function attachSessionUser(ctx) {
  // Überträgt die Informationen aus der Session in das Request-Context-Objekt,
  // damit spätere Schritte wie Autorisierung darauf zugreifen können.
  if (!ctx.req.session) return;
  ctx.authUser = {
    id: ctx.req.session.userId ?? ctx.req.session.username,
    username: ctx.req.session.username,
    name: ctx.req.session.username ?? ctx.req.session.userId,
    roles: ctx.req.session.roles ?? [],
    role: (ctx.req.session.roles ?? [])[0] ?? "user",
    isAdmin: (ctx.req.session.roles ?? []).includes("admin") || ctx.req.session.isAdmin,
  };
  ctx.services.userService.remember?.(ctx.authUser);
}

function attachHeaderUserFallback(ctx) {
  // Fallback für automatisierte Tests oder interne Aufrufe: Der Benutzer kann
  // auch per Custom-Header übergeben werden, falls keine Session existiert.
  if (ctx.authUser) return;
  const headerUser = extractRequestUser(ctx.req);
  if (headerUser) {
    ctx.authUser = headerUser;
    ctx.services.userService.remember?.(headerUser);
  }
}

function createApp({
  config = runtimeConfig,
  services,
  publicDir = DEFAULT_PUBLIC_DIR,
  routerFactory = createRouterPipeline,
  sessionMiddlewareFactory = createHttpSessionMiddleware,
} = {}) {
  // Übergibt Services, Config und Middleware-Fabriken. Fehlende Abhängigkeiten
  // werden bewusst früh erkannt, um Startfehler klar zu kommunizieren.
  if (!services) {
    throw new Error("services are required to create the application");
  }

  const sessionMiddleware = sessionMiddlewareFactory({
    sessionStore: services.sessionStore,
    cookieName: config.security.session.cookieName,
    resolveSecure: (req) => resolveSecureCookieFlag(config, req),
    ttlMs: config.security.session.ttlMs,
  });
  const routeRequest = routerFactory({ services, publicDir });

  async function handle(req, res) {
    // Herzstück der Request-Verarbeitung: baut Kontext, führt Middleware aus
    // und übergibt den Request an die Router-Logik. Jede Phase ist mit einem
    // try/catch umschlossen, um Fehlermeldungen kontrolliert zu versenden.
    res.locals = { jsonSpacing: config.server.jsonSpacing };
    const requestLogger = createRequestLogger({
      method: req.method,
      path: req.url ? new URL(req.url, "http://localhost").pathname : "/",
    });
    const startedAt = Date.now();
    const ctx = createRequestContext({
      req,
      res,
      config,
      services,
      logger: requestLogger,
      sessionMiddleware,
    });

    try {
      await sessionMiddleware(req, res, ctx, async () => {
        attachSessionUser(ctx);
        attachHeaderUserFallback(ctx);
        await parseApiJsonBody(ctx);
        const handled = await routeRequest(ctx);
        if (!handled) {
          // Erreicht, wenn kein Router den Pfad bedienen konnte.
          throw new HttpError(404, "Endpoint nicht gefunden");
        }
      });
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
