import { PlanConflictError, PlanValidationError } from "../stores/json-plan-store.js";

class PlanService {
  constructor({ store }) {
    if (!store) {
      throw new Error("Plan store ist erforderlich.");
    }
    this.store = store;
  }

  async listPlans(filters = {}) {
    return this.store.listPlans(filters);
  }

  async getPlan(id) {
    const plan = await this.store.getPlan(id);
    return plan ?? null;
  }

  async createPlan(payload, { userId } = {}) {
    return this.store.createPlan(payload, { userId });
  }

  async updatePlan(id, payload, { expectedUpdatedAt, userId } = {}) {
    const current = await this.store.getPlan(id);
    if (!current) {
      return null;
    }
    return this.store.replacePlan(id, payload, {
      expectedUpdatedAt: expectedUpdatedAt ?? current.updatedAt,
      userId,
    });
  }

  async deletePlan(id, { expectedUpdatedAt } = {}) {
    const current = await this.store.getPlan(id);
    if (!current) {
      return false;
    }
    return this.store.deletePlan(id, { expectedUpdatedAt: expectedUpdatedAt ?? current.updatedAt });
  }

  async exportBackup() {
    return this.store.exportBackup();
  }

  async importBackup(payload) {
    return this.store.importBackup(payload);
  }
}

export { PlanService, PlanValidationError, PlanConflictError };
