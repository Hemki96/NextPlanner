# NextPlanner

NextPlanner ist ein interaktiver Prototyp für einen webbasierten Schwimm-Trainingsplaner.
Die Oberfläche besteht aus einem freien Texteingabefeld für komplette Workouts und einer
Live-Auswertung, die Umfang, Zeitbedarf, Intensitäten, Fokusbereiche und benötigtes Material
direkt beim Tippen berechnet.

## Features

- **Freitext-Parser** – erkennt strukturierte Informationen aus Zeilen wie
  `4x50m GSA @1:00 w/ Pullbuoy` inklusive Pausen `P:00:20`.
- **Intuitive Visualisierung** – zeigt Gesamtumfang, Dauer sowie Häufigkeit von Intensitäten
  und Equipment als Chips und Blockkarten.
- **Rundengruppen** – fasse mehrere Sets unter Angaben wie `3 Runden:` zusammen, damit sie automatisch mehrfach gezählt werden.
- **Syntax-Hinweise** – ein Hinweis-Button öffnet eine kompakte Dokumentation aller Kürzel,
  Formatierungen und Intensitätsstufen.
- **Speichern & Export** – sichere Pläne als JSON inklusive Metadaten sowie als Markdown- oder Word-Datei und lade bestehende Workouts wieder in den Editor.
- **Responsive Layout** – zweigeteilte Ansicht für große Bildschirme, einspaltige Darstellung
  auf Tablets und Smartphones.

## Anwendung starten

Damit du den Prototyp lokal ausprobieren kannst, reicht bereits ein einfacher statischer Server.
Folge einer der beiden Varianten:

### Variante A – Direkt im Browser öffnen

1. Navigiere im Dateisystem zu diesem Projektordner.
2. Öffne die Datei `index.html` per Doppelklick oder per Drag & Drop in einen modernen Browser (Chrome, Edge, Firefox, Safari).
3. Stelle sicher, dass der Browser das lokale Laden von ES-Modulen erlaubt (bei älteren Browsern ggf. über `about:flags` oder Verwenden von Variante B).

### Variante B – Mit Node.js Static Server

