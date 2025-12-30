import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { JsonStore } from "../app/stores/json-store.js";
import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";

const DEFAULT_SESSION_FILE = join(DATA_DIR, "sessions.json");
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12h

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => (typeof role === "string" ? role.trim() : null))
    .filter(Boolean);
}

function normalizeSession(raw) {
  const createdAt = new Date(raw.createdAt ?? Date.now());
  const expires = new Date(raw.expiresAt ?? Date.now());
  const lastAccess = new Date(raw.lastAccessAt ?? createdAt);
  return {
    token: String(raw.token ?? randomUUID()),
    userId: raw.userId ?? null,
    username: raw.username ?? null,
    roles: normalizeRoles(raw.roles),
    isAdmin: Boolean(raw.isAdmin),
    createdAt: createdAt.toISOString(),
    lastAccessAt: lastAccess.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

function filterValidSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  const now = Date.now();
  return sessions
    .map((session) => normalizeSession(session))
    .filter((session) => Date.parse(session.expiresAt) > now && session.token);
}

function buildStore(storageFile) {
  return new JsonStore({
    filePath: storageFile,
    defaultValue: { sessions: [] },
    normalize: (data) => ({
      sessions: filterValidSessions(data?.sessions ?? []),
    }),
    onCorrupt: (error) => {
      logger.warn(
        "Konnte Session-Datei nicht laden: %s",
        error instanceof Error ? error.message : String(error),
      );
      return { sessions: [] };
    },
  });
}

class SessionStore {
  constructor({ storageFile = DEFAULT_SESSION_FILE, defaultTtlMs = DEFAULT_TTL_MS } = {}) {
    this.storageFile = storageFile;
    this.defaultTtlMs = defaultTtlMs;
    this.store = storageFile ? buildStore(storageFile) : null;
    this.ready = this.store ? this.store.ready() : Promise.resolve();
  }

  async createSession({ token, userId, username, roles = [], isAdmin = false, ttlMs } = {}) {
    await this.ready;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlMs ?? this.defaultTtlMs));
    const session = {
      token: token ?? randomUUID(),
      userId,
      username,
      roles: Array.isArray(roles) ? roles : roles ? [roles] : [],
      isAdmin: Boolean(isAdmin),
      createdAt: now.toISOString(),
      lastAccessAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    if (!this.store) {
      return session;
    }
    await this.store.update((data) => {
      const sessions = filterValidSessions(data.sessions ?? []);
      sessions.push(session);
      return { sessions };
    });
    return session;
  }

  async getSession(token) {
    if (!token || !this.store) {
      return null;
    }
    let result = null;
    await this.store.update((data) => {
      const sessions = filterValidSessions(data.sessions ?? []);
      const found = sessions.find((entry) => entry.token === token);
      if (found) {
        found.lastAccessAt = new Date().toISOString();
        result = { ...found };
      }
      return { sessions };
    });
    return result;
  }

  async deleteSession(token) {
    if (!token || !this.store) {
      return false;
    }
    let deleted = false;
    await this.store.update((data) => {
      const sessions = filterValidSessions(data.sessions ?? []);
      const next = sessions.filter((entry) => {
        const keep = entry.token !== token;
        if (!keep) deleted = true;
        return keep;
      });
      return { sessions: next };
    });
    return deleted;
  }

  async pruneExpired() {
    if (!this.store) return;
    await this.store.update((data) => ({ sessions: filterValidSessions(data.sessions ?? []) }));
  }

  async close() {
    if (!this.store) return;
    await this.store.close();
  }
}

export { SessionStore };
