const PREFS_STORAGE_KEY = "nextplanner.plan.save.dialog";

function readPreferences() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return {};
    }
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (error) {
    console.warn("Konnte Speicherpräferenzen nicht lesen", error);
    return {};
  }
}

function writePreferences(preferences) {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Konnte Speicherpräferenzen nicht schreiben", error);
  }
}

function deriveTitleSuggestion(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^#+\s+/.test(trimmed)) {
      return trimmed.replace(/^#+\s+/, "").trim();
    }
    if (trimmed.length > 8) {
      return trimmed.slice(0, 60);
    }
  }
  return "";
}

function toIsoDate(dateValue) {
  if (!dateValue) {
    return null;
  }
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function setStatus(element, message, type = "info") {
  if (!element) {
    return;
  }
  element.textContent = message;
  if (message) {
    element.dataset.statusType = type;
  } else {
    delete element.dataset.statusType;
  }
}

function clearStatus(element) {
  if (!element) {
    return;
  }
  element.textContent = "";
  delete element.dataset.statusType;
}

function formatDateForInput(date) {
  if (!date) {
    return "";
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function canUseApi() {
  if (typeof window === "undefined") {
    return false;
  }
  const protocol = window.location?.protocol;
  return protocol !== "file:";
}

async function persistPlanViaApi(plan) {
  if (!canUseApi() || typeof fetch !== "function") {
    return {
      ok: false,
      reason:
        "Lokaler Server nicht erreichbar. Bitte 'npm start' ausführen und die Anwendung über http://localhost:3000 öffnen.",
    };
  }

  try {
    const response = await fetch("/api/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(plan),
    });

    if (!response.ok) {
      let reason = `Serverfehler (${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.error) {
          reason = payload.error;
        }
      } catch (error) {
        try {
          const text = await response.text();
          if (text) {
            reason = text;
          }
        } catch {
          // Ignorieren, wir verwenden die Standardfehlermeldung.
        }
      }
      return { ok: false, reason };
    }

    const saved = await response.json();
    return { ok: true, plan: saved };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message
        ? `${error.message}. Bitte prüfe, ob der lokale Server läuft ('npm start').`
        : "Netzwerkfehler. Bitte prüfe, ob der lokale Server läuft ('npm start').",
    };
  }
}

export function initPlanSaveDialog({ planInput, saveButton }) {
  if (!planInput || !saveButton) {
    return {
      update() {},
    };
  }

  const overlay = document.getElementById("plan-save-overlay");
  const form = document.getElementById("plan-save-form");
  const titleInput = document.getElementById("plan-save-title");
  const dateInput = document.getElementById("plan-save-date");
  const focusInput = document.getElementById("plan-save-focus");
  const notesInput = document.getElementById("plan-save-notes");
  const statusElement = document.getElementById("plan-save-status");
  const cancelButton = document.getElementById("plan-save-cancel");
  const closeButton = document.getElementById("plan-save-close");

  if (!overlay || !form || !titleInput || !dateInput || !focusInput) {
    return {
      update() {},
    };
  }

  let currentPlan = null;
  let isOpen = false;
  const preferences = readPreferences();

  function closeOverlay() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("hidden", "");
    document.body.classList.remove("no-scroll");
    clearStatus(statusElement);
    form.reset();
  }

  function openOverlay() {
    const planText = planInput.value ?? "";
    const suggestion = deriveTitleSuggestion(planText);
    if (suggestion) {
      titleInput.value = suggestion;
    } else {
      titleInput.value = "";
    }

    const prefDate = preferences.lastDate ?? null;
    const fallbackDate = prefDate ? formatDateForInput(prefDate) : "";
    const today = new Date();
    const defaultDate = fallbackDate || today.toISOString().slice(0, 10);
    dateInput.value = defaultDate;

    focusInput.value = preferences.lastFocus ?? "";
    if (notesInput) {
      notesInput.value = "";
    }
    clearStatus(statusElement);

    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-visible");
    document.body.classList.add("no-scroll");
    isOpen = true;

    window.setTimeout(() => {
      titleInput.focus();
      if (titleInput.value) {
        titleInput.select();
      }
    }, 0);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeOverlay();
    }
  }

  function persistPreferences({ focus, date }) {
    const data = {
      lastFocus: focus ?? preferences.lastFocus ?? "",
      lastDate: date ?? preferences.lastDate ?? null,
    };
    preferences.lastFocus = data.lastFocus;
    preferences.lastDate = data.lastDate;
    writePreferences(data);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const planText = (planInput.value ?? "").trim();
    if (!planText) {
      setStatus(statusElement, "Bitte gib zuerst einen Trainingsplan ein.", "warning");
      planInput.focus();
      return;
    }

    const title = titleInput.value.trim();
    if (!title) {
      setStatus(statusElement, "Ein Titel ist erforderlich.", "warning");
      titleInput.focus();
      return;
    }

    const focus = focusInput.value.trim();
    if (!focus) {
      setStatus(statusElement, "Bitte gib einen Fokus an (z. B. Ausdauer, Technik).", "warning");
      focusInput.focus();
      return;
    }

    const rawDate = dateInput.value;
    const isoDate = toIsoDate(rawDate);
    if (!isoDate) {
      setStatus(statusElement, "Bitte wähle ein gültiges Datum.", "warning");
      dateInput.focus();
      return;
    }

    const metadata = {};
    const notes = notesInput?.value.trim();
    if (notes) {
      metadata.notes = notes;
    }

    if (currentPlan) {
      metadata.summary = {
        totalDistance: currentPlan.totalDistance ?? 0,
        totalTime: currentPlan.totalTime ?? 0,
        intensities: Array.from(currentPlan.intensities?.values?.() ?? []).map((entry) => ({
          label: entry.label,
          distance: entry.distance,
          sets: entry.sets,
          time: entry.time,
        })),
        equipment: Array.from(currentPlan.equipment?.values?.() ?? []).map((entry) => ({
          label: entry.label,
          count: entry.count,
        })),
        blocks: (currentPlan.blocks ?? []).map((block) => ({
          name: block.name,
          distance: block.distance,
          time: block.time,
        })),
      };
    }

    const planRecord = {
      title,
      content: planText,
      planDate: isoDate,
      focus,
      metadata,
    };

    setStatus(statusElement, "Plan wird gespeichert …", "info");
    const result = await persistPlanViaApi(planRecord);

    if (!result.ok) {
      const reason = result.reason ? ` ${result.reason}` : "";
      setStatus(
        statusElement,
        `Plan konnte nicht gespeichert werden.${reason || " Bitte stelle sicher, dass der lokale Server läuft."}`,
        "error",
      );
      return;
    }

    persistPreferences({ focus, date: isoDate });
    setStatus(statusElement, "Plan erfolgreich in der lokalen Datenbank gespeichert.", "success");
    window.setTimeout(() => {
      closeOverlay();
    }, 500);
  }

  saveButton.addEventListener("click", () => {
    if (isOpen) {
      return;
    }
    openOverlay();
  });

  cancelButton?.addEventListener("click", closeOverlay);
  closeButton?.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  form.addEventListener("submit", (event) => {
    handleSubmit(event).catch((error) => {
      console.error("Plan konnte nicht gespeichert werden", error);
      setStatus(statusElement, "Unerwarteter Fehler beim Speichern.", "error");
    });
  });
  window.addEventListener("keydown", handleKeyDown);

  return {
    update(plan) {
      currentPlan = plan;
    },
  };
}
