// Zentrale ETag-Strategie: eine kanonische Repräsentation pro Ressource, ein
// SHA-256-Hash daraus und ein einheitlicher Vergleich für HTTP-Präconditions.
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

function canonicalizeHighlightConfig(config) {
  return JSON.stringify(
    sortCanonical({
      intensities: config.intensities,
      equipment: config.equipment,
      updatedAt: config.updatedAt,
    }),
  );
}

function buildEtagFromCanonical(canonicalValue) {
  const hash = createHash("sha256").update(canonicalValue).digest("hex");
  return `"${hash}"`;
}

function buildPlanEtag(plan) {
  return buildEtagFromCanonical(canonicalizePlan(plan));
}

function buildTemplateEtag(template) {
  return buildEtagFromCanonical(canonicalizeTemplate(template));
}

function buildHighlightConfigEtag(config) {
  return buildEtagFromCanonical(canonicalizeHighlightConfig(config));
}

// Zerlegt eine ETag-Liste. ETags dürfen Kommata enthalten, deshalb wird nicht
// einfach bei "," gesplittet.
function parseEtagList(header) {
  if (typeof header !== "string" || !header.trim()) {
    return [];
  }
  return header.match(/"(?:[^"\\]|\\.)*"|[^\s,]+/g)?.map((tag) => tag.trim()) ?? [];
}

// Vergleich für If-Match (strong = true) und If-None-Match (strong = false).
// If-Match akzeptiert "*", If-None-Match nicht: bei existierender Ressource
// ist die Bedingung dort false (RFC 9110).
function etagMatches(header, currentEtag, { strong = false } = {}) {
  if (typeof header !== "string" || !header.trim() || !currentEtag) {
    return false;
  }
  const trimmed = header.trim();
  if (trimmed === "*") {
    return strong;
  }
  const current = strong ? currentEtag : currentEtag.replace(/^W\//, "");
  return parseEtagList(trimmed).some((candidate) => {
    if (strong && candidate.startsWith("W/")) {
      return false;
    }
    const value = candidate.replace(/^W\//, "");
    return value === current || value === current.replace(/^W\//, "");
  });
}

export {
  sortCanonical,
  canonicalizePlan,
  canonicalizeTemplate,
  canonicalizeHighlightConfig,
  buildEtagFromCanonical,
  buildPlanEtag,
  buildTemplateEtag,
  buildHighlightConfigEtag,
  parseEtagList,
  etagMatches,
};
