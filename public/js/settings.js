import {
  defaultQuickSnippetGroups,
  getQuickSnippets,
  resetQuickSnippets,
  saveQuickSnippets,
  sanitizeQuickSnippetGroups,
} from "./utils/snippet-storage.js";
import { describeApiError } from "./utils/api-client.js";
import {
  fetchPersistedQuickSnippets,
  persistQuickSnippets,
  quickSnippetPersistenceSupported,
} from "./utils/quick-snippet-client.js";
import { fetchTeamLibrary, pushTeamLibrary, teamLibrarySupported } from "./utils/snippet-library-client.js";
import { initFeatureToggleSection } from "./ui/feature-toggle-section.js";
import { getFeatureSettings } from "./utils/feature-settings.js";
import { getCurrentTheme, setThemePreference, subscribeToTheme } from "./theme.js";
import {
  HIGHLIGHT_OPTION_DEFINITIONS,
  getHighlightSettings,
  resetHighlightSettings,
  setHighlightEnabled,
  subscribeToHighlightSettings,
} from "./utils/highlight-settings.js";
import {
  getHighlightVocabulary,
  resetHighlightVocabulary,
  setHighlightVocabulary,
} from "./utils/highlight-vocabulary.js";
import {
  highlightConfigPersistenceSupported,
  fetchHighlightVocabularyConfig,
  persistHighlightVocabularyConfig,
} from "./utils/highlight-config-client.js";
import { initSectionCollapsibles } from "./ui/section-collapsible.js";

const groupContainer = document.getElementById("snippet-groups");
const addGroupButton = document.getElementById("add-group");
const expandAllButton = document.getElementById("expand-groups");
const collapseAllButton = document.getElementById("collapse-groups");
const resetButton = document.getElementById("reset-groups");
const saveButton = document.getElementById("save-groups");
const exportButton = document.getElementById("export-groups");
const importButton = document.getElementById("import-groups");
const importInput = document.getElementById("import-groups-file");
const statusElement = document.getElementById("settings-status");
const teamRefreshButton = document.getElementById("team-library-refresh");
const teamPushButton = document.getElementById("team-library-push");
const teamStatusElement = document.getElementById("team-library-status");
const teamUpdatedElement = document.getElementById("team-library-updated");
const highlightList = document.getElementById("highlight-settings-list");
const highlightStatusElement = document.getElementById("highlight-settings-status");
const highlightResetButton = document.getElementById("highlight-settings-reset");
const highlightIntensityInput = document.getElementById("highlight-intensity-input");
const highlightEquipmentInput = document.getElementById("highlight-equipment-input");
const highlightConfigSaveButton = document.getElementById("highlight-config-save");
const featureList = document.getElementById("feature-settings-list");
const featureStatusElement = document.getElementById("feature-settings-status");
const featureResetButton = document.getElementById("feature-settings-reset");
const themeToggle = document.getElementById("theme-toggle");
const themeStatusElement = document.getElementById("theme-settings-status");

let highlightStatusTimeout = null;
const highlightConfigServerSupported = highlightConfigPersistenceSupported();
let highlightConfigRequest = null;
let highlightConfigDirty = false;

let teamLibraryEnabled = getFeatureSettings().teamLibrary !== false;
const snippetStatusId = statusElement?.id;
const highlightStatusId = highlightStatusElement?.id;

initSectionCollapsibles();

function setThemeStatusMessage(message) {
  if (!themeStatusElement) {
    return;
  }
  themeStatusElement.textContent = message;
  if (message) {
    themeStatusElement.dataset.statusType = "info";
    window.setTimeout(() => {
      if (themeStatusElement.textContent === message) {
        themeStatusElement.textContent = "";
        delete themeStatusElement.dataset.statusType;
      }
    }, 3500);
  } else {
    delete themeStatusElement.dataset.statusType;
  }
}

initFeatureToggleSection({
  listElement: featureList,
  statusElement: featureStatusElement,
  resetButton: featureResetButton,
  root: document,
  onSettingsChange(settings) {
    teamLibraryEnabled = settings.teamLibrary !== false;
  },
});

if (themeToggle) {
  const syncToggle = (theme) => {
    const shouldBeChecked = theme === "dark";
    if (themeToggle.checked !== shouldBeChecked) {
      themeToggle.checked = shouldBeChecked;
    }
  };

  syncToggle(getCurrentTheme());

  themeToggle.addEventListener("change", () => {
    const newTheme = themeToggle.checked ? "dark" : "light";
    setThemePreference(newTheme);
    setThemeStatusMessage(
      themeToggle.checked ? "Dunkler Modus aktiviert." : "Dunkler Modus deaktiviert."
    );
  });

  subscribeToTheme((theme) => {
    syncToggle(theme);
  });
}

function createGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function coerceSortOrder(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function cloneGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups.map((group, index) => ({
    id: typeof group.id === "string" ? group.id : createGroupId(),
    title: typeof group.title === "string" ? group.title : "",
    description: typeof group.description === "string" ? group.description : "",
    sortOrder: coerceSortOrder(group?.sortOrder, index),
    items: Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : [],
  }));
}

function getGroupSortValue(group, fallback) {
  if (!group) {
    return fallback;
  }
  return coerceSortOrder(group.sortOrder, fallback);
}

function reindexGroupSortOrders() {
  snippetGroups.forEach((group, index) => {
    if (group) {
      group.sortOrder = index;
    }
  });
}

function sortGroupsBySortOrder() {
  if (!Array.isArray(snippetGroups) || snippetGroups.length === 0) {
    snippetGroups = Array.isArray(snippetGroups) ? snippetGroups : [];
    return;
  }

  const decorated = snippetGroups.map((group, index) => ({
    group,
    order: getGroupSortValue(group, index),
    index,
  }));

  decorated.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.index - b.index;
  });

  snippetGroups = decorated.map(({ group }) => group);
  reindexGroupSortOrders();
}

function findGroupIndexById(groupId) {
  if (typeof groupId !== "string") {
    return -1;
  }
  return snippetGroups.findIndex((group) => group && group.id === groupId);
}

