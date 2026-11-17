# ETag-Strategie

NextPlanner verwendet starke ETags, um konkurrierende Schreibzugriffe zu verhindern und effizientes Caching zu ermöglichen. Alle Ressourcen (Pläne, Vorlagen, Highlight-Konfiguration) nutzen denselben Helfer in `server/http/etag.js`.

## Kanonische Repräsentation

1. `canonicalizePlan`, `canonicalizeTemplate` und `canonicalizeHighlightConfig` reduzieren die Ressource auf die relevanten Felder.
2. `sortCanonical()` sortiert verschachtelte Objekte rekursiv nach Schlüsseln; Arrays bleiben in ihrer Reihenfolge.
3. Das Ergebnis wird als JSON serialisiert und per SHA-256 gehasht (`buildEtagFromCanonical`).
4. Der Hash wird als starker ETag (`"<hex>"`) ausgegeben.

Die Services und Routen importieren `buildPlanEtag`, `buildTemplateEtag`, `buildHighlightConfigEtag` sowie `etagMatches` ausschließlich aus diesem Modul. Es gibt keine zweite Kanonisierung mehr.

## Vergleichsregeln

- **If-Match** verwendet den starken Vergleich: `W/`-Tags und `*` werden nicht als Treffer gewertet (`*` ist hier nicht zulässig, da immer eine aktuelle Repräsentation existiert).
- **If-None-Match** verwendet den schwachen Vergleich: `W/"…"` darf passen. `If-None-Match: *` ist bei existierender Ressource **nicht** erfüllt und liefert daher 200 statt 304.

## Server-Pflichten

- **GET/HEAD**: Jede Antwort auf `/api/plans/{id}`, `/api/templates/{id}` und `/api/highlight-config` enthält `ETag`. Bei passendem `If-None-Match` antwortet der Server mit `304 Not Modified`.
- **POST**: Neue Ressourcen liefern `201 Created` und `ETag`.
- **PUT/DELETE**: Verlangen `If-Match`. Fehlt der Header, antwortet der Server mit `428 Precondition Required`; bei abweichendem Tag mit `412 Precondition Failed` inklusive aktuellem Plan im Fehlerdetail.
- **Backups**: Beim Import validiert `JsonPlanStore` die Daten und schreibt sie atomar; anschließende `GET` liefern neue ETags.

## Client-Pflichten

Der Frontend-Client (`public/js/utils/api-client.js`):

- Speichert pro Ressource den zuletzt gesehenen ETag.
- Sendet bei `PUT`/`DELETE` automatisch `If-Match` mit dem gecachten Wert.
- Aktualisiert den Cache nach erfolgreichen Antworten oder nach `POST` über den `Location`-Header.
- Entfernt veraltete ETags, wenn der Server `412` oder `428` meldet.

Dadurch bleibt die Konkurrenzkontrolle zwischen Browser und Server konsistent.
