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
- **Responsive Layout** – zweigeteilte Ansicht für große Bildschirme, einspaltige Darstellung
  auf Tablets und Smartphones.

## Nutzung

1. Öffne die Datei `index.html` in einem Browser.
2. Gib im linken Textfeld den Trainingsplan ein oder nutze das Beispiel-Platzhalterprogramm.
3. Öffne bei Bedarf über den Button „Hinweise & Syntax“ die kompakte Dokumentation.
4. Beobachte auf der rechten Seite die automatisch aktualisierten Kennzahlen und Blockübersichten.

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
- `js/utils/*.js` stellt Formatierungs- und Berechnungs-Helfer bereit.

Styles liegen weiterhin in `styles.css`. Öffne `index.html` direkt im Browser, um Änderungen
sofort zu testen.

## Lizenz

Dieses Beispielprojekt dient ausschließlich Demonstrationszwecken und kann frei angepasst
oder erweitert werden.