let snippetGroups = cloneGroups(getQuickSnippets());
sortGroupsBySortOrder();
const collapsedGroups = new Set();
let pendingFocus = null;
let pendingSnippetSave = null;
const quickSnippetServerEnabled = quickSnippetPersistenceSupported();
let lastServerSyncedSnapshot = JSON.stringify(
  sanitizeQuickSnippetGroups(snippetGroups, { allowEmpty: true })
);
let serverSaveTimeout = null;
let inFlightServerSave = null;
let lastServerErrorMessage = null;
let lastServerErrorTimestamp = 0;
let serverSaveQueued = false;

function flushPendingSnippetSave() {
  if (typeof window === "undefined") {
    return;
  }

  if (pendingSnippetSave) {
    window.clearTimeout(pendingSnippetSave);
    pendingSnippetSave = null;
  }

  saveQuickSnippets(snippetGroups);
  scheduleServerSave({ immediate: true });
}

function scheduleSnippetSave({ immediate = false } = {}) {
  if (typeof window === "undefined") {
    return;
  }

  if (pendingSnippetSave) {
    window.clearTimeout(pendingSnippetSave);
    pendingSnippetSave = null;
  }

  if (immediate) {
    flushPendingSnippetSave();
    return;
  }

  pendingSnippetSave = window.setTimeout(() => {
    pendingSnippetSave = null;
    saveQuickSnippets(snippetGroups);
    scheduleServerSave();
  }, 200);
}

function reportServerSaveError(error) {
  const message = describeApiError(error);
  const statusType = error?.offline ? "warning" : "error";
  const now = Date.now();
  if (message && message === lastServerErrorMessage && now - lastServerErrorTimestamp < 4000) {
    return;
  }
  lastServerErrorMessage = message;
  lastServerErrorTimestamp = now;
  const detail = message || "Unbekannter Fehler";
  showStatus(`Schnellbausteine konnten nicht auf dem Server gespeichert werden: ${detail}`, statusType);
}

function performServerSave(sanitizedGroups, serializedGroups) {
  if (!quickSnippetServerEnabled) {
    return Promise.resolve();
  }
  const sanitized =
    sanitizedGroups ?? sanitizeQuickSnippetGroups(snippetGroups, { allowEmpty: true });
  const serialized = serializedGroups ?? JSON.stringify(sanitized);
  if (serialized === lastServerSyncedSnapshot) {
    return Promise.resolve();
  }

  return persistQuickSnippets(sanitized)
    .then(({ groups }) => {
      const sanitizedResponse = sanitizeQuickSnippetGroups(groups, { allowEmpty: true });
      const serializedResponse = JSON.stringify(sanitizedResponse);
      lastServerSyncedSnapshot = serializedResponse;
      lastServerErrorMessage = null;
      lastServerErrorTimestamp = 0;
      if (serializedResponse !== serialized) {
        snippetGroups = cloneGroups(sanitizedResponse);
        sortGroupsBySortOrder();
        renderGroups();
        saveQuickSnippets(sanitizedResponse);
      }
    })
    .catch((error) => {
      reportServerSaveError(error);
      throw error;
    });
}

function flushPendingServerSave() {
  if (!quickSnippetServerEnabled || typeof window === "undefined") {
    return;
  }
  if (serverSaveTimeout) {
    window.clearTimeout(serverSaveTimeout);
    serverSaveTimeout = null;
  }
  const sanitized = sanitizeQuickSnippetGroups(snippetGroups, { allowEmpty: true });
  const serialized = JSON.stringify(sanitized);
  if (serialized === lastServerSyncedSnapshot) {
    serverSaveQueued = false;
    return;
  }
  if (inFlightServerSave) {
    serverSaveQueued = true;
    return;
  }
  inFlightServerSave = performServerSave(sanitized, serialized)
    .catch(() => {})
    .finally(() => {
      inFlightServerSave = null;
      if (serverSaveQueued) {
        serverSaveQueued = false;
        scheduleServerSave({ immediate: true });
      }
    });
}

function scheduleServerSave({ immediate = false } = {}) {
  if (!quickSnippetServerEnabled || typeof window === "undefined") {
    return;
  }
  if (serverSaveTimeout) {
    window.clearTimeout(serverSaveTimeout);
    serverSaveTimeout = null;
  }
  if (immediate) {
    flushPendingServerSave();
    return;
  }
  serverSaveTimeout = window.setTimeout(() => {
    serverSaveTimeout = null;
    flushPendingServerSave();
  }, 300);
}

async function bootstrapQuickSnippetsFromServer() {
  if (!quickSnippetServerEnabled) {
    return;
  }
  try {
    const { groups } = await fetchPersistedQuickSnippets();
    const sanitized = sanitizeQuickSnippetGroups(groups, { allowEmpty: true });
    const serializedServer = JSON.stringify(sanitized);
    lastServerSyncedSnapshot = serializedServer;
    const serializedLocal = JSON.stringify(
      sanitizeQuickSnippetGroups(snippetGroups, { allowEmpty: true })
    );
    if (serializedServer === serializedLocal) {
      return;
    }
    snippetGroups = cloneGroups(sanitized);
    sortGroupsBySortOrder();
    collapsedGroups.clear();
    renderGroups();
    saveQuickSnippets(sanitized);
  } catch (error) {
    const message = describeApiError(error);
    const statusType = error?.offline ? "warning" : "error";
    showStatus(`Schnellbausteine konnten nicht vom Server geladen werden: ${message}`, statusType);
  }
}

function formatUpdatedAt(value) {
  if (!value) {
    return "–";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "–";
  }
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function createEmptyItem() {
  return {
    label: "Neuer Baustein",
    snippet: "",
    ensureLineBreakBefore: false,
    appendNewline: false,
    ensureBlankLineAfter: false,
    cursorOffset: 0,
  };
}

function createEmptyGroup() {
  const nextSortOrder = Array.isArray(snippetGroups) ? snippetGroups.length : 0;
  return {
    id: createGroupId(),
    title: "Neue Kategorie",
    description: "",
    sortOrder: nextSortOrder,
    items: [createEmptyItem()],
  };
}

function formatItemCount(count) {
  if (count === 1) {
    return "1 Baustein";
  }
  return `${count} Bausteine`;
}

function autoResizeTextArea(textarea) {
  window.requestAnimationFrame(() => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });
}

