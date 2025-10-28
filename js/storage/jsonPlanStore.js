import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = "data";
const DEFAULT_FILE_NAME = "plans.json";

function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
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
  throw new TypeError("planDate must be a valid date or ISO string");
}

function normalizeFocus(focus) {
  if (!focus) {
    throw new TypeError("focus is required");
  }
  return String(focus).trim();
}

function normalizeTitle(title) {
  if (!title) {
    throw new TypeError("title is required");
  }
  return String(title).trim();
}

function normalizeContent(content) {
  if (!content) {
    throw new TypeError("content is required");
  }
  return String(content);
}

function clonePlan(plan) {
  return {
    id: plan.id,
    title: plan.title,
    content: plan.content,
    planDate: plan.planDate,
    focus: plan.focus,
    metadata: { ...(plan.metadata ?? {}) },
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export class JsonPlanStore {
  #file;
  #data;

  constructor(options = {}) {
    const { storageFile = resolveDefaultFile() } = options;
    this.#file = storageFile;
    ensureDirectory(this.#file);
    this.#data = this.#readFromDisk();
  }

  get storageFile() {
    return this.#file;
  }

  #readFromDisk() {
    if (!existsSync(this.#file)) {
      const seed = { nextId: 1, plans: [] };
      writeFileSync(this.#file, JSON.stringify(seed, null, 2), "utf8");
      return seed;
    }
    const content = readFileSync(this.#file, "utf8");
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed.nextId !== "number" || !Array.isArray(parsed.plans)) {
        throw new Error("Invalid storage file");
      }
      return parsed;
    } catch (error) {
      throw new Error(`Konnte Speicherdatei nicht laden: ${error.message}`);
    }
  }

  #writeToDisk() {
    writeFileSync(this.#file, JSON.stringify(this.#data, null, 2), "utf8");
  }

  #findPlanIndex(id) {
    return this.#data.plans.findIndex((plan) => plan.id === Number(id));
  }

  createPlan({ title, content, planDate, focus, metadata = {} }) {
    const now = new Date().toISOString();
    const plan = {
      id: this.#data.nextId++,
      title: normalizeTitle(title),
      content: normalizeContent(content),
      planDate: toIsoDate(planDate),
      focus: normalizeFocus(focus),
      metadata: { ...metadata },
      createdAt: now,
      updatedAt: now,
    };
    this.#data.plans.push(plan);
    this.#writeToDisk();
    return clonePlan(plan);
  }

  updatePlan(id, updates = {}) {
    const index = this.#findPlanIndex(id);
    if (index === -1) {
      return null;
    }
    const plan = this.#data.plans[index];
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
      plan.metadata = { ...updates.metadata };
    }
    plan.updatedAt = new Date().toISOString();
    this.#writeToDisk();
    return clonePlan(plan);
  }

  deletePlan(id) {
    const index = this.#findPlanIndex(id);
    if (index === -1) {
      return false;
    }
    this.#data.plans.splice(index, 1);
    this.#writeToDisk();
    return true;
  }

  getPlan(id) {
    const plan = this.#data.plans.find((item) => item.id === Number(id));
    return plan ? clonePlan(plan) : null;
  }

  listPlans({ focus, from, to } = {}) {
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

  close() {
    // Kein explizites Close nötig, aber die Methode wird für API-Kompatibilität bereitgestellt.
  }
}
