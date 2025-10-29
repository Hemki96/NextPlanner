const STORAGE_KEY = "nextplanner.featureSettings.v1";
const EVENT_NAME = "nextplanner:feature-settings-changed";

export const FEATURE_DEFINITIONS = [
  {
    key: "quickSnippets",
    label: "Schnellbausteine",
    description: "Steuert die Schnellbaustein-Leiste im Planner sowie die zugehörige Einstellungsseite.",
  },
  {
    key: "plannerTools",
    label: "Plan-Builder-Tools",
    description:
      "Aktiviert Funktionen wie Import, Export, Plan speichern sowie das Erfassen neuer Vorlagen im Planner.",
  },
  {
    key: "templateLibrary",
    label: "Vorlagenbibliothek",
    description: "Blendet die Vorlagen-Seite und das Vorlagenpanel im Planner ein oder aus.",
  },
  {
    key: "syntaxValidation",
    label: "Syntax-Prüfung",
    description: "Zeigt Hinweise zur Syntaxqualität unterhalb des Editors im Planner an.",
  },
  {
    key: "insightsPanel",
    label: "Zusammenfassungen & Kennzahlen",
    description: "Blendet die Auswertungen zum Trainingsplan im rechten Seitenbereich des Planners ein oder aus.",
  },
  {
    key: "calendarView",
    label: "Plan-Kalender",
    description: "Steuert die Anzeige des Kalenders für gespeicherte Trainingspläne.",
  },
  {
    key: "teamLibrary",
    label: "Team-Bibliothek",
    description: "Schaltet die Synchronisation der Schnellbausteine über den lokalen Server frei.",
  },
];

const defaultSettings = FEATURE_DEFINITIONS.reduce((accumulator, feature) => {
  return { ...accumulator, [feature.key]: true };
}, {});

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Lokaler Speicher für Feature-Einstellungen nicht verfügbar.", error);
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
    console.warn("Feature-Einstellungen konnten nicht gelesen werden.", error);
  }
  return {};
}

export function getFeatureSettings() {
  const storage = getStorage();
  if (!storage) {
    return { ...defaultSettings };
  }
  const stored = parseStoredSettings(storage.getItem(STORAGE_KEY));
  return { ...defaultSettings, ...stored };
}

export function getDefaultFeatureSettings() {
  return { ...defaultSettings };
}

function dispatchChange(settings) {
  if (typeof window === "undefined") {
    return;
  }
  const event = new CustomEvent(EVENT_NAME, {
    detail: { settings: { ...settings } },
  });
  window.dispatchEvent(event);
}

export function saveFeatureSettings(settings) {
  const storage = getStorage();
  const normalized = { ...defaultSettings, ...settings };
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.warn("Feature-Einstellungen konnten nicht gespeichert werden.", error);
    }
  }
  dispatchChange(normalized);
  return normalized;
}

export function setFeatureEnabled(key, enabled) {
  if (!key) {
    return getFeatureSettings();
  }
  const current = getFeatureSettings();
  const next = { ...current, [key]: Boolean(enabled) };
  return saveFeatureSettings(next);
}

export function resetFeatureSettings() {
  return saveFeatureSettings(getDefaultFeatureSettings());
}

export function subscribeToFeatureSettings(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event) => {
    if (typeof callback === "function") {
      callback(event.detail?.settings ?? getFeatureSettings());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function applyFeatureVisibility(root = document, settings = null) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }
  const effectiveSettings = settings ?? getFeatureSettings();
  root.querySelectorAll("[data-feature]").forEach((element) => {
    const featureKey = element.getAttribute("data-feature");
    if (!featureKey) {
      return;
    }
    const enabled = effectiveSettings[featureKey] !== false;
    if (element.dataset.featureKeepSpace === "true") {
      element.classList.toggle("is-feature-disabled", !enabled);
      if (!enabled) {
        element.setAttribute("data-feature-disabled", "true");
      } else {
        element.removeAttribute("data-feature-disabled");
      }
      return;
    }
    if (!enabled) {
      element.setAttribute("hidden", "");
      element.setAttribute("aria-hidden", "true");
    } else {
      element.removeAttribute("hidden");
      element.removeAttribute("aria-hidden");
    }
  });
}
