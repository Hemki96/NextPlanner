// Persistenter Store für Team-Snippets. Nutzt dieselben Sanitizer wie die
// Client-Seite und stellt sicher, dass nur valide Strukturen gespeichert
// werden.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  defaultQuickSnippetGroups,
  sanitizeQuickSnippetGroups,
} from "../../public/js/utils/snippet-storage.js";
import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";
import { isolateCorruptFile, writeJsonFileAtomically } from "./atomic-json-file.js";

const DEFAULT_FILE_NAME = "team-snippets.json";

function resolveDefaultFile() {
  return join(DATA_DIR, DEFAULT_FILE_NAME);
}

const cloneValue =
  typeof structuredClone === "function"
    ? (value) => structuredClone(value)
    : (value) => JSON.parse(JSON.stringify(value));

function buildDefaultGroups() {
  return sanitizeQuickSnippetGroups(defaultQuickSnippetGroups);
}

function normalizeUpdatedAt(value) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function snapshot({ updatedAt, groups }) {
  return { updatedAt, groups: cloneValue(groups) };
}

export class JsonSnippetStore {
  #file;
  #data = {
    updatedAt: new Date().toISOString(),
    groups: buildDefaultGroups(),
  };
  #writeQueue = Promise.resolve();
  #ready;
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
          updatedAt: new Date().toISOString(),
          groups: buildDefaultGroups(),
        };
        await this.#persist();
        return;
      }
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Snippet storage muss ein Objekt sein");
      }
      const groups = sanitizeQuickSnippetGroups(parsed.groups, { allowEmpty: true });
      const updatedAt = normalizeUpdatedAt(parsed.updatedAt) ?? new Date().toISOString();
      const shouldPersistGroups =
        !Array.isArray(parsed.groups) || !isDeepStrictEqual(groups, parsed.groups);
      const shouldPersistTimestamp = updatedAt !== parsed.updatedAt;
      this.#data = { groups, updatedAt };
      if (shouldPersistGroups || shouldPersistTimestamp) {
        await this.#persist();
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.#data = {
          updatedAt: new Date().toISOString(),
          groups: buildDefaultGroups(),
        };
        await this.#persist();
        return;
      }
      logger.warn("Konnte Team-Snippet-Datei nicht lesen: %s", error);
      const backupName = await isolateCorruptFile(this.#file);
      this.#data = {
        updatedAt: new Date().toISOString(),
        groups: buildDefaultGroups(),
      };
      this.#corruptIssue = new Error(
        `Team-Snippet-Datei war beschädigt und wurde als '${backupName ?? "Sicherung"}' isoliert.`,
      );
    }
  }

  async #persist(data = this.#data) {
    await writeJsonFileAtomically(this.#file, data);
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

  async getLibrary() {
    await this.#ready;
    return snapshot(this.#data);
  }

  async replaceLibrary(groups) {
    if (this.#closed) {
      throw new Error("Snippet store is closed");
    }
    await this.#ready;
    return this.#mutate(() => {
      const sanitized = sanitizeQuickSnippetGroups(groups, { allowEmpty: true });
      if (isDeepStrictEqual(sanitized, this.#data.groups)) {
        return snapshot(this.#data);
      }
      this.#data = { groups: sanitized, updatedAt: new Date().toISOString() };
      return snapshot(this.#data);
    });
  }

  async checkHealth() {
    if (this.#closed) {
      throw new Error("Snippet store is closed");
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
