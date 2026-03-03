# NextPlanner2

NextPlanner2 is a fresh multi-client project setup for a shared training planner data model.

## Goal

One shared cloud-ready API and database for all clients:

- Web app (desktop + mobile browser)
- iPad (same web app as installable PWA)
- Desktop app for macOS and Windows (Electron shell)

## Zielbild

Das Ziel von NextPlanner2 ist, aus einem lokalen Trainingsplaner eine plattformuebergreifende, gemeinsame Arbeitsplattform zu machen:
Ein System, in dem Trainer:innen und Teams dieselben Trainingsplaene auf Web, Desktop (Mac/Windows) und iPad nutzen, bearbeiten und verwalten, ohne Dateninseln oder manuelle Exporte.

### Kernziel

NextPlanner2 soll die eine zentrale Quelle fuer Trainingsplanung sein. Das heisst konkret:

- Alle Clients greifen auf dieselbe zentrale Datenbasis zu.
- Aenderungen auf einem Geraet sind auf den anderen Geraeten konsistent sichtbar.
- Lokale Installationen sind nur noch Client-Apps, nicht eigene Datenbanken mit abweichenden Staenden.

### Produktziel aus Nutzersicht

Fuer Coaches und Teams soll NextPlanner2 den gesamten Ablauf vereinfachen:

- Plaene schnell erstellen, bearbeiten, duplizieren und terminieren.
- Inhalte strukturiert speichern (Titel, Datum, Fokus, Notizen, Plantext).
- Plaene in mehreren Kontexten nutzen:
  - Im Browser im Buero
  - Als Desktop-App im Vereins-/Trainingsumfeld
  - Auf dem iPad direkt am Beckenrand
- Verlaessliche Zusammenarbeit ermoeglichen, auch wenn mehrere Personen an denselben Inhalten arbeiten.

### Technisches Ziel

NextPlanner2 soll eine robuste Grundlage fuer Wachstum schaffen:

- Zentrales API-Backend als stabile Schnittstelle fuer alle Frontends.
- PostgreSQL als belastbare, mehrbenutzerfaehige Datenbank.
- Gemeinsame Datenvertraege (Schemas/Typen), damit Web/Desktop/API konsistent sind.
- Versions-/Konflikthandling bei parallelen Aenderungen (optimistic locking).
- PWA-Faehigkeit fuer iPad, damit die Web-App app-nah nutzbar ist.
- Desktop-Wrapper fuer Mac/Windows fuer nativen Einsatz im Alltag.

### Betriebsziel

Neben Funktionalitaet geht es um professionellen Betrieb:

- Deploybar als Cloud-Service (API + DB) fuer dauerhafte Verfuegbarkeit.
- Klare Trennung von Dev/Staging/Prod.
- Monitoring, Healthchecks, Logging und saubere Fehlersignale.
- Erweiterbar fuer spaetere Features wie Sync, Realtime, Teamverwaltung, Freigaben.

### Sicherheits- und Organisationsziel

Damit das System teamfaehig wird:

- Benutzer- und Rollenmodell (z. B. Admin, Coach, Assistant).
- Zugriffsregeln pro Team/Organisation.
- Nachvollziehbarkeit von Aenderungen (wer hat wann was geaendert).
- Schutz vor Datenverlust durch Migrations- und Backup-Strategie.

### Erfolgskriterien

NextPlanner2 erreicht sein Ziel, wenn:

- Ein Plan auf Web erstellt und auf iPad/Desktop sofort korrekt nutzbar ist.
- Mehrere Nutzer:innen ohne Datenkonflikte zusammenarbeiten koennen.
- Die Plattform im Alltag schneller und verlaesslicher ist als lokale Einzeldateien.
- Neue Clients und Features ohne Architekturbruch ergaenzt werden koennen.

## Stack

- API: Node.js, Express, Prisma, PostgreSQL
- Shared contracts: TypeScript + Zod (`packages/shared`)
- Web/iPad: React + Vite + PWA manifest
- Desktop: Electron (loads the web app URL)

## Monorepo layout

```text
NextPlanner2/
  apps/
    api/        # Shared backend API + PostgreSQL access
    web/        # Browser + iPad PWA client
    desktop/    # macOS / Windows desktop wrapper
  packages/
    shared/     # Shared zod schemas and TS types
```

## Quick start

1. Install dependencies

```bash
npm install
```

2. Start PostgreSQL

```bash
npm run db:up
```

3. Copy environment template

```bash
cp .env.example .env
```

Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to strong random values before running in shared environments.

4. Generate Prisma client and run migrations

```bash
npm run db:generate
npm run db:migrate
```

5. Start all apps

```bash
npm run dev
```

- API: `http://localhost:4000`
- Web/PWA: `http://localhost:5173`
- Desktop: Electron window loading the web app

## API summary

- `GET /healthz`
- `GET /readyz`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/me`
- `POST /v1/organizations`
- `POST /v1/teams`
- `GET /v1/teams`
- `GET /v1/teams/:teamId/members`
- `POST /v1/teams/:teamId/members`
- `PATCH /v1/teams/:teamId/members/:membershipId`
- `GET /v1/teams/:teamId/plans`
- `POST /v1/teams/:teamId/plans`
- `PATCH /v1/teams/:teamId/plans/:planId`
- `DELETE /v1/teams/:teamId/plans/:planId`
- `POST /v1/teams/:teamId/plans/:planId/duplicate`
- `GET /v1/teams/:teamId/plans/:planId/history`
- `POST /v1/teams/:teamId/imports`
- `GET /v1/teams/:teamId/imports/:importId`
- `GET /v1/teams/:teamId/imports/:importId/errors`

Concurrency protection uses HTTP ETags:

- API returns `ETag: W/"plan-<id>-v<version>"`
- `PATCH /v1/teams/:teamId/plans/:planId` requires `If-Match`
- On conflict the API returns `409 VERSION_CONFLICT` with `serverSnapshot` and `serverVersion`

Realtime events are available via Socket.IO path `/v1/realtime/socket`.

## iPad support

The `apps/web` client is responsive and includes a PWA manifest + service worker registration.
On iPad Safari you can add it to the home screen and use it as an app-like experience.

## Desktop packaging

From `apps/desktop`:

- `npm run dist:mac`
- `npm run dist:win`

Code-signing and notarization need to be configured for production distribution.
