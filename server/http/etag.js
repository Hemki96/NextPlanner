// Hilfsfunktionen zur ETag-Berechnung. Indem Plan- und Template-Daten in eine
// kanonische Form gebracht werden, erzeugen wir stabile Hashes, die sich nur
// ändern, wenn sich relevante Inhalte ändern.
import { createHash } from "node:crypto";

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

function canonicalizePlan(plan) {
  // Reduziert einen Plan auf die Felder, die für den ETag relevant sind, und
  // sortiert sie, damit die Reihenfolge der Eigenschaften keine Rolle spielt.
  const canonicalPlan = {
    id: plan.id,
    title: plan.title,
    content: plan.content,
    planDate: plan.planDate,
    focus: plan.focus,
    metadata: plan.metadata ?? {},
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    createdByUserId: plan.createdByUserId ?? null,
    updatedByUserId: plan.updatedByUserId ?? null,
  };
  return JSON.stringify(sortCanonical(canonicalPlan));
}

function canonicalizeTemplate(template) {
  // Entsprechende Normalisierung für Templates. Arrays werden kopiert, damit
  // versehentliche Mutationen nicht zurückwirken.
  const canonicalTemplate = {
    id: template.id,
    type: template.type,
    title: template.title,
    notes: template.notes,
    content: template.content,
    tags: Array.isArray(template.tags) ? [...template.tags] : [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
  return JSON.stringify(sortCanonical(canonicalTemplate));
}

function buildEtagFromCanonical(canonicalValue) {
  // Bildet aus dem kanonischen JSON einen SHA-256-Hash und verpackt ihn als
  // gültigen ETag-String.
  const hash = createHash("sha256").update(canonicalValue).digest("hex");
  return `"${hash}"`;
}

function buildPlanEtag(plan) {
  return buildEtagFromCanonical(canonicalizePlan(plan));
}

function buildTemplateEtag(template) {
  return buildEtagFromCanonical(canonicalizeTemplate(template));
}

export { buildPlanEtag, buildTemplateEtag, canonicalizePlan, canonicalizeTemplate };
