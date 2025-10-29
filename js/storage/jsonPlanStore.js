import { constants, promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = "data";
const DEFAULT_FILE_NAME = "plans.json";
const BACKUP_FORMAT_ID = "nextplanner/plan-backup";
const BACKUP_VERSION = 1;

export class PlanValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanValidationError";
  }
}

export class StorageIntegrityError extends Error {
  constructor(message, { backupFile } = {}) {
    super(message);
    this.name = "StorageIntegrityError";
    this.backupFile = backupFile ?? null;
  }
}

export class PlanConflictError extends Error {
  constructor(message, { currentPlan, expectedUpdatedAt } = {}) {
    super(message);
    this.name = "PlanConflictError";
    this.expectedUpdatedAt = expectedUpdatedAt ?? null;
    this.currentPlan = currentPlan ? clonePlan(currentPlan) : null;
  }
}

async function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

function resolveDefaultFile() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "..", "..", DATA_DIR, DEFAULT_FILE_NAME);
}

function toIsoDate(input) {
  if (input instanceof Date) {
    return input.toISOString();
  }
  if (typeof input === "string") {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  throw new PlanValidationError("planDate must be a valid date or ISO string");
}

function normalizeFocus(focus) {
  if (!focus) {
    throw new PlanValidationError("focus is required");
  }
  return String(focus).trim();
}

function normalizeTitle(title) {
  if (!title) {
    throw new PlanValidationError("title is required");
  }
  return String(title).trim();
}

function normalizeContent(content) {
  if (!content) {
    throw new PlanValidationError("content is required");
  }
  return String(content);
}

function normalizeMetadata(metadata) {
  if (metadata === undefined || metadata === null) {
    return {};
  }
  if (typeof metadata !== "object") {
    throw new PlanValidationError("metadata must be an object");
  }
  return { ...metadata };
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
  throw new PlanValidationError(`Backup: ${fieldName} muss ein gültiger ISO-Zeitstempel sein.`);
}

function clonePlan(plan) {
  return {
    id: plan.id,
    title: plan.title,
    content: plan.content,
    planDate: plan.planDate,
    focus: plan.focus,
    metadata: normalizeMetadata(plan.metadata),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function ensurePositiveInteger(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new PlanValidationError(`Backup: ${label} muss eine positive Ganzzahl sein.`);
  }
  return value;
}

function ensureBackupObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlanValidationError(`Backup: ${label} muss ein Objekt sein.`);
  }
  return value;
}

function normalizeBackupPlan(rawPlan) {
  const plan = ensureBackupObject(rawPlan, "Plan");
  const id = ensurePositiveInteger(plan.id, "Plan-ID");
  const title = normalizeTitle(plan.title);
  const content = normalizeContent(plan.content);
  const planDate = toIsoDate(plan.planDate);
  const focus = normalizeFocus(plan.focus);
  const metadata = normalizeMetadata(plan.metadata);
  const createdAt = normalizeTimestamp(plan.createdAt, "createdAt");
  const updatedAt = normalizeTimestamp(plan.updatedAt, "updatedAt");
  return clonePlan({
    id,
    title,
    content,
    planDate,
    focus,
    metadata,
    createdAt,
    updatedAt,
  });
}

function normalizeBackupPayload(payload) {
  const root = ensureBackupObject(payload, "Dateiinhalt");
  if (root.format !== BACKUP_FORMAT_ID) {
    throw new PlanValidationError("Backup: Dieses Format wird nicht unterstützt.");
  }
  if (root.version !== BACKUP_VERSION) {
    throw new PlanValidationError("Backup: Diese Version wird nicht unterstützt.");
  }
  if (root.exportedAt !== undefined) {
    normalizeTimestamp(root.exportedAt, "exportedAt");
  }
  const data = ensureBackupObject(root.data, "Datenblock");
  const nextId = ensurePositiveInteger(data.nextId, "nextId");
  if (!Array.isArray(data.plans)) {
    throw new PlanValidationError("Backup: 'plans' muss ein Array sein.");
  }
  const plans = data.plans.map((plan) => normalizeBackupPlan(plan));
  const seenIds = new Set();
  let maxId = 0;
  for (const plan of plans) {
    if (seenIds.has(plan.id)) {
      throw new PlanValidationError("Backup: Plan-IDs müssen eindeutig sein.");
    }
    seenIds.add(plan.id);
    if (plan.id > maxId) {
      maxId = plan.id;
    }
  }
  if (plans.length > 0 && nextId <= maxId) {
    throw new PlanValidationError("Backup: nextId muss größer als jede Plan-ID sein.");
  }
  return {
    nextId,
    plans,
  };
}

