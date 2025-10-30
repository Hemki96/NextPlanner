import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function snapshot({ updatedAt, groups }) {
  return { updatedAt, groups: cloneValue(groups) };
}

export class JsonSnippetStore {
  #file;
  #data = {
    updatedAt: new Date(0).toISOString(),
    groups: cloneValue(defaultQuickSnippetGroups),
  };
  #writeQueue = Promise.resolve();
  #ready;
  #closed = false;

  constructor(options = {}) {
    const { storageFile = resolveDefaultFile() } = options;
    this.#file = storageFile;
    this.#ready = this.#load();
  }

  async #load() {
    try {
      const content = await fs.readFile(this.#file, "utf8");
      if (!content.trim()) {
        return;
      }
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.groups)) {
        const groups = sanitizeQuickSnippetGroups(parsed.groups);
        const updatedAt = typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : new Date().toISOString();
        this.#data = { groups, updatedAt };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("Konnte Team-Snippet-Datei nicht lesen", error);
      }
      await this.#persist();
    }
  }

  async #persist() {
    await ensureDirectory(this.#file);
    const payload = JSON.stringify(this.#data, null, 2);
    await fs.writeFile(this.#file, payload, "utf8");
  }

  async #enqueueWrite() {
    this.#writeQueue = this.#writeQueue.then(() => this.#persist());
    return this.#writeQueue;
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
    const sanitized = sanitizeQuickSnippetGroups(groups);
    this.#data = { groups: sanitized, updatedAt: new Date().toISOString() };
    await this.#enqueueWrite();
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
