# NextPlanner Benutzerhandbuch

## Überblick
NextPlanner ist ein webbasiertes Tool, mit dem Schwimmtrainer:innen komplette Trainingseinheiten frei in Textform erfassen und dabei unmittelbar Auswertungen zu Umfang, Dauer, Intensitäten, Fokusbereichen und Material erhalten.【F:README.md†L1-L19】 Die Anwendung besteht aus einem planorientierten Texteditor, einer rechten Auswertungsleiste sowie optionalen Panels für Schnellbausteine und Vorlagen.

## Installation und Start
1. Installiere Node.js (empfohlen Version 18 oder höher) und klone das Repository lokal.【F:README.md†L29-L48】
2. Starte anschließend `npm install`, um alle Abhängigkeiten einzurichten.【F:README.md†L46-L55】
3. Für die Nutzung mit lokaler Persistenz empfiehlt sich `npm start`, wodurch der Node.js-Server unter `http://localhost:3000` läuft und die JSON-Datenspeicherung aktiviert wird.【F:README.md†L60-L107】 Alternativ lässt sich `public/index.html` direkt im Browser öffnen – in diesem Modus stehen jedoch keine Speicherfunktionen zur Verfügung.
4. Entwickler:innen können den integrierten Test-Runner über `npm test` oder `node --test` ausführen, um Parser- und Utility-Anpassungen zu prüfen.【F:README.md†L69-L190】

## Navigationsstruktur der Anwendung
- **Planner** (`planner.html`): Kernansicht mit Texteingabe, Syntax-Hilfen, Import-/Export-Funktionen, Validierung und Live-Auswertung.【F:public/planner.html†L1-L165】
- **Plan-Kalender**, **Vorlagen**, **Einstellungen** und **Backups**: Zusätzliche Ansichten für Terminübersichten, Template-Verwaltung, Editor-Optionen inklusive Highlight-Konfiguration sowie Datensicherung.

## Der Plan Builder im Detail
Der Plan Builder setzt sich aus mehreren Modulen zusammen, die den eingegebenen Freitext analysieren, aggregieren und visualisieren:

1. **Parser (`parsePlan`)**: Zerlegt jede Textzeile, erkennt Überschriften, Sets, Runden und Pausen und aggregiert Distanz-, Zeit- und Intensitätskennzahlen.【F:public/js/parser/plan-parser.js†L93-L361】 Dabei werden Sets inklusive Intervallen (`@`), Pausen (`P:`), Material (`w/`), Intensitäten und Fokus-Tags interpretiert.【F:public/js/parser/plan-parser.js†L35-L175】 Rundengruppen werden automatisch vervielfacht und den Blöcken zugeordnet.【F:public/js/parser/plan-parser.js†L179-L216】
2. **Auswertung (`renderSummary`)**: Nutzt das Parser-Ergebnis, um Gesamtzeit, Gesamtumfang, Durchschnittspace, Intensitäts- und Material-Statistiken sowie eine Block-, Set- und Rundenübersicht aufzubauen.【F:public/js/ui/summary-renderer.js†L41-L355】 Template-Schaltflächen an jedem Block, Set und jeder Runde erlauben es, Ausschnitte direkt als Vorlage zu speichern.
3. **UI-Orchestrierung (`app.js`)**: Verdrahtet Parser, Renderer und optionale Werkzeuge miteinander, reagiert auf Eingaben und lädt Pläne bei Bedarf aus dem Backend.【F:public/js/app.js†L1-L158】

Zusätzlich können Sets, Blöcke oder Runden über das Template-Capture-Overlay als neue Vorlagen gespeichert werden, wobei Inhalt, Tags und Typ automatisch vorbelegt werden.【F:public/js/ui/template-capture.js†L1-L140】

## Validierungslogik
Während der Eingabe prüft NextPlanner automatisch auf typische Fehler:
- Runden ohne gültige Anzahl oder ohne Inhalt erzeugen Warnungen.【F:public/js/parser/plan-parser.js†L254-L304】
- Pausenangaben, die nicht in Sekunden umgerechnet werden können, werden gemeldet.【F:public/js/parser/plan-parser.js†L313-L330】
- Zeilen, die keiner bekannten Struktur entsprechen, erscheinen als „unbekannt“ in der Hinweisliste.【F:public/js/parser/plan-parser.js†L333-L341】

Diese Hinweise werden im Validierungspanel dargestellt, sortiert und mit der jeweiligen Zeilennummer versehen. Ein Klick springt direkt zur betroffenen Stelle, während der Syntax-Highlighter die Zeile gleichzeitig hervorhebt.【F:public/js/ui/validation-panel.js†L1-L80】【F:public/js/ui/validation-panel.js†L94-L133】