function scheduleFocus(focusRequest) {
  pendingFocus = focusRequest;
  if (focusRequest && typeof focusRequest.groupId === "string") {
    collapsedGroups.delete(focusRequest.groupId);
  }
}

function showStatus(message, type = "info") {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.dataset.statusType = type;
  if (message) {
    window.setTimeout(() => {
      if (statusElement.textContent === message) {
        statusElement.textContent = "";
        delete statusElement.dataset.statusType;
      }
    }, 4000);
  }
}

function setTeamStatus(message, type = "info") {
  if (!teamStatusElement) {
    return;
  }
  teamStatusElement.textContent = message;
  if (message) {
    teamStatusElement.dataset.statusType = type;
  } else {
    delete teamStatusElement.dataset.statusType;
  }
}

function setHighlightStatus(message, type = "info") {
  if (!highlightStatusElement) {
    return;
  }
  highlightStatusElement.textContent = message;
  if (message) {
    highlightStatusElement.dataset.statusType = type;
  } else {
    delete highlightStatusElement.dataset.statusType;
  }
  if (highlightStatusTimeout) {
    window.clearTimeout(highlightStatusTimeout);
  }
  if (message) {
    highlightStatusTimeout = window.setTimeout(() => {
      if (highlightStatusElement.textContent === message) {
        setHighlightStatus("", "info");
      }
    }, 3500);
  }
}

function updateTeamMetadata(updatedAt) {
  if (!teamUpdatedElement) {
    return;
  }
  teamUpdatedElement.textContent = formatUpdatedAt(updatedAt);
}

async function loadTeamLibraryFromServer() {
  if (!teamLibraryEnabled) {
    setTeamStatus("Team-Bibliothek ist deaktiviert.", "info");
    return;
  }
  if (!teamLibrarySupported()) {
    setTeamStatus("Team-Bibliothek benötigt den lokalen NextPlanner-Server (npm start).", "warning");
    return;
  }
  if (teamRefreshButton) {
    teamRefreshButton.disabled = true;
  }
  if (teamPushButton) {
    teamPushButton.disabled = true;
  }
  setTeamStatus("Team-Bibliothek wird geladen...", "info");
  try {
    const { groups, updatedAt } = await fetchTeamLibrary();
    snippetGroups = cloneGroups(groups);
    sortGroupsBySortOrder();
    renderGroups();
    scheduleSnippetSave({ immediate: true });
    updateTeamMetadata(updatedAt);
    setTeamStatus("Team-Bibliothek übernommen.", "success");
  } catch (error) {
    const message = describeApiError(error);
    const statusType = error?.offline ? "warning" : "error";
    setTeamStatus(`Team-Bibliothek konnte nicht geladen werden: ${message}`, statusType);
  } finally {
    if (teamRefreshButton) {
      teamRefreshButton.disabled = false;
    }
    if (teamPushButton) {
      teamPushButton.disabled = false;
    }
  }
}

async function pushTeamLibraryToServer() {
  if (!teamLibraryEnabled) {
    setTeamStatus("Team-Bibliothek ist deaktiviert.", "info");
    return;
  }
  if (!teamLibrarySupported()) {
    setTeamStatus("Team-Bibliothek benötigt den lokalen NextPlanner-Server (npm start).", "warning");
    return;
  }
  if (teamRefreshButton) {
    teamRefreshButton.disabled = true;
  }
  if (teamPushButton) {
    teamPushButton.disabled = true;
  }
  setTeamStatus("Eigene Bausteine werden freigegeben...", "info");
  try {
    const { updatedAt } = await pushTeamLibrary(snippetGroups);
    updateTeamMetadata(updatedAt);
    setTeamStatus("Team-Bibliothek aktualisiert.", "success");
  } catch (error) {
    const message = describeApiError(error);
    const statusType = error?.offline ? "warning" : "error";
    setTeamStatus(`Freigabe fehlgeschlagen: ${message}`, statusType);
  } finally {
    if (teamRefreshButton) {
      teamRefreshButton.disabled = false;
    }
    if (teamPushButton) {
      teamPushButton.disabled = false;
    }
  }
}

function createHighlightOption(option, enabled) {
  const item = document.createElement("li");
  item.className = "feature-toggle";
  item.dataset.highlightKey = option.key;

  const info = document.createElement("div");
  info.className = "feature-toggle-info";

  const title = document.createElement("h3");
  title.className = "feature-toggle-title";
  const titleId = `highlight-option-${option.key}-title`;
  title.id = titleId;
  title.textContent = option.label;
  info.appendChild(title);

  const description = document.createElement("p");
  description.className = "feature-toggle-description";
  const descriptionId = `highlight-option-${option.key}-description`;
  description.id = descriptionId;
  description.textContent = option.description;
  info.appendChild(description);

  const control = document.createElement("div");
  control.className = "feature-toggle-control";

  const label = document.createElement("label");
  label.className = "feature-toggle-switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "feature-toggle-input";
  input.checked = enabled;
  input.dataset.highlightKey = option.key;
  input.setAttribute("aria-labelledby", titleId);
  const describedBy = [descriptionId, highlightStatusId].filter(Boolean).join(" ");
  input.setAttribute("aria-describedby", describedBy);

  const slider = document.createElement("span");
  slider.className = "feature-toggle-slider";
  slider.setAttribute("aria-hidden", "true");

  const state = document.createElement("span");
  state.className = "feature-toggle-state";
  state.textContent = enabled ? "Aktiv" : "Inaktiv";

  label.append(input, slider, state);
  control.append(label);

  item.append(info, control);
  return item;
}

