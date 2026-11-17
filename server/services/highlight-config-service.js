// Stellt Fehlerklassen und den zentralen ETag-Helfer für Highlight-Konfigurationen bereit.
import {
  buildHighlightConfigEtag,
  canonicalizeHighlightConfig,
  sortCanonical,
} from "../http/etag.js";
import { JsonHighlightConfigStore } from "../stores/json-highlight-config-store.js";

class HighlightConfigService {
  constructor({ store }) {
    if (!store) throw new Error("Highlight config store is required.");
    this.store = store;
  }

  async getConfig() {
    return this.store.getConfig();
  }

  async getConfigWithEtag() {
    const config = await this.getConfig();
    return { config, etag: buildHighlightConfigEtag(config) };
  }

  async updateConfig(payload) {
    const config = await this.store.updateConfig(payload);
    return { config, etag: buildHighlightConfigEtag(config) };
  }
}

export {
  HighlightConfigService,
  JsonHighlightConfigStore,
  buildHighlightConfigEtag,
  canonicalizeHighlightConfig,
  sortCanonical,
};