## Syntax-Highlighter
Der Syntax-Highlighter markiert Trainingsbestandteile inline, ohne den Eingabetext zu verändern:
- Er erkennt Überschriften, Distanzen, Rundenzähler, Abgangszeiten, Material-Abschnitte sowie sämtliche bekannten Intensitätscodes anhand regulärer Ausdrücke.【F:public/js/ui/plan-highlighter.js†L11-L87】
- Überlappende Matches werden nach Priorität aufgelöst, in Token transformiert und mit semantischen Klassen versehen (z. B. `plan-token-distance`).【F:public/js/ui/plan-highlighter.js†L71-L183】
- Beim Scrollen oder bei neuen Hinweisen synchronisiert die Highlighter-Schicht ihre Position und kennzeichnet fehlerhafte Zeilen visuell.【F:public/js/ui/plan-highlighter.js†L185-L258】
- Über die Ansicht „Einstellungen“ kannst du gezielt festlegen, welche Kategorien hervorgehoben werden (Überschriften, Distanzen, Runden, Intervalle, Material, Intensitäten). Änderungen wirken sich sofort auf den Highlighter im Planner aus.【F:public/settings.html†L1-L81】【F:public/js/settings.js†L1-L320】【F:public/js/utils/highlight-settings.js†L1-L168】

## Schnellbausteine
Das Schnellbaustein-Panel stellt konfigurierbare Textfragmente bereit:
- Beim Einfügen sorgt `applySnippet` dafür, dass erforderliche Leerzeilen, Cursorpositionen und eventuelle Platzhalter korrekt gesetzt werden.【F:public/js/ui/quick-snippets.js†L11-L48】
- Die Initialisierung lädt lokale Snippet-Gruppen, synchronisiert optional eine Team-Bibliothek und rendert klickbare Buttons für jede Vorlage.【F:public/js/ui/quick-snippets.js†L50-L137】 Durch einen Klick wird der Snippet-Text eingefügt und der Parser erneut ausgelöst.

## Import, Export und Speichern
- **Dateioperationen:** Die IO-Steuerung erlaubt Importe von Text-, Markdown- oder HTML-Dateien und exportiert den aktuellen Plan als Markdown oder Word (HTML) via Blob-Download.【F:public/js/ui/io-controls.js†L1-L100】
- **Plan speichern:** Der Speicherdialog liest Präferenzen aus `localStorage`, ergänzt Titel-, Datums- und Fokusvorschläge und persistiert Pläne über die REST-API, sofern der lokale Server verfügbar ist.【F:public/js/ui/plan-save-dialog.js†L1-L200】
- **Vorlagenexport:** In der Vorlagenverwaltung lassen sich bestehende Templates als JSON herunterladen oder in die Zwischenablage kopieren.【F:public/js/templates.js†L1-L200】

## Arbeiten mit Vorlagen
- Das Summary-Panel bietet Schaltflächen, um Blöcke, Sets und Runden direkt als Vorlage vorzumerken.【F:public/js/ui/summary-renderer.js†L136-L355】
- Das Template-Capture-Overlay übernimmt beim Speichern die Typzuordnung (Block, Set, Runde), befüllt Titel, Snippet-Inhalt und Tags und persistiert den Eintrag in der lokalen Vorlagebibliothek.【F:public/js/ui/template-capture.js†L41-L140】
- In `templates.html` können Vorlagen gruppiert angezeigt, durchsucht, editiert, gelöscht oder exportiert werden.【F:public/js/templates.js†L1-L120】

## Speicherorte und Automatisierung
Gespeicherte Pläne landen in `data/plans.json`, Schnellbausteine in `data/team-snippets.json`. Beide Dateien werden bei Bedarf erzeugt und vom Repository ausgeschlossen.【F:README.md†L85-L148】 Über die Plan-CLI lassen sich Pläne hinzufügen, filtern, anzeigen oder löschen – sie nutzt dieselben JSON-Daten wie die Weboberfläche.【F:README.md†L128-L148】

## Troubleshooting
- Stellt der Speicherdialog eine Offline-Verbindung fest, prüfe, ob der lokale Server läuft (`npm start`).【F:public/js/ui/plan-save-dialog.js†L109-L132】
- Werden Dateien nicht importiert, empfiehlt sich der Export als Markdown oder Text, da Binärformate wie DOCX bewusst ausgeschlossen sind.【F:public/js/ui/io-controls.js†L43-L63】【F:public/js/ui/io-controls.js†L95-L100】
- Bei Validierungsfehlern markiert die Hinweisliste die betroffenen Zeilen und ermöglicht Korrekturen per Klick.【F:public/js/ui/validation-panel.js†L42-L133】

## Weiterführende Hinweise
Für Design- und Entwicklungsthemen stehen ergänzende Dokumente wie `CONTRIBUTING.md`, `API.md` oder `DATASTORE.md` zur Verfügung. Änderungen am Parser oder an UI-Bausteinen sollten immer mit den vorhandenen Tests abgesichert werden (`npm test`).【F:README.md†L69-L190】
