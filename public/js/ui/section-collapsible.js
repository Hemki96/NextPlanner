export function initSectionCollapsibles(root = document) {
  const collapsibles = root.querySelectorAll("details.section-collapsible");
  if (!collapsibles.length) {
    return;
  }

  collapsibles.forEach((collapsible, index) => {
    const summary = collapsible.querySelector(".section-collapsible-summary");
    const content = collapsible.querySelector(".section-collapsible-body");
    if (!summary || !content) {
      return;
    }

    if (!content.id) {
      content.id = `section-collapsible-${index}`;
    }

    summary.setAttribute("aria-controls", content.id);

    const syncExpandedState = () => {
      summary.setAttribute("aria-expanded", String(collapsible.open));
    };

    syncExpandedState();
    collapsible.addEventListener("toggle", syncExpandedState);
  });
}
