// Authentifizierungsrouten: reguläres Login, Logout und optionale Dev-Login-
// Unterstützung für lokale Umgebungen.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";

function buildDevAuthPayload(config) {
  const devAuth = config?.security?.devAuth;
  if (!devAuth?.enabled) {
    return null;
  }
  const users = Array.isArray(devAuth.users)
    ? devAuth.users
        .map((entry) => ({
          username: entry?.username,
          roles: Array.isArray(entry?.roles) ? entry.roles : [],
          isAdmin: Boolean(entry?.isAdmin || (entry?.roles ?? []).includes("admin")),
        }))
        .filter((user) => typeof user.username === "string" && user.username.trim())
    : [];

  return {
    enabled: true,
    environment: devAuth.environment ?? "dev",
    defaultPassword: devAuth.defaultPassword ?? null,
    users,
  };
}

function createAuthRouter({ authService }) {
  return async function authRouter(ctx) {
    const { pathname } = ctx.url;
    const method = (ctx.req.method ?? "GET").toUpperCase();
    const origin = ctx.origin;
    const allowedOrigins = ctx.config.server.allowedOrigins;
    const devAuthPayload = buildDevAuthPayload(ctx.config);

    if (pathname === "/api/auth/dev-login") {
      if (!devAuthPayload?.enabled) {
        sendApiEmpty(ctx.res, 404, { origin, allowedOrigins });
        return true;
      }
      if (method === "OPTIONS") {
        sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
        return true;
      }
      if (method !== "POST") {
        sendApiEmpty(ctx.res, 405, { origin, allowedOrigins, headers: { Allow: "POST,OPTIONS" } });
        return true;
      }
      const username = typeof ctx.body?.username === "string" ? ctx.body.username.trim() : "";
      const password = typeof ctx.body?.password === "string" ? ctx.body.password : "";
      if (!username) {
        throw new HttpError(400, "Benutzername wird benötigt.");
      }
      const selected = devAuthPayload.users.find((user) => user.username === username);
      if (!selected) {
        throw new HttpError(404, "Unbekannter Dev-Benutzer.", { code: "unknown-user" });
      }
      if (devAuthPayload.defaultPassword) {
        if (!password) {
          throw new HttpError(400, "Passwort wird benötigt.", { code: "missing-dev-password" });
        }
        if (password !== devAuthPayload.defaultPassword) {
          throw new HttpError(401, "Ungültiges Passwort für den Dev-Modus.", { code: "invalid-dev-password" });
        }
      }
      const issued = await ctx.session.issue({
        id: selected.username,
        username: selected.username,
        roles: selected.roles ?? [],
        isAdmin: selected.isAdmin ?? false,
      });
      ctx.logger?.info("Dev-Login erteilt für Benutzer %s", selected.username);
      sendApiJson(
        ctx.res,
        200,
        {
          id: issued.userId ?? issued.username,
          username: issued.username,
          roles: issued.roles ?? [],
          devAuth: devAuthPayload,
        },
        { origin, allowedOrigins, headers: ctx.withCookies() },
      );
      return true;
    }

    if (pathname === "/api/auth/login") {
      if (method === "OPTIONS") {
        sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
        return true;
      }
      if (method !== "POST") {
        sendApiEmpty(ctx.res, 405, { origin, allowedOrigins, headers: { Allow: "POST,OPTIONS" } });
        return true;
      }
      const username = ctx.body?.username;
      const password = ctx.body?.password;
      const ip = ctx.req.socket?.remoteAddress ?? "unknown";
      try {
        const user = await authService.login(username, password, { ip });
        await ctx.session.issue(user);
        ctx.logger?.info("Login erfolgreich für Benutzer %s von %s", user.username, ip);
        sendApiJson(
          ctx.res,
          200,
          { id: user.id, username: user.username, roles: user.roles },
          { origin, allowedOrigins, headers: ctx.withCookies() },
        );
      } catch (error) {
        const reason =
          error instanceof HttpError
            ? `${error.status ?? "n/a"} ${error.code ?? "http-error"}${error.hint ? ` (${error.hint})` : ""}`
            : error?.message ?? "unbekannter Fehler";
        ctx.logger?.warn("Login fehlgeschlagen für Benutzer %s von %s: %s", username ?? "<leer>", ip, reason);
        throw error;
      }
      return true;
    }

    if (pathname === "/api/auth/logout") {
      if (method === "OPTIONS") {
        sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
        return true;
      }
      if (method !== "POST") {
        sendApiEmpty(ctx.res, 405, { origin, allowedOrigins, headers: { Allow: "POST,OPTIONS" } });
        return true;
      }
      if (!ctx.req.session) {
        throw new HttpError(401, "Authentifizierung erforderlich.");
      }
      await ctx.session.clear();
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    if (pathname === "/api/auth/me") {
      if (method === "OPTIONS") {
        sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
        return true;
      }
      if (method !== "GET" && method !== "HEAD") {
        sendApiEmpty(ctx.res, 405, { origin, allowedOrigins, headers: { Allow: "GET,HEAD,OPTIONS" } });
        return true;
      }
      if (!ctx.authUser) {
        if (devAuthPayload?.enabled) {
          sendApiJson(
            ctx.res,
            200,
            { authenticated: false, devAuth: devAuthPayload },
            { origin, allowedOrigins, headers: ctx.withCookies(), method },
          );
          return true;
        }
        sendApiEmpty(ctx.res, 401, { origin, allowedOrigins, headers: ctx.withCookies() });
        return true;
      }
      const roles = ctx.authUser.roles ?? [];
      const role = ctx.authUser.role ?? roles[0] ?? "user";
      const username = ctx.authUser.username ?? ctx.authUser.name ?? ctx.authUser.id;
      const isAdmin = roles.includes("admin") || ctx.authUser.isAdmin === true || role === "admin";

      sendApiJson(
        ctx.res,
        200,
        {
          id: ctx.authUser.id,
          username,
          name: ctx.authUser.name ?? username,
          role,
          roles,
          isAdmin,
          authenticated: true,
          devAuth: devAuthPayload ?? undefined,
        },
        { origin, allowedOrigins, headers: ctx.withCookies(), method },
      );
      return true;
    }

    return false;
  };
}

export { createAuthRouter };
