import {
  TEMPLATE_TYPES,
  loadTemplates,
  persistTemplates,
  createTemplateRecord,
  parseTagsInput,
} from "./utils/templateStorage.js";

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

let templates = loadTemplates();
let editId = null;

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

function handleDelete(id) {
  const index = templates.findIndex((entry) => entry.id === id);
  if (index === -1) {
    showStatus("Vorlage nicht gefunden.", "warning");
    return;
  }
  const confirmDelete = window.confirm("Soll diese Vorlage wirklich gelöscht werden?");
  if (!confirmDelete) {
    return;
  }
  templates.splice(index, 1);
  templates = persistTemplates(templates);
  renderTemplates();
  showStatus("Vorlage gelöscht.", "success");
  if (editId === id) {
    resetForm();
  }
}

form?.addEventListener("submit", (event) => {
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

  if (editId) {
    templates = templates.map((entry) =>
      entry.id === editId
        ? { ...entry, type, title: title || entry.title, notes, content, tags }
        : entry
    );
    showStatus("Vorlage aktualisiert.", "success");
  } else {
    const newTemplate = createTemplateRecord({
      type,
      title: title || "Unbenannte Vorlage",
      notes,
      content,
      tags,
    });
    if (!newTemplate) {
      showStatus("Vorlage konnte nicht gespeichert werden.", "warning");
      return;
    }
    templates.push(newTemplate);
    showStatus("Vorlage gespeichert.", "success");
  }

  templates = persistTemplates(templates);
  renderTemplates();
  resetForm();
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
    handleDelete(id);
  }
});

renderTemplates();
