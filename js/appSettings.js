import { apiRequest, describeApiError } from "./utils/apiClient.js";
import {
  FEATURE_DEFINITIONS,
  applyFeatureVisibility,
  getFeatureSettings,
  resetFeatureSettings,
  setFeatureEnabled,
  subscribeToFeatureSettings,
} from "./utils/featureSettings.js";

const featureList = document.getElementById("feature-settings-list");
const featureStatus = document.getElementById("feature-settings-status");
const featureResetButton = document.getElementById("feature-settings-reset");
let featureStatusTimeout = null;

const downloadButton = document.getElementById("download-backup");
const backupStatus = document.getElementById("backup-status");
const restoreForm = document.getElementById("restore-form");
const restoreFileInput = document.getElementById("restore-file");
const restoreFileName = document.getElementById("restore-file-name");
const restoreStatus = document.getElementById("restore-status");
const restoreSubmit = document.getElementById("restore-submit");
const restoreReset = document.getElementById("restore-reset");

function setStatus(element, type, message) {
  if (!element) {
    return;
  }
  if (!message) {
    element.textContent = "";
    delete element.dataset.statusType;
    return;
  }
  element.textContent = message;
  element.dataset.statusType = type;
}

function updateToggleStateLabel(checkbox) {
  const label = checkbox?.closest("label");
  if (!label) {
    return;
  }
  const state = label.querySelector(".feature-toggle-state");
  if (state) {
    state.textContent = checkbox.checked ? "Aktiv" : "Inaktiv";
  }
}

function createFeatureToggle(feature, enabled) {
  const item = document.createElement("li");
  item.className = "feature-toggle";
  item.dataset.featureKey = feature.key;

  const info = document.createElement("div");
  info.className = "feature-toggle-info";

  const heading = document.createElement("h3");
  heading.className = "feature-toggle-title";
  const headingId = `feature-toggle-${feature.key}-title`;
  heading.id = headingId;
  heading.textContent = feature.label;
  info.appendChild(heading);

  const description = document.createElement("p");
  description.className = "feature-toggle-description";
  const descriptionId = `feature-toggle-${feature.key}-description`;
  description.id = descriptionId;
  description.textContent = feature.description;
  info.appendChild(description);

  const control = document.createElement("div");
  control.className = "feature-toggle-control";

  const label = document.createElement("label");
  label.className = "feature-toggle-switch";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "feature-toggle-input";
  checkbox.checked = enabled;
  checkbox.dataset.featureKey = feature.key;
  checkbox.setAttribute("aria-labelledby", headingId);
  checkbox.setAttribute("aria-describedby", descriptionId);

  const slider = document.createElement("span");
  slider.className = "feature-toggle-slider";
  slider.setAttribute("aria-hidden", "true");

  const state = document.createElement("span");
  state.className = "feature-toggle-state";
  state.textContent = enabled ? "Aktiv" : "Inaktiv";

  label.append(checkbox, slider, state);
  control.append(label);

  item.append(info, control);
  return item;
}

function renderFeatureToggles(settings = getFeatureSettings()) {
  if (!featureList) {
    return;
  }
  featureList.innerHTML = "";
  FEATURE_DEFINITIONS.forEach((feature) => {
    const enabled = settings[feature.key] !== false;
    const toggle = createFeatureToggle(feature, enabled);
    featureList.appendChild(toggle);
  });
}

function handleFeatureChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }
  const featureKey = target.dataset.featureKey;
  if (!featureKey) {
    return;
  }
  const updatedSettings = setFeatureEnabled(featureKey, target.checked);
  applyFeatureVisibility(document, updatedSettings);
  updateToggleStateLabel(target);
  setStatus(
    featureStatus,
    "success",
    target.checked
      ? `${FEATURE_DEFINITIONS.find((f) => f.key === featureKey)?.label ?? "Funktion"} aktiviert.`
      : `${FEATURE_DEFINITIONS.find((f) => f.key === featureKey)?.label ?? "Funktion"} deaktiviert.`
  );
  if (featureStatusTimeout) {
    window.clearTimeout(featureStatusTimeout);
  }
  featureStatusTimeout = window.setTimeout(() => {
    setStatus(featureStatus, "info", "");
  }, 4000);
}

function handleFeatureReset() {
  const defaults = resetFeatureSettings();
  renderFeatureToggles(defaults);
  applyFeatureVisibility(document, defaults);
  setStatus(featureStatus, "info", "Alle Funktionen wurden reaktiviert.");
  if (featureStatusTimeout) {
    window.clearTimeout(featureStatusTimeout);
  }
  featureStatusTimeout = window.setTimeout(() => {
    setStatus(featureStatus, "info", "");
  }, 4000);
}

