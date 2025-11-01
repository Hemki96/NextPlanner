export const QUICK_SNIPPET_STORAGE_KEY = "swimPlanner.quickSnippets.v1";

export const defaultQuickSnippetGroups = [
  {
    title: "Phasen & Überschriften",
    description:
      "Bereite typische Trainingsabschnitte mit passenden Überschriften vor.",
    items: [
      {
        label: "Warm-up",
        snippet: "## Warm-up",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
      {
        label: "Technikblock",
        snippet: "## Technikblock – Fokus: ____",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
        cursorOffset: -4,
      },
      {
        label: "Hauptsatz",
        snippet: "## Hauptsatz",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
      {
        label: "Sprintserie",
        snippet: "## Sprintserie",
        ensureLineBreakBefore: true,
        ensureBlankLineAfter: true,
      },
      {
        label: "Staffel-Block",
        snippet: "## Staffel-Block",
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
    title: "Technik & Variationen",
    description: "Füge gezielte Drills und Varianten mit Platzhaltern ein.",
    items: [
      {
        label: "Technik-Platzhalter",
        snippet: "* Technik: ____",
        ensureLineBreakBefore: true,
        appendNewline: true,
        cursorOffset: -4,
      },
      {
        label: "Drill: Catch-Up",
        snippet: "* Drill: Catch-Up – Fokus auf Streckung",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Drill: Beinschlag",
        snippet: "* Drill: Beinschlag mit Brett (nur Kicks)",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Drill: Lagenwechsel",
        snippet: "* Drill: Lagenwechsel – jede Bahn andere Lage",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
    ],
  },
  {
    title: "Runden & Wiederholungen",
    description: "Strukturiere Serien mit Wiederholungen oder Leitern.",
    items: [
      {
        label: "3× (Distanz & Abgang)",
        snippet: "3× (____ m @____)",
        ensureLineBreakBefore: true,
        appendNewline: true,
        cursorOffset: -12,
      },
      {
        label: "4× Progression",
        snippet: "4× ____ m – jede Runde schneller",
        ensureLineBreakBefore: true,
        appendNewline: true,
        cursorOffset: -28,
      },
      {
        label: "Leiter aufwärts",
        snippet: "Leiter: 4×50 / 3×100 / 2×150 / 1×200",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Serie abschließen",
        snippet: "Ende der Serie – locker 100m",
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
      {
        label: "Tool-Platzhalter",
        snippet: " w/ ____",
        cursorOffset: -4,
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
        label: "Abgang @1:30",
        snippet: " @1:30",
      },
      {
        label: "Abgang Platzhalter",
        snippet: " @__:__",
        cursorOffset: -5,
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
        label: "Pause Platzhalter",
        snippet: "P:00:__",
        ensureLineBreakBefore: true,
        appendNewline: true,
        cursorOffset: -2,
      },
    ],
  },
  {
    title: "Coaching-Hinweise",
    description:
      "Gib Kontext zu Belastung, Technikschwerpunkt oder gewünschten Effekten.",
    items: [
      {
        label: "Locker ausschwimmen",
        snippet: "Locker ausschwimmen, Technik sauber halten",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Technikfokus",
        snippet: "Technik: Fokus auf ____",
        ensureLineBreakBefore: true,
        appendNewline: true,
        cursorOffset: -4,
      },
      {
        label: "Ausdauerblock",
        snippet: "Ausdauerblock: ruhiges, gleichmäßiges Tempo halten",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
      {
        label: "Sprintbetonung",
        snippet: "Sprintbetont, max. Tempo – aktive Erholung danach",
        ensureLineBreakBefore: true,
        appendNewline: true,
      },
    ],
  },
];

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function dispatchQuickSnippetUpdate(groups) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  const detail = { groups: cloneData(groups) };
  window.dispatchEvent(new CustomEvent("quickSnippetsUpdated", { detail }));
}

function hasLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch (error) {
    return false;
  }
}

export function sanitizeQuickSnippetGroups(candidate, { allowEmpty = false } = {}) {
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

  if (groups.length > 0) {
    return groups;
  }

  return allowEmpty ? [] : cloneData(defaultQuickSnippetGroups);
}

export function getQuickSnippets() {
  if (!hasLocalStorage()) {
    return cloneData(defaultQuickSnippetGroups);
  }

  const stored = window.localStorage.getItem(QUICK_SNIPPET_STORAGE_KEY);
  if (!stored) {
    return cloneData(defaultQuickSnippetGroups);
  }

  try {
    const parsed = JSON.parse(stored);
    return sanitizeQuickSnippetGroups(parsed, { allowEmpty: true });
  } catch (error) {
    return cloneData(defaultQuickSnippetGroups);
  }
}

export function saveQuickSnippets(groups) {
  if (!hasLocalStorage()) {
    return;
  }

  const sanitized = sanitizeQuickSnippetGroups(groups, { allowEmpty: true });
  window.localStorage.setItem(QUICK_SNIPPET_STORAGE_KEY, JSON.stringify(sanitized));
  dispatchQuickSnippetUpdate(sanitized);
}

export function resetQuickSnippets() {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(QUICK_SNIPPET_STORAGE_KEY);
  dispatchQuickSnippetUpdate(defaultQuickSnippetGroups);
}
