import { parsePlan } from "./parser/plan-parser.js";
import { renderSummary } from "./ui/summary-renderer.js";
import { initHelpOverlay } from "./ui/help-overlay.js";
import { initIOControls } from "./ui/io-controls.js";
import { initQuickSnippets } from "./ui/quick-snippets.js";
import { initPlanHighlighter } from "./ui/plan-highlighter.js";
import { initTemplateCapture } from "./ui/template-capture.js";
import { initPlanSaveDialog } from "./ui/plan-save-dialog.js";
import { initValidationPanel } from "./ui/validation-panel.js";
import { ApiError, apiRequest, canUseApi, describeApiError } from "./utils/api-client.js";
import { ensurePlanSkeleton } from "./utils/plan-defaults.js";
import { loadPlanDraft, savePlanDraft } from "./utils/plan-draft-storage.js";
import { initTrendReports } from "./ui/trend-reports.js";
import {
  applyFeatureVisibility,
  getFeatureSettings,
  subscribeToFeatureSettings,
} from "./utils/feature-settings.js";
import { bootstrapHighlightVocabulary } from "./utils/highlight-bootstrap.js";

const originalTitle = document.title;

/**
 * Zentrale DOM-Referenzen, die zwischen Parser und UI ausgetauscht werden.
 */
const dom = {
  planEditor: document.querySelector(".plan-editor"),
  planInput: document.getElementById("plan-input"),
  planHighlight: document.getElementById("plan-highlight"),
  totalTimeEl: document.getElementById("total-time"),
  totalDistanceEl: document.getElementById("total-distance"),
  averagePaceEl: document.getElementById("average-pace"),
  intensityListEl: document.getElementById("intensity-list"),
  equipmentListEl: document.getElementById("equipment-list"),
  blockListEl: document.getElementById("block-list"),
  trendPanel: document.getElementById("trend-panel"),
  trendStatusEl: document.getElementById("trend-status"),
  trendVolumeList: document.getElementById("trend-volume-list"),
  trendIntensityList: document.getElementById("trend-intensity-list"),
  trendPaceList: document.getElementById("trend-pace-list"),
  trendExportButton: document.getElementById("trend-export"),
  helpButton: document.getElementById("help-button"),
  helpOverlay: document.getElementById("help-overlay"),
  helpCloseButton: document.getElementById("help-close"),
  ioMenuButton: document.getElementById("plan-io-toggle"),
  ioMenuPanel: document.getElementById("plan-io-menu"),
  importMarkdownButton: document.getElementById("import-markdown-button"),
  importMarkdownInput: document.getElementById("import-markdown-input"),
  importJsonButton: document.getElementById("import-json-button"),
  importJsonInput: document.getElementById("import-json-input"),
  planImportOverlay: document.getElementById("plan-import-overlay"),
  planImportList: document.getElementById("plan-import-list"),
  planImportDescription: document.getElementById("plan-import-description"),
  planImportCloseButton: document.getElementById("plan-import-close"),
  planImportCancelButton: document.getElementById("plan-import-cancel"),
  planImportMergeButton: document.getElementById("plan-import-merge"),
  exportMarkdownButton: document.getElementById("export-markdown"),
  exportWordButton: document.getElementById("export-word"),
  exportJsonButton: document.getElementById("export-json"),
  savePlanButton: document.getElementById("save-plan-button"),
  layout: document.querySelector(".layout"),
  quickPanel: document.querySelector(".quick-panel"),
  quickSnippetToggle: document.getElementById("quick-snippet-toggle"),
  quickSnippetContainer: document.getElementById("quick-snippet-container"),
  quickPanelExpand: document.getElementById("quick-panel-expand"),
  validationPanel: document.getElementById("validation-panel"),
};

const initialPlanDraft = loadPlanDraft();
if (typeof initialPlanDraft === "string" && dom.planInput) {
  dom.planInput.value = initialPlanDraft;
}

ensurePlanSkeleton(dom.planInput);

const featureSettings = getFeatureSettings();
applyFeatureVisibility(document, featureSettings);
subscribeToFeatureSettings(() => {
  window.location.reload();
});

const quickSnippetsEnabled = featureSettings.quickSnippets !== false;
const plannerToolsEnabled = featureSettings.plannerTools !== false;
const syntaxValidationEnabled = featureSettings.syntaxValidation !== false;

const planHighlighter = initPlanHighlighter({
  textarea: dom.planInput,
  highlightLayer: dom.planHighlight,
});

dom.planEditor?.classList.add("plan-editor--enhanced");

const validationPanel = syntaxValidationEnabled
  ? initValidationPanel({
      container: dom.validationPanel,
      textarea: dom.planInput,
      highlighter: planHighlighter,
    })
  : { update() {} };

