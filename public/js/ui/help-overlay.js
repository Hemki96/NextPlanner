/**
 * Initialisiert die Logik für den Hinweisdialog inklusive Fokusmanagement.
 */
import { createFocusTrap } from "./focus-trap.js";

export function initHelpOverlay({ button, overlay, closeButton }) {
  if (!overlay) {
    return { open: () => {}, close: () => {} };
  }

  const focusTrap = createFocusTrap(overlay);

  const open = () => {
    overlay.removeAttribute("hidden");
    overlay.classList.add("is-visible");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    focusTrap.activate();
    closeButton?.focus();
  };

  const close = () => {
    if (!overlay.classList.contains("is-visible")) {
      return;
    }
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("hidden", "");
    document.body.classList.remove("no-scroll");
    focusTrap.deactivate();
  };

  button?.addEventListener("click", open);
  closeButton?.addEventListener("click", close);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("is-visible")) {
      close();
    }
  });

  return { open, close };
}
