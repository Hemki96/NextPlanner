// Basisklasse für JSON-basierte Datenspeicher. Sie kümmert sich um das
// Laden, Speichern und atomare Schreiben einer JSON-Datei. Dadurch können
// spezialisierte Stores sich auf die Datenlogik konzentrieren und müssen die
// Dateibehandlung nicht wiederholen.
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import { writeJsonFileAtomically } from "../../stores/atomic-json-file.js";

const DEFAULT_ENCODING = "utf8";

function cloneValue(value) {
  // Erstellt eine tiefe Kopie des Wertes, damit Aufrufer nicht aus Versehen den
  // internen Zustand manipulieren.
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

async function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

function defaultNormalize(data) {
  return data;
}

function defaultCorruptHandler() {
  // Kein Ersatzwert: der Fehler wird weitergereicht.
  return null;
}

class JsonStore {
  #filePath;
  #data;
  #ready;
  #writeQueue = Promise.resolve();
  #normalize;
  #onCorrupt;

  constructor({ filePath, defaultValue = {}, normalize = defaultNormalize, onCorrupt = defaultCorruptHandler } = {}) {
    if (!filePath) {
      throw new Error("filePath is required for JsonStore");
    }
    this.#filePath = filePath;
    this.#normalize = normalize;
    this.#onCorrupt = onCorrupt;
    this.#data = defaultValue;
    this.#ready = this.#load(defaultValue);
  }

  async #load(defaultValue) {
    await ensureDirectory(this.#filePath);
    try {
      const raw = await fs.readFile(this.#filePath, DEFAULT_ENCODING);
      const parsed = JSON.parse(raw);
      this.#data = this.#normalize(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.#data = this.#normalize(defaultValue);
        await writeJsonFileAtomically(this.#filePath, this.#data);
        return;
      }
      if (error instanceof SyntaxError) {
        const replacement = this.#onCorrupt(error);
        if (replacement !== null && replacement !== undefined) {
          this.#data = this.#normalize(replacement);
          await writeJsonFileAtomically(this.#filePath, this.#data);
          return;
        }
      }
      throw error;
    }
  }

  async ready() {
    await this.#ready;
  }

  snapshot() {
    return cloneValue(this.#data);
  }

  async update(mutator) {
    // Der neue Zustand wird erst nach erfolgreichem Schreiben übernommen.
    // Bei einem Write-Fehler bleiben Datei und Arbeitsspeicher konsistent.
    await this.ready();
    this.#writeQueue = this.#writeQueue.then(async () => {
      const current = cloneValue(this.#data);
      const nextData = mutator ? await mutator(current) : current;
      const normalized = this.#normalize(nextData);
      await writeJsonFileAtomically(this.#filePath, normalized);
      this.#data = normalized;
    });
    this.#writeQueue = this.#writeQueue.catch((error) => {
      this.#writeQueue = Promise.resolve();
      throw error;
    });
    return this.#writeQueue;
  }

  async close() {
    await this.ready();
    await this.#writeQueue;
  }
}

export { JsonStore };
