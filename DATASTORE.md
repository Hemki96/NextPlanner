# Persistenz & Datenspeicher

NextPlanner nutzt JSON-Dateien als langlebige Speicher. Alle Dateien liegen im Verzeichnis `data/`.

## Struktur

- `data/plans.json` – Hauptspeicher für Trainingspläne.
- `data/team-snippets.json` – Teamweite Schnellbausteine.
- `data/backups/` – rotierender Ablageort für Sicherungen und isolierte, fehlerhafte Dateien.

## JsonPlanStore

Implementiert in `server/stores/json-plan-store.js`.

- **Initialisierung**: Legt `plans.json` automatisch an (`{ nextId: 1, plans: [] }`).
- **Validierung**: Prüft Pflichtfelder (`title`, `content`, `planDate`, `focus`) und Metadaten. Backups werden auf eindeutige IDs und ISO-Zeitstempel kontrolliert.
- **Write-Queue**: Alle Schreiboperationen laufen seriell über eine interne Promise-Kette (`#writeQueue`). Gleichzeitige Schreibzugriffe werden verhindert.
- **Atomic Writes**: Daten werden zunächst in eine temporäre Datei geschrieben, per `fsync` gesichert und anschließend atomar nach `plans.json` verschoben.
- **Backups & Korruptionsschutz**: Fehlerhafte JSON-Dateien werden nach `data/backups/<name>.corrupt-<timestamp>` verschoben. Beim Import von Backups wird der komplette Speicher ersetzt.
- **ETag-Konsistenz**: `canonicalizePlan()` erzeugt eine sortierte JSON-Darstellung; daraus wird ein SHA-256-Hash gebildet (`buildPlanEtag`).

## JsonSnippetStore

Implementiert in `server/stores/json-snippet-store.js`.

- **Initialdaten**: Startet mit den Standard-Gruppen aus `public/js/utils/snippet-storage.js`.
- **Validierung**: Eingaben werden über `sanitizeQuickSnippetGroups` normalisiert (Trimmen, Entfernen leerer Einträge).
- **Persistenz**: Schreibt synchronisierte Bibliotheken in `team-snippets.json` (inkl. `updatedAt`).
- **Write-Queue**: Auch hier verhindert eine Promise-Kette konkurrierende Schreiboperationen.

## Backups

- `GET /api/backups` erzeugt ein Komplett-Backup (`format`, `version`, `exportedAt`, `data` mit `nextId` und Planliste).
- `POST /api/backups` und `POST /api/storage/restore` importieren Backups. Die Payload wird streng validiert, bevor der Speicher ersetzt wird.
- Beim Schreiben entstehen rotierende Backups (z. B. korruptes Original → `.corrupt-<timestamp>`). Eine Aufbewahrungsstrategie kann in Zukunft ergänzt werden.

## Datenmodelle

### Plan

```json
{
  "id": 1,
  "title": "Sprint-Serie",
  "content": "…",
  "planDate": "2024-04-18T18:00:00.000Z",
  "focus": "Sprint",
  "metadata": {
    "version": "1.0",
    "author": "Coach",
    "createdAt": "2024-04-17T19:00:00.000Z"
  },
  "createdAt": "2024-04-17T19:00:00.000Z",
  "updatedAt": "2024-04-17T19:00:00.000Z"
}
```

### Snippet-Gruppe

```json
{
  "title": "Technik & Variationen",
  "description": "…",
  "items": [
    { "label": "Drill", "snippet": "* Drill: …", "appendNewline": true }
  ]
}
```

Alle Strings werden beim Import getrimmt; unzulässige Einträge werden verworfen.
