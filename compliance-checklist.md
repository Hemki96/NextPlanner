# Compliance-Checkliste

Diese Liste spiegelt den Umsetzungsstand der Spezifikation wider. Für jede Vorgabe gibt es mindestens einen verifizierbaren Nachweis im Code oder in der Dokumentation.

## 1. Gesamtprinzipien
- [x] Saubere Trennung zwischen Server (`server/`), Frontend (`public/`) und Persistenz (`data/`).
- [x] Module sind klein, eindeutig benannt (kebab-case) und nutzen ES-Module mit Dateiendungen.
- [x] Defensive Programmierung: Validierung im Server (`server/app.js`, `server/stores/*`) und Parser; Fehlerantworten enthalten strukturierte JSON-Payloads.

## 2. Projektstruktur & Benennung
- [x] Verzeichnislayout entspricht Vorgabe (Server, Stores, Utils, Public, Data).
- [x] Dateinamen folgen kebab-case (`public/js/utils/api-client.js`, `server/stores/json-plan-store.js`).

## 3. HTML (planner.html, index.html, …)
- [x] Dokumente besitzen `<!DOCTYPE html>`, `lang="de"`, `meta charset`, `viewport` und aussagekräftige Titel.
- [x] Semantische Struktur: Header/Nav/Main/Footer, Labels mit `for`, sichtbarer Fokus.
- [x] Keine Inline-Skripte/-Styles; Module werden via `<script type="module" src="/js/..." defer>` eingebunden.

## 4. CSS
- [x] Design Tokens via `:root`-Variablen; Komponenten-Styles nutzen Klassen statt IDs (siehe `.calendar-copy-last`, `.block-list`).
- [x] Mobile-First/Responsive: Einsatz von `clamp()`, Flex/Grid, Rücksicht auf `prefers-reduced-motion`.
- [x] Keine `!important`-Angaben; Assets verwenden `font-display: swap`, Bilder `loading="lazy"`.

## 5. Frontend-JavaScript (ESM)
- [x] Sämtliche Browser-Module importieren mit Dateiendung (`public/js/app.js`).
- [x] Kein `var`, strikte Gleichheit, frühe Returns; DOM-Zugriffe über modulare Initialisierer (`public/js/ui/*`).
- [x] API-Client behandelt Timeouts, Offline-Fälle und differenziert HTTP-Fehler (`public/js/utils/api-client.js`).

## 6. Parser (`public/js/parser/plan-parser.js`)
- [x] Reines Parsen/Validieren von Texteingaben, keine DOM-Abhängigkeiten.
- [x] Liefert strukturierte Objekte (Blöcke, Sets, Equipment, Intensitäten) und sammelt Warnungen.

## 7. UI-Module (`public/js/app.js` & Co.)
- [x] `app.js` kümmert sich um Bootstrapping (DOM-Refs, Initialisierung von Panels, Parser, Renderer).
- [x] Reaktive Aktualisierung: Parser läuft bei Eingaben, Renderer aktualisiert DOM minimal.
- [x] Kalender (`public/js/calendar.js`) nutzt denselben API-Client, keine duplizierten Fetch-Implementierungen.

## 8. Feature-Flags (`public/js/utils/feature-settings.js`)
- [x] Persistenz über `localStorage` mit Namespace (`nextplanner.featureSettings.v1`).
- [x] API: `getFlag`/`setFlag`-Äquivalente (`getFeatureSettings`, `setFeatureEnabled`) + `subscribeToFeatureSettings` (Custom Event).
- [x] DOM-Elemente werden per `data-feature` sichtbar/unsichtbar geschaltet.

## 9. API-Client (`public/js/utils/api-client.js`)
- [x] Stellt `get/post/put/delete/head/patch`-Funktionen bereit.
- [x] Setzt automatisch `Accept: application/json` und `Content-Type` für JSON-Bodys.
- [x] Verwaltet ETags: cached pro Ressource, sendet `If-Match` bei Mutationen, reagiert auf `412/409`.

