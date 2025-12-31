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
    // Merkt sich den aktuell geplanten Render-Aufruf, damit eingehende Events vorhandene Frames abbrechen können.
    this.updateHandle = null;
    // Nutzt requestAnimationFrame, um die UI-Updates an die Browser-Renderzyklen zu koppeln.
    this.schedule =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 150);
    // Pendant zum Abbrechen geplanter Updates (Fallback: clearTimeout).
    this.cancelSchedule =
      typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : (handle) => clearTimeout(handle);
  }

  init({ textarea, initialText = "" } = {}) {
    this.textarea = textarea ?? null;
    // Stellt sicher, dass im Textfeld ein gültiges Grundgerüst steht (Platzhaltertext etc.).
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
    // Synchronisiert den sichtbaren Text mit dem internen Status.
    if (this.textarea) {
      this.textarea.value = this.state.text;
    }
    this.planService.saveDraft(this.state.text);
  }

  updateSummary() {
    // Aktualisiert den Highlighter auf Basis des aktuellen Textes.
    this.views.planHighlighter.setText(this.state.text);
    const plan = this.parsePlan(this.state.text);
    this.state.plan = plan;
    this.state.parsedAt = Date.now();
    // Rendert alle UI-Sektionen mit den neuen Aggregaten.
    this.renderSummary(plan, this.domRefs);
    this.views.validationPanel.update(plan.issues ?? []);
    this.views.templateCapture.update(plan);
    this.views.planSaveDialog.update(plan);
    this.views.planHighlighter.refresh();
  }

  handleInput(text) {
    const nextText = text ?? "";
    // Frühzeitiger Ausstieg: identischer Text benötigt kein erneutes Parsen.
    if (nextText === this.state.text) {
      return;
    }
    // Speichert das Draft sofort, damit ein Reload keinen Inhalt verliert.
    this.setText(nextText);
    // Abbreche ggf. geplante Render-Zyklen, um nur den aktuellsten Stand zu verarbeiten.
    if (this.updateHandle) {
      this.cancelSchedule(this.updateHandle);
    }
    // Schiebe das Re-Parsing auf den nächsten Frame, um Back-to-Back-Events zu bündeln.
    this.updateHandle = this.schedule(() => {
      this.updateHandle = null;
      this.updateSummary();
    });
  }

  refreshHighlight() {
    this.views.planHighlighter.refresh();
  }

  async loadPlanFromQuery(searchParams, { documentRef = document, historyRef = window.history } = {}) {
    // API-Load nur, wenn ein Backend verfügbar ist (Offline-Modus ansonsten).
    if (!this.planService.canUseApi()) {
      return;
    }
    const planId = searchParams.get("planId");
    const duplicatePlanId = searchParams.get("duplicatePlanId");
    const lookupId = planId ?? duplicatePlanId;
    if (!lookupId) {
      return;
    }

    // Lädt den Plan vom Server und spiegelt ihn in Editor und Titel wider.
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
