# Beitragenden-Leitfaden

Vielen Dank für dein Interesse am NextPlanner! Dieses Dokument fasst die wichtigsten Arbeitsabläufe und Qualitätsregeln zusammen.

## Entwicklung starten

1. Repository klonen und Abhängigkeiten installieren (Node.js 18+ genügt, zusätzliche Pakete werden nicht benötigt).
2. Den lokalen Server mit `npm run dev` starten. Er liefert die REST-API unter `http://localhost:3000/api/…` und die statischen Assets aus `public/`.
3. Öffne `http://localhost:3000/planner.html`, um die Oberfläche zu testen.

## Qualitätschecks

Bitte führe vor jedem Commit folgende Prüfungen aus:

- `npm test` – führt die Node.js Test-Suite aus (`node --test`).
- `npm run lint:js` – prüft ES-Module auf Dateiendungen und verbietet `var`.
- `npm run lint:css` – verhindert den Einsatz von `!important` sowie ID-Selektoren.
- `npm run fmt` – formatiert JSON-Dateien (z. B. `package.json`, `data/*.json`).

Alle Skripte laufen ohne zusätzliche Abhängigkeiten.

## Code-Richtlinien

- **Module & Imports**: Verwende immer ES-Module mit expliziten Dateiendungen (`.js`) für relative Pfade. Node-Builtins werden über das `node:`-Präfix importiert.
- **Architektur**: Der Server (Node + REST), das Frontend (`public/`) und die Persistenz (`data/`) sind klar getrennt. Verschiebe keine Server-Dateien nach `public/` und umgekehrt.
- **Defensive Programmierung**: Validiere externe Eingaben (HTTP-Payloads, JSON-Dateien, Benutzer-Eingaben). Antworte mit aussagekräftigen Fehlermeldungen (`{ error: { code, message } }`).
- **CSS**: Arbeite mit Klassen und Modifikatoren (`.is-active`) statt ID-Selektoren oder `!important`. Design Tokens liegen in `:root`.
- **Events & DOM**: Nutze `data-*`-Attribute und modulare Initialisierer (`public/js/ui/*`). Inline-Skripte oder -Handler sind tabu.

## Tests

Zusätzlich zu den automatischen Tests freuen wir uns über neue Unit- oder Integrationstests, die Parser, Stores und API-Flows absichern. Lege Tests unter `tests/` an und halte sie klein & deterministisch.

## Pull Requests

- Beschreibe jede Änderung prägnant (Was? Warum?).
- Verweise auf relevante Tickets/Spezifikationen, insbesondere wenn API oder Persistenz betroffen ist.
- Aktualisiere die Checkliste (`compliance-checklist.md`), falls sich der Erfüllungsstatus einer Vorgabe ändert.

Vielen Dank und viel Erfolg!
