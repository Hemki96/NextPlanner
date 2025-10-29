import { parsePlan } from "./parser/planParser.js";
import { renderSummary } from "./ui/summaryRenderer.js";
import { initHelpOverlay } from "./ui/helpOverlay.js";
import { initIOControls } from "./ui/ioControls.js";
import { initQuickSnippets } from "./ui/quickSnippets.js";
import { initPlanHighlighter } from "./ui/planHighlighter.js";
import { initTemplateCapture } from "./ui/templateCapture.js";
import { initPlanSaveDialog } from "./ui/planSaveDialog.js";
import { initTemplateLibraryPanel } from "./ui/templateLibraryPanel.js";
import { initValidationPanel } from "./ui/validationPanel.js";
import { ApiError, apiRequest, canUseApi, describeApiError } from "./utils/apiClient.js";

const originalTitle = document.title;

/**
 * Zentrale DOM-Referenzen, die zwischen Parser und UI ausgetauscht werden.
 */
const dom = {
  planInput: document.getElementById("plan-input"),
  planHighlight: document.getElementById("plan-highlight"),
  totalTimeEl: document.getElementById("total-time"),
  totalDistanceEl: document.getElementById("total-distance"),
  averagePaceEl: document.getElementById("average-pace"),
  intensityListEl: document.getElementById("intensity-list"),
  equipmentListEl: document.getElementById("equipment-list"),
  blockListEl: document.getElementById("block-list"),
  helpButton: document.getElementById("help-button"),
  helpOverlay: document.getElementById("help-overlay"),
  helpCloseButton: document.getElementById("help-close"),
  importButton: document.getElementById("import-button"),
  importInput: document.getElementById("import-input"),
  exportMarkdownButton: document.getElementById("export-markdown"),
  exportWordButton: document.getElementById("export-word"),
  savePlanButton: document.getElementById("save-plan-button"),
  quickSnippetContainer: document.getElementById("quick-snippet-container"),
  validationPanel: document.getElementById("validation-panel"),
  templatePanel: document.querySelector(".template-panel"),
};

const planHighlighter = initPlanHighlighter({
  textarea: dom.planInput,
  highlightLayer: dom.planHighlight,
});

const validationPanel = initValidationPanel({
  container: dom.validationPanel,
  textarea: dom.planInput,
  highlighter: planHighlighter,
});

initTemplateLibraryPanel({
  container: dom.templatePanel,
  textarea: dom.planInput,
});

const templateCapture = initTemplateCapture({
  blockList: dom.blockListEl,
});

const planSaveDialog = initPlanSaveDialog({
  planInput: dom.planInput,
  saveButton: dom.savePlanButton,
});

/**
 * Liest den aktuellen Text aus dem Eingabefeld, parst ihn und aktualisiert die Anzeige.
 */
function updateSummary() {
  const plan = parsePlan(dom.planInput?.value ?? "");
  renderSummary(plan, dom);
  validationPanel.update(plan.issues ?? []);
  templateCapture.update(plan);
  planSaveDialog.update(plan);
}

// Automatische Aktualisierung bei jeder Nutzereingabe sowie Initialisierung beim Laden der Seite.
dom.planInput?.addEventListener("input", updateSummary);
updateSummary();

// Initialisiere das Hinweis-Overlay inklusive Fokusmanagement.
initHelpOverlay({
  button: dom.helpButton,
  overlay: dom.helpOverlay,
  closeButton: dom.helpCloseButton,
});

// Import- und Export-Steuerung aktivieren, damit Pläne gesichert oder geladen werden können.
initIOControls({
  planInput: dom.planInput,
  importInput: dom.importInput,
  importButton: dom.importButton,
  exportMarkdownButton: dom.exportMarkdownButton,
  exportWordButton: dom.exportWordButton,
});

// Schnellbausteine für häufig genutzte Elemente bereitstellen.
initQuickSnippets({
  container: dom.quickSnippetContainer,
  textarea: dom.planInput,
});

async function loadPlanFromQuery() {
  if (typeof window === "undefined" || !canUseApi()) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const planId = params.get("planId");
  const duplicatePlanId = params.get("duplicatePlanId");
  const lookupId = planId ?? duplicatePlanId;
  if (!lookupId) {
    return;
  }

  try {
    const { data: plan } = await apiRequest(`/api/plans/${encodeURIComponent(lookupId)}`);
    if (!plan?.content) {
      console.warn(`Plan ${lookupId} enthielt keinen Inhalt.`);
      return;
    }
    planHighlighter.setText(plan.content);
    updateSummary();
    if (plan.title && planId) {
      document.title = `${plan.title} – Swim Planner`;
    }
    if (window.history && typeof window.history.replaceState === "function") {
      const nextParams = new URLSearchParams(window.location.search);
      if (planId) {
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (duplicatePlanId) {
        nextParams.delete("duplicatePlanId");
        const newQuery = nextParams.toString();
        const nextUrl = newQuery ? `${window.location.pathname}?${newQuery}` : window.location.pathname;
        window.history.replaceState({}, document.title, nextUrl);
      }
    }
  } catch (error) {
    const message = describeApiError(error);
    const severity = error instanceof ApiError && error.offline ? "warn" : "error";
    console[severity === "warn" ? "warn" : "error"](`Plan ${lookupId} konnte nicht geladen werden: ${message}`);
    document.title = originalTitle;
  }
}

loadPlanFromQuery().catch((error) => {
  console.error("Unerwarteter Fehler beim Laden eines Plans aus der URL", error);
  document.title = originalTitle;
});
