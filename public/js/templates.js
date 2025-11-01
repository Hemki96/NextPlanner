import {
  TEMPLATE_TYPES,
  loadTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  parseTagsInput,
} from "./utils/template-storage.js";
import {
  applyFeatureVisibility,
  getFeatureSettings,
  subscribeToFeatureSettings,
} from "./utils/feature-settings.js";

const form = document.getElementById("template-form");
const typeSelect = document.getElementById("template-type");
const titleInput = document.getElementById("template-title");
const notesInput = document.getElementById("template-notes");
const tagsInput = document.getElementById("template-tags");
const contentTextarea = document.getElementById("template-content");
const submitButton = document.getElementById("template-submit");
const cancelButton = document.getElementById("template-cancel");
const statusElement = document.getElementById("template-status");
const listContainer = document.getElementById("template-list");
const exportButton = document.getElementById("export-templates");

const featureSettings = getFeatureSettings();
applyFeatureVisibility(document, featureSettings);
subscribeToFeatureSettings(() => {
  window.location.reload();
});

const templateFeatureEnabled = featureSettings.templateLibrary !== false;

let templates = [];
let editId = null;
let isLoading = false;

async function refreshTemplates({ showError = true } = {}) {
  if (!templateFeatureEnabled) {
    return;
  }
  if (isLoading) {
    return;
  }
  isLoading = true;
  try {
    templates = await loadTemplates();
    renderTemplates();
  } catch (error) {
    console.error("Vorlagen konnten nicht geladen werden.", error);
    if (showError) {
      showStatus("Vorlagen konnten nicht geladen werden.", "warning");
    }
  } finally {
    isLoading = false;
  }
}

function resetForm() {
  form?.reset();
  editId = null;
  submitButton.textContent = "Vorlage speichern";
  cancelButton.hidden = true;
  if (tagsInput) {
    tagsInput.value = "";
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

function groupTemplates() {
  const map = new Map();
  TEMPLATE_TYPES.forEach((type) => {
    map.set(type.value, []);
  });

  templates.forEach((template) => {
    const bucket = map.get(template.type) ?? map.get("Set");
    bucket.push(template);
  });

  return map;
}

function createActionButton(label, action, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-button";
  button.textContent = label;
  button.dataset.action = action;
  if (id) {
    button.dataset.id = id;
  }
  return button;
}

function renderTemplates() {
  if (!listContainer) {
    return;
  }

  listContainer.innerHTML = "";

  if (templates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Noch keine Vorlagen gespeichert.";
    listContainer.appendChild(empty);
    return;
  }

  const grouped = groupTemplates();

  TEMPLATE_TYPES.forEach((type) => {
    const entries = grouped.get(type.value) ?? [];
    if (entries.length === 0) {
      return;
    }

    const section = document.createElement("section");
    section.className = "template-section";

    const heading = document.createElement("h3");
    heading.textContent = `${type.label}`;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "template-grid";

    entries
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "de"))
      .forEach((template) => {
        const card = document.createElement("article");
        card.className = "template-card";
        card.dataset.id = template.id;

        const cardHeader = document.createElement("header");
        cardHeader.className = "template-card-header";

        const title = document.createElement("h4");
        title.textContent = template.title;
        cardHeader.appendChild(title);

        if (template.notes) {
          const notes = document.createElement("p");
          notes.className = "template-notes";
          notes.textContent = template.notes;
          cardHeader.appendChild(notes);
        }

        card.appendChild(cardHeader);

        if (template.tags && template.tags.length > 0) {
          const tagList = document.createElement("ul");
          tagList.className = "tag-list template-tag-list";
          template.tags.forEach((tag) => {
            const tagItem = document.createElement("li");
            tagItem.textContent = tag;
            tagList.appendChild(tagItem);
          });
          card.appendChild(tagList);
        }

        const pre = document.createElement("pre");
        pre.className = "template-content";
        pre.textContent = template.content;
        card.appendChild(pre);

        const actions = document.createElement("div");
        actions.className = "template-actions";
        actions.appendChild(createActionButton("In Zwischenablage", "copy", template.id));
        actions.appendChild(createActionButton("Bearbeiten", "edit", template.id));
        actions.appendChild(createActionButton("Löschen", "delete", template.id));

        card.appendChild(actions);
        grid.appendChild(card);
      });

    section.appendChild(grid);
    listContainer.appendChild(section);
  });
}

