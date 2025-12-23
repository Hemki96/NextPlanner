import { JsonHighlightConfigStore } from "../stores/json-highlight-config-store.js";

class HighlightConfigService {
  constructor({ store }) {
    if (!store) throw new Error("Highlight config store is required.");
    this.store = store;
  }

  async getConfig() {
    return this.store.getConfig();
  }

  async updateConfig(payload) {
    return this.store.updateConfig(payload);
  }
}

export { HighlightConfigService, JsonHighlightConfigStore };