function initFeatureControls() {
  if (!featureList) {
    return;
  }
  renderFeatureToggles();
  featureList.addEventListener("change", handleFeatureChange);
  if (featureResetButton) {
    featureResetButton.addEventListener("click", handleFeatureReset);
  }
  applyFeatureVisibility(document);
  subscribeToFeatureSettings((settings) => {
    renderFeatureToggles(settings);
    applyFeatureVisibility(document, settings);
  });
}

function formatPlanCount(count) {
  if (typeof count !== "number" || Number.isNaN(count)) {
    return "0 Trainingspläne";
  }
  return count === 1 ? "1 Trainingsplan" : `${count} Trainingspläne`;
}

function createDownloadFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `nextplanner-backup-${timestamp}.json`;
}

async function handleDownloadBackup() {
  if (!downloadButton) {
    return;
  }
  downloadButton.disabled = true;
  setStatus(backupStatus, "info", "Sicherung wird erstellt …");
  try {
    const { data } = await apiRequest("/api/storage/backup", { timeout: 15000 });
    const serialized = JSON.stringify(data, null, 2);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createDownloadFileName();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const planCount = typeof data?.planCount === "number" ? data.planCount : data?.data?.plans?.length ?? 0;
    setStatus(backupStatus, "success", `Sicherung mit ${formatPlanCount(planCount)} wurde heruntergeladen.`);
  } catch (error) {
    const message = describeApiError(error);
    setStatus(backupStatus, "warning", message || "Die Sicherung konnte nicht erstellt werden.");
  } finally {
    downloadButton.disabled = false;
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error("Die Sicherungsdatei konnte nicht gelesen werden."));
    };
    reader.readAsText(file);
  });
}

function resetRestoreForm() {
  if (!restoreFileInput) {
    return;
  }
  restoreFileInput.value = "";
  if (restoreFileName) {
    restoreFileName.textContent = "";
  }
}

async function handleRestoreSubmit(event) {
  event.preventDefault();
  if (!restoreFileInput || !restoreSubmit) {
    return;
  }
  const [file] = restoreFileInput.files ?? [];
  if (!file) {
    setStatus(restoreStatus, "warning", "Bitte wähle eine Sicherungsdatei aus.");
    return;
  }

  restoreSubmit.disabled = true;
  if (restoreReset) {
    restoreReset.disabled = true;
  }
  setStatus(restoreStatus, "info", "Sicherung wird eingespielt …");

  try {
    const text = await readFileAsText(file);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      throw new Error("Die Datei enthält keine gültige JSON-Sicherung.");
    }

    const { data } = await apiRequest("/api/storage/restore", {
      method: "POST",
      json: payload,
      timeout: 20000,
    });

    const restoredPlans = typeof data?.planCount === "number" ? data.planCount : 0;
    setStatus(
      restoreStatus,
      "success",
      `Die Sicherung wurde erfolgreich eingespielt (${formatPlanCount(restoredPlans)}).`
    );
    resetRestoreForm();
  } catch (error) {
    const message = describeApiError(error) || error.message;
    setStatus(restoreStatus, "warning", message || "Die Sicherung konnte nicht eingespielt werden.");
  } finally {
    if (restoreSubmit) {
      restoreSubmit.disabled = false;
    }
    if (restoreReset) {
      restoreReset.disabled = false;
    }
  }
}

function handleRestoreReset() {
  resetRestoreForm();
  setStatus(restoreStatus, "info", "Auswahl wurde zurückgesetzt.");
}

initFeatureControls();

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    handleDownloadBackup().catch((error) => {
      console.error("Fehler beim Erstellen der Sicherung", error);
      setStatus(backupStatus, "warning", "Die Sicherung konnte nicht erstellt werden.");
    });
  });
}

if (restoreFileInput && restoreFileName) {
  restoreFileInput.addEventListener("change", () => {
    const [file] = restoreFileInput.files ?? [];
    restoreFileName.textContent = file ? `Ausgewählt: ${file.name}` : "";
  });
}

if (restoreForm) {
  restoreForm.addEventListener("submit", (event) => {
    handleRestoreSubmit(event).catch((error) => {
      console.error("Fehler beim Wiederherstellen der Sicherung", error);
      setStatus(restoreStatus, "warning", "Die Sicherung konnte nicht eingespielt werden.");
    });
  });
}

if (restoreReset) {
  restoreReset.addEventListener("click", () => {
    handleRestoreReset();
  });
}
