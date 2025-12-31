import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";

function createAuthRouter({ authService }) {
  return async function authRouter(ctx) {
    const { pathname } = ctx.url;
    const method = (ctx.req.method ?? "GET").toUpperCase();
    const origin = ctx.origin;
    const allowedOrigins = ctx.config.server.allowedOrigins;

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
        },
        { origin, allowedOrigins, headers: ctx.withCookies(), method },
      );
      return true;
    }

    return false;
  };
}

export { createAuthRouter };
