const STORAGE_KEY = "swimPlanner.quickSnippets.v1";

export const defaultQuickSnippetGroups = [
  {
    title: "Blöcke",
    description:
      "Setze Abschnittsüberschriften für Warm-up, Hauptsatz oder Technikblöcke.",
    items: [
      {
        label: "Warm-up",
        snippet: "## Warm-up",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Technikfokus",
        snippet: "## Technikfokus",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Hauptsatz",
        snippet: "## Hauptsatz",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Cool-down",
        snippet: "## Cool-down",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
    ],
  },
  {
    title: "Runden & Wiederholungen",
    description:
      "Strukturiere Sets mit Rundenschleifen oder markiere das Ende.",
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

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function hasLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch (error) {
    return false;
  }
}

function sanitizeGroups(candidate) {
  if (!Array.isArray(candidate)) {
    return cloneData(defaultQuickSnippetGroups);
  }

  const groups = candidate
    .map((group) => {
      if (!group || typeof group !== "object") {
        return null;
      }

      const title = typeof group.title === "string" ? group.title : "Gruppe";
      const description =
        typeof group.description === "string" ? group.description : "";

      const items = Array.isArray(group.items)
        ? group.items
            .map((item) => {
              if (!item || typeof item !== "object") {
                return null;
              }

              const label = typeof item.label === "string" ? item.label : "Baustein";
              const snippet = typeof item.snippet === "string" ? item.snippet : "";

              const ensureLineBreakBefore = Boolean(item.ensureLineBreakBefore);
              const appendNewline = Boolean(item.appendNewline);
              const ensureBlankLineAfter = Boolean(item.ensureBlankLineAfter);
              const cursorOffset = Number.isFinite(Number(item.cursorOffset))
                ? Number(item.cursorOffset)
                : 0;

              return {
                label,
                snippet,
                ensureLineBreakBefore,
                appendNewline,
                ensureBlankLineAfter,
                cursorOffset,
              };
            })
            .filter(Boolean)
        : [];

      return {
        title,
        description,
        items,
      };
    })
    .filter(Boolean)
    .filter((group) => group.items.length > 0 || group.title.trim().length > 0);

  return groups.length > 0 ? groups : cloneData(defaultQuickSnippetGroups);
}

export function getQuickSnippets() {
  if (!hasLocalStorage()) {
    return cloneData(defaultQuickSnippetGroups);
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return cloneData(defaultQuickSnippetGroups);
  }

  try {
    const parsed = JSON.parse(stored);
    return sanitizeGroups(parsed);
  } catch (error) {
    return cloneData(defaultQuickSnippetGroups);
  }
}

export function saveQuickSnippets(groups) {
  if (!hasLocalStorage()) {
    return;
  }

  const sanitized = sanitizeGroups(groups);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export function resetQuickSnippets() {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
