// Speichert Benutzer in einer JSON-Datei und validiert Passwörter und Rollen.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";

const DEFAULT_FILE_NAME = "users.json";
const ALLOWED_ROLES = new Set(["admin", "editor", "user", "viewer"]);

function resolveDefaultFile() {
  return join(DATA_DIR, DEFAULT_FILE_NAME);
}

async function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

export class UserValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserValidationError";
  }
}

function normalizeUsername(username) {
  if (typeof username !== "string") {
    throw new UserValidationError("Benutzername muss ein String sein.");
  }
  const trimmed = username.trim();
  if (!trimmed) {
    throw new UserValidationError("Benutzername darf nicht leer sein.");
  }
  if (trimmed.length < 3) {
    throw new UserValidationError("Benutzername muss mindestens 3 Zeichen lang sein.");
  }
  if (/\s/.test(trimmed)) {
    throw new UserValidationError("Benutzername darf keine Leerzeichen enthalten.");
  }
  return trimmed;
}

export function validatePasswordPolicy(password) {
  if (typeof password !== "string") {
    throw new UserValidationError("Passwort muss ein String sein.");
  }
  const value = password.trim();
  if (value.length < 10) {
    throw new UserValidationError("Passwort muss mindestens 10 Zeichen lang sein.");
  }
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    throw new UserValidationError(
      "Passwort benötigt Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.",
    );
  }
  return value;
}

function sanitizeRoles(roles) {
  if (roles === undefined || roles === null) {
    return ["user"];
  }
  const source = Array.isArray(roles) ? roles : [roles];
  const cleaned = source
    .map((role) => (typeof role === "string" ? role.trim().toLowerCase() : ""))
    .filter((role) => !!role && ALLOWED_ROLES.has(role));
  if (cleaned.length === 0) {
    return ["user"];
  }
  const unique = Array.from(new Set(cleaned));
  return unique;
}

function cloneUser(user) {
  const { passwordHash, passwordSalt, ...publicFields } = user;
  return { ...publicFields, roles: [...user.roles] };
}

