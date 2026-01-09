# Design Guide

## UI-Patterns

### Barrierefreiheit (A11y)
- **Klappbereiche (Details/Summary):** Verwende `details.section-collapsible` mit einer `summary.section-collapsible-summary` und einem Inhalt-Wrapper `.section-collapsible-body`. Die Summary benötigt ein `aria-controls` auf den Inhalt, und `aria-expanded` wird per `initSectionCollapsibles` (`public/js/ui/section-collapsible.js`) gespiegelt.
- **Statusmeldungen:** `.form-status`-Elemente müssen über `aria-describedby` mit den zugehörigen Eingaben/Steuerelementen verknüpft sein, damit Screenreader Statusänderungen dem richtigen Formular zuordnen.
- **Fokus-Indikatoren:** Nicht-Button-Interaktionen wie `summary` oder andere fokussierbare Elemente erhalten konsistente `:focus-visible`-Styles über die zugehörigen Klassen (z. B. `.section-collapsible-summary`).
