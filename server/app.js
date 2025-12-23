import { createServer as createHttpServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { runtimeConfig } from "./config/runtime-config.js";
import { buildApiHeaders, handleApiError, sendApiEmpty, sendApiJson, sendEmpty, sendJson, withCorsHeaders } from "./http/responses.js";
import { logger, createRequestLogger } from "./logger.js";
import { SessionStore } from "./sessions/session-store.js";
import { createHttpSessionMiddleware, requireSession } from "./sessions/http-session-middleware.js";
import { HttpError } from "./http/http-error.js";
import { JsonPlanStore, PlanConflictError, PlanValidationError } from "./stores/json-plan-store.js";
import { JsonTemplateStore, TemplateValidationError } from "./stores/json-template-store.js";
import { JsonSnippetStore } from "./stores/json-snippet-store.js";
import { JsonHighlightConfigStore } from "./stores/json-highlight-config-store.js";
import { JsonUserStore } from "./stores/json-user-store.js";
import { PlanService, buildPlanEtag } from "./services/plan-service.js";
import { TemplateService, buildTemplateEtag } from "./services/template-service.js";
import { SnippetService } from "./services/snippet-service.js";
import { HighlightConfigService } from "./services/highlight-config-service.js";
import { AuthService } from "./services/auth-service.js";
import { UserService } from "./services/user-service.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.join(CURRENT_DIR, "..", "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const HEALTH_ENDPOINTS = Object.freeze({
  readiness: "/readyz",
  liveness: "/livez",
  health: "/healthz",
});

const STATIC_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

const IMMUTABLE_CACHE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".json",
]);

const FINGERPRINT_PATTERN = /(?:^|[.-])[0-9a-f]{8,}(?:\.|$)/i;

function mapExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function resolveCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    return "public, max-age=60";
  }

  const fileName = path.basename(filePath);
  if (IMMUTABLE_CACHE_EXTENSIONS.has(ext) && FINGERPRINT_PATTERN.test(fileName)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600";
}

function parseHttpDate(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function isRequestFresh(headers, etag, mtimeMs) {
  const ifNoneMatch = headers["if-none-match"];
  if (ifNoneMatch && etag) {
    const candidates = ifNoneMatch
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (candidates.includes(etag)) {
      return true;
    }
  }
  const since = headers["if-modified-since"];
  if (!since) {
    return false;
  }
  const timestamp = parseHttpDate(since);
  if (timestamp === null) {
    return false;
  }
  return Math.floor(mtimeMs / 1000) <= Math.floor(timestamp / 1000);
}

async function readJsonBody(req, { limit = 1_000_000 } = {}) {
  req.setEncoding("utf8");
  let body = "";
  let totalLength = 0;

  const method = req.method ?? "GET";
  if (method === "POST" || method === "PUT") {
    const contentType = req.headers["content-type"] ?? "";
    if (!/^application\/json(?:;|$)/i.test(contentType)) {
      throw new HttpError(415, "Content-Type muss application/json sein", {
        hint: "Setzen Sie den Header 'Content-Type' auf 'application/json', um JSON-Daten zu senden.",
      });
    }
  }

  for await (const chunk of req) {
    totalLength += Buffer.byteLength(chunk);
    if (totalLength > limit) {
      throw new HttpError(413, "Request body too large", {
        hint: "Reduzieren Sie die Größe der Anfrage oder senden Sie weniger Daten pro Aufruf.",
      });
    }
    body += chunk;
  }

  if (!body.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") {
      throw new HttpError(400, "JSON body muss ein Objekt sein");
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "Ungültige JSON-Nutzlast", {
      hint: "Prüfen Sie die JSON-Syntax. Häufige Fehler sind fehlende Anführungszeichen oder Kommas.",
    });
  }
}

function sanitizePath(rootDir, requestedPath) {
  const decoded = decodeURIComponent(requestedPath);
  let normalized = path.normalize(decoded);

  if (normalized === path.sep || normalized === "." || normalized === "") {
    normalized = "index.html";
  }

  if (normalized.endsWith(path.sep)) {
    normalized = path.join(normalized, "index.html");
  }

  normalized = normalized.replace(/^[/\\]+/, "");
  if (!normalized) {
    normalized = "index.html";
  }

  const resolved = path.resolve(rootDir, normalized);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    return null;
  }

  return resolved;
}

