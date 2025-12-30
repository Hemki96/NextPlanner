import { buildExpiredSessionCookie, buildSessionCookie } from "../sessions/http-session-middleware.js";

function createRequestContext({ req, res, config, services, logger, sessionMiddleware }) {
  const ctx = {
    req,
    res,
    url: new URL(req.url ?? "/", "http://localhost"),
    config,
    services,
    logger,
    cookies: [],
    withCookies: (extra = {}) => (ctx.cookies.length > 0 ? { ...extra, "Set-Cookie": ctx.cookies } : extra),
    state: {},
    authUser: null,
    origin: req.headers?.origin,
    session: {
      issue: async (user) => {
        const session = await services.sessionStore.createSession({
          userId: user.id ?? user.username,
          username: user.username,
          roles: user.roles ?? [],
          isAdmin: Boolean(user.isAdmin),
          ttlMs: config.security.session.ttlMs,
        });
        const secure = sessionMiddleware.resolveSecure ? sessionMiddleware.resolveSecure(req) : true;
        ctx.cookies.push(
          sessionMiddleware.buildSessionCookie
            ? sessionMiddleware.buildSessionCookie(session.token, session.expiresAt, { secure })
            : buildSessionCookie(config.security.session.cookieName, session.token, session.expiresAt, {
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
        services.userService.remember?.(ctx.authUser);
        return session;
      },
      clear: async () => {
        if (req.session?.token) {
          await services.sessionStore.deleteSession(req.session.token);
        }
        const secure = sessionMiddleware.resolveSecure ? sessionMiddleware.resolveSecure(req) : true;
        ctx.cookies.push(
          sessionMiddleware.buildExpiredSessionCookie
            ? sessionMiddleware.buildExpiredSessionCookie({ secure })
            : buildExpiredSessionCookie(config.security.session.cookieName, { secure }),
        );
        req.session = null;
        ctx.authUser = null;
      },
    },
  };

  return ctx;
}

export { createRequestContext };
