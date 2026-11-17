// JSON-Store für Vorlagen. Enthält Validierung und ID-Erzeugung und speichert
// die Daten als Datei im Datenverzeichnis.
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "../config.js";
import { isolateCorruptFile, writeJsonFileAtomically } from "./atomic-json-file.js";

const DEFAULT_FILE_NAME = "templates.json";

export class TemplateValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TemplateValidationError";
  }
}

function resolveDefaultFile() {
  return join(DATA_DIR, DEFAULT_FILE_NAME);
}

function normalizeString(value, { fallback = "", allowEmpty = false, label }) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new TemplateValidationError(`${label} muss ein String sein.`);
  }
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) {
    return fallback;
  }
  return trimmed;
}

const VALID_TYPES = new Set(["Set", "Runde", "Block"]);

function normalizeType(value, { fallback = "Set" } = {}) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new TemplateValidationError("type muss ein String sein.");
  }
  const trimmed = value.trim();
  if (!VALID_TYPES.has(trimmed)) {
    throw new TemplateValidationError("type muss 'Set', 'Runde' oder 'Block' sein.");
  }
  return trimmed;
}

function normalizeTags(value) {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    const normalized = value
      .filter((tag) => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }
  if (typeof value === "string") {
    return normalizeTags(value.split(/[;,]/));
  }
  throw new TemplateValidationError("tags müssen ein Array oder String sein.");
}

function cloneTemplate(template) {
  return {
    id: template.id,
    type: template.type,
    title: template.title,
    notes: template.notes,
    content: template.content,
    tags: Array.isArray(template.tags) ? [...template.tags] : [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function sanitizeTemplatePayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TemplateValidationError("Template-Payload muss ein Objekt sein.");
  }

  const normalized = {};
  if (!partial || Object.hasOwn(payload, "type")) {
    normalized.type = normalizeType(payload.type);
  }
  if (!partial || Object.hasOwn(payload, "title")) {
    normalized.title = normalizeString(payload.title, {
      fallback: "Unbenannte Vorlage",
      allowEmpty: false,
      label: "title",
    });
  }
  if (!partial || Object.hasOwn(payload, "notes")) {
    normalized.notes = normalizeString(payload.notes, {
      fallback: "",
      allowEmpty: true,
      label: "notes",
    });
  }
  if (!partial || Object.hasOwn(payload, "content")) {
    const content = normalizeString(payload.content, {
      fallback: "",
      allowEmpty: false,
      label: "content",
    });
    if (!content) {
      throw new TemplateValidationError("content darf nicht leer sein.");
    }
    normalized.content = content;
  }
  if (!partial || Object.hasOwn(payload, "tags")) {
    normalized.tags = normalizeTags(payload.tags);
  }

  return normalized;
}

export class JsonTemplateStore {
  #storageFile;
  #data = null;
  #loadPromise = null;
  #writePromise = Promise.resolve();
  #corruptIssue = null;

  constructor({ storageFile } = {}) {
    this.#storageFile = storageFile ?? resolveDefaultFile();
  }

  async #load() {
    if (this.#data) {
      return this.#data;
    }
    if (this.#loadPromise) {
      return this.#loadPromise;
    }
    this.#loadPromise = (async () => {
      try {
        const content = await fs.readFile(this.#storageFile, "utf8");
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.templates)) {
          throw new TemplateValidationError("Ungültige Templates-Struktur im Speicher.");
        }
        this.#data = {
          templates: parsed.templates.map((template) => {
            const normalized = sanitizeTemplatePayload(template);
            return {
              id: String(template.id ?? randomUUID()),
              ...normalized,
              createdAt: template.createdAt ?? new Date().toISOString(),
              updatedAt: template.updatedAt ?? new Date().toISOString(),
            };
          }),
        };
      } catch (error) {
        if (error && error.code === "ENOENT") {
          this.#data = { templates: [] };
        } else if (error instanceof SyntaxError || error instanceof TemplateValidationError) {
          const backupName = await isolateCorruptFile(this.#storageFile);
          this.#data = { templates: [] };
          this.#corruptIssue = new TemplateValidationError(
            `Templates-Datei war beschädigt und wurde als '${backupName ?? "Sicherung"}' isoliert.`,
          );
          throw this.#corruptIssue;
        } else {
          throw error;
        }
      }
      return this.#data;
    })();
    return this.#loadPromise;
  }

  async #persist(data) {
    await writeJsonFileAtomically(this.#storageFile, {
      templates: data.templates.map((template) => ({
        ...template,
        tags: Array.isArray(template.tags) ? template.tags : [],
      })),
    });
  }

  #mutate(mutation) {
    const task = this.#writePromise.then(async () => {
      const data = await this.#load();
      const previous = structuredClone(data);
      try {
        const result = mutation(data);
        await this.#persist(data);
        return result;
      } catch (error) {
        data.templates = previous.templates;
        throw error;
      }
    });
    this.#writePromise = task.then(() => {}, () => {});
    return task;
  }

  async listTemplates() {
    const data = await this.#load();
    return data.templates.map((template) => cloneTemplate(template));
  }

  async getTemplate(id) {
    const data = await this.#load();
    const template = data.templates.find((entry) => entry.id === id);
    return template ? cloneTemplate(template) : null;
  }

  async createTemplate(payload) {
    return this.#mutate((data) => {
      const normalized = sanitizeTemplatePayload(payload);
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        ...normalized,
        createdAt: now,
        updatedAt: now,
      };
      data.templates.push(record);
      return cloneTemplate(record);
    });
  }

  async updateTemplate(id, payload) {
    return this.#mutate((data) => {
      const index = data.templates.findIndex((template) => template.id === id);
      if (index === -1) {
        return null;
      }
      const normalized = sanitizeTemplatePayload(payload, { partial: true });
      const record = data.templates[index];
      Object.assign(record, normalized);
      record.updatedAt = new Date().toISOString();
      return cloneTemplate(record);
    });
  }

  async deleteTemplate(id) {
    return this.#mutate((data) => {
      const index = data.templates.findIndex((template) => template.id === id);
      if (index === -1) {
        return false;
      }
      data.templates.splice(index, 1);
      return true;
    });
  }

  async checkHealth() {
    await this.#load();
    if (this.#corruptIssue) {
      throw this.#corruptIssue;
    }
    return { status: "ready" };
  }

  async close() {
    await this.#writePromise;
  }
}
