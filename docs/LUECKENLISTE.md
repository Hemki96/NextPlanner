# Lücken-Report (abgeschlossen)

Die zuvor dokumentierten Abweichungen wurden behoben. Es sind aktuell keine offenen Lücken zwischen Code und Dokumentation bekannt.

## Erledigte Punkte

1) **REST-API-Dokumentation und ETags**
- Templates, Highlight-Konfiguration und Benutzerliste sind in `API.md` beschrieben; Templates und Highlight-Konfiguration erzwingen jetzt `If-Match` bei PUT/DELETE und liefern konsistente ETags.【F:API.md†L5-L170】【F:server/routes/templates.js†L61-L103】【F:server/routes/highlight-config.js†L10-L74】

2) **Kalender-Funktionen im Benutzerhandbuch**
- Das Handbuch beschreibt nun alle sichtbaren Kalender-Aktionen inklusive „Letztes Training übernehmen“ sowie Wochenexport nach Word/PDF.【F:docs/BENUTZERHANDBUCH.md†L16-L23】

3) **Trainingsmetriken-Schema**
- Das Metrics-Dokument erlaubt String-IDs und fordert, dass `distanceMeters` exakt der Zonen-Summe entspricht – konform zur Normalisierung im Code.【F:docs/TRAINING_METRICS.md†L7-L33】【F:server/metrics/aggregation.js†L118-L173】
