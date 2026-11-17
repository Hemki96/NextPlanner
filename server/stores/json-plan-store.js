// JSON-Store für Pläne. Validiert Eingaben, legt Backups an und schützt vor
// konkurrierenden Änderungen über ETags.
import { constants, promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { DATA_DIR } from "../config.js";
import { isolateCorruptFile, writeJsonFileAtomically } from "./atomic-json-file.js";

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
  return join(DATA_DIR, DEFAULT_FILE_NAME);
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

function coerceMetadataObject(metadata) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
}

function coerceUserId(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
}

function coerceIsoTimestamp(value, fallback = null) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (fallback) {
    return coerceIsoTimestamp(fallback);
  }
  return new Date().toISOString();
}

function clonePlan(plan) {
  return { ...plan, metadata: { ...coerceMetadataObject(plan.metadata) } };
}

const PLAN_FIELD_NORMALIZERS = Object.freeze({
  title: normalizeTitle,
  content: normalizeContent,
  planDate: toIsoDate,
  focus: normalizeFocus,
  metadata: normalizeMetadata,
});

function normalizePlanInput(source, { requireAll }) {
  const normalized = {};
  for (const [field, normalize] of Object.entries(PLAN_FIELD_NORMALIZERS)) {
    if (
      requireAll ||
      (Object.hasOwn(source, field) && source[field] !== undefined)
    ) {
      normalized[field] = normalize(source[field]);
    }
  }
  return normalized;
}

