# Trainingsdatenerfassung, Metriken & Reporting

Dieses Dokument beschreibt das Datenschema für Einheiten und Wochenpläne, die Import-/Eingabewege (JSON/CSV/CLI), Beispielwochen sowie die Metrik-Aggregation inklusive Heuristiken und Warnlogiken. Alle Vorgaben sind so formuliert, dass sie später in UI/Backend/Imports konsistent angewendet werden können.

## Schema: Pflichtfelder pro Einheit

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | String/Zahl | Eindeutige ID (innerhalb des Plans oder der Datenquelle). |
| `date` | ISO-String | Datum der Einheit (YYYY-MM-DD). |
| `title` | String | Kurzer Titel/Label. |
| `primaryStroke` | String | Primärlage (z. B. Freistil, Brust, Delfin, Lagen). |
| `distanceMeters` | Zahl | Gesamtdistanz der Einheit in Metern (muss exakt der Summe der Zonen entsprechen). |
| `plannedMinutes` | Zahl | Geplante Gesamtdauer in Minuten. |
| `zoneMeters` | Objekt | Aufteilung nach Zonen `Z1`–`Z5` (Meter je Zone, Summe = `distanceMeters`). |
| `zoneShare` | Objekt | Optional; Prozentanteile pro Zone. Falls nicht gesetzt, wird aus `zoneMeters` berechnet. |
| `keySessionType` | Enum | `threshold` (Schwelle), `vo2`, `sprint`, `race-pace`, `technique` oder `none`. |
| `keySetMeters` | Zahl | Meteranteil im Key-Set (Z3–Z5). Muss zur Summe von `zoneMeters.Z3`–`Z5` passen. |
| `techniqueMeters` | Zahl | Technik-/Locker-Anteil in Metern (auch Drills, Unterwasser). |
| `longestBlockMeters` | Zahl | Längster quasi-kontinuierlicher Block (ohne lange Pausen). |
| `mainGoalDay` | ISO-String | Referenz-Tag des Hauptziels (z. B. Wettkampftag). |
| `tags` | Array | Freie Tags, z. B. `build`, `deload`, `race-pace`, `open-water`, `strength`. |
| `racePaceTargets` | Objekt | Optional: `{ "event": "800m" | "1500m" | "3k-ow", "repDistance": Zahl, "restSeconds": Zahl }`. |

**Validierungsregeln**

- `distanceMeters` muss exakt der Summe aller `zoneMeters` entsprechen; Abweichungen führen zu einem Fehler.
- `keySetMeters` muss genau `zoneMeters.Z3 + zoneMeters.Z4 + zoneMeters.Z5` entsprechen.
- `techniqueMeters` ≤ `distanceMeters`; Anteil wird separat ausgewiesen.
- `longestBlockMeters` ≤ `distanceMeters` und sollte ein Key- oder Race-Pace-Block sein.
- `mainGoalDay` dient für Spezifitäts-Checks (Race-Pace, längster Block zur Zielstrecke passend).
- `tags` sollten mindestens ein Makro-Flag enthalten (`build`/`deload`/`taper`).

## Wochenplan-Template (Beispiel)

| Tag | Fokus/Key-Session | Distanz (m) | Dauer (min) | Zonenanteile (Z1–Z5 m) | Key-Set (m) | Technik (m) | Längster Block (m) | Hauptziel-Tag | Notizen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mo | VO2 | 4500 | 75 | 800/1400/1200/900/200 | 2300 | 500 | 1200 | 2024-07-14 | Race-Pace 200er |
| Di | Technik/Locker | 3200 | 55 | 1600/900/400/200/100 | 700 | 1000 | 600 | 2024-07-14 | Atemrhythmus, Sculling |
| Mi | Schwelle | 5000 | 80 | 900/1600/1600/700/200 | 2500 | 600 | 1500 | 2024-07-14 | 3×500 @ CSS |
| Do | Sprint | 3800 | 60 | 1200/900/600/700/400 | 1700 | 400 | 800 | 2024-07-14 | 25er/50er all out |
| Fr | Race-Pace | 4600 | 75 | 800/1400/1100/900/400 | 2400 | 500 | 1400 | 2024-07-14 | 8×200 @ Zielpace |
| Sa | Technik/Locker | 3000 | 50 | 1400/900/500/150/50 | 700 | 900 | 500 | 2024-07-14 | Fokus Unterwasser |
| So | Long Aerobic | 5200 | 85 | 2200/1900/700/300/100 | 1100 | 600 | 1800 | 2024-07-14 | OW-Feeling |

