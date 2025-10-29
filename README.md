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
- **Speichern & Export** – sichere Pläne über die lokale JSON-Datenbank inklusive Metadaten und exportiere Workouts zusätzlich als Markdown- oder Word-Datei.
- **Responsive Layout** – zweigeteilte Ansicht für große Bildschirme, einspaltige Darstellung
  auf Tablets und Smartphones.

## Anwendung starten

Du kannst NextPlanner entweder direkt als statische Seite testen oder den integrierten Node.js-Server nutzen, der zusätzlich die lokale Datenbank für den Speicher-Button bereitstellt.

## Erste Schritte mit Visual Studio Code

Die folgenden Schritte führen dich durch die komplette Einrichtung des Projekts in [Visual Studio Code](https://code.visualstudio.com/) – vom ersten Klonen bis zum produktiven Arbeiten mit Live-Vorschau, Debugging und Tests.

### 1. Voraussetzungen prüfen

- Installiere [Node.js](https://nodejs.org) (empfohlen Version 18 oder höher). Dadurch stehen gleichzeitig `npm` und die Node-Testumgebung zur Verfügung.
- Installiere Visual Studio Code und – sofern du es bevorzugst – die Erweiterung **German Language Pack** für eine lokalisierte Oberfläche.
- Optional aber empfohlen: Erweiterungen **ESLint** (zur Codeanalyse), **Prettier** (Formatierung) und **Live Server** (schnelle Browser-Vorschau). Alle Erweiterungen findest du direkt im VS-Code-Marktplatz (`Strg/Cmd + Shift + X`).

### 2. Repository klonen oder öffnen

1. Öffne VS Code und drücke `Strg/Cmd + Shift + P`, um die Befehlspalette anzuzeigen.
2. Wähle `Git: Clone` aus und gib die Repository-URL ein (z. B. `https://github.com/<dein-user>/NextPlanner.git`).
3. Lege einen Zielordner fest und bestätige.
4. VS Code bietet anschließend an, den Ordner zu öffnen – akzeptiere dies.

Alternativ kannst du einen bereits heruntergeladenen Ordner über **Datei → Ordner öffnen…** wählen.

### 3. Abhängigkeiten installieren

1. Öffne das integrierte Terminal (`Strg/Cmd + ö` oder **Terminal → Neues Terminal**).
2. Stelle sicher, dass das Terminal im Projektverzeichnis (`NextPlanner`) liegt.
3. Installiere alle Abhängigkeiten mit:

   ```bash
   npm install
   ```

   VS Code erkennt dabei automatisch das `package.json` und stellt Scripts in der Seitenleiste unter „NPM Scripts“ bereit.

### 4. Live-Entwicklung und Vorschau

Du hast zwei gleichwertige Möglichkeiten, die Anwendung während der Entwicklung im Browser zu testen:

- **Integrierter Node.js-Server**: Starte `npm start` im Terminal. Die Anwendung läuft anschließend unter `http://localhost:3000`. Über **Terminal-Aufgaben** oder den NPM-Scripts-Bereich kannst du den Server direkt aus VS Code starten und stoppen.
- **Live Server Erweiterung**: Öffne `index.html` und klicke rechts unten auf „Go Live“. VS Code hostet die statischen Dateien und aktualisiert die Seite bei jedem Speichern automatisch. Beachte, dass die Speicherfunktion der App (lokale JSON-Datenbank) nur mit dem Node.js-Server verfügbar ist.

### 5. Debugging und Breakpoints

1. Lege bei Bedarf Breakpoints direkt in den JavaScript-Dateien (`js/*.js`) fest.
2. Verwende für den integrierten Server die Run-&-Debug-Ansicht (`Strg/Cmd + Shift + D`). Über „Add Configuration…“ kannst du eine neue **Node.js Launch**-Konfiguration hinzufügen, die `npm start` startet und automatisch an den Prozess anhängt.
3. Für die Live-Server-Variante lässt sich das Browser-Debugging über die Erweiterung **Debugger for Chrome** bzw. die integrierte Edge-/Chrome-Unterstützung aktivieren. Starte in der Run-&-Debug-Ansicht eine neue „Launch Chrome gegen localhost“-Konfiguration und öffne dabei die URL, die der Live Server bereitstellt.

### 6. Tests und Qualitätssicherung

1. Führe die vorhandene Testsuite direkt im Terminal mit `npm test` aus. VS Code zeigt Fehler und Assertion-Meldungen im Terminal an.
2. Konfiguriere optional eine Task unter **Terminal → Konfigurierte Tasks**, um `npm test` regelmäßig per Tastenkürzel (`Strg/Cmd + Shift + B`) zu starten.
3. Aktiviere ESLint/Prettier, damit du beim Speichern Format- und Stilhinweise erhältst. Über **Einstellungen → Format on Save** kannst du automatische Formatierungen aktivieren.

### 7. Empfohlener Arbeitsablauf

1. Starte `npm start`, um die Anwendung mit Datenbank-Anbindung zu testen.
2. Öffne parallel `http://localhost:3000` im Browser oder nutze die Live-Server-URL.
3. Bearbeite HTML-, CSS- oder JS-Dateien in VS Code. Dank Auto-Reload des Browsers siehst du Änderungen sofort.
4. Prüfe Parser- oder Logikänderungen über `npm test`.
5. Verwalte Änderungen mit Git direkt in VS Code über die Source-Control-Ansicht (`Strg/Cmd + Shift + G`).

### 8. Häufige Fragen

- **Wo liegt die lokale Datendatei?** – Im Verzeichnis `data/plans.json`. Sie wird beim ersten Speichern automatisch angelegt und ist in `.gitignore` eingetragen.
- **Warum schlägt „Plan speichern“ fehl?** – Stelle sicher, dass `npm start` läuft. Ohne Server kann die App nicht auf das Dateisystem zugreifen.
- **Wie ändere ich die Port-Konfiguration?** – Passe den Port in `server.js` an oder setze die Umgebungsvariable `PORT` (z. B. `PORT=4000 npm start`).
- **Kann ich Tests debuggen?** – Ja. Verwende in der Run-&-Debug-Ansicht die Konfiguration „Node.js: Launch via NPM“, wähle `test` als Script und setze Breakpoints in deinen Testdateien unter `tests/`.

### Variante A – Integrierter NextPlanner-Server (empfohlen)

1. Stelle sicher, dass [Node.js](https://nodejs.org) installiert ist.
2. Starte im Projektverzeichnis den Server mit:

   ```bash
   npm start
   ```

3. Öffne `http://localhost:3000` im Browser.
4. Der Speicher-Button schreibt Pläne nun automatisch in `data/plans.json`.

### Variante B – Direkter Datei-Aufruf

1. Navigiere im Dateisystem zu diesem Projektordner.
2. Öffne `index.html` per Doppelklick oder per Drag & Drop in den Browser.
3. In diesem Modus steht die lokale Datenbank nicht zur Verfügung – der Speicher-Button kann ohne laufenden Server keine Daten persistieren.

## Nutzung

1. Gib im linken Textfeld den Trainingsplan ein oder nutze das Beispiel-Platzhalterprogramm.
2. Importiere vorhandene Dateien bei Bedarf über „Plan importieren“.
3. Speichere fertige Pläne inklusive Datum und Fokus über „Plan speichern“ – dafür muss der integrierte Server laufen.
4. Öffne über den Button „Hinweise & Syntax“ die kompakte Dokumentation.
5. Beobachte auf der rechten Seite die automatisch aktualisierten Kennzahlen und Blockübersichten und exportiere Ergebnisse als JSON, Markdown oder Word-Datei.

## Pläne mit Metadaten lokal speichern

Zusätzlich zum Freitext-Editor kannst du komplette Workouts inklusive Metadaten lokal auf Dateibasis sichern.
Der JSON-Speicher legt die Daten standardmäßig unter `data/plans.json` ab (die Datei wird bei Bedarf automatisch erstellt und
ist vom Repository ausgeschlossen).

### Plan über den Speicher-Button sichern

1. Trage den Trainingsplan im Editor ein.
2. Klicke auf „Plan speichern“ und ergänze Titel, Datum, Fokus sowie optionale Notizen.
3. Bestätige mit „Plan sichern“ – läuft der Server, landet der Plan in `data/plans.json`. Ohne laufenden Server erscheint eine Fehlermeldung, die auf den notwendigen Start (`npm start`) hinweist.

### Plan-CLI verwenden

1. Stelle sicher, dass Node.js installiert ist (weitere Abhängigkeiten sind nicht erforderlich).
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

Die CLI und der integrierte Server greifen auf dieselbe JSON-Datei zu wie die Weboberfläche. So kannst du Pläne samt Fokus und Metadaten konsistent erfassen, versionieren und später wiederverwenden. Für Automatisierungen oder Versionskontrolle eignet sich die CLI, während der Speicher-Button schnelle lokale Backups ermöglicht.

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

- `public/js/app.js` verdrahtet DOM-Interaktionen und orchestriert Parser und Rendering.
- `public/js/parser/plan-parser.js` kapselt die komplette Analyse des Freitextes.
- `public/js/ui/summary-renderer.js` formatiert die Live-Auswertungen im UI.
- `public/js/ui/help-overlay.js` übernimmt Fokus- und Overlay-Steuerung.
- `public/js/ui/io-controls.js` steuert Datei-Import und -Export.
- `public/js/utils/*.js` stellt Formatierungs- und Berechnungs-Helfer bereit.

Styles liegen gebündelt in `public/css/main.css`. Öffne `public/index.html` direkt im
Browser oder starte den Server (`npm start`), um Änderungen sofort zu testen.

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