const templateCapture = plannerToolsEnabled
  ? initTemplateCapture({
      blockList: dom.blockListEl,
    })
  : { update() {} };

const planSaveDialog = plannerToolsEnabled
  ? initPlanSaveDialog({
      planInput: dom.planInput,
      saveButton: dom.savePlanButton,
    })
  : { update() {} };

initTrendReports({
  container: dom.trendPanel,
  statusElement: dom.trendStatusEl,
  weeklyList: dom.trendVolumeList,
  intensityList: dom.trendIntensityList,
  paceList: dom.trendPaceList,
  exportButton: dom.trendExportButton,
});

/**
 * Liest den aktuellen Text aus dem Eingabefeld, parst ihn und aktualisiert die Anzeige.
 */
function updateSummary() {
  const planText = dom.planInput?.value ?? "";
  if (dom.planInput) {
    savePlanDraft(planText);
  }
  const plan = parsePlan(planText);
  renderSummary(plan, dom);
  validationPanel.update(plan.issues ?? []);
  templateCapture.update(plan);
  planSaveDialog.update(plan);
}

// Automatische Aktualisierung bei jeder Nutzereingabe sowie Initialisierung beim Laden der Seite.
dom.planInput?.addEventListener("input", updateSummary);
updateSummary();

bootstrapHighlightVocabulary({
  onVocabularyLoaded: () => {
    updateSummary();
    planHighlighter.refresh();
  },
});

// Initialisiere das Hinweis-Overlay inklusive Fokusmanagement.
initHelpOverlay({
  button: dom.helpButton,
  overlay: dom.helpOverlay,
  closeButton: dom.helpCloseButton,
});

// Import- und Export-Steuerung aktivieren, damit Pläne gesichert oder geladen werden können.
if (plannerToolsEnabled) {
  initIOControls({
    planInput: dom.planInput,
    menuButton: dom.ioMenuButton,
    menuPanel: dom.ioMenuPanel,
    importMarkdownButton: dom.importMarkdownButton,
    importMarkdownInput: dom.importMarkdownInput,
    importJsonButton: dom.importJsonButton,
    importJsonInput: dom.importJsonInput,
    importSelectionOverlay: dom.planImportOverlay,
    importSelectionList: dom.planImportList,
    importSelectionDescription: dom.planImportDescription,
    importSelectionCloseButton: dom.planImportCloseButton,
    importSelectionCancelButton: dom.planImportCancelButton,
    importSelectionMergeButton: dom.planImportMergeButton,
    exportMarkdownButton: dom.exportMarkdownButton,
    exportWordButton: dom.exportWordButton,
    exportJsonButton: dom.exportJsonButton,
  });
}

// Schnellbausteine für häufig genutzte Elemente bereitstellen.
if (quickSnippetsEnabled) {
  initQuickSnippets({
    container: dom.quickSnippetContainer,
    textarea: dom.planInput,
    teamLibraryEnabled: featureSettings.teamLibrary !== false,
  });
}

if (quickSnippetsEnabled && dom.layout && dom.quickPanel && dom.quickSnippetContainer && dom.quickSnippetToggle && dom.quickPanelExpand) {
  const collapseQuickPanel = () => {
    if (dom.quickPanel.hasAttribute("hidden")) {
      return;
    }

    dom.quickSnippetContainer.hidden = true;
    dom.quickSnippetToggle.setAttribute("aria-expanded", "false");
    dom.quickSnippetToggle.textContent = "Leiste ausblenden";
    dom.layout.classList.add("layout--snippets-hidden");
    dom.quickPanel.setAttribute("hidden", "");
    dom.quickPanelExpand.hidden = false;
    dom.quickPanelExpand.setAttribute("aria-expanded", "false");
    dom.quickPanelExpand.focus();
  };

  const expandQuickPanel = () => {
    dom.quickPanel.removeAttribute("hidden");
    dom.quickSnippetContainer.hidden = false;
    dom.quickSnippetToggle.setAttribute("aria-expanded", "true");
    dom.quickSnippetToggle.textContent = "Leiste ausblenden";
    dom.layout.classList.remove("layout--snippets-hidden");
    dom.quickPanelExpand.hidden = true;
    dom.quickPanelExpand.setAttribute("aria-expanded", "true");
    dom.quickSnippetToggle.focus();
  };

  dom.quickSnippetToggle.addEventListener("click", collapseQuickPanel);
  dom.quickPanelExpand.addEventListener("click", expandQuickPanel);
} else if (!quickSnippetsEnabled) {
  if (dom.layout) {
    dom.layout.classList.add("layout--snippets-hidden");
  }
  if (dom.quickPanelExpand) {
    dom.quickPanelExpand.hidden = true;
  }
}

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
