const PLAN_DRAFT_STORAGE_KEY = "nextplanner.plan.draft";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Plan-Entwürfe können nicht im lokalen Speicher gesichert werden.", error);
    return null;
  }
}

export function loadPlanDraft() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const stored = storage.getItem(PLAN_DRAFT_STORAGE_KEY);
    if (typeof stored === "string" && stored.length > 0) {
      return stored;
    }
  } catch (error) {
    console.warn("Gespeicherter Plan-Entwurf konnte nicht geladen werden.", error);
  }
  return null;
}

export function savePlanDraft(text) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  const value = typeof text === "string" ? text : "";
  try {
    if (value.trim().length === 0) {
      storage.removeItem(PLAN_DRAFT_STORAGE_KEY);
    } else {
      storage.setItem(PLAN_DRAFT_STORAGE_KEY, value);
    }
    return true;
  } catch (error) {
    console.warn("Plan-Entwurf konnte nicht gespeichert werden.", error);
    return false;
  }
}

export function clearPlanDraft() {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.removeItem(PLAN_DRAFT_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn("Plan-Entwurf konnte nicht gelöscht werden.", error);
    return false;
  }
}
