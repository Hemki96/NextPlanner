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
  cycleContext: document.getElementById("cycle-context"),
  cycleContextCycle: document.getElementById("cycle-context-cycle"),
  cycleContextWeek: document.getElementById("cycle-context-week"),
  cycleContextDay: document.getElementById("cycle-context-day"),
  cycleContextFocus: document.getElementById("cycle-context-focus"),
  cycleContextLink: document.getElementById("cycle-context-open-weekly"),
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

const contextDateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const contextWeekdayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "long" });

const cycleTypeLabels = {
  volume: "Volumenphase",
  intensity: "Intensitätsphase",
  deload: "Deload",
  custom: null,
};

let currentCycleContext = null;

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
  : { update() {}, setLinkedCycle() {} };

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
    const context = extractContextFromMetadata(plan.metadata);
    applyCycleContext(context);
    if (typeof planSaveDialog.setLinkedCycle === "function") {
      if (context) {
        planSaveDialog.setLinkedCycle({
          cycleId: context.cycleId,
          weekId: context.weekId,
          dayId: context.dayId,
        });
      } else {
        planSaveDialog.setLinkedCycle(null);
      }
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
    applyCycleContext(null);
    if (typeof planSaveDialog.setLinkedCycle === "function") {
      planSaveDialog.setLinkedCycle(null);
    }
  }
}

loadPlanFromQuery().catch((error) => {
  console.error("Unerwarteter Fehler beim Laden eines Plans aus der URL", error);
  document.title = originalTitle;
  applyCycleContext(null);
  if (typeof planSaveDialog.setLinkedCycle === "function") {
    planSaveDialog.setLinkedCycle(null);
  }
});

async function loadCycleContextFromQuery() {
  if (currentCycleContext || typeof window === "undefined" || !canUseApi()) {
    return;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const rawDayId = params.get("dayId");
    const rawCycleId = params.get("cycleId");
    if (!rawDayId || !rawCycleId) {
      return;
    }
    const dayId = Number.parseInt(rawDayId, 10);
    const cycleId = Number.parseInt(rawCycleId, 10);
    if (!Number.isInteger(dayId) || dayId <= 0 || !Number.isInteger(cycleId) || cycleId <= 0) {
      return;
    }
    const { data: day } = await apiRequest(`/api/days/${dayId}`);
    const { data: week } = await apiRequest(`/api/weeks/${day.weekId}`);
    const { data: cycle } = await apiRequest(`/api/cycles/${week.cycleId}`);
    const matchedWeek = cycle.weeks?.find((entry) => entry.id === week.id) ?? week;
    const matchedDay = matchedWeek.days?.find((entry) => entry.id === day.id) ?? day;
    const context = {
      cycleId: cycle.id,
      cycleName: cycle.name,
      weekId: matchedWeek.id,
      weekNumber: matchedWeek.weekNumber,
      weekFocusLabel: matchedWeek.focusLabel ?? null,
      dayId: matchedDay.id,
      date: matchedDay.date ?? day.date ?? null,
      mainSetFocus: matchedDay.mainSetFocus ?? null,
      skillFocus1: matchedDay.skillFocus1 ?? null,
      skillFocus2: matchedDay.skillFocus2 ?? null,
    };
    applyCycleContext(context);
    if (typeof planSaveDialog.setLinkedCycle === "function") {
      planSaveDialog.setLinkedCycle({
        cycleId: context.cycleId,
        weekId: context.weekId,
        dayId: context.dayId,
      });
    }
  } catch (error) {
    console.warn("Konnte Zykluskontext aus URL nicht laden", error);
  }
}

loadCycleContextFromQuery().catch((error) => {
  console.warn("Fehler beim Laden des Zykluskontexts aus der URL", error);
});

document.addEventListener("nextplanner:plan-saved", (event) => {
  const savedPlan = event?.detail?.plan;
  if (!savedPlan) {
    return;
  }
  const context = extractContextFromMetadata(savedPlan.metadata);
  applyCycleContext(context);
  if (typeof planSaveDialog.setLinkedCycle === "function") {
    if (context) {
      planSaveDialog.setLinkedCycle({
        cycleId: context.cycleId,
        weekId: context.weekId,
        dayId: context.dayId,
      });
    } else {
      planSaveDialog.setLinkedCycle(null);
    }
  }
});

function extractContextFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  return normalizeCycleContext(metadata.weeklyCycle ?? null);
}

