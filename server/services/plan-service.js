// Service für Pläne inklusive Export der Fehlerklassen aus dem Plan-Store.
// ETag-Berechnung und -Vergleich kommen aus dem gemeinsamen HTTP-Helfer.
import { buildPlanEtag, etagMatches } from "../http/etag.js";
import { PlanConflictError, PlanValidationError } from "../stores/json-plan-store.js";

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
    if (expectedEtag && !etagMatches(expectedEtag, buildPlanEtag(current), { strong: true })) {
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
    if (expectedEtag && !etagMatches(expectedEtag, buildPlanEtag(current), { strong: true })) {
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