function exportTemplates() {
  if (templates.length === 0) {
    showStatus("Keine Vorlagen zum Exportieren vorhanden.", "warning");
    return;
  }

  const blob = new Blob([JSON.stringify(templates, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "swim-planner-vorlagen.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Vorlagen als JSON exportiert.", "success");
}

function handleCopy(id) {
  const template = templates.find((entry) => entry.id === id);
  if (!template) {
    showStatus("Vorlage nicht gefunden.", "warning");
    return;
  }
  if (!navigator.clipboard) {
    showStatus("Zwischenablage wird nicht unterstützt.", "warning");
    return;
  }
  navigator.clipboard
    .writeText(template.content)
    .then(() => showStatus("Vorlage in die Zwischenablage kopiert.", "success"))
    .catch(() => showStatus("Kopieren fehlgeschlagen.", "warning"));
}

function handleEdit(id) {
  const template = templates.find((entry) => entry.id === id);
  if (!template) {
    showStatus("Vorlage nicht gefunden.", "warning");
    return;
  }

  typeSelect.value = template.type;
  titleInput.value = template.title;
  notesInput.value = template.notes ?? "";
  if (tagsInput) {
    tagsInput.value = (template.tags ?? []).join(", ");
  }
  contentTextarea.value = template.content;
  submitButton.textContent = "Vorlage aktualisieren";
  cancelButton.hidden = false;
  cancelButton.focus();
  editId = id;
}

async function handleDelete(id) {
  const index = templates.findIndex((entry) => entry.id === id);
  if (index === -1) {
    showStatus("Vorlage nicht gefunden.", "warning");
    return;
  }
  const confirmDelete = window.confirm("Soll diese Vorlage wirklich gelöscht werden?");
  if (!confirmDelete) {
    return;
  }
  try {
    const removed = await deleteTemplate(id);
    if (!removed) {
      showStatus("Vorlage konnte nicht gelöscht werden.", "warning");
      return;
    }
    templates.splice(index, 1);
    renderTemplates();
    showStatus("Vorlage gelöscht.", "success");
    if (editId === id) {
      resetForm();
    }
  } catch (error) {
    console.error("Vorlage konnte nicht gelöscht werden.", error);
    showStatus("Vorlage konnte nicht gelöscht werden.", "warning");
  }
}

if (templateFeatureEnabled) {
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const type = typeSelect.value;
    const title = titleInput.value.trim();
    const notes = notesInput.value.trim();
    const tags = parseTagsInput(tagsInput?.value ?? "");
    const content = contentTextarea.value.trim();

    if (!content) {
      showStatus("Der Vorlagentext darf nicht leer sein.", "warning");
      contentTextarea.focus();
      return;
    }

    try {
      if (editId) {
        const updated = await updateTemplate(editId, {
          type,
          title: title || undefined,
          notes,
          content,
          tags,
        });
        templates = templates.map((entry) => (entry.id === editId ? updated : entry));
        showStatus("Vorlage aktualisiert.", "success");
      } else {
        const created = await createTemplate({
          type,
          title: title || "Unbenannte Vorlage",
          notes,
          content,
          tags,
        });
        templates.push(created);
        showStatus("Vorlage gespeichert.", "success");
      }
      renderTemplates();
      resetForm();
    } catch (error) {
      console.error("Vorlage konnte nicht gespeichert werden.", error);
      showStatus(
        error?.message || "Vorlage konnte nicht gespeichert werden.",
        "warning",
      );
    }
  });

  cancelButton?.addEventListener("click", () => {
    resetForm();
    showStatus("Bearbeitung verworfen.", "info");
  });

  exportButton?.addEventListener("click", () => {
    exportTemplates();
  });

  listContainer?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!id) {
      return;
    }

    if (action === "copy") {
      handleCopy(id);
    } else if (action === "edit") {
      handleEdit(id);
    } else if (action === "delete") {
      void handleDelete(id);
    }
  });

  refreshTemplates();

  window.addEventListener("nextplanner:templates-updated", () => {
    refreshTemplates({ showError: false });
  });
} else {
  showStatus("Die Vorlagenfunktion ist in den Einstellungen deaktiviert.", "info");
  if (form) {
    form.querySelectorAll("input, select, textarea, button").forEach((element) => {
      element.disabled = true;
    });
  }
  if (listContainer) {
    listContainer.innerHTML = "";
    const message = document.createElement("p");
    message.className = "feature-disabled-message";
    message.textContent = "Vorlagen sind deaktiviert. Aktiviere die Funktion in den Einstellungen.";
    listContainer.appendChild(message);
  }
}
