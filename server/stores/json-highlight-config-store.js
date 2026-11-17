// Persistenter Store für Hervorhebungs-Konfigurationen. Nutzt Defaultwerte aus
// dem Client und prüft auf inhaltliche Änderungen, bevor geschrieben wird.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  defaultEquipmentItems,
  defaultIntensityCodes,
} from "../../public/js/config/constants.js";
import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";
import { isolateCorruptFile, writeJsonFileAtomically } from "./atomic-json-file.js";

const DEFAULT_FILE_NAME = "highlight-config.json";

function resolveDefaultFile() {
  return join(DATA_DIR, DEFAULT_FILE_NAME);
}

const cloneValue =
  typeof structuredClone === "function"
    ? (value) => structuredClone(value)
    : (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_CONFIG = Object.freeze({
  intensities: [...defaultIntensityCodes],
  equipment: [...defaultEquipmentItems],
});

const MAX_ITEM_LENGTH = 80;
const MAX_ITEM_COUNT = 120;

function normalizeEntry(value) {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value)
      .replace(/\s+/g, " ")
      .trim();
    if (normalized) {
      return normalized.slice(0, MAX_ITEM_LENGTH);
    }
  }
  return null;
}

function sanitizeList(values, fallback, { allowEmpty = false } = {}) {
  const seen = new Set();
  const result = [];
  if (Array.isArray(values)) {
    for (const entry of values) {
      const normalized = normalizeEntry(entry);
      if (!normalized) {
        continue;
      }
      const key = normalized.toUpperCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);
      if (result.length >= MAX_ITEM_COUNT) {
        break;
      }
    }
  }
  if (result.length > 0 || allowEmpty) {
    return result;
  }
  if (Array.isArray(fallback) && fallback.length > 0) {
    return [...fallback];
  }
  return [];
}

function sanitizeConfig(config, fallback = DEFAULT_CONFIG) {
  const base = fallback ?? DEFAULT_CONFIG;
  const intensities = Array.isArray(config?.intensities)
    ? sanitizeList(config.intensities, base.intensities, { allowEmpty: true })
    : Array.from(base.intensities);
  const equipment = Array.isArray(config?.equipment)
    ? sanitizeList(config.equipment, base.equipment, { allowEmpty: true })
    : Array.from(base.equipment);
  return { intensities, equipment };
}

function snapshot(config) {
  return cloneValue({
    intensities: config.intensities,
    equipment: config.equipment,
    updatedAt: config.updatedAt,
  });
}

export class JsonHighlightConfigStore {
  #file;
  #data = {
    ...sanitizeConfig(DEFAULT_CONFIG),
    updatedAt: new Date().toISOString(),
  };
  #ready;
  #writeQueue = Promise.resolve();
  #closed = false;
  #corruptIssue = null;

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
        this.#data = {
          ...sanitizeConfig(DEFAULT_CONFIG),
          updatedAt: new Date().toISOString(),
        };
        await this.#persist();
        return;
      }
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Highlight-Konfiguration muss ein Objekt sein");
      }
      const sanitized = sanitizeConfig(parsed, DEFAULT_CONFIG);
      const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
      const normalizedUpdatedAt = (() => {
        if (!updatedAt) {
          return new Date().toISOString();
        }
        const parsedDate = new Date(updatedAt);
        return Number.isNaN(parsedDate.getTime())
          ? new Date().toISOString()
          : parsedDate.toISOString();
      })();
      const shouldPersist =
        !Array.isArray(parsed.intensities) ||
        !Array.isArray(parsed.equipment) ||
        !isDeepStrictEqual(parsed.intensities, sanitized.intensities) ||
        !isDeepStrictEqual(parsed.equipment, sanitized.equipment) ||
        normalizedUpdatedAt !== updatedAt;
      this.#data = { ...sanitized, updatedAt: normalizedUpdatedAt };
      if (shouldPersist) {
        await this.#persist();
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.#data = {
          ...sanitizeConfig(DEFAULT_CONFIG),
          updatedAt: new Date().toISOString(),
        };
        await this.#persist();
        return;
      }
      logger.warn("Konnte Highlight-Konfiguration nicht lesen: %s", error);
      const backupName = await isolateCorruptFile(this.#file);
      this.#data = {
        ...sanitizeConfig(DEFAULT_CONFIG),
        updatedAt: new Date().toISOString(),
      };
      this.#corruptIssue = new Error(
        `Highlight-Konfiguration war beschädigt und wurde als '${backupName ?? "Sicherung"}' isoliert.`,
      );
    }
  }

  async #persist(data = this.#data) {
    await writeJsonFileAtomically(this.#file, {
      intensities: data.intensities,
      equipment: data.equipment,
      updatedAt: data.updatedAt,
    });
  }

  #mutate(mutation) {
    const task = this.#writeQueue.then(async () => {
      const previous = this.#data;
      try {
        const result = await mutation();
        await this.#persist();
        return result;
      } catch (error) {
        this.#data = previous;
        throw error;
      }
    });
    this.#writeQueue = task.then(() => {}, () => {});
    return task;
  }

  async getConfig() {
    await this.#ready;
    return snapshot(this.#data);
  }

  async updateConfig(update) {
    if (this.#closed) {
      throw new Error("Highlight config store is closed");
    }
    await this.#ready;
    return this.#mutate(() => {
      const next = {
        intensities: Array.isArray(update?.intensities)
          ? sanitizeList(update.intensities, this.#data.intensities, { allowEmpty: true })
          : [...this.#data.intensities],
        equipment: Array.isArray(update?.equipment)
          ? sanitizeList(update.equipment, this.#data.equipment, { allowEmpty: true })
          : [...this.#data.equipment],
      };
      if (
        isDeepStrictEqual(next.intensities, this.#data.intensities) &&
        isDeepStrictEqual(next.equipment, this.#data.equipment)
      ) {
        return snapshot(this.#data);
      }
      this.#data = {
        intensities: next.intensities,
        equipment: next.equipment,
        updatedAt: new Date().toISOString(),
      };
      return snapshot(this.#data);
    });
  }

  async checkHealth() {
    if (this.#closed) {
      throw new Error("Highlight config store is closed");
    }
    await this.#ready;
    if (this.#corruptIssue) {
      throw this.#corruptIssue;
    }
    return { status: "ready" };
  }

  async close() {
    if (this.#closed) {
      return;
    }
    await this.#writeQueue;
    this.#closed = true;
  }
}

export function getDefaultHighlightConfig() {
  return snapshot({
    intensities: DEFAULT_CONFIG.intensities,
    equipment: DEFAULT_CONFIG.equipment,
    updatedAt: new Date().toISOString(),
  });
}