function renderHighlightOptions(settings = getHighlightSettings()) {
  if (!highlightList) {
    return;
  }
  highlightList.innerHTML = "";
  HIGHLIGHT_OPTION_DEFINITIONS.forEach((option) => {
    const enabled = settings?.[option.key]?.enabled !== false;
    const element = createHighlightOption(option, enabled);
    highlightList.appendChild(element);
  });
}

function updateHighlightStateLabel(checkbox) {
  const label = checkbox?.closest("label");
  if (!label) {
    return;
  }
  const state = label.querySelector(".feature-toggle-state");
  if (state) {
    state.textContent = checkbox.checked ? "Aktiv" : "Inaktiv";
  }
}

function handleHighlightChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }
  const key = target.dataset.highlightKey;
  if (!key) {
    return;
  }
  setHighlightEnabled(key, target.checked);
  updateHighlightStateLabel(target);
  setHighlightStatus(
    target.checked
      ? `${HIGHLIGHT_OPTION_DEFINITIONS.find((option) => option.key === key)?.label ?? "Markierung"} aktiviert.`
      : `${HIGHLIGHT_OPTION_DEFINITIONS.find((option) => option.key === key)?.label ?? "Markierung"} deaktiviert.`,
    "success",
  );
}

function handleHighlightReset() {
  const defaults = resetHighlightSettings();
  const vocabularyDefaults = resetHighlightVocabulary();
  renderHighlightOptions(defaults);
  updateHighlightInputsFromVocabulary(vocabularyDefaults);
  highlightConfigDirty = false;
  setHighlightStatus("Alle Markierungen wurden zurückgesetzt.", "info");
  if (!highlightConfigServerSupported || highlightConfigRequest) {
    return;
  }
  highlightConfigRequest = persistHighlightVocabularyConfig(vocabularyDefaults)
    .then(({ vocabulary }) => {
      const synced = setHighlightVocabulary(vocabulary);
      updateHighlightInputsFromVocabulary(synced);
    })
    .catch((error) => {
      const message = describeApiError(error);
      const statusType = error?.offline ? "warning" : "error";
      setHighlightStatus(`Standardeinstellungen konnten nicht gespeichert werden: ${message}`,
        statusType,
      );
    })
    .finally(() => {
      highlightConfigRequest = null;
    });
}

function parseHighlightList(value) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateHighlightInputsFromVocabulary(vocabulary) {
  if (highlightIntensityInput) {
    highlightIntensityInput.value = (vocabulary?.intensities ?? []).join("\n");
    autoResizeTextArea(highlightIntensityInput);
  }
  if (highlightEquipmentInput) {
    highlightEquipmentInput.value = (vocabulary?.equipment ?? []).join("\n");
    autoResizeTextArea(highlightEquipmentInput);
  }
}

function readHighlightInputs() {
  return {
    intensities: parseHighlightList(highlightIntensityInput?.value ?? ""),
    equipment: parseHighlightList(highlightEquipmentInput?.value ?? ""),
  };
}

async function loadHighlightVocabularyFromServer() {
  if (!highlightConfigServerSupported) {
    setHighlightStatus(
      "Markierungen werden lokal gespeichert. Starte den lokalen Server (npm start), um sie zu synchronisieren.",
      "warning",
    );
    return;
  }
  try {
    const { vocabulary } = await fetchHighlightVocabularyConfig();
    const sanitized = setHighlightVocabulary(vocabulary);
    highlightConfigDirty = false;
    updateHighlightInputsFromVocabulary(sanitized);
    setHighlightStatus("Markierungen vom Server übernommen.", "info");
  } catch (error) {
    const message = describeApiError(error);
    const statusType = error?.offline ? "warning" : "error";
    setHighlightStatus(`Markierungen konnten nicht geladen werden: ${message}`, statusType);
  }
}

async function handleHighlightConfigSave() {
  if (highlightConfigRequest) {
    return;
  }
  const draft = readHighlightInputs();
  const sanitized = setHighlightVocabulary(draft);
  updateHighlightInputsFromVocabulary(sanitized);
  highlightConfigDirty = false;
  if (!highlightConfigServerSupported) {
    setHighlightStatus(
      "Markierungen wurden lokal aktualisiert. Starte den lokalen Server, um sie dauerhaft zu speichern.",
      "warning",
    );
    return;
  }
  if (highlightConfigSaveButton) {
    highlightConfigSaveButton.disabled = true;
    highlightConfigSaveButton.setAttribute("aria-busy", "true");
  }
  highlightConfigRequest = persistHighlightVocabularyConfig(sanitized)
    .then(({ vocabulary }) => {
      const synced = setHighlightVocabulary(vocabulary);
      updateHighlightInputsFromVocabulary(synced);
      setHighlightStatus("Markierungen gespeichert.", "success");
    })
    .catch((error) => {
      const message = describeApiError(error);
      const statusType = error?.offline ? "warning" : "error";
      setHighlightStatus(`Markierungen konnten nicht gespeichert werden: ${message}`, statusType);
    })
    .finally(() => {
      highlightConfigRequest = null;
      if (highlightConfigSaveButton) {
        highlightConfigSaveButton.disabled = false;
        highlightConfigSaveButton.removeAttribute("aria-busy");
      }
    });
}

function handleHighlightInputChange(event) {
  highlightConfigDirty = true;
  const target = event?.target;
  if (target instanceof HTMLTextAreaElement) {
    autoResizeTextArea(target);
  }
}

function applySnippetStatusDescription(element) {
  if (!snippetStatusId || !element) {
    return;
  }
  element.setAttribute("aria-describedby", snippetStatusId);
}

