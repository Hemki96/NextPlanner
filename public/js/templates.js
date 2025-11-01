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
const importButton = document.getElementById("import-templates");
const importInput = document.getElementById("import-templates-input");

const featureSettings = getFeatureSettings();
applyFeatureVisibility(document, featureSettings);
subscribeToFeatureSettings(() => {
  window.location.reload();
});

const templateFeatureEnabled = featureSettings.templateLibrary !== false;

let templates = [];
let editId = null;
let isLoading = false;

function normalizeTagsList(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }
  if (typeof value === "string") {
    return normalizeTagsList(value.split(/[;,]/));
  }
  return [];
}

function sanitizeImportedTemplate(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const rawType = typeof raw.type === "string" ? raw.type.trim() : "";
  const type = TEMPLATE_TYPES.some((entry) => entry.value === rawType) ? rawType : "Set";
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Unbenannte Vorlage";
  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!content) {
    return null;
  }
  const tags = normalizeTagsList(raw.tags ?? []);
  return { type, title, notes, content, tags };
}

function normalizeForComparison(template) {
  if (!template) {
    return {
      type: "Set",
      title: "",
      notes: "",
      content: "",
      tags: [],
    };
  }
  const tags = Array.isArray(template.tags)
    ? template.tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }))
    : [];
  return {
    type: typeof template.type === "string" && template.type.trim() ? template.type.trim() : "Set",
    title: typeof template.title === "string" ? template.title.trim() : "",
    notes: typeof template.notes === "string" ? template.notes.trim() : "",
    content: typeof template.content === "string" ? template.content.trim() : "",
    tags,
  };
}

function isExactDuplicate(existing, candidate) {
  const normalizedExisting = normalizeForComparison(existing);
  const normalizedCandidate = normalizeForComparison(candidate);
  if (
    normalizedExisting.type !== normalizedCandidate.type ||
    normalizedExisting.title !== normalizedCandidate.title ||
    normalizedExisting.notes !== normalizedCandidate.notes ||
    normalizedExisting.content !== normalizedCandidate.content ||
    normalizedExisting.tags.length !== normalizedCandidate.tags.length
  ) {
    return false;
  }
  return normalizedExisting.tags.every((tag, index) => tag === normalizedCandidate.tags[index]);
}

