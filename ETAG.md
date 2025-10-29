# ETag-Strategie

NextPlanner verwendet starke ETags, um konkurrierende Schreibzugriffe zu verhindern und effizientes Caching zu ermöglichen.

## Kanonische Repräsentation

Im Server (`server/app.js`):

1. `canonicalizePlan(plan)` erzeugt ein Objekt mit deterministischer Feldreihenfolge (`id`, `title`, `content`, `planDate`, `focus`, `metadata`, `createdAt`, `updatedAt`).
2. `sortCanonical()` sortiert verschachtelte Objekte/Arrays rekursiv (Schlüssel alphabetisch, Arrays elementweise).
3. Das Ergebnis wird als JSON serialisiert und per SHA-256 gehasht (`buildPlanEtag`).
4. Der Hash wird als starker ETag (`"<hex>"`) ausgegeben.

## Server-Pflichten

- **GET/HEAD**: Jede Antwort auf `/api/plans/{id}` enthält `ETag`. Bei `If-None-Match` mit identischem Tag antwortet der Server mit `304 Not Modified`.
- **POST**: Neue Ressourcen liefern `201 Created` + `ETag` und `Location`.
- **PUT/DELETE**: Verlangen `If-Match`. Bei fehlendem oder abweichendem Tag gibt es `412 Precondition Failed` inkl. aktuellem Plan im Fehlerdetail.
- **Backups**: Beim Import validiert `JsonPlanStore` die Daten und schreibt sie atomar; anschließende `GET` liefern neue ETags.

## Client-Pflichten

Der Frontend-Client (`public/js/utils/api-client.js`):

- Speichert pro Ressource (`/api/plans/{id}`) den zuletzt gesehenen ETag.
- Sendet bei `PUT`/`PATCH`/`DELETE` automatisch `If-Match` mit dem gecachten Wert.
- Aktualisiert den Cache nach erfolgreichen Antworten oder nach `POST` über den `Location`-Header.
- Entfernt veraltete ETags, wenn der Server `412` oder `409` meldet.

Dadurch bleibt die Konkurrenzkontrolle zwischen Browser und Server konsistent.
