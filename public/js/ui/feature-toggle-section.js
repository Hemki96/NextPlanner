import {
  FEATURE_DEFINITIONS,
  applyFeatureVisibility,
  getFeatureSettings,
  resetFeatureSettings,
  setFeatureEnabled,
  subscribeToFeatureSettings,
} from "../utils/feature-settings.js";

function createFeatureToggleElement(feature, enabled, statusId) {
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
  const describedBy = [descriptionId, statusId].filter(Boolean).join(" ");
  checkbox.setAttribute("aria-describedby", describedBy);

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

export function initFeatureToggleSection({
  listElement,
  statusElement,
  resetButton,
  root = document,
  onSettingsChange,
} = {}) {
  if (!listElement) {
    if (typeof onSettingsChange === "function") {
      onSettingsChange(getFeatureSettings());
    }
    return () => {};
  }

  let statusTimeout = null;
  const rootNode = root ?? document;

  function setStatus(type, message) {
    if (!statusElement) {
      return;
    }
    if (!message) {
      statusElement.textContent = "";
      delete statusElement.dataset.statusType;
      if (statusTimeout) {
        window.clearTimeout(statusTimeout);
        statusTimeout = null;
      }
      return;
    }
    statusElement.textContent = message;
    statusElement.dataset.statusType = type;
    if (statusTimeout) {
      window.clearTimeout(statusTimeout);
    }
    statusTimeout = window.setTimeout(() => {
      if (statusElement.textContent === message) {
        statusElement.textContent = "";
        delete statusElement.dataset.statusType;
      }
    }, 4000);
  }

  function render(settings = getFeatureSettings()) {
    listElement.innerHTML = "";
    FEATURE_DEFINITIONS.forEach((feature) => {
      const enabled = settings[feature.key] !== false;
      listElement.appendChild(createFeatureToggleElement(feature, enabled, statusElement?.id));
    });
    if (typeof onSettingsChange === "function") {
      onSettingsChange({ ...settings });
    }
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
    applyFeatureVisibility(rootNode, updatedSettings);
    updateToggleStateLabel(target);
    const featureLabel = FEATURE_DEFINITIONS.find((feature) => feature.key === featureKey)?.label ?? "Funktion";
    setStatus(
      "success",
      target.checked ? `${featureLabel} aktiviert.` : `${featureLabel} deaktiviert.`,
    );
  }

  function handleFeatureReset() {
    const defaults = resetFeatureSettings();
    render(defaults);
    applyFeatureVisibility(rootNode, defaults);
    setStatus("info", "Alle Funktionen wurden reaktiviert.");
  }

  render();
  applyFeatureVisibility(rootNode);
  const unsubscribe = subscribeToFeatureSettings((settings) => {
    render(settings);
    applyFeatureVisibility(rootNode, settings);
  });

  listElement.addEventListener("change", handleFeatureChange);
  if (resetButton) {
    resetButton.addEventListener("click", handleFeatureReset);
  }

  return () => {
    listElement.removeEventListener("change", handleFeatureChange);
    if (resetButton) {
      resetButton.removeEventListener("click", handleFeatureReset);
    }
    if (statusTimeout) {
      window.clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    unsubscribe();
  };
}