function normalizeContentForSimilarity(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isSimilarTemplate(existing, candidate) {
  const normalizedExisting = normalizeForComparison(existing);
  const normalizedCandidate = normalizeForComparison(candidate);
  if (isExactDuplicate(normalizedExisting, normalizedCandidate)) {
    return false;
  }
  const sameType = normalizedExisting.type === normalizedCandidate.type;
  const sameTitle =
    normalizedExisting.title &&
    normalizedCandidate.title &&
    normalizedExisting.title.localeCompare(normalizedCandidate.title, "de", { sensitivity: "base" }) === 0;
  if (sameType && sameTitle) {
    return true;
  }
  const existingContent = normalizeContentForSimilarity(normalizedExisting.content);
  const candidateContent = normalizeContentForSimilarity(normalizedCandidate.content);
  if (existingContent && candidateContent && existingContent === candidateContent) {
    return true;
  }
  return false;
}

function truncateValue(value, maxLength = 320) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function formatTagList(tags) {
  return tags.length > 0 ? tags.join(", ") : "(keine)";
}

function buildDifferenceMessage(existing, candidate) {
  const differences = [];
  if (existing.type !== candidate.type) {
    differences.push(`Typ: ${existing.type} → ${candidate.type}`);
  }
  if (existing.title !== candidate.title) {
    differences.push(`Titel: "${existing.title}" → "${candidate.title}"`);
  }
  if (existing.notes !== candidate.notes) {
    differences.push(`Notiz: "${existing.notes}" → "${candidate.notes}"`);
  }
  const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
  const candidateTags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const tagsChanged =
    existingTags.length !== candidateTags.length ||
    existingTags.some((tag, index) => tag !== candidateTags[index]);
  if (tagsChanged) {
    differences.push(`Tags: ${formatTagList(existingTags)} → ${formatTagList(candidateTags)}`);
  }
  if (existing.content !== candidate.content) {
    differences.push(
      `Inhalt (bestehend):\n${truncateValue(existing.content)}\n\nInhalt (Import):\n${truncateValue(candidate.content)}`,
    );
  }
  return differences.join("\n\n");
}

function confirmSimilarImport(existing, candidate) {
  const messageParts = [
    `Die importierte Vorlage "${candidate.title}" ähnelt einer bestehenden Vorlage.`,
    `Bestehende Vorlage: "${existing.title}"`,
  ];
  const differences = buildDifferenceMessage(normalizeForComparison(existing), normalizeForComparison(candidate));
  if (differences) {
    messageParts.push("Unterschiede:");
    messageParts.push(differences);
  }
  messageParts.push("Soll die neue Vorlage trotzdem importiert werden?");
  return window.confirm(messageParts.join("\n\n"));
}

async function handleTemplateImport(file) {
  if (!file) {
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch (error) {
    console.error("Importdatei konnte nicht gelesen werden.", error);
    showStatus("Importdatei konnte nicht gelesen werden.", "warning");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    console.error("Importdatei ist keine gültige JSON-Datei.", error);
    showStatus("Importdatei ist keine gültige JSON-Datei.", "warning");
    return;
  }

  const rawTemplates = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.templates)
    ? parsed.templates
    : [];

  const candidates = rawTemplates
    .map((item) => sanitizeImportedTemplate(item))
    .filter((item) => item !== null);

  if (candidates.length === 0) {
    showStatus("Keine importierbaren Vorlagen gefunden.", "info");
    return;
  }

  let importedCount = 0;
  let skippedDuplicates = 0;
  let skippedSimilar = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const exactMatch = templates.find((existing) => isExactDuplicate(existing, candidate));
    if (exactMatch) {
      skippedDuplicates += 1;
      continue;
    }

    const similarMatch = templates.find((existing) => isSimilarTemplate(existing, candidate));
    if (similarMatch && !confirmSimilarImport(similarMatch, candidate)) {
      skippedSimilar += 1;
      continue;
    }

    try {
      const created = await createTemplate(candidate);
      templates.push(created);
      importedCount += 1;
    } catch (error) {
      console.error("Vorlage konnte nicht importiert werden.", error);
      failed += 1;
    }
  }

  if (importedCount > 0) {
    renderTemplates();
  }

  const summary = [];
  if (importedCount > 0) {
    summary.push(`${importedCount} Vorlage(n) importiert.`);
  }
  if (skippedDuplicates > 0) {
    summary.push(`${skippedDuplicates} Duplikat(e) übersprungen.`);
  }
  if (skippedSimilar > 0) {
    summary.push(`${skippedSimilar} ähnliche Vorlage(n) übersprungen.`);
  }
  if (failed > 0) {
    summary.push(`${failed} Import(e) fehlgeschlagen.`);
  }

  if (summary.length === 0) {
    summary.push("Keine neuen Vorlagen importiert.");
  }

  const statusType = failed > 0 ? "warning" : importedCount > 0 ? "success" : "info";
  showStatus(summary.join(" "), statusType);
}

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

  importButton?.addEventListener("click", () => {
    importInput?.click();
  });

  importInput?.addEventListener("change", async (event) => {
    const target = event.target;
    const file = target instanceof HTMLInputElement && target.files ? target.files[0] : undefined;
    await handleTemplateImport(file);
    if (target instanceof HTMLInputElement) {
      target.value = "";
    }
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
  if (exportButton) {
    exportButton.disabled = true;
  }
  if (importButton) {
    importButton.disabled = true;
  }
  if (listContainer) {
    listContainer.innerHTML = "";
    const message = document.createElement("p");
    message.className = "feature-disabled-message";
    message.textContent = "Vorlagen sind deaktiviert. Aktiviere die Funktion in den Einstellungen.";
    listContainer.appendChild(message);
  }
}
