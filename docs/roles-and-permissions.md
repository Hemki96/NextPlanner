# Rollen und Berechtigungen

Dieses Dokument fasst zusammen, welche Bereiche der Anwendung nach dem Login erreichbar sind, welche Standardbenutzer existieren und welche Aktionen jede Rolle ausführen darf.

## Login-Flow

- Ohne gültige Sitzung werden alle HTML-Seiten außer `login.html` automatisch auf die Anmeldeseite umgeleitet.
- Bereits angemeldete Nutzer, die `login.html` aufrufen, werden zurück auf die Hauptanwendung geleitet (Standard: `index.html` oder der in `?next=` angegebene Pfad).

## Standardbenutzer

Der Login ist bewusst schlank gehalten: Es gibt genau einen konfigurierbaren Account. Setze dafür `NEXTPLANNER_LOGIN_USER` und `NEXTPLANNER_LOGIN_PASSWORD` (Pflicht in Produktion). Ohne Passwort startet der Server nicht im Produktionsmodus.

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
