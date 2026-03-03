# CI API Tests (PostgreSQL)

## Workflow

- Datei: `../.github/workflows/nextplanner2-api-tests.yml`
- Trigger: Push/Pull Request mit Aenderungen unter `NextPlanner2/**`
- Manueller Trigger: `workflow_dispatch`

## Ablauf

1. PostgreSQL 16 Service-Container wird gestartet.
2. `DATABASE_URL` zeigt auf den Service (`localhost:5432`).
3. `npm ci` installiert Abhaengigkeiten.
4. `npm run test:api:ci` wartet auf DB, pusht Schema und fuehrt API-Integrationstests aus.

## Lokaler Entsprechungspfad

- `npm run test:api:local`
- Optional mit Docker-Start: `npm run test:api:local -- --with-docker`

## Nachweis fuer Go-Live Gate B1/B3/B4

1. Workflow `NextPlanner2 API Tests` manuell starten.
2. Sicherstellen, dass Job `api-tests` erfolgreich beendet wird.
3. In der Run-Detailseite pruefen:
- Schritt `Run API integration tests` ist gruen.
- Testausgabe enthaelt `4 tests` ohne Fehler.
4. Artefakt `nextplanner2-api-test-output` herunterladen und Testzusammenfassung gegenpruefen.
5. Run-URL und Datum in der Go-Live Checkliste dokumentieren.
