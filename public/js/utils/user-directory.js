import { ApiError, apiRequest, canUseApi } from "./api-client.js";

const userCache = new Map();
let directoryPromise = null;

function normalizeUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }
  const rawId = user.id ?? user.userId;
  if (typeof rawId !== "string" && typeof rawId !== "number") {
    return null;
  }
  const id = String(rawId).trim();
  if (!id) {
    return null;
  }
  const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : id;
  const role = typeof user.role === "string" && user.role.trim().toLowerCase() === "admin" ? "admin" : "user";
  return { id, name, role };
}

function rememberUsers(users = []) {
  for (const user of users) {
    const normalized = normalizeUser(user);
    if (normalized) {
      userCache.set(normalized.id, normalized);
    }
  }
}

async function fetchUserDirectory() {
  try {
    const { data } = await apiRequest("/api/users");
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.users)) {
      return data.users;
    }
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      return null;
    }
    console.warn("Konnte Benutzerverzeichnis nicht abrufen:", error);
  }
  return null;
}

export async function ensureUserDirectory() {
  if (directoryPromise) {
    return directoryPromise;
  }
  directoryPromise = (async () => {
    if (!canUseApi()) {
      return [];
    }
    const directory = await fetchUserDirectory();
    if (Array.isArray(directory) && directory.length > 0) {
      rememberUsers(directory);
      return Array.from(userCache.values());
    }
    return Array.from(userCache.values());
  })();

  try {
    return await directoryPromise;
  } catch (error) {
    console.warn("Konnte Benutzerinformationen nicht laden:", error);
    directoryPromise = null;
    return Array.from(userCache.values());
  }
}

export async function resolveUserDirectory(userIds = []) {
  const users = await ensureUserDirectory();
  const lookup = new Map(users.map((user) => [user.id, user]));
  for (const id of userIds) {
    if (id && !lookup.has(id)) {
      const label = typeof id === "string" ? id : String(id);
      lookup.set(id, { id: label, name: label });
    }
  }
  return lookup;
}

export function getCachedUsers() {
  return new Map(userCache);
}
