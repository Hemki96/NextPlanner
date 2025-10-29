const STORAGE_KEY = "swimPlanner.templates.v1";

export const TEMPLATE_TYPES = [
  { value: "Set", label: "Set" },
  { value: "Runde", label: "Runde" },
  { value: "Block", label: "Block" },
];

function hasLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch (error) {
    return false;
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

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
    return Array.from(
      new Set(
        value
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }
  return [];
}

function sanitizeTemplate(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : generateId();
  const type = TEMPLATE_TYPES.some((item) => item.value === raw.type) ? raw.type : "Set";
  const titleValue = typeof raw.title === "string" ? raw.title.trim() : "";
  const title = titleValue || "Unbenannte Vorlage";
  const notes = typeof raw.notes === "string" ? raw.notes : "";
  const content = typeof raw.content === "string" ? raw.content : "";
  const tags = normalizeTags(raw.tags);

  if (!content.trim()) {
    return null;
  }

  return { id, type, title, notes, content, tags };
}

export function loadTemplates() {
  if (!hasLocalStorage()) {
    return [];
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => sanitizeTemplate(item))
      .filter((item) => item !== null);
  } catch (error) {
    return [];
  }
}

export function persistTemplates(templates) {
  const sanitized = Array.isArray(templates)
    ? templates
        .map((item) => sanitizeTemplate(item))
        .filter((item) => item !== null)
    : [];

  if (hasLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        const detail = { count: sanitized.length };
        window.dispatchEvent(new CustomEvent("nextplanner:templates-updated", { detail }));
      }
    } catch (error) {
      console.warn("Konnte Template-Update-Ereignis nicht auslösen", error);
    }
  }

  return sanitized;
}

export function createTemplateRecord(data) {
  return sanitizeTemplate({ ...data, id: data?.id ?? generateId() });
}

export function appendTemplate(template) {
  const current = loadTemplates();
  const record = createTemplateRecord(template);
  if (!record) {
    return current;
  }
  const next = [...current, record];
  persistTemplates(next);
  return next;
}

export function parseTagsInput(value) {
  return normalizeTags(value);
}

export function getTemplateTypeLabel(type) {
  const entry = TEMPLATE_TYPES.find((item) => item.value === type);
  return entry ? entry.label : type;
}
