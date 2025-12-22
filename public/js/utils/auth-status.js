import { get } from "./api-client.js";

let cachedStatus = null;
let inflight = null;

function buildDefaultStatus() {
  return { isAdmin: false, authenticated: false, username: null };
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
      const status = {
        isAdmin: Boolean(data?.isAdmin),
        authenticated: Boolean(data?.authenticated ?? data?.isAdmin),
        username: data?.username ?? null,
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
