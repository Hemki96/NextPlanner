// Verwaltet Benutzerkonten, Passwort-Hashes und Validierung. Nutzt
// timing-sichere Vergleiche für Anmeldungen.
import { createHash, timingSafeEqual } from "node:crypto";

import { JsonUserStore, UserValidationError, validatePasswordPolicy } from "../stores/json-user-store.js";
import { logger } from "../logger.js";

function hashPassword(password, username = "") {
  return createHash("sha256").update(`${username}:${String(password ?? "")}`).digest();
}

function normalizeUserRecord(user) {
  if (!user || typeof user.username !== "string" || !user.username.trim()) {
    return null;
  }
  const username = user.username.trim();
  try {
    validatePasswordPolicy(user.password ?? "");
  } catch {
    return null;
  }
  let passwordHash = null;
  if (user.passwordHash) {
    passwordHash = Buffer.isBuffer(user.passwordHash)
      ? user.passwordHash
      : Buffer.from(String(user.passwordHash), "hex");
  } else if (typeof user.password === "string" && user.password.trim()) {
    passwordHash = hashPassword(user.password, username);
  }
  if (!passwordHash) {
    return null;
  }
  return {
    username,
    passwordHash,
    roles: Array.isArray(user.roles) ? user.roles : [],
    isAdmin: Boolean(user.isAdmin || (user.roles ?? []).includes("admin")),
  };
}

function buildUserRegistry(users) {
  const registry = new Map();
  for (const entry of users ?? []) {
    const normalized = normalizeUserRecord(entry);
    if (normalized) {
      registry.set(normalized.username, normalized);
    }
  }
  return registry;
}

class UserService {
  constructor({ store, defaults = [] } = {}) {
    this.store = store;
    this.registry = buildUserRegistry(defaults);
    this.knownUsers = new Map();
    this.seedInitialized = false;
    this.seedPromise = Promise.resolve();
  }

  async ensureSeedUsers(seeds = []) {
    if (this.seedInitialized) {
      return this.seedPromise;
    }
    this.seedInitialized = true;
    this.seedPromise = (async () => {
      if (!this.store || typeof this.store.createUser !== "function") {
        return;
      }
      logger.info("Prüfe Seed-User (%d Einträge)", seeds.length);
      for (const seed of seeds) {
        if (!seed.username || !seed.password) continue;
        const existing = await this.store.findByUsername(seed.username);
        if (existing) {
          logger.debug("Seed-User existiert bereits: %s", seed.username);
          continue;
        }
        await this.store.createUser({
          username: seed.username,
          password: seed.password,
          roles: seed.roles ?? [],
          active: true,
        });
        logger.info("Seed-User angelegt: %s", seed.username);
      }
    })();
    return this.seedPromise;
  }

  async waitForSeedUsers() {
    return this.seedPromise ?? Promise.resolve();
  }

  remember(user) {
    if (!user?.id) return;
    const id = String(user.id);
    if (!id) return;
    this.knownUsers.set(id, {
      id,
      name: user.name ?? user.username ?? id,
      role: user.role ?? (Array.isArray(user.roles) && user.roles.includes("admin") ? "admin" : "user"),
    });
  }

  async listUsers() {
    const stored = this.store && typeof this.store.listUsers === "function"
      ? await this.store.listUsers()
      : [];
    const merged = new Map();
    for (const user of stored) {
      const id = user.id ?? user.username;
      if (!id) continue;
      merged.set(String(id), user);
    }
    for (const [id, known] of this.knownUsers.entries()) {
      if (!merged.has(id)) {
        merged.set(id, known);
      }
    }
    return Array.from(merged.values());
  }

  async verifyCredentials(username, password) {
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (!trimmedUsername || typeof password !== "string") {
      return null;
    }
    if (this.store && typeof this.store.verifyCredentials === "function") {
      const user = await this.store.verifyCredentials(trimmedUsername, password);
      if (user) {
        return {
          id: user.id ?? user.username,
          username: user.username,
          roles: user.roles ?? [],
          isAdmin: Array.isArray(user.roles) ? user.roles.includes("admin") : false,
        };
      }
    }
    const record = this.registry.get(trimmedUsername);
    if (!record) {
      return null;
    }
    const attempted = hashPassword(password, trimmedUsername);
    if (record.passwordHash.length !== attempted.length) {
      return null;
    }
    if (!timingSafeEqual(record.passwordHash, attempted)) {
      return null;
    }
    return {
      id: record.username,
      username: record.username,
      roles: record.roles ?? [],
      isAdmin: Boolean(record.isAdmin),
    };
  }
}

export { UserService, UserValidationError, JsonUserStore, normalizeUserRecord };
