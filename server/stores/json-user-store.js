import { constants, promises as fs } from "node:fs";
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";
import { StorageIntegrityError } from "./json-plan-store.js";

const DEFAULT_FILE_NAME = "users.json";
const ALLOWED_ROLES = new Set(["admin", "user"]);
const scrypt = promisify(nodeScrypt);

export class UserValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserValidationError";
  }
}

export class UserConflictError extends Error {
  constructor(message, { username } = {}) {
    super(message);
    this.name = "UserConflictError";
    this.username = username ?? null;
  }
}

function resolveDefaultFile() {
  return join(DATA_DIR, DEFAULT_FILE_NAME);
}

async function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

function normalizeUsername(username) {
  const normalized = String(username ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new UserValidationError("username ist erforderlich.");
  }
  return normalized;
}

function normalizeRole(role) {
  const normalized = String(role ?? "user").trim().toLowerCase();
  if (!ALLOWED_ROLES.has(normalized)) {
    throw new UserValidationError("role muss 'admin' oder 'user' sein.");
  }
  return normalized;
}

function normalizeIsActive(isActive) {
  if (isActive === undefined || isActive === null) {
    return true;
  }
  if (typeof isActive !== "boolean") {
    throw new UserValidationError("isActive muss ein Boolean sein.");
  }
  return isActive;
}

function normalizeTimestamp(value, fieldName) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  throw new UserValidationError(`${fieldName} muss ein gültiger ISO-Zeitstempel sein.`);
}

function ensurePositiveInteger(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new UserValidationError(`${label} muss eine positive Ganzzahl sein.`);
  }
  return value;
}

