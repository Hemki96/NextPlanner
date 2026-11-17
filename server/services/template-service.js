// Hilfsfunktionen für Template-Objekte. Exportiert auch Validierungsfehler
// für Wiederverwendung in Routern. Die ETag-Berechnung ist zentralisiert.
import { buildTemplateEtag } from "../http/etag.js";
import { TemplateValidationError } from "../stores/json-template-store.js";

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