export class JsonPlanStore {
  #file;
  #data;
  #ready;
  #writeQueue = Promise.resolve();
  #closed = false;
  #closing = false;
  #integrityIssue = null;
  #integrityReported = false;
  #dirFsyncSupported = true;
  #dirFsyncWarned = false;

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
    this.#data = await this.#readFromDisk();
  }

  async #readFromDisk() {
    try {
      await fs.access(this.#file, constants.F_OK);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const seed = { nextId: 1, plans: [] };
        await this.#writeFileAtomically(seed);
        return seed;
      }
      throw error;
    }

    try {
      const content = await fs.readFile(this.#file, "utf8");
      const parsed = JSON.parse(content);
      if (typeof parsed.nextId !== "number" || !Array.isArray(parsed.plans)) {
        throw new Error("Invalid storage structure");
      }
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError || error.message.includes("Invalid storage structure")) {
        const backupFile = await this.#isolateCorruptFile();
        const seed = { nextId: 1, plans: [] };
        await this.#writeFileAtomically(seed);
        this.#integrityIssue = new StorageIntegrityError(
          "Corrupted storage detected. Existing data was moved to a backup file.",
          { backupFile }
        );
        this.#integrityReported = false;
        return seed;
      }
      throw error;
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
    const payload = JSON.stringify(data, null, 2);

    let handle;
    try {
      handle = await fs.open(
        tempFile,
        constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY,
        0o600
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

    await this.#fsyncDirectory(dir);
  }

  #isDirFsyncUnsupported(error) {
    if (!error || typeof error !== "object") {
      return false;
    }
    return ["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error.code);
  }

  async #fsyncDirectory(dir) {
    if (!this.#dirFsyncSupported) {
      return;
    }

    const flags = (constants.O_DIRECTORY ?? 0) | constants.O_RDONLY;
    let handle;
    try {
      handle = await fs.open(dir, flags);
    } catch (error) {
      if (this.#isDirFsyncUnsupported(error)) {
        this.#dirFsyncSupported = false;
        this.#logDirFsyncWarning(dir);
        return;
      }
      throw error;
    }

    try {
      if (typeof handle.sync === "function") {
        await handle.sync();
      } else {
        this.#dirFsyncSupported = false;
        this.#logDirFsyncWarning(dir);
      }
    } catch (error) {
      if (this.#isDirFsyncUnsupported(error)) {
        this.#dirFsyncSupported = false;
        this.#logDirFsyncWarning(dir);
      } else {
        throw error;
      }
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  #logDirFsyncWarning(dir) {
    if (this.#dirFsyncWarned) {
      return;
    }
    this.#dirFsyncWarned = true;
    console.warn(
      `Directory fsync is not supported on this platform. Continuing without fsync for '${dir}'.`
    );
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
      // Reset the queue so future writes can continue even after a failure.
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

  #findPlanIndex(id) {
    return this.#data.plans.findIndex((plan) => plan.id === Number(id));
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

  async createPlan({ title, content, planDate, focus, metadata }) {
    await this.#ensureReady();
    const now = new Date().toISOString();
    const plan = {
      id: this.#data.nextId++,
      title: normalizeTitle(title),
      content: normalizeContent(content),
      planDate: toIsoDate(planDate),
      focus: normalizeFocus(focus),
      metadata: normalizeMetadata(metadata),
      createdAt: now,
      updatedAt: now,
    };
    this.#data.plans.push(plan);
    await this.#writeToDisk();
    return clonePlan(plan);
  }

  async updatePlan(id, updates = {}, options = {}) {
    await this.#ensureReady();
    const index = this.#findPlanIndex(id);
    if (index === -1) {
      return null;
    }
    const plan = this.#data.plans[index];
    const { expectedUpdatedAt } = options ?? {};
    if (expectedUpdatedAt && plan.updatedAt !== expectedUpdatedAt) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: plan,
        expectedUpdatedAt,
      });
    }
    if (updates.title !== undefined) {
      plan.title = normalizeTitle(updates.title);
    }
    if (updates.content !== undefined) {
      plan.content = normalizeContent(updates.content);
    }
    if (updates.planDate !== undefined) {
      plan.planDate = toIsoDate(updates.planDate);
    }
    if (updates.focus !== undefined) {
      plan.focus = normalizeFocus(updates.focus);
    }
    if (updates.metadata !== undefined) {
      plan.metadata = normalizeMetadata(updates.metadata);
    }
    plan.updatedAt = new Date().toISOString();
    await this.#writeToDisk();
    return clonePlan(plan);
  }

  async deletePlan(id, options = {}) {
    await this.#ensureReady();
    const index = this.#findPlanIndex(id);
    if (index === -1) {
      return false;
    }
    const plan = this.#data.plans[index];
    const { expectedUpdatedAt } = options ?? {};
    if (expectedUpdatedAt && plan.updatedAt !== expectedUpdatedAt) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: plan,
        expectedUpdatedAt,
      });
    }
    this.#data.plans.splice(index, 1);
    await this.#writeToDisk();
    return true;
  }

  async getPlan(id) {
    await this.#ensureReady();
    const plan = this.#data.plans.find((item) => item.id === Number(id));
    return plan ? clonePlan(plan) : null;
  }

  async listPlans({ focus, from, to } = {}) {
    await this.#ensureReady();
    const focusFilter = focus ? normalizeFocus(focus) : null;
    const fromIso = from ? toIsoDate(from) : null;
    const toIsoValue = to ? toIsoDate(to) : null;

    return this.#data.plans
      .filter((plan) => {
        if (focusFilter && plan.focus !== focusFilter) {
          return false;
        }
        if (fromIso && plan.planDate < fromIso) {
          return false;
        }
        if (toIsoValue && plan.planDate > toIsoValue) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.planDate === b.planDate) {
          return a.id - b.id;
        }
        return a.planDate.localeCompare(b.planDate);
      })
      .map((plan) => clonePlan(plan));
  }

  async exportBackup() {
    await this.#ensureReady();
    return {
      format: BACKUP_FORMAT_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      planCount: this.#data.plans.length,
      data: {
        nextId: this.#data.nextId,
        plans: this.#data.plans.map((plan) => clonePlan(plan)),
      },
    };
  }

  async importBackup(payload) {
    await this.#ensureReady();
    const normalized = normalizeBackupPayload(payload);
    this.#data = {
      nextId: normalized.nextId,
      plans: normalized.plans,
    };
    await this.#writeToDisk();
    return { planCount: this.#data.plans.length };
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
