import { loadTemplates } from "../utils/templateStorage.js";

function normalizeQuery(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function templateMatches(template, query) {
  if (!query) {
    return true;
  }
  const haystacks = [template.title, template.notes, template.content, ...(template.tags ?? [])]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  return haystacks.some((value) => value.includes(query));
}

function groupTemplates(templates) {
  const map = new Map();
  templates.forEach((template) => {
    const key = template.type ?? "Set";
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(template);
  });
  return map;
}

export function initTemplateLibraryPanel({ container, textarea }) {
  if (!container) {
    return {
      refresh() {},
    };
  }

  const searchInput = container.querySelector("[data-template-search]");
  const list = container.querySelector("[data-template-list]");
  const emptyState = container.querySelector("[data-template-empty]");

  let templates = loadTemplates();
  let query = normalizeQuery(searchInput?.value ?? "");

  const insertTemplate = (template) => {
    if (!textarea || !template) {
      return;
    }
    const { selectionStart = textarea.value.length, selectionEnd = selectionStart } = textarea;
    const text = textarea.value ?? "";
    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionEnd);
    const insertion = template.content ?? "";
    const newValue = `${before}${insertion}${after}`;
    textarea.value = newValue;
    const caret = before.length + insertion.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const handleDragStart = (event, template) => {
    if (!event.dataTransfer || !template) {
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", template.content ?? "");
    if (template.title) {
      event.dataTransfer.setData("text/uri-list", template.title);
    }
  };

  const render = () => {
    if (!list) {
      return;
    }
    list.innerHTML = "";
    const filtered = templates.filter((template) => templateMatches(template, query));
    if (filtered.length === 0) {
      if (emptyState) {
        emptyState.hidden = false;
      }
      return;
    }
    if (emptyState) {
      emptyState.hidden = true;
    }
    const grouped = groupTemplates(filtered);
    const fragment = document.createDocumentFragment();
    const typeOrder = ["Block", "Runde", "Set"];
    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
      const aIndex = typeOrder.indexOf(a);
      const bIndex = typeOrder.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1 && aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return a.localeCompare(b, "de");
    });
    sortedKeys.forEach((type) => {
      const section = document.createElement("section");
      section.className = "template-panel-group";
      const heading = document.createElement("h3");
      heading.textContent = type;
      section.appendChild(heading);
      const grid = document.createElement("ul");
      grid.className = "template-panel-list";
      grouped
        .get(type)
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, "de"))
        .forEach((template) => {
          const item = document.createElement("li");
          item.className = "template-panel-item";
          const card = document.createElement("article");
          card.className = "template-panel-card";
          card.draggable = true;
          card.dataset.templateId = template.id;

          const title = document.createElement("h4");
          title.textContent = template.title;
          card.appendChild(title);

          if (template.tags && template.tags.length > 0) {
            const tags = document.createElement("ul");
            tags.className = "tag-list template-panel-tags";
            template.tags.forEach((tag) => {
              const tagItem = document.createElement("li");
              tagItem.textContent = tag;
              tags.appendChild(tagItem);
            });
            card.appendChild(tags);
          }

          const preview = document.createElement("pre");
          preview.className = "template-panel-preview";
          preview.textContent = template.content;
          card.appendChild(preview);

          const actions = document.createElement("div");
          actions.className = "template-panel-actions";
          const insertButton = document.createElement("button");
          insertButton.type = "button";
          insertButton.className = "ghost-button";
          insertButton.textContent = "Einfügen";
          insertButton.addEventListener("click", () => insertTemplate(template));
          actions.appendChild(insertButton);
          card.appendChild(actions);

          card.addEventListener("dragstart", (event) => handleDragStart(event, template));

          item.appendChild(card);
          grid.appendChild(item);
        });
      section.appendChild(grid);
      fragment.appendChild(section);
    });
    list.appendChild(fragment);
  };

  const refresh = () => {
    templates = loadTemplates();
    render();
  };

  searchInput?.addEventListener("input", (event) => {
    query = normalizeQuery(event.target.value);
    render();
  });

  window.addEventListener("nextplanner:templates-updated", refresh);
  window.addEventListener("storage", (event) => {
    if (event.key && event.key !== "swimPlanner.templates.v1") {
      return;
    }
    refresh();
  });

  render();

  return {
    refresh,
  };
}