function renderGroups() {
  if (!groupContainer) {
    return;
  }

  groupContainer.innerHTML = "";

  if (snippetGroups.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "empty-hint";
    placeholder.textContent = "Noch keine Kategorien vorhanden.";
    groupContainer.appendChild(placeholder);
    return;
  }

  const fragment = document.createDocumentFragment();
  const knownIds = new Set();

  snippetGroups.forEach((group, groupIndex) => {
    if (!group || typeof group !== "object") {
      return;
    }

    if (typeof group.id !== "string") {
      group.id = createGroupId();
    }

    knownIds.add(group.id);

    const isCollapsed = collapsedGroups.has(group.id);

    const section = document.createElement("section");
    section.className = "snippet-settings-group";
    section.dataset.groupIndex = String(groupIndex);
    section.dataset.groupId = group.id;
    section.setAttribute("aria-expanded", String(!isCollapsed));
    if (isCollapsed) {
      section.classList.add("is-collapsed");
    }

    const header = document.createElement("header");
    header.className = "snippet-settings-header";

    const titleRow = document.createElement("div");
    titleRow.className = "snippet-settings-title-row";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "snippet-settings-toggle";
    toggleButton.dataset.groupIndex = String(groupIndex);
    toggleButton.dataset.groupId = group.id;
    toggleButton.dataset.action = "toggle-group";
    toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    toggleButton.setAttribute(
      "aria-label",
      isCollapsed ? "Kategorie aufklappen" : "Kategorie einklappen"
    );
    toggleButton.textContent = isCollapsed ? "Aufklappen" : "Einklappen";
    titleRow.appendChild(toggleButton);

    const titleField = document.createElement("input");
    titleField.type = "text";
    titleField.required = true;
    titleField.value = group.title ?? "";
    titleField.placeholder = "Titel der Kategorie";
    titleField.dataset.groupIndex = String(groupIndex);
    titleField.dataset.field = "title";
    titleField.className = "snippet-settings-title";
    applySnippetStatusDescription(titleField);
    titleRow.appendChild(titleField);

    const countBadge = document.createElement("span");
    countBadge.className = "snippet-settings-count";
    countBadge.textContent = formatItemCount(group.items.length);
    titleRow.appendChild(countBadge);

    header.appendChild(titleRow);

    const headerActions = document.createElement("div");
    headerActions.className = "snippet-settings-header-actions";

    const orderLabel = document.createElement("label");
    orderLabel.className = "number-field snippet-settings-order";
    orderLabel.textContent = "Position";

    const orderField = document.createElement("input");
    orderField.type = "number";
    orderField.min = "1";
    orderField.step = "1";
    orderField.value = String((group.sortOrder ?? groupIndex) + 1);
    orderField.dataset.groupIndex = String(groupIndex);
    orderField.dataset.groupId = group.id;
    orderField.dataset.field = "sortOrder";
    orderField.className = "snippet-settings-number";
    orderField.title = "Position der Kategorie (1 = ganz oben)";
    orderLabel.appendChild(orderField);
    headerActions.appendChild(orderLabel);

    const moveGroupUp = document.createElement("button");
    moveGroupUp.type = "button";
    moveGroupUp.className = "ghost-button is-quiet";
    moveGroupUp.textContent = "Nach oben";
    moveGroupUp.dataset.groupIndex = String(groupIndex);
    moveGroupUp.dataset.action = "move-group-up";
    moveGroupUp.title = "Kategorie nach oben verschieben";
    if (groupIndex === 0) {
      moveGroupUp.disabled = true;
    }
    headerActions.appendChild(moveGroupUp);

    const moveGroupDown = document.createElement("button");
    moveGroupDown.type = "button";
    moveGroupDown.className = "ghost-button is-quiet";
    moveGroupDown.textContent = "Nach unten";
    moveGroupDown.dataset.groupIndex = String(groupIndex);
    moveGroupDown.dataset.action = "move-group-down";
    moveGroupDown.title = "Kategorie nach unten verschieben";
    if (groupIndex === snippetGroups.length - 1) {
      moveGroupDown.disabled = true;
    }
    headerActions.appendChild(moveGroupDown);

    const removeGroup = document.createElement("button");
    removeGroup.type = "button";
    removeGroup.className = "ghost-button is-quiet";
    removeGroup.dataset.groupIndex = String(groupIndex);
    removeGroup.dataset.action = "remove-group";
    removeGroup.textContent = "Kategorie löschen";
    headerActions.appendChild(removeGroup);

    header.appendChild(headerActions);
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "snippet-settings-body";

    const descriptionField = document.createElement("textarea");
    descriptionField.rows = 2;
    descriptionField.placeholder = "Beschreibung (optional)";
    descriptionField.value = group.description ?? "";
    descriptionField.dataset.groupIndex = String(groupIndex);
    descriptionField.dataset.field = "description";
    descriptionField.className = "snippet-settings-description";
    autoResizeTextArea(descriptionField);
    applySnippetStatusDescription(descriptionField);
    body.appendChild(descriptionField);

    const list = document.createElement("div");
    list.className = "snippet-settings-items";

    group.items.forEach((item, itemIndex) => {
      const itemCard = document.createElement("article");
      itemCard.className = "snippet-settings-item";
      itemCard.dataset.groupIndex = String(groupIndex);
      itemCard.dataset.itemIndex = String(itemIndex);

      const labelField = document.createElement("input");
      labelField.type = "text";
      labelField.required = true;
      labelField.value = item.label ?? "";
      labelField.placeholder = "Name des Bausteins";
      labelField.dataset.groupIndex = String(groupIndex);
      labelField.dataset.itemIndex = String(itemIndex);
      labelField.dataset.field = "label";
      labelField.className = "snippet-settings-input";
      applySnippetStatusDescription(labelField);

      const snippetField = document.createElement("textarea");
      snippetField.rows = 3;
      snippetField.required = true;
      snippetField.value = item.snippet ?? "";
      snippetField.placeholder = "Inhalt des Bausteins";
      snippetField.dataset.groupIndex = String(groupIndex);
      snippetField.dataset.itemIndex = String(itemIndex);
      snippetField.dataset.field = "snippet";
      snippetField.className = "snippet-settings-text";
      autoResizeTextArea(snippetField);
      applySnippetStatusDescription(snippetField);

      const checkboxRow = document.createElement("div");
      checkboxRow.className = "snippet-settings-checkboxes";

      const createCheckbox = (label, field, checked, description) => {
        const wrapper = document.createElement("label");
        wrapper.className = "checkbox-field";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = checked;
        input.dataset.groupIndex = String(groupIndex);
        input.dataset.itemIndex = String(itemIndex);
        input.dataset.field = field;
        applySnippetStatusDescription(input);
        const span = document.createElement("span");
        span.textContent = label;
        if (description) {
          span.title = description;
        }
        wrapper.appendChild(input);
        wrapper.appendChild(span);
        return wrapper;
      };

      checkboxRow.appendChild(
        createCheckbox(
          "Leerzeile davor",
          "ensureLineBreakBefore",
          Boolean(item.ensureLineBreakBefore),
          "Fügt vor dem Baustein einen Zeilenumbruch ein, falls keiner vorhanden ist."
        )
      );
      checkboxRow.appendChild(
        createCheckbox(
          "Zeilenumbruch anhängen",
          "appendNewline",
          Boolean(item.appendNewline),
          "Hängt nach dem Baustein automatisch einen Zeilenumbruch an."
        )
      );
      checkboxRow.appendChild(
        createCheckbox(
          "Leerzeile danach",
          "ensureBlankLineAfter",
          Boolean(item.ensureBlankLineAfter),
          "Hängt zwei Zeilenumbrüche an, um eine Leerzeile zu erzwingen."
        )
      );

      const cursorField = document.createElement("input");
      cursorField.type = "number";
      cursorField.step = "1";
      cursorField.value = String(item.cursorOffset ?? 0);
      cursorField.dataset.groupIndex = String(groupIndex);
      cursorField.dataset.itemIndex = String(itemIndex);
      cursorField.dataset.field = "cursorOffset";
      cursorField.className = "snippet-settings-number";
      applySnippetStatusDescription(cursorField);

      const cursorLabel = document.createElement("label");
      cursorLabel.className = "number-field";
      cursorLabel.textContent = "Cursor-Versatz";
      cursorLabel.title =
        "Negativwerte setzen den Cursor einige Zeichen nach links, positive Werte nach rechts.";
      cursorLabel.appendChild(cursorField);

      const actionRow = document.createElement("div");
      actionRow.className = "snippet-settings-actions";

      const moveItemUp = document.createElement("button");
      moveItemUp.type = "button";
      moveItemUp.className = "ghost-button is-quiet";
      moveItemUp.textContent = "Nach oben";
      moveItemUp.dataset.groupIndex = String(groupIndex);
      moveItemUp.dataset.itemIndex = String(itemIndex);
      moveItemUp.dataset.action = "move-item-up";
      moveItemUp.title = "Baustein nach oben verschieben";
      if (itemIndex === 0) {
        moveItemUp.disabled = true;
      }

      const moveItemDown = document.createElement("button");
      moveItemDown.type = "button";
      moveItemDown.className = "ghost-button is-quiet";
      moveItemDown.textContent = "Nach unten";
      moveItemDown.dataset.groupIndex = String(groupIndex);
      moveItemDown.dataset.itemIndex = String(itemIndex);
      moveItemDown.dataset.action = "move-item-down";
      moveItemDown.title = "Baustein nach unten verschieben";
      if (itemIndex === group.items.length - 1) {
        moveItemDown.disabled = true;
      }

      const duplicateItem = document.createElement("button");
      duplicateItem.type = "button";
      duplicateItem.className = "ghost-button is-quiet";
      duplicateItem.textContent = "Duplizieren";
      duplicateItem.dataset.groupIndex = String(groupIndex);
      duplicateItem.dataset.itemIndex = String(itemIndex);
      duplicateItem.dataset.action = "duplicate-item";
      duplicateItem.title = "Baustein duplizieren";

      const removeItem = document.createElement("button");
      removeItem.type = "button";
      removeItem.className = "ghost-button is-quiet";
      removeItem.textContent = "Baustein löschen";
      removeItem.dataset.groupIndex = String(groupIndex);
      removeItem.dataset.itemIndex = String(itemIndex);
      removeItem.dataset.action = "remove-item";

      actionRow.appendChild(moveItemUp);
      actionRow.appendChild(moveItemDown);
      actionRow.appendChild(duplicateItem);
      actionRow.appendChild(removeItem);

      itemCard.appendChild(labelField);
      itemCard.appendChild(snippetField);
      itemCard.appendChild(checkboxRow);
      itemCard.appendChild(cursorLabel);
      itemCard.appendChild(actionRow);
      list.appendChild(itemCard);
    });

    const addItemButton = document.createElement("button");
    addItemButton.type = "button";
    addItemButton.className = "ghost-button is-quiet snippet-settings-add-item";
    addItemButton.textContent = "Baustein hinzufügen";
    addItemButton.dataset.groupIndex = String(groupIndex);
    addItemButton.dataset.action = "add-item";

    list.appendChild(addItemButton);
    body.appendChild(list);
    section.appendChild(body);
    fragment.appendChild(section);
  });

  [...collapsedGroups].forEach((id) => {
    if (!knownIds.has(id)) {
      collapsedGroups.delete(id);
    }
  });

  groupContainer.appendChild(fragment);
  applyPendingFocus();
}