function isHealthPath(pathname) {
  return Object.values(HEALTH_ENDPOINTS).includes(pathname);
}

function buildNotModifiedHeaders(base, headers) {
  return { ...base, ...headers };
}

function extractRequestUser(req) {
  const idHeader = req.headers?.["x-user-id"];
  const nameHeader = req.headers?.["x-user-name"];
  const roleHeader = req.headers?.["x-user-role"];
  const id = typeof idHeader === "string" && idHeader.trim() ? idHeader.trim() : null;
  if (!id) {
    return null;
  }
  const name = typeof nameHeader === "string" && nameHeader.trim() ? nameHeader.trim() : id;
  const role = typeof roleHeader === "string" && roleHeader.trim().toLowerCase() === "admin" ? "admin" : "user";
  return { id, name, role, roles: [role] };
}

function etagMatches(header, currentEtag) {
  if (!header || !currentEtag) {
    return false;
  }
  const trimmed = header.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "*") {
    return true;
  }
  const candidates = trimmed.split(",").map((tag) => tag.trim()).filter(Boolean);
  return candidates.some((candidate) => {
    if (candidate === currentEtag) return true;
    if (candidate.startsWith("W/")) {
      return candidate.slice(2) === currentEtag;
    }
    if (currentEtag.startsWith("W/")) {
      return currentEtag.slice(2) === candidate;
    }
    return false;
  });
}

function requireAuthenticated(ctx) {
  if (!ctx.authUser) {
    throw new HttpError(401, "Authentifizierung erforderlich.", {
      code: "unauthorized",
      hint: "Melden Sie sich an und wiederholen Sie den Vorgang.",
    });
  }
}

function localizePlanValidationMessage(message) {
  if (/content is required/i.test(message)) {
    return "content ist erforderlich";
  }
  if (/title is required/i.test(message)) {
    return "title ist erforderlich";
  }
  if (/focus is required/i.test(message)) {
    return "focus ist erforderlich";
  }
  if (/metadata must be an object/i.test(message)) {
    return "metadata muss ein Objekt sein";
  }
  return message;
}

class HttpApplication {
  constructor({ config, services, publicDir }) {
    this.config = config;
    this.services = services;
    this.publicDir = publicDir ?? DEFAULT_PUBLIC_DIR;
    this.sessionMiddleware = createHttpSessionMiddleware({
      sessionStore: services.sessionStore,
      cookieName: config.security.session.cookieName,
      resolveSecure: (req) => {
        const flag = config.security.session.secureCookies;
        if (flag === true) return true;
        if (flag === false) return false;
        const forwardedProto = (req.headers?.["x-forwarded-proto"] ?? "").toString().toLowerCase();
        if (forwardedProto === "https") return true;
        return Boolean(req.socket?.encrypted);
      },
      ttlMs: config.security.session.ttlMs,
    });
  }

  async handle(req, res) {
    res.locals = { jsonSpacing: this.config.server.jsonSpacing };
    const url = new URL(req.url ?? "/", "http://localhost");
    const requestLogger = createRequestLogger({
      method: req.method,
      path: url.pathname,
    });
    const startedAt = Date.now();
    const ctx = {
      config: this.config,
      services: this.services,
      url,
      logger: requestLogger,
      state: {},
      cookies: [],
      authUser: null,
    };

    try {
      await this.sessionMiddleware(req, res, ctx, async () => {
        ctx.authUser = req.session
          ? {
              id: req.session.userId ?? req.session.username,
              username: req.session.username,
              name: req.session.username ?? req.session.userId,
              roles: req.session.roles ?? [],
              role: (req.session.roles ?? [])[0] ?? "user",
              isAdmin: (req.session.roles ?? []).includes("admin") || req.session.isAdmin,
            }
          : extractRequestUser(req);
        if (ctx.authUser) {
          this.services.userService.remember(ctx.authUser);
        }

        if (isHealthPath(url.pathname)) {
          await this.handleHealth(req, res, ctx);
          return;
        }

        if (url.pathname.startsWith("/api/")) {
          await this.handleApi(req, res, ctx);
          return;
        }

        await this.handleStatic(req, res, ctx);
      });
    } catch (error) {
      if (url.pathname.startsWith("/api/")) {
        handleApiError(res, error, {
          origin: req.headers?.origin,
          allowedOrigins: this.config.server.allowedOrigins,
        });
      } else if (isHealthPath(url.pathname)) {
        const status = error instanceof HttpError ? error.status : 500;
        sendJson(res, status, { error: error.message }, { headers: buildApiHeaders() });
      } else {
        const status = error instanceof HttpError ? error.status : 500;
        sendEmpty(res, status, { headers: STATIC_SECURITY_HEADERS });
      }
    } finally {
      const durationMs = Date.now() - startedAt;
      requestLogger.info("Request beendet mit Status %s nach %dms", res.statusCode ?? "-", durationMs);
    }
  }

