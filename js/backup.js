import { apiRequest, describeApiError } from "./utils/apiClient.js";

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
    setStatus(
      restoreStatus,
      "warning",
      message || "Die Sicherung konnte nicht eingespielt werden."
    );
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
