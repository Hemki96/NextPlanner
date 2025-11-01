import { apiRequest, canUseApi } from "./api-client.js";
import { sanitizeQuickSnippetGroups } from "./snippet-storage.js";

const ENDPOINT = "/api/quick-snippets";

export function quickSnippetPersistenceSupported() {
  return canUseApi();
}

export async function fetchPersistedQuickSnippets() {
  const { data } = await apiRequest(ENDPOINT, { method: "GET" });
  const groups = Array.isArray(data?.groups) ? sanitizeQuickSnippetGroups(data.groups) : [];
  const updatedAt = typeof data?.updatedAt === "string" ? data.updatedAt : null;
  return { groups, updatedAt };
}

export async function persistQuickSnippets(groups) {
  const sanitized = sanitizeQuickSnippetGroups(groups);
  const { data } = await apiRequest(ENDPOINT, {
    method: "PUT",
    json: { groups: sanitized },
  });
  const persistedGroups = Array.isArray(data?.groups)
    ? sanitizeQuickSnippetGroups(data.groups)
    : sanitized;
  const updatedAt = typeof data?.updatedAt === "string" ? data.updatedAt : null;
  return { groups: persistedGroups, updatedAt };
}
