import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { runtimeConfig } from "./config/runtime-config.js";
import { handleApiError, sendEmpty } from "./http/responses.js";
import { HttpError } from "./http/http-error.js";
import {
  createHttpSessionMiddleware,
  buildSessionCookie,
  buildExpiredSessionCookie,
} from "./sessions/http-session-middleware.js";
import { SessionStore } from "./sessions/session-store.js";
import { JsonPlanStore } from "./stores/json-plan-store.js";
import { JsonTemplateStore } from "./stores/json-template-store.js";
import { JsonSnippetStore } from "./stores/json-snippet-store.js";
import { JsonHighlightConfigStore } from "./stores/json-highlight-config-store.js";
import { JsonUserStore } from "./stores/json-user-store.js";
import { PlanService } from "./services/plan-service.js";
import { TemplateService } from "./services/template-service.js";
import { SnippetService } from "./services/snippet-service.js";
import { HighlightConfigService } from "./services/highlight-config-service.js";
import { AuthService } from "./services/auth-service.js";
import { UserService } from "./services/user-service.js";
import { logger, createRequestLogger } from "./logger.js";
import { buildRouters } from "./routes/index.js";
import { readJsonBody } from "./http/body.js";

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

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.join(CURRENT_DIR, "..", "public");

class HttpApplication {
  constructor({ config, services, publicDir }) {
    this.config = config;
    this.services = services;
    this.publicDir = publicDir ?? DEFAULT_PUBLIC_DIR;
    this.routers = buildRouters({ services, publicDir: this.publicDir });
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
      req,
      res,
      url,
      config: this.config,
      services: this.services,
      logger: requestLogger,
      cookies: [],
      withCookies: (extra = {}) => (ctx.cookies.length > 0 ? { ...extra, "Set-Cookie": ctx.cookies } : extra),
      state: {},
      authUser: null,
      origin: req.headers?.origin,
      session: {
        issue: async (user) => {
          const session = await this.services.sessionStore.createSession({
            userId: user.id ?? user.username,
            username: user.username,
            roles: user.roles ?? [],
            isAdmin: Boolean(user.isAdmin),
            ttlMs: this.config.security.session.ttlMs,
          });
          const secure = this.sessionMiddleware.resolveSecure
            ? this.sessionMiddleware.resolveSecure(req)
            : true;
          ctx.cookies.push(
            this.sessionMiddleware.buildSessionCookie
              ? this.sessionMiddleware.buildSessionCookie(session.token, session.expiresAt, { secure })
              : buildSessionCookie(this.config.security.session.cookieName, session.token, session.expiresAt, {
                  secure,
                }),
          );
          req.session = session;
          ctx.authUser = {
            id: session.userId ?? session.username,
            username: session.username,
            name: session.username ?? session.userId,
            roles: session.roles ?? [],
            role: (session.roles ?? [])[0] ?? "user",
            isAdmin: (session.roles ?? []).includes("admin") || session.isAdmin,
          };
          this.services.userService.remember(ctx.authUser);
          return session;
        },
        clear: async () => {
          if (req.session?.token) {
            await this.services.sessionStore.deleteSession(req.session.token);
          }
          const secure = this.sessionMiddleware.resolveSecure
            ? this.sessionMiddleware.resolveSecure(req)
            : true;
          ctx.cookies.push(
            this.sessionMiddleware.buildExpiredSessionCookie
              ? this.sessionMiddleware.buildExpiredSessionCookie({ secure })
              : buildExpiredSessionCookie(this.config.security.session.cookieName, { secure }),
          );
          req.session = null;
          ctx.authUser = null;
        },
      },
    };

    try {
      await this.sessionMiddleware(req, res, ctx, async () => {
        if (req.session) {
          ctx.authUser = {
            id: req.session.userId ?? req.session.username,
            username: req.session.username,
            name: req.session.username ?? req.session.userId,
            roles: req.session.roles ?? [],
            role: (req.session.roles ?? [])[0] ?? "user",
            isAdmin: (req.session.roles ?? []).includes("admin") || req.session.isAdmin,
          };
          this.services.userService.remember(ctx.authUser);
        }
        if (!ctx.authUser) {
          const headerUser = extractRequestUser(req);
          if (headerUser) {
            ctx.authUser = headerUser;
            this.services.userService.remember(headerUser);
          }
        }

        const upperMethod = (req.method ?? "GET").toUpperCase();
        if (
          ctx.url.pathname.startsWith("/api/") &&
          (upperMethod === "POST" || upperMethod === "PUT" || upperMethod === "PATCH")
        ) {
          const contentType = req.headers?.["content-type"] ?? "";
          if (/^application\/json/i.test(contentType)) {
            ctx.body = await readJsonBody(req);
          } else {
            ctx.body = {};
          }
        }

        for (const router of this.routers) {
          // eslint-disable-next-line no-await-in-loop
          const handled = await router(ctx);
          if (handled) return;
        }
        throw new HttpError(404, "Endpoint nicht gefunden");
      });
    } catch (error) {
      if (ctx.url.pathname.startsWith("/api/")) {
        handleApiError(res, error, {
          origin: ctx.origin,
          allowedOrigins: this.config.server.allowedOrigins,
          cookies: ctx.cookies,
        });
      } else {
        const status = error instanceof HttpError ? error.status : 500;
        sendEmpty(res, status);
      }
    } finally {
      const durationMs = Date.now() - startedAt;
      requestLogger.info("Request beendet mit Status %s nach %dms", res.statusCode ?? "-", durationMs);
    }
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
    userService.ensureSeedUsers(seedUsers).catch((error) => {
      logger.warn("Initial seed failed: %s", error instanceof Error ? error.message : String(error));
    });
  }

  const services = {
    planService: new PlanService({ store: planStore }),
    templateService: new TemplateService({ store: templateStore }),
    snippetService: new SnippetService({ store: snippetStore }),
    highlightConfigService: new HighlightConfigService({ store: highlightConfigStore }),
    authService: new AuthService({ userService, rateLimit: config.security.loginRateLimit }),
    sessionStore,
    planStore,
    templateStore,
    snippetStore,
    highlightConfigStore,
    userService,
  };

  const app = new HttpApplication({ config, services, publicDir });
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

export { createServer, HttpApplication };
