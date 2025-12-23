import { createHash } from "node:crypto";

import { TemplateValidationError } from "../stores/json-template-store.js";

function sortCanonical(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortCanonical(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortCanonical(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalizeTemplate(template) {
  const canonicalTemplate = {
    id: template.id,
    type: template.type,
    title: template.title,
    notes: template.notes,
    content: template.content,
    tags: Array.isArray(template.tags) ? [...template.tags] : [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
  return JSON.stringify(sortCanonical(canonicalTemplate));
}

function buildTemplateEtag(template) {
  const canonical = canonicalizeTemplate(template);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `"${hash}"`;
}

class TemplateService {
  constructor({ store }) {
    if (!store) throw new Error("Template store is required.");
    this.store = store;
  }

  async listTemplates() {
    const templates = await this.store.listTemplates();
    return templates.map((template) => ({
      template,
      etag: buildTemplateEtag(template),
    }));
  }

  async getTemplate(id) {
    const template = await this.store.getTemplate(id);
    if (!template) {
      return { template: null, etag: null };
    }
    return { template, etag: buildTemplateEtag(template) };
  }

  async createTemplate(payload) {
    const template = await this.store.createTemplate(payload);
    return { template, etag: buildTemplateEtag(template) };
  }

  async updateTemplate(id, payload) {
    const updated = await this.store.updateTemplate(id, payload);
    if (!updated) {
      return { template: null, etag: null };
    }
    return { template: updated, etag: buildTemplateEtag(updated) };
  }

  async deleteTemplate(id) {
    const deleted = await this.store.deleteTemplate(id);
    return deleted;
  }
}

export { TemplateService, TemplateValidationError, buildTemplateEtag };
