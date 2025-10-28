import {
  defaultQuickSnippetGroups,
  getQuickSnippets,
  resetQuickSnippets,
  saveQuickSnippets,
  sanitizeQuickSnippetGroups,
} from "./utils/snippetStorage.js";

const groupContainer = document.getElementById("snippet-groups");
const addGroupButton = document.getElementById("add-group");
const resetButton = document.getElementById("reset-groups");
const saveButton = document.getElementById("save-groups");
const exportButton = document.getElementById("export-groups");
const importButton = document.getElementById("import-groups");
const importInput = document.getElementById("import-groups-file");
const statusElement = document.getElementById("settings-status");

function cloneGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups.map((group) => ({
    title: group.title,
    description: group.description,
    items: Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : [],
  }));
}

let snippetGroups = cloneGroups(getQuickSnippets());

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
    title: "Neue Kategorie",
    description: "",
    items: [createEmptyItem()],
  };
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

  snippetGroups.forEach((group, groupIndex) => {
    const section = document.createElement("section");
    section.className = "snippet-settings-group";
    section.dataset.groupIndex = String(groupIndex);

    const header = document.createElement("header");
    header.className = "snippet-settings-header";

    const titleField = document.createElement("input");
    titleField.type = "text";
    titleField.required = true;
    titleField.value = group.title;
    titleField.dataset.groupIndex = String(groupIndex);
    titleField.dataset.field = "title";
    titleField.className = "snippet-settings-title";
    header.appendChild(titleField);

    const headerActions = document.createElement("div");
    headerActions.className = "snippet-settings-header-actions";

    const moveGroupUp = document.createElement("button");
    moveGroupUp.type = "button";
    moveGroupUp.className = "ghost-button";
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
    moveGroupDown.className = "ghost-button";
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
    removeGroup.className = "ghost-button";
    removeGroup.dataset.groupIndex = String(groupIndex);
    removeGroup.dataset.action = "remove-group";
    removeGroup.textContent = "Kategorie löschen";
    headerActions.appendChild(removeGroup);

    header.appendChild(headerActions);
    section.appendChild(header);

    const descriptionField = document.createElement("textarea");
    descriptionField.rows = 2;
    descriptionField.placeholder = "Beschreibung (optional)";
    descriptionField.value = group.description ?? "";
    descriptionField.dataset.groupIndex = String(groupIndex);
    descriptionField.dataset.field = "description";
    descriptionField.className = "snippet-settings-description";
    section.appendChild(descriptionField);

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
      labelField.value = item.label;
      labelField.dataset.groupIndex = String(groupIndex);
      labelField.dataset.itemIndex = String(itemIndex);
      labelField.dataset.field = "label";
      labelField.className = "snippet-settings-input";

      const snippetField = document.createElement("textarea");
      snippetField.rows = 3;
      snippetField.required = true;
      snippetField.value = item.snippet;
      snippetField.dataset.groupIndex = String(groupIndex);
      snippetField.dataset.itemIndex = String(itemIndex);
      snippetField.dataset.field = "snippet";
      snippetField.className = "snippet-settings-text";

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
      moveItemUp.className = "ghost-button";
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
      moveItemDown.className = "ghost-button";
      moveItemDown.textContent = "Nach unten";
      moveItemDown.dataset.groupIndex = String(groupIndex);
      moveItemDown.dataset.itemIndex = String(itemIndex);
      moveItemDown.dataset.action = "move-item-down";
      moveItemDown.title = "Baustein nach unten verschieben";
      if (itemIndex === group.items.length - 1) {
        moveItemDown.disabled = true;
      }

      const removeItem = document.createElement("button");
      removeItem.type = "button";
      removeItem.className = "ghost-button";
      removeItem.textContent = "Baustein löschen";
      removeItem.dataset.groupIndex = String(groupIndex);
      removeItem.dataset.itemIndex = String(itemIndex);
      removeItem.dataset.action = "remove-item";

      actionRow.appendChild(moveItemUp);
      actionRow.appendChild(moveItemDown);
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
    addItemButton.className = "ghost-button";
    addItemButton.textContent = "Baustein hinzufügen";
    addItemButton.dataset.groupIndex = String(groupIndex);
    addItemButton.dataset.action = "add-item";

    list.appendChild(addItemButton);
    section.appendChild(list);
    groupContainer.appendChild(section);
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

  if (action === "remove-group") {
    if (!Number.isNaN(groupIndex)) {
      const confirmDelete = window.confirm(
        "Soll diese Kategorie inklusive aller Bausteine gelöscht werden?"
      );
      if (!confirmDelete) {
        return;
      }
      snippetGroups.splice(groupIndex, 1);
      renderGroups();
    }
  } else if (action === "move-group-up") {
    if (!Number.isNaN(groupIndex) && groupIndex > 0) {
      const [moved] = snippetGroups.splice(groupIndex, 1);
      snippetGroups.splice(groupIndex - 1, 0, moved);
      renderGroups();
    }
  } else if (action === "move-group-down") {
    if (!Number.isNaN(groupIndex) && groupIndex < snippetGroups.length - 1) {
      const [moved] = snippetGroups.splice(groupIndex, 1);
      snippetGroups.splice(groupIndex + 1, 0, moved);
      renderGroups();
    }
  } else if (action === "add-item") {
    if (!Number.isNaN(groupIndex) && snippetGroups[groupIndex]) {
      snippetGroups[groupIndex].items.push(createEmptyItem());
      renderGroups();
    }
  } else if (action === "remove-item") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (
      !Number.isNaN(groupIndex) &&
      !Number.isNaN(itemIndex) &&
      snippetGroups[groupIndex]
    ) {
      snippetGroups[groupIndex].items.splice(itemIndex, 1);
      if (snippetGroups[groupIndex].items.length === 0) {
        snippetGroups[groupIndex].items.push(createEmptyItem());
      }
      renderGroups();
    }
  } else if (action === "move-item-up") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (
      !Number.isNaN(groupIndex) &&
      !Number.isNaN(itemIndex) &&
      snippetGroups[groupIndex] &&
      itemIndex > 0
    ) {
      const items = snippetGroups[groupIndex].items;
      const [moved] = items.splice(itemIndex, 1);
      items.splice(itemIndex - 1, 0, moved);
      renderGroups();
    }
  } else if (action === "move-item-down") {
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);
    if (
      !Number.isNaN(groupIndex) &&
      !Number.isNaN(itemIndex) &&
      snippetGroups[groupIndex] &&
      itemIndex < snippetGroups[groupIndex].items.length - 1
    ) {
      const items = snippetGroups[groupIndex].items;
      const [moved] = items.splice(itemIndex, 1);
      items.splice(itemIndex + 1, 0, moved);
      renderGroups();
    }
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
  showStatus("Standardbausteine wiederhergestellt.", "success");
  renderGroups();
}

function handleAddGroup() {
  snippetGroups.push(createEmptyGroup());
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
resetButton?.addEventListener("click", handleReset);
saveButton?.addEventListener("click", handleSave);
groupContainer?.addEventListener("input", handleInput);
groupContainer?.addEventListener("change", handleInput);
groupContainer?.addEventListener("click", handleClick);
exportButton?.addEventListener("click", handleExport);
importButton?.addEventListener("click", handleImportClick);
importInput?.addEventListener("change", handleImportFile);

renderGroups();
