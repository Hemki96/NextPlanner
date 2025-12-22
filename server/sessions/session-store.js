import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";

const DEFAULT_SESSION_FILE = join(DATA_DIR, "sessions.json");
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12h

async function ensureDirectory(filePath) {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function isExpired(session, now = Date.now()) {
  const expiresAt = Date.parse(session.expiresAt ?? "");
  return Number.isNaN(expiresAt) || expiresAt <= now;
}

export class SessionStore {
  constructor({ storageFile = DEFAULT_SESSION_FILE, defaultTtlMs = DEFAULT_TTL_MS } = {}) {
    this.storageFile = storageFile;
    this.defaultTtlMs = defaultTtlMs;
    this.sessions = new Map();
    this.ready = this.loadFromDisk();
  }

  async loadFromDisk() {
    if (!this.storageFile) {
      return;
    }
    try {
      const raw = await fs.readFile(this.storageFile, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sessions)) {
        const now = Date.now();
        for (const session of parsed.sessions) {
          if (!isExpired(session, now) && session?.token) {
            this.sessions.set(session.token, session);
          }
        }
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      logger.warn(
        "Konnte Session-Datei nicht laden: %s",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async persist() {
    if (!this.storageFile) {
      return;
    }
    const payload = {
      sessions: Array.from(this.sessions.values()),
    };
    await ensureDirectory(this.storageFile);
    await fs.writeFile(this.storageFile, JSON.stringify(payload, null, 2), "utf8");
  }

  async pruneExpired() {
    await this.ready;
    const now = Date.now();
    let removed = false;
    for (const [token, session] of this.sessions.entries()) {
      if (isExpired(session, now)) {
        this.sessions.delete(token);
        removed = true;
      }
    }
    if (removed) {
      await this.persist();
    }
  }

  async createSession({ token, username, isAdmin = false, ttlMs } = {}) {
    await this.ready;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlMs ?? this.defaultTtlMs));
    const session = {
      token: token ?? randomUUID(),
      username,
      isAdmin: Boolean(isAdmin),
      createdAt: now.toISOString(),
      lastAccessAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    this.sessions.set(session.token, session);
    await this.persist();
    return session;
  }

  async getSession(token) {
    if (!token) {
      return null;
    }
    await this.ready;
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }
    if (isExpired(session)) {
      this.sessions.delete(token);
      await this.persist();
      return null;
    }
    session.lastAccessAt = new Date().toISOString();
    return { ...session };
  }

  async deleteSession(token) {
    if (!token) {
      return false;
    }
    await this.ready;
    const deleted = this.sessions.delete(token);
    if (deleted) {
      await this.persist();
    }
    return deleted;
  }

  async close() {
    await this.ready;
    await this.persist();
  }
}