function applyPendingFocus() {
  if (!pendingFocus || !groupContainer) {
    return;
  }

  const { groupIndex, itemIndex, field, groupId } = pendingFocus;
  const resolvedIndex = (() => {
    if (typeof groupId === "string") {
      const actualIndex = findGroupIndexById(groupId);
      if (actualIndex !== -1) {
        return actualIndex;
      }
    }
    return groupIndex;
  })();

  const groupSelector = `[data-group-index="${resolvedIndex}"]`;
  const fieldSelector = `${groupSelector}[data-field="${field}"]`;
  const selector =
    typeof itemIndex === "number"
      ? `${groupSelector}[data-item-index="${itemIndex}"][data-field="${field}"]`
      : fieldSelector;

  window.requestAnimationFrame(() => {
    const element = groupContainer.querySelector(selector);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus();
      const length = element.value.length;
      element.setSelectionRange(length, length);
    } else if (element instanceof HTMLElement) {
      element.focus();
    }
    pendingFocus = null;
  });
}

function updateGroupField(groupIndex, field, value) {
  const group = snippetGroups[groupIndex];
  if (!group) {
    return false;
  }
  if (field === "title") {
    group.title = value;
    return false;
  }
  if (field === "description") {
    group.description = value;
    return false;
  }
  if (field === "sortOrder") {
    const parsed = Number.parseInt(value, 10);
    const safeValue = Number.isNaN(parsed)
      ? groupIndex + 1
      : Math.min(Math.max(parsed, 1), snippetGroups.length);
    group.sortOrder = safeValue - 1;
    sortGroupsBySortOrder();
    return true;
  }
  return false;
}