> Die Tabelle dient als Copy/Paste-Vorlage für neue Wochenpläne. Zonenwerte können auch prozentual gepflegt werden, das CLI normalisiert in Meter.

## Import-/Eingabeformate

### JSON-Struktur

```jsonc
{
  "meta": {
    "athlete": "Case Study",
    "macroCycle": "2024 Build",
    "targetEvent": "800m",
    "targetRaceDay": "2024-07-14",
    "weekTag": "build"
  },
  "sessions": [
    {
      "id": 1,
      "date": "2024-06-10",
      "title": "VO2-Intervall",
      "primaryStroke": "freestyle",
      "distanceMeters": 4500,
      "plannedMinutes": 75,
      "zoneMeters": { "Z1": 800, "Z2": 1400, "Z3": 1200, "Z4": 900, "Z5": 200 },
      "keySessionType": "vo2",
      "keySetMeters": 2300,
      "techniqueMeters": 500,
      "longestBlockMeters": 1200,
      "mainGoalDay": "2024-07-14",
      "tags": ["build", "race-pace"],
      "racePaceTargets": { "event": "800m", "repDistance": 200, "restSeconds": 30 }
    }
  ]
}
```

### CSV-Struktur

- Separator: `,`
- Erste Zeile: Header
- Pflichtspalten: `id,date,title,primaryStroke,distanceMeters,plannedMinutes,zoneZ1,zoneZ2,zoneZ3,zoneZ4,zoneZ5,keySessionType,keySetMeters,techniqueMeters,longestBlockMeters,mainGoalDay,tags`
- Optionale Spalten: `raceEvent,raceRepDistance,raceRestSeconds`
- `tags` werden als Semikolon-Liste erwartet.

Beispiel:

```
id,date,title,primaryStroke,distanceMeters,plannedMinutes,zoneZ1,zoneZ2,zoneZ3,zoneZ4,zoneZ5,keySessionType,keySetMeters,techniqueMeters,longestBlockMeters,mainGoalDay,tags,raceEvent,raceRepDistance,raceRestSeconds
1,2024-06-10,VO2-Intervall,freestyle,4500,75,800,1400,1200,900,200,vo2,2300,500,1200,2024-07-14,build;race-pace,800m,200,30
```

## CLI: Validierung und Speicherung

Für schnelle Eingabe und Import steht ein CLI-Skript bereit:

```
node server/cli/training-session-cli.js validate --input ./data/training-sessions/build-week.json
node server/cli/training-session-cli.js import --input ./data/training-sessions/build-week.json --output ./data/training-sessions/normalized.json
node server/cli/training-session-cli.js report --input ./data/training-sessions/build-week.json --format json
```

Funktionen:
- **validate**: Prüft Pflichtfelder, Zonen-Summe, Key-Set-Logik, Technikanteil.
- **import**: Validiert und speichert normalisierte Sessions (mit berechneten Zonenanteilen, Qualitätsmetern, Race-Pace-Flag) in eine Ausgabe-Datei.
- **report**: Führt die Aggregation aus und gibt Wochen/Monats-Kennzahlen inklusive Ampelwarnungen aus.

## Metrik-Aggregation (server/metrics/aggregation.js)

Berechnete Kennzahlen (Auswahl):
- **Volumen**: km/Woche, km/Monat, 4-Wochen-Schnitt (rollierend).
- **Einheiten/Woche**: Anzahl Sessions pro Kalenderwoche.
- **Zonenaufteilung**: Meter & Anteil Z1–Z5; Qualitätsmeter = Z3–Z5 je Woche/Einheit.
- **Key-Sessions**: Zählung pro Typ (Schwelle/VO2/Sprint/Race-Pace) und 48h-Regel (Warnung, falls Key-Sessions <48h auseinanderliegen).
- **Intensitätsdichte**: `harteMeter ÷ Gesamtmeter` sowie `harteMeter ÷ Einheitenzahl`.
- **Monotonie**: Mittelwert/Standardabweichung der Tageslast + Warnung bei ≥3 mittel-harten Tagen in Serie.
- **Belastungsstruktur**: Längster Block pro Woche, Technikmeter-Anteil, Anteil Race-Pace-Meter/Blöcke.
- **Spezifität**: Race-Pace-Erkennung über Tags/Key-Typ und `racePaceTargets` (Zielstrecken-Check). Anteil race-spezifischer Meter/Blöcke pro Woche.
- **Periodisierung**: Trend über 4-Wochen-Fenster; Deload-Heuristik bei −20–30 % Volumen/Intensität; Warnung, wenn ≥4 Wochen ohne Deload.
- **Alerts/Ampel**: Monotonie >1.5, >3 harte Tage/Woche, fehlende Deload-Woche, zu hoher Technikanteil oder mangelnde Race-Pace-Präsenz.

