/**
 * Aktualisiert ein Status-Element mit Text und optionalem Typ.
 * Erwartet Elemente mit der Klasse "form-status" oder setzt diese automatisch.
 *
 * @param {HTMLElement | null} element
 * @param {string} message
 * @param {"success" | "warning" | "info" | "error"} [type="info"]
 */
export function setStatus(element, message, type = "info") {
  if (!element) {
    return;
  }
  element.textContent = message ?? "";
  element.dataset.statusType = type;
  element.classList.add("form-status");
}