function updateItemField(groupIndex, itemIndex, field, value) {
  const group = snippetGroups[groupIndex];
  if (!group || !group.items[itemIndex]) {
    return;
  }
  if (field === "label") {
    group.items[itemIndex].label = value;
  } else if (field === "snippet") {
    group.items[itemIndex].snippet = value;
  } else if (field === "cursorOffset") {
    const parsed = Number.parseInt(value, 10);
    group.items[itemIndex].cursorOffset = Number.isNaN(parsed) ? 0 : parsed;
  } else if (field === "ensureLineBreakBefore") {
    group.items[itemIndex].ensureLineBreakBefore = Boolean(value);
  } else if (field === "appendNewline") {
    group.items[itemIndex].appendNewline = Boolean(value);
  } else if (field === "ensureBlankLineAfter") {
    group.items[itemIndex].ensureBlankLineAfter = Boolean(value);
  }
}

function handleInput(event) {
  const target = event.target;
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )
  ) {
    return;
  }

  if (target instanceof HTMLTextAreaElement) {
    autoResizeTextArea(target);
  }

  const groupIndex = Number.parseInt(target.dataset.groupIndex ?? "", 10);
  if (Number.isNaN(groupIndex)) {
    return;
  }

  const group = snippetGroups[groupIndex];
  if (!group) {
    return;
  }

  const field = target.dataset.field;
  if (!field) {
    return;
  }

  if (field === "sortOrder" && event.type === "input") {
    return;
  }

  let shouldRerender = false;

  if (target.dataset.itemIndex) {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex)) {
      return;
    }

    if (target.type === "checkbox") {
      updateItemField(groupIndex, itemIndex, field, target.checked);
    } else {
      updateItemField(groupIndex, itemIndex, field, target.value);
    }
  } else {
    shouldRerender = updateGroupField(groupIndex, field, target.value);
  }

  if (shouldRerender) {
    const focusGroupId =
      typeof group.id === "string" ? group.id : target.dataset.groupId;
    const resolvedIndex = (() => {
      if (typeof focusGroupId === "string") {
        const nextIndex = findGroupIndexById(focusGroupId);
        if (nextIndex !== -1) {
          return nextIndex;
        }
      }
      return groupIndex;
    })();
    scheduleFocus({
      groupId: focusGroupId,
      groupIndex: resolvedIndex,
      field,
    });
    renderGroups();
  }

  scheduleSnippetSave();
}

function handleClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.action;
  const groupIndex = Number.parseInt(target.dataset.groupIndex ?? "", 10);
  const groupId = target.dataset.groupId;

  if (action === "toggle-group") {
    if (groupId) {
      if (collapsedGroups.has(groupId)) {
        collapsedGroups.delete(groupId);
      } else {
        collapsedGroups.add(groupId);
      }
      renderGroups();
    }
    return;
  }

  if (Number.isNaN(groupIndex)) {
    return;
  }

  const group = snippetGroups[groupIndex];
  if (!group) {
    return;
  }

  if (action === "remove-group") {
    const confirmDelete = window.confirm(
      "Soll diese Kategorie inklusive aller Bausteine gelöscht werden?"
    );
    if (!confirmDelete) {
      return;
    }
    snippetGroups.splice(groupIndex, 1);
    if (group.id) {
      collapsedGroups.delete(group.id);
    }
    reindexGroupSortOrders();
    renderGroups();
    scheduleSnippetSave();
  } else if (action === "move-group-up") {
    if (groupIndex > 0) {
      const [moved] = snippetGroups.splice(groupIndex, 1);
      snippetGroups.splice(groupIndex - 1, 0, moved);
      reindexGroupSortOrders();
      renderGroups();
      scheduleSnippetSave();
    }
  } else if (action === "move-group-down") {
    if (groupIndex < snippetGroups.length - 1) {
      const [moved] = snippetGroups.splice(groupIndex, 1);
      snippetGroups.splice(groupIndex + 1, 0, moved);
      reindexGroupSortOrders();
      renderGroups();
      scheduleSnippetSave();
    }
  } else if (action === "add-item") {
    const newItem = createEmptyItem();
    group.items.push(newItem);
    scheduleFocus({
      groupId: group.id,
      groupIndex,
      itemIndex: group.items.length - 1,
      field: "label",
    });
    renderGroups();
    scheduleSnippetSave();
  } else if (action === "duplicate-item") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex) || !group.items[itemIndex]) {
      return;
    }
    const source = group.items[itemIndex];
    const duplicateLabel = source.label
      ? `${source.label} (Kopie)`
      : "Neuer Baustein";
    const copy = {
      ...source,
      label: duplicateLabel,
    };
    const insertIndex = itemIndex + 1;
    group.items.splice(insertIndex, 0, copy);
    scheduleFocus({
      groupId: group.id,
      groupIndex,
      itemIndex: insertIndex,
      field: "label",
    });
    renderGroups();
    scheduleSnippetSave();
  } else if (action === "remove-item") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex)) {
      return;
    }
    group.items.splice(itemIndex, 1);
    if (group.items.length === 0) {
      group.items.push(createEmptyItem());
    }
    renderGroups();
    scheduleSnippetSave();
  } else if (action === "move-item-up") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex) || itemIndex === 0) {
      return;
    }
    const items = group.items;
    const [moved] = items.splice(itemIndex, 1);
    items.splice(itemIndex - 1, 0, moved);
    renderGroups();
    scheduleSnippetSave();
  } else if (action === "move-item-down") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex) || itemIndex >= group.items.length - 1) {
      return;
    }
    const items = group.items;
    const [moved] = items.splice(itemIndex, 1);
    items.splice(itemIndex + 1, 0, moved);
    renderGroups();
    scheduleSnippetSave();
  }
}

