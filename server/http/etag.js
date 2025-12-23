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

export { buildPlanEtag, buildTemplateEtag, canonicalizePlan, canonicalizeTemplate };
