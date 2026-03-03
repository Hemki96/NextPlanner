# Go-Live Checkliste (Pass/Fail)

Stand: 2026-03-03

## Ergebnis

- Gesamt: 17 Kriterien
- PASS: 9
- FAIL: 5
- BLOCKED: 3
- Go-Live Freigabe: **NEIN**

## Gate A: Build und Contracts

1. `A1` Shared/API/Web Build erfolgreich
- Abnahme: `npm run build -w packages/shared`, `npm run build -w apps/api`, `npm run build -w apps/web` enden mit Exit Code 0
- Status: PASS
- Evidenz: Buildlauf 2026-03-03 erfolgreich

2. `A2` V1 API-Flaechen vorhanden
- Abnahme: `/v1/auth/*`, `/v1/me`, `/v1/teams/:teamId/plans*`, `/v1/teams/:teamId/imports*`, `/healthz`, `/readyz`, `/metrics` in API registriert
- Status: PASS
- Evidenz: `apps/api/src/index.ts`

3. `A3` Multi-Tenant-Datenmodell vorhanden
- Abnahme: Modelle `User`, `Organization`, `Team`, `TeamMembership`, `Plan`, `PlanRevision`, `AuditEvent`, `RefreshToken`, `ImportJob`, `ImportRow`
- Status: PASS
- Evidenz: `apps/api/prisma/schema.prisma`

4. `A4` SQL-Migration fuer Zielschema vorhanden
- Abnahme: Prisma-Migration inkl. Enumerationen, Tabellen, FK, Indexe, `pg_trgm`
- Status: PASS
- Evidenz: `apps/api/prisma/migrations/20260303110000_full_collab_v1/migration.sql`

## Gate B: Funktionale Qualitaet

5. `B0` CI-Testumgebung mit PostgreSQL eingerichtet
- Abnahme: CI-Workflow mit Postgres-Service und Testpfad vorhanden
- Status: PASS
- Evidenz: `../.github/workflows/nextplanner2-api-tests.yml`, `scripts/test-api-ci.sh`

6. `B1` API-Integrationstests gruene Pipeline
- Abnahme: `npm run test:api` mit Exit Code 0
- Status: BLOCKED
- Evidenz: Lauf scheitert in aktueller Umgebung ohne erreichbare PostgreSQL-DB (`P1001`)
- Blocker: Keine lokale DB in aktueller Umgebung verfuegbar; CI-Lauf noch nicht als erfolgreich nachgewiesen
- Nachweisdatei: `docs/ops/ci-api-test-evidence.md`

7. `B2` Lokaler Preflight-Testlauf verfuegbar
- Abnahme: Wrapper prueft `DATABASE_URL`, DB-Konnektivitaet und startet Testlauf
- Status: PASS
- Evidenz: `scripts/test-api.sh`, `scripts/wait-for-db.sh`, `npm run test:api:local`

8. `B3` Konfliktverhalten (ETag/If-Match/409) nachgewiesen
- Abnahme: Testfall fuer stale ETag ist gruen
- Status: BLOCKED
- Evidenz: Test ist implementiert, aber nicht ausfuehrbar ohne DB
- Blocker: Siehe `B1`

9. `B4` Importverhalten inkl. Fehlerzeilen nachgewiesen
- Abnahme: Importtest erstellt valide Zeilen und liefert Fehlerreport fuer invalide Zeilen
- Status: BLOCKED
- Evidenz: Test ist implementiert, aber nicht ausfuehrbar ohne DB
- Blocker: Siehe `B1`

## Gate C: Betrieb und Sicherheit

10. `C1` Umgebungs-/Promotionskonzept dokumentiert
- Abnahme: Dev/Staging/Prod + Rollback dokumentiert
- Status: PASS
- Evidenz: `docs/ops/environments.md`

11. `C2` Monitoring/Alerting dokumentiert
- Abnahme: Health, Metrics, Alertregeln dokumentiert
- Status: PASS
- Evidenz: `docs/ops/monitoring-and-alerting.md`

12. `C3` Backup-/Restore-Runbook dokumentiert
- Abnahme: Backup-Policy + Restore-Prozess dokumentiert
- Status: PASS
- Evidenz: `docs/ops/backup-restore-runbook.md`

13. `C4` Staging Deployment produktionsnah aktiv
- Abnahme: Staging-URL erreichbar, Smokecheck (`/healthz`, `/readyz`, `/metrics`) erfolgreich
- Status: FAIL
- Evidenz: Nur Blueprint vorhanden (`infra/render/render.yaml`), kein nachgewiesener Live-Deploy

14. `C5` Backup/Restore Drill protokolliert
- Abnahme: Erfolgreicher Restore-Test mit Datum und Ergebnisprotokoll
- Status: FAIL
- Evidenz: Runbook vorhanden, kein durchgefuehrter Drill nachgewiesen

15. `C6` SLO/Sicherheits-Ziele nachweisbar
- Abnahme: Uptime >= 99.5%, p95-Ziele, Security-Nachweise (mindestens Zugriffstests in Staging)
- Status: FAIL
- Evidenz: Keine Produktions-/Staging-Telemetrie und kein Security-Report im Repo

## Gate D: Produkt-Erfolgskriterien

16. `D1` Cross-Client Nachweis Web -> iPad/Desktop <= 2s
- Abnahme: Messprotokoll mit zwei Clients und Realtime/Polling-Fallback
- Status: FAIL
- Evidenz: Feature implementiert, aber kein messbarer Abnahmebericht vorhanden

17. `D2` Mehrnutzer-Nachweis ohne Datenverlust
- Abnahme: Testprotokoll mit mindestens 5 parallelen Bearbeitern
- Status: FAIL
- Evidenz: Kein Last-/Kollaborationsprotokoll vorhanden

## Schritt-fuer-Schritt Abarbeitung (heute)

1. Build-Gate ausgefuehrt: PASS (`shared`, `api`, `web`)
2. API-Flaechen und Schema gegen Zielbild geprueft: PASS
3. Ops-Artefakte (Runbooks, Render-Blueprint) geprueft: PASS
4. Integrationstest-Gate ausgefuehrt: BLOCKED (DB fehlt)
5. Lokaler Test-Wrapper mit Preflight eingefuehrt: PASS
6. CI-Workflow mit PostgreSQL-Service eingerichtet: PASS
7. Go-Live-Freigabe entschieden: NEIN (offene FAIL/BLOCKED-Kriterien)

## Konkrete Restarbeiten bis Go-Live

1. CI-Workflow `nextplanner2-api-tests.yml` einmal erfolgreich laufen lassen und Artefakt `nextplanner2-api-test-output` + Status dokumentieren (`B1/B3/B4`).
2. Staging-Deployment aus `infra/render/render.yaml` wirklich ausrollen und Smokechecks protokollieren (`C4`).
3. Ersten Restore-Drill in Staging durchfuehren und protokollieren (`C5`).
4. Last-/Mehrnutzer-Test (>=5 gleichzeitige Bearbeiter) und Cross-Client-Latenztest messen (`D1/D2`).
5. Mindestens 30 Tage Betriebsdaten fuer Uptime/P95 sammeln oder vor Go-Live formale Ausnahmeentscheidung dokumentieren (`C6`).
