// Verwaltet Textbausteine: Validiert Eingaben und speichert sie im JSON-Store.
import { sanitizeQuickSnippetGroups } from "../../public/js/utils/snippet-storage.js";

import { JsonSnippetStore } from "../stores/json-snippet-store.js";

class SnippetService {
  constructor({ store }) {
    if (!store) throw new Error("Snippet store is required.");
    this.store = store;
  }

  async getLibrary() {
    return this.store.getLibrary();
  }

  async replaceLibrary(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.groups)) {
      const error = new Error("Ungültige Snippet-Payload");
      error.code = "invalid-snippet-payload";
      throw error;
    }
    const normalizedGroups = sanitizeQuickSnippetGroups(payload.groups);
    const saved = await this.store.replaceLibrary(normalizedGroups);
    return saved;
  }
}

export { SnippetService, JsonSnippetStore };
