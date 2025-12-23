import { ApiError, apiRequest, canUseApi, describeApiError } from "../utils/api-client.js";
import { loadPlanDraft, savePlanDraft } from "../utils/plan-draft-storage.js";

function createPlanService({
  draftStorage = { load: loadPlanDraft, save: savePlanDraft },
  apiClient = apiRequest,
} = {}) {
  return {
    loadDraft() {
      const draft = draftStorage.load();
      return typeof draft === "string" ? draft : "";
    },
    saveDraft(text) {
      draftStorage.save(text ?? "");
    },
    async fetchPlan(planId) {
      const id = encodeURIComponent(planId);
      const response = await apiClient(`/api/plans/${id}`);
      return response.data;
    },
    canUseApi,
    describeError: describeApiError,
    ApiError,
  };
}

export { createPlanService };