  async handleHealth(req, res, ctx) {
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "OPTIONS") {
      sendEmpty(res, 204, { headers: buildApiHeaders({ Allow: "GET,HEAD,OPTIONS" }) });
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      sendEmpty(res, 405, { headers: buildApiHeaders({ Allow: "GET,HEAD,OPTIONS" }) });
      return;
    }

    if (ctx.url.pathname === HEALTH_ENDPOINTS.liveness) {
      const payload = {
        status: "ok",
        timestamp: new Date().toISOString(),
      };
      sendJson(res, 200, payload, { method });
      return;
    }

    const checks = [];
    for (const [name, store] of [
      ["planStore", this.services.planStore],
      ["templateStore", this.services.templateStore],
      ["snippetStore", this.services.snippetStore],
      ["highlightConfigStore", this.services.highlightConfigStore],
      ["userStore", this.services.userService?.store],
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
    sendJson(res, statusCode, payload, {
      method,
      headers: buildApiHeaders(),
    });
  }

  async handleApi(req, res, ctx) {
    const origin = req.headers?.origin;
    const allowedOrigins = this.config.server.allowedOrigins;
    const method = (req.method ?? "GET").toUpperCase();
    const headers = (extra) => ({
      ...withCorsHeaders(buildApiHeaders(extra), origin, allowedOrigins),
      ...(ctx.cookies.length > 0 ? { "Set-Cookie": ctx.cookies } : {}),
    });

    if (method === "OPTIONS") {
      sendEmpty(res, 204, { headers: headers({}) });
      return;
    }

    if (ctx.url.pathname === "/api/auth/login") {
      if (method !== "POST") {
        sendApiEmpty(res, 405, { origin, allowedOrigins, headers: { Allow: "POST,OPTIONS" } });
        return;
      }
      const body = await readJsonBody(req);
      const username = body.username;
      const password = body.password;
      const ip = req.socket?.remoteAddress ?? "unknown";
      const user = await this.services.authService.login(username, password, { ip });
      await ctx.state.issueSession(user);
      sendApiJson(
        res,
        200,
        { id: user.id, username: user.username, roles: user.roles },
        { origin, allowedOrigins, headers: { "Set-Cookie": ctx.cookies } },
      );
      return;
    }

    if (ctx.url.pathname === "/api/auth/logout") {
      if (method !== "POST") {
        sendApiEmpty(res, 405, { origin, allowedOrigins, headers: { Allow: "POST,OPTIONS" } });
        return;
      }
      requireSession(req);
      await ctx.state.clearSession();
      sendApiEmpty(res, 204, { origin, allowedOrigins, headers: { "Set-Cookie": ctx.cookies } });
      return;
    }

    if (ctx.url.pathname === "/api/auth/me") {
      if (method !== "GET" && method !== "HEAD") {
        sendApiEmpty(res, 405, { origin, allowedOrigins, headers: { Allow: "GET,HEAD,OPTIONS" } });
        return;
      }
      if (!ctx.authUser) {
        sendApiEmpty(res, 401, { origin, allowedOrigins });
        return;
      }
      sendApiJson(
        res,
        200,
        {
          id: ctx.authUser.id,
          name: ctx.authUser.name ?? ctx.authUser.username ?? ctx.authUser.id,
          role: ctx.authUser.role ?? (ctx.authUser.roles ?? [])[0] ?? "user",
          roles: ctx.authUser.roles ?? [],
        },
        { origin, allowedOrigins, headers: { "Set-Cookie": ctx.cookies }, method },
      );
      return;
    }

    if (ctx.url.pathname.startsWith("/api/plans")) {
      await this.handlePlanRoutes(req, res, ctx, { headers, origin, allowedOrigins });
      return;
    }
    if (ctx.url.pathname.startsWith("/api/templates")) {
      await this.handleTemplateRoutes(req, res, ctx, { headers, origin, allowedOrigins });
      return;
    }
    if (ctx.url.pathname === "/api/snippets") {
      await this.handleSnippetRoutes(req, res, ctx, { headers, origin, allowedOrigins });
      return;
    }
    if (ctx.url.pathname === "/api/highlight-config") {
      await this.handleHighlightRoutes(req, res, ctx, { headers, origin, allowedOrigins });
      return;
    }
    if (ctx.url.pathname === "/api/backups") {
      await this.handleBackupRoutes(req, res, ctx, { headers, origin, allowedOrigins });
      return;
    }
    if (ctx.url.pathname === "/api/users") {
      await this.handleUserRoutes(req, res, ctx, { headers, origin, allowedOrigins });
      return;
    }

    throw new HttpError(404, "Endpoint nicht gefunden");
  }

  async handlePlanRoutes(req, res, ctx, meta) {
    const { headers, origin, allowedOrigins } = meta;
    const method = (req.method ?? "GET").toUpperCase();
    const pathParts = ctx.url.pathname.split("/").filter(Boolean);
    const hasId = pathParts.length === 3;
    if (!ctx.authUser) {
      throw new HttpError(401, "Authentifizierung erforderlich.");
    }
    if (!hasId) {
      if (method === "GET" || method === "HEAD") {
        const plans = await this.services.planService.listPlans({
          focus: ctx.url.searchParams.get("focus") ?? undefined,
          from: ctx.url.searchParams.get("from") ?? undefined,
          to: ctx.url.searchParams.get("to") ?? undefined,
        });
        sendApiJson(res, 200, plans, { origin, allowedOrigins, headers: headers({}), method });
        return;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        try {
          const { plan, etag } = await this.services.planService.createPlan(body, {
            userId: ctx.authUser?.id,
          });
          sendApiJson(res, 201, plan, {
            origin,
            allowedOrigins,
            headers: headers({ ETag: etag }),
          });
        } catch (error) {
          if (error instanceof PlanValidationError) {
            throw new HttpError(400, localizePlanValidationMessage(error.message));
          }
          throw error;
        }
        return;
      }
      if (method === "OPTIONS") {
        sendApiEmpty(res, 204, { origin, allowedOrigins });
        return;
      }
      throw new HttpError(405, "Methode nicht erlaubt");
    }

    const planId = Number(pathParts[2]);
    if (!Number.isInteger(planId)) {
      throw new HttpError(400, "Ungültige Plan-ID");
    }

    if (method === "GET" || method === "HEAD") {
      const result = await this.services.planService.getPlanWithEtag(planId);
      if (!result) {
        throw new HttpError(404, "Plan nicht gefunden");
      }
      if (etagMatches(req.headers["if-none-match"], result.etag)) {
        sendApiEmpty(res, 304, {
          origin,
          allowedOrigins,
          headers: headers({ ETag: result.etag }),
        });
        return;
      }
      sendApiJson(res, 200, result.plan, {
        origin,
        allowedOrigins,
        headers: headers({ ETag: result.etag }),
        method,
      });
      return;
    }

    if (method === "PUT") {
      const ifMatch = req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(428, "If-Match Header erforderlich", { code: "missing-precondition" });
      }
      const body = await readJsonBody(req);
      try {
        const { plan, etag } = await this.services.planService.updatePlan(planId, body, {
          expectedEtag: ifMatch,
          userId: ctx.authUser?.id,
        });
        if (!plan) {
          throw new HttpError(404, "Plan nicht gefunden");
        }
        sendApiJson(res, 200, plan, { origin, allowedOrigins, headers: headers({ ETag: etag }) });
      } catch (error) {
        if (error instanceof PlanConflictError) {
          sendApiJson(
            res,
            412,
            { error: { message: error.message, details: { currentPlan: error.currentPlan } } },
            { origin, allowedOrigins, headers: headers({ ETag: buildPlanEtag(error.currentPlan) }) },
          );
          return;
        }
        if (error instanceof PlanValidationError) {
          throw new HttpError(400, localizePlanValidationMessage(error.message));
        }
        throw error;
      }
      return;
    }

    if (method === "DELETE") {
      const ifMatch = req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(428, "If-Match Header erforderlich", { code: "missing-precondition" });
      }
      try {
        const result = await this.services.planService.deletePlan(planId, {
          expectedEtag: ifMatch,
        });
        if (!result.deleted) {
          const current = await this.services.planService.getPlanWithEtag(planId);
          if (!current) {
            throw new HttpError(404, "Plan nicht gefunden");
          }
          sendApiJson(
            res,
            412,
            { error: { message: "Plan wurde bereits geändert.", details: { currentPlan: current.plan } } },
            { origin, allowedOrigins, headers: headers({ ETag: current.etag }) },
          );
          return;
        }
        sendApiEmpty(res, 204, { origin, allowedOrigins, headers: headers({}) });
      } catch (error) {
        if (error instanceof PlanConflictError) {
          sendApiJson(
            res,
            412,
            { error: { message: error.message, details: { currentPlan: error.currentPlan } } },
            { origin, allowedOrigins, headers: headers({ ETag: buildPlanEtag(error.currentPlan) }) },
          );
          return;
        }
        throw error;
      }
      return;
    }

