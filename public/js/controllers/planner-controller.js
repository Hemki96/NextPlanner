import { ensurePlanSkeleton } from "../utils/plan-defaults.js";

class PlannerController {
  constructor({
    parsePlan,
    renderSummary,
    planService,
    views = {},
    featureFlags = {},
    domRefs = {},
  }) {
    this.parsePlan = parsePlan;
    this.renderSummary = renderSummary;
    this.planService = planService;
    this.views = {
      validationPanel: views.validationPanel ?? { update() {} },
      templateCapture: views.templateCapture ?? { update() {} },
      planSaveDialog: views.planSaveDialog ?? { update() {} },
      planHighlighter: views.planHighlighter ?? { setText() {}, refresh() {} },
    };
    this.featureFlags = featureFlags;
    this.domRefs = domRefs;
    this.state = {
      text: "",
      plan: null,
      parsedAt: null,
    };
    this.textarea = null;
  }

  init({ textarea, initialText = "" } = {}) {
    this.textarea = textarea ?? null;
    if (this.textarea) {
      ensurePlanSkeleton(this.textarea);
      if (typeof initialText === "string" && initialText.length > 0) {
        this.textarea.value = initialText;
      }
    }
    this.state.text = this.textarea?.value ?? initialText ?? "";
    this.planService.saveDraft(this.state.text);
    this.updateSummary();
  }

  setText(text) {
    this.state.text = text ?? "";
    if (this.textarea) {
      this.textarea.value = this.state.text;
    }
    this.planService.saveDraft(this.state.text);
  }

  updateSummary() {
    this.views.planHighlighter.setText(this.state.text);
    const plan = this.parsePlan(this.state.text);
    this.state.plan = plan;
    this.state.parsedAt = Date.now();
    this.renderSummary(plan, this.domRefs);
    this.views.validationPanel.update(plan.issues ?? []);
    this.views.templateCapture.update(plan);
    this.views.planSaveDialog.update(plan);
    this.views.planHighlighter.refresh();
  }

  handleInput(text) {
    this.setText(text);
    this.updateSummary();
  }

  refreshHighlight() {
    this.views.planHighlighter.refresh();
  }

  async loadPlanFromQuery(searchParams, { documentRef = document, historyRef = window.history } = {}) {
    if (!this.planService.canUseApi()) {
      return;
    }
    const planId = searchParams.get("planId");
    const duplicatePlanId = searchParams.get("duplicatePlanId");
    const lookupId = planId ?? duplicatePlanId;
    if (!lookupId) {
      return;
    }

    const plan = await this.planService.fetchPlan(lookupId);
    if (!plan?.content) {
      return;
    }
    this.setText(plan.content);
    this.updateSummary();
    if (plan.title && planId) {
      documentRef.title = `${plan.title} – Swim Planner`;
    }
    const currentPath =
      documentRef?.location?.pathname ??
      (typeof window !== "undefined" && window.location ? window.location.pathname : "/");
    if (historyRef && typeof historyRef.replaceState === "function") {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (planId) {
        historyRef.replaceState({}, documentRef.title, currentPath);
      } else if (duplicatePlanId) {
        nextParams.delete("duplicatePlanId");
        const newQuery = nextParams.toString();
        const nextUrl = currentPath + (newQuery ? `?${newQuery}` : "");
        historyRef.replaceState({}, documentRef.title, nextUrl);
      }
    }
  }
}

export { PlannerController };