function applyCycleContext(context) {
  const normalized = normalizeCycleContext(context);
  if (contextsEqual(currentCycleContext, normalized)) {
    return;
  }
  currentCycleContext = normalized;
  if (!dom.cycleContext) {
    return;
  }
  if (!normalized) {
    dom.cycleContext.setAttribute("hidden", "");
    if (dom.cycleContextCycle) {
      dom.cycleContextCycle.textContent = "–";
    }
    if (dom.cycleContextWeek) {
      dom.cycleContextWeek.textContent = "–";
    }
    if (dom.cycleContextDay) {
      dom.cycleContextDay.textContent = "–";
    }
    if (dom.cycleContextFocus) {
      dom.cycleContextFocus.textContent = "–";
    }
    if (dom.cycleContextLink) {
      dom.cycleContextLink.href = "/weekly.html";
    }
    return;
  }

  dom.cycleContext.removeAttribute("hidden");
  if (dom.cycleContextCycle) {
    dom.cycleContextCycle.textContent = normalized.cycleName ?? `Zyklus ${normalized.cycleId}`;
  }
  if (dom.cycleContextWeek) {
    dom.cycleContextWeek.textContent = buildCycleContextWeekLabel(normalized);
  }
  if (dom.cycleContextDay) {
    dom.cycleContextDay.textContent = buildCycleContextDayLabel(normalized);
  }
  if (dom.cycleContextFocus) {
    dom.cycleContextFocus.textContent = buildCycleFocusLabel(normalized);
  }
  if (dom.cycleContextLink) {
    dom.cycleContextLink.href = buildWeeklyPlannerLink(normalized);
  }
}

function buildCycleContextWeekLabel(context) {
  const parts = [];
  if (context.weekNumber) {
    parts.push(`Woche ${context.weekNumber}`);
  }
  if (context.weekFocusLabel) {
    parts.push(context.weekFocusLabel);
  }
  return parts.length > 0 ? parts.join(" • ") : "–";
}

function buildCycleContextDayLabel(context) {
  const parts = [];
  if (context.date) {
    const parsed = new Date(context.date);
    if (!Number.isNaN(parsed.getTime())) {
      const weekday = contextWeekdayFormatter.format(parsed);
      const formatted = contextDateFormatter.format(parsed);
      parts.push(`${weekday} ${formatted}`);
    }
  }
  parts.push(`Tag ${context.dayId}`);
  return parts.join(" • ");
}

function buildCycleFocusLabel(context) {
  const focusParts = [];
  for (const value of [context.mainSetFocus, context.skillFocus1, context.skillFocus2]) {
    if (value && !focusParts.includes(value)) {
      focusParts.push(value);
    }
  }
  if (context.weekFocusLabel && !focusParts.includes(context.weekFocusLabel)) {
    focusParts.push(context.weekFocusLabel);
  }
  if (focusParts.length === 0) {
    const typeLabel = context.cycleType ? cycleTypeLabels[context.cycleType] ?? null : null;
    if (typeLabel) {
      focusParts.push(typeLabel);
    } else if (context.cycleName) {
      focusParts.push(context.cycleName);
    }
  }
  return focusParts.length > 0 ? focusParts.join(" • ") : "–";
}

function buildWeeklyPlannerLink(context) {
  const params = new URLSearchParams();
  params.set("cycleId", String(context.cycleId));
  if (context.weekId) {
    params.set("weekId", String(context.weekId));
  }
  params.set("dayId", String(context.dayId));
  return `/weekly.html?${params.toString()}`;
}

function normalizeCycleContext(rawContext) {
  if (!rawContext || typeof rawContext !== "object") {
    return null;
  }
  const toPositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const cycleId = toPositiveInt(rawContext.cycleId);
  const dayId = toPositiveInt(rawContext.dayId);
  if (!cycleId || !dayId) {
    return null;
  }
  const stringOrNull = (value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };
  const numberOrNull = (value) => {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };
  return {
    cycleId,
    cycleName: stringOrNull(rawContext.cycleName),
    cycleType: stringOrNull(rawContext.cycleType),
    weekId: toPositiveInt(rawContext.weekId),
    weekNumber: numberOrNull(rawContext.weekNumber),
    weekFocusLabel: stringOrNull(rawContext.weekFocusLabel),
    dayId,
    date: stringOrNull(rawContext.date),
    mainSetFocus: stringOrNull(rawContext.mainSetFocus),
    skillFocus1: stringOrNull(rawContext.skillFocus1),
    skillFocus2: stringOrNull(rawContext.skillFocus2),
  };
}

function contextsEqual(a, b) {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.cycleId === b.cycleId &&
    a.weekId === b.weekId &&
    a.weekNumber === b.weekNumber &&
    a.dayId === b.dayId &&
    a.date === b.date &&
    a.cycleName === b.cycleName &&
    a.cycleType === b.cycleType &&
    a.weekFocusLabel === b.weekFocusLabel &&
    a.mainSetFocus === b.mainSetFocus &&
    a.skillFocus1 === b.skillFocus1 &&
    a.skillFocus2 === b.skillFocus2
  );
}
