// Gemeinsames Fokusmanagement für alle modalen Dialoge: Fokusfalle während
// der Öffnungszeit und Rückgabe des Fokus an das auslösende Element.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function createFocusTrap(element) {
  let previouslyFocused = null;
  let active = false;

  function focusableElements() {
    if (!element) {
      return [];
    }
    return Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (candidate) => candidate.getClientRects().length > 0,
    );
  }

  function handleKeydown(event) {
    if (!active || event.key !== "Tab") {
      return;
    }
    const items = focusableElements();
    if (items.length === 0) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !element.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !element.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  return {
    activate() {
      if (!element || active) {
        return;
      }
      previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      active = true;
      document.addEventListener("keydown", handleKeydown, true);
    },
    deactivate({ restoreFocus = true } = {}) {
      if (!active) {
        return;
      }
      active = false;
      document.removeEventListener("keydown", handleKeydown, true);
      if (restoreFocus && previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
      previouslyFocused = null;
    },
    focusFirst() {
      const items = focusableElements();
      if (items.length > 0) {
        items[0].focus();
      }
    },
  };
}
