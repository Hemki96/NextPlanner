# Logging-Strategie für NextPlanner

Diese Richtlinie definiert, wie die Anwendung konsistent, sicher und auswertbar loggt. Sie gilt für alle serverseitigen Komponenten.

## Ziele

- **Nachvollziehbarkeit:** Requests und Datenänderungen müssen über eindeutige Kontextwerte (Request-ID, Nutzer, Route) korreliert werden können.
- **Signal statt Rauschen:** Debug-Informationen sind nur in Entwicklung aktiv, Produktions-Logs bleiben auf das Wesentliche reduziert.
- **Sicherheit & Datenschutz:** Keine Geheimnisse, Passwörter oder personenbezogenen Freitext-Daten im Log. Fehlerhinweise dürfen den Angriffsraum nicht vergrößern.
- **Operativ nutzbar:** Logs enthalten Dauer, Statuscodes und technische Umgebung, um Performance- und Stabilitätsprobleme schnell zu erkennen.

## Log-Level und Einsatz

- `error`: Fehler, die zu einem fehlgeschlagenen Request oder Datenverlust führen. Immer loggen.
- `warn`: Unerwartete, aber tolerierte Zustände (Fallbacks, Rate-Limits, degradierter Betrieb).
- `info`: Geschäftsrelevante Ereignisse (erfolgreiche Requests mit Status/Dauer, Start/Stopp des Servers).
- `debug`: Detail-Informationen für lokale Entwicklung oder gezielte Fehlersuche (z. B. Payload-Hinweise ohne PII).
- `trace`: Höchste Detailstufe für feingranulare Ablaufverfolgung (z. B. pro Middleware-Schritt oder komplexe Berechnungen). Nur temporär aktivieren, um Rauschen zu vermeiden.

Das aktive Level wird über `LOG_LEVEL` gesteuert (`error|warn|info|debug|trace`). Fallback: `debug` in `NODE_ENV=development`, sonst `info`. `trace` sollte nur gezielt gesetzt werden, z. B. bei Incident-Debugging in isolierten Umgebungen.

## Kontextfelder (automatisch)

Jede Logzeile trägt sortierte Key/Value-Kontexte:

- `app=nextplanner`, `env=<NODE_ENV>` – Laufzeitumgebung.
- `reqId=<uuid>` – pro Request generiert oder aus `X-Request-Id` übernommen.
- `method=<HTTP-Methode>`, `path=<URL-Pfad>` – Request-Metadaten.
- `remote=<IP>` – Herkunft des Requests.
- `user=<username>`, `roles=<rolle1,rolle2>` – sobald authentifiziert oder via Header-Fallback ermittelt.

Diese Kontexte ermöglichen Filter/Suche ohne strukturierte Log-Pipeline.

## Verantwortlichkeiten pro Schicht

- **Transport (server/app/index.js):** erzeugt Request-ID, hängt sie als Response-Header an, baut Request-Logger mit Pfad/Methode/Remote, loggt Abschluss jedes Requests mit Status und Dauer.
- **Sessions (server/app/request-context.js):** aktualisiert den Logger, sobald Nutzerkontext verfügbar oder entfernt wird.
- **Basis-Logger (server/logger.js):** sorgt für konsistente Zeitstempel, Level-Prefix und Kontext-Präfixe; unterstützt verschachtelte `child`-Logger.

## Do & Don'ts

- **Do:** kurze, formatierte Nachrichten mit Platzhaltern (`logger.warn("Request fehlgeschlagen: %s", reason)`).
- **Do:** Timings loggen (z. B. `Request beendet ... nach 34ms`), um Ausreißer zu erkennen.
- **Do:** `trace` nur selektiv einschalten (z. B. `LOG_LEVEL=trace` in einer dedizierten Test- oder Staging-Instanz), um tiefe Ablaufanalysen ohne produktive Lärmbelastung zu ermöglichen.
- **Don't:** Passwörter, Tokens, Session-IDs oder vollständige Request-Bodies loggen.
- **Don't:** Personenbezug detailliert ablegen (Namen, Freitext); Nutzerkontext genügt über `user=<username>`.
- **Don't:** Fehler verschlucken – mindestens eine `error`-Zeile pro unerwartetem Fehler.

## Betrieb & Auswertung

- Standardausgabe (stdout/stderr) kann von Prozess-Managern (Systemd, Docker, Render) aufgenommen werden.
- Für externe Sammler (ELK, Loki, Datadog) kann nach `reqId`, `user`, `path`, `level` gefiltert werden.
- LOG-Level lässt sich zur Laufzeit durch Umgebungsvariable justieren, ohne Codeänderung.

## Erweiterung

- Bei neuen Komponenten stets einen `child`-Logger aus dem vorhandenen Kontext ableiten (z. B. `logger.child({ module: "plan-service" })`).
- Bei wiederkehrenden Jobs/Tasks analoge Kontextfelder vergeben (`task=<name>`, `iteration=<id>`).
- Beobachtbare Metriken (Counter, Histogramme) können ergänzend im Ordner `server/metrics/` umgesetzt werden; Logs bleiben die erste Fehlerquelle.
