# NextPlanner REST-API

Alle Endpunkte werden über den integrierten HTTP-Server unter `http://localhost:3000` bereitgestellt. Antworten sind JSON-codiert und enthalten starke ETags. Fehler folgen dem Schema `{ "error": { "code", "message", "details?" } }`.

## Gemeinsame Regeln

- **Authentifizierung**: nicht erforderlich (rein lokal).
- **Content Negotiation**: Clients senden standardmäßig `Accept: application/json`; bei Request-Bodys ist `Content-Type: application/json` Pflicht.
- **Caching & ETag**: Ressourcen liefern starke SHA-256-ETags. Mutierende Requests (`PUT`, `DELETE`) **müssen** `If-Match` enthalten. Der Client speichert den letzten ETag je Ressource.
- **CORS**: `Access-Control-Allow-Origin` wird auf den erlaubten Ursprung gesetzt (Standard: `http://localhost:3000`).
- **Fehlercodes**: 400 (Validierung), 404 (nicht gefunden), 409 (semantischer Konflikt), 412 (ETag-Mismatch), 422 (Schemafehler), 500 (unerwartet).

## `GET /api/plans`

Liefert eine Liste aller Pläne, optional gefiltert.

### Query-Parameter

| Name | Beschreibung |
| --- | --- |
| `from` | ISO-Datum (inkl. Zeit) – nur Pläne ab diesem Datum |
| `to` | ISO-Datum – nur Pläne bis zu diesem Datum |
| `focus` | Fokus-String, exakte Übereinstimmung |

### Antwort

`200 OK`

```json
[
  {
    "id": 12,
    "title": "Sprint-Serie",
    "content": "…",
    "planDate": "2024-04-18T18:00:00.000Z",
    "focus": "Sprint",
    "metadata": { "author": "Coach" },
    "createdAt": "2024-04-17T19:00:00.000Z",
    "updatedAt": "2024-04-17T19:00:00.000Z"
  }
]
```

`HEAD /api/plans` liefert dieselben Header ohne Body.

## `POST /api/plans`

Legt einen neuen Plan an. Das Ergebnis enthält den vollständigen Datensatz samt ETag.

### Request-Body

```json
{
  "title": "Planname",
  "content": "Freitext des Plans",
  "planDate": "2024-04-18T18:00:00.000Z",
  "focus": "Sprint",
  "metadata": {
    "version": "1.0",
    "author": "Coach"
  }
}
```

### Antworten

- `201 Created` mit `Location: /api/plans/{id}` und `ETag`.
- `400`/`422`, falls Pflichtfelder fehlen oder ungültig sind.

## `GET /api/plans/{id}`

Gibt einen konkreten Plan zurück.

- `200 OK` mit Planobjekt + `ETag`.
- `304 Not Modified`, wenn `If-None-Match` mit aktuellem ETag übereinstimmt.
- `404 Not Found`, wenn die ID unbekannt ist.

`HEAD` verhält sich analog ohne Body.

## `PUT /api/plans/{id}`

Ersetzt einen Plan vollständig. Erfordert `If-Match` des zuletzt bekannten ETags.

- `200 OK` mit aktualisiertem Plan + `ETag`.
- `404`, wenn die ID nicht existiert.
- `412`, wenn `If-Match` fehlt oder nicht zum aktuellen ETag passt (Antwort enthält den aktuellen Plan im Fehler-Detail).

## `DELETE /api/plans/{id}`

Löscht einen Plan. Ebenfalls `If-Match`-pflichtig.

- `204 No Content` bei Erfolg.
- `404` bei unbekannter ID.
- `412` bei ETag-Konflikt.

## `GET /api/snippets`

Liefert die Team-Snippet-Bibliothek.

- `200 OK` mit `{ "updatedAt", "groups" }`. `updatedAt` ist immer ein ISO-String (`toISOString()`); `groups` wurde serverseitig über `sanitizeQuickSnippetGroups` normalisiert.
- `503`, wenn der Snippet-Store nicht verfügbar ist oder deaktiviert wurde.

## `PUT /api/snippets`

Ersetzt die Team-Snippets vollständig.

- Erwartet `{ groups: [...] }` oder direkt ein Array von Gruppen. Jede Anfrage wird sanitisiert; fehlende Felder erhalten Default-Werte, leere Gruppen werden entfernt.
- `200 OK` mit bereinigter Bibliothek. `updatedAt` erhöht sich nur bei tatsächlichen Änderungen – No-Ops liefern den bisherigen Snapshot.
- `400`, wenn keine Array-Struktur erkannt wird (`error.code = "invalid-snippet-payload"`).

## `GET /api/backups`

Exportiert den vollständigen Plan-Speicher. Enthält Format-ID, Versionsnummer und alle Pläne.

- `200 OK` mit `{ format, version, exportedAt, planCount, data }`.

## `POST /api/backups`

Importiert eine zuvor exportierte Sicherung (`data` + `nextId`).

- `200 OK` mit `{ success: true, planCount, restoredAt }`.
- `400`/`422` bei Validierungsfehlern.

Die alternativen Pfade `/api/storage/backup` (GET) und `/api/storage/restore` (POST) verhalten sich identisch.

## Sicherheit & Header

Jede Antwort setzt u. a. folgende Header:

- `Content-Security-Policy: default-src 'none'; …`
- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-store`
- `Vary: Origin`

Damit werden Caching-Konflikte und XSS-Angriffe verhindert.
