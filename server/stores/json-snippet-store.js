import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  defaultQuickSnippetGroups,
  sanitizeQuickSnippetGroups,
} from "../../public/js/utils/snippet-storage.js";

const DATA_DIR = "data";
const DEFAULT_FILE_NAME = "team-snippets.json";

function resolveDefaultFile() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "..", "..", DATA_DIR, DEFAULT_FILE_NAME);
}

async function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
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
      if (error?.code !== "ENOENT") {
        console.warn("Konnte Team-Snippet-Datei nicht lesen", error);
      }
      this.#data = {
        updatedAt: new Date().toISOString(),
        groups: buildDefaultGroups(),
      };
      await this.#persist();
    }
  }

  async #persist(data = this.#data) {
    await ensureDirectory(this.#file);
    const payload = JSON.stringify(data, null, 2);
    await fs.writeFile(this.#file, payload, "utf8");
  }

  async #enqueueWrite(data) {
    const payload = data ?? snapshot(this.#data);
    const writeTask = this.#writeQueue.then(() => this.#persist(payload));
    this.#writeQueue = writeTask.catch(() => {});
    return writeTask;
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
    const sanitized = sanitizeQuickSnippetGroups(groups, { allowEmpty: true });
    if (isDeepStrictEqual(sanitized, this.#data.groups)) {
      return snapshot(this.#data);
    }
    this.#data = { groups: sanitized, updatedAt: new Date().toISOString() };
    await this.#enqueueWrite(snapshot(this.#data));
    return snapshot(this.#data);
  }

  async close() {
    if (this.#closed) {
      return;
    }
    await this.#writeQueue;
    this.#closed = true;
  }
}
