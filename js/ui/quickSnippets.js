const snippetGroups = [
  {
    title: "Blöcke",
    description: "Setze Abschnittsüberschriften für Warm-up, Hauptsatz oder Technikblöcke.",
    items: [
      {
        label: "Warm-up",
        snippet: "## Warm-up",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
      {
        label: "Technikfokus",
        snippet: "## Technikfokus",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
      {
        label: "Hauptsatz",
        snippet: "## Hauptsatz",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
      {
        label: "Cool-down",
        snippet: "## Cool-down",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
    ],
  },
  {
    title: "Runden & Wiederholungen",
    description: "Strukturiere Sets mit Rundenschleifen oder markiere das Ende.",
    items: [
      {
        label: "3 Runden",
        snippet: "3 Runden:",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Runde x3",
        snippet: "Runde x3",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Ende Runde",
        snippet: "Ende Runde",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
    ],
  },
  {
    title: "Material",
    description: "Häufig genutztes Equipment schnell ergänzen.",
    items: [
      {
        label: "Pullbuoy",
        snippet: " w/ Pullbuoy",
      },
      {
        label: "Paddles",
        snippet: " w/ Paddles",
      },
      {
        label: "Flossen",
        snippet: " w/ Flossen",
      },
      {
        label: "Schnorchel",
        snippet: " w/ Schnorchel",
      },
    ],
  },
  {
    title: "Intensitäten",
    description: "Markiere die Belastungsstufe innerhalb eines Sets.",
    items: [
      {
        label: "CLEAR",
        snippet: " CLEAR",
      },
      {
        label: "PINK4",
        snippet: " PINK4",
      },
      {
        label: "RED6",
        snippet: " RED6",
      },
      {
        label: "ORANGE8",
        snippet: " ORANGE8",
      },
      {
        label: "BLUE9",
        snippet: " BLUE9",
      },
      {
        label: "GOLD",
        snippet: " GOLD",
      },
    ],
  },
  {
    title: "Abgang & Pausen",
    description: "Intervalle und Regenerationszeiten hinzufügen.",
    items: [
      {
        label: "@1:30",
        snippet: " @1:30",
      },
      {
        label: "@2:00",
        snippet: " @2:00",
      },
      {
        label: "P:00:20",
        snippet: "P:00:20",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "P:00:30",
        snippet: "P:00:30",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "P:01:00",
        snippet: "P:01:00",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
    ],
  },
  {
    title: "Beschreibungen",
    description: "Optionaler Kontext für Technik- oder Belastungsschwerpunkte.",
    items: [
      {
        label: "Locker ausschwimmen",
        snippet: "Locker ausschwimmen",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Technik: Hoher Ellbogen",
        snippet: "Technik: Fokus auf hohen Ellbogen",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Sprintbetonung",
        snippet: "Sprintbetont, max. Tempo",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
    ],
  },
];

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

  container.innerHTML = "";

  snippetGroups.forEach((group, groupIndex) => {
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
      button.title = `Baustein \"${item.label}\" einfügen`;
      buttonRow.appendChild(button);
    });

    groupEl.appendChild(buttonRow);
    container.appendChild(groupEl);
  });

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const groupIndex = Number.parseInt(target.dataset.groupIndex ?? "", 10);
    const itemIndex = Number.parseInt(target.dataset.itemIndex ?? "", 10);

    const group = Number.isNaN(groupIndex) ? undefined : snippetGroups[groupIndex];
    const item = group && !Number.isNaN(itemIndex) ? group.items[itemIndex] : undefined;

    if (!item) {
      return;
    }

    applySnippet(textarea, item);
  });
}
