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
- **Import & Export** – sichere Pläne als Markdown oder Word-Datei und lade bestehende Workouts wieder in den Editor.
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
3. Öffne über den Button „Hinweise & Syntax“ die kompakte Dokumentation.
4. Beobachte auf der rechten Seite die automatisch aktualisierten Kennzahlen und Blockübersichten und exportiere Ergebnisse als Markdown oder Word-Datei.

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
