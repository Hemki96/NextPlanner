// Berechnet ETags für Highlight-Konfigurationen und stellt Fehlerklassen aus
// dem zugehörigen Store bereit.
import { createHash } from "node:crypto";

import { JsonHighlightConfigStore } from "../stores/json-highlight-config-store.js";

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

function canonicalizeHighlightConfig(config) {
  return JSON.stringify(
    sortCanonical({
      intensities: config.intensities,
      equipment: config.equipment,
      updatedAt: config.updatedAt,
    }),
  );
}

function buildHighlightConfigEtag(config) {
  const canonical = canonicalizeHighlightConfig(config);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `"${hash}"`;
}

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