1. Stelle sicher, dass [Node.js](https://nodejs.org) installiert ist.
2. Installiere optional ein leichtgewichtiges Servetool global, z. B. `npm install -g serve`, oder nutze npx.
3. Starte im Projektverzeichnis einen Server, z. B. mit `npx serve .` oder `python3 -m http.server 8000`.
4. Öffne anschließend `http://localhost:3000` (bei `serve`) oder `http://localhost:8000` (bei Python) im Browser.

## Nutzung

1. Gib im linken Textfeld den Trainingsplan ein oder nutze das Beispiel-Platzhalterprogramm.
2. Importiere vorhandene Dateien bei Bedarf über „Plan importieren“.
3. Speichere fertige Pläne inklusive Datum und Fokus über „Plan speichern“ als JSON-Datei.
4. Öffne über den Button „Hinweise & Syntax“ die kompakte Dokumentation.
5. Beobachte auf der rechten Seite die automatisch aktualisierten Kennzahlen und Blockübersichten und exportiere Ergebnisse als JSON, Markdown oder Word-Datei.

## Pläne mit Metadaten lokal speichern

Zusätzlich zum Freitext-Editor kannst du komplette Workouts inklusive Metadaten lokal auf Dateibasis sichern.
Der JSON-Speicher legt die Daten standardmäßig unter `data/plans.json` ab (die Datei wird bei Bedarf automatisch erstellt und
ist vom Repository ausgeschlossen).

### Plan über den Speicher-Button sichern

1. Trage den Trainingsplan im Editor ein.
2. Klicke auf „Plan speichern“ und ergänze Titel, Datum, Fokus sowie optionale Notizen.
3. Bestätige mit „Plan sichern“ – der Plan wird als JSON-Datei heruntergeladen und enthält zusätzlich eine Zusammenfassung der aktuellen Kennzahlen.

### Plan-CLI verwenden

1. Installiere die Abhängigkeiten mit `npm install`, falls noch nicht geschehen.
2. Speichere einen Plan mit Metadaten:

   ```bash
   npm run plan:cli -- add --title="Sprint Session" --date="2024-05-10" \\
     --focus="Sprint" --content="4x50m Sprint" --metadata='{"coach":"Alex"}'
   ```

   Der Befehl legt einen Eintrag mit Datum, Fokus und beliebig vielen Metadaten an.

3. Liste gespeicherte Pläne gefiltert nach Fokus oder Zeitraum auf:

   ```bash
   npm run plan:cli -- list --focus="Sprint" --from="2024-05-01" --to="2024-05-31"
   ```

4. Weitere Befehle stehen über `npm run plan:cli -- --help` zur Verfügung (u. a. `show`, `update`, `delete`).

Die CLI nutzt denselben Parser-Output wie die Weboberfläche, sodass du Pläne mit zugehörigem Fokus sowie zusätzlichen
Metainformationen versionieren und später wiederverwenden kannst. Für Automatisierungen oder Versionskontrolle eignet sich die CLI, während der Speicher-Button schnelle lokale Backups ermöglicht.

## Import & Export

- **Plan importieren** – unterstützt Text- und Markdown-Dateien sowie die eigene Word-Exportdatei (HTML-basiert). Nach dem Import wird der Parser automatisch ausgelöst.
- **Als Markdown exportieren** – lädt den aktuellen Textinhalt als `swim-plan.md` herunter.
- **Als Word exportieren** – erzeugt ein `.doc`-Dokument auf HTML-Basis, das in Word oder kompatiblen Anwendungen geöffnet werden kann.

## Syntaxüberblick

- `## Abschnitt` kennzeichnet einen Block (Warm-up, Hauptsatz, etc.).
- `Anzahl x Distanz` definiert Sets, z. B. `4x50m` oder `6x100yd`.
- `@` legt das Intervall fest (`@1:40`).
- `P:` fügt Pausen hinzu (`P:00:20`).
- `w/` beschreibt Material (`w/ Paddles, Snorkel`).
- `3 Runden:` oder `Runde x3` startet eine Rundengruppe. Eine Leerzeile, eine neue Rundenangabe oder `Ende Runde` beendet sie.
- Intensitäten werden durch die festgelegten Kürzel (`ORANGE8`, `BLUE9`, usw.) erkannt.

## Entwicklung

Der Prototyp benötigt keinen Build-Schritt. Die Architektur ist in einzelne ES-Module
aufgeteilt:

- `js/app.js` verdrahtet DOM-Interaktionen und orchestriert Parser und Rendering.
- `js/parser/planParser.js` kapselt die komplette Analyse des Freitextes.
- `js/ui/summaryRenderer.js` formatiert die Live-Auswertungen im UI.
- `js/ui/helpOverlay.js` übernimmt Fokus- und Overlay-Steuerung.
- `js/ui/ioControls.js` steuert Datei-Import und -Export.
- `js/utils/*.js` stellt Formatierungs- und Berechnungs-Helfer bereit.

Styles liegen weiterhin in `styles.css`. Öffne `index.html` direkt im Browser, um Änderungen
sofort zu testen.

## Tests

Automatisierte Tests stellen sicher, dass Parser und Zeit-Helfer bei Erweiterungen stabil
bleiben. Die Suite nutzt den in Node.js integrierten Test-Runner und benötigt deshalb keine
zusätzlichen Abhängigkeiten.

1. Stelle sicher, dass Node.js (>= 18) installiert ist.
2. Führe im Projektverzeichnis `npm test` oder direkt `node --test` aus.
3. Passe bzw. erweitere die Testfälle bei Änderungen an Parserlogik oder Zeit-Helfern,
   sodass alle relevanten Szenarien weiterhin abgedeckt bleiben.

## Lizenz

Dieses Beispielprojekt dient ausschließlich Demonstrationszwecken und kann frei angepasst
oder erweitert werden.
