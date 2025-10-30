const THEME_STORAGE_KEY = "nextplanner-theme";
const THEME_DARK = "dark";
const THEME_LIGHT = "light";

const listeners = new Set();
let currentTheme = getDocumentTheme();

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === THEME_DARK || stored === THEME_LIGHT) {
      return stored;
    }
  } catch (error) {
    /* Storage might be unavailable (private mode, etc.) */
  }
  return null;
}

function writeStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    /* ignore write errors */
  }
}

function getDocumentTheme() {
  return document.documentElement.dataset.theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
}

function updateDocumentTheme(theme) {
  if (theme === THEME_DARK) {
    document.documentElement.dataset.theme = THEME_DARK;
  } else {
    delete document.documentElement.dataset.theme;
  }
  currentTheme = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
}

function notifyThemeChange(theme) {
  listeners.forEach((listener) => {
    try {
      listener(theme);
    } catch (error) {
      /* ignore listener errors */
    }
  });
}

function applyTheme(theme, { notify = true } = {}) {
  const normalized = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  const previousTheme = currentTheme;
  updateDocumentTheme(normalized);
  if (notify && normalized !== previousTheme) {
    notifyThemeChange(normalized);
  }
  return normalized;
}

export function getThemePreference() {
  return readStoredTheme();
}

export function getCurrentTheme() {
  return currentTheme;
}

export function setThemePreference(theme) {
  const normalized = applyTheme(theme);
  writeStoredTheme(normalized);
  return normalized;
}

export function subscribeToTheme(listener) {
  if (typeof listener === "function") {
    listeners.add(listener);
    listener(currentTheme);
  }
  return () => {
    listeners.delete(listener);
  };
}

function handleStorage(event) {
  if (event.key !== THEME_STORAGE_KEY) {
    return;
  }
  if (event.newValue === null) {
    syncWithSystemPreference();
    return;
  }
  if (event.newValue === THEME_DARK || event.newValue === THEME_LIGHT) {
    applyTheme(event.newValue);
  }
}

function syncWithSystemPreference() {
  const stored = readStoredTheme();
  if (stored === THEME_DARK || stored === THEME_LIGHT) {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? THEME_DARK : THEME_LIGHT);
}

const systemMediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

if (systemMediaQuery) {
  const handleSystemChange = () => {
    if (readStoredTheme() === null) {
      syncWithSystemPreference();
    }
  };

  if (typeof systemMediaQuery.addEventListener === "function") {
    systemMediaQuery.addEventListener("change", handleSystemChange);
  } else if (typeof systemMediaQuery.addListener === "function") {
    systemMediaQuery.addListener(handleSystemChange);
  }
}

window.addEventListener("storage", handleStorage);

// Initialise theme as soon as the module loads.
const storedTheme = readStoredTheme();
if (storedTheme === THEME_DARK || storedTheme === THEME_LIGHT) {
  applyTheme(storedTheme, { notify: false });
} else {
  const initialTheme = getDocumentTheme() === THEME_DARK ? THEME_DARK : (systemMediaQuery && systemMediaQuery.matches ? THEME_DARK : THEME_LIGHT);
  applyTheme(initialTheme, { notify: false });
}

export function resetThemePreference() {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch (error) {
    /* ignore errors */
  }
  syncWithSystemPreference();
}
