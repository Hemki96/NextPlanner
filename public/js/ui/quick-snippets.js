import {
  getQuickSnippets,
  saveQuickSnippets,
  sanitizeQuickSnippetGroups,
  QUICK_SNIPPET_STORAGE_KEY,
} from "../utils/snippet-storage.js";
import {
  fetchTeamLibrary,
  teamLibrarySupported,
} from "../utils/snippet-library-client.js";

function ensureTrailingNewlines(text, minCount) {
  const match = text.match(/\n+$/);
  const existing = match ? match[0].length : 0;
  if (existing >= minCount) {
    return text;
  }
  return text + "\n".repeat(minCount - existing);
}

function applySnippet(textarea, item) {
  const { selectionStart = 0, selectionEnd = 0, value = "" } = textarea;
  let before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  if (item.ensureLineBreakBefore && before && !before.endsWith("\n")) {
    before += "\n";
  }

  let insertion = item.snippet;
  if (item.appendNewline) {
    insertion = ensureTrailingNewlines(insertion, 1);
  }
  if (item.ensureBlankLineAfter) {
    insertion = ensureTrailingNewlines(insertion, 2);
  }

  const cursorOffset = item.cursorOffset ?? 0;
  const newValue = before + insertion + after;
  const cursorPosition = Math.min(
    Math.max(before.length + insertion.length + cursorOffset, 0),
    newValue.length
  );

  textarea.value = newValue;
  textarea.focus();
  textarea.setSelectionRange(cursorPosition, cursorPosition);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function initQuickSnippets({ container, textarea }) {
  if (!container || !textarea) {
    return;
  }

  let snippetGroups = getQuickSnippets();
  let serializedGroups = JSON.stringify(snippetGroups);

  function render(groups) {
    container.innerHTML = "";

    groups.forEach((group, groupIndex) => {
      const groupEl = document.createElement("section");
      groupEl.className = "quick-snippet-group";

      const heading = document.createElement("h4");
      heading.textContent = group.title;
      groupEl.appendChild(heading);

      if (group.description) {
        const description = document.createElement("p");
        description.className = "quick-snippet-description";
        description.textContent = group.description;
        groupEl.appendChild(description);
      }

      const buttonRow = document.createElement("div");
      buttonRow.className = "quick-snippet-buttons";

      group.items.forEach((item, itemIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quick-snippet-button";
        button.textContent = item.label;
        button.dataset.groupIndex = String(groupIndex);
        button.dataset.itemIndex = String(itemIndex);
        button.title = `Baustein "${item.label}" einfügen`;
        buttonRow.appendChild(button);
      });

      groupEl.appendChild(buttonRow);
      container.appendChild(groupEl);
    });

    serializedGroups = JSON.stringify(groups);
  }

  function updateGroups(groups) {
    const sanitized = sanitizeQuickSnippetGroups(groups);
    const serializedNext = JSON.stringify(sanitized);
    if (serializedNext === serializedGroups) {
      return;
    }

    snippetGroups = sanitized;
    render(snippetGroups);
  }

  async function syncTeamLibrary() {
    if (!teamLibrarySupported()) {
      return;
    }

    try {
      const { groups } = await fetchTeamLibrary();
      const sanitized = sanitizeQuickSnippetGroups(groups);
      const serializedCurrent = JSON.stringify(snippetGroups);
      const serializedIncoming = JSON.stringify(sanitized);
      if (serializedCurrent === serializedIncoming) {
        return;
      }
      snippetGroups = sanitized;
      saveQuickSnippets(snippetGroups);
      render(snippetGroups);
    } catch (error) {
      console.warn("Team-Schnellbausteine konnten nicht geladen werden.", error);
    }
  }

  render(snippetGroups);
  syncTeamLibrary();

  if (typeof window !== "undefined") {
    window.addEventListener("quickSnippetsUpdated", (event) => {
      const groups = event?.detail?.groups;
      if (!groups) {
        updateGroups(getQuickSnippets());
        return;
      }

      updateGroups(groups);
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== QUICK_SNIPPET_STORAGE_KEY) {
        return;
      }

      updateGroups(getQuickSnippets());
    });
  }

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const groupIndex = Number.parseInt(target.dataset.groupIndex ?? "", 10);
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);

    const group = Number.isNaN(groupIndex)
      ? undefined
      : snippetGroups[groupIndex];
    const item = group && !Number.isNaN(itemIndex) ? group.items[itemIndex] : undefined;

    if (!item) {
      return;
    }

    applySnippet(textarea, item);
  });
}
