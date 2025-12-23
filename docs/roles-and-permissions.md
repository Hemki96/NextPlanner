# Rollen und Berechtigungen

Dieses Dokument fasst zusammen, welche Bereiche der Anwendung nach dem Login erreichbar sind, welche Standardbenutzer existieren und welche Aktionen jede Rolle ausführen darf.

## Login-Flow

- Ohne gültige Sitzung werden alle HTML-Seiten außer `login.html` automatisch auf die Anmeldeseite umgeleitet.
- Bereits angemeldete Nutzer, die `login.html` aufrufen, werden zurück auf die Hauptanwendung geleitet (Standard: `index.html` oder der in `?next=` angegebene Pfad).

## Standardbenutzer

Bei leerem bzw. neuem Benutzerspeicher legt der Server automatisch drei Konten an. Die Zugangsdaten lassen sich über Umgebungsvariablen anpassen.

| Benutzername | Passwort (Standard) | Rolle    | Anpassbare Variablen                          |
| ------------ | ------------------- | -------- | --------------------------------------------- |
| `admin`      | `Admin1234!`        | `admin`  | `ADMIN_USER`, `ADMIN_PASSWORD` (bzw. `NEXTPLANNER_ADMIN_*`) |
| `coach`      | `CoachPower#2024`   | `editor` | `NEXTPLANNER_EDITOR_USER`, `NEXTPLANNER_EDITOR_PASSWORD`     |
| `athlete`    | `AthleteReady#2024` | `user`   | `NEXTPLANNER_USER`, `NEXTPLANNER_USER_PASSWORD`              |

## Rechte je Rolle und Bereich

| Bereich / Aktion                                       | Admin | Editor | User | Viewer |
| ------------------------------------------------------ | :---: | :----: | :--: | :----: |
| Pläne anlegen / bearbeiten / löschen                   |  ✅   |   ✅   |  ✅  |   ❌   |
| Pläne lesen                                            |  ✅   |   ✅   |  ✅  |   ✅   |
| Vorlagen verwalten                                     |  ✅   |   ✅   |  ✅  |   ❌   |
| Schnellbausteine (persönlich) verwalten                |  ✅   |   ✅   |  ✅  |   ❌   |
| Team-Bibliothek (Snippets) schreiben/ersetzen          |  ✅   |   ✅   |  ✅  |   ❌   |
| Team-Bibliothek lesen                                  |  ✅   |   ✅   |  ✅  |   ✅   |
| Backups exportieren/importieren                        |  ✅   |   ✅   |  ✅  |   ❌   |
| Benutzerverwaltung (Admin-Seite & `/api/users`)        |  ✅   |   ❌   |  ❌  |   ❌   |
| Admin-Navigation sichtbar                              |  ✅   |   ❌   |  ❌  |   ❌   |
| Zugriff auf statische Seiten nach Login                |  ✅   |   ✅   |  ✅  |   ✅   |

**Hinweise:**

- „Viewer“ ist eine reine Lese-Rolle (kein Schreiben/Ändern), wird aber aktuell nicht automatisch erzeugt.
- Authentifizierung ist für alle API-Aufrufe erforderlich; Schreibzugriffe prüfen zusätzlich die Rolle.
