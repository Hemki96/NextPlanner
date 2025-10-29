const STORAGE_KEY = "nextplanner.highlightSettings.v1";
const EVENT_NAME = "nextplanner:highlight-settings-changed";

export const HIGHLIGHT_OPTION_DEFINITIONS = [
  {
    key: "heading",
    label: "Überschriften",
    description: "Hebt Markdown-ähnliche Überschriften (z.\u202fB. ## Hauptsatz) im Editor hervor.",
  },
  {
    key: "distance",
    label: "Umfang & Wiederholungen",
    description: "Markiert Angaben wie 4x50m oder 200m und hebt Wiederholungsblöcke hervor.",
  },
  {
    key: "round",
    label: "Rundenzähler",
    description: "Kennzeichnet Rundenangaben wie 3 Runden: oder Runde x 2.",
  },
  {
    key: "interval",
    label: "Abgangszeiten",
    description: "Hebt Zeitvorgaben im Format @ 1:30 oder @0:45 hervor.",
  },
  {
    key: "equipment",
    label: "Material",
    description: "Markiert Materialhinweise hinter w/ wie z.\u202fB. w/ Pullbuoy oder w/ Flossen.",
  },
  {
    key: "intensity",
    label: "Intensitätscodes",
    description: "Färbt bekannte Intensitätskürzel wie ORANGE8, PINK4 oder CLEAR ein.",
  },
];

const defaultSettings = HIGHLIGHT_OPTION_DEFINITIONS.reduce((accumulator, option) => {
  return {
    ...accumulator,
    [option.key]: { enabled: true },
  };
}, {});

function cloneSettings(settings) {
  return Object.fromEntries(
    Object.entries(settings ?? {}).map(([key, value]) => [
      key,
      {
        enabled: Boolean(value?.enabled ?? value),
      },
    ]),
  );
}

function normalizeSettings(settings) {
  return { ...cloneSettings(defaultSettings), ...cloneSettings(settings) };
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Lokaler Speicher für Highlight-Einstellungen nicht verfügbar.", error);
    return null;
  }
}

function parseStoredSettings(rawValue) {
  if (!rawValue) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.warn("Highlight-Einstellungen konnten nicht gelesen werden.", error);
  }
  return {};
}

function dispatchChange(settings) {
  if (typeof window === "undefined") {
    return;
  }
  const event = new CustomEvent(EVENT_NAME, {
    detail: { settings: cloneSettings(settings) },
  });
  window.dispatchEvent(event);
}

export function getHighlightSettings() {
  const storage = getStorage();
  if (!storage) {
    return cloneSettings(defaultSettings);
  }
  const stored = parseStoredSettings(storage.getItem(STORAGE_KEY));
  return normalizeSettings(stored);
}

export function getDefaultHighlightSettings() {
  return cloneSettings(defaultSettings);
}

export function saveHighlightSettings(settings) {
  const normalized = normalizeSettings(settings);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.warn("Highlight-Einstellungen konnten nicht gespeichert werden.", error);
    }
  }
  dispatchChange(normalized);
  return cloneSettings(normalized);
}

export function setHighlightEnabled(key, enabled) {
  if (!key) {
    return getHighlightSettings();
  }
  const current = getHighlightSettings();
  const next = {
    ...current,
    [key]: { enabled: Boolean(enabled) },
  };
  return saveHighlightSettings(next);
}

export function resetHighlightSettings() {
  return saveHighlightSettings(getDefaultHighlightSettings());
}

export function isHighlightEnabled(settings, key) {
  const value = settings?.[key];
  if (typeof value === "boolean") {
    return value;
  }
  return value?.enabled !== false;
}

export function subscribeToHighlightSettings(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event) => {
    if (typeof callback === "function") {
      callback(event.detail?.settings ?? getHighlightSettings());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      dispatchChange(getHighlightSettings());
    }
  });
}
