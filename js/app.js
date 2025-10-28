import { parsePlan } from "./parser/planParser.js";
import { renderSummary } from "./ui/summaryRenderer.js";
import { initHelpOverlay } from "./ui/helpOverlay.js";
import { initIOControls } from "./ui/ioControls.js";
import { initQuickSnippets } from "./ui/quickSnippets.js";

/**
 * Zentrale DOM-Referenzen, die zwischen Parser und UI ausgetauscht werden.
 */
const dom = {
  planInput: document.getElementById("plan-input"),
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
  quickSnippetContainer: document.getElementById("quick-snippet-container"),
};

/**
 * Liest den aktuellen Text aus dem Eingabefeld, parst ihn und aktualisiert die Anzeige.
 */
function updateSummary() {
  const plan = parsePlan(dom.planInput?.value ?? "");
  renderSummary(plan, dom);
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