function applyPlanChanges(plan, normalized, { auditUserId, hasAuditUser = false, timestamp = null } = {}) {
  let changed = false;
  for (const [field, value] of Object.entries(normalized)) {
    if (!isDeepStrictEqual(plan[field], value)) {
      plan[field] = value;
      changed = true;
    }
  }
  const auditChanged = hasAuditUser && auditUserId !== plan.updatedByUserId;
  if (changed || auditChanged) {
    plan.updatedAt = timestamp ?? new Date().toISOString();
    if (hasAuditUser) {
      plan.updatedByUserId = auditUserId ?? null;
    }
    changed = true;
  }
  return changed;
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
  const createdByUserId = coerceUserId(plan.createdByUserId) ?? null;
  const updatedByUserId = coerceUserId(plan.updatedByUserId) ?? createdByUserId ?? null;
  return {
    id,
    title,
    content,
    planDate,
    focus,
    metadata,
    createdAt,
    updatedAt,
    createdByUserId,
    updatedByUserId,
  };
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
  #plansById = new Map();
  #sortedPlans = null;

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
    this.#plansById.clear();
    for (const plan of this.#data.plans) {
      plan.metadata = coerceMetadataObject(plan.metadata);
      plan.createdByUserId = coerceUserId(plan.createdByUserId) ?? null;
      plan.updatedByUserId =
        coerceUserId(plan.updatedByUserId) ?? plan.createdByUserId ?? null;
      plan.createdAt = coerceIsoTimestamp(plan.createdAt);
      plan.updatedAt = coerceIsoTimestamp(plan.updatedAt ?? plan.createdAt, plan.createdAt);
      this.#plansById.set(plan.id, plan);
    }
    this.#sortedPlans = null;
  }

  async #readFromDisk() {
    try {
      await fs.access(this.#file, constants.F_OK);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const seed = { nextId: 1, plans: [] };
        await writeJsonFileAtomically(this.#file, seed);
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
      const normalized = this.#normalizeLoadedData(parsed);
      if (normalized.migrated) {
        await writeJsonFileAtomically(this.#file, normalized.data);
      }
      return normalized.data;
    } catch (error) {
      if (error instanceof SyntaxError || error.message.includes("Invalid storage structure")) {
        const backupFile = await isolateCorruptFile(this.#file);
        const seed = { nextId: 1, plans: [] };
        await writeJsonFileAtomically(this.#file, seed);
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

  #normalizeLoadedData(data) {
    const normalizedPlans = [];
    let migrated = false;
    for (const plan of data.plans) {
      const normalized = {
        ...plan,
        metadata: coerceMetadataObject(plan.metadata),
      };
      const createdAt = coerceIsoTimestamp(plan.createdAt);
      const updatedAt = coerceIsoTimestamp(plan.updatedAt ?? createdAt, createdAt);
      const createdByUserId = coerceUserId(plan.createdByUserId) ?? null;
      const updatedByUserId = coerceUserId(plan.updatedByUserId) ?? createdByUserId ?? null;

      if (
        normalized.metadata !== plan.metadata ||
        createdAt !== plan.createdAt ||
        updatedAt !== plan.updatedAt ||
        createdByUserId !== (plan.createdByUserId ?? null) ||
        updatedByUserId !== (plan.updatedByUserId ?? null)
      ) {
        migrated = true;
      }

      normalized.createdAt = createdAt;
      normalized.updatedAt = updatedAt;
      normalized.createdByUserId = createdByUserId;
      normalized.updatedByUserId = updatedByUserId;
      normalizedPlans.push(normalized);
    }
    return {
      migrated,
      data: {
        nextId: data.nextId,
        plans: normalizedPlans,
      },
    };
  }

  #invalidatePlanOrder() {
    this.#sortedPlans = null;
  }

  #getSortedPlans() {
    if (!this.#sortedPlans) {
      this.#sortedPlans = [...this.#data.plans];
      this.#sortedPlans.sort((a, b) => {
        if (a.planDate === b.planDate) {
          return a.id - b.id;
        }
        return a.planDate.localeCompare(b.planDate);
      });
    }
    return this.#sortedPlans;
  }

  #snapshot() {
    return { nextId: this.#data.nextId, plans: this.#data.plans.map(clonePlan) };
  }

  async #writeToDisk(previous = null) {
    await this.#enqueueWrite(async () => {
      try {
        await writeJsonFileAtomically(this.#file, this.#data);
      } catch (error) {
        // Nur nach erfolgreichem Write gilt der neue Zustand als übernommen.
        if (previous) {
          this.#setData(previous);
        }
        throw error;
      }
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

  async createPlan({ title, content, planDate, focus, metadata }, options = {}) {
    await this.#ensureReady();
    const previous = this.#snapshot();
    const normalized = normalizePlanInput(
      { title, content, planDate, focus, metadata },
      { requireAll: true }
    );
    const timestamp = new Date().toISOString();
    const auditUserId = coerceUserId(options.userId ?? options.createdByUserId) ?? null;
    const plan = {
      id: this.#data.nextId++,
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUserId: auditUserId,
      updatedByUserId: auditUserId,
    };
    plan.metadata = coerceMetadataObject(plan.metadata);
    this.#data.plans.push(plan);
    this.#plansById.set(plan.id, plan);
    this.#invalidatePlanOrder();
    await this.#writeToDisk(previous);
    return clonePlan(plan);
  }

  async updatePlan(id, updates = {}, options = {}) {
    await this.#ensureReady();
    const previous = this.#snapshot();
    const planId = Number(id);
    const plan = this.#plansById.get(planId);
    if (!plan) {
      return null;
    }
    const { expectedUpdatedAt } = options ?? {};
    if (expectedUpdatedAt && plan.updatedAt !== expectedUpdatedAt) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: plan,
        expectedUpdatedAt,
      });
    }
    const normalized = normalizePlanInput(updates, { requireAll: false });
    const hasAuditUser = Object.hasOwn(options, "userId") && options.userId !== undefined;
    const auditUserId = hasAuditUser ? coerceUserId(options.userId) ?? null : undefined;
    const previousDate = plan.planDate;
    const changed = applyPlanChanges(plan, normalized, {
      auditUserId,
      hasAuditUser,
    });
    if (changed) {
      if (plan.planDate !== previousDate) {
        this.#invalidatePlanOrder();
      }
      await this.#writeToDisk(previous);
    }
    return clonePlan(plan);
  }

  async replacePlan(id, replacement, options = {}) {
    await this.#ensureReady();
    const previous = this.#snapshot();
    const planId = Number(id);
    const plan = this.#plansById.get(planId);
    if (!plan) {
      return null;
    }
    const { expectedUpdatedAt } = options ?? {};
    if (expectedUpdatedAt && plan.updatedAt !== expectedUpdatedAt) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: plan,
        expectedUpdatedAt,
      });
    }
    const normalized = normalizePlanInput(replacement, { requireAll: true });
    const hasAuditUser = Object.hasOwn(options, "userId") && options.userId !== undefined;
    const auditUserId = hasAuditUser ? coerceUserId(options.userId) ?? null : undefined;
    const timestamp = new Date().toISOString();
    const previousDate = plan.planDate;
    if (
      applyPlanChanges(plan, normalized, {
        auditUserId,
        hasAuditUser,
        timestamp,
      })
    ) {
      if (plan.planDate !== previousDate) {
        this.#invalidatePlanOrder();
      }
      await this.#writeToDisk(previous);
    }
    return clonePlan(plan);
  }

  async deletePlan(id, options = {}) {
    await this.#ensureReady();
    const previous = this.#snapshot();
    const planId = Number(id);
    const plan = this.#plansById.get(planId);
    if (!plan) {
      return false;
    }
    const { expectedUpdatedAt } = options ?? {};
    if (expectedUpdatedAt && plan.updatedAt !== expectedUpdatedAt) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: plan,
        expectedUpdatedAt,
      });
    }
    const index = this.#data.plans.indexOf(plan);
    if (index !== -1) {
      this.#data.plans.splice(index, 1);
    }
    this.#plansById.delete(planId);
    this.#invalidatePlanOrder();
    await this.#writeToDisk(previous);
    return true;
  }

  async getPlan(id) {
    await this.#ensureReady();
    const plan = this.#plansById.get(Number(id));
    return plan ? clonePlan(plan) : null;
  }

  async listPlans({ focus, from, to } = {}) {
    await this.#ensureReady();
    const focusFilter = focus ? normalizeFocus(focus) : null;
    const fromIso = from ? toIsoDate(from) : null;
    const toIsoValue = to ? toIsoDate(to) : null;

    const results = [];
    for (const plan of this.#getSortedPlans()) {
      if (fromIso && plan.planDate < fromIso) {
        continue;
      }
      if (toIsoValue && plan.planDate > toIsoValue) {
        break;
      }
      if (focusFilter && plan.focus !== focusFilter) {
        continue;
      }
      results.push(clonePlan(plan));
    }
    return results;
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
        plans: this.#data.plans.map(clonePlan),
      },
    };
  }

  async importBackup(payload) {
    await this.#ensureReady();
    const previous = this.#snapshot();
    const normalized = normalizeBackupPayload(payload);
    this.#setData({
      nextId: normalized.nextId,
      plans: normalized.plans,
    });
    await this.#writeToDisk(previous);
    return { planCount: this.#data.plans.length };
  }

  async checkHealth() {
    await this.#ready;
    if (this.#closing || this.#closed) {
      throw new Error("Plan store is shutting down");
    }
    if (this.#integrityIssue) {
      throw this.#integrityIssue;
    }
    return { status: "ready" };
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
