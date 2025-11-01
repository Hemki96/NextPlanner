import { triggerDownload } from "../utils/download.js";
import { createWordExportDocument } from "../utils/word-export.js";
import {
  createPlanExportJson,
  describeJsonImportError,
  parsePlanImportJson,
} from "../utils/plan-serialization.js";

/**
 * Stellt Import- und Export-Funktionen für den Trainingsplan bereit, damit
 * Nutzer:innen ihre Eingaben sichern oder erneut laden können.
 */

export function initIOControls({
  planInput,
  menuButton,
  menuPanel,
  importMarkdownButton,
  importMarkdownInput,
  importJsonButton,
  importJsonInput,
  importSelectionOverlay,
  importSelectionList,
  importSelectionDescription,
  importSelectionCloseButton,
  importSelectionCancelButton,
  importSelectionMergeButton,
  exportMarkdownButton,
  exportWordButton,
  exportJsonButton,
}) {
  if (!planInput) {
    return;
  }

  const readPlanText = () => planInput.value ?? "";

  let menuOpen = false;
  let selectionOverlayOpen = false;
  let selectionPlans = [];
  let selectionReturnFocus = null;

  const dateFormatter = typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })
    : null;

  const closeMenu = ({ returnFocus = false } = {}) => {
    if (!menuOpen) {
      return;
    }
    menuOpen = false;
    menuButton?.setAttribute("aria-expanded", "false");
    menuPanel?.setAttribute("hidden", "");
    if (returnFocus && menuButton instanceof HTMLElement) {
      menuButton.focus();
    }
  };

  const openMenu = () => {
    if (menuOpen) {
      return;
    }
    menuOpen = true;
    menuButton?.setAttribute("aria-expanded", "true");
    menuPanel?.removeAttribute("hidden");
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  menuButton?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleMenu();
  });

  document.addEventListener("click", (event) => {
    if (!menuOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (
      target === menuButton ||
      (menuButton instanceof HTMLElement && menuButton.contains(target)) ||
      (menuPanel instanceof HTMLElement && menuPanel.contains(target))
    ) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen) {
      event.preventDefault();
      closeMenu({ returnFocus: true });
    }
  });

  const setPlanContent = (content) => {
    planInput.value = normalizeLineEndings(content);
    planInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const formatPlanDate = (value) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      try {
        return dateFormatter ? dateFormatter.format(parsed) : parsed.toISOString().slice(0, 10);
      } catch (error) {
        console.warn("Konnte Datum für Import nicht formatieren", error);
      }
    }
    return value;
  };

  const describeSelectionPlan = (plan, index) => {
    const primary = plan.title ?? `Plan ${index + 1}`;
    const metaParts = [];
    const formattedDate = formatPlanDate(plan.planDate);
    if (formattedDate) {
      metaParts.push(formattedDate);
    }
    if (plan.focus) {
      metaParts.push(plan.focus);
    }
    if (plan.sourceLabel) {
      metaParts.push(plan.sourceLabel);
    }
    if (plan.id) {
      metaParts.push(`#${plan.id}`);
    }
    return {
      primary,
      meta: metaParts,
    };
  };

  const closeSelectionOverlay = ({ restoreFocus = false } = {}) => {
    if (!selectionOverlayOpen) {
      return;
    }
    selectionOverlayOpen = false;
    selectionPlans = [];
    importSelectionOverlay?.classList.remove("is-visible");
    importSelectionOverlay?.setAttribute("aria-hidden", "true");
    importSelectionOverlay?.setAttribute("hidden", "");
    if (importSelectionList) {
      importSelectionList.innerHTML = "";
    }
    if (importSelectionMergeButton) {
      importSelectionMergeButton.disabled = false;
    }
    if (importSelectionDescription) {
      importSelectionDescription.textContent =
        "Mehrere Pläne gefunden. Wähle einen Plan zum Laden oder übernehme alle Inhalte.";
    }
    document.body?.classList?.remove("no-scroll");
    const focusTarget = selectionReturnFocus;
    selectionReturnFocus = null;
    if (restoreFocus && focusTarget instanceof HTMLElement) {
      focusTarget.focus();
    }
  };

  const openSelectionOverlay = (plans) => {
    if (!importSelectionOverlay || !importSelectionList) {
      setPlanContent(plans[0].content);
      return;
    }

    selectionPlans = plans.map((plan) => ({
      ...plan,
      content: normalizeLineEndings(plan.content ?? ""),
    }));
    selectionOverlayOpen = true;
    selectionReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    importSelectionList.innerHTML = "";
    selectionPlans.forEach((plan, index) => {
      const item = document.createElement("li");
      item.className = "plan-import-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan-io-action plan-import-choice";
      const description = describeSelectionPlan(plan, index);
      const titleElement = document.createElement("span");
      titleElement.className = "plan-import-choice-title";
      titleElement.textContent = description.primary;
      button.append(titleElement);
      if (description.meta.length > 0) {
        const metaElement = document.createElement("span");
        metaElement.className = "plan-import-choice-meta";
        metaElement.textContent = description.meta.join(" • ");
        button.append(metaElement);
      }
      button.addEventListener("click", () => {
        setPlanContent(plan.content);
        closeSelectionOverlay({ restoreFocus: true });
      });
      item.append(button);
      importSelectionList.append(item);
    });

    if (importSelectionDescription) {
      const sourceLabels = new Set(
        selectionPlans
          .map((plan) => plan.sourceLabel)
          .filter((label) => typeof label === "string" && label.trim())
      );
      const count = selectionPlans.length;
      if (sourceLabels.size === 1) {
        const label = sourceLabels.values().next().value;
        importSelectionDescription.textContent = `In der Datei „${label}“ wurden ${count} Pläne gefunden. Wähle einen Plan zum Laden oder übernehme alle Inhalte.`;
      } else if (sourceLabels.size > 1) {
        importSelectionDescription.textContent = `${count} Pläne aus ${sourceLabels.size} Dateien gefunden. Wähle einen Plan zum Laden oder übernehme alle Inhalte.`;
      } else {
        importSelectionDescription.textContent = `${count} Pläne gefunden. Wähle einen Plan zum Laden oder übernehme alle Inhalte.`;
      }
    }

    importSelectionOverlay.removeAttribute("hidden");
    importSelectionOverlay.setAttribute("aria-hidden", "false");
    importSelectionOverlay.classList.add("is-visible");
    document.body?.classList?.add("no-scroll");

    window.setTimeout(() => {
      const firstButton = importSelectionList.querySelector("button");
      if (firstButton instanceof HTMLElement) {
        firstButton.focus();
      }
    }, 50);
  };

  const handleImportedPlans = (plans) => {
    const validPlans = plans
      .filter(
        (plan) =>
          plan &&
          typeof plan.content === "string" &&
          plan.content.trim().length > 0
      )
      .map((plan) => ({
        ...plan,
        content: plan.content,
      }));

    if (validPlans.length === 0) {
      const error = new Error("NO_VALID_PLANS");
      const sourceLabels = new Set(
        plans
          .map((plan) => plan?.sourceLabel)
          .filter((label) => typeof label === "string" && label.trim())
      );
      if (sourceLabels.size === 1) {
        error.fileName = sourceLabels.values().next().value;
      }
      throw error;
    }

    if (validPlans.length === 1 || !importSelectionOverlay || !importSelectionList) {
      setPlanContent(validPlans[0].content);
      return;
    }

    openSelectionOverlay(validPlans);
  };

  exportMarkdownButton?.addEventListener("click", () => {
    const content = readPlanText();
    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });
    triggerDownload("swim-plan.md", blob);
    closeMenu({ returnFocus: true });
  });

  exportWordButton?.addEventListener("click", () => {
    const content = readPlanText();
    const htmlDocument = createWordExportDocument(content);
    const blob = new Blob([htmlDocument], {
      type: "application/msword",
    });
    triggerDownload("swim-plan.doc", blob);
    closeMenu({ returnFocus: true });
  });

  exportJsonButton?.addEventListener("click", () => {
    const content = readPlanText();
    const jsonDocument = createPlanExportJson(content);
    const blob = new Blob([jsonDocument], {
      type: "application/json;charset=utf-8",
    });
    triggerDownload("swim-plan.json", blob);
    closeMenu({ returnFocus: true });
  });

  const pickFile = (input) => {
    if (!input) {
      return;
    }
    closeMenu({ returnFocus: true });
    input.click();
  };

  importMarkdownButton?.addEventListener("click", () => {
    pickFile(importMarkdownInput);
  });

  importJsonButton?.addEventListener("click", () => {
    pickFile(importJsonInput);
  });

  importMarkdownInput?.addEventListener("change", async () => {
    const file = importMarkdownInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      if (isLikelyBinary(rawContent)) {
        throw new Error("BINARY_FILE_UNSUPPORTED");
      }
      const extracted = extractTextFromPossibleHtml(rawContent);
      setPlanContent(extracted);
    } catch (error) {
      console.error("Fehler beim Import der Datei", error);
      window.alert(
        "Die Datei konnte nicht importiert werden. Bitte versuchen Sie es mit einer Markdown-Datei."
      );
    } finally {
      importMarkdownInput.value = "";
    }
  });

  importJsonInput?.addEventListener("change", async () => {
    const files = importJsonInput.files ? Array.from(importJsonInput.files) : [];
    if (files.length === 0) {
      return;
    }

    try {
      const collectedPlans = [];
      for (const file of files) {
        const rawContent = await file.text();
        const plans = parsePlanImportJson(rawContent, { sourceLabel: file.name });
        collectedPlans.push(...plans);
      }
      handleImportedPlans(collectedPlans);
    } catch (error) {
      console.error("Fehler beim JSON-Import", error);
      window.alert(describeJsonImportError(error));
    } finally {
      importJsonInput.value = "";
    }
  });

  importSelectionCloseButton?.addEventListener("click", () => {
    closeSelectionOverlay({ restoreFocus: true });
  });

  importSelectionCancelButton?.addEventListener("click", () => {
    closeSelectionOverlay({ restoreFocus: true });
  });

  importSelectionMergeButton?.addEventListener("click", () => {
    if (!selectionOverlayOpen || selectionPlans.length === 0) {
      closeSelectionOverlay({ restoreFocus: true });
      return;
    }
    const combined = selectionPlans
      .map((plan) => plan.content.trim())
      .filter((content) => content.length > 0);
    if (combined.length === 0) {
      window.alert("Es konnten keine Inhalte übernommen werden.");
      closeSelectionOverlay({ restoreFocus: true });
      return;
    }
    const joined = combined.join("\n\n---\n\n");
    setPlanContent(joined);
    closeSelectionOverlay({ restoreFocus: true });
  });

  importSelectionOverlay?.addEventListener("click", (event) => {
    if (event.target === importSelectionOverlay) {
      closeSelectionOverlay({ restoreFocus: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectionOverlayOpen) {
      event.preventDefault();
      closeSelectionOverlay({ restoreFocus: true });
    }
  });
}

/**
 * Extrahiert reinen Text aus einem potentiellen HTML-Dokument, das z.B. aus dem Word-Export stammt.
 */
function extractTextFromPossibleHtml(raw) {
  if (!raw) {
    return "";
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith("<")) {
    return raw;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/html");
  const pre = doc.querySelector("pre");
  if (pre) {
    return pre.textContent ?? "";
  }
  return doc.body?.textContent ?? raw;
}

/**
 * Vereinheitlicht Zeilenumbrüche, damit der Editor den importierten Text korrekt darstellt.
 */
function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

/**
 * Grobe Heuristik, um binäre Inhalte (z.B. echte DOCX-Dateien) zu erkennen.
 */
function isLikelyBinary(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
}
