// Session-Middleware für HTTP: parst Cookies, stellt Sessions bereit und
// erzwingt einen optionalen Sicherheits-Check je Route.
import { HttpError } from "../http/http-error.js";

function parseCookies(header = "") {
  return (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [name, ...rest] = part.split("=");
      if (!name) {
        return acc;
      }
      acc[name] = rest.join("=");
      return acc;
    }, {});
}

function buildSessionCookie(cookieName, token, expiresAt, { secure = true } = {}) {
  const parts = [`${cookieName}=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (secure) {
    parts.push("Secure");
  }
  const expiresDate = new Date(expiresAt);
  if (!Number.isNaN(expiresDate.getTime())) {
    const maxAgeSeconds = Math.max(0, Math.floor((expiresDate.getTime() - Date.now()) / 1000));
    parts.push(`Expires=${expiresDate.toUTCString()}`);
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join("; ");
}

function buildExpiredSessionCookie(cookieName, { secure = true } = {}) {
  const parts = [`${cookieName}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function createHttpSessionMiddleware({
  sessionStore,
  cookieName,
  resolveSecure = () => true,
  ttlMs,
} = {}) {
  if (!sessionStore) {
    throw new Error("sessionStore is required for session middleware.");
  }
  const name = cookieName ?? "nextplanner_session";
  const ttl = ttlMs ?? 1000 * 60 * 60 * 12;

  const middleware = async function httpSessionMiddleware(req, res, ctx, next) {
    const cookies = parseCookies(req.headers?.cookie ?? "");
    const token = cookies[name];
    if (token) {
      const session = await sessionStore.getSession(token);
      if (session) {
        req.session = session;
        ctx.state.session = session;
      }
    }

    ctx.state.issueSession = async (user) => {
      const session = await sessionStore.createSession({
        userId: user.id ?? user.username,
        username: user.username,
        roles: user.roles ?? [],
        isAdmin: Boolean(user.isAdmin),
        ttlMs: ttl,
      });
      const secure = resolveSecure(req);
      const cookie = buildSessionCookie(name, session.token, session.expiresAt, { secure });
      ctx.cookies.push(cookie);
      ctx.state.session = session;
      req.session = session;
      return session;
    };

    ctx.state.clearSession = async () => {
      if (token) {
        await sessionStore.deleteSession(token);
      }
      const secure = resolveSecure(req);
      const cookie = buildExpiredSessionCookie(name, { secure });
      ctx.cookies.push(cookie);
      ctx.state.session = null;
      req.session = null;
    };

    await next();
  };

  middleware.resolveSecure = resolveSecure;
  middleware.buildSessionCookie = (token, expiresAt, options) =>
    buildSessionCookie(name, token, expiresAt, options);
  middleware.buildExpiredSessionCookie = (options) => buildExpiredSessionCookie(name, options);

  return middleware;
}

function requireSession(req) {
  if (!req.session) {
    throw new HttpError(401, "Authentifizierung erforderlich.", {
      code: "unauthorized",
      hint: "Melden Sie sich an und wiederholen Sie den Vorgang.",
    });
  }
}

export {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createHttpSessionMiddleware,
  parseCookies,
  requireSession,
};
