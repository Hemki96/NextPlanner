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
  exportMarkdownButton,
  exportWordButton,
  exportJsonButton,
}) {
  if (!planInput) {
    return;
  }

  const readPlanText = () => planInput.value ?? "";

  let menuOpen = false;

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
    const file = importJsonInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      const planContent = parsePlanImportJson(rawContent);
      setPlanContent(planContent);
    } catch (error) {
      console.error("Fehler beim JSON-Import", error);
      window.alert(describeJsonImportError(error));
    } finally {
      importJsonInput.value = "";
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
