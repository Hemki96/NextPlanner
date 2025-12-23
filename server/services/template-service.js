import { TemplateValidationError } from "../stores/json-template-store.js";

class TemplateService {
  constructor({ store }) {
    if (!store) throw new Error("Template store ist erforderlich.");
    this.store = store;
  }

  async listTemplates() {
    return this.store.listTemplates();
  }

  async getTemplate(id) {
    const template = await this.store.getTemplate(id);
    return template ?? null;
  }

  async createTemplate(payload) {
    return this.store.createTemplate(payload);
  }

  async updateTemplate(id, payload) {
    return this.store.updateTemplate(id, payload);
  }

  async deleteTemplate(id) {
    return this.store.deleteTemplate(id);
  }
}

export { TemplateService, TemplateValidationError };
