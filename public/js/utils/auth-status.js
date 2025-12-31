import { get } from "./api-client.js";

let cachedStatus = null;
let inflight = null;

function buildDefaultStatus() {
  return { isAdmin: false, authenticated: false, username: null, devAuth: { enabled: false } };
}

function normalizeDevAuth(devAuth) {
  if (!devAuth || typeof devAuth !== "object") {
    return { enabled: false };
  }
  const users = Array.isArray(devAuth.users)
    ? devAuth.users
        .map((user) => ({
          username: user?.username,
          roles: Array.isArray(user?.roles) ? user.roles : [],
          isAdmin: Boolean(user?.isAdmin || (user?.roles ?? []).includes("admin")),
        }))
        .filter((user) => typeof user.username === "string" && user.username.trim())
    : [];

  return {
    enabled: Boolean(devAuth.enabled),
    environment: devAuth.environment ?? null,
    defaultPassword: devAuth.defaultPassword ?? null,
    users,
  };
}

export async function fetchAuthStatus() {
  if (cachedStatus) {
    return cachedStatus;
  }
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const { data } = await get("/api/auth/me");
      const username = data?.username ?? data?.name ?? null;
      const roles = Array.isArray(data?.roles) ? data.roles : [];
      const isAdmin =
        data?.isAdmin === true ||
        roles.includes("admin") ||
        data?.role === "admin" ||
        false;
      const status = {
        isAdmin,
        authenticated: Boolean(data?.authenticated ?? isAdmin || data?.id || username),
        username,
        devAuth: normalizeDevAuth(data?.devAuth),
      };
      cachedStatus = status;
      return status;
    } catch {
      const fallback = buildDefaultStatus();
      cachedStatus = fallback;
      return fallback;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function resetAuthStatusCache() {
  cachedStatus = null;
  inflight = null;
}