## Beispiel-Datensätze

- `data/training-sessions/build-week.json`: Build-Mikrozyklus (hohes Volumen, mehrere Key-Sessions, Race-Pace vorhanden).
- `data/training-sessions/deload-week.json`: Entlastungswoche (~25 % weniger Volumen, weniger Key-Sessions, Fokus Technik/Locker).

Beide Sätze sind mit der CLI validierbar und können direkt in das Aggregationsmodul eingespeist werden.

## Reporting

- **Wöchentlicher Report** (JSON/CSV + Kurztext): Gesamt-km, Z3–Z5, #Key-Sessions, 48h-Compliance, Technikmeter, längster Block, Monotonie-Ampel.
- **Monat/Block-Report**: 4-Wochen-Schnitt, Build vs. Deload, Spezifitätstrend, Race-Pace-Präsenz.
- **Dashboard/Charts**: Zeitreihen für Volumen, Qualitätsmeter, Monotonie und Ampel-Warnungen (Struktur in `aggregation.js` vorbereitet).

## Alerts & Heuristiken (Default-Schwellen)

- Monotonie > **1.5** → gelb, > **2.0** → rot.
- Harte Tage: mehr als **3** Tage/Woche mit `harteMeter ≥ 0.35 × Wochenvolumen` → Warnung.
- Deload fehlt: ≥ **4** Wochen ohne Drop von 20–30 % im Volumen oder Qualitätsmetern → Warnung.
- Race-Pace fehlt: < **10 %** race-spezifische Meter im Build oder keine Race-Pace-Blocks in den letzten 2 Wochen → Warnung.

## Trainer-Onboarding & FAQ

**Tagging-Regeln**
- `build` für Belastungswochen, `deload` für −20–30 % Volumen/Intensität, `taper` für Wettkampfnahe Reduktion.
- `race-pace` für sets mit Zielpace/pausen, `technique` für Technikblöcke, `open-water` bei spezifischer OW-Session.

**Pflicht-Checks pro Woche**
1) 48h-Regel zwischen Key-Sessions eingehalten?  
2) Monotonie-Ampel: Score < 1.5?  
3) Qualitätsmeter (Z3–Z5) plausibel vs. Ziel (z. B. 20–35 % im Build)?  
4) Technikmeter ≥ 10–20 %?  
5) Längster Block zur Zielstrecke passend (800/1500/3k OW)?  
6) Deload alle 3–4 Wochen sichtbar?

**Race-Pace-Beispiele**
- 8×200m @ 800m-Pace, Pausen 30–40s, längster Block 1600–2000m.
- 10×100m @ 400/800m-Pace mit 20–30s Pause, letzter 100er all-out.
- 3×(4×300m) @ 3k OW-Pace, 30s Pause, 4min Serienpause.

**Technikblöcke**
- 6×200m Technik (Sculling, Kraul-Catch-Up) bei Z1–Z2, klar als `technique` taggen.

**Typische Fehler (FAQ)**
- Zu viele mittel-harte Tage in Serie → Monotonie-Warnung beachten, einen reinen Technik-/Locker-Tag einstreuen.
- Fehlende Deload-Wochen → alle 3–4 Wochen 20–30 % Drop bei Volumen **und** Qualitätsmetern planen.
- Keine Race-Pace-Sets → mindestens 1×/Woche im Build, alle 2 Wochen im Deload sicherstellen.
- Technikblöcke vergessen → pro Woche mind. 10 % Technikmeter, nicht nur im Einschwimmen verstecken.
