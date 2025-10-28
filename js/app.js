import { parsePlan } from "./parser/planParser.js";
import { renderSummary } from "./ui/summaryRenderer.js";
import { initHelpOverlay } from "./ui/helpOverlay.js";
import { initIOControls } from "./ui/ioControls.js";
import { initQuickSnippets } from "./ui/quickSnippets.js";
import { initPlanHighlighter } from "./ui/planHighlighter.js";
import { initTemplateCapture } from "./ui/templateCapture.js";
import { initPlanSaveDialog } from "./ui/planSaveDialog.js";

const originalTitle = document.title;

/**
 * Zentrale DOM-Referenzen, die zwischen Parser und UI ausgetauscht werden.
 */
const dom = {
  planInput: document.getElementById("plan-input"),
  planHighlight: document.getElementById("plan-highlight"),
  totalTimeEl: document.getElementById("total-time"),
  totalDistanceEl: document.getElementById("total-distance"),
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
};

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
  templateCapture.update(plan);
  planSaveDialog.update(plan);
}

// Automatische Aktualisierung bei jeder Nutzereingabe sowie Initialisierung beim Laden der Seite.
dom.planInput?.addEventListener("input", updateSummary);
updateSummary();

const planHighlighter = initPlanHighlighter({
  textarea: dom.planInput,
  highlightLayer: dom.planHighlight,
});

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
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const planId = params.get("planId");
  if (!planId) {
    return;
  }

  try {
    const response = await fetch(`/api/plans/${encodeURIComponent(planId)}`);
    if (!response.ok) {
      console.warn(`Plan ${planId} konnte nicht geladen werden (Status ${response.status}).`);
      return;
    }
    const plan = await response.json();
    if (!plan?.content) {
      console.warn(`Plan ${planId} enthielt keinen Inhalt.`);
      return;
    }
    planHighlighter.setText(plan.content);
    updateSummary();
    if (plan.title) {
      document.title = `${plan.title} – Swim Planner`;
    }
    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (error) {
    console.error(`Plan ${planId} konnte nicht geladen werden`, error);
    document.title = originalTitle;
  }
}

loadPlanFromQuery().catch((error) => {
  console.error("Unerwarteter Fehler beim Laden eines Plans aus der URL", error);
  document.title = originalTitle;
});
