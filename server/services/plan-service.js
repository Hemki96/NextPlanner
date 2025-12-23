import { createHash } from "node:crypto";

import { PlanConflictError, PlanValidationError } from "../stores/json-plan-store.js";

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

function buildPlanEtag(plan) {
  const canonical = canonicalizePlan(plan);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `"${hash}"`;
}

class PlanService {
  constructor({ store }) {
    if (!store) {
      throw new Error("Plan store is required.");
    }
    this.store = store;
  }

  async listPlans(filters = {}) {
    return this.store.listPlans(filters);
  }

  async getPlanWithEtag(id) {
    const plan = await this.store.getPlan(id);
    if (!plan) {
      return null;
    }
    return { plan, etag: buildPlanEtag(plan) };
  }

  async createPlan(payload, { userId } = {}) {
    const plan = await this.store.createPlan(payload, { userId });
    return { plan, etag: buildPlanEtag(plan) };
  }

  async updatePlan(id, payload, { expectedEtag, userId } = {}) {
    const current = await this.store.getPlan(id);
    if (!current) {
      return { plan: null, etag: null };
    }
    if (expectedEtag && expectedEtag !== buildPlanEtag(current)) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: current,
        expectedUpdatedAt: current.updatedAt,
      });
    }
    const updated = await this.store.replacePlan(id, payload, {
      expectedUpdatedAt: current.updatedAt,
      userId,
    });
    return { plan: updated, etag: buildPlanEtag(updated) };
  }

  async deletePlan(id, { expectedEtag } = {}) {
    const current = await this.store.getPlan(id);
    if (!current) {
      return { deleted: false, etag: null };
    }
    if (expectedEtag && expectedEtag !== buildPlanEtag(current)) {
      throw new PlanConflictError("Plan wurde bereits geändert.", {
        currentPlan: current,
        expectedUpdatedAt: current.updatedAt,
      });
    }
    const deleted = await this.store.deletePlan(id, { expectedUpdatedAt: current.updatedAt });
    return { deleted, etag: buildPlanEtag(current) };
  }

  async exportBackup() {
    return this.store.exportBackup();
  }

  async importBackup(payload) {
    return this.store.importBackup(payload);
  }
}

export { PlanService, PlanValidationError, PlanConflictError, buildPlanEtag };
