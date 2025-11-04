# Änderungsdokumentation

## Fix npm start shutdown regression

- Entfernt doppelte Signal-Handler im Einstiegspunkt `server/server.js`, damit der Server nicht mehr direkt nach dem Start beendet wird.
- Verlagert das Logging für empfangene Signale in die zentrale `createServer`-Funktion, um weiterhin nachvollziehen zu können, welche Signale verarbeitet wurden.
- Aktualisierte `.gitignore`-Einträge im Verzeichnis `data/`, sodass durch Tests erzeugte Highlight- und Snippet-Konfigurationen nicht versehentlich eingecheckt werden.

### Tests

- `npm test`
- `npm start`
