import {
  defaultQuickSnippetGroups,
  getQuickSnippets,
  resetQuickSnippets,
  saveQuickSnippets,
  sanitizeQuickSnippetGroups,
} from "./utils/snippet-storage.js";
import { describeApiError } from "./utils/api-client.js";
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
const featureList = document.getElementById("feature-settings-list");
const featureStatusElement = document.getElementById("feature-settings-status");
const featureResetButton = document.getElementById("feature-settings-reset");
const themeToggle = document.getElementById("theme-toggle");
const themeStatusElement = document.getElementById("theme-settings-status");

let highlightStatusTimeout = null;

let teamLibraryEnabled = getFeatureSettings().teamLibrary !== false;

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

function cloneGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups.map((group) => ({
    id: typeof group.id === "string" ? group.id : createGroupId(),
    title: typeof group.title === "string" ? group.title : "",
    description: typeof group.description === "string" ? group.description : "",
    items: Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : [],
  }));
}

let snippetGroups = cloneGroups(getQuickSnippets());
const collapsedGroups = new Set();
let pendingFocus = null;

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
  return {
    id: createGroupId(),
    title: "Neue Kategorie",
    description: "",
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
    renderGroups();
    saveQuickSnippets(snippetGroups);
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
  input.setAttribute("aria-describedby", descriptionId);

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
  renderHighlightOptions(defaults);
  setHighlightStatus("Alle Markierungen wurden zurückgesetzt.", "info");
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
    titleRow.appendChild(titleField);

    const countBadge = document.createElement("span");
    countBadge.className = "snippet-settings-count";
    countBadge.textContent = formatItemCount(group.items.length);
    titleRow.appendChild(countBadge);

    header.appendChild(titleRow);

    const headerActions = document.createElement("div");
    headerActions.className = "snippet-settings-header-actions";

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

  const { groupIndex, itemIndex, field } = pendingFocus;
  const groupSelector = `[data-group-index="${groupIndex}"]`;
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
    return;
  }
  if (field === "title") {
    group.title = value;
  } else if (field === "description") {
    group.description = value;
  }
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

  const field = target.dataset.field;
  if (!field) {
    return;
  }

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
    updateGroupField(groupIndex, field, target.value);
  }
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
    renderGroups();
  } else if (action === "move-group-up") {
    if (groupIndex > 0) {
      const [moved] = snippetGroups.splice(groupIndex, 1);
      snippetGroups.splice(groupIndex - 1, 0, moved);
      renderGroups();
    }
  } else if (action === "move-group-down") {
    if (groupIndex < snippetGroups.length - 1) {
      const [moved] = snippetGroups.splice(groupIndex, 1);
      snippetGroups.splice(groupIndex + 1, 0, moved);
      renderGroups();
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
  } else if (action === "move-item-up") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex) || itemIndex === 0) {
      return;
    }
    const items = group.items;
    const [moved] = items.splice(itemIndex, 1);
    items.splice(itemIndex - 1, 0, moved);
    renderGroups();
  } else if (action === "move-item-down") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (Number.isNaN(itemIndex) || itemIndex >= group.items.length - 1) {
      return;
    }
    const items = group.items;
    const [moved] = items.splice(itemIndex, 1);
    items.splice(itemIndex + 1, 0, moved);
    renderGroups();
  }
}

function handleSave() {
  saveQuickSnippets(snippetGroups);
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
  collapsedGroups.clear();
  showStatus("Standardbausteine wiederhergestellt.", "success");
  renderGroups();
}

function handleAddGroup() {
  const newGroup = createEmptyGroup();
  snippetGroups.push(newGroup);
  scheduleFocus({
    groupId: newGroup.id,
    groupIndex: snippetGroups.length - 1,
    field: "title",
  });
  renderGroups();
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

  const sanitized = sanitizeQuickSnippetGroups(snippetGroups);
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
      const sanitized = sanitizeQuickSnippetGroups(parsed);
      snippetGroups = cloneGroups(sanitized);
      collapsedGroups.clear();
      saveQuickSnippets(snippetGroups);
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

if (highlightList) {
  renderHighlightOptions();
  highlightList.addEventListener("change", handleHighlightChange);
  subscribeToHighlightSettings((settings) => {
    renderHighlightOptions(settings);
  });
}

highlightResetButton?.addEventListener("click", handleHighlightReset);

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