function ensureString(value, label) {
  if (typeof value !== "string") {
    throw new UserValidationError(`${label} muss ein String sein.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new UserValidationError(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function cloneUser(user) {
  return { ...user };
}

function parseStoredHash(hash) {
  if (typeof hash !== "string") {
    throw new UserValidationError("passwordHash muss ein String sein.");
  }
  const [algorithm, saltHex, hashHex] = hash.split(":");
  if (!algorithm || !saltHex || !hashHex) {
    throw new UserValidationError("passwordHash hat ein ungültiges Format.");
  }
  if (algorithm !== "scrypt") {
    throw new UserValidationError(`passwordHash verwendet ein nicht unterstütztes Verfahren: ${algorithm}`);
  }
  return {
    algorithm,
    salt: Buffer.from(saltHex, "hex"),
    digest: Buffer.from(hashHex, "hex"),
  };
}

async function hashPassword(password) {
  const normalized = ensureString(password, "password");
  const salt = randomBytes(16);
  const derivedKey = await scrypt(normalized, salt, 64);
  return `scrypt:${salt.toString("hex")}:${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyPassword(password, passwordHash) {
  const normalized = ensureString(password, "password");
  const { salt, digest } = parseStoredHash(passwordHash);
  const derivedKey = await scrypt(normalized, salt, digest.length);
  return timingSafeEqual(Buffer.from(derivedKey), digest);
}

function validateStoredHash(hash) {
  parseStoredHash(hash);
}

function normalizeStoredUser(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new UserValidationError("Gespeicherte Benutzer müssen Objekte sein.");
  }
  const id = ensurePositiveInteger(user.id, "id");
  const username = normalizeUsername(user.username);
  const role = normalizeRole(user.role);
  const isActive = normalizeIsActive(
    user.isActive === undefined || user.isActive === null ? true : user.isActive,
  );
  validateStoredHash(user.passwordHash);
  const createdAt = normalizeTimestamp(user.createdAt, "createdAt");
  const updatedAt = normalizeTimestamp(user.updatedAt, "updatedAt");
  return {
    id,
    username,
    passwordHash: user.passwordHash,
    role,
    isActive,
    createdAt,
    updatedAt,
  };
}

export class JsonUserStore {
  #file;
  #data;
  #ready;
  #writeQueue = Promise.resolve();
  #closed = false;
  #closing = false;
  #integrityIssue = null;
  #integrityReported = false;
  #usersById = new Map();
  #usersByName = new Map();

  constructor(options = {}) {
    const { storageFile = resolveDefaultFile() } = options;
    this.#file = storageFile;
    this.#ready = this.#initialize();
  }

  get storageFile() {
    return this.#file;
  }

  async #initialize() {
    await ensureDirectory(this.#file);
    this.#setData(await this.#readFromDisk());
  }

  #setData(data) {
    this.#data = data;
    this.#usersById.clear();
    this.#usersByName.clear();
    for (const user of this.#data.users) {
      this.#usersById.set(user.id, user);
      if (this.#usersByName.has(user.username)) {
        throw new StorageIntegrityError("Duplicate usernames detected.", { backupFile: null });
      }
      this.#usersByName.set(user.username, user);
    }
  }

  async #readFromDisk() {
    try {
      await fs.access(this.#file, constants.F_OK);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const seed = { nextId: 1, users: [] };
        await this.#writeFileAtomically(seed);
        return seed;
      }
      throw error;
    }

    try {
      const content = await fs.readFile(this.#file, "utf8");
      const parsed = JSON.parse(content);
      if (typeof parsed.nextId !== "number" || !Array.isArray(parsed.users)) {
        throw new Error("Invalid storage structure");
      }
      const normalizedUsers = parsed.users.map((user) => normalizeStoredUser(user));
      const uniqueNames = new Set();
      let maxId = 0;
      for (const user of normalizedUsers) {
        if (uniqueNames.has(user.username)) {
          throw new Error("Duplicate usernames are not allowed");
        }
        uniqueNames.add(user.username);
        if (user.id > maxId) {
          maxId = user.id;
        }
      }
      if (normalizedUsers.length > 0 && parsed.nextId <= maxId) {
        throw new Error("nextId must be greater than the highest existing id");
      }
      return {
        nextId: parsed.nextId,
        users: normalizedUsers,
      };
    } catch (error) {
      const isStructuralIssue =
        error instanceof SyntaxError ||
        error instanceof UserValidationError ||
        error.message.includes("Invalid storage structure") ||
        error.message.includes("Duplicate usernames");
      if (!isStructuralIssue) {
        throw error;
      }
      const backupFile = await this.#isolateCorruptFile();
      const seed = { nextId: 1, users: [] };
      await this.#writeFileAtomically(seed);
      this.#integrityIssue = new StorageIntegrityError(
        "Corrupted user storage detected. Existing data was moved to a backup file.",
        { backupFile },
      );
      this.#integrityReported = false;
      return seed;
    }
  }

  async #isolateCorruptFile() {
    const dir = dirname(this.#file);
    const base = basename(this.#file);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = join(dir, `${base}.corrupt-${timestamp}`);
    try {
      await fs.rename(this.#file, backupFile);
      return backupFile;
    } catch {
      return null;
    }
  }

  async #writeFileAtomically(data) {
    const dir = dirname(this.#file);
    const base = basename(this.#file);
    const tempFile = join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
    const payload = JSON.stringify(data);

    let handle;
    try {
      handle = await fs.open(
        tempFile,
        constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.rm(tempFile, { force: true }).catch(() => {});
      throw error;
    }

    try {
      await handle.close();
    } catch (error) {
      await fs.rm(tempFile, { force: true }).catch(() => {});
      throw error;
    }

    try {
      await fs.rename(tempFile, this.#file);
    } catch (error) {
      if (error?.code === "EEXIST") {
        await fs.rm(this.#file, { force: true });
        await fs.rename(tempFile, this.#file);
      } else {
        await fs.rm(tempFile, { force: true }).catch(() => {});
        throw error;
      }
    }
  }

  #enqueueWrite(operation) {
    if (this.#closing) {
      return Promise.reject(new Error("Storage is closing"));
    }
    this.#writeQueue = this.#writeQueue.then(async () => {
      if (this.#closed) {
        throw new Error("Storage is already closed");
      }
      await operation();
    });

    this.#writeQueue = this.#writeQueue.catch((error) => {
      this.#writeQueue = Promise.resolve();
      throw error;
    });

    return this.#writeQueue;
  }

  async #writeToDisk() {
    await this.#enqueueWrite(async () => {
      await this.#writeFileAtomically(this.#data);
    });
  }

  async #ensureReady() {
    await this.#ready;
    if (this.#integrityIssue && !this.#integrityReported) {
      this.#integrityReported = true;
      throw this.#integrityIssue;
    }
  }

  get integrityIssue() {
    return this.#integrityIssue;
  }

  async #requireUniqueUsername(username) {
    const normalized = normalizeUsername(username);
    if (this.#usersByName.has(normalized)) {
      throw new UserConflictError("Benutzername ist bereits vergeben.", { username: normalized });
    }
    return normalized;
  }

  async createUser({ username, password, role = "user", isActive = true }) {
    await this.#ensureReady();
    const normalizedUsername = await this.#requireUniqueUsername(username);
    const normalizedRole = normalizeRole(role);
    const normalizedActive = normalizeIsActive(isActive);
    const passwordHash = await hashPassword(password);
    const timestamp = new Date().toISOString();
    const user = {
      id: this.#data.nextId++,
      username: normalizedUsername,
      passwordHash,
      role: normalizedRole,
      isActive: normalizedActive,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#data.users.push(user);
    this.#usersById.set(user.id, user);
    this.#usersByName.set(user.username, user);
    await this.#writeToDisk();
    return cloneUser(user);
  }

  async updateUser(id, updates = {}, options = {}) {
    await this.#ensureReady();
    const userId = Number(id);
    const user = this.#usersById.get(userId);
    if (!user) {
      return null;
    }
    const { expectedUpdatedAt } = options ?? {};
    if (expectedUpdatedAt && user.updatedAt !== expectedUpdatedAt) {
      throw new UserConflictError("Benutzer wurde bereits geändert.", { username: user.username });
    }

    let changed = false;

    if (Object.hasOwn(updates, "username")) {
      const normalizedUsername = normalizeUsername(updates.username);
      if (normalizedUsername !== user.username) {
        if (this.#usersByName.has(normalizedUsername)) {
          throw new UserConflictError("Benutzername ist bereits vergeben.", { username: normalizedUsername });
        }
        this.#usersByName.delete(user.username);
        user.username = normalizedUsername;
        this.#usersByName.set(normalizedUsername, user);
        changed = true;
      }
    }

    if (Object.hasOwn(updates, "role")) {
      const normalizedRole = normalizeRole(updates.role);
      if (normalizedRole !== user.role) {
        user.role = normalizedRole;
        changed = true;
      }
    }

    if (Object.hasOwn(updates, "isActive")) {
      const normalizedActive = normalizeIsActive(updates.isActive);
      if (normalizedActive !== user.isActive) {
        user.isActive = normalizedActive;
        changed = true;
      }
    }

    if (Object.hasOwn(updates, "password")) {
      user.passwordHash = await hashPassword(updates.password);
      changed = true;
    }

    if (changed) {
      user.updatedAt = new Date().toISOString();
      await this.#writeToDisk();
    }

    return cloneUser(user);
  }

  async getUser(id) {
    await this.#ensureReady();
    const user = this.#usersById.get(Number(id));
    return user ? cloneUser(user) : null;
  }

  async findByUsername(username) {
    await this.#ensureReady();
    const normalized = normalizeUsername(username);
    const user = this.#usersByName.get(normalized);
    return user ? cloneUser(user) : null;
  }

  async listUsers() {
    await this.#ensureReady();
    return this.#data.users.map((user) => cloneUser(user));
  }

  async deleteUser(id) {
    await this.#ensureReady();
    const userId = Number(id);
    const user = this.#usersById.get(userId);
    if (!user) {
      return false;
    }
    const index = this.#data.users.indexOf(user);
    if (index !== -1) {
      this.#data.users.splice(index, 1);
    }
    this.#usersById.delete(userId);
    this.#usersByName.delete(user.username);
    await this.#writeToDisk();
    return true;
  }

  async getUserCount() {
    await this.#ensureReady();
    return Array.isArray(this.#data?.users) ? this.#data.users.length : 0;
  }

  async checkHealth() {
    await this.#ready;
    if (this.#closing || this.#closed) {
      throw new Error("User store is shutting down");
    }
    if (this.#integrityIssue) {
      throw this.#integrityIssue;
    }
    return {
      storageFile: this.#file,
      userCount: Array.isArray(this.#data?.users) ? this.#data.users.length : 0,
      nextId: this.#data?.nextId ?? null,
    };
  }

  async verifyPassword(username, password) {
    await this.#ensureReady();
    const user = this.#usersByName.get(normalizeUsername(username));
    if (!user) {
      return false;
    }
    return verifyPassword(password, user.passwordHash);
  }

  async close() {
    if (this.#closed) {
      await this.#writeQueue;
      return;
    }
    this.#closing = true;
    await this.#ready;
    await this.#writeQueue;
    this.#closed = true;
  }
}
