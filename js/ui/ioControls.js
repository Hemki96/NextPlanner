import { triggerDownload } from "../utils/download.js";
import { createWordExportDocument } from "../utils/wordExport.js";

/**
 * Stellt Import- und Export-Funktionen für den Trainingsplan bereit, damit
 * Nutzer:innen ihre Eingaben sichern oder erneut laden können.
 */

export function initIOControls({
  planInput,
  importInput,
  importButton,
  exportMarkdownButton,
  exportWordButton,
}) {
  if (!planInput) {
    return;
  }

  const readPlanText = () => planInput.value ?? "";

  exportMarkdownButton?.addEventListener("click", () => {
    const content = readPlanText();
    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });
    triggerDownload("swim-plan.md", blob);
  });

  exportWordButton?.addEventListener("click", () => {
    const content = readPlanText();
    const htmlDocument = createWordExportDocument(content);
    const blob = new Blob([htmlDocument], {
      type: "application/msword",
    });
    triggerDownload("swim-plan.doc", blob);
  });

  importButton?.addEventListener("click", () => {
    importInput?.click();
  });

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      if (isLikelyBinary(rawContent)) {
        throw new Error("BINARY_FILE_UNSUPPORTED");
      }
      const extracted = extractTextFromPossibleHtml(rawContent);
      planInput.value = normalizeLineEndings(extracted);
      planInput.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (error) {
      console.error("Fehler beim Import der Datei", error);
      window.alert("Die Datei konnte nicht importiert werden. Bitte versuchen Sie es mit einer Markdown- oder Textdatei.");
    } finally {
      importInput.value = "";
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
