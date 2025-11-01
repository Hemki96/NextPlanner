import { apiRequest, canUseApi } from "./api-client.js";
import { sanitizeHighlightVocabulary } from "./highlight-vocabulary.js";

const ENDPOINT = "/api/highlight-config";

export function highlightConfigPersistenceSupported() {
  return canUseApi();
}

function extractUpdatedAt(data) {
  const value = data?.updatedAt;
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function fetchHighlightVocabularyConfig() {
  const { data } = await apiRequest(ENDPOINT, { method: "GET" });
  const vocabulary = sanitizeHighlightVocabulary(data ?? {}, { allowEmpty: true });
  return { vocabulary, updatedAt: extractUpdatedAt(data) };
}

export async function persistHighlightVocabularyConfig(vocabulary) {
  const sanitized = sanitizeHighlightVocabulary(vocabulary ?? {}, { allowEmpty: true });
  const { data } = await apiRequest(ENDPOINT, {
    method: "PUT",
    json: sanitized,
  });
  const persisted = sanitizeHighlightVocabulary(data ?? {}, { allowEmpty: true });
  return { vocabulary: persisted, updatedAt: extractUpdatedAt(data) };
}
