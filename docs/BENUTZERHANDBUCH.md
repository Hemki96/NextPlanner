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

## Kalenderübersicht und Planverwaltung
Der Einstiegspunkt `index.html` bündelt den Plan-Kalender. Er lädt alle gespeicherten Einheiten über die REST-API, ordnet sie nach Datum und visualisiert die Tagesbelegung direkt im Grid.【F:public/js/calendar.js†L214-L335】【F:public/js/calendar.js†L383-L459】 Für ausgewählte Tage zeigt die rechte Spalte jede Einheit inklusive Fokus, optionalen Notizen und fünf Aktionen/Optionen an:

- **Im Planner öffnen** öffnet den gespeicherten Plan mit vollständiger ID im Editor, um Inhalte weiter zu bearbeiten.【F:public/js/calendar.js†L433-L437】
- **Plan duplizieren** erzeugt einen Planner-Link mit vorbefülltem Datum, Fokus und Startzeit, sodass vorhandene Workouts schnell an neue Termine angepasst werden können.【F:public/js/calendar.js†L345-L365】【F:public/js/calendar.js†L439-L443】
- **Plan löschen** blendet eine Sicherheitsabfrage ein und sendet anschließend einen HEAD- und DELETE-Request an `/api/plans/{id}`. Der HEAD-Aufruf speichert den aktuellen ETag, der DELETE-Request nutzt ihn automatisch im `If-Match`-Header. Nach erfolgreicher Antwort wird der lokale Zustand aktualisiert, die Kalenderansicht neu gerendert und der Statusbereich informiert über den entfernten Plan.【F:public/js/calendar.js†L50-L127】【F:public/js/calendar.js†L445-L455】
- **Letztes Training übernehmen** kopiert den jüngsten gespeicherten Plan auf das aktuell ausgewählte Datum und öffnet ihn im Planner, inklusive übernommener Startzeit und Fokus.【F:public/js/calendar.js†L886-L923】
- **Woche exportieren (Word/PDF)** erzeugt für die ausgewählte Kalenderwoche ein Word- bzw. PDF-Dokument mit Übersichtstabellen und Details zu allen Einheiten zwischen Montag und Sonntag.【F:public/js/calendar.js†L828-L884】

Fehlgeschlagene Löschversuche (z. B. wegen Offline-Betrieb oder ETag-Konflikten) werden im Statusbereich prominent als Warnung bzw. Fehler ausgegeben, während 404-Antworten die Übersicht ohne Abbruch synchronisieren. Der farblich hervorgehobene Button nutzt die neue `danger-button`-Klasse für eine deutliche Abgrenzung gegenüber den sekundären Aktionen.【F:public/js/calendar.js†L112-L124】【F:public/css/main.css†L203-L230】

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
- In den Einstellungen kannst du pro Kategorie eine **Position** vergeben. Die Werte werden automatisch validiert, neu sortiert und sofort mit dem Schnellbaustein-Panel synchronisiert.【F:public/js/settings.js†L120-L174】【F:public/js/settings.js†L673-L755】
- Über die Einstellungen kannst du die Team-Bibliothek laden bzw. freigeben. Der Server bereinigt jeden Stand (`sanitizeQuickSnippetGroups`), schreibt ihn in `data/team-snippets.json` und versieht ihn mit einem ISO-Zeitstempel (`updatedAt`).【F:public/js/settings.js†L224-L288】【F:server/stores/json-snippet-store.js†L9-L123】

## Import, Export und Speichern
- **Dateioperationen:** Die IO-Steuerung erlaubt Importe von Text-, Markdown- oder HTML-Dateien und exportiert den aktuellen Plan als Markdown oder Word (HTML) via Blob-Download.【F:public/js/ui/io-controls.js†L1-L100】
- **Plan speichern:** Der Speicherdialog liest Präferenzen aus `localStorage`, ergänzt Titel-, Datums- und Fokusvorschläge und persistiert Pläne über die REST-API, sofern der lokale Server verfügbar ist.【F:public/js/ui/plan-save-dialog.js†L1-L200】
- **Vorlagenexport:** In der Vorlagenverwaltung lassen sich bestehende Templates als JSON herunterladen oder in die Zwischenablage kopieren.【F:public/js/templates.js†L1-L200】

## Arbeiten mit Vorlagen
- Das Summary-Panel bietet Schaltflächen, um Blöcke, Sets und Runden direkt als Vorlage vorzumerken.【F:public/js/ui/summary-renderer.js†L136-L355】
- Das Template-Capture-Overlay übernimmt beim Speichern die Typzuordnung (Block, Set, Runde), befüllt Titel, Snippet-Inhalt und Tags und persistiert den Eintrag über die REST-API im serverseitigen Vorlagenspeicher.【F:public/js/ui/template-capture.js†L41-L200】【F:public/js/utils/template-storage.js†L1-L180】
- In `templates.html` können Vorlagen gruppiert angezeigt, durchsucht, editiert, gelöscht oder exportiert werden.【F:public/js/templates.js†L1-L120】

## Speicherorte und Automatisierung
Gespeicherte Pläne landen in `data/plans.json`, persönliche Schnellbausteine in `data/quick-snippets.json`, Team-Bibliotheken in `data/team-snippets.json` und Vorlagen in `data/templates.json`. Alle Dateien werden bei Bedarf erzeugt und vom Repository ausgeschlossen.【F:README.md†L85-L161】【F:server/stores/json-template-store.js†L1-L200】 Die Snippet-Dateien bestehen immer aus einem Snapshot `{ updatedAt, groups }`, der serverseitig normalisiert wird; so bleiben kollaborative Änderungen konsistent und versionsfähig.【F:server/stores/json-snippet-store.js†L9-L153】 Über die Plan-CLI lassen sich Pläne hinzufügen, filtern, anzeigen oder löschen – sie nutzt dieselben JSON-Daten wie die Weboberfläche.【F:README.md†L128-L148】

## Troubleshooting
- Stellt der Speicherdialog eine Offline-Verbindung fest, prüfe, ob der lokale Server läuft (`npm start`).【F:public/js/ui/plan-save-dialog.js†L109-L132】
- Werden Dateien nicht importiert, empfiehlt sich der Export als Markdown oder Text, da Binärformate wie DOCX bewusst ausgeschlossen sind.【F:public/js/ui/io-controls.js†L43-L63】【F:public/js/ui/io-controls.js†L95-L100】
- Bei Validierungsfehlern markiert die Hinweisliste die betroffenen Zeilen und ermöglicht Korrekturen per Klick.【F:public/js/ui/validation-panel.js†L42-L133】

## Weiterführende Hinweise
Für Design- und Entwicklungsthemen stehen ergänzende Dokumente wie `CONTRIBUTING.md`, `API.md` oder `DATASTORE.md` zur Verfügung. Änderungen am Parser oder an UI-Bausteinen sollten immer mit den vorhandenen Tests abgesichert werden (`npm test`).【F:README.md†L69-L190】