function handleSave() {
  scheduleSnippetSave({ immediate: true });
  showStatus("Schnellbausteine gespeichert.", "success");
}

function handleReset() {
  const confirmReset = window.confirm(
    "Sollen alle eigenen Anpassungen gelöscht und die Standardbausteine wiederhergestellt werden?"
  );
  if (!confirmReset) {
    return;
  }
  resetQuickSnippets();
  snippetGroups = cloneGroups(defaultQuickSnippetGroups);
  sortGroupsBySortOrder();
  collapsedGroups.clear();
  scheduleSnippetSave({ immediate: true });
  showStatus("Standardbausteine wiederhergestellt.", "success");
  renderGroups();
}

function handleAddGroup() {
  const newGroup = createEmptyGroup();
  snippetGroups.push(newGroup);
  reindexGroupSortOrders();
  scheduleFocus({
    groupId: newGroup.id,
    groupIndex: snippetGroups.length - 1,
    field: "title",
  });
  renderGroups();
  scheduleSnippetSave();
}

function handleExpandAll() {
  collapsedGroups.clear();
  renderGroups();
}

function handleCollapseAll() {
  collapsedGroups.clear();
  snippetGroups.forEach((group) => {
    if (group && typeof group.id === "string") {
      collapsedGroups.add(group.id);
    }
  });
  renderGroups();
}

function handleExport() {
  if (snippetGroups.length === 0) {
    showStatus("Keine Schnellbausteine zum Exportieren vorhanden.", "warning");
    return;
  }

  const sanitized = sanitizeQuickSnippetGroups(snippetGroups, { allowEmpty: true });
  const blob = new Blob([JSON.stringify(sanitized, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "swim-planner-schnellbausteine.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Schnellbausteine als JSON exportiert.", "success");
}

function handleImportClick() {
  importInput?.click();
}

function handleImportFile(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = JSON.parse(text);
      const sanitized = sanitizeQuickSnippetGroups(parsed, { allowEmpty: true });
      snippetGroups = cloneGroups(sanitized);
      sortGroupsBySortOrder();
      collapsedGroups.clear();
      scheduleSnippetSave({ immediate: true });
      renderGroups();
      showStatus("Konfiguration importiert.", "success");
    } catch (error) {
      showStatus("Import fehlgeschlagen. Bitte gültige JSON-Datei wählen.", "warning");
    } finally {
      input.value = "";
    }
  };
  reader.onerror = () => {
    showStatus("Import fehlgeschlagen. Datei konnte nicht gelesen werden.", "warning");
    input.value = "";
  };
  reader.readAsText(file);
}

addGroupButton?.addEventListener("click", handleAddGroup);
expandAllButton?.addEventListener("click", handleExpandAll);
collapseAllButton?.addEventListener("click", handleCollapseAll);
resetButton?.addEventListener("click", handleReset);
saveButton?.addEventListener("click", handleSave);
groupContainer?.addEventListener("input", handleInput);
groupContainer?.addEventListener("change", handleInput);
groupContainer?.addEventListener("click", handleClick);
exportButton?.addEventListener("click", handleExport);
importButton?.addEventListener("click", handleImportClick);
importInput?.addEventListener("change", handleImportFile);

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingSnippetSave();
      flushPendingServerSave();
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    flushPendingSnippetSave();
    flushPendingServerSave();
  });
  window.addEventListener("beforeunload", () => {
    flushPendingSnippetSave();
    flushPendingServerSave();
  });
}

updateHighlightInputsFromVocabulary(getHighlightVocabulary());
highlightIntensityInput?.addEventListener("input", handleHighlightInputChange);
highlightEquipmentInput?.addEventListener("input", handleHighlightInputChange);
highlightConfigSaveButton?.addEventListener("click", () => {
  handleHighlightConfigSave().catch((error) => {
    console.error("Fehler beim Speichern der Highlight-Konfiguration", error);
    setHighlightStatus("Markierungen konnten nicht gespeichert werden.", "error");
  });
});

if (highlightList) {
  renderHighlightOptions();
  highlightList.addEventListener("change", handleHighlightChange);
  subscribeToHighlightSettings((settings) => {
    renderHighlightOptions(settings);
  });
}

highlightResetButton?.addEventListener("click", handleHighlightReset);

loadHighlightVocabularyFromServer().catch((error) => {
  console.error("Fehler beim Laden der Highlight-Konfiguration", error);
});

if (teamLibraryEnabled) {
  teamRefreshButton?.addEventListener("click", () => {
    loadTeamLibraryFromServer().catch((error) => {
      console.error("Fehler beim Laden der Team-Bibliothek", error);
      setTeamStatus("Team-Bibliothek konnte nicht geladen werden.", "error");
    });
  });

  teamPushButton?.addEventListener("click", () => {
    pushTeamLibraryToServer().catch((error) => {
      console.error("Fehler beim Freigeben der Team-Bibliothek", error);
      setTeamStatus("Freigabe fehlgeschlagen.", "error");
    });
  });

  updateTeamMetadata(null);
  if (!teamLibrarySupported()) {
    setTeamStatus("Team-Bibliothek benötigt den lokalen NextPlanner-Server (npm start).", "warning");
    teamRefreshButton?.setAttribute("disabled", "disabled");
    teamPushButton?.setAttribute("disabled", "disabled");
  }
} else {
  updateTeamMetadata(null);
  setTeamStatus("Team-Bibliothek ist deaktiviert.", "info");
  teamRefreshButton?.setAttribute("disabled", "disabled");
  teamPushButton?.setAttribute("disabled", "disabled");
}

renderGroups();
bootstrapQuickSnippetsFromServer();