## 10. REST-API-Konventionen
- [x] Endpunkte: `/api/plans`, `/api/plans/:id`, `/api/snippets`, `/api/backups`, `/api/storage/(backup|restore)`.
- [x] CORS + Sicherheitsheader (`Content-Security-Policy`, `X-Content-Type-Options`, `Cache-Control: no-store`, `Vary: Origin`).
- [x] Statuscodes wie spezifiziert (200/201/204/304, 400/404/409/412/422/500) + strukturierte Fehler.

## 11. Datenmodelle & Validierung
- [x] Plan-Schema: Pflichtfelder + Metadaten geprüft im `JsonPlanStore`.
- [x] Snippet-Bibliothek wird in `JsonSnippetStore` bereinigt (`sanitizeQuickSnippetGroups`).
- [x] Geteilte Regeln (Parser & Stores) nutzen gemeinsame Hilfsfunktionen (`public/js/utils/snippet-storage.js`).

## 12. Persistenz (JsonPlanStore & JsonSnippetStore)
- [x] Atomare Writes über temporäre Dateien, `fsync` und Rename (`JsonPlanStore.#writeFileAtomically`).
- [x] Write-Queue verhindert parallele Schreibzugriffe (`#writeQueue`).
- [x] Backups/Korruptionsschutz: defekte Dateien werden isoliert, `data/backups/` existiert inkl. `.gitkeep`.

## 13. ETag/If-Match
- [x] Starke ETags (SHA-256 über kanonische JSON-Repräsentation).
- [x] Server erzwingt `If-Match` bei `PUT`/`DELETE` (Antwort 412 inkl. aktuellem Plan).
- [x] Client cached ETags und sendet sie bei Mutationen (`public/js/utils/api-client.js`).

## 14. Fehler- & Shutdown-Management
- [x] Zentrale Fehlerbehandlung (`handleApiError`) erzeugt `{ error: { code, message, details } }`.
- [x] Content-Negotiation fällt auf JSON zurück (auch bei `Accept: */*`).
- [x] `createServer` reagiert auf SIGINT/SIGTERM, stoppt neue Requests und schließt Stores geordnet.

## 15. Sicherheit
- [x] Keine unvalidierten `innerHTML`-Zuweisungen; DOM-Manipulation über Templates und Text-Nodes.
- [x] Server setzt CSP, `X-Content-Type-Options`, `Referrer-Policy` und beschränkt statische Pfade.
- [x] JSON-Body-Limits & klare Fehlermeldungen bei Offline-/Timeout-Szenarien.

## 16. Performance
- [x] Kritische Ressourcen: Module `defer`, CSS gebündelt, Bilder `loading="lazy"`.
- [x] API nutzt ETags & 304-Flows, keine übergroßen Antworten (`listPlans` filtert serverseitig).
- [x] Frontend setzt `requestAnimationFrame` / Debounce-Mechanismen in UI-Modulen (z. B. Highlighter).

## 17. Tests
- [x] Node Test-Suite unter `tests/` deckt Parser, Stores, API und CLI ab (`npm test`).
- [x] Parser-Edge-Cases sowie API-Konflikte werden getestet.

## 18. CLI (`server/cli/plan-cli.js`)
- [x] Befehle: `list`, `show <id>`, `export <id> --format=json`, `validate <id>`, `backup --prune=<n>`.
- [x] Ausgabe maschinenlesbar (JSON) oder menschenlesbar; `--json` erzwingt JSON.
- [x] Exit-Codes: 0 Erfolg, 1 Validierungsfehler, 2 IO-/Dateifehler.

## 19. Build/Skripte & Qualität
- [x] NPM-Skripte: `dev`, `start`, `test`, `lint:js`, `lint:css`, `fmt`, `plan:cli`.
- [x] Skripte laufen ohne zusätzliche Abhängigkeiten (`scripts/*.js`).
- [x] EditorConfig/Prettier-kompatible Formatierung via `npm run fmt` (JSON).

## 20. Dokumentation
- [x] `README.md` mit Einstieg & Setup.
- [x] Detail-Dokumente: `API.md`, `DATASTORE.md`, `ETAG.md`, `CONTRIBUTING.md`.
- [x] Diese Checkliste (`compliance-checklist.md`) dokumentiert den Status und verweist auf Kernbereiche.