    if (method === "OPTIONS") {
      sendApiEmpty(res, 204, { origin, allowedOrigins });
      return;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  }

  async handleTemplateRoutes(req, res, ctx, meta) {
    const { headers, origin, allowedOrigins } = meta;
    const method = (req.method ?? "GET").toUpperCase();
    const pathParts = ctx.url.pathname.split("/").filter(Boolean);
    const hasId = pathParts.length === 3;
    requireAuthenticated(ctx);

    if (!hasId) {
      if (method === "GET" || method === "HEAD") {
        const templates = await this.services.templateService.listTemplates();
        sendApiJson(
          res,
          200,
          templates.map((entry) => entry.template),
          { origin, allowedOrigins, headers: headers({}), method },
        );
        return;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        try {
          const { template, etag } = await this.services.templateService.createTemplate(body);
          sendApiJson(res, 201, template, {
            origin,
            allowedOrigins,
            headers: headers({ ETag: etag }),
          });
        } catch (error) {
          if (error instanceof TemplateValidationError) {
            throw new HttpError(400, error.message);
          }
          throw error;
        }
        return;
      }
      if (method === "OPTIONS") {
        sendApiEmpty(res, 204, { origin, allowedOrigins });
        return;
      }
      throw new HttpError(405, "Methode nicht erlaubt");
    }

    const templateId = decodeURIComponent(pathParts[2]);
    if (method === "GET" || method === "HEAD") {
      const { template, etag } = await this.services.templateService.getTemplate(templateId);
      if (!template) {
        throw new HttpError(404, "Vorlage nicht gefunden");
      }
      if (etagMatches(req.headers["if-none-match"], etag)) {
        sendApiEmpty(res, 304, { origin, allowedOrigins, headers: headers({ ETag: etag }) });
        return;
      }
      sendApiJson(res, 200, template, {
        origin,
        allowedOrigins,
        headers: headers({ ETag: etag }),
        method,
      });
      return;
    }

    if (method === "PUT") {
      const body = await readJsonBody(req);
      try {
        const { template, etag } = await this.services.templateService.updateTemplate(templateId, body);
        if (!template) {
          throw new HttpError(404, "Vorlage nicht gefunden");
        }
        sendApiJson(res, 200, template, { origin, allowedOrigins, headers: headers({ ETag: etag }) });
      } catch (error) {
        if (error instanceof TemplateValidationError) {
          throw new HttpError(400, error.message);
        }
        throw error;
      }
      return;
    }

    if (method === "DELETE") {
      const deleted = await this.services.templateService.deleteTemplate(templateId);
      if (!deleted) {
        throw new HttpError(404, "Vorlage nicht gefunden");
      }
      sendApiEmpty(res, 204, { origin, allowedOrigins, headers: headers({}) });
      return;
    }

    if (method === "OPTIONS") {
      sendApiEmpty(res, 204, { origin, allowedOrigins });
      return;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  }

  async handleSnippetRoutes(req, res, ctx, meta) {
    const { headers, origin, allowedOrigins } = meta;
    const method = (req.method ?? "GET").toUpperCase();
    requireAuthenticated(ctx);
    if (method === "GET" || method === "HEAD") {
      const library = await this.services.snippetService.getLibrary();
      sendApiJson(res, 200, library, { origin, allowedOrigins, headers: headers({}), method });
      return;
    }
    if (method === "PUT") {
      const body = await readJsonBody(req);
      try {
        const saved = await this.services.snippetService.replaceLibrary(body);
        sendApiJson(res, 200, saved, { origin, allowedOrigins, headers: headers({}) });
      } catch (error) {
        const code = error.code ?? "invalid-snippet-payload";
        sendApiJson(res, 400, { error: { code, message: error.message } }, { origin, allowedOrigins });
      }
      return;
    }
    if (method === "OPTIONS") {
      sendApiEmpty(res, 204, { origin, allowedOrigins });
      return;
    }
    throw new HttpError(405, "Methode nicht erlaubt");
  }

  async handleHighlightRoutes(req, res, ctx, meta) {
    const { headers, origin, allowedOrigins } = meta;
    const method = (req.method ?? "GET").toUpperCase();
    requireAuthenticated(ctx);
    if (method === "GET" || method === "HEAD") {
      const config = await this.services.highlightConfigService.getConfig();
      sendApiJson(res, 200, config, { origin, allowedOrigins, headers: headers({}), method });
      return;
    }
    if (method === "PUT") {
      const body = await readJsonBody(req);
      const updated = await this.services.highlightConfigService.updateConfig(body);
      sendApiJson(res, 200, updated, { origin, allowedOrigins, headers: headers({}) });
      return;
    }
    if (method === "OPTIONS") {
      sendApiEmpty(res, 204, { origin, allowedOrigins });
      return;
    }
    throw new HttpError(405, "Methode nicht erlaubt");
  }

  async handleBackupRoutes(req, res, ctx, meta) {
    const { headers, origin, allowedOrigins } = meta;
    const method = (req.method ?? "GET").toUpperCase();
    requireAuthenticated(ctx);
    if (method === "GET" || method === "HEAD") {
      const backup = await this.services.planService.exportBackup();
      sendApiJson(
        res,
        200,
        { ...backup, planCount: backup.data?.plans?.length ?? 0 },
        { origin, allowedOrigins, headers: headers({}), method },
      );
      return;
    }
    if (method === "POST") {
      const body = await readJsonBody(req);
      try {
        const restored = await this.services.planService.importBackup(body);
        sendApiJson(
          res,
          200,
          {
            success: true,
            planCount: restored?.plans?.length ?? body?.data?.plans?.length ?? 0,
            ...restored,
          },
          { origin, allowedOrigins, headers: headers({}) },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendApiJson(res, 400, { error: { message } }, { origin, allowedOrigins });
      }
      return;
    }
    if (method === "OPTIONS") {
      sendApiEmpty(res, 204, { origin, allowedOrigins });
      return;
    }
    throw new HttpError(405, "Methode nicht erlaubt");
  }

  async handleUserRoutes(req, res, ctx, meta) {
    const { headers, origin, allowedOrigins } = meta;
    const method = (req.method ?? "GET").toUpperCase();
    if (!ctx.authUser || !(ctx.authUser.role === "admin" || (ctx.authUser.roles ?? []).includes("admin"))) {
      throw new HttpError(403, "Nur Admins dürfen Benutzer abrufen.");
    }
    if (method === "GET" || method === "HEAD") {
      const users = await this.services.userService.listUsers();
      sendApiJson(res, 200, users, { origin, allowedOrigins, headers: headers({}), method });
      return;
    }
    if (method === "OPTIONS") {
      sendApiEmpty(res, 204, { origin, allowedOrigins });
      return;
    }
    throw new HttpError(405, "Methode nicht erlaubt");
  }

  async handleStatic(req, res, ctx) {
    const safePath = sanitizePath(this.publicDir, ctx.url.pathname);
    if (!safePath) {
      sendEmpty(res, 403, { headers: STATIC_SECURITY_HEADERS });
      return;
    }

    let filePath = safePath;
    let fileStat;
    let attemptedFallback = false;

    while (true) {
      try {
        fileStat = await stat(filePath);
        if (fileStat.isDirectory()) {
          filePath = path.join(filePath, "index.html");
          continue;
        }
        break;
      } catch (error) {
        if (!attemptedFallback && (req.method === "GET" || req.method === "HEAD")) {
          filePath = path.join(this.publicDir, "index.html");
          attemptedFallback = true;
          continue;
        }
        sendEmpty(res, 404, { headers: STATIC_SECURITY_HEADERS });
        return;
      }
    }

    const method = req.method ?? "GET";
    const mime = mapExtension(filePath);
    const etag = `"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
    const cacheHeaders = {
      "Last-Modified": fileStat.mtime.toUTCString(),
      ETag: etag,
      "Cache-Control": resolveCacheControl(filePath),
    };

    const notModifiedHeaders = { ...cacheHeaders, ...STATIC_SECURITY_HEADERS };
    if (isRequestFresh(req.headers ?? {}, etag, fileStat.mtimeMs)) {
      res.writeHead(304, notModifiedHeaders);
      res.end();
      return;
    }

    const headers = {
      ...cacheHeaders,
      "Content-Type": mime,
      "Content-Length": fileStat.size,
    };
    const responseHeaders = { ...headers, ...STATIC_SECURITY_HEADERS };

    if (method === "HEAD") {
      res.writeHead(200, responseHeaders);
      res.end();
      return;
    }

    if (method !== "GET") {
      sendEmpty(res, 405, { headers: STATIC_SECURITY_HEADERS });
      return;
    }

    const stream = createReadStream(filePath);
    stream.once("open", () => {
      res.writeHead(200, responseHeaders);
    });
    stream.once("error", (error) => {
      if (!res.headersSent) {
        const status = error?.code === "ENOENT" ? 404 : 500;
        sendEmpty(res, status, { headers: STATIC_SECURITY_HEADERS });
      } else {
        res.destroy(error);
      }
    });
    res.once("close", () => {
      stream.destroy();
    });
    stream.pipe(res);
  }
}

function createServer(options = {}) {
  const config = options.config ?? runtimeConfig;
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR;

  const planStore = options.store ?? new JsonPlanStore();
  const templateStore = options.templateStore ?? new JsonTemplateStore();
  const snippetStore = options.snippetStore ?? new JsonSnippetStore();
  const highlightConfigStore = options.highlightConfigStore ?? new JsonHighlightConfigStore();
  const sessionStore =
    options.sessionStore ??
    new SessionStore({
      storageFile: path.join(config.paths.dataDir, "sessions.json"),
      defaultTtlMs: config.security.session.ttlMs,
    });

  const userStore = options.userStore ?? new JsonUserStore();

  const seedUsers = options.users ?? Object.values(config.security.defaultUsers ?? {});
  const userService = new UserService({
    store: userStore,
    defaults: seedUsers,
  });
  if (!options.users) {
    awaitPromise(userService.ensureSeedUsers(seedUsers));
  }

  const planService = new PlanService({ store: planStore });
  const templateService = new TemplateService({ store: templateStore });
  const snippetService = new SnippetService({ store: snippetStore });
  const highlightConfigService = new HighlightConfigService({ store: highlightConfigStore });
  const authService = new AuthService({
    userService,
    rateLimit: config.security.loginRateLimit,
  });

  const app = new HttpApplication({
    config,
    services: {
      planService,
      templateService,
      snippetService,
      highlightConfigService,
      authService,
      sessionStore,
      planStore,
      templateStore,
      snippetStore,
      highlightConfigStore,
      userService,
    },
    publicDir,
  });

  const server = createHttpServer((req, res) => {
    app.handle(req, res);
  });

  server.on("close", async () => {
    await planStore?.close?.();
    await templateStore?.close?.();
    await snippetStore?.close?.();
    await highlightConfigStore?.close?.();
    await sessionStore?.close?.();
  });

  const gracefulSignals = options.gracefulShutdownSignals ?? ["SIGTERM", "SIGINT"];
  for (const signal of gracefulSignals) {
    process.once(signal, async () => {
      logger.info("Schließe Server aufgrund von %s", signal);
      server.close();
      await planStore?.close?.();
      await templateStore?.close?.();
      await snippetStore?.close?.();
      await highlightConfigStore?.close?.();
      await sessionStore?.close?.();
    });
  }

  return server;
}

function awaitPromise(promise) {
  if (promise && typeof promise.then === "function") {
    promise.catch((error) => {
      logger.warn("Initial seed failed: %s", error instanceof Error ? error.message : String(error));
    });
  }
}

export { createServer, HttpApplication };