function hashPassword(password, salt) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function safeCompare(expected, actual) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export class JsonUserStore {
  #file;
  #ready;
  #data = { nextId: 1, users: [] };
  #writeQueue = Promise.resolve();
  #closed = false;

  constructor(options = {}) {
    const { storageFile = resolveDefaultFile() } = options;
    this.#file = storageFile;
    this.#ready = this.#load();
  }

  get storageFile() {
    return this.#file;
  }

  async #load() {
    try {
      const content = await fs.readFile(this.#file, "utf8");
      if (!content.trim()) {
        await this.#persist();
        return;
      }
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("User storage muss ein Objekt sein.");
      }
      const { nextId, users } = parsed;
      const validNextId = Number.isInteger(nextId) && nextId > 0 ? nextId : 1;
      if (!Array.isArray(users)) {
        throw new Error("User storage erwartet ein 'users'-Array.");
      }
      this.#data = {
        nextId: validNextId,
        users: users.map((user) => this.#normalizeStoredUser(user)).filter(Boolean),
      };
      await this.#persist();
    } catch (error) {
      if (error?.code !== "ENOENT") {
        logger.warn("Konnte User-Datei nicht lesen: %s", error instanceof Error ? error.message : error);
      }
      this.#data = { nextId: 1, users: [] };
      await this.#persist();
    }
  }

  #normalizeStoredUser(user) {
    if (!user || typeof user !== "object") {
      return null;
    }
    try {
      const username = normalizeUsername(user.username);
      const roles = sanitizeRoles(user.roles);
      const active = user.active !== false;
      const createdAt = this.#normalizeDate(user.createdAt);
      const updatedAt = this.#normalizeDate(user.updatedAt);
      const passwordChangedAt = this.#normalizeDate(user.passwordChangedAt);
      const passwordHash =
        typeof user.passwordHash === "string" && user.passwordHash ? user.passwordHash : null;
      const passwordSalt =
        typeof user.passwordSalt === "string" && user.passwordSalt ? user.passwordSalt : null;
      const id = Number.isInteger(user.id) && user.id > 0 ? user.id : null;
      if (!passwordHash || !passwordSalt || !id) {
        return null;
      }
      return {
        id,
        username,
        roles,
        active,
        passwordHash,
        passwordSalt,
        passwordChangedAt,
        createdAt,
        updatedAt,
      };
    } catch {
      return null;
    }
  }

  #normalizeDate(value) {
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date().toISOString();
  }

  async #persist(data = this.#data) {
    await ensureDirectory(this.#file);
    await fs.writeFile(this.#file, JSON.stringify(data), "utf8");
  }

  async #enqueueWrite(data) {
    const payload = data ?? this.#data;
    const writeTask = this.#writeQueue.then(() => this.#persist(payload));
    this.#writeQueue = writeTask.catch(() => {});
    return writeTask;
  }

  async listUsers() {
    await this.#ready;
    return this.#data.users.map((user) => cloneUser(user));
  }

  async getUserCount() {
    await this.#ready;
    return this.#data.users.length;
  }

  async getUser(id) {
    await this.#ready;
    const user = this.#data.users.find((entry) => entry.id === id);
    return user ? cloneUser(user) : null;
  }

  async #assertOpen() {
    if (this.#closed) {
      throw new Error("User store is closed");
    }
  }

  #ensureUniqueUsername(username, ignoreId = null) {
    const lower = username.toLowerCase();
    const exists = this.#data.users.some(
      (user) => user.username.toLowerCase() === lower && user.id !== ignoreId,
    );
    if (exists) {
      throw new UserValidationError("Benutzername wird bereits verwendet.");
    }
  }

  async createUser(input) {
    await this.#assertOpen();
    await this.#ready;
    const username = normalizeUsername(input?.username);
    const password = validatePasswordPolicy(input?.password ?? "");
    const roles = sanitizeRoles(input?.roles);
    const active = input?.active === false ? false : true;
    this.#ensureUniqueUsername(username);
    const salt = randomBytes(16).toString("hex");
    const now = new Date().toISOString();
    const user = {
      id: this.#data.nextId++,
      username,
      roles,
      active,
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.#data.users.push(user);
    await this.#enqueueWrite();
    return cloneUser(user);
  }

  async #findStoredUserByUsername(username) {
    await this.#ready;
    const normalized = normalizeUsername(username);
    const lower = normalized.toLowerCase();
    return this.#data.users.find((entry) => entry.username.toLowerCase() === lower) ?? null;
  }

  async findByUsername(username) {
    const stored = await this.#findStoredUserByUsername(username);
    return stored ? cloneUser(stored) : null;
  }

  async updateUser(id, changes) {
    await this.#assertOpen();
    await this.#ready;
    const user = this.#data.users.find((entry) => entry.id === id);
    if (!user) {
      return null;
    }
    let changed = false;
    if (Object.hasOwn(changes, "username")) {
      const username = normalizeUsername(changes.username);
      this.#ensureUniqueUsername(username, id);
      if (username !== user.username) {
        user.username = username;
        changed = true;
      }
    }
    if (Object.hasOwn(changes, "roles")) {
      const roles = sanitizeRoles(changes.roles);
      const hasDifference =
        roles.length !== user.roles.length || roles.some((role, index) => role !== user.roles[index]);
      if (hasDifference) {
        user.roles = roles;
        changed = true;
      }
    }
    if (Object.hasOwn(changes, "active")) {
      const active = changes.active !== false;
      if (active !== user.active) {
        user.active = active;
        changed = true;
      }
    }
    if (Object.hasOwn(changes, "password")) {
      const password = validatePasswordPolicy(changes.password);
      const salt = randomBytes(16).toString("hex");
      user.passwordSalt = salt;
      user.passwordHash = hashPassword(password, salt);
      user.passwordChangedAt = new Date().toISOString();
      changed = true;
    }
    if (!changed) {
      return cloneUser(user);
    }
    user.updatedAt = new Date().toISOString();
    await this.#enqueueWrite();
    return cloneUser(user);
  }

  async verifyCredentials(username, password) {
    await this.#ready;
    const user = await this.#findStoredUserByUsername(username);
    if (!user || user.active === false) {
      return null;
    }
    const passwordValue = String(password ?? "");
    if (!passwordValue) {
      return null;
    }
    const candidateHash = hashPassword(passwordValue, user.passwordSalt);
    if (!safeCompare(user.passwordHash, candidateHash)) {
      return null;
    }
    return cloneUser(user);
  }

  async deleteUser(id) {
    await this.#assertOpen();
    await this.#ready;
    const index = this.#data.users.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return false;
    }
    this.#data.users.splice(index, 1);
    await this.#enqueueWrite();
    return true;
  }

  async checkHealth() {
    if (this.#closed) {
      throw new Error("User store is closed");
    }
    await this.#ready;
    return {
      storageFile: this.#file,
      userCount: this.#data.users.length,
      nextId: this.#data.nextId,
    };
  }

  async close() {
    if (this.#closed) {
      return;
    }
    await this.#writeQueue;
    this.#closed = true;
  }
}
