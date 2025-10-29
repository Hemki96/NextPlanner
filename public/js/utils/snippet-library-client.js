import { apiRequest, canUseApi } from "./api-client.js";
import { sanitizeQuickSnippetGroups } from "./snippet-storage.js";

const ENDPOINT = "/api/snippets";

export function teamLibrarySupported() {
  return canUseApi();
}

export async function fetchTeamLibrary() {
  const { data } = await apiRequest(ENDPOINT, { method: "GET" });
  const groups = Array.isArray(data?.groups) ? sanitizeQuickSnippetGroups(data.groups) : [];
  const updatedAt = typeof data?.updatedAt === "string" ? data.updatedAt : null;
  return { groups, updatedAt };
}

export async function pushTeamLibrary(groups) {
  const sanitized = sanitizeQuickSnippetGroups(groups);
  const { data } = await apiRequest(ENDPOINT, { method: "PUT", json: { groups: sanitized } });
  const updatedAt = typeof data?.updatedAt === "string" ? data.updatedAt : null;
  return { groups: sanitizeQuickSnippetGroups(data?.groups ?? sanitized), updatedAt };
}
