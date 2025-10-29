/**
 * Initialisiert die Logik für den Hinweisdialog inklusive Fokusmanagement.
 */
export function initHelpOverlay({ button, overlay, closeButton }) {
  if (!overlay) {
    return { open: () => {}, close: () => {} };
  }

  let lastFocusedElement = null;

  const open = () => {
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.add("is-visible");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    closeButton?.focus();
  };

  const close = () => {
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    lastFocusedElement?.focus();
    lastFocusedElement = null;
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
