const API_ENDPOINT = "/api/templates";

export const TEMPLATE_TYPES = [
  { value: "Set", label: "Set" },
  { value: "Runde", label: "Runde" },
  { value: "Block", label: "Block" },
];

let cachedTemplates = [];

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }
  if (typeof value === "string") {
    return normalizeTags(value.split(/[;,]/));
  }
  return [];
}

function coerceTemplateType(value) {
  if (typeof value !== "string") {
    return "Set";
  }
  const trimmed = value.trim();
  return TEMPLATE_TYPES.some((entry) => entry.value === trimmed) ? trimmed : "Set";
}

function sanitizeTemplate(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : null;
  if (!id) {
    return null;
  }
  const type = coerceTemplateType(raw.type);
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Unbenannte Vorlage";
  const notes = typeof raw.notes === "string" ? raw.notes : "";
  const content = typeof raw.content === "string" ? raw.content : "";
  if (!content.trim()) {
    return null;
  }
  const tags = normalizeTags(raw.tags);
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : null;
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;
  return {
    id,
    type,
    title,
    notes,
    content,
    tags,
    createdAt,
    updatedAt,
  };
}

function buildPayload(data) {
  const type = coerceTemplateType(data?.type);
  const title = typeof data?.title === "string" && data.title.trim() ? data.title.trim() : "Unbenannte Vorlage";
  const notes = typeof data?.notes === "string" ? data.notes : "";
  const content = typeof data?.content === "string" ? data.content.trim() : "";
  if (!content) {
    throw new Error("Der Vorlagentext darf nicht leer sein.");
  }
  const tags = normalizeTags(data?.tags ?? []);
  return { type, title, notes, content, tags };
}

async function request(method, path = "", payload) {
  const options = {
    method,
    headers: {
      Accept: "application/json",
    },
  };
  if (payload !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(`${API_ENDPOINT}${path}`, options);
  let data = null;
  let text = null;
  if (response.status !== 204) {
    try {
      text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      console.warn("Konnte Antwort nicht als JSON lesen", error);
    }
  }
  if (!response.ok) {
    const message =
      (data && data.error && data.error.message) ||
      text ||
      `Anfrage fehlgeschlagen (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return { data, headers: response.headers };
}

function dispatchTemplatesUpdated(detail = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("nextplanner:templates-updated", { detail }));
    }
  } catch (error) {
    console.warn("Konnte Template-Update-Ereignis nicht auslösen", error);
  }
}

export async function loadTemplates() {
  const { data } = await request("GET");
  const sanitized = Array.isArray(data)
    ? data
        .map((item) => sanitizeTemplate(item))
        .filter((item) => item !== null)
    : [];
  cachedTemplates = sanitized;
  return [...cachedTemplates];
}

export async function createTemplate(data) {
  const payload = buildPayload(data);
  const { data: created, headers } = await request("POST", "", payload);
  const record = sanitizeTemplate(created);
  if (!record) {
    throw new Error("Vorlage konnte nicht gespeichert werden.");
  }
  cachedTemplates = [...cachedTemplates, record];
  dispatchTemplatesUpdated({ action: "created", template: record, count: cachedTemplates.length, etag: headers.get("etag") });
  return record;
}

export async function updateTemplate(id, data) {
  const payload = buildPayload(data);
  const { data: updated, headers } = await request("PUT", `/${encodeURIComponent(id)}`, payload);
  const record = sanitizeTemplate(updated);
  if (!record) {
    throw new Error("Vorlage konnte nicht aktualisiert werden.");
  }
  cachedTemplates = cachedTemplates.map((entry) => (entry.id === id ? record : entry));
  dispatchTemplatesUpdated({ action: "updated", template: record, count: cachedTemplates.length, etag: headers.get("etag") });
  return record;
}

export async function deleteTemplate(id) {
  await request("DELETE", `/${encodeURIComponent(id)}`);
  const previousLength = cachedTemplates.length;
  cachedTemplates = cachedTemplates.filter((entry) => entry.id !== id);
  dispatchTemplatesUpdated({ action: "deleted", id, count: cachedTemplates.length });
  return previousLength !== cachedTemplates.length;
}

export async function appendTemplate(data) {
  return createTemplate(data);
}

export function parseTagsInput(value) {
  return normalizeTags(value ?? "");
}

export function getTemplateTypeLabel(type) {
  const entry = TEMPLATE_TYPES.find((item) => item.value === type);
  return entry ? entry.label : type;
}
