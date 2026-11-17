# ADR-0001: Lokaler Single-User-Betrieb

- Status: accepted
- Datum: 2026-11-17

## Kontext

NextPlanner ist ein interaktiver Prototyp für einen Schwimm-Trainingsplaner. Die Anwendung speichert Pläne, Vorlagen, Schnellbausteine und Hervorhebungs-Konfiguration in lokalen JSON-Dateien. Es gibt keine Mehrnutzer-Funktion, keine Freigaben und keine Absicht, die Anwendung als öffentlichen Dienst bereitzustellen.

In der Vergangenheit gab es Login-, Session- und Rollen-Komponenten. Diese wurden bewusst entfernt, weil sie für den vorgesehenen Einsatzzweck keinen Nutzen bringen und eine falsche Sicherheit suggerieren.

## Entscheidung

NextPlanner wird ausschließlich als **lokaler Single-User-Betrieb** betrieben:

- Keine Authentifizierung, keine Rollen und keine Anmeldung.
- Der Server ist nur über Loopback (`127.0.0.1` / `::1`) erreichbar.
- Es gibt kein automatisches Deployment in eine öffentlich erreichbare Umgebung.
- Identitäts- und Rollen-Header aus HTTP-Requests werden ignoriert; sie erzeugen keinen Nutzer- oder Admin-Kontext.
- Admin- und Benutzerverwaltungsflächen sind lokale Werkzeuge und nicht für den Zugriff durch Dritte gedacht.

## Konsequenzen

- Jede Person mit lokalem Zugriff auf den Rechner kann alle Daten und Funktionen nutzen. Das ist für den Prototyp akzeptiert.
- Die Anwendung ist **nicht** für den Betrieb im Internet oder in einem Mehrnutzer-Netzwerk geeignet. Wer einen solchen Betrieb braucht, muss zuerst ein echtes Zugriffsmodell (Authentifizierung, Rollen, Autorisierung in allen mutierenden Routen) nachrüsten.
- Öffentlich erreichbare Health-Endpunkte geben keine absoluten Dateipfade und keine Kontenanzahlen preis.
- Die Dokumentation beschreibt diesen Betriebsmodus; veraltete Aussagen zu Login, Sessions, Passwörtern und Rollen sind zu entfernen.

## Alternativen, die bewusst verworfen wurden

- **Echte Authentifizierung nachrüsten:** sinnvoll für einen Mehrnutzer-Betrieb, aber aktuell außerhalb des Projektziels.
- **Öffentliches Hosting mit Reverse-Proxy und Zugriffsschutz:** ebenfalls nur mit einem echten Zugriffsmodell sinnvoll.
