# Produktions-Checkliste für NextPlanner

Diese Checkliste fasst alle Schritte zusammen, die für einen stabilen Betrieb
(z. B. auf Render Free Tier) nötig sind. Ergänze die Punkte vor jedem Deployment.

## 1. Build & Abhängigkeiten
- Node.js ≥ 18 ist installiert.
- `npm install --production` (oder `npm ci --only=production`) wurde einmalig
  ausgeführt, damit alle Laufzeit-Abhängigkeiten vorhanden sind.

## 2. Umgebung & Variablen
- `NODE_ENV=production` (wird vom Server erzwungen, falls nicht gesetzt).
- `PORT` wird von der Hosting-Plattform bereitgestellt – **nicht** manuell hart
  verdrahten.
- `NEXTPLANNER_DATA_DIR=/data` (oder eigener Pfad), sofern ein Volume gemountet
  wird. Alternativ kann `DATA_DIR` verwendet werden.
- Optional: `LOG_LEVEL` (`error`, `warn`, `info`, `debug`) und `ALLOWED_ORIGINS`
  für Cross-Origin-Anfragen.

## 3. Persistenz & Backups
- Persistent Disk/Volume mindestens 1 GB (Render Free Tier).
- Volume ist auf `/data` gemountet und beschreibbar.
- Regelmäßige Backups per `/api/backups` konfiguriert (z. B. manuell via
  Cron-Job außerhalb der App).

## 4. Monitoring & Health-Checks
- `/healthz` für Statusübersicht (aggregiert alle Stores).
- `/readyz` für Readiness-Probes; schlägt mit `503` fehl, wenn ein Store nicht
  initialisiert werden kann.
- `/livez` für einfache Liveness-Prüfung.
- Logs werden über die Plattform (Render Dashboard, externe Aggregatoren)
  überwacht.

## 5. Sicherheit & Netzwerk
- HTTPS wird durch den Hoster bereitgestellt (Render Free Tier automatisch).
- `ALLOWED_ORIGINS` nur setzen, wenn Drittanwendungen die API verwenden.
- Keine sensiblen Daten in den JSON-Dateien speichern (sie liegen unverschlüsselt
  auf dem Volume).

## 6. Tests & Qualitätssicherung
- `npm test` erfolgreich durchlaufen lassen.
- Neue Funktionen mit zusätzlichen Unit-/Integrationstests abdecken.
- Manuelle Stichprobe im Browser (Pläne anlegen, Snippets synchronisieren,
  Backups exportieren) durchführen.

## 7. Deployment-Ablauf auf Render
1. Web Service anlegen, GitHub-Repo verknüpfen.
2. Build Command leer lassen (reiner Node-Server), Start Command `npm start`.
3. Persistent Disk hinzufügen (Mount `/data`).
4. Environment-Variablen setzen (siehe Abschnitt 2).
5. Deployment starten und Logs prüfen.
6. Nach erstem Start `/readyz` und `/healthz` testen.

Befolge diese Liste, um sicherzustellen, dass NextPlanner in produktiven
Umgebungen zuverlässig läuft.
